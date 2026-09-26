"use strict";
const builtins = require('./planning-builtins.json');

// Both client forms and row-specific fields use the same finite source catalog.
const SOURCES = new Set(['manual', 'trip_count', 'driver_address', 'driver_registration_address', 'driver_snils',
  'vehicle_brand', 'vehicle_registration_certificate', ...builtins.flatMap(template => template.sections.flatMap(section => section.columns.map(column => column.source)))]);
const VEHICLE_SOURCES = new Set(['pallet_capacity', 'tonnage', 'tail_lift', 'trailer_plate', 'volume_m3', 'actual_volume_m3',
  'tracker_imei', 'city_center_pass', 'ttk_entry_code', 'mkad_entry_code', 'cargo_rail',
  'priority_vehicle_code', 'owner_or_forwarder', 'actual_carrier', 'resource']);
function sourceOwner(source) {
  if (/^(driver_|document_|medical_book_)/.test(source) || source === 'client_driver_id') return 'driver';
  if (/^(vehicle_|payload|body|ownership|tray_)/.test(source) || VEHICLE_SOURCES.has(source)) return 'vehicle';
  return 'assignment';
}
module.exports = { SOURCES, sourceOwner };
