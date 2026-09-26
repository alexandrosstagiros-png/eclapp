import { createCompanyWorkRequest } from "./company-work-request.js";
// SPDX-License-Identifier: MIT
const uid = () => crypto.randomUUID();
const STATUS = {
  todo: "Выполнить",
  in_progress: "В процессе",
  done: "Сделано",
};
const normalize = (value) =>
  String(value || "")
    .toLocaleLowerCase("ru")
    .replace(/ё/g, "е")
    .trim();
const readableDate = (value) =>
  value
    ? new Date(`${value}T12:00:00`).toLocaleDateString("ru-RU", {
        day: "numeric",
        month: "short",
      })
    : "Без срока";
export function createTeamTasks(React, { request }) {
  const { createElement: h, useState, useEffect, useRef } = React;
  const button = (label, onClick, props = {}) =>
    h(
      "button",
      { type: "button", className: "button", onClick, ...props },
      label,
    );
  const field = (label, input) =>
    h(
      "label",
      { className: "team-task-field" },
      h("span", null, label),
      React.cloneElement(input, { "aria-label": label }),
    );
  const alert = (message) =>
    message && h("p", { className: "team-task-error", role: "alert" }, message);
  function Dialog({ title, onClose, busy, children }) {
    const ref = useRef(null),
      close = useRef(onClose);
    close.current = onClose;
    useEffect(() => {
      const previous = document.activeElement;
      ref.current?.querySelector("input,select,textarea,button")?.focus();
      const handle = (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          close.current();
        }
        if (event.key !== "Tab") return;
        const elements = [
          ...(ref.current?.querySelectorAll(
            'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]',
          ) || []),
        ];
        if (!elements.length) return;
        if (event.shiftKey && document.activeElement === elements[0]) {
          event.preventDefault();
          elements.at(-1).focus();
        } else if (
          !event.shiftKey &&
          document.activeElement === elements.at(-1)
        ) {
          event.preventDefault();
          elements[0].focus();
        }
      };
      document.addEventListener("keydown", handle);
      return () => {
        document.removeEventListener("keydown", handle);
        if (previous?.isConnected) previous.focus();
      };
    }, []);
    return h(
      "div",
      {
        className: "team-overlay team-task-overlay",
        onMouseDown: (event) => {
          if (event.target === event.currentTarget) onClose();
        },
      },
      h(
        "section",
        {
          ref,
          className: "team-dialog team-task-dialog",
          role: "dialog",
          "aria-modal": true,
          "aria-label": title,
        },
        h(
          "header",
          null,
          h("h2", null, title),
          button("Закрыть", onClose, {
            disabled: busy,
            "aria-label": `Закрыть ${title.toLocaleLowerCase("ru")}`,
          }),
        ),
        h("div", { className: "team-dialog-body" }, children),
      ),
    );
  }
  return function TeamTasks({
    token,
    actor,
    scopeId,
    scopes = [],
    onExpired,
    onDirtyChange,
    onOpenConversation,
    initialTaskId = "",
    openTaskRequest,
  }) {
    const scopeList = useRef(scopes);
    scopeList.current = scopes.length ? scopes : [{ responsibilityScopeId: scopeId }];
    const key = `${actor?.id}:${actor?.role}:${scopeList.current.map(value => value.responsibilityScopeId).join(":")}`;
    const companyRequest = useRef(null);
    if (!companyRequest.current) companyRequest.current = createCompanyWorkRequest(request, () => scopeList.current);
    const [activeKey, setActiveKey] = useState(key),
      [organization, setOrganization] = useState({
        people: [],
        positions: [],
        assignableIds: [],
        canManage: false,
      });
    const [tasks, setTasks] = useState([]),
      [pagination, setPagination] = useState({
        hasMore: false,
        nextBefore: null,
      });
    const [loading, setLoading] = useState(true),
      [busy, setBusy] = useState(""),
      [error, setError] = useState(""),
      [notice, setNotice] = useState("");
    const [query, setQuery] = useState(""),
      [filter, setFilter] = useState("all"),
      [selectedId, setSelectedId] = useState(""),
      [detail, setDetail] = useState(null),
      [form, setForm] = useState(null);
    const [orgOpen, setOrgOpen] = useState(false),
      [orgTab, setOrgTab] = useState("employees"),
      [employeeForm, setEmployeeForm] = useState(null),
      [positionForm, setPositionForm] = useState(null),
      [orgQuery, setOrgQuery] = useState("");
    const live = useRef({
        key,
        token,
        onExpired,
        onDirtyChange,
        onOpenConversation,
      }),
      alive = useRef(true),
      epoch = useRef(0),
      loadVersion = useRef(0),
      pendingLoad = useRef(null),
      detailVersion = useRef(0),
      busyRef = useRef(false),
      busyOwner = useRef(null),
      tasksRef = useRef(tasks),
      detailRef = useRef(detail),
      selectedRef = useRef(selectedId),
      formRef = useRef(form),
      statusOperation = useRef(null);
    live.current = { key, token, onExpired, onDirtyChange, onOpenConversation };
    tasksRef.current = tasks;
    detailRef.current = detail;
    selectedRef.current = selectedId;
    formRef.current = form;
    const valid = (stamp) =>
      alive.current &&
      live.current.key === stamp.key &&
      epoch.current === stamp.epoch;
    const stamp = () => ({ key, epoch: epoch.current });
    const api = (path, options = {}) =>
      companyRequest.current(path, options, live.current.token);
    const scoped = (path) =>
      `${path}?responsibilityScopeId=${encodeURIComponent(scopeId)}`;
    const fail = (reason) => {
      if (reason?.status === 401) live.current.onExpired?.();
      return reason?.status === 401
        ? "Сессия завершена. Войдите снова."
        : reason?.message ||
            "Не удалось выполнить действие. Повторите попытку.";
    };
    const employeeDirty =
      employeeForm &&
      (employeeForm.managerId !== employeeForm.original.managerId ||
        employeeForm.positionId !== employeeForm.original.positionId);
    const positionDirty =
      positionForm && positionForm.title !== positionForm.original;
    const dirty = Boolean(form || employeeDirty || positionDirty);
    const peopleById = new Map(
      organization.people.map((person) => [person.id, person]),
    );
    const name = (id) =>
      peopleById.get(id)?.displayName || "Недоступный сотрудник";
    const taskScope = form?.existing?.responsibilityScopeId;
    const assignable = organization.people.filter((person) =>
      (organization.byScope?.[taskScope]?.assignableIds || organization.assignableIds).includes(person.id),
    );
    function clearTask(id) {
      setTasks((items) => items.filter((item) => item.id !== id));
      if (detailRef.current?.id === id || selectedRef.current === id) {
        detailVersion.current++;
        setDetail(null);
        setSelectedId("");
      }
      if (formRef.current?.existing?.id === id) setForm(null);
    }
    function acceptOrganization(value) {
      setOrganization(value);
      if (!value.canManage) {
        setOrgOpen(false);
        setEmployeeForm(null);
        setPositionForm(null);
      }
    }
    function acceptTask(value) {
      setTasks((items) =>
        [value, ...items.filter((item) => item.id !== value.id)].sort((a, b) =>
          String(b.updatedAt).localeCompare(String(a.updatedAt)),
        ),
      );
      setDetail((before) => (before?.id === value.id ? value : before));
      setForm((before) =>
        before?.existing?.id === value.id && value.version > before.version
          ? { ...before, conflict: value }
          : before,
      );
    }
    async function load(more = false) {
      if (!scopeId || busyRef.current || pendingLoad.current || (more && !pagination.nextBefore))
        return;
      // A paced company read can outlast the polling interval. Keep the active
      // read instead of invalidating it on every tick before it can finish.
      const controller = new AbortController();
      pendingLoad.current = controller;
      const read = path => api(path, { signal: controller.signal });
      const target = stamp(),
        revision = ++loadVersion.current;
      if (!more) setLoading(true);
      try {
        let result = await read(
          `${scoped("/team/tasks")}${more ? `&before=${encodeURIComponent(pagination.nextBefore)}` : ""}`,
        );
        const wanted = Math.max(100, tasksRef.current.length);
        let rows = result.tasks || [];
        while (
          !more &&
          result.hasMore &&
          result.nextBefore &&
          rows.length < wanted
        ) {
          if (!valid(target) || revision !== loadVersion.current) return;
          result = await read(
            `${scoped("/team/tasks")}&before=${encodeURIComponent(result.nextBefore)}`,
          );
          rows.push(...(result.tasks || []));
        }
        const org = await read(scoped("/team/organization"));
        if (
          !valid(target) ||
          revision !== loadVersion.current ||
          busyRef.current
        )
          return;
        acceptOrganization(org);
        setTasks((previous) => [
          ...new Map(
            (more ? [...previous, ...rows] : rows).map((row) => [row.id, row]),
          ).values(),
        ]);
        setPagination({
          hasMore: result.hasMore,
          nextBefore: result.nextBefore,
        });
        const currentDetail = selectedRef.current
          ? { id: selectedRef.current }
          : detailRef.current;
        if (currentDetail) {
          try {
            const latest = await read(
              scoped(`/team/tasks/${encodeURIComponent(currentDetail.id)}`),
            );
            if (valid(target) && revision === loadVersion.current) {
              setDetail((before) =>
                before?.id === latest.id ? latest : before,
              );
              setForm((before) =>
                before?.existing?.id === latest.id &&
                latest.version > before.version
                  ? { ...before, conflict: latest }
                  : before,
              );
            }
          } catch (reason) {
            if (
              valid(target) &&
              revision === loadVersion.current &&
              [403, 404].includes(reason?.status)
            )
              clearTask(currentDetail.id);
            else throw reason;
          }
        }
      } catch (reason) {
        if (controller.signal.aborted) return;
        if (!valid(target) || revision !== loadVersion.current) return;
        if ([401, 403].includes(reason?.status)) {
          setTasks([]);
          setDetail(null);
          setSelectedId("");
          setForm(null);
          acceptOrganization({
            people: [],
            positions: [],
            assignableIds: [],
            canManage: false,
          });
        }
        setError(fail(reason));
      } finally {
        if (pendingLoad.current === controller) pendingLoad.current = null;
        if (valid(target) && revision === loadVersion.current)
          setLoading(false);
      }
    }
    async function mutate(kind, action, success, conflictHandler) {
      if (busyRef.current) return;
      const target = stamp();
      const owner = uid();
      busyOwner.current = owner;
      busyRef.current = true;
      ++loadVersion.current;
      pendingLoad.current?.abort();
      pendingLoad.current = null;
      setBusy(kind);
      setLoading(false);
      setError("");
      setNotice("");
      try {
        const result = await action();
        if (valid(target)) success?.(result);
      } catch (reason) {
        if (valid(target)) {
          if (reason?.status === 409 && conflictHandler) {
            try {
              await conflictHandler(target);
            } catch {
              /* The draft stays available if conflict recovery is offline. */
            }
          }
          if (valid(target)) setError(fail(reason));
        }
      } finally {
        if (busyOwner.current === owner) {
          busyRef.current = false;
          busyOwner.current = null;
          if (valid(target)) setBusy("");
        }
      }
    }
    useEffect(() => {
      alive.current = true;
      return () => {
        alive.current = false;
        epoch.current++;
        pendingLoad.current?.abort();
        pendingLoad.current = null;
        live.current.onDirtyChange?.(false);
      };
    }, []);
    useEffect(() => {
      pendingLoad.current?.abort();
      pendingLoad.current = null;
      epoch.current++;
      loadVersion.current++;
      detailVersion.current++;
      setActiveKey(key);
      setTasks([]);
      setDetail(null);
      detailRef.current = null;
      setSelectedId("");
      setForm(null);
      setEmployeeForm(null);
      setPositionForm(null);
      setOrgOpen(false);
      setError("");
      setNotice("");
      setQuery("");
      setFilter("all");
      setPagination({ hasMore: false, nextBefore: null });
      setOrganization({
        people: [],
        positions: [],
        assignableIds: [],
        canManage: false,
      });
      statusOperation.current = null;
      busyRef.current = false;
      busyOwner.current = null;
      setBusy("");
      load();
      return () => {
        epoch.current++;
        loadVersion.current++;
        pendingLoad.current?.abort();
        pendingLoad.current = null;
      };
    }, [key]);
    useEffect(() => {
      live.current.onDirtyChange?.(dirty || Boolean(busy));
    }, [dirty, busy]);
    useEffect(() => {
      const timer = setInterval(() => {
        if (!document.hidden && !busyRef.current) load();
      }, 15000);
      return () => clearInterval(timer);
    }, [key, token]);
    useEffect(() => {
      if (initialTaskId && scopeId) openTask(initialTaskId);
    }, [key, initialTaskId, openTaskRequest]);
    function closeTask() {
      if (busyRef.current) return;
      if (form && !window.confirm("Удалить несохранённый черновик задачи?"))
        return;
      detailVersion.current++;
      setForm(null);
      setDetail(null);
      setSelectedId("");
      setError("");
    }
    async function openTask(id) {
      if (busyRef.current) return;
      if (
        formRef.current &&
        !window.confirm("Удалить несохранённый черновик задачи?")
      )
        return;
      const target = stamp(),
        revision = ++detailVersion.current;
      setSelectedId(id);
      setForm(null);
      setDetail(null);
      setError("");
      try {
        const value = await api(
          scoped(`/team/tasks/${encodeURIComponent(id)}`),
        );
        if (valid(target) && revision === detailVersion.current) {
          setDetail(value);
          acceptTask(value);
        }
      } catch (reason) {
        if (valid(target) && revision === detailVersion.current) {
          if ([403, 404].includes(reason?.status)) clearTask(id);
          setSelectedId("");
          setError(fail(reason));
        }
      }
    }
    function editTask(task = null) {
      if (busyRef.current || (task && !task.canEdit)) return;
      setError("");
      setForm({
        id: task?.id || uid(),
        operationId: uid(),
        version: task?.version || 0,
        existing: task,
        title: task?.title || "",
        description: task?.description || "",
        assigneeId: task?.assigneeId || assignable[0]?.id || "",
        dueDate: task?.dueDate || "",
        conflict: null,
      });
    }
    async function saveTask(event) {
      event.preventDefault();
      const value = form;
      if (!value || value.conflict) return;
      const body = {
        responsibilityScopeId: scopeId,
        operationId: value.operationId,
        title: value.title.trim(),
        description: value.description.trim(),
        assigneeId: value.assigneeId,
        dueDate: value.dueDate || null,
        ...(value.existing ? { version: value.version } : { id: value.id }),
      };
      await mutate(
        "task",
        () =>
          api(
            value.existing
              ? `/team/tasks/${encodeURIComponent(value.id)}`
              : "/team/tasks",
            {
              method: value.existing ? "PUT" : "POST",
              body: JSON.stringify(body),
            },
          ),
        (result) => {
          acceptTask(result);
          setDetail(result);
          setSelectedId(result.id);
          setForm(null);
          setNotice(
            value.existing
              ? "Задача обновлена."
              : "Задача создана. Исполнитель получил личное сообщение.",
          );
        },
        async (target) => {
          try {
            const latest = await api(
              scoped(`/team/tasks/${encodeURIComponent(value.id)}`),
            );
            if (valid(target)) {
              setDetail(latest);
              setForm((before) =>
                before?.id === value.id
                  ? { ...before, conflict: latest }
                  : before,
              );
            }
          } catch (reason) {
            if (
              valid(target) &&
              [403, 404].includes(reason?.status) &&
              value.existing
            )
              clearTask(value.id);
          }
        },
      );
    }
    async function changeStatus(task, status) {
      if (!task.canChangeStatus || task.status === status) return;
      const action = `${task.id}:${task.version}:${status}`;
      if (statusOperation.current?.action !== action)
        statusOperation.current = { action, id: uid() };
      await mutate(
        "status",
        () =>
          api(`/team/tasks/${encodeURIComponent(task.id)}/status`, {
            method: "PUT",
            body: JSON.stringify({
              responsibilityScopeId: scopeId,
              operationId: statusOperation.current.id,
              version: task.version,
              status,
            }),
          }),
        (value) => {
          acceptTask(value);
          setNotice("Статус задачи обновлён.");
        },
        async (target) => {
          try {
            const latest = await api(
              scoped(`/team/tasks/${encodeURIComponent(task.id)}`),
            );
            if (valid(target)) acceptTask(latest);
          } catch (reason) {
            if (valid(target) && [403, 404].includes(reason?.status))
              clearTask(task.id);
          }
        },
      );
    }
    function chooseEmployee(person) {
      if (
        busyRef.current ||
        (employeeDirty &&
          !window.confirm("Удалить несохранённые изменения сотрудника?"))
      )
        return;
      const original = {
        managerId: person.managerId || "",
        positionId: person.positionId || "",
      };
      setEmployeeForm({
        id: person.id,
        responsibilityScopeId: person.responsibilityScopeId || scopeId,
        version: person.version,
        operationId: uid(),
        ...original,
        original,
        conflict: null,
      });
      setError("");
    }
    function closeOrganization() {
      if (
        busyRef.current ||
        ((employeeDirty || positionDirty) &&
          !window.confirm("Удалить несохранённые изменения оргструктуры?"))
      )
        return;
      setOrgOpen(false);
      setEmployeeForm(null);
      setPositionForm(null);
      setError("");
    }
    async function saveEmployee(event) {
      event.preventDefault();
      const value = employeeForm;
      if (!value || value.conflict) return;
      await mutate(
        "employee",
        () =>
          request(`/team/organization/employees/${encodeURIComponent(value.id)}`, {
            method: "PUT",
            body: JSON.stringify({
              responsibilityScopeId: value.responsibilityScopeId,
              operationId: value.operationId,
              version: value.version,
              managerId: value.managerId || null,
              positionId: value.positionId || null,
            }),
          }, live.current.token),
        (saved) => {
          const person = { ...saved, responsibilityScopeId: value.responsibilityScopeId };
          setOrganization((before) => ({
            ...before,
            people: before.people.map((item) =>
              item.id === person.id ? person : item,
            ),
            ...(before.byScope?.[value.responsibilityScopeId] ? { byScope: {
              ...before.byScope,
              [value.responsibilityScopeId]: { ...before.byScope[value.responsibilityScopeId], people: before.byScope[value.responsibilityScopeId].people.map(item => item.id === person.id ? person : item) },
            } } : {}),
          }));
          const original = {
            managerId: person.managerId || "",
            positionId: person.positionId || "",
          };
          setEmployeeForm({
            ...value,
            ...original,
            original,
            version: person.version,
            operationId: uid(),
            conflict: null,
          });
          setNotice("Руководитель и должность сохранены.");
        },
        async (target) => {
          const org = await api(scoped("/team/organization"));
          if (valid(target)) {
            acceptOrganization(org);
            const person = (org.byScope?.[value.responsibilityScopeId]?.people || (org.byScope ? [] : org.people)).find((person) => person.id === value.id);
            setEmployeeForm((before) =>
              before?.id === value.id
                ? { ...before, conflict: person || { unavailable: true } }
                : before,
            );
          }
        },
      );
    }
    async function savePosition(event) {
      event.preventDefault();
      const value = positionForm;
      if (!value || value.conflict) return;
      await mutate(
        "position",
        () =>
          api(`/team/organization/positions/${encodeURIComponent(value.id)}`, {
            method: "PUT",
            body: JSON.stringify({
              responsibilityScopeId: scopeId,
              operationId: value.operationId,
              version: value.version,
              title: value.title.trim(),
            }),
          }),
        (position) => {
          setOrganization((before) => ({
            ...before,
            people: before.people.map((person) =>
              person.positionId === position.id
                ? { ...person, positionTitle: position.title }
                : person,
            ),
            positions: [
              ...before.positions.filter((item) => item.id !== position.id),
              position,
            ].sort((a, b) => a.title.localeCompare(b.title, "ru")),
          }));
          setPositionForm({
            ...position,
            operationId: uid(),
            original: position.title,
            conflict: null,
          });
          setNotice(
            "Должность сохранена. Системные права сотрудников не меняются.",
          );
        },
        async (target) => {
          const org = await api(scoped("/team/organization"));
          if (valid(target)) {
            acceptOrganization(org);
            setPositionForm((before) =>
              before?.id === value.id
                ? {
                    ...before,
                    conflict:
                      org.positions.find((item) => item.id === value.id) ||
                      (value.version ? { unavailable: true } : null),
                  }
                : before,
            );
          }
        },
      );
    }
    function taskForm() {
      const choices = [...assignable];
      if (
        form.existing &&
        !choices.some((person) => person.id === form.assigneeId)
      )
        choices.unshift({
          id: form.assigneeId,
          displayName: name(form.assigneeId),
        });
      const input = (key, value) =>
        setForm((before) => ({ ...before, [key]: value, operationId: uid() }));
      return h(
        "form",
        { onSubmit: saveTask, className: "team-task-form" },
        field(
          "Название задачи",
          h("input", {
            required: true,
            maxLength: 200,
            value: form.title,
            disabled: Boolean(busy),
            onChange: (event) => input("title", event.target.value),
          }),
        ),
        field(
          "Описание задачи",
          h("textarea", {
            rows: 5,
            maxLength: 8000,
            value: form.description,
            disabled: Boolean(busy),
            onChange: (event) => input("description", event.target.value),
          }),
        ),
        h(
          "div",
          { className: "team-task-form-pair" },
          field(
            "Исполнитель",
            h(
              "select",
              {
                required: true,
                value: form.assigneeId,
                disabled: Boolean(busy),
                onChange: (event) => input("assigneeId", event.target.value),
              },
              h("option", { value: "" }, "Выберите подчинённого"),
              ...choices.map((person) =>
                h(
                  "option",
                  { key: person.id, value: person.id },
                  person.displayName,
                ),
              ),
            ),
          ),
          field(
            "Срок задачи",
            h("input", {
              type: "date",
              value: form.dueDate,
              disabled: Boolean(busy),
              onChange: (event) => input("dueDate", event.target.value),
            }),
          ),
        ),
        h(
          "p",
          { className: "team-muted" },
          "При назначении исполнитель получит личное сообщение. Руководители по цепочке видят задачу; доступ к личной переписке есть только у её участников и администратора.",
        ),
        form.conflict &&
          h(
            "div",
            { className: "team-task-conflict" },
            h("strong", null, "Задача уже изменилась"),
            h(
              "p",
              null,
              `Актуальная версия: ${form.conflict.title} · ${STATUS[form.conflict.status]}. Ваш черновик сохранён.`,
            ),
            h(
              "p",
              null,
              `Исполнитель: ${form.conflict.assigneeName}. Срок: ${readableDate(form.conflict.dueDate)}.`,
            ),
            h(
              "details",
              null,
              h("summary", null, "Актуальное описание"),
              h(
                "p",
                { className: "team-task-description" },
                form.conflict.description || "Описание не добавлено.",
              ),
            ),
            button("Загрузить актуальную задачу", () => {
              setForm(null);
              setDetail(form.conflict);
              setError("");
            }),
            form.existing &&
              form.conflict.canEdit &&
              button("Сохранить мой вариант после проверки", () =>
                setForm((before) => ({
                  ...before,
                  version: before.conflict.version,
                  existing: before.conflict,
                  conflict: null,
                  operationId: uid(),
                })),
              ),
          ),
        h(
          "div",
          { className: "team-actions" },
          h(
            "button",
            {
              type: "submit",
              className: "button team-primary",
              disabled:
                Boolean(busy) ||
                Boolean(form.conflict) ||
                !form.assigneeId ||
                !form.title.trim(),
            },
            busy === "task"
              ? "Сохраняем…"
              : form.existing
                ? "Сохранить задачу"
                : "Поставить задачу",
          ),
          button(
            "Отмена",
            () => {
              if (window.confirm("Удалить несохранённый черновик задачи?")) {
                setForm(null);
                if (!detail) setSelectedId("");
              }
            },
            { disabled: Boolean(busy) },
          ),
        ),
      );
    }
    function organizationDialog() {
      if (!orgOpen || !organization.canManage) return null;
      const employeeOrganization = organization.byScope?.[employeeForm?.responsibilityScopeId] || (organization.byScope ? { people: [], positions: [] } : organization);
      const employee = employeeForm && employeeOrganization.people.find(person => person.id === employeeForm.id);
      const employeePositions = organization.byScope ? organization.positions.filter(position => position.responsibilityScopeId === employeeForm?.responsibilityScopeId) : organization.positions;
      return h(
        Dialog,
        {
          title: "Оргструктура",
          onClose: closeOrganization,
          busy: Boolean(busy),
        },
        alert(error),
        notice &&
          h("p", { className: "team-task-notice", role: "status" }, notice),
        h(
          "p",
          { className: "team-muted" },
          "Должности описывают работу сотрудников. Они не меняют системные роли и права доступа. Задачи можно ставить своим подчинённым по всей цепочке.",
        ),
        h(
          "nav",
          { className: "team-org-tabs", "aria-label": "Разделы оргструктуры" },
          ...["employees", "positions"].map((value) =>
            button(
              value === "employees" ? "Сотрудники" : "Должности",
              () => {
                if (
                  (employeeDirty || positionDirty) &&
                  !window.confirm("Удалить несохранённые изменения?")
                )
                  return;
                setEmployeeForm(null);
                setPositionForm(null);
                setOrgTab(value);
                setError("");
              },
              {
                "aria-pressed": orgTab === value,
                disabled: Boolean(busy),
                key: value,
              },
            ),
          ),
        ),
        orgTab === "employees"
          ? h(
              React.Fragment,
              null,
              field(
                "Найти сотрудника в оргструктуре",
                h("input", {
                  type: "search",
                  value: orgQuery,
                  onChange: (event) => setOrgQuery(event.target.value),
                }),
              ),
              h(
                "div",
                { className: "team-org-people" },
                ...organization.people
                  .filter((person) =>
                    normalize(
                      `${person.displayName} ${person.positionTitle}`,
                    ).includes(normalize(orgQuery)),
                  )
                  .map((person) =>
                    button(
                      h(
                        React.Fragment,
                        null,
                        h("strong", null, person.displayName),
                        h(
                          "span",
                          null,
                          person.positionTitle || "Должность не назначена",
                        ),
                        h(
                          "small",
                          null,
                          person.managerId
                            ? `Руководитель: ${name(person.managerId)}`
                            : "Верхний уровень / руководитель не назначен",
                        ),
                      ),
                      () => chooseEmployee(person),
                      {
                        key: person.id,
                        className: `team-org-person${employeeForm?.id === person.id ? " is-selected" : ""}`,
                        "aria-label": `Настроить ${person.displayName}`,
                        disabled: Boolean(busy),
                      },
                    ),
                  ),
              ),
              employee &&
                h(
                  "form",
                  { className: "team-org-editor", onSubmit: saveEmployee },
                  h("h3", null, employee.displayName),
                  field(
                    "Должность сотрудника",
                    h(
                      "select",
                      {
                        value: employeeForm.positionId,
                        disabled: Boolean(busy),
                        onChange: (event) =>
                          setEmployeeForm((before) => ({
                            ...before,
                            positionId: event.target.value,
                            operationId: uid(),
                          })),
                      },
                      h("option", { value: "" }, "Не назначена"),
                      ...employeePositions.map((position) =>
                        h(
                          "option",
                          { key: position.id, value: position.id },
                          position.title,
                        ),
                      ),
                    ),
                  ),
                  field(
                    "Руководитель сотрудника",
                    h(
                      "select",
                      {
                        value: employeeForm.managerId,
                        disabled: Boolean(busy),
                        onChange: (event) =>
                          setEmployeeForm((before) => ({
                            ...before,
                            managerId: event.target.value,
                            operationId: uid(),
                          })),
                      },
                      h(
                        "option",
                        { value: "" },
                        "Нет руководителя — верхний уровень",
                      ),
                      ...employeeOrganization.people
                        .filter((person) => person.id !== employee.id)
                        .map((person) =>
                          h(
                            "option",
                            { key: person.id, value: person.id },
                            person.displayName,
                          ),
                        ),
                    ),
                  ),
                  employeeForm.conflict &&
                    h(
                      "div",
                      { className: "team-task-conflict" },
                      h(
                        "p",
                        null,
                        "Оргструктура уже изменена. Проверьте текущего руководителя и должность в списке.",
                      ),
                      !employeeForm.conflict.unavailable &&
                        button("Применить к актуальной версии", () =>
                          setEmployeeForm((before) => ({
                            ...before,
                            version: before.conflict.version,
                            operationId: uid(),
                            conflict: null,
                          })),
                        ),
                    ),
                  h(
                    "button",
                    {
                      type: "submit",
                      className: "button team-primary",
                      disabled:
                        Boolean(busy) ||
                        Boolean(employeeForm.conflict) ||
                        !employeeDirty,
                    },
                    "Сохранить сотрудника",
                  ),
                ),
            )
          : h(
              React.Fragment,
              null,
              h(
                "div",
                { className: "team-org-positions" },
                ...organization.positions.map((position) =>
                  button(
                    position.title,
                    () => {
                      if (
                        positionDirty &&
                        !window.confirm(
                          "Удалить несохранённые изменения должности?",
                        )
                      )
                        return;
                      setPositionForm({
                        ...position,
                        original: position.title,
                        operationId: uid(),
                        conflict: null,
                      });
                      setError("");
                    },
                    {
                      key: position.id,
                      disabled: Boolean(busy),
                      "aria-label": `Изменить должность ${position.title}`,
                    },
                  ),
                ),
                button(
                  "+ Добавить должность",
                  () => {
                    if (
                      positionDirty &&
                      !window.confirm(
                        "Удалить несохранённые изменения должности?",
                      )
                    )
                      return;
                    setPositionForm({
                      id: uid(),
                      version: 0,
                      title: "",
                      original: "",
                      operationId: uid(),
                      conflict: null,
                    });
                  },
                  {
                    disabled: Boolean(busy),
                    "aria-label": "Добавить должность",
                  },
                ),
              ),
              positionForm &&
                h(
                  "form",
                  { className: "team-org-editor", onSubmit: savePosition },
                  field(
                    "Название должности",
                    h("input", {
                      required: true,
                      maxLength: 120,
                      value: positionForm.title,
                      disabled: Boolean(busy),
                      onChange: (event) =>
                        setPositionForm((before) => ({
                          ...before,
                          title: event.target.value,
                          operationId: uid(),
                        })),
                    }),
                  ),
                  positionForm.conflict &&
                    h(
                      "div",
                      { className: "team-task-conflict" },
                      h(
                        "p",
                        null,
                        "Должность уже изменилась. Актуальный список загружен.",
                      ),
                      !positionForm.conflict.unavailable &&
                        button("Применить к актуальной версии", () =>
                          setPositionForm((before) => ({
                            ...before,
                            version: before.conflict.version,
                            operationId: uid(),
                            conflict: null,
                          })),
                        ),
                    ),
                  h(
                    "button",
                    {
                      type: "submit",
                      className: "button team-primary",
                      disabled:
                        Boolean(busy) ||
                        !positionForm.title.trim() ||
                        Boolean(positionForm.conflict),
                    },
                    "Сохранить должность",
                  ),
                ),
            ),
      );
    }
    if (activeKey !== key)
      return h("p", { className: "team-muted" }, "Загружаем задачи…");
    const filtered = tasks.filter(
      (task) =>
        (filter === "all" ||
          (filter === "mine" && task.assigneeId === actor.id) ||
          (filter === "authored" && task.authorId === actor.id) ||
          (filter === "team" &&
            organization.assignableIds.includes(task.assigneeId))) &&
        normalize(
          `${task.title} ${task.description} ${task.assigneeName}`,
        ).includes(normalize(query)),
    );
    return h(
      "section",
      { className: "team-tasks", "aria-label": "Задачи команды" },
      h(
        "header",
        { className: "team-tasks-heading" },
        h(
          "div",
          null,
          h("p", { className: "team-eyebrow" }, "Задачи и ответственность"),
          h("h2", null, "От поручения к результату"),
          h(
            "p",
            { className: "team-muted" },
            "Задачи подчинённым, сроки и текущий статус в одном месте.",
          ),
        ),
        h(
          "div",
          { className: "team-actions" },
          organization.canManage &&
            button(
              "Оргструктура",
              () => {
                setOrgOpen(true);
                setError("");
                setNotice("");
              },
              { disabled: Boolean(busy) },
            ),
          button("Обновить задачи", () => load(), {
            disabled: Boolean(busy) || loading,
          }),
          button("+ Новая задача", () => editTask(), {
            className: "button team-primary",
            "aria-label": "Новая задача",
            disabled: Boolean(busy) || !assignable.length,
          }),
        ),
      ),
      alert(error),
      notice &&
        h("p", { className: "team-task-notice", role: "status" }, notice),
      !assignable.length &&
        !loading &&
        h(
          "p",
          { className: "team-task-empty-guidance" },
          organization.canManage
            ? "В этой области пока нет сотрудников для назначения задач."
            : "Назначать задачи можно своим подчинённым. Руководителя и должность задаёт администратор в оргструктуре.",
        ),
      h(
        "div",
        { className: "team-task-filters" },
        field(
          "Найти задачу",
          h("input", {
            type: "search",
            value: query,
            placeholder: "Название, описание или исполнитель…",
            onChange: (event) => setQuery(event.target.value),
          }),
        ),
        field(
          "Показывать задачи",
          h(
            "select",
            {
              value: filter,
              onChange: (event) => setFilter(event.target.value),
            },
            h("option", { value: "all" }, "Все доступные"),
            h("option", { value: "mine" }, "Мои задачи"),
            h("option", { value: "authored" }, "Поставленные мной"),
            h("option", { value: "team" }, "Моих подчинённых"),
          ),
        ),
      ),
      loading &&
        h(
          "p",
          { className: "team-muted", role: "status" },
          "Обновляем задачи…",
        ),
      h(
        "div",
        { className: "team-task-board" },
        ...Object.entries(STATUS).map(([status, label]) => {
          const column = filtered.filter((task) => task.status === status);
          return h(
            "section",
            {
              key: status,
              className: `team-task-column is-${status}`,
              "aria-label": label,
            },
            h(
              "header",
              null,
              h("h3", null, label),
              h("span", null, column.length),
            ),
            h(
              "div",
              { className: "team-task-cards" },
              ...column.map((task) =>
                button(
                  h(
                    React.Fragment,
                    null,
                    h("h4", null, task.title),
                    task.description && h("p", null, task.description),
                    h(
                      "footer",
                      null,
                      h("span", null, task.assigneeName),
                      h(
                        "time",
                        {
                          dateTime: task.dueDate || undefined,
                          className:
                            task.dueDate &&
                            task.dueDate <
                              new Date().toLocaleDateString("en-CA") &&
                            status !== "done"
                              ? "is-overdue"
                              : "",
                        },
                        readableDate(task.dueDate),
                      ),
                    ),
                  ),
                  () => openTask(task.id),
                  {
                    key: task.id,
                    className: "team-task-card",
                    "aria-label": `Открыть задачу: ${task.title}`,
                    disabled: Boolean(busy),
                  },
                ),
              ),
            ),
            !column.length &&
              h("p", { className: "team-task-column-empty" }, "Пока нет задач"),
          );
        }),
      ),
      pagination.hasMore &&
        button("Загрузить ещё задачи", () => load(true), {
          disabled: Boolean(busy) || loading,
        }),
      (form || selectedId) &&
        h(
          Dialog,
          {
            title: form
              ? form.existing
                ? "Редактировать задачу"
                : "Новая задача"
              : "Задача",
            onClose: closeTask,
            busy: Boolean(busy),
          },
          alert(error),
          form
            ? taskForm()
            : detail
              ? h(
                  React.Fragment,
                  null,
                  h(
                    "div",
                    { className: "team-task-detail-title" },
                    h(
                      "span",
                      { className: `team-task-status is-${detail.status}` },
                      STATUS[detail.status],
                    ),
                    h("h3", null, detail.title),
                  ),
                  h(
                    "p",
                    { className: "team-task-description" },
                    detail.description || "Описание не добавлено.",
                  ),
                  h(
                    "dl",
                    { className: "team-task-facts" },
                    h("dt", null, "Исполнитель"),
                    h("dd", null, detail.assigneeName),
                    h("dt", null, "Постановщик"),
                    h("dd", null, detail.authorName),
                    h("dt", null, "Срок"),
                    h("dd", null, readableDate(detail.dueDate)),
                  ),
                  detail.canChangeStatus &&
                    h(
                      "div",
                      {
                        className: "team-task-status-controls",
                        "aria-label": "Статус задачи",
                      },
                      ...Object.entries(STATUS).map(([status, label]) =>
                        button(label, () => changeStatus(detail, status), {
                          key: status,
                          "aria-label": `Статус: ${label}`,
                          "aria-pressed": detail.status === status,
                          disabled: Boolean(busy) || detail.status === status,
                        }),
                      ),
                    ),
                  h(
                    "div",
                    { className: "team-actions" },
                    detail.canEdit &&
                      button("Редактировать задачу", () => editTask(detail), {
                        disabled: Boolean(busy),
                      }),
                    detail.canOpenConversation &&
                      button(
                        "Открыть личный чат",
                        () =>
                          live.current.onOpenConversation?.(
                            detail.conversationId,
                          ),
                        { disabled: Boolean(busy) },
                      ),
                  ),
                )
              : h("p", { className: "team-muted" }, "Загружаем задачу…"),
        ),
      organizationDialog(),
    );
  };
}
