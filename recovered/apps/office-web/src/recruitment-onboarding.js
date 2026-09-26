// Private onboarding: personal data and invitation tokens live in memory only.
const BASE = "/recruitment/onboarding";
const EMPLOYMENT = [
  ["employee", "Сотрудник"],
  ["ip", "ИП"],
  ["self_employed", "Самозанятый"],
];
const FIELD_TYPES = [
  ["text", "Текст"],
  ["textarea", "Длинный текст"],
  ["date", "Дата"],
  ["tel", "Телефон"],
  ["select", "Список"],
];
const DOCUMENT_TYPES = [
  ["passport", "Паспорт — основной разворот"],
  ["passport_registration", "Паспорт — регистрация"],
  ["driver_license_front", "ВУ — лицевая сторона"],
  ["driver_license_back", "ВУ — оборотная сторона"],
  ["vehicle_registration_front", "СТС — лицевая сторона"],
  ["vehicle_registration_back", "СТС — оборотная сторона"],
  ["snils", "СНИЛС"],
  ["other", "Другой документ"],
];
const statusName = (status) =>
  ({
    draft: "В работе",
    submitted: "Кандидат отправил",
    verified: "Проверено",
  })[status] || status;
const employmentName = (type) =>
  EMPLOYMENT.find(([id]) => id === type)?.[1] || type;
const dateLabel = (value) =>
  value
    ? new Intl.DateTimeFormat("ru-RU", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(value))
    : "—";
const uuid = () => crypto.randomUUID();
const copy = (value) => JSON.parse(JSON.stringify(value));
const livePhoto = (photo) =>
  !photo.deletedAt && Date.parse(photo.expiresAt) > Date.now();
const newTemplate = (scope) => ({
  id: uuid(),
  version: 0,
  responsibilityScopeId: scope || "",
  name: "",
  destination: "",
  employmentType: "employee",
  description: "",
  privacyNotice: "",
  active: false,
  fields: [
    {
      id: uuid(),
      label: "ФИО",
      type: "text",
      required: true,
      options: [],
      ocrKey: "",
    },
    {
      id: uuid(),
      label: "Телефон",
      type: "tel",
      required: true,
      options: [],
      ocrKey: "",
    },
  ],
  documents: [
    {
      id: uuid(),
      label: "Паспорт — основной разворот",
      type: "passport",
      required: true,
    },
  ],
});
// VK document OCR accepts up to 3840 × 2160. A 2160 square bound also
// covers portrait documents after applying EXIF orientation. Keep the exact
// prepared file in the preview and upload; nothing is sent during preparation.
async function prepareOnboardingPhoto(file) {
  const maxBytes = 10 * 1024 * 1024;
  if (
    !file ||
    !["image/jpeg", "image/png"].includes(file.type) ||
    !file.size ||
    file.size > maxBytes
  )
    throw new Error("Нужна фотография JPEG или PNG до 10 МБ.");
  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const jpeg = header[0] === 255 && header[1] === 216 && header[2] === 255;
  const png = [137, 80, 78, 71, 13, 10, 26, 10].every(
    (byte, index) => header[index] === byte,
  );
  if (!(file.type === "image/jpeg" ? jpeg : png))
    throw new Error("Файл не соответствует формату JPEG или PNG.");
  let source,
    objectUrl = "",
    canvas;
  try {
    if (typeof createImageBitmap === "function") {
      source = await createImageBitmap(file, {
        imageOrientation: "from-image",
      });
    } else {
      objectUrl = URL.createObjectURL(file);
      source = new Image();
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          source.onload = source.onerror = null;
          reject(new Error("Не удалось прочитать фотографию."));
        }, 15000);
        source.onload = () => {
          clearTimeout(timeout);
          source.onload = source.onerror = null;
          resolve();
        };
        source.onerror = () => {
          clearTimeout(timeout);
          source.onload = source.onerror = null;
          reject(new Error("Не удалось прочитать фотографию."));
        };
        source.src = objectUrl;
      });
    }
    const width = source.naturalWidth || source.width,
      height = source.naturalHeight || source.height;
    if (!width || !height) throw new Error("Фотография пуста или повреждена.");
    const scale = Math.min(1, 2160 / width, 2160 / height);
    if (scale === 1) return { file, resized: false };
    canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.floor(width * scale));
    canvas.height = Math.max(1, Math.floor(height * scale));
    const context = canvas.getContext("2d", { alpha: false });
    if (!context || !canvas.toBlob)
      throw new Error(
        "Не удалось подготовить фотографию. Выберите снимок меньшего размера.",
      );
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve, reject) =>
      canvas.toBlob(
        (result) =>
          result
            ? resolve(result)
            : reject(new Error("Не удалось подготовить фотографию.")),
        "image/jpeg",
        0.9,
      ),
    );
    if (!blob.size || blob.size > maxBytes || blob.type !== "image/jpeg")
      throw new Error(
        "Подготовленный снимок превышает 10 МБ. Выберите другой снимок.",
      );
    return {
      file: new File(
        [blob],
        `${String(file.name || "Документ").replace(/\.[^.]+$/, "")}.jpg`,
        { type: "image/jpeg", lastModified: Date.now() },
      ),
      resized: true,
    };
  } catch (reason) {
    throw new Error(
      reason?.message ||
        "Не удалось подготовить фотографию. Выберите другой снимок.",
    );
  } finally {
    source?.close?.();
    if (objectUrl) {
      if (source) source.src = "";
      URL.revokeObjectURL(objectUrl);
    }
    if (canvas) canvas.width = canvas.height = 1;
  }
}
async function photoPayload(file) {
  if (
    !file ||
    !["image/jpeg", "image/png"].includes(file.type) ||
    file.size > 10 * 1024 * 1024 ||
    !file.size
  )
    throw new Error(
      "Выберите фотографию JPEG или PNG размером не более 10 МБ.",
    );
  const base64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () =>
      reject(new Error("Не удалось прочитать фотографию."));
    reader.readAsDataURL(file);
  });
  return { mimeType: file.type, base64 };
}
function normalizeOcr(value, type) {
  const text =
    typeof value === "string" ? value : value?.text || value?.value || "";
  if (type === "date" && /^\d{2}\.\d{2}\.\d{4}$/.test(text))
    return text.split(".").reverse().join("-");
  return String(text);
}
export function createRecruitmentOnboarding(
  React,
  { request, PhotoPicker, PhotoPreview, LocalPhotoPreview },
) {
  const { createElement: h, useState, useEffect, useRef } = React;
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
  const select = (value, options, onChange, props = {}) =>
    h(
      "select",
      { value, onChange: (event) => onChange(event.target.value), ...props },
      ...options.map(([id, label]) =>
        h("option", { key: id, value: id }, label),
      ),
    );
  const check = (label, checked, onChange, props = {}) =>
    h(
      "label",
      { className: "onboarding-check" },
      h("input", {
        type: "checkbox",
        checked,
        onChange: (event) => onChange(event.target.checked),
        ...props,
      }),
      label,
    );
  const notice = (text) => h("p", { className: "onboarding-notice" }, text);
  function ProtectedPhoto({ photo, token, onExpired }) {
    const [expired, setExpired] = useState(() => !livePhoto(photo));
    useEffect(() => {
      const delay = Date.parse(photo.expiresAt) - Date.now();
      setExpired(Boolean(photo.deletedAt) || delay <= 0);
      if (photo.deletedAt || delay <= 0) return;
      const timer = setTimeout(
        () => setExpired(true),
        Math.min(delay, 2147483647),
      );
      return () => clearTimeout(timer);
    }, [photo.id, photo.expiresAt, photo.deletedAt]);
    return expired
      ? h("p", { className: "recruitment-meta" }, "Срок хранения фото истёк.")
      : h(PhotoPreview, {
          token,
          path: `${BASE}/photos/${photo.id}/content`,
          alt: photo.label,
          onExpired,
        });
  }
  function Fields({ template, values, onChange, disabled = false }) {
    return h(
      "div",
      { className: "onboarding-fields" },
      ...(template.fields || []).map((item) => {
        const props = {
          value: values[item.id] || "",
          required: item.required,
          disabled,
          autoComplete: "off",
          maxLength: item.type === "textarea" ? 4000 : 1000,
          onChange: (event) =>
            onChange({ ...values, [item.id]: event.target.value }),
        };
        return h(
          "div",
          { key: item.id },
          field(
            `${item.label}${item.required ? " *" : ""}`,
            item.type === "select"
              ? select(
                  props.value,
                  [
                    ["", "Выберите значение"],
                    ...(item.options || []).map((value) => [value, value]),
                  ],
                  (value) => onChange({ ...values, [item.id]: value }),
                  { required: item.required, disabled },
                )
              : h(item.type === "textarea" ? "textarea" : "input", {
                  ...props,
                  ...(item.type === "textarea"
                    ? { rows: 3 }
                    : {
                        type:
                          item.type === "tel" || item.type === "date"
                            ? item.type
                            : "text",
                      }),
                }),
          ),
        );
      }),
    );
  }
  function UploadDocument({ document: item, upload, disabled, uploaded = [] }) {
    const [file, setFile] = useState(null),
      [resized, setResized] = useState(false),
      [pending, setPending] = useState(false),
      [error, setError] = useState("");
    const active = useRef(true),
      inFlight = useRef(false);
    useEffect(() => {
      active.current = true;
      return () => {
        active.current = false;
      };
    }, []);
    async function send() {
      if (!file || inFlight.current) return;
      inFlight.current = true;
      setPending(true);
      setError("");
      try {
        await upload(item, await photoPayload(file));
        if (active.current) setFile(null);
      } catch (reason) {
        if (active.current)
          setError(reason.message || "Не удалось загрузить фото.");
      } finally {
        inFlight.current = false;
        if (active.current) setPending(false);
      }
    }
    return h(
      "div",
      { className: "onboarding-upload" },
      h(PhotoPicker, {
        label: `Добавить фото: ${item.label}`,
        cameraLabel: `Сфотографировать: ${item.label}`,
        accept: "image/jpeg,image/png",
        maxBytes: 10 * 1024 * 1024,
        disabled: disabled || pending,
        resetKey: item.id,
        onFiles: async (files) => {
          setFile(null);
          setResized(false);
          setError("");
          const prepared = await prepareOnboardingPhoto(files[0]);
          if (!active.current) return;
          setFile(prepared.file);
          setResized(prepared.resized);
        },
      }),
      file &&
        h(
          "div",
          { className: "onboarding-staged" },
          h(LocalPhotoPreview, { file, alt: item.label }),
          resized &&
            h(
              "p",
              { className: "recruitment-meta" },
              "Фото подготовлено для распознавания. Ниже будет отправлен именно этот снимок.",
            ),
          h(
            "p",
            { className: "recruitment-meta" },
            "Проверьте чёткость: все края документа и надписи должны быть видны.",
          ),
          h(
            "div",
            { className: "recruitment-actions" },
            button(pending ? "Загружаем…" : "Загрузить фото", send, {
              ...primary,
              disabled: pending || disabled,
            }),
            button("Убрать снимок", () => setFile(null), { disabled: pending }),
          ),
        ),
      error && h("p", { className: "recruitment-error", role: "alert" }, error),
      uploaded.length > 0 &&
        h(
          "p",
          { className: "onboarding-success", role: "status" },
          `Загружено фото: ${uploaded.length}. Автоудаление: ${dateLabel(uploaded[uploaded.length - 1].expiresAt)}.`,
        ),
    );
  }
  function TemplateEditor({
    initial,
    busy,
    onSave,
    onCancel,
    onDirtyChange,
  }) {
    const [draft, setDraft] = useState(() => copy(initial));
    const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
    const dirtyCallback = useRef(onDirtyChange);
    dirtyCallback.current = onDirtyChange;
    useEffect(() => {
      dirtyCallback.current?.(dirty);
    }, [dirty]);
    useEffect(() => () => dirtyCallback.current?.(false), []);
    const update = (key, value) =>
      setDraft((current) => ({ ...current, [key]: value }));
    const itemUpdate = (key, id, patch) =>
      update(
        key,
        draft[key].map((item) =>
          item.id === id ? { ...item, ...patch } : item,
        ),
      );
    function move(key, index, direction) {
      const items = [...draft[key]];
      [items[index], items[index + direction]] = [
        items[index + direction],
        items[index],
      ];
      update(key, items);
    }
    function save(event) {
      event.preventDefault();
      onSave({
        ...draft,
        active: event.nativeEvent?.submitter?.value === "publish",
      });
    }
    function controls(key, item, index) {
      return h(
        "div",
        { className: "onboarding-item-controls" },
        check("Обязательное", Boolean(item.required), (value) =>
          itemUpdate(key, item.id, { required: value }),
        ),
        button("↑", () => move(key, index, -1), {
          disabled: index === 0,
          "aria-label": `Поднять: ${item.label}`,
        }),
        button("↓", () => move(key, index, 1), {
          disabled: index === draft[key].length - 1,
          "aria-label": `Опустить: ${item.label}`,
        }),
        button(
          "Удалить",
          () =>
            update(
              key,
              draft[key].filter((value) => value.id !== item.id),
            ),
          { "aria-label": `Удалить: ${item.label}` },
        ),
      );
    }
    return h(
      "form",
      { className: "onboarding-builder", onSubmit: save },
      h(
        "div",
        { className: "onboarding-section-heading" },
        h(
          "div",
          null,
          h(
            "h3",
            null,
            initial.version ? "Редактирование формы" : "Новая форма",
          ),
          h(
            "p",
            { className: "recruitment-meta" },
            "Изменения применяются к новым оформлениям. Уже созданные сохраняют свою версию формы.",
          ),
        ),
        button("Закрыть конструктор", onCancel, { disabled: busy }),
      ),
      h(
        "fieldset",
        { disabled: busy, className: "onboarding-fieldset" },
        h(
          "div",
          { className: "onboarding-fields" },
          field(
            "Название формы",
            h("input", {
              value: draft.name,
              required: true,
              maxLength: 160,
              onChange: (event) => update("name", event.target.value),
            }),
          ),
          field(
            "Направление оформления",
            h("input", {
              value: draft.destination,
              required: true,
              maxLength: 160,
              placeholder: "Например, Оптиком",
              onChange: (event) => update("destination", event.target.value),
            }),
          ),
          field(
            "Тип оформления",
            select(draft.employmentType, EMPLOYMENT, (value) =>
              update("employmentType", value),
            ),
          ),
          field(
            "Инструкция кандидату",
            h("textarea", {
              value: draft.description,
              maxLength: 4000,
              rows: 3,
              onChange: (event) => update("description", event.target.value),
            }),
          ),
          field(
            "Информация об обработке данных",
            h("textarea", {
              value: draft.privacyNotice,
              required: true,
              maxLength: 8000,
              rows: 4,
              placeholder:
                "Оператор, цель и основание обработки, контакты и ссылка на политику",
              onChange: (event) => update("privacyNotice", event.target.value),
            }),
            "Укажите согласованную в компании информацию для этого вида оформления.",
          ),
        ),
        h(
          "section",
          { className: "onboarding-section", "aria-label": "Поля формы" },
          h("h3", null, "Поля формы"),
          ...draft.fields.map((item, index) =>
            h(
              "div",
              { className: "onboarding-builder-row", key: item.id },
              h(
                "div",
                { className: "onboarding-fields" },
                field(
                  `Название поля ${index + 1}`,
                  h("input", {
                    required: true,
                    value: item.label,
                    maxLength: 160,
                    onChange: (event) =>
                      itemUpdate("fields", item.id, {
                        label: event.target.value,
                      }),
                  }),
                ),
                field(
                  `Тип поля ${index + 1}`,
                  select(item.type, FIELD_TYPES, (value) =>
                    itemUpdate("fields", item.id, { type: value }),
                  ),
                ),
                field(
                  `Ключ OCR ${index + 1}`,
                  h("input", {
                    value: item.ocrKey || "",
                    placeholder: "Например, surname",
                    maxLength: 80,
                    onChange: (event) =>
                      itemUpdate("fields", item.id, {
                        ocrKey: event.target.value,
                      }),
                  }),
                  "Ключ поля в результате распознавания. Оставьте пустым для ручного ввода.",
                ),
                item.type === "select" &&
                  field(
                    `Варианты поля ${index + 1}`,
                    h("textarea", {
                      value: (item.options || []).join("\n"),
                      rows: 3,
                      required: true,
                      onChange: (event) =>
                        itemUpdate("fields", item.id, {
                          options: event.target.value.split("\n"),
                        }),
                    }),
                    "Каждое значение с новой строки.",
                  ),
              ),
              controls("fields", item, index),
            ),
          ),
          button(
            "Добавить поле",
            () =>
              update("fields", [
                ...draft.fields,
                {
                  id: uuid(),
                  label: "",
                  type: "text",
                  required: false,
                  options: [],
                  ocrKey: "",
                },
              ]),
            { disabled: draft.fields.length >= 60 },
          ),
        ),
        h(
          "section",
          { className: "onboarding-section", "aria-label": "Документы формы" },
          h("h3", null, "Документы"),
          h(
            "p",
            { className: "recruitment-meta" },
            "Добавляйте только необходимые для этого типа оформления документы. Каждая сторона — отдельный пункт.",
          ),
          ...draft.documents.map((item, index) =>
            h(
              "div",
              { className: "onboarding-builder-row", key: item.id },
              h(
                "div",
                { className: "onboarding-fields" },
                field(
                  `Название документа ${index + 1}`,
                  h("input", {
                    required: true,
                    value: item.label,
                    maxLength: 160,
                    onChange: (event) =>
                      itemUpdate("documents", item.id, {
                        label: event.target.value,
                      }),
                  }),
                ),
                field(
                  `Тип документа ${index + 1}`,
                  select(item.type, DOCUMENT_TYPES, (value) =>
                    itemUpdate("documents", item.id, {
                      type: value,
                      label: DOCUMENT_TYPES.find(([id]) => id === value)[1],
                    }),
                  ),
                ),
              ),
              controls("documents", item, index),
            ),
          ),
          button(
            "Добавить документ",
            () =>
              update("documents", [
                ...draft.documents,
                {
                  id: uuid(),
                  label: "Другой документ",
                  type: "other",
                  required: false,
                },
              ]),
            { disabled: draft.documents.length >= 20 },
          ),
        ),
        h(
          "div",
          { className: "recruitment-actions" },
          h(
            "button",
            {
              type: "submit",
              name: "saveMode",
              value: "draft",
              className: "button",
              disabled: busy,
            },
            "Сохранить черновик",
          ),
          h(
            "button",
            {
              type: "submit",
              name: "saveMode",
              value: "publish",
              className: "button recruitment-primary",
              disabled: busy,
            },
            busy ? "Сохраняем…" : "Опубликовать форму",
          ),
        ),
      ),
    );
  }
  function SessionEditor({
    initial,
    token,
    ocrConfigured,
    ocrProvider,
    storageConfigured,
    busy,
    perform,
    onUpdated,
    onClose,
    onDirtyChange,
    onExpired,
  }) {
    const [session, setSession] = useState(initial),
      [values, setValues] = useState(initial.values || {}),
      [link, setLink] = useState(null),
      [ocr, setOcr] = useState(null),
      [reviewChecks, setReviewChecks] = useState({}),
      [finalChecked, setFinalChecked] = useState(false),
      [copyMessage, setCopyMessage] = useState("");
    const dirty =
      JSON.stringify(values) !== JSON.stringify(session.values || {});
    const dirtyCallback = useRef(onDirtyChange);
    dirtyCallback.current = onDirtyChange;
    useEffect(() => {
      dirtyCallback.current?.(dirty);
    }, [dirty]);
    useEffect(() => () => dirtyCallback.current?.(false), []);
    const template = session.templateSnapshot,
      verified = session.status === "verified";
    const changed = (result) => {
      setSession(result);
      onUpdated(result);
    };
    const refresh = async () => {
      const result = await request(`${BASE}/sessions/${session.id}`, {}, token);
      changed(result);
      if (!result.linkActive) setLink(null);
      return result;
    };
    const updateValues = (next) => {
      setValues(next);
      setFinalChecked(false);
    };
    async function save(verify = false) {
      await perform(
        async () => {
          const result = await request(
            `${BASE}/sessions/${session.id}${verify ? "/verify" : ""}`,
            {
              method: verify ? "POST" : "PUT",
              body: JSON.stringify({ version: session.version, values }),
            },
            token,
          );
          changed(result);
          setValues(result.values);
          if (!result.linkActive) setLink(null);
          if (verify) {
            setLink(null);
            setOcr(null);
          }
        },
        verify
          ? "Оформление проверено. Ссылка кандидату отозвана."
          : "Поля сохранены.",
      );
    }
    async function upload(item, payload) {
      return perform(
        async () => {
          const photo = await request(
            `${BASE}/sessions/${session.id}/photos`,
            {
              method: "POST",
              body: JSON.stringify({ documentId: item.id, ...payload }),
            },
            token,
          );
          try {
            await refresh();
          } catch (reason) {
            if ([401, 403].includes(reason?.status)) throw reason;
            const next = {
              ...session,
              photos: [...(session.photos || []), photo],
            };
            changed(next);
          }
          setFinalChecked(false);
        },
        "Фотография загружена.",
        true,
      );
    }
    async function recognize(photo) {
      setOcr(null);
      await perform(async () => {
        const result = await request(
          `${BASE}/photos/${photo.id}/recognize`,
          { method: "POST", body: "{}" },
          token,
        );
        const suggestions = Object.fromEntries(
          template.fields
            .filter(
              (item) =>
                item.ocrKey && Object.hasOwn(result.fields || {}, item.ocrKey),
            )
            .map((item) => [
              item.id,
              normalizeOcr(result.fields[item.ocrKey], item.type),
            ]),
        );
        setOcr({
          photoId: photo.id,
          ...result,
          suggestions,
          selected: Object.fromEntries(
            Object.keys(suggestions).map((id) => [id, true]),
          ),
        });
        setSession((current) => ({
          ...current,
          photos: current.photos.map((item) =>
            item.id === photo.id ? { ...item, ocrStatus: "recognized" } : item,
          ),
        }));
      });
    }
    function ocrDraft(photo) {
      if (ocr?.photoId !== photo.id) return null;
      const suggestions = template.fields.filter((item) =>
        Object.hasOwn(ocr.suggestions, item.id),
      );
      return h(
        "section",
        { className: "onboarding-ocr", "aria-label": "Черновик распознавания" },
        h("h4", null, "Черновик распознавания"),
        h(
          "p",
          { className: "recruitment-meta" },
          "Сверьте каждое значение со снимком. Отмеченные поля заменят текущие значения карточки.",
        ),
        suggestions.length
          ? suggestions.map((item) =>
              h(
                "div",
                { key: item.id, className: "onboarding-ocr-row" },
                check(
                  `Перенести: ${item.label}`,
                  Boolean(ocr.selected[item.id]),
                  (checked) =>
                    setOcr((current) => ({
                      ...current,
                      selected: { ...current.selected, [item.id]: checked },
                    })),
                ),
                field(
                  item.label,
                  h("input", {
                    value: ocr.suggestions[item.id],
                    onChange: (event) => {
                      const value = event.target.value;
                      setOcr((current) => ({
                        ...current,
                        suggestions: {
                          ...current.suggestions,
                          [item.id]: value,
                        },
                      }));
                    },
                  }),
                ),
              ),
            )
          : h(
              "p",
              null,
              "Для этой фотографии нет совпадений с ключами полей формы. Перенесите нужные данные вручную.",
            ),
        h(
          "details",
          null,
          h("summary", null, "Распознанный текст и ключи полей"),
          h("pre", null, ocr.text || "Текст не найден"),
          h(
            "dl",
            { className: "onboarding-ocr-keys" },
            ...Object.entries(ocr.fields || {}).map(([key, value]) =>
              h(
                "div",
                { key },
                h("dt", null, key),
                h("dd", null, normalizeOcr(value)),
              ),
            ),
          ),
        ),
        h(
          "div",
          { className: "recruitment-actions" },
          suggestions.length > 0 &&
            button(
              "Перенести выбранные поля",
              () => {
                updateValues({
                  ...values,
                  ...Object.fromEntries(
                    Object.entries(ocr.suggestions).filter(
                      ([id]) => ocr.selected[id],
                    ),
                  ),
                });
                setOcr(null);
              },
              primary,
            ),
          button("Закрыть распознавание", () => setOcr(null)),
        ),
      );
    }
    return h(
      "section",
      { className: "onboarding-editor", "aria-label": "Карточка оформления" },
      h(
        "div",
        { className: "onboarding-section-heading" },
        h(
          "div",
          null,
          h("h3", null, session.candidateName || "Новое оформление"),
          h(
            "p",
            { className: "recruitment-meta" },
            `${template.destination} · ${employmentName(template.employmentType)} · ${statusName(session.status)}`,
          ),
        ),
        button("К списку оформлений", onClose, { disabled: busy }),
      ),
      notice(
        "Фотографии удаляются автоматически через 72 часа после загрузки, даже если проверка ещё не завершена. Проверенные фото можно удалить раньше в разделе «Фотографии».",
      ),
      ocrConfigured &&
        h(
          "p",
          { className: "recruitment-meta" },
          `Сервис распознавания: ${ocrProvider === "vk" ? "VK Cloud" : ocrProvider === "yandex" ? "Яндекс" : "подключён"}. Результат нужно сверить со снимком.`,
        ),
      storageConfigured === false &&
        notice(
          "Хранилище фотографий пока не настроено. Загрузка недоступна; можно подготовить поля оформления.",
        ),
      !ocrConfigured &&
        notice(
          "Распознавание документов пока не настроено. Можно загрузить фото, заполнить поля вручную и проверить документы.",
        ),
      h(
        "section",
        { className: "onboarding-section" },
        h("h3", null, "Данные оформления"),
        h(Fields, {
          template,
          values,
          onChange: updateValues,
          disabled: busy || verified,
        }),
        !verified &&
          button(busy ? "Сохраняем…" : "Сохранить поля", () => save(), {
            ...primary,
            disabled: busy || !dirty,
          }),
      ),
      !verified &&
        h(
          "section",
          { className: "onboarding-section" },
          h("h3", null, "Ссылка кандидату"),
          h(
            "p",
            { className: "recruitment-meta" },
            "Кандидат может заполнить форму и загрузить документы самостоятельно. Ссылка действует 7 дней, до отправки или отзыва. Сохранение данных сотрудником отзывает выданную ссылку.",
          ),
          h(
            "div",
            { className: "recruitment-actions" },
            button(
              session.linkActive
                ? "Создать новую ссылку"
                : "Создать ссылку кандидату",
              () =>
                perform(async () => {
                  const result = await request(
                    `${BASE}/sessions/${session.id}/link`,
                    { method: "POST", body: "{}" },
                    token,
                  );
                  const url = new URL(window.location.origin + "/");
                  url.hash = `onboarding=${encodeURIComponent(result.token)}`;
                  setLink({ url: url.href, expiresAt: result.expiresAt });
                  setCopyMessage("");
                  await refresh();
                }, "Ссылка создана. Предыдущая ссылка отозвана."),
              { disabled: busy },
            ),
            session.linkActive &&
              button(
                "Отозвать ссылку",
                () =>
                  perform(async () => {
                    await request(
                      `${BASE}/sessions/${session.id}/revoke-link`,
                      { method: "POST", body: "{}" },
                      token,
                    );
                    setLink(null);
                    await refresh();
                  }, "Ссылка отозвана."),
                { disabled: busy },
              ),
          ),
          link &&
            h(
              "div",
              { className: "onboarding-link" },
              field(
                "Личная ссылка кандидата",
                h("input", {
                  value: link.url,
                  readOnly: true,
                  onFocus: (event) => event.target.select(),
                  autoComplete: "off",
                }),
              ),
              button("Скопировать ссылку", async () => {
                try {
                  await navigator.clipboard.writeText(link.url);
                  setCopyMessage("Ссылка скопирована.");
                } catch {
                  setCopyMessage("Выделите и скопируйте ссылку из поля.");
                }
              }),
              h(
                "p",
                { className: "recruitment-meta" },
                `Действует до ${dateLabel(link.expiresAt)}. Передайте только кандидату.`,
              ),
              copyMessage && h("p", { role: "status" }, copyMessage),
            ),
        ),
      h(
        "section",
        { className: "onboarding-section" },
        h("h3", null, "Документы и сверка"),
        ...template.documents.map((item) => {
          const photos = (session.photos || [])
            .filter((photo) => photo.documentId === item.id)
            .sort(
              (left, right) =>
                Date.parse(left.uploadedAt) - Date.parse(right.uploadedAt),
            );
          return h(
            "section",
            {
              key: item.id,
              className: "onboarding-document",
              "aria-label": item.label,
            },
            h(
              "div",
              { className: "onboarding-section-heading" },
              h("h4", null, `${item.label}${item.required ? " *" : ""}`),
              h(
                "span",
                { className: "recruitment-badge" },
                photos[photos.length - 1]?.reviewedAt
                  ? "Проверен"
                  : "Ожидает проверки",
              ),
            ),
            ...photos.map((photo) =>
              h(
                "article",
                {
                  key: photo.id,
                  className: "onboarding-photo",
                  "data-photo-id": photo.id,
                },
                livePhoto(photo)
                  ? h(
                      React.Fragment,
                      null,
                      h(ProtectedPhoto, { photo, token, onExpired }),
                      h(
                        "p",
                        { className: "recruitment-meta" },
                        `Автоудаление: ${dateLabel(photo.expiresAt)}`,
                      ),
                      !verified &&
                        h(
                          "div",
                          { className: "recruitment-actions" },
                          button(
                            "Распознать документ",
                            () => recognize(photo),
                            { disabled: busy || !ocrConfigured },
                          ),
                          photo.reviewedAt
                            ? h(
                                "span",
                                { className: "onboarding-success" },
                                `Проверено ${dateLabel(photo.reviewedAt)}`,
                              )
                            : h(
                                React.Fragment,
                                null,
                                check(
                                  "Фото и данные сверены",
                                  Boolean(reviewChecks[photo.id]),
                                  (checked) =>
                                    setReviewChecks((current) => ({
                                      ...current,
                                      [photo.id]: checked,
                                    })),
                                  { disabled: busy },
                                ),
                                button(
                                  "Снимок проверен",
                                  () =>
                                    perform(async () => {
                                      await request(
                                        `${BASE}/photos/${photo.id}/review`,
                                        { method: "POST", body: "{}" },
                                        token,
                                      );
                                      await refresh();
                                    }, "Проверка снимка сохранена."),
                                  { disabled: busy || !reviewChecks[photo.id] },
                                ),
                              ),
                        ),
                      ocrDraft(photo),
                    )
                  : h(
                      "p",
                      { className: "recruitment-meta" },
                      `Фото удалено${photo.reviewedAt ? " · проверка сохранена" : " · не было проверено, нужен новый снимок"}.`,
                    ),
              ),
            ),
            !verified &&
              h(UploadDocument, {
                document: item,
                upload,
                disabled: busy || storageConfigured === false,
              }),
          );
        }),
      ),
      !verified &&
        h(
          "section",
          { className: "onboarding-section onboarding-final-check" },
          h("h3", null, "Завершение оформления"),
          check(
            "Обязательные документы и все данные проверены",
            finalChecked,
            setFinalChecked,
            { disabled: busy },
          ),
          button("Завершить проверку", () => save(true), {
            ...primary,
            disabled: busy || !finalChecked,
          }),
        ),
      verified &&
        h(
          "p",
          { className: "onboarding-success", role: "status" },
          "Оформление проверено. Данные сохранены, ссылка кандидату закрыта.",
        ),
    );
  }
  function OnboardingPanel({
    token,
    scopes = [],
    defaultScopeId = "",
    candidates = [],
    initialCandidateId = "",
    onExpired,
    onDirtyChange,
    refreshKey = 0,
  }) {
    const [context, setContext] = useState(null),
      [loading, setLoading] = useState(true),
      [error, setError] = useState(""),
      [message, setMessage] = useState(""),
      [busy, setBusy] = useState(false);
    const [tab, setTab] = useState("sessions"),
      [templateDraft, setTemplateDraft] = useState(null),
      [session, setSession] = useState(null),
      [selectedPhotos, setSelectedPhotos] = useState({});
    const [direction, setDirection] = useState(""),
      [employmentType, setEmploymentType] = useState(""),
      [templateId, setTemplateId] = useState(""),
      [candidateId, setCandidateId] = useState(initialCandidateId),
      [search, setSearch] = useState(""),
      [candidateQuery, setCandidateQuery] = useState(""),
      [candidateResults, setCandidateResults] = useState([]);
    const active = useRef(true),
      inFlight = useRef(false),
      dirty = useRef(false),
      callbacks = useRef({ onExpired, onDirtyChange });
    callbacks.current = { onExpired, onDirtyChange };
    const setDirty = (value) => {
      dirty.current = value;
      callbacks.current.onDirtyChange?.(value);
    };
    useEffect(() => {
      active.current = true;
      return () => {
        active.current = false;
        callbacks.current.onDirtyChange?.(false);
      };
    }, []);
    async function load(signal) {
      const data = await request(`${BASE}/context`, { signal }, token);
      if (active.current && !signal?.aborted) setContext(data);
      return data;
    }
    function fail(reason) {
      if (reason?.name === "AbortError" || !active.current) return;
      if ([401, 403].includes(reason?.status)) {
        setContext(null);
        setSession(null);
        setTemplateDraft(null);
        setSelectedPhotos({});
        setDirty(false);
        if (reason.status === 401) callbacks.current.onExpired?.();
      }
      setError(
        reason?.message ||
          "Не удалось выполнить действие. Проверьте соединение и повторите попытку.",
      );
    }
    useEffect(() => {
      const abort = new AbortController();
      setLoading(true);
      setError("");
      load(abort.signal)
        .catch(fail)
        .finally(() => {
          if (!abort.signal.aborted) setLoading(false);
        });
      return () => abort.abort();
    }, [token, refreshKey]);
    useEffect(() => {
      if (candidateQuery.trim().length < 2) {
        setCandidateResults([]);
        return;
      }
      const abort = new AbortController();
      const timer = setTimeout(
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
    async function perform(action, feedback = "", rethrow = false) {
      if (inFlight.current) {
        if (rethrow) throw new Error("Дождитесь завершения текущего действия.");
        return;
      }
      inFlight.current = true;
      setBusy(true);
      setError("");
      setMessage("");
      try {
        await action();
        if (active.current && feedback) setMessage(feedback);
      } catch (reason) {
        fail(reason);
        if (rethrow) throw reason;
      } finally {
        inFlight.current = false;
        if (active.current) setBusy(false);
      }
    }
    function discard() {
      return (
        !dirty.current ||
        window.confirm(
          "Есть несохранённые данные оформления. Выйти без сохранения?",
        )
      );
    }
    function navigate(next) {
      if (busy || !discard()) return;
      setDirty(false);
      setSession(null);
      setTemplateDraft(null);
      setTab(next);
      setMessage("");
      setError("");
    }
    const templates = context?.templates || [],
      sessions = context?.sessions || [];
    const candidateChoices = [
      ...new Map(
        [...candidates, ...candidateResults].map((item) => [item.id, item]),
      ).values(),
    ];
    const selectedCandidate = candidateChoices.find(item => item.id === candidateId);
    const selectedCompany = selectedCandidate?.legalEntityId || scopes.find(scope => scope.responsibilityScopeId === selectedCandidate?.responsibilityScopeId)?.legalEntityId;
    const activeTemplates = templates.filter((item) => item.active && (!selectedCompany || scopes.find(scope => scope.responsibilityScopeId === item.responsibilityScopeId)?.legalEntityId === selectedCompany));
    const available = activeTemplates.filter(
      (item) =>
        (!direction || item.destination === direction) &&
        (!employmentType || item.employmentType === employmentType),
    );
    const selectedTemplate = available.find((item) => item.id === templateId);
    const photos = sessions.flatMap((item) =>
      (item.photos || []).map((photo) => ({
        ...photo,
        candidateName: item.candidateName || "Без карточки кандидата",
        destination: item.templateSnapshot?.destination || "",
        sessionId: item.id,
      })),
    );
    const livePhotos = photos.filter(livePhoto),
      reviewedPhotos = livePhotos.filter((photo) => photo.reviewedAt),
      selectedIds = reviewedPhotos
        .filter((photo) => selectedPhotos[photo.id])
        .map((photo) => photo.id);
    const updated = (result) =>
      setContext((current) => ({
        ...current,
        sessions: [
          result,
          ...current.sessions.filter((item) => item.id !== result.id),
        ],
      }));
    const saveTemplate = (value) =>
      perform(
        async () => {
          const result = await request(
            `${BASE}/templates`,
            { method: "PUT", body: JSON.stringify(value) },
            token,
          );
          setContext((current) => ({
            ...current,
            templates: [
              result,
              ...current.templates.filter((item) => item.id !== result.id),
            ],
          }));
          setTemplateDraft(null);
          setDirty(false);
        },
        value.active ? "Форма опубликована." : "Черновик формы сохранён.",
      );
    async function openSession(item) {
      if (!discard()) return;
      await perform(async () => {
        const result = await request(`${BASE}/sessions/${item.id}`, {}, token);
        setDirty(false);
        setSession(result);
      });
    }
    return h(
      "div",
      { className: "onboarding-workspace" },
      h(
        "nav",
        {
          className: "recruitment-segment",
          "aria-label": "Разделы оформления",
        },
        ...[
          ["sessions", "Оформления"],
          ...(context?.canManageTemplates
            ? [["templates", "Конструктор форм"]]
            : []),
          ["photos", "Фотографии"],
        ].map(([id, label]) =>
          button(label, () => navigate(id), {
            key: id,
            "aria-pressed": tab === id,
            disabled: busy,
          }),
        ),
      ),
      error &&
        h("div", { className: "recruitment-error", role: "alert" }, error),
      message &&
        h(
          "div",
          { className: "recruitment-feedback", role: "status" },
          message,
        ),
      context?.storageConfigured === false &&
        !session &&
        notice(
          "Хранилище фотографий пока не настроено. Обратитесь к администратору; загрузка фото станет доступна после подключения.",
        ),
      context?.cleanup?.failed &&
        notice(
          "Фоновое удаление фотографий задерживается. Доступ к просроченным снимкам уже закрыт; система повторит удаление.",
        ),
      context?.truncated &&
        notice(
          "Показаны последние 1000 оформлений. Более ранние записи не входят в этот список.",
        ),
      loading && h("p", { role: "status" }, "Загружаем оформление…"),
      !loading &&
        !context &&
        button("Повторить загрузку", () => perform(() => load())),
      context &&
        tab === "sessions" &&
        (session
          ? h(SessionEditor, {
              key: session.id,
              initial: session,
              token,
              ocrConfigured: context.ocr?.configured,
              ocrProvider: context.ocr?.provider,
              storageConfigured: context.storageConfigured,
              busy,
              perform,
              onUpdated: updated,
              onClose: () => {
                if (discard()) {
                  setSession(null);
                  setDirty(false);
                }
              },
              onDirtyChange: setDirty,
              onExpired,
            })
          : h(
              React.Fragment,
              null,
              h(
                "section",
                {
                  className: "onboarding-card",
                  "aria-label": "Новое оформление",
                },
                h("h3", null, "Начать оформление"),
                h(
                  "p",
                  { className: "recruitment-meta" },
                  "Выберите, куда оформляется кандидат. Можно снять документы в офисе или отправить личную ссылку.",
                ),
                activeTemplates.length
                  ? h(
                      React.Fragment,
                      null,
                      h(
                        "div",
                        { className: "onboarding-fields" },
                        field(
                          "Направление",
                          select(
                            direction,
                            [
                              ["", "Все направления"],
                              ...[
                                ...new Set(
                                  activeTemplates.map(
                                    (item) => item.destination,
                                  ),
                                ),
                              ].map((value) => [value, value]),
                            ],
                            (value) => {
                              setDirection(value);
                              setTemplateId("");
                            },
                          ),
                        ),
                        field(
                          "Тип оформления",
                          select(
                            employmentType,
                            [["", "Все типы"], ...EMPLOYMENT],
                            (value) => {
                              setEmploymentType(value);
                              setTemplateId("");
                            },
                          ),
                        ),
                        field(
                          "Форма оформления",
                          select(
                            templateId,
                            [
                              ["", "Выберите форму"],
                              ...available.map((item) => [
                                item.id,
                                `${item.name} · ${employmentName(item.employmentType)}`,
                              ]),
                            ],
                            setTemplateId,
                          ),
                        ),
                        field(
                          "Найти кандидата",
                          h("input", {
                            type: "search",
                            value: candidateQuery,
                            placeholder: "Имя или телефон, минимум 2 символа",
                            onChange: (event) =>
                              setCandidateQuery(event.target.value),
                          }),
                        ),
                        field(
                          "Кандидат",
                          select(
                            candidateId,
                            [
                              ["", "Без привязки к карточке"],
                              ...candidateChoices.map((item) => [
                                item.id,
                                item.fullName || item.name || "Кандидат",
                              ]),
                            ],
                            (value) => { setCandidateId(value); setTemplateId(""); },
                          ),
                        ),
                      ),
                      button(
                        "Начать оформление",
                        () =>
                          perform(async () => {
                            const result = await request(
                              `${BASE}/sessions`,
                              {
                                method: "POST",
                                body: JSON.stringify({
                                  templateId,
                                  ...(candidateId ? { candidateId } : {}),
                                }),
                              },
                              token,
                            );
                            updated(result);
                            setSession(result);
                          }, "Оформление создано."),
                        { ...primary, disabled: busy || !selectedTemplate },
                      ),
                    )
                  : notice(
                      selectedCandidate
                        ? context.canManageTemplates
                          ? "Для выбранного кандидата пока нет опубликованной формы. Создайте и опубликуйте форму в конструкторе."
                          : "Для выбранного кандидата пока нет опубликованной формы. Обратитесь к руководителю."
                        : context.canManageTemplates
                        ? "Сначала создайте и опубликуйте форму в конструкторе."
                        : "Пока нет опубликованных форм. Обратитесь к руководителю.",
                    ),
              ),
              h(
                "section",
                { className: "onboarding-section" },
                h(
                  "div",
                  { className: "onboarding-section-heading" },
                  h("h3", null, `Оформления · ${sessions.length}`),
                  button("Обновить оформления", () => perform(() => load()), {
                    disabled: busy,
                  }),
                ),
                field(
                  "Поиск оформлений",
                  h("input", {
                    type: "search",
                    value: search,
                    placeholder: "Кандидат или направление",
                    onChange: (event) => setSearch(event.target.value),
                  }),
                ),
                h(
                  "div",
                  { className: "onboarding-list" },
                  ...sessions
                    .filter((item) =>
                      `${item.candidateName || ""} ${item.templateSnapshot?.destination || ""}`
                        .toLocaleLowerCase("ru")
                        .includes(search.toLocaleLowerCase("ru")),
                    )
                    .map((item) =>
                      h(
                        "article",
                        { className: "onboarding-list-item", key: item.id },
                        h(
                          "div",
                          null,
                          h(
                            "strong",
                            null,
                            item.candidateName || "Без карточки кандидата",
                          ),
                          h(
                            "p",
                            { className: "recruitment-meta" },
                            `${item.templateSnapshot?.destination || ""} · ${employmentName(item.templateSnapshot?.employmentType)} · ${dateLabel(item.createdAt)}`,
                          ),
                        ),
                        h(
                          "span",
                          { className: "recruitment-badge" },
                          statusName(item.status),
                        ),
                        button("Открыть оформление", () => openSession(item), {
                          disabled: busy,
                          "aria-label": `Открыть оформление: ${item.candidateName || "без карточки кандидата"}`,
                        }),
                      ),
                    ),
                  !sessions.length &&
                    h(
                      "p",
                      { className: "recruitment-meta" },
                      "Здесь появятся созданные оформления.",
                    ),
                ),
              ),
            )),
      context &&
        tab === "templates" &&
        context.canManageTemplates &&
        (templateDraft
          ? h(TemplateEditor, {
              key: templateDraft.id,
              initial: templateDraft,
              busy,
              onSave: saveTemplate,
              onCancel: () => {
                if (discard()) {
                  setTemplateDraft(null);
                  setDirty(false);
                }
              },
              onDirtyChange: setDirty,
            })
          : h(
              "section",
              { className: "onboarding-section" },
              h(
                "div",
                { className: "onboarding-section-heading" },
                h("h3", null, "Формы по направлениям"),
                button(
                  "Создать форму",
                  () =>
                    setTemplateDraft(
                      newTemplate(selectedCandidate?.responsibilityScopeId || defaultScopeId || scopes[0]?.responsibilityScopeId),
                    ),
                  primary,
                ),
              ),
              notice(
                "Настройте отдельные формы для сотрудников, ИП и самозанятых. В опубликованной форме рекрутер создаёт оформление и личную ссылку.",
              ),
              h(
                "div",
                { className: "onboarding-list" },
                ...templates.map((item) =>
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
                        item.active ? "Опубликована" : "Черновик / архив",
                      ),
                    ),
                    h(
                      "p",
                      { className: "recruitment-meta" },
                      `${item.destination} · ${employmentName(item.employmentType)} · ${item.fields.length} полей · ${item.documents.length} документов`,
                    ),
                    h(
                      "div",
                      { className: "recruitment-actions" },
                      button(
                        "Изменить форму",
                        () => setTemplateDraft(copy(item)),
                        { disabled: busy },
                      ),
                      button(
                        "Копировать форму",
                        () =>
                          setTemplateDraft({
                            ...copy(item),
                            id: uuid(),
                            version: 0,
                            name: `${item.name} — копия`,
                            active: false,
                          }),
                        { disabled: busy },
                      ),
                      button(
                        item.active ? "Снять с публикации" : "Опубликовать",
                        () => saveTemplate({ ...item, active: !item.active }),
                        { disabled: busy },
                      ),
                    ),
                  ),
                ),
              ),
            )),
      context &&
        tab === "photos" &&
        h(
          "section",
          { className: "onboarding-section" },
          h(
            "div",
            { className: "onboarding-section-heading" },
            h("h3", null, `Фотографии · ${livePhotos.length}`),
            button("Обновить фотографии", () => perform(() => load()), {
              disabled: busy,
            }),
          ),
          notice(
            "Снимки хранятся 72 часа с момента загрузки. После сверки можно удалить их сразу. Заполненные поля и отметки проверки сохраняются.",
          ),
          h(
            "div",
            { className: "recruitment-actions" },
            button(
              "Выбрать все проверенные",
              () =>
                setSelectedPhotos(
                  Object.fromEntries(
                    reviewedPhotos.map((photo) => [photo.id, true]),
                  ),
                ),
              { disabled: busy || !reviewedPhotos.length },
            ),
            button("Снять выбор", () => setSelectedPhotos({}), {
              disabled: busy || !selectedIds.length,
            }),
            button(
              `Удалить выбранные фото${selectedIds.length ? ` (${selectedIds.length})` : ""}`,
              () => {
                if (
                  !selectedIds.length ||
                  !window.confirm(
                    `Удалить ${selectedIds.length} проверенных фото? Восстановить снимки будет нельзя. Данные оформления сохранятся.`,
                  )
                )
                  return;
                perform(async () => {
                  const result = await request(
                    `${BASE}/photos/delete`,
                    {
                      method: "POST",
                      body: JSON.stringify({ photoIds: selectedIds }),
                    },
                    token,
                  );
                  setSelectedPhotos({});
                  await load();
                  setMessage(`Удалено фото: ${result.deleted}.`);
                });
              },
              { disabled: busy || !selectedIds.length },
            ),
          ),
          h(
            "div",
            { className: "onboarding-gallery" },
            ...livePhotos.map((photo) =>
              h(
                "article",
                {
                  className: "onboarding-gallery-card",
                  key: photo.id,
                  "data-photo-id": photo.id,
                },
                h("h4", null, photo.label),
                h(
                  "p",
                  { className: "recruitment-meta" },
                  `${photo.candidateName} · ${photo.destination}`,
                ),
                h(ProtectedPhoto, { photo, token, onExpired }),
                h(
                  "p",
                  { className: "recruitment-meta" },
                  `Автоудаление: ${dateLabel(photo.expiresAt)}`,
                ),
                h(
                  "span",
                  { className: "recruitment-badge" },
                  photo.reviewedAt ? "Проверено" : "Ожидает сверки",
                ),
                photo.reviewedAt &&
                  check(
                    "Выбрать для удаления",
                    Boolean(selectedPhotos[photo.id]),
                    (checked) =>
                      setSelectedPhotos((current) => ({
                        ...current,
                        [photo.id]: checked,
                      })),
                    {
                      disabled: busy,
                      "aria-label": `Выбрать фото: ${photo.label}`,
                    },
                  ),
                button(
                  "Открыть оформление",
                  () => {
                    setTab("sessions");
                    openSession({ id: photo.sessionId });
                  },
                  { disabled: busy },
                ),
              ),
            ),
          ),
          !livePhotos.length &&
            h(
              "p",
              { className: "recruitment-meta" },
              "Фотографий на хранении нет.",
            ),
        ),
    );
  }
  function PublicOnboardingPanel({ onboardingToken, onCancel }) {
    const [preview, setPreview] = useState(null),
      [values, setValues] = useState({}),
      [photos, setPhotos] = useState([]),
      [loading, setLoading] = useState(true),
      [busy, setBusy] = useState(false),
      [error, setError] = useState(""),
      [done, setDone] = useState(false),
      [acknowledged, setAcknowledged] = useState(false),
      [retry, setRetry] = useState(0);
    const active = useRef(true),
      submitting = useRef(false);
    const publicRequest = (path, body, options = {}) =>
      request(
        `/recruitment-onboarding/${path}`,
        {
          method: "POST",
          credentials: "omit",
          ...options,
          body: JSON.stringify({ token: onboardingToken, ...body }),
        },
        null,
        false,
      );
    useEffect(() => {
      active.current = true;
      const abort = new AbortController();
      setLoading(true);
      setError("");
      setPreview(null);
      setValues({});
      setPhotos([]);
      setAcknowledged(false);
      publicRequest("preview", {}, { signal: abort.signal })
        .then((result) => {
          if (!abort.signal.aborted) setPreview(result);
        })
        .catch((reason) => {
          if (!abort.signal.aborted)
            setError(
              [400, 404, 409, 410].includes(reason.status)
                ? "Ссылка недоступна: срок истёк, форма уже отправлена или ссылка отозвана. Попросите рекрутера выдать новую."
                : reason.message || "Не удалось загрузить форму.",
            );
        })
        .finally(() => {
          if (!abort.signal.aborted) setLoading(false);
        });
      return () => {
        active.current = false;
        abort.abort();
      };
    }, [onboardingToken, retry]);
    async function upload(item, payload) {
      if (submitting.current)
        throw new Error("Дождитесь завершения текущего действия.");
      submitting.current = true;
      setBusy(true);
      try {
        const photo = await publicRequest("upload", {
          documentId: item.id,
          ...payload,
        });
        if (active.current) setPhotos((current) => [...current, photo]);
      } finally {
        submitting.current = false;
        if (active.current) setBusy(false);
      }
    }
    async function submit(event) {
      event.preventDefault();
      if (submitting.current || !acknowledged) return;
      submitting.current = true;
      setBusy(true);
      setError("");
      try {
        await publicRequest("submit", { values });
        if (active.current) {
          setDone(true);
          setValues({});
          setPhotos([]);
          const url = new URL(window.location.href);
          url.hash = "";
          window.history.replaceState(null, "", url);
        }
      } catch (reason) {
        if (active.current)
          setError(reason.message || "Не удалось отправить документы.");
      } finally {
        submitting.current = false;
        if (active.current) setBusy(false);
      }
    }
    return h(
      "main",
      { className: "recruitment-workspace onboarding-public" },
      h(
        "section",
        { className: "onboarding-public-card" },
        h(
          "header",
          { className: "onboarding-public-heading" },
          h("span", { className: "recruitment-eyebrow" }, "ОФОРМЛЕНИЕ"),
          h(
            "h1",
            null,
            done
              ? "Документы отправлены"
              : preview?.template.name || "Форма оформления",
          ),
          preview &&
            !done &&
            h(
              "p",
              null,
              `${preview.template.destination} · ${employmentName(preview.template.employmentType)}`,
            ),
        ),
        loading && h("p", { role: "status" }, "Проверяем ссылку…"),
        error &&
          h("p", { className: "recruitment-error", role: "alert" }, error),
        !loading &&
          !preview &&
          !done &&
          button("Попробовать снова", () => setRetry((value) => value + 1)),
        done
          ? h(
              React.Fragment,
              null,
              h(
                "p",
                { role: "status" },
                "Рекрутер получит ваши данные и проверит документы. Повторная отправка по этой ссылке закрыта.",
              ),
              notice(
                "Фото удаляются автоматически через 72 часа после загрузки. Можно закрыть эту страницу.",
              ),
            )
          : preview &&
              h(
                "form",
                { onSubmit: submit },
                preview.template.description &&
                  h(
                    "p",
                    { className: "onboarding-notice" },
                    preview.template.description,
                  ),
                notice(
                  "Проверьте заполненные данные и чёткость документов перед отправкой. Фотографии автоматически удаляются через 72 часа после загрузки.",
                ),
                h(
                  "fieldset",
                  { disabled: busy, className: "onboarding-fieldset" },
                  h(
                    "section",
                    { className: "onboarding-section" },
                    h("h2", null, "Ваши данные"),
                    h(Fields, {
                      template: preview.template,
                      values,
                      onChange: setValues,
                      disabled: busy,
                    }),
                  ),
                  h(
                    "section",
                    { className: "onboarding-section" },
                    h("h2", null, "Документы"),
                    ...preview.template.documents.map((item) =>
                      h(
                        "section",
                        {
                          className: "onboarding-document",
                          key: item.id,
                          "aria-label": item.label,
                        },
                        h(
                          "h3",
                          null,
                          `${item.label}${item.required ? " *" : ""}`,
                        ),
                        h(UploadDocument, {
                          document: item,
                          upload,
                          disabled: busy,
                          uploaded: photos.filter(
                            (photo) => photo.documentId === item.id,
                          ),
                        }),
                      ),
                    ),
                  ),
                  h(
                    "section",
                    { className: "onboarding-section onboarding-privacy" },
                    h("h2", null, "Обработка данных"),
                    h("p", null, preview.template.privacyNotice),
                    check(
                      "Я ознакомился(ась) с информацией об обработке данных",
                      acknowledged,
                      setAcknowledged,
                      { required: true },
                    ),
                  ),
                  h(
                    "button",
                    {
                      type: "submit",
                      className: "button recruitment-primary",
                      disabled: busy || !acknowledged,
                    },
                    busy ? "Отправляем…" : "Отправить документы",
                  ),
                ),
                h(
                  "p",
                  { className: "recruitment-meta" },
                  `Ссылка действует до ${dateLabel(preview.expiresAt)}. Звёздочкой отмечены обязательные поля и документы.`,
                ),
              ),
        onCancel &&
          button("Перейти ко входу в приложение", onCancel, {
            className: "recruitment-text-button",
            disabled: busy,
          }),
      ),
    );
  }
  return { OnboardingPanel, PublicOnboardingPanel };
}
