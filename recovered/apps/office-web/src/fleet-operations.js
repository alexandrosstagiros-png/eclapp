// SPDX-License-Identifier: MIT
const TODAY = () => new Date().toLocaleDateString("en-CA");
const money = (cents) =>
  new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 2,
  }).format((cents || 0) / 100);
const num = (value) =>
  value == null
    ? "Не указано"
    : new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 3 }).format(
        value,
      );
const STATUS = {
  draft: "Черновик",
  in_progress: "В работе",
  completed: "Завершён",
  cancelled: "Отменён",
  ordered: "Заказано",
  received: "Принято",
  active: "В эксплуатации",
  repair: "В ремонте",
  retired: "Выведен",
  new: "Новая",
  accepted: "Принята",
  resolved: "Решена",
  rejected: "Отклонена",
  overdue: "Срок наступил",
  soon: "Скоро",
  scheduled: "По плану",
  unknown: "Недостаточно данных",
  inactive: "Отключено",
};
const NAV = [
  ["orders", "Заказ-наряды"],
  ["vehicles", "Автомобили"],
  ["maintenance", "Плановое ТО"],
  ["stock", "Склад"],
  ["purchases", "Закупки"],
  ["fuel", "Топливо"],
  ["assignments", "Водители"],
  ["driverReports", "Заявки водителей"],
  ["contractors", "Подрядчики"],
  ["parts", "Номенклатура"],
  ["warehouses", "Склады"],
];
const LABEL = Object.fromEntries(NAV);
const EMPTY = () => ({
  records: Object.fromEntries(
    NAV.filter(([key]) => key !== "stock").map(([key]) => [key, []]),
  ),
  stock: [],
  drivers: [],
  maintenance: [],
  events: [],
});
const F = (key, label, type = "text", required = false, extra = {}) => ({
  key,
  label,
  type,
  required,
  ...extra,
});
const FIELDS = {
  vehicles: [
    F("plate", "Госномер", "text", true),
    F("vin", "VIN / постоянный ID"),
    F("brand", "Бренд"),
    F("model", "Модель"),
    F("group", "Группа автопарка"),
    F("year", "Год", "number"),
    F("odometerKm", "Пробег, км", "number"),
    F("fuelType", "Вид топлива"),
    F("status", "Состояние", "select", true, {
      options: ["active", "repair", "retired"],
    }),
  ],
  contractors: [
    F("name", "Название", "text", true),
    F("phone", "Телефон"),
    F("email", "Email", "email"),
    F("active", "Действующий", "checkbox"),
  ],
  parts: [
    F("sku", "Артикул"),
    F("name", "Наименование", "text", true),
    F("unit", "Единица измерения", "text", true),
    F("minStock", "Минимальный остаток", "number"),
    F("active", "Используется", "checkbox"),
  ],
  warehouses: [
    F("name", "Название склада", "text", true),
    F("active", "Используется", "checkbox"),
  ],
  orders: [
    F("number", "Номер заказ-наряда"),
    F("vehicleId", "Автомобиль", "vehicles", true),
    F("openedOn", "Дата открытия", "date", true),
    F("odometerKm", "Пробег, км", "number"),
    F("execution", "Выполнение", "select", true, {
      options: [
        ["unknown", "Не уточнено"],
        ["internal", "Своими силами"],
        ["contractor", "Подрядчик"],
      ],
    }),
    F("contractorId", "Подрядчик", "contractors"),
    F("responsible", "Ответственный"),
    F("maintenanceId", "Связанный план ТО", "maintenance"),
    F("driverReportId", "Заявка водителя", "driverReports"),
    F("complaint", "Причина обращения", "textarea"),
  ],
  maintenance: [
    F("vehicleId", "Автомобиль", "vehicles", true),
    F("title", "Название ТО", "text", true),
    F("dueOn", "Следующее ТО: дата", "date"),
    F("dueOdometerKm", "Следующее ТО: пробег, км", "number"),
    F("intervalKm", "Повторять через, км", "number"),
    F("intervalDays", "Повторять через, дней", "number"),
    F("lastCompletedOn", "Последнее ТО: дата", "date"),
    F("lastOdometerKm", "Последнее ТО: пробег, км", "number"),
    F("active", "План действует", "checkbox"),
  ],
  purchases: [
    F("number", "Номер закупки"),
    F("contractorId", "Поставщик", "contractors", true),
    F("warehouseId", "Склад приёмки", "warehouses", true),
    F("orderedOn", "Дата закупки", "date", true),
  ],
  fuel: [
    F("vehicleId", "Автомобиль", "vehicles", true),
    F("date", "Дата заправки", "date", true),
    F("fuelType", "Топливо"),
    F("litres", "Количество, л", "number", true),
    F("unitPriceCents", "Цена за литр, ₽", "money", true),
    F("odometerKm", "Пробег при заправке, км", "number"),
    F("fullTank", "До полного бака", "checkbox"),
    F("station", "АЗС"),
    F("receiptReference", "Номер чека"),
    F("driverUserId", "Водитель", "drivers"),
  ],
  assignments: [
    F("vehicleId", "Автомобиль", "vehicles", true),
    F("driverUserId", "Водитель", "drivers", true),
    F("startsOn", "Начало назначения", "date", true),
    F("endsOn", "Окончание назначения", "date"),
    F("active", "Назначение действует", "checkbox"),
  ],
  driverReports: [
    F("vehicleId", "Автомобиль", "vehicles", true),
    F("driverUserId", "Водитель", "drivers", true),
    F("reportedOn", "Дата события", "date", true),
    F("type", "Тип заявки", "select", true, {
      options: [
        ["defect", "Неисправность"],
        ["fuel", "Заправка"],
        ["odometer", "Показание одометра"],
      ],
    }),
    F("description", "Описание", "textarea"),
    F("odometerKm", "Пробег, км", "number"),
    F("litres", "Количество топлива, л", "number"),
    F("unitPriceCents", "Цена литра, ₽", "money"),
    F("fullTank", "До полного бака", "checkbox"),
    F("station", "АЗС"),
    F("receiptReference", "Номер чека"),
  ],
};
function fresh(kind) {
  return {
    id: crypto.randomUUID(),
    version: 0,
    notes: "",
    active: true,
    ...({
      vehicles: { status: "active", year: null, odometerKm: null },
      parts: { unit: "шт.", minStock: 0 },
      orders: {
        status: "draft",
        openedOn: TODAY(),
        completedOn: null,
        execution: "unknown",
        lines: [],
      },
      purchases: { status: "draft", orderedOn: TODAY(), lines: [] },
      fuel: { date: TODAY(), fullTank: false },
      assignments: { startsOn: TODAY() },
      driverReports: {
        reportedOn: TODAY(),
        type: "defect",
        status: "new",
        fullTank: false,
      },
    }[kind] || {}),
  };
}
function recordName(kind, row, data) {
  if (!row) return "Не указано";
  if (kind === "vehicles")
    return `${row.plate}${row.model ? " · " + row.model : ""}`;
  if (kind === "drivers") return row.displayName || row.id;
  if (kind === "fuel") return `Заправка · ${row.date}`;
  if (kind === "assignments")
    return (
      data.drivers.find((d) => d.id === row.driverUserId)?.displayName ||
      "Назначение водителя"
    );
  if (kind === "orders") return row.number || `ЗН ${row.id.slice(0, 8)}`;
  if (kind === "purchases")
    return row.number || `Закупка ${row.id.slice(0, 8)}`;
  if (kind === "maintenance")
    return `${row.title} · ${data.records.vehicles.find((v) => v.id === row.vehicleId)?.plate || ""}`;
  if (kind === "driverReports")
    return `${row.reportedOn} · ${row.description || { fuel: "Заправка", odometer: "Пробег" }[row.type] || "Неисправность"}`;
  return row.name || row.title || row.id;
}
const readonly = (kind, row) =>
  (kind === "orders" && ["completed", "cancelled"].includes(row.status)) ||
  (kind === "purchases" && ["received", "cancelled"].includes(row.status)) ||
  (kind === "driverReports" && row.version > 0) ||
  (kind === "fuel" && Boolean(row.sourceReportId));

function previewAmount(line, purchase, disabled) {
  if (disabled && Number.isSafeInteger(line.amountCents))
    return line.amountCents;
  const q = Math.round(Number(line.quantity || 0) * 1000);
  const p = Number((purchase ? line.unitCostCents : line.unitPriceCents) || 0);
  const discount = purchase
    ? 0
    : Math.round(Number(line.discountPercent || 0) * 100);
  const adjustment = purchase ? 0 : Number(line.adjustmentCents || 0);
  if (
    ![q, p, discount, adjustment].every(Number.isSafeInteger) ||
    q < 0 ||
    p < 0 ||
    discount < 0 ||
    discount > 10000
  )
    return null;
  const value =
    Number(
      (BigInt(q) * BigInt(p) * BigInt(10000 - discount) + 5000000n) / 10000000n,
    ) + adjustment;
  return Number.isSafeInteger(value) ? value : null;
}

export function createFleetOperationsWorkspace(React, { request }) {
  const { createElement: h, useState, useEffect, useRef } = React;
  const button = (label, onClick, props = {}) =>
    h(
      "button",
      { type: "button", className: "button", onClick, ...props },
      label,
    );
  function Modal({ title, onClose, busy, children }) {
    const ref = useRef(null);
    useEffect(() => {
      const last = document.activeElement;
      const el = ref.current;
      el?.querySelector("input,select,textarea,button")?.focus();
      const keys = (e) => {
        if (e.key === "Escape" && !busy) onClose();
        if (e.key === "Tab") {
          const all = [
            ...el.querySelectorAll(
              "input:not([disabled]),select:not([disabled]),textarea:not([disabled]),button:not([disabled])",
            ),
          ];
          if (e.shiftKey && document.activeElement === all[0]) {
            e.preventDefault();
            all.at(-1)?.focus();
          } else if (!e.shiftKey && document.activeElement === all.at(-1)) {
            e.preventDefault();
            all[0]?.focus();
          }
        }
      };
      el?.addEventListener("keydown", keys);
      return () => {
        el?.removeEventListener("keydown", keys);
        last?.isConnected && last.focus();
      };
    }, [busy]);
    return h(
      "div",
      { className: "fleet-ops-overlay" },
      h(
        "section",
        {
          className: "fleet-ops-dialog",
          role: "dialog",
          "aria-modal": true,
          "aria-label": title,
          ref,
        },
        h(
          "header",
          null,
          h("h2", null, title),
          button("Закрыть", onClose, { disabled: busy }),
        ),
        children,
      ),
    );
  }
  function Field({ definition: d, value, onChange, data, disabled }) {
    let input;
    const common = { "aria-label": d.label, disabled, required: d.required };
    if (d.type === "checkbox")
      input = h("input", {
        ...common,
        type: "checkbox",
        checked: !!value,
        onChange: (e) => onChange(e.target.checked),
      });
    else if (d.type === "textarea")
      input = h("textarea", {
        ...common,
        value: value ?? "",
        rows: 3,
        maxLength: 4000,
        onChange: (e) => onChange(e.target.value),
      });
    else if (
      d.type === "select" ||
      [
        "vehicles",
        "contractors",
        "warehouses",
        "parts",
        "maintenance",
        "driverReports",
        "drivers",
      ].includes(d.type)
    ) {
      const options =
        d.type === "select"
          ? d.options.map((x) => (Array.isArray(x) ? x : [x, STATUS[x] || x]))
          : (d.type === "drivers"
              ? data.drivers
              : data.records[d.type] || []
            ).map((row) => [row.id, recordName(d.type, row, data)]);
      input = h(
        "select",
        {
          ...common,
          value: value ?? "",
          onChange: (e) => onChange(e.target.value || null),
        },
        h("option", { value: "" }, "Выберите"),
        ...options.map(([key, label]) =>
          h("option", { key, value: key }, label),
        ),
      );
    } else
      input = h("input", {
        ...common,
        type: d.type === "money" ? "number" : d.type,
        value: value == null ? "" : d.type === "money" ? value / 100 : value,
        step:
          d.type === "money"
            ? "0.01"
            : d.type === "number"
              ? "0.001"
              : undefined,
        maxLength: d.type === "text" ? 1000 : undefined,
        onChange: (e) =>
          onChange(
            ["number", "money"].includes(d.type)
              ? e.target.value === ""
                ? null
                : d.type === "money"
                  ? Math.round(Number(e.target.value) * 100)
                  : Number(e.target.value)
              : e.target.value,
          ),
      });
    return h(
      "label",
      {
        className: `fleet-ops-field ${d.type === "textarea" ? "is-wide" : ""} ${d.type === "checkbox" ? "is-check" : ""}`,
      },
      h("span", null, d.label + (d.required ? " *" : "")),
      input,
    );
  }
  function LineEditor({ kind, rows, onChange, data, disabled }) {
    const purchase = kind === "purchases";
    const add = () =>
      onChange([
        ...rows,
        {
          id: crypto.randomUUID(),
          type: "работа",
          name: "",
          group: "",
          node: "",
          quantity: 1,
          unit: "шт.",
          unitPriceCents: 0,
          unitCostCents: 0,
          discountPercent: 0,
          adjustmentCents: 0,
          adjustmentReason: "",
          stockSource: "none",
          partId: null,
          warehouseId: null,
        },
      ]);
    function update(index, key, value) {
      const changed = rows.map((row, i) =>
        i === index ? { ...row, [key]: value } : row,
      );
      if (key === "partId") {
        const part = data.records.parts.find((p) => p.id === value);
        if (part)
          Object.assign(changed[index], { name: part.name, unit: part.unit });
      }
      onChange(changed);
    }
    return h(
      "section",
      { className: "fleet-ops-lines" },
      h(
        "div",
        { className: "fleet-ops-toolbar" },
        h("h3", null, purchase ? "Заказываемые запчасти" : "Работы и запчасти"),
        !disabled &&
          button("Добавить позицию", add, { disabled: rows.length >= 200 }),
      ),
      !rows.length &&
        h(
          "p",
          { className: "fleet-ops-muted" },
          "Добавьте позиции. Без них нельзя завершить документ.",
        ),
      ...rows.map((line, index) =>
        h(
          "fieldset",
          { key: line.id, disabled, className: "fleet-ops-line" },
          h("legend", null, `Позиция ${index + 1}`),
          h(
            "div",
            { className: "fleet-ops-form-grid" },
            ...[
              ...(purchase
                ? []
                : [
                    F("type", "Тип позиции", "select", true, {
                      options: ["работа", "запчасть"],
                    }),
                    F("name", "Наименование", "text", true),
                    F("group", "Группа затрат"),
                    F("node", "Узел"),
                    F("unit", "Единица измерения"),
                  ]),
              ...(purchase || line.type === "запчасть"
                ? [F("partId", "Номенклатура", "parts", purchase)]
                : []),
              ...(!purchase && line.type === "запчасть"
                ? [
                    F("stockSource", "Источник запчасти", "select", true, {
                      options: [
                        ["none", "Вне складского учёта"],
                        ["warehouse", "Склад"],
                      ],
                    }),
                    ...(line.stockSource === "warehouse"
                      ? [F("warehouseId", "Склад списания", "warehouses", true)]
                      : []),
                  ]
                : []),
              F("quantity", "Количество", "number", true),
              F(
                purchase ? "unitCostCents" : "unitPriceCents",
                purchase ? "Цена закупки, ₽" : "Цена за единицу, ₽",
                "money",
                true,
              ),
              ...(!purchase
                ? [
                    F("discountPercent", "Скидка, %", "number"),
                    F("adjustmentCents", "Корректировка, ₽", "money"),
                    ...(line.adjustmentCents
                      ? [
                          F(
                            "adjustmentReason",
                            "Причина корректировки",
                            "text",
                            true,
                          ),
                        ]
                      : []),
                  ]
                : []),
            ].map((d) =>
              h(Field, {
                key: d.key,
                definition: d,
                value: line[d.key],
                onChange: (value) => update(index, d.key, value),
                data,
                disabled,
              }),
            ),
          ),
          line.stockSource === "warehouse" &&
            h(
              "p",
              { className: "fleet-ops-muted" },
              "При завершении стоимость этой детали определяется по средней стоимости складского остатка.",
            ),
          h(
            "div",
            { className: "fleet-ops-toolbar" },
            h(
              "strong",
              null,
              `Сумма: ${previewAmount(line, purchase, disabled) === null ? "Проверьте значения" : money(previewAmount(line, purchase, disabled))}`,
            ),
            !disabled &&
              button("Удалить позицию", () =>
                onChange(rows.filter((_, i) => i !== index)),
              ),
          ),
        ),
      ),
    );
  }
  function Editor({
    kind,
    record,
    onSave,
    onClose,
    busy,
    error,
    data,
    disabled,
    driver = false,
  }) {
    const [draft, setDraft] = useState(() => structuredClone(record));
    const defs = (FIELDS[kind] || []).filter(
      (d) => !driver || d.key !== "driverUserId",
    );
    const change = (key, value) =>
      setDraft((old) => ({ ...old, [key]: value }));
    return h(
      Modal,
      {
        title: `${record.version ? "Карточка" : "Новая запись"} · ${LABEL[kind]}`,
        onClose,
        busy,
      },
      h(
        "form",
        {
          onSubmit: (e) => {
            e.preventDefault();
            onSave(draft);
          },
        },
        error && h("p", { className: "error", role: "alert" }, error),
        h(
          "div",
          { className: "fleet-ops-form-grid" },
          ...defs.map((d) =>
            h(Field, {
              key: d.key,
              definition: d,
              value: draft[d.key],
              onChange: (value) => change(d.key, value),
              data,
              disabled: disabled || busy,
            }),
          ),
          kind !== "driverReports" &&
            h(Field, {
              definition: F("notes", "Примечание", "textarea"),
              value: draft.notes,
              onChange: (value) => change("notes", value),
              data,
              disabled: disabled || busy,
            }),
        ),
        ["orders", "purchases"].includes(kind) &&
          h(LineEditor, {
            kind,
            rows: draft.lines || [],
            onChange: (lines) => change("lines", lines),
            data,
            disabled: disabled || busy,
          }),
        kind === "maintenance" &&
          h(
            "p",
            { className: "fleet-ops-muted" },
            "Срок наступает по первому из условий: дате или пробегу. Для повтора укажите интервал и последнее выполненное ТО.",
          ),
        kind === "driverReports" &&
          draft.resolution &&
          h("p", null, `Результат: ${draft.resolution}`),
        disabled &&
          h(
            "p",
            { className: "fleet-ops-muted" },
            "Документ доступен для просмотра. Проведённые движения сохраняются в истории.",
          ),
        h(
          "footer",
          null,
          button("Отмена", onClose, { disabled: busy }),
          !disabled &&
            h(
              "button",
              { type: "submit", className: "button primary", disabled: busy },
              busy ? "Сохраняем…" : "Сохранить",
            ),
        ),
      ),
    );
  }
  function Workspace({
    view = "orders",
    token,
    actor,
    onExpired,
    onDirtyChange,
    responsibilityScopeId: scopeId,
    canWrite,
  }) {
    const [tab, setTab] = useState(
        view === "maintenance" ? "maintenance" : "orders",
      ),
      [data, setData] = useState(EMPTY),
      [loaded, setLoaded] = useState(false),
      [loading, setLoading] = useState(false),
      [error, setError] = useState(""),
      [notice, setNotice] = useState(""),
      [query, setQuery] = useState(""),
      [visible, setVisible] = useState(100),
      [form, setForm] = useState(null),
      [formError, setFormError] = useState(""),
      [busy, setBusy] = useState(false),
      [action, setAction] = useState(null),
      [opening, setOpening] = useState(null);
    const gen = useRef(0),
      alive = useRef(true),
      currentScope = useRef(scopeId),
      busyRef = useRef(false),
      callbacks = useRef({ onExpired, onDirtyChange });
    callbacks.current = { onExpired, onDirtyChange };
    currentScope.current = scopeId;
    const fail = (e) => {
      if (e?.status === 401) callbacks.current.onExpired?.();
      return e?.message || "Не удалось выполнить действие.";
    };
    useEffect(() => {
      alive.current = true;
      return () => {
        alive.current = false;
        gen.current++;
        callbacks.current.onDirtyChange?.(false);
      };
    }, []);
    useEffect(() => {
      callbacks.current.onDirtyChange?.(Boolean(form || action || opening));
      const listener = (e) => {
        if (form || action || opening) {
          e.preventDefault();
          e.returnValue = "";
        }
      };
      window.addEventListener("beforeunload", listener);
      return () => window.removeEventListener("beforeunload", listener);
    }, [form, action, opening]);
    async function load(target = scopeId, signal) {
      const generation = ++gen.current;
      setLoading(true);
      try {
        const result = await request(
          `/fleet-operations?responsibilityScopeId=${encodeURIComponent(target)}`,
          { signal },
          token,
        );
        if (
          alive.current &&
          currentScope.current === target &&
          generation === gen.current
        ) {
          setData({ ...EMPTY(), ...result });
          setLoaded(true);
          setError("");
        }
      } catch (e) {
        if (!signal?.aborted && alive.current && generation === gen.current)
          setError(fail(e));
      } finally {
        if (alive.current && generation === gen.current) setLoading(false);
      }
    }
    useEffect(() => {
      const c = new AbortController();
      setData(EMPTY());
      setLoaded(false);
      setForm(null);
      setOpening(null);
      setAction(null);
      setNotice("");
      setQuery("");
      if (scopeId) load(scopeId, c.signal);
      return () => {
        c.abort();
        gen.current++;
      };
    }, [scopeId, token]);
    function switchTab(key) {
      if (
        (form || action || opening) &&
        !window.confirm("Есть несохранённая форма. Закрыть её?")
      )
        return;
      setForm(null);
      setAction(null);
      setOpening(null);
      setTab(key);
      setQuery("");
      setVisible(100);
    }
    async function mutation(path, body, success) {
      if (busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      setFormError("");
      setError("");
      const target = scopeId;
      try {
        const result = await request(
          path,
          {
            method: path.match(
              /\/(vehicles|contractors|parts|warehouses|orders|maintenance|purchases|fuel|assignments|driverReports)$/,
            )
              ? "PUT"
              : "POST",
            body: JSON.stringify({ ...body, responsibilityScopeId: target }),
          },
          token,
        );
        if (alive.current && currentScope.current === target) {
          setForm(null);
          setAction(null);
          setOpening(null);
          setNotice(typeof success === "function" ? success(result) : success);
          await load(target);
        }
      } catch (e) {
        if (alive.current && currentScope.current === target) {
          setFormError(fail(e));
          setError(fail(e));
          if (e.status === 409) await load(target);
        }
      } finally {
        busyRef.current = false;
        if (alive.current) setBusy(false);
      }
    }
    function openEditor(kind, row) {
      setFormError("");
      setForm({ kind, record: row || fresh(kind) });
    }
    const vehicle = (id) =>
      data.records.vehicles.find((v) => v.id === id)?.plate ||
      "Автомобиль не найден";
    const supplier = (id) =>
      data.records.contractors.find((v) => v.id === id)?.name || "Не указан";
    const driver = (id) =>
      data.drivers.find((v) => v.id === id)?.displayName || "Водитель";
    const total = (rows) =>
      rows.reduce(
        (s, l) =>
          s +
          (l.amountCents ??
            Math.round((l.quantity || 0) * (l.unitCostCents || 0))),
        0,
      );
    function summary(kind, row) {
      switch (kind) {
        case "vehicles":
          return `${row.brand || ""} ${row.group || ""} · ${num(row.odometerKm)} км`;
        case "orders":
          return `${vehicle(row.vehicleId)} · ${row.openedOn} · ${money(total(row.lines || []))}`;
        case "maintenance": {
          const due = data.maintenance.find((x) => x.id === row.id);
          return `${vehicle(row.vehicleId)} · ${due?.dueOn || "По пробегу"}${due?.dueOdometerKm != null ? " · " + num(due.dueOdometerKm) + " км" : ""}`;
        }
        case "purchases":
          return `${supplier(row.contractorId)} · ${row.orderedOn} · ${money(total(row.lines || []))}`;
        case "fuel":
          return `${vehicle(row.vehicleId)} · ${row.date} · ${num(row.litres)} л · ${money(row.amountCents)}`;
        case "assignments":
          return `${vehicle(row.vehicleId)} · ${driver(row.driverUserId)} · ${row.startsOn}–${row.endsOn || "бессрочно"}`;
        case "driverReports":
          return `${vehicle(row.vehicleId)} · ${driver(row.driverUserId)} · ${row.reportedOn}`;
        case "parts":
          return `${row.sku || "Без артикула"} · ${row.unit} · минимум ${num(row.minStock)}`;
        case "contractors":
          return [row.phone, row.email].filter(Boolean).join(" · ");
        default:
          return row.notes || "";
      }
    }
    function beginAction(kind, row, verb, label) {
      setFormError("");
      setAction({
        kind,
        row,
        action: verb,
        label,
        idempotencyKey: crypto.randomUUID(),
        completedOn: TODAY(),
        resolution: "",
      });
    }
    function actions(kind, row) {
      if (!canWrite) return [];
      const result = [];
      if (kind === "orders") {
        if (row.status === "draft") result.push(["start", "Начать"]);
        if (["draft", "in_progress"].includes(row.status))
          result.push(["complete", "Завершить"], ["cancel", "Отменить"]);
      }
      if (kind === "purchases") {
        if (row.status === "draft") result.push(["order", "Заказать"]);
        if (row.status === "ordered")
          result.push(["receive", "Принять на склад"]);
        if (["draft", "ordered"].includes(row.status))
          result.push(["cancel", "Отменить"]);
      }
      if (kind === "driverReports") {
        if (row.status === "new")
          result.push(["accept", "Принять"], ["reject", "Отклонить"]);
        if (row.status === "accepted") result.push(["resolve", "Решить"]);
      }
      return result.map(([verb, label]) =>
        button(label, () => beginAction(kind, row, verb, label), {
          key: verb,
          disabled: busy,
        }),
      );
    }
    const rows = (data.records[tab] || []).filter(
      (row) =>
        !query ||
        `${recordName(tab, row, data)} ${summary(tab, row)} ${row.notes || ""}`
          .toLocaleLowerCase("ru")
          .includes(query.toLocaleLowerCase("ru")),
    );
    const stock = data.stock.filter(
      (s) =>
        !query ||
        `${data.records.parts.find((p) => p.id === s.partId)?.name || ""} ${data.records.warehouses.find((w) => w.id === s.warehouseId)?.name || ""}`
          .toLocaleLowerCase("ru")
          .includes(query.toLocaleLowerCase("ru")),
    );
    return h(
      "section",
      { className: "fleet-ops" },
      h(
        "nav",
        { className: "fleet-ops-nav", "aria-label": "Управление автопарком" },
        ...NAV.map(([key, label]) =>
          button(label, () => switchTab(key), {
            key,
            "aria-pressed": tab === key,
            className: `button ${tab === key ? "primary" : ""}`,
          }),
        ),
      ),
      h(
        "div",
        { className: "fleet-ops-toolbar" },
        h(
          "div",
          null,
          h("h2", null, LABEL[tab]),
          h(
            "p",
            { className: "fleet-ops-muted" },
            tab === "orders"
              ? "Новые ремонты и обслуживание. Импортированная история доступна в разделе «Позиции»."
              : tab === "stock"
                ? "Остатки меняются при приёмке закупки и завершении ремонта."
                : tab === "fuel"
                  ? "Заправки учитываются отдельно от расходов на ремонт."
                  : tab === "assignments"
                    ? "Назначенные водители могут отправлять заявки из своего кабинета."
                    : tab === "maintenance"
                      ? "«Скоро»: осталось не более 14 дней или 1 000 км."
                      : "",
          ),
        ),
        h(
          "div",
          { className: "fleet-ops-actions" },
          button("Обновить", () => load(), { disabled: loading || busy }),
          canWrite &&
            tab !== "stock" &&
            button("Добавить", () => openEditor(tab), {
              className: "button primary",
              disabled: !loaded || busy,
            }),
          canWrite &&
            tab === "stock" &&
            button(
              "Начальный остаток",
              () => {
                setFormError("");
                setOpening({
                  idempotencyKey: crypto.randomUUID(),
                  partId: "",
                  warehouseId: "",
                  quantity: 1,
                  unitCostCents: 0,
                  reason: "",
                });
              },
              { disabled: !loaded || busy },
            ),
          canWrite &&
            tab === "vehicles" &&
            button(
              "Из загруженной истории",
              () =>
                mutation(
                  "/fleet-operations/vehicles/import",
                  { idempotencyKey: crypto.randomUUID() },
                  (r) =>
                    `Создано карточек: ${r.created}. Уже существовало: ${r.existing}.`,
                ),
              { disabled: !loaded || busy },
            ),
        ),
      ),
      error && h("p", { className: "error", role: "alert" }, error),
      notice &&
        h("p", { className: "fleet-ops-notice", role: "status" }, notice),
      loading && h("p", { role: "status" }, "Загружаем данные…"),
      h(
        "label",
        { className: "fleet-ops-search" },
        "Поиск",
        h("input", {
          "aria-label": "Поиск в управлении автопарком",
          value: query,
          onChange: (e) => {
            setQuery(e.target.value);
            setVisible(100);
          },
          placeholder: "Номер, автомобиль, наименование",
        }),
      ),
      loaded &&
        tab === "stock" &&
        h(
          "div",
          { className: "fleet-ops-table-wrap" },
          h(
            "table",
            { className: "fleet-ops-table" },
            h(
              "thead",
              null,
              h(
                "tr",
                null,
                ...[
                  "Запчасть",
                  "Склад",
                  "Остаток",
                  "Стоимость",
                  "Пополнение",
                ].map((s) => h("th", { key: s }, s)),
              ),
            ),
            h(
              "tbody",
              null,
              ...stock.slice(0, visible).map((s) => {
                const part = data.records.parts.find((p) => p.id === s.partId);
                return h(
                  "tr",
                  { key: `${s.partId}:${s.warehouseId}` },
                  h("td", null, part?.name || s.partId),
                  h(
                    "td",
                    null,
                    data.records.warehouses.find((w) => w.id === s.warehouseId)
                      ?.name || s.warehouseId,
                  ),
                  h("td", null, `${num(s.quantity)} ${part?.unit || ""}`),
                  h("td", null, money(s.amountCents)),
                  h(
                    "td",
                    null,
                    s.quantity < (part?.minStock || 0)
                      ? h(
                          "strong",
                          { className: "fleet-ops-warning" },
                          "Ниже минимума",
                        )
                      : "—",
                  ),
                );
              }),
            ),
          ),
        ),
      loaded &&
        tab !== "stock" &&
        h(
          "div",
          { className: "fleet-ops-table-wrap" },
          h(
            "table",
            { className: "fleet-ops-table" },
            h(
              "thead",
              null,
              h(
                "tr",
                null,
                h("th", null, "Запись"),
                h("th", null, "Сведения"),
                h("th", null, "Состояние"),
                h("th", null, "Действия"),
              ),
            ),
            h(
              "tbody",
              null,
              ...rows.slice(0, visible).map((row) => {
                const due =
                  tab === "maintenance"
                    ? data.maintenance.find((x) => x.id === row.id)
                    : null;
                return h(
                  "tr",
                  { key: row.id },
                  h(
                    "td",
                    null,
                    button(
                      recordName(tab, row, data),
                      () => openEditor(tab, row),
                      { className: "fleet-ops-link" },
                    ),
                  ),
                  h("td", null, summary(tab, row)),
                  h(
                    "td",
                    null,
                    STATUS[due?.status || row.status] ||
                      (row.active === false ? "Отключено" : "—"),
                  ),
                  h(
                    "td",
                    null,
                    h(
                      "div",
                      { className: "fleet-ops-actions" },
                      ...actions(tab, row),
                      canWrite &&
                        tab === "maintenance" &&
                        row.active !== false &&
                        button("Создать заказ-наряд", () => {
                          const draft = {
                            ...fresh("orders"),
                            vehicleId: row.vehicleId,
                            maintenanceId: row.id,
                            complaint: row.title,
                          };
                          setForm({ kind: "orders", record: draft });
                        }),
                      canWrite &&
                        tab === "driverReports" &&
                        row.type === "defect" &&
                        !row.orderId &&
                        row.status === "accepted" &&
                        button("Создать заказ-наряд", () =>
                          setForm({
                            kind: "orders",
                            record: {
                              ...fresh("orders"),
                              vehicleId: row.vehicleId,
                              driverReportId: row.id,
                              complaint: row.description,
                              odometerKm: row.odometerKm,
                            },
                          }),
                        ),
                    ),
                  ),
                );
              }),
            ),
          ),
        ),
      loaded &&
        !(tab === "stock" ? stock : rows).length &&
        h(
          "p",
          { className: "fleet-ops-empty" },
          query
            ? "По вашему запросу записей нет."
            : "Записей пока нет. Добавьте первую запись или загрузите историю.",
        ),
      loaded &&
        (tab === "stock" ? stock : rows).length > visible &&
        button(
          `Показать ещё · всего ${(tab === "stock" ? stock : rows).length}`,
          () => setVisible((n) => n + 100),
        ),
      tab === "fuel" &&
        loaded &&
        h(
          "p",
          { className: "fleet-ops-muted" },
          `По видимому отбору: ${num(rows.reduce((n, r) => n + r.litres, 0))} л, ${money(rows.reduce((n, r) => n + r.amountCents, 0))}. Расход л/100 км не рассчитывается без подтверждённого пробега и сопоставимых заправок.`,
        ),
      form &&
        h(Editor, {
          key: form.record.id,
          kind: form.kind,
          record: form.record,
          data,
          busy,
          error: formError,
          disabled: !canWrite || readonly(form.kind, form.record),
          onClose: () => setForm(null),
          onSave: (draft) =>
            mutation(
              `/fleet-operations/${form.kind}`,
              draft,
              "Запись сохранена.",
            ),
        }),
      action &&
        h(
          Modal,
          {
            title: `${action.label} · ${recordName(action.kind, action.row, data)}`,
            onClose: () => setAction(null),
            busy,
          },
          h(
            "form",
            {
              onSubmit: (e) => {
                e.preventDefault();
                mutation(
                  `/fleet-operations/${action.kind}/${action.row.id}/action`,
                  {
                    version: action.row.version,
                    action: action.action,
                    idempotencyKey: action.idempotencyKey,
                    ...(action.action === "complete"
                      ? { completedOn: action.completedOn }
                      : {}),
                    resolution: action.resolution,
                  },
                  "Действие выполнено.",
                );
              },
            },
            formError &&
              h("p", { className: "error", role: "alert" }, formError),
            h(
              "p",
              null,
              action.action === "complete"
                ? "Работы войдут в закрытые ремонты. Запчасти со склада спишутся одной операцией."
                : action.action === "receive"
                  ? "Все позиции закупки поступят на выбранный склад. Повторное проведение не создаст дублей."
                  : action.action === "accept" && action.row.type === "fuel"
                    ? "Подтверждённая заправка появится в учёте топлива."
                    : "Изменение сохранится в истории документа.",
            ),
            action.action === "complete" &&
              h(Field, {
                definition: F("completedOn", "Дата завершения", "date", true),
                value: action.completedOn,
                onChange: (value) =>
                  setAction((a) => ({ ...a, completedOn: value })),
                data,
              }),
            h(Field, {
              definition: F(
                "resolution",
                "Результат / причина",
                "textarea",
                ["resolve", "reject"].includes(action.action),
              ),
              value: action.resolution,
              onChange: (value) =>
                setAction((a) => ({ ...a, resolution: value })),
              data,
            }),
            h(
              "footer",
              null,
              button("Назад", () => setAction(null), { disabled: busy }),
              h(
                "button",
                { type: "submit", className: "button primary", disabled: busy },
                busy ? "Выполняем…" : action.label,
              ),
            ),
          ),
        ),
      opening &&
        h(
          Modal,
          {
            title: "Начальный остаток запчасти",
            onClose: () => setOpening(null),
            busy,
          },
          h(
            "form",
            {
              onSubmit: (e) => {
                e.preventDefault();
                mutation(
                  "/fleet-operations/stock/opening",
                  opening,
                  "Начальный остаток записан.",
                );
              },
            },
            formError &&
              h("p", { className: "error", role: "alert" }, formError),
            h(
              "p",
              null,
              "Укажите фактическое количество и стоимость по инвентаризации. История ремонтов не определяет текущий остаток.",
            ),
            h(
              "div",
              { className: "fleet-ops-form-grid" },
              ...[
                F("partId", "Запчасть", "parts", true),
                F("warehouseId", "Склад", "warehouses", true),
                F("quantity", "Количество", "number", true),
                F("unitCostCents", "Стоимость единицы, ₽", "money", true),
                F("reason", "Основание / документ", "textarea", true),
              ].map((d) =>
                h(Field, {
                  key: d.key,
                  definition: d,
                  value: opening[d.key],
                  onChange: (value) =>
                    setOpening((p) => ({ ...p, [d.key]: value })),
                  data,
                }),
              ),
            ),
            h(
              "footer",
              null,
              h(
                "button",
                { type: "submit", className: "button primary", disabled: busy },
                busy ? "Сохраняем…" : "Записать остаток",
              ),
            ),
          ),
        ),
    );
  }
  Workspace.Driver = function DriverWorkspace({
    token,
    actor,
    onExpired,
    onDirtyChange,
  }) {
    const [data, setData] = useState({ assignments: [], reports: [] }),
      [error, setError] = useState(""),
      [loading, setLoading] = useState(true),
      [form, setForm] = useState(null),
      [busy, setBusy] = useState(false),
      [notice, setNotice] = useState("");
    const alive = useRef(true),
      busyRef = useRef(false);
    const fail = (e) => {
      if (e.status === 401) onExpired?.();
      return e.message || "Не удалось выполнить действие.";
    };
    async function load() {
      setLoading(true);
      try {
        const r = await request("/fleet-operations/driver", {}, token);
        if (alive.current) {
          setData(r);
          setError("");
        }
      } catch (e) {
        if (alive.current) setError(fail(e));
      } finally {
        if (alive.current) setLoading(false);
      }
    }
    useEffect(() => {
      alive.current = true;
      load();
      return () => {
        alive.current = false;
        onDirtyChange?.(false);
      };
    }, [token]);
    useEffect(() => {
      onDirtyChange?.(Boolean(form));
    }, [Boolean(form)]);
    const vehicles = data.assignments.map((a) => a.vehicle).filter(Boolean),
      editorData = {
        ...EMPTY(),
        records: { ...EMPTY().records, vehicles },
        drivers: [{ id: actor.id, displayName: actor.displayName }],
      };
    async function save(draft) {
      if (busyRef.current) return;
      const assignment = data.assignments.find(
        (a) => a.vehicleId === draft.vehicleId,
      );
      if (!assignment) {
        setError("Выберите назначенный автомобиль.");
        return;
      }
      busyRef.current = true;
      setBusy(true);
      try {
        await request(
          "/fleet-operations/driver/reports",
          {
            method: "POST",
            body: JSON.stringify({
              ...draft,
              driverUserId: undefined,
              status: undefined,
              notes: undefined,
              responsibilityScopeId: assignment.responsibilityScopeId,
            }),
          },
          token,
        );
        if (alive.current) {
          setForm(null);
          setNotice("Заявка отправлена ответственному за автопарк.");
          await load();
        }
      } catch (e) {
        if (alive.current) setError(fail(e));
      } finally {
        busyRef.current = false;
        if (alive.current) setBusy(false);
      }
    }
    const assignmentCards = data.assignments.map((a) =>
      h(
        "article",
        { key: a.id },
        h("h3", null, a.vehicle?.plate || "Автомобиль"),
        h("p", null, a.vehicle?.model || a.vehicle?.brand || ""),
        h(
          "div",
          { className: "fleet-ops-actions" },
          ...[
            ["defect", "Сообщить о неисправности"],
            ["fuel", "Записать заправку"],
            ["odometer", "Передать пробег"],
          ].map(([type, label]) =>
            button(
              label,
              () => {
                setError("");
                setForm({
                  ...fresh("driverReports"),
                  type,
                  vehicleId: a.vehicleId,
                });
              },
              { key: type },
            ),
          ),
        ),
      ),
    );
    const reportCards = data.reports.map((r) =>
      h(
        "article",
        { className: "fleet-ops-driver-report", key: r.id },
        h("strong", null, `${r.reportedOn} · ${STATUS[r.status] || r.status}`),
        h(
          "p",
          null,
          r.description ||
            { fuel: "Заправка", odometer: "Показание одометра" }[r.type],
        ),
        r.resolution && h("p", null, `Результат: ${r.resolution}`),
      ),
    );
    return h(
      "section",
      { className: "fleet-ops" },
      h(
        "div",
        { className: "fleet-ops-toolbar" },
        h("h2", null, "Мой автомобиль"),
        button("Обновить", load, { disabled: loading }),
      ),
      error && h("p", { role: "alert", className: "error" }, error),
      notice &&
        h("p", { role: "status", className: "fleet-ops-notice" }, notice),
      loading
        ? h("p", null, "Загружаем назначения…")
        : !vehicles.length
          ? h(
              "p",
              null,
              "Активных назначений нет. Ответственный за автопарк должен назначить вам автомобиль.",
            )
          : h(
              "div",
              { className: "fleet-ops-driver-vehicles" },
              ...assignmentCards,
            ),
      h("h3", null, "Мои заявки"),
      ...reportCards,
      !data.reports.length && h("p", null, "Заявок пока нет."),
      form &&
        h(Editor, {
          key: form.id,
          kind: "driverReports",
          record: form,
          data: editorData,
          busy,
          error,
          driver: true,
          onClose: () => setForm(null),
          onSave: save,
        }),
    );
  };
  return Workspace;
}
