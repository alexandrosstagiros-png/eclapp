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
exports.AccessController = exports.IdentityController = exports.AuthController = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("../../../platform/config");
const swagger_1 = require("@nestjs/swagger");
const throttler_1 = require("@nestjs/throttler");
const auth_service_1 = require("../application/auth.service");
const auth_guard_1 = require("./auth.guard");
const auth_dto_1 = require("./auth.dto");
const current_actor_decorator_1 = require("./current-actor.decorator");
const auth_response_dto_1 = require("./auth-response.dto");
const remembered = require("./remembered-cookie");
let AuthController = class AuthController {
    auth;
    config;
    constructor(auth, config) {
        this.auth = auth;
        this.config = config;
    }
    requireLocalDemo(request) {
        if (!this.config.value.demoAuthEnabled)
            throw new common_1.NotFoundException();
        const peer = request.socket.remoteAddress;
        let hostname;
        try {
            hostname = new URL(`http://${request.headers.host ?? ""}`).hostname;
        }
        catch {
            throw new common_1.ForbiddenException();
        }
        if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(peer ?? "") ||
            !["127.0.0.1", "localhost"].includes(hostname))
            throw new common_1.ForbiddenException();
        const origin = request.headers.origin;
        if (origin && !this.config.value.allowedOrigins.includes(origin))
            throw new common_1.ForbiddenException();
        if (request.headers["sec-fetch-site"] === "cross-site")
            throw new common_1.ForbiddenException();
    }
    demoProfiles(request) {
        this.requireLocalDemo(request);
        return this.auth.demoProfiles();
    }
    demo(body, request) {
        this.requireLocalDemo(request);
        return this.auth.demoLogin(body.userId, request.correlationId);
    }
    dev(body, key, request) {
        return this.auth.devLogin(body.userId, key, request.correlationId);
    }
    telegram(body, request) {
        return this.auth.telegramLogin(body.initData, body.invitationToken, request.correlationId);
    }
    max(body, request) {
        return this.auth.maxLogin(body.initData, body.invitationToken, request.correlationId);
    }
    async password(body, request, response) {
        remembered.requireTrustedAuthOrigin(request, this.config.value);
        const session = await this.auth.passwordLogin(body.phone, body.password, request.correlationId, body.rememberDevice !== false, remembered.readRememberedCookie(request, this.config.value));
        response.setHeader("Set-Cookie", remembered.rememberedCookie(this.config.value, session.refreshToken, session.rememberedUntil));
        return session;
    }
    async refresh(request, response) {
        remembered.requireTrustedAuthOrigin(request, this.config.value, true);
        try {
            const session = await this.auth.refreshRemembered(remembered.readRememberedCookie(request, this.config.value), request.correlationId);
            response.setHeader("Set-Cookie", remembered.rememberedCookie(this.config.value, session.refreshToken, session.rememberedUntil));
            return session;
        } catch (error) {
            // A concurrent refresh (409), network/server error or CSRF rejection
            // must not erase another tab's newly rotated cookie.
            if (error instanceof common_1.UnauthorizedException) response.setHeader("Set-Cookie", remembered.rememberedCookie(this.config.value));
            throw error;
        }
    }
    deviceStatus(request) {
        remembered.requireTrustedAuthOrigin(request, this.config.value, true);
        return this.auth.rememberedDeviceStatus(remembered.readRememberedCookie(request, this.config.value));
    }
    impersonate(actor, body, request) {
        return this.auth.impersonate(actor, body.userId, request.correlationId);
    }
    stopImpersonation(actor, request) {
        return this.auth.stopImpersonation(actor, request.correlationId);
    }
    async logout(request, response) {
        const cookie = remembered.readRememberedCookie(request, this.config.value);
        remembered.requireTrustedAuthOrigin(request, this.config.value, Boolean(cookie) || request.headers[remembered.HEADER] !== undefined);
        const match = typeof request.headers.authorization === "string" ? /^Bearer ([A-Za-z0-9_-]{43})$/i.exec(request.headers.authorization) : null;
        if (match) {
            let actor;
            try { actor = await this.auth.authenticate(match[1]); }
            catch (error) { if (!(error instanceof common_1.UnauthorizedException)) throw error; }
            if (actor?.impersonation) {
                request.actor = actor;
                return this.auth.stopImpersonation(actor, request.correlationId);
            }
        }
        const result = await this.auth.logoutCredentials(match?.[1], cookie, request.correlationId);
        response.setHeader("Set-Cookie", remembered.rememberedCookie(this.config.value));
        return result;
    }
};
exports.AuthController = AuthController;
__decorate([
    (0, common_1.Post)("impersonate"),
    (0, common_1.HttpCode)(200),
    (0, common_1.Header)("Cache-Control", "no-store"),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOkResponse)({ type: auth_response_dto_1.SessionResponseDto }),
    __param(0, (0, current_actor_decorator_1.CurrentActor)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, auth_dto_1.ImpersonateDto, Object]),
], AuthController.prototype, "impersonate", null);
__decorate([
    (0, common_1.Post)("impersonate/stop"),
    (0, common_1.HttpCode)(200),
    (0, common_1.Header)("Cache-Control", "no-store"),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOkResponse)({ type: auth_response_dto_1.ActionResultDto }),
    __param(0, (0, current_actor_decorator_1.CurrentActor)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
], AuthController.prototype, "stopImpersonation", null);
__decorate([
    (0, common_1.Get)("demo/profiles"),
    (0, swagger_1.ApiOperation)({ summary: "Synthetic profiles; explicitly enabled loopback demo only" }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "demoProfiles", null);
__decorate([
    (0, common_1.Post)("demo"),
    (0, common_1.HttpCode)(200),
    (0, swagger_1.ApiOkResponse)({ type: auth_response_dto_1.SessionResponseDto }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [auth_dto_1.DevLoginDto, Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "demo", null);
__decorate([
    (0, common_1.Post)("dev"),
    (0, common_1.HttpCode)(200),
    (0, common_1.Header)("Cache-Control", "no-store"),
    (0, throttler_1.Throttle)({
        default: {
            limit: process.env.NODE_ENV === "test" ? 1000 : 10,
            ttl: 60_000,
        },
    }),
    (0, swagger_1.ApiHeader)({ name: "X-Dev-Auth-Key", required: true }),
    (0, swagger_1.ApiOperation)({
        summary: "Development/test login only; disabled in production",
    }),
    (0, swagger_1.ApiOkResponse)({ type: auth_response_dto_1.SessionResponseDto }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Headers)("x-dev-auth-key")),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [auth_dto_1.DevLoginDto, Object, Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "dev", null);
__decorate([
    (0, common_1.Post)("telegram"),
    (0, common_1.HttpCode)(200),
    (0, common_1.Header)("Cache-Control", "no-store"),
    (0, throttler_1.Throttle)({
        default: {
            limit: process.env.NODE_ENV === "test" ? 1000 : 10,
            ttl: 60_000,
        },
    }),
    (0, swagger_1.ApiOperation)({
        summary: "Validate Telegram Mini App initData and issue a revocable server session",
    }),
    (0, swagger_1.ApiOkResponse)({ type: auth_response_dto_1.SessionResponseDto }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [auth_dto_1.TelegramLoginDto, Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "telegram", null);
__decorate([
    (0, common_1.Post)("max"),
    (0, common_1.HttpCode)(200),
    (0, common_1.Header)("Cache-Control", "no-store"),
    (0, throttler_1.Throttle)({
        default: {
            limit: process.env.NODE_ENV === "test" ? 1000 : 10,
            ttl: 60_000,
        },
    }),
    (0, swagger_1.ApiOperation)({
        summary: "Validate MAX Mini App initData and issue a revocable server session",
    }),
    (0, swagger_1.ApiOkResponse)({ type: auth_response_dto_1.SessionResponseDto }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [auth_dto_1.MaxLoginDto, Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "max", null);
__decorate([
    (0, common_1.Post)("password"),
    (0, common_1.HttpCode)(200),
    (0, common_1.Header)("Cache-Control", "no-store"),
    (0, throttler_1.Throttle)({
        default: {
            limit: process.env.NODE_ENV === "test" ? 1000 : 10,
            ttl: 60_000,
        },
    }),
    (0, swagger_1.ApiOperation)({
        summary: "Validate phone and password and issue a revocable server session",
    }),
    (0, swagger_1.ApiOkResponse)({ type: auth_response_dto_1.SessionResponseDto }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [auth_dto_1.PasswordLoginDto, Object, Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "password", null);
for (const [method, route] of [["refresh", "refresh"], ["deviceStatus", "device-status"]]) {
    const decorators = [
        (0, common_1.Post)(route), (0, common_1.HttpCode)(200),
        (0, common_1.Header)("Cache-Control", "no-store"),
        (0, throttler_1.Throttle)({ default: { limit: process.env.NODE_ENV === "test" ? 1000 : 60, ttl: 60000 } }),
        __param(0, (0, common_1.Req)()),
        __metadata("design:type", Function),
        __metadata("design:paramtypes", method === "refresh" ? [Object, Object] : [Object]),
    ];
    if (method === "refresh") decorators.push(__param(1, (0, common_1.Res)({ passthrough: true })));
    __decorate(decorators, AuthController.prototype, method, null);
}
__decorate([
    (0, common_1.Post)("logout"),
    (0, common_1.HttpCode)(200),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOkResponse)({ type: auth_response_dto_1.ActionResultDto }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "logout", null);
exports.AuthController = AuthController = __decorate([
    (0, swagger_1.ApiTags)("Authentication"),
    (0, common_1.Controller)("auth"),
    __param(0, (0, common_1.Inject)(auth_service_1.AuthService)),
    __param(1, (0, common_1.Inject)(config_1.ConfigService)),
    __metadata("design:paramtypes", [auth_service_1.AuthService,
        config_1.ConfigService])
], AuthController);
let IdentityController = class IdentityController {
    me(actor) {
        return actor;
    }
};
exports.IdentityController = IdentityController;
__decorate([
    (0, common_1.Get)("me"),
    (0, common_1.Header)("Cache-Control", "no-store"),
    (0, swagger_1.ApiOkResponse)({ type: auth_response_dto_1.ActorDto }),
    __param(0, (0, current_actor_decorator_1.CurrentActor)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Object)
], IdentityController.prototype, "me", null);
exports.IdentityController = IdentityController = __decorate([
    (0, swagger_1.ApiTags)("Identity"),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    (0, common_1.Controller)()
], IdentityController);
let AccessController = class AccessController {
    auth;
    constructor(auth) {
        this.auth = auth;
    }
    invitation(actor, body, request) {
        return this.auth.createInvitation(actor, body.userId, body.telegramUserId, request.correlationId);
    }
    maxInvitation(actor, body, request) {
        return this.auth.createMaxInvitation(actor, body.userId, body.maxUserId, request.correlationId);
    }
    password(actor, userId, body, request) {
        return this.auth.issuePassword(actor, userId, body.phone, request.correlationId);
    }
    revoke(actor, userId, body, request) {
        return this.auth.revokeUser(actor, userId, body.reasonCode, request.correlationId);
    }
};
exports.AccessController = AccessController;
__decorate([
    (0, common_1.Post)("invitations"),
    (0, common_1.Header)("Cache-Control", "no-store"),
    (0, swagger_1.ApiOperation)({
        summary: "Create a one-time Telegram invitation for an approved active user within every administrator scope",
    }),
    (0, swagger_1.ApiCreatedResponse)({ type: auth_response_dto_1.InvitationResponseDto }),
    __param(0, (0, current_actor_decorator_1.CurrentActor)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, auth_dto_1.CreateInvitationDto, Object]),
    __metadata("design:returntype", void 0)
], AccessController.prototype, "invitation", null);
__decorate([
    (0, common_1.Post)("max-invitations"),
    (0, common_1.Header)("Cache-Control", "no-store"),
    (0, swagger_1.ApiOperation)({
        summary: "Create a one-time MAX invitation for an approved active user within every administrator scope",
    }),
    (0, swagger_1.ApiCreatedResponse)({ type: auth_response_dto_1.InvitationResponseDto }),
    __param(0, (0, current_actor_decorator_1.CurrentActor)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, auth_dto_1.CreateMaxInvitationDto, Object]),
    __metadata("design:returntype", void 0)
], AccessController.prototype, "maxInvitation", null);
__decorate([
    (0, common_1.Post)("users/:userId/password"),
    (0, common_1.Header)("Cache-Control", "no-store"),
    (0, swagger_1.ApiOperation)({ summary: "Issue or reset a scoped employee password, revoking all existing sessions" }),
    (0, swagger_1.ApiCreatedResponse)({ type: auth_response_dto_1.PasswordIssuedDto }),
    __param(0, (0, current_actor_decorator_1.CurrentActor)()),
    __param(1, (0, common_1.Param)("userId", new common_1.ParseUUIDPipe())),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, auth_dto_1.IssuePasswordDto, Object]),
    __metadata("design:returntype", void 0)
], AccessController.prototype, "password", null);
__decorate([
    (0, common_1.Post)("users/:id/revoke"),
    (0, common_1.HttpCode)(200),
    (0, swagger_1.ApiOperation)({
        summary: "Deactivate a scoped user, revoke sessions and expire pending invitations",
    }),
    (0, swagger_1.ApiOkResponse)({ type: auth_response_dto_1.ActionResultDto }),
    __param(0, (0, current_actor_decorator_1.CurrentActor)()),
    __param(1, (0, common_1.Param)("id", new common_1.ParseUUIDPipe())),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, auth_dto_1.RevokeUserDto, Object]),
    __metadata("design:returntype", void 0)
], AccessController.prototype, "revoke", null);
exports.AccessController = AccessController = __decorate([
    (0, swagger_1.ApiTags)("Access management"),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    (0, common_1.Controller)("access"),
    __param(0, (0, common_1.Inject)(auth_service_1.AuthService)),
    __metadata("design:paramtypes", [auth_service_1.AuthService])
], AccessController);
//# sourceMappingURL=auth.controller.js.map
