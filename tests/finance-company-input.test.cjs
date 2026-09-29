'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validateCompanyInput,
} = require('../recovered/apps/api/src/modules/finance/domain/finance-company-input');

test('own-company details distinguish legal entities and sole proprietors without claiming registry verification', () => {
  const company = validateCompanyInput({
    name: '  ООО  Транспорт\nСевер ',
    organizationKind: 'legal_entity',
    inn: '7701 234567',
    kpp: '770101001',
    ogrn: '1234567890123',
    address: ' Москва\n ул. Первая, 1 ',
    unexpected: true,
  });
  assert.equal(company.name, 'ООО Транспорт Север');
  assert.equal(company.inn, '7701234567');
  assert.equal(company.address, 'Москва ул. Первая, 1');
  assert.equal(company.unexpected, undefined);
  assert.equal(company.registryVerified, undefined);
  const person = validateCompanyInput({
    name: 'ИП Иванов',
    organizationKind: 'sole_proprietor',
    inn: '770123456789',
    kpp: ' ',
    ogrn: '123456789012345',
  });
  assert.equal(person.kpp, null);
  assert.throws(
    () => validateCompanyInput({ ...person, kpp: '770101001' }),
    /У ИП нет КПП/,
  );
  assert.throws(
    () => validateCompanyInput({ ...company, inn: '770123456789' }),
    /10 цифр/,
  );
  assert.throws(
    () => validateCompanyInput({ ...person, ogrn: '1234567890123' }),
    /15 цифр/,
  );
  assert.throws(
    () => validateCompanyInput({ ...company, inn: '0000000000' }),
    /нулей/,
  );
  assert.throws(
    () => validateCompanyInput({ inn: '' }, company),
    /нельзя очистить/,
  );
});

test('legacy names can be edited without fabricating tax details; new companies require them', () => {
  const previous = {
    name: 'Ранее созданная организация',
    organizationKind: null,
    inn: null,
    kpp: null,
    ogrn: null,
    fullName: null,
    address: null,
  };
  assert.deepEqual(
    validateCompanyInput({ name: 'Уточненное название' }, previous),
    { ...previous, name: 'Уточненное название' },
  );
  assert.throws(() => validateCompanyInput({ name: 'Новая' }), /вид и ИНН/);
  assert.throws(
    () =>
      validateCompanyInput({
        name: 'Новая',
        organizationKind: 'legal_entity',
        inn: '123abc4567',
      }),
    /только цифры/,
  );
  assert.throws(
    () => validateCompanyInput({ inn: '1234567890' }, previous),
    /вид организации/,
  );
  assert.throws(
    () => validateCompanyInput({ ...previous, name: '\u0000' }, previous),
    /Проверьте поле/,
  );
});
