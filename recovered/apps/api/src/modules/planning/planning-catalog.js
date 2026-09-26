'use strict';
const { SOURCES, sourceOwner } = require('./planning-sources');

function planningData(raw, owner) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return Object.fromEntries(Object.entries(raw).filter(([key, value]) =>
    SOURCES.has(key) && sourceOwner(key) === owner && typeof value === 'string' && value.length <= 2000 && value.trim()));
}
function driverOption(row) {
  const data = planningData(row.planningData, 'driver');
  if (typeof row.phone === 'string' && row.phone.trim()) data.driver_phone = row.phone.trim();
  data.driver_name = row.name;
  data.driver_surname = row.name.trim().split(/\s+/)[0];
  if (data.driver_passport && !data.driver_passport_full) data.driver_passport_full = data.driver_passport;
  if (data.driver_license && !data.driver_license_full) data.driver_license_full = data.driver_license;
  data.driver_name_inn_phone = [row.name, data.driver_inn, data.driver_phone].filter(Boolean).join(', ');
  return { id: row.id, name: row.name, planningData: data };
}
function vehicleOption(row) {
  const data = planningData(row.planningData, 'vehicle');
  if (row.registration) data.vehicle_plate = row.registration;
  if (!data.vehicle_plate) data.vehicle_plate = row.label;
  if (!data.vehicle_model && data.vehicle_brand) data.vehicle_model = data.vehicle_brand;
  if (!data.payload_kg && Number.isFinite(row.capacityKg)) data.payload_kg = String(row.capacityKg);
  if (!data.tonnage && data.payload_kg && Number.isFinite(Number(data.payload_kg))) data.tonnage = String(Number(data.payload_kg) / 1000);
  if (!data.vehicle_body_type && row.bodyType) data.vehicle_body_type = ({ refrigerated: 'Рефрижератор', box: 'Фургон' })[row.bodyType] || row.bodyType;
  const { planningData: _data, ...option } = row;
  return { ...option, planningData: data };
}
module.exports = { planningData, driverOption, vehicleOption };
