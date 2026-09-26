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
exports.PricingController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const auth_guard_1 = require("../../identity-access/interface/auth.guard");
const current_actor_decorator_1 = require("../../identity-access/interface/current-actor.decorator");
const trip_pagination_1 = require("../../operations/application/trip-pagination");
const pricing_service_1 = require("../application/pricing.service");
let PricingController = class PricingController {
    pricing;
    constructor(pricing) {
        this.pricing = pricing;
    }
    tariffs(actor) { return this.pricing.tariffs(actor); }
    createTariff(actor, body) { return this.pricing.createTariff(actor, body); }
    publish(actor, id, body) { return this.pricing.publish(actor, (0, trip_pagination_1.parseTripId)(id), body); }
    preview(actor, body) { return this.pricing.preview(actor, body); }
    trip(actor, id) { return this.pricing.tripState(actor, (0, trip_pagination_1.parseTripId)(id)); }
    previewTrip(actor, id, body) { return this.pricing.previewTrip(actor, (0, trip_pagination_1.parseTripId)(id), body); }
    calculateTrip(actor, id, body) { return this.pricing.calculateTrip(actor, (0, trip_pagination_1.parseTripId)(id), body); }
    confirm(actor, id, body) { return this.pricing.confirm(actor, (0, trip_pagination_1.parseTripId)(id), body); }
    calculation(actor, id) { return this.pricing.calculationDetail(actor, (0, trip_pagination_1.parseTripId)(id)); }
};
exports.PricingController = PricingController;
__decorate([
    (0, common_1.Get)("tariffs"),
    (0, swagger_1.ApiOperation)({ summary: "Версии коммерческих тарифов в финансовой области доступа" }),
    __param(0, (0, current_actor_decorator_1.CurrentActor)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], PricingController.prototype, "tariffs", null);
__decorate([
    (0, common_1.Post)("tariffs"),
    (0, swagger_1.ApiOperation)({ summary: "Сохранить неизменяемый черновик тарифа" }),
    __param(0, (0, current_actor_decorator_1.CurrentActor)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], PricingController.prototype, "createTariff", null);
__decorate([
    (0, common_1.Post)("tariffs/:id/publish"),
    (0, swagger_1.ApiOperation)({ summary: "Утвердить версию тарифа; требуется специалист с финансовыми правами" }),
    __param(0, (0, current_actor_decorator_1.CurrentActor)()),
    __param(1, (0, common_1.Param)("id")),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], PricingController.prototype, "publish", null);
__decorate([
    (0, common_1.Post)("preview"),
    (0, swagger_1.ApiOperation)({ summary: "Проверочный расчёт правил по введённым показателям без сохранения" }),
    __param(0, (0, current_actor_decorator_1.CurrentActor)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], PricingController.prototype, "preview", null);
__decorate([
    (0, common_1.Get)("trips/:id"),
    (0, swagger_1.ApiOperation)({ summary: "Начисления клиенту и исполнителю, остаток и история рейса" }),
    __param(0, (0, current_actor_decorator_1.CurrentActor)()),
    __param(1, (0, common_1.Param)("id")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], PricingController.prototype, "trip", null);
__decorate([
    (0, common_1.Post)("trips/:id/preview"),
    (0, swagger_1.ApiOperation)({ summary: "Предварительно рассчитать рейс по серверным фактам без сохранения" }),
    __param(0, (0, current_actor_decorator_1.CurrentActor)()),
    __param(1, (0, common_1.Param)("id")),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], PricingController.prototype, "previewTrip", null);
__decorate([
    (0, common_1.Post)("trips/:id/calculations"),
    (0, swagger_1.ApiOperation)({ summary: "Сохранить объяснимый расчёт рейса и снимки исходных данных" }),
    __param(0, (0, current_actor_decorator_1.CurrentActor)()),
    __param(1, (0, common_1.Param)("id")),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], PricingController.prototype, "calculateTrip", null);
__decorate([
    (0, common_1.Post)("calculations/:id/confirm"),
    (0, swagger_1.ApiOperation)({ summary: "Независимо подтвердить начисление клиенту или расходы" }),
    __param(0, (0, current_actor_decorator_1.CurrentActor)()),
    __param(1, (0, common_1.Param)("id")),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], PricingController.prototype, "confirm", null);
__decorate([
    (0, common_1.Get)("calculations/:id"),
    (0, swagger_1.ApiOperation)({ summary: "Неизменяемая детализация выбранной версии расчёта в финансовой области доступа" }),
    __param(0, (0, current_actor_decorator_1.CurrentActor)()),
    __param(1, (0, common_1.Param)("id")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], PricingController.prototype, "calculation", null);
exports.PricingController = PricingController = __decorate([
    (0, swagger_1.ApiTags)("pricing"),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    (0, common_1.Controller)("finance/pricing"),
    __metadata("design:paramtypes", [pricing_service_1.PricingService])
], PricingController);
//# sourceMappingURL=pricing.controller.js.map