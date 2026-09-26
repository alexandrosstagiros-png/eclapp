const ROLE_NAMES = { dispatcher: 'Диспетчер', manager: 'Менеджер' };
const scopeLabel = scope => [scope.region?.name, scope.project?.name, scope.responsibilityScope?.name, scope.legalEntity?.name].filter(Boolean).join(' · ');
const grantsKey = grants => JSON.stringify(grants.map(grant => ({ scopeId: grant.scopeId, personalDataVisible: grant.personalDataVisible === true })).sort((a, b) => a.scopeId.localeCompare(b.scopeId)));
const scopeExplanation = 'Зона ответственности — часть проекта, за которую отвечает сотрудник. Область работы включает юрлицо, регион, проект и зону. Диспетчеры и менеджеры одной зоны работают с общими планами.';
const personalDataExplanation = 'Для планирования в выбранной зоне нужен доступ к персональным данным: план содержит телефоны и документы водителей.';

export function createEmployeePlanningAccess({ React, jsx, request }) {
  const { useEffect, useId, useRef, useState } = React;
  const h = (type, props, ...children) => jsx?.jsxs
    ? jsx.jsxs(type, { ...props, ...(children.length ? { children: children.length === 1 ? children[0] : children } : {}) })
    : React.createElement(type, props, ...children);

  function errorText(error, fallback) {
    if (error?.status === 401) return 'Сессия завершилась. Войдите снова.';
    if (error?.status === 403) return 'Ваши права изменились или недостаточны. Обновите список сотрудников и проверьте доступ.';
    if (error?.status === 404) return 'Сотрудник или область работы больше недоступны. Обновите список сотрудников.';
    if (error?.status === 400) return 'Проверьте имя, роль, выбранные зоны и разрешения на персональные данные.';
    return fallback;
  }

  function Dialog({ title, busy, dirty, onClose, focusTarget, children }) {
    const dialog = useRef(null), titleRef = useRef(null), returnFocus = useRef(null);
    const titleId = useId();
    const [confirmClose, setConfirmClose] = useState(false);
    useEffect(() => {
      returnFocus.current = document.activeElement;
      const node = dialog.current;
      node.showModal();
      titleRef.current?.focus();
      return () => {
        if (node.open) node.close();
        const target = focusTarget?.() || (returnFocus.current?.isConnected ? returnFocus.current : document.getElementById('employee-list-title'));
        target?.focus({ preventScroll: true });
      };
    }, []);
    useEffect(() => {
      if (!dirty && !busy) return;
      const guard = event => { event.preventDefault(); event.returnValue = ''; };
      window.addEventListener('beforeunload', guard);
      return () => window.removeEventListener('beforeunload', guard);
    }, [dirty, busy]);
    function close() {
      if (busy) return;
      if (dirty) setConfirmClose(true);
      else onClose();
    }
    return h('dialog', { ref: dialog, className: 'employee-planning-dialog', 'aria-labelledby': titleId,
      onCancel: event => { event.preventDefault(); close(); } },
    h('div', { className: 'employee-planning-content' },
      h('div', { className: 'employee-planning-heading' },
        h('h2', { id: titleId, ref: titleRef, tabIndex: -1 }, title),
        h('button', { className: 'button secondary', type: 'button', disabled: busy, onClick: close, 'aria-label': 'Закрыть настройки планирования' }, 'Закрыть')),
      confirmClose && h('div', { className: 'employee-planning-warning', role: 'alert' },
        h('p', null, 'Есть несохранённые изменения. Закрыть окно и потерять их?'),
        h('div', { className: 'access-actions' },
          h('button', { type: 'button', className: 'button secondary', disabled: busy, onClick: () => setConfirmClose(false) }, 'Продолжить редактирование'),
          h('button', { type: 'button', className: 'button danger', disabled: busy, onClick: onClose }, 'Закрыть без сохранения'))),
      children));
  }

  function CreateForm({ options, token, onExpired, onCreated, onClose }) {
    const scopes = options.plannerScopes || [];
    const initialScope = scopes.length === 1 ? scopes[0] : null;
    const [displayName, setDisplayName] = useState(''), [role, setRole] = useState('dispatcher');
    const [scopeId, setScopeId] = useState(initialScope?.id || '');
    const [personalDataVisible, setPersonalDataVisible] = useState(initialScope?.personalDataVisible === true);
    const [busy, setBusy] = useState(false), [error, setError] = useState('');
    const pending = useRef(false), mounted = useRef(false), creation = useRef({ payload: '', key: '' });
    const selected = scopes.find(scope => scope.id === scopeId);
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
    async function submit(event) {
      event.preventDefault();
      if (pending.current || !displayName.trim() || !selected || !(options.plannerRoles || []).includes(role)) return;
      const input = { displayName: displayName.trim(), role, scopeId, personalDataVisible };
      const payload = JSON.stringify(input);
      if (creation.current.payload !== payload) creation.current = { payload, key: crypto.randomUUID() };
      pending.current = true; setBusy(true); setError('');
      try {
        const employee = await request('/access/employees/planner', {
          method: 'POST', body: JSON.stringify({ ...input, idempotencyKey: creation.current.key }),
        }, token);
        if (mounted.current) { onClose(); onCreated(employee); }
      } catch (reason) {
        if (reason?.status === 401) onExpired?.();
        if (mounted.current) setError(errorText(reason, reason?.status === 409
          ? 'Не удалось создать сотрудника с этими параметрами. Обновите список и повторите попытку.'
          : 'Не удалось создать сотрудника. Проверьте связь и повторите попытку.'));
      } finally {
        pending.current = false;
        if (mounted.current) setBusy(false);
      }
    }
    const dirty = Boolean(displayName || role !== 'dispatcher' || scopeId !== (initialScope?.id || '') || personalDataVisible !== (initialScope?.personalDataVisible === true));
    return h(Dialog, { title: 'Добавить диспетчера / менеджера', busy, dirty, onClose },
      h('form', { className: 'employee-planning-form', onSubmit: submit },
        h('p', { className: 'input-hint' }, scopeExplanation),
        h('div', { className: 'form-grid' },
          h('label', { className: 'field' }, h('span', null, 'Имя сотрудника'),
            h('input', { 'aria-label': 'Имя сотрудника', value: displayName, onChange: event => setDisplayName(event.target.value), required: true, maxLength: 160, disabled: busy, autoComplete: 'name' })),
          h('label', { className: 'field' }, h('span', null, 'Роль'),
            h('select', { 'aria-label': 'Роль', value: role, onChange: event => setRole(event.target.value), disabled: busy },
              ...(options.plannerRoles || []).map(value => h('option', { value, key: value }, ROLE_NAMES[value] || value))))),
        h('label', { className: 'field' }, h('span', null, 'Область работы'),
          h('select', { 'aria-label': 'Область работы', required: true, value: scopeId, disabled: busy, onChange: event => {
            const next = scopes.find(scope => scope.id === event.target.value);
            setScopeId(event.target.value); setPersonalDataVisible(next?.personalDataVisible === true);
          } }, h('option', { value: '', disabled: true }, 'Выберите область работы'),
          ...scopes.map(scope => h('option', { value: scope.id, key: scope.id }, scopeLabel(scope))))),
        h('label', { className: 'checkbox-label' },
          h('input', { type: 'checkbox', checked: personalDataVisible, disabled: busy || !selected?.personalDataVisible, onChange: event => setPersonalDataVisible(event.target.checked) }),
          h('span', null, 'Разрешить доступ к персональным данным')),
        h('p', { className: 'input-hint' }, personalDataExplanation),
        selected && h('p', { className: `employee-planning-readiness ${personalDataVisible ? 'is-ready' : ''}`, role: 'status' },
          personalDataVisible ? 'Планирование будет доступно в выбранной зоне.'
            : selected.personalDataVisible ? 'Планирование будет недоступно, пока разрешение не включено.'
              : 'В этой зоне вы не можете выдать доступ к персональным данным. Обратитесь к администратору с этим разрешением.'),
        h('p', { className: 'input-hint' }, 'После создания укажите телефон, чтобы выдать пароль для входа. Дополнительные зоны можно назначить в карточке сотрудника.'),
        error && h('p', { className: 'error', role: 'alert' }, error),
        h('button', { className: 'button primary', type: 'submit', disabled: busy || !displayName.trim() || !selected }, busy ? 'Создаём…' : 'Создать сотрудника')));
  }

  function PlannerCreation({ options, token, disabled, onExpired, onCreated, onOpen }) {
    const [open, setOpen] = useState(false);
    if (!options?.plannerCreationEnabled || !options.plannerScopes?.length) return null;
    return h(React.Fragment, null,
      h('button', { type: 'button', className: 'button primary', disabled, onClick: () => { onOpen?.(); setOpen(true); } }, 'Добавить диспетчера / менеджера'),
      open && h(CreateForm, { options, token, onExpired, onCreated, onClose: () => setOpen(false) }));
  }

  function AccessForm({ employee, token, onExpired, onSaved, onClose }) {
    const [editor, setEditor] = useState(null), [grants, setGrants] = useState([]);
    const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState('');
    const [blocked, setBlocked] = useState(false), [conflict, setConflict] = useState(false);
    const [removalConfirmed, setRemovalConfirmed] = useState(false), [revision, setRevision] = useState(0);
    const pending = useRef(false), mounted = useRef(false), saved = useRef(false);
    const draftPermissions = useRef(new Map()), requestToken = useRef(token);
    requestToken.current = token;
    const endpoint = `/access/employees/${encodeURIComponent(employee.id)}/planning-access`;
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
    useEffect(() => {
      const controller = new AbortController();
      setLoading(true); setEditor(null); setGrants([]); setError(''); setBlocked(false); setConflict(false); setRemovalConfirmed(false);
      request(endpoint, { signal: controller.signal }, requestToken.current).then(data => {
        if (!controller.signal.aborted) {
          draftPermissions.current = new Map(data.grants.map(grant => [grant.scopeId, grant.personalDataVisible]));
          setEditor(data); setGrants(data.grants);
        }
      }).catch(reason => {
        if (controller.signal.aborted) return;
        if (reason?.status === 401) onExpired?.();
        setError(errorText(reason, 'Не удалось загрузить настройки. Проверьте связь и повторите попытку.'));
      }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
      return () => controller.abort();
    }, [endpoint, revision]);
    const dirty = editor !== null && grantsKey(grants) !== grantsKey(editor.grants);
    const removed = editor?.grants.filter(original => !grants.some(grant => grant.scopeId === original.scopeId)) || [];
    const readyCount = grants.filter(grant => grant.personalDataVisible).length;
    function updateScope(scope, assigned) {
      setRemovalConfirmed(false);
      setGrants(current => {
        if (assigned) return [...current, { scopeId: scope.id, personalDataVisible: draftPermissions.current.get(scope.id) === true }];
        const previous = current.find(grant => grant.scopeId === scope.id);
        if (previous) draftPermissions.current.set(scope.id, previous.personalDataVisible);
        return current.filter(grant => grant.scopeId !== scope.id);
      });
    }
    async function save(event) {
      event.preventDefault();
      if (pending.current || !editor || !dirty || !grants.length || blocked || conflict || (removed.length && !removalConfirmed)) return;
      pending.current = true; setBusy(true); setError('');
      try {
        const updated = await request(endpoint, { method: 'PUT', body: JSON.stringify({ version: editor.version, grants }) }, token);
        if (mounted.current) { saved.current = true; setEditor(updated); setGrants(updated.grants); onClose(); onSaved?.(updated); }
      } catch (reason) {
        if (reason?.status === 401) onExpired?.();
        if (!mounted.current) return;
        if (reason?.status === 409) {
          setConflict(true);
          setError('Настройки уже изменил другой администратор. Загрузите актуальные права и повторите изменения.');
        } else {
          if ([403, 404].includes(reason?.status)) { setBlocked(true); setEditor(null); setGrants([]); }
          setError(reason?.status === 400 ? 'Выберите от 1 до 100 зон и проверьте разрешения на персональные данные.'
            : errorText(reason, 'Не удалось сохранить настройки. Проверьте связь и повторите попытку.'));
        }
      } finally {
        pending.current = false;
        if (mounted.current) setBusy(false);
      }
    }
    return h(Dialog, { title: 'Настроить планирование', busy, dirty, onClose,
      focusTarget: () => saved.current ? document.getElementById('employee-list-title') : null },
      h('form', { className: 'employee-planning-form', onSubmit: save },
        h('p', { className: 'employee-planning-identity' }, `${ROLE_NAMES[employee.role]} · ${employee.displayName} · ${employee.employeeNumber}`),
        h('p', { className: 'input-hint' }, scopeExplanation),
        h('p', { className: 'input-hint' }, personalDataExplanation),
        loading && h('p', { role: 'status' }, 'Загружаем зоны и разрешения…'),
        editor && h('fieldset', { disabled: busy || conflict || blocked, className: 'employee-planning-scopes' },
          h('legend', null, 'Зоны ответственности и доступ к персональным данным'),
          ...editor.scopes.map(scope => {
            const assigned = grants.find(grant => grant.scopeId === scope.id);
            return h('div', { key: scope.id, 'data-scope-id': scope.id, className: `employee-planning-scope${assigned ? ' is-assigned' : ''}` },
              h('label', { className: 'checkbox-label' },
                h('input', { type: 'checkbox', checked: Boolean(assigned), disabled: !assigned && grants.length >= 100,
                  'aria-label': `Назначить область: ${scopeLabel(scope)}`, onChange: event => updateScope(scope, event.target.checked) }),
                h('span', null, scopeLabel(scope))),
              assigned && h('div', { className: 'employee-planning-permission' },
                h('label', { className: 'checkbox-label' },
                  h('input', { type: 'checkbox', checked: assigned.personalDataVisible, disabled: !scope.personalDataVisible,
                    onChange: event => setGrants(current => current.map(grant => grant.scopeId === scope.id ? { ...grant, personalDataVisible: event.target.checked } : grant)) }),
                  h('span', null, 'Разрешить доступ к персональным данным')),
                h('p', { className: `employee-planning-readiness ${assigned.personalDataVisible ? 'is-ready' : ''}` },
                  assigned.personalDataVisible ? 'Планирование доступно в этой зоне.' : 'Планирование недоступно: нет доступа к персональным данным.'),
                !scope.personalDataVisible && h('p', { className: 'input-hint' }, 'Вы не можете выдавать разрешение на персональные данные в этой зоне. Нужен администратор с соответствующим доступом.')));
          })),
        editor && h('p', { className: 'employee-planning-readiness', role: 'status' }, grants.length
          ? `Назначено зон: ${grants.length}. С доступом к планированию: ${readyCount}.`
          : 'Выберите хотя бы одну зону ответственности.'),
        grants.length >= 100 && h('p', { className: 'input-hint' }, 'Достигнут предел: одному сотруднику можно назначить до 100 зон.'),
        removed.length > 0 && h('div', { className: 'employee-planning-warning' },
          h('strong', null, 'Будет снят весь доступ к выбранным областям'),
          h('p', null, 'Сотрудник потеряет в этих областях доступ к планированию и другим разделам, связанным с областью. Сохранённые планы останутся в системе.'),
          h('ul', null, ...removed.map(grant => h('li', { key: grant.scopeId }, scopeLabel(editor.scopes.find(scope => scope.id === grant.scopeId) || {}) || grant.scopeId))),
          h('label', { className: 'checkbox-label' }, h('input', { type: 'checkbox', checked: removalConfirmed, disabled: busy || conflict || blocked, onChange: event => setRemovalConfirmed(event.target.checked) }),
            h('span', null, 'Подтверждаю снятие всего доступа к перечисленным областям'))),
        error && h('p', { className: 'error', role: 'alert' }, error),
        conflict && h('p', { className: 'input-hint' }, 'При загрузке актуальных прав несохранённые изменения в этом окне будут сброшены.'),
        h('div', { className: 'access-actions' },
          editor && h('button', { type: 'submit', className: 'button primary', disabled: busy || loading || blocked || conflict || !dirty || !grants.length || (removed.length > 0 && !removalConfirmed) }, busy ? 'Сохраняем…' : 'Сохранить настройки'),
          !loading && (conflict || !editor) && h('button', { type: 'button', className: 'button secondary', disabled: busy, onClick: () => setRevision(value => value + 1) }, conflict ? 'Загрузить актуальные права' : 'Повторить загрузку'))));
  }

  function PlanningAccess({ employee, disabled, onOpen }) {
    if (!ROLE_NAMES[employee.role] || !employee.active || !employee.approved) return null;
    return h('button', { type: 'button', className: 'button secondary', disabled, onClick: () => onOpen(employee) }, 'Настроить планирование');
  }

  return { PlannerCreation, PlanningAccess, PlanningAccessEditor: AccessForm };
}
