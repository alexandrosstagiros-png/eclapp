const MAIN_TABS = [
  ['reports', 'Отчёты'],
  ['calendar', 'Платёжный календарь'],
  ['operations', 'Операции'],
  ['settlements', 'Взаиморасчёты'],
];
const KIND_LABELS = {
  sale: 'Выручка по выполненной работе',
  expense: 'Расход по полученной услуге',
  payment_in: 'Оплата от покупателя',
  payment_out: 'Оплата поставщику',
  customer_advance: 'Аванс покупателя',
  supplier_advance: 'Аванс поставщику',
  cash_in: 'Неразобранное поступление',
  cash_out: 'Неразобранная выплата',
  asset_purchase: 'Приобретение основного средства',
  inventory_purchase: 'Приобретение запасов',
  inventory_consumption: 'Расход запасов',
  capital_in: 'Вклад собственника',
  owner_distribution: 'Выплата собственнику',
  loan_issued: 'Выдача займа',
  loan_returned: 'Возврат выданного займа',
  loan_received: 'Получение займа',
  loan_repayment: 'Возврат займа',
  interest: 'Начисление процентов',
  depreciation: 'Амортизация',
  transfer: 'Перевод между счетами',
  opening: 'Начальные остатки',
  fuel_sale: 'Продажа топлива',
  fuel_own_consumption: 'Топливо для своего парка',
  settlement: 'Погашение документа',
  setoff: 'Взаимозачёт',
  reversal: 'Отмена операции',
  plan: 'План платежа',
};
const STATUS_LABELS = {
  posted: 'Проведено',
  preliminary: 'Предварительно',
  provisional: 'Предварительно',
  confirmed: 'Подтверждено',
  draft: 'Черновик',
  disputed: 'Есть расхождения',
  partially_confirmed: 'Частично подтверждено',
  needs_review: 'Повторная проверка',
  reversed: 'Отменено',
  void: 'Отменено',
  open: 'Открыто',
  partial: 'Частично оплачено',
  paid: 'Оплачено',
  planned: 'План',
  approved: 'Согласовано',
  review: 'Проверить',
  error: 'Ошибка',
  overdue: 'Просрочено',
};
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const initialFilters = () => ({
  from: `${today().slice(0, 7)}-01`,
  to: today(),
  legalEntityId: '',
  directionId: '',
  counterpartyId: '',
});
const money = (value) =>
  value == null || !Number.isFinite(Number(value))
    ? 'Нет данных'
    : new Intl.NumberFormat('ru-RU', {
        style: 'currency',
        currency: 'RUB',
        maximumFractionDigits: 2,
      }).format(Number(value) / 100);
const dateLabel = (value) =>
  value
    ? new Date(`${String(value).slice(0, 10)}T12:00:00`).toLocaleDateString(
        'ru-RU',
      )
    : 'Дата не назначена';
const dateInput = (value) => (value ? String(value).slice(0, 10) : '');
const itemName = (item) =>
  item?.name ||
  item?.title ||
  item?.label ||
  item?.code ||
  item?.id ||
  'Не определено';
const list = (value) => (Array.isArray(value) ? value : []);
const errorMessage = (error) => {
  const raw = String(error?.message || 'Не удалось выполнить действие.');
  const messages = {
    FINANCE_DEPENDENT_OPERATIONS:
      'Документ связан с оплатой или зачётом. Сначала отмените зависимое погашение. Плановую дату можно изменить в календаре без отмены документа.',
    SCOPE_AMBIGUOUS:
      'Выберите проект операции или счёт, чтобы определить место учёта.',
    FINANCE_VERSION_CONFLICT:
      'Запись уже изменена. Обновите данные и повторите действие.',
    FINANCE_PERIOD_CLOSED:
      'Период закрыт. Для изменения нужно переоткрыть его с указанием причины.',
  };
  return (
    Object.entries(messages).find(
      ([code]) => raw.includes(code) || error?.code === code,
    )?.[1] || raw
  );
};
const kopecks = (value) => {
  const normalized = String(value ?? '')
    .trim()
    .replace(',', '.');
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized))
    throw new Error(
      'Введите сумму в рублях, не более двух знаков после запятой.',
    );
  const [rubles, fraction = ''] = normalized.split('.');
  const amount = Number(rubles) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(amount) || amount <= 0)
    throw new Error('Сумма должна быть больше нуля.');
  return amount;
};

export function createFinanceLedgerWorkspace(
  React,
  { request, LegacyFinance },
) {
  const h = React.createElement;
  const { useState, useEffect, useRef } = React;
  const button = (label, onClick, props = {}) =>
    h(
      'button',
      { type: 'button', className: 'button secondary', onClick, ...props },
      label,
    );
  const field = (label, child, hint) =>
    h(
      'label',
      { className: 'fl-field' },
      h('span', null, label),
      child,
      hint && h('small', null, hint),
    );
  const text = (label, value, onChange, props = {}) =>
    field(
      label,
      h('input', {
        'aria-label': label,
        value: value ?? '',
        onChange: (event) => onChange(event.target.value),
        ...props,
      }),
    );
  const select = (
    label,
    value,
    onChange,
    items,
    empty = 'Не выбрано',
    props = {},
  ) =>
    field(
      label,
      h(
        'select',
        {
          'aria-label': label,
          value: value || '',
          onChange: (event) => onChange(event.target.value),
          ...props,
        },
        empty !== null && h('option', { value: '' }, empty),
        ...items.map((item) =>
          h('option', { key: item.id, value: item.id }, itemName(item)),
        ),
      ),
    );
  const empty = (message) => h('p', { className: 'fl-empty' }, message);
  const metric = (label, value, props = {}) =>
    h(
      'div',
      { className: 'fl-metric', ...props },
      h('span', null, label),
      h('strong', null, money(value)),
    );
  const badge = (status) =>
    h(
      'span',
      { className: `fl-badge fl-badge-${status}` },
      STATUS_LABELS[status] || status || 'Без статуса',
    );
  const table = (label, headers, rows) =>
    h(
      'div',
      { className: 'fl-table-scroll' },
      h(
        'table',
        { className: 'fl-table', 'aria-label': label },
        h(
          'thead',
          null,
          h(
            'tr',
            null,
            ...headers.map((title, i) =>
              h('th', { key: i, scope: 'col' }, title),
            ),
          ),
        ),
        h('tbody', null, ...rows),
      ),
    );

  function Modal({ title, onClose, children }) {
    const ref = useRef(null),
      previous = useRef(null);
    useEffect(() => {
      previous.current = document.activeElement;
      ref.current?.focus();
      return () => previous.current?.focus?.();
    }, []);
    function keyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
      if (event.key !== 'Tab') return;
      const focusable = [
        ...ref.current.querySelectorAll(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
        ),
      ];
      if (!focusable.length) return;
      const first = focusable[0],
        last = focusable[focusable.length - 1];
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          document.activeElement === ref.current)
      ) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    return h(
      'div',
      { className: 'fl-modal-backdrop' },
      h(
        'section',
        {
          role: 'dialog',
          'aria-modal': true,
          'aria-label': title,
          tabIndex: -1,
          ref,
          onKeyDown: keyDown,
          className: 'fl-modal',
        },
        h(
          'div',
          { className: 'fl-heading' },
          h('h2', null, title),
          button('Закрыть', onClose),
        ),
        children,
      ),
    );
  }

  function Reports({ data, report, setReport, drill, act, busy }) {
    const reports = data.reports || {},
      selected = reports[report];
    const labels = {
      cf: 'Движение денег · CF',
      pnl: 'Прибыли и убытки · PnL',
      balance: 'Баланс · Balance',
    };
    const explanation = {
      cf: 'Фактические поступления и выплаты за выбранный период.',
      pnl: 'Результат по периоду выполнения работы и получения услуг.',
      balance: 'Активы, обязательства и капитал на конец выбранного периода.',
    };
    const rows = list(selected?.rows);
    const header =
      report === 'cf'
        ? ['Статья', 'Поступления', 'Выплаты', 'Изменение']
        : report === 'pnl'
          ? ['Статья', 'Сумма']
          : ['Раздел', 'Позиция', 'Остаток'];
    return h(
      'section',
      { className: 'fl-card' },
      h(
        'div',
        { className: 'fl-heading' },
        h(
          'nav',
          { className: 'fl-subtabs', 'aria-label': 'Финансовые отчёты' },
          ...Object.entries(labels).map(([key, label]) =>
            button(label, () => setReport(key), {
              key,
              'aria-pressed': report === key,
            }),
          ),
        ),
        h(
          'div',
          { className: 'fl-toolbar' },
          data.context?.permissions?.canEdit &&
            button('Начальные остатки', () => act('opening')),
          data.context?.permissions?.canClose &&
            button('Закрытие периода', () => act('period')),
        ),
      ),
      h(
        'p',
        { className: 'muted' },
        explanation[report],
        ' Отчёты используют фильтры компании, направления и периода; контрагент ограничивает журнал и взаиморасчёты.',
      ),
      !selected
        ? empty('Отчёт недоступен. Проверьте источники и повторите загрузку.')
        : h(
            React.Fragment,
            null,
            h(
              'div',
              { className: 'fl-metrics' },
              ...(report === 'cf'
                ? [
                    ['На начало', selected.openingKopecks],
                    ['Поступило', selected.inflowKopecks],
                    ['Выплачено', selected.outflowKopecks],
                    ['На конец', selected.closingKopecks],
                  ]
                : report === 'pnl'
                  ? [
                      ['Выручка', selected.revenueKopecks],
                      ['Расходы', selected.expenseKopecks],
                      ['Финансовый результат', selected.profitKopecks],
                    ]
                  : [
                      ['Активы', selected.assetsKopecks],
                      ['Обязательства', selected.liabilitiesKopecks],
                      ['Капитал', selected.equityKopecks],
                      ['Расхождение', selected.differenceKopecks],
                    ]
              ).map(([label, value]) => metric(label, value, { key: label })),
            ),
            report === 'cf' &&
              selected.treasuryMovementKopecks != null &&
              selected.treasuryMovementKopecks !== 0 &&
              h(
                'p',
                { className: 'fl-note' },
                'Расчёты направления с общим казначейством: ',
                money(selected.treasuryMovementKopecks),
              ),
            rows.length
              ? table(
                  labels[report],
                  header,
                  rows.map((row, i) =>
                    h(
                      'tr',
                      {
                        key: `${row.account || row.article || row.category}-${i}`,
                      },
                      report === 'balance' &&
                        h(
                          'td',
                          null,
                          {
                            assets: 'Активы',
                            liabilities: 'Обязательства',
                            equity: 'Капитал',
                          }[row.section] || row.section,
                        ),
                      h(
                        'td',
                        null,
                        button(
                          row.label ||
                            row.article ||
                            row.account ||
                            row.category ||
                            'Без статьи',
                          () => drill(row),
                          { className: 'fl-link', disabled: busy },
                        ),
                      ),
                      ...(report === 'cf'
                        ? [
                            row.inflowKopecks,
                            row.outflowKopecks,
                            row.netKopecks,
                          ]
                        : [row.amountKopecks]
                      ).map((amount, j) =>
                        h(
                          'td',
                          { key: j, className: 'fl-money' },
                          money(amount),
                        ),
                      ),
                    ),
                  ),
                )
              : empty(
                  'За выбранный период записей нет. Добавьте подтверждённые данные или загрузите файл.',
                ),
          ),
    );
  }

  function OperationRow({
    item,
    catalogs,
    checked,
    toggle,
    canEdit,
    busy,
    mutate,
    showSource,
  }) {
    const [draft, setDraft] = useState({
      directionId: item.directionId || '',
      article: item.article || '',
      counterpartyId: item.counterpartyId || '',
      kind: item.kind,
    });
    canEdit = canEdit && !item.projected;
    const dirty =
      draft.directionId !== (item.directionId || '') ||
      draft.article !== (item.article || '') ||
      draft.counterpartyId !== (item.counterpartyId || '') ||
      draft.kind !== item.kind;
    const lookup = (kind, id) =>
      itemName(list(catalogs[kind]).find((value) => value.id === id));
    return h(
      'tr',
      {
        className:
          item.reversed || item.status === 'reversed' ? 'fl-row-void' : '',
        'data-operation-id': item.id,
      },
      h(
        'td',
        null,
        h('input', {
          type: 'checkbox',
          checked,
          disabled:
            busy || !canEdit || item.reversed || item.status === 'reversed',
          'aria-label': `Выбрать операцию ${item.description || item.id}`,
          onChange: toggle,
        }),
      ),
      h('td', null, dateLabel(item.date)),
      h(
        'td',
        null,
        h(
          'strong',
          null,
          item.description || KIND_LABELS[item.kind] || 'Операция',
        ),
        ['cash_in', 'cash_out'].includes(item.kind) && canEdit && !item.reversed
          ? h(
              'select',
              {
                'aria-label': `Вид: ${item.description || item.id}`,
                value: draft.kind,
                disabled: busy,
                onChange: (event) =>
                  setDraft((value) => ({ ...value, kind: event.target.value })),
              },
              ...[
                item.kind,
                item.kind === 'cash_in' ? 'payment_in' : 'payment_out',
                item.kind === 'cash_in'
                  ? 'customer_advance'
                  : 'supplier_advance',
              ].map((id) =>
                h('option', { key: id, value: id }, KIND_LABELS[id]),
              ),
            )
          : h('small', null, KIND_LABELS[item.kind] || item.kind),
        button('Источник', () => showSource(item), { className: 'fl-link' }),
      ),
      h(
        'td',
        null,
        canEdit && !item.reversed
          ? h(
              'select',
              {
                'aria-label': `Контрагент: ${item.description || item.id}`,
                value: draft.counterpartyId,
                disabled: busy,
                onChange: (event) =>
                  setDraft((value) => ({
                    ...value,
                    counterpartyId: event.target.value,
                  })),
              },
              h('option', { value: '' }, 'Не определён'),
              ...list(catalogs.counterparties).map((party) =>
                h(
                  'option',
                  { key: party.id, value: party.id },
                  itemName(party),
                ),
              ),
            )
          : item.counterpartyName ||
              (item.counterpartyId
                ? lookup('counterparties', item.counterpartyId)
                : 'Не определён'),
      ),
      h('td', { className: 'fl-money' }, money(item.amountKopecks)),
      h(
        'td',
        null,
        canEdit && !item.reversed && item.status !== 'reversed'
          ? h(
              'select',
              {
                'aria-label': `Направление: ${item.description || item.id}`,
                value: draft.directionId,
                disabled: busy,
                onChange: (event) =>
                  setDraft((value) => ({
                    ...value,
                    directionId: event.target.value,
                  })),
              },
              h('option', { value: '' }, 'Не определено'),
              ...list(catalogs.directions)
                .filter(
                  (value) => !value.archived || value.id === item.directionId,
                )
                .map((value) =>
                  h(
                    'option',
                    { key: value.id, value: value.id },
                    itemName(value),
                  ),
                ),
            )
          : item.directionName ||
              (item.directionId
                ? lookup('directions', item.directionId)
                : 'Не определено'),
      ),
      h(
        'td',
        null,
        canEdit && !item.reversed && item.status !== 'reversed'
          ? h('input', {
              'aria-label': `Статья: ${item.description || item.id}`,
              value: draft.article,
              maxLength: 150,
              disabled: busy,
              onChange: (event) =>
                setDraft((value) => ({
                  ...value,
                  article: event.target.value,
                })),
            })
          : item.article || 'Не определено',
      ),
      h('td', null, badge(item.reversed ? 'reversed' : item.status)),
      h(
        'td',
        null,
        h(
          'div',
          { className: 'fl-row-actions' },
          dirty &&
            button(
              'Сохранить',
              () =>
                mutate(
                  `/operations/${item.id}`,
                  {
                    version: item.version,
                    ...draft,
                    directionId: draft.directionId || null,
                    counterpartyId: draft.counterpartyId || null,
                  },
                  'PATCH',
                ),
              { disabled: busy },
            ),
          canEdit &&
            !item.reversed &&
            !['reversal', 'opening', 'settlement', 'setoff'].includes(
              item.kind,
            ) &&
            button('Изменить', () => showSource(item, 'edit'), {
              disabled: busy,
            }),
          canEdit &&
            !item.reversed &&
            item.status !== 'reversed' &&
            item.kind !== 'reversal' &&
            button('Отменить', () => showSource(item, 'reverse'), {
              disabled: busy,
            }),
        ),
      ),
    );
  }

  function Operations({
    data,
    busy,
    mutate,
    source,
    selected,
    setSelected,
    offset,
    setOffset,
    search,
    setSearch,
    article,
    setArticle,
  }) {
    const [bulkDirection, setBulkDirection] = useState(''),
      [bulkArticle, setBulkArticle] = useState('');
    const [proposals, setProposals] = useState([]),
      [useAI, setUseAI] = useState(false);
    const operations = data.operations || {},
      items = list(operations.items),
      canEdit = data.context?.permissions?.canEdit;
    const shown = items;
    const selectedItems = items.filter((item) => selected.includes(item.id));
    function toggle(id) {
      setSelected((old) =>
        old.includes(id) ? old.filter((value) => value !== id) : [...old, id],
      );
    }
    return h(
      'section',
      { className: 'fl-card' },
      h(
        'div',
        { className: 'fl-heading' },
        h('h2', null, 'Журнал операций'),
        text(
          'Поиск операций',
          search,
          (value) => {
            setOffset(0);
            setSearch(value);
          },
          { type: 'search', placeholder: 'Назначение, статья, документ' },
        ),
      ),
      article &&
        h(
          'div',
          { className: 'fl-toolbar' },
          h('span', null, `Детализация: ${article}`),
          button('Показать все статьи', () => setArticle('')),
        ),
      canEdit &&
        h(
          'div',
          { className: 'fl-toolbar fl-bulk' },
          h(
            'label',
            { className: 'fl-check' },
            h('input', {
              type: 'checkbox',
              'aria-label': 'Выбрать все операции на странице',
              checked:
                Boolean(shown.length) &&
                shown.every((item) => selected.includes(item.id)),
              disabled: busy || !shown.length,
              onChange: (event) =>
                setSelected(
                  event.target.checked
                    ? shown
                        .filter(
                          (item) =>
                            !item.projected &&
                            !item.reversed &&
                            item.status !== 'reversed',
                        )
                        .map((item) => item.id)
                    : [],
                ),
            }),
            `Выбрано: ${selected.length}`,
          ),
          select(
            'Направление для выбранных',
            bulkDirection,
            setBulkDirection,
            list(data.catalogs?.directions).filter((item) => !item.archived),
            'Не менять',
          ),
          text('Статья для выбранных', bulkArticle, setBulkArticle),
          button(
            'Применить к выбранным',
            async () => {
              const result = await mutate('/operations/bulk', {
                items: selectedItems.map((item) => ({
                  id: item.id,
                  version: item.version,
                })),
                patch: {
                  ...(bulkDirection ? { directionId: bulkDirection } : {}),
                  ...(bulkArticle.trim()
                    ? { article: bulkArticle.trim() }
                    : {}),
                },
              });
              if (result) {
                setSelected([]);
                setBulkArticle('');
                setBulkDirection('');
              }
            },
            {
              disabled:
                busy ||
                !selectedItems.length ||
                (!bulkDirection && !bulkArticle.trim()),
            },
          ),
          button(
            'Предложить разноску',
            async () => {
              const result = await mutate(
                '/suggestions',
                { operationIds: selectedItems.map((item) => item.id), useAI },
                'POST',
                false,
              );
              if (result)
                setProposals([
                  ...list(result.suggestions),
                  ...list(result.aiSuggestions),
                ]);
            },
            { disabled: busy || !selectedItems.length },
          ),
          h(
            'label',
            { className: 'fl-check' },
            h('input', {
              type: 'checkbox',
              checked: useAI,
              disabled: busy,
              onChange: (event) => setUseAI(event.target.checked),
            }),
            'Подключить настроенный ИИ',
          ),
        ),
      proposals.length > 0 &&
        h(
          'section',
          { className: 'fl-suggestions' },
          h('h3', null, 'Предложения к проверке'),
          table(
            'Предложения разноски',
            ['Операция', 'Предложение', 'Основание', ''],
            proposals.map((proposal, index) => {
              const operation = items.find(
                  (item) => item.id === proposal.operationId,
                ),
                patch = proposal.patch || {};
              return h(
                'tr',
                { key: `${proposal.operationId}-${index}` },
                h('td', null, operation?.description || 'Операция'),
                h(
                  'td',
                  null,
                  [
                    patch.article,
                    patch.directionId &&
                      itemName(
                        list(data.catalogs?.directions).find(
                          (item) => item.id === patch.directionId,
                        ),
                      ),
                    patch.counterpartyId &&
                      itemName(
                        list(data.catalogs?.counterparties).find(
                          (item) => item.id === patch.counterpartyId,
                        ),
                      ),
                  ]
                    .filter(Boolean)
                    .join(' · ') || 'Нет однозначного соответствия',
                ),
                h('td', null, list(proposal.reasons).join(' · ')),
                h(
                  'td',
                  null,
                  button(
                    'Принять',
                    async () => {
                      const result = await mutate(
                        `/operations/${proposal.operationId}`,
                        {
                          version: proposal.version || operation?.version || 1,
                          ...patch,
                        },
                        'PATCH',
                      );
                      if (result)
                        setProposals((old) =>
                          old.filter(
                            (item) => item.operationId !== proposal.operationId,
                          ),
                        );
                    },
                    {
                      disabled:
                        busy ||
                        !Object.keys(patch).length ||
                        proposal.ambiguous,
                    },
                  ),
                ),
              );
            }),
          ),
        ),
      shown.length
        ? table(
            'Финансовые операции',
            [
              '',
              'Дата',
              'Операция и источник',
              'Контрагент',
              'Сумма',
              'Направление',
              'Статья',
              'Статус',
              'Действия',
            ],
            shown.map((item) =>
              h(OperationRow, {
                key: `${item.id}-${item.version}`,
                item,
                catalogs: data.catalogs || {},
                checked: selected.includes(item.id),
                toggle: () => toggle(item.id),
                canEdit,
                busy,
                mutate,
                showSource: source,
              }),
            ),
          )
        : empty('Нет операций по выбранным условиям.'),
      h(
        'div',
        { className: 'fl-heading fl-pagination' },
        h(
          'span',
          { className: 'muted' },
          `Операций: ${operations.total ?? items.length}`,
        ),
        h(
          'div',
          { className: 'fl-toolbar' },
          button(
            'Предыдущая страница',
            () => setOffset(Math.max(0, offset - 50)),
            { disabled: busy || offset === 0 },
          ),
          button('Следующая страница', () => setOffset(offset + 50), {
            disabled:
              busy ||
              offset + items.length >= (operations.total ?? items.length),
          }),
        ),
      ),
    );
  }

  function Calendar({
    data,
    mutate,
    busy,
    showSource,
    setDialog,
    calendarFilters,
    setCalendarFilters,
    calendarOffset,
    setCalendarOffset,
  }) {
    const [grouping, setGrouping] = useState('day');
    const calendar = data.calendar || {},
      rows = list(calendar.rows),
      canEdit = data.context?.permissions?.canEdit;
    const days = list(calendar.days);
    const groups =
      grouping === 'day'
        ? days
        : Object.values(
            days.reduce((all, day) => {
              const d = new Date(`${day.date}T12:00:00`);
              d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
              const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
              const current = all[key] || {
                date: key,
                inflowKopecks: 0,
                outflowKopecks: 0,
              };
              all[key] = {
                ...current,
                inflowKopecks: current.inflowKopecks + day.inflowKopecks,
                outflowKopecks: current.outflowKopecks + day.outflowKopecks,
                closingKopecks: day.closingKopecks,
                deficitKopecks: Math.max(
                  current.deficitKopecks || 0,
                  day.deficitKopecks || 0,
                ),
              };
              return all;
            }, {}),
          );
    const paymentRows = (items, title) =>
      !items.length
        ? null
        : h(
            'section',
            { className: 'fl-calendar-list' },
            h('h3', null, `${title} · ${items.length}`),
            table(
              title,
              [
                'Платёж',
                'Срок договора',
                'Плановая дата',
                'Поток',
                'Осталось',
                'Статус',
              ],
              items.map((item, i) =>
                h(
                  'tr',
                  { key: `${item.id}-${i}` },
                  h(
                    'td',
                    null,
                    button(
                      item.description || 'Платёж',
                      () => showSource(item),
                      { className: 'fl-link' },
                    ),
                  ),
                  h('td', null, dateLabel(item.dueDate)),
                  h(
                    'td',
                    null,
                    canEdit
                      ? h('input', {
                          type: 'date',
                          'aria-label': `Дата платежа: ${item.description || item.id}`,
                          title: item.recurrenceTemplateId
                            ? 'Дата из регулярного графика. Измените шаблон в справочниках.'
                            : undefined,
                          defaultValue: dateInput(
                            item.date || item.plannedDate,
                          ),
                          disabled: busy || Boolean(item.recurrenceTemplateId),
                          onBlur: (event) => {
                            const plan = list(data.catalogs?.plans).find(
                              (plan) => plan.id === (item.planId || item.id),
                            );
                            if (
                              event.target.value !==
                              dateInput(item.date || item.plannedDate)
                            )
                              mutate(
                                '/catalogs/plans',
                                {
                                  ...(plan || {
                                    name:
                                      item.description || 'Платёж по документу',
                                    documentId: item.documentId,
                                    legalEntityId: item.legalEntityId,
                                    counterpartyId: item.counterpartyId,
                                    directionId: item.directionId,
                                    amountKopecks: item.amountKopecks,
                                    flow: item.flow,
                                  }),
                                  version: plan?.version || 0,
                                  expectedDate: event.target.value || null,
                                  plannedDate: event.target.value || null,
                                },
                                'PUT',
                              );
                          },
                        })
                      : dateLabel(item.date),
                  ),
                  h('td', null, item.flow === 'in' ? 'Поступление' : 'Выплата'),
                  h('td', { className: 'fl-money' }, money(item.amountKopecks)),
                  h('td', null, badge(item.status)),
                ),
              ),
            ),
          );
    return h(
      'section',
      { className: 'fl-card' },
      h(
        'div',
        { className: 'fl-heading' },
        h('h2', null, 'Платёжный календарь'),
        h(
          'div',
          {
            className: 'fl-subtabs',
            role: 'group',
            'aria-label': 'Группировка календаря',
          },
          button('По дням', () => setGrouping('day'), {
            'aria-pressed': grouping === 'day',
          }),
          button('По неделям', () => setGrouping('week'), {
            'aria-pressed': grouping === 'week',
          }),
          canEdit &&
            button('+ План платежа', () => setDialog({ type: 'plan' }), {
              disabled: busy,
            }),
        ),
      ),
      h(
        'div',
        { className: 'fl-toolbar' },
        text(
          'Календарь с',
          calendarFilters.calendarFrom,
          (value) =>
            setCalendarFilters((old) => ({ ...old, calendarFrom: value })),
          { type: 'date', required: true, disabled: busy },
        ),
        text(
          'Календарь по',
          calendarFilters.calendarTo,
          (value) =>
            setCalendarFilters((old) => ({ ...old, calendarTo: value })),
          { type: 'date', required: true, disabled: busy },
        ),
      ),
      h(
        'p',
        { className: 'muted' },
        'Перенос даты меняет план платежа. Срок договора и фактическая оплата сохраняются.',
      ),
      h(
        'div',
        { className: 'fl-metrics' },
        metric('Денег на начало', calendar.openingKopecks),
        metric('Прогноз на конец', calendar.closingKopecks),
      ),
      list(calendar.entityBalances).length > 1 &&
        h(
          'section',
          { className: 'fl-calendar-list' },
          h('h3', null, 'По организациям'),
          h(
            'p',
            { className: 'muted' },
            'Деньги одной организации не покрывают кассовый разрыв другой. Для перевода денег нужен отдельный платёж.',
          ),
          table(
            'По организациям',
            [
              'Организация',
              'На начало',
              'На конец',
              'Минимальный остаток',
              'Первый дефицит',
            ],
            calendar.entityBalances.map((entity) =>
              h(
                'tr',
                { key: entity.legalEntityId },
                h(
                  'td',
                  null,
                  entity.name ||
                    itemName(
                      list(data.context?.legalEntities).find(
                        (item) => item.id === entity.legalEntityId,
                      ),
                    ),
                ),
                h(
                  'td',
                  { className: 'fl-money' },
                  money(entity.openingKopecks),
                ),
                h(
                  'td',
                  { className: 'fl-money' },
                  money(entity.closingKopecks),
                ),
                h(
                  'td',
                  {
                    className: `fl-money${entity.minimumKopecks < 0 ? ' fl-error' : ''}`,
                  },
                  money(entity.minimumKopecks),
                ),
                h(
                  'td',
                  { className: entity.firstDeficitDate ? 'fl-error' : '' },
                  entity.firstDeficitDate
                    ? dateLabel(entity.firstDeficitDate)
                    : 'Нет',
                ),
              ),
            ),
          ),
        ),
      groups.length
        ? h(
            'div',
            { className: 'fl-calendar-grid' },
            ...groups.map((day) =>
              h(
                'article',
                {
                  key: day.date,
                  className: `fl-day${day.deficitKopecks > 0 ? ' fl-deficit' : ''}`,
                },
                h(
                  'strong',
                  null,
                  `${grouping === 'week' ? 'Неделя с ' : ''}${dateLabel(day.date)}`,
                ),
                h('span', null, `Поступления ${money(day.inflowKopecks)}`),
                h('span', null, `Выплаты ${money(day.outflowKopecks)}`),
                h('b', null, `Остаток ${money(day.closingKopecks)}`),
                day.deficitKopecks > 0 &&
                  h('small', null, `Дефицит ${money(day.deficitKopecks)}`),
              ),
            ),
          )
        : empty('В выбранном периоде нет платежей с назначенной датой.'),
      paymentRows(list(calendar.undated), 'Назначить дату'),
      paymentRows(list(calendar.overdue), 'Просроченные обязательства'),
      paymentRows(rows, 'Платежи периода'),
      calendar.pagination &&
        h(
          'div',
          { className: 'fl-heading fl-pagination' },
          h(
            'span',
            { className: 'muted' },
            `В периоде: ${calendar.pagination.total}. Без даты: ${calendar.pagination.undatedTotal ?? list(calendar.undated).length}. Просрочено: ${calendar.pagination.overdueTotal ?? list(calendar.overdue).length}. Строк на странице: до ${calendar.pagination.limit} в каждом списке.`,
          ),
          h(
            'div',
            { className: 'fl-toolbar' },
            button(
              'Предыдущие платежи',
              () => setCalendarOffset(Math.max(0, calendarOffset - 200)),
              { disabled: busy || calendarOffset === 0 },
            ),
            button(
              'Следующие платежи',
              () => setCalendarOffset(calendarOffset + 200),
              {
                disabled:
                  busy ||
                  calendarOffset + 200 >=
                    Math.max(
                      calendar.pagination.total,
                      calendar.pagination.undatedTotal || 0,
                      calendar.pagination.overdueTotal || 0,
                    ),
              },
            ),
          ),
        ),
    );
  }

  function Settlements({
    data,
    showSource,
    setDialog,
    busy,
    filters,
    debtOffset,
    setDebtOffset,
  }) {
    const [side, setSide] = useState('all'),
      [selected, setSelected] = useState([]);
    const all = [
      ...list(data.reports?.receivables).map((item) => ({
        ...item,
        side: 'receivable',
      })),
      ...list(data.reports?.payables).map((item) => ({
        ...item,
        side: 'payable',
      })),
    ];
    const items = all.filter((item) => side === 'all' || item.side === side),
      chosen = all.filter((item) => selected.includes(item.documentId));
    const compatible =
      chosen.length > 0 &&
      chosen.every(
        (item) =>
          item.legalEntityId === chosen[0].legalEntityId &&
          item.counterpartyId === chosen[0].counterpartyId &&
          item.side === chosen[0].side,
      );
    const pagination = data.reports?.debtPagination,
      maxDebtTotal = Math.max(
        pagination?.receivables?.total || 0,
        pagination?.payables?.total || 0,
      );
    const reconciliations = list(data.catalogs?.reconciliations),
      canEdit = data.context?.permissions?.canEdit;
    return h(
      'section',
      { className: 'fl-card' },
      h(
        'div',
        { className: 'fl-heading' },
        h('h2', null, 'Взаиморасчёты'),
        h(
          'div',
          { className: 'fl-subtabs' },
          ...[
            ['all', 'Все'],
            ['receivable', 'Нам должны'],
            ['payable', 'Мы должны'],
          ].map(([key, name]) =>
            button(name, () => setSide(key), {
              key,
              'aria-pressed': side === key,
            }),
          ),
        ),
      ),
      h(
        'p',
        { className: 'muted' },
        'Сумма документа и подтверждение реестра учитываются отдельно от фактического погашения. Совпадение контрагента не означает автоматический взаимозачёт.',
      ),
      canEdit &&
        h(
          'div',
          { className: 'fl-toolbar' },
          button('Связать оплату', () => setDialog({ type: 'settle' }), {
            disabled: busy,
          }),
          button('Взаимозачёт', () => setDialog({ type: 'setoff' }), {
            disabled: busy,
          }),
          button(
            'Сверить выбранный реестр',
            () => setDialog({ type: 'reconcile', documents: chosen, filters }),
            { disabled: busy || !compatible },
          ),
          selected.length > 0 &&
            !compatible &&
            h(
              'span',
              { className: 'muted' },
              'Выберите документы одной компании, контрагента и стороны расчётов.',
            ),
        ),
      items.length
        ? table(
            'Задолженность',
            [
              '',
              'Контрагент и документ',
              'Сторона',
              'Начислено',
              'Погашено',
              'Осталось',
              'Срок',
              'Подтверждение',
            ],
            items.map((item, index) =>
              h(
                'tr',
                { key: item.id || item.documentId || index },
                h(
                  'td',
                  null,
                  canEdit &&
                    h('input', {
                      type: 'checkbox',
                      'aria-label': `Сверить документ ${item.description || item.documentId}`,
                      checked: selected.includes(item.documentId),
                      disabled: busy || !item.counterpartyId,
                      onChange: (event) =>
                        setSelected((old) =>
                          event.target.checked
                            ? [...old, item.documentId]
                            : old.filter((id) => id !== item.documentId),
                        ),
                    }),
                ),
                h(
                  'td',
                  null,
                  h(
                    'strong',
                    null,
                    item.counterpartyName ||
                      itemName(
                        list(data.catalogs?.counterparties).find(
                          (party) => party.id === item.counterpartyId,
                        ),
                      ),
                  ),
                  button(
                    item.description || item.documentNumber || 'Документ',
                    () => showSource(item),
                    { className: 'fl-link' },
                  ),
                ),
                h(
                  'td',
                  null,
                  item.side === 'payable' ? 'Мы должны' : 'Нам должны',
                ),
                h('td', { className: 'fl-money' }, money(item.amountKopecks)),
                h('td', { className: 'fl-money' }, money(item.settledKopecks)),
                h(
                  'td',
                  { className: 'fl-money' },
                  money(item.remainingKopecks),
                ),
                h('td', null, dateLabel(item.dueDate)),
                h('td', null, badge(item.status || 'provisional')),
              ),
            ),
          )
        : empty('Документов по выбранным условиям нет.'),
      pagination &&
        h(
          'div',
          { className: 'fl-heading fl-pagination' },
          h(
            'span',
            { className: 'muted' },
            `Нам должны: ${money(pagination.receivables.remainingKopecks)} · ${pagination.receivables.total} документов. Мы должны: ${money(pagination.payables.remainingKopecks)} · ${pagination.payables.total} документов. Показано до ${pagination.limit} документов каждой стороны.`,
          ),
          h(
            'div',
            { className: 'fl-toolbar' },
            button(
              'Предыдущие документы',
              () => {
                setSelected([]);
                setDebtOffset(Math.max(0, debtOffset - 100));
              },
              { disabled: busy || debtOffset === 0 },
            ),
            button(
              'Следующие документы',
              () => {
                setSelected([]);
                setDebtOffset(debtOffset + 100);
              },
              { disabled: busy || debtOffset + 100 >= maxDebtTotal },
            ),
          ),
        ),
      h('h3', null, 'Сверки реестров'),
      reconciliations.length
        ? table(
            'Сверки реестров',
            [
              'Контрагент / период',
              'Наша сумма',
              'Сумма контрагента',
              'Расхождение',
              'Подтверждено',
              'Состояние',
              'Основание',
            ],
            reconciliations.map((row) =>
              h(
                'tr',
                { key: row.id },
                h(
                  'td',
                  null,
                  itemName(
                    list(data.catalogs?.counterparties).find(
                      (item) => item.id === row.counterpartyId,
                    ),
                  ),
                  h(
                    'small',
                    null,
                    `${dateLabel(row.from)} — ${dateLabel(row.to)}`,
                  ),
                ),
                h('td', { className: 'fl-money' }, money(row.ourAmountKopecks)),
                h(
                  'td',
                  { className: 'fl-money' },
                  money(row.externalAmountKopecks),
                ),
                h(
                  'td',
                  { className: 'fl-money' },
                  money(row.differenceKopecks),
                ),
                h(
                  'td',
                  { className: 'fl-money' },
                  money(row.confirmedAmountKopecks),
                ),
                h('td', null, badge(row.currentStatus || row.status)),
                h(
                  'td',
                  null,
                  row.sourceReference || 'Не указано',
                  canEdit &&
                    button(
                      'Изменить сверку',
                      () =>
                        setDialog({
                          type: 'reconcile',
                          reconciliation: row,
                          documents: all.filter((item) =>
                            row.documentIds.includes(item.documentId),
                          ),
                          filters,
                        }),
                      { disabled: busy || row.stale, className: 'fl-link' },
                    ),
                ),
              ),
            ),
          )
        : empty(
            'Сверки ещё не подтверждены. Выберите документы в списке выше.',
          ),
    );
  }

  function ReconciliationForm({
    documents,
    reconciliation,
    filters,
    busy,
    save,
    close,
  }) {
    const first = documents[0] || {},
      [external, setExternal] = useState(
        String(
          (reconciliation?.externalAmountKopecks ??
            documents.reduce((sum, item) => sum + item.amountKopecks, 0)) / 100,
        ),
      ),
      [reference, setReference] = useState(
        reconciliation?.sourceReference || '',
      ),
      [disputed, setDisputed] = useState(
        list(reconciliation?.documents)
          .filter((item) => item.disputed)
          .map((item) => item.documentId),
      ),
      [status, setStatus] = useState(
        reconciliation?.status === 'disputed' ? 'disputed' : 'confirmed',
      ),
      [error, setError] = useState('');
    const [from, setFrom] = useState(
        reconciliation?.from ||
          documents.reduce(
            (value, item) => (item.date < value ? item.date : value),
            filters.from,
          ),
      ),
      [to, setTo] = useState(reconciliation?.to || filters.to);
    const our = documents.reduce((sum, item) => sum + item.amountKopecks, 0);
    return h(
      'form',
      {
        onSubmit: async (event) => {
          event.preventDefault();
          setError('');
          try {
            const amount = external.trim() === '0' ? 0 : kopecks(external);
            const result = await save('/reconciliations', {
              ...(reconciliation
                ? { id: reconciliation.id, version: reconciliation.version }
                : { version: 0 }),
              legalEntityId: first.legalEntityId,
              counterpartyId: first.counterpartyId,
              side: first.side,
              from,
              to,
              documentIds: documents.map((item) => item.documentId),
              externalAmountKopecks: amount,
              disputedDocumentIds: disputed,
              sourceReference: reference,
              status,
            });
            if (result) close();
          } catch (reason) {
            setError(errorMessage(reason));
          }
        },
      },
      h(
        'p',
        { className: 'fl-note' },
        'Сверка подтверждает суммы выполненных работ. Оплаты, авансы и взаимозачёты остаются отдельными операциями.',
      ),
      h(
        'div',
        { className: 'fl-form-grid' },
        text('Сверка с', from, setFrom, {
          type: 'date',
          required: true,
          disabled: busy,
        }),
        text('Сверка по', to, setTo, {
          type: 'date',
          required: true,
          disabled: busy,
        }),
        text('Сумма контрагента, ₽', external, setExternal, {
          inputMode: 'decimal',
          required: true,
          disabled: busy,
        }),
        text('Реестр или основание сверки', reference, setReference, {
          required: status === 'confirmed',
          disabled: busy,
        }),
        select(
          'Результат сверки',
          status,
          setStatus,
          [
            { id: 'confirmed', name: 'Подтвердить согласованное' },
            { id: 'disputed', name: 'Зафиксировать расхождение' },
            { id: 'draft', name: 'Сохранить черновик' },
          ],
          null,
          { disabled: busy },
        ),
      ),
      h('p', null, 'Наша сумма: ', h('strong', null, money(our))),
      table(
        'Документы сверки',
        ['Документ', 'Начислено', 'Оплачено', 'Спорный'],
        documents.map((item) =>
          h(
            'tr',
            { key: item.documentId },
            h('td', null, item.description || item.documentId),
            h('td', { className: 'fl-money' }, money(item.amountKopecks)),
            h('td', { className: 'fl-money' }, money(item.settledKopecks)),
            h(
              'td',
              null,
              h('input', {
                type: 'checkbox',
                'aria-label': `Спорный документ ${item.description || item.documentId}`,
                checked: disputed.includes(item.documentId),
                disabled: busy,
                onChange: (event) =>
                  setDisputed((old) =>
                    event.target.checked
                      ? [...old, item.documentId]
                      : old.filter((id) => id !== item.documentId),
                  ),
              }),
            ),
          ),
        ),
      ),
      error && h('p', { role: 'alert', className: 'fl-error' }, error),
      h(
        'button',
        {
          type: 'submit',
          className: 'button',
          disabled: busy || !documents.length,
        },
        'Сохранить сверку',
      ),
    );
  }

  function Quality({ data }) {
    const controls = list(data.controls).length
      ? data.controls
      : list(data.reports?.controls);
    const freshness = list(
      data.sources || data.context?.sources || data.freshness,
    );
    const human = (message) =>
      list(data.context?.legalEntities).reduce(
        (text, entity) => text.replaceAll(entity.id, itemName(entity)),
        String(message || ''),
      );
    return h(
      'details',
      { className: 'fl-quality', open: Boolean(controls.length) },
      h(
        'summary',
        null,
        `Качество данных${controls.length ? ` · замечаний: ${controls.length}` : ''}`,
      ),
      controls.length
        ? h(
            'ul',
            null,
            ...controls.map((control, index) =>
              h(
                'li',
                {
                  key: control.code || index,
                  className: control.severity === 'error' ? 'fl-error' : '',
                },
                human(control.message || control.label || control.code),
                Boolean(control.amountKopecks) &&
                  ` · ${money(control.amountKopecks)}`,
              ),
            ),
          )
        : h(
            'p',
            { className: 'muted' },
            'Проверки выполняются по загруженным данным. Полнота зависит от начальных остатков и подключённых источников.',
          ),
      freshness.length > 0 &&
        h(
          'div',
          { className: 'fl-source-statuses' },
          ...freshness.map((item, index) =>
            h(
              'div',
              { key: item.id || item.source || index },
              h('strong', null, item.name || item.source || item.system),
              h(
                'span',
                null,
                item.lastSuccessAt || item.updatedAt
                  ? `Обновлено ${new Date(item.lastSuccessAt || item.updatedAt).toLocaleString('ru-RU')}`
                  : 'Нет успешных загрузок',
              ),
              item.status &&
                h(
                  'small',
                  null,
                  item.message || STATUS_LABELS[item.status] || item.status,
                ),
            ),
          ),
        ),
      h(
        'p',
        { className: 'muted' },
        'Прямые API банков, Роснефти и Лукойла пока не подключены. Доступна загрузка файлов.',
      ),
    );
  }

  function OperationForm({
    data,
    legalEntityId,
    busy,
    save,
    close,
    operation,
  }) {
    const entities = list(data.context?.legalEntities),
      catalogs = data.catalogs || {};
    const [draft, setDraft] = useState(() => {
      const defaults = {
        kind: 'sale',
        legalEntityId:
          legalEntityId || (entities.length === 1 ? entities[0].id : ''),
        date: today(),
        amount: '',
        vatAmount: '',
        directionId: '',
        counterpartyId: '',
        cashAccountId: '',
        toCashAccountId: '',
        article: '',
        description: '',
        dueDate: '',
        plannedDate: '',
        responsibilityScopeId: '',
        status: 'confirmed',
        allocationRuleId: '',
        cost: '',
        costVat: '',
        supplierCounterpartyId: '',
        purchaseMode: 'payable',
      };
      return {
        ...defaults,
        ...Object.fromEntries(
          Object.keys(defaults)
            .filter((key) => operation?.[key] != null)
            .map((key) => [key, operation[key]]),
        ),
        ...(operation
          ? {
              amount: String(operation.amountKopecks / 100),
              vatAmount: String((operation.vatKopecks || 0) / 100),
              cost:
                operation.costKopecks == null
                  ? ''
                  : String(operation.costKopecks / 100),
              costVat: String((operation.costVatKopecks || 0) / 100),
              plannedDate:
                operation.expectedDate || operation.plannedDate || '',
            }
          : {}),
      };
    });
    const [localError, setLocalError] = useState('');
    const update = (key) => (value) =>
      setDraft((old) => ({ ...old, [key]: value }));
    const importedCash =
      operation &&
      ['bank', 'cash'].includes(operation.source?.system) &&
      list(operation.postings).some((posting) => posting.account === 'cash');
    const incomingCash =
      importedCash &&
      list(operation.postings)
        .filter((posting) => posting.account === 'cash')
        .reduce((sum, posting) => sum + posting.amountKopecks, 0) > 0;
    const cashKinds = [
      'payment_in',
      'payment_out',
      'customer_advance',
      'supplier_advance',
      'cash_in',
      'cash_out',
      'loan_received',
      'loan_repayment',
      'capital_in',
      'owner_distribution',
      'loan_issued',
      'loan_returned',
      'transfer',
    ];
    const choices = [
      'sale',
      'expense',
      'payment_in',
      'payment_out',
      'customer_advance',
      'supplier_advance',
      'cash_in',
      'cash_out',
      'asset_purchase',
      'inventory_purchase',
      'inventory_consumption',
      'capital_in',
      'owner_distribution',
      'loan_issued',
      'loan_returned',
      'loan_received',
      'loan_repayment',
      'interest',
      'depreciation',
      'transfer',
      'fuel_sale',
      'fuel_own_consumption',
    ];
    const accounts = list(catalogs.accounts).filter(
      (item) =>
        !item.archived &&
        (!draft.legalEntityId || item.legalEntityId === draft.legalEntityId),
    );
    const scopes = list(data.context?.scopes).filter(
      (item) => item.legalEntityId === draft.legalEntityId,
    );
    const fuel = draft.kind.startsWith('fuel_');
    async function submit(event) {
      event.preventDefault();
      setLocalError('');
      try {
        const { amount, vatAmount, cost, costVat, ...values } = draft;
        const body = {
          ...values,
          amountKopecks: kopecks(amount),
          vatKopecks:
            !vatAmount || Number(vatAmount) === 0 ? 0 : kopecks(vatAmount),
          ...(draft.kind === 'fuel_sale'
            ? {
                costKopecks: kopecks(cost),
                costVatKopecks:
                  !costVat || Number(costVat) === 0 ? 0 : kopecks(costVat),
              }
            : {}),
        };
        for (const key of Object.keys(body))
          if (body[key] === '') delete body[key];
        if (operation) {
          delete body.legalEntityId;
          delete body.responsibilityScopeId;
        }
        const result = await save(
          operation ? `/operations/${operation.id}` : '/operations',
          { ...body, ...(operation ? { version: operation.version } : {}) },
          operation ? 'PATCH' : 'POST',
        );
        if (result) close();
      } catch (error) {
        setLocalError(error.message);
      }
    }
    return h(
      'form',
      { onSubmit: submit },
      h(
        'div',
        { className: 'fl-form-grid' },
        select(
          'Вид операции',
          draft.kind,
          update('kind'),
          (importedCash
            ? incomingCash
              ? ['cash_in', 'payment_in', 'customer_advance']
              : ['cash_out', 'payment_out', 'supplier_advance']
            : choices
          ).map((id) => ({ id, name: KIND_LABELS[id] })),
          null,
          { required: true, disabled: busy },
        ),
        select(
          'Своя компания',
          draft.legalEntityId,
          update('legalEntityId'),
          entities,
          'Выберите компанию',
          { required: true, disabled: busy || Boolean(operation) },
        ),
        scopes.length > 1 &&
          !operation &&
          select(
            'Проект операции',
            draft.responsibilityScopeId,
            update('responsibilityScopeId'),
            scopes.map((scope) => ({
              id: scope.responsibilityScopeId,
              name: [
                scope.projectName,
                scope.scopeName || scope.responsibilityScopeName,
              ]
                .filter(Boolean)
                .join(' · '),
            })),
            'Выберите проект',
            { required: !draft.cashAccountId, disabled: busy },
          ),
        text('Дата операции', draft.date, update('date'), {
          type: 'date',
          required: true,
          disabled: busy || Boolean(importedCash),
        }),
        text('Сумма, ₽', draft.amount, update('amount'), {
          inputMode: 'decimal',
          required: true,
          disabled: busy || Boolean(importedCash),
        }),
        text('НДС, ₽', draft.vatAmount, update('vatAmount'), {
          inputMode: 'decimal',
          placeholder: '0',
          disabled: busy,
        }),
        select(
          'Контрагент',
          draft.counterpartyId,
          update('counterpartyId'),
          list(catalogs.counterparties),
          'Не определён',
          { disabled: busy },
        ),
        select(
          'Направление',
          draft.directionId,
          update('directionId'),
          list(catalogs.directions).filter((item) => !item.archived),
          'Не определено',
          { disabled: busy },
        ),
        text('Статья', draft.article, update('article'), {
          maxLength: 150,
          disabled: busy,
        }),
        select(
          'Подтверждение операции',
          draft.status,
          update('status'),
          [
            { id: 'confirmed', name: 'Подтверждено документами' },
            { id: 'provisional', name: 'Предварительное начисление' },
          ],
          null,
          { disabled: busy },
        ),
        draft.kind === 'expense' &&
          select(
            'Распределить общий расход',
            draft.allocationRuleId,
            update('allocationRuleId'),
            list(catalogs.allocationRules).filter((item) => !item.archived),
            'Без распределения',
            { disabled: busy },
          ),
        fuel &&
          h(
            React.Fragment,
            null,
            select(
              'Поставщик топлива',
              draft.supplierCounterpartyId,
              update('supplierCounterpartyId'),
              list(catalogs.counterparties),
              'Выберите поставщика',
              { required: draft.purchaseMode !== 'inventory', disabled: busy },
            ),
            select(
              'Источник топлива',
              draft.purchaseMode,
              update('purchaseMode'),
              [
                { id: 'payable', name: 'Покупка у поставщика' },
                { id: 'advance', name: 'За счёт аванса поставщику' },
                { id: 'inventory', name: 'Из запасов' },
              ],
              null,
              { disabled: busy },
            ),
            draft.kind === 'fuel_sale' &&
              h(
                React.Fragment,
                null,
                text('Закупочная стоимость, ₽', draft.cost, update('cost'), {
                  required: true,
                  inputMode: 'decimal',
                  disabled: busy,
                }),
                text(
                  'Входной НДС топлива, ₽',
                  draft.costVat,
                  update('costVat'),
                  { inputMode: 'decimal', disabled: busy },
                ),
              ),
          ),
        cashKinds.includes(draft.kind) &&
          select(
            'Счёт или касса',
            draft.cashAccountId,
            update('cashAccountId'),
            accounts,
            'Выберите счёт',
            { required: true, disabled: busy || Boolean(importedCash) },
          ),
        draft.kind === 'transfer' &&
          select(
            'На счёт',
            draft.toCashAccountId,
            update('toCashAccountId'),
            accounts.filter((item) => item.id !== draft.cashAccountId),
            'Выберите счёт',
            { required: true, disabled: busy },
          ),
        text('Срок по договору', draft.dueDate, update('dueDate'), {
          type: 'date',
          disabled: busy,
        }),
        text(
          'Плановая дата платежа',
          draft.plannedDate,
          update('plannedDate'),
          { type: 'date', disabled: busy },
        ),
        text('Назначение', draft.description, update('description'), {
          required: true,
          maxLength: 1000,
          disabled: busy,
        }),
      ),
      localError &&
        h('p', { role: 'alert', className: 'fl-error' }, localError),
      importedCash &&
        h(
          'p',
          { className: 'fl-note' },
          'Дата, сумма и счёт подтверждены выпиской. Здесь меняется назначение платежа; исправление фактического движения требует корректного документа источника.',
        ),
      h(
        'p',
        { className: 'fl-note' },
        'Оплату можно связать с несколькими документами во взаиморасчётах. Несвязанная оплата сохраняется как аванс.',
      ),
      h(
        'div',
        { className: 'fl-toolbar' },
        h(
          'button',
          { type: 'submit', className: 'button', disabled: busy },
          'Сохранить операцию',
        ),
        button('Отмена', close, { disabled: busy }),
      ),
    );
  }

  function Source({ item, data, mode, busy, save, close }) {
    const [reason, setReason] = useState(''),
      [date, setDate] = useState(today());
    const operation =
      list(data.operations?.items).find(
        (operation) => operation.id === (item.documentId || item.id),
      ) || item;
    const source = operation.source || item.source || {};
    return h(
      'div',
      { className: 'fl-source' },
      h(
        'h3',
        null,
        operation.description || KIND_LABELS[operation.kind] || 'Документ',
      ),
      h(
        'dl',
        null,
        h('dt', null, 'Дата'),
        h('dd', null, dateLabel(operation.date)),
        h('dt', null, 'Сумма'),
        h('dd', null, money(operation.amountKopecks)),
        h('dt', null, 'Источник'),
        h('dd', null, source.system || operation.sourceSystem || 'Ручной ввод'),
        h('dt', null, 'Документ источника'),
        h(
          'dd',
          null,
          source.documentNumber ||
            source.id ||
            operation.sourceId ||
            'Не указан',
        ),
        source.fileName &&
          h(
            React.Fragment,
            null,
            h('dt', null, 'Файл'),
            h('dd', null, source.fileName),
          ),
        (source.sheet || source.row || source.sourceSheet) &&
          h(
            React.Fragment,
            null,
            h('dt', null, 'Строка источника'),
            h(
              'dd',
              null,
              [
                source.sheet || source.sourceSheet,
                source.row || source.sourceRow,
              ]
                .filter(Boolean)
                .join(' · '),
            ),
          ),
        h('dt', null, 'Статус'),
        h(
          'dd',
          null,
          STATUS_LABELS[operation.status] || operation.status || 'Не указан',
        ),
      ),
      list(operation.postings).length > 0 &&
        table(
          'Отражение операции',
          ['Позиция', 'Сумма'],
          operation.postings.map((entry, index) =>
            h(
              'tr',
              { key: index },
              h('td', null, entry.label || entry.account),
              h('td', { className: 'fl-money' }, money(entry.amountKopecks)),
            ),
          ),
        ),
      mode === 'reverse' &&
        h(
          'form',
          {
            onSubmit: async (event) => {
              event.preventDefault();
              const result = await save(`/operations/${operation.id}/reverse`, {
                reason,
                date,
              });
              if (result) close();
            },
          },
          h(
            'p',
            { className: 'fl-note' },
            'Операция будет отменена с сохранением истории и причины. Исходный документ останется доступен.',
          ),
          text('Дата отмены', date, setDate, {
            type: 'date',
            required: true,
            disabled: busy,
          }),
          text('Причина отмены', reason, setReason, {
            required: true,
            minLength: 3,
            disabled: busy,
          }),
          h(
            'button',
            { type: 'submit', className: 'button', disabled: busy },
            'Подтвердить отмену',
          ),
        ),
    );
  }

  function SettlementForm({ data, type, busy, save, close }) {
    const [paymentId, setPaymentId] = useState(''),
      [documentId, setDocumentId] = useState(''),
      [payableId, setPayableId] = useState(''),
      [amount, setAmount] = useState(''),
      [reason, setReason] = useState(''),
      [error, setError] = useState('');
    const docs = [
      ...list(data.reports?.receivables),
      ...list(data.reports?.payables),
    ];
    const items = docs;
    const payments = list(
      data.settlements?.payments || data.operations?.items,
    ).filter(
      (item) =>
        [
          'payment_in',
          'payment_out',
          'customer_advance',
          'supplier_advance',
        ].includes(item.kind) &&
        !item.reversed &&
        item.status !== 'reversed',
    );
    const options = (rows) =>
      rows.map((item) => ({
        id: item.documentId || item.id,
        name: `${item.description || KIND_LABELS[item.kind] || item.id} · ${money(item.remainingKopecks ?? item.amountKopecks)}`,
      }));
    return h(
      'form',
      {
        onSubmit: async (event) => {
          event.preventDefault();
          setError('');
          try {
            const amountKopecks = kopecks(amount);
            const result = await save(
              type === 'setoff' ? '/operations' : '/settlements',
              type === 'setoff'
                ? {
                    kind: 'setoff',
                    receivableId: documentId,
                    payableId,
                    amountKopecks,
                    date: today(),
                    reason,
                  }
                : {
                    paymentId,
                    allocations: [{ documentId, amountKopecks }],
                    date: today(),
                  },
            );
            if (result) close();
          } catch (reason) {
            setError(reason.message);
          }
        },
      },
      h(
        'div',
        { className: 'fl-form-grid' },
        type !== 'setoff' &&
          select(
            'Оплата',
            paymentId,
            setPaymentId,
            options(payments),
            'Выберите оплату',
            { required: true, disabled: busy },
          ),
        select(
          type === 'setoff' ? 'Нам должны' : 'Документ',
          documentId,
          setDocumentId,
          options(
            type === 'setoff'
              ? items.filter((item) => item.side === 'receivable')
              : items,
          ),
          'Выберите документ',
          { required: true, disabled: busy },
        ),
        type === 'setoff' &&
          select(
            'Мы должны',
            payableId,
            setPayableId,
            options(items.filter((item) => item.side === 'payable')),
            'Выберите документ',
            { required: true, disabled: busy },
          ),
        text('Сумма погашения, ₽', amount, setAmount, {
          inputMode: 'decimal',
          required: true,
          disabled: busy,
        }),
        type === 'setoff' &&
          text('Основание зачёта', reason, setReason, {
            required: true,
            minLength: 3,
            disabled: busy,
          }),
      ),
      error && h('p', { role: 'alert', className: 'fl-error' }, error),
      h(
        'p',
        { className: 'fl-note' },
        type === 'setoff'
          ? 'Взаимозачёт уменьшает обе задолженности. Движение денег не создаётся. Документы выбираются с текущей страницы взаиморасчётов; сузьте список фильтром контрагента.'
          : 'Частичное погашение уменьшит остаток документа и сумму в календаре. Документы — с текущей страницы взаиморасчётов; сузьте список фильтром контрагента.',
      ),
      h(
        'button',
        { type: 'submit', className: 'button', disabled: busy },
        type === 'setoff' ? 'Подтвердить взаимозачёт' : 'Связать оплату',
      ),
    );
  }

  function Catalogs({
    data,
    legalEntityId,
    busy,
    save,
    kind,
    setKind,
    onCompanySaved,
  }) {
    const [draft, setDraft] = useState(null),
      [weights, setWeights] = useState({}),
      [error, setError] = useState('');
    useEffect(() => {
      setDraft(null);
      setError('');
    }, [kind]);
    const labels = {
      companies: 'Свои компании',
      counterparties: 'Контрагенты',
      directions: 'Направления',
      accounts: 'Счета и кассы',
      allocationRules: 'Общие расходы',
      classificationRules: 'Правила и топливные карты',
      plans: 'Регулярные платежи',
    };
    const items = list(
        kind === 'companies'
          ? data.context?.legalEntities
          : data.catalogs?.[kind],
      ).filter(
        (item) =>
          (kind !== 'plans' || item.recurrence) &&
          (kind !== 'directions' || !item.system),
      ),
      entities = list(data.context?.legalEntities);
    const canEdit =
      kind === 'companies'
        ? data.context?.permissions?.canManageCompanies
        : data.context?.permissions?.canEdit;
    const scopes = list(data.context?.scopes).filter(
      (item) => item.legalEntityId === draft?.legalEntityId,
    );
    const suggestionEntity =
      legalEntityId || (entities.length === 1 ? entities[0].id : '');
    const update = (key) => (value) =>
      setDraft((old) => ({ ...old, [key]: value }));
    function edit(item = {}) {
      setError('');
      if (kind === 'companies') {
        setDraft({
          ...(item.id ? { id: item.id } : {}),
          version: item.version || 0,
          name: item.name || '',
          organizationKind: item.id
            ? item.organizationKind || ''
            : 'legal_entity',
          inn: item.inn || '',
          kpp: item.kpp || '',
          ogrn: item.ogrn || '',
          fullName: item.fullName || '',
          address: item.address || '',
        });
        return;
      }
      setDraft({
        name: '',
        legalEntityId:
          legalEntityId || (entities.length === 1 ? entities[0].id : ''),
        version: 0,
        inn: '',
        kpp: '',
        bankAccount: '',
        roles: ['supplier'],
        type: 'bank',
        effectiveFrom: `${today().slice(0, 7)}-01`,
        ruleType: 'classification',
        pricingType: 'per_litre',
        salePrice: '',
        markup: '',
        flow: 'out',
        amount: '',
        monthly: true,
        dayOfMonth: '1',
        accrualEnabled: false,
        recurrenceStart: today(),
        ...item,
        ...(item.pricing
          ? {
              pricingType: item.pricing.type,
              salePrice:
                item.pricing.priceKopecksPerLitre != null
                  ? String(item.pricing.priceKopecksPerLitre / 100)
                  : '',
              markup:
                item.pricing.basisPoints != null
                  ? String(item.pricing.basisPoints / 100)
                  : '',
            }
          : {}),
        ...(item.statementBalanceKopecks != null
          ? { statementBalance: String(item.statementBalanceKopecks / 100) }
          : {}),
        ...(item.amountKopecks
          ? { amount: String(item.amountKopecks / 100) }
          : {}),
        ...(item.recurrence
          ? {
              recurrenceStart: item.recurrence.startDate,
              recurrenceEnd: item.recurrence.endDate || '',
              dayOfMonth: String(item.recurrence.dayOfMonth),
            }
          : {}),
        ...(item.accrual
          ? {
              accrualEnabled: true,
              article: item.accrual.article,
              accrualVat: String((item.accrual.vatKopecks || 0) / 100),
            }
          : {}),
      });
      setWeights(
        Object.fromEntries(
          list(item.weights).map((value) => [
            value.directionId,
            String(
              value.percent ??
                (value.basisPoints != null ? value.basisPoints / 100 : ''),
            ),
          ]),
        ),
      );
    }
    async function submit(event) {
      event.preventDefault();
      setError('');
      if (kind === 'companies') {
        const company = {
          ...draft,
          name: draft.name.trim(),
          inn: draft.inn.trim(),
          kpp:
            draft.organizationKind === 'legal_entity' ? draft.kpp.trim() : '',
          ogrn: draft.ogrn.trim(),
          fullName: draft.fullName.trim(),
          address: draft.address.trim(),
        };
        const result = await save('/companies', company, 'PUT');
        if (result) {
          setDraft(null);
          onCompanySaved?.(result, !draft.id);
        }
        return;
      }
      const body = { ...draft };
      try {
        if (
          kind === 'accounts' &&
          draft.statementBalance != null &&
          draft.statementBalance !== ''
        ) {
          const balance = String(draft.statementBalance).trim();
          body.statementBalanceKopecks =
            Number(balance.replace(',', '.')) === 0
              ? 0
              : kopecks(balance.startsWith('-') ? balance.slice(1) : balance) *
                (balance.startsWith('-') ? -1 : 1);
        }
        if (kind === 'classificationRules' && draft.ruleType === 'fuel') {
          body.pricing =
            draft.pricingType === 'markup'
              ? {
                  type: 'markup',
                  basisPoints: Math.round(Number(draft.markup) * 100),
                }
              : {
                  type: 'per_litre',
                  priceKopecksPerLitre: kopecks(draft.salePrice),
                };
          if (draft.saleVatRate !== '' && draft.saleVatRate != null)
            body.saleVatBasisPoints = Math.round(
              Number(draft.saleVatRate) * 100,
            );
          if (draft.costVatRate !== '' && draft.costVatRate != null)
            body.costVatBasisPoints = Math.round(
              Number(draft.costVatRate) * 100,
            );
        }
        if (kind === 'plans') {
          body.amountKopecks = kopecks(draft.amount);
          body.status = draft.status || 'planned';
          body.recurrence = {
            frequency: 'monthly',
            startDate: draft.recurrenceStart,
            ...(draft.recurrenceEnd ? { endDate: draft.recurrenceEnd } : {}),
            dayOfMonth: Number(draft.dayOfMonth),
          };
          if (draft.accrualEnabled)
            body.accrual = {
              kind: 'expense',
              article: draft.article,
              vatKopecks:
                draft.accrualVat && Number(draft.accrualVat) !== 0
                  ? kopecks(draft.accrualVat)
                  : 0,
            };
          else delete body.accrual;
        }
      } catch (reason) {
        setError(reason.message);
        return;
      }
      if (['counterparties', 'directions'].includes(kind)) {
        body.legalEntityIds = entities.map((item) => item.id);
        body.responsibilityScopeIds = [
          ...new Set(
            list(data.context?.scopes).map(
              (scope) => scope.responsibilityScopeId,
            ),
          ),
        ];
      }
      if (kind === 'accounts' || kind === 'counterparties')
        body.bankAccounts = draft.bankAccount
          ? [draft.bankAccount]
          : list(draft.bankAccounts);
      for (const key of [
        'statementBalance',
        'pricingType',
        'salePrice',
        'markup',
        'saleVatRate',
        'costVatRate',
        'amount',
        'monthly',
        'dayOfMonth',
        'accrualEnabled',
        'accrualVat',
        'recurrenceStart',
        'recurrenceEnd',
      ])
        delete body[key];
      if (kind === 'allocationRules') {
        body.weights = Object.entries(weights)
          .filter(([, value]) => value !== '' && Number(value) > 0)
          .map(([directionId, value]) => ({
            directionId,
            percent: Number(value),
          }));
        if (
          Math.abs(
            body.weights.reduce((sum, value) => sum + value.percent, 0) - 100,
          ) > 0.00001
        ) {
          setError('Сумма долей должна быть 100%.');
          return;
        }
      }
      for (const key of Object.keys(body))
        if (body[key] === '') delete body[key];
      const result = await save(`/catalogs/${kind}`, body, 'PUT');
      if (result) setDraft(null);
    }
    return h(
      'section',
      { className: 'fl-card' },
      h(
        'div',
        { className: 'fl-heading' },
        h(
          'nav',
          { className: 'fl-subtabs', 'aria-label': 'Финансовые справочники' },
          ...Object.entries(labels).map(([key, label]) =>
            button(
              label,
              () => {
                setKind(key);
                setDraft(null);
              },
              { key, 'aria-pressed': kind === key },
            ),
          ),
        ),
        canEdit &&
          button(
            kind === 'companies' ? 'Добавить компанию' : 'Добавить запись',
            () => edit(),
            { disabled: busy },
          ),
      ),
      kind === 'companies' &&
        h(
          'p',
          { className: 'muted' },
          'Ваши юридические лица и ИП. После сохранения компания доступна в финансовых операциях и отчётах.',
        ),
      kind === 'counterparties' &&
        h(
          'p',
          { className: 'muted' },
          'Одна организация может одновременно быть клиентом, перевозчиком и поставщиком. Справочник общий для доступных компаний.',
        ),
      kind === 'directions' &&
        h(
          'p',
          { className: 'muted' },
          'Направления общие для доступных компаний. Один фильтр собирает направление по всей группе.',
        ),
      kind === 'allocationRules' &&
        h(
          'p',
          { className: 'muted' },
          'Распределение общих расходов по направлениям. Новое правило действует с выбранной даты.',
        ),
      kind === 'directions' &&
        canEdit &&
        !items.length &&
        h(
          'div',
          { className: 'fl-toolbar' },
          button(
            'Добавить стартовые направления',
            async () => {
              for (const name of list(data.context?.directionSuggestions)) {
                const result = await save(
                  '/catalogs/directions',
                  {
                    name,
                    legalEntityId: suggestionEntity,
                    legalEntityIds: entities.map((item) => item.id),
                    responsibilityScopeIds: [
                      ...new Set(
                        list(data.context?.scopes).map(
                          (scope) => scope.responsibilityScopeId,
                        ),
                      ),
                    ],
                    version: 0,
                  },
                  'PUT',
                );
                if (!result) return;
              }
            },
            {
              disabled:
                busy ||
                !suggestionEntity ||
                !list(data.context?.directionSuggestions).length,
            },
          ),
          !suggestionEntity &&
            h(
              'span',
              { className: 'muted' },
              'Выберите свою компанию в фильтре.',
            ),
        ),
      draft &&
        h(
          'form',
          {
            onSubmit: submit,
            className: 'fl-catalog-form',
            'aria-label':
              kind === 'companies'
                ? 'Реквизиты своей компании'
                : 'Запись справочника',
          },
          h(
            'div',
            { className: 'fl-form-grid' },
            text('Название', draft.name, update('name'), {
              required: true,
              maxLength: 200,
              disabled: busy,
            }),
            kind !== 'companies' &&
              select(
                'Компания записи',
                draft.legalEntityId,
                update('legalEntityId'),
                entities,
                'Выберите компанию',
                { required: true, disabled: busy },
              ),
            kind === 'companies' &&
              h(
                React.Fragment,
                null,
                select(
                  'Тип компании',
                  draft.organizationKind,
                  (value) =>
                    setDraft((old) => ({
                      ...old,
                      organizationKind: value,
                      ...(value === 'sole_proprietor' ? { kpp: '' } : {}),
                    })),
                  [
                    { id: 'legal_entity', name: 'Юридическое лицо' },
                    {
                      id: 'sole_proprietor',
                      name: 'Индивидуальный предприниматель',
                    },
                  ],
                  'Выберите тип',
                  { required: true, disabled: busy },
                ),
                text('ИНН компании', draft.inn, update('inn'), {
                  required: true,
                  inputMode: 'numeric',
                  pattern:
                    draft.organizationKind === 'sole_proprietor'
                      ? '[0-9]{12}'
                      : '[0-9]{10}',
                  maxLength:
                    draft.organizationKind === 'sole_proprietor' ? 12 : 10,
                  disabled: busy,
                }),
                draft.organizationKind === 'legal_entity' &&
                  text('КПП компании', draft.kpp, update('kpp'), {
                    inputMode: 'numeric',
                    pattern: '[0-9]{9}',
                    maxLength: 9,
                    disabled: busy,
                  }),
                text(
                  draft.organizationKind === 'sole_proprietor'
                    ? 'ОГРНИП'
                    : 'ОГРН',
                  draft.ogrn,
                  update('ogrn'),
                  {
                    inputMode: 'numeric',
                    pattern:
                      draft.organizationKind === 'sole_proprietor'
                        ? '[0-9]{15}'
                        : '[0-9]{13}',
                    maxLength:
                      draft.organizationKind === 'sole_proprietor' ? 15 : 13,
                    disabled: busy,
                  },
                ),
                text(
                  'Полное наименование',
                  draft.fullName,
                  update('fullName'),
                  { maxLength: 500, disabled: busy },
                ),
                text('Юридический адрес', draft.address, update('address'), {
                  maxLength: 1000,
                  disabled: busy,
                }),
              ),
            kind === 'counterparties' &&
              h(
                React.Fragment,
                null,
                text('ИНН', draft.inn, update('inn'), {
                  inputMode: 'numeric',
                  pattern: '[0-9]{10}|[0-9]{12}',
                  disabled: busy,
                }),
                text('КПП', draft.kpp, update('kpp'), {
                  inputMode: 'numeric',
                  pattern: '[0-9]{9}',
                  disabled: busy,
                }),
                text(
                  'Банковский счёт',
                  draft.bankAccount,
                  update('bankAccount'),
                  { inputMode: 'numeric', disabled: busy },
                ),
                h(
                  'fieldset',
                  { className: 'fl-role-options', disabled: busy },
                  h('legend', null, 'Роли контрагента'),
                  ...[
                    ['customer', 'Клиент'],
                    ['carrier', 'Перевозчик'],
                    ['fuel_customer', 'Покупатель топлива'],
                    ['supplier', 'Поставщик'],
                  ].map(([id, label]) =>
                    h(
                      'label',
                      { key: id, className: 'fl-check' },
                      h('input', {
                        type: 'checkbox',
                        checked: list(draft.roles).includes(id),
                        onChange: (event) =>
                          update('roles')(
                            event.target.checked
                              ? [...list(draft.roles), id]
                              : list(draft.roles).filter(
                                  (value) => value !== id,
                                ),
                          ),
                      }),
                      label,
                    ),
                  ),
                ),
              ),
            kind === 'accounts' &&
              h(
                React.Fragment,
                null,
                select(
                  'Вид счёта',
                  draft.type,
                  update('type'),
                  [
                    { id: 'bank', name: 'Банковский счёт' },
                    { id: 'cash', name: 'Касса' },
                  ],
                  null,
                  { disabled: busy },
                ),
                text('Номер счёта', draft.bankAccount, update('bankAccount'), {
                  disabled: busy,
                }),
                text(
                  'Дата остатка по выписке',
                  draft.statementDate,
                  update('statementDate'),
                  {
                    type: 'date',
                    required:
                      draft.statementBalance != null &&
                      draft.statementBalance !== '',
                    disabled: busy,
                  },
                ),
                text(
                  'Остаток по выписке, ₽',
                  draft.statementBalance,
                  update('statementBalance'),
                  {
                    inputMode: 'decimal',
                    required: Boolean(draft.statementDate),
                    disabled: busy,
                  },
                ),
                h(
                  'p',
                  { className: 'fl-note' },
                  'Укажите остаток из независимой выписки или пересчёта кассы. Отрицательная сумма допустима для овердрафта.',
                ),
              ),
            kind === 'classificationRules' &&
              h(
                React.Fragment,
                null,
                select(
                  'Вид правила',
                  draft.ruleType,
                  update('ruleType'),
                  [
                    { id: 'classification', name: 'Разноска операции' },
                    { id: 'fuel', name: 'Топливная карта и цена' },
                  ],
                  null,
                  { disabled: busy },
                ),
                select(
                  'Контрагент правила',
                  draft.counterpartyId,
                  update('counterpartyId'),
                  list(data.catalogs?.counterparties),
                  draft.ruleType === 'fuel'
                    ? 'Покупатель топлива'
                    : 'Любой контрагент',
                  { required: draft.ruleType === 'fuel', disabled: busy },
                ),
                select(
                  'Направление правила',
                  draft.directionId,
                  update('directionId'),
                  list(data.catalogs?.directions).filter(
                    (item) => draft.ruleType !== 'fuel' || !item.system,
                  ),
                  'Выберите направление',
                  { required: draft.ruleType === 'fuel', disabled: busy },
                ),
                text(
                  'Действует с',
                  draft.effectiveFrom,
                  update('effectiveFrom'),
                  { type: 'date', required: true, disabled: busy },
                ),
                text('Действует по', draft.effectiveTo, update('effectiveTo'), {
                  type: 'date',
                  disabled: busy,
                }),
                draft.ruleType !== 'fuel'
                  ? h(
                      React.Fragment,
                      null,
                      text(
                        'В назначении содержится',
                        draft.contains,
                        update('contains'),
                        { disabled: busy },
                      ),
                      text(
                        'Статья по правилу',
                        draft.article,
                        update('article'),
                        { disabled: busy },
                      ),
                    )
                  : h(
                      React.Fragment,
                      null,
                      select(
                        'Оператор карты',
                        draft.provider,
                        update('provider'),
                        [
                          { id: 'RN', name: 'Роснефть' },
                          { id: 'LC', name: 'Лукойл' },
                        ],
                        'Выберите оператора',
                        { required: true, disabled: busy },
                      ),
                      text(
                        'Номер топливной карты',
                        draft.card,
                        update('card'),
                        { required: true, disabled: busy },
                      ),
                      select(
                        'Поставщик по карте',
                        draft.supplierCounterpartyId,
                        update('supplierCounterpartyId'),
                        list(data.catalogs?.counterparties),
                        'Выберите поставщика',
                        { required: true, disabled: busy },
                      ),
                      text(
                        'Менеджер',
                        draft.managerName,
                        update('managerName'),
                        { disabled: busy },
                      ),
                      select(
                        'Цена продажи',
                        draft.pricingType,
                        update('pricingType'),
                        [
                          { id: 'per_litre', name: 'Цена за литр' },
                          { id: 'markup', name: 'Наценка к закупке' },
                        ],
                        null,
                        { disabled: busy },
                      ),
                      draft.pricingType === 'markup'
                        ? text('Наценка, %', draft.markup, update('markup'), {
                            type: 'number',
                            min: 0,
                            step: '0.01',
                            required: true,
                            disabled: busy,
                          })
                        : text(
                            'Цена литра, ₽',
                            draft.salePrice,
                            update('salePrice'),
                            {
                              inputMode: 'decimal',
                              required: true,
                              disabled: busy,
                            },
                          ),
                      text(
                        'НДС продажи, %',
                        draft.saleVatRate ??
                          (draft.saleVatBasisPoints != null
                            ? draft.saleVatBasisPoints / 100
                            : ''),
                        update('saleVatRate'),
                        {
                          type: 'number',
                          min: 0,
                          max: 100,
                          step: '0.01',
                          disabled: busy,
                        },
                      ),
                      text(
                        'НДС закупки, %',
                        draft.costVatRate ??
                          (draft.costVatBasisPoints != null
                            ? draft.costVatBasisPoints / 100
                            : ''),
                        update('costVatRate'),
                        {
                          type: 'number',
                          min: 0,
                          max: 100,
                          step: '0.01',
                          disabled: busy,
                        },
                      ),
                      select(
                        'Расчёты с поставщиком',
                        draft.purchaseMode || 'payable',
                        update('purchaseMode'),
                        [
                          { id: 'payable', name: 'С задолженностью' },
                          { id: 'advance', name: 'За счёт аванса' },
                        ],
                        null,
                        { disabled: busy },
                      ),
                    ),
              ),
            kind === 'plans' &&
              h(
                React.Fragment,
                null,
                select(
                  'Состояние графика',
                  draft.status || 'planned',
                  update('status'),
                  [
                    { id: 'planned', name: 'Предварительный план' },
                    {
                      id: 'approved',
                      name: 'Согласован: готовить начисления к проверке',
                    },
                    { id: 'cancelled', name: 'Остановлен' },
                  ],
                  null,
                  { disabled: busy },
                ),
                scopes.length > 1 &&
                  select(
                    'Проект графика',
                    draft.responsibilityScopeId,
                    update('responsibilityScopeId'),
                    scopes.map((scope) => ({
                      id: scope.responsibilityScopeId,
                      name: [scope.projectName, scope.scopeName]
                        .filter(Boolean)
                        .join(' · '),
                    })),
                    'Определить по счёту',
                    { required: !draft.cashAccountId, disabled: busy },
                  ),
                select(
                  'Поток регулярного платежа',
                  draft.flow,
                  update('flow'),
                  [
                    { id: 'out', name: 'Выплата' },
                    { id: 'in', name: 'Поступление' },
                  ],
                  null,
                  { disabled: busy },
                ),
                text('Ежемесячная сумма, ₽', draft.amount, update('amount'), {
                  inputMode: 'decimal',
                  required: true,
                  disabled: busy,
                }),
                text(
                  'Начало графика',
                  draft.recurrenceStart,
                  update('recurrenceStart'),
                  { type: 'date', required: true, disabled: busy },
                ),
                text(
                  'Окончание графика',
                  draft.recurrenceEnd,
                  update('recurrenceEnd'),
                  { type: 'date', disabled: busy },
                ),
                text('Число месяца', draft.dayOfMonth, update('dayOfMonth'), {
                  type: 'number',
                  min: 1,
                  max: 31,
                  required: true,
                  disabled: busy,
                }),
                select(
                  'Контрагент графика',
                  draft.counterpartyId,
                  update('counterpartyId'),
                  list(data.catalogs?.counterparties),
                  'Не определён',
                  { disabled: busy },
                ),
                select(
                  'Направление графика',
                  draft.directionId,
                  update('directionId'),
                  list(data.catalogs?.directions),
                  'Не назначено',
                  { disabled: busy },
                ),
                select(
                  'Счёт графика',
                  draft.cashAccountId,
                  update('cashAccountId'),
                  list(data.catalogs?.accounts).filter(
                    (item) => item.legalEntityId === draft.legalEntityId,
                  ),
                  'Не определён',
                  { disabled: busy },
                ),
                h(
                  'label',
                  { className: 'fl-check' },
                  h('input', {
                    type: 'checkbox',
                    checked: draft.accrualEnabled,
                    disabled: busy,
                    onChange: (event) =>
                      update('accrualEnabled')(event.target.checked),
                  }),
                  'Начислять расход за наступивший период',
                ),
                draft.accrualEnabled &&
                  h(
                    React.Fragment,
                    null,
                    text(
                      'Статья начисления',
                      draft.article,
                      update('article'),
                      { required: true, disabled: busy },
                    ),
                    text(
                      'НДС регулярного расхода, ₽',
                      draft.accrualVat,
                      update('accrualVat'),
                      { inputMode: 'decimal', disabled: busy },
                    ),
                  ),
              ),
            kind === 'allocationRules' &&
              h(
                React.Fragment,
                null,
                text(
                  'Действует с',
                  draft.effectiveFrom,
                  update('effectiveFrom'),
                  { type: 'date', required: true, disabled: busy },
                ),
                text(
                  'Статья общих расходов',
                  draft.article,
                  update('article'),
                  { required: true, disabled: busy },
                ),
                ...list(data.catalogs?.directions)
                  .filter((item) => !item.archived && !item.system)
                  .map((item) =>
                    text(
                      `Доля: ${itemName(item)}, %`,
                      weights[item.id] || '',
                      (value) =>
                        setWeights((old) => ({ ...old, [item.id]: value })),
                      {
                        type: 'number',
                        min: 0,
                        max: 100,
                        step: '0.01',
                        disabled: busy,
                      },
                    ),
                  ),
              ),
          ),
          error && h('p', { role: 'alert', className: 'fl-error' }, error),
          h(
            'div',
            { className: 'fl-toolbar' },
            h(
              'button',
              { type: 'submit', className: 'button', disabled: busy },
              kind === 'companies' ? 'Сохранить компанию' : 'Сохранить запись',
            ),
            button('Отмена', () => setDraft(null), { disabled: busy }),
          ),
        ),
      items.length
        ? table(
            labels[kind],
            kind === 'companies'
              ? ['Название', 'Реквизиты', 'Тип', '']
              : ['Название', 'Реквизиты / условия', 'Состояние', ''],
            items.map((item) =>
              h(
                'tr',
                { key: item.id },
                h('td', null, itemName(item)),
                h(
                  'td',
                  null,
                  kind === 'allocationRules'
                    ? `${item.article || 'Все общие расходы'} · с ${dateLabel(item.effectiveFrom)}`
                    : [
                        item.inn,
                        item.kpp,
                        item.bankAccount,
                        kind === 'accounts' &&
                          (item.type === 'cash' ? 'Касса' : 'Банк'),
                      ]
                        .filter(Boolean)
                        .join(' · ') || '—',
                ),
                h(
                  'td',
                  null,
                  kind === 'companies'
                    ? {
                        legal_entity: 'Юридическое лицо',
                        sole_proprietor: 'ИП',
                      }[item.organizationKind] || 'Тип не указан'
                    : item.archived
                      ? 'Архив'
                      : 'Действует',
                ),
                h(
                  'td',
                  null,
                  canEdit &&
                    (kind === 'companies'
                      ? item.canEdit === true
                      : item.canEdit !== false) &&
                    h(
                      'div',
                      { className: 'fl-row-actions' },
                      button('Изменить', () => edit(item), { disabled: busy }),
                      kind !== 'companies' &&
                        button(
                          item.archived ? 'Восстановить' : 'В архив',
                          () =>
                            save(
                              `/catalogs/${kind}`,
                              { ...item, archived: !item.archived },
                              'PUT',
                            ),
                          { disabled: busy },
                        ),
                    ),
                ),
              ),
            ),
          )
        : empty('Записей пока нет.'),
    );
  }

  function ImportCorrections({
    row,
    values,
    override,
    data,
    busy,
    duplicateConflict,
  }) {
    const key = row.rowNumber,
      operation = row.operation || {},
      candidate = row.existingOperationId || row.candidateDuplicateOperationId;
    const fixedCash =
      ['bank', 'cash'].includes(operation.source?.system) &&
      ['cash_in', 'cash_out'].includes(operation.kind) &&
      operation.date &&
      Number.isSafeInteger(operation.amountKopecks);
    const cashKinds =
      operation.kind === 'cash_in'
        ? ['cash_in', 'payment_in', 'customer_advance']
        : ['cash_out', 'payment_out', 'supplier_advance'];
    const current = (name) => values[name] ?? operation[name] ?? '';
    const update = (name) => (value) => override(key, name, value);
    const monetary = (label, name, property) =>
      text(
        `${label} строки ${key}, ₽`,
        values[name] ??
          (operation[property] == null
            ? ''
            : String(operation[property] / 100)),
        update(name),
        {
          inputMode: 'decimal',
          disabled: busy || Boolean(fixedCash && property === 'amountKopecks'),
        },
      );
    return h(
      'details',
      null,
      h('summary', null, 'Проверить и исправить'),
      h(
        'div',
        { className: 'fl-form-grid' },
        select(
          `Вид строки ${key}`,
          current('kind'),
          update('kind'),
          Object.entries(KIND_LABELS)
            .filter(([id]) =>
              fixedCash
                ? cashKinds.includes(id)
                : !['opening', 'reversal', 'settlement', 'setoff'].includes(id),
            )
            .map(([id, name]) => ({ id, name })),
          null,
          { disabled: busy },
        ),
        text(`Дата строки ${key}`, current('date'), update('date'), {
          type: 'date',
          disabled: busy || Boolean(fixedCash),
        }),
        monetary('Сумма', 'amountText', 'amountKopecks'),
        monetary('НДС', 'vatText', 'vatKopecks'),
        text(`Статья строки ${key}`, current('article'), update('article'), {
          disabled: busy,
        }),
        text(
          `Плановая дата строки ${key}`,
          current('expectedDate') || current('plannedDate'),
          update('plannedDate'),
          { type: 'date', disabled: busy },
        ),
        select(
          `Подтверждение строки ${key}`,
          current('status') ||
            (operation.confirmation === 'provisional'
              ? 'provisional'
              : 'confirmed'),
          update('status'),
          [
            { id: 'confirmed', name: 'Подтверждено документом' },
            { id: 'provisional', name: 'Предварительно' },
          ],
          null,
          { disabled: busy },
        ),
        String(current('kind')).startsWith('fuel_') &&
          h(
            React.Fragment,
            null,
            select(
              `Поставщик топлива строки ${key}`,
              current('supplierCounterpartyId'),
              update('supplierCounterpartyId'),
              list(data.catalogs?.counterparties),
              'Выберите поставщика',
              { disabled: busy },
            ),
            monetary('Стоимость топлива', 'costText', 'costKopecks'),
            monetary('НДС закупки', 'costVatText', 'costVatKopecks'),
            select(
              `Расчёты по топливу строки ${key}`,
              current('purchaseMode') || 'payable',
              update('purchaseMode'),
              [
                { id: 'payable', name: 'Задолженность поставщику' },
                { id: 'advance', name: 'За счёт аванса' },
                { id: 'inventory', name: 'Из запасов' },
              ],
              null,
              { disabled: busy },
            ),
          ),
        (duplicateConflict ||
          candidate ||
          list(row.issues).some((issue) =>
            /дубл|повтор|уже.*учт|уже.*загруж|похож/i.test(String(issue)),
          )) &&
          h(
            'label',
            { className: 'fl-check' },
            h('input', {
              type: 'checkbox',
              checked: values.duplicateDecision === 'distinct',
              disabled: busy,
              onChange: (event) =>
                override(
                  key,
                  'duplicateDecision',
                  event.target.checked ? 'distinct' : null,
                ),
            }),
            'Подтверждаю отдельную операцию, несмотря на совпадение даты и суммы',
          ),
        candidate &&
          h(
            'label',
            { className: 'fl-check' },
            h('input', {
              type: 'checkbox',
              checked: values.existingOperationId === candidate,
              disabled: busy,
              onChange: (event) =>
                override(
                  key,
                  'existingOperationId',
                  event.target.checked ? candidate : null,
                ),
            }),
            'Связать с ранее учтённой операцией из этого источника',
          ),
      ),
    );
  }

  function ImportForm({
    data,
    legalEntityId,
    busy,
    save,
    close,
    native = false,
    filters,
    serverError,
  }) {
    const [sourceType, setSourceType] = useState(native ? 'native' : 'bank'),
      [file, setFile] = useState(null),
      [preview, setPreview] = useState(null),
      [selected, setSelected] = useState([]),
      [overrides, setOverrides] = useState({}),
      [localError, setLocalError] = useState(''),
      [reading, setReading] = useState(false);
    const [entity, setEntity] = useState(
      legalEntityId ||
        (list(data.context?.legalEntities).length === 1
          ? data.context.legalEntities[0].id
          : ''),
    );
    const [reviewed, setReviewed] = useState(false),
      [bulk, setBulk] = useState({});
    const scopes = list(data.context?.scopes).filter(
      (scope) => scope.legalEntityId === entity,
    );
    const bulkChange = (key) => (value) =>
      setBulk((old) => ({ ...old, [key]: value }));
    function reset() {
      setPreview(null);
      setSelected([]);
      setOverrides({});
      setLocalError('');
      setReviewed(false);
    }
    async function read() {
      if (!file && sourceType !== 'native') return;
      setLocalError('');
      setReading(true);
      try {
        if (sourceType === 'native') {
          const result = await save(
            '/sources/preview',
            { legalEntityId: entity, from: filters.from, to: filters.to },
            'POST',
            false,
          );
          if (result) {
            setPreview(result);
            setSelected([]);
          }
          return;
        }
        if (file.size > 20 * 1024 * 1024)
          throw new Error('Файл больше 20 МБ. Разделите выгрузку на периоды.');
        const contentBase64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(',')[1]);
          reader.onerror = () =>
            reject(new Error('Не удалось прочитать файл.'));
          reader.readAsDataURL(file);
        });
        const result = await save(
          '/imports/preview',
          {
            sourceType,
            fileName: file.name,
            contentBase64,
            ...(entity ? { legalEntityId: entity } : {}),
          },
          'POST',
          false,
        );
        if (result) {
          setPreview(result);
          setSelected([]);
        }
      } catch (error) {
        setLocalError(error.message);
      } finally {
        setReading(false);
      }
    }
    const rows = list(preview?.rows),
      committed = list(preview?.committedRows).map((item) => item.rowNumber),
      selectable = rows.filter((row) => !committed.includes(row.rowNumber));
    const override = (number, key, value) =>
      setOverrides((old) => ({
        ...old,
        [number]: { ...old[number], [key]: value === '' ? null : value },
      }));
    async function page(offset) {
      const value = await save(
        `/imports/${preview.id}?offset=${offset}&limit=200`,
        null,
        'GET',
        false,
      );
      if (value) {
        setPreview(value);
        setSelected([]);
        setReviewed(false);
      }
    }
    async function commit() {
      setLocalError('');
      try {
        const mapped = Object.fromEntries(
          selected.map((key) => {
            const { amountText, vatText, costText, costVatText, ...patch } =
              overrides[key] || {};
            for (const [value, property] of [
              [amountText, 'amountKopecks'],
              [vatText, 'vatKopecks'],
              [costText, 'costKopecks'],
              [costVatText, 'costVatKopecks'],
            ]) {
              if (value != null && value !== '')
                patch[property] =
                  String(value).trim() === '0' &&
                  property.toLowerCase().includes('vat')
                    ? 0
                    : kopecks(value);
            }
            return [key, { ...patch, reviewed: true }];
          }),
        );
        const result = await save(`/imports/${preview.id}/commit`, {
          selectedRows: selected,
          overrides: mapped,
        });
        if (result) await page(preview.offset || 0);
      } catch (reason) {
        setLocalError(errorMessage(reason));
      }
    }
    return h(
      'div',
      null,
      h(
        'p',
        { className: 'fl-note' },
        'Сначала проверка строк и сопоставление. Файл сам по себе не подтверждает оплату и получение услуги.',
      ),
      h(
        'div',
        { className: 'fl-form-grid' },
        select(
          'Источник файла',
          sourceType,
          (value) => {
            setSourceType(value);
            reset();
          },
          [
            { id: 'bank', name: 'Банковская выписка' },
            { id: 'cash', name: 'Касса' },
            { id: 'suppliers', name: 'Счета поставщиков' },
            { id: 'fuel', name: 'Пролив топлива RN / LC' },
            { id: 'one_c', name: 'Документы 1С' },
            { id: 'native', name: 'Данные приложения и регулярные начисления' },
          ],
          null,
          { disabled: busy || reading },
        ),
        select(
          'Компания импорта',
          entity,
          (value) => {
            setEntity(value);
            reset();
          },
          list(data.context?.legalEntities),
          'Выберите компанию',
          { disabled: busy || reading },
        ),
        sourceType !== 'native' &&
          field(
            'Файл',
            h('input', {
              type: 'file',
              'aria-label': 'Файл',
              accept: '.xlsx,.csv,.txt,.json',
              disabled: busy || reading,
              onChange: (event) => {
                setFile(event.target.files?.[0] || null);
                reset();
              },
            }),
          ),
      ),
      button(
        reading
          ? 'Проверяем…'
          : sourceType === 'native'
            ? 'Проверить данные приложения'
            : 'Проверить файл',
        read,
        {
          disabled:
            busy || reading || !entity || (!file && sourceType !== 'native'),
        },
      ),
      localError &&
        h('p', { role: 'alert', className: 'fl-error' }, localError),
      preview &&
        h(
          'div',
          { className: 'fl-import-preview' },
          h(
            'h3',
            null,
            `Предварительная проверка · ${preview.totalRows ?? rows.length} строк`,
          ),
          h(
            'p',
            { className: 'muted' },
            `Показаны строки ${(preview.offset || 0) + 1}–${(preview.offset || 0) + rows.length}. Выбор относится к текущей странице.`,
          ),
          list(preview.ignoredSheets).length > 0 &&
            h(
              'p',
              { className: 'muted' },
              `Пропущены листы: ${preview.ignoredSheets.map((item) => (typeof item === 'string' ? item : item.name || item.sheet)).join(', ')}`,
            ),
          rows.length > 0 &&
            h(
              'div',
              { className: 'fl-toolbar fl-bulk' },
              h(
                'label',
                { className: 'fl-check' },
                h('input', {
                  type: 'checkbox',
                  'aria-label': 'Выбрать строки страницы',
                  checked:
                    selectable.length > 0 &&
                    selectable.every((row) => selected.includes(row.rowNumber)),
                  disabled: busy || !selectable.length,
                  onChange: (event) =>
                    setSelected(
                      event.target.checked
                        ? selectable.map((row) => row.rowNumber)
                        : [],
                    ),
                }),
                `Выбрано: ${selected.length}`,
              ),
              select(
                'Контрагент выбранных строк',
                bulk.counterpartyId,
                bulkChange('counterpartyId'),
                list(data.catalogs?.counterparties),
                'Не менять',
                { disabled: busy },
              ),
              select(
                'Счёт выбранных строк',
                bulk.cashAccountId,
                bulkChange('cashAccountId'),
                list(data.catalogs?.accounts).filter(
                  (item) => item.legalEntityId === entity,
                ),
                'Не менять',
                { disabled: busy },
              ),
              select(
                'Направление выбранных строк',
                bulk.directionId,
                bulkChange('directionId'),
                list(data.catalogs?.directions),
                'Не менять',
                { disabled: busy },
              ),
              scopes.length > 1 &&
                select(
                  'Проект выбранных строк',
                  bulk.responsibilityScopeId,
                  bulkChange('responsibilityScopeId'),
                  scopes.map((scope) => ({
                    id: scope.responsibilityScopeId,
                    name: [scope.projectName, scope.scopeName]
                      .filter(Boolean)
                      .join(' · '),
                  })),
                  'Определить из источника',
                  { disabled: busy },
                ),
              button(
                'Применить к строкам',
                () => {
                  const patch = Object.fromEntries(
                    Object.entries(bulk).filter(([, value]) => value),
                  );
                  setOverrides((old) => ({
                    ...old,
                    ...Object.fromEntries(
                      selected.map((key) => [key, { ...old[key], ...patch }]),
                    ),
                  }));
                },
                {
                  disabled:
                    busy ||
                    !selected.length ||
                    !Object.values(bulk).some(Boolean),
                },
              ),
            ),
          rows.length
            ? table(
                'Предварительная проверка импорта',
                [
                  'Выбор',
                  'Источник',
                  'Назначение',
                  'Сумма',
                  'Контрагент',
                  'Счёт',
                  'Направление',
                  'Замечания',
                ],
                rows.map((row) => {
                  const key = row.rowNumber,
                    values = overrides[key] || {},
                    operation = row.operation || {};
                  return h(
                    'tr',
                    { key },
                    h(
                      'td',
                      null,
                      h('input', {
                        type: 'checkbox',
                        checked: selected.includes(key),
                        disabled: busy || committed.includes(key),
                        'aria-label': `Импортировать строку ${key}`,
                        onChange: (event) =>
                          setSelected((old) =>
                            event.target.checked
                              ? [...old, key]
                              : old.filter((value) => value !== key),
                          ),
                      }),
                    ),
                    h(
                      'td',
                      null,
                      `${row.sourceSheet || ''} ${row.sourceRow || key}`,
                      committed.includes(key) && h('small', null, 'Перенесено'),
                    ),
                    h(
                      'td',
                      null,
                      operation.description ||
                        row.description ||
                        'Без назначения',
                    ),
                    h(
                      'td',
                      { className: 'fl-money' },
                      money(operation.amountKopecks),
                    ),
                    h(
                      'td',
                      null,
                      select(
                        `Контрагент строки ${key}`,
                        values.counterpartyId || operation.counterpartyId,
                        (value) => override(key, 'counterpartyId', value),
                        list(data.catalogs?.counterparties),
                        row.counterparty?.name || 'Выберите',
                        { disabled: busy },
                      ),
                    ),
                    h(
                      'td',
                      null,
                      select(
                        `Счёт строки ${key}`,
                        values.cashAccountId || operation.cashAccountId,
                        (value) => override(key, 'cashAccountId', value),
                        list(data.catalogs?.accounts),
                        'Выберите',
                        { disabled: busy },
                      ),
                    ),
                    h(
                      'td',
                      null,
                      select(
                        `Направление строки ${key}`,
                        values.directionId !== undefined
                          ? values.directionId
                          : operation.directionId,
                        (value) => override(key, 'directionId', value),
                        list(data.catalogs?.directions),
                        'Не определено',
                        { disabled: busy },
                      ),
                    ),
                    h(
                      'td',
                      null,
                      h(ImportCorrections, {
                        row,
                        values,
                        override,
                        data,
                        duplicateConflict:
                          /FINANCE_IMPORT_POSSIBLE_DUPLICATE|похожая ранее загруженная/i.test(
                            serverError || '',
                          ),
                        busy: busy || committed.includes(key),
                      }),
                      ...list(row.issues).map((issue, i) =>
                        h(
                          'p',
                          {
                            key: i,
                            className: row.status === 'error' ? 'fl-error' : '',
                          },
                          typeof issue === 'string'
                            ? issue
                            : issue.message || issue.code,
                        ),
                      ),
                      select(
                        `Связать строку ${key}`,
                        values.existingOperationId,
                        (value) => override(key, 'existingOperationId', value),
                        list(data.operations?.items)
                          .filter((item) => !item.reversed)
                          .map((item) => ({
                            id: item.id,
                            name: item.description || item.id,
                          })),
                        'Новая запись',
                        { disabled: busy },
                      ),
                    ),
                  );
                }),
              )
            : empty('Нет строк для переноса.'),
          h(
            'div',
            { className: 'fl-toolbar' },
            button(
              'Предыдущие строки',
              () => page(Math.max(0, (preview.offset || 0) - 200)),
              { disabled: busy || !preview.offset },
            ),
            button(
              'Следующие строки',
              () => page((preview.offset || 0) + 200),
              {
                disabled:
                  busy ||
                  (preview.offset || 0) + rows.length >=
                    (preview.totalRows || rows.length),
              },
            ),
          ),
          h(
            'label',
            { className: 'fl-check' },
            h('input', {
              type: 'checkbox',
              checked: reviewed,
              disabled: busy,
              onChange: (event) => setReviewed(event.target.checked),
            }),
            'Замечания выбранных строк проверены, соответствия подтверждены',
          ),
          h(
            'div',
            { className: 'fl-toolbar' },
            button(`Перенести выбранные (${selected.length})`, commit, {
              disabled: busy || !selected.length || !reviewed,
            }),
            button('Закончить проверку', close, { disabled: busy }),
          ),
        ),
    );
  }

  function PeriodForm({ data, filters, busy, save, close }) {
    const [reason, setReason] = useState(''),
      [openingConfirmed, setOpeningConfirmed] = useState(false),
      [sourcesReconciled, setSourcesReconciled] = useState(false);
    const [entity, setEntity] = useState(
      filters.legalEntityId ||
        (list(data.context?.legalEntities).length === 1
          ? data.context.legalEntities[0].id
          : ''),
    );
    const closed = list(data.periods).find(
      (period) =>
        !period.reopenedAt &&
        period.legalEntityId === entity &&
        dateInput(period.from || period.startDate) === filters.from &&
        dateInput(period.to || period.endDate) === filters.to,
    );
    return h(
      'form',
      {
        onSubmit: async (event) => {
          event.preventDefault();
          const result = await save(
            closed ? '/periods/reopen' : '/periods/close',
            {
              ...filters,
              legalEntityId: entity,
              reason,
              ...(closed
                ? { id: closed.id, version: closed.version }
                : {
                    openingBalancesVerified: openingConfirmed,
                    sourcesReconciled,
                  }),
            },
          );
          if (result) close();
        },
      },
      h(
        'p',
        { className: 'fl-note' },
        `${dateLabel(filters.from)} — ${dateLabel(filters.to)}. ${closed ? 'Переоткрытие сохраняет историю предыдущего закрытия.' : 'Сервер проверит начальные остатки, неразобранные операции и расхождения.'}`,
      ),
      select(
        'Компания периода',
        entity,
        setEntity,
        list(data.context?.legalEntities),
        'Выберите компанию',
        { required: true, disabled: busy },
      ),
      !closed &&
        h(
          'label',
          { className: 'fl-check' },
          h('input', {
            type: 'checkbox',
            checked: openingConfirmed,
            required: true,
            disabled: busy,
            onChange: (event) => setOpeningConfirmed(event.target.checked),
          }),
          'Начальные остатки сверены с источниками',
        ),
      text('Основание', reason, setReason, {
        required: true,
        minLength: 3,
        disabled: busy,
      }),
      !closed &&
        h(
          'label',
          { className: 'fl-check' },
          h('input', {
            type: 'checkbox',
            checked: sourcesReconciled,
            required: true,
            disabled: busy,
            onChange: (event) => setSourcesReconciled(event.target.checked),
          }),
          'Полнота источников проверена, расхождения разобраны',
        ),
      h(
        'button',
        {
          type: 'submit',
          className: 'button',
          disabled: busy || (closed && !data.context?.permissions?.canReopen),
        },
        closed ? 'Переоткрыть период' : 'Проверить и закрыть',
      ),
    );
  }

  function PlanForm({ data, legalEntityId, busy, save, close }) {
    const entities = list(data.context?.legalEntities),
      [error, setError] = useState('');
    const [draft, setDraft] = useState({
      name: '',
      legalEntityId:
        legalEntityId || (entities.length === 1 ? entities[0].id : ''),
      amount: '',
      flow: 'out',
      expectedDate: '',
      dueDate: '',
      status: 'planned',
      counterpartyId: '',
      directionId: '',
      cashAccountId: '',
      documentId: '',
      responsibilityScopeId: '',
    });
    const update = (key) => (value) =>
      setDraft((old) => ({ ...old, [key]: value }));
    const docs = [
      ...list(data.reports?.receivables),
      ...list(data.reports?.payables),
    ].filter(
      (item) =>
        item.legalEntityId === draft.legalEntityId &&
        item.side === (draft.flow === 'in' ? 'receivable' : 'payable'),
    );
    const scopes = list(data.context?.scopes).filter(
      (item) => item.legalEntityId === draft.legalEntityId,
    );
    return h(
      'form',
      {
        onSubmit: async (event) => {
          event.preventDefault();
          setError('');
          try {
            const { amount, ...fields } = draft;
            const body = {
              ...Object.fromEntries(
                Object.entries(fields).filter(([, value]) => value !== ''),
              ),
              amountKopecks: kopecks(amount),
              version: 0,
            };
            const result = await save('/catalogs/plans', body, 'PUT');
            if (result) close();
          } catch (reason) {
            setError(reason.message);
          }
        },
      },
      h(
        'div',
        { className: 'fl-form-grid' },
        text('Назначение плана', draft.name, update('name'), {
          required: true,
          disabled: busy,
        }),
        select(
          'Компания плана',
          draft.legalEntityId,
          update('legalEntityId'),
          entities,
          'Выберите компанию',
          { required: true, disabled: busy },
        ),
        select(
          'Движение',
          draft.flow,
          update('flow'),
          [
            { id: 'in', name: 'Поступление' },
            { id: 'out', name: 'Выплата' },
          ],
          null,
          { disabled: busy },
        ),
        text('Плановая сумма, ₽', draft.amount, update('amount'), {
          inputMode: 'decimal',
          required: true,
          disabled: busy,
        }),
        text('Ожидаемая дата', draft.expectedDate, update('expectedDate'), {
          type: 'date',
          disabled: busy,
        }),
        text('Договорный срок', draft.dueDate, update('dueDate'), {
          type: 'date',
          disabled: busy,
        }),
        select(
          'Контрагент плана',
          draft.counterpartyId,
          update('counterpartyId'),
          list(data.catalogs?.counterparties),
          'Не определён',
          { disabled: busy },
        ),
        select(
          'Направление плана',
          draft.directionId,
          update('directionId'),
          list(data.catalogs?.directions),
          'Не назначено',
          { disabled: busy },
        ),
        select(
          'Счёт плана',
          draft.cashAccountId,
          update('cashAccountId'),
          list(data.catalogs?.accounts).filter(
            (item) => item.legalEntityId === draft.legalEntityId,
          ),
          'Не назначен',
          { disabled: busy },
        ),
        select(
          'Связанный документ',
          draft.documentId,
          update('documentId'),
          docs.map((item) => ({
            id: item.documentId,
            name: `${item.description || 'Документ'} · ${money(item.remainingKopecks)}`,
          })),
          'Разовый план без документа',
          { disabled: busy },
        ),
        select(
          'Состояние плана',
          draft.status,
          update('status'),
          [
            { id: 'planned', name: 'Предварительный план' },
            { id: 'approved', name: 'Согласовано' },
          ],
          null,
          { disabled: busy },
        ),
        scopes.length > 1 &&
          select(
            'Проект плана',
            draft.responsibilityScopeId,
            update('responsibilityScopeId'),
            scopes.map((scope) => ({
              id: scope.responsibilityScopeId,
              name: [scope.projectName, scope.scopeName]
                .filter(Boolean)
                .join(' · '),
            })),
            'Определить по документу или счёту',
            {
              required: !draft.cashAccountId && !draft.documentId,
              disabled: busy,
            },
          ),
      ),
      h(
        'p',
        { className: 'fl-note' },
        'Без ожидаемой даты план попадёт в очередь «Назначить дату». Связанный документ не будет посчитан повторно.',
      ),
      error && h('p', { role: 'alert', className: 'fl-error' }, error),
      h(
        'button',
        { type: 'submit', className: 'button', disabled: busy },
        'Сохранить план',
      ),
    );
  }

  function OpeningForm({ data, legalEntityId, busy, save, close }) {
    const categories = [
      ['cash', 'Деньги', 1],
      ['ar', 'Дебиторская задолженность', 1],
      ['supplier_advance', 'Авансы поставщикам', 1],
      ['input_vat', 'Входной НДС', 1],
      ['inventory', 'Запасы', 1],
      ['fixed_asset', 'Основные средства', 1],
      ['accumulated_depreciation', 'Накопленная амортизация', -1],
      ['loan_receivable', 'Выданные займы', 1],
      ['ap', 'Кредиторская задолженность', -1],
      ['customer_advance', 'Авансы покупателей', -1],
      ['output_vat', 'НДС с реализации', -1],
      ['loan_payable', 'Полученные займы', -1],
      ['tax_payable', 'Налоги к уплате', -1],
      ['payroll_payable', 'Зарплата к выплате', -1],
      ['equity', 'Капитал', -1],
      ['retained_earnings', 'Накопленный результат', -1],
    ];
    const entities = list(data.context?.legalEntities),
      [entity, setEntity] = useState(
        legalEntityId || (entities.length === 1 ? entities[0].id : ''),
      ),
      [date, setDate] = useState(`${today().slice(0, 7)}-01`),
      [reason, setReason] = useState(''),
      [scope, setScope] = useState(''),
      [error, setError] = useState('');
    const blank = (account) => ({
      key: crypto.randomUUID(),
      account,
      amount: '',
      directionId: '',
      counterpartyId: '',
      cashAccountId: '',
      documentNumber: '',
    });
    const [rows, setRows] = useState(() => [blank('cash'), blank('equity')]);
    const update = (key, field, value) =>
      setRows((old) =>
        old.map((row) => (row.key === key ? { ...row, [field]: value } : row)),
      );
    const signed = (row) => {
      const value = String(row.amount).trim();
      return (
        kopecks(value.startsWith('-') ? value.slice(1) : value) *
        (value.startsWith('-') ? -1 : 1) *
        categories.find((category) => category[0] === row.account)[2]
      );
    };
    let difference = null;
    try {
      difference = rows.reduce((sum, row) => sum + signed(row), 0);
    } catch {
      /* Incomplete rows are not treated as zero. */
    }
    const scopes = list(data.context?.scopes).filter(
      (item) => item.legalEntityId === entity,
    );
    return h(
      'form',
      {
        onSubmit: async (event) => {
          event.preventDefault();
          setError('');
          try {
            if (difference !== 0)
              throw new Error(
                'Активы должны совпадать с обязательствами и капиталом. Проверьте остатки по источникам.',
              );
            const postings = rows.map((row) => ({
              account: row.account,
              amountKopecks: signed(row),
              ...(row.directionId ? { directionId: row.directionId } : {}),
              ...(row.counterpartyId
                ? { counterpartyId: row.counterpartyId }
                : {}),
              ...(row.cashAccountId
                ? { cashAccountId: row.cashAccountId }
                : {}),
              ...(['ar', 'ap'].includes(row.account)
                ? {
                    documentId: row.key,
                    documentNumber: row.documentNumber,
                    description: row.documentNumber,
                  }
                : {}),
            }));
            const result = await save('/operations', {
              kind: 'opening',
              legalEntityId: entity,
              date,
              description: reason,
              reason,
              ...(scope ? { responsibilityScopeId: scope } : {}),
              postings,
            });
            if (result) close();
          } catch (reason) {
            setError(reason.message);
          }
        },
      },
      h(
        'p',
        { className: 'fl-note' },
        'Перенесите подтверждённые остатки на одну дату. Каждый открытый долг — отдельной строкой с документом. Неизвестная разница не заполняется автоматически.',
      ),
      h(
        'div',
        { className: 'fl-form-grid' },
        select(
          'Компания остатков',
          entity,
          setEntity,
          entities,
          'Выберите компанию',
          { required: true, disabled: busy },
        ),
        text('Дата начальных остатков', date, setDate, {
          type: 'date',
          required: true,
          disabled: busy,
        }),
        text('Источник остатков', reason, setReason, {
          required: true,
          disabled: busy,
        }),
        scopes.length > 1 &&
          select(
            'Проект остатков',
            scope,
            setScope,
            scopes.map((item) => ({
              id: item.responsibilityScopeId,
              name: [item.projectName, item.scopeName]
                .filter(Boolean)
                .join(' · '),
            })),
            'Выберите проект',
            { required: true, disabled: busy },
          ),
      ),
      table(
        'Начальные остатки',
        [
          'Позиция',
          'Остаток, ₽',
          'Счёт / контрагент',
          'Направление',
          'Документ',
          '',
        ],
        rows.map((row, index) =>
          h(
            'tr',
            { key: row.key },
            h(
              'td',
              null,
              select(
                `Позиция ${index + 1}`,
                row.account,
                (value) => update(row.key, 'account', value),
                categories.map(([id, name]) => ({ id, name })),
                null,
                { disabled: busy },
              ),
            ),
            h(
              'td',
              null,
              text(
                `Остаток ${index + 1}, ₽`,
                row.amount,
                (value) => update(row.key, 'amount', value),
                { inputMode: 'decimal', required: true, disabled: busy },
              ),
            ),
            h(
              'td',
              null,
              row.account === 'cash'
                ? select(
                    `Счёт остатка ${index + 1}`,
                    row.cashAccountId,
                    (value) => update(row.key, 'cashAccountId', value),
                    list(data.catalogs?.accounts).filter(
                      (item) => item.legalEntityId === entity,
                    ),
                    'Выберите счёт',
                    { required: true, disabled: busy },
                  )
                : select(
                    `Контрагент остатка ${index + 1}`,
                    row.counterpartyId,
                    (value) => update(row.key, 'counterpartyId', value),
                    list(data.catalogs?.counterparties),
                    'Не требуется',
                    {
                      required: [
                        'ar',
                        'ap',
                        'customer_advance',
                        'supplier_advance',
                      ].includes(row.account),
                      disabled: busy,
                    },
                  ),
            ),
            h(
              'td',
              null,
              select(
                `Направление остатка ${index + 1}`,
                row.directionId,
                (value) => update(row.key, 'directionId', value),
                list(data.catalogs?.directions),
                'Общая часть',
                { disabled: busy },
              ),
            ),
            h(
              'td',
              null,
              ['ar', 'ap'].includes(row.account) &&
                text(
                  `Документ остатка ${index + 1}`,
                  row.documentNumber,
                  (value) => update(row.key, 'documentNumber', value),
                  { required: true, disabled: busy },
                ),
            ),
            h(
              'td',
              null,
              button(
                'Убрать строку',
                () =>
                  setRows((old) => old.filter((item) => item.key !== row.key)),
                { disabled: busy || rows.length <= 2 },
              ),
            ),
          ),
        ),
      ),
      h(
        'div',
        { className: 'fl-toolbar' },
        button(
          'Добавить остаток',
          () => setRows((old) => [...old, blank('ar')]),
          { disabled: busy || rows.length >= 100 },
        ),
        h(
          'strong',
          { className: difference ? 'fl-error' : '' },
          difference == null
            ? 'Заполните все суммы'
            : `Расхождение: ${money(difference)}`,
        ),
      ),
      error && h('p', { role: 'alert', className: 'fl-error' }, error),
      h(
        'button',
        {
          type: 'submit',
          className: 'button',
          disabled: busy || difference !== 0,
        },
        'Сохранить начальные остатки',
      ),
    );
  }

  return function FinanceLedgerWorkspace({ token, actor, onExpired }) {
    const [data, setData] = useState(null),
      [filters, setFilters] = useState(initialFilters),
      [tab, setTab] = useState('reports'),
      [report, setReport] = useState('pnl'),
      [view, setView] = useState('ledger');
    const [catalogKind, setCatalogKind] = useState('counterparties');
    const [calendarFilters, setCalendarFilters] = useState(() => {
      const end = new Date();
      end.setDate(end.getDate() + 30);
      return {
        calendarFrom: today(),
        calendarTo: `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`,
      };
    });
    const [debtOffset, setDebtOffset] = useState(0),
      [calendarOffset, setCalendarOffset] = useState(0);
    const [offset, setOffset] = useState(0),
      [selected, setSelected] = useState([]),
      [search, setSearch] = useState(''),
      [article, setArticle] = useState(''),
      [dialog, setDialog] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    useEffect(() => {
      const timer = setTimeout(() => setSearchQuery(search), 300);
      return () => clearTimeout(timer);
    }, [search]);
    const [busy, setBusy] = useState(false),
      [loading, setLoading] = useState(true),
      [error, setError] = useState(''),
      [notice, setNotice] = useState(''),
      [refresh, setRefresh] = useState(0);
    const saving = useRef(false),
      alive = useRef(true),
      identity = useRef(token),
      retryKeys = useRef(new Map());
    identity.current = token;
    useEffect(() => {
      alive.current = true;
      return () => {
        alive.current = false;
      };
    }, []);
    useEffect(() => {
      if (view === 'legacy') return;
      const controller = new AbortController();
      setLoading(true);
      setError('');
      const query = new URLSearchParams({
        ...calendarFilters,
        debtOffset: String(debtOffset),
        debtLimit: '100',
        calendarOffset: String(calendarOffset),
        calendarLimit: '200',
        ...Object.fromEntries(
          Object.entries(filters).filter(([, value]) => value),
        ),
        offset: String(offset),
        limit: '50',
        ...(searchQuery ? { search: searchQuery } : {}),
        ...(article
          ? { [report === 'balance' ? 'account' : 'article']: article }
          : {}),
      });
      request(`/finance/ledger?${query}`, { signal: controller.signal }, token)
        .then((value) => {
          if (!controller.signal.aborted) {
            setData(value);
            setLoading(false);
            setSelected([]);
          }
        })
        .catch((reason) => {
          if (!controller.signal.aborted) {
            setData(null);
            setLoading(false);
            setError(errorMessage(reason));
            if (reason.status === 401) onExpired?.();
          }
        });
      return () => controller.abort();
    }, [
      token,
      filters.from,
      filters.to,
      filters.legalEntityId,
      filters.directionId,
      filters.counterpartyId,
      offset,
      refresh,
      view,
      article,
      searchQuery,
      calendarFilters.calendarFrom,
      calendarFilters.calendarTo,
      debtOffset,
      calendarOffset,
    ]);
    async function mutate(path, body, method = 'POST', reload = true) {
      if (saving.current) return null;
      saving.current = true;
      setBusy(true);
      setError('');
      setNotice('');
      const retryIdentity = JSON.stringify([path, method, body]);
      if (!retryKeys.current.has(retryIdentity))
        retryKeys.current.set(retryIdentity, crypto.randomUUID());
      try {
        const value = await request(
          `/finance/ledger${path}`,
          {
            method,
            ...(method !== 'GET'
              ? {
                  body: JSON.stringify({
                    ...body,
                    idempotencyKey: retryKeys.current.get(retryIdentity),
                  }),
                }
              : {}),
          },
          token,
        );
        if (!alive.current || identity.current !== token) return null;
        retryKeys.current.delete(retryIdentity);
        if (reload) {
          setRefresh((old) => old + 1);
          setNotice('Изменения сохранены.');
        }
        return value || { ok: true };
      } catch (reason) {
        if (alive.current && identity.current === token) {
          setError(errorMessage(reason));
          if (reason.status === 401) onExpired?.();
        }
        return null;
      } finally {
        saving.current = false;
        if (alive.current && identity.current === token) setBusy(false);
      }
    }
    function filter(key, value) {
      setFilters((old) => ({ ...old, [key]: value }));
      setOffset(0);
      setDebtOffset(0);
      setCalendarOffset(0);
      setSelected([]);
      setArticle('');
    }
    async function source(item, mode = 'source') {
      setDialog({ type: mode, item });
      const id =
        item.operationId || item.documentId?.replace(/:cost$/, '') || item.id;
      if (
        !id ||
        item.recurrenceTemplateId ||
        list(data?.catalogs?.plans).some((plan) => plan.id === id)
      )
        return;
      try {
        const detail = await request(
          `/finance/ledger/operations/${encodeURIComponent(id)}`,
          {},
          token,
        );
        if (alive.current && identity.current === token)
          setDialog((current) =>
            current?.item === item ? { ...current, item: detail } : current,
          );
      } catch (reason) {
        if (alive.current && identity.current === token)
          setError(errorMessage(reason));
      }
    }
    function close() {
      if (!busy) setDialog(null);
    }
    const locked = busy || loading,
      permissions = data?.context?.permissions || {};
    if (view === 'legacy')
      return h(
        'div',
        null,
        h(
          'div',
          { className: 'fl-legacy-back' },
          button('← Отчёты, календарь и операции', () => setView('ledger')),
        ),
        h(LegacyFinance, { token, actor, onExpired }),
      );
    return h(
      'div',
      { className: 'fl-workspace', 'aria-busy': loading },
      h(
        'header',
        { className: 'fl-heading' },
        h(
          'div',
          null,
          h('span', { className: 'eyebrow' }, 'Управленческий учёт'),
          h('h1', null, 'Финансы'),
          h(
            'p',
            { className: 'muted' },
            data?.context?.coverageLabel || 'Доступная часть данных',
          ),
        ),
        h(
          'div',
          { className: 'fl-toolbar' },
          button(
            'Свои компании',
            () => {
              setCatalogKind('companies');
              setView('catalogs');
            },
            { disabled: !data || locked },
          ),
          button('Тарифы, зарплаты и 1С', () => setView('legacy')),
          button(
            view === 'catalogs' ? 'К финансам' : 'Справочники и распределение',
            () => setView(view === 'catalogs' ? 'ledger' : 'catalogs'),
            { disabled: !data },
          ),
          button('Обновить', () => setRefresh((old) => old + 1), {
            disabled: locked,
          }),
        ),
      ),
      h(
        'div',
        {
          className: 'fl-filters',
          role: 'group',
          'aria-label': 'Фильтры финансов',
        },
        text('Период с', filters.from, (value) => filter('from', value), {
          type: 'date',
          required: true,
        }),
        text('Период по', filters.to, (value) => filter('to', value), {
          type: 'date',
          required: true,
        }),
        select(
          'Компания',
          filters.legalEntityId,
          (value) => filter('legalEntityId', value),
          list(data?.context?.legalEntities),
          'Все доступные компании',
        ),
        select(
          'Направление отчёта',
          filters.directionId,
          (value) => filter('directionId', value),
          list(data?.catalogs?.directions),
          'Все направления',
        ),
        select(
          'Контрагент журнала и расчётов',
          filters.counterpartyId,
          (value) => filter('counterpartyId', value),
          list(data?.catalogs?.counterparties),
          'Все контрагенты',
        ),
      ),
      error &&
        h(
          'div',
          { className: 'fl-alert fl-error', role: 'alert' },
          error,
          button('Повторить загрузку', () => setRefresh((old) => old + 1), {
            disabled: locked,
          }),
        ),
      notice && h('p', { role: 'status', className: 'fl-notice' }, notice),
      !data &&
        loading &&
        h('p', { role: 'status' }, 'Загружаем финансовые данные…'),
      data &&
        h(
          React.Fragment,
          null,
          h(Quality, { data }),
          view === 'catalogs'
            ? h(Catalogs, {
                data,
                kind: catalogKind,
                setKind: setCatalogKind,
                legalEntityId: filters.legalEntityId,
                busy: locked,
                save: mutate,
                onCompanySaved: (company, created) => {
                  if (created && company.id) {
                    setFilters((old) => ({
                      ...old,
                      legalEntityId: company.id,
                      directionId: '',
                      counterpartyId: '',
                    }));
                    setOffset(0);
                    setDebtOffset(0);
                    setCalendarOffset(0);
                  }
                },
              })
            : h(
                React.Fragment,
                null,
                h(
                  'div',
                  { className: 'fl-heading' },
                  h(
                    'nav',
                    { className: 'fl-tabs', 'aria-label': 'Разделы финансов' },
                    ...MAIN_TABS.map(([key, label]) =>
                      button(label, () => setTab(key), {
                        key,
                        'aria-pressed': tab === key,
                      }),
                    ),
                  ),
                  permissions.canEdit &&
                    h(
                      'div',
                      { className: 'fl-toolbar' },
                      button(
                        'Из данных приложения',
                        () => setDialog({ type: 'native' }),
                        { disabled: locked },
                      ),
                      button(
                        'Загрузить файл',
                        () => setDialog({ type: 'import' }),
                        { disabled: locked },
                      ),
                      button(
                        '+ Операция',
                        () => setDialog({ type: 'operation' }),
                        { disabled: locked, className: 'button' },
                      ),
                    ),
                ),
                tab === 'reports' &&
                  h(Reports, {
                    data,
                    report,
                    setReport: (value) => {
                      setReport(value);
                      setArticle('');
                      setOffset(0);
                    },
                    busy: locked,
                    act: (type) => setDialog({ type }),
                    drill: (row) => {
                      setArticle(row.article || row.account || '');
                      setOffset(0);
                      setTab('operations');
                    },
                  }),
                tab === 'operations' &&
                  h(Operations, {
                    data,
                    busy: locked,
                    mutate,
                    source,
                    selected,
                    setSelected,
                    offset,
                    setOffset,
                    search,
                    setSearch,
                    article,
                    setArticle,
                  }),
                tab === 'calendar' &&
                  h(Calendar, {
                    data,
                    calendarFilters,
                    setCalendarFilters,
                    calendarOffset,
                    setCalendarOffset,
                    busy: locked,
                    mutate,
                    showSource: source,
                    setDialog,
                  }),
                tab === 'settlements' &&
                  h(Settlements, {
                    data,
                    filters,
                    debtOffset,
                    setDebtOffset,
                    busy: locked,
                    showSource: source,
                    setDialog,
                  }),
              ),
        ),
      dialog &&
        data &&
        h(
          Modal,
          {
            title: {
              operation: 'Новая операция',
              edit: 'Изменение операции',
              reconcile: 'Сверка реестра',
              opening: 'Начальные остатки',
              plan: 'План платежа',
              import: 'Загрузка финансовых данных',
              native: 'Данные приложения',
              source: 'Операция и источник',
              reverse: 'Отмена операции',
              settle: 'Связать оплату',
              setoff: 'Взаимозачёт',
              period: 'Закрытие периода',
            }[dialog.type],
            onClose: close,
          },
          error && h('p', { role: 'alert', className: 'fl-error' }, error),
          dialog.type === 'reconcile' &&
            h(ReconciliationForm, {
              documents: dialog.documents,
              reconciliation: dialog.reconciliation,
              filters: dialog.filters,
              busy,
              save: mutate,
              close,
            }),
          ['operation', 'edit'].includes(dialog.type) &&
            h(OperationForm, {
              key: dialog.item?.id || 'new',
              operation: dialog.type === 'edit' ? dialog.item : undefined,
              data,
              legalEntityId: filters.legalEntityId,
              busy,
              save: mutate,
              close,
            }),
          dialog.type === 'plan' &&
            h(PlanForm, {
              data,
              legalEntityId: filters.legalEntityId,
              busy,
              save: mutate,
              close,
            }),
          dialog.type === 'opening' &&
            h(OpeningForm, {
              data,
              legalEntityId: filters.legalEntityId,
              busy,
              save: mutate,
              close,
            }),
          ['import', 'native'].includes(dialog.type) &&
            h(ImportForm, {
              native: dialog.type === 'native',
              filters,
              serverError: error,
              data,
              legalEntityId: filters.legalEntityId,
              busy,
              save: mutate,
              close,
            }),
          ['source', 'reverse'].includes(dialog.type) &&
            h(Source, {
              item: dialog.item,
              data,
              mode: dialog.type,
              busy,
              save: mutate,
              close,
            }),
          ['settle', 'setoff'].includes(dialog.type) &&
            h(SettlementForm, {
              data,
              type: dialog.type,
              busy,
              save: mutate,
              close,
            }),
          dialog.type === 'period' &&
            h(PeriodForm, { data, filters, busy, save: mutate, close }),
        ),
    );
  };
}
