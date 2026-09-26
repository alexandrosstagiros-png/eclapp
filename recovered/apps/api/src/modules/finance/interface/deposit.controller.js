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
exports.DriverDepositController = exports.DepositController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const auth_guard_1 = require("../../identity-access/interface/auth.guard");
const current_actor_decorator_1 = require("../../identity-access/interface/current-actor.decorator");
const deposit_service_1 = require("../application/deposit.service");
let DepositController = class DepositController {
    deposits;
    constructor(deposits) {
        this.deposits = deposits;
    }
    catalog(actor) { return this.deposits.catalog(actor); }
    list(actor) { return this.deposits.list(actor); }
    create(actor, body) { return this.deposits.create(actor, body); }
    detail(actor, id) { return this.deposits.detail(actor, id); }
    statements(actor, id) { return this.deposits.statements(actor, id); }
    policy(actor, id, body) { return this.deposits.policy(actor, id, body); }
    preview(actor, body) { return this.deposits.preview(actor, body); }
    confirm(actor, body) { return this.deposits.confirm(actor, body); }
    statement(actor, id) { return this.deposits.statement(actor, id); }
    reconcile(actor, id, body) { return this.deposits.reconcile(actor, id, body); }
    returnPayment(actor, id, body) { return this.deposits.returnPayment(actor, id, body); }
};
exports.DepositController = DepositController;
__decorate([
    (0, common_1.Get)("catalog"),
    (0, common_1.Header)("Cache-Control", "private, no-store"),
    (0, common_1.Header)("Pragma", "no-cache"),
    __param(0, (0, current_actor_decorator_1.CurrentActor)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], DepositController.prototype, "catalog", null);
__decorate([
    (0, common_1.Get)("accounts"),
    (0, common_1.Header)("Cache-Control", "private, no-store"),
    (0, common_1.Header)("Pragma", "no-cache"),
    __param(0, (0, current_actor_decorator_1.CurrentActor)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], DepositController.prototype, "list", null);
__decorate([
    (0, common_1.Post)("accounts"),
    (0, common_1.Header)("Cache-Control", "private, no-store"),
    __param(0, (0, current_actor_decorator_1.CurrentActor)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], DepositController.prototype, "create", null);
__decorate([
    (0, common_1.Get)("accounts/:id"),
    (0, common_1.Header)("Cache-Control", "private, no-store"),
    (0, common_1.Header)("Pragma", "no-cache"),
    __param(0, (0, current_actor_decorator_1.CurrentActor)()),
    __param(1, (0, common_1.Param)("id", new common_1.ParseUUIDPipe())),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], DepositController.prototype, "detail", null);
__decorate([
    (0, common_1.Get)("accounts/:id/statements"),
    (0, common_1.Header)("Cache-Control", "private, no-store"),
    (0, common_1.Header)("Pragma", "no-cache"),
    __param(0, (0, current_actor_decorator_1.CurrentActor)()),
    __param(1, (0, common_1.Param)("id", new common_1.ParseUUIDPipe())),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], DepositController.prototype, "statements", null);
__decorate([
    (0, common_1.Post)("accounts/:id/policy"),
    (0, common_1.Header)("Cache-Control", "private, no-store"),
    __param(0, (0, current_actor_decorator_1.CurrentActor)()),
    __param(1, (0, common_1.Param)("id", new common_1.ParseUUIDPipe())),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], DepositController.prototype, "policy", null);
__decorate([
    (0, common_1.Post)("preview"),
    (0, common_1.Header)("Cache-Control", "private, no-store"),
    __param(0, (0, current_actor_decorator_1.CurrentActor)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], DepositController.prototype, "preview", null);
__decorate([
    (0, common_1.Post)("confirm"),
    (0, common_1.Header)("Cache-Control", "private, no-store"),
    __param(0, (0, current_actor_decorator_1.CurrentActor)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], DepositController.prototype, "confirm", null);
__decorate([
    (0, common_1.Get)("statements/:id"),
    (0, common_1.Header)("Cache-Control", "private, no-store"),
    (0, common_1.Header)("Pragma", "no-cache"),
    __param(0, (0, current_actor_decorator_1.CurrentActor)()),
    __param(1, (0, common_1.Param)("id", new common_1.ParseUUIDPipe())),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], DepositController.prototype, "statement", null);
__decorate([
    (0, common_1.Post)("accounts/:id/reconcile"),
    (0, common_1.Header)("Cache-Control", "private, no-store"),
    __param(0, (0, current_actor_decorator_1.CurrentActor)()),
    __param(1, (0, common_1.Param)("id", new common_1.ParseUUIDPipe())),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], DepositController.prototype, "reconcile", null);
__decorate([
    (0, common_1.Post)("accounts/:id/return-payment"),
    (0, common_1.Header)("Cache-Control", "private, no-store"),
    __param(0, (0, current_actor_decorator_1.CurrentActor)()),
    __param(1, (0, common_1.Param)("id", new common_1.ParseUUIDPipe())),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], DepositController.prototype, "returnPayment", null);
exports.DepositController = DepositController = __decorate([
    (0, swagger_1.ApiTags)("payroll-management"),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    (0, common_1.Controller)("finance/payroll"),
    __metadata("design:paramtypes", [deposit_service_1.DepositService])
], DepositController);
let DriverDepositController = class DriverDepositController {
    deposits;
    constructor(deposits) {
        this.deposits = deposits;
    }
    list(actor) { return this.deposits.list(actor, true); }
    detail(actor, id) { return this.deposits.detail(actor, id, true); }
};
exports.DriverDepositController = DriverDepositController;
__decorate([
    (0, common_1.Get)(),
    (0, common_1.Header)("Cache-Control", "private, no-store"),
    (0, common_1.Header)("Pragma", "no-cache"),
    __param(0, (0, current_actor_decorator_1.CurrentActor)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], DriverDepositController.prototype, "list", null);
__decorate([
    (0, common_1.Get)(":id"),
    (0, common_1.Header)("Cache-Control", "private, no-store"),
    (0, common_1.Header)("Pragma", "no-cache"),
    __param(0, (0, current_actor_decorator_1.CurrentActor)()),
    __param(1, (0, common_1.Param)("id", new common_1.ParseUUIDPipe())),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], DriverDepositController.prototype, "detail", null);
exports.DriverDepositController = DriverDepositController = __decorate([
    (0, swagger_1.ApiTags)("driver-payroll"),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    (0, common_1.Controller)("me/deposit-accounts"),
    __metadata("design:paramtypes", [deposit_service_1.DepositService])
], DriverDepositController);
//# sourceMappingURL=deposit.controller.js.map