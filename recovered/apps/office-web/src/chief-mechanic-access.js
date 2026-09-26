// The server supplies editable scope metadata and revalidates every save.
export function createChiefMechanicAccess({ React, jsx, request }) {
  const { useEffect, useRef, useState } = React;
  const h = (type, props, ...children) => jsx?.jsxs
    ? jsx.jsxs(type, { ...props, ...(children.length ? { children: children.length === 1 ? children[0] : children } : {}) })
    : React.createElement(type, props, ...children);
  const scopeLabel = scope => [scope.region?.name, scope.project?.name, scope.responsibilityScope?.name].filter(Boolean).join(' · ');
  return function ChiefMechanicAccess({ employee, token, onUpdated, onExpired }) {
    const scopes = (employee.scopes || []).filter(scope => scope.canManageInspectionPhotoDelete === true);
    const [scopeId, setScopeId] = useState(scopes[0]?.id || '');
    const selected = scopes.find(scope => scope.id === scopeId) || scopes[0];
    const [enabled, setEnabled] = useState(selected?.inspectionPhotoDelete === true);
    const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
    const mounted = useRef(false), pending = useRef(false);
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
    useEffect(() => {
      setScopeId(selected?.id || '');
      setEnabled(selected?.inspectionPhotoDelete === true);
      setError('');
    }, [employee.id, selected?.id, selected?.inspectionPhotoDelete]);
    if (employee.role !== 'mechanic' || !scopes.length) return null;
    async function save(event) {
      event.preventDefault();
      if (pending.current || !selected || enabled === (selected.inspectionPhotoDelete === true)) return;
      pending.current = true; setBusy(true); setError(''); setNotice('');
      try {
        const updated = await request(`/access/employees/${encodeURIComponent(employee.id)}/inspection-photo-permission`, {
          method: 'PATCH', body: JSON.stringify({ scopeId: selected.id, enabled }),
        }, token);
        if (mounted.current) {
          onUpdated?.(updated);
          setNotice(enabled ? 'Право главного механика сохранено.' : 'Право главного механика снято.');
        }
      } catch (reason) {
        if (reason?.status === 401) onExpired?.();
        if (mounted.current) setError(reason?.message || 'Не удалось сохранить право. Повторите попытку.');
      } finally {
        pending.current = false;
        if (mounted.current) setBusy(false);
      }
    }
    return h('form', { className: 'employee-access-form', 'aria-label': `Право главного механика: ${employee.displayName}`, onSubmit: save },
      h('h4', null, 'Главный механик'),
      h('label', { className: 'field' }, h('span', null, 'Область права главного механика'),
        h('select', { value: selected?.id || '', disabled: busy, onChange: event => {
          const next = scopes.find(scope => scope.id === event.target.value);
          setScopeId(next.id); setEnabled(next.inspectionPhotoDelete === true); setError(''); setNotice('');
        } }, ...scopes.map(scope => h('option', { key: scope.id, value: scope.id }, scopeLabel(scope))))),
      h('label', { className: 'checkbox-label' }, h('input', { type: 'checkbox', checked: enabled, disabled: busy,
        onChange: event => { setEnabled(event.target.checked); setNotice(''); } }),
      h('span', null, 'Главный механик: удаление фото КО через месяц')),
      h('p', { className: 'input-hint' }, 'Разрешает удалять фотографии контрольных осмотров в выбранной области через один календарный месяц после загрузки.'),
      selected?.personalDataVisible === false && h('p', { className: 'input-hint' },
        'У сотрудника нет доступа к фотографиям осмотров в этой области. Назначение главным механиком не меняет доступ к персональным данным.'),
      error && h('p', { className: 'error', role: 'alert' }, error),
      notice && h('p', { className: 'input-hint', role: 'status' }, notice),
      h('button', { type: 'submit', className: 'button', disabled: busy || enabled === (selected?.inspectionPhotoDelete === true) },
        busy ? 'Сохраняем право…' : 'Сохранить право главного механика'));
  };
}
