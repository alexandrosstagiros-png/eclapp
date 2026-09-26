#!/usr/bin/env python3
"""Normalize a retained recruitment workbook extraction without changing the app.

Input is the lossless source.json schema: sheets -> rows/cells/mergedRanges.
Use raw cell values and actual merge boundaries only; never forward-fill blanks.
The generated plan contains private source text and belongs in .local, not git.
"""
import argparse
import collections
import json
import os
import re
from pathlib import Path

LIMITS = {'title':160, 'city':100, 'district':160, 'schedule':300,
          'payTerms':1000, 'vehicleRequirements':1000, 'routeInfo':1000,
          'trainingTerms':1000, 'driverRequirements':1000,
          'warehouseAddress':500, 'publicBrief':4000, 'notes':4000}
PRIVATE_COLUMNS = {'Проекты': {'C','L','T'}, 'Перевозчики': {'C','F','S','Y'}}
# Keep original wording solely in company-only sourceDetails. This is not a
# candidate-selection filter: no candidate data is inspected or ranked.
PROTECTED_WORDING = re.compile(
    r'гражданств|национальност|этнич|возраст|\b\d{2}\s*[-–]\s*\d{2}\s*лет\b|'
    r'\bмужчин|\bженщин|\bславян|\bчечен|\bдагест|\bкиргиз|\bтаджик|'
    r'\bузбек|не\s+(?:набираем|бер[её]м|рассматриваем).*(?:ДР|ЧР|республик)',
    re.I)
PHONE = re.compile(r'(?<!\d)(?:\+7|8)[\s()\-]*(?:\d[\s()\-]*){10}(?!\d)')
CELL = re.compile(r'^([A-Z]+)(\d+)$')


def column_number(label):
    result = 0
    for char in label:
        result = result * 26 + ord(char) - 64
    return result


def coordinates(address):
    match = CELL.fullmatch(address)
    return column_number(match[1]), int(match[2])


def display(cell):
    if not cell:
        return ''
    value = cell.get('cached') if cell.get('dataType') == 'f' else cell.get('value')
    if value is None:
        return ''
    if cell.get('dataType') == 'd' and cell.get('format') in ('d/m', 'd-m'):
        match = re.match(r'^\d{4}-(\d{2})-(\d{2})', str(value))
        if match:
            return f'{int(match[2])}{cell["format"][1]}{int(match[1])}'
    if isinstance(value, bool):
        return 'TRUE' if value else 'FALSE'
    if isinstance(value,(int,float)):
        number = str(int(value)) if isinstance(value,int) or value.is_integer() else str(value)
        if 'руб' in cell.get('format','').lower():
            return number + ' руб.'
        return number
    return str(value).strip()


def readable_source(source_details):
    """A staff member can inspect every source value without reading JSON."""
    name = source_details['sheet']
    first, last = source_details['rowStart'], source_details['rowEnd']
    lines = [f'Файл: {Path(source_details["sourceFile"]).name}',
             f'Лист: {name}; строки: {first}–{last}',
             f'Блок проекта: строки {source_details["blockStart"]}–{source_details["blockEnd"]}',
             f'Контрольная сумма SHA-256: {source_details["sourceSha256"]}']
    if source_details['hiddenRows']:
        lines.append('Скрытые строки источника: ' + ', '.join(map(str,source_details['hiddenRows'])))
    if source_details['issues']:
        lines += ['', 'Замечания при переносе:']
        for item in source_details['issues']:
            suffix = ' Ячейки: ' + ', '.join(item['cells']) + '.' if item.get('cells') else ''
            lines.append('• ' + item['message'] + suffix)
    headers = source_details['headers']
    def append_cell(address, cell, merge=None):
        col = CELL.fullmatch(address)[1]
        header = display(headers.get(col+'1')) or 'Колонка без заголовка'
        if name == 'Перевозчики' and col == 'B':
            header = 'Проект / клиент (заголовок источника: ' + header + ')'
        elif name == 'Перевозчики' and col == 'Q':
            header = 'Город (заголовок источника: ' + header + ')'
        elif name == 'Перевозчики' and col in ('N','O','P'):
            header = 'Часть таблицы ставок'
        lines.extend(['', f'{address} — {header}'])
        if merge:
            lines.append('Общее значение объединённых ячеек ' + merge)
        value = cell.get('value')
        if cell.get('dataType') == 'f':
            lines.append('Формула: ' + str(value))
            cached = cell.get('cached')
            lines.append('Сохранённое значение: ' + ('не сохранено' if cached is None else str(cached)))
        elif cell.get('dataType') == 'd':
            lines.append('Отображается в таблице: ' + display(cell))
            lines.append('Исходное значение Excel: ' + str(value))
        else:
            lines.append('' if value is None else str(value))
            if cell.get('cached') != value:
                lines.append('Сохранённое значение: ' + str(cell.get('cached')))
        if cell.get('format') != 'General':
            lines.append('Формат ячейки: ' + str(cell.get('format')))
        if cell.get('hyperlink'):
            lines.append('Гиперссылка ячейки: ' + str(cell['hyperlink']))
    lines += ['', 'Исходные ячейки:']
    for address,cell in source_details['originalCells'].items():
        append_cell(address,cell)
    if source_details['inheritedCells']:
        lines += ['', 'Общие значения из объединённых ячеек:']
        for address,value in source_details['inheritedCells'].items():
            append_cell(address,value['cell'],value['mergedRange'])
    if source_details['mergedRanges']:
        lines += ['', 'Объединённые диапазоны исходного листа:', ', '.join(source_details['mergedRanges'])]
    lines += ['', 'Правило чтения: графики и сроки, хранящиеся в Excel как даты с форматом d/m или d-m, показаны как день/месяц или день-месяц. Нулевые количества и пустые значения различаются. Исходные комментарии и контакты доступны только сотрудникам компании.']
    return '\n'.join(lines)


class Sheet:
    def __init__(self, name, value):
        self.name = name
        self.data = value
        self.rows = {row['row']:row['cells'] for row in value['rows']}
        self.merges = []
        for raw in value['mergedRanges']:
            begin, end = raw.split(':')
            c1, r1 = coordinates(begin)
            c2, r2 = coordinates(end)
            self.merges.append((c1, r1, c2, r2, begin, raw))

    def resolve(self, row, col):
        address = f'{col}{row}'
        cell = self.rows.get(row, {}).get(address)
        if cell is not None:
            return address, cell, None
        c = column_number(col)
        for c1, r1, c2, r2, anchor, raw in self.merges:
            if c1 <= c <= c2 and r1 <= row <= r2:
                return anchor, self.rows.get(r1, {}).get(anchor), raw
        return address, None, None

    def text(self, row, col):
        return display(self.resolve(row, col)[1])

    def records(self):
        end = 86 if self.name == 'Проекты' else 169
        starts = sorted(row for row, cells in self.rows.items()
                        if 1 < row <= end and f'B{row}' in cells)
        for index, begin in enumerate(starts):
            finish = (starts[index+1] if index+1 < len(starts) else end+1)-1
            if self.name == 'Проекты' or begin == 157:
                for row in range(begin, finish+1):
                    yield row, row, begin, finish
            else:
                yield begin, finish, begin, finish


def normalize(source):
    output = {'schemaVersion':1, 'source':{'fileName':Path(source['sourceFile']).name,
              'sha256':source['sha256']}, 'records':[], 'summary':{},
              'sourcePolicy':'Explicit merges only. Original contacts, internal comments and protected-trait wording retained in company-only sourceDetails. Numeric zeros and missing quantities remain distinct.'}
    covered = collections.defaultdict(set)
    for name, sheet_value in source['sheets'].items():
        sheet = Sheet(name, sheet_value)
        is_driver = name == 'Проекты'
        colmap = ({'city':'A','schedule':'J','payTerms':'H','vehicleRequirements':'G',
                   'warehouseAddress':'F','routeInfo':'I','trainingTerms':'M',
                   'driverRequirements':'N','publicBrief':'K'} if is_driver else
                  {'city':'Q','schedule':'K','vehicleRequirements':'I',
                   'warehouseAddress':'R','routeInfo':'H','trainingTerms':'G',
                   'driverRequirements':'J','publicBrief':'E'})
        for first, last, block_first, block_last in sheet.records():
            issues = []
            def issue(code, message, cells=None):
                entry = {'code':code,'message':message}
                if cells:
                    entry['cells'] = cells
                if entry not in issues:
                    issues.append(entry)
            payload = {key:sheet.text(first,col) for key,col in colmap.items()}
            if is_driver:
                residence = sheet.text(first,'O')
                if residence:
                    payload['driverRequirements'] += '\n\nТребования к месту проживания:\n' + residence
            mileage = sheet.resolve(first,'I' if is_driver else 'H')[1]
            if mileage and isinstance(mileage.get('value'),(int,float)):
                payload['routeInfo'] = 'Средний пробег ' + display(mileage) + (' км (дом/дом)' if is_driver else ' км')
            quantity_cell = sheet.resolve(first, 'E' if is_driver else 'D')
            quantity_raw = quantity_cell[1].get('value') if quantity_cell[1] else None
            quantity = int(quantity_raw) if isinstance(quantity_raw, (int,float)) and not isinstance(quantity_raw,bool) and float(quantity_raw).is_integer() else None
            if quantity is None:
                issue('quantity_unspecified','Количество не указано числом в исходном листе.',[quantity_cell[0]])
            source_priority = sheet.text(first, 'D' if is_driver else 'T')
            payload.update({'kind':'driver' if is_driver else 'carrier','quantity':quantity,
                            'priority':'urgent' if source_priority == '1' else 'normal',
                            'district':'','neededBy':None,'hhUrl':'','publishedAt':None})
            if source_priority == '':
                issue('priority_unspecified','Приоритет в источнике не указан; оставлен обычный.',['%s%s' % ('D' if is_driver else 'T',first)])
            customer = ' '.join(sheet.text(first,'B').split())
            # Stable row suffix preserves distinct variants with otherwise identical
            # labels, including duplicate customer/city/vehicle combinations.
            title_parts = [customer, payload['city']]
            if block_last > block_first and (is_driver or block_first == 157):
                vehicle = ' '.join(payload['vehicleRequirements'].split())
                if vehicle and len(vehicle) <= 60:
                    title_parts.append(vehicle)
                title_parts.append(f'стр. {first}')
            elif any(other != block_first and f'B{other}' in cells and
                     ' '.join(display(cells[f'B{other}']).split()) == customer and
                     sheet.text(other,'A' if is_driver else 'Q') == payload['city']
                     for other,cells in sheet.rows.items() if other > 1):
                title_parts.append(f'стр. {first}')
            payload['title'] = ' · '.join(part for part in title_parts if part)
            if not is_driver:
                # A merged M:P text paragraph contributes once. In grid blocks,
                # render each row with all explicit/vertical-merged columns.
                tariff_rows = []
                for row in range(first,last+1):
                    seen = set()
                    values = []
                    for col in ('M','N','O','P'):
                        anchor,cell,merged = sheet.resolve(row,col)
                        if anchor in seen or not display(cell):
                            continue
                        seen.add(anchor)
                        # Skip repeated whole-block paragraphs on following rows.
                        if merged and coordinates(anchor)[1] < row and ':' in merged:
                            c1,r1,c2,r2,_,_ = next(m for m in sheet.merges if m[5] == merged)
                            if c2 > c1:
                                continue
                        values.append(display(cell))
                    if values:
                        tariff_rows.append(' | '.join(values))
                payload['payTerms'] = '\n'.join(tariff_rows)
                penalties = sheet.text(first,'L')
                if penalties:
                    payload['payTerms'] += '\n\nШтрафные санкции для перевозчика:\n' + penalties
            if not payload['city']:
                issue('city_unspecified','Город в источнике не указан.',[f'Q{first}'])
            if (is_driver and first == 84) or (not is_driver and first == 164):
                issue('city_conflict','Город в колонке источника расходится с названием проекта и адресом склада. Сохранён исходный город.', ['A84','B84','F84'] if is_driver else ['B164','Q164','R164'])
            if any(row in sheet.data['hiddenRows'] for row in range(first,last+1)):
                issue('source_row_hidden','Строка скрыта в исходном листе; сохранена без автоматического открытия набора.',[str(first)])
            if is_driver and first == 28:
                extra = sheet.text(first,'T')
                mentioned = [int(value) for value in re.findall(r'[-–]\s*(\d+)\s*вод',extra)]
                if mentioned and sum(mentioned) != quantity:
                    issue('quantity_conflict','В колонке потребности указано ' + str(quantity) + ', а в дополнительной записи T28 перечислено ' + str(sum(mentioned)) + ' водителей. Сохранено числовое значение E28; требуется уточнение.',['E28','T28'])
            if is_driver and first == 60:
                comment = sheet.text(first,'L')
                amount = re.search(r'ставка\s+(\d+)',comment,re.I)
                pay = sheet.resolve(first,'H')[1]
                if amount and pay and isinstance(pay.get('value'),(int,float)) and int(amount[1]) != pay['value']:
                    issue('payment_conflict','В зарплате указано ' + display(pay) + ', а в комментарии для графика 6/1 — ' + amount[1] + ' руб. Требуется уточнение условий оплаты.',['H60','L60'])
            for key in ('publicBrief','driverRequirements','vehicleRequirements','trainingTerms','payTerms','schedule','routeInfo','warehouseAddress'):
                text = payload.get(key,'')
                source_cells = [sheet.resolve(first,colmap[key])[0]] if key in colmap else None
                if is_driver and key == 'driverRequirements' and sheet.text(first,'O'):
                    source_cells.append(sheet.resolve(first,'O')[0])
                removed = False
                kept = []
                for line in text.splitlines():
                    if PROTECTED_WORDING.search(line):
                        removed = True
                    elif PHONE.search(line):
                        issue('contact_in_public_field','Контактные данные из общего текста сохранены только во внутреннем источнике.',source_cells)
                    else:
                        kept.append(line)
                if removed:
                    issue('requirements_need_review','Ограничения по личным характеристикам сохранены только во внутреннем источнике и не перенесены в условия подбора.',source_cells)
                payload[key] = '\n'.join(kept).strip()
            private_notes = []
            for col in sorted(PRIVATE_COLUMNS[name],key=column_number):
                for row in range(first,last+1):
                    address,cell,merged = sheet.resolve(row,col)
                    text = display(cell)
                    if text and not any(item[0] == address for item in private_notes):
                        private_notes.append((address,text))
            payload['notes'] = '\n\n'.join(f'{address}: {text}' for address,text in private_notes)
            for key,limit in LIMITS.items():
                if len(payload.get(key,'')) > limit:
                    issue('internal_notes_overflow' if key == 'notes' else 'field_overflow',f'Поле {key}: исходный текст длиннее {limit} символов; полный текст сохранён во внутреннем источнике.')
                    if key == 'title':
                        payload[key] = f'{customer} · стр. {first}'
                        assert len(payload[key]) <= limit
                    else:
                        payload[key] = 'Полные условия сохранены во внутреннем источнике; требуется уточнение.'
            # Removing source preferences about personal traits does not block
            # otherwise usable demand: no such selection rule is carried over.
            advisory_codes = {'priority_unspecified','requirements_need_review','contact_in_public_field','internal_notes_overflow'}
            blockers = [item for item in issues if item['code'] not in advisory_codes]
            payload['status'] = 'open' if quantity is not None and quantity > 0 and not blockers else 'paused'
            raw_cells = {}
            inherited = {}
            for row in range(first,last+1):
                for address,cell in sheet.rows.get(row,{}).items():
                    raw_cells[address] = cell
                    covered[name].add(address)
                for col in ('A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y'):
                    address,cell,merged = sheet.resolve(row,col)
                    if cell and address not in raw_cells:
                        inherited[address] = {'cell':cell,'mergedRange':merged}
            source_details = {'sourceFile':source['sourceFile'],'sourceSha256':source['sha256'],
                              'sheet':name,'rowStart':first,'rowEnd':last,
                              'blockStart':block_first,'blockEnd':block_last,
                              'headers':sheet.rows.get(1,{}),
                              'originalCells':raw_cells,'inheritedCells':inherited,
                              'mergedRanges':[m[5] for m in sheet.merges if m[1] <= last and m[3] >= first],
                              'hiddenRows':[row for row in sheet.data['hiddenRows'] if first<=row<=last],
                              'issues':issues,
                              'displayRule':'Excel dates formatted d/m or d-m are rendered as visible day/month or day-month text; numeric zeros and missing cells are preserved separately.'}
            source_text = readable_source(source_details)
            assert len(source_text) <= 100000, (name,first,len(source_text))
            output['records'].append({'sourceKey':f'{name}:{first}','sheet':name,
                                      'rowStart':first,'rowEnd':last,'payload':payload,
                                      'sourceDetails':source_text,'sourceData':source_details,'issues':issues})
        meaningful = {address for row,cells in sheet.rows.items() if 1 < row <= (86 if is_driver else 169) for address in cells}
        assert not meaningful-covered[name], (name, sorted(meaningful-covered[name]))
        selected = [r for r in output['records'] if r['sheet'] == name]
        tail = [(address,cell) for row,cells in sheet.rows.items() if row > (86 if is_driver else 169) for address,cell in cells.items()]
        assert all(address.startswith('A') and cell.get('dataType') == 'f' for address,cell in tail)
        output['summary'][name] = {'recordCount':len(selected),'knownQuantity':sum(r['payload']['quantity'] or 0 for r in selected),
                                 'positiveDemandRecords':sum((r['payload']['quantity'] or 0)>0 for r in selected),
                                 'unknownDemandRecords':sum(r['payload']['quantity'] is None for r in selected),
                                 'openRecords':sum(r['payload']['status']=='open' for r in selected),
                                 'pausedRecords':sum(r['payload']['status']=='paused' for r in selected),
                                 'openQuantity':sum(r['payload']['quantity'] or 0 for r in selected if r['payload']['status']=='open'),
                                 'positivePausedRecords':sum((r['payload']['quantity'] or 0)>0 and r['payload']['status']=='paused' for r in selected),
                                 'positivePausedQuantity':sum(r['payload']['quantity'] or 0 for r in selected if r['payload']['status']=='paused'),
                                 'coveredSourceCellCount':len(meaningful),
                                 'skippedHelperTailCellCount':len(tail),
                                 'issues':dict(collections.Counter(issue['code'] for r in selected for issue in r['issues']))}
    assert len(output['records']) == 142
    assert len({r['sourceKey'] for r in output['records']}) == 142
    return output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-json',type=Path,required=True)
    parser.add_argument('--output',type=Path,required=True)
    args = parser.parse_args()
    source = json.loads(args.source_json.read_text())
    plan = normalize(source)
    args.output.parent.mkdir(parents=True,exist_ok=True)
    descriptor = os.open(args.output,os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600)
    with os.fdopen(descriptor,'w') as output:
        os.fchmod(output.fileno(),0o600)
        output.write(json.dumps(plan,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(plan['summary'],ensure_ascii=False))


if __name__ == '__main__':
    main()
