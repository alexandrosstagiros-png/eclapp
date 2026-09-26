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
exports.AuthGuard = void 0;
const common_1 = require("@nestjs/common");
const auth_service_1 = require("../application/auth.service");
let AuthGuard = class AuthGuard {
    auth;
    constructor(auth) {
        this.auth = auth;
    }
    async canActivate(context) {
        const request = context.switchToHttp().getRequest();
        const authorization = request.headers.authorization;
        const match = typeof authorization === "string"
            ? /^Bearer ([A-Za-z0-9_-]{43})$/i.exec(authorization)
            : null;
        if (!match)
            throw new common_1.UnauthorizedException("Authentication required");
        request.actor = await this.auth.authenticate(match[1]);
        if (request.actor.role === "tender_specialist") {
            const controllerPath = Reflect.getMetadata("path", context.getClass());
            const handlerPath = Reflect.getMetadata("path", context.getHandler());
            const permitted = ["tenders", "development", "team", "profile"].includes(controllerPath)
                || (controllerPath === "communications" && ["catalog", "driver-requests", "tickets/:id", "tickets/:id/messages", "tickets/:id/actions"].includes(handlerPath))
                || (["", "/"].includes(controllerPath) && handlerPath === "me")
                || (controllerPath === "auth" && ["logout", "impersonate/stop"].includes(handlerPath));
            if (!permitted)
                throw new common_1.ForbiddenException("Тендерному специалисту доступны разделы «Тендеры», «Разработка» и «Корпоративная среда».");
        }
        // External recruitment accounts have a closed API surface. Scope grants
        // authorize recruitment records, never the company's other departments.
        if (request.actor.role === "external_recruiter") {
            const controllerPath = Reflect.getMetadata("path", context.getClass());
            const handlerPath = Reflect.getMetadata("path", context.getHandler());
            const permitted = ["recruitment", "profile"].includes(controllerPath)
                || (["", "/"].includes(controllerPath) && handlerPath === "me")
                || (controllerPath === "auth" && handlerPath === "impersonate/stop");
            if (!permitted)
                throw new common_1.ForbiddenException("Внешнему рекрутеру доступен только раздел рекрутинга.");
        }
        return true;
    }
};
exports.AuthGuard = AuthGuard;
exports.AuthGuard = AuthGuard = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(auth_service_1.AuthService)),
    __metadata("design:paramtypes", [auth_service_1.AuthService])
], AuthGuard);
//# sourceMappingURL=auth.guard.js.map
