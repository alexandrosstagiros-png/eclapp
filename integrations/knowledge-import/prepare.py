#!/usr/bin/env python3
"""Prepare private, source-faithful knowledge imports without touching a database.

Run with the Python executable returned by load_workspace_dependencies. Office
packages are inspected as OOXML only: no Office process, macros, formula engine,
network requests, or external relationship resolution are used.
"""
from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
from io import BytesIO
import json
import os
from pathlib import Path, PurePosixPath
import posixpath
import re
import stat
import sys
import unicodedata
import zipfile

from lxml import etree
from openpyxl.formula.translate import Translator
from openpyxl.styles.numbers import BUILTIN_FORMATS, is_date_format
from openpyxl.utils.datetime import from_excel, CALENDAR_MAC_1904, CALENDAR_WINDOWS_1900

W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
S = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
NS = {"w": W, "r": R, "s": S}
MIME = {".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}
MAX_FILE = 64 * 1024 * 1024
MAX_ARCHIVE = 256 * 1024 * 1024
MAX_PACKAGE = 256 * 1024 * 1024
MAX_ENTRIES = 5000
MAX_XML = 64 * 1024 * 1024


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def source_path(value):
    if not value or "\\" in value or value.startswith("/"):
        raise ValueError("Unsafe archive member path")
    parts = value.rstrip("/").split("/")
    normalized = [unicodedata.normalize("NFC", part).strip() for part in parts]
    if any(not part or part in (".", "..") or ":" in part or any(ord(c) < 32 or ord(c) == 127 for c in part) for part in normalized):
        raise ValueError("Unsafe archive member path segment")
    return "/".join(normalized)


def validate_zip(archive, maximum=MAX_ARCHIVE):
    entries = archive.infolist()
    if len(entries) > MAX_ENTRIES:
        raise ValueError("Archive has too many members")
    total, seen = 0, set()
    for entry in entries:
        normalized = source_path(entry.filename)
        if entry.is_dir():
            continue
        if normalized in seen:
            raise ValueError("Archive member paths collide after normalization")
        seen.add(normalized)
        mode = entry.external_attr >> 16
        if stat.S_ISLNK(mode) or (stat.S_IFMT(mode) and not stat.S_ISREG(mode)):
            raise ValueError("Archive contains a special file")
        if entry.flag_bits & 1:
            raise ValueError("Encrypted archive members are not supported")
        total += entry.file_size
        if entry.file_size > MAX_FILE or total > maximum:
            raise ValueError("Archive exceeds the uncompressed safety limit")
        if entry.file_size > 1024 * 1024 and entry.file_size > max(entry.compress_size, 1) * 1000:
            raise ValueError("Suspicious archive compression ratio")
    return entries


def bounded_read(archive, entry, maximum=MAX_FILE):
    info = archive.getinfo(entry) if isinstance(entry, str) else entry
    if info.file_size > maximum:
        raise ValueError("Member exceeds its byte limit")
    with archive.open(info) as stream:
        chunks, size = [], 0
        while chunk := stream.read(min(1024 * 1024, maximum + 1 - size)):
            size += len(chunk)
            if size > maximum:
                raise ValueError("Member exceeded its declared byte limit")
            chunks.append(chunk)
    if size != info.file_size:
        raise ValueError("Archive member length does not match its directory")
    return b"".join(chunks)


class Package:
    def __init__(self, data):
        self.archive = zipfile.ZipFile(BytesIO(data))
        self.entries = validate_zip(self.archive, MAX_PACKAGE)
        self.names = set(self.archive.namelist())
        self.cache = {}

    def xml(self, name):
        if name not in self.names:
            return None
        if name not in self.cache:
            parser = etree.XMLParser(resolve_entities=False, load_dtd=False, no_network=True, huge_tree=False, remove_comments=True)
            root = etree.fromstring(bounded_read(self.archive, name, MAX_XML), parser)
            if root.getroottree().docinfo.doctype:
                raise ValueError("DTD declarations are not permitted in Office XML")
            self.cache[name] = root
        return self.cache[name]

    def relationships(self, part):
        name = posixpath.join(posixpath.dirname(part), "_rels", posixpath.basename(part) + ".rels")
        root = self.xml(name)
        return {} if root is None else {node.get("Id"): {"target": node.get("Target", ""), "type": node.get("Type", ""), "external": node.get("TargetMode") == "External"} for node in root}

    def related_part(self, part, relationship):
        if relationship.get("external"):
            return None
        target = relationship["target"]
        resolved = posixpath.normpath(target.lstrip("/") if target.startswith("/") else posixpath.join(posixpath.dirname(part), target))
        if resolved == ".." or resolved.startswith("../") or "\\" in resolved:
            raise ValueError("Relationship escapes the Office package")
        return resolved

    def notes(self, prefix):
        media = sum(name.startswith(prefix + "/media/") and not name.endswith("/") for name in self.names)
        embedded = sum("/embeddings/" in name and not name.endswith("/") for name in self.names)
        macros = sum("vbaproject" in name.lower() for name in self.names)
        notes = []
        if media:
            notes.append(f"В оригинале содержится изображений/медиафайлов: {media}. Изображения сохранены в оригинале; OCR не выполнялся.")
        if embedded:
            notes.append(f"Вложенных объектов: {embedded}; содержимое не запускалось и не извлекалось как отдельный документ.")
        if macros:
            notes.append(f"Обнаружены компоненты макросов: {macros}; они не исполнялись.")
        return notes, media


def clean_text(text):
    # OOXML permits tabs and line breaks. Normalize line endings only, never prose.
    return text.replace("\r\n", "\n").replace("\r", "\n")


def xml_text(node, namespace):
    if node is None:
        return ""
    return "".join(child.text or "" for child in node.iter(f"{{{namespace}}}t") if not any(etree.QName(parent).localname == "rPh" for parent in child.iterancestors()))


def roman(value):
    out = []
    for amount, symbol in [(1000, "M"), (900, "CM"), (500, "D"), (400, "CD"), (100, "C"), (90, "XC"), (50, "L"), (40, "XL"), (10, "X"), (9, "IX"), (5, "V"), (4, "IV"), (1, "I")]:
        while value >= amount:
            value -= amount
            out.append(symbol)
    return "".join(out)


class DocxExtractor:
    def __init__(self, package):
        self.package = package
        self.notes, self.media_count = package.notes("word")
        self.stats = Counter()
        self.styles, self.numbering, self.counts = {}, {}, {}
        styles = package.xml("word/styles.xml")
        if styles is not None:
            self.styles = {node.get(f"{{{W}}}styleId"): node for node in styles.findall("w:style", NS)}
        numbering = package.xml("word/numbering.xml")
        if numbering is not None:
            abstracts = {node.get(f"{{{W}}}abstractNumId"): node for node in numbering.findall("w:abstractNum", NS)}
            for node in numbering.findall("w:num", NS):
                abstract_id = node.find("w:abstractNumId", NS)
                if abstract_id is None:
                    continue
                abstract = abstracts.get(abstract_id.get(f"{{{W}}}val"))
                levels = {} if abstract is None else {int(level.get(f"{{{W}}}ilvl", "0")): level for level in abstract.findall("w:lvl", NS)}
                overrides = {int(level.get(f"{{{W}}}ilvl", "0")): level for level in node.findall("w:lvlOverride", NS)}
                self.numbering[node.get(f"{{{W}}}numId")] = (levels, overrides)

    @staticmethod
    def value(node, path, default=None):
        found = node.find(path, NS) if node is not None else None
        return found.get(f"{{{W}}}val", default) if found is not None else default

    def list_prefix(self, paragraph):
        props = paragraph.find("w:pPr", NS)
        numbering = props.find("w:numPr", NS) if props is not None else None
        style = self.value(props, "w:pStyle")
        visited = set()
        while numbering is None and style and style not in visited:
            visited.add(style)
            item = self.styles.get(style)
            if item is None:
                break
            numbering = item.find("w:pPr/w:numPr", NS)
            style = self.value(item, "w:basedOn")
        if numbering is None:
            return ""
        num_id = self.value(numbering, "w:numId")
        level = int(self.value(numbering, "w:ilvl", "0"))
        if num_id not in self.numbering or num_id == "0":
            return ""
        levels, overrides = self.numbering[num_id]
        definition = levels.get(level)
        override = overrides.get(level)
        if override is not None and override.find("w:lvl", NS) is not None:
            definition = override.find("w:lvl", NS)
        if definition is None:
            return ""
        start = int(self.value(override, "w:startOverride", self.value(definition, "w:start", "1")))
        counts = self.counts.setdefault(num_id, {})
        counts[level] = counts.get(level, start - 1) + 1
        for deeper in list(counts):
            if deeper > level:
                del counts[deeper]
        pattern = self.value(definition, "w:lvlText", "%1.")
        if self.value(definition, "w:numFmt") == "bullet":
            return "  " * level + "• "
        for index in range(1, 10):
            number = counts.get(index - 1, 1)
            fmt = self.value(levels.get(index - 1), "w:numFmt", "decimal")
            if fmt in ("upperRoman", "lowerRoman"):
                rendered = roman(number)
                rendered = rendered.lower() if fmt == "lowerRoman" else rendered
            elif fmt in ("lowerLetter", "upperLetter") and number > 0:
                rendered, remaining = "", number
                while remaining:
                    remaining, digit = divmod(remaining - 1, 26)
                    rendered = chr(65 + digit) + rendered
                rendered = rendered.lower() if fmt == "lowerLetter" else rendered
            else:
                rendered = str(number)
            pattern = pattern.replace(f"%{index}", rendered)
        return "  " * level + pattern + " "

    def inline(self, node, relations):
        local = etree.QName(node).localname
        if local in ("t", "delText"):
            return node.text or ""
        if local == "tab":
            return "\t"
        if local in ("br", "cr"):
            return "\n"
        if local in ("instrText", "delInstrText", "pPr", "rPr"):
            return ""
        if local in ("footnoteReference", "endnoteReference"):
            return f" [{ 'Сноска' if local == 'footnoteReference' else 'Концевая сноска' } {node.get(f'{{{W}}}id')} ]"
        text = "".join(self.inline(child, relations) for child in node)
        if local == "hyperlink":
            relation = relations.get(node.get(f"{{{R}}}id"), {})
            target = relation.get("target") or ("#" + node.get(f"{{{W}}}anchor") if node.get(f"{{{W}}}anchor") else "")
            if target:
                self.stats["hyperlinks"] += 1
                return text if text.strip() == target else f"{text} ({target})"
        if local == "fldSimple":
            instruction = node.get(f"{{{W}}}instr", "")
            match = re.search(r'\bHYPERLINK\s+(?:"([^"]+)"|(\S+))', instruction, re.I)
            if match:
                target = match.group(1) or match.group(2)
                self.stats["hyperlinks"] += 1
                return text + (f" ({target})" if target not in text else "")
        if local in ("del", "moveFrom") and text:
            self.stats["trackedChanges"] += 1
            return f"[Удалённый текст в исправлениях: {text}]"
        if local in ("ins", "moveTo") and text:
            self.stats["trackedChanges"] += 1
            return f"[Добавленный текст в исправлениях: {text}]"
        if local in ("drawing", "pict"):
            alternatives = []
            for child in node.iter():
                for key in ("descr", "title", "alt"):
                    if child.get(key) and child.get(key) not in alternatives:
                        alternatives.append(child.get(key))
            self.stats["drawingOccurrences"] += 1
            label = "; ".join(alternatives)
            return text + f"[Изображение{': ' + label if label else ''}; см. оригинал]"
        return text

    def paragraph(self, node, relations):
        text = self.inline(node, relations)
        instructions = "".join(item.text or "" for item in node.iter(f"{{{W}}}instrText"))
        for match in re.finditer(r'\bHYPERLINK\s+(?:"([^"]+)"|(\S+))', instructions, re.I):
            target = match.group(1) or match.group(2)
            if target not in text:
                text += f" [Ссылка: {target}]"
                self.stats["hyperlinks"] += 1
        text = clean_text(text).strip()
        if text:
            self.stats["paragraphs"] += 1
            return self.list_prefix(node) + text
        return ""

    def blocks(self, node, relations):
        out = []
        for child in node:
            local = etree.QName(child).localname
            if local == "p":
                if value := self.paragraph(child, relations):
                    out.append(value)
            elif local == "tbl":
                self.stats["tables"] += 1
                rows = []
                for row in child.xpath("./w:tr|./w:sdt/w:sdtContent/w:tr", namespaces=NS):
                    cells = []
                    for cell in row.xpath("./w:tc|./w:sdt/w:sdtContent/w:tc", namespaces=NS):
                        value = "\n".join(self.blocks(cell, relations))
                        span = cell.find("w:tcPr/w:gridSpan", NS)
                        if span is not None:
                            value += f" [объединено столбцов: {span.get(f'{{{W}}}val')}]"
                        cells.append(value.replace("\\", "\\\\").replace("\t", "\\t").replace("\n", "\\n"))
                    rows.append("\t".join(cells))
                out.append("[Таблица; столбцы разделены табуляцией, переносы внутри ячейки обозначены \\n]\n" + "\n".join(rows) + "\n[Конец таблицы]")
            elif local == "altChunk":
                self.notes.append("В документе есть внешний/вложенный фрагмент altChunk; он не исполнялся, см. оригинал.")
                out.append("[Вложенный фрагмент документа; см. оригинал]")
            elif local not in ("sectPr", "tcPr", "trPr"):
                out.extend(self.blocks(child, relations))
        return out

    def extract(self):
        root = self.package.xml("word/document.xml")
        if root is None:
            raise ValueError("DOCX document.xml is missing")
        body = root.find("w:body", NS)
        if body is None:
            raise ValueError("DOCX body is missing")
        sections = [("", "\n\n".join(self.blocks(body, self.package.relationships("word/document.xml"))))]
        for name in sorted(self.package.names):
            if re.fullmatch(r"word/(header\d+|footer\d+)\.xml", name):
                content = "\n\n".join(self.blocks(self.package.xml(name), self.package.relationships(name)))
                if content:
                    sections.append(("Колонтитул " + PurePosixPath(name).stem, content))
        for part, label, item_tag in [("word/footnotes.xml", "Сноски", "footnote"), ("word/endnotes.xml", "Концевые сноски", "endnote"), ("word/comments.xml", "Комментарии документа", "comment")]:
            container = self.package.xml(part)
            if container is None:
                continue
            content = []
            for node in container.findall(f"w:{item_tag}", NS):
                identifier = node.get(f"{{{W}}}id", "")
                if item_tag != "comment" and int(identifier or "0") <= 0:
                    continue
                value = "\n".join(self.blocks(node, self.package.relationships(part)))
                if value:
                    content.append(f"[{identifier}] {value}")
            if content:
                sections.append((label, "\n\n".join(content)))
        if self.stats["trackedChanges"]:
            self.notes.append("Исправления включены с явными пометками добавленного и удалённого текста; оригинал не изменён.")
        self.notes.append("Абзацы и таблицы извлечены в порядке OOXML; оформление, расположение объектов и изображения доступны в оригинале.")
        if self.stats["hyperlinks"]:
            self.notes.append(f"Ссылок с сохранёнными адресами: {self.stats['hyperlinks']}. Ссылки не открывались.")
        return sections, self.notes, {**dict(self.stats), "mediaFiles": self.media_count}


def xlsx_extract(package):
    workbook = package.xml("xl/workbook.xml")
    if workbook is None:
        raise ValueError("XLSX workbook.xml is missing")
    notes, media = package.notes("xl")
    shared = package.xml("xl/sharedStrings.xml")
    strings = [] if shared is None else [xml_text(node, S) for node in shared.findall("s:si", NS)]
    styles = package.xml("xl/styles.xml")
    number_formats = dict(BUILTIN_FORMATS)
    formats = []
    if styles is not None:
        number_formats.update({int(node.get("numFmtId")): node.get("formatCode", "General") for node in styles.findall("s:numFmts/s:numFmt", NS)})
        formats = [number_formats.get(int(node.get("numFmtId", "0")), "General") for node in styles.findall("s:cellXfs/s:xf", NS)]
    properties = workbook.find("s:workbookPr", NS)
    epoch = CALENDAR_MAC_1904 if properties is not None and properties.get("date1904") in ("1", "true") else CALENDAR_WINDOWS_1900
    relations = package.relationships("xl/workbook.xml")
    sections, sheet_stats = [], []
    for sheet in workbook.findall("s:sheets/s:sheet", NS):
        relation = relations.get(sheet.get(f"{{{R}}}id"))
        if not relation:
            raise ValueError("Workbook sheet relationship is missing")
        part = package.related_part("xl/workbook.xml", relation)
        root = package.xml(part) if part else None
        if root is None:
            raise ValueError("Workbook sheet is missing or external")
        label = "Лист: " + sheet.get("name", "")
        if sheet.get("state", "visible") != "visible":
            label += " [" + sheet.get("state") + "]"
        rows, formulas, values, shared_formulas = [], 0, 0, {}
        stats = {"name": sheet.get("name"), "state": sheet.get("state", "visible"), "rowsWithData": 0, "cellsWithData": 0, "formulas": 0, "formulasWithoutCachedValue": 0}
        for row in root.findall("s:sheetData/s:row", NS):
            cells = []
            for cell in row.findall("s:c", NS):
                coordinate, kind = cell.get("r", "?"), cell.get("t", "n")
                node_value, formula = cell.find("s:v", NS), cell.find("s:f", NS)
                raw = node_value.text if node_value is not None else None
                if kind == "inlineStr":
                    value = xml_text(cell.find("s:is", NS), S)
                elif kind == "s" and raw is not None:
                    value = strings[int(raw)]
                elif kind == "b" and raw is not None:
                    value = "TRUE" if raw == "1" else "FALSE"
                else:
                    value = raw
                style = int(cell.get("s", "0"))
                format_code = formats[style] if style < len(formats) else "General"
                if kind == "n" and raw is not None and is_date_format(format_code):
                    try:
                        converted = from_excel(float(raw), epoch=epoch)
                        value = converted.isoformat() + f" [число Excel: {raw}; формат: {format_code}]"
                    except (ValueError, OverflowError, TypeError):
                        value = raw + f" [формат: {format_code}]"
                elif value is not None and format_code not in ("General", "@", "0"):
                    value += f" [формат: {format_code}]"
                if formula is not None:
                    formulas += 1
                    expression = formula.text or ""
                    if formula.get("t") == "shared":
                        shared_id = formula.get("si")
                        if expression:
                            shared_formulas[shared_id] = (coordinate, expression)
                        elif shared_id in shared_formulas:
                            anchor, template = shared_formulas[shared_id]
                            try:
                                expression = Translator("=" + template, origin=anchor).translate_formula(coordinate).removeprefix("=")
                            except Exception:
                                expression = f"[общая формула {shared_id} из {anchor}: {template}]"
                        else:
                            expression = f"[общая формула {shared_id}; см. оригинал]"
                    if value is None:
                        stats["formulasWithoutCachedValue"] += 1
                    rendered = "=" + expression + "; сохранённое значение: " + (value if value is not None else "[отсутствует]")
                    if formula.get("ref"):
                        rendered += "; диапазон формулы: " + formula.get("ref")
                elif value is not None and value != "":
                    rendered = value
                else:
                    continue
                values += 1
                cells.append(coordinate + ": " + json.dumps(clean_text(rendered), ensure_ascii=False))
            if cells:
                hidden = " [скрытая строка]" if row.get("hidden") == "1" else ""
                rows.append(f"Строка {row.get('r', '?')}{hidden}: " + " | ".join(cells))
        stats.update(rowsWithData=len(rows), cellsWithData=values, formulas=formulas)
        extras = []
        merged = [node.get("ref", "") for node in root.findall("s:mergeCells/s:mergeCell", NS)]
        if merged:
            extras.append("Объединённые ячейки: " + ", ".join(merged))
        sheet_rels = package.relationships(part)
        for link in root.findall("s:hyperlinks/s:hyperlink", NS):
            relationship = sheet_rels.get(link.get(f"{{{R}}}id"), {})
            target = relationship.get("target") or ("#" + link.get("location") if link.get("location") else "")
            if target:
                extras.append(f"Ссылка {link.get('ref', '?')}: {target}")
        for relationship in sheet_rels.values():
            if relationship["type"].endswith("/comments") and not relationship["external"]:
                comments = package.xml(package.related_part(part, relationship))
                if comments is not None:
                    for comment in comments.findall("s:commentList/s:comment", NS):
                        extras.append(f"Примечание {comment.get('ref', '?')}: " + xml_text(comment.find("s:text", NS), S))
        hidden_columns = [f"{node.get('min')}:{node.get('max')}" for node in root.findall("s:cols/s:col", NS) if node.get("hidden") == "1"]
        if hidden_columns:
            extras.append("Скрытые столбцы (их заполненные ячейки также включены): " + ", ".join(hidden_columns))
        sections.append((label, "\n".join(rows + extras) if rows or extras else "Заполненных ячеек не обнаружено; структура и оформление сохранены в оригинале."))
        sheet_stats.append(stats)
    notes.append("Включены все листы и все заполненные ячейки с координатами; пустые ячейки не перечислены. Сохранённые значения формул прочитаны из файла и не пересчитывались.")
    notes.append("Внешние связи и ссылки не открывались; макросы и формулы не исполнялись. Оформление, диаграммы и изображения сохранены в оригинале.")
    return sections, notes, {"sheets": sheet_stats, "mediaFiles": media}


def combine_sections(sections):
    return "\n\n".join((title + "\n" if title else "") + value for title, value in sections if value).strip()


def preview_sections(sections, limit, full_length):
    intro = f"ПРЕДПРОСМОТР. Полный извлечённый текст содержит {full_length} символов и превышает лимит статьи. Ниже приведены начальные фрагменты каждого раздела/листа. Полное содержание доступно в прикреплённом оригинальном файле.\n\n"
    room = limit - len(intro) - 1
    share = max(100, (room // max(1, len(sections))) - 100)
    parts = []
    for title, value in sections:
        prefix = (title + "\n") if title else ""
        if len(value) > share:
            excerpt = value[:share]
            if "\n" in excerpt:
                excerpt = excerpt.rsplit("\n", 1)[0]
            value = excerpt + "\n[Раздел показан частично; продолжение — в оригинальном файле.]"
        parts.append(prefix + value)
    result = intro + "\n\n".join(parts)
    if len(result) > limit:
        raise ValueError("Preview could not fit all section headings within the body limit")
    return result


def private_directory(path):
    if path.is_symlink():
        raise ValueError("Output directory cannot be a symlink")
    path.mkdir(mode=0o700, parents=True, exist_ok=True)
    path.chmod(0o700)


def write_original(root, relative, data):
    target = root.joinpath(*PurePosixPath(relative).parts)
    current = root
    for segment in PurePosixPath(relative).parts[:-1]:
        current = current / segment
        private_directory(current)
    if target.is_symlink():
        raise ValueError("Output file cannot be a symlink")
    if target.exists():
        if target.read_bytes() != data:
            raise ValueError("Existing original does not match archive bytes")
    else:
        descriptor = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0), 0o600)
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(data)
    target.chmod(0o600)
    return str(target.resolve())


def write_json(path, value):
    if path.is_symlink():
        raise ValueError("Manifest cannot be a symlink")
    temporary = path.with_suffix(path.suffix + ".tmp")
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC | getattr(os, "O_NOFOLLOW", 0), 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
        json.dump(value, stream, ensure_ascii=False, indent=2)
        stream.write("\n")
    temporary.chmod(0o600)
    os.replace(temporary, path)
    path.chmod(0o600)


def prepare(archives, output, body_limit=60000, allow_preview=False):
    private_directory(output)
    originals = output / "originals"
    private_directory(originals)
    sources, documents, seen = [], [], set()
    oversized, blank = [], []
    for archive_path in archives:
        archive_data = archive_path.read_bytes()
        if len(archive_data) > MAX_ARCHIVE:
            raise ValueError("Source archive exceeds the byte limit")
        with zipfile.ZipFile(BytesIO(archive_data)) as archive:
            entries = [entry for entry in validate_zip(archive) if not entry.is_dir()]
            sources.append({"archive": archive_path.name, "sha256": sha256(archive_data), "entryCount": len(entries)})
            for entry in sorted(entries, key=lambda item: source_path(item.filename)):
                relative = source_path(entry.filename)
                if relative in seen:
                    raise ValueError("Source paths collide across archives")
                seen.add(relative)
                path = PurePosixPath(relative)
                if path.suffix.lower() not in MIME:
                    raise ValueError("Unsupported document type in archive")
                data = bounded_read(archive, entry)
                original_path = write_original(originals, relative, data)
                package = Package(data)
                sections, notes, stats = DocxExtractor(package).extract() if path.suffix.lower() == ".docx" else xlsx_extract(package)
                full_body = combine_sections(sections)
                body = full_body
                index = len(documents)
                if not full_body:
                    blank.append(index)
                    body = "В исходном документе нет извлекаемого текста. Содержание и оформление доступны в прикреплённом оригинале."
                    notes.append("Извлечённый текст пуст; текст статьи является явной пометкой, а не содержанием источника.")
                if len(body) > body_limit:
                    oversized.append({"documentIndex": index, "characters": len(body)})
                    if allow_preview:
                        body = preview_sections(sections, body_limit, len(body))
                        notes.append(f"Статья содержит явный предпросмотр вместо полного текста ({len(full_body)} символов). Оригинал сохранён полностью.")
                    else:
                        body = "Текст превышает лимит статьи; требуется выбрать явный предпросмотр или разделение. Оригинал сохранён полностью."
                if relative != entry.filename:
                    notes.append("Путь и имя нормализованы в NFC; краевые пробелы сегментов удалены. Исходный путь сохранён в archiveEntryPath.")
                document = {"sourceArchive": archive_path.name, "sourcePath": relative, "archiveEntryPath": entry.filename,
                            "folderPath": str(path.parent), "title": path.stem, "body": body, "filename": path.name,
                            "mimeType": MIME[path.suffix.lower()], "byteSize": len(data), "sha256": sha256(data),
                            "originalPath": original_path, "extractionNotes": notes, "extractionStats": stats,
                            "fullTextCharacterCount": len(full_body), "preview": len(full_body) > body_limit,
                            "fullTextSha256": sha256(full_body.encode("utf-8"))}
                documents.append(document)
    summary = {"documentCount": len(documents), "typeCounts": dict(Counter(PurePosixPath(item["filename"]).suffix.lower() for item in documents)),
               "originalBytes": sum(item["byteSize"] for item in documents), "folderCount": len({item["folderPath"] for item in documents}),
               "blankDocumentIndexes": blank, "oversizedDocuments": oversized, "maximumTextCharacters": max((item["fullTextCharacterCount"] for item in documents), default=0),
               "documentsWithImages": sum(bool(item["extractionStats"].get("mediaFiles")) for item in documents),
               "normalizationCount": sum(item["sourcePath"] != item["archiveEntryPath"] for item in documents),
               "readyForImport": not oversized or allow_preview}
    manifest = {"schemaVersion": 1, "preparedAt": datetime.now(timezone.utc).isoformat(), "sources": sources, "documents": documents, "summary": summary}
    write_json(output / "manifest.json", manifest)
    print(json.dumps(summary, ensure_ascii=False))
    return 0 if summary["readyForImport"] else 2


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--body-limit", type=int, default=60000)
    parser.add_argument("--allow-preview", action="store_true", help="Use an explicitly labelled multi-section preview when full text exceeds the article limit")
    parser.add_argument("archives", nargs="+", type=Path)
    args = parser.parse_args()
    if args.body_limit < 1000 or args.body_limit > 60000:
        parser.error("body-limit must be from 1000 to 60000")
    return prepare(args.archives, args.output, args.body_limit, args.allow_preview)


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as error:
        # Do not print private filenames, document contents or traceback data.
        print(f"Preparation failed: {type(error).__name__}: {str(error)[:160]}", file=sys.stderr)
        sys.exit(1)
