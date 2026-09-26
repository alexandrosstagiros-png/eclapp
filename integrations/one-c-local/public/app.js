'use strict';

(() => {
  const $ = (id) => document.getElementById(id);
  const arrays = ['drivers', 'vehicles', 'requests', 'shifts', 'assignments'];
  const state = { snapshot: null, tab: 'shifts', busy: false };
  const numberFormat = new Intl.NumberFormat('ru-RU');
  const dateFormat = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const timeFormat = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });

  function text(value, fallback = '—') {
    return value === null || value === undefined || value === '' ? fallback : String(value);
  }
  function date(value, withTime = false) {
    if (!value) return '—';
    const source = String(value);
    if (!withTime && /^\d{4}-\d{2}-\d{2}/.test(source)) {
      const [year, month, day] = source.slice(0, 10).split('-');
      return `${day}.${month}.${year}`;
    }
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? (withTime ? timeFormat : dateFormat).format(parsed) : source;
  }
  function node(tag, className, content) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (content !== undefined) element.textContent = text(content);
    return element;
  }
  function field(primary, secondary, className = '') {
    const element = node('span', `cell-primary ${className}`.trim(), primary);
    if (secondary) element.append(node('span', 'cell-secondary', secondary));
    return element;
  }
  function badge(label, color = '') {
    return node('span', `record-badge ${color}`.trim(), label);
  }
  function flag(value, yes, color) {
    return value === true ? badge(yes, color) : value === false ? badge('Нет', 'gray') : node('span', 'empty-value', '—');
  }
  function count(key) {
    const value = state.snapshot?.counts?.[key];
    return Number.isFinite(value) && value >= 0 ? numberFormat.format(value) : '—';
  }
  function validateSnapshot(value) {
    if (!value || value.schemaVersion !== 'transport.local-test.v1' || !value.source || !value.counts || arrays.some((name) => !Array.isArray(value[name]))) {
      throw new Error('Сервер вернул данные в неподдерживаемом формате.');
    }
    return value;
  }
  function shiftRows() {
    const snapshot = state.snapshot;
    const shifts = new Map(snapshot.shifts.map((shift) => [shift.id, shift]));
    const assigned = new Set(snapshot.assignments.map((assignment) => assignment.shiftId).filter(Boolean));
    const rows = snapshot.assignments.map((assignment) => {
      const shift = shifts.get(assignment.shiftId) || {};
      return { ...shift, ...assignment, id: assignment.id, number: assignment.shiftNumber || shift.number, date: assignment.date || shift.date, shiftRecordId: assignment.shiftId || shift.id, assignment: true };
    });
    for (const shift of snapshot.shifts) {
      if (!assigned.has(shift.id)) rows.push({ ...shift, number: shift.number, shiftRecordId: shift.id, assignment: false });
    }
    return rows.sort((left, right) => text(right.date, '').localeCompare(text(left.date, '')) || text(left.number, '').localeCompare(text(right.number, ''), 'ru'));
  }
  const definitions = {
    shifts: {
      description: 'Назначения в сменах. Отдельно показаны выход водителя и выполнение связанной заявки.',
      placeholder: 'Номер смены, водитель, автомобиль…',
      headers: ['Смена / дата', 'Водитель', 'Автомобиль', 'Заявка', 'Статус', 'Выход', 'Заявка выполнена', 'Начало / окончание'],
      cells: (row) => [
        field(row.number, date(row.date)),
        field(row.driverName, row.assignment ? '' : 'Нет назначений'),
        field(row.vehicleRegistration),
        field(row.requestNumber, [row.clientName, row.projectName].filter(Boolean).join(' · '), 'cell-wrap'),
        badge(text(row.status, row.assignment ? 'Не указан' : 'Без назначения')),
        flag(row.departed, 'Вышел', 'blue'),
        flag(row.completed, 'Да', 'green'),
        field(date(row.actualStart, true), date(row.actualEnd, true)),
      ],
    },
    drivers: {
      description: 'Справочник водителей локальной базы 1С. Учётные записи приложения здесь не создаются.',
      placeholder: 'ФИО, телефон или код водителя…',
      headers: ['Водитель', 'Код', 'Телефон', 'Активен', 'Идентификатор 1С'],
      cells: (row) => [field(row.name), text(row.code), text(row.phone), flag(row.active, 'Да', 'green'), node('span', 'record-id', row.id)],
    },
    vehicles: {
      description: 'Справочник автомобилей: наименование, государственный номер и состояние записи в 1С.',
      placeholder: 'Автомобиль, госномер или код…',
      headers: ['Автомобиль', 'Код', 'Госномер', 'Активен', 'Идентификатор 1С'],
      cells: (row) => [field(row.name), text(row.code), field(row.registration), flag(row.active, 'Да', 'green'), node('span', 'record-id', row.id)],
    },
    requests: {
      description: 'Документы заявок из локальной базы. Статусы и фактическое время взяты из 1С.',
      placeholder: 'Номер заявки, клиент или проект…',
      headers: ['Заявка', 'Дата', 'Клиент', 'Проект', 'Статус', 'Фактическое начало', 'Фактическое окончание'],
      cells: (row) => [field(row.number), date(row.date), field(row.clientName, '', 'cell-wrap'), field(row.projectName, '', 'cell-wrap'), badge(text(row.status, 'Не указан')), date(row.actualStart, true), date(row.actualEnd, true)],
    },
  };

  function renderHeader() {
    const snapshot = state.snapshot;
    $('source-name').textContent = text(snapshot.source.name, 'Локальная база InfoBase');
    $('source-path').textContent = text(snapshot.source.path, 'Локальная информационная база');
    $('source-platform').textContent = snapshot.source.platform ? `Платформа ${snapshot.source.platform} · чтение через 1С` : 'Данные прочитаны через 1С';
    $('source-state').textContent = snapshot.source.mode === 'live' ? 'Данные из 1С' : 'Снимок данных';
    $('source-state').className = 'status-pill connected';
    $('fetched-at').textContent = date(snapshot.fetchedAt, true);
    for (const key of ['drivers', 'vehicles', 'requests', 'shifts', 'departed', 'completed']) $('count-' + key).textContent = count(key);
    $('assignment-count').textContent = `Назначения: ${count('assignments')}`;
    for (const key of ['drivers', 'vehicles', 'requests', 'shifts']) $('tab-count-' + key).textContent = count(key);
    const warnings = Array.isArray(snapshot.warnings) ? snapshot.warnings : [];
    $('warnings').hidden = warnings.length === 0;
    $('warning-list').replaceChildren(...warnings.map((warning) => node('li', '', typeof warning === 'string' ? warning : text(warning?.message, 'Есть замечание к данным источника.'))));
  }

  function renderTable() {
    const definition = definitions[state.tab];
    const hasDates = state.tab === 'shifts' || state.tab === 'requests';
    $('record-panel').setAttribute('aria-labelledby', `tab-${state.tab}`);
    $('date-filters').hidden = !hasDates;
    $('search').placeholder = definition.placeholder;
    $('table-description').textContent = definition.description;
    const header = node('tr');
    definition.headers.forEach((label) => { const cell = node('th', '', label); cell.scope = 'col'; header.append(cell); });
    $('table-head').replaceChildren(header);
    $('table-body').replaceChildren();
    if (!state.snapshot) {
      $('table-wrap').hidden = true;
      $('empty').hidden = false;
      $('empty-title').textContent = state.busy ? 'Читаем локальную базу' : 'Данные ещё не получены';
      $('empty-description').textContent = state.busy ? 'При необходимости запускаем локальную 1С. Первый ответ может занять до двух минут.' : 'Нажмите «Обновить из 1С», чтобы повторить чтение.';
      $('visible-count').textContent = 'Нет загруженных данных';
      return;
    }
    const allRows = state.tab === 'shifts' ? shiftRows() : [...state.snapshot[state.tab]];
    const query = $('search').value.trim().toLocaleLowerCase('ru-RU');
    const from = hasDates ? $('date-from').value : '';
    const to = hasDates ? $('date-to').value : '';
    const invalidRange = Boolean(from && to && from > to);
    $('date-error').hidden = !invalidRange;
    $('reset-filters').hidden = !query && !from && !to;
    const rows = invalidRange ? [] : allRows.filter((row) => {
      const businessDate = text(row.date, '').slice(0, 10);
      if ((from && (!businessDate || businessDate < from)) || (to && (!businessDate || businessDate > to))) return false;
      return !query || Object.values(row).filter((value) => typeof value === 'string' || typeof value === 'number').join(' ').toLocaleLowerCase('ru-RU').includes(query);
    });
    const fragment = document.createDocumentFragment();
    for (const row of rows) {
      const tr = node('tr');
      if (row.id) tr.title = `Идентификатор 1С: ${row.id}`;
      for (const content of definition.cells(row)) {
        const td = node('td');
        if (content instanceof Node) td.append(content);
        else { td.textContent = text(content); if (content === '—') td.className = 'empty-value'; }
        tr.append(td);
      }
      fragment.append(tr);
    }
    $('table-body').append(fragment);
    $('table-wrap').hidden = rows.length === 0;
    $('empty').hidden = rows.length !== 0;
    $('empty-title').textContent = invalidRange ? 'Проверьте диапазон дат' : allRows.length ? 'По вашему запросу ничего не найдено' : 'В этой базе пока нет записей';
    $('empty-description').textContent = invalidRange ? 'Выберите дату начала не позже даты окончания.' : allRows.length ? 'Измените поиск или сбросьте фильтры.' : 'После появления записей в 1С обновите данные здесь.';
    $('visible-count').textContent = `Показано ${numberFormat.format(rows.length)} из ${numberFormat.format(allRows.length)} ${state.tab === 'shifts' ? 'строк смен' : 'записей'}`;
  }

  async function load(refresh = false) {
    if (state.busy) return;
    state.busy = true;
    $('refresh').disabled = true;
    $('refresh').classList.add('is-loading');
    $('refresh-label').textContent = 'Читаем 1С…';
    $('data-section').setAttribute('aria-busy', 'true');
    $('error').hidden = true;
    $('status').textContent = 'Читаем данные из локальной базы 1С.';
    if (!state.snapshot) renderTable();
    try {
      const response = await fetch(refresh ? '/api/one-c/refresh' : '/api/one-c/snapshot', {
        method: refresh ? 'POST' : 'GET',
        headers: refresh ? { 'Content-Type': 'application/json', Accept: 'application/json' } : { Accept: 'application/json' },
        ...(refresh ? { body: '{}' } : {}),
        credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(180000),
      });
      let value;
      try { value = await response.json(); } catch { throw new Error('Сервер не вернул сведения из 1С. Повторите обновление.'); }
      if (!response.ok) throw new Error(typeof value.error === 'string' ? value.error : 'Не удалось прочитать локальную базу 1С.');
      state.snapshot = validateSnapshot(value);
      renderHeader();
      $('status').textContent = `Данные из 1С обновлены: ${date(state.snapshot.fetchedAt, true)}.`;
    } catch (error) {
      const detail = error?.name === 'TimeoutError' ? '1С не ответила за три минуты. Проверьте доступность локальной базы и повторите обновление.' : error?.message || 'Не удалось связаться с локальным сервером.';
      $('error').textContent = `${state.snapshot ? 'Обновление не выполнено. Ниже показаны последние полученные данные. ' : 'Не удалось получить данные. '}${detail}`;
      $('error').hidden = false;
      $('source-state').textContent = state.snapshot ? 'Предыдущие данные' : 'Нет данных';
      $('source-state').className = 'status-pill stale';
      if (!state.snapshot) { $('source-path').textContent = 'Ожидаем успешного чтения локальной базы 1С.'; $('source-name').textContent = 'Локальная база 1С'; }
      $('status').textContent = 'Ошибка чтения 1С.';
    } finally {
      state.busy = false;
      $('refresh').disabled = false;
      $('refresh').classList.remove('is-loading');
      $('refresh-label').textContent = 'Обновить из 1С';
      $('data-section').setAttribute('aria-busy', 'false');
      renderTable();
    }
  }

  const tabs = [...document.querySelectorAll('[data-tab]')];
  function selectTab(button) {
    state.tab = button.dataset.tab;
    for (const tab of tabs) {
      const selected = tab === button;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    }
    $('search').value = '';
    $('date-from').value = '';
    $('date-to').value = '';
    renderTable();
  }
  tabs.forEach((button, index) => {
    button.addEventListener('click', () => selectTab(button));
    button.addEventListener('keydown', (event) => {
      let target;
      if (event.key === 'ArrowRight') target = tabs[(index + 1) % tabs.length];
      if (event.key === 'ArrowLeft') target = tabs[(index - 1 + tabs.length) % tabs.length];
      if (event.key === 'Home') target = tabs[0];
      if (event.key === 'End') target = tabs[tabs.length - 1];
      if (target) { event.preventDefault(); selectTab(target); target.focus(); }
    });
  });
  $('refresh').addEventListener('click', () => load(true));
  ['search', 'date-from', 'date-to'].forEach((id) => $(id).addEventListener('input', renderTable));
  $('reset-filters').addEventListener('click', () => {
    $('search').value = ''; $('date-from').value = ''; $('date-to').value = ''; renderTable(); $('search').focus();
  });
  load();
})();
