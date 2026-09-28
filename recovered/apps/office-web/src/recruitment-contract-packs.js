// Personal values, lookups and unfinished packs stay in the current office session.
const BASE = "/recruitment/contracts";
const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
const displayDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value || "")
  ? value.split("-").reverse().join(".") : String(value || "");
const scopeIdOf = (scope) => scope.responsibilityScopeId || scope.id;
const snapshotText = (doc) => doc.renderedText || "";

// Use text nodes, including in exported documents: template text is never HTML.
export function contractPackPage(pack) {
  const page = document.implementation.createHTMLDocument(`Комплект ${pack.number || "документов"}`);
  page.documentElement.lang = "ru";
  const charset = page.createElement("meta");
  charset.setAttribute("charset", "utf-8");
  page.head.prepend(charset);
  const style = page.createElement("style");
  style.textContent = 'body{max-width:174mm;margin:15mm auto;padding:0 12mm;font:11pt/1.4 "Times New Roman",serif;color:#111;background:#fff}article+article{break-before:page;page-break-before:always}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;orphans:3;widows:4}article{padding-bottom:10mm}@page{size:A4;margin:18mm}@media print{body{padding:0;margin:0;max-width:none}}';
  page.head.append(style);
  for (const doc of pack.documents || []) {
    const article = page.createElement("article"), text = page.createElement("pre");
    article.setAttribute("aria-label", doc.templateName || doc.templateSnapshot?.name || "Документ");
    text.textContent = snapshotText(doc);
    article.append(text);
    page.body.append(article);
  }
  return page;
}
function downloadPack(pack) {
  const page = contractPackPage(pack), url = URL.createObjectURL(new Blob([
    "<!doctype html>\n", page.documentElement.outerHTML,
  ], { type: "text/html;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `Комплект-${String(pack.number || pack.id).replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")}.html`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function createRecruitmentContractPacks(React, { request }) {
  const { createElement: h, useEffect, useRef, useState } = React;
  const button = (label, onClick, props = {}) => h("button", {
    type: "button", className: "button", onClick, ...props,
  }, label);
  const field = (label, control, hint) => h("label", { className: "recruitment-field" },
    h("span", null, label), React.cloneElement(control, { "aria-label": control.props["aria-label"] || label }),
    hint && h("small", null, hint));
  const select = (value, options, change, props = {}) => h("select", {
    value, onChange: (event) => change(event.target.value), ...props,
  }, ...options.map(([id, label]) => h("option", { key: id, value: id }, label)));

  function FieldGroup({ name, collapsible, initialOpen, children }) {
    const [open, setOpen] = useState(initialOpen);
    return collapsible
      ? h("details", { className: "contract-pack-field-group contract-pack-options", open, onToggle: (event) => setOpen(event.currentTarget.open) },
        h("summary", null, name), children)
      : h("section", { className: "contract-pack-field-group", "aria-label": name }, h("h4", null, name), children);
  }

  function PackResult({ pack, onNew, onDocuments, onError }) {
    function print() {
      const popup = window.open("", "_blank");
      if (!popup) return onError("Разрешите открыть окно печати и повторите попытку.");
      popup.opener = null;
      const page = contractPackPage(pack);
      popup.document.replaceChild(popup.document.importNode(page.documentElement, true), popup.document.documentElement);
      popup.focus();
      setTimeout(() => { if (!popup.closed) popup.print(); }, 200);
    }
    return h("section", { className: "onboarding-card contract-pack-result", "aria-label": "Готовый комплект" },
      h("div", { className: "onboarding-section-heading" },
        h("div", null, h("h3", null, `Комплект № ${pack.number || "—"} готов`),
          h("p", { className: "recruitment-meta" }, `${displayDate(pack.date)} · Документов: ${pack.documents?.length || 0}. Подписанные экземпляры можно добавить в разделе «Договоры».`)),
        onNew && button("Новый комплект", onNew)),
      h("div", { className: "recruitment-actions" },
        button("Печать / PDF комплекта", print, { className: "button recruitment-primary", disabled: !pack.documents?.length }),
        button("Скачать комплект HTML", () => downloadPack(pack), { disabled: !pack.documents?.length }),
        onDocuments && button("Открыть документы", onDocuments)),
      pack.deletedDocumentCount > 0 && h("p", { className: "onboarding-notice" },
        `Документов в корзине: ${pack.deletedDocumentCount}. Они не входят в скачивание и печать. Верните их через раздел «Договоры», чтобы получить полный комплект.`),
      h("p", { className: "recruitment-meta" }, "В окне печати выберите «Сохранить как PDF». Каждый документ начинается с новой страницы."),
      ...(pack.documents || []).map((doc) => h("details", { key: doc.id, className: "contract-pack-preview" },
        h("summary", null, doc.templateName || doc.templateSnapshot?.name || "Документ"),
        h("pre", { className: "contracts-preview", "aria-label": `Документ комплекта: ${doc.templateName || doc.templateSnapshot?.name || doc.id}` }, snapshotText(doc)))));
  }

  function ContractPacksPanel({ token, kind = "employee", scopes = [], defaultScopeId = "", candidates = [], sessions = [],
    initialCandidateId = "", initialSessionId = "", initialDraft, onDraftChange, onExpired, onDirtyChange, onBusyChange,
    onQuestionnaires, onDocuments }) {
    const [scopeId, setScopeId] = useState(initialDraft?.scopeId || defaultScopeId || scopeIdOf(scopes[0] || {} ) || "");
    const [candidateId, setCandidateId] = useState(initialDraft?.candidateId ?? initialCandidateId);
    const [sessionId, setSessionId] = useState(initialDraft?.sessionId ?? initialSessionId);
    const [selectedIds, setSelectedIds] = useState(initialDraft?.selectedIds ?? null);
    const [values, setValues] = useState(initialDraft?.values || {});
    const [touched, setTouched] = useState(initialDraft?.touched || {});
    const [number, setNumber] = useState(initialDraft?.number || "");
    const [date, setDate] = useState(initialDraft?.date || today());
    const [pack, setPack] = useState(initialDraft?.pack || null);
    const [catalog, setCatalog] = useState(null), [loading, setLoading] = useState(false), [busy, setBusy] = useState(false);
    const [error, setError] = useState(""), [feedback, setFeedback] = useState(""), [refresh, setRefresh] = useState(0);
    const [candidateQuery, setCandidateQuery] = useState(""), [candidateResults, setCandidateResults] = useState([]);
    const [partyQuery, setPartyQuery] = useState(initialDraft?.partyQuery || ""), [bankQuery, setBankQuery] = useState(initialDraft?.bankQuery || "");
    const [partySuggestions, setPartySuggestions] = useState([]), [bankSuggestions, setBankSuggestions] = useState([]);
    const [lookupBusy, setLookupBusy] = useState(""), [lookupMessage, setLookupMessage] = useState("");
    const [attempted, setAttempted] = useState(false);
    const active = useRef(true), flight = useRef(false), lookup = useRef(null), attempt = useRef(initialDraft?.attempt || null);
    const inputs = useRef({ values, touched });
    inputs.current = { values, touched };
    const callbacks = useRef({ onDraftChange, onExpired, onDirtyChange, onBusyChange });
    callbacks.current = { onDraftChange, onExpired, onDirtyChange, onBusyChange };
    const dirty = !pack && (Object.keys(touched).length > 0 || Boolean(number));
    const allCandidates = [...new Map([
      ...sessions.filter((item) => item.candidateId).map((item) => ({ id: item.candidateId, fullName: item.candidateName,
        responsibilityScopeId: item.responsibilityScopeId, legalEntityId: item.legalEntityId })),
      ...candidates, ...candidateResults,
    ].map((item) => [item.id, item])).values()];
    const selectedSession = sessions.find((item) => item.id === sessionId);
    const selectedCandidate = allCandidates.find((item) => item.id === candidateId);
    const sourceScopeId = selectedSession?.responsibilityScopeId || selectedSession?.templateSnapshot?.responsibilityScopeId || selectedCandidate?.responsibilityScopeId;
    const effectiveScopeId = kind === "employee" && sourceScopeId ? sourceScopeId : scopeId;
    const selectedKey = selectedIds === null ? "default" : selectedIds.join(",");

    useEffect(() => {
      active.current = true;
      return () => {
        active.current = false;
        lookup.current?.abort();
        callbacks.current.onDirtyChange?.(false);
        callbacks.current.onBusyChange?.(false);
      };
    }, []);
    useEffect(() => { callbacks.current.onDirtyChange?.(dirty); }, [dirty]);
    useEffect(() => {
      callbacks.current.onDraftChange?.({ scopeId, candidateId, sessionId, selectedIds, values, touched, number, date, pack, partyQuery, bankQuery, attempt: attempt.current });
    }, [scopeId, candidateId, sessionId, selectedKey, values, touched, number, date, pack, partyQuery, bankQuery, busy]);

    function fail(reason) {
      if (!active.current || reason?.name === "AbortError") return;
      if (reason?.status === 401) callbacks.current.onExpired?.();
      setError(reason?.status === 409
        ? "Шаблоны или комплект изменились. Обновите состав и проверьте поля. Введённые данные сохранены."
        : reason?.message || "Не удалось выполнить действие. Введённые данные сохранены; повторите попытку.");
    }
    useEffect(() => {
      if (!effectiveScopeId || pack) return;
      const abort = new AbortController();
      setLoading(true);
      setError("");
      const params = new URLSearchParams({ responsibilityScopeId: effectiveScopeId, kind });
      if (kind === "employee" && candidateId) params.set("candidateId", candidateId);
      if (kind === "employee" && sessionId) params.set("onboardingSessionId", sessionId);
      if (selectedIds !== null) params.set("templateIds", selectedIds.join(","));
      request(`${BASE}/packs/catalog?${params}`, { signal: abort.signal }, token).then((result) => {
        if (abort.signal.aborted || !active.current) return;
        setCatalog(result);
        if (selectedIds === null) setSelectedIds(result.selectedTemplateIds || result.templates.filter((item) => item.defaultSelected).map((item) => item.id));
        setValues((previous) => ({ ...result.values,
          ...Object.fromEntries(Object.keys(inputs.current.touched).map((key) => [key, previous[key] ?? ""])),
        }));
      }).catch((reason) => { if (!abort.signal.aborted) fail(reason); }).finally(() => {
        if (!abort.signal.aborted && active.current) setLoading(false);
      });
      return () => abort.abort();
    }, [token, kind, effectiveScopeId, candidateId, sessionId, selectedKey, refresh, Boolean(pack)]);

    useEffect(() => {
      if (kind !== "employee" || candidateQuery.trim().length < 2) { setCandidateResults([]); return; }
      const abort = new AbortController(), timer = setTimeout(() => request(
        `/recruitment/worklist?${new URLSearchParams({ search: candidateQuery.trim(), page: "1", pageSize: "25" })}`,
        { signal: abort.signal }, token,
      ).then((result) => {
        if (!abort.signal.aborted) setCandidateResults((result.items || []).map((item) => item.candidate));
      }).catch((reason) => { if (!abort.signal.aborted) fail(reason); }), 250);
      return () => { clearTimeout(timer); abort.abort(); };
    }, [candidateQuery, token, kind]);

    function resetSource(nextCandidate, nextSession, nextScope = scopeId) {
      if (dirty && !window.confirm("Изменить участника комплекта? Заполненные поля текущего участника будут очищены.")) return;
      lookup.current?.abort();
      setLookupBusy(""); setPartySuggestions([]); setBankSuggestions([]); setLookupMessage("");
      setScopeId(nextScope); setCandidateId(nextCandidate); setSessionId(nextSession); setCatalog(null);
      setValues({}); setTouched({}); setSelectedIds(null); setAttempted(false); setError("");
      attempt.current = null;
    }
    function updateValue(id, value) {
      setValues((current) => ({ ...current, [id]: value }));
      setTouched((current) => ({ ...current, [id]: true }));

    }
    async function findParty(type) {
      const query = (type === "party" ? partyQuery : bankQuery).trim();
      if (!effectiveScopeId || !query) return;
      lookup.current?.abort();
      const abort = new AbortController(); lookup.current = abort;
      setLookupBusy(type); setLookupMessage("");
      type === "party" ? setPartySuggestions([]) : setBankSuggestions([]);
      try {
        const response = await request(`${BASE}/${type === "party" ? "party-lookup" : "bank-lookup"}`, {
          method: "POST", signal: abort.signal,
          body: JSON.stringify({ responsibilityScopeId: effectiveScopeId, query }),
        }, token);
        if (abort.signal.aborted || !active.current) return;
        const suggestions = response.suggestions || [];
        type === "party" ? setPartySuggestions(suggestions) : setBankSuggestions(suggestions);
        if (!suggestions.length) setLookupMessage(response.configured === false
          ? "Автозаполнение пока не подключено. Реквизиты можно заполнить вручную ниже."
          : "Реквизиты не найдены. Проверьте запрос или заполните поля вручную.");
      } catch (reason) {
        if (!abort.signal.aborted && active.current) {
          if (reason?.status === 401) callbacks.current.onExpired?.();
          setLookupMessage(`${reason?.message || "Автозаполнение сейчас недоступно."} Введите реквизиты вручную или повторите запрос.`);
        }
      } finally {
        if (!abort.signal.aborted && active.current) setLookupBusy("");
      }
    }
    function changeLookup(type, query) {
      lookup.current?.abort(); setLookupBusy(""); setLookupMessage("");
      if (type === "party") { setPartyQuery(query); setPartySuggestions([]); }
      else { setBankQuery(query); setBankSuggestions([]); }
    }
    function applySuggestion(suggestion, type) {
      const allowed = new Set((catalog?.fields || []).map((item) => item.id));
      const patch = Object.fromEntries(Object.entries(suggestion.values || {}).filter(([key, value]) => allowed.has(key) && typeof value === "string"));
      const changing = Object.keys(patch).some((id) => touched[id] && values[id] && values[id] !== patch[id]);
      if (changing && !window.confirm("Заменить заполненные реквизиты выбранными данными? Остальные поля сохранятся.")) return;
      setValues((current) => ({ ...current, ...patch }));
      setTouched((current) => ({ ...current, ...Object.fromEntries(Object.keys(patch).map((id) => [id, true])) }));

      type === "party" ? setPartySuggestions([]) : setBankSuggestions([]);
      setLookupMessage(type === "party" ? "Реквизиты подставлены. Проверьте адрес, подписанта и основание полномочий." : "Банк подставлен. Расчётный счёт укажите по реквизитам перевозчика.");
    }
    async function perform(action) {
      if (flight.current) return;
      flight.current = true; setBusy(true); callbacks.current.onBusyChange?.(true); setError("");
      try { await action(); } catch (reason) { fail(reason); }
      finally { flight.current = false; if (active.current) { setBusy(false); callbacks.current.onBusyChange?.(false); } }
    }
    const templates = catalog?.templates || [];
    const selectedTemplates = templates.filter((item) => selectedIds?.includes(item.id));
    const fields = (catalog?.fields || []).filter((item) => !["contract_number", "contract_date"].includes(item.id));
    const missing = fields.filter((item) => item.required && !String(values[item.id] ?? "").trim());
    const unresolved = (catalog?.conflicts || []).filter((item) => item.type === "type" || !touched[item.fieldId]);
    const typeConflict = unresolved.some((item) => item.type === "type");
    const hasSource = kind === "carrier" || Boolean(candidateId || sessionId);

    function issue(event) {
      event.preventDefault(); setAttempted(true);
      if (busy || loading || !catalog || !hasSource || !effectiveScopeId || !selectedTemplates.length || missing.length || unresolved.length || !date) return;
      const payload = {
        responsibilityScopeId: effectiveScopeId, kind, templateIds: selectedTemplates.map((item) => item.id),
        templateVersions: Object.fromEntries(selectedTemplates.map((item) => [item.id, item.version])),
        ...(kind === "employee" && candidateId ? { candidateId } : {}),
        ...(kind === "employee" && sessionId ? { onboardingSessionId: sessionId } : {}),
        values: Object.fromEntries(fields.map((item) => [item.id, String(values[item.id] ?? "")])), number: number.trim(), date,
      };
      const fingerprint = JSON.stringify(payload);
      if (attempt.current?.fingerprint !== fingerprint) attempt.current = { fingerprint, id: crypto.randomUUID() };
      perform(async () => {
        const result = await request(`${BASE}/packs`, { method: "POST", body: JSON.stringify({ ...payload, idempotencyKey: attempt.current.id }) }, token);
        if (!active.current) return;
        setPack(result);
      });
    }
    function documentChoice(item) {
      const base = item.category === "base";
      return h("label", { key: item.id, className: "onboarding-check contract-pack-choice" },
        h("input", { type: "checkbox", checked: Boolean(selectedIds?.includes(item.id)), disabled: busy,
          onChange: (event) => {
            setSelectedIds((current) => event.target.checked ? [...(current || []), item.id] : current.filter((id) => id !== item.id));

          }, "aria-label": `Включить: ${item.name}` }),
        h("span", null, item.name, base && h("small", null, "Основной документ")));
    }
    function suggestions(items, type) {
      return items.length > 0 && h("div", { className: "contract-pack-suggestions", "aria-label": type === "party" ? "Найденные организации" : "Найденные банки" },
        ...items.map((item, index) => h("div", { key: item.id || index, className: "contract-pack-suggestion" },
          h("div", null, h("strong", null, item.label),
            item.values?.carrier_address && h("p", { className: "recruitment-meta" }, item.values.carrier_address),
            item.status && item.status !== "ACTIVE" && h("p", { className: "recruitment-meta" }, `Статус: ${item.status}`)),
          button("Подставить реквизиты", () => applySuggestion(item, type), { disabled: busy, "aria-label": `Подставить реквизиты: ${item.label}` }))));
    }
    const groupName = (id) => /^(company_|signer_|city$)/.test(id) ? "Наша организация"
      : /^carrier_/.test(id) ? "Реквизиты перевозчика"
      : /^(vehicle_|trailer_|car_)/.test(id) ? "Транспортное средство"
      : /^(full_name|birth_|passport_|registration_|snils|phone|inn$|driver_)/.test(id) ? "Данные водителя"
      : "Условия оформления";
    const groups = [...new Set(fields.map((item) => groupName(item.id)))];
    const companyFields = fields.filter((item) => groupName(item.id) === "Наша организация");
    function inputField(item) {
      const conflict = unresolved.find((entry) => entry.fieldId === item.id);
      const requiredMissing = item.required && !String(values[item.id] ?? "").trim();
      const props = { id: `pack-${kind}-${item.id}`, value: values[item.id] ?? "", disabled: busy,
        maxLength: item.type === "textarea" ? 12000 : 4000, autoComplete: "off",
        "aria-required": Boolean(item.required), "aria-invalid": Boolean(attempted && requiredMissing),
        onChange: (event) => updateValue(item.id, event.target.value) };
      return h("div", { key: item.id, className: item.type === "textarea" ? "contract-pack-wide" : undefined },
        field(`${item.label}${item.required ? " *" : ""}`, h(item.type === "textarea" ? "textarea" : "input", {
          ...props, ...(item.type === "textarea" ? { rows: 3 } : { type: ["date", "tel"].includes(item.type) ? item.type : "text" }),
        }), item.hint || item.description),
        conflict && h("div", { className: "contract-pack-field-note" },
          h("p", null, conflict.type === "type" ? "В шаблонах различаются типы этого поля. Исправьте шаблоны или измените состав."
            : "В выбранных документах разные исходные значения. Укажите общее значение или подтвердите текущее."),
          conflict.type !== "type" && button("Подтвердить значение", () => updateValue(item.id, values[item.id] ?? ""), {
            disabled: busy, "aria-label": `Подтвердить значение: ${item.label}` })));
    }

    return h("div", { className: "contracts-workspace contract-pack-workspace", "aria-label": kind === "employee" ? "Комплект водителя ТК" : "Комплект перевозчика" },
      error && h("div", { className: "recruitment-error", role: "alert" }, error,
        !pack && button("Обновить состав", () => setRefresh((value) => value + 1), { disabled: busy || loading })),
      feedback && h("p", { className: "recruitment-feedback", role: "status" }, feedback),
      pack ? h(PackResult, { pack, onDocuments, onError: setError,
        onNew: () => {
          setPack(null); setNumber(""); setDate(today()); setValues({}); setTouched({}); setSelectedIds(null);
          setAttempted(false); setError(""); attempt.current = null;
        } }) : h("form", { className: "contract-pack-form", onSubmit: issue, noValidate: true },
        h("section", { className: "onboarding-card" },
          h("div", { className: "onboarding-section-heading" }, h("div", null,
            h("h3", null, kind === "employee" ? "Комплект для водителя" : "Комплект для перевозчика"),
            h("p", { className: "recruitment-meta" }, kind === "employee" ? "Данные из анкеты, один набор полей и все документы сразу."
              : "Подставьте реквизиты, выберите проекты и проверьте общие поля.")),
            kind === "employee" && onQuestionnaires && button("Заполнить по фото", () => onQuestionnaires({ candidateId, sessionId, responsibilityScopeId: effectiveScopeId }), { disabled: busy })),
          h("div", { className: "onboarding-fields" },
            field("Организация оформления", select(effectiveScopeId, [["", "Выберите организацию"], ...scopes.map((item) => [scopeIdOf(item),
              item.label || item.legalEntityName || item.companyName || item.projectName || "Организация"])],
            (value) => resetSource("", "", value), { disabled: busy || (kind === "employee" && Boolean(sourceScopeId)) })),
            kind === "employee" && field("Найти кандидата для комплекта", h("input", { type: "search", value: candidateQuery,
              disabled: busy, autoComplete: "off", placeholder: "Имя или телефон", onChange: (event) => setCandidateQuery(event.target.value) })),
            kind === "employee" && field("Кандидат для комплекта", select(candidateId, [["", "Выберите кандидата или анкету"],
              ...allCandidates.map((item) => [item.id, item.fullName || "Кандидат"])],
            (value) => resetSource(value, ""), { disabled: busy })),
            kind === "employee" && field("Анкета для комплекта", select(sessionId, [["", "Без анкеты · заполнить вручную"],
              ...sessions.filter((item) => !candidateId || item.candidateId === candidateId).map((item) => [item.id,
                `${item.candidateName || "Без кандидата"} · ${item.templateSnapshot?.name || "Анкета"}${item.status === "verified" ? " · проверено" : ""}`])],
            (value) => { const source = sessions.find((item) => item.id === value); resetSource(source?.candidateId || candidateId, value); }, { disabled: busy }))),
          kind === "employee" && selectedSession && selectedSession.status !== "verified" && h("p", { className: "recruitment-meta" },
            "Анкета ещё не отмечена проверенной. Сверьте распознанные данные с документами перед оформлением.")),
        loading && h("p", { role: "status" }, "Подбираем документы и общие поля…"),
        !effectiveScopeId && h("p", { className: "onboarding-notice" }, "Выберите организацию для загрузки комплекта."),
        catalog && !templates.length && h("section", { className: "onboarding-card" },
          h("h4", null, "Шаблоны комплекта ещё не добавлены"),
          h("p", { className: "recruitment-meta" }, catalog.canInstall
            ? "Добавьте подготовленные шаблоны. Их тексты и версии останутся доступны в конструкторе договоров."
            : "Руководитель может добавить шаблоны для этой организации."),
          catalog.canInstall && button("Добавить шаблоны комплекта", () => perform(async () => {
            await request(`${BASE}/packs/install`, { method: "POST", body: JSON.stringify({ responsibilityScopeId: effectiveScopeId, kind }) }, token);
            if (active.current) { setSelectedIds(null); setRefresh((value) => value + 1); }
          }), { disabled: busy, className: "button recruitment-primary" })),
        catalog && templates.length > 0 && h(React.Fragment, null,
          h("section", { className: "onboarding-card" },
            h("div", { className: "onboarding-section-heading" }, h("h4", null, "Документы комплекта"),
              h("span", { className: "recruitment-meta" }, `Выбрано: ${selectedTemplates.length}`),
              catalog.canInstall && catalog.installedCount < catalog.availableCount && button("Добавить шаблоны комплекта", () => perform(async () => {
                await request(`${BASE}/packs/install`, { method: "POST", body: JSON.stringify({ responsibilityScopeId: effectiveScopeId, kind }) }, token);
                if (active.current) { setSelectedIds(null); setRefresh((value) => value + 1); }
              }), { disabled: busy || loading })),
            h("div", { className: "contract-pack-choices" }, ...templates.filter((item) => item.category === "base").map(documentChoice)),
            templates.some((item) => item.category === "project") && h("div", { className: "contract-pack-projects" },
              h("h4", null, "Дополнительные соглашения по проектам"),
              h("div", { className: "contract-pack-choices" }, ...templates.filter((item) => item.category === "project").map(documentChoice))),
            templates.some((item) => !["base", "project"].includes(item.category)) && h("details", { className: "contract-pack-options" },
              h("summary", null, "Дополнительные документы"),
              h("div", { className: "contract-pack-choices" }, ...templates.filter((item) => !["base", "project"].includes(item.category)).map(documentChoice)))),
          kind === "carrier" && h("section", { className: "onboarding-card" },
            h("h4", null, "Автозаполнение реквизитов"),
            h("div", { className: "contract-pack-lookup" }, field("ИНН или ОГРН перевозчика", h("input", {
              value: partyQuery, inputMode: "numeric", autoComplete: "off", maxLength: 15, disabled: busy,
              onChange: (event) => changeLookup("party", event.target.value),
            })), button(lookupBusy === "party" ? "Ищем…" : "Заполнить по ИНН", () => findParty("party"), {
              disabled: busy || Boolean(lookupBusy) || !partyQuery.trim(), className: "button recruitment-primary" })),
            suggestions(partySuggestions, "party"),
            h("div", { className: "contract-pack-lookup" }, field("БИК банка перевозчика", h("input", {
              value: bankQuery, inputMode: "numeric", autoComplete: "off", maxLength: 9, disabled: busy,
              onChange: (event) => changeLookup("bank", event.target.value),
            })), button(lookupBusy === "bank" ? "Ищем…" : "Заполнить банк", () => findParty("bank"), {
              disabled: busy || Boolean(lookupBusy) || !bankQuery.trim() })),
            suggestions(bankSuggestions, "bank"),
            lookupMessage && h("p", { className: "onboarding-notice", role: "status" }, lookupMessage)),
          hasSource && h("section", { className: "onboarding-card" },
            h("h4", null, "Общие данные комплекта"),
            h("p", { className: "recruitment-meta" }, "Каждое поле заполняется один раз для выбранных документов. * — обязательное поле."),
            h("div", { className: "onboarding-fields" },
              field("Номер комплекта", h("input", { value: number, maxLength: 160, disabled: busy,
                placeholder: "Будет присвоен автоматически", onChange: (event) => { setNumber(event.target.value); } })),
              field("Дата комплекта *", h("input", { type: "date", value: date, disabled: busy,
                "aria-required": true, "aria-invalid": attempted && !date, onChange: (event) => { setDate(event.target.value); } }))),
            ...groups.map((group) => h(FieldGroup, { key: `${effectiveScopeId}-${group}`, name: group,
              collapsible: group === "Наша организация",
              initialOpen: group !== "Наша организация" || companyFields.some((item) => item.required && !String(values[item.id] || "").trim()),
            }, h("div", { className: "onboarding-fields" }, ...fields.filter((item) => groupName(item.id) === group).map(inputField)),
            group === "Наша организация" && catalog.canManageSettings && button("Сохранить реквизиты организации", () => perform(async () => {
              await request(`${BASE}/packs/settings`, { method: "PUT", body: JSON.stringify({
                responsibilityScopeId: effectiveScopeId, version: catalog.settings?.version || 0,
                values: Object.fromEntries(companyFields.map((item) => [item.id, String(values[item.id] ?? "")])),
              }) }, token);
              if (active.current) { setFeedback("Реквизиты организации сохранены для следующих комплектов."); setRefresh((value) => value + 1); }
            }), { disabled: busy || loading })))),
          h("section", { className: "onboarding-card" },
            hasSource && missing.length > 0 && h("div", { className: "contract-pack-missing", role: attempted ? "alert" : undefined },
              h("p", null, `Осталось заполнить: ${missing.length}`),
              h("div", { className: "recruitment-actions" }, ...missing.map((item) => button(item.label, () => {
                const target = document.getElementById(`pack-${kind}-${item.id}`);
                const details = target?.closest("details");
                if (details) details.open = true;
                target?.focus();
              }, { key: item.id, className: "button contract-pack-missing-link" })))),
            unresolved.length > 0 && h("p", { className: "recruitment-error", role: "alert" }, typeConflict
              ? "У выбранных шаблонов несовместимые поля. Исправьте шаблоны или измените состав."
              : "Подтвердите поля, для которых в документах указаны разные исходные значения."),
            !hasSource && h("p", { className: "recruitment-meta" }, "Выберите кандидата или анкету для оформления водителя."),
            h("details", { className: "contract-pack-options" }, h("summary", null, "Предпросмотр документов"),
              ...selectedTemplates.map((item) => h("details", { key: item.id, className: "contract-pack-preview" },
                h("summary", null, item.name),
                item.notes && h("p", { className: "onboarding-notice" }, Array.isArray(item.notes) ? item.notes.join("\n") : String(item.notes)),
                item.source && h("p", { className: "recruitment-meta" }, `Источник: ${typeof item.source === "string" ? item.source : [item.source.workbook || item.source.file, item.source.sheet].filter(Boolean).join(" · ")}`),
                h("pre", { className: "contracts-preview" }, String(item.text || "").replace(
                  /\{\{\s*([a-zA-Z][a-zA-Z0-9_-]{0,79})\s*\}\}/g,
                  (_, id) => id === "contract_number" ? number || "⟦Номер будет присвоен при оформлении⟧" : id === "contract_date" ? displayDate(date) :
                    String(fields.find((entry) => entry.id === id)?.type === "date" ? displayDate(values[id]) : values[id] || `⟦${fields.find((entry) => entry.id === id)?.label || id}⟧`)))))),
            h("p", { className: "recruitment-meta" }, "После оформления документы будут сохранены в выпущенном виде. Проверьте данные и предпросмотр перед выпуском."),
            attempted && !date && h("p", { className: "recruitment-error", role: "alert" }, "Укажите дату комплекта."),
            h("div", { className: "recruitment-actions" }, h("button", { type: "submit", className: "button recruitment-primary",
              disabled: busy || loading || !hasSource || !selectedTemplates.length || typeConflict }, busy ? "Оформляем…" : "Оформить комплект"))))));
  }
  return { ContractPacksPanel, PackResult };
}
