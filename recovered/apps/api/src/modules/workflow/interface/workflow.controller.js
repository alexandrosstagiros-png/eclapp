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
exports.WorkflowController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const auth_guard_1 = require("../../identity-access/interface/auth.guard");
const current_actor_decorator_1 = require("../../identity-access/interface/current-actor.decorator");
const workflow_service_1 = require("../application/workflow.service");
let WorkflowController = class WorkflowController {
    workflow;
    constructor(workflow) {
        this.workflow = workflow;
    }
    catalog(actor) { return this.workflow.catalog(actor); }
    createTrip(actor, body, request) { return this.workflow.createTrip(actor, body, request.correlationId); }
    preview(actor, body) { return this.workflow.importPreview(actor, body); }
    commit(actor, body, request) { return this.workflow.importCommit(actor, body, request.correlationId); }
    state(actor, id) { return this.workflow.state(actor, id); }
    attendance(actor, id, body, request) { return this.workflow.attendance(actor, id, body, request.correlationId); }
    upload(actor, id, body, request) { return this.workflow.upload(actor, id, body, request.correlationId); }
    facts(actor, id, body, request) { return this.workflow.submitFacts(actor, id, body, request.correlationId); }
    reviewDocument(actor, id, body, request) { return this.workflow.review(actor, "document", id, body, request.correlationId); }
    reviewFacts(actor, id, body, request) { return this.workflow.review(actor, "facts", id, body, request.correlationId); }
    async download(actor, id, request, response) {
        const document = await this.workflow.download(actor, id, request.correlationId);
        response.setHeader("Content-Type", document.mimeType);
        response.setHeader("Content-Disposition", `attachment; filename="${document.filename}"`);
        response.setHeader("Content-Length", document.bytes.length);
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.setHeader("Content-Security-Policy", "sandbox; default-src 'none'");
        response.send(document.bytes);
    }
};
exports.WorkflowController = WorkflowController;
__decorate([
    (0, common_1.Get)("catalog"),
    (0, swagger_1.ApiOperation)({ summary: "Справочники для доступных областей и шаблон CSV" }),
    __param(0, (0, current_actor_decorator_1.CurrentActor)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], WorkflowController.prototype, "catalog", null);
__decorate([
    (0, common_1.Post)("trips"),
    (0, swagger_1.ApiOperation)({ summary: "Создать рейс и назначить водителя, диспетчер" }),
    __param(0, (0, current_actor_decorator_1.CurrentActor)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], WorkflowController.prototype, "createTrip", null);
__decorate([
    (0, common_1.Post)("import/preview"),
    (0, swagger_1.ApiOperation)({ summary: "Проверить до 100 строк CSV без записи" }),
    __param(0, (0, current_actor_decorator_1.CurrentActor)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], WorkflowController.prototype, "preview", null);
__decorate([
    (0, common_1.Post)("import/commit"),
    (0, swagger_1.ApiOperation)({ summary: "Атомарно загрузить проверенный CSV; повтор не создаёт дубликаты" }),
    __param(0, (0, current_actor_decorator_1.CurrentActor)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], WorkflowController.prototype, "commit", null);
__decorate([
    (0, common_1.Get)("trips/:id"),
    (0, common_1.Header)("Cache-Control", "no-store"),
    (0, swagger_1.ApiOperation)({ summary: "Явка, последние версии документов, полнота пакета и факты рейса" }),
    __param(0, (0, current_actor_decorator_1.CurrentActor)()),
    __param(1, (0, common_1.Param)("id")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], WorkflowController.prototype, "state", null);
__decorate([
    (0, common_1.Post)("trips/:id/attendance"),
    (0, swagger_1.ApiOperation)({ summary: "Принятие заявки, начало или завершение назначенного водителю рейса" }),
    __param(0, (0, current_actor_decorator_1.CurrentActor)()),
    __param(1, (0, common_1.Param)("id")),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, Object]),
    __metadata("design:returntype", void 0)
], WorkflowController.prototype, "attendance", null);
__decorate([
    (0, common_1.Post)("trips/:id/documents"),
    (0, swagger_1.ApiOperation)({ summary: "Загрузить неизменяемую версию PDF/JPEG/PNG до 10 МБ" }),
    __param(0, (0, current_actor_decorator_1.CurrentActor)()),
    __param(1, (0, common_1.Param)("id")),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, Object]),
    __metadata("design:returntype", void 0)
], WorkflowController.prototype, "upload", null);
__decorate([
    (0, common_1.Post)("trips/:id/facts"),
    (0, swagger_1.ApiOperation)({ summary: "Внести ручные факты; расчёт возможен после проверки специалистом" }),
    __param(0, (0, current_actor_decorator_1.CurrentActor)()),
    __param(1, (0, common_1.Param)("id")),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, Object]),
    __metadata("design:returntype", void 0)
], WorkflowController.prototype, "facts", null);
__decorate([
    (0, common_1.Post)("documents/:id/review"),
    (0, swagger_1.ApiOperation)({ summary: "Принять или вернуть последнюю версию документа с причиной" }),
    __param(0, (0, current_actor_decorator_1.CurrentActor)()),
    __param(1, (0, common_1.Param)("id")),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, Object]),
    __metadata("design:returntype", void 0)
], WorkflowController.prototype, "reviewDocument", null);
__decorate([
    (0, common_1.Post)("facts/:id/review"),
    (0, swagger_1.ApiOperation)({ summary: "Подтвердить или вернуть ручные факты, специалист по документам" }),
    __param(0, (0, current_actor_decorator_1.CurrentActor)()),
    __param(1, (0, common_1.Param)("id")),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, Object]),
    __metadata("design:returntype", void 0)
], WorkflowController.prototype, "reviewFacts", null);
__decorate([
    (0, common_1.Get)("documents/:id/download"),
    (0, swagger_1.ApiOperation)({ summary: "Скачать документ в своей области с записью аудита" }),
    __param(0, (0, current_actor_decorator_1.CurrentActor)()),
    __param(1, (0, common_1.Param)("id")),
    __param(2, (0, common_1.Req)()),
    __param(3, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, Object]),
    __metadata("design:returntype", Promise)
], WorkflowController.prototype, "download", null);
exports.WorkflowController = WorkflowController = __decorate([
    (0, swagger_1.ApiTags)("Workflow"),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    (0, common_1.Controller)("workflow"),
    __metadata("design:paramtypes", [workflow_service_1.WorkflowService])
], WorkflowController);
//# sourceMappingURL=workflow.controller.js.map