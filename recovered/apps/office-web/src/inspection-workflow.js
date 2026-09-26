// Returned inspections keep their answers and references to already uploaded photos.
export function correctionDraft(state, previous, actorId, tripReference) {
  const returned = previous?.status === 'returned' ? previous : null;
  const template = returned?.template || state.template;
  const photos = (returned?.photos || []).filter(photo => !photo.deletedAt).map((photo, index) => ({
    localId: `remote:${photo.id}`, itemId: photo.itemId, remote: true,
    name: `${template.items.find(item => item.id === photo.itemId)?.label || 'Фото'} · ${index + 1}`,
    mimeType: photo.mimeType, uploaded: photo,
  }));
  return {
    id: `${actorId}:${state.tripId}`, actorId, tripId: state.tripId, tripReference,
    vehicleName: state.vehicle.name, businessDate: state.businessDate, version: 0,
    template, expectedRevision: previous?.revision || 0,
    occurredAt: returned?.occurredAt || new Date().toISOString(),
    comment: returned?.comment || '',
    answers: Object.fromEntries((returned?.answers || []).map(answer => [answer.itemId, { result: answer.result, comment: answer.comment }])),
    photos, correctionOf: returned?.id || null, correctionReason: returned?.review?.reason || '',
    removedPhotoCount: (returned?.photos || []).filter(photo => photo.deletedAt).length,
    submissionKey: null, acknowledgedId: null, updatedAt: new Date().toISOString(),
  };
}

export function isCurrentInspectionDraft(draft, state) {
  if (!draft || !state) return true;
  const latest = state.submissions.reduce((result, item) => !result || item.revision > result.revision ? item : result, null);
  return (!latest || latest.status === 'returned') && draft.expectedRevision === (latest?.revision || 0) &&
    (draft.template.id === state.template?.id || (latest?.status === 'returned' && draft.template.id === latest.template.id));
}

export function inspectionChanged() {
  window.dispatchEvent(new Event('ecl:inspection-changed'));
}

export function createInspectionWorkflow(React, { request, PhotoPreview }) {
  const h = React.createElement;
  function useInspectionAttention({ token, actor, onExpired }) {
    const [state, setState] = React.useState({ count: 0, items: [], error: '' });
    const [retry, setRetry] = React.useState(0);
    const identity = React.useRef(null);
    const expired = React.useRef(onExpired); expired.current = onExpired;
    React.useEffect(() => {
      const currentIdentity = `${token}:${actor.id}:${actor.role}`;
      if (identity.current !== currentIdentity) {
        identity.current = currentIdentity;
        setState({ count: 0, items: [], error: '' });
      }
      if (actor.role !== 'driver') return;
      const controller = new AbortController(); let pending = false;
      async function refresh() {
        if (pending || controller.signal.aborted) return;
        pending = true;
        try {
          const value = await request('/inspections/attention', { signal: controller.signal }, token);
          if (!controller.signal.aborted) setState({ ...value, error: '' });
        } catch (error) {
          if (controller.signal.aborted) return;
          if (error.status === 401) expired.current?.();
          setState(previous => ({ ...(error.status === 403 ? { count: 0, items: [] } : previous), error: 'Не удалось проверить осмотры на доработке.' }));
        } finally { pending = false; }
      }
      const visibleRefresh = () => { if (!document.hidden && navigator.onLine) refresh(); };
      refresh();
      const timer = setInterval(visibleRefresh, 15000);
      window.addEventListener('focus', visibleRefresh); window.addEventListener('online', visibleRefresh);
      window.addEventListener('ecl:inspection-changed', refresh); document.addEventListener('visibilitychange', visibleRefresh);
      return () => {
        controller.abort(); clearInterval(timer);
        window.removeEventListener('focus', visibleRefresh); window.removeEventListener('online', visibleRefresh);
        window.removeEventListener('ecl:inspection-changed', refresh); document.removeEventListener('visibilitychange', visibleRefresh);
      };
    }, [token, actor.id, actor.role, retry]);
    return { ...state, refresh: () => setRetry(value => value + 1) };
  }

  function InspectionAttention({ attention, onSelect, disabled }) {
    if (!attention || (!attention.count && !attention.error)) return null;
    return h('section', { className: 'surface ko-attention-list', 'aria-label': 'Осмотры на доработке' },
      h('h2', null, 'Требуют доработки', attention.count ? ` · ${attention.count}` : ''),
      attention.error && h('div', { className: 'error', role: 'alert' }, attention.error, ' ',
        h('button', { className: 'text-button', type: 'button', onClick: attention.refresh }, 'Повторить')),
      attention.items.map(item => h('article', { className: 'ko-attention-card', key: item.submissionId },
        h('div', null, h('strong', null, item.tripReference), h('p', null, item.reason || 'Механик вернул осмотр на доработку.')),
        h('button', { type: 'button', className: 'button primary', disabled, onClick: () => onSelect(item) }, 'Исправить КО'))));
  }

  function ManagedInspectionPhoto({ photo, alt, token, onExpired, onDeleted }) {
    const [removed, setRemoved] = React.useState(null), [busy, setBusy] = React.useState(false), [error, setError] = React.useState('');
    const key = React.useRef(null), mounted = React.useRef(true);
    React.useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
    const current = removed || photo;
    async function remove() {
      if (busy || !current.canDelete || !window.confirm('Удалить это фото из всех версий осмотра? Ответы и история проверки сохранятся. Восстановить фото будет нельзя.')) return;
      setBusy(true); setError(''); key.current ||= crypto.randomUUID();
      try {
        const value = await request(`/inspections/photos/${photo.id}/delete`, { method: 'POST', body: JSON.stringify({ idempotencyKey: key.current }) }, token);
        if (!mounted.current) return;
        setRemoved({ ...photo, ...value }); onDeleted?.();
      } catch (failure) {
        if (!mounted.current) return;
        if (failure.status === 401) onExpired?.();
        else setError(failure.message || 'Не удалось удалить фото. Повторите попытку.');
      } finally { if (mounted.current) setBusy(false); }
    }
    const date = value => new Date(value).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    return h('div', { className: 'ko-photo-item' },
      current.deletedAt ? h('div', { className: 'ko-photo-deleted', role: 'status' },
        h('strong', null, current.deletionReason === 'retention' ? 'Фото удалено автоматически' : 'Фото удалено'),
        h('span', null, date(current.deletedAt)),
        current.deletionReason === 'retention' && h('span', null, 'Истёк срок хранения: 3 месяца с загрузки.')) :
        h(PhotoPreview, { key: current.sha256 || current.compressedAt || photo.id, token, path: `/inspections/photos/${photo.id}/download`, alt, onExpired }),
      !current.deletedAt && current.compressedAt && h('small', { className: 'input-hint ko-photo-compressed' }, 'Сжато после принятия осмотра'),
      !current.deletedAt && current.autoDeleteAt && h('small', { className: 'input-hint ko-photo-retention' }, `Автоудаление: ${date(current.autoDeleteAt)} МСК`),
      !current.deletedAt && (current.canDelete || current.deleteAvailableAt) && h('button', { type: 'button', className: 'text-button ko-photo-delete', 'aria-label': `Удалить фото: ${alt}`, disabled: busy || !current.canDelete, onClick: remove }, busy ? 'Удаляем…' : 'Удалить фото'),
      !current.deletedAt && !current.canDelete && current.deleteAvailableAt && h('small', { className: 'input-hint' }, `Удаление доступно с ${date(current.deleteAvailableAt)} МСК`),
      error && h('p', { className: 'error', role: 'alert' }, error));
  }
  return { useInspectionAttention, InspectionAttention, ManagedInspectionPhoto };
}
