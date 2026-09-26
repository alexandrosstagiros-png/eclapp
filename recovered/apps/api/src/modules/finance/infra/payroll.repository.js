"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PayrollRepository = void 0;
const common_1 = require("@nestjs/common");
const payroll_rules_1 = require("../domain/payroll-rules");
const columns = `s.id,s.revision,s.period_start::text,s.period_end::text,
  s.project_id,p.name AS project_name,s.legal_entity_id,le.name AS legal_entity_name,
  s.responsibility_scope_id,rs.name AS responsibility_scope_name,s.status,s.source_kind,
  s.calculated_at,s.approved_at,s.opening_balance_kopecks,s.opening_balance_explanation,
  s.earnings,s.deductions,s.payments`;
const relations = `FROM driver_payroll_statements s JOIN projects p ON p.id=s.project_id
  JOIN legal_entities le ON le.id=s.legal_entity_id
  JOIN responsibility_scopes rs ON rs.id=s.responsibility_scope_id`;
const predicate = `s.driver_id=$1::uuid AND EXISTS (
  SELECT 1 FROM jsonb_to_recordset($2::jsonb) AS g("legalEntityId" uuid,"regionId" uuid,"projectId" uuid,"responsibilityScopeId" uuid)
  WHERE s.legal_entity_id=g."legalEntityId" AND s.region_id=g."regionId"
    AND s.project_id=g."projectId" AND s.responsibility_scope_id=g."responsibilityScopeId")`;
function project(row) {
    // Explicit projection: no driver/user IDs, private approval identities or internal fields.
    return {
        id: row.id, revision: row.revision, periodStart: row.period_start, periodEnd: row.period_end,
        project: { id: row.project_id, name: row.project_name },
        legalEntity: { id: row.legal_entity_id, name: row.legal_entity_name },
        responsibilityScope: { id: row.responsibility_scope_id, name: row.responsibility_scope_name },
        status: row.status, sourceKind: row.source_kind, calculatedAt: row.calculated_at.toISOString(),
        approvedAt: row.approved_at?.toISOString() ?? null, currency: "RUB",
        ...(0, payroll_rules_1.payrollTotals)(Number(row.opening_balance_kopecks), row.earnings, row.deductions, row.payments),
        openingBalanceExplanation: row.opening_balance_explanation,
        earnings: row.earnings, deductions: row.deductions, payments: row.payments,
    };
}
let PayrollRepository = class PayrollRepository {
    async list(client, driverId, grants) {
        const result = await client.query(`SELECT ${columns} ${relations}
      WHERE ${predicate} AND NOT EXISTS (SELECT 1 FROM driver_payroll_statements newer
        WHERE newer.driver_id=s.driver_id AND newer.project_id=s.project_id
          AND newer.responsibility_scope_id=s.responsibility_scope_id
          AND newer.period_start=s.period_start AND newer.period_end=s.period_end AND newer.revision>s.revision)
      ORDER BY s.period_end DESC,s.period_start DESC,s.calculated_at DESC,s.id DESC LIMIT 24`, [driverId, JSON.stringify(grants)]);
        const settlements = await client.query(`SELECT snapshot FROM driver_payroll_settlements s JOIN payroll_deposit_accounts a ON a.id=s.account_id
      WHERE a.driver_id=$1::uuid AND EXISTS (SELECT 1 FROM jsonb_to_recordset($2::jsonb) AS g("legalEntityId" uuid,"regionId" uuid,"projectId" uuid,"responsibilityScopeId" uuid)
        WHERE a.legal_entity_id=g."legalEntityId" AND a.region_id=g."regionId" AND a.project_id=g."projectId" AND a.responsibility_scope_id=g."responsibilityScopeId")
      ORDER BY s.period_end DESC,s.period_start DESC,s.created_at DESC,s.id DESC LIMIT 24`, [driverId, JSON.stringify(grants)]);
        const modern = settlements.rows.map(row => row.snapshot);
        const key = (row) => `${row.project.id}:${row.responsibilityScope.id}:${row.periodStart}:${row.periodEnd}`;
        const confirmed = new Set(modern.map(key));
        return [...modern, ...result.rows.map(project).filter(row => !confirmed.has(key(row)))].sort((a, b) => b.periodEnd.localeCompare(a.periodEnd) || b.periodStart.localeCompare(a.periodStart) || b.calculatedAt.localeCompare(a.calculatedAt) || b.id.localeCompare(a.id)).slice(0, 24);
    }
    async detail(client, driverId, grants, id) {
        const result = await client.query(`SELECT ${columns} ${relations} WHERE ${predicate} AND s.id=$3::uuid`, [driverId, JSON.stringify(grants), id]);
        if (result.rows[0])
            return project(result.rows[0]);
        const settlement = await client.query(`SELECT s.snapshot FROM driver_payroll_settlements s JOIN payroll_deposit_accounts a ON a.id=s.account_id
      WHERE a.driver_id=$1::uuid AND s.id=$3::uuid AND EXISTS (SELECT 1 FROM jsonb_to_recordset($2::jsonb) AS g("legalEntityId" uuid,"regionId" uuid,"projectId" uuid,"responsibilityScopeId" uuid)
        WHERE a.legal_entity_id=g."legalEntityId" AND a.region_id=g."regionId" AND a.project_id=g."projectId" AND a.responsibility_scope_id=g."responsibilityScopeId")`, [driverId, JSON.stringify(grants), id]);
        return settlement.rows[0]?.snapshot ?? null;
    }
};
exports.PayrollRepository = PayrollRepository;
exports.PayrollRepository = PayrollRepository = __decorate([
    (0, common_1.Injectable)()
], PayrollRepository);
//# sourceMappingURL=payroll.repository.js.map