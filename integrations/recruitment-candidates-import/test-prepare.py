"""Synthetic XLSX extraction regression; no user workbook or database access."""
import datetime as dt
import tempfile
import unittest
import zipfile
from pathlib import Path
from xml.sax.saxutils import escape

from prepare import prepare, private_json


def inline(address, value):
    return f'<c r="{address}" t="inlineStr"><is><t>{escape(value)}</t></is></c>'


def sheet(rows):
    body = "".join(f'<row r="{number}">{cells}</row>' for number, cells in rows)
    return f'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>{body}</sheetData></worksheet>'


def fixture(destination):
    names = ["Свои авто", "Наемные авто", "Пальма"]
    sheets = "".join(f'<sheet name="{name}" sheetId="{index}" r:id="rId{index}"/>' for index, name in enumerate(names, 1))
    rels = "".join(f'<Relationship Id="rId{i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet{i}.xml"/>' for i in range(1, 4))
    types = "".join(f'<Override PartName="/xl/worksheets/sheet{i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' for i in range(1, 4))
    common = inline("B3", "Synthetic candidate") + inline("C3", "Москва") + inline("D3", "8 (999) 555-01-01") + inline("E3", "Авито") + inline("F3", "Synthetic recruiter")
    with zipfile.ZipFile(destination, "w") as archive:
        archive.writestr("[Content_Types].xml", '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' + types + '</Types>')
        archive.writestr("_rels/.rels", '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>')
        archive.writestr("xl/workbook.xml", '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' + sheets + '</sheets></workbook>')
        archive.writestr("xl/_rels/workbook.xml.rels", '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + rels + '</Relationships>')
        archive.writestr("xl/worksheets/sheet1.xml", sheet([(1, inline("B1", "ФИО кандидата") + inline("D1", "Телефон")),
            (2, inline("B2", "Примеров Пример Примерович") + inline("D2", "79995550000")),
            (3, '<c r="A3"><f>IF(B3,A3,NOW())</f><v>46000</v></c>' + common),
            (4, inline("B4", "Malformed candidate") + inline("D4", "not a phone"))]))
        archive.writestr("xl/worksheets/sheet2.xml", sheet([(1, inline("B1", "ФИО кандидата") + inline("E1", "Телефон")),
            (2, '<c r="A2" t="d"><v>2026-09-23T11:00:00</v></c>' + inline("B2", "Synthetic second candidate") + inline("C2", "Москва") + inline("E2", "79995550102") + inline("G2", "АТИ") + inline("H2", "Synthetic recruiter"))]))
        archive.writestr("xl/worksheets/sheet3.xml", sheet([(1, inline("A1", "Archive")),
            (2, '<c r="A2" t="e"><f t="array" ref="A2:A2">IMPORT_STUB()</f><v>#REF!</v></c>')]))


class PreparationTest(unittest.TestCase):
    def test_snapshot_preserves_raw_and_quarantines_without_inventing_dates(self):
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder) / "synthetic.xlsx"
            fixture(source)
            before = source.read_bytes()
            plan, archive, resolution = prepare(source, "synthetic-extraction", "Europe/Moscow", dt.date(2026, 9, 24))
            self.assertEqual(len(plan["records"]), 3)
            self.assertEqual(plan["excludedTests"], ["Свои авто:2"])
            self.assertEqual(plan["records"][0]["proposed"]["phone"], "+79995550101")
            self.assertIsNone(plan["records"][0]["proposed"]["occurredAt"])
            self.assertEqual(plan["records"][0]["raw"]["A3"]["xml"]["value"], "46000")
            self.assertIn("invalid_phone", plan["records"][1]["issues"])
            self.assertEqual(plan["records"][2]["proposed"]["occurredAt"], "2026-09-23T08:00:00Z")
            self.assertEqual(plan["summary"]["Свои авто"]["quarantined"], 1)
            self.assertEqual(archive["sheets"]["Пальма"]["rows"][0]["raw"]["A2"]["value"]["formulaType"], "array")
            self.assertEqual(resolution["records"], {})
            self.assertTrue(all(value is None for value in resolution["recruiters"].values()))
            self.assertEqual(source.read_bytes(), before)
            target = Path(folder) / "archive.json"
            private_json(target, archive)
            self.assertEqual(target.stat().st_mode & 0o777, 0o600)
            with self.assertRaises(FileExistsError):
                private_json(target, archive)


if __name__ == "__main__":
    unittest.main()
