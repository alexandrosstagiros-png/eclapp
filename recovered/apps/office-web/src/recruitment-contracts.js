import { createRecruitmentContractPacks } from "./recruitment-contract-packs.js";

// Contract text and personal data remain in memory; issued documents use server snapshots.
const BASE = "/recruitment/contracts";
const EMPLOYMENT = [
  ["any", "Любой тип оформления"],
  ["employee", "Сотрудник"],
  ["ip", "ИП"],
  ["self_employed", "Самозанятый"],
];
const TYPES = [
  ["text", "Текст"],
  ["textarea", "Длинный текст"],
  ["date", "Дата"],
  ["tel", "Телефон"],
];
const STATUS = { draft: "Черновик", issued: "Выпущен", signed: "Подписан" };
const PRESETS = [
  [
    "Реквизиты организации",
    [
      ["company_inn", "ИНН организации", "text"],
      ["company_address", "Адрес организации", "textarea"],
      ["signer_name", "ФИО подписанта организации", "text"],
      ["signer_basis", "Основание полномочий подписанта", "text"],
    ],
  ],
  [
    "Данные водителя",
    [
      ["passport_number", "Серия и номер паспорта", "text"],
      ["passport_issuer", "Кем выдан паспорт", "textarea"],
      ["passport_date", "Дата выдачи паспорта", "date"],
      ["registration_address", "Адрес регистрации", "textarea"],
      ["driver_license", "Номер водительского удостоверения", "text"],
      ["inn", "ИНН водителя", "text"],
    ],
  ],
  [
    "Стоимость и срок",
    [
      ["fee", "Стоимость и порядок оплаты", "textarea"],
      ["valid_until", "Срок действия до", "date"],
    ],
  ],
];
const clone = (value) => JSON.parse(JSON.stringify(value));
const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
const dateText = (value) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value || "")
    ? value.split("-").reverse().join(".")
    : String(value || "");
const dateTime = (value) =>
  value && Number.isFinite(Date.parse(value))
    ? new Intl.DateTimeFormat("ru-RU", {
        dateStyle: "short",
        timeStyle: "short",
      }).format(new Date(value))
    : "—";
const renderText = (
  text,
  fields,
  values,
  number,
  date,
  showMissing = false,
) => {
  const formatted = {
    ...values,
    contract_number: number || "",
    contract_date: dateText(date),
  };
  fields.forEach((item) => {
    if (item.type === "date") formatted[item.id] = dateText(values[item.id]);
  });
  return String(text || "").replace(
    /\{\{\s*([a-zA-Z][a-zA-Z0-9_-]{0,79})\s*\}\}/g,
    (_, key) =>
      (Object.hasOwn(formatted, key) && String(formatted[key] || "")) ||
      (showMissing
        ? `⟦${fields.find((item) => item.id === key)?.label || key}⟧`
        : ""),
  );
};
function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob),
    anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function documentPage(title, text, draft) {
  const page = document.implementation.createHTMLDocument(title);
  page.documentElement.lang = "ru";
  const charset = page.createElement("meta");
  charset.setAttribute("charset", "utf-8");
  page.head.prepend(charset);
  const style = page.createElement("style");
  style.textContent =
    'body{max-width:174mm;margin:15mm auto;padding:0 12mm;font:11pt/1.35 "Times New Roman",serif;color:#111;background:white}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;orphans:3;widows:4}aside{font:10pt sans-serif;color:#666;border-bottom:1px solid #ddd;padding-bottom:10px}@page{size:A4;margin:18mm}@media print{body{padding:0;margin:0;max-width:none}}';
  page.head.append(style);
  if (draft) {
    const label = page.createElement("aside");
    label.textContent = "ЧЕРНОВИК — документ ещё не выпущен";
    page.body.append(label);
  }
  const body = page.createElement("pre");
  body.textContent = text;
  page.body.append(body);
  return page;
}
async function signedPayload(file) {
  if (
    !file ||
    !file.size ||
    file.size > 10 * 1024 * 1024 ||
    !["application/pdf", "image/jpeg", "image/png"].includes(file.type)
  )
    throw new Error("Выберите PDF, JPEG или PNG размером до 10 МБ.");
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const signatures = {
    "application/pdf": [37, 80, 68, 70, 45],
    "image/jpeg": [255, 216, 255],
    "image/png": [137, 80, 78, 71, 13, 10, 26, 10],
  };
  if (!signatures[file.type].every((byte, i) => head[i] === byte))
    throw new Error("Содержимое файла не соответствует выбранному формату.");
  const base64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(new Error("Не удалось прочитать файл."));
    reader.readAsDataURL(file);
  });
  return { mimeType: file.type, base64, fileName: file.name };
}
export function createRecruitmentContracts(
  React,
  { request, authenticatedFetch },
) {
  const { createElement: h, useEffect, useRef, useState } = React;
  const { PackResult } = createRecruitmentContractPacks(React, { request });
  const button = (label, onClick, props = {}) =>
    h(
      "button",
      { type: "button", className: "button", onClick, ...props },
      label,
    );
  const primary = { className: "button recruitment-primary" };
  const field = (label, input, hint) =>
    h(
      "label",
      { className: "recruitment-field" },
      h("span", null, label),
      React.cloneElement(input, {
        "aria-label": input.props["aria-label"] || label,
      }),
      hint && h("small", null, hint),
    );
  const input = (value, change, props = {}) =>
    h("input", {
      value,
      onChange: (event) => change(event.target.value),
      ...props,
    });
  const select = (value, options, change, props = {}) =>
    h(
      "select",
      { value, onChange: (event) => change(event.target.value), ...props },
      ...options.map(([id, label]) =>
        h("option", { key: id, value: id }, label),
      ),
    );
  const notice = (text) => h("p", { className: "onboarding-notice" }, text);
  const newTemplate = (scope) => ({
    id: crypto.randomUUID(),
    version: 0,
    responsibilityScopeId: scope || "",
    name: "",
    employmentType: "employee",
    text: "",
    fields: [
      { id: "full_name", label: "ФИО", type: "text", required: true },
      {
        id: "company_name",
        label: "Организация",
        type: "text",
        required: true,
      },
      { id: "phone", label: "Телефон", type: "tel", required: false },
    ],
    versions: [],
    published: null,
  });
  const editableTemplate = (source) => ({
    ...source,
    ...(source.draft || source.published || {}),
    id: source.id,
    version: source.version,
    responsibilityScopeId: source.responsibilityScopeId,
  });
  function useDirty(dirty, notify) {
    const ref = useRef(notify);
    ref.current = notify;
    useEffect(() => {
      ref.current?.(dirty);
    }, [dirty]);
    useEffect(() => () => ref.current?.(false), []);
  }
  function Values({
    fields,
    values,
    onChange,
    disabled,
    samples = false,
    contractDate = "",
  }) {
    return h(
      "div",
      { className: "onboarding-fields" },
      ...fields.map((item, index) =>
        field(
          `${samples ? "Пример: " : ""}${item.label || `Поле ${index + 1}`}`,
          item.type === "textarea"
            ? h("textarea", {
                value: Object.hasOwn(values, item.id) ? values[item.id] : "",
                rows: 3,
                disabled,
                onChange: (event) =>
                  onChange({ ...values, [item.id]: event.target.value }),
              })
            : input(
                values[item.id] || "",
                (value) => onChange({ ...values, [item.id]: value }),
                {
                  type:
                    item.type === "date"
                      ? "date"
                      : item.type === "tel"
                        ? "tel"
                        : "text",
                  disabled,
                  ...(item.type === "date" &&
                  item.notBeforeContractDate &&
                  contractDate
                    ? { min: contractDate }
                    : {}),
                },
              ),
          !samples && item.required
            ? "Обязательно для выпуска договора"
            : undefined,
        ),
      ),
    );
  }
  function TemplateEditor({
    initial,
    scopes,
    busy,
    onSave,
    onClose,
    onDirtyChange,
    onDelete,
  }) {
    const [draft, setDraft] = useState(() => editableTemplate(clone(initial))),
      [samples, setSamples] = useState({}),
      [error, setError] = useState(""),
      [history, setHistory] = useState("");
    const original = editableTemplate(initial),
      dirty = JSON.stringify(draft) !== JSON.stringify(original);
    const canEdit = initial.version === 0 || initial.canEdit === true;
    const sampleValues = {
      ...Object.fromEntries(
        draft.fields.map((item) => [item.id, item.defaultValue || ""]),
      ),
      ...samples,
    };
    useDirty(dirty, onDirtyChange);
    const textArea = useRef(null);
    const update = (key, value) => {
      setDraft((current) => ({ ...current, [key]: value }));
      setError("");
    };
    const changeField = (index, patch) =>
      update(
        "fields",
        draft.fields.map((item, i) => {
          if (i !== index) return item;
          const next = { ...item, ...patch };
          if (next.type !== "date") delete next.notBeforeContractDate;
          return next;
        }),
      );
    function insert(key) {
      const node = textArea.current,
        start = node?.selectionStart ?? draft.text.length,
        end = node?.selectionEnd ?? start,
        value = `{{${key}}}`;
      update(
        "text",
        draft.text.slice(0, start) + value + draft.text.slice(end),
      );
      requestAnimationFrame(() => {
        node?.focus();
        node?.setSelectionRange(start + value.length, start + value.length);
      });
    }
    function save(state) {
      if (!draft.name.trim() || !draft.responsibilityScopeId) {
        setError("Укажите название и направление шаблона.");
        return;
      }
      const ids = draft.fields.map((item) => item.id);
      if (
        draft.fields.some(
          (item) =>
            !/^[a-zA-Z][a-zA-Z0-9_-]{0,79}$/.test(item.id) ||
            !item.label.trim(),
        ) ||
        new Set(ids).size !== ids.length ||
        ids.some((id) =>
          [
            "__proto__",
            "constructor",
            "prototype",
            "contract_number",
            "contract_date",
          ].includes(id),
        )
      ) {
        setError(
          "У каждого поля должны быть название и уникальный код латиницей: буквы, цифры, знаки _ и -. Служебные коды contract_number и contract_date уже заняты.",
        );
        return;
      }
      if (state === "published" && !draft.text.trim()) {
        setError("Добавьте текст договора перед публикацией.");
        return;
      }
      onSave({
        id: initial.id,
        version: initial.version,
        responsibilityScopeId: draft.responsibilityScopeId,
        name: draft.name,
        employmentType: draft.employmentType,
        text: draft.text,
        fields: draft.fields,
        state,
      });
    }
    const selectedHistory = (initial.versions || []).find(
      (item) => String(item.version) === history,
    );
    return h(
      "section",
      {
        className: "onboarding-builder contracts-editor",
        "aria-label": "Конструктор шаблона договора",
      },
      h(
        "div",
        { className: "onboarding-section-heading" },
        h(
          "div",
          null,
          h(
            "h3",
            null,
            initial.version
              ? canEdit
                ? "Шаблон договора"
                : "Просмотр шаблона договора"
              : "Новый шаблон договора",
          ),
          h(
            "p",
            { className: "recruitment-meta" },
            initial.published
              ? `Опубликована версия ${initial.published.version}. Изменения сохраняются отдельным черновиком.`
              : "Подготовьте текст и поля, затем опубликуйте шаблон для рекрутеров.",
          ),
        ),
        h(
          "div",
          { className: "recruitment-actions" },
          initial.canDelete &&
            button("Удалить шаблон", onDelete, { disabled: busy }),
          button("К шаблонам договоров", onClose, { disabled: busy }),
        ),
      ),
      !canEdit &&
        notice(
          "Этот шаблон доступен для просмотра и создания договоров. Чтобы подготовить собственную версию, откройте договор и нажмите «Восстановить шаблон».",
        ),
      error &&
        h("div", { className: "recruitment-error", role: "alert" }, error),
      h(
        "fieldset",
        { className: "onboarding-fieldset", disabled: busy || !canEdit },
        h(
          "div",
          { className: "onboarding-fields" },
          field(
            "Название шаблона договора",
            input(draft.name, (value) => update("name", value), {
              maxLength: 160,
            }),
          ),
          field(
            "Направление шаблона договора",
            select(
              draft.responsibilityScopeId,
              [
                ["", "Выберите направление"],
                ...scopes.map((item) => [
                  item.responsibilityScopeId || item.id,
                  [
                    item.legalEntityName,
                    item.scopeName || item.name || item.title,
                  ]
                    .filter(Boolean)
                    .join(" · ") ||
                    item.responsibilityScopeId ||
                    item.id,
                ]),
              ],
              (value) => update("responsibilityScopeId", value),
              { disabled: Boolean(initial.version) },
            ),
            "Организация определяется направлением. Для другой организации создайте отдельный шаблон.",
          ),
          field(
            "Тип оформления договора",
            select(draft.employmentType, EMPLOYMENT, (value) =>
              update("employmentType", value),
            ),
          ),
        ),
        h(
          "section",
          { className: "onboarding-section" },
          h("h4", null, "Поля договора"),
          h(
            "p",
            { className: "recruitment-meta" },
            "ФИО, телефон и организация заполняются из карточки. Для переноса из анкеты используйте такой же код поля; перед выпуском проверьте значения.",
          ),
          ...draft.fields.map((item, index) =>
            h(
              "div",
              { className: "onboarding-builder-row", key: index },
              h(
                "div",
                { className: "onboarding-fields" },
                field(
                  `Название поля ${index + 1}`,
                  input(
                    item.label,
                    (value) => changeField(index, { label: value }),
                    { maxLength: 160 },
                  ),
                ),
                field(
                  `Код поля ${index + 1}`,
                  input(item.id, (value) => changeField(index, { id: value }), {
                    maxLength: 80,
                    spellCheck: false,
                  }),
                  "Латиница, цифры и _: например passport_number",
                ),
                field(
                  `Тип поля ${index + 1}`,
                  select(item.type, TYPES, (value) =>
                    changeField(index, { type: value }),
                  ),
                ),
                field(
                  `Значение по умолчанию ${index + 1}`,
                  item.type === "textarea"
                    ? h("textarea", {
                        value: item.defaultValue || "",
                        rows: 3,
                        maxLength: 8000,
                        onChange: (event) =>
                          changeField(index, {
                            defaultValue: event.target.value,
                          }),
                      })
                    : input(
                        item.defaultValue || "",
                        (value) => changeField(index, { defaultValue: value }),
                        {
                          type:
                            item.type === "date"
                              ? "date"
                              : item.type === "tel"
                                ? "tel"
                                : "text",
                          maxLength: 1000,
                        },
                      ),
                  "Подставляется в новый договор, если нет данных кандидата или анкеты. Оставьте пустым, если значение нужно вводить каждый раз.",
                ),
              ),
              h(
                "div",
                { className: "onboarding-item-controls" },
                h(
                  "label",
                  { className: "onboarding-check" },
                  h("input", {
                    type: "checkbox",
                    checked: item.required,
                    "aria-label": `Обязательное поле ${index + 1}`,
                    onChange: (event) =>
                      changeField(index, { required: event.target.checked }),
                  }),
                  "Обязательное для выпуска",
                ),
                item.type === "date" &&
                  h(
                    "label",
                    { className: "onboarding-check" },
                    h("input", {
                      type: "checkbox",
                      checked: Boolean(item.notBeforeContractDate),
                      "aria-label": `Не раньше даты документа ${index + 1}`,
                      onChange: (event) =>
                        changeField(index, {
                          notBeforeContractDate: event.target.checked,
                        }),
                    }),
                    "Не раньше даты документа",
                  ),
                button("Вставить в текст", () => insert(item.id), {
                  disabled: !item.id,
                  "aria-label": `Вставить поле ${item.label || index + 1}`,
                }),
                button(
                  "Удалить поле",
                  () =>
                    update(
                      "fields",
                      draft.fields.filter((_, i) => i !== index),
                    ),
                  { "aria-label": `Удалить поле ${index + 1}` },
                ),
              ),
            ),
          ),
          button(
            "Добавить поле договора",
            () => {
              let index = draft.fields.length + 1;
              while (draft.fields.some((item) => item.id === `field_${index}`))
                index++;
              update("fields", [
                ...draft.fields,
                {
                  id: `field_${index}`,
                  label: "",
                  type: "text",
                  required: false,
                },
              ]);
            },
            { disabled: draft.fields.length >= 80 },
          ),
          h(
            "div",
            { className: "recruitment-actions" },
            ...PRESETS.map(([label, items]) =>
              button(
                `Добавить: ${label.toLocaleLowerCase("ru")}`,
                () => {
                  const existing = new Set(draft.fields.map((item) => item.id));
                  update("fields", [
                    ...draft.fields,
                    ...items
                      .filter(([id]) => !existing.has(id))
                      .map(([id, label, type]) => ({
                        id,
                        label,
                        type,
                        required: false,
                      })),
                  ]);
                },
                {
                  key: label,
                  disabled:
                    draft.fields.length +
                      items.filter(
                        ([id]) =>
                          !draft.fields.some((field) => field.id === id),
                      ).length >
                      80 ||
                    items.every(([id]) =>
                      draft.fields.some((field) => field.id === id),
                    ),
                },
              ),
            ),
          ),
        ),
        h(
          "section",
          { className: "onboarding-section" },
          h(
            "div",
            { className: "onboarding-section-heading" },
            h("h4", null, "Текст и подстановки"),
            h(
              "div",
              { className: "recruitment-actions" },
              button("Вставить номер договора", () =>
                insert("contract_number"),
              ),
              button("Вставить дату договора", () => insert("contract_date")),
            ),
          ),
          field(
            "Текст шаблона договора",
            h("textarea", {
              ref: textArea,
              value: draft.text,
              rows: 15,
              maxLength: 100000,
              className: "contracts-text-editor",
              placeholder:
                "Введите согласованный текст и вставьте поля в нужные места.",
              onChange: (event) => update("text", event.target.value),
            }),
            "Подстановки имеют вид {{full_name}}. Текст хранится без HTML.",
          ),
        ),
      ),
      h(
        "details",
        { className: "onboarding-card", open: true },
        h("summary", null, "Предпросмотр на примере"),
        h(Values, {
          fields: draft.fields,
          values: sampleValues,
          onChange: setSamples,
          samples: true,
        }),
        h(
          "pre",
          {
            className: "contracts-preview",
            "aria-label": "Предпросмотр шаблона",
          },
          renderText(
            draft.text,
            draft.fields,
            sampleValues,
            "Образец-001",
            today(),
            true,
          ) || "Добавьте текст шаблона — здесь появится предпросмотр.",
        ),
      ),
      notice(
        "Публикация делает новую версию доступной рекрутерам. Уже созданные договоры сохраняют свой текст и версию шаблона.",
      ),
      canEdit &&
        h(
          "div",
          { className: "recruitment-actions" },
          button("Сохранить черновик шаблона", () => save("draft"), {
            disabled: busy || (initial.version > 0 && !dirty),
          }),
          button("Опубликовать шаблон", () => save("published"), {
            ...primary,
            disabled:
              busy ||
              (!dirty && !initial.hasDraft && Boolean(initial.published)),
          }),
        ),
      Boolean(initial.versions?.length) &&
        h(
          "section",
          { className: "onboarding-card" },
          h("h4", null, "История опубликованных версий"),
          field(
            "Версия шаблона для просмотра",
            select(
              history,
              [
                ["", "Выберите версию"],
                ...initial.versions.map((item) => [
                  String(item.version),
                  `Версия ${item.version} · ${dateTime(item.publishedAt)}`,
                ]),
              ],
              setHistory,
            ),
          ),
          selectedHistory &&
            h(
              React.Fragment,
              null,
              h("p", { className: "recruitment-meta" }, selectedHistory.name),
              h(
                "pre",
                {
                  className: "contracts-preview",
                  "aria-label": "Текст предыдущей версии",
                },
                selectedHistory.text,
              ),
            ),
        ),
    );
  }
  function DocumentEditor({
    initial,
    busy,
    perform,
    token,
    onUpdated,
    onClose,
    onDirtyChange,
    onCopy,
    onDelete,
    onRestoreTemplate,
  }) {
    const [draft, setDraft] = useState(() => ({
        text: initial.text || "",
        values: clone(initial.values || {}),
        number: initial.number || "",
        date: initial.date || "",
      })),
      [file, setFile] = useState(null),
      [signedDate, setSignedDate] = useState(today()),
      [check, setCheck] = useState(false);
    const original = {
      text: initial.text || "",
      values: initial.values || {},
      number: initial.number || "",
      date: initial.date || "",
    };
    const dirty = JSON.stringify(draft) !== JSON.stringify(original),
      editable = initial.status === "draft",
      fields = initial.templateSnapshot?.fields || [];
    useDirty(dirty || Boolean(file), onDirtyChange);
    const update = (key, value) => {
      setDraft((current) => ({ ...current, [key]: value }));
      setCheck(false);
    };
    const preview = editable
      ? renderText(draft.text, fields, draft.values, draft.number, draft.date)
      : initial.renderedText || "";
    const title = `${initial.templateName || initial.templateSnapshot?.name || "Договор"}${draft.number ? ` № ${draft.number}` : ""}`;
    const missing = fields.filter(
      (item) => item.required && !String(draft.values[item.id] || "").trim(),
    );
    const save = () =>
      perform(async () => {
        const result = await request(
          `${BASE}/documents/${initial.id}`,
          {
            method: "PUT",
            body: JSON.stringify({ version: initial.version, ...draft }),
          },
          token,
        );
        onUpdated(result);
      }, "Черновик договора сохранён.");
    function print() {
      const popup = window.open("", "_blank");
      if (!popup) {
        perform(() => {
          throw new Error(
            "Разрешите открытие окна печати в браузере и повторите попытку.",
          );
        });
        return;
      }
      popup.opener = null;
      const page = documentPage(title, preview, editable);
      popup.document.replaceChild(
        popup.document.importNode(page.documentElement, true),
        popup.document.documentElement,
      );
      popup.focus();
      setTimeout(() => {
        if (!popup.closed) popup.print();
      }, 200);
    }
    async function downloadSigned() {
      if (!authenticatedFetch)
        throw new Error("Загрузка файла недоступна. Обновите страницу.");
      const response = await authenticatedFetch(
        `${BASE}/documents/${initial.id}/signed-file`,
        {},
        token,
      );
      if (!response.ok) {
        const error = new Error("Не удалось скачать подписанный договор.");
        error.status = response.status;
        throw error;
      }
      saveBlob(
        await response.blob(),
        initial.signedFile.fileName || "Подписанный договор.pdf",
      );
    }
    return h(
      "section",
      {
        className: "onboarding-editor contracts-editor",
        "aria-label": "Карточка договора",
      },
      h(
        "div",
        { className: "onboarding-section-heading" },
        h(
          "div",
          null,
          h("h3", null, title),
          h(
            "p",
            { className: "recruitment-meta" },
            `${initial.candidateName || "По анкете кандидата"} · ${STATUS[initial.status] || initial.status} · шаблон, версия ${initial.templateVersion || initial.templateSnapshot?.version || "—"}`,
          ),
        ),
        h(
          "div",
          { className: "recruitment-actions" },
          initial.canDelete &&
            button("Удалить договор", onDelete, { disabled: busy }),
          button("К списку договоров", onClose, { disabled: busy }),
        ),
      ),
      !editable &&
        notice(
          initial.status === "signed"
            ? "Подписанный договор и его файл сохранены. Для новых условий создайте отдельный черновик."
            : "Договор выпущен: его текст и реквизиты зафиксированы. Скачайте документ, получите подпись и загрузите подписанный экземпляр.",
        ),
      h(
        "fieldset",
        { className: "onboarding-fieldset", disabled: busy || !editable },
        h(
          "div",
          { className: "onboarding-fields" },
          field(
            "Номер договора",
            input(draft.number, (value) => update("number", value), {
              maxLength: 120,
            }),
          ),
          field(
            "Дата договора",
            input(draft.date, (value) => update("date", value), {
              type: "date",
            }),
          ),
        ),
        h(Values, {
          fields,
          values: draft.values,
          onChange: (values) => update("values", values),
          disabled: busy || !editable,
          contractDate: draft.date,
        }),
        field(
          "Текст договора",
          h("textarea", {
            rows: 12,
            className: "contracts-text-editor",
            maxLength: 100000,
            value: draft.text,
            onChange: (event) => update("text", event.target.value),
          }),
          editable
            ? "Правки меняют только этот договор. Поля подставляются в предпросмотр."
            : undefined,
        ),
      ),
      editable &&
        h(
          "div",
          { className: "recruitment-actions" },
          button("Сохранить договор", save, {
            ...primary,
            disabled: busy || !dirty,
          }),
        ),
      h(
        "section",
        { className: "onboarding-section" },
        h(
          "div",
          { className: "onboarding-section-heading" },
          h("h4", null, "Предпросмотр документа"),
          h(
            "div",
            { className: "recruitment-actions" },
            button("Печать / сохранить PDF", print, { disabled: busy }),
            button(
              "Скачать HTML",
              () => {
                const page = documentPage(title, preview, editable);
                saveBlob(
                  new Blob(
                    ["<!doctype html>\n", page.documentElement.outerHTML],
                    { type: "text/html;charset=utf-8" },
                  ),
                  `${title.replace(/[\\/:*?"<>|]/g, "_")}.html`,
                );
              },
              { disabled: busy },
            ),
          ),
        ),
        editable &&
          h(
            "p",
            { className: "recruitment-meta" },
            "Черновик. Печать и скачивание используют текущий предпросмотр; сохраните изменения перед выпуском.",
          ),
        h(
          "pre",
          {
            className: "contracts-preview",
            "aria-label": "Предпросмотр договора",
          },
          preview,
        ),
      ),
      editable &&
        h(
          "section",
          { className: "onboarding-card" },
          h("h4", null, "Выпуск договора"),
          missing.length > 0 &&
            notice(
              `Заполните обязательные поля: ${missing.map((item) => item.label).join(", ")}.`,
            ),
          dirty &&
            h(
              "p",
              { className: "recruitment-meta" },
              "Сначала сохраните изменения.",
            ),
          h(
            "label",
            { className: "onboarding-check" },
            h("input", {
              type: "checkbox",
              checked: check,
              disabled: busy || dirty,
              onChange: (event) => setCheck(event.target.checked),
            }),
            "Данные, организация и текст проверены. После выпуска редактирование будет закрыто.",
          ),
          button(
            "Выпустить договор",
            () =>
              perform(async () => {
                const result = await request(
                  `${BASE}/documents/${initial.id}/issue`,
                  {
                    method: "POST",
                    body: JSON.stringify({ version: initial.version }),
                  },
                  token,
                );
                onUpdated(result);
              }, "Договор выпущен. Текст и реквизиты зафиксированы."),
            {
              ...primary,
              disabled:
                busy ||
                dirty ||
                !check ||
                missing.length > 0 ||
                !draft.number.trim() ||
                !draft.date,
            },
          ),
        ),
      initial.status === "issued" &&
        h(
          "section",
          { className: "onboarding-card" },
          h("h4", null, "Подписанный экземпляр"),
          h(
            "p",
            { className: "recruitment-meta" },
            "Прикрепите PDF или фотографию подписанного договора, до 10 МБ. Файл хранится вместе с договором; срок удаления фотографий анкеты к нему не применяется.",
          ),
          h(
            "div",
            { className: "onboarding-fields" },
            field(
              "Дата подписания",
              input(signedDate, setSignedDate, {
                type: "date",
                max: today(),
                disabled: busy,
              }),
            ),
            field(
              "Подписанный договор",
              h("input", {
                type: "file",
                accept:
                  ".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png",
                disabled: busy,
                onChange: (event) => setFile(event.target.files?.[0] || null),
              }),
            ),
          ),
          file &&
            h(
              "p",
              { className: "recruitment-meta" },
              `${file.name} · ${(file.size / 1024 / 1024).toFixed(2)} МБ`,
            ),
          button(
            "Загрузить подписанный договор",
            () =>
              perform(async () => {
                const payload = await signedPayload(file);
                const result = await request(
                  `${BASE}/documents/${initial.id}/sign`,
                  {
                    method: "POST",
                    body: JSON.stringify({
                      version: initial.version,
                      signedDate,
                      ...payload,
                    }),
                  },
                  token,
                );
                setFile(null);
                onUpdated(result);
              }, "Подписанный договор сохранён."),
            { ...primary, disabled: busy || !file || !signedDate },
          ),
        ),
      initial.signedFile &&
        h(
          "section",
          { className: "onboarding-card" },
          h("h4", null, "Подписанный договор"),
          h(
            "p",
            { className: "recruitment-meta" },
            `Дата подписания: ${dateText(initial.signedDate)} · ${initial.signedFile.fileName} · загружен ${dateTime(initial.signedFile.uploadedAt)}`,
          ),
          button("Скачать подписанный договор", () => perform(downloadSigned), {
            disabled: busy,
          }),
        ),
      !editable &&
        button("Создать новый черновик на основе договора", onCopy, {
          disabled: busy,
        }),
      initial.canRestoreTemplate &&
        h(
          "section",
          { className: "onboarding-card" },
          h("h4", null, "Шаблон из этого договора"),
          h(
            "p",
            { className: "recruitment-meta" },
            "Создайте собственный черновик исходного шаблона с полями. Данные кандидата и индивидуальные правки этого договора в него не попадут.",
          ),
          button("Восстановить шаблон", onRestoreTemplate, { disabled: busy }),
        ),
    );
  }
  function ContractsPanel({
    token,
    scopes = [],
    defaultScopeId = "",
    candidates = [],
    sessions = [],
    initialCandidateId = "",
    initialSessionId = "",
    view = "documents",
    onExpired,
    onDirtyChange,
    onBusyChange,
    initialTemplate = null,
    onOpenTemplate,
  }) {
    const [context, setContext] = useState(null),
      [loading, setLoading] = useState(true),
      [busy, setBusy] = useState(false),
      [error, setError] = useState(""),
      [message, setMessage] = useState("");
    const [template, setTemplate] = useState(initialTemplate),
      [doc, setDoc] = useState(null),
      [pack, setPack] = useState(null),
      [creating, setCreating] = useState(Boolean(initialSessionId)),
      [search, setSearch] = useState(""),
      [status, setStatus] = useState(""),
      [sessionFilter, setSessionFilter] = useState(initialSessionId);
    const [showDeleted, setShowDeleted] = useState(false);
    const [candidateId, setCandidateId] = useState(initialCandidateId),
      [sessionId, setSessionId] = useState(initialSessionId),
      [templateId, setTemplateId] = useState(""),
      [candidateQuery, setCandidateQuery] = useState(""),
      [candidateResults, setCandidateResults] = useState([]);
    const active = useRef(true),
      flight = useRef(false),
      dirty = useRef(false),
      callbacks = useRef({ onExpired, onDirtyChange, onBusyChange });
    callbacks.current = { onExpired, onDirtyChange, onBusyChange };
    const setDirty = (value) => {
      dirty.current = value;
      callbacks.current.onDirtyChange?.(value);
    };
    useEffect(() => {
      active.current = true;
      return () => {
        active.current = false;
        callbacks.current.onDirtyChange?.(false);
        callbacks.current.onBusyChange?.(false);
      };
    }, []);
    function fail(reason) {
      if (!active.current || reason?.name === "AbortError") return;
      if ([401, 403].includes(reason?.status)) {
        setContext(null);
        setDoc(null);
        setTemplate(null);
        setDirty(false);
        if (reason.status === 401) callbacks.current.onExpired?.();
      }
      setError(
        reason?.status === 409
          ? "Запись уже изменена в другом окне. Ваши правки остались на экране. Скопируйте их, затем вернитесь в список и откройте запись заново."
          : reason?.message ||
              "Не удалось выполнить действие. Повторите попытку.",
      );
    }
    async function load(signal) {
      const result = await request(
        `${BASE}/context${showDeleted ? "?deleted=true" : ""}`,
        { signal },
        token,
      );
      if (active.current && !signal?.aborted) setContext(result);
      return result;
    }
    useEffect(() => {
      const abort = new AbortController();
      setLoading(true);
      setContext(null);
      load(abort.signal)
        .catch(fail)
        .finally(() => {
          if (!abort.signal.aborted) setLoading(false);
        });
      return () => abort.abort();
    }, [token, showDeleted]);
    useEffect(() => {
      if (candidateQuery.trim().length < 2) {
        setCandidateResults([]);
        return;
      }
      const abort = new AbortController(),
        timer = setTimeout(
          () =>
            request(
              `/recruitment/worklist?${new URLSearchParams({ search: candidateQuery, page: "1", pageSize: "25" })}`,
              { signal: abort.signal },
              token,
            )
              .then((result) => {
                if (!abort.signal.aborted)
                  setCandidateResults(
                    (result.items || []).map((item) => item.candidate),
                  );
              })
              .catch((reason) => {
                if (!abort.signal.aborted) fail(reason);
              }),
          250,
        );
      return () => {
        clearTimeout(timer);
        abort.abort();
      };
    }, [candidateQuery, token]);
    async function perform(action, feedback = "") {
      if (flight.current) return;
      flight.current = true;
      setBusy(true);
      callbacks.current.onBusyChange?.(true);
      setError("");
      setMessage("");
      try {
        await action();
        if (active.current && feedback) setMessage(feedback);
      } catch (reason) {
        fail(reason);
      } finally {
        flight.current = false;
        if (active.current) {
          setBusy(false);
          callbacks.current.onBusyChange?.(false);
        }
      }
    }
    const discard = () =>
      !dirty.current ||
      window.confirm(
        "Есть несохранённые данные договора. Выйти без сохранения?",
      );
    function closeEditor() {
      if (busy || !discard()) return;
      setDoc(null);
      setTemplate(null);
      setDirty(false);
      setError("");
      perform(() => load());
    }
    function changeList(value) {
      if (busy || !discard()) return;
      setDoc(null);
      setTemplate(null);
      setCreating(false);
      setDirty(false);
      setError("");
      setMessage("");
      setShowDeleted(value === "deleted");
    }
    function lifecycle(kind, item, restore = false) {
      if (busy || !discard()) return;
      const title =
        kind === "templates"
          ? item.name
          : item.number
            ? `№ ${item.number}`
            : item.templateName || "Без номера";
      if (
        !restore &&
        !window.confirm(
          kind === "templates"
            ? `Переместить шаблон «${title}» в корзину? Созданные договоры сохранятся. Шаблон можно будет восстановить из корзины.`
            : `Переместить договор «${title}» в корзину? Текст и подписанный файл сохранятся. Договор можно будет восстановить из корзины.`,
        )
      )
        return;
      perform(
        async () => {
          await request(
            `${BASE}/${kind}/${item.id}/${restore ? "restore" : "delete"}`,
            { method: "POST", body: JSON.stringify({ version: item.version }) },
            token,
          );
          if (!active.current) return;
          setDirty(false);
          setDoc(null);
          setTemplate(null);
          await load();
        },
        restore
          ? "Запись возвращена из корзины."
          : "Запись перемещена в корзину. Её можно восстановить.",
      );
    }
    function restoreTemplate() {
      if (busy || !discard()) return;
      perform(async () => {
        const result = await request(
          `${BASE}/documents/${doc.id}/restore-template`,
          { method: "POST", body: JSON.stringify({ version: doc.version }) },
          token,
        );
        if (!active.current) return;
        setDirty(false);
        onOpenTemplate?.(result);
      });
    }
    const updateDocument = (result) => {
      if (!active.current) return;
      setDirty(false);
      setDoc(result);
      setCreating(false);
      setContext((current) => ({
        ...current,
        documents: [
          result,
          ...(current?.documents || []).filter((item) => item.id !== result.id),
        ],
      }));
    };
    const openDocument = (item) => {
      if (!discard()) return;
      perform(async () => {
        const result = await request(`${BASE}/documents/${item.id}`, {}, token);
        updateDocument(result);
      });
    };
    const openTemplate = (item) => {
      if (!discard()) return;
      perform(async () => {
        const result = await request(`${BASE}/templates/${item.id}`, {}, token);
        if (active.current) {
          setTemplate(result);
          setDirty(false);
        }
      });
    };
    const allCandidates = [
      ...new Map(
        [
          ...sessions
            .filter((item) => item.candidateId)
            .map((item) => ({
              id: item.candidateId,
              fullName: item.candidateName,
              responsibilityScopeId: item.responsibilityScopeId,
              legalEntityId: item.legalEntityId,
            })),
          ...candidates,
          ...candidateResults,
        ].map((item) => [item.id, item]),
      ).values(),
    ];
    const chosenSession = sessions.find((item) => item.id === sessionId),
      chosenCandidate = allCandidates.find(
        (item) => item.id === (chosenSession?.candidateId || candidateId),
      );
    const scopeId =
      chosenSession?.responsibilityScopeId ||
      chosenSession?.templateSnapshot?.responsibilityScopeId ||
      chosenCandidate?.responsibilityScopeId;
    const legalEntity =
      chosenSession?.legalEntityId ||
      chosenCandidate?.legalEntityId ||
      scopes.find((item) => (item.responsibilityScopeId || item.id) === scopeId)
        ?.legalEntityId;
    const publishedTemplates = (context?.templates || []).filter(
      (item) =>
        item.publishedVersion &&
        (!legalEntity ||
          scopes.find(
            (scope) =>
              (scope.responsibilityScopeId || scope.id) ===
              item.responsibilityScopeId,
          )?.legalEntityId === legalEntity),
    );
    const filtered = (context?.documents || []).filter(
      (item) =>
        (!status || item.status === status) &&
        (!sessionFilter || item.onboardingSessionId === sessionFilter) &&
        (!search ||
          `${item.candidateName || ""} ${item.number || ""} ${item.templateName || ""}`
            .toLocaleLowerCase("ru")
            .includes(search.toLocaleLowerCase("ru"))),
    );
    const saveTemplate = (value) =>
      perform(
        async () => {
          const result = await request(
            `${BASE}/templates`,
            { method: "PUT", body: JSON.stringify(value) },
            token,
          );
          if (!active.current) return;
          setDirty(false);
          setTemplate(result);
          setContext((current) => ({
            ...current,
            templates: [
              result,
              ...(current?.templates || []).filter(
                (item) => item.id !== result.id,
              ),
            ],
          }));
        },
        value.state === "published"
          ? "Новая версия шаблона опубликована."
          : "Черновик шаблона сохранён.",
      );
    return h(
      "div",
      {
        className: "contracts-workspace",
        "aria-label":
          view === "templates" ? "Шаблоны договоров" : "Договоры оформления",
      },
      error &&
        h("div", { className: "recruitment-error", role: "alert" }, error),
      message &&
        h(
          "div",
          { className: "recruitment-feedback", role: "status" },
          message,
        ),
      loading && h("p", { role: "status" }, "Загружаем договоры…"),
      !loading &&
        !context &&
        button("Повторить загрузку договоров", () => perform(() => load())),
      context?.truncated &&
        notice(
          "Показаны последние 1000 договоров. Более ранние записи не входят в этот список.",
        ),
      context &&
        view === "templates" &&
        !context.canAccessTemplates &&
        notice(
          "Для просмотра шаблонов нужен доступ рекрутера или руководителя к персональным данным.",
        ),
      context &&
        view === "templates" &&
        context.canAccessTemplates &&
        (template
          ? h(TemplateEditor, {
              key: `${template.id}-${template.version}`,
              initial: template,
              scopes,
              busy,
              onSave: saveTemplate,
              onClose: closeEditor,
              onDirtyChange: setDirty,
              onDelete: () => lifecycle("templates", template),
            })
          : h(
              "section",
              { className: "onboarding-section" },
              h(
                "div",
                { className: "onboarding-section-heading" },
                h(
                  "div",
                  null,
                  h("h3", null, "Шаблоны договоров"),
                  h(
                    "p",
                    { className: "recruitment-meta" },
                    "Текст, обязательные поля и отдельная история версий для каждого шаблона.",
                  ),
                ),
                context.canManageTemplates &&
                  !showDeleted &&
                  button(
                    "Создать шаблон договора",
                    () =>
                      setTemplate(
                        newTemplate(
                          defaultScopeId ||
                            scopes[0]?.responsibilityScopeId ||
                            scopes[0]?.id,
                        ),
                      ),
                    { ...primary, disabled: busy },
                  ),
              ),
              field(
                "Показывать шаблоны",
                select(
                  showDeleted ? "deleted" : "active",
                  [
                    ["active", "Действующие"],
                    ["deleted", "Корзина"],
                  ],
                  changeList,
                  { disabled: busy },
                ),
              ),
              showDeleted &&
                notice(
                  "Шаблоны в корзине недоступны для новых договоров. Уже созданные договоры сохраняют свой текст и версию шаблона.",
                ),
              !context.templates.length &&
                notice(
                  showDeleted
                    ? "Корзина шаблонов пуста."
                    : context.canManageTemplates
                      ? "Шаблонов договоров пока нет. Добавьте согласованный текст и опубликуйте первую версию — после этого рекрутеры смогут создавать договоры."
                      : "Опубликованные шаблоны появятся здесь. Собственный шаблон можно восстановить из ранее созданного договора.",
                ),
              h(
                "div",
                { className: "onboarding-list" },
                ...context.templates.map((item) =>
                  h(
                    "article",
                    { key: item.id, className: "onboarding-template-card" },
                    h(
                      "div",
                      { className: "onboarding-section-heading" },
                      h("h4", null, item.name),
                      h(
                        "span",
                        { className: "recruitment-badge" },
                        item.deletedAt
                          ? "В корзине"
                          : item.publishedVersion
                            ? `Версия ${item.publishedVersion} опубликована${item.hasDraft ? " · есть черновик" : ""}`
                            : "Черновик",
                      ),
                    ),
                    h(
                      "p",
                      { className: "recruitment-meta" },
                      `${EMPLOYMENT.find(([id]) => id === item.employmentType)?.[1] || ""} · изменён ${dateTime(item.updatedAt)}`,
                    ),
                    item.deletedAt &&
                      h(
                        "p",
                        { className: "recruitment-meta" },
                        `Удалён ${dateTime(item.deletedAt)}`,
                      ),
                    h(
                      "div",
                      { className: "recruitment-actions" },
                      !showDeleted &&
                        button(
                          "Открыть шаблон договора",
                          () => openTemplate(item),
                          {
                            disabled: busy,
                            "aria-label": `Открыть шаблон договора: ${item.name}`,
                          },
                        ),
                      item.canDelete &&
                        button(
                          "Удалить шаблон",
                          () => lifecycle("templates", item),
                          {
                            disabled: busy,
                            "aria-label": `Удалить шаблон: ${item.name}`,
                          },
                        ),
                      item.canRestore &&
                        button(
                          "Вернуть шаблон из корзины",
                          () => lifecycle("templates", item, true),
                          {
                            disabled: busy,
                            "aria-label": `Вернуть шаблон из корзины: ${item.name}`,
                          },
                        ),
                    ),
                  ),
                ),
              ),
            )),
      context &&
        view === "documents" && pack && h(React.Fragment, null,
          button("К списку договоров", () => setPack(null), { disabled: busy }),
          h(PackResult, { pack, onError: setError })),
      context && view === "documents" && !pack && !doc && !showDeleted && (context.packs || []).length > 0 &&
        h("section", { className: "onboarding-section", "aria-label": "Готовые комплекты" },
          h("h3", null, "Готовые комплекты"),
          h("div", { className: "contract-pack-history" }, ...(context.packs || []).map((item) =>
            button(`${item.kind === "carrier" ? "Перевозчик" : "Водитель · ТК"} · № ${item.number || "—"} · ${dateText(item.date)}`,
              () => perform(async () => {
                const result = await request(`${BASE}/packs/${item.id}`, {}, token);
                if (active.current) setPack(result);
              }), { key: item.id, disabled: busy, "aria-label": `Открыть комплект: ${item.number || item.id}` })))),
      context &&
        view === "documents" &&
        !pack &&
        (doc
          ? h(DocumentEditor, {
              key: `${doc.id}-${doc.version}`,
              initial: doc,
              token,
              busy,
              perform,
              onUpdated: updateDocument,
              onClose: closeEditor,
              onDirtyChange: setDirty,
              onDelete: () => lifecycle("documents", doc),
              onRestoreTemplate: restoreTemplate,
              onCopy: () => {
                if (!discard()) return;
                perform(
                  async () =>
                    updateDocument(
                      await request(
                        `${BASE}/documents`,
                        {
                          method: "POST",
                          body: JSON.stringify({ sourceDocumentId: doc.id }),
                        },
                        token,
                      ),
                    ),
                  "Создан новый черновик на основе договора.",
                );
              },
            })
          : h(
              "section",
              { className: "onboarding-section" },
              h(
                "div",
                { className: "onboarding-section-heading" },
                h(
                  "div",
                  null,
                  h("h3", null, "Договоры"),
                  h(
                    "p",
                    { className: "recruitment-meta" },
                    "Черновик → выпуск → подписанный экземпляр. Договор связан с кандидатом или его анкетой.",
                  ),
                ),
                !showDeleted &&
                  button("Создать договор", () => setCreating(true), {
                    ...primary,
                    disabled: busy || creating,
                  }),
              ),
              field(
                "Показывать договоры",
                select(
                  showDeleted ? "deleted" : "active",
                  [
                    ["active", "Действующие"],
                    ["deleted", "Корзина"],
                  ],
                  changeList,
                  { disabled: busy },
                ),
              ),
              showDeleted &&
                notice(
                  "Договоры в корзине сохраняют текст и подписанные файлы. Верните договор, чтобы снова открыть или скачать его.",
                ),
              creating &&
                h(
                  "section",
                  {
                    className: "onboarding-card",
                    "aria-label": "Создание договора",
                  },
                  h("h4", null, "Новый договор"),
                  h(
                    "div",
                    { className: "onboarding-fields" },
                    field(
                      "Найти кандидата для договора",
                      input(candidateQuery, setCandidateQuery, {
                        type: "search",
                        placeholder: "Имя или телефон, минимум 2 символа",
                        disabled: busy,
                      }),
                    ),
                    field(
                      "Кандидат для договора",
                      select(
                        candidateId,
                        [
                          ["", "Выберите кандидата или анкету"],
                          ...allCandidates.map((item) => [
                            item.id,
                            item.fullName || item.name || "Кандидат",
                          ]),
                        ],
                        (value) => {
                          setCandidateId(value);
                          setSessionId("");
                          setTemplateId("");
                        },
                        { disabled: busy },
                      ),
                    ),
                    field(
                      "Анкета для договора",
                      select(
                        sessionId,
                        [
                          ["", "Без анкеты — из карточки кандидата"],
                          ...sessions
                            .filter(
                              (item) =>
                                !candidateId ||
                                item.candidateId === candidateId,
                            )
                            .map((item) => [
                              item.id,
                              `${item.candidateName || "Без карточки"} · ${item.templateSnapshot?.name || "Анкета"} · ${dateTime(item.createdAt)}`,
                            ]),
                        ],
                        (value) => {
                          setSessionId(value);
                          const linked = sessions.find(
                            (item) => item.id === value,
                          );
                          if (linked?.candidateId)
                            setCandidateId(linked.candidateId);
                          setTemplateId("");
                        },
                        { disabled: busy },
                      ),
                    ),
                    field(
                      "Шаблон договора",
                      select(
                        templateId,
                        [
                          ["", "Выберите опубликованный шаблон"],
                          ...publishedTemplates.map((item) => [
                            item.id,
                            `${item.publishedName || item.name} · версия ${item.publishedVersion}`,
                          ]),
                        ],
                        setTemplateId,
                        { disabled: busy },
                      ),
                    ),
                  ),
                  !publishedTemplates.length &&
                    notice(
                      "Для выбранной организации пока нет опубликованного шаблона. Руководитель может подготовить его в разделе «Шаблоны договоров».",
                    ),
                  h(
                    "div",
                    { className: "recruitment-actions" },
                    button(
                      "Создать черновик договора",
                      () =>
                        perform(
                          async () =>
                            updateDocument(
                              await request(
                                `${BASE}/documents`,
                                {
                                  method: "POST",
                                  body: JSON.stringify({
                                    templateId,
                                    ...(sessionId
                                      ? { onboardingSessionId: sessionId }
                                      : { candidateId }),
                                  }),
                                },
                                token,
                              ),
                            ),
                          "Черновик создан. Проверьте реквизиты и заполните недостающие поля.",
                        ),
                      {
                        ...primary,
                        disabled:
                          busy || !templateId || (!candidateId && !sessionId),
                      },
                    ),
                    button(
                      "Отмена создания договора",
                      () => setCreating(false),
                      { disabled: busy },
                    ),
                  ),
                ),
              sessionFilter &&
                h(
                  "div",
                  { className: "contracts-scope-notice" },
                  h("span", null, "Договоры выбранной анкеты"),
                  button("Показать все договоры", () => setSessionFilter(""), {
                    disabled: busy,
                  }),
                ),
              h(
                "div",
                { className: "onboarding-fields" },
                field(
                  "Поиск договоров",
                  input(search, setSearch, {
                    type: "search",
                    placeholder: "Кандидат, номер или шаблон",
                  }),
                ),
                field(
                  "Статус договора",
                  select(
                    status,
                    [["", "Все статусы"], ...Object.entries(STATUS)],
                    setStatus,
                  ),
                ),
              ),
              h(
                "div",
                { className: "onboarding-list" },
                ...filtered.map((item) =>
                  h(
                    "article",
                    { key: item.id, className: "onboarding-list-item" },
                    h(
                      "div",
                      null,
                      h(
                        "strong",
                        null,
                        `${item.number ? `№ ${item.number} · ` : ""}${item.candidateName || "По анкете кандидата"}`,
                      ),
                      h(
                        "p",
                        { className: "recruitment-meta" },
                        `${item.templateName || "Договор"} · ${dateText(item.date) || "Дата не задана"} · изменён ${dateTime(item.updatedAt)}`,
                      ),
                    ),
                    h(
                      "span",
                      {
                        className: `recruitment-badge contract-status-${item.status}`,
                      },
                      STATUS[item.status] || item.status,
                    ),
                    !showDeleted &&
                      button("Открыть договор", () => openDocument(item), {
                        disabled: busy,
                        "aria-label": `Открыть договор: ${item.number || item.candidateName || item.id}`,
                      }),
                    item.canDelete &&
                      button(
                        "Удалить договор",
                        () => lifecycle("documents", item),
                        {
                          disabled: busy,
                          "aria-label": `Удалить договор: ${item.number || item.candidateName || item.id}`,
                        },
                      ),
                    item.canRestore &&
                      button(
                        "Вернуть договор из корзины",
                        () => lifecycle("documents", item, true),
                        {
                          disabled: busy,
                          "aria-label": `Вернуть договор из корзины: ${item.number || item.candidateName || item.id}`,
                        },
                      ),
                  ),
                ),
              ),
              !filtered.length &&
                h(
                  "p",
                  { className: "recruitment-meta" },
                  showDeleted
                    ? "По выбранным условиям в корзине договоров нет."
                    : (context.documents || []).length
                      ? "По выбранным условиям договоров нет."
                      : "Здесь появятся договоры, созданные из опубликованных шаблонов.",
                ),
            )),
    );
  }
  return { ContractsPanel };
}
