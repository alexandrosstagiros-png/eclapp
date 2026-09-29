// SPDX-License-Identifier: MIT
'use strict';
const { randomUUID, createHash } = require('node:crypto');
const {
  Injectable,
  Inject,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} = require('@nestjs/common');
const { DatabaseService } = require('../../../platform/database.service');
const {
  IdentityRepository,
} = require('../../identity-access/infrastructure/identity.repository');
const { AuditService } = require('../../audit/application/audit.service');
const { NeuralService } = require('../../neural/neural.service');
const { isCalendarDate } = require('../domain/finance-rules');
const { financialToday } = require('../domain/finance-ledger');

const ROLES = [
  'access_admin',
  'manager',
  'auditor',
  'dispatcher',
  'document_specialist',
];
const KINDS = {
  counterparties: 'parties',
  parties: 'parties',
  directions: 'directions',
  articles: 'articles',
  accounts: 'accounts',
  allocationRules: 'allocation_rules',
  allocation_rules: 'allocation_rules',
  classificationRules: 'classification_rules',
  classification_rules: 'classification_rules',
  plans: 'plans',
};
const CATALOG_KEYS = {
  parties: 'counterparties',
  directions: 'directions',
  articles: 'articles',
  accounts: 'accounts',
  allocation_rules: 'allocationRules',
  classification_rules: 'classificationRules',
  plans: 'plans',
  reconciliations: 'reconciliations',
};
const SHARED_CATALOGS = new Set(['parties', 'directions', 'articles']);
const DOMAIN_MESSAGES = {
  INVALID_MONEY: 'Сумма должна быть числом с точностью до копейки.',
  AMOUNT_REQUIRED: 'Укажите сумму операции.',
  INVALID_AMOUNT: 'Сумма операции должна быть положительной.',
  AMOUNT_OVERFLOW: 'Сумма слишком велика.',
  INVALID_DATE: 'Укажите корректную дату.',
  INVALID_PERIOD: 'Проверьте границы периода.',
  INVALID_CALENDAR_PERIOD: 'Проверьте период календаря.',
  NAME_REQUIRED: 'Укажите название.',
  COUNTERPARTY_REQUIRED: 'Выберите контрагента.',
  SUPPLIER_REQUIRED: 'Выберите поставщика.',
  CASH_ACCOUNT_REQUIRED: 'Выберите банковский счет или кассу.',
  INVALID_ACCOUNT: 'Неизвестный счет учета.',
  INVALID_CASH_ACCOUNT: 'Проверьте вид денежного счета.',
  DIRECTION_REQUIRED: 'Выберите направление.',
  INVALID_INN: 'Проверьте ИНН контрагента.',
  INVALID_KPP: 'Проверьте КПП контрагента.',
  OVER_SETTLEMENT: 'Сумма зачета превышает остаток долга.',
  DOCUMENT_NOT_FOUND: 'Документ для зачета недоступен.',
  PAYMENT_NOT_FOUND: 'Платеж для зачета недоступен.',
  PERIOD_CLOSED:
    'Период закрыт. Используйте корректировку открытым периодом или переоткрытие.',
  DEPENDENT_OPERATIONS:
    'Операция связана с последующими оплатами или списаниями. Сначала отмените связанные операции либо оформите отдельную корректировку.',
  CROSS_ENTITY_SETTLEMENT:
    'Нельзя погашать долг одной организации платежом другой организации.',
  CROSS_SCOPE_SETTLEMENT: 'Недостаточно прав для зачета между проектами.',
  INSUFFICIENT_ADVANCE: 'Недостаточно незачтенного аванса.',
  INSUFFICIENT_INVENTORY: 'Недостаточно оприходованных запасов.',
  DUPLICATE_SOURCE: 'Источник уже учтен.',
  DUPLICATE_OPERATION: 'Операция уже существует.',
  DUPLICATE_SETTLEMENT: 'Документ повторяется в распределении платежа.',
  EMPTY_SETTLEMENT: 'Выберите документы и суммы зачета.',
  INVALID_SETTLEMENT: 'Проверьте суммы распределения платежа.',
  SETTLEMENT_PARTY_MISMATCH: 'Платеж и долг принадлежат разным контрагентам.',
  SETTLEMENT_SIDE_MISMATCH: 'Направление платежа не соответствует долгу.',
  SETTLEMENT_BEFORE_DOCUMENT: 'Дата зачета не может быть раньше документа.',
  SETTLEMENT_BEFORE_PAYMENT: 'Дата зачета не может быть раньше платежа.',
  VAT_EXCEEDS_AMOUNT: 'НДС не может превышать сумму документа.',
  INVALID_STATUS: 'Неизвестный статус подтверждения.',
  ORIGINAL_NOT_REVERSIBLE:
    'Эту операцию нельзя отменить: она уже отменена или недоступна.',
  REVERSAL_BEFORE_ORIGINAL: 'Отмена не может быть раньше исходной операции.',
  CORRECTION_REASON_REQUIRED: 'Укажите основание корректировки.',
  UNBALANCED_OPERATION:
    'Проводки не сбалансированы: дебет и кредит должны совпадать.',
  INVALID_POSTINGS: 'Укажите корректные строки проводок.',
  OPENING_DOCUMENT_REQUIRED: 'Для входящего долга нужны документ и контрагент.',
  OPENING_PNL_FORBIDDEN: 'Доходы и расходы не включаются во входящие остатки.',
  CASH_ADJUSTMENT_FORBIDDEN:
    'Корректировка денег должна быть связана с фактическим платежом.',
  ALLOCATION_NOT_100: 'Сумма весов распределения должна равняться 100%.',
  ALLOCATION_RULE_UNAVAILABLE:
    'Правило распределения недоступно на дату операции.',
  EXCESS_DEPRECIATION: 'Амортизация превышает остаточную стоимость.',
  LOAN_OVER_REPAYMENT: 'Погашение превышает остаток займа.',
  SAME_CASH_ACCOUNT: 'Для перевода нужны разные денежные счета.',
  INVALID_ALLOCATION: 'Укажите направления и положительные доли распределения.',
  ALLOCATION_KIND_UNSUPPORTED:
    'Эту операцию нельзя распределить по направлениям.',
  ALLOCATION_CONFLICT:
    'Выберите один способ распределения: доли вручную или сохраненное правило.',
  ALLOCATION_LINKED_DOCUMENTS:
    'Платеж уже связан с документами. Его направления определяются документами; измените распределение начисления или сначала отмените зачет.',
};
const tupleKeys = [
  'legalEntityId',
  'regionId',
  'projectId',
  'responsibilityScopeId',
];
const tuple = (row) => tupleKeys.map((key) => row[key]);
const digest = (value) =>
  createHash('sha256')
    .update(
      JSON.stringify(value, (_key, entry) =>
        entry && typeof entry === 'object' && !Array.isArray(entry)
          ? Object.fromEntries(
              Object.keys(entry)
                .sort()
                .map((key) => [key, entry[key]]),
            )
          : entry,
      ),
    )
    .digest('hex');
const scopeSQL = (alias, parameter = 1) =>
  `EXISTS(SELECT 1 FROM jsonb_to_recordset($${parameter}::jsonb) AS g("legalEntityId" uuid,"regionId" uuid,"projectId" uuid,"responsibilityScopeId" uuid) WHERE ${alias}.legal_entity_id=g."legalEntityId" AND ${alias}.region_id=g."regionId" AND ${alias}.project_id=g."projectId" AND ${alias}.responsibility_scope_id=g."responsibilityScopeId")`;
const invalid = (message, code = 'FINANCE_INVALID_INPUT') => {
  throw new BadRequestException({ code, message });
};
const conflict = (message, code = 'FINANCE_CONFLICT') => {
  throw new ConflictException({ code, message });
};
const forbidden = () => {
  throw new ForbiddenException({
    code: 'FINANCE_FORBIDDEN',
    message: 'Недостаточно финансовых полномочий для этой операции.',
  });
};
const missing = () => {
  throw new NotFoundException({
    code: 'FINANCE_NOT_FOUND',
    message: 'Финансовая запись недоступна.',
  });
};
function uuid(value, label = 'идентификатор') {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    invalid(`Некорректный ${label}.`);
  return value.toLowerCase();
}
function object(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    invalid('Ожидается объект с полями операции.');
  return input;
}
function date(value, label = 'дата') {
  if (typeof value !== 'string' || !isCalendarDate(value))
    invalid(`Укажите корректную дату: ${label}.`);
  return value;
}
function reason(value) {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > 2000 ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)
  )
    invalid('Укажите основание изменения.');
  return value.trim();
}
function boundedInteger(value, fallback, max = 1000000) {
  if (value === undefined || value === '') return fallback;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0 || number > max)
    invalid('Некорректный размер страницы или версия.');
  return number;
}
function linkedOperationIds(operation) {
  return new Set(
    [
      operation.paymentId,
      operation.documentId,
      operation.receivableId,
      operation.payableId,
      ...(operation.allocations || []).flatMap((row) => [
        row.documentId,
        row.paymentId,
      ]),
      ...(operation.postings || []).flatMap((row) => [
        row.documentId,
        row.paymentId,
        row.originOperationId,
      ]),
    ]
      .filter((id) => typeof id === 'string')
      .map((id) => id.replace(/:cost$/, ''))
      .filter((id) => id !== operation.id),
  );
}
function remapAccountingLinks(value, replacements) {
  if (Array.isArray(value))
    return value.map((entry) => remapAccountingLinks(entry, replacements));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => {
      if (
        [
          'paymentId',
          'documentId',
          'receivableId',
          'payableId',
          'originOperationId',
        ].includes(key) &&
        typeof entry === 'string'
      ) {
        const base = entry.replace(/:cost$/, '');
        return [
          key,
          replacements.has(base)
            ? replacements.get(base) + (entry.endsWith(':cost') ? ':cost' : '')
            : entry,
        ];
      }
      return [key, remapAccountingLinks(entry, replacements)];
    }),
  );
}
function cashSignature(operation) {
  const accounts = new Map();
  for (const p of operation.postings || [])
    if (p.account === 'cash')
      accounts.set(
        p.cashAccountId,
        (accounts.get(p.cashAccountId) || 0) + p.amountKopecks,
      );
  return digest({
    date: operation.date,
    accounts: [...accounts]
      .filter(([, amount]) => amount !== 0)
      .sort(([a], [b]) => a.localeCompare(b)),
  });
}
function callDomain(name, ...args) {
  try {
    return require('../domain/finance-ledger')[name](...args);
  } catch (error) {
    if (error?.code?.startsWith('FINANCE_')) {
      const Type =
        error.status === 409 ? ConflictException : BadRequestException;
      throw new Type({
        code: error.code,
        message:
          error.userMessage ||
          DOMAIN_MESSAGES[error.code.slice(8)] ||
          (/^[A-Z_]+(?::|$)/.test(String(error.message))
            ? 'Проверьте поля операции и связанные документы.'
            : String(error.message).slice(0, 500)),
      });
    }
    throw error;
  }
}
function aliases(input) {
  const result = { ...input };
  if (result.expectedDate === undefined && result.plannedDate !== undefined)
    result.expectedDate = result.plannedDate;
  if (result.cashAccountId === undefined && result.accountId !== undefined)
    result.cashAccountId = result.accountId;
  return result;
}
function catalogRow(row) {
  return {
    ...row.data,
    id: row.id,
    kind: row.kind,
    legalEntityId: row.legal_entity_id,
    responsibilityScopeIds: row.responsibility_scope_ids,
    version: row.version,
    archived: row.archived,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
function operationRow(row) {
  return {
    ...row.data,
    id: row.id,
    ...Object.fromEntries(
      tupleKeys.map((key, index) => [
        key,
        [
          row.legal_entity_id,
          row.region_id,
          row.project_id,
          row.responsibility_scope_id,
        ][index],
      ]),
    ),
    version: 1,
    createdAt: row.created_at,
    plannedDate: row.data.expectedDate ?? null,
  };
}
function closureRow(row) {
  return {
    ...row.data,
    id: row.id,
    legalEntityId: row.legal_entity_id,
    regionId: row.region_id,
    projectId: row.project_id,
    responsibilityScopeId: row.responsibility_scope_id,
    from: row.date_from,
    to: row.date_to,
    dateFrom: row.date_from,
    dateTo: row.date_to,
    version: row.version,
    closedAt: row.closed_at,
    reopenedAt: row.reopened_at,
  };
}
function companyRow(row) {
  return {
    id: row.id,
    name: row.name,
    organizationKind: row.organization_kind,
    inn: row.inn,
    kpp: row.kpp,
    ogrn: row.ogrn,
    fullName: row.full_name,
    address: row.address,
    version: row.version,
  };
}

class FinanceLedgerService {
  constructor(database, identity, audit, neural) {
    this.database = database;
    this.identity = identity;
    this.audit = audit;
    this.neural = neural;
  }
  async transaction(supplied, write, callback) {
    return this.database.transaction(async (client) => {
      await this.identity.lockUsers(
        client,
        [supplied.id, supplied.impersonation?.administratorId].filter(Boolean),
      );
      const actor = await this.identity.actorBySession(
        client,
        supplied.sessionId,
      );
      if (
        !actor ||
        actor.id !== supplied.id ||
        actor.authVersion !== supplied.authVersion ||
        actor.role !== supplied.role
      )
        throw new UnauthorizedException();
      if (!ROLES.includes(actor.role) || (write && actor.role === 'auditor'))
        forbidden();
      // Canonical joins exclude malformed legacy tuples. All reads and writes use
      // the same current grant boundary; a legal-entity filter grants no access.
      const scopes = (
        await client.query(
          `SELECT g.legal_entity_id AS "legalEntityId",g.region_id AS "regionId",g.project_id AS "projectId",g.responsibility_scope_id AS "responsibilityScopeId",g.personal_data_visible AS "personalDataVisible",le.name AS "legalEntityName",p.name AS "projectName",rs.name AS "scopeName"
        FROM access_grants g JOIN projects p ON p.id=g.project_id AND p.legal_entity_id=g.legal_entity_id AND p.region_id=g.region_id
        JOIN responsibility_scopes rs ON rs.id=g.responsibility_scope_id AND rs.project_id=g.project_id JOIN legal_entities le ON le.id=g.legal_entity_id
        WHERE g.user_id=$1 AND g.finance_visible ORDER BY g.legal_entity_id,g.project_id,g.responsibility_scope_id`,
          [actor.id],
        )
      ).rows;
      if (!scopes.length) forbidden();
      // Serialize finance writes, reports, period closure and cross-scope bulk
      // operations in a stable order. No half-written report/settlement reads.
      for (const id of [
        ...new Set(scopes.map((scope) => scope.legalEntityId)),
      ].sort())
        await client.query(
          'SELECT pg_advisory_xact_lock(hashtextextended($1,911066))',
          [`finance:${id}`],
        );
      return callback(client, actor, scopes);
    });
  }
  permissions(actor) {
    return {
      canEdit: actor.role !== 'auditor',
      canClose: ['access_admin', 'document_specialist'].includes(actor.role),
      canReopen: actor.role === 'access_admin',
      canManageCompanies: actor.role === 'access_admin' && !actor.impersonation,
    };
  }
  async context(client, actor, scopes) {
    const ids = [...new Set(scopes.map((scope) => scope.legalEntityId))];
    const totals = (
      await client.query(
        `SELECT p.legal_entity_id AS id,count(rs.id)::integer AS count FROM projects p JOIN responsibility_scopes rs ON rs.project_id=p.id WHERE p.legal_entity_id=ANY($1::uuid[]) GROUP BY p.legal_entity_id`,
        [ids],
      )
    ).rows;
    const companies = (
      await client.query(
        'SELECT * FROM legal_entities WHERE id=ANY($1::uuid[])',
        [ids],
      )
    ).rows;
    const legalEntities = ids.map((id) => {
      const complete =
        scopes.filter((scope) => scope.legalEntityId === id).length ===
        totals.find((row) => row.id === id)?.count;
      return {
        ...companyRow(companies.find((row) => row.id === id)),
        complete,
        canEdit: this.permissions(actor).canManageCompanies && complete,
      };
    });
    return {
      legalEntities,
      scopes,
      permissions: this.permissions(actor),
      coverageLabel: legalEntities.every((row) => row.complete)
        ? 'Доступные организации'
        : 'Доступная часть данных',
      fullCompanyAccess: legalEntities.every((row) => row.complete),
      directionSuggestions: [
        'Экипажный блок',
        'Доставка',
        'Межгородское экспедирование',
        'Топливо',
        'Реклама на автомобилях',
      ],
    };
  }
  async state(client, scopes) {
    const allowed = new Set(scopes.map((scope) => scope.responsibilityScopeId));
    const sourceRows = (
      await client.query(
        `SELECT o.* FROM finance_ledger_operations o WHERE ${scopeSQL('o')} OR o.related_scope_ids && $2::uuid[] ORDER BY o.operation_date,o.created_at,o.id`,
        [JSON.stringify(scopes), [...allowed]],
      )
    ).rows;
    const operations = sourceRows
      .filter(
        (row) =>
          !row.data.consolidationOnly ||
          row.related_scope_ids.every((id) => allowed.has(id)),
      )
      .map((row) => {
        const value = operationRow(row),
          related = row.related_scope_ids?.length
            ? row.related_scope_ids
            : [value.responsibilityScopeId];
        if (related.every((id) => allowed.has(id))) return value;
        const postings = value.postings.filter((posting) =>
          allowed.has(
            posting.responsibilityScopeId || value.responsibilityScopeId,
          ),
        );
        const cashFlows = (value.cashFlows || []).filter((flow) =>
          allowed.has(
            flow.responsibilityScopeId || value.responsibilityScopeId,
          ),
        );
        const visibleScope = scopes.find(
          (scope) =>
            scope.responsibilityScopeId ===
            (postings[0]?.responsibilityScopeId ||
              cashFlows[0]?.responsibilityScopeId),
        );
        return {
          id: value.id,
          ...Object.fromEntries(
            tupleKeys.map((key) => [key, visibleScope?.[key]]),
          ),
          date: value.date,
          kind: value.kind,
          status: value.status,
          version: 1,
          projected: true,
          amountKopecks: null,
          vatKopecks: null,
          description: 'Общая операция: доступная часть',
          directionId: postings[0]?.directionId,
          postings,
          cashFlows,
          allocations: [],
          reversesId: value.reversesId,
          originalOperationId: value.originalOperationId,
          relatedScopeIds: related.filter((id) => allowed.has(id)),
        };
      });
    const rows = (
      await client.query(
        `SELECT c.* FROM finance_ledger_catalogs c WHERE c.responsibility_scope_ids && $1::uuid[] AND c.kind<>'import_previews' ORDER BY c.created_at,c.id`,
        [scopes.map((row) => row.responsibilityScopeId)],
      )
    ).rows;
    const catalogs = rows
      .filter(
        (row) =>
          !['plans', 'reconciliations'].includes(row.kind) ||
          row.responsibility_scope_ids.every((id) => allowed.has(id)),
      )
      .map((row) => {
        const item = catalogRow(row);
        if (
          row.kind === 'accounts' &&
          !row.responsibility_scope_ids.every((id) => allowed.has(id))
        ) {
          delete item.statementBalanceKopecks;
          delete item.statementDate;
          item.restricted = true;
        }
        return item;
      });
    const closures = (
      await client.query(
        `SELECT c.*,c.date_from::text AS date_from,c.date_to::text AS date_to FROM finance_ledger_closures c WHERE ${scopeSQL('c')} ORDER BY c.closed_at,c.id`,
        [JSON.stringify(scopes)],
      )
    ).rows.map(closureRow);
    const total = (
      await client.query(
        'SELECT p.legal_entity_id AS id,count(rs.id)::int AS count FROM projects p JOIN responsibility_scopes rs ON rs.project_id=p.id WHERE p.legal_entity_id=ANY($1::uuid[]) GROUP BY p.legal_entity_id',
        [[...new Set(scopes.map((scope) => scope.legalEntityId))]],
      )
    ).rows;
    const confirmedDocumentIds = [
      ...new Set(
        catalogs
          .filter((row) => row.kind === 'reconciliations' && !row.archived)
          .map((row) =>
            require('../domain/finance-reconciliation').assessReconciliation(
              row,
              { operations, catalogs },
            ),
          )
          .filter(
            (row) =>
              !row.stale &&
              ['confirmed', 'partially_confirmed'].includes(row.status),
          )
          .flatMap((row) =>
            row.documents
              .filter((doc) => !doc.disputed)
              .map((doc) => doc.documentId),
          ),
      ),
    ];
    return {
      operations,
      catalogs,
      closures,
      confirmedDocumentIds,
      fullEntityIds: total
        .filter(
          (row) =>
            scopes.filter((scope) => scope.legalEntityId === row.id).length ===
            row.count,
        )
        .map((row) => row.id),
      allowedScopeIds: [...allowed],
    };
  }
  filters(query, scopes) {
    const today = financialToday();
    const from = query.from
      ? date(query.from, 'начало периода')
      : `${today.slice(0, 7)}-01`;
    const to = query.to ? date(query.to, 'конец периода') : today;
    if (to < from) invalid('Конец периода раньше начала.');
    const entityId = query.legalEntityId || query.entity_id;
    const legalEntityIds = entityId
      ? [uuid(entityId)]
      : [...new Set(scopes.map((scope) => scope.legalEntityId))];
    if (
      legalEntityIds.some(
        (id) => !scopes.some((scope) => scope.legalEntityId === id),
      )
    )
      missing();
    return {
      from,
      to,
      legalEntityIds,
      ...(query.directionId || query.direction_id
        ? { directionId: query.directionId || query.direction_id }
        : {}),
      ...(query.counterpartyId
        ? { counterpartyId: uuid(query.counterpartyId) }
        : {}),
    };
  }
  async snapshot(supplied, query = {}) {
    return this.transaction(supplied, false, async (client, actor, scopes) => {
      const filters = this.filters(query, scopes),
        context = await this.context(client, actor, scopes),
        state = await this.state(client, scopes);
      const reports = callDomain('buildReports', state, filters);
      if (filters.counterpartyId)
        for (const key of ['receivables', 'payables'])
          reports[key] = reports[key].filter(
            (row) => row.counterpartyId === filters.counterpartyId,
          );
      const today = financialToday();
      const calendarFrom = query.calendarFrom
        ? date(query.calendarFrom)
        : today;
      const calendarTo = query.calendarTo
        ? date(query.calendarTo)
        : new Date(Date.parse(`${calendarFrom}T00:00:00Z`) + 30 * 86400000)
            .toISOString()
            .slice(0, 10);
      const recurring = require('../domain/finance-automation').recurringState(
        state,
        calendarTo,
      );
      const calendar = callDomain('buildCalendar', recurring.state, {
        ...filters,
        from: calendarFrom,
        to: calendarTo,
      });
      // A positive group balance cannot fund a different legal entity without
      // an actual transfer. Keep each payer's deficit visible in the group view.
      calendar.entityBalances = filters.legalEntityIds.map((legalEntityId) => {
        const own =
          filters.legalEntityIds.length === 1
            ? calendar
            : callDomain('buildCalendar', recurring.state, {
                ...filters,
                legalEntityIds: [legalEntityId],
                from: calendarFrom,
                to: calendarTo,
              });
        return {
          legalEntityId,
          name:
            context.legalEntities.find((entity) => entity.id === legalEntityId)
              ?.name || 'Организация',
          openingKopecks: own.openingKopecks,
          closingKopecks: own.closingKopecks,
          minimumKopecks: Math.min(
            own.openingKopecks,
            ...own.days.map((day) => day.closingKopecks),
          ),
          firstDeficitDate:
            own.openingKopecks < 0
              ? own.forecastFrom
              : own.days.find((day) => day.closingKopecks < 0)?.date || null,
        };
      });
      const calendarOffset = boundedInteger(query.calendarOffset, 0),
        calendarLimit = Math.max(
          1,
          boundedInteger(query.calendarLimit, 200, 500),
        );
      calendar.pagination = {
        offset: calendarOffset,
        limit: calendarLimit,
        total: calendar.rows.length,
        undatedTotal: calendar.undated.length,
        overdueTotal: calendar.overdue.length,
      };
      const plansById = new Map(
        recurring.state.catalogs
          .filter((row) => row.kind === 'plans')
          .map((row) => [row.id, row]),
      );
      for (const key of ['rows', 'undated', 'overdue'])
        calendar[key] = calendar[key]
          .slice(calendarOffset, calendarOffset + calendarLimit)
          .map((row) => {
            const plan = plansById.get(row.id);
            return {
              ...row,
              version: plan?.version || 1,
              planId: plan?.id || null,
              recurrenceTemplateId: plan?.recurrenceTemplateId || null,
            };
          });
      if (recurring.pending.some((row) => row.period.accrualDate <= filters.to))
        reports.controls.push({
          code: 'RECURRING_ACCRUALS_PENDING',
          severity: 'warning',
          message:
            'Есть регулярные услуги, выполнение которых нужно подтвердить и учесть.',
        });
      const activeReversals = new Set(
        state.operations
          .map((op) => op.reversesId || op.originalOperationId)
          .filter(Boolean),
      );
      let all = state.operations.filter(
        (op) =>
          (!op.consolidationOnly ||
            op.consolidationEntityIds.every((id) =>
              filters.legalEntityIds.includes(id),
            )) &&
          filters.legalEntityIds.includes(op.legalEntityId) &&
          op.date >= filters.from &&
          op.date <= filters.to &&
          (!filters.directionId ||
            op.directionId === filters.directionId ||
            op.postings?.some(
              (row) => row.directionId === filters.directionId,
            )) &&
          (!filters.counterpartyId ||
            op.counterpartyId === filters.counterpartyId),
      );
      if (query.search) {
        const search = String(query.search).toLocaleLowerCase('ru-RU');
        all = all.filter((op) =>
          [op.description, op.article, op.source?.id]
            .join(' ')
            .toLocaleLowerCase('ru-RU')
            .includes(search),
        );
      }
      if (query.status) all = all.filter((op) => op.status === query.status);
      if (query.articleId) {
        uuid(query.articleId);
        all = all.filter(
          (op) =>
            op.articleId === query.articleId ||
            op.postings?.some((row) => row.articleId === query.articleId),
        );
      }
      if (query.article)
        all = all.filter(
          (op) =>
            op.article === query.article ||
            op.postings?.some((row) => row.article === query.article),
        );
      if (query.account)
        all = all.filter((op) =>
          op.postings?.some((row) =>
            query.account === 'current_result'
              ? ['revenue', 'expense'].includes(row.account)
              : row.account === query.account,
          ),
        );
      all = all.sort(
        (a, b) =>
          b.date.localeCompare(a.date) ||
          String(b.createdAt).localeCompare(String(a.createdAt)),
      );
      const offset = boundedInteger(query.offset, 0),
        limit = Math.max(1, boundedInteger(query.limit, 100, 500));
      const catalogs = Object.fromEntries(
        Object.values(CATALOG_KEYS).map((key) => [key, []]),
      );
      for (const row of state.catalogs)
        if (
          CATALOG_KEYS[row.kind] &&
          (SHARED_CATALOGS.has(row.kind)
            ? row.responsibilityScopeIds.some((id) =>
                scopes.some(
                  (scope) =>
                    scope.responsibilityScopeId === id &&
                    filters.legalEntityIds.includes(scope.legalEntityId),
                ),
              )
            : filters.legalEntityIds.includes(row.legalEntityId))
        )
          catalogs[CATALOG_KEYS[row.kind]].push({
            ...row,
            responsibilityScopeIds: row.responsibilityScopeIds.filter((id) =>
              scopes.some((scope) => scope.responsibilityScopeId === id),
            ),
            legalEntityIds: [
              ...new Set(
                scopes
                  .filter((scope) =>
                    row.responsibilityScopeIds.includes(
                      scope.responsibilityScopeId,
                    ),
                  )
                  .map((scope) => scope.legalEntityId),
              ),
            ],
            canEdit:
              this.permissions(actor).canEdit &&
              row.responsibilityScopeIds.every((id) =>
                scopes.some((scope) => scope.responsibilityScopeId === id),
              ),
            plannedDate: row.expectedDate ?? null,
          });
      // These are existing ledger buckets, not editable catalog records.
      for (const [id, name] of [
        ['__common__', 'Общая часть / казначейство'],
        ['__unassigned__', 'Не распределено'],
      ])
        catalogs.directions.push({
          id,
          name,
          kind: 'directions',
          system: true,
          canEdit: false,
          legalEntityIds: filters.legalEntityIds,
          responsibilityScopeIds: scopes
            .filter((scope) =>
              filters.legalEntityIds.includes(scope.legalEntityId),
            )
            .map((scope) => scope.responsibilityScopeId),
        });
      catalogs.reconciliations = catalogs.reconciliations.map((row) =>
        require('../domain/finance-reconciliation').assessReconciliation(
          row,
          state,
        ),
      );
      const availablePayments = new Map();
      for (const op of state.operations)
        for (const p of op.postings || [])
          if (
            p.paymentId &&
            ['customer_advance', 'supplier_advance'].includes(p.account)
          )
            availablePayments.set(
              p.paymentId,
              (availablePayments.get(p.paymentId) || 0) +
                p.amountKopecks * (p.account === 'customer_advance' ? -1 : 1),
            );
      const payments = state.operations
        .filter(
          (op) =>
            !op.projected &&
            !activeReversals.has(op.id) &&
            [
              'payment_in',
              'payment_out',
              'customer_advance',
              'supplier_advance',
            ].includes(op.kind) &&
            filters.legalEntityIds.includes(op.legalEntityId) &&
            (!filters.counterpartyId ||
              op.counterpartyId === filters.counterpartyId),
        )
        .map((op) => {
          const remainingKopecks = availablePayments.get(op.id) || 0;
          return {
            id: op.id,
            date: op.date,
            kind: op.kind,
            description: op.description,
            legalEntityId: op.legalEntityId,
            responsibilityScopeId: op.responsibilityScopeId,
            counterpartyId: op.counterpartyId,
            directionId: op.directionId,
            amountKopecks: op.amountKopecks,
            remainingKopecks,
          };
        })
        .filter((row) => row.remainingKopecks > 0);
      const debtOffset = boundedInteger(query.debtOffset, 0),
        debtLimit = Math.max(1, boundedInteger(query.debtLimit, 100, 200)),
        debtGroups = new Map();
      reports.debtPagination = { offset: debtOffset, limit: debtLimit };
      for (const key of ['receivables', 'payables']) {
        const docs = reports[key];
        reports.debtPagination[key] = {
          total: docs.length,
          totalKopecks: 0,
          remainingKopecks: 0,
        };
        for (const row of docs) {
          const groupKey = `${row.side}:${row.counterpartyId}`,
            group = debtGroups.get(groupKey) || {
              counterpartyId: row.counterpartyId,
              side: row.side,
              documentCount: 0,
              amountKopecks: 0,
              remainingKopecks: 0,
            };
          group.documentCount++;
          group.amountKopecks += row.amountKopecks;
          group.remainingKopecks += row.remainingKopecks;
          debtGroups.set(groupKey, group);
          reports.debtPagination[key].totalKopecks += row.amountKopecks;
          reports.debtPagination[key].remainingKopecks += row.remainingKopecks;
        }
        reports[key] = docs.slice(debtOffset, debtOffset + debtLimit);
      }
      reports.debtGroups = [...debtGroups.values()];
      return {
        context,
        catalogs,
        operations: {
          items: all
            .slice(offset, offset + limit)
            .map((op) => ({ ...op, reversed: activeReversals.has(op.id) })),
          total: all.length,
          offset,
          limit,
        },
        reports,
        calendar,
        settlements: {
          payments,
          items: state.operations.filter(
            (op) =>
              ['settlement', 'setoff'].includes(op.kind) &&
              filters.legalEntityIds.includes(op.legalEntityId),
          ),
        },
        controls: reports.controls || [],
        periods: state.closures,
        filters,
        sourceStatus: {
          bankApi: 'not_connected',
          oneCApi: 'not_connected',
          fuelApi: 'not_connected',
          fileImportsAvailable: true,
        },
      };
    });
  }
  async auditEvent(client, actor, scope, action, id, metadata = {}) {
    await this.audit.append(client, {
      actorId: actor.id,
      channel: actor.channel,
      action: `finance.ledger.${action}`,
      entityType: 'finance_ledger',
      entityId: id,
      correlationId: randomUUID(),
      scope: Object.fromEntries(tupleKeys.map((key) => [key, scope[key]])),
      metadata,
    });
  }
  async operationDetail(supplied, id) {
    uuid(id);
    return this.transaction(supplied, false, async (client, actor, scopes) => {
      const state = await this.state(client, scopes);
      const operation = state.operations.find((row) => row.id === id);
      if (!operation) missing();
      const reversedIds = new Set(
        state.operations.map((row) => row.reversesId).filter(Boolean),
      );
      const relatedDocuments = new Set(
        (operation.allocations || []).map((row) => row.documentId),
      );
      for (const settlement of state.operations)
        if (
          settlement.kind === 'settlement' &&
          settlement.paymentId === operation.id &&
          !reversedIds.has(settlement.id)
        )
          for (const allocation of settlement.allocations || [])
            relatedDocuments.add(allocation.documentId);
      const distributionDocuments = state.operations
        .filter(
          (row) =>
            row.kind === 'expense' &&
            !row.projected &&
            !reversedIds.has(row.id) &&
            relatedDocuments.has(row.id),
        )
        .map((row) => ({
          id: row.id,
          description: row.description,
          kind: row.kind,
          amountKopecks: row.amountKopecks,
          date: row.date,
          directionId: row.directionId,
          articleId: row.articleId,
        }));
      return {
        ...operation,
        distributionDocuments,
        reversed: state.operations.some((row) => row.reversesId === id),
        related: state.operations.filter(
          (row) =>
            row.reversesId === id ||
            row.correctionOfId === id ||
            row.paymentId === id ||
            row.allocations?.some(
              (a) => a.documentId === id || a.documentId === `${id}:cost`,
            ),
        ),
      };
    });
  }
  async replay(client, actor, scopes, key, input, action) {
    if (typeof key !== 'string' || !key.trim() || key.length > 150)
      invalid('Нужен ключ повторного запроса.');
    const row = (
      await client.query(
        'SELECT request_hash,response FROM finance_ledger_requests WHERE actor_id=$1 AND idempotency_key=$2',
        [actor.id, key],
      )
    ).rows[0];
    if (!row) return null;
    if (row.request_hash !== digest({ action, input }))
      conflict(
        'Этот ключ уже использован для другого запроса.',
        'FINANCE_IDEMPOTENCY_CONFLICT',
      );
    const permitted = new Set(
      scopes.map((scope) => scope.responsibilityScopeId),
    );
    if ((row.response.scopeIds || []).some((id) => !permitted.has(id)))
      missing();
    return row.response.value;
  }
  async remember(client, actor, key, input, action, value, scopes) {
    await client.query(
      'INSERT INTO finance_ledger_requests(actor_id,idempotency_key,request_hash,response) VALUES($1,$2,$3,$4::jsonb)',
      [
        actor.id,
        key,
        digest({ action, input }),
        JSON.stringify({
          value,
          scopeIds: scopes.map((scope) => scope.responsibilityScopeId),
        }),
      ],
    );
    return value;
  }
  async saveCompany(supplied, body) {
    object(body);
    return this.transaction(supplied, true, async (client, actor, scopes) => {
      // Company creation also grants access. Follow access administration's
      // stricter rule: impersonated sessions never manage these identities.
      if (!this.permissions(actor).canManageCompanies) forbidden();
      const replay = await this.replay(
        client,
        actor,
        scopes,
        body.idempotencyKey,
        body,
        'company.save',
      );
      if (replay) return replay;
      const id = body.id ? uuid(body.id) : randomUUID();
      let previous = null;
      let affectedScopes = scopes.filter((scope) => scope.legalEntityId === id);
      if (body.id) {
        if (!affectedScopes.length) missing();
        const stored = (
          await client.query(
            'SELECT * FROM legal_entities WHERE id=$1 FOR UPDATE',
            [id],
          )
        ).rows[0];
        if (!stored) missing();
        const total = (
          await client.query(
            'SELECT count(rs.id)::integer AS count FROM projects p JOIN responsibility_scopes rs ON rs.project_id=p.id WHERE p.legal_entity_id=$1',
            [id],
          )
        ).rows[0].count;
        if (affectedScopes.length !== total) forbidden();
        previous = companyRow(stored);
      }
      if ((previous?.version || 0) !== boundedInteger(body.version, 0))
        conflict(
          'Реквизиты организации уже изменены. Обновите данные.',
          'FINANCE_VERSION_CONFLICT',
        );
      let input;
      try {
        input = require('../domain/finance-company-input').validateCompanyInput(
          body,
          previous,
        );
      } catch (error) {
        if (error.code === 'FINANCE_COMPANY_INVALID')
          invalid(error.message, error.code);
        throw error;
      }
      if (
        input.inn &&
        (
          await client.query(
            'SELECT 1 FROM legal_entities WHERE inn=$1 AND id<>$2',
            [input.inn, id],
          )
        ).rowCount
      )
        conflict(
          'Организация с таким ИНН уже существует. Используйте существующую запись.',
          'FINANCE_DUPLICATE_COMPANY',
        );
      const values = [
        id,
        input.name,
        input.organizationKind,
        input.inn,
        input.kpp,
        input.ogrn,
        input.fullName,
        input.address,
      ];
      let saved;
      if (previous) {
        saved = (
          await client.query(
            'UPDATE legal_entities SET name=$2,organization_kind=$3,inn=$4,kpp=$5,ogrn=$6,full_name=$7,address=$8,version=version+1 WHERE id=$1 AND version=$9 RETURNING *',
            [...values, previous.version],
          )
        ).rows[0];
        if (!saved)
          conflict(
            'Реквизиты организации уже изменены. Обновите данные.',
            'FINANCE_VERSION_CONFLICT',
          );
      } else {
        saved = (
          await client.query(
            'INSERT INTO legal_entities(id,name,organization_kind,inn,kpp,ogrn,full_name,address) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
            values,
          )
        ).rows[0];
        // Reuse a region already authorized for this administrator. The current
        // application requires a project and scope; neither needs a user setup step.
        const source = [...scopes].sort(
          (a, b) =>
            a.regionId.localeCompare(b.regionId) ||
            a.projectId.localeCompare(b.projectId) ||
            a.responsibilityScopeId.localeCompare(b.responsibilityScopeId),
        )[0];
        const scope = {
          legalEntityId: id,
          regionId: source.regionId,
          projectId: randomUUID(),
          responsibilityScopeId: randomUUID(),
          personalDataVisible: source.personalDataVisible === true,
        };
        await client.query(
          'INSERT INTO projects(id,name,legal_entity_id,region_id) VALUES($1,$2,$3,$4)',
          [scope.projectId, 'Основная деятельность', id, scope.regionId],
        );
        await client.query(
          'INSERT INTO responsibility_scopes(id,project_id,name) VALUES($1,$2,$3)',
          [scope.responsibilityScopeId, scope.projectId, 'Общие операции'],
        );
        await client.query(
          'INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id,finance_visible,personal_data_visible) VALUES($1,$2,$3,$4,$5,true,$6)',
          [actor.id, ...tuple(scope), scope.personalDataVisible],
        );
        affectedScopes = [scope];
        // Carry forward only masters that were genuinely common to every
        // previously accessible scope. Never expand private/hidden records.
        const previousScopeIds = scopes.map((row) => row.responsibilityScopeId);
        const shared = (
          await client.query(
            `SELECT * FROM finance_ledger_catalogs WHERE kind IN ('directions','articles')
           AND NOT archived AND responsibility_scope_ids @> $1::uuid[]
           AND responsibility_scope_ids <@ $1::uuid[] FOR UPDATE`,
            [previousScopeIds],
          )
        ).rows.map(catalogRow);
        const directionIds = new Set(
          shared
            .filter((row) => row.kind === 'directions')
            .map((row) => row.id),
        );
        for (const row of shared) {
          if (
            row.kind === 'articles' &&
            row.directionIds?.some(
              (directionId) =>
                directionId !== '__common__' && !directionIds.has(directionId),
            )
          )
            continue;
          const data = {
            ...row,
            version: row.version + 1,
            responsibilityScopeIds: [
              ...row.responsibilityScopeIds,
              scope.responsibilityScopeId,
            ],
            legalEntityIds: [
              ...new Set([...scopes.map((entry) => entry.legalEntityId), id]),
            ],
          };
          await client.query(
            'UPDATE finance_ledger_catalogs SET data=$2::jsonb,version=$3,responsibility_scope_ids=$4,updated_by=$5,updated_at=clock_timestamp() WHERE id=$1',
            [
              row.id,
              JSON.stringify(data),
              data.version,
              data.responsibilityScopeIds,
              actor.id,
            ],
          );
          await this.auditEvent(
            client,
            actor,
            scope,
            'catalog.company_attached',
            row.id,
            {
              kind: row.kind,
              version: data.version,
              legalEntityId: id,
              beforeScopeIds: row.responsibilityScopeIds,
              afterScopeIds: data.responsibilityScopeIds,
            },
          );
        }
      }
      const result = { ...companyRow(saved), complete: true, canEdit: true };
      await this.auditEvent(
        client,
        actor,
        affectedScopes[0],
        previous ? 'company.updated' : 'company.created',
        id,
        {
          before: previous,
          after: companyRow(saved),
          ...(!previous
            ? {
                createdGrant: {
                  userId: actor.id,
                  ...Object.fromEntries(
                    tupleKeys.map((key) => [key, affectedScopes[0][key]]),
                  ),
                  financeVisible: true,
                  personalDataVisible: affectedScopes[0].personalDataVisible,
                },
              }
            : {}),
        },
      );
      // A retry must still have every company scope, including the newly granted
      // scope. Retaining an old unrelated grant never reveals this saved response.
      return this.remember(
        client,
        actor,
        body.idempotencyKey,
        body,
        'company.save',
        result,
        affectedScopes,
      );
    }).catch((error) => {
      if (
        error.code === '23505' &&
        error.constraint === 'legal_entities_inn_unique'
      )
        conflict(
          'Организация с таким ИНН уже существует. Используйте существующую запись.',
          'FINANCE_DUPLICATE_COMPANY',
        );
      throw error;
    });
  }
  resolveEntity(input, scopes) {
    const ids = [...new Set(scopes.map((scope) => scope.legalEntityId))];
    if (input.legalEntityId) {
      const id = uuid(input.legalEntityId);
      if (!ids.includes(id)) missing();
      return id;
    }
    if (ids.length !== 1)
      invalid(
        'Выберите собственное юридическое лицо.',
        'FINANCE_ENTITY_REQUIRED',
      );
    return ids[0];
  }
  resolveScope(input, scopes, state) {
    const entityId = this.resolveEntity(input, scopes);
    let candidates = scopes.filter((scope) => scope.legalEntityId === entityId);
    if (input.responsibilityScopeId)
      candidates = candidates.filter(
        (scope) =>
          scope.responsibilityScopeId === uuid(input.responsibilityScopeId),
      );
    if (input.projectId)
      candidates = candidates.filter(
        (scope) => scope.projectId === uuid(input.projectId),
      );
    if (input.regionId)
      candidates = candidates.filter(
        (scope) => scope.regionId === uuid(input.regionId),
      );
    const referenceId =
      input.originalOperationId ||
      input.reversesId ||
      input.paymentId ||
      input.documentId ||
      input.receivableId;
    if (referenceId) {
      const op = state.operations.find((row) => row.id === referenceId);
      if (!op) missing();
      if (op.projected) forbidden();
      candidates = candidates.filter((scope) =>
        tuple(scope).every((id, index) => id === tuple(op)[index]),
      );
    }
    if (input.cashAccountId) {
      const account = state.catalogs.find(
        (row) =>
          row.id === input.cashAccountId &&
          row.kind === 'accounts' &&
          !row.archived,
      );
      if (!account || account.legalEntityId !== entityId) missing();
      candidates = candidates.filter((scope) =>
        account.responsibilityScopeIds.includes(scope.responsibilityScopeId),
      );
    }
    if (!candidates.length) missing();
    if (candidates.length !== 1)
      invalid(
        'Укажите проект операции либо счет, однозначно связанный с проектом.',
        'FINANCE_SCOPE_AMBIGUOUS',
      );
    return candidates[0];
  }
  closed(state, scope, operationDate) {
    if (
      state.closures.some(
        (row) =>
          !row.reopenedAt &&
          row.responsibilityScopeId === scope.responsibilityScopeId &&
          row.from <= operationDate &&
          row.to >= operationDate,
      )
    )
      conflict(
        'Период закрыт. Используйте корректировку открытым периодом либо переоткрытие.',
        'FINANCE_PERIOD_CLOSED',
      );
  }
  references(input, scope, state, preserveArticleSnapshot = null) {
    const checks = [
      ['counterpartyId', 'parties'],
      ['supplierCounterpartyId', 'parties'],
      ['directionId', 'directions'],
      ['cashAccountId', 'accounts'],
      ['toCashAccountId', 'accounts'],
      ['allocationRuleId', 'allocation_rules'],
      ['articleId', 'articles'],
    ];
    for (const [key, kind] of checks) {
      const id = input[key];
      if (
        !id ||
        ['__common__', '__unassigned__', '__unallocated__'].includes(id)
      )
        continue;
      const row = state.catalogs.find(
        (row) => row.id === id && row.kind === kind,
      );
      if (
        !row ||
        (row.archived &&
          !(
            kind === 'articles' && preserveArticleSnapshot?.articleId === id
          )) ||
        (!SHARED_CATALOGS.has(kind) &&
          row.legalEntityId !== scope.legalEntityId) ||
        !row.responsibilityScopeIds.includes(scope.responsibilityScopeId)
      )
        missing();
    }
    if (input.allocationWeights != null) {
      if (
        !Array.isArray(input.allocationWeights) ||
        !input.allocationWeights.length ||
        input.allocationWeights.length > 100
      )
        invalid(
          'Укажите от 1 до 100 направлений распределения.',
          'FINANCE_INVALID_ALLOCATION',
        );
      if (input.allocationRuleId)
        invalid(
          'Выберите доли вручную или сохраненное правило.',
          'FINANCE_ALLOCATION_CONFLICT',
        );
      for (const weight of input.allocationWeights) {
        object(weight);
        const direction = state.catalogs.find(
          (row) =>
            row.kind === 'directions' &&
            row.id === weight.directionId &&
            !row.archived,
        );
        if (
          !direction ||
          !direction.responsibilityScopeIds.includes(
            scope.responsibilityScopeId,
          )
        )
          missing();
      }
    }
    if (input.allocationRuleId) {
      const rule = state.catalogs.find(
        (row) =>
          row.id === input.allocationRuleId && row.kind === 'allocation_rules',
      );
      for (const weight of rule?.weights || [])
        this.references({ directionId: weight.directionId }, scope, state);
      if (!input.articleId && !input.article && rule?.articleId)
        this.references({ articleId: rule.articleId }, scope, state);
    }
    for (const id of [
      input.paymentId,
      input.documentId,
      input.receivableId,
      input.payableId,
      ...(input.allocations || []).flatMap((row) => [
        row.documentId,
        row.paymentId,
      ]),
    ].filter(Boolean)) {
      const row = state.operations.find(
        (row) => row.id === id || `${row.id}:cost` === id,
      );
      if (
        !row ||
        row.projected ||
        row.legalEntityId !== scope.legalEntityId ||
        (!state.fullEntityIds?.includes(scope.legalEntityId) &&
          tuple(row).some((value, index) => value !== tuple(scope)[index]))
      )
        missing();
    }
    if (input.planId) {
      const plan = state.catalogs.find(
        (row) =>
          row.kind === 'plans' && row.id === input.planId && !row.archived,
      );
      if (
        !plan ||
        plan.legalEntityId !== scope.legalEntityId ||
        !plan.responsibilityScopeIds.includes(scope.responsibilityScopeId)
      )
        missing();
    }
    if (['opening', 'adjustment'].includes(input.kind))
      for (const posting of input.postings || []) {
        const { documentId, ...dimensions } = posting;
        this.references({ ...dimensions, kind: 'posting' }, scope, state);
      }
  }
  resolveCatalogArticle(kind, value, state) {
    if (!['plans', 'classification_rules', 'allocation_rules'].includes(kind))
      return value;
    try {
      const { resolveArticle } = require('../domain/finance-articles');
      const directionIds = value.allocationRuleId
        ? state.catalogs
            .find(
              (row) =>
                row.id === value.allocationRuleId &&
                row.kind === 'allocation_rules',
            )
            ?.weights?.map((row) => row.directionId)
        : kind === 'allocation_rules'
          ? value.weights?.map((row) => row.directionId)
          : value.directionId
            ? [value.directionId]
            : kind === 'plans'
              ? ['__common__']
              : [];
      Object.assign(value, resolveArticle(value, state, { directionIds }));
      if (value.accrual) {
        const accrual = { ...value, ...value.accrual };
        delete accrual.accrual;
        const rule = state.catalogs.find(
          (row) =>
            row.kind === 'allocation_rules' &&
            row.id === accrual.allocationRuleId,
        );
        Object.assign(
          value.accrual,
          resolveArticle(accrual, state, {
            directionIds: rule?.weights?.map((row) => row.directionId) || [
              accrual.directionId || '__common__',
            ],
          }),
        );
      }
      return value;
    } catch (error) {
      if (error.code?.startsWith('FINANCE_'))
        invalid(error.userMessage || error.message, error.code);
      throw error;
    }
  }
  async saveCatalog(supplied, kindInput, body) {
    object(body);
    if (Object.hasOwn(body, 'data'))
      invalid('Используйте плоские поля записи справочника.');
    const kind = KINDS[kindInput];
    if (!kind) invalid('Неизвестный справочник.');
    return this.transaction(supplied, true, async (client, actor, scopes) => {
      const replay = await this.replay(
        client,
        actor,
        scopes,
        body.idempotencyKey,
        body,
        `catalog.${kind}`,
      );
      if (replay) return replay;
      const entityId = this.resolveEntity(body, scopes),
        state = await this.state(client, scopes);
      const id = body.id ? uuid(body.id) : randomUUID();
      const oldRaw = (
        await client.query(
          'SELECT * FROM finance_ledger_catalogs WHERE id=$1 FOR UPDATE',
          [id],
        )
      ).rows[0];
      const old = oldRaw && catalogRow(oldRaw);
      if (
        old &&
        (old.kind !== kind ||
          (!SHARED_CATALOGS.has(kind) && old.legalEntityId !== entityId) ||
          old.responsibilityScopeIds.some(
            (scopeId) =>
              !scopes.some((scope) => scope.responsibilityScopeId === scopeId),
          ))
      )
        missing();
      if ((old?.version || 0) !== boundedInteger(body.version, 0))
        conflict(
          'Запись изменена другим сотрудником. Обновите данные.',
          'FINANCE_VERSION_CONFLICT',
        );
      const scopeIds =
        body.responsibilityScopeIds ||
        old?.responsibilityScopeIds ||
        (body.responsibilityScopeId
          ? [body.responsibilityScopeId]
          : scopes
              .filter((scope) => scope.legalEntityId === entityId)
              .map((scope) => scope.responsibilityScopeId));
      if (
        !Array.isArray(scopeIds) ||
        !scopeIds.length ||
        scopeIds.some(
          (scopeId) =>
            !scopes.some(
              (scope) =>
                (SHARED_CATALOGS.has(kind) ||
                  scope.legalEntityId === entityId) &&
                scope.responsibilityScopeId === scopeId,
            ),
        )
      )
        forbidden();
      const selectedScopes = scopes.filter((scope) =>
        scopeIds.includes(scope.responsibilityScopeId),
      );
      const normalized = callDomain(
        'validateCatalog',
        kind,
        {
          ...old,
          ...aliases(body),
          id,
          legalEntityId: old?.legalEntityId || entityId,
          legalEntityIds: [
            ...new Set(selectedScopes.map((scope) => scope.legalEntityId)),
          ],
          responsibilityScopeIds: [...new Set(scopeIds)],
        },
        state,
      );
      this.resolveCatalogArticle(kind, normalized, state);
      try {
        require('../domain/finance-automation').validateAutomationCatalog(
          kind,
          normalized,
        );
      } catch (error) {
        if (error.code?.startsWith('FINANCE_'))
          invalid(error.message, error.code);
        throw error;
      }
      if (kind === 'articles') {
        const helpers = require('../domain/finance-articles');
        normalized.normalizedName = helpers.normalizeArticleName(
          normalized.name,
        );
        normalized.normalizedCode = helpers.normalizeArticleCode(
          normalized.code,
        );
        for (const directionId of normalized.directionIds) {
          if (directionId === '__common__') continue;
          const direction = state.catalogs.find(
            (row) => row.kind === 'directions' && row.id === directionId,
          );
          if (
            !direction ||
            (direction.archived && !old?.directionIds?.includes(directionId)) ||
            !scopeIds.some((scopeId) =>
              direction.responsibilityScopeIds.includes(scopeId),
            )
          )
            missing();
        }
        if (!normalized.archived) {
          const duplicate = await client.query(
            `SELECT id FROM finance_ledger_catalogs WHERE kind='articles' AND NOT archived AND id<>$1
             AND responsibility_scope_ids && $2::uuid[] AND
             (data->>'normalizedName'=$3 OR ($4<>'' AND data->>'normalizedCode'=$4))`,
            [
              id,
              scopeIds,
              normalized.normalizedName,
              normalized.normalizedCode,
            ],
          );
          if (duplicate.rowCount)
            conflict(
              'Статья с таким названием или кодом уже существует. Используйте существующую статью.',
              'FINANCE_ARTICLE_DUPLICATE',
            );
        }
        if (old) {
          const dependencies = await client.query(
            `SELECT * FROM finance_ledger_catalogs WHERE NOT archived
             AND kind IN ('plans','classification_rules','allocation_rules')
             AND (kind<>'plans' OR coalesce(data->>'status','planned')<>'cancelled')
             AND (kind='plans' OR coalesce(data->>'active','true')<>'false')
             AND (data->>'articleId'=$1 OR data#>>'{accrual,articleId}'=$1)`,
            [id],
          );
          const nextState = {
            ...state,
            catalogs: [
              ...state.catalogs.filter((row) => row.id !== id),
              { ...normalized, kind: 'articles' },
            ],
          };
          for (const dependency of dependencies.rows) {
            try {
              this.resolveCatalogArticle(
                dependency.kind,
                structuredClone(catalogRow(dependency)),
                nextState,
              );
            } catch (error) {
              if (error instanceof BadRequestException)
                conflict(
                  'Изменение статьи нарушит действующий план или правило. Сначала отмените план, отключите правило или замените в них статью.',
                  'FINANCE_ARTICLE_IN_USE',
                );
              throw error;
            }
          }
        }
      }
      if (kind === 'parties' && normalized.inn && !body.archived) {
        // Avoid leaking an inaccessible duplicate's details; the user must ask
        // an authorized colleague to connect that identity instead of cloning it.
        const duplicate = await client.query(
          `SELECT id FROM finance_ledger_catalogs WHERE kind='parties' AND data->>'inn'=$1 AND coalesce(data->>'kpp','')=$2 AND NOT archived AND id<>$3`,
          [normalized.inn, normalized.kpp || '', id],
        );
        if (duplicate.rowCount)
          conflict(
            'Контрагент с такими ИНН/КПП уже существует. Используйте существующую карточку.',
            'FINANCE_DUPLICATE_COUNTERPARTY',
          );
      }
      if (kind === 'allocation_rules') {
        for (const scope of selectedScopes)
          this.references({ articleId: normalized.articleId }, scope, state);
        for (const weight of normalized.weights || []) {
          const target = state.catalogs.find(
            (row) =>
              row.kind === 'directions' &&
              row.id === weight.directionId &&
              !row.archived,
          );
          if (
            !target ||
            scopeIds.some(
              (scopeId) => !target.responsibilityScopeIds.includes(scopeId),
            )
          )
            missing();
        }
      }
      if (kind === 'classification_rules') {
        if (
          !normalized.counterpartyId &&
          !(
            typeof normalized.contains === 'string' &&
            normalized.contains.trim()
          )
        )
          invalid('Правилу нужны контрагент или текст назначения.');
        if (
          !normalized.directionId &&
          !normalized.articleId &&
          !(typeof normalized.article === 'string' && normalized.article.trim())
        )
          invalid('Укажите статью или направление правила.');
        if (normalized.contains && normalized.contains.length > 500)
          invalid('Условие правила слишком длинное.');
        if (normalized.effectiveFrom) date(normalized.effectiveFrom);
        if (normalized.effectiveTo) date(normalized.effectiveTo);
        if (
          normalized.effectiveFrom &&
          normalized.effectiveTo &&
          (normalized.ruleType === 'fuel'
            ? normalized.effectiveFrom > normalized.effectiveTo
            : normalized.effectiveFrom >= normalized.effectiveTo)
        )
          invalid('Период правила некорректен.');
        for (const scope of selectedScopes)
          this.references(normalized, scope, state);
      }
      if (kind === 'plans') {
        const scope = this.resolveScope(normalized, selectedScopes, state);
        this.references(normalized, scope, state);
        if (normalized.accrual)
          this.references(
            { ...normalized, ...normalized.accrual },
            scope,
            state,
          );
        if (old?.documentId && normalized.documentId !== old.documentId)
          conflict(
            'Связь существующего плана с документом не меняется молча. Отмените план и создайте новый.',
          );
      }
      const version = (old?.version || 0) + 1;
      const data = { ...normalized, version };
      delete data.idempotencyKey;
      if (old)
        await client.query(
          'UPDATE finance_ledger_catalogs SET data=$2::jsonb,version=$3,archived=$4,responsibility_scope_ids=$5,updated_by=$6,updated_at=clock_timestamp() WHERE id=$1',
          [
            id,
            JSON.stringify(data),
            version,
            (body.archived ?? old.archived) === true,
            scopeIds,
            actor.id,
          ],
        );
      else
        await client.query(
          'INSERT INTO finance_ledger_catalogs(id,kind,legal_entity_id,responsibility_scope_ids,data,created_by,updated_by,archived) VALUES($1,$2,$3,$4,$5::jsonb,$6,$6,$7)',
          [
            id,
            kind,
            entityId,
            scopeIds,
            JSON.stringify(data),
            actor.id,
            normalized.archived === true,
          ],
        );
      await this.auditEvent(
        client,
        actor,
        selectedScopes[0],
        'catalog.saved',
        id,
        {
          kind,
          version,
          ...(kind === 'articles' ? { before: old || null, after: data } : {}),
        },
      );
      const result = catalogRow(
        (
          await client.query(
            'SELECT * FROM finance_ledger_catalogs WHERE id=$1',
            [id],
          )
        ).rows[0],
      );
      return this.remember(
        client,
        actor,
        body.idempotencyKey,
        body,
        `catalog.${kind}`,
        result,
        selectedScopes,
      );
    });
  }
  async insertOperation(
    client,
    actor,
    scopes,
    rawInput,
    state,
    key,
    correctionOfId = null,
    preserveArticleSnapshot = null,
  ) {
    if (Object.hasOwn(rawInput, 'data'))
      invalid('Используйте плоские поля операции.');
    const input = aliases(rawInput);
    const scope = this.resolveScope(input, scopes, state);
    date(input.date);
    this.closed(state, scope, input.date);
    this.references(input, scope, state, preserveArticleSnapshot);
    if (
      input.source &&
      /(?:^|[_:-])(demo|test)(?:$|[_:-])/i.test(input.source.system || '')
    )
      invalid(
        'Демонстрационный источник не включается в рабочий финансовый учет.',
      );
    const canonicalInput = {
      ...input,
      ...Object.fromEntries(tupleKeys.map((field) => [field, scope[field]])),
      id: input.id ? uuid(input.id) : randomUUID(),
    };
    delete canonicalInput.idempotencyKey;
    delete canonicalInput.relatedScopeIds;
    delete canonicalInput.accessScopeIds;
    delete canonicalInput.correctionOfId;
    if (correctionOfId) canonicalInput.correctionOfId = correctionOfId;
    if (input.kind === 'consolidation_adjustment') {
      if (
        !Array.isArray(input.consolidationEntityIds) ||
        input.consolidationEntityIds.length < 2 ||
        input.consolidationEntityIds.some(
          (id) => !state.fullEntityIds.includes(id),
        )
      )
        forbidden();
    }
    if (
      !['opening', 'adjustment', 'consolidation_adjustment'].includes(
        input.kind,
      )
    )
      delete canonicalInput.postings;
    else
      canonicalInput.postings = (input.postings || []).map((posting) => {
        const postingScope = posting.responsibilityScopeId
          ? scopes.find(
              (candidate) =>
                (input.kind === 'consolidation_adjustment'
                  ? input.consolidationEntityIds.includes(
                      candidate.legalEntityId,
                    )
                  : candidate.legalEntityId === scope.legalEntityId) &&
                candidate.responsibilityScopeId ===
                  posting.responsibilityScopeId,
            )
          : scope;
        if (!postingScope) forbidden();
        const { documentId, ...dimensions } = posting;
        this.references(
          { ...dimensions, kind: 'posting' },
          postingScope,
          state,
        );
        return {
          ...posting,
          ...Object.fromEntries(
            tupleKeys.map((key) => [key, postingScope[key]]),
          ),
        };
      });
    // For explicit opening/adjustment operations the domain accepts documented
    // lines, never client supplied canonical postings from a previous response.
    const requestHash = digest({ ...canonicalInput, id: undefined });
    if (input.source) {
      const previousRows = (
        await client.query(
          'SELECT * FROM finance_ledger_operations WHERE legal_entity_id=$1 AND source_system=$2 AND source_id=$3',
          [scope.legalEntityId, input.source.system, input.source.id],
        )
      ).rows;
      if (
        previousRows.some(
          (row) =>
            !(
              row.related_scope_ids?.length
                ? row.related_scope_ids
                : [row.responsibility_scope_id]
            ).every((id) =>
              scopes.some((scope) => scope.responsibilityScopeId === id),
            ),
        )
      )
        missing();
      const previous = previousRows.find(
        (row) => row.source_version === String(input.source.version || '1'),
      );
      if (previous) {
        if (previous.request_hash !== requestHash)
          conflict(
            'Источник уже загружен с другими данными. Требуется связанная корректировка.',
            'FINANCE_SOURCE_CONFLICT',
          );
        return operationRow(previous);
      }
      if (previousRows.length && !correctionOfId)
        conflict(
          'Получена новая версия уже учтенного источника. Сопоставьте ее с прежней операцией и оформите корректировку.',
          'FINANCE_SOURCE_REVISION_REVIEW',
        );
    }
    const context = {
      ...state,
      preserveArticleSnapshot,
      allowCrossScopeSettlements:
        state.fullEntityIds?.includes(scope.legalEntityId) === true,
    };
    const operation = callDomain('buildOperation', canonicalInput, context);
    const relatedScopeIds = operation.relatedScopeIds || [
      scope.responsibilityScopeId,
    ];
    if (
      relatedScopeIds.some(
        (id) =>
          !scopes.some(
            (allowed) =>
              (operation.consolidationOnly
                ? operation.consolidationEntityIds.includes(
                    allowed.legalEntityId,
                  )
                : allowed.legalEntityId === scope.legalEntityId) &&
              allowed.responsibilityScopeId === id,
          ),
      )
    )
      forbidden();
    for (const id of relatedScopeIds)
      this.closed(
        state,
        scopes.find((row) => row.responsibilityScopeId === id),
        operation.date,
      );
    if (operation.source) {
      const previous = (
        await client.query(
          'SELECT o.* FROM finance_ledger_operations o WHERE legal_entity_id=$1 AND source_system=$2 AND source_id=$3 AND source_version=$4',
          [
            scope.legalEntityId,
            operation.source.system,
            operation.source.id,
            String(operation.source.version || '1'),
          ],
        )
      ).rows[0];
      if (previous) {
        if (
          !scopes.some((candidate) =>
            tuple(candidate).every(
              (value, index) => value === tuple(operationRow(previous))[index],
            ),
          )
        )
          missing();
        const normalizeIdentity = (value) =>
          JSON.parse(
            JSON.stringify(value).split(value.id).join('__SOURCE_OPERATION__'),
          );
        const incoming = normalizeIdentity(operation),
          stored = normalizeIdentity(previous.data);
        if (digest(incoming) !== digest(stored))
          conflict(
            'Источник уже загружен с другими данными. Требуется связанная корректировка.',
            'FINANCE_SOURCE_CONFLICT',
          );
        return operationRow(previous);
      }
    }
    await client.query(
      `INSERT INTO finance_ledger_operations(id,legal_entity_id,region_id,project_id,responsibility_scope_id,operation_date,kind,data,source_system,source_id,source_version,reverses_id,idempotency_key,request_hash,created_by,related_scope_ids)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [
        operation.id,
        ...tuple(scope),
        operation.date,
        operation.kind,
        JSON.stringify(operation),
        operation.source?.system || null,
        operation.source?.id || null,
        operation.source ? String(operation.source.version || '1') : null,
        operation.reversesId ||
          (operation.kind === 'reversal'
            ? operation.originalOperationId
            : null) ||
          null,
        key,
        requestHash,
        actor.id,
        relatedScopeIds,
      ],
    );
    await this.auditEvent(
      client,
      actor,
      scope,
      'operation.posted',
      operation.id,
      {
        kind: operation.kind,
        amountKopecks: operation.amountKopecks,
        source: operation.source || null,
      },
    );
    state.operations.push({ ...operation, version: 1 });
    return {
      ...operation,
      version: 1,
      plannedDate: operation.expectedDate ?? null,
    };
  }
  async createOperation(supplied, body, forceKind) {
    object(body);
    if (body.kind === 'plan' && !forceKind)
      return this.saveCatalog(supplied, 'plans', body);
    return this.transaction(supplied, true, async (client, actor, scopes) => {
      const action = forceKind || 'operation.create';
      const replay = await this.replay(
        client,
        actor,
        scopes,
        body.idempotencyKey,
        body,
        action,
      );
      if (replay) return replay;
      const state = await this.state(client, scopes);
      const result = await this.insertOperation(
        client,
        actor,
        scopes,
        forceKind ? { ...body, kind: forceKind } : body,
        state,
        body.idempotencyKey,
      );
      return this.remember(
        client,
        actor,
        body.idempotencyKey,
        body,
        action,
        result,
        scopes.filter((scope) =>
          (result.relatedScopeIds || [result.responsibilityScopeId]).includes(
            scope.responsibilityScopeId,
          ),
        ),
      );
    });
  }
  async reverse(supplied, id, body) {
    return this.createOperation(supplied, {
      ...object(body),
      originalOperationId: uuid(id),
      reversesId: uuid(id),
      kind: 'reversal',
      reason: reason(body.reason),
    });
  }
  async distributionDependencies(client, original, patch, state) {
    if (
      !['expense', 'supplier_advance', 'payment_out'].includes(original.kind) ||
      !['allocationWeights', 'allocationRuleId'].some((key) =>
        Object.hasOwn(patch, key),
      )
    )
      return [];
    const reversedIds = new Set(
      state.operations.map((row) => row.reversesId).filter(Boolean),
    );
    const live = state.operations.filter(
      (row) => row.kind !== 'reversal' && !reversedIds.has(row.id),
    );
    const byId = new Map(live.map((row) => [row.id, row]));
    // Read the complete reference graph independently of scoped projections.
    // Any hidden dependency blocks a correction, without disclosing its data.
    const authoritative = (
      await client.query(
        `
      WITH RECURSIVE live AS MATERIALIZED (
        SELECT o.id,o.data,o.related_scope_ids,o.responsibility_scope_id
        FROM finance_ledger_operations o WHERE (o.legal_entity_id=$2 OR o.data->>'consolidationOnly'='true') AND o.kind<>'reversal'
        AND NOT EXISTS (SELECT 1 FROM finance_ledger_operations r WHERE r.reverses_id=o.id)
      ), edges AS MATERIALIZED (
        SELECT o.id,regexp_replace(ref.parent,':cost$','') AS parent FROM live o
        CROSS JOIN LATERAL (
          SELECT o.data->>'paymentId' AS parent UNION ALL SELECT o.data->>'documentId'
          UNION ALL SELECT o.data->>'receivableId' UNION ALL SELECT o.data->>'payableId'
          UNION ALL SELECT a->>'documentId' FROM jsonb_array_elements(coalesce(o.data->'allocations','[]'::jsonb)) a
          UNION ALL SELECT a->>'paymentId' FROM jsonb_array_elements(coalesce(o.data->'allocations','[]'::jsonb)) a
          UNION ALL SELECT p->>'documentId' FROM jsonb_array_elements(o.data->'postings') p
          UNION ALL SELECT p->>'paymentId' FROM jsonb_array_elements(o.data->'postings') p
          UNION ALL SELECT p->>'originOperationId' FROM jsonb_array_elements(o.data->'postings') p
        ) ref WHERE ref.parent IS NOT NULL
      ), graph(id) AS (
        SELECT $1::uuid UNION SELECT e.id FROM edges e JOIN graph g ON e.parent=g.id::text
      ) SELECT l.id,l.related_scope_ids,l.responsibility_scope_id FROM live l JOIN graph g ON g.id=l.id`,
        [original.id, original.legalEntityId],
      )
    ).rows;
    if (authoritative.length > 101)
      conflict(
        'Связей слишком много для исправления одной строкой. Разберите связанные документы отдельно.',
        'FINANCE_DISTRIBUTION_COMPLEX',
      );
    if (
      authoritative.some(
        (row) =>
          !(
            row.related_scope_ids.length
              ? row.related_scope_ids
              : [row.responsibility_scope_id]
          ).every((id) => state.allowedScopeIds.includes(id)) ||
          !byId.has(row.id),
      )
    )
      forbidden();
    const incoming = new Map(),
      outgoing = new Map();
    for (const row of live) {
      const parents = linkedOperationIds(row);
      incoming.set(row.id, parents);
      for (const parent of parents) {
        if (!outgoing.has(parent)) outgoing.set(parent, []);
        outgoing.get(parent).push(row.id);
      }
    }
    const selected = new Set([original.id]),
      pending = [original.id];
    while (pending.length) {
      for (const id of outgoing.get(pending.shift()) || []) {
        if (selected.has(id)) continue;
        if (selected.size >= 101)
          conflict(
            'Связей слишком много для исправления одной строкой. Разберите связанные документы отдельно.',
            'FINANCE_DISTRIBUTION_COMPLEX',
          );
        selected.add(id);
        pending.push(id);
      }
    }
    if (selected.size === 1) return [];
    if (
      Object.entries(patch).some(
        ([key, value]) =>
          ![
            'allocationWeights',
            'allocationRuleId',
            'directionId',
            'articleId',
            'article',
          ].includes(key) &&
          digest({ value }) !== digest({ value: original[key] }),
      )
    )
      conflict(
        'У оплаченного расхода можно отдельно изменить распределение. Суммы и другие реквизиты исправляются отдельно.',
        'FINANCE_DISTRIBUTION_COMPLEX',
      );
    const result = [],
      visited = new Set([original.id]);
    while (visited.size < selected.size) {
      const next = [...selected]
        .filter(
          (id) =>
            !visited.has(id) &&
            [...incoming.get(id)].every(
              (parent) => !selected.has(parent) || visited.has(parent),
            ),
        )
        .map((id) => byId.get(id))
        .sort(
          (a, b) =>
            a.date.localeCompare(b.date) ||
            String(a.createdAt || '').localeCompare(
              String(b.createdAt || ''),
            ) ||
            a.id.localeCompare(b.id),
        )[0];
      if (
        !next ||
        !(
          original.kind === 'expense'
            ? ['payment_out', 'settlement']
            : ['settlement']
        ).includes(next.kind)
      )
        conflict(
          'Распределение связано со взаимозачетом или другой корректировкой. Сначала разберите эти связи отдельно.',
          'FINANCE_DISTRIBUTION_COMPLEX',
        );
      if (next.projected || next.legalEntityId !== original.legalEntityId)
        forbidden();
      visited.add(next.id);
      result.push(next);
    }
    return result;
  }
  async replayDistributionDependencies(
    client,
    actor,
    scopes,
    state,
    original,
    replacement,
    dependencies,
    key,
    reason,
  ) {
    const mapping = new Map([[original.id, replacement.id]]),
      replayed = [];
    for (const previous of dependencies) {
      const input = remapAccountingLinks(previous, mapping);
      Object.assign(input, {
        id: randomUUID(),
        reason,
        source: previous.source
          ? {
              ...previous.source,
              version: `${previous.source.version || '1'}:correction:${randomUUID()}`,
            }
          : undefined,
      });
      for (const name of [
        'postings',
        'cashFlows',
        'createdAt',
        'originalOperationId',
        'reversesId',
        'allocationRule',
        'allocationMethod',
      ])
        delete input[name];
      const current = await this.insertOperation(
        client,
        actor,
        scopes,
        input,
        state,
        `${key}:replay:${previous.id}`,
        previous.id,
        previous.articleId
          ? { articleId: previous.articleId, article: previous.article }
          : null,
      );
      if (
        cashSignature(previous) !== cashSignature(current) ||
        previous.amountKopecks !== current.amountKopecks ||
        previous.counterpartyId !== current.counterpartyId
      )
        conflict(
          'Распределение не может менять фактические платежи или суммы зачетов.',
          'FINANCE_CASH_FACT_IMMUTABLE',
        );
      mapping.set(previous.id, current.id);
      replayed.push(current);
    }
    const plans = (
      await client.query(
        `SELECT * FROM finance_ledger_catalogs WHERE kind='plans' AND NOT archived
       AND coalesce(data->>'status','planned')<>'cancelled' AND data->>'documentId'=ANY($1::text[]) FOR UPDATE`,
        [[...mapping.keys()]],
      )
    ).rows;
    for (const row of plans) {
      if (
        !row.responsibility_scope_ids.every((id) =>
          scopes.some((scope) => scope.responsibilityScopeId === id),
        )
      )
        forbidden();
      const previous = catalogRow(row),
        current = {
          ...previous,
          documentId: mapping.get(previous.documentId),
          version: previous.version + 1,
        };
      await client.query(
        'UPDATE finance_ledger_catalogs SET data=$2::jsonb,version=$3,updated_by=$4,updated_at=clock_timestamp() WHERE id=$1',
        [row.id, JSON.stringify(current), current.version, actor.id],
      );
      const index = state.catalogs.findIndex((item) => item.id === row.id);
      if (index >= 0) state.catalogs[index] = current;
      await this.auditEvent(
        client,
        actor,
        scopes.find(
          (scope) =>
            scope.responsibilityScopeId === row.responsibility_scope_ids[0],
        ),
        'plan.document_corrected',
        row.id,
        {
          previousDocumentId: previous.documentId,
          documentId: current.documentId,
          version: current.version,
        },
      );
    }
    return { replayed, updatedPlans: plans.length };
  }
  async patchOperations(supplied, body) {
    object(body);
    object(body.patch);
    if (
      !Array.isArray(body.items) ||
      !body.items.length ||
      body.items.length > 200
    )
      invalid('Выберите от 1 до 200 операций.');
    const allowed = [
      'kind',
      'directionId',
      'article',
      'articleId',
      'description',
      'expectedDate',
      'plannedDate',
      'dueDate',
      'counterpartyId',
      'allocationRuleId',
      'allocationWeights',
      'amountKopecks',
      'vatKopecks',
      'allocations',
      'cashAccountId',
      'toCashAccountId',
      'status',
      'date',
      'supplierCounterpartyId',
      'costKopecks',
      'costVatKopecks',
      'purchaseMode',
    ];
    if (Object.keys(body.patch).some((key) => !allowed.includes(key)))
      invalid('Это поле нельзя изменить массовой правкой.');
    if (body.patch.allocationWeights != null && body.patch.allocationRuleId)
      invalid(
        'Выберите доли вручную или сохраненное правило.',
        'FINANCE_ALLOCATION_CONFLICT',
      );
    return this.transaction(supplied, true, async (client, actor, scopes) => {
      const replay = await this.replay(
        client,
        actor,
        scopes,
        body.idempotencyKey,
        body,
        'operations.patch',
      );
      if (replay) return replay;
      const state = await this.state(client, scopes),
        items = [],
        replayedOperations = [];
      let updatedPlans = 0;
      for (const item of body.items) {
        const original = state.operations.find((op) => op.id === uuid(item.id));
        if (!original) missing();
        if (original.projected) forbidden();
        if (
          item.version !== 1 ||
          state.operations.some(
            (op) =>
              op.reversesId === original.id ||
              op.originalOperationId === original.id,
          )
        )
          conflict(
            'Операция уже изменена. Обновите журнал.',
            'FINANCE_VERSION_CONFLICT',
          );
        const changeReason = body.reason || 'Исправление реквизитов операции';
        const dependencies = await this.distributionDependencies(
          client,
          original,
          body.patch,
          state,
        );
        for (const dependency of [...dependencies].reverse())
          await this.insertOperation(
            client,
            actor,
            scopes,
            {
              kind: 'reversal',
              originalOperationId: dependency.id,
              reversesId: dependency.id,
              date: dependency.date,
              legalEntityId: dependency.legalEntityId,
              reason: changeReason,
            },
            state,
            `${body.idempotencyKey}:reverse:${dependency.id}`,
          );
        await this.insertOperation(
          client,
          actor,
          scopes,
          {
            kind: 'reversal',
            originalOperationId: original.id,
            reversesId: original.id,
            date: original.date,
            legalEntityId: original.legalEntityId,
            reason: changeReason,
          },
          state,
          `${body.idempotencyKey}:reverse:${original.id}`,
        );
        const replacement = {
          ...original,
          ...aliases(body.patch),
          status:
            body.patch.status ||
            (['cash_in', 'cash_out'].includes(original.kind) &&
            body.patch.kind &&
            !['cash_in', 'cash_out'].includes(body.patch.kind)
              ? 'confirmed'
              : original.status),
          id: randomUUID(),
          correctionOfId: original.id,
          reason: changeReason,
          source: original.source
            ? {
                ...original.source,
                version: `${original.source.version || '1'}:correction:${randomUUID()}`,
              }
            : undefined,
        };
        if (Object.hasOwn(body.patch, 'allocationWeights')) {
          if (body.patch.allocationWeights == null)
            delete replacement.allocationWeights;
          else delete replacement.allocationRuleId;
        }
        if (Object.hasOwn(body.patch, 'allocationRuleId')) {
          if (body.patch.allocationRuleId) delete replacement.allocationWeights;
          if (body.patch.allocationRuleId == null)
            delete replacement.allocationRuleId;
        }
        delete replacement.allocationRule;
        delete replacement.allocationMethod;
        if (
          Object.hasOwn(body.patch, 'article') &&
          !Object.hasOwn(body.patch, 'articleId') &&
          body.patch.article !== original.article
        )
          replacement.articleId = null;
        const preserveArticleSnapshot =
          original.articleId &&
          (!Object.hasOwn(body.patch, 'articleId') ||
            body.patch.articleId === original.articleId) &&
          (!Object.hasOwn(body.patch, 'article') ||
            body.patch.article === original.article)
            ? { articleId: original.articleId, article: original.article }
            : null;
        delete replacement.reversesId;
        delete replacement.originalOperationId;
        delete replacement.createdAt;
        if (!['opening', 'adjustment'].includes(replacement.kind))
          delete replacement.postings;
        const result = await this.insertOperation(
          client,
          actor,
          scopes,
          replacement,
          state,
          `${body.idempotencyKey}:replace:${original.id}`,
          original.id,
          preserveArticleSnapshot,
        );
        if (
          ['bank', 'cash'].includes(original.source?.system) &&
          cashSignature(original) !== cashSignature(result)
        )
          conflict(
            'Разнесение не может менять дату, сумму, направление движения или счет фактического платежа. Начисление оформляется отдельным документом; ошибочный денежный факт отменяется отдельно с основанием.',
            'FINANCE_CASH_FACT_IMMUTABLE',
          );
        const effects = await this.replayDistributionDependencies(
          client,
          actor,
          scopes,
          state,
          original,
          result,
          dependencies,
          body.idempotencyKey,
          changeReason,
        );
        replayedOperations.push(...effects.replayed);
        updatedPlans += effects.updatedPlans;
        items.push(result);
      }
      return this.remember(
        client,
        actor,
        body.idempotencyKey,
        body,
        'operations.patch',
        {
          items,
          distributionEffects: {
            replayedOperations: replayedOperations.length,
            updatedPlans,
            operationIds: replayedOperations.map((row) => row.id),
          },
        },
        scopes.filter((scope) =>
          [...items, ...replayedOperations].some((item) =>
            (item.relatedScopeIds || [item.responsibilityScopeId]).includes(
              scope.responsibilityScopeId,
            ),
          ),
        ),
      );
    });
  }
  async closePeriod(supplied, body) {
    object(body);
    const from = date(body.from || body.dateFrom),
      to = date(body.to || body.dateTo);
    if (to < from) invalid('Период закрытия некорректен.');
    return this.transaction(supplied, true, async (client, actor, scopes) => {
      if (!this.permissions(actor).canClose) forbidden();
      const replay = await this.replay(
        client,
        actor,
        scopes,
        body.idempotencyKey,
        body,
        'period.close',
      );
      if (replay) return replay;
      const state = await this.state(client, scopes),
        entity = this.resolveEntity(body, scopes);
      const selected = scopes.filter(
        (scope) =>
          scope.legalEntityId === entity &&
          (!body.responsibilityScopeId ||
            scope.responsibilityScopeId === body.responsibilityScopeId),
      );
      if (!selected.length) missing();
      for (const scope of selected)
        if (
          state.closures.some(
            (row) =>
              row.responsibilityScopeId === scope.responsibilityScopeId &&
              !row.reopenedAt &&
              row.from <= to &&
              row.to >= from,
          )
        )
          conflict('Этот период уже закрыт.', 'FINANCE_PERIOD_CLOSED');
      const filtered = {
        ...state,
        operations: state.operations.filter((op) =>
          selected.some((scope) =>
            (op.relatedScopeIds || [op.responsibilityScopeId]).includes(
              scope.responsibilityScopeId,
            ),
          ),
        ),
      };
      const reports = callDomain('buildReports', filtered, {
        from,
        to,
        legalEntityIds: [entity],
        responsibilityScopeIds: selected.map(
          (scope) => scope.responsibilityScopeId,
        ),
      });
      const controls = reports.controls || [];
      const blockingCodes = [
        'UNCLASSIFIED_CASH',
        'UNASSIGNED_DIRECTION',
        'PROVISIONAL_ACCRUALS',
        'INTERCOMPANY_UNMATCHED',
        'INTERCOMPANY_MISMATCH',
        'INTERCOMPANY_ASSET_PROFIT_REVIEW',
        'INTERCOMPANY_CASH_UNMATCHED',
        'NO_DATA',
        'CASH_STATEMENT_UNVERIFIED',
        'CASH_STATEMENT_DIFFERENCE',
        'CASH_STATEMENT_STALE',
        'OPENING_BALANCES_UNVERIFIED',
      ];
      const issues = Array.isArray(controls)
        ? controls.filter(
            (row) =>
              row.blocking ||
              row.severity === 'error' ||
              row.status === 'error' ||
              blockingCodes.includes(row.code),
          )
        : (controls.issues || []).filter(
            (row) => row.blocking || row.severity === 'error',
          );
      const unresolved = filtered.operations.filter(
        (op) =>
          op.date <= to &&
          ((op.status === 'provisional' &&
            !state.confirmedDocumentIds.includes(op.id)) ||
            ['cash_in', 'cash_out'].includes(op.kind)) &&
          !filtered.operations.some(
            (reversal) => reversal.reversesId === op.id,
          ),
      );
      if (issues.length || unresolved.length)
        conflict(
          (
            'Сначала разберите: ' +
            [
              ...issues.map((row) => row.message || row.code),
              ...(unresolved.length
                ? [
                    `неподтвержденных или неразобранных операций: ${unresolved.length}`,
                  ]
                : []),
            ].join('; ')
          ).slice(0, 500),
          'FINANCE_CLOSE_BLOCKED',
        );
      if (
        require('../domain/finance-automation').recurringState(filtered, to)
          .pending.length
      )
        conflict(
          'Подтвердите и отразите регулярные начисления за период.',
          'FINANCE_CLOSE_BLOCKED',
        );
      if (
        body.openingBalancesVerified !== true ||
        body.sourcesReconciled !== true
      )
        invalid(
          'Подтвердите сверку входящих остатков и полноты источников.',
          'FINANCE_CLOSE_EVIDENCE_REQUIRED',
        );
      const confirmation = reason(body.reason || body.evidence);
      const items = [];
      for (const scope of selected) {
        const id = randomUUID(),
          data = {
            from,
            to,
            reason: confirmation,
            openingBalancesVerified: true,
            sourcesReconciled: true,
            reportsHash: digest(reports),
            operationCount: filtered.operations.length,
          };
        await client.query(
          'INSERT INTO finance_ledger_closures(id,legal_entity_id,region_id,project_id,responsibility_scope_id,date_from,date_to,data,closed_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)',
          [id, ...tuple(scope), from, to, JSON.stringify(data), actor.id],
        );
        await this.auditEvent(client, actor, scope, 'period.closed', id, {
          from,
          to,
          reportsHash: data.reportsHash,
        });
        items.push({
          id,
          ...data,
          legalEntityId: entity,
          responsibilityScopeId: scope.responsibilityScopeId,
          version: 1,
        });
      }
      return this.remember(
        client,
        actor,
        body.idempotencyKey,
        body,
        'period.close',
        { items },
        selected,
      );
    });
  }
  async reopenPeriod(supplied, body) {
    object(body);
    const id = uuid(body.id),
      explanation = reason(body.reason);
    return this.transaction(supplied, true, async (client, actor, scopes) => {
      if (!this.permissions(actor).canReopen) forbidden();
      const replay = await this.replay(
        client,
        actor,
        scopes,
        body.idempotencyKey,
        body,
        'period.reopen',
      );
      if (replay) return replay;
      const row = (
        await client.query(
          `SELECT c.*,c.date_from::text AS date_from,c.date_to::text AS date_to FROM finance_ledger_closures c WHERE id=$1 AND ${scopeSQL('c', 2)} FOR UPDATE`,
          [id, JSON.stringify(scopes)],
        )
      ).rows[0];
      if (!row) missing();
      if (row.reopened_at || row.version !== body.version)
        conflict('Период уже изменен.', 'FINANCE_VERSION_CONFLICT');
      const scope = scopes.find(
        (item) => item.responsibilityScopeId === row.responsibility_scope_id,
      );
      await client.query(
        'UPDATE finance_ledger_closures SET reopened_at=clock_timestamp(),reopened_by=$2,version=version+1,data=data || $3::jsonb WHERE id=$1',
        [id, actor.id, JSON.stringify({ reopenReason: explanation })],
      );
      await this.auditEvent(client, actor, scope, 'period.reopened', id, {
        reason: explanation,
        version: row.version + 1,
      });
      return this.remember(
        client,
        actor,
        body.idempotencyKey,
        body,
        'period.reopen',
        { id, version: row.version + 1, reopened: true },
        [scope],
      );
    });
  }
  previewResponse(record, query = {}) {
    const offset = boundedInteger(query.offset, 0),
      limit = Math.max(1, boundedInteger(query.limit, 200, 500));
    const { rows, ...metadata } = record.data;
    return {
      ...metadata,
      id: record.id,
      version: record.version,
      legalEntityId: record.legal_entity_id,
      responsibilityScopeIds: record.responsibility_scope_ids,
      rows: rows.slice(offset, offset + limit),
      totalRows: rows.length,
      offset,
      limit,
    };
  }
  async previewImport(supplied, body) {
    object(body);
    if (
      typeof body.contentBase64 !== 'string' ||
      body.contentBase64.length > 28 * 1024 * 1024 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(body.contentBase64)
    )
      invalid('Нужен файл импорта размером до 20 МиБ.');
    const buffer = Buffer.from(body.contentBase64, 'base64');
    if (!buffer.length || buffer.length > 20 * 1024 * 1024)
      invalid('Нужен файл импорта размером до 20 МиБ.');
    return this.transaction(supplied, true, async (client, actor, scopes) => {
      const entityId = this.resolveEntity(body, scopes);
      let parsed;
      try {
        parsed = await require('../domain/finance-import').parseFinanceImport({
          buffer,
          fileName: body.fileName,
          sourceType: body.sourceType,
          selectedSheets: body.selectedSheets,
        });
      } catch (error) {
        if (error.code?.startsWith('FINANCE_'))
          invalid(String(error.message).slice(0, 500), error.code);
        throw error;
      }
      const allowed = scopes.filter(
        (scope) =>
          scope.legalEntityId === entityId &&
          (!body.responsibilityScopeId ||
            scope.responsibilityScopeId === body.responsibilityScopeId),
      );
      if (!allowed.length) missing();
      const ids = allowed.map((scope) => scope.responsibilityScopeId).sort();
      const existing = (
        await client.query(
          `SELECT * FROM finance_ledger_catalogs WHERE kind='import_previews' AND legal_entity_id=$1 AND data->>'sha256'=$2 AND data->>'sourceType'=$3 AND responsibility_scope_ids=$4::uuid[] ORDER BY created_at DESC LIMIT 1`,
          [entityId, parsed.sha256, parsed.sourceType, ids],
        )
      ).rows[0];
      const state = await this.state(client, allowed);
      const prior = (
        await client.query(
          `SELECT data->'committedRows' AS rows FROM finance_ledger_catalogs WHERE kind='import_previews' AND legal_entity_id=$1 AND responsibility_scope_ids <@ $2::uuid[]`,
          [entityId, ids],
        )
      ).rows.flatMap((row) => row.rows || []);
      const priorFingerprints = new Map(
        prior
          .filter((row) => row.sourceFingerprint)
          .map((row) => [row.sourceFingerprint, row.operationId]),
      );
      const knownSources = new Map(
        [
          ...state.operations.filter((row) => !row.projected),
          ...state.catalogs.filter((row) => row.kind === 'plans'),
        ]
          .filter((row) => row.source)
          .map((row) => [
            `${row.source.system}:${row.source.id}:${row.source.version || '1'}`,
            row.id,
          ]),
      );
      for (const row of parsed.rows) {
        const matches = state.catalogs.filter(
          (party) =>
            party.kind === 'parties' &&
            !party.archived &&
            row.counterparty?.inn &&
            party.inn === row.counterparty.inn &&
            (!row.counterparty.kpp || party.kpp === row.counterparty.kpp),
        );
        if (matches.length === 1) row.operation.counterpartyId = matches[0].id;
        const accounts = state.catalogs.filter(
          (account) =>
            account.kind === 'accounts' &&
            !account.archived &&
            row.ownEntity?.bankAccount &&
            [
              account.number,
              account.bankAccount,
              account.accountNumber,
            ].includes(row.ownEntity.bankAccount),
        );
        if (accounts.length === 1) row.operation.cashAccountId = accounts[0].id;
        row.operation.legalEntityId = entityId;
        if (allowed.length === 1)
          row.operation.responsibilityScopeId =
            allowed[0].responsibilityScopeId;
        if (row.operation.source)
          row.existingOperationId =
            knownSources.get(
              `${row.operation.source.system}:${row.operation.source.id}:${row.operation.source.version || '1'}`,
            ) || null;
        row.candidateDuplicateOperationId =
          priorFingerprints.get(row.sourceFingerprint) || null;
        if (row.candidateDuplicateOperationId)
          row.issues.push(
            'Есть похожая ранее загруженная операция: проверьте связь или подтвердите отдельную операцию',
          );
      }
      const committedRows = existing?.data.committedRows || [];
      parsed.rows = parsed.rows.map((row) => {
        if (
          committedRows.some(
            (committed) => committed.rowNumber === row.rowNumber,
          )
        )
          return (
            existing.data.rows.find(
              (previous) => previous.rowNumber === row.rowNumber,
            ) || row
          );
        return require('../domain/finance-automation').applyFuelRules(
          row,
          state.catalogs,
          state,
        );
      });
      if (existing) {
        await client.query(
          'UPDATE finance_ledger_catalogs SET data=$2::jsonb,version=version+1,updated_by=$3,updated_at=clock_timestamp() WHERE id=$1',
          [existing.id, JSON.stringify({ ...parsed, committedRows }), actor.id],
        );
        await this.auditEvent(
          client,
          actor,
          allowed[0],
          'import.preview_refreshed',
          existing.id,
          { sha256: parsed.sha256, rowCount: parsed.rows.length },
        );
        return this.previewResponse(
          (
            await client.query(
              'SELECT * FROM finance_ledger_catalogs WHERE id=$1',
              [existing.id],
            )
          ).rows[0],
        );
      }
      const id = randomUUID();
      await client.query(
        `INSERT INTO finance_ledger_catalogs(id,kind,legal_entity_id,responsibility_scope_ids,data,created_by,updated_by) VALUES($1,'import_previews',$2,$3,$4::jsonb,$5,$5)`,
        [
          id,
          entityId,
          ids,
          JSON.stringify({ ...parsed, committedRows: [] }),
          actor.id,
        ],
      );
      await this.auditEvent(client, actor, allowed[0], 'import.previewed', id, {
        sha256: parsed.sha256,
        sourceType: parsed.sourceType,
        rowCount: parsed.rows.length,
      });
      return this.previewResponse(
        (
          await client.query(
            'SELECT * FROM finance_ledger_catalogs WHERE id=$1',
            [id],
          )
        ).rows[0],
      );
    });
  }
  async importRecord(client, scopes, id) {
    const row = (
      await client.query(
        `SELECT * FROM finance_ledger_catalogs WHERE id=$1 AND kind='import_previews' FOR UPDATE`,
        [uuid(id)],
      )
    ).rows[0];
    if (
      !row ||
      row.responsibility_scope_ids.some(
        (scopeId) =>
          !scopes.some(
            (scope) =>
              scope.responsibilityScopeId === scopeId &&
              scope.legalEntityId === row.legal_entity_id,
          ),
      )
    )
      missing();
    return row;
  }
  async readImport(supplied, id, query = {}) {
    return this.transaction(supplied, false, async (client, actor, scopes) =>
      this.previewResponse(await this.importRecord(client, scopes, id), query),
    );
  }
  async commitImport(supplied, id, body) {
    object(body);
    uuid(id);
    if (
      !Array.isArray(body.selectedRows) ||
      !body.selectedRows.length ||
      body.selectedRows.length > 500
    )
      invalid('Выберите от 1 до 500 строк для загрузки.');
    return this.transaction(supplied, true, async (client, actor, scopes) => {
      const replay = await this.replay(
        client,
        actor,
        scopes,
        body.idempotencyKey,
        { id, ...body },
        'import.commit',
      );
      if (replay) return replay;
      const preview = await this.importRecord(client, scopes, id),
        state = await this.state(client, scopes);
      const committed = [...(preview.data.committedRows || [])],
        items = [],
        usedRows = new Set();
      const prior = (
        await client.query(
          `SELECT data->'committedRows' AS rows FROM finance_ledger_catalogs WHERE kind='import_previews' AND legal_entity_id=$1 AND responsibility_scope_ids <@ $2::uuid[]`,
          [
            preview.legal_entity_id,
            scopes.map((scope) => scope.responsibilityScopeId),
          ],
        )
      ).rows.flatMap((row) => row.rows || []);
      for (const selected of body.selectedRows) {
        const rowNumber =
          typeof selected === 'object' ? selected.rowNumber : selected;
        if (!Number.isSafeInteger(rowNumber) || usedRows.has(rowNumber))
          invalid('Строка импорта повторяется или не существует.');
        usedRows.add(rowNumber);
        const source = preview.data.rows.find(
          (row) => row.rowNumber === rowNumber,
        );
        if (!source) invalid('Строка импорта не найдена.');
        const before = committed.find((row) => row.rowNumber === rowNumber);
        if (before) {
          items.push({ rowNumber, id: before.operationId, existing: true });
          continue;
        }
        const override =
          body.overrides?.[rowNumber] ||
          (typeof selected === 'object' ? selected.overrides : null) ||
          {};
        const duplicate = prior.find(
          (row) =>
            row.sourceFingerprint &&
            row.sourceFingerprint === source.sourceFingerprint,
        );
        if (
          duplicate &&
          override.existingOperationId !== duplicate.operationId &&
          override.duplicateDecision !== 'distinct'
        )
          conflict(
            'Есть похожая ранее загруженная операция. Свяжите строку с ней или подтвердите отдельную операцию.',
            'FINANCE_IMPORT_POSSIBLE_DUPLICATE',
          );
        if (override.existingOperationId) {
          const existing =
            state.operations.find(
              (op) => op.id === uuid(override.existingOperationId),
            ) ||
            state.catalogs.find(
              (row) =>
                row.id === override.existingOperationId && row.kind === 'plans',
            );
          if (
            !existing ||
            existing.projected ||
            existing.legalEntityId !== preview.legal_entity_id
          )
            missing();
          if (override.reviewed !== true)
            invalid(
              'Подтвердите проверку связи с ранее учтенной операцией.',
              'FINANCE_IMPORT_REVIEW_REQUIRED',
            );
          const moneyKinds = [
            'cash_in',
            'cash_out',
            'payment_in',
            'payment_out',
            'customer_advance',
            'supplier_advance',
            'transfer',
            'capital_in',
            'owner_distribution',
            'loan_received',
            'loan_repayment',
            'loan_issued',
            'loan_returned',
          ];
          const sameAccrualKind =
            source.operation.kind === 'plan'
              ? existing.kind === 'plans'
              : source.operation.kind === existing.kind;
          const changedAmounts = [
            'amountKopecks',
            'vatKopecks',
            'costKopecks',
            'costVatKopecks',
          ].some(
            (key) =>
              source.operation[key] !== undefined &&
              source.operation[key] !== (existing[key] ?? 0),
          );
          if (
            changedAmounts ||
            moneyKinds.includes(source.operation.kind) !==
              moneyKinds.includes(existing.kind) ||
            (!moneyKinds.includes(source.operation.kind) && !sameAccrualKind) ||
            (source.operation.counterpartyId &&
              source.operation.counterpartyId !== existing.counterpartyId)
          )
            conflict(
              'Сумма, НДС, контрагент или экономический смысл источника отличается от выбранной операции. Оформите корректировку либо связь платежа с документом.',
              'FINANCE_SOURCE_LINK_MISMATCH',
            );
          if (moneyKinds.includes(source.operation.kind)) {
            const incomingKinds = [
              'cash_in',
              'payment_in',
              'customer_advance',
              'capital_in',
              'loan_received',
              'loan_returned',
            ];
            const incoming = incomingKinds.includes(source.operation.kind);
            if (
              existing.kind !== 'transfer' &&
              incoming !== incomingKinds.includes(existing.kind)
            )
              conflict(
                'Направление движения денег отличается от выбранной операции.',
                'FINANCE_SOURCE_LINK_MISMATCH',
              );
            const account = state.catalogs.find(
              (row) =>
                row.kind === 'accounts' &&
                row.id ===
                  (existing.kind === 'transfer' && incoming
                    ? existing.toCashAccountId
                    : existing.cashAccountId),
            );
            const accountNumber =
              account?.number || account?.bankAccount || account?.accountNumber;
            if (
              source.ownEntity?.bankAccount &&
              accountNumber &&
              String(accountNumber).replace(/\s/g, '') !==
                String(source.ownEntity.bankAccount).replace(/\s/g, '')
            )
              conflict(
                'Банковский счет не соответствует стороне выбранной операции.',
                'FINANCE_IMPORT_ACCOUNT_MISMATCH',
              );
          }
          committed.push({
            rowNumber,
            operationId: existing.id,
            sourceFingerprint: source.sourceFingerprint,
            linked: true,
          });
          items.push({ rowNumber, id: existing.id, existing: true });
          continue;
        }
        const input = {
          ...source.operation,
          ...aliases(override),
          status:
            override.status ||
            source.operation.status ||
            (source.operation.confirmation === 'provisional'
              ? 'provisional'
              : 'confirmed'),
          expectedDate:
            override.expectedDate ??
            override.plannedDate ??
            source.operation.expectedDate ??
            source.operation.plannedDate ??
            source.operation.dueDate,
          legalEntityId: preview.legal_entity_id,
          source: source.operation.source,
        };
        if (
          ['bank', 'cash'].includes(preview.data.sourceType) &&
          ['cash_in', 'cash_out'].includes(source.operation.kind) &&
          (input.kind === 'plan' ||
            input.date !== source.operation.date ||
            input.amountKopecks !== source.operation.amountKopecks)
        )
          conflict(
            'Дата и сумма фактического движения сохраняются из источника.',
            'FINANCE_CASH_FACT_IMMUTABLE',
          );
        // The source's own identifiers and file evidence cannot be replaced by
        // a browser-supplied source object. Economic corrections are explicit.
        if (
          preview.data.sourceType !== 'one_c' ||
          !['opening', 'adjustment'].includes(input.kind)
        )
          delete input.postings;
        if (source.issues?.length && override.reviewed !== true)
          invalid(
            `Проверьте замечания строки ${rowNumber} и подтвердите ее разбор.`,
            'FINANCE_IMPORT_REVIEW_REQUIRED',
          );
        const scope = this.resolveScope(
          input,
          scopes.filter((scope) =>
            preview.responsibility_scope_ids.includes(
              scope.responsibilityScopeId,
            ),
          ),
          state,
        );
        if (source.ownEntity?.bankAccount && input.cashAccountId) {
          const account = state.catalogs.find(
            (row) => row.id === input.cashAccountId && row.kind === 'accounts',
          );
          const accountNumber =
            account?.number || account?.bankAccount || account?.accountNumber;
          if (
            accountNumber &&
            String(accountNumber).replace(/\s/g, '') !==
              String(source.ownEntity.bankAccount).replace(/\s/g, '')
          )
            conflict(
              'Банковский счет строки не соответствует выбранному собственному счету.',
              'FINANCE_IMPORT_ACCOUNT_MISMATCH',
            );
        }
        let result;
        if (input.kind === 'plan') {
          this.references(input, scope, state);
          const plan = callDomain(
            'validateCatalog',
            'plans',
            {
              ...input,
              id: randomUUID(),
              name:
                input.name || input.description || `Счет, строка ${rowNumber}`,
              responsibilityScopeIds: [scope.responsibilityScopeId],
              status: input.status === 'approved' ? 'approved' : 'planned',
            },
            state,
          );
          this.resolveCatalogArticle('plans', plan, state);
          const priorPlan = state.catalogs.find(
            (row) =>
              row.kind === 'plans' &&
              row.source?.system === plan.source?.system &&
              row.source?.id === plan.source?.id,
          );
          if (priorPlan)
            conflict(
              'План из этого источника уже существует. Свяжите документы, чтобы не удвоить обязательство.',
              'FINANCE_SOURCE_CONFLICT',
            );
          await client.query(
            `INSERT INTO finance_ledger_catalogs(id,kind,legal_entity_id,responsibility_scope_ids,data,created_by,updated_by) VALUES($1,'plans',$2,$3,$4::jsonb,$5,$5)`,
            [
              plan.id,
              scope.legalEntityId,
              [scope.responsibilityScopeId],
              JSON.stringify(plan),
              actor.id,
            ],
          );
          result = { ...plan, version: 1 };
          state.catalogs.push({ ...result, kind: 'plans' });
          await this.auditEvent(
            client,
            actor,
            scope,
            'plan.imported',
            plan.id,
            { previewId: id, rowNumber },
          );
        } else {
          result = await this.insertOperation(
            client,
            actor,
            scopes,
            { ...input, responsibilityScopeId: scope.responsibilityScopeId },
            state,
            `${body.idempotencyKey}:${rowNumber}`,
          );
          if (
            ['bank', 'cash'].includes(preview.data.sourceType) &&
            ['cash_in', 'cash_out'].includes(source.operation.kind)
          ) {
            const expected = {
              date: source.operation.date,
              postings: [
                {
                  account: 'cash',
                  cashAccountId: input.cashAccountId,
                  amountKopecks:
                    source.operation.amountKopecks *
                    (source.operation.kind === 'cash_in' ? 1 : -1),
                },
              ],
            };
            if (cashSignature(expected) !== cashSignature(result))
              conflict(
                'Разнесение должно сохранять фактическое движение денег. Доход или расход начислите отдельным документом.',
                'FINANCE_CASH_FACT_IMMUTABLE',
              );
          }
        }
        committed.push({
          rowNumber,
          operationId: result.id,
          sourceFingerprint: source.sourceFingerprint,
        });
        items.push({ rowNumber, ...result });
      }
      await client.query(
        `UPDATE finance_ledger_catalogs SET data=jsonb_set(data,'{committedRows}',$2::jsonb),version=version+1,updated_by=$3,updated_at=clock_timestamp() WHERE id=$1`,
        [id, JSON.stringify(committed), actor.id],
      );
      const affected = scopes.filter((scope) =>
        preview.responsibility_scope_ids.includes(scope.responsibilityScopeId),
      );
      await this.auditEvent(
        client,
        actor,
        affected[0],
        'import.committed',
        id,
        { rowNumbers: [...usedRows], count: items.length },
      );
      return this.remember(
        client,
        actor,
        body.idempotencyKey,
        { id, ...body },
        'import.commit',
        { id, items, committedCount: items.length },
        affected,
      );
    });
  }
  async suggestions(supplied, body) {
    object(body);
    if (
      !Array.isArray(body.operationIds) ||
      !body.operationIds.length ||
      body.operationIds.length > 100 ||
      new Set(body.operationIds).size !== body.operationIds.length
    )
      invalid('Выберите от 1 до 100 операций.');
    body.operationIds.forEach((id) => uuid(id));
    return this.transaction(supplied, true, async (client, actor, scopes) => {
      const state = await this.state(client, scopes);
      const selected = body.operationIds.map((id) => {
        const row = state.operations.find((op) => op.id === id);
        if (!row) missing();
        return row;
      });
      const helpers = require('../domain/finance-classification');
      const output = [],
        ai = [];
      for (const scope of scopes.filter((scope) =>
        selected.some(
          (row) => row.responsibilityScopeId === scope.responsibilityScopeId,
        ),
      )) {
        const catalog = state.catalogs
          .filter(
            (row) =>
              !row.archived &&
              row.responsibilityScopeIds.includes(scope.responsibilityScopeId),
          )
          .map((row) => ({ ...row, scopeIds: row.responsibilityScopeIds }));
        const context = {
          operations: selected.filter(
            (row) => row.responsibilityScopeId === scope.responsibilityScopeId,
          ),
          counterparties: catalog.filter((row) => row.kind === 'parties'),
          directions: catalog.filter((row) => row.kind === 'directions'),
          rules: catalog.filter((row) => row.kind === 'classification_rules'),
          articles: catalog.filter((row) => row.kind === 'articles'),
        };
        const rules = helpers.suggestionsFor(context);
        output.push(...rules);
        if (body.useAI === true) {
          const response = await this.neural.run(client, actor, scope, {
            task: 'finance_classification',
            ...helpers.buildClassificationPrompt(context),
            metadata: { orderCount: context.operations.length },
          });
          if (response) {
            let suggestions;
            try {
              suggestions = helpers.parseClassificationResponse(
                response.text,
                context,
              );
            } catch {
              invalid(
                'Предложение модели не прошло проверку. Учет не изменен.',
                'FINANCE_AI_RESPONSE_INVALID',
              );
            }
            ai.push(...suggestions);
          }
        }
        await this.auditEvent(
          client,
          actor,
          scope,
          'classification.suggested',
          undefined,
          {
            operationIds: context.operations.map((row) => row.id),
            requestedAI: body.useAI === true,
          },
        );
      }
      return {
        suggestions: output,
        aiSuggestions: ai,
        aiAvailable: ai.length > 0,
        applied: false,
      };
    });
  }
  async nativeSources(supplied, body = {}, persist = false) {
    return this.transaction(
      supplied,
      persist,
      async (client, actor, scopes) => {
        const entityId = this.resolveEntity(body, scopes),
          selected = scopes.filter((scope) => scope.legalEntityId === entityId);
        const state = await this.state(client, selected),
          from = body.from ? date(body.from) : '2000-01-01',
          to = body.to ? date(body.to) : financialToday();
        const rows = [],
          grantJSON = JSON.stringify(selected);
        const partyFor = (system, id) => {
          const matching = state.catalogs.filter(
            (row) =>
              row.kind === 'parties' &&
              !row.archived &&
              row.identityLinks?.some(
                (link) => link.system === system && link.id === id,
              ),
          );
          return matching.length === 1 ? matching[0].id : undefined;
        };
        const add = (scope, source, operation, issues = [], links = {}) => {
          if (
            /^(demo|test|synthetic|демо|тест)/i.test(
              String(operation.description || ''),
            )
          )
            return;
          const known = state.operations.find(
            (row) =>
              row.source?.system === source.system &&
              row.source?.id === source.id &&
              String(row.source?.version) === String(source.version),
          );
          rows.push({
            rowNumber: rows.length + 1,
            sourceSheet: source.system,
            sourceRow: rows.length + 1,
            sourceId: source.id,
            sourceFingerprint: digest({ source, operation }),
            status: 'review',
            issues: [
              ...issues,
              ...(known
                ? [
                    'Источник уже присутствует в журнале: свяжите с существующей операцией',
                  ]
                : []),
            ],
            existingOperationId: known?.id || null,
            operation: {
              ...operation,
              ...Object.fromEntries(tupleKeys.map((key) => [key, scope[key]])),
              source,
            },
            sourceLinks: links,
          });
        };
        const pricing = (
          await client.query(
            `SELECT DISTINCT ON (t.id) t.id AS trip_id,t.reference,t.business_date::text AS date,t.responsibility_scope_id,pc.id AS calculation_id,pc.revision,pc.snapshot
        FROM trips t JOIN pricing_calculations pc ON pc.trip_id=t.id JOIN workflow_current_facts f ON f.trip_id=t.id AND f.id=pc.facts_id AND f.status='approved'
        WHERE ${scopeSQL('t')} AND t.business_date BETWEEN $2::date AND $3::date AND t.reference !~* '^(demo|test|synthetic|демо|тест)'
        AND EXISTS(SELECT 1 FROM workflow_attendance a WHERE a.trip_id=t.id AND a.kind='check_out') ORDER BY t.id,pc.revision DESC`,
            [grantJSON, from, to],
          )
        ).rows;
        for (const row of pricing) {
          const scope = selected.find(
            (scope) =>
              scope.responsibilityScopeId === row.responsibility_scope_id,
          );
          for (const [side, kind, result] of [
            ['client', 'sale', row.snapshot.client],
            ['executor', 'expense', row.snapshot.executor],
          ]) {
            if (
              !Number.isSafeInteger(result?.totalKopecks) ||
              result.totalKopecks <= 0
            )
              continue;
            add(
              scope,
              {
                system: 'operations_pricing',
                id: `${row.trip_id}:${side}`,
                version: String(row.revision),
              },
              {
                kind,
                date: row.date,
                amountKopecks: result.totalKopecks,
                vatKopecks: 0,
                status: 'provisional',
                counterpartyId: partyFor('project_' + side, scope.projectId),
                description: `Перевозка ${row.reference}: ${side === 'client' ? 'клиент' : 'исполнитель'}`,
                article:
                  side === 'client'
                    ? 'Выручка от перевозок'
                    : 'Услуги перевозчика',
              },
              [
                'Расчет тарифа содержит сумму без НДС: проверьте сумму документа и налог',
                'Сопоставьте с актом 1С, если он уже учтен',
              ],
              { tripId: row.trip_id, calculationId: row.calculation_id },
            );
          }
        }
        const payroll = (
          await client.query(
            `SELECT DISTINCT ON (p.driver_id,p.responsibility_scope_id,p.period_start,p.period_end) p.*,p.period_start::text AS start_date,p.period_end::text AS end_date FROM driver_payroll_statements p WHERE ${scopeSQL('p')} AND p.source_kind='manual_verified' AND p.status='approved' AND p.period_end BETWEEN $2::date AND $3::date ORDER BY p.driver_id,p.responsibility_scope_id,p.period_start,p.period_end,p.revision DESC`,
            [grantJSON, from, to],
          )
        ).rows;
        for (const row of payroll) {
          const scope = selected.find(
              (scope) =>
                scope.responsibilityScopeId === row.responsibility_scope_id,
            ),
            amountKopecks = row.earnings.reduce(
              (sum, item) => sum + Number(item.amountKopecks),
              0,
            );
          if (!Number.isSafeInteger(amountKopecks) || amountKopecks <= 0)
            continue;
          add(
            scope,
            {
              system: 'operations_payroll',
              id: `${row.driver_id}:${row.start_date}:${row.end_date}`,
              version: String(row.revision),
            },
            {
              kind: 'expense',
              date: row.end_date,
              amountKopecks,
              vatKopecks: 0,
              counterpartyId: partyFor('employee', row.driver_id),
              description: 'Подтвержденное начисление зарплаты',
              article: 'Зарплата',
            },
            [
              'Сопоставьте с зарплатными обязательствами 1С; выплаты и удержания не импортируются второй раз',
            ],
            { payrollStatementId: row.id },
          );
        }
        const fleet = (
          await client.query(
            `SELECT f.*,m.receipt_date,m.receipt_amount FROM fleet_ops_records f LEFT JOIN LATERAL (SELECT max(created_at)::date::text AS receipt_date,sum(amount_cents)::text AS receipt_amount FROM fleet_stock_movements m WHERE m.document_id=f.id AND m.kind='receipt' AND m.responsibility_scope_id=f.responsibility_scope_id) m ON true WHERE ${scopeSQL('f')} AND f.kind IN ('orders','purchases','fuel') ORDER BY f.created_at,f.id`,
            [grantJSON],
          )
        ).rows;
        for (const row of fleet) {
          const p = row.payload,
            scope = selected.find(
              (scope) =>
                scope.responsibilityScopeId === row.responsibility_scope_id,
            );
          const eventDate =
            p.completedOn ||
            p.receivedOn ||
            (row.kind === 'purchases' ? row.receipt_date : p.date);
          if (!eventDate || eventDate < from || eventDate > to) continue;
          if (row.kind === 'orders' && p.status === 'completed') {
            for (const [stock, group] of [
              [
                true,
                (p.lines || []).filter(
                  (line) => line.stockSource === 'warehouse',
                ),
              ],
              [
                false,
                (p.lines || []).filter(
                  (line) => line.stockSource !== 'warehouse',
                ),
              ],
            ]) {
              const amountKopecks = group.reduce(
                (sum, line) => sum + Number(line.amountCents || 0),
                0,
              );
              if (!Number.isSafeInteger(amountKopecks) || amountKopecks <= 0)
                continue;
              add(
                scope,
                {
                  system: 'operations_fleet',
                  id: `${row.id}:${stock ? 'stock' : 'external'}`,
                  version: String(row.version),
                },
                {
                  kind: stock ? 'inventory_consumption' : 'expense',
                  date: eventDate,
                  amountKopecks,
                  counterpartyId: partyFor('fleet_contractor', p.contractorId),
                  description: `Заказ-наряд ${p.number}`,
                  article: stock
                    ? 'Запчасти в ремонте'
                    : 'Ремонт и обслуживание',
                },
                [
                  stock
                    ? 'Проверьте связь с оприходованием запчастей в финансовом учете'
                    : 'Уточните НДС и не дублируйте поступление услуг 1С',
                ],
                { fleetRecordId: row.id },
              );
            }
          } else if (
            row.kind === 'purchases' &&
            p.status === 'received' &&
            Number.isSafeInteger(Number(row.receipt_amount)) &&
            Number(row.receipt_amount) > 0
          ) {
            add(
              scope,
              {
                system: 'operations_fleet',
                id: row.id,
                version: String(row.version),
              },
              {
                kind: 'inventory_purchase',
                date: eventDate,
                amountKopecks: Number(row.receipt_amount),
                status: 'provisional',
                counterpartyId: partyFor('fleet_contractor', p.supplierId),
                description: `Приемка закупки ${p.number}`,
                article: 'Поступление запчастей',
              },
              [
                'Проверьте дату первичного документа и НДС: дата приемки взята из складского движения',
                'Сопоставьте с поступлением 1С, если оно уже учтено',
              ],
              { fleetRecordId: row.id },
            );
          } else if (
            row.kind === 'fuel' &&
            Number.isSafeInteger(p.amountCents) &&
            p.amountCents > 0
          ) {
            add(
              scope,
              {
                system: 'operations_fleet',
                id: row.id,
                version: String(row.version),
              },
              {
                kind: 'fuel_own_consumption',
                date: eventDate,
                amountKopecks: p.amountCents,
                litres: p.litres,
                description: 'Заправка собственного транспорта',
                article: 'Топливо собственного парка',
              },
              [
                'Укажите поставщика и сопоставьте с проливом RN/LC или документом 1С; не учитывайте заправку повторно',
              ],
              { fleetRecordId: row.id },
            );
          }
        }
        const parsed = {
          schemaVersion: 'finance.import.v1',
          sourceType: 'native',
          fileName: 'Данные приложения',
          sha256: digest(rows),
          rows,
          summary: {
            rowCount: rows.length,
            totalKopecks: rows.reduce(
              (sum, row) => sum + (row.operation.amountKopecks || 0),
              0,
            ),
          },
          controls: [],
          committedRows: [],
        };
        for (const recurring of require('../domain/finance-automation').recurringPreviewRows(
          state,
          from,
          to,
        )) {
          const rowNumber = rows.length + 1;
          rows.push({
            ...recurring,
            rowNumber,
            sourceRow: rowNumber,
            sourceFingerprint: digest(recurring.operation),
          });
        }
        parsed.sha256 = digest(rows);
        parsed.summary.rowCount = rows.length;
        parsed.summary.totalKopecks = rows.reduce(
          (sum, row) => sum + (row.operation.amountKopecks || 0),
          0,
        );
        if (!persist)
          return {
            sourceType: 'native',
            summary: parsed.summary,
            rows: rows.slice(0, 200),
            totalRows: rows.length,
            needsPreview: true,
          };
        const id = randomUUID();
        await client.query(
          `INSERT INTO finance_ledger_catalogs(id,kind,legal_entity_id,responsibility_scope_ids,data,created_by,updated_by) VALUES($1,'import_previews',$2,$3,$4::jsonb,$5,$5)`,
          [
            id,
            entityId,
            selected.map((scope) => scope.responsibilityScopeId),
            JSON.stringify(parsed),
            actor.id,
          ],
        );
        await this.auditEvent(
          client,
          actor,
          selected[0],
          'native.previewed',
          id,
          { rowCount: rows.length, sha256: parsed.sha256 },
        );
        return this.previewResponse(
          (
            await client.query(
              'SELECT * FROM finance_ledger_catalogs WHERE id=$1',
              [id],
            )
          ).rows[0],
        );
      },
    );
  }
  async reconcile(supplied, body) {
    object(body);
    return this.transaction(supplied, true, async (client, actor, scopes) => {
      const replay = await this.replay(
        client,
        actor,
        scopes,
        body.idempotencyKey,
        body,
        'reconciliation.save',
      );
      if (replay) return replay;
      const state = await this.state(client, scopes),
        entityId = this.resolveEntity(body, scopes);
      let normalized;
      try {
        normalized =
          require('../domain/finance-reconciliation').validateReconciliation(
            {
              ...body,
              legalEntityId: entityId,
              disputedDocumentIds:
                body.disputedDocumentIds || body.disputedIds || [],
            },
            state,
          );
      } catch (error) {
        if (error.code?.startsWith('FINANCE_'))
          invalid(error.message, error.code);
        throw error;
      }
      const documentScopes = [
        ...new Set(
          normalized.documents.map((row) => row.responsibilityScopeId),
        ),
      ];
      const selected = scopes.filter(
        (scope) =>
          scope.legalEntityId === entityId &&
          documentScopes.includes(scope.responsibilityScopeId),
      );
      if (selected.length !== documentScopes.length) forbidden();
      for (const scope of selected)
        this.references(
          { counterpartyId: normalized.counterpartyId },
          scope,
          state,
        );
      const id = body.id ? uuid(body.id) : randomUUID();
      const previous = (
        await client.query(
          'SELECT * FROM finance_ledger_catalogs WHERE id=$1 FOR UPDATE',
          [id],
        )
      ).rows[0];
      if (
        previous &&
        (previous.kind !== 'reconciliations' ||
          previous.legal_entity_id !== entityId ||
          previous.responsibility_scope_ids.some(
            (id) => !scopes.some((scope) => scope.responsibilityScopeId === id),
          ))
      )
        missing();
      if ((previous?.version || 0) !== boundedInteger(body.version, 0))
        conflict(
          'Сверка уже изменена. Обновите данные.',
          'FINANCE_VERSION_CONFLICT',
        );
      const version = (previous?.version || 0) + 1;
      const history = [
        ...(previous?.data.history || []),
        ...(previous
          ? [
              {
                ...previous.data,
                history: undefined,
                savedAt: previous.updated_at,
              },
            ]
          : []),
      ];
      const data = {
        ...normalized,
        id,
        version,
        history,
        confirmedAt: ['confirmed', 'partially_confirmed'].includes(
          normalized.status,
        )
          ? new Date().toISOString()
          : null,
      };
      if (previous)
        await client.query(
          'UPDATE finance_ledger_catalogs SET data=$2::jsonb,version=$3,responsibility_scope_ids=$4,updated_by=$5,updated_at=clock_timestamp() WHERE id=$1',
          [id, JSON.stringify(data), version, documentScopes, actor.id],
        );
      else
        await client.query(
          `INSERT INTO finance_ledger_catalogs(id,kind,legal_entity_id,responsibility_scope_ids,data,created_by,updated_by) VALUES($1,'reconciliations',$2,$3,$4::jsonb,$5,$5)`,
          [id, entityId, documentScopes, JSON.stringify(data), actor.id],
        );
      await this.auditEvent(
        client,
        actor,
        selected[0],
        'reconciliation.saved',
        id,
        {
          version,
          status: normalized.status,
          count: normalized.documents.length,
          sourceReference: normalized.sourceReference,
        },
      );
      return this.remember(
        client,
        actor,
        body.idempotencyKey,
        body,
        'reconciliation.save',
        { ...data, stale: false, responsibilityScopeIds: documentScopes },
        selected,
      );
    });
  }
}
Injectable()(FinanceLedgerService);
Inject(DatabaseService)(FinanceLedgerService, undefined, 0);
Inject(IdentityRepository)(FinanceLedgerService, undefined, 1);
Inject(AuditService)(FinanceLedgerService, undefined, 2);
Inject(NeuralService)(FinanceLedgerService, undefined, 3);
module.exports = { FinanceLedgerService, digest, aliases };
