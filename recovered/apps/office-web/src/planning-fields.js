import { PLANNING_TEMPLATES } from './planning-templates.js';

const vehicleSources = new Set([
  'pallet_capacity', 'tonnage', 'tail_lift', 'trailer_plate', 'volume_m3', 'actual_volume_m3',
  'tracker_imei', 'city_center_pass', 'ttk_entry_code', 'mkad_entry_code', 'cargo_rail',
  'priority_vehicle_code', 'owner_or_forwarder', 'actual_carrier', 'resource',
]);
export function sourceOwner(source) {
  if (/^(driver_|document_|medical_book_)/.test(source) || source === 'client_driver_id') return 'driver';
  if (/^(vehicle_|payload|body|ownership|tray_)/.test(source) || vehicleSources.has(source)) return 'vehicle';
  return 'assignment';
}
export function columnOwner(column) {
  return column.source === 'manual' ? column.owner || 'assignment' : sourceOwner(column.source);
}
const automatic = {
  sequence: ['Номер строки', 'number'], planning_date: ['Дата плана', 'date'],
  loading_date: ['Дата погрузки — из даты плана', 'date'], arrival_date: ['Дата подачи — из даты плана', 'date'],
  driver_name: ['ФИО водителя', 'text'], driver_surname: ['Фамилия водителя', 'text'],
  driver_phone: ['Телефон водителя', 'text'], driver_passport: ['Паспортные данные водителя', 'text'],
  driver_passport_full: ['Паспортные данные полностью', 'text'], driver_birth_date: ['Дата рождения водителя', 'date'],
  driver_address: ['Адрес проживания водителя', 'text'], driver_registration_address: ['Адрес регистрации водителя', 'text'],
  driver_license: ['Водительское удостоверение', 'text'], driver_license_full: ['Водительское удостоверение полностью', 'text'],
  driver_inn: ['ИНН водителя', 'text'], driver_snils: ['СНИЛС водителя', 'text'],
  driver_name_inn_phone: ['ФИО, ИНН и телефон водителя', 'text'],
  vehicle_plate: ['Машина — обозначение из справочника', 'text'],
  vehicle_brand: ['Марка транспортного средства', 'text'], vehicle_model: ['Марка / модель транспортного средства', 'text'],
  vehicle_registration_certificate: ['Свидетельство о регистрации ТС', 'text'],
  arrival_time: ['Время подачи — из времени выхода', 'time'], loading_time: ['Время погрузки — из времени выхода', 'time'],
  payload_kg: ['Грузоподъёмность, кг', 'number'], tonnage: ['Грузоподъёмность, тонн', 'number'],
  pallet_capacity: ['Паллетность транспортного средства', 'number'], volume_m3: ['Объём кузова, м³', 'number'],
  payload_capacity: ['Грузоподъёмность — значение из справочника', 'text'], ownership_type: ['Тип владения ТС', 'text'],
  actual_carrier: ['Транспортная компания', 'text'], vehicle_condition_notes: ['Сведения о состоянии ТС', 'text'],
  vehicle_body_type: ['Тип кузова', 'text'], comment: ['Комментарий назначения', 'text'],
  trip_count: ['Количество рейсов', 'number'],
};
const known = new Map();
for (const template of PLANNING_TEMPLATES) for (const section of template.sections) for (const column of section.columns) {
  if (!known.has(column.source)) known.set(column.source, column);
}
export const FIELD_SOURCES = [
  { value: 'manual', label: 'Ручное поле', owner: 'assignment', type: 'text' },
  ...Object.entries(automatic).map(([value, [label, type]]) => ({ value, label, type, owner: sourceOwner(value) })),
  ...[...known].filter(([source]) => !automatic[source]).map(([value, column]) => ({
    value, label: `Ручной ввод: ${column.label.replace(/\s+/g, ' ')}`, owner: sourceOwner(value), type: column.type || 'text',
  })).sort((a, b) => a.label.localeCompare(b.label, 'ru')),
];
