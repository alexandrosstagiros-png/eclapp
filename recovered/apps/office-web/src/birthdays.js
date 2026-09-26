const roleNames = {
  access_admin: "Администратор доступа",
  manager: "Руководитель",
  dispatcher: "Диспетчер",
  driver: "Водитель",
  mechanic: "Механик",
  document_specialist: "Специалист по документам",
  recruiter: "Рекрутер",
  external_recruiter: "Внешний рекрутер",
  tender_specialist: "Тендерный специалист",
  auditor: "Аудитор",
};
const dateLabel = (value, year = false) => {
  if (!value) return "";
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("ru-RU", {
    timeZone: "UTC", day: "numeric", month: "long", ...(year ? { year: "numeric" } : {}),
  });
};
const daysLabel = (days) => {
  if (days === 0) return "Сегодня";
  if (days === 1) return "Завтра";
  const ending = days % 100 >= 11 && days % 100 <= 14 ? "дней"
    : days % 10 === 1 ? "день" : days % 10 >= 2 && days % 10 <= 4 ? "дня" : "дней";
  return `Через ${days} ${ending}`;
};

export function createBirthdaysUI(React, { request }) {
  const { createElement: h, useState, useEffect, useRef, useCallback } = React;
  function useBirthdayReminders({ token, actor, onExpired }) {
    const allowed = actor.role === "access_admin" && !actor.impersonation;
    const [data, setData] = useState(null), [loading, setLoading] = useState(allowed);
    const [error, setError] = useState(""), [busyId, setBusyId] = useState("");
    const [notice, setNotice] = useState("");
    const generation = useRef(0), revision = useRef(0), pending = useRef(null);
    const controllers = useRef(new Set()), busy = useRef(false), expired = useRef(onExpired);
    expired.current = onExpired;
    const fail = useCallback((reason) => {
      if (reason?.name === "AbortError") return;
      if ([401, 403, 404].includes(reason?.status)) setData(null);
      if (reason?.status === 401) expired.current?.();
      setError(reason?.message || "Не удалось обновить поздравления. Повторите попытку.");
    }, []);
    const refresh = useCallback(() => {
      if (!allowed || busy.current) return Promise.resolve();
      if (pending.current) return pending.current;
      const stamp = generation.current, requestRevision = ++revision.current;
      const controller = new AbortController();
      controllers.current.add(controller);
      setLoading(true);
      const work = request("/team/birthdays", { signal: controller.signal }, token)
        .then((value) => {
          if (stamp === generation.current && requestRevision === revision.current) {
            setData(value);
            setError("");
          }
        })
        .catch((reason) => {
          if (stamp === generation.current && requestRevision === revision.current) fail(reason);
        })
        .finally(() => {
          controllers.current.delete(controller);
          if (pending.current === work) pending.current = null;
          if (stamp === generation.current && requestRevision === revision.current) setLoading(false);
        });
      pending.current = work;
      return work;
    }, [token, actor.id, allowed, fail]);
    useEffect(() => {
      generation.current++;
      revision.current++;
      pending.current = null;
      busy.current = false;
      setData(null); setError(""); setNotice(""); setBusyId(""); setLoading(allowed);
      if (!allowed) return;
      refresh();
      const update = () => { if (!document.hidden) refresh(); };
      const timer = setInterval(update, 60000);
      window.addEventListener("focus", update);
      window.addEventListener("profile-updated", update);
      document.addEventListener("visibilitychange", update);
      return () => {
        generation.current++;
        for (const controller of controllers.current) controller.abort();
        clearInterval(timer);
        window.removeEventListener("focus", update);
        window.removeEventListener("profile-updated", update);
        document.removeEventListener("visibilitychange", update);
      };
    }, [refresh, allowed]);
    async function mutate(employee, path, body, message) {
      if (!allowed || busy.current || !data) return false;
      const stamp = generation.current;
      busy.current = true;
      revision.current++;
      // An older poll must not replace the result of this acknowledgement.
      for (const controller of controllers.current) controller.abort();
      pending.current = null;
      const controller = new AbortController();
      controllers.current.add(controller);
      setBusyId(employee.userId); setError(""); setNotice(""); setLoading(false);
      try {
        await request(`/team/birthdays/${encodeURIComponent(employee.userId)}/${path}`, {
          method: "PUT", signal: controller.signal,
          body: JSON.stringify(body),
        }, token);
        if (stamp !== generation.current) return false;
        setNotice(message);
      } catch (reason) {
        if (stamp === generation.current) fail(reason);
        return false;
      } finally {
        controllers.current.delete(controller);
        if (stamp === generation.current) { busy.current = false; setBusyId(""); }
      }
      if (stamp === generation.current) await refresh();
      return stamp === generation.current;
    }
    function congratulate(employee) {
      if (employee.daysUntil !== 0 || !data) return;
      return mutate(employee, "congratulation", {
        occurrenceDate: data.today, congratulated: !employee.congratulated,
      }, employee.congratulated ? `Отметка снята: ${employee.displayName}.`
        : `Поздравление отмечено: ${employee.displayName}.`);
    }
    function saveBirthDate(employee, birthDate) {
      return mutate(employee, "date", { birthDate: birthDate || null, version: employee.profileVersion },
        `Дата рождения сохранена: ${employee.displayName}.`);
    }
    return {
      data: allowed ? data : null, loading, error, busyId, notice, refresh, congratulate, saveBirthDate,
      pendingToday: allowed ? (data?.employees || []).filter(item => item.daysUntil === 0 && !item.congratulated).length : 0,
    };
  }
  function BirthdayReminder({ count, onOpen }) {
    if (!count) return null;
    return h("aside", { className: "birthdays-reminder", "aria-label": "Напоминание о днях рождения" },
      h("div", null,
        h("strong", null, "Не забудьте поздравить сотрудников"),
        h("p", null, `Сегодня ждут поздравления: ${count}.`)),
      h("button", { type: "button", className: "button", onClick: onOpen }, "Открыть поздравления"));
  }
  function BirthdaysWorkspace({ reminders, onDirtyChange }) {
    const [horizon, setHorizon] = useState(30);
    const [editing, setEditing] = useState(null), [draftDate, setDraftDate] = useState("");
    const { data, loading, error, busyId, notice, refresh, congratulate, saveBirthDate } = reminders;
    const dirtyCallback = useRef(onDirtyChange);
    dirtyCallback.current = onDirtyChange;
    useEffect(() => {
      const dirty = Boolean(busyId || (editing && draftDate !== (editing.birthDate || "")));
      dirtyCallback.current?.(dirty);
      const stop = (event) => { if (dirty) { event.preventDefault(); event.returnValue = ""; } };
      window.addEventListener("beforeunload", stop);
      return () => window.removeEventListener("beforeunload", stop);
    }, [editing, draftDate, busyId]);
    useEffect(() => () => dirtyCallback.current?.(false), []);
    const employees = data?.employees || [];
    const today = employees.filter(item => item.daysUntil === 0);
    const upcoming = horizon === "missing" ? data?.employeesWithoutBirthday || []
      : employees.filter(item => item.daysUntil > 0 && (horizon === 0 || item.daysUntil <= horizon));
    function editDate(employee) {
      if (busyId) return;
      if (editing?.userId === employee.userId) return;
      if (editing && editing.userId !== employee.userId && draftDate !== (editing.birthDate || "")
        && !window.confirm("Отменить несохранённую дату рождения?")) return;
      setEditing(employee); setDraftDate(employee.birthDate || "");
    }
    function selectHorizon(value) {
      if (busyId || (editing && draftDate !== (editing.birthDate || "") && !window.confirm("Отменить несохранённую дату рождения?"))) return;
      setEditing(null); setHorizon(value);
    }
    function reload() {
      if (busyId || (editing && draftDate !== (editing.birthDate || "") && !window.confirm("Отменить несохранённую дату рождения и обновить список?"))) return;
      setEditing(null);
      return refresh();
    }
    function row(employee) {
      return h("li", { className: `birthdays-row${employee.congratulated ? " is-congratulated" : ""}`, key: employee.userId, "data-user-id": employee.userId },
        h("span", { className: "birthdays-date", "aria-hidden": true },
          h("strong", null, employee.birthdayDay || "—"),
          h("span", null, employee.birthDate ? dateLabel(employee.birthDate).replace(/^\d+\s/, "") : "нет даты")),
        h("div", { className: "birthdays-person" },
          h("h3", null, employee.displayName),
          h("p", null, roleNames[employee.role] || "Сотрудник"),
          h("p", { className: "birthdays-birth-date" }, `Дата рождения: ${dateLabel(employee.birthDate, true) || "не указана"}`)),
        h("div", { className: "birthdays-row-actions" }, employee.daysUntil === 0
          ? h("button", {
              type: "button", className: `button birthdays-congratulate${employee.congratulated ? " is-done" : " primary"}`,
              "aria-label": `Поздравили: ${employee.displayName}`, "aria-pressed": employee.congratulated,
              disabled: Boolean(busyId) || loading,
              onClick: () => congratulate(employee),
            }, busyId === employee.userId ? "Сохраняем…" : employee.congratulated ? "Поздравили" : "Отметить поздравление")
          : employee.birthDate && h("div", { className: "birthdays-countdown" },
              h("strong", null, daysLabel(employee.daysUntil)),
              h("time", { dateTime: employee.nextBirthday }, dateLabel(employee.nextBirthday))),
          h("button", {
            type: "button", className: "birthdays-edit-button", disabled: Boolean(busyId),
            "aria-label": `${employee.birthDate ? "Изменить" : "Указать"} дату рождения: ${employee.displayName}`,
            onClick: () => editDate(employee),
          }, employee.birthDate ? "Изменить дату" : "Указать дату")),
        editing?.userId === employee.userId && h("form", { className: "birthdays-date-editor", onSubmit: async (event) => {
          event.preventDefault();
          if (await saveBirthDate(editing, draftDate)) setEditing(null);
        } },
          h("label", null, h("span", null, "Дата рождения"),
            h("input", { type: "date", autoFocus: true, min: "1900-01-01", max: data.today,
              value: draftDate, disabled: Boolean(busyId), "aria-label": `Дата рождения: ${employee.displayName}`,
              onChange: event => setDraftDate(event.target.value) })),
          h("div", { className: "birthdays-editor-actions" },
            h("button", { type: "submit", className: "button primary", disabled: Boolean(busyId) || draftDate === (editing.birthDate || "") }, busyId ? "Сохраняем…" : "Сохранить дату"),
            h("button", { type: "button", className: "button", disabled: Boolean(busyId), onClick: () => setEditing(null) }, "Отмена")),
          h("p", { className: "birthdays-hint" }, "Год рождения виден только администратору. Очистите поле, чтобы удалить дату.")));
    }
    return h("section", { className: "birthdays-workspace", "aria-label": "Поздравления" },
      h("header", { className: "page-heading" },
        h("div", null,
          h("span", { className: "eyebrow" }, "Забота о команде"),
          h("h1", null, "Поздравления"),
          h("p", null, "Дни рождения сотрудников и напоминания поздравить их вовремя.")),
        h("button", { type: "button", className: "button", disabled: loading || Boolean(busyId), onClick: reload }, loading ? "Обновляем…" : "Обновить")),
      error && h("div", { className: "error", role: "alert" },
        h("p", null, error),
        h("button", { type: "button", className: "button", onClick: reload, disabled: loading || Boolean(busyId) }, "Повторить загрузку")),
      notice && h("p", { className: "team-notice", role: "status" }, notice),
      !data ? (!error && h("p", { role: "status", className: "birthdays-empty" }, "Загружаем дни рождения…")) : h(React.Fragment, null,
        h("section", { className: "birthdays-panel birthdays-today", "aria-labelledby": "birthdays-today-heading" },
          h("header", { className: "birthdays-panel-heading" },
            h("div", null,
              h("h2", { id: "birthdays-today-heading" }, "Сегодня"),
              h("p", null, `${dateLabel(data.today)} · московское время`)),
            h("span", { className: "birthdays-summary" }, today.length ? `Осталось поздравить: ${reminders.pendingToday}` : "Всё спокойно")),
          today.length ? h("ul", { className: "birthdays-list" }, today.map(row))
            : h("p", { className: "birthdays-empty" }, "Сегодня нет дней рождения."),
          today.length > 0 && reminders.pendingToday === 0 && h("p", { className: "birthdays-complete", role: "status" }, "Все сегодняшние поздравления отмечены."),
          today.length > 0 && h("p", { className: "birthdays-hint" }, "Отметьте сотрудника после поздравления. Нажмите «Поздравили» ещё раз, чтобы снять отметку.")),
        h("section", { className: "birthdays-panel birthdays-upcoming", "aria-labelledby": "birthdays-upcoming-heading" },
          h("header", { className: "birthdays-panel-heading" },
            h("div", null, h("h2", { id: "birthdays-upcoming-heading" }, horizon === "missing" ? "Сотрудники без даты рождения" : "Ближайшие дни рождения"),
              h("p", null, horizon === "missing" ? "Укажите даты, чтобы получать напоминания" : horizon === 0 ? "Следующий день рождения каждого сотрудника" : `В течение следующих ${horizon} дней`)),
            h("div", { className: "birthdays-filters", role: "group", "aria-label": "Период дней рождения" },
              ...[[7, "7 дней"], [30, "30 дней"], [0, "Все ближайшие"], ["missing", "Без даты"]].map(([value, label]) =>
                h("button", { key: value, type: "button", "aria-label": label, "aria-pressed": horizon === value, onClick: () => selectHorizon(value) },
                  label, value === "missing" ? ` (${data.missingBirthDateCount || 0})` : "")))),
          upcoming.length ? h("ul", { className: "birthdays-list" }, upcoming.map(row))
            : h("p", { className: "birthdays-empty" }, horizon === "missing" ? "У всех сотрудников указаны даты рождения." : employees.length ? "В этом периоде дней рождения нет." : "Даты рождения пока не указаны.")),
        data.missingBirthDateCount > 0 && h("p", { className: "birthdays-hint birthdays-missing" },
          `Сотрудников без даты рождения: ${data.missingBirthDateCount}. Добавьте их даты на вкладке «Без даты».`)));
  }
  return { useBirthdayReminders, BirthdayReminder, BirthdaysWorkspace };
}
