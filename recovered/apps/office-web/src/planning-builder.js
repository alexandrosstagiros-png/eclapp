import { FIELD_SOURCES } from './planning-fields.js';

const MAX_SECTIONS = 6;
const MAX_COLUMNS = 50;
const TYPES = [['text', 'Текст'], ['number', 'Число'], ['date', 'Дата'], ['time', 'Время']];
const OWNERS = [['assignment', 'Рейс'], ['driver', 'Водитель'], ['vehicle', 'Машина']];
const sourceFor = (value) => FIELD_SOURCES.find((source) => source.value === value);
const uniqueId = () => crypto.randomUUID();
const newColumn = (index = 1) => ({ key: `c_${uniqueId()}`, label: `Поле ${index}`, type: 'text', source: 'manual', owner: 'assignment', required: false, defaultValue: '', hint: '' });
const columnCount = (definition) => definition.sections.reduce((count, section) => count + section.columns.length, 0);
const fingerprint = (draft) => JSON.stringify(draft);

function normalizeColumn(column, copy) {
  return {
    key: copy ? `c_${uniqueId()}` : column.key,
    label: column.label || '', type: column.type || 'text', source: column.source || 'manual',
    owner: column.owner || sourceFor(column.source)?.owner || 'assignment', required: Boolean(column.required),
    defaultValue: String(column.defaultValue ?? ''), hint: column.hint || '',
  };
}

function draftFrom(template, mode = 'copy') {
  const definition = template?.definition || template;
  if (!definition) return {
    id: uniqueId(), version: 0, makeDefault: true,
    definition: { label: 'Новая форма', kind: 'table', sections: [{ id: `s_${uniqueId()}`, label: 'Основная форма', columns: [newColumn()] }] },
  };
  const copy = mode !== 'edit' || !template.custom;
  return {
    id: copy ? uniqueId() : template.id,
    version: copy ? 0 : template.version,
    makeDefault: copy ? true : Boolean(template.isDefault),
    definition: {
      label: copy ? `Копия · ${definition.label}`.slice(0, 120) : definition.label,
      kind: definition.kind || 'table',
      sections: definition.sections.map((section) => ({
        id: copy ? `s_${uniqueId()}` : section.id, label: section.label || 'Основная форма',
        columns: section.columns.map((column) => normalizeColumn(
          copy && template.id === 'logika_moloka' && column.source === 'delivery_date' ? { ...column, source: 'planning_date' } : column,
          copy,
        )),
      })),
    },
  };
}

function validDefault(column) {
  const value = column.defaultValue.trim();
  if (!value) return true;
  if (column.type === 'time') return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
  if (column.type === 'date') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }
  if (column.type === 'number') return /^[-+]?(?:\d+\.?\d*|\.\d+)$/.test(value) && Number.isFinite(Number(value));
  return true;
}

function validate(definition) {
  if (!definition.label.trim()) return 'Укажите название формы.';
  if (definition.label.length > 120) return 'Название формы должно быть не длиннее 120 символов.';
  if (!definition.sections.length || definition.sections.length > MAX_SECTIONS) return 'В форме должно быть от 1 до 6 разделов.';
  if (columnCount(definition) > MAX_COLUMNS) return 'В одной форме можно сохранить до 50 полей.';
  const keys = new Set();
  const sectionIds = new Set();
  for (const [sectionIndex, section] of definition.sections.entries()) {
    if (!section.label.trim()) return `Укажите название раздела ${sectionIndex + 1}.`;
    if (section.label.length > 120) return `Сократите название раздела ${sectionIndex + 1} до 120 символов.`;
    if (sectionIds.has(section.id)) return 'У разделов совпадают внутренние ключи. Создайте копию формы.';
    sectionIds.add(section.id);
    if (!section.columns.length) return `Добавьте поле в раздел «${section.label}».`;
    for (const [columnIndex, column] of section.columns.entries()) {
      if (!column.label.trim()) return `Укажите название поля ${columnIndex + 1} в разделе «${section.label}».`;
      if (column.label.length > 120) return `Сократите название поля ${columnIndex + 1} в разделе «${section.label}» до 120 символов.`;
      if (column.hint.length > 200) return `Сократите подсказку для поля «${column.label}» до 200 символов.`;
      if (column.defaultValue.length > 2000) return `Сократите значение по умолчанию для поля «${column.label}» до 2000 символов.`;
      if (keys.has(column.key)) return 'У полей совпадают внутренние ключи. Создайте копию формы.';
      keys.add(column.key);
      if (!sourceFor(column.source)) return `Выберите источник для поля «${column.label}».`;
      if (!validDefault(column)) return `Проверьте значение по умолчанию для поля «${column.label}». ${column.type === 'date' ? 'Формат даты: ГГГГ-ММ-ДД.' : column.type === 'time' ? 'Формат времени: ЧЧ:ММ.' : 'Введите число; дробную часть отделите точкой.'}`;
    }
  }
  return '';
}

export function createPlanningBuilder(React) {
  const { createElement: h, useState, useEffect, useRef } = React;
  const button = (label, onClick, props = {}) => h('button', { type: 'button', className: 'button', onClick, ...props }, label);
  const field = (label, input, hint) => h('label', { className: 'planning-field' }, h('span', null, label), React.cloneElement(input, { 'aria-label': input.props['aria-label'] || label }), hint && h('small', null, hint));

  return function PlanningBuilder({ templates = [], selectedTemplate, scopeLabel = '', onSave, onClose, onDirtyChange, busy = false, error = null }) {
    const [draft, setDraft] = useState(() => draftFrom(selectedTemplate, selectedTemplate?.custom ? 'edit' : 'copy'));
    const [baseline, setBaseline] = useState(() => fingerprint(draft));
    const [sourceId, setSourceId] = useState(selectedTemplate?.id || templates[0]?.id || '');
    const [validation, setValidation] = useState('');
    const [localError, setLocalError] = useState('');
    const [notice, setNotice] = useState('');
    const [saving, setSaving] = useState(false);
    const callbacks = useRef({ onSave, onClose, onDirtyChange });
    callbacks.current = { onSave, onClose, onDirtyChange };
    const mounted = useRef(true);
    const savingRef = useRef(false);
    const errorRef = useRef(null);
    const dirty = fingerprint(draft) !== baseline;
    const dirtyRef = useRef(dirty);
    dirtyRef.current = dirty;
    const disabled = busy || saving;
    const definition = draft.definition;
    const count = columnCount(definition);
    const selectedSource = templates.find((template) => template.id === sourceId);
    const externalError = typeof error === 'string' ? error : error?.text || error?.message || '';

    useEffect(() => {
      mounted.current = true;
      const protect = (event) => {
        if (dirtyRef.current) { event.preventDefault(); event.returnValue = ''; }
      };
      window.addEventListener('beforeunload', protect);
      return () => {
        mounted.current = false;
        window.removeEventListener('beforeunload', protect);
        callbacks.current.onDirtyChange?.(false);
      };
    }, []);
    useEffect(() => { callbacks.current.onDirtyChange?.(dirty); }, [dirty]);
    useEffect(() => {
      if (!validation && !localError && !externalError) return;
      errorRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      errorRef.current?.focus({ preventScroll: true });
    }, [validation, localError, externalError]);

    function confirmDiscard() {
      return !dirtyRef.current || window.confirm('В форме есть несохранённые изменения. Продолжить и отказаться от них?');
    }
    function replaceDraft(template, mode) {
      if (disabled || !confirmDiscard()) return;
      const next = draftFrom(template, mode);
      setDraft(next);
      setBaseline(fingerprint(next));
      setValidation(''); setLocalError(''); setNotice('');
    }
    function changeDefinition(changes) {
      setDraft((previous) => ({ ...previous, definition: { ...previous.definition, ...changes } }));
      setValidation(''); setLocalError(''); setNotice('');
    }
    function changeSection(sectionId, changes) {
      changeDefinition({ sections: definition.sections.map((section) => section.id === sectionId ? { ...section, ...changes } : section) });
    }
    function changeColumn(sectionId, key, changes) {
      const section = definition.sections.find((item) => item.id === sectionId);
      changeSection(sectionId, { columns: section.columns.map((column) => column.key === key ? { ...column, ...changes } : column) });
    }
    function reorderSection(index, direction) {
      const sections = [...definition.sections];
      [sections[index], sections[index + direction]] = [sections[index + direction], sections[index]];
      changeDefinition({ sections });
    }
    function reorderColumn(section, index, direction) {
      const columns = [...section.columns];
      [columns[index], columns[index + direction]] = [columns[index + direction], columns[index]];
      changeSection(section.id, { columns });
    }
    function removeSection(section) {
      if (!window.confirm(`Удалить раздел «${section.label}» и его поля из этой версии формы?`)) return;
      changeDefinition({ sections: definition.sections.filter((item) => item.id !== section.id) });
    }
    function removeColumn(section, column) {
      if (!window.confirm(`Удалить поле «${column.label}» из этой версии формы?`)) return;
      changeSection(section.id, { columns: section.columns.filter((item) => item.key !== column.key) });
    }
    async function save(event) {
      event?.preventDefault();
      if (disabled || savingRef.current) return;
      const problem = validate(definition);
      if (problem) { setValidation(problem); return; }
      const submitted = {
        ...draft,
        definition: { ...definition, label: definition.label.trim(), sections: definition.sections.map((section) => ({
          ...section, label: section.label.trim(), columns: section.columns.map((column) => ({ ...column, label: column.label.trim() })),
        })) },
      };
      savingRef.current = true; setSaving(true); setValidation(''); setLocalError(''); setNotice('');
      try {
        const result = await callbacks.current.onSave(submitted);
        if (!mounted.current || !result) return;
        const next = { ...draftFrom({ ...result, custom: true }, 'edit'), makeDefault: submitted.makeDefault };
        setDraft(next); setBaseline(fingerprint(next)); setSourceId(next.id);
        dirtyRef.current = false;
        callbacks.current.onDirtyChange?.(false);
        setNotice(`Форма сохранена. Версия ${next.version}.`);
      } catch (reason) {
        if (!mounted.current) return;
        setLocalError(reason?.status === 409
          ? 'Эту форму уже изменил другой менеджер. Ваши изменения остались на экране. Сохраните их как копию или откройте актуальную версию после обновления списка форм.'
          : reason?.status === 403 ? 'Доступ к изменению форм недоступен. Проверьте доступ к проекту.'
            : 'Не удалось сохранить форму. Ваши изменения остались на экране. Проверьте соединение и повторите попытку.');
      } finally {
        savingRef.current = false;
        if (mounted.current) setSaving(false);
      }
    }
    function copyCurrentDraft() {
      const next = { ...draftFrom({ ...definition, id: draft.id, version: draft.version, custom: true }, 'copy'), makeDefault: draft.makeDefault };
      setDraft(next); setBaseline(''); setValidation(''); setLocalError(''); setNotice('Изменения перенесены в новую форму. Укажите название и сохраните её.');
    }

    function renderColumn(section, column, index) {
      const source = sourceFor(column.source);
      const defaultHint = column.type === 'date' ? 'Дата в формате ГГГГ-ММ-ДД.' : column.type === 'time' ? 'Время в формате ЧЧ:ММ.' : column.type === 'number' ? 'Для дробного числа используйте точку.' : 'Подставляется, когда для поля нет значения.';
      return h('article', { className: 'planning-builder-column', key: column.key, 'data-column-key': column.key },
        h('div', { className: 'planning-builder-column-heading' },
          h('span', { className: 'planning-builder-order', 'aria-label': `Порядок поля: ${index + 1}` }, String(index + 1).padStart(2, '0')),
          h('strong', null, column.label || 'Поле без названия'),
          h('div', { className: 'planning-builder-order-actions' },
            button('↑', () => reorderColumn(section, index, -1), { disabled: disabled || index === 0, 'aria-label': `Переместить поле ${index + 1} вверх в разделе ${section.label}`, title: 'Выше' }),
            button('↓', () => reorderColumn(section, index, 1), { disabled: disabled || index === section.columns.length - 1, 'aria-label': `Переместить поле ${index + 1} вниз в разделе ${section.label}`, title: 'Ниже' }),
            button('Удалить', () => removeColumn(section, column), { className: 'planning-link planning-builder-remove', disabled: disabled || section.columns.length === 1, 'aria-label': `Удалить поле ${column.label}`, title: section.columns.length === 1 ? 'В разделе должно остаться хотя бы одно поле' : undefined }))),
        h('div', { className: 'planning-builder-column-grid' },
          field('Название колонки', h('input', { value: column.label, maxLength: 120, onChange: (event) => changeColumn(section.id, column.key, { label: event.target.value }), disabled, 'aria-label': `Название поля ${index + 1} в разделе ${section.label}` })),
          field('Источник значения', h('select', { value: column.source, onChange: (event) => { const nextSource = sourceFor(event.target.value); changeColumn(section.id, column.key, { source: event.target.value, owner: nextSource?.owner || 'assignment', type: nextSource?.type || column.type }); }, disabled, 'aria-label': `Источник поля ${index + 1} в разделе ${section.label}` },
            !source && h('option', { value: column.source }, column.source),
            ...OWNERS.map(([owner, label]) => h('optgroup', { key: owner, label }, ...FIELD_SOURCES.filter((item) => item.owner === owner).map((item) => h('option', { key: item.value, value: item.value }, item.label)))))),
          field('Тип значения', h('select', { value: column.type, onChange: (event) => changeColumn(section.id, column.key, { type: event.target.value }), disabled, 'aria-label': `Тип поля ${index + 1} в разделе ${section.label}` }, ...TYPES.map(([value, label]) => h('option', { key: value, value }, label))))),
        h('div', { className: 'planning-builder-column-footer' },
          h('label', { className: 'planning-builder-check' }, h('input', { type: 'checkbox', checked: column.required, disabled, onChange: (event) => changeColumn(section.id, column.key, { required: event.target.checked }), 'aria-label': `Обязательное поле ${column.label}` }), h('span', null, 'Обязательно для выгрузки')),
          h('span', { className: 'planning-builder-owner-label' }, `Данные: ${OWNERS.find(([owner]) => owner === column.owner)?.[1].toLocaleLowerCase('ru') || 'рейс'}`)),
        h('details', { className: 'planning-builder-column-details' },
          h('summary', null, 'Дополнительные настройки'),
          h('div', { className: 'planning-builder-advanced-grid' },
            field('Поле относится к', h('select', { value: column.owner, disabled: disabled || column.source !== 'manual', onChange: (event) => changeColumn(section.id, column.key, { owner: event.target.value }), 'aria-label': `Принадлежность поля ${column.label}` }, ...OWNERS.map(([value, label]) => h('option', { key: value, value }, label))), column.source === 'manual' ? 'Ручные сведения о водителе или машине очищаются при их замене в назначении.' : 'Определяется выбранным источником.'),
            field('Значение по умолчанию', h('input', { value: column.defaultValue, type: column.type === 'date' ? 'date' : column.type === 'time' ? 'time' : 'text', inputMode: column.type === 'number' ? 'decimal' : undefined, maxLength: 2000, disabled, onChange: (event) => changeColumn(section.id, column.key, { defaultValue: event.target.value }), 'aria-label': `Значение по умолчанию для ${column.label}` }), defaultHint),
            field('Подсказка менеджеру', h('input', { value: column.hint, maxLength: 200, disabled, onChange: (event) => changeColumn(section.id, column.key, { hint: event.target.value }), 'aria-label': `Подсказка для ${column.label}`, placeholder: 'Например: номер без пробелов' }), 'Показывается при заполнении; в выгрузку не попадает.'))));
    }

    return h('section', { className: 'planning-builder', 'aria-labelledby': 'planning-builder-title' },
      h('header', { className: 'planning-builder-heading' },
        h('div', null, h('span', { className: 'planning-eyebrow' }, 'ФОРМЫ КЛИЕНТОВ'), h('h2', { id: 'planning-builder-title', tabIndex: -1 }, 'Конструктор форм'), h('p', null, 'Настройте состав, порядок и заполнение полей под требования клиента.')),
        button('Закрыть конструктор', () => { if (!disabled && confirmDiscard()) callbacks.current.onClose?.(); }, { disabled })),
      h('div', { className: 'planning-builder-toolbar surface' },
        field('Исходная форма', h('select', { value: sourceId, disabled, onChange: (event) => setSourceId(event.target.value) }, !templates.some((item) => item.id === sourceId) && h('option', { value: sourceId }, definition.label), ...templates.map((template) => h('option', { key: template.id, value: template.id }, `${template.label}${template.custom ? ` · версия ${template.version}` : ' · встроенная'}`)))),
        h('div', { className: 'planning-builder-mode-actions' },
          button('Новая форма', () => replaceDraft(null, 'new'), { disabled }),
          button('Копировать форму', () => replaceDraft(selectedSource, 'copy'), { disabled: disabled || !selectedSource }),
          selectedSource?.custom && button('Редактировать форму', () => replaceDraft(selectedSource, 'edit'), { disabled }))),
      h('form', { onSubmit: save, noValidate: true },
        h('div', { className: 'planning-builder-settings surface' },
          h('div', { className: 'planning-builder-title-row' }, h('h3', null, draft.version ? 'Редактирование формы' : 'Новая форма клиента'), h('span', { className: 'planning-draft-badge' }, draft.version ? `Основа: версия ${draft.version}` : 'Ещё не сохранена')),
          h('div', { className: 'planning-builder-settings-grid' },
            field('Название формы', h('input', { value: definition.label, maxLength: 120, disabled, onChange: (event) => changeDefinition({ label: event.target.value }), placeholder: 'Клиент · регион' })),
            field('Формат выдачи', h('select', { value: definition.kind, disabled, onChange: (event) => changeDefinition({ kind: event.target.value }) }, h('option', { value: 'table' }, 'Таблица · Excel / CSV'), h('option', { value: 'text' }, 'Текстовая заявка · TXT')))),
          h('label', { className: 'planning-builder-check' }, h('input', { type: 'checkbox', checked: draft.makeDefault, disabled, onChange: (event) => { setDraft((previous) => ({ ...previous, makeDefault: event.target.checked })); setNotice(''); } }), h('span', null, 'Использовать эту форму для новых планов', scopeLabel && h('small', null, scopeLabel))),
          h('p', { className: 'planning-help' }, 'Сохранение создаёт новую версию. В ранее сохранённых планах останется прежняя форма; обновить её можно отдельно в нужном плане.')),
        (validation || localError || externalError) && h('div', { className: 'planning-error', role: 'alert', ref: errorRef, tabIndex: -1 }, validation || localError || externalError, (localError || externalError) && draft.version > 0 && h('div', null, button('Сохранить изменения как копию', copyCurrentDraft, { disabled }))),
        notice && h('div', { className: 'planning-feedback', role: 'status' }, notice),
        h('div', { className: 'planning-builder-structure-heading' }, h('h3', null, 'Поля и разделы'), h('span', null, `${count} / ${MAX_COLUMNS} полей · ${definition.sections.length} / ${MAX_SECTIONS} разделов`)),
        h('div', { className: 'planning-builder-sections' }, ...definition.sections.map((section, index) => h('section', { key: section.id, className: 'planning-builder-section surface', 'data-section-id': section.id },
          h('div', { className: 'planning-builder-section-heading' },
            field(`Название раздела ${index + 1}`, h('input', { value: section.label, maxLength: 120, disabled, onChange: (event) => changeSection(section.id, { label: event.target.value }) })),
            h('div', { className: 'planning-builder-order-actions' },
              button('↑', () => reorderSection(index, -1), { disabled: disabled || index === 0, 'aria-label': `Переместить раздел ${index + 1} вверх`, title: 'Выше' }),
              button('↓', () => reorderSection(index, 1), { disabled: disabled || index === definition.sections.length - 1, 'aria-label': `Переместить раздел ${index + 1} вниз`, title: 'Ниже' }),
              button('Удалить раздел', () => removeSection(section), { className: 'planning-link planning-builder-remove', disabled: disabled || definition.sections.length === 1, 'aria-label': `Удалить раздел ${section.label}` }))),
          ...section.columns.map((column, columnIndex) => renderColumn(section, column, columnIndex)),
          button('+ Добавить поле', () => changeSection(section.id, { columns: [...section.columns, newColumn(count + 1)] }), { className: 'button planning-builder-add', disabled: disabled || count >= MAX_COLUMNS, 'aria-label': `Добавить поле в раздел ${section.label}` })))),
        button('+ Добавить раздел', () => changeDefinition({ sections: [...definition.sections, { id: `s_${uniqueId()}`, label: `Раздел ${definition.sections.length + 1}`, columns: [newColumn(count + 1)] }] }), { className: 'button planning-builder-add-section', disabled: disabled || definition.sections.length >= MAX_SECTIONS || count >= MAX_COLUMNS }),
        h('section', { className: 'planning-builder-preview surface', 'aria-label': 'Предпросмотр формы' },
          h('div', { className: 'planning-builder-preview-heading' }, h('h3', null, 'Как будет выглядеть форма'), h('p', null, definition.kind === 'table' ? 'Колонки идут в указанном порядке. Каждый раздел выгружается отдельной таблицей.' : 'Для каждого рейса формируется блок с подписями полей.')),
          ...definition.sections.map((section) => h('div', { key: section.id, className: 'planning-builder-preview-section' }, h('h4', null, section.label || 'Раздел без названия'),
            definition.kind === 'table'
              ? h('div', { className: 'planning-table-scroll', tabIndex: 0, role: 'region', 'aria-label': `Предпросмотр раздела ${section.label}` }, h('table', { className: 'planning-client-table' }, h('thead', null, h('tr', null, ...section.columns.map((column) => h('th', { key: column.key, scope: 'col' }, column.label || 'Без названия', column.required && h('span', { className: 'planning-builder-required', 'aria-label': 'Обязательное поле' }, ' *'))))), h('tbody', null, h('tr', null, ...section.columns.map((column) => h('td', { key: column.key }, column.defaultValue || h('span', { className: 'planning-builder-placeholder' }, sourceFor(column.source)?.label || 'Значение поля')))))))
              : h('div', { className: 'planning-builder-text-preview' }, ...section.columns.map((column) => h('p', { key: column.key }, h('strong', null, `${column.label || 'Без названия'}${column.required ? ' *' : ''}: `), column.defaultValue || h('span', { className: 'planning-builder-placeholder' }, `[${sourceFor(column.source)?.label || 'Значение поля'}]`))))))),
        h('footer', { className: 'planning-builder-savebar' },
          h('div', null, h('strong', null, dirty ? 'Есть несохранённые изменения' : draft.version ? 'Форма сохранена' : 'Сохраните новую форму'), h('span', null, draft.version ? `Следующее сохранение создаст версию ${draft.version + 1}.` : 'После сохранения форма появится в списке планирования.')),
          h('button', { type: 'submit', className: 'button primary', disabled: disabled || !dirty && draft.version > 0 }, saving || busy ? 'Сохраняем…' : 'Сохранить форму'))));
  };
}
