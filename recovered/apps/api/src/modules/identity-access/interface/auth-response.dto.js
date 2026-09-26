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
exports.ActionResultDto = exports.InvitationResponseDto = exports.SessionResponseDto = exports.ActorDto = exports.AccessGrantDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class AccessGrantDto {
    legalEntityId;
    regionId;
    projectId;
    responsibilityScopeId;
    financeVisible;
    personalDataVisible;
    inspectionPhotoDelete;
}
exports.AccessGrantDto = AccessGrantDto;
__decorate([
    (0, swagger_1.ApiProperty)({ type: Boolean, description: "Explicit chief-mechanic permission to delete inspection photos after one calendar month in this scope" }),
    __metadata("design:type", Boolean)
], AccessGrantDto.prototype, "inspectionPhotoDelete", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ format: "uuid" }),
    __metadata("design:type", String)
], AccessGrantDto.prototype, "legalEntityId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ format: "uuid" }),
    __metadata("design:type", String)
], AccessGrantDto.prototype, "regionId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ format: "uuid" }),
    __metadata("design:type", String)
], AccessGrantDto.prototype, "projectId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ format: "uuid" }),
    __metadata("design:type", String)
], AccessGrantDto.prototype, "responsibilityScopeId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Boolean)
], AccessGrantDto.prototype, "financeVisible", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Boolean)
], AccessGrantDto.prototype, "personalDataVisible", void 0);
class ActorDto {
    id;
    displayName;
    role;
    authVersion;
    sessionId;
    channel;
    grants;
    impersonation;
}
exports.ActorDto = ActorDto;
__decorate([
    (0, swagger_1.ApiProperty)({ format: "uuid" }),
    __metadata("design:type", String)
], ActorDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], ActorDto.prototype, "displayName", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        enum: [
            "driver",
            "dispatcher",
            "manager", "recruiter", "tender_specialist", "external_recruiter",
            "document_specialist",
            "mechanic",
            "access_admin",
            "auditor",
        ],
    }),
    __metadata("design:type", String)
], ActorDto.prototype, "role", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: Number, minimum: 1 }),
    __metadata("design:type", Number)
], ActorDto.prototype, "authVersion", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ format: "uuid" }),
    __metadata("design:type", String)
], ActorDto.prototype, "sessionId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ["dev", "telegram", "max", "web", "system"] }),
    __metadata("design:type", String)
], ActorDto.prototype, "channel", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [AccessGrantDto] }),
    __metadata("design:type", Array)
], ActorDto.prototype, "grants", void 0);
class ImpersonationDto {
    administratorId;
    administratorDisplayName;
    parentSessionId;
}
exports.ImpersonationDto = ImpersonationDto;
for (const field of ["administratorId", "administratorDisplayName", "parentSessionId"]) {
    __decorate([
        (0, swagger_1.ApiProperty)(field === "administratorDisplayName" ? {} : { format: "uuid" }),
        __metadata("design:type", String),
    ], ImpersonationDto.prototype, field, void 0);
}
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ type: ImpersonationDto }),
    __metadata("design:type", ImpersonationDto),
], ActorDto.prototype, "impersonation", void 0);
class SessionResponseDto {
    accessToken;
    expiresAt;
    actor;
    rememberedDevice;
    rememberedUntil;
}
exports.SessionResponseDto = SessionResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: "Opaque bearer credential; keep in memory and never log",
        minLength: 43,
        maxLength: 43,
    }),
    __metadata("design:type", String)
], SessionResponseDto.prototype, "accessToken", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ format: "date-time" }),
    __metadata("design:type", String)
], SessionResponseDto.prototype, "expiresAt", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: ActorDto }),
    __metadata("design:type", ActorDto)
], SessionResponseDto.prototype, "actor", void 0);
__decorate([(0, swagger_1.ApiPropertyOptional)({ type: Boolean }), __metadata("design:type", Boolean)], SessionResponseDto.prototype, "rememberedDevice", void 0);
__decorate([(0, swagger_1.ApiPropertyOptional)({ format: "date-time", nullable: true }), __metadata("design:type", String)], SessionResponseDto.prototype, "rememberedUntil", void 0);
class InvitationResponseDto {
    invitationToken;
    expiresAt;
    userId;
}
exports.InvitationResponseDto = InvitationResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: "Secret shown once, bound to the approved target Telegram ID",
        minLength: 43,
        maxLength: 43,
    }),
    __metadata("design:type", String)
], InvitationResponseDto.prototype, "invitationToken", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ format: "date-time" }),
    __metadata("design:type", String)
], InvitationResponseDto.prototype, "expiresAt", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ format: "uuid" }),
    __metadata("design:type", String)
], InvitationResponseDto.prototype, "userId", void 0);
class ActionResultDto {
    ok;
}
exports.ActionResultDto = ActionResultDto;
__decorate([
    (0, swagger_1.ApiProperty)({ type: Boolean, enum: [true] }),
    __metadata("design:type", Boolean)
], ActionResultDto.prototype, "ok", void 0);
//# sourceMappingURL=auth-response.dto.js.map
class PasswordIssuedDto {
    userId;
    phone;
    password;
    issuedAt;
}
exports.PasswordIssuedDto = PasswordIssuedDto;
for (const [field, options] of [
    ["userId", { format: "uuid" }], ["phone", { description: "Normalized phone number" }],
    ["password", { description: "Generated password; returned once and never stored in plaintext", format: "password" }],
    ["issuedAt", { format: "date-time" }],
]) {
    __decorate([(0, swagger_1.ApiProperty)(options), __metadata("design:type", String)], PasswordIssuedDto.prototype, field, void 0);
}
