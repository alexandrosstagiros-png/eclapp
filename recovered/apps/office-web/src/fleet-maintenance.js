// SPDX-License-Identifier: MIT
// Native fleet workspace. Source rows, aggregates and write versions belong to the API.
const API = "/fleet-maintenance";
const FILTERS = {
  dateFrom: "",
  dateTo: "",
  dateBasis: "completed",
  vehicleGroup: "",
  vehicleKey: "",
  group: "",
  node: "",
  positionType: "",
  positionName: "",
  supplier: "",
  search: "",
  orderId: "",
  issueCode: "",
  status: "all",
  page: 1,
  pageSize: 50,
};
const TABS = [
  ["overview", "Обзор"],
  ["positions", "Позиции"],
  ["quality", "Качество данных"],
  ["reconciliation", "Сверка"],
  ["history", "История загрузок"],
];
const number = (value) =>
  new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(
    value ?? 0,
  );
const money = (value) =>
  value == null
    ? "—"
    : new Intl.NumberFormat("ru-RU", {
        style: "currency",
        currency: "RUB",
        maximumFractionDigits: 2,
      }).format(value / 100);
const percent = (value) =>
  value == null
    ? "—"
    : new Intl.NumberFormat("ru-RU", {
        style: "percent",
        maximumFractionDigits: 1,
      }).format(value);
const date = (value, time = false) => {
  if (!value) return "—";
  const parsed = new Date(
    time ? value : `${String(value).slice(0, 10)}T12:00:00`,
  );
  return Number.isNaN(parsed.getTime())
    ? String(value)
    : new Intl.DateTimeFormat(
        "ru-RU",
        time
          ? {
              day: "2-digit",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            }
          : { day: "2-digit", month: "short", year: "numeric" },
      ).format(parsed);
};
const normalizePlate = (value) => String(value || "").normalize("NFKC").trim().toLowerCase().replace(/[\s\-]/g, "")
  .replace(/[abekmhopctyx]/g, letter => ({ a: "а", b: "в", e: "е", k: "к", m: "м", h: "н", o: "о", p: "р", c: "с", t: "т", y: "у", x: "х" })[letter]);
const queryFor = (scopeId, filters = {}, exportAll = false) => {
  const query = new URLSearchParams({ responsibilityScopeId: "company" });
  for (const [key, value] of Object.entries(filters))
    if (
      value !== "" &&
      value != null &&
      !(exportAll && ["page", "pageSize"].includes(key))
    )
      query.set(key, String(value));
  return query.toString();
};
const emptyLink = () => ({
  plate: "",
  vehicleKey: "",
  canonicalPlate: "",
  reason: "",
  confirmed: false,
  unlink: false,
});
const dateError = (filters) =>
  filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo
    ? "Начало периода позже конца. Исправьте даты для расчёта."
    : "";

export function createFleetMaintenanceWorkspace(
  React,
  { request, authenticatedFetch, OperationsWorkspace },
) {
  const { createElement: h, useEffect, useRef, useState } = React;
  const button = (label, onClick, props = {}) =>
    h(
      "button",
      { type: "button", className: "button", onClick, ...props },
      label,
    );
  const field = (label, input, hint) =>
    h(
      "label",
      { className: "fleet-field" },
      h("span", null, label),
      React.cloneElement(input, {
        "aria-label": input.props["aria-label"] || label,
      }),
      hint && h("small", null, hint),
    );
  const empty = (title, description, action) =>
    h(
      "div",
      { className: "fleet-empty" },
      h("h3", null, title),
      h("p", null, description),
      action,
    );
  const loading = (text) =>
    h(
      "div",
      { className: "fleet-loading", role: "status" },
      h("span", { className: "fleet-spinner", "aria-hidden": true }),
      text,
    );
  const panelHeading = (title, subtitle, action) =>
    h(
      "header",
      { className: "fleet-panel-heading" },
      h("div", null, h("h2", null, title), subtitle && h("p", null, subtitle)),
      action,
    );
  const select = (value, options, onChange, label = "Все", disabled = false) =>
    h(
      "select",
      { value, onChange: (event) => onChange(event.target.value), disabled },
      label != null && h("option", { value: "" }, label),
      value &&
        !options.some((item) => String(item.key) === String(value)) &&
        h("option", { value }, `${value} — выбранный фильтр`),
      ...options.map((item) =>
        h("option", { key: item.key, value: item.key }, item.label),
      ),
    );

  function Dialog({ title, children, onClose, busy }) {
    const ref = useRef(null),
      callbacks = useRef({ onClose, busy });
    callbacks.current = { onClose, busy };
    useEffect(() => {
      const previous = document.activeElement,
        element = ref.current;
      element?.querySelector("button, input, select, textarea")?.focus();
      const keydown = (event) => {
        if (event.key === "Escape" && !callbacks.current.busy) {
          event.preventDefault();
          callbacks.current.onClose();
        }
        if (event.key === "Tab") {
          const nodes = [
            ...element.querySelectorAll(
              "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]",
            ),
          ].filter((node) => node.offsetParent !== null);
          const first = nodes[0],
            last = nodes[nodes.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }
      };
      element?.addEventListener("keydown", keydown);
      return () => {
        element?.removeEventListener("keydown", keydown);
        if (previous?.isConnected) previous.focus?.();
      };
    }, []);
    return h(
      "div",
      { className: "fleet-overlay" },
      h(
        "section",
        {
          className: "fleet-dialog",
          role: "dialog",
          "aria-modal": true,
          "aria-labelledby": "fleet-dialog-title",
          ref,
        },
        h(
          "header",
          { className: "fleet-dialog-heading" },
          h("h2", { id: "fleet-dialog-title" }, title),
          button("Закрыть", onClose, { disabled: busy }),
        ),
        h("div", { className: "fleet-dialog-body" }, children),
      ),
    );
  }

  function Metrics({ summary, compact = false }) {
    if (!summary) return null;
    const cards = compact
      ? [
          ["Сумма позиций", money(summary.amountCents)],
          ["Позиций", number(summary.rowCount)],
          ["Заказ-нарядов", number(summary.orderCount)],
          ["Машин", number(summary.vehicleCount)],
        ]
      : [
          [
            "Затраты на обслуживание",
            money(summary.amountCents),
            "По всем позициям выбранного среза",
            "primary",
          ],
          [
            "Работы",
            money(summary.laborCents),
            `${percent(summary.laborShare)} от затрат`,
          ],
          [
            "Запчасти",
            money(summary.partsCents),
            `В том числе шины: ${money(summary.tireCents)}`,
          ],
          [
            "Заказ-наряды",
            number(summary.orderCount),
            `Средний чек ${money(summary.averageOrderCents)}`,
          ],
          [
            "Машины в срезе",
            number(summary.vehicleCount),
            `${money(summary.averageVehicleCents)} на машину`,
          ],
        ];
    return h(
      "div",
      { className: `fleet-kpis${compact ? " is-compact" : ""}` },
      ...cards.map(([label, value, hint, accent]) =>
        h(
          "article",
          { key: label, className: `fleet-kpi${accent ? " is-primary" : ""}` },
          h("span", null, label),
          h("strong", null, value),
          hint && h("small", null, hint),
        ),
      ),
    );
  }

  function MonthChart({ items, onMonth }) {
    if (!items.length)
      return empty(
        "Нет динамики за период",
        "Измените фильтры или загрузите позиции с датами.",
      );
    const width = Math.max(660, items.length * 76),
      height = 230,
      top = 15,
      bottom = 185;
    const max = Math.max(0, ...items.map((item) => item.amountCents)),
      min = Math.min(0, ...items.map((item) => item.amountCents));
    const span = max - min || 1,
      y = (value) => top + ((max - value) / span) * (bottom - top),
      baseline = y(0);
    return h(
      "div",
      { className: "fleet-months" },
      h(
        "div",
        {
          className: "fleet-chart-scroll",
          tabIndex: 0,
          "aria-label": "Динамика затрат по месяцам; таблица значений ниже",
        },
        h(
          "svg",
          {
            viewBox: `0 0 ${width} ${height}`,
            style: { minWidth: `${width}px` },
            role: "img",
            "aria-label":
              "Сумма позиций по месяцам. Отрицательные суммы показаны ниже нулевой линии.",
          },
          h("line", {
            x1: 10,
            x2: width - 10,
            y1: baseline,
            y2: baseline,
            className: "fleet-chart-axis",
          }),
          ...items.map((item, index) => {
            const x = 22 + (index * (width - 30)) / items.length,
              barWidth = Math.min(42, (width - 30) / items.length - 20),
              valueY = y(item.amountCents);
            return h(
              "g",
              { key: item.key },
              h(
                "title",
                null,
                `${item.label || item.key}: ${money(item.amountCents)}`,
              ),
              h("rect", {
                x,
                y: Math.min(valueY, baseline),
                width: barWidth,
                height: Math.max(1, Math.abs(valueY - baseline)),
                rx: 4,
                className:
                  item.amountCents < 0
                    ? "fleet-chart-bar is-negative"
                    : "fleet-chart-bar",
              }),
              h(
                "text",
                {
                  x: x + barWidth / 2,
                  y: 210,
                  textAnchor: "middle",
                  className: "fleet-chart-label",
                },
                item.key || "Без даты",
              ),
            );
          }),
        ),
      ),
      h(
        "div",
        { className: "fleet-month-values" },
        ...items.map((item) =>
          button(
            h(
              React.Fragment,
              null,
              h("span", null, item.label || item.key),
              h("strong", null, money(item.amountCents)),
            ),
            () => onMonth(item.key),
            {
              key: item.key,
              className: "fleet-month-value",
              disabled: !/^\d{4}-\d{2}$/.test(item.key),
              "aria-label": `Позиции: ${item.label || item.key}, ${money(item.amountCents)}`,
            },
          ),
        ),
      ),
    );
  }

  function Distribution({ items, onSelect }) {
    const max = Math.max(1, ...items.map((item) => Math.abs(item.amountCents)));
    return items.length
      ? h(
          "div",
          { className: "fleet-distribution" },
          ...items.map((item) =>
            button(
              h(
                React.Fragment,
                null,
                h(
                  "span",
                  { className: "fleet-distribution-line" },
                  h("span", null, item.label),
                  h("strong", null, money(item.amountCents)),
                ),
                h(
                  "span",
                  { className: "fleet-bar-track", "aria-hidden": true },
                  h("span", {
                    style: {
                      width: `${(Math.abs(item.amountCents) / max) * 100}%`,
                    },
                    className: item.amountCents < 0 ? "is-negative" : "",
                  }),
                ),
                h(
                  "small",
                  null,
                  `${percent(item.share)} от суммы · ${number(item.rowCount)} позиций`,
                ),
              ),
              () => onSelect(item),
              { key: item.key, className: "fleet-distribution-item" },
            ),
          ),
        )
      : empty("Нет групп затрат", "Для выбранных фильтров позиции не найдены.");
  }

  function CostTree({ items, drill }) {
    const [expanded, setExpanded] = useState({});
    const branch = (item, level, path) => {
      let exactName = item.label;
      if (level === 2) {
        try {
          exactName = JSON.parse(item.key)[0];
        } catch {
          /* Older responses still have a usable label. */
        }
      }
      const next = {
        ...path,
        ...(level === 0
          ? { group: item.key || "__missing__" }
          : level === 1
            ? { node: item.key || "__missing__" }
            : {
                positionName: exactName || "__missing__",
                positionType: item.positionType || "",
                search: "",
              }),
      };
      const branchKey = JSON.stringify([level, path, item.key]);
      const label = h(
        "span",
        { className: "fleet-tree-label" },
        h("span", null, item.label),
        h("strong", null, money(item.amountCents)),
        h("small", null, `${number(item.rowCount)} поз.`),
      );
      return item.children?.length
        ? h(
            "details",
            {
              key: branchKey,
              className: "fleet-tree-branch",
              open: Boolean(expanded[branchKey]),
              onToggle: (event) => {
                const open = event.currentTarget.open;
                setExpanded((previous) =>
                  previous[branchKey] === open
                    ? previous
                    : { ...previous, [branchKey]: open },
                );
              },
            },
            h("summary", null, label),
            expanded[branchKey] &&
              h(
                "div",
                { className: "fleet-tree-children" },
                button("Открыть все позиции", () => drill(next), {
                  className: "fleet-text-button",
                }),
                ...item.children.map((child) => branch(child, level + 1, next)),
              ),
          )
        : button(label, () => drill(next), {
            key: branchKey,
            className: "fleet-tree-leaf",
          });
    };
    return items.length
      ? h(
          "div",
          { className: "fleet-tree" },
          ...items.map((item) => branch(item, 0, {})),
        )
      : empty("Дерево пусто", "Измените выбранные фильтры.");
  }

  function Ranked({ analytics, drill }) {
    const [kind, setKind] = useState("vehicles"),
      [page, setPage] = useState(1);
    const choices = [
      ["vehicles", "Машины"],
      ["positions", "Позиции"],
      ["suppliers", "Подрядчики"],
      ["groups", "Группы затрат"],
      ["vehicleGroups", "Марки / группы ТС"],
      ["nodes", "Узлы"],
    ];
    const items = analytics[kind] || [],
      pages = Math.max(1, Math.ceil(items.length / 50)),
      effectivePage = Math.min(page, pages);
    const filterFor = (item) =>
      ({
        vehicles: { vehicleKey: item.key },
        suppliers: { supplier: item.key },
        groups: { group: item.key || "__missing__" },
        vehicleGroups: { vehicleGroup: item.key || "__missing__" },
        nodes: { node: item.key || "__missing__" },
        positions: {
          positionName:
            item.name === "" ? "__missing__" : item.name || item.label,
          positionType: item.positionType || "",
          search: "",
        },
      })[kind];
    return h(
      "section",
      { className: "fleet-panel" },
      panelHeading(
        "Затраты в разрезах",
        "Полный рейтинг. Нажмите на строку, чтобы открыть исходные позиции.",
      ),
      h(
        "div",
        { className: "fleet-segment", "aria-label": "Разрез рейтинга" },
        ...choices.map(([key, label]) =>
          button(
            label,
            () => {
              setKind(key);
              setPage(1);
            },
            { key, "aria-pressed": kind === key },
          ),
        ),
      ),
      h(
        "div",
        { className: "fleet-table-wrap fleet-rank-wrap", tabIndex: 0 },
        h(
          "table",
          { className: "fleet-table" },
          h(
            "caption",
            null,
            `Всего в рейтинге: ${number(items.length)}. Сортировка по сумме, 50 записей на странице. Итоги рассчитаны по всем строкам.`,
          ),
          h(
            "thead",
            null,
            h(
              "tr",
              null,
              ...[
                "Место",
                "Название",
                "Сумма",
                "Работы",
                "Запчасти",
                "Позиций",
                "ЗН",
              ].map((label) => h("th", { key: label, scope: "col" }, label)),
            ),
          ),
          h(
            "tbody",
            null,
            ...items
              .slice((effectivePage - 1) * 50, effectivePage * 50)
              .map((item, index) =>
                h(
                  "tr",
                  { key: item.key },
                  h(
                    "td",
                    { className: "fleet-muted" },
                    (effectivePage - 1) * 50 + index + 1,
                  ),
                  h(
                    "td",
                    null,
                    button(item.label, () => drill(filterFor(item)), {
                      className: "fleet-text-button",
                    }),
                    (item.vehicleGroup || item.positionType) &&
                      h(
                        "small",
                        { className: "fleet-cell-note" },
                        item.vehicleGroup || item.positionType,
                      ),
                  ),
                  ...[
                    money(item.amountCents),
                    money(item.laborCents),
                    money(item.partsCents),
                    number(item.rowCount),
                    number(item.orderCount),
                  ].map((value, i) =>
                    h("td", { key: i, className: "fleet-numeric" }, value),
                  ),
                ),
              ),
            !items.length &&
              h(
                "tr",
                null,
                h(
                  "td",
                  { colSpan: 7, className: "fleet-table-empty" },
                  "В выбранном срезе нет записей.",
                ),
              ),
          ),
        ),
      ),
      pages > 1 &&
        h(
          "footer",
          { className: "fleet-pagination" },
          h("span", null, `Страница ${effectivePage} из ${number(pages)}`),
          h(
            "div",
            { className: "fleet-actions" },
            button("Предыдущие записи", () => setPage(effectivePage - 1), {
              disabled: effectivePage === 1,
            }),
            button("Следующие записи", () => setPage(effectivePage + 1), {
              disabled: effectivePage === pages,
            }),
          ),
        ),
    );
  }

  function PositionDialog({ row, close }) {
    const labels = [
      ["Строка источника", row.sourceRow],
      ["Номер заказ-наряда", row.orderNumber],
      ["ID заказ-наряда", row.orderId],
      ["Госномер", row.plate],
      ["Группа ТС", row.vehicleGroup],
      ["Бренд ТС", row.vehicleBrand],
      ["Год", row.vehicleYear],
      ["Тип ТС", row.vehicleType],
      ["Пробег, км", row.odometerKm == null ? null : number(row.odometerKm)],
      ["Открыт", date(row.openedOn)],
      ["Завершён", date(row.completedOn)],
      ["Статус источника", row.status],
      ["Группа затрат", row.group],
      ["Узел", row.node],
      ["Тип позиции", row.positionType],
      ["Наименование", row.name],
      ["Бренд запчасти", row.partBrand],
      ["Количество", row.quantity == null ? null : number(row.quantity)],
      ["Единица", row.unit],
      ["Цена за единицу", money(row.unitPriceCents)],
      ["Сумма источника", money(row.amountCents)],
      ["Подрядчик", row.supplier || "Не указан"],
      ["Своими силами — отметка источника", row.ownWorkReported ? "Да" : "Нет"],
      ["Шины", row.tire ? "Да" : "Нет"],
      ["Долив", row.topUp ? "Да" : "Нет"],
      ["Группа (авто)", row.autoGroup],
      ["Узел (авто)", row.autoNode],
    ];
    return h(
      Dialog,
      { title: `Позиция · строка ${row.sourceRow}`, onClose: close },
      h(
        "dl",
        { className: "fleet-detail-grid" },
        ...labels.map(([label, value]) =>
          h(
            "div",
            { key: label },
            h("dt", null, label),
            h("dd", null, value === "" || value == null ? "—" : value),
          ),
        ),
      ),
      row.issueCodes?.length > 0 &&
        h(
          "p",
          { className: "fleet-warning" },
          `Проверки строки: ${row.issueCodes.join(", ")}`,
        ),
    );
  }

  return function FleetMaintenanceWorkspace({
    token,
    actor,
    onExpired,
    onDirtyChange,
  }) {
    const [scopes, setScopes] = useState([]),
      [scopeId, setScopeId] = useState(""),
      [contextLoading, setContextLoading] = useState(true),
      [contextError, setContextError] = useState(""),
      [contextVersion, setContextVersion] = useState(0);
    const [data, setData] = useState(null),
      [dataLoading, setDataLoading] = useState(false),
      [error, setError] = useState(""),
      [notice, setNotice] = useState(""),
      [reload, setReload] = useState(0),
      [denied, setDenied] = useState(false);
    const [filters, setFilters] = useState({ ...FILTERS }),
      [tab, setTab] = useState("overview"),
      [busy, setBusy] = useState(""),
      [importOpen, setImportOpen] = useState(false),
      [file, setFile] = useState(null),
      [preview, setPreview] = useState(null),
      [activation, setActivation] = useState(null),
      [importError, setImportError] = useState("");
    const [history, setHistory] = useState(null),
      [reconciliation, setReconciliation] = useState(null),
      [auxLoading, setAuxLoading] = useState(false),
      [auxError, setAuxError] = useState("");
    const [link, setLink] = useState(emptyLink),
      [linkError, setLinkError] = useState(""),
      [selectedRow, setSelectedRow] = useState(null),
      [operationsDirty, setOperationsDirty] = useState(false);
    const mounted = useRef(true),
      scopeRef = useRef(""),
      authRef = useRef(token),
      loadSequence = useRef(0),
      mutationRef = useRef(false),
      callbacks = useRef({ onExpired, onDirtyChange });
    callbacks.current = { onExpired, onDirtyChange };
    scopeRef.current = scopeId;
    authRef.current = token;
    const currentScope = scopes.find(
        (item) => item.responsibilityScopeId === scopeId,
      ),
      canWrite = Boolean(currentScope?.canWrite && !denied);
    const invalidDates = dateError(filters),
      analytics =
        !dataLoading && !invalidDates && !denied ? data?.analytics : null;
    const options = data?.analytics?.options || {},
      dirty = Boolean(
        file ||
          preview ||
          activation ||
          link.plate ||
          link.reason ||
          operationsDirty,
      );
    const tabs = OperationsWorkspace
      ? [
          ["orders", "Заказ-наряды"],
          ["maintenance", "Автомобили и ТО"],
          ...TABS,
        ]
      : TABS;
    const operational = ["orders", "maintenance"].includes(tab);
    const failMessage = (reason) =>
      reason?.status === 401
        ? "Сессия завершена. Войдите снова."
        : reason?.status === 403
          ? "Доступ к финансовым данным изменился. Обновите страницу."
          : reason?.status === 409
            ? "Данные изменены другим сотрудником. Загрузите актуальное состояние и повторно проверьте действие."
            : reason?.message ||
              "Не удалось выполнить действие. Проверьте соединение и повторите попытку.";
    function handleAccess(reason) {
      if (reason?.status === 401) callbacks.current.onExpired?.();
      if ([401, 403].includes(reason?.status)) {
        loadSequence.current += 1;
        setData(null);
        setHistory(null);
        setReconciliation(null);
        setPreview(null);
        setActivation(null);
        setSelectedRow(null);
        setDenied(true);
      }
    }
    const current = (target) =>
      mounted.current &&
      scopeRef.current === target &&
      authRef.current === token;
    const changeFilter = (key, value) => {
      setSelectedRow(null);
      setFilters((previous) => ({
        ...previous,
        [key]: value,
        page: key === "page" ? value : 1,
      }));
    };
    const drill = (values) => {
      setFilters((previous) => ({ ...previous, ...values, page: 1 }));
      setTab("positions");
      setSelectedRow(null);
    };
    const resetFilters = () => {
      setFilters({ ...FILTERS });
      setSelectedRow(null);
    };
    const changeTab = (next) => {
      if (operationsDirty && operational && next !== tab) return;
      if (operational && !["orders", "maintenance"].includes(next)) {
        setDataLoading(true);
        setReload((value) => value + 1);
      }
      setTab(next);
      setSelectedRow(null);
    };
    function chooseScope(value) {
      scopeRef.current = value;
      loadSequence.current += 1;
      setScopeId(value);
      setData(null);
      setFilters({ ...FILTERS });
      setHistory(null);
      setReconciliation(null);
      setPreview(null);
      setFile(null);
      setImportOpen(false);
      setActivation(null);
      setSelectedRow(null);
      setLink(emptyLink());
      setNotice("");
      setError("");
      setImportError("");
      setLinkError("");
      setDenied(false);
    }

    useEffect(() => {
      mounted.current = true;
      return () => {
        mounted.current = false;
        loadSequence.current += 1;
        callbacks.current.onDirtyChange?.(false);
      };
    }, []);
    useEffect(() => {
      callbacks.current.onDirtyChange?.(dirty || Boolean(busy));
    }, [dirty, busy]);
    useEffect(() => {
      const protect = (event) => {
        if (dirty || mutationRef.current) {
          event.preventDefault();
          event.returnValue = "";
        }
      };
      window.addEventListener("beforeunload", protect);
      return () => window.removeEventListener("beforeunload", protect);
    }, [dirty]);
    useEffect(() => {
      const controller = new AbortController();
      setContextLoading(true);
      setContextError("");
      setScopes([]);
      chooseScope("");
      request(`${API}/context`, { signal: controller.signal }, token)
        .then((result) => {
          if (controller.signal.aborted) return;
          if (!Array.isArray(result?.scopes))
            throw new Error("Сервер не вернул список доступных областей.");
          setScopes(result.scopes);
          chooseScope(result.defaultResponsibilityScopeId || result.scopes[0]?.responsibilityScopeId || "");
        })
        .catch((reason) => {
          if (!controller.signal.aborted) {
            handleAccess(reason);
            setContextError(failMessage(reason));
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setContextLoading(false);
        });
      return () => controller.abort();
    }, [token, actor?.id, contextVersion]);
    useEffect(() => {
      const sequence = ++loadSequence.current,
        controller = new AbortController(),
        target = scopeId;
      if (!target || contextLoading || denied || invalidDates) {
        setDataLoading(false);
        return () => controller.abort();
      }
      setDataLoading(true);
      setError("");
      setSelectedRow(null);
      const timer = setTimeout(
        () => {
          request(
            `${API}?${queryFor(target, filters)}`,
            { signal: controller.signal },
            token,
          )
            .then((result) => {
              if (
                controller.signal.aborted ||
                !current(target) ||
                sequence !== loadSequence.current
              )
                return;
              if (
                !result ||
                !Object.hasOwn(result, "dataset") ||
                !Number.isInteger(result.version)
              )
                throw new Error("Сервер вернул неполный результат расчёта.");
              setData(result);
            })
            .catch((reason) => {
              if (
                !controller.signal.aborted &&
                current(target) &&
                sequence === loadSequence.current
              ) {
                handleAccess(reason);
                setData(null);
                setError(failMessage(reason));
              }
            })
            .finally(() => {
              if (
                !controller.signal.aborted &&
                current(target) &&
                sequence === loadSequence.current
              )
                setDataLoading(false);
            });
        },
        filters.search ? 250 : 0,
      );
      return () => {
        clearTimeout(timer);
        controller.abort();
      };
    }, [scopeId, token, filters, reload, contextLoading, denied, invalidDates]);
    useEffect(() => {
      const controller = new AbortController(),
        target = scopeId;
      setAuxError("");
      setAuxLoading(false);
      if (
        !target ||
        !["history", "reconciliation"].includes(tab) ||
        denied ||
        contextLoading
      )
        return () => controller.abort();
      setAuxLoading(true);
      if (tab === "history") setHistory(null);
      else setReconciliation(null);
      request(
        `${API}/${tab === "history" ? "imports" : "reconciliation"}?${queryFor(target)}`,
        { signal: controller.signal },
        token,
      )
        .then((result) => {
          if (controller.signal.aborted || !current(target)) return;
          if (tab === "history") setHistory(result);
          else setReconciliation(result);
        })
        .catch((reason) => {
          if (!controller.signal.aborted && current(target)) {
            handleAccess(reason);
            setAuxError(failMessage(reason));
          }
        })
        .finally(() => {
          if (!controller.signal.aborted && current(target))
            setAuxLoading(false);
        });
      return () => controller.abort();
    }, [scopeId, token, tab, reload, data?.version, contextLoading, denied]);

    async function responseError(response) {
      let message;
      try {
        const detail = await response.json();
        if (
          typeof detail.message === "string" &&
          detail.message.length <= 800 &&
          !/[\u0000-\u001f\u007f]/.test(detail.message)
        )
          message = detail.message;
      } catch {
        /* Non-JSON error responses get a safe generic message. */
      }
      return Object.assign(
        new Error(message || `Запрос не выполнен (код ${response.status}).`),
        { status: response.status },
      );
    }
    async function previewImport() {
      if (!canWrite || !file || mutationRef.current) return;
      if (!/\.(xlsx|csv)$/i.test(file.name)) {
        setImportError("Выберите файл XLSX или CSV с исходными позициями.");
        return;
      }
      if (file.size > 20 * 1024 * 1024) {
        setImportError("Размер файла превышает 20 МиБ.");
        return;
      }
      const target = scopeId;
      mutationRef.current = true;
      setBusy("preview");
      setPreview(null);
      setImportError("");
      try {
        const body = new FormData();
        body.append("file", file);
        body.append("responsibilityScopeId", target);
        const response = await authenticatedFetch(
          `${API}/imports/preview`,
          { method: "POST", body },
          token,
        );
        if (!response.ok) throw await responseError(response);
        const result = await response.json();
        if (current(target))
          setPreview({ ...result, responsibilityScopeId: target });
      } catch (reason) {
        if (current(target)) {
          handleAccess(reason);
          setImportError(failMessage(reason));
        }
      } finally {
        mutationRef.current = false;
        if (mounted.current) setBusy("");
      }
    }
    async function activateDataset(choice) {
      if (
        !canWrite ||
        !choice?.dataset?.id ||
        mutationRef.current ||
        !scopes.some(value => value.responsibilityScopeId === choice.responsibilityScopeId && value.canWrite)
      )
        return;
      const target = choice.responsibilityScopeId, workspaceTarget = scopeId;
      mutationRef.current = true;
      setBusy("commit");
      setImportError("");
      setError("");
      try {
        const result = await request(
          `${API}/imports/commit`,
          {
            method: "POST",
            body: JSON.stringify({
              responsibilityScopeId: target,
              datasetId: choice.dataset.id,
              expectedVersion: choice.version,
            }),
          },
          token,
        );
        if (!current(workspaceTarget)) return;
        setPreview(null);
        setActivation(null);
        setFile(null);
        setImportOpen(false);
        setData(null);
        setNotice(
          result.alreadyActive
            ? "Этот файл уже является активным снимком."
            : "Снимок активирован. Аналитика пересчитывается по его исходным строкам.",
        );
        setReload((value) => value + 1);
      } catch (reason) {
        if (!current(workspaceTarget)) return;
        handleAccess(reason);
        setImportError(failMessage(reason));
        setError(failMessage(reason));
        if (reason?.status === 409) {
          setPreview(null);
          setActivation(null);
          setReload((value) => value + 1);
        }
      } finally {
        mutationRef.current = false;
        if (mounted.current) setBusy("");
      }
    }
    async function saveLink(event) {
      event.preventDefault();
      if (!canWrite || !data || mutationRef.current || !link.confirmed) return;
      if (
        !link.plate.trim() ||
        !link.reason.trim() ||
        (!link.unlink &&
          (!link.vehicleKey.trim() || !link.canonicalPlate.trim()))
      ) {
        setLinkError(
          "Заполните госномер, целевую идентичность, основной номер и основание подтверждения.",
        );
        return;
      }
      const targets = link.responsibilityScopeId ? [link.responsibilityScopeId] : data.scopeIdsByPlate?.[normalizePlate(link.plate)] || [scopeId];
      const workspaceTarget = scopeId;
      mutationRef.current = true;
      setBusy("link");
      setLinkError("");
      try {
        for (const target of targets) await request(
          `${API}/vehicle-links`,
          {
            method: "PUT",
            body: JSON.stringify({
              responsibilityScopeId: target,
              plate: link.plate.trim(),
              vehicleKey: link.unlink ? "" : link.vehicleKey.trim(),
              canonicalPlate: link.unlink ? "" : link.canonicalPlate.trim(),
              reason: link.reason.trim(),
              expectedVersion: data.versionsByScope?.[target] ?? data.version,
            }),
          },
          token,
        );
        if (!current(workspaceTarget)) return;
        setLink(emptyLink());
        setData(null);
        setNotice(
          link.unlink
            ? "Связь снята. Показатели будут пересчитаны."
            : "Подтверждённая связь сохранена. Показатели будут пересчитаны.",
        );
        setReload((value) => value + 1);
      } catch (reason) {
        if (current(workspaceTarget)) {
          handleAccess(reason);
          setLinkError(failMessage(reason));
          setLink((previous) => ({ ...previous, confirmed: false }));
          setReload((value) => value + 1);
        }
      } finally {
        mutationRef.current = false;
        if (mounted.current) setBusy("");
      }
    }
    async function download(kind) {
      if (!scopeId || busy || !analytics || invalidDates) return;
      const target = scopeId,
        snapshot = queryFor(target, filters, true);
      setBusy(kind);
      try {
        const response = await authenticatedFetch(
          `${API}/${kind === "csv" ? "export" : "report.pptx"}?${snapshot}`,
          {},
          token,
        );
        if (!response.ok) throw await responseError(response);
        const blob = await response.blob();
        if (!current(target)) return;
        const href = URL.createObjectURL(blob),
          anchor = document.createElement("a");
        anchor.href = href;
        anchor.download = `Обслуживание-автопарка.${kind === "csv" ? "csv" : "pptx"}`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(href), 1000);
        setNotice(
          kind === "csv"
            ? "CSV сформирован по всем строкам выбранного среза."
            : "Презентация сформирована по выбранному срезу.",
        );
      } catch (reason) {
        if (current(target)) {
          handleAccess(reason);
          setError(failMessage(reason));
        }
      } finally {
        if (mounted.current) setBusy("");
      }
    }

    const optionField = (label, key, optionKey, fallback = []) =>
      field(
        label,
        select(filters[key] || "", options[optionKey] || fallback, (value) =>
          changeFilter(key, value),
        ),
      );
    const activeFilters = Object.entries(filters).filter(
      ([key, value]) =>
        value !== "" &&
        value != null &&
        !["page", "pageSize", "dateBasis"].includes(key) &&
        !(key === "status" && value === "all"),
    );
    const filterLabels = {
      dateFrom: "С",
      dateTo: "По",
      vehicleGroup: "Группа ТС",
      vehicleKey: "Машина",
      group: "Затраты",
      node: "Узел",
      positionType: "Тип",
      supplier: "Подрядчик",
      search: "Поиск",
      orderId: "ЗН",
      issueCode: "Проверка",
      status: "Статус",
      positionName: "Позиция",
    };
    const selectedLabel = (key, value) => {
      const map = {
        vehicleGroup: "vehicleGroups",
        vehicleKey: "vehicles",
        group: "groups",
        node: "nodes",
        positionType: "positionTypes",
        supplier: "suppliers",
        status: "statuses",
      };
      return (
        (options[map[key]] || []).find(
          (item) => String(item.key) === String(value),
        )?.label ||
        (key.startsWith("date")
          ? date(value)
          : key === "issueCode"
            ? analytics?.quality?.items?.find((item) => item.code === value)
                ?.label || value
            : value)
      );
    };

    function renderPositions() {
      const detail = analytics.details,
        totalPages = Math.max(1, Math.ceil(detail.total / detail.pageSize));
      return h(
        "section",
        { className: "fleet-panel" },
        panelHeading(
          "Исходные позиции",
          `${number(detail.total)} строк · итог ${money(analytics.summary.amountCents)} по всему выбранному срезу`,
          button("Выгрузить все строки CSV", () => download("csv"), {
            disabled: Boolean(busy),
          }),
        ),
        h(
          "div",
          { className: "fleet-table-wrap", tabIndex: 0 },
          h(
            "table",
            { className: "fleet-table fleet-positions-table" },
            h(
              "caption",
              null,
              "Суммы и повторы сохранены как в источнике. Нажмите на наименование для всех полей.",
            ),
            h(
              "thead",
              null,
              h(
                "tr",
                null,
                ...[
                  "Строка / ЗН",
                  "Открыт / завершён",
                  "Машина",
                  "Позиция",
                  "Группа / узел",
                  "Тип",
                  "Количество",
                  "Сумма",
                  "Подрядчик",
                  "Проверки",
                ].map((label) => h("th", { key: label, scope: "col" }, label)),
              ),
            ),
            h(
              "tbody",
              null,
              ...detail.items.map((row) =>
                h(
                  "tr",
                  { key: row.sourceRow },
                  h(
                    "td",
                    null,
                    h(
                      "span",
                      { className: "fleet-muted" },
                      `Строка ${row.sourceRow}`,
                    ),
                    button(
                      row.orderNumber || row.orderId || "Без номера",
                      () => drill({ orderId: row.orderId }),
                      {
                        className: "fleet-text-button",
                        disabled: !row.orderId,
                      },
                    ),
                  ),
                  h(
                    "td",
                    null,
                    date(row.openedOn),
                    h(
                      "small",
                      { className: "fleet-cell-note" },
                      date(row.completedOn),
                    ),
                  ),
                  h(
                    "td",
                    null,
                    button(
                      row.plate || "Не указан",
                      () => drill({ vehicleKey: row.vehicleKey }),
                      {
                        className: "fleet-text-button",
                        disabled: !row.vehicleKey,
                      },
                    ),
                    h(
                      "small",
                      { className: "fleet-cell-note" },
                      row.vehicleGroup || "Без группы",
                    ),
                  ),
                  h(
                    "td",
                    null,
                    button(
                      row.name || "Без наименования",
                      () => setSelectedRow(row),
                      { className: "fleet-text-button" },
                    ),
                  ),
                  h(
                    "td",
                    null,
                    row.group || "Не указана",
                    h(
                      "small",
                      { className: "fleet-cell-note" },
                      row.node || "—",
                    ),
                  ),
                  h("td", null, row.positionType || "—"),
                  h(
                    "td",
                    { className: "fleet-numeric" },
                    row.quantity == null
                      ? "—"
                      : `${number(row.quantity)} ${row.unit || ""}`,
                  ),
                  h(
                    "td",
                    {
                      className: `fleet-numeric${row.amountCents < 0 ? " fleet-negative" : ""}`,
                    },
                    money(row.amountCents),
                  ),
                  h("td", null, row.supplier || "Не указан"),
                  h(
                    "td",
                    null,
                    row.issueCodes?.length
                      ? button(
                          `${row.issueCodes.length} проверок`,
                          () => setSelectedRow(row),
                          { className: "fleet-text-button" },
                        )
                      : "—",
                  ),
                ),
              ),
              !detail.items.length &&
                h(
                  "tr",
                  null,
                  h(
                    "td",
                    { colSpan: 10, className: "fleet-table-empty" },
                    "Нет строк, соответствующих фильтрам.",
                  ),
                ),
            ),
          ),
        ),
        h(
          "footer",
          { className: "fleet-pagination" },
          field(
            "Строк на странице",
            select(
              String(filters.pageSize),
              [25, 50, 100, 200].map((value) => ({
                key: String(value),
                label: String(value),
              })),
              (value) => changeFilter("pageSize", Number(value)),
              null,
            ),
          ),
          h("span", null, `Страница ${detail.page} из ${number(totalPages)}`),
          h(
            "div",
            { className: "fleet-actions" },
            button(
              "Назад",
              () => changeFilter("page", Math.max(1, detail.page - 1)),
              { disabled: detail.page <= 1 },
            ),
            button("Далее", () => changeFilter("page", detail.page + 1), {
              disabled: detail.page >= totalPages,
            }),
          ),
        ),
      );
    }
    function renderQuality() {
      const quality = analytics.quality;
      return h(
        "section",
        { className: "fleet-panel" },
        panelHeading(
          "Качество данных",
          `${number(quality.issueCount)} срабатываний · ${number(quality.affectedRows)} затронутых строк в выбранном срезе. Одна строка может содержать несколько замечаний.`,
        ),
        h(
          "p",
          { className: "fleet-note" },
          quality.notice ||
            "Кандидаты в дубли сохранены. Несовпадение количества × цены с суммой не исправляется автоматически. Отметка «своими силами» не подтверждает внутренние работы.",
        ),
        !quality.referenceCoverageAvailable &&
          h(
            "p",
            { className: "fleet-note" },
            "Справочник машин не предоставлен: проверка наличия автомобиля в справочнике недоступна.",
          ),
        quality.excludedMissingDateRows > 0 &&
          h(
            "p",
            { className: "fleet-warning" },
            `${number(quality.excludedMissingDateRows)} строк исключено из периода из-за отсутствия выбранной даты. Они не входят в показанные суммы и количество позиций.`,
          ),
        quality.items?.length
          ? h(
              "div",
              { className: "fleet-quality-list" },
              ...quality.items.map((issue) =>
                h(
                  "article",
                  { className: "fleet-quality-item", key: issue.code },
                  h(
                    "div",
                    { className: "fleet-quality-heading" },
                    h(
                      "div",
                      null,
                      h("h3", null, issue.label),
                      h(
                        "p",
                        null,
                        `${number(issue.count)} строк · сумма затронутых позиций ${money(issue.amountCents)}`,
                      ),
                    ),
                    button("Показать позиции", () =>
                      drill({ issueCode: issue.code }),
                    ),
                  ),
                  issue.examples?.length > 0 &&
                    h(
                      "details",
                      null,
                      h("summary", null, "Примеры из источника"),
                      h(
                        "ul",
                        null,
                        ...issue.examples.map((example, index) =>
                          h(
                            "li",
                            { key: `${example.sourceRow}:${index}` },
                            `Строка ${example.sourceRow}${example.plate ? ` · ${example.plate}` : ""}: ${example.message || issue.label}`,
                          ),
                        ),
                      ),
                    ),
                ),
              ),
            )
          : empty(
              "Замечаний в срезе не найдено",
              "Это результат доступных проверок исходных данных, а не подтверждение полноты внешнего учёта.",
            ),
      );
    }
    function renderLinks() {
      return h(
        "section",
        { className: "fleet-panel" },
        panelHeading(
          "Подтверждённые связи автомобилей",
          "Объединяйте госномера только после подтверждения одной машины по VIN или стабильному ID. История заказ-нарядов сохраняется.",
        ),
        data?.links?.length > 0 &&
          h(
            "div",
            { className: "fleet-table-wrap", tabIndex: 0 },
            h(
              "table",
              { className: "fleet-table" },
              h(
                "thead",
                null,
                h(
                  "tr",
                  null,
                  ...[
                    "Госномер",
                    "Единая идентичность",
                    "Основной госномер",
                    "Основание",
                    "Действие",
                  ].map((label) =>
                    h("th", { key: label, scope: "col" }, label),
                  ),
                ),
              ),
              h(
                "tbody",
                null,
                ...data.links.map((item) =>
                  h(
                    "tr",
                    { key: `${item.responsibilityScopeId}:${item.plate}` },
                    h("td", null, item.plate),
                    h("td", null, item.vehicleKey),
                    h("td", null, item.canonicalPlate),
                    h("td", null, item.reason),
                    h(
                      "td",
                      null,
                      button(
                        "Изменить / снять",
                        () => {
                          setLink({ ...item, confirmed: false, unlink: false });
                          setLinkError("");
                        },
                        { disabled: !canWrite || Boolean(busy) },
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        !data?.links?.length &&
          h(
            "p",
            { className: "fleet-note" },
            "Подтверждённых связей нет. Машины учитываются по нормализованным госномерам.",
          ),
        h(
          "form",
          { onSubmit: saveLink, className: "fleet-link-form" },
          h(
            "fieldset",
            { disabled: !canWrite || Boolean(busy) || !data || dataLoading },
            h("legend", null, "Изменить идентичность"),
            h(
              "div",
              { className: "fleet-form-grid" },
              field(
                "Госномер в источнике",
                h("input", {
                  value: link.plate,
                  maxLength: 80,
                  onChange: (event) =>
                    setLink((previous) => ({
                      ...previous,
                      plate: event.target.value,
                      confirmed: false,
                    })),
                  required: true,
                }),
              ),
              field(
                "Стабильный ключ автомобиля",
                h("input", {
                  value: link.vehicleKey,
                  maxLength: 150,
                  disabled: link.unlink,
                  onChange: (event) =>
                    setLink((previous) => ({
                      ...previous,
                      vehicleKey: event.target.value,
                      confirmed: false,
                    })),
                  required: !link.unlink,
                }),
                "Один и тот же ключ для всех подтверждённых номеров одной машины.",
              ),
              field(
                "Основной госномер",
                h("input", {
                  value: link.canonicalPlate,
                  maxLength: 80,
                  disabled: link.unlink,
                  onChange: (event) =>
                    setLink((previous) => ({
                      ...previous,
                      canonicalPlate: event.target.value,
                      confirmed: false,
                    })),
                  required: !link.unlink,
                }),
              ),
              field(
                "Основание: VIN / ID и источник проверки",
                h("textarea", {
                  value: link.reason,
                  rows: 3,
                  maxLength: 2000,
                  onChange: (event) =>
                    setLink((previous) => ({
                      ...previous,
                      reason: event.target.value,
                      confirmed: false,
                    })),
                  required: true,
                }),
              ),
            ),
            h(
              "label",
              { className: "fleet-check" },
              h("input", {
                type: "checkbox",
                checked: link.unlink,
                onChange: (event) =>
                  setLink((previous) => ({
                    ...previous,
                    unlink: event.target.checked,
                    confirmed: false,
                  })),
              }),
              "Снять существующую связь для этого госномера",
            ),
            h(
              "label",
              { className: "fleet-check" },
              h("input", {
                type: "checkbox",
                checked: link.confirmed,
                onChange: (event) =>
                  setLink((previous) => ({
                    ...previous,
                    confirmed: event.target.checked,
                  })),
              }),
              link.unlink
                ? "Подтверждаю снятие связи и указанное основание."
                : "Я проверил идентичность машины и подтверждаю объединение по указанному основанию.",
            ),
            h(
              "div",
              { className: "fleet-actions" },
              h(
                "button",
                {
                  type: "submit",
                  className: "button fleet-primary",
                  disabled: !link.confirmed,
                },
                busy === "link"
                  ? "Сохранение…"
                  : link.unlink
                    ? "Снять связь"
                    : "Сохранить подтверждённую связь",
              ),
              button("Очистить", () => {
                setLink(emptyLink());
                setLinkError("");
              }),
            ),
          ),
          !canWrite &&
            h(
              "p",
              { className: "fleet-note" },
              "У вас доступ только для чтения. Изменение связей недоступно.",
            ),
          linkError &&
            h("p", { className: "fleet-error", role: "alert" }, linkError),
        ),
      );
    }
    function renderReconciliation() {
      let body;
      if (auxLoading) body = loading("Загрузка сверки…");
      else if (auxError)
        body = h("p", { className: "fleet-error", role: "alert" }, auxError);
      else if (!reconciliation || reconciliation.kind === "none")
        body = empty(
          "Снимок сверки отсутствует",
          "В этом файле нет сохранённой сверки. Аналитика позиций доступна отдельно.",
        );
      else {
        const summary = reconciliation.summary || {};
        const headings = [
          "Машина / источник",
          "Период",
          "ЗН в снимке",
          "Ремонты в снимке",
          "Текущие позиции",
          "Ремонты − текущие",
          "Изменение источника",
          "Примечание",
        ];
        const rows = (reconciliation.rows || []).map((row, index) =>
          h(
            "tr",
            { key: row.key || index },
            h(
              "td",
              null,
              row.plate || "—",
              h(
                "small",
                { className: "fleet-cell-note" },
                row.sourceRows?.length
                  ? `Строки ${row.sourceRows.join(", ")}`
                  : "",
              ),
            ),
            h("td", null, row.month || "—"),
            ...[
              row.sourceAmountCents,
              row.comparisonAmountCents,
              row.currentAmountCents,
              row.differenceCents,
              row.sourceChangeCents,
            ].map((value, i) =>
              h("td", { key: i, className: "fleet-numeric" }, money(value)),
            ),
            h("td", null, (row.comments || []).join(" · ") || "—"),
          ),
        );
        body = h(
          React.Fragment,
          null,
          h(
            "p",
            { className: "fleet-warning" },
            reconciliation.notice ||
              "Исторический частичный снимок. Он может относиться к другому периоду и набору автомобилей.",
          ),
          h(
            "p",
            { className: "fleet-note" },
            `Охват: ${number(summary.snapshotRows)} строк снимка, ${number(summary.coveredKeys)} пар «машина / месяц». Общие фильтры аналитики к этому историческому снимку не применяются.`,
          ),
          h(
            "div",
            { className: "fleet-kpis is-compact" },
            ...[
              ["ЗН в снимке", summary.sourceAmountCents],
              ["Ремонты в снимке", summary.comparisonAmountCents],
              ["Текущие позиции в охвате", summary.currentAmountCents],
              ["Ремонты − текущие", summary.differenceCents],
            ].map(([label, value]) =>
              h(
                "article",
                { className: "fleet-kpi", key: label },
                h("span", null, label),
                h("strong", null, money(value)),
              ),
            ),
          ),
          h(
            "div",
            { className: "fleet-table-wrap", tabIndex: 0 },
            h(
              "table",
              { className: "fleet-table" },
              h(
                "caption",
                null,
                "Только пары «машина / месяц», присутствующие в сохранённом снимке",
              ),
              h(
                "thead",
                null,
                h(
                  "tr",
                  null,
                  ...headings.map((label) =>
                    h("th", { key: label, scope: "col" }, label),
                  ),
                ),
              ),
              h(
                "tbody",
                null,
                ...rows,
                !rows.length &&
                  h(
                    "tr",
                    null,
                    h(
                      "td",
                      {
                        colSpan: headings.length,
                        className: "fleet-table-empty",
                      },
                      "В снимке нет строк.",
                    ),
                  ),
              ),
            ),
          ),
        );
      }
      return h(
        React.Fragment,
        null,
        h(
          "section",
          { className: "fleet-panel" },
          panelHeading(
            "Сверка с сохранённым источником",
            "Снимок расхождений из загруженного файла. Этот раздел не является полной независимой сверкой с реестром ремонтов.",
          ),
          body,
        ),
        renderLinks(),
      );
    }
    function renderHistory() {
      return h(
        "section",
        { className: "fleet-panel" },
        panelHeading(
          "История загрузок",
          "Каждый файл хранится как отдельный снимок. Активация заменяет данные расчёта; предыдущие загрузки сохраняются.",
        ),
        auxLoading
          ? loading("Загрузка истории…")
          : auxError
            ? h("p", { className: "fleet-error", role: "alert" }, auxError)
            : history?.items?.length
              ? h(
                  "div",
                  { className: "fleet-history" },
                  ...history.items.map((item) => {
                    const dataset = item.dataset || item,
                      isActive = (data?.activeDatasetIds || [data?.dataset?.id]).includes(dataset.id);
                    return h(
                      "article",
                      {
                        key: item.id || dataset.id,
                        className: "fleet-history-item",
                      },
                      h(
                        "div",
                        null,
                        h("h3", null, dataset.fileName),
                        h(
                          "p",
                          null,
                          `${date(dataset.createdAt, true)} · ${number(dataset.rowCount)} позиций`,
                        ),
                        h(
                          "small",
                          { className: "fleet-hash" },
                          `SHA-256: ${dataset.fileHash || "—"}`,
                        ),
                      ),
                      isActive
                        ? h(
                            "span",
                            { className: "fleet-badge" },
                            "Активный снимок",
                          )
                        : button(
                            "Активировать",
                            () => {
                              setActivation({
                                dataset,
                                version: item.version ?? data?.version,
                                responsibilityScopeId: item.responsibilityScopeId || scopeId,
                              });
                              setImportError("");
                            },
                            {
                              disabled:
                                !canWrite ||
                                Boolean(busy) ||
                                !data ||
                                dataLoading,
                            },
                          ),
                    );
                  }),
                )
              : empty(
                  "Загрузок ещё нет",
                  "Добавьте файл с исходными позициями, чтобы начать анализ.",
                ),
      );
    }

    return h(
      "main",
      { className: "fleet-workspace" },
      h(
        "header",
        { className: "fleet-heading" },
        h(
          "div",
          null,
          h("p", { className: "fleet-eyebrow" }, "АВТОПАРК"),
          h("h1", null, "Обслуживание и ремонты"),
          h(
            "p",
            null,
            "Затраты, исходные позиции и качество данных автопарка.",
          ),
        ),
        h(
          "div",
          { className: "fleet-actions" },
          button("Обновить", () => setReload((value) => value + 1), {
            disabled: !scopeId || Boolean(busy) || dataLoading || operational,
          }),
          button(
            busy === "pptx" ? "Формирование…" : "Презентация PPTX",
            () => download("pptx"),
            { disabled: !analytics || Boolean(busy) || operational },
          ),
          button(
            busy === "csv" ? "Формирование…" : "Экспорт CSV",
            () => download("csv"),
            { disabled: !analytics || Boolean(busy) || operational },
          ),
          button(
            "Загрузить файл",
            () => {
              setImportOpen(true);
              setImportError("");
            },
            {
              className: "button fleet-primary",
              disabled: !canWrite || Boolean(busy) || contextLoading,
            },
          ),
        ),
      ),
      contextLoading
        ? loading("Проверка доступных областей…")
        : contextError
          ? h(
              "div",
              { className: "fleet-error", role: "alert" },
              contextError,
              button("Повторить", () =>
                setContextVersion((value) => value + 1),
              ),
            )
          : !scopes.length
            ? empty(
                "Нет доступных областей",
                "Для работы с обслуживанием требуется роль и доступ к финансовым данным области ответственности.",
              )
            : h(
                React.Fragment,
                null,
                h(
                  "section",
                  { className: "fleet-scope" },
                  h(
                    "div",
                    { className: "fleet-source" },
                    h(
                      "span",
                      { className: "fleet-badge" },
                      canWrite ? "Чтение и изменение" : "Только чтение",
                    ),
                    h(
                      "strong",
                      null,
                      data?.dataset?.fileName ||
                        (dataLoading
                          ? "Загрузка источника…"
                          : data?.analytics
                            ? "Заказ-наряды ЕЦЛ"
                            : "Источник не выбран"),
                    ),
                    h(
                      "small",
                      null,
                      data?.dataset
                        ? `Загружен ${date(data.dataset.createdAt, true)} · ${number(data.dataset.rowCount)} строк в файле${data.nativeRowCount ? ` + ${number(data.nativeRowCount)} позиций ЕЦЛ` : ""}`
                        : data?.analytics
                          ? "Исходные позиции из заказ-нарядов системы"
                          : "Загрузите исходные позиции в XLSX или CSV",
                    ),
                  ),
                ),
                notice &&
                  h(
                    "div",
                    { className: "fleet-notice", role: "status" },
                    h("span", null, notice),
                    button("Скрыть", () => setNotice("")),
                  ),
                error &&
                  h(
                    "div",
                    { className: "fleet-error", role: "alert" },
                    h("span", null, error),
                    button(denied ? "Обновить доступ" : "Повторить", () =>
                      denied
                        ? setContextVersion((value) => value + 1)
                        : setReload((value) => value + 1),
                    ),
                  ),
                h(
                  "nav",
                  {
                    className: "fleet-tabs",
                    "aria-label": "Разделы обслуживания",
                  },
                  ...tabs.map(([key, label]) =>
                    button(label, () => changeTab(key), {
                      key,
                      disabled: operationsDirty && operational && key !== tab,
                      "aria-current": tab === key ? "page" : undefined,
                      className: tab === key ? "is-active" : "",
                    }),
                  ),
                ),
                operationsDirty &&
                  operational &&
                  h(
                    "p",
                    { className: "fleet-note" },
                    "Завершите или отмените изменения в текущем разделе, чтобы сменить вкладку.",
                  ),
                operational && OperationsWorkspace
                  ? h(OperationsWorkspace, {
                      view: tab,
                      token,
                      actor,
                      onExpired,
                      onDirtyChange: setOperationsDirty,
                      responsibilityScopeId: scopeId,
                      scopes,
                      importScopeIds: data?.activeDatasetScopeIds || [],
                      scope: currentScope,
                      canWrite,
                    })
                  : h(
                      React.Fragment,
                      null,
                      h(
                        "section",
                        {
                          className: "fleet-filters",
                          "aria-label": "Фильтры аналитики",
                        },
                        h(
                          "div",
                          { className: "fleet-filter-main" },
                          field(
                            "Период с",
                            h("input", {
                              type: "date",
                              value: filters.dateFrom,
                              onChange: (event) =>
                                changeFilter("dateFrom", event.target.value),
                            }),
                          ),
                          field(
                            "Период по",
                            h("input", {
                              type: "date",
                              value: filters.dateTo,
                              onChange: (event) =>
                                changeFilter("dateTo", event.target.value),
                            }),
                          ),
                          field(
                            "Считать по дате",
                            select(
                              filters.dateBasis,
                              [
                                { key: "completed", label: "Завершения" },
                                { key: "opened", label: "Открытия" },
                              ],
                              (value) => changeFilter("dateBasis", value),
                              null,
                            ),
                          ),
                          optionField(
                            "Марка / группа ТС",
                            "vehicleGroup",
                            "vehicleGroups",
                          ),
                          optionField("Машина", "vehicleKey", "vehicles"),
                          field(
                            "Поиск позиции",
                            h("input", {
                              type: "search",
                              value: filters.search,
                              placeholder: "Наименование, номер…",
                              onChange: (event) =>
                                changeFilter("search", event.target.value),
                            }),
                          ),
                        ),
                        h(
                          "details",
                          { className: "fleet-more-filters" },
                          h("summary", null, "Дополнительные фильтры"),
                          h(
                            "div",
                            { className: "fleet-filter-main" },
                            optionField("Группа затрат", "group", "groups"),
                            optionField("Узел", "node", "nodes"),
                            optionField(
                              "Тип позиции",
                              "positionType",
                              "positionTypes",
                            ),
                            optionField("Подрядчик", "supplier", "suppliers"),
                            field(
                              "Статус заказ-наряда",
                              select(
                                filters.status,
                                options.statuses?.length
                                  ? options.statuses
                                  : [
                                      { key: "all", label: "Все статусы" },
                                      { key: "finished", label: "Завершённые" },
                                      {
                                        key: "unfinished",
                                        label: "Незавершённые",
                                      },
                                    ],
                                (value) => changeFilter("status", value),
                                null,
                              ),
                            ),
                            field(
                              "ID заказ-наряда",
                              h("input", {
                                value: filters.orderId,
                                onChange: (event) =>
                                  changeFilter("orderId", event.target.value),
                              }),
                            ),
                          ),
                        ),
                        h(
                          "div",
                          { className: "fleet-filter-footer" },
                          h(
                            "p",
                            null,
                            filters.status === "all"
                              ? "Учитываются все статусы ЗН. При заданном периоде по завершению строки без даты завершения исключаются."
                              : "Срез ограничен выбранным статусом заказ-нарядов.",
                          ),
                          button("Сбросить фильтры", resetFilters),
                        ),
                        activeFilters.length > 0 &&
                          h(
                            "div",
                            { className: "fleet-filter-chips" },
                            ...activeFilters.map(([key, value]) =>
                              button(
                                `${filterLabels[key] || key}: ${selectedLabel(key, value)} ×`,
                                () =>
                                  changeFilter(
                                    key,
                                    key === "status" ? "all" : "",
                                  ),
                                {
                                  key,
                                  className: "fleet-filter-chip",
                                  "aria-label": `Снять фильтр ${filterLabels[key] || key}`,
                                },
                              ),
                            ),
                          ),
                        invalidDates &&
                          h(
                            "p",
                            { className: "fleet-error", role: "alert" },
                            invalidDates,
                          ),
                      ),
                      ["history", "reconciliation"].includes(tab)
                        ? tab === "history"
                          ? renderHistory()
                          : renderReconciliation()
                        : dataLoading
                          ? loading("Расчёт по всем исходным позициям…")
                          : !invalidDates &&
                              !error &&
                              !data?.dataset &&
                              !analytics
                            ? empty(
                                "Добавьте первый источник",
                                "Загрузите XLSX с листом «Позиции» или CSV с такими же заголовками. Формулы и сохранённые итоги дашборда не используются.",
                                button(
                                  "Выбрать файл",
                                  () => setImportOpen(true),
                                  {
                                    disabled: !canWrite,
                                    className: "button fleet-primary",
                                  },
                                ),
                              )
                            : analytics &&
                              h(
                                React.Fragment,
                                null,
                                analytics.summary.rowCount === 0 &&
                                  empty(
                                    "По фильтрам нет позиций",
                                    "Расширьте период или снимите часть фильтров. Нулевые суммы относятся только к выбранному срезу.",
                                    button("Сбросить фильтры", resetFilters),
                                  ),
                                tab === "overview"
                                  ? h(
                                      React.Fragment,
                                      null,
                                      h(Metrics, {
                                        summary: analytics.summary,
                                      }),
                                      h(
                                        "div",
                                        { className: "fleet-overview-note" },
                                        h(
                                          "span",
                                          null,
                                          `${number(analytics.summary.rowCount)} исходных позиций. Среднее на машину рассчитано только для машин в этом срезе.`,
                                        ),
                                        button(
                                          `Качество данных: ${number(analytics.quality.affectedRows)} строк`,
                                          () => setTab("quality"),
                                          { className: "fleet-text-button" },
                                        ),
                                      ),
                                      analytics.quality
                                        .excludedMissingDateRows > 0 &&
                                        h(
                                          "p",
                                          { className: "fleet-warning" },
                                          `${number(analytics.quality.excludedMissingDateRows)} строк не входит в период: в источнике отсутствует выбранная дата.`,
                                        ),
                                      h(
                                        "div",
                                        { className: "fleet-chart-grid" },
                                        h(
                                          "section",
                                          { className: "fleet-panel" },
                                          panelHeading(
                                            "Динамика затрат",
                                            filters.dateBasis === "completed"
                                              ? "По месяцу завершения заказ-наряда"
                                              : "По месяцу открытия заказ-наряда",
                                          ),
                                          h(MonthChart, {
                                            items: analytics.months || [],
                                            onMonth: (key) => {
                                              const [year, month] = key
                                                .split("-")
                                                .map(Number);
                                              if (year && month)
                                                drill({
                                                  dateFrom: `${key}-01`,
                                                  dateTo: new Date(
                                                    Date.UTC(year, month, 0),
                                                  )
                                                    .toISOString()
                                                    .slice(0, 10),
                                                });
                                            },
                                          }),
                                        ),
                                        h(
                                          "section",
                                          { className: "fleet-panel" },
                                          panelHeading(
                                            "Структура затрат",
                                            "Все группы текущего среза",
                                          ),
                                          h(Distribution, {
                                            items: analytics.groups || [],
                                            onSelect: (item) =>
                                              drill({
                                                group:
                                                  item.key || "__missing__",
                                              }),
                                          }),
                                        ),
                                      ),
                                      h(Ranked, { analytics, drill }),
                                      h(
                                        "section",
                                        { className: "fleet-panel" },
                                        panelHeading(
                                          "Дерево затрат",
                                          "Группа → узел → наименование. Раскройте ветку или откройте все её позиции.",
                                        ),
                                        h(CostTree, {
                                          key: data.dataset?.id || "native",
                                          items: analytics.tree || [],
                                          drill,
                                        }),
                                      ),
                                    )
                                  : tab === "positions"
                                    ? renderPositions()
                                    : tab === "quality"
                                      ? renderQuality()
                                      : null,
                              ),
                    ),
              ),
      importOpen &&
        h(
          Dialog,
          {
            title: "Загрузка исходных позиций",
            busy: Boolean(busy),
            onClose: () => {
              setImportOpen(false);
              setPreview(null);
              setFile(null);
              setImportError("");
            },
          },
          h(
            "p",
            { className: "fleet-note" },
            "Файл станет отдельным снимком. Сначала проверьте результат чтения; активный источник изменится только после нажатия «Заменить активный снимок».",
          ),
          field(
            "Файл XLSX или CSV",
            h("input", {
              type: "file",
              accept: ".xlsx,.csv",
              disabled: !canWrite || Boolean(busy),
              onChange: (event) => {
                setFile(event.target.files?.[0] || null);
                setPreview(null);
                setImportError("");
              },
            }),
            "До 20 МиБ. XLSX: исходные строки листа «Позиции». CSV: такие же заголовки.",
          ),
          button(
            busy === "preview" ? "Проверка файла…" : "Проверить файл",
            previewImport,
            { disabled: !canWrite || !file || Boolean(busy) },
          ),
          preview &&
            h(
              "section",
              { className: "fleet-import-preview" },
              h("h3", null, preview.dataset?.fileName || file?.name),
              h(Metrics, { summary: preview.summary, compact: true }),
              h(
                "p",
                { className: "fleet-note" },
                `Проверки: ${number(preview.quality?.issueCount)} срабатываний, ${number(preview.quality?.affectedRows)} затронутых строк. Дубли и исходные суммы сохраняются.`,
              ),
              preview.quality?.items?.length > 0 &&
                h(
                  "ul",
                  { className: "fleet-preview-issues" },
                  ...preview.quality.items.map((issue) =>
                    h(
                      "li",
                      { key: issue.code },
                      `${issue.label}: ${number(issue.count)}`,
                    ),
                  ),
                ),
              h(
                "p",
                { className: "fleet-warning" },
                preview.alreadyActive
                  ? "Этот файл уже активен. Повторная активация не добавит строки."
                  : data?.dataset
                    ? `Активный файл «${data.dataset.fileName}» будет заменён. Он останется в истории загрузок.`
                    : "Этот файл станет первым активным источником.",
              ),
              button(
                busy === "commit"
                  ? "Активация…"
                  : preview.alreadyActive
                    ? "Подтвердить активный снимок"
                    : "Заменить активный снимок",
                () => activateDataset(preview),
                {
                  disabled: !canWrite || Boolean(busy),
                  className: "button fleet-primary",
                },
              ),
            ),
          importError &&
            h("p", { className: "fleet-error", role: "alert" }, importError),
        ),
      activation &&
        h(
          Dialog,
          {
            title: "Активировать сохранённый снимок",
            busy: Boolean(busy),
            onClose: () => setActivation(null),
          },
          h("h3", null, activation.dataset.fileName),
          h(
            "p",
            { className: "fleet-note" },
            `${date(activation.dataset.createdAt, true)} · ${number(activation.dataset.rowCount)} строк`,
          ),
          h(
            "p",
            { className: "fleet-warning" },
            "Текущий источник расчёта будет заменён этим снимком. Все загрузки останутся в истории.",
          ),
          button(
            busy === "commit" ? "Активация…" : "Активировать этот снимок",
            () => activateDataset(activation),
            {
              disabled: !canWrite || Boolean(busy),
              className: "button fleet-primary",
            },
          ),
          importError &&
            h("p", { className: "fleet-error", role: "alert" }, importError),
        ),
      selectedRow &&
        h(PositionDialog, {
          row: selectedRow,
          close: () => setSelectedRow(null),
        }),
    );
  };
}
