#!/usr/bin/env python3
"""Catalog contract, content-integrity, and private-data migration checks."""
import copy
import importlib.util
import json
import os
import re
import unittest
from pathlib import Path

HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('catalog_import',HERE/'import_catalog.py')
importer=importlib.util.module_from_spec(spec)
spec.loader.exec_module(importer)
CATALOG=json.loads(importer.OUTPUT.read_text())
BY_KEY={t['key']:t for t in CATALOG['templates']}

class CatalogTests(unittest.TestCase):
    def test_complete_library_and_selection(self):
        self.assertEqual(CATALOG['schemaVersion'],1)
        self.assertEqual(len(BY_KEY),37)
        employee=[t for t in BY_KEY.values() if t['kind']=='employee']
        carrier=[t for t in BY_KEY.values() if t['kind']=='carrier']
        self.assertEqual(len(employee),21)
        self.assertEqual(len(carrier),16)
        self.assertEqual(sum(t['category']=='project' for t in carrier),14)
        self.assertEqual({t['key'] for t in employee if t['defaultSelected']},importer.BASE_EMPLOYEE)
        self.assertEqual({t['key'] for t in carrier if t['defaultSelected']},{'carrier-contract'})
        self.assertEqual(BY_KEY['carrier-request']['category'],'optional')
        self.assertEqual(BY_KEY['vehicle-handover']['category'],'optional')
        for key in ('onboarding-checklist','acknowledgment-sheet'):
            self.assertIn('Исходный лист пуст',BY_KEY[key]['notes'])
            self.assertGreater(len(BY_KEY[key]['text']),800)

    def test_application_schema_and_render(self):
        id_pattern=re.compile(r'^[a-zA-Z][a-zA-Z0-9_-]{0,79}$')
        for t in BY_KEY.values():
            with self.subTest(template=t['key']):
                self.assertRegex(t['key'],r'^[a-z][a-z0-9_-]{0,99}$')
                self.assertLessEqual(len(t['name']),160)
                self.assertIn(t['employmentType'],('employee','any'))
                self.assertLessEqual(len(t['text']),100000)
                fields={f['id']:f for f in t['fields']}
                self.assertEqual(len(fields),len(t['fields']))
                self.assertLessEqual(len(fields),80)
                found=set(re.findall(r'\{\{([a-zA-Z][a-zA-Z0-9_-]*)\}\}',t['text']))
                self.assertEqual(set(fields),found-importer.RESERVED)
                for f in fields.values():
                    self.assertRegex(f['id'],id_pattern)
                    self.assertNotIn(f['id'],importer.RESERVED|{'__proto__','constructor','prototype'})
                    self.assertIn(f['type'],('text','textarea','date','tel'))
                    self.assertIsInstance(f['required'],bool)
                    self.assertLessEqual(len(f['label']),160)
                    if f['type']=='date':self.assertNotIn('defaultValue',f)
                    if 'defaultValue' in f:
                        self.assertTrue(f['id'].startswith('opticom_tariff_'))
                        self.assertLessEqual(len(f['defaultValue']),8000)
                rendered=re.sub(r'\{\{(\w+)\}\}',lambda m: fields.get(m[1],{}).get('defaultValue','TEST'),t['text'])
                self.assertNotIn('{{',rendered)
                self.assertNotIn('}}',rendered)
                self.assertGreater(len(rendered),300)

    def test_no_excel_engine_or_private_identity_values(self):
        texts='\n'.join(t['text']+'\n'+'\n'.join(str(f.get('defaultValue','')) for f in t['fields']) for t in BY_KEY.values())
        self.assertNotRegex(texts,r'\d{9,}')
        self.assertNotRegex(texts,r'SKLON|DUMMYFUNCTION|VLOOKUP|DATEVALUE|#REF!|#NAME\?|__[a-z]+\}\}')
        self.assertNotRegex(texts,r'(?i)Анохин|Палкин|СЕВЕРНАЯ СТОЛИЦА|Обводного канала')
        self.assertNotIn('31.12.2026',texts)

    def test_substantive_clauses_and_tariff_matrix_survive(self):
        self.assertIn('1.7. Настоящий договор заключен на неопределенный срок.',BY_KEY['employment-contract']['text'])
        self.assertIn('11.4.',BY_KEY['employment-contract']['text'])
        self.assertIn('45 000 (сорок пять тысяч)',BY_KEY['vehicle-lease']['text'])
        self.assertIn('штраф 5 000 руб.',BY_KEY['vehicle-handover']['text'])
        self.assertIn('передало, а водитель-экспедитор',BY_KEY['vehicle-handover']['text'])
        self.assertIn('безусловное право не оплачивать перевозку',BY_KEY['carrier-contract']['text'])
        self.assertIn('5.18.',BY_KEY['carrier-contract']['text'])
        self.assertIn('Александров | 13300 | 14800 | 14800 | 16300 | 18500 | 20000',BY_KEY['carrier-abrau']['text'])
        self.assertIn('доп. Точка свыше 5 | 1050 | 1050 | 1050 | 1050 | 1050 | 1050',BY_KEY['carrier-abrau']['text'])
        self.assertIn('1551',BY_KEY['carrier-appia']['text'])
        self.assertIn('Доплата за 7-ю',BY_KEY['carrier-lamoda']['text'])
        self.assertIn('24 руб./ км',BY_KEY['carrier-opticom']['text'])
        tariffs={f['id']:f.get('defaultValue','') for f in BY_KEY['carrier-opticom']['fields']}
        self.assertEqual(tariffs['opticom_tariff_1'],'')
        self.assertEqual(tariffs['opticom_tariff_2'],'')
        self.assertIn('12 690 без НДС / 15 000 с НДС',BY_KEY['carrier-opticom']['notes'])
        self.assertIn('12 часов работы, 12 точек выгрузки',BY_KEY['carrier-opticom']['notes'])
        self.assertIn('{{vat_rate}}',BY_KEY['carrier-request']['text'])
        self.assertNotIn('НДС (20%)',BY_KEY['carrier-request']['text'])
        self.assertGreater(len(BY_KEY['cargo-regulations']['text']),24000)
        self.assertGreater(len(BY_KEY['driver-job-description']['text']),11000)

    def test_joint_package_fields_keep_project_numbers_distinct(self):
        projects=[t for t in BY_KEY.values() if t['category']=='project']
        numbers=[]
        for t in projects:
            ids=[f['id'] for f in t['fields']]
            numbers.extend(i for i in ids if i.endswith('_supplement_number'))
            self.assertNotIn('supplement_number',ids)
            self.assertNotIn('supplement_date',ids)
            self.assertNotIn('{{carrier_type}} {{carrier_name}}',t['text'])
            self.assertIn('carrier_signer_title',ids)
        self.assertEqual(len(set(numbers)),14)
        for t in BY_KEY.values():
            for f in t['fields']:
                if f['id'] in ('passport_series','passport_code'):
                    self.assertFalse(f['required'])
        self.assertIn('citizenship',{f['id'] for f in BY_KEY['employment-contract']['fields']})
        self.assertIn('acknowledgment_date',{f['id'] for f in BY_KEY['acknowledgment-sheet']['fields']})
        salary=BY_KEY['salary-payment-application']
        self.assertIn('третьему лицу',salary['name'])
        self.assertIn('Заявитель, водитель-экспедитор: {{full_name}}',salary['text'])
        self.assertIn('Получатель: {{payee_name}}',salary['text'])
        self.assertIn('Номер счёта: {{payee_account}}',salary['text'])
        self.assertIn('/ {{short_name}} /',salary['text'])
        consent=BY_KEY['third-party-salary-consent']['text']
        self.assertIn('{{payee_name}} (фамилия, имя, отчество полностью), паспорт: серия {{payee_passport_series}}',consent)
        self.assertIn('ФИО: {{payee_name}} | ФИО: {{full_name}}',consent)
        self.assertIn('безопасности дорожного движения и охраны труда, без раскрытия диагнозов',BY_KEY['personal-data-consent']['text'])
        self.assertNotIn('{{company_correspondent_account}} | РАБОТНИК',BY_KEY['employment-contract']['text'])
        self.assertNotIn('{{company_correspondent_account}} | Перевозчик',BY_KEY['carrier-contract']['text'])
        self.assertNotIn('Паспорт РФ',BY_KEY['carrier-request']['text'])
        for key in ('driver-job-description','cargo-regulations','electronic-documents-regulations','confidentiality','employment-contract'):
            self.assertIn('acknowledgment_date',{f['id'] for f in BY_KEY[key]['fields']})

    def test_source_cell_accounting(self):
        ledger=json.loads((HERE/'source-coverage.json').read_text())['cells']
        self.assertEqual(len(ledger),1014)
        identities={(c['book'],c['sheet'],c['cell']) for c in ledger}
        self.assertEqual(len(identities),len(ledger))
        self.assertEqual(len({(c['book'],c['sheet']) for c in ledger}),35)
        self.assertTrue(all(re.fullmatch('[a-f0-9]{64}',c['sourceHash']) for c in ledger))

    def test_reproducible_and_independent_of_caches_and_registers(self):
        dumps=Path(os.getenv('CONTRACT_SOURCE_DUMPS','/tmp/xlsx-expert-20260928'))
        if not (dumps/'book1.json').exists():self.skipTest('Original workbook dumps are not available')
        books=[json.loads((dumps/f'book{i}.json').read_text()) for i in (1,2)]
        expected,_=importer.build(books)
        self.assertEqual(expected,CATALOG)
        poisoned=copy.deepcopy(books)
        for i,book in enumerate(poisoned):
            for position,(sheet,cells) in enumerate(book.items()):
                for c in cells:
                    c['cached']='DO NOT COPY CACHED PRIVATE DATA'
                    if position<(3 if i==0 else 4):c['value']='DO NOT COPY REGISTER PRIVATE DATA'
        actual,_=importer.build(poisoned)
        self.assertEqual(expected,actual)
        for book_no,book in enumerate(books):
            registry=book['Оформление ТК' if book_no==0 else 'Перевозчики']
            name_column='A' if book_no==0 else 'B'
            corpus='\n'.join(t['text'] for t in CATALOG['templates'])
            for cell in registry:
                if re.fullmatch(name_column+r'\d+',cell['cell']) and cell['cell']!=name_column+'1':
                    value=str(cell['value']).strip()
                    if len(value)>10:self.assertNotIn(value,corpus)

if __name__=='__main__':unittest.main()
