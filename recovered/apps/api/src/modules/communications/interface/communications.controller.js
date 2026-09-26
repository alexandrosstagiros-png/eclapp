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
exports.CommunicationsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const auth_guard_1 = require("../../identity-access/interface/auth.guard");
const current_actor_decorator_1 = require("../../identity-access/interface/current-actor.decorator");
const communications_service_1 = require("../application/communications.service");
let CommunicationsController = class CommunicationsController {
    communications;
    constructor(communications) {
        this.communications = communications;
    }
    catalog(actor) { return this.communications.catalog(actor); }
    list(actor, view, cursor) { return this.communications.list(actor, view, cursor); }
    driverRequests(actor, scopeId, cursor) { return this.communications.driverRequests(actor, scopeId, cursor); }
    messages(actor, id, before) { return this.communications.messages(actor, id, before); }
    sendMessage(actor, id, body, request) { return this.communications.sendMessage(actor, id, body, request.correlationId); }
    get(actor, id) { return this.communications.get(actor, id); }
    create(actor, body, request) { return this.communications.create(actor, body, request.correlationId); }
    act(actor, id, body, request) { return this.communications.act(actor, id, body, request.correlationId); }
    link(actor, id, request) { return this.communications.telegramLink(actor, id, request.correlationId); }
    membership(actor, body, request) { return this.communications.membership(actor, body, request.correlationId); }
};
exports.CommunicationsController = CommunicationsController;
for (const [name, route, parameters] of [
    ['driverRequests', (0, common_1.Get)('driver-requests'), [(0, current_actor_decorator_1.CurrentActor)(), (0, common_1.Query)('responsibilityScopeId'), (0, common_1.Query)('cursor')]],
    ['messages', (0, common_1.Get)('tickets/:id/messages'), [(0, current_actor_decorator_1.CurrentActor)(), (0, common_1.Param)('id'), (0, common_1.Query)('before')]],
    ['sendMessage', (0, common_1.Post)('tickets/:id/messages'), [(0, current_actor_decorator_1.CurrentActor)(), (0, common_1.Param)('id'), (0, common_1.Body)(), (0, common_1.Req)()]],
]) {
    const descriptor = Object.getOwnPropertyDescriptor(CommunicationsController.prototype, name);
    route(CommunicationsController.prototype, name, descriptor);
    (0, common_1.Header)('Cache-Control', 'no-store')(CommunicationsController.prototype, name, descriptor);
    parameters.forEach((decorator, index) => decorator(CommunicationsController.prototype, name, index));
}
__decorate([
    (0, common_1.Get)("catalog"),
    (0, common_1.Header)("Cache-Control", "no-store"),
    (0, swagger_1.ApiOperation)({ summary: "Отделы, доступные области и членство в очередях" }),
    __param(0, (0, current_actor_decorator_1.CurrentActor)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], CommunicationsController.prototype, "catalog", null);
__decorate([
    (0, common_1.Get)("tickets"),
    (0, common_1.Header)("Cache-Control", "no-store"),
    __param(0, (0, current_actor_decorator_1.CurrentActor)()),
    __param(1, (0, common_1.Query)("view")),
    __param(2, (0, common_1.Query)("cursor")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], CommunicationsController.prototype, "list", null);
__decorate([
    (0, common_1.Get)("tickets/:id"),
    (0, common_1.Header)("Cache-Control", "no-store"),
    __param(0, (0, current_actor_decorator_1.CurrentActor)()),
    __param(1, (0, common_1.Param)("id")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], CommunicationsController.prototype, "get", null);
__decorate([
    (0, common_1.Post)("tickets"),
    __param(0, (0, current_actor_decorator_1.CurrentActor)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], CommunicationsController.prototype, "create", null);
__decorate([
    (0, common_1.Post)("tickets/:id/actions"),
    __param(0, (0, current_actor_decorator_1.CurrentActor)()),
    __param(1, (0, common_1.Param)("id")),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, Object]),
    __metadata("design:returntype", void 0)
], CommunicationsController.prototype, "act", null);
__decorate([
    (0, common_1.Post)("tickets/:id/telegram-link"),
    (0, common_1.Header)("Cache-Control", "no-store"),
    __param(0, (0, current_actor_decorator_1.CurrentActor)()),
    __param(1, (0, common_1.Param)("id")),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], CommunicationsController.prototype, "link", null);
__decorate([
    (0, common_1.Post)("memberships"),
    (0, swagger_1.ApiOperation)({ summary: "Явно назначить или отозвать доступ к отделу, администратор доступа" }),
    __param(0, (0, current_actor_decorator_1.CurrentActor)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], CommunicationsController.prototype, "membership", null);
exports.CommunicationsController = CommunicationsController = __decorate([
    (0, swagger_1.ApiTags)("Communications"),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    (0, common_1.Controller)("communications"),
    __metadata("design:paramtypes", [communications_service_1.CommunicationsService])
], CommunicationsController);
//# sourceMappingURL=communications.controller.js.map
