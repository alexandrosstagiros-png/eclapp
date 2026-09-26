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
exports.InspectionsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const auth_guard_1 = require("../../identity-access/interface/auth.guard");
const current_actor_decorator_1 = require("../../identity-access/interface/current-actor.decorator");
const inspections_service_1 = require("../application/inspections.service");
let InspectionsController = class InspectionsController {
    inspections;
    constructor(inspections) {
        this.inspections = inspections;
    }
    templates(actor) { return this.inspections.templates(actor); }
    publish(actor, body, request) { return this.inspections.publish(actor, body, request.correlationId); }
    state(actor, id, driverId) { return this.inspections.state(actor, id, driverId); }
    upload(actor, id, body, request) { return this.inspections.upload(actor, id, body, request.correlationId); }
    submit(actor, id, body, request) { return this.inspections.submit(actor, id, body, request.correlationId); }
    queue(actor, status, cursor) { return this.inspections.queue(actor, status, cursor); }
    attention(actor) { return this.inspections.attention(actor); }
    submission(actor, id) { return this.inspections.submission(actor, id); }
    review(actor, id, body, request) { return this.inspections.review(actor, id, body, request.correlationId); }
    deletePhoto(actor, id, body, request) { return this.inspections.deletePhoto(actor, id, body, request.correlationId); }
    async download(actor, id, request, response) {
        const photo = await this.inspections.download(actor, id, request.correlationId);
        response.setHeader("Content-Type", photo.mimeType);
        response.setHeader("Content-Disposition", `attachment; filename="${photo.filename}"`);
        response.setHeader("Content-Length", photo.bytes.length);
        response.setHeader("ETag", `"${photo.sha256}"`);
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.setHeader("Content-Security-Policy", "sandbox; default-src 'none'");
        response.send(photo.bytes);
    }
};
exports.InspectionsController = InspectionsController;
__decorate([
    (0, common_1.Get)("templates"),
    (0, common_1.Header)("Cache-Control", "no-store"),
    (0, swagger_1.ApiOperation)({ summary: "Области и актуальные шаблоны КО, механик" }),
    __param(0, (0, current_actor_decorator_1.CurrentActor)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], InspectionsController.prototype, "templates", null);
__decorate([
    (0, common_1.Post)("templates"),
    (0, swagger_1.ApiOperation)({ summary: "Опубликовать неизменяемую версию требований КО, механик" }),
    __param(0, (0, current_actor_decorator_1.CurrentActor)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], InspectionsController.prototype, "publish", null);
__decorate([
    (0, common_1.Get)("trips/:tripId"),
    (0, common_1.Header)("Cache-Control", "no-store"),
    (0, swagger_1.ApiOperation)({ summary: "Шаблон и до 100 версий КО рейса, с фильтром driverId до ограничения; водитель видит только свои" }),
    __param(0, (0, current_actor_decorator_1.CurrentActor)()),
    __param(1, (0, common_1.Param)("tripId")),
    __param(2, (0, common_1.Query)("driverId")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], InspectionsController.prototype, "state", null);
__decorate([
    (0, common_1.Post)("trips/:tripId/photos"),
    (0, swagger_1.ApiOperation)({ summary: "Фото JPEG/PNG до 5 МБ к пункту КО; сжатие после приёмки и удаление через 3 месяца" }),
    __param(0, (0, current_actor_decorator_1.CurrentActor)()),
    __param(1, (0, common_1.Param)("tripId")),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, Object]),
    __metadata("design:returntype", void 0)
], InspectionsController.prototype, "upload", null);
__decorate([
    (0, common_1.Post)("trips/:tripId/submissions"),
    (0, swagger_1.ApiOperation)({ summary: "Отправить КО с фиксацией шаблона, ТС, даты и доказательств, водитель" }),
    __param(0, (0, current_actor_decorator_1.CurrentActor)()),
    __param(1, (0, common_1.Param)("tripId")),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, Object]),
    __metadata("design:returntype", void 0)
], InspectionsController.prototype, "submit", null);
__decorate([
    (0, common_1.Get)("queue"),
    (0, common_1.Header)("Cache-Control", "no-store"),
    (0, swagger_1.ApiOperation)({ summary: "Очередь последних КО по рейсу и водителю, до 50 записей" }),
    __param(0, (0, current_actor_decorator_1.CurrentActor)()),
    __param(1, (0, common_1.Query)("status")),
    __param(2, (0, common_1.Query)("cursor")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], InspectionsController.prototype, "queue", null);
__decorate([
    (0, common_1.Get)("attention"),
    (0, common_1.Header)("Cache-Control", "no-store"),
    (0, swagger_1.ApiOperation)({ summary: "Счётчик и список КО, возвращённых назначенному водителю на доработку" }),
    __param(0, (0, current_actor_decorator_1.CurrentActor)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], InspectionsController.prototype, "attention", null);
__decorate([
    (0, common_1.Get)("submissions/:id"),
    (0, common_1.Header)("Cache-Control", "no-store"),
    (0, swagger_1.ApiOperation)({ summary: "Снимок КО и решение механика с проверкой области, владельца и доступа к ПД" }),
    __param(0, (0, current_actor_decorator_1.CurrentActor)()),
    __param(1, (0, common_1.Param)("id")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], InspectionsController.prototype, "submission", null);
__decorate([
    (0, common_1.Post)("submissions/:id/review"),
    (0, swagger_1.ApiOperation)({ summary: "Принять КО либо вернуть с причиной, механик" }),
    __param(0, (0, current_actor_decorator_1.CurrentActor)()),
    __param(1, (0, common_1.Param)("id")),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, Object]),
    __metadata("design:returntype", void 0)
], InspectionsController.prototype, "review", null);
__decorate([
    (0, common_1.Post)("photos/:id/delete"),
    (0, swagger_1.ApiOperation)({ summary: "Удалить содержимое фото КО: администратор в любое время, главный механик через месяц" }),
    __param(0, (0, current_actor_decorator_1.CurrentActor)()),
    __param(1, (0, common_1.Param)("id")),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, Object]),
    __metadata("design:returntype", void 0)
], InspectionsController.prototype, "deletePhoto", null);
__decorate([
    (0, common_1.Get)("photos/:id/download"),
    (0, swagger_1.ApiOperation)({ summary: "Скачать фото КО в своей области с записью аудита" }),
    __param(0, (0, current_actor_decorator_1.CurrentActor)()),
    __param(1, (0, common_1.Param)("id")),
    __param(2, (0, common_1.Req)()),
    __param(3, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, Object]),
    __metadata("design:returntype", Promise)
], InspectionsController.prototype, "download", null);
exports.InspectionsController = InspectionsController = __decorate([
    (0, swagger_1.ApiTags)("Inspections"),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    (0, common_1.Controller)("inspections"),
    __metadata("design:paramtypes", [inspections_service_1.InspectionsService])
], InspectionsController);
//# sourceMappingURL=inspections.controller.js.map
