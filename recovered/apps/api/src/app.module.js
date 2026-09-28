"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const swagger_1 = require("@nestjs/swagger");
const throttler_1 = require("@nestjs/throttler");
const platform_module_1 = require("./platform/platform.module");
const database_service_1 = require("./platform/database.service");
const identity_access_module_1 = require("./modules/identity-access/identity-access.module");
const operations_module_1 = require("./modules/operations/operations.module");
const workflow_module_1 = require("./modules/workflow/workflow.module");
const finance_module_1 = require("./modules/finance/finance.module");
const inspections_module_1 = require("./modules/inspections/inspections.module");
const communications_module_1 = require("./modules/communications/communications.module");
const { PhoneAutofillModule } = require("./modules/phone-autofill/phone-autofill.module");
const { NotificationsModule } = require("./modules/notifications/notifications.module");
const { NotificationSourcesModule } = require("./modules/notification-sources/notification-sources.module");
const { PlanningModule } = require("./modules/planning/planning.module");
const { RecruitmentModule } = require("./modules/recruitment/recruitment.module");
const { TendersModule } = require("./modules/tenders/tenders.module");
const { DevelopmentModule } = require("./modules/development/development.module");
const { TeamModule } = require("./modules/team/team.module");
const { FleetMaintenanceModule } = require("./modules/fleet-maintenance/fleet-maintenance.module");
const { FleetOperationsModule } = require("./modules/fleet-maintenance/fleet-operations.module");
const { MaxDownloadsModule } = require("./modules/max-downloads/max-downloads.module");
const { NeuralModule } = require("./modules/neural/neural.module");
let HealthController = class HealthController {
    database;
    constructor(database) {
        this.database = database;
    }
    live() {
        return { status: "ok" };
    }
    async ready() {
        try {
            await this.database.pool.query("SELECT id FROM trips UNION ALL SELECT id FROM workflow_documents UNION ALL SELECT id FROM integration_jobs UNION ALL SELECT id FROM communications_tickets UNION ALL SELECT id FROM telegram_deliveries UNION ALL SELECT id FROM planning_plans UNION ALL SELECT id FROM planning_templates UNION ALL SELECT template_id FROM planning_template_versions UNION ALL SELECT template_id FROM planning_template_defaults UNION ALL SELECT id FROM recruitment_candidates UNION ALL SELECT id FROM recruitment_requests UNION ALL SELECT id FROM recruitment_applications UNION ALL SELECT id FROM recruitment_tasks UNION ALL SELECT id FROM recruitment_events UNION ALL SELECT id FROM tender_customers UNION ALL SELECT id FROM tender_items UNION ALL SELECT id FROM tender_events UNION ALL SELECT id FROM development_tickets UNION ALL SELECT id FROM development_events UNION ALL SELECT id FROM team_conversations UNION ALL SELECT id FROM team_messages UNION ALL SELECT id FROM team_articles UNION ALL SELECT id FROM team_summaries UNION ALL SELECT id FROM team_summary_schedules LIMIT 1");
            return { status: "ok" };
        }
        catch {
            throw new common_1.ServiceUnavailableException();
        }
    }
};
__decorate([
    (0, common_1.Get)("live"),
    (0, swagger_1.ApiOperation)({ summary: "Process liveness; no infrastructure details" }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], HealthController.prototype, "live", null);
__decorate([
    (0, common_1.Get)("ready"),
    (0, swagger_1.ApiOperation)({ summary: "Database and schema readiness" }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], HealthController.prototype, "ready", null);
HealthController = __decorate([
    (0, swagger_1.ApiTags)("Health"),
    (0, common_1.Controller)("health"),
    __metadata("design:paramtypes", [database_service_1.DatabaseService])
], HealthController);
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            platform_module_1.PlatformModule,
            throttler_1.ThrottlerModule.forRoot([
                { ttl: 60000, limit: process.env.NODE_ENV === "test" ? 1000 : 60 },
            ]),
            identity_access_module_1.IdentityAccessModule,
            operations_module_1.OperationsModule,
            workflow_module_1.WorkflowModule,
            finance_module_1.FinanceModule,
            inspections_module_1.InspectionsModule,
            communications_module_1.CommunicationsModule,
            MaxDownloadsModule,
            PhoneAutofillModule,
            PlanningModule,
            RecruitmentModule,
            TendersModule,
            DevelopmentModule,
            TeamModule,
            NeuralModule,
            FleetMaintenanceModule,
            FleetOperationsModule,
            NotificationsModule,
            NotificationSourcesModule,
        ],
        controllers: [HealthController],
        providers: [{ provide: core_1.APP_GUARD, useClass: throttler_1.ThrottlerGuard }],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map
