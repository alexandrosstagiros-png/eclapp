#!/usr/bin/env python3
"""Read-only migration of the two supplied XLSX document libraries.

Only source cell values/formula expressions are read. Formula caches and the
employee/carrier/vehicle registers are deliberately never used as document data.
The output is an application catalog, not a rewritten spreadsheet.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
from collections import OrderedDict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / 'recovered/apps/api/src/modules/recruitment/contract-catalog.json'
RESERVED = {'contract_number', 'contract_date'}

LABELS = {
    'company_name': 'Организация: полное наименование', 'company_inn': 'ИНН организации',
    'company_kpp': 'КПП организации (если применяется)', 'company_ogrn': 'ОГРН / ОГРНИП организации',
    'company_address': 'Адрес организации', 'company_postal_address': 'Почтовый адрес организации',
    'company_bank': 'Банк организации', 'company_bik': 'БИК банка организации',
    'company_account': 'Расчётный счёт организации', 'company_correspondent_account': 'Корреспондентский счёт банка организации',
    'company_phone': 'Телефон организации', 'company_contact': 'Контактное лицо организации',
    'signer_name': 'ФИО подписанта организации', 'signer_basis': 'Основание полномочий подписанта',
    'signer_title': 'Должность / статус подписанта', 'full_name': 'ФИО работника',
    'birth_date': 'Дата рождения', 'citizenship': 'Гражданство', 'passport_series': 'Серия паспорта (если имеется)', 'passport_number': 'Номер паспорта',
    'passport_issuer': 'Кем выдан паспорт', 'passport_date': 'Дата выдачи паспорта',
    'passport_code': 'Код подразделения', 'registration_address': 'Адрес регистрации',
    'snils': 'СНИЛС', 'phone': 'Телефон', 'short_name': 'Фамилия и инициалы работника для подписи',
    'employment_start_date': 'Дата начала работы', 'salary': 'Оклад, руб. в месяц', 'city': 'Город оформления',
    'valid_until': 'Срок действия до', 'carrier_type': 'Статус перевозчика (ИП / ООО)',
    'carrier_name': 'Полное наименование / ФИО перевозчика', 'carrier_signer_name': 'ФИО подписанта перевозчика',
    'carrier_signer_basis': 'Основание полномочий подписанта перевозчика', 'carrier_inn': 'ИНН перевозчика',
    'carrier_kpp': 'КПП перевозчика (если применяется)', 'carrier_ogrn': 'ОГРН / ОГРНИП перевозчика',
    'carrier_address': 'Адрес перевозчика', 'carrier_bank': 'Банк перевозчика', 'carrier_bik': 'БИК банка перевозчика',
    'carrier_account': 'Расчётный счёт перевозчика', 'carrier_correspondent_account': 'Корреспондентский счёт банка перевозчика',
    'carrier_phone': 'Телефон перевозчика', 'vehicle_plate': 'Государственный номер ТС',
    'vehicle_brand': 'Марка и модель ТС', 'vehicle_type': 'Тип ТС', 'vehicle_year': 'Год выпуска ТС',
    'vehicle_sts_series': 'Серия СТС', 'vehicle_sts_number': 'Номер СТС', 'vehicle_vin': 'VIN',
    'vehicle_chassis': 'Номер шасси / рамы', 'vehicle_body': 'Номер кузова', 'vehicle_color': 'Цвет ТС',
    'vehicle_category': 'Категория ТС', 'vehicle_max_mass': 'Разрешённая максимальная масса',
    'vehicle_capacity': 'Грузоподъёмность', 'vehicle_volume': 'Объём кузова, м³',
    'vehicle_refrigerator': 'Холодильная установка', 'vehicle_mileage': 'Пробег ТС',
    'vehicle_fuel_level': 'Уровень топлива', 'vehicle_documents': 'Переданные документы и номера',
    'vehicle_condition': 'Состояние и повреждения ТС', 'vehicle_photos': 'Фотофиксация: файлы и место хранения',
    'vehicle_engine_model': 'Модель двигателя', 'vehicle_engine_number': 'Номер двигателя',
    'vehicle_owner': 'Собственник ТС', 'trailer_plate': 'Госномер прицепа', 'trailer_owner': 'Собственник прицепа и ИНН',
    'vehicle_ownership': 'Вид владения ТС', 'trailer_ownership': 'Вид владения прицепом',
    'actual_address': 'Фактический адрес проживания (если отличается)', 'personal_inn': 'ИНН физического лица',
    'personal_contacts': 'Электронная почта / мессенджеры', 'subject_status': 'Статус субъекта персональных данных',
    'sout_conditions': 'Условия труда, класс, карта СОУТ и дата',
    'employee_category': 'Категория должности по штатному расписанию', 'employee_supervisor': 'Непосредственный руководитель',
    'payee_name': 'ФИО получателя выплаты (третье лицо)', 'payee_account': 'Счёт получателя выплаты (третье лицо)',
    'payee_bank': 'Банк получателя выплаты', 'payee_bik': 'БИК банка получателя',
    'payee_correspondent_account': 'Корреспондентский счёт банка получателя', 'payee_bank_inn': 'ИНН банка получателя',
    'payee_passport_series': 'Серия паспорта получателя', 'payee_passport_number': 'Номер паспорта получателя',
    'payee_passport_issuer': 'Кем выдан паспорт получателя', 'payee_passport_date': 'Дата выдачи паспорта получателя',
    'agreement_start_date': 'Дата начала действия соглашения', 'agreement_end_date': 'Дата окончания соглашения',
    'payment_days': 'Срок оплаты в банковских днях (цифрами и словами)',
    'vat_rate': 'НДС: согласованная ставка либо «без НДС»', 'transport_price': 'Ставка перевозки, сумма и пропись',
    'transport_prepayment': 'Предоплата', 'route': 'Маршрут перевозки', 'temperature_min': 'Минимальная температура',
    'temperature_max': 'Максимальная температура', 'loading_date': 'Дата погрузки',
    'loading_window': 'Интервал погрузки', 'loading_address': 'Адрес погрузки',
    'loading_contact': 'Контакт на погрузке', 'loading_method': 'Способ погрузки',
    'cargo_description': 'Наименование и параметры груза', 'cargo_weight': 'Вес груза, т',
    'cargo_volume': 'Объём груза, м³', 'cargo_additional': 'Дополнительные условия перевозки',
    'driver_name': 'ФИО водителя', 'driver_licence_series': 'Серия водительского удостоверения',
    'driver_licence_number': 'Номер водительского удостоверения', 'driver_licence_issuer': 'Кем выдано водительское удостоверение',
    'driver_licence_date': 'Дата выдачи водительского удостоверения', 'driver_passport_series': 'Серия паспорта водителя',
    'driver_passport_number': 'Номер паспорта водителя', 'driver_passport_issuer': 'Кем выдан паспорт водителя',
    'driver_passport_date': 'Дата выдачи паспорта водителя', 'supplement_number': 'Номер дополнительного соглашения',
    'supplement_date': 'Дата дополнительного соглашения', 'carrier_signer_title': 'Должность / статус подписанта перевозчика',
    'checklist_results': 'Результаты проверки документов и допуска', 'checklist_owner': 'Ответственный за проверку',
    'acknowledgment_documents': 'Перечень для подписания: документы, версии и даты фактического ознакомления',
    'acknowledgment_date': 'Дата фактического ознакомления и подписи',
    'opticom_tariff_1': 'Оптиком: согласованные тарифы №1, включая порядок НДС',
    'opticom_tariff_2': 'Оптиком: согласованные тарифы №2, включая порядок НДС',
    'inventory_details': 'Имущество: количество, состояние, номера и отметки выдачи / возврата',
}

OPTIONAL = {'company_kpp', 'carrier_kpp', 'actual_address', 'personal_contacts', 'passport_series', 'passport_code', 'driver_passport_series', 'payee_passport_series',
            'company_contact', 'company_postal_address', 'cargo_additional', 'transport_prepayment',
            'trailer_plate', 'trailer_owner', 'trailer_ownership', 'vehicle_chassis', 'vehicle_body',
            'vehicle_engine_model', 'vehicle_engine_number'}
TEXTAREA = {'company_address','company_postal_address','registration_address','carrier_address','passport_issuer',
            'vehicle_documents','vehicle_condition','vehicle_photos','actual_address','sout_conditions',
            'checklist_results','acknowledgment_documents','inventory_details','opticom_tariff_1','opticom_tariff_2',
            'cargo_description','cargo_additional','loading_address','route'}

def p(key):
    return '{{' + key + '}}'

EMPLOYEE_REFS = {
    'B2':'full_name','B3':'birth_date','C3':'birth_date','B4':'passport_series','B5':'passport_number',
    'B6':'passport_issuer','B7':'passport_date','C7':'passport_date','B8':'passport_code',
    'B9':'registration_address','B10':'short_name','B11':'snils','B12':'phone',
    'B13':'contract_number','B14':'contract_date','C14':'contract_date','B15':'valid_until','C15':'valid_until',
    'B16':'salary','B17':'employment_start_date','C2':'city','F2':'vehicle_plate',
    'F3':'vehicle_brand','G3':'vehicle_brand','F4':'vehicle_type','F5':'vehicle_year',
    'F6':'vehicle_sts_series','F7':'vehicle_sts_number','F8':'vehicle_vin','F9':'vehicle_chassis',
    'F10':'vehicle_body','F11':'vehicle_color','C13':'contract_year',
}
CARRIER_REFS = {
    'B2':'carrier_type','B3':'carrier_signer_name','B4':'carrier_name','B5':'company_name',
    'B6':'carrier_inn','B7':'carrier_ogrn','B8':'carrier_address','B9':'carrier_bank','B10':'carrier_bik',
    'B11':'carrier_correspondent_account','B12':'carrier_account','B13':'contract_date','B14':'contract_number',
    'B15':'payment_days','B17':'city','E2':'company_name','E3':'company_type','E4':'signer_name',
    'E5':'company_name','E6':'company_inn','E7':'company_ogrn','E8':'company_kpp','E9':'company_address',
    'E10':'company_bank','E11':'company_bik','E12':'company_correspondent_account','E13':'company_account',
    'E14':'company_name','E15':'company_postal_address',
}

def split_top(text, separator):
    """Split Excel concatenation/function arguments, respecting literals."""
    parts, start, depth, quoted, i = [], 0, 0, False, 0
    while i < len(text):
        ch = text[i]
        if ch == '"':
            if quoted and i + 1 < len(text) and text[i+1] == '"':
                i += 2
                continue
            quoted = not quoted
        elif not quoted:
            if ch == '(':
                depth += 1
            elif ch == ')':
                depth -= 1
            elif ch == separator and depth == 0:
                parts.append(text[start:i]); start = i+1
        i += 1
    parts.append(text[start:])
    return parts

def formula_text(expression, refs):
    """Small non-executing converter. Unknown expressions fail the import."""
    expression = expression.strip().lstrip('=').strip()
    parts = split_top(expression, '&')
    if len(parts) > 1:
        return ''.join(formula_text(part, refs) for part in parts)
    if expression.startswith('"') and expression.endswith('"'):
        return expression[1:-1].replace('""', '"')
    if re.fullmatch(r'CHAR\(10\)', expression, re.I):
        return '\n'
    ref = re.fullmatch(r"'?Данные'?!(\$?[A-Z]+\$?\d+)", expression)
    if ref:
        return p(refs[ref.group(1).replace('$','')])
    function = re.fullmatch(r'(TEXT|DATEVALUE|SKLON)\s*\((.*)\)', expression, re.I | re.S)
    if function:
        name, body = function.groups()
        args = split_top(body, ',')
        value = formula_text(args[0], refs)
        if name.upper() == 'TEXT':
            fmt = args[1].strip().strip('"')
            if fmt in ('dd','mmmm','yyyy'):
                return value[:-2] + '__' + fmt + '}}'
        return value
    raise ValueError('Unsupported source expression: ' + expression[:140])

def dates(text):
    return re.sub(r'«\{\{(\w+)__dd\}\}» \{\{\1__mmmm\}\} \{\{\1__yyyy\}\}',
                  lambda m:p(m.group(1)), text)

COMPANY_DETAILS = '''{{company_name}}
Адрес: {{company_address}}
ИНН / КПП: {{company_inn}} / {{company_kpp}}
ОГРН / ОГРНИП: {{company_ogrn}}
Расчётный счёт: {{company_account}}
Банк: {{company_bank}}
БИК: {{company_bik}}
Корреспондентский счёт: {{company_correspondent_account}}'''
CARRIER_DETAILS = '''Перевозчик: {{carrier_name}}
ИНН / КПП: {{carrier_inn}} / {{carrier_kpp}}
ОГРН / ОГРНИП: {{carrier_ogrn}}
Адрес: {{carrier_address}}
Расчётный счёт: {{carrier_account}}
Банк: {{carrier_bank}}
БИК: {{carrier_bik}}
Корреспондентский счёт: {{carrier_correspondent_account}}
Телефон: {{carrier_phone}}'''
SIGNER = '{{signer_title}} {{signer_name}} /________________/'

def company_sanitize(text):
    # Replace source party identity, never copy organisational account details.
    text = re.sub(r'(?:Общество с ограниченной ответственностью|ООО)\s*(?:«[^»]+»|"[^"]+"|\'\'[^\']+\'\')',
                  p('company_name'), text, flags=re.I)
    text = re.sub(r'Индивидуальный предприниматель\s+Палкин\w*\s+\w+\s+\w+',p('company_name'),text,flags=re.I)
    text = re.sub(r'ИП\s+Палкин\w*\s+\w+\s+\w+',p('company_name'),text,flags=re.I)
    text = re.sub(r'(?i)в лице (?:генерального директора|индивидуального предпринимателя)\s+[^,\n]+',
                  'представитель: '+p('signer_title')+' '+p('signer_name'),text)
    text = re.sub(r'действующ(?:его|ий) на основании (?:Устава|ОГРНИП)',
                  'основание полномочий: '+p('signer_basis'),text,flags=re.I)
    return text

def employee_override(sheet, cell, value):
    """Explicit identity/table migration; all other prose is retained verbatim."""
    if cell == 'D4' and sheet in ('Должностная инструкция ','Регламент','Регламент ЭДО'):
        return 'УТВЕРЖДАЮ\n{{company_name}}\n{{signer_title}} {{signer_name}}\n{{contract_date}} г.'
    requisite_cells = {'Трудовой договор':'A209','Акт приема-передачи':'A55','Мат. Ответственность ':'A79',
                        'О Конфиденциальности ':'A100','ЗП на 3-их лиц':'A22'}
    if requisite_cells.get(sheet) == cell:
        return 'РАБОТОДАТЕЛЬ\n\n' + COMPANY_DETAILS
    signatures = {'Трудовой договор':'A220','Акт приема-передачи':'A66','Мат. Ответственность ':'A90',
                  'О Конфиденциальности ':'A111','ЗП на 3-их лиц':'A23'}
    if signatures.get(sheet) == cell:
        return SIGNER
    if sheet.startswith('Договор Аренды'):
        if cell == 'A1': return 'ДОГОВОР АРЕНДЫ № {{contract_number}}'
        if cell == 'A97': return 'Арендодатель:\n\n'+COMPANY_DETAILS
        if cell == 'A106': return SIGNER
    if sheet.startswith('Доверенность '):
        replacements = {
          'A3':'Организация / индивидуальный предприниматель: {{company_name}},',
          'A4':'ИНН {{company_inn}}; КПП {{company_kpp}}; ОГРН / ОГРНИП {{company_ogrn}}',
          'A5':'Представитель: {{signer_title}} {{signer_name}}, основание полномочий: {{signer_basis}}. Настоящей доверенностью уполномочивает:',
          'A22':'Настоящая доверенность выдана сроком до {{valid_until}} включительно.',
          'A24':'Подпись доверенного лица: __________________ / {{full_name}} /',
          'A26':SIGNER,
        }
        if cell in replacements:return replacements[cell]
    if sheet.startswith('ГАИ и ТО'):
        replacements = {
          'A5':'Настоящая доверенность выдана {{contract_date}} г. со сроком действия до {{valid_until}} включительно.',
          'A8':'Доверитель: {{company_name}} (ИНН / КПП: {{company_inn}} / {{company_kpp}}, ОГРН / ОГРНИП: {{company_ogrn}}). Представитель: {{signer_title}} {{signer_name}}, основание полномочий: {{signer_basis}}. Уполномоченное лицо: {{full_name}}, гражданство: {{citizenship}}, паспорт серия {{passport_series}} № {{passport_number}}, выдан {{passport_issuer}}, {{passport_date}}, код подразделения {{passport_code}}. Полномочия: управлять (пользоваться) принадлежащей доверителю на праве собственности автомашиной: {{vehicle_brand}}.',
          'A17':'Модель двигателя: {{vehicle_engine_model}}','A18':'Двигатель №: {{vehicle_engine_number}}',
          'A30':'Подпись гражданина: __________________ / {{full_name}} /',
          'A33':'Владелец автомашины: {{vehicle_owner}}',
        }
        if cell in replacements:return replacements[cell]
    if sheet in ('Эл.Трудовая','Заявление ЗП'):
        if cell == 'D1': return 'Адресат: {{company_name}}\n{{signer_title}} {{signer_name}}\n{{company_address}}'
        if cell == 'A9': return 'Заявитель, водитель-экспедитор: {{full_name}}'
        if cell in ('A22','A36') and str(value).startswith('Дата:'):return 'Дата: {{contract_date}}'
    if sheet == 'Заявление ЗП':
        replacements = {'A18':'Получатель: {{payee_name}}','A22':'Номер счёта: {{payee_account}}',
          'A23':'Банк-получатель: {{payee_bank}}','A25':'БИК: {{payee_bik}}',
          'A26':'Корреспондентский счёт: {{payee_correspondent_account}}','A27':'ИНН банка: {{payee_bank_inn}}'}
        if cell in replacements:return replacements[cell]
    if sheet == 'ЗП на 3-их лиц':
        replacements = {'A6':'По заявлению Работника заработная плата перечисляется в безналичном порядке на счёт получателя {{payee_name}}.',
          'A9':'Номер счёта: {{payee_account}}','A10':'Банк-получатель: {{payee_bank}}',
          'A12':'БИК: {{payee_bik}}','A13':'Корреспондентский счёт: {{payee_correspondent_account}}',
          'A14':'ИНН банка: {{payee_bank_inn}}',
          'A17':'4. Настоящее Соглашение вступает в силу с {{agreement_start_date}} и действует до {{agreement_end_date}}.',
          'A25':'Один экземпляр дополнительного соглашения получил на руки: {{contract_date}} /________________/ {{short_name}}'}
        if cell in replacements:return replacements[cell]
    if sheet == 'Согласие':
        replacements = {
          'A5':'{{payee_name}} (фамилия, имя, отчество полностью), паспорт: серия {{payee_passport_series}} № {{payee_passport_number}}, выдан {{payee_passport_issuer}}, {{payee_passport_date}},\nнастоящим даю согласие на перечисление на мою банковскую карту, открытую в банке {{payee_bank}}.\nРеквизиты счёта банковской карты: {{payee_account}}, БИК {{payee_bik}}, корреспондентский счёт {{payee_correspondent_account}}.',
          'A6':'Денежные средства являются заработной платой и иными причитающимися выплатами штатного сотрудника:',
          'A7':'{{full_name}}','A8':'(фамилия, имя, отчество сотрудника), работающего в должности водителя в {{company_name}}.',
          'A13':'ФИО: {{payee_name}}','A15':'Дата: {{contract_date}}','D15':'Дата: {{contract_date}}'}
        if cell in replacements:return replacements[cell]
    if sheet == 'Акт приема-передачи':
        if cell == 'A6':
            return '{{company_name}}, представитель: {{signer_title}} {{signer_name}}, передало, а водитель-экспедитор {{full_name}} принял для выполнения трудовых обязанностей следующее транспортное средство и имущество.'
        fields = {'A15':'vehicle_category','A16':'vehicle_max_mass','A17':'vehicle_capacity',
                  'A19':'vehicle_refrigerator','A20':'vehicle_mileage','A21':'vehicle_fuel_level','A22':'vehicle_documents'}
        if cell in fields:return str(value)+': '+p(fields[cell])
        if cell == 'A28':return p('vehicle_condition')
        if cell == 'A33':return 'Фотофиксация: {{vehicle_photos}}'
        if cell == 'B47':return 'Иное и сведения по перечисленному имуществу:\n{{inventory_details}}'
    return None

def carrier_preamble(end):
    return ('{{company_name}}, именуемое в дальнейшем «Заказчик», представитель: {{signer_title}} {{signer_name}}, '
            'основание полномочий: {{signer_basis}}, с одной стороны, и {{carrier_name}}, '
            'именуемый в дальнейшем «Перевозчик», представитель: {{carrier_signer_name}}, '
            'основание полномочий: {{carrier_signer_basis}}, с другой стороны, совместно именуемые «Стороны», '+end)

def carrier_override(sheet, cell, value):
    if sheet == 'Договор' and cell == 'A1':return 'Договор перевозки груза автомобильным транспортом № {{contract_number}}'
    if sheet == 'Договор' and cell == 'A4':return carrier_preamble('заключили настоящий Договор о нижеследующем:')
    if sheet.startswith('Доп.Соглашение'):
        if cell == 'A1':return 'Дополнительное соглашение № {{supplement_number}}'
        if cell == 'F4':return 'от {{supplement_date}} г.'
        if cell == 'A6':return carrier_preamble('заключили настоящее Дополнительное соглашение о нижеследующем:')
    if str(value).startswith('=IF('):
        if '"Заказчик:"' in value:return 'Заказчик:\n\n'+COMPANY_DETAILS
        if '"Перевозчик:"' in value:return CARRIER_DETAILS
        if cell.startswith('A') and 'Генеральный директор' in value:return SIGNER
        if cell.startswith('E') and 'Индивидуальный предприниматель __' in value:
            return '{{carrier_signer_title}} __________________ / {{carrier_signer_name}} /'
    if sheet == 'Приложение №1':
        replacements = {
          'A3':'{{company_name}}',
          'D5':'{{company_postal_address}}\nПО ВОПРОСАМ ОПЛАТЫ ПОЗВОНИТЕ ЗАРАНЕЕ: {{company_phone}}',
          'C7':'ДОГОВОР-ЗАЯВКА № {{contract_number}} от {{contract_date}} г.\nна перевозку груза автотранспортом',
          'A9':carrier_preamble('заключили настоящий договор-заявку о нижеследующем:'),
          'A14':'Маршрут перевозки: {{route}}\nТемпературный режим: от {{temperature_min}} до {{temperature_max}}',
          'A17':'1 место (ПОГРУЗКА): дата {{loading_date}}, время {{loading_window}}\nАдрес погрузки: {{loading_address}}\nКонтактное лицо: {{loading_contact}}\nСпособ погрузки: {{loading_method}}\nГруз / параметры: {{cargo_description}}; вес, т: {{cargo_weight}}; объём, м³: {{cargo_volume}}\nДополнительно: {{cargo_additional}}',
          'E22':'Предоплата: {{transport_prepayment}}',
          'A23':'{{transport_price}}. Безналичный расчёт. НДС: {{vat_rate}}. Отсрочка {{payment_days}} б.д. По оригиналам договора-заявки, счёта, счёта-фактуры, акта сдачи услуг, ТрН / ТТН в двух экземплярах.',
          'A27':'Водитель: {{driver_name}}',
          'B28':'серия {{driver_licence_series}}, номер {{driver_licence_number}}',
          'D28':'Выдан: {{driver_licence_issuer}}','G28':'Дата выдачи: {{driver_licence_date}}',
          'A30':'Паспорт / документ, удостоверяющий личность',
          'B30':'серия {{driver_passport_series}}, номер {{driver_passport_number}}',
          'D30':'Выдан: {{driver_passport_issuer}}','G30':'Дата выдачи: {{driver_passport_date}}',
          'B32':'{{vehicle_brand}}','E32':'{{vehicle_plate}}','F32':'Госномер прицепа: {{trailer_plate}}',
          'B34':'{{vehicle_type}}','E34':'{{vehicle_capacity}} тонн','G34':'{{vehicle_volume}} м³',
          'A35':'Вид собственности фургона: {{vehicle_ownership}}','D35':'Собственник фургона: {{vehicle_owner}}',
          'A37':'Вид собственности прицепа: {{trailer_ownership}}','D37':'Собственник прицепа, ИНН: {{trailer_owner}}',
          'A51':'Заказчик:\n'+COMPANY_DETAILS+'\nПочтовый адрес: {{company_postal_address}}\nКонтактное лицо: {{company_contact}}\n'+SIGNER+'\nМ.П.',
          'E51':CARRIER_DETAILS+'\n{{carrier_signer_title}} __________________ / {{carrier_signer_name}} /\nМ.П.',
        }
        if cell in replacements:return replacements[cell]
    return None

EMPLOYEE_KEYS = ['employment-contract','driver-job-description','vehicle-lease','vehicle-lease-ip-variant',
    'vehicle-handover','personal-data-consent','material-responsibility','confidentiality','cargo-regulations',
    'onboarding-checklist','electronic-documents-regulations','acknowledgment-sheet','service-power-of-attorney',
    'service-power-of-attorney-ip-variant','traffic-power-of-attorney','traffic-power-of-attorney-ip-variant',
    'electronic-employment-record','salary-payment-application','third-party-salary-agreement',
    'third-party-salary-consent','military-registration-notice']
BASE_EMPLOYEE = {'employment-contract','driver-job-description','material-responsibility','confidentiality',
    'cargo-regulations','electronic-documents-regulations','personal-data-consent','acknowledgment-sheet'}
PROJECT_KEYS = ['appia','danone','alidi-ufa','ast','simple','vkusart','auchan-1','auchan-2','lamoda','alidi-moscow','abrau','bristol','hoff','opticom']

NEW_FORMS = {
  'Чек лист':'''ЧЕК-ЛИСТ ОФОРМЛЕНИЯ И ДОПУСКА ВОДИТЕЛЯ
№ {{contract_number}} от {{contract_date}}
Организация: {{company_name}}
Работник: {{full_name}}
Дата начала работы: {{employment_start_date}}

Для каждого пункта отметьте: проверено / требуется действие / не применяется, дату и ответственного.
1. Удостоверена личность, проверены паспортные данные и контакты.
2. Проверены водительское удостоверение, категории и срок действия.
3. Проверены документы об обязательных медицинских осмотрах и допуске.
4. Оформлены трудовой договор и необходимые кадровые документы.
5. Работник ознакомлен с должностной инструкцией и локальными актами.
6. Проведены необходимые инструктажи и обучение.
7. Оформлены полномочия, доступы и электронная подпись в применимых системах.
8. Переданы ТС, документы, оборудование и СИЗ по акту.
9. Проверена готовность к первому рейсу и назначен руководитель.

Результаты, замечания и незавершённые действия:
{{checklist_results}}

Ответственный: {{checklist_owner}} /________________/
Работник: {{short_name}} /________________/
''',
  'Лист ознакомления':'''ЛИСТ ОЗНАКОМЛЕНИЯ С ДОКУМЕНТАМИ
№ {{contract_number}} от {{contract_date}}
Организация: {{company_name}}
Работник: {{full_name}}

Укажите наименование каждого документа, дату / номер действующей редакции, дату ознакомления и подпись работника.
1. Должностная инструкция водителя-экспедитора.
2. Правила внутреннего трудового распорядка.
3. Положение об оплате труда и премировании.
4. Положение о разъездном характере работы.
5. Регламент работы с грузом и перевозочными документами.
6. Регламент электронного документооборота.
7. Правила охраны труда и безопасности дорожного движения.
8. Положение о конфиденциальности / коммерческой тайне.

Документы, редакции, даты и отметки ознакомления:
{{acknowledgment_documents}}

Дата фактического ознакомления и подписи: {{acknowledgment_date}}.
С перечисленными документами ознакомлен(а), экземпляры / доступ к текстам предоставлены.
Работник: {{short_name}} /________________/
Представитель работодателя: {{signer_title}} {{signer_name}} /________________/
''',
}

NOTES = {
 'employment-contract':'Исходные трудовые условия сохранены. До применения заполните результаты СОУТ и проверьте режим работы, оплату, испытание и условия допуска для конкретного работника.',
 'driver-job-description':'Категория должности и непосредственный руководитель перенесены в обязательные поля, поскольку исходник оставлял выбор.',
 'vehicle-lease':'Исходная аренда работником ТС работодателя, включая арендную плату 45 000 руб., сохранена. Это отдельное добровольно выбираемое соглашение; правовой смысл не изменён.',
 'vehicle-lease-ip-variant':'Вариант исходного листа «Плакин»; реквизиты ИП заменены параметрами. Условия аренды 45 000 руб. сохранены. Выбирайте только применимый вариант.',
 'vehicle-handover':'Условие исходника о штрафе 5 000 руб. за топливную карту сохранено без утверждения о его законности; до применения требуется правовая проверка. Заполните состояние ТС и перечень имущества.',
 'personal-data-consent':'Широкий объём исходного согласия, специальные категории данных и трансграничная передача сохранены. Требуется проверка целей, оснований и отдельных согласий для конкретного процесса.',
 'salary-payment-application':'Исходный лист «Заявление ЗП» содержит согласие на перечисление зарплаты третьему лицу. Заявитель и подписант — работник (full_name / short_name), банковские реквизиты payee_* относятся к получателю. Это не заявление на собственный счёт работника.',
 'third-party-salary-agreement':'Работник и получатель выплаты разделены: full_name / short_name — работник, payee_* — третье лицо. Исходные чужие банковские реквизиты и фиксированные даты заменены пустыми полями; договорные условия сохранены.',
 'third-party-salary-consent':'Согласие даёт и подписывает получатель зарплаты — payee_name; full_name обозначает работника. Паспорт payee_passport_* относится к получателю. Два субъекта и их подписи не объединены.',
 'military-registration-notice':'Срок 14 дней из исходника сохранён; проверьте актуальную обязанность и применимость к работнику до выдачи.',
 'carrier-contract':'Исходные бизнес-условия сохранены, включая право не оплачивать перевозку после задержки документов более 3 месяцев, штрафы и бумажные оригиналы. До применения необходима проверка этих условий и актуальности перевозочных правил / ЭПД. Номер документа унифицирован без добавления префикса ТК-.',
 'carrier-request':'Сохранены условия исходной заявки, включая штрафы, отсрочку и оригиналы документов. Исходные НДС 20% и фиксированная отсрочка заменены обязательными полями без значения по умолчанию. Заявка поддерживает ИП и ООО; реквизиты не берутся из кэша Excel. В исходнике нет отдельного блока выгрузки: необходимые сведения укажите в маршруте / дополнительных условиях.',
 'carrier-appia':'Сохранены исходные тарифы, включая неоднозначную границу 1551 кг, повтор зоны 4 и удержание стоимости оборудования без суммы. Согласуйте исправления до подписания.',
 'carrier-danone':'Сохранены исходные тарифы с пересечением границ 35 и 90 км. Согласуйте интервалы и округление до подписания.',
 'carrier-ast':'Сохранены исходные 10 включённых точек и доплата начиная с 10-й, а также два вида километровых доплат. Устраните неоднозначность до подписания.',
 'carrier-lamoda':'Сохранены исходные 7 включённых точек и доплата с 7-й; граница 200 км пересекается, второй рейс — «от 6500». Согласуйте применимые суммы до подписания.',
 'carrier-hoff':'Сохранён исходный текст о продуктах питания и внешнем договоре с грузоотправителем. Проверьте предмет и приложите согласованные требования проекта.',
 'carrier-opticom':'В исходнике суммы без НДС / с НДС арифметически не согласованы, а п.3 предусматривает начисление НДС сверх сумм. Тарифные поля обязательны и пусты: внесите согласованные ставки и налоговый режим. Исходные блоки ниже сохранены только для сверки редактором и не подставляются в документ автоматически.',
}

def build(books):
    templates, ledger = [], []
    specs = [(1, list(books[0].items())[3:], EMPLOYEE_KEYS),
             (2, list(books[1].items())[4:], ['carrier-contract','carrier-request']+['carrier-'+k for k in PROJECT_KEYS])]
    for book_number, sheets, keys in specs:
        assert len(sheets) == len(keys), (book_number,len(sheets),len(keys))
        for (sheet,cells), key in zip(sheets,keys):
            kind = 'employee' if book_number == 1 else 'carrier'
            source_advisories = []
            lines = OrderedDict()
            for c in cells:
                address, value = c['cell'], c['value']
                override = employee_override(sheet,address,value) if kind == 'employee' else carrier_override(sheet,address,value)
                method = 'override' if override is not None else 'formula' if c['type']=='f' else 'literal'
                text = override if override is not None else formula_text(value, EMPLOYEE_REFS if kind=='employee' else CARRIER_REFS) if c['type']=='f' else str(int(value)) if isinstance(value,float) and value.is_integer() else str(value)
                text = dates(text)
                if (sheet,address) in {('Должностная инструкция ','A141'),('Регламент','A310'),
                                       ('Регламент ЭДО','A71'),('О Конфиденциальности ','B117'),
                                       ('Трудовой договор','A229')}:
                    text = text.replace(p('contract_date'),p('acknowledgment_date')).rstrip('"')
                if kind == 'employee':
                    text = company_sanitize(text)
                    text = text.replace('{{company_name}} представитель:','{{company_name}}, представитель:')
                    if sheet.startswith('ГАИ и ТО') and address=='A23':
                        text = text.replace('принадлежащих {{company_name}} автомобилей','принадлежащих доверителю автомобилей')
                        text = text.replace('интересов {{company_name}}','интересов доверителя')
                    if sheet == 'Согласие ПДН' and address == 'A5':
                        text = re.sub(r'Оператор:\s*.*?\(далее – Оператор\)\.',
                                      'Оператор:\n{{company_name}}\nОГРН / ОГРНИП {{company_ogrn}}, ИНН {{company_inn}}, КПП {{company_kpp}}\nЮридический адрес: {{company_address}}\n(далее – Оператор).',text,flags=re.S)
                        text = re.sub(r'фактический адрес проживания \(если отличается\): [_\s]+,',
                                      'фактический адрес проживания (если отличается): {{actual_address}},',text)
                        text = re.sub(r'ИНН\s+_+', 'ИНН {{personal_inn}}',text)
                        text = re.sub(r'адрес электронной почты/мессенджеры:\s*_+',
                                      'адрес электронной почты/мессенджеры: {{personal_contacts}}',text)
                        text = re.sub(r'являющийся\(аяся\):.*?действуя свободно',
                                      'являющийся(аяся): {{subject_status}},\nдействуя свободно',text,flags=re.S)
                    if sheet == 'Трудовой договор' and address == 'A11':
                        text = text.replace('оптимальные/допустимые/вредные, класс (подкласс) 2, согласно карте специальной оценки условий труда № ___ от ___',p('sout_conditions'))
                    if sheet == 'Должностная инструкция ' and address == 'A9':
                        text = text.replace('рабочих/специалистов (определить по штатному расписанию)',p('employee_category'))
                        text = text.replace('логисту/руководителю транспортного отдела/иному лицу (выбрать или написать верное)',p('employee_supervisor'))
                if key == 'carrier-opticom' and address in ('B21','B22'):
                    field = 'opticom_tariff_'+('1' if address=='B21' else '2')
                    source_advisories.append('Исходник '+address+':\n'+text)
                    text = p(field)
                    method = 'editable-source-tariff'
                row = int(re.search(r'\d+',address).group())
                lines.setdefault(row,[]).append(text.strip())
                ledger.append({'book':book_number,'sheet':sheet,'cell':address,'method':method,
                               'sourceHash':hashlib.sha256(str(value).encode()).hexdigest()})
            # Join sentences split by print-page boundaries; move the source
            # page signature after the complete clause, retaining its text.
            continuation_rows = {'Согласие ПДН':(74,99),'Трудовой договор':(195,197)}
            pairs = [continuation_rows[sheet]] if sheet in continuation_rows else [(99,101),(127,147)] if sheet=='Договор' else []
            for first,following in pairs:
                lines[first][0] = lines[first][0].rstrip()+' '+lines[following][0].lstrip()
                del lines[following]
            # A multiline party block must not continue in another party's
            # final bank-account line. Short table rows retain their columns.
            text = NEW_FORMS[sheet].strip() if not cells else '\n\n'.join(
                ('\n\n' if any('\n' in part for part in parts) else ' | ').join(parts)
                for parts in lines.values())
            text = text.replace('гражданин Российской Федерации {{full_name}}','{{full_name}}, гражданство: {{citizenship}}')
            text = text.replace('гражданину РФ {{full_name}}','{{full_name}}, гражданство: {{citizenship}}')
            if kind == 'carrier' and key not in ('carrier-contract','carrier-request'):
                project = key.removeprefix('carrier-').replace('-','_')
                for base in ('supplement_number','supplement_date'):
                    specific = project+'_'+base
                    LABELS[specific] = LABELS[base]+' — '+sheet.removeprefix('Доп.Соглашение (').rstrip(')')
                    text = text.replace(p(base),p(specific))
            # All private identity records are substituted before the catalog is written.
            assert not re.search(r'\d{9,}',text), (sheet,'unparameterized identity number')
            assert not re.search(r'SKLON|DUMMYFUNCTION|VLOOKUP|DATEVALUE|__[a-z]+\}\}',text), (sheet,'unconverted formula')
            ids = list(dict.fromkeys(re.findall(r'\{\{([a-zA-Z][a-zA-Z0-9_-]*)\}\}',text)))
            fields=[]
            for field_id in ids:
                if field_id in RESERVED:continue
                assert field_id in LABELS,(sheet,field_id)
                field={'id':field_id,'label':LABELS[field_id],
                       'type':'date' if field_id.endswith('_date') or field_id=='valid_until' else 'tel' if field_id.endswith('phone') or field_id=='phone' else 'textarea' if field_id in TEXTAREA else 'text',
                       'required':field_id not in OPTIONAL}
                fields.append(field)
            assert len(fields)<=80,(sheet,len(fields))
            default_selected = key in BASE_EMPLOYEE or key == 'carrier-contract'
            category = 'base' if default_selected else 'project' if kind=='carrier' and key!='carrier-request' else 'optional'
            notes = NOTES.get(key,'Исходный текст перенесён полностью; персональные данные и реквизиты заменены полями. Условия требуют проверки перед подписанием.')
            if not cells:notes='Исходный лист пуст. Создана новая простая форма для заполнения; это не текст исходного документа.'
            if source_advisories:notes+='\n\n'+'\n\n'.join(source_advisories)
            template={'key':key,'name':sheet.strip(),'kind':kind,'employmentType':'employee' if kind=='employee' else 'any',
                      'category':category,'defaultSelected':default_selected,'text':text,'fields':fields,
                      'source':{'file':'Оформление ТК.xlsx' if book_number==1 else 'Перевозчиков Оформление .xlsx','sheet':sheet},'notes':notes}
            if key=='salary-payment-application':template['name']='Заявление ЗП (третьему лицу)'
            templates.append(template)
    return {'schemaVersion':1,'templates':templates},ledger

def load_sources(args):
    if args.dumps:
        return [json.loads((Path(args.dumps)/f'book{i}.json').read_text()) for i in (1,2)]
    import openpyxl
    books=[]
    for path in (args.employee,args.carrier):
        workbook=openpyxl.load_workbook(path,data_only=False)
        book={}
        for sheet in workbook:
            book[sheet.title]=[{'cell':c.coordinate,'value':getattr(c.value,'text',c.value),'type':c.data_type}
                               for row in sheet for c in row if c.value is not None]
        books.append(book)
    return books

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dumps',help='Directory with read-only book1.json / book2.json dumps')
    parser.add_argument('--employee',default='/Users/victor/Downloads/Оформление ТК.xlsx')
    parser.add_argument('--carrier',default='/Users/victor/Downloads/Перевозчиков Оформление .xlsx')
    parser.add_argument('--output',type=Path,default=OUTPUT)
    args=parser.parse_args()
    catalog,ledger=build(load_sources(args))
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps(catalog,ensure_ascii=False,indent=2)+'\n')
    (Path(__file__).parent/'source-coverage.json').write_text(json.dumps({'schemaVersion':1,'cells':ledger},ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'templates':len(catalog['templates']),'sourceCells':len(ledger),'characters':sum(len(t['text']) for t in catalog['templates']),'output':str(args.output)},ensure_ascii=False))

if __name__=='__main__':main()
