'use strict';

function fail(message) {
  const error = new Error(message);
  error.code = 'FINANCE_COMPANY_INVALID';
  error.status = 400;
  throw error;
}
function text(value, label, limit) {
  if (value === null || value === undefined) return null;
  if (
    typeof value !== 'string' ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)
  )
    fail(`Проверьте поле «${label}».`);
  const result = value.replace(/\s+/gu, ' ').trim();
  if (result.length > limit) fail(`Поле «${label}» слишком длинное.`);
  return result || null;
}
function digits(value, label) {
  const result = text(value, label, 80)?.replace(/\s/gu, '') || null;
  if (result && !/^\d+$/.test(result))
    fail(`Поле «${label}» должно содержать только цифры.`);
  return result;
}
function validateCompanyInput(body, previous = null) {
  if (!body || typeof body !== 'object' || Array.isArray(body))
    fail('Ожидаются реквизиты организации.');
  const value = { ...previous, ...body };
  const result = {
    name: text(value.name, 'Название', 300),
    organizationKind: text(value.organizationKind, 'Вид организации', 30),
    inn: digits(value.inn, 'ИНН'),
    kpp: digits(value.kpp, 'КПП'),
    ogrn: digits(value.ogrn, 'ОГРН / ОГРНИП'),
    fullName: text(value.fullName, 'Полное наименование', 1000),
    address: text(value.address, 'Адрес', 2000),
  };
  if (!result.name) fail('Укажите название собственной организации.');
  if (!previous && (!result.organizationKind || !result.inn))
    fail('Для новой организации укажите вид и ИНН.');
  if (previous?.inn && !result.inn)
    fail('Указанный ИНН нельзя очистить. Исправьте реквизиты организации.');
  if (
    result.organizationKind &&
    !['legal_entity', 'sole_proprietor'].includes(result.organizationKind)
  )
    fail('Выберите юридическое лицо или ИП.');
  if (!result.organizationKind && (result.inn || result.kpp || result.ogrn))
    fail('Укажите вид организации для проверки формата реквизитов.');
  const proprietor = result.organizationKind === 'sole_proprietor';
  if (result.inn && result.inn.length !== (proprietor ? 12 : 10))
    fail(`ИНН должен содержать ${proprietor ? 12 : 10} цифр.`);
  if (result.inn && /^0+$/.test(result.inn))
    fail('ИНН не может состоять только из нулей.');
  if (result.kpp && (proprietor || result.kpp.length !== 9))
    fail(
      proprietor
        ? 'У ИП нет КПП. Оставьте это поле пустым.'
        : 'КПП должен содержать 9 цифр.',
    );
  if (result.ogrn && result.ogrn.length !== (proprietor ? 15 : 13))
    fail(
      `${proprietor ? 'ОГРНИП' : 'ОГРН'} должен содержать ${proprietor ? 15 : 13} цифр.`,
    );
  // These are format checks. No tax registry lookup or registration claim occurs.
  return result;
}

module.exports = { validateCompanyInput };
