"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parsePricingTariffInput = parsePricingTariffInput;
exports.parseTripPricingInput = parseTripPricingInput;
exports.parsePricingPreviewInput = parsePricingPreviewInput;
exports.parsePricingPublishInput = parsePricingPublishInput;
exports.parsePricingConfirmInput = parsePricingConfirmInput;
exports.calculatePricing = calculatePricing;
const common_1 = require("@nestjs/common");
const MAX_RATE_KOPECKS = 1_000_000_000;
const MAX_TOTAL_KOPECKS = 10000000000000n;
const MAX_DISTANCE_HUNDREDTHS = 10_000_000;
const MAX_STOPS = 10_000;
const MAX_MINUTES = 10_080;
const RULE_KEYS = ["baseKind", "baseKopecks", "distanceMetric", "distanceBands", "includedStops", "extraStopKopecks", "includedKilometersHundredths", "extraKilometerKopecks", "includedMinutes", "extraTimeUnit", "extraTimeKopecks", "specialStopKopecks"];
const FACT_KEYS = ["stops", "kilometersHundredths", "minutes", "specialStop", "warehouseRadiusHundredths", "mkadRadiusHundredths", "legDistanceHundredths"];
function invalid(message) {
    throw new common_1.BadRequestException({ code: "PRICING_INVALID_INPUT", message });
}
/** Accept only complete JSON data records, including when called outside the HTTP boundary. */
function record(value, keys) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        return invalid("Ожидается объект JSON.");
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null)
        return invalid("Ожидается обычный объект JSON.");
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Reflect.ownKeys(value).some((key) => typeof key !== "string" || !keys.includes(key)))
        return invalid("Неизвестное поле запроса.");
    if (keys.some((key) => !descriptors[key] || !("value" in descriptors[key]) || !descriptors[key].enumerable))
        return invalid("Не заполнены обязательные поля запроса.");
    return value;
}
function integer(value, maximum) {
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > maximum)
        return invalid("Ожидается целое неотрицательное число в допустимом диапазоне.");
    return value;
}
function nullableInteger(value, maximum) {
    return value === null ? null : integer(value, maximum);
}
function boolean(value) {
    if (typeof value !== "boolean")
        return invalid("Ожидается логическое значение true или false.");
    return value;
}
function nullableBoolean(value) {
    return value === null ? null : boolean(value);
}
function uuid(value) {
    if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))
        return invalid("Ожидается UUID.");
    return value.toLowerCase();
}
function nullableUuid(value) {
    return value === null ? null : uuid(value);
}
function text(value, maximum, minimum = 0, multiline = false) {
    const controls = multiline ? /[\x00-\x09\x0b\x0c\x0e-\x1f\x7f-\x9f]/ : /[\x00-\x1f\x7f-\x9f]/;
    if (typeof value !== "string" || value.length > maximum || value.trim().length < minimum || controls.test(value))
        return invalid("Некорректный текст или превышена длина поля.");
    return value.trim().replace(/\r\n?/g, "\n");
}
function date(value) {
    if (typeof value !== "string" || !/^20\d{2}-\d{2}-\d{2}$/.test(value))
        return invalid("Дата должна быть в формате ГГГГ-ММ-ДД, 2000–2099.");
    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value)
        return invalid("Некорректная календарная дата.");
    return value;
}
function parseRules(value) {
    const input = record(value, RULE_KEYS);
    if (input.baseKind !== "fixed" && input.baseKind !== "distance_bands")
        return invalid("Неизвестный вид основной ставки.");
    if (!["route", "warehouse_radius", "mkad_radius", "leg"].includes(input.distanceMetric))
        return invalid("Неизвестный показатель расстояния.");
    if (input.extraTimeUnit !== "minute" && input.extraTimeUnit !== "started_hour")
        return invalid("Неизвестная единица оплаты дополнительного времени.");
    if (!Array.isArray(input.distanceBands) || input.distanceBands.length > 30)
        return invalid("Разрешено не более 30 диапазонов расстояния.");
    const bands = input.distanceBands;
    const arrayDescriptors = Object.getOwnPropertyDescriptors(bands);
    if (Object.getPrototypeOf(bands) !== Array.prototype || Reflect.ownKeys(bands).length !== bands.length + 1 || Array.from({ length: bands.length }, (_, index) => arrayDescriptors[index]).some((descriptor) => !descriptor || !("value" in descriptor) || !descriptor.enumerable))
        return invalid("Диапазоны должны быть массивом объектов JSON без пропусков.");
    const baseKopecks = integer(input.baseKopecks, MAX_RATE_KOPECKS);
    const distanceBands = bands.map((value) => {
        const band = record(value, ["upToHundredths", "amountKopecks"]);
        return { upToHundredths: integer(band.upToHundredths, MAX_DISTANCE_HUNDREDTHS), amountKopecks: integer(band.amountKopecks, MAX_RATE_KOPECKS) };
    });
    if (input.baseKind === "fixed" && distanceBands.length !== 0)
        return invalid("Для фиксированной ставки таблица расстояний должна быть пустой.");
    if (input.baseKind === "distance_bands" && (baseKopecks !== 0 || distanceBands.length === 0))
        return invalid("Для таблицы расстояний задайте диапазоны и нулевую фиксированную ставку.");
    // Boundaries are canonical: [0, first] then (previous, next], at 0.01 km precision.
    if (distanceBands.some((band, index) => index > 0 && band.upToHundredths <= distanceBands[index - 1].upToHundredths))
        return invalid("Верхние границы диапазонов должны строго возрастать без повторов.");
    return {
        baseKind: input.baseKind, baseKopecks, distanceMetric: input.distanceMetric, distanceBands,
        includedStops: integer(input.includedStops, MAX_STOPS), extraStopKopecks: nullableInteger(input.extraStopKopecks, MAX_RATE_KOPECKS),
        includedKilometersHundredths: nullableInteger(input.includedKilometersHundredths, MAX_DISTANCE_HUNDREDTHS), extraKilometerKopecks: nullableInteger(input.extraKilometerKopecks, MAX_RATE_KOPECKS),
        includedMinutes: nullableInteger(input.includedMinutes, MAX_MINUTES), extraTimeUnit: input.extraTimeUnit,
        extraTimeKopecks: nullableInteger(input.extraTimeKopecks, MAX_RATE_KOPECKS), specialStopKopecks: nullableInteger(input.specialStopKopecks, MAX_RATE_KOPECKS),
    };
}
function parseFacts(value) {
    const input = record(value, FACT_KEYS);
    return {
        stops: integer(input.stops, MAX_STOPS), kilometersHundredths: integer(input.kilometersHundredths, MAX_DISTANCE_HUNDREDTHS), minutes: integer(input.minutes, MAX_MINUTES),
        specialStop: nullableBoolean(input.specialStop), warehouseRadiusHundredths: nullableInteger(input.warehouseRadiusHundredths, MAX_DISTANCE_HUNDREDTHS),
        mkadRadiusHundredths: nullableInteger(input.mkadRadiusHundredths, MAX_DISTANCE_HUNDREDTHS), legDistanceHundredths: nullableInteger(input.legDistanceHundredths, MAX_DISTANCE_HUNDREDTHS),
    };
}
function parsePricingTariffInput(value) {
    const input = record(value, ["name", "side", "contractReference", "effectiveFrom", "effectiveTo", "sourceText", "termsNote", "amountsAreNet", "rules", "previousVersionId", "idempotencyKey", "projectId", "responsibilityScopeId"]);
    if (input.side !== "client" && input.side !== "executor")
        return invalid("Выберите сторону тарифа: заказчик или исполнитель.");
    const effectiveFrom = date(input.effectiveFrom);
    const effectiveTo = input.effectiveTo === null ? null : date(input.effectiveTo);
    if (effectiveTo !== null && effectiveTo <= effectiveFrom)
        return invalid("Дата окончания действия должна быть позже даты начала и не входит в период действия тарифа.");
    return {
        projectId: uuid(input.projectId), responsibilityScopeId: uuid(input.responsibilityScopeId), name: text(input.name, 160, 3), side: input.side,
        contractReference: text(input.contractReference, 200, 1), effectiveFrom, effectiveTo, sourceText: text(input.sourceText, 10_000, 0, true),
        termsNote: text(input.termsNote, 2_000, 0, true), amountsAreNet: boolean(input.amountsAreNet), rules: parseRules(input.rules),
        previousVersionId: nullableUuid(input.previousVersionId), idempotencyKey: uuid(input.idempotencyKey),
    };
}
function parseTripPricingInput(value) {
    const input = record(value, ["clientTariffId", "executorTariffId", "executorManualKopecks", "executorManualReason", "directCostsKopecks", "directCostsReason", "specialStop", "warehouseRadiusHundredths", "mkadRadiusHundredths", "legDistanceHundredths", "factsId", "expectedRevision", "idempotencyKey"]);
    const executorTariffId = nullableUuid(input.executorTariffId);
    const executorManualKopecks = nullableInteger(input.executorManualKopecks, MAX_RATE_KOPECKS);
    const directCostsKopecks = nullableInteger(input.directCostsKopecks, MAX_RATE_KOPECKS);
    if (executorTariffId !== null && executorManualKopecks !== null)
        return invalid("Выберите тариф исполнителя или ручную сумму, одновременно использовать оба нельзя.");
    const executorManualReason = text(input.executorManualReason, 1_000, executorManualKopecks === null ? 0 : 3);
    const directCostsReason = text(input.directCostsReason, 1_000, directCostsKopecks === null ? 0 : 3);
    return {
        clientTariffId: nullableUuid(input.clientTariffId), executorTariffId, executorManualKopecks, executorManualReason, directCostsKopecks, directCostsReason,
        specialStop: nullableBoolean(input.specialStop), warehouseRadiusHundredths: nullableInteger(input.warehouseRadiusHundredths, MAX_DISTANCE_HUNDREDTHS),
        mkadRadiusHundredths: nullableInteger(input.mkadRadiusHundredths, MAX_DISTANCE_HUNDREDTHS), legDistanceHundredths: nullableInteger(input.legDistanceHundredths, MAX_DISTANCE_HUNDREDTHS),
        factsId: nullableUuid(input.factsId), expectedRevision: integer(input.expectedRevision, 2_147_483_647), idempotencyKey: uuid(input.idempotencyKey),
    };
}
function parsePricingPreviewInput(value) {
    const input = record(value, ["rules", "facts"]);
    return { rules: parseRules(input.rules), facts: parseFacts(input.facts) };
}
function parsePricingPublishInput(value) {
    const input = record(value, ["idempotencyKey"]);
    return { idempotencyKey: uuid(input.idempotencyKey) };
}
function parsePricingConfirmInput(value) {
    const input = record(value, ["part", "idempotencyKey"]);
    if (input.part !== "client" && input.part !== "expenses")
        return invalid("Выберите подтверждение начисления заказчику или расходов.");
    return { part: input.part, idempotencyKey: uuid(input.idempotencyKey) };
}
function checkedMoney(value) {
    if (value < 0n || value > MAX_TOTAL_KOPECKS)
        throw new common_1.BadRequestException({ code: "PRICING_CALCULATION_LIMIT", message: "Сумма расчёта превышает допустимый предел 100 миллиардов рублей." });
    return Number(value);
}
function rubles(kopecks) {
    return `${Math.floor(kopecks / 100)},${String(kopecks % 100).padStart(2, "0")} ₽`;
}
function kilometers(hundredths) {
    return `${Math.floor(hundredths / 100)},${String(hundredths % 100).padStart(2, "0")}`;
}
const METRIC_LABELS = {
    route: "пробег маршрута", warehouse_radius: "радиус от склада", mkad_radius: "удалённость от МКАД", leg: "расстояние от загрузки до выгрузки",
};
/** Pure, versioned calculation. Missing terms remain unresolved; no zero or VAT is inferred. */
function calculatePricing(rulesInput, factsInput) {
    const rules = parseRules(rulesInput);
    const facts = parseFacts(factsInput);
    const lines = [];
    const issues = [];
    let total = 0n;
    const add = (code, label, quantity, unit, rateKopecks, amount, explanation) => {
        const amountKopecks = checkedMoney(amount);
        total += amount;
        checkedMoney(total);
        lines.push({ code, label, quantity, unit, rateKopecks, amountKopecks, explanation });
    };
    const issue = (code, message) => { issues.push({ code, message }); };
    if (rules.baseKind === "fixed") {
        add("BASE", "Основная ставка", 1, "trip", rules.baseKopecks, BigInt(rules.baseKopecks), `1 рейс × ${rubles(rules.baseKopecks)}.`);
    }
    else {
        const distances = { route: facts.kilometersHundredths, warehouse_radius: facts.warehouseRadiusHundredths, mkad_radius: facts.mkadRadiusHundredths, leg: facts.legDistanceHundredths };
        const distance = distances[rules.distanceMetric];
        if (distance === null)
            issue("DISTANCE_METRIC_MISSING", `Для выбора ставки требуется показатель «${METRIC_LABELS[rules.distanceMetric]}».`);
        else {
            const index = rules.distanceBands.findIndex((band) => distance <= band.upToHundredths);
            if (index < 0)
                issue("DISTANCE_BAND_NOT_FOUND", `Показатель «${METRIC_LABELS[rules.distanceMetric]}» ${kilometers(distance)} км превышает последний диапазон тарифа.`);
            else {
                const band = rules.distanceBands[index];
                const range = index === 0 ? `от 0 до ${kilometers(band.upToHundredths)} км включительно` : `свыше ${kilometers(rules.distanceBands[index - 1].upToHundredths)} до ${kilometers(band.upToHundredths)} км включительно`;
                add("BASE_DISTANCE_BAND", "Основная ставка по расстоянию", 1, "trip", band.amountKopecks, BigInt(band.amountKopecks), `${METRIC_LABELS[rules.distanceMetric]}: ${kilometers(distance)} км; диапазон ${range}; ${rubles(band.amountKopecks)} за рейс.`);
            }
        }
    }
    const extraStops = Math.max(0, facts.stops - rules.includedStops);
    if (extraStops > 0) {
        if (rules.extraStopKopecks === null)
            issue("EXTRA_STOP_RATE_MISSING", `Точек сверх включённых ${rules.includedStops}: ${extraStops}; ставка доплаты не задана.`);
        else
            add("EXTRA_STOPS", "Дополнительные точки", extraStops, "stop", rules.extraStopKopecks, BigInt(extraStops) * BigInt(rules.extraStopKopecks), `(${facts.stops} − ${rules.includedStops}) точек × ${rubles(rules.extraStopKopecks)}.`);
    }
    if (rules.includedKilometersHundredths !== null && facts.kilometersHundredths > rules.includedKilometersHundredths) {
        const extraDistance = facts.kilometersHundredths - rules.includedKilometersHundredths;
        if (rules.extraKilometerKopecks === null)
            issue("EXTRA_KILOMETER_RATE_MISSING", `Пробег сверх включённых ${kilometers(rules.includedKilometersHundredths)} км: ${kilometers(extraDistance)} км; ставка доплаты не задана.`);
        else {
            // Half up once per distance line; integer hundredths avoid binary float money arithmetic.
            const amount = (BigInt(extraDistance) * BigInt(rules.extraKilometerKopecks) + 50n) / 100n;
            add("EXTRA_KILOMETERS", "Дополнительный пробег", extraDistance / 100, "kilometer", rules.extraKilometerKopecks, amount, `(${kilometers(facts.kilometersHundredths)} − ${kilometers(rules.includedKilometersHundredths)}) км маршрута × ${rubles(rules.extraKilometerKopecks)}; округление до копейки, 0,5 коп. вверх.`);
        }
    }
    if (rules.includedMinutes !== null && facts.minutes > rules.includedMinutes) {
        const extraMinutes = facts.minutes - rules.includedMinutes;
        if (rules.extraTimeKopecks === null)
            issue("EXTRA_TIME_RATE_MISSING", `Время сверх включённых ${rules.includedMinutes} минут: ${extraMinutes} минут; ставка доплаты не задана.`);
        else {
            const hours = rules.extraTimeUnit === "started_hour";
            const quantity = hours ? Math.ceil(extraMinutes / 60) : extraMinutes;
            const explanation = hours ? `(${facts.minutes} − ${rules.includedMinutes}) минут: ${quantity} начатых часов × ${rubles(rules.extraTimeKopecks)}.` : `(${facts.minutes} − ${rules.includedMinutes}) минут × ${rubles(rules.extraTimeKopecks)}.`;
            add("EXTRA_TIME", "Дополнительное время", quantity, hours ? "hour" : "minute", rules.extraTimeKopecks, BigInt(quantity) * BigInt(rules.extraTimeKopecks), explanation);
        }
    }
    if (rules.specialStopKopecks !== null) {
        if (facts.specialStop === null)
            issue("SPECIAL_STOP_FACT_MISSING", "Укажите, было ли посещение специальной точки по условиям тарифа.");
        else if (facts.specialStop)
            add("SPECIAL_STOP", "Посещение специальной точки", 1, "trip", rules.specialStopKopecks, BigInt(rules.specialStopKopecks), `Подтверждено посещение специальной точки; однократная доплата ${rubles(rules.specialStopKopecks)} за рейс.`);
    }
    return { engineVersion: "route-v1", lines, totalKopecks: issues.length === 0 ? checkedMoney(total) : null, issues };
}
//# sourceMappingURL=pricing-rules.js.map