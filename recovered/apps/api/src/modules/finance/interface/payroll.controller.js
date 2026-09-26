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
exports.PayrollController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const auth_guard_1 = require("../../identity-access/interface/auth.guard");
const current_actor_decorator_1 = require("../../identity-access/interface/current-actor.decorator");
const payroll_service_1 = require("../application/payroll.service");
let PayrollController = class PayrollController {
    payroll;
    constructor(payroll) {
        this.payroll = payroll;
    }
    list(actor) { return this.payroll.list(actor); }
    detail(actor, id) { return this.payroll.detail(actor, id); }
};
exports.PayrollController = PayrollController;
__decorate([
    (0, common_1.Get)(),
    (0, common_1.Header)("Cache-Control", "private, no-store"),
    (0, common_1.Header)("Pragma", "no-cache"),
    (0, swagger_1.ApiOperation)({ summary: "Последние 24 собственных расчёта зарплаты, актуальные версии по периоду и области" }),
    __param(0, (0, current_actor_decorator_1.CurrentActor)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], PayrollController.prototype, "list", null);
__decorate([
    (0, common_1.Get)(":id"),
    (0, common_1.Header)("Cache-Control", "private, no-store"),
    (0, common_1.Header)("Pragma", "no-cache"),
    (0, swagger_1.ApiOperation)({ summary: "Собственный расчёт зарплаты: начисления, удержания, выплаты и остаток" }),
    __param(0, (0, current_actor_decorator_1.CurrentActor)()),
    __param(1, (0, common_1.Param)("id", new common_1.ParseUUIDPipe())),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], PayrollController.prototype, "detail", null);
exports.PayrollController = PayrollController = __decorate([
    (0, swagger_1.ApiTags)("driver-payroll"),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    (0, common_1.Controller)("me/payroll"),
    __metadata("design:paramtypes", [payroll_service_1.PayrollService])
], PayrollController);
//# sourceMappingURL=payroll.controller.js.map