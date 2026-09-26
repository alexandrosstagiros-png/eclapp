// SPDX-License-Identifier: MIT
"use strict";
const { BadRequestException } = require("@nestjs/common");
const KINDS = Object.freeze([
  "vehicles",
  "contractors",
  "parts",
  "warehouses",
  "orders",
  "maintenance",
  "purchases",
  "fuel",
  "assignments",
  "driverReports",
]);
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fail = (message) => {
  throw new BadRequestException({
    code: "FLEET_VALIDATION",
    message: message || "Проверьте поля документа.",
  });
};
function object(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail();
  return value;
}
function text(value, name, max = 1000, required = false) {
  if (value == null) value = "";
  if (
    typeof value !== "string" ||
    value.length > max ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)
  )
    fail(`Некорректное поле «${name}».`);
  const result = value.trim();
  if (required && !result) fail(`Заполните поле «${name}».`);
  return result;
}
function uuid(value, name = "идентификатор", nullable = false) {
  if (nullable && (value == null || value === "")) return null;
  if (typeof value !== "string" || !UUID.test(value))
    fail(`Некорректное поле «${name}».`);
  return value.toLowerCase();
}
function number(value, name, min = 0, max = 1e9, nullable = false) {
  if (nullable && (value == null || value === "")) return null;
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  )
    fail(`Некорректное поле «${name}».`);
  return value;
}
function integer(value, name, min = 0, max = 1e12, nullable = false) {
  const n = number(value, name, min, max, nullable);
  if (n !== null && !Number.isSafeInteger(n))
    fail(`Поле «${name}» должно быть целым числом.`);
  return n;
}
function date(value, name, nullable = false) {
  if (nullable && (value == null || value === "")) return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    fail(`Укажите дату в поле «${name}».`);
  const d = new Date(value + "T00:00:00Z");
  if (
    !Number.isFinite(+d) ||
    d.toISOString().slice(0, 10) !== value ||
    value < "1900-01-01" ||
    value > "2199-12-31"
  )
    fail(`Некорректная дата «${name}».`);
  return value;
}
function choice(value, allowed, name, defaultValue) {
  if (value == null || value === "") value = defaultValue;
  if (!allowed.includes(value)) fail(`Некорректное поле «${name}».`);
  return value;
}
function bool(value, defaultValue = false) {
  if (value == null) return defaultValue;
  if (typeof value !== "boolean") fail("Ожидалось логическое значение.");
  return value;
}
function quantityMilli(value, name = "Количество") {
  const n = number(value, name, 0.001, 1e8);
  const m = Math.round(n * 1000);
  if (Math.abs(n * 1000 - m) > 0.000001)
    fail(`В поле «${name}» допускается не более трёх знаков после запятой.`);
  return m;
}
function roundDivide(a, b) {
  if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b) || b <= 0)
    fail("Сумма документа слишком велика.");
  return Math.round(a / b);
}
function lineAmount(quantity, price, discount = 0, adjustment = 0) {
  const q = quantityMilli(quantity),
    p = integer(price, "Цена, коп.", 0, 1e11),
    d = number(discount, "Скидка, %", 0, 100),
    a = integer(adjustment, "Корректировка, коп.", -1e12, 1e12);
  if (Math.abs(d * 100 - Math.round(d * 100)) > 1e-7)
    fail("Скидка допускает не более двух знаков после запятой.");
  const raw = BigInt(q) * BigInt(p) * BigInt(10000 - Math.round(d * 100));
  const cents = Number((raw + 5000000n) / 10000000n) + a;
  if (!Number.isSafeInteger(cents) || Math.abs(cents) > 1e13)
    fail("Сумма строки слишком велика.");
  return cents;
}
function lines(value, parse) {
  if (!Array.isArray(value) || value.length > 200)
    fail("Документ должен содержать не более 200 строк.");
  const result = value.map(parse);
  if (new Set(result.map((x) => x.id)).size !== result.length)
    fail("Идентификаторы строк документа повторяются.");
  return result;
}
function orderLine(raw) {
  const v = object(raw),
    type = choice(v.type, ["работа", "запчасть"], "Тип позиции");
  const quantity = quantityMilli(v.quantity) / 1000,
    unitPriceCents = integer(v.unitPriceCents, "Цена, коп.", 0, 1e11),
    discountPercent = number(v.discountPercent ?? 0, "Скидка, %", 0, 100),
    adjustmentCents = integer(
      v.adjustmentCents ?? 0,
      "Корректировка, коп.",
      -1e12,
      1e12,
    );
  const adjustmentReason = text(
    v.adjustmentReason,
    "Причина корректировки",
    1000,
    adjustmentCents !== 0,
  );
  const stockSource = choice(
    v.stockSource,
    ["none", "warehouse"],
    "Источник детали",
    "none",
  );
  if (stockSource === "warehouse" && type !== "запчасть")
    fail("Со склада можно списывать только запчасти.");
  return {
    id: uuid(v.id, "ID строки"),
    type,
    name: text(v.name, "Наименование", 1000, true),
    group: text(v.group, "Группа затрат", 200) || "— не классифицировано —",
    node: text(v.node, "Узел", 200) || "—",
    quantity,
    unit: text(v.unit, "Единица измерения", 30) || "шт.",
    unitPriceCents,
    discountPercent,
    adjustmentCents,
    adjustmentReason,
    amountCents: lineAmount(
      quantity,
      unitPriceCents,
      discountPercent,
      adjustmentCents,
    ),
    partId: uuid(v.partId, "Запчасть", stockSource !== "warehouse"),
    warehouseId: uuid(v.warehouseId, "Склад", stockSource !== "warehouse"),
    stockSource,
  };
}
function parseRecord(kind, raw) {
  if (!KINDS.includes(kind)) fail("Неизвестный вид записи.");
  const b = object(raw),
    v = b.payload ? object(b.payload) : b;
  const result = {
    id: uuid(b.id),
    responsibilityScopeId: uuid(b.responsibilityScopeId, "Область"),
    version: integer(b.version, "Версия", 0, 2e9),
    payload: null,
  };
  let p;
  if (kind === "vehicles") {
    const plate = text(v.plate, "Госномер", 30, true)
      .replace(/\s/g, "")
      .toUpperCase();
    const vin = text(v.vin, "VIN / ID ТС", 80).toUpperCase();
    p = {
      plate,
      vin,
      brand: text(v.brand, "Бренд ТС", 100),
      model: text(v.model, "Модель", 200),
      year: integer(v.year, "Год", 1900, 2100, true),
      group: text(v.group, "Группа автопарка", 200),
      status: choice(
        v.status,
        ["active", "repair", "retired"],
        "Статус",
        "active",
      ),
      odometerKm: number(v.odometerKm, "Одометр", 0, 1e8, true),
      fuelType: text(v.fuelType, "Топливо", 100),
      notes: text(v.notes, "Примечание", 4000),
    };
  } else if (kind === "contractors") {
    p = {
      name: text(v.name, "Название", 300, true),
      phone: text(v.phone, "Телефон", 80),
      email: text(v.email, "Email", 200),
      notes: text(v.notes, "Примечание", 4000),
      active: bool(v.active, true),
    };
  } else if (kind === "parts") {
    p = {
      sku: text(v.sku, "Артикул", 100),
      name: text(v.name, "Наименование", 500, true),
      unit: text(v.unit, "Единица измерения", 30, true),
      minStock: number(v.minStock ?? 0, "Минимальный остаток", 0, 1e8),
      active: bool(v.active, true),
    };
  } else if (kind === "warehouses") {
    p = {
      name: text(v.name, "Название склада", 200, true),
      notes: text(v.notes, "Примечание", 4000),
      active: bool(v.active, true),
    };
  } else if (kind === "orders") {
    const status = choice(
      v.status,
      ["draft", "in_progress", "completed", "cancelled"],
      "Статус",
      "draft",
    );
    const openedOn = date(v.openedOn, "Открытие"),
      completedOn = date(v.completedOn, "Завершение", true);
    if (completedOn && completedOn < openedOn)
      fail("Дата завершения раньше открытия.");
    if (status !== "completed" && completedOn)
      fail("Дата завершения допустима только у закрытого заказ-наряда.");
    if (status === "completed" && !completedOn)
      fail("Для закрытого наряда требуется дата завершения.");
    const execution = choice(
      v.execution,
      ["unknown", "internal", "contractor"],
      "Способ выполнения",
      "unknown",
    );
    p = {
      number: text(v.number, "Номер", 100),
      vehicleId: uuid(v.vehicleId, "Автомобиль"),
      openedOn,
      completedOn,
      status,
      odometerKm: number(v.odometerKm, "Одометр", 0, 1e8, true),
      contractorId: uuid(
        v.contractorId,
        "Подрядчик",
        execution !== "contractor",
      ),
      execution,
      responsible: text(v.responsible, "Ответственный", 200),
      complaint: text(v.complaint, "Причина обращения", 4000),
      notes: text(v.notes, "Примечание", 4000),
      driverReportId: uuid(v.driverReportId, "Заявка водителя", true),
      maintenanceId: uuid(v.maintenanceId, "План ТО", true),
      lines: lines(v.lines ?? [], orderLine),
    };
  } else if (kind === "maintenance") {
    p = {
      vehicleId: uuid(v.vehicleId, "Автомобиль"),
      title: text(v.title, "Название ТО", 300, true),
      intervalKm: number(v.intervalKm, "Интервал, км", 1, 1e7, true),
      intervalDays: integer(v.intervalDays, "Интервал, дней", 1, 36500, true),
      lastCompletedOn: date(v.lastCompletedOn, "Последнее ТО", true),
      lastOdometerKm: number(
        v.lastOdometerKm,
        "Пробег при последнем ТО",
        0,
        1e8,
        true,
      ),
      dueOn: date(v.dueOn, "Следующее ТО", true),
      dueOdometerKm: number(v.dueOdometerKm, "Порог пробега", 0, 1e8, true),
      active: bool(v.active, true),
      notes: text(v.notes, "Примечание", 4000),
    };
    if (
      !p.dueOn &&
      p.dueOdometerKm === null &&
      !(p.intervalDays && p.lastCompletedOn) &&
      !(p.intervalKm && p.lastOdometerKm !== null)
    )
      fail("Укажите срок ТО, порог пробега или последнее ТО и интервал.");
  } else if (kind === "purchases") {
    p = {
      number: text(v.number, "Номер закупки", 100),
      contractorId: uuid(v.contractorId, "Поставщик"),
      warehouseId: uuid(v.warehouseId, "Склад"),
      orderedOn: date(v.orderedOn, "Дата закупки"),
      status: choice(
        v.status,
        ["draft", "ordered", "received", "cancelled"],
        "Статус",
        "draft",
      ),
      notes: text(v.notes, "Примечание", 4000),
      lines: lines(v.lines ?? [], (rawLine) => {
        const l = object(rawLine);
        return {
          id: uuid(l.id, "ID строки"),
          partId: uuid(l.partId, "Запчасть"),
          quantity: quantityMilli(l.quantity) / 1000,
          unitCostCents: integer(
            l.unitCostCents,
            "Цена закупки, коп.",
            0,
            1e11,
          ),
        };
      }),
    };
  } else if (kind === "fuel") {
    const litres = quantityMilli(v.litres, "Литры") / 1000,
      unitPriceCents = integer(v.unitPriceCents, "Цена литра, коп.", 0, 1e8);
    p = {
      vehicleId: uuid(v.vehicleId, "Автомобиль"),
      date: date(v.date, "Дата заправки"),
      fuelType: text(v.fuelType, "Вид топлива", 100),
      litres,
      unitPriceCents,
      amountCents: lineAmount(litres, unitPriceCents),
      odometerKm: number(v.odometerKm, "Одометр", 0, 1e8, true),
      fullTank: bool(v.fullTank),
      station: text(v.station, "АЗС", 300),
      receiptReference: text(v.receiptReference, "Номер чека", 300),
      notes: text(v.notes, "Примечание", 4000),
      driverUserId: uuid(v.driverUserId, "Водитель", true),
    };
  } else if (kind === "assignments") {
    p = {
      vehicleId: uuid(v.vehicleId, "Автомобиль"),
      driverUserId: uuid(v.driverUserId, "Водитель"),
      startsOn: date(v.startsOn, "Начало назначения"),
      endsOn: date(v.endsOn, "Конец назначения", true),
      notes: text(v.notes, "Примечание", 4000),
      active: bool(v.active, true),
    };
    if (p.endsOn && p.endsOn < p.startsOn)
      fail("Окончание назначения раньше начала.");
  } else if (kind === "driverReports") {
    const type = choice(v.type, ["defect", "fuel", "odometer"], "Тип заявки");
    p = {
      vehicleId: uuid(v.vehicleId, "Автомобиль"),
      driverUserId: uuid(v.driverUserId, "Водитель"),
      reportedOn: date(v.reportedOn, "Дата"),
      type,
      description: text(v.description, "Описание", 4000, type === "defect"),
      odometerKm: number(v.odometerKm, "Одометр", 0, 1e8, type !== "odometer"),
      litres: number(v.litres, "Литры", 0.001, 1e8, type !== "fuel"),
      unitPriceCents: integer(
        v.unitPriceCents,
        "Цена литра, коп.",
        0,
        1e8,
        type !== "fuel",
      ),
      fullTank: bool(v.fullTank),
      station: text(v.station, "АЗС", 300),
      receiptReference: text(v.receiptReference, "Номер чека", 300),
      status: choice(
        v.status,
        ["new", "accepted", "resolved", "rejected"],
        "Статус заявки",
        "new",
      ),
      orderId: uuid(v.orderId, "Заказ-наряд", true),
      resolution: text(v.resolution, "Результат", 4000),
    };
    if (p.litres !== null) quantityMilli(p.litres, "Литры");
    if (["resolved", "rejected"].includes(p.status) && !p.resolution)
      fail("Укажите результат обработки заявки.");
  }
  result.payload = p;
  return result;
}
function validateAction(body) {
  const b = object(body);
  return {
    responsibilityScopeId: uuid(b.responsibilityScopeId, "Область"),
    version: integer(b.version, "Версия", 1, 2e9),
    action: choice(
      b.action,
      [
        "start",
        "complete",
        "cancel",
        "order",
        "receive",
        "accept",
        "resolve",
        "reject",
      ],
      "Действие",
    ),
    idempotencyKey: uuid(b.idempotencyKey, "Ключ повторной отправки"),
    completedOn: date(b.completedOn, "Дата завершения", true),
    resolution: text(b.resolution, "Результат", 4000),
  };
}
function flat(row) {
  return row?.payload
    ? { ...row.payload, id: row.id, version: row.version }
    : row;
}
function orderRows(records) {
  const vehicles = new Map(
      (records.vehicles || []).map(flat).map((v) => [v.id, v]),
    ),
    contractors = new Map(
      (records.contractors || []).map(flat).map((v) => [v.id, v]),
    );
  const result = [];
  for (const source of records.orders || []) {
    const o = flat(source);
    if (o.status === "cancelled") continue;
    const v = vehicles.get(o.vehicleId);
    if (!v) fail("Автомобиль заказ-наряда недоступен.");
    for (const l of o.lines || [])
      result.push({
        sourceRow: `ЕЦЛ:${o.id}:${l.id}`,
        sourceOrigin: "native",
        nativeOrderId: o.id,
        orderId: `app:${o.id}`,
        orderNumber: o.number || o.id.slice(0, 8),
        openedOn: o.openedOn,
        completedOn: o.status === "completed" ? o.completedOn : null,
        plate: v.plate,
        vehicleBrand: v.brand || "",
        vehicleGroup: v.group || v.model || "Без группы",
        vehicleYear: v.year ?? null,
        vehicleType: "",
        odometerKm: o.odometerKm ?? null,
        positionType: l.type,
        group: l.group,
        node: l.node,
        name: l.name,
        partBrand: "",
        quantity: l.quantity,
        unit: l.unit,
        unitPriceCents: l.unitPriceCents,
        amountCents: l.amountCents,
        discountPercent: l.discountPercent,
        adjustmentCents: l.adjustmentCents,
        adjustmentReason: l.adjustmentReason,
        topUp: false,
        tire: /шин|кол[её]с/i.test(l.group || ""),
        supplier:
          o.execution === "contractor"
            ? contractors.get(o.contractorId)?.name || ""
            : "",
        ownWorkReported: o.execution === "internal",
        executionConfirmed: o.execution,
        status:
          o.status === "completed"
            ? "Финиш"
            : o.status === "in_progress"
              ? "В процессе"
              : "Старт",
        autoGroup: l.group,
        autoNode: l.node,
      });
  }
  return result;
}
function maintenanceStatus(
  source,
  vehicle,
  today = new Date().toISOString().slice(0, 10),
) {
  const p = flat(source),
    v = flat(vehicle) || {};
  let dueOn = p.dueOn || null;
  if (!dueOn && p.lastCompletedOn && p.intervalDays) {
    const d = new Date(p.lastCompletedOn + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + p.intervalDays);
    dueOn = d.toISOString().slice(0, 10);
  }
  const dueOdometerKm =
    p.dueOdometerKm ??
    (p.lastOdometerKm != null && p.intervalKm
      ? p.lastOdometerKm + p.intervalKm
      : null);
  const remainingDays = dueOn
    ? Math.round(
        (Date.parse(dueOn + "T00:00:00Z") - Date.parse(today + "T00:00:00Z")) /
          86400000,
      )
    : null;
  const remainingKm =
    dueOdometerKm != null && v.odometerKm != null
      ? dueOdometerKm - v.odometerKm
      : null;
  const values = [remainingDays, remainingKm].filter((x) => x !== null);
  const status =
    p.active === false
      ? "inactive"
      : values.some((x) => x <= 0)
        ? "overdue"
        : (remainingDays !== null && remainingDays <= 14) ||
            (remainingKm !== null && remainingKm <= 1000)
          ? "soon"
          : dueOdometerKm != null && v.odometerKm == null
            ? "unknown"
            : values.length
              ? "scheduled"
              : "unknown";
  return {
    id: p.id,
    vehicleId: p.vehicleId,
    label: p.title,
    status,
    dueOn,
    dueOdometerKm,
    remainingDays,
    remainingKm,
  };
}
module.exports = {
  KINDS,
  parseRecord,
  orderRows,
  maintenanceStatus,
  validateAction,
  quantityMilli,
  lineAmount,
  roundDivide,
  uuid,
  text,
  date,
  number,
  integer,
  bool,
  choice,
  fail,
  flat,
};
