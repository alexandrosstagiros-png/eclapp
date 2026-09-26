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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FinanceController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const auth_guard_1 = require("../../identity-access/interface/auth.guard");
const current_actor_decorator_1 = require("../../identity-access/interface/current-actor.decorator");
const trip_pagination_1 = require("../../operations/application/trip-pagination");
const finance_service_1 = require("../application/finance.service");
const finance_dto_1 = require("./finance.dto");
let FinanceController = class FinanceController {
    finance;
    constructor(finance) {
        this.finance = finance;
    }
    tariffs(actor) { return this.finance.tariffs(actor); }
    createTariff(actor, body) { return this.finance.createTariff(actor, body); }
    preview(actor, body) { return this.finance.preview(actor, body); }
    createRegistry(actor, body) { return this.finance.createRegistry(actor, body); }
    registries(actor) { return this.finance.registries(actor); }
    registry(actor, id) { return this.finance.registryDetail(actor, (0, trip_pagination_1.parseTripId)(id)); }
    registrySource(actor, id) { return this.finance.registrySource(actor, (0, trip_pagination_1.parseTripId)(id)); }
    reconcile(actor, id) { return this.finance.reconcile(actor, (0, trip_pagination_1.parseTripId)(id)); }
    confirm(actor, id, body) { return this.finance.confirm(actor, (0, trip_pagination_1.parseTripId)(id), body.idempotencyKey); }
    jobs(actor) { return this.finance.jobs(actor); }
    exportJob(actor, id) { return this.finance.exportJob(actor, (0, trip_pagination_1.parseTripId)(id)); }
    acknowledge(actor, id, body) { return this.finance.acknowledge(actor, (0, trip_pagination_1.parseTripId)(id), body); }
};
exports.FinanceController = FinanceController;
__decorate([
    (0, common_1.Get)("tariffs"),
    (0, swagger_1.ApiOperation)({ summary: "Демо-тарифы в финансовой области доступа" }),
    __param(0, (0, current_actor_decorator_1.CurrentActor)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], FinanceController.prototype, "tariffs", null);
__decorate([
    (0, common_1.Post)("tariffs"),
    (0, swagger_1.ApiOperation)({ summary: "Создать неизменяемую версию демо-тарифа с непересекающимся периодом" }),
    __param(0, (0, current_actor_decorator_1.CurrentActor)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, finance_dto_1.TariffCreateDto]),
    __metadata("design:returntype", void 0)
], FinanceController.prototype, "createTariff", null);
__decorate([
    (0, common_1.Post)("registries/preview"),
    (0, swagger_1.ApiOperation)({ summary: "Проверить CSV реестра без создания реестра" }),
    __param(0, (0, current_actor_decorator_1.CurrentActor)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, finance_dto_1.RegistryPreviewDto]),
    __metadata("design:returntype", void 0)
], FinanceController.prototype, "preview", null);
__decorate([
    (0, common_1.Post)("registries"),
    (0, swagger_1.ApiOperation)({ summary: "Импортировать CSV как черновик реестра" }),
    __param(0, (0, current_actor_decorator_1.CurrentActor)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, finance_dto_1.RegistryCreateDto]),
    __metadata("design:returntype", void 0)
], FinanceController.prototype, "createRegistry", null);
__decorate([
    (0, common_1.Get)("registries"),
    (0, swagger_1.ApiOperation)({ summary: "Последние 100 реестров в области доступа" }),
    __param(0, (0, current_actor_decorator_1.CurrentActor)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], FinanceController.prototype, "registries", null);
__decorate([
    (0, common_1.Get)("registries/:id"),
    (0, swagger_1.ApiOperation)({ summary: "Реестр с объяснимыми расхождениями последней сверки" }),
    __param(0, (0, current_actor_decorator_1.CurrentActor)()),
    __param(1, (0, common_1.Param)("id")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], FinanceController.prototype, "registry", null);
__decorate([
    (0, common_1.Get)("registries/:id/source"),
    (0, swagger_1.ApiOperation)({ summary: "Исходный неизменяемый CSV с SHA-256; экспорт фиксируется в аудите" }),
    __param(0, (0, current_actor_decorator_1.CurrentActor)()),
    __param(1, (0, common_1.Param)("id")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], FinanceController.prototype, "registrySource", null);
__decorate([
    (0, common_1.Post)("registries/:id/reconcile"),
    (0, swagger_1.ApiOperation)({ summary: "Повторить детерминированную сверку черновика по актуальным одобренным фактам" }),
    __param(0, (0, current_actor_decorator_1.CurrentActor)()),
    __param(1, (0, common_1.Param)("id")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], FinanceController.prototype, "reconcile", null);
__decorate([
    (0, common_1.Post)("registries/:id/confirm"),
    (0, swagger_1.ApiOperation)({ summary: "Подтвердить реестр и атомарно поставить обмен с 1С в очередь" }),
    __param(0, (0, current_actor_decorator_1.CurrentActor)()),
    __param(1, (0, common_1.Param)("id")),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, finance_dto_1.FinanceKeyDto]),
    __metadata("design:returntype", void 0)
], FinanceController.prototype, "confirm", null);
__decorate([
    (0, common_1.Get)("integration-jobs"),
    (0, swagger_1.ApiOperation)({ summary: "Очередь обмена с 1С; pending не означает отправку" }),
    __param(0, (0, current_actor_decorator_1.CurrentActor)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], FinanceController.prototype, "jobs", null);
__decorate([
    (0, common_1.Get)("integration-jobs/:id/export"),
    (0, swagger_1.ApiOperation)({ summary: "Выгрузить версионированный JSON; экспорт фиксируется в аудите" }),
    __param(0, (0, current_actor_decorator_1.CurrentActor)()),
    __param(1, (0, common_1.Param)("id")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], FinanceController.prototype, "exportJob", null);
__decorate([
    (0, common_1.Post)("integration-jobs/:id/acknowledge"),
    (0, swagger_1.ApiOperation)({ summary: "Вручную зафиксировать реальный идентификатор документа 1С" }),
    __param(0, (0, current_actor_decorator_1.CurrentActor)()),
    __param(1, (0, common_1.Param)("id")),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, finance_dto_1.OneCAcknowledgeDto]),
    __metadata("design:returntype", void 0)
], FinanceController.prototype, "acknowledge", null);
exports.FinanceController = FinanceController = __decorate([
    (0, swagger_1.ApiTags)("finance"),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    (0, common_1.Controller)("finance"),
    __metadata("design:paramtypes", [finance_service_1.FinanceService])
], FinanceController);
//# sourceMappingURL=finance.controller.js.map