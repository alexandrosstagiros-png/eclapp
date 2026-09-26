'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { driverOption, vehicleOption } = require('../recovered/apps/api/src/modules/planning/planning-catalog');
const { csvRows, records, matchRecords, plateKey, isoDate, payloadKg, volumeM3, resourceId } = require('../integrations/planning-catalog/import-local.cjs');

test('planning data exposes allowed owner fields and current profile contact without raw importer metadata', () => {
  const result = driverOption({ id: 'driver', name: 'Тестов Тест Тестович', phone: '+70000000001', sourceRow: 9,
    planningData: { driver_passport: 'SYNTHETIC DOCUMENT', driver_phone: '+70000000002', vehicle_plate: 'WRONG OWNER', secret: 'HIDDEN', driver_address: 'x'.repeat(2001) } });
  assert.equal(result.planningData.driver_passport_full, 'SYNTHETIC DOCUMENT');
  assert.equal(result.planningData.driver_phone, '+70000000001');
  assert.equal(result.planningData.vehicle_plate, undefined);
  assert.equal(result.planningData.secret, undefined);
  assert.equal(result.planningData.driver_address, undefined);
  assert.equal(result.sourceRow, undefined);
  const vehicle = vehicleOption({ id: 'vehicle', label: 'Display label', registration: 'А001АА77', capacityKg: 1500,
    planningData: { driver_passport: 'HIDDEN', vehicle_brand: 'Test brand' } });
  assert.equal(vehicle.planningData.vehicle_plate, 'А001АА77');
  assert.equal(vehicle.planningData.vehicle_model, 'Test brand');
  assert.equal(vehicle.planningData.tonnage, '1.5');
  assert.equal(vehicle.planningData.driver_passport, undefined);
});
test('CSV handles multiline quoted documents and rejects malformed input', () => {
  assert.deepEqual(csvRows('\uFEFFФИО,Паспорт\r\nТест,"серия, номер\nвыдан ""тест"""\r\n'), [['ФИО','Паспорт'],['Тест','серия, номер\nвыдан "тест"']]);
  assert.throws(() => csvRows('a,"broken'), /кавычки/);
  assert.throws(() => csvRows('a,"value"x'), /кавычки/);
  const source = records('фио,Паспорт,Адрес проживания,Тел.Водителя,Адрес Регистрации,Дата Рождения\nТестов Тест Тестович,"SYNTHETIC, passport",Проживание,+70000000001,Регистрация,29.02.2024\n', 'driver');
  assert.equal(source[0].data.driver_passport_full, 'SYNTHETIC, passport');
  assert.equal(source[0].data.driver_registration_address, 'Регистрация');
  assert.equal(source[0].data.driver_birth_date, '2024-02-29');
  assert.equal(source[0].data.document_number, undefined);
  assert.equal(isoDate('29.02.2023'), '');
  assert.equal(payloadKg('1,5 т'), '1500');
  assert.equal(payloadKg('1,5 т.'), '1500');
  assert.equal(payloadKg('1500 кг'), '1500');
  assert.equal(payloadKg('1500'), '', 'No inferred unit from an unlabelled number');
  assert.equal(volumeM3('20 к/м3'), '20');
  assert.equal(volumeM3('20 неизвестно'), '');
});
test('identity matches require unique full names or exact plates, skip ambiguity and conflicting contacts', () => {
  const source = [{ key: 'тестов тест тестович', sourceRow: 2, data: { driver_phone: '+70000000001' } }];
  assert.equal(matchRecords(source, [{ id: 'a', name: 'Тестов  Тест Тестович' }], 'driver').matched.length, 1);
  assert.equal(matchRecords(source, [{ id: 'a', name: 'Тестов Тест Тестович', phone: '+70000000002' }], 'driver').summary.contactConflicts, 1);
  assert.equal(matchRecords([...source, { ...source[0], sourceRow: 3 }], [{ id: 'a', name: 'Тестов Тест Тестович' }], 'driver').summary.ambiguous, 2);
  assert.equal(matchRecords(source, [{ id: 'a', name: 'Тестов Тест Тестович' }, { id: 'b', name: 'Тестов Тест Тестович' }], 'driver').matched.length, 0);
  assert.equal(plateKey('А 001 АА-77'), plateKey('A001AA77'));
  assert.equal(plateKey('Автомобиль A001AA77'), '');
  assert.equal(matchRecords([{ key: plateKey('А001АА77'), sourceRow: 2, data: {} }], [{ id: 'same', label: 'А001АА77' }, { id: 'same', label: 'Some vehicle', registration: 'A001AA77' }], 'vehicle').matched.length, 1);
  assert.equal(resourceId('EEEEEEEE-EEEE-4EEE-8EEE-EEEEEEEEEEEE', 'driver', 'name'), resourceId('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'driver', 'name'));
});
