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
exports.PasswordLoginDto = exports.IssuePasswordDto = exports.CreateMaxInvitationDto = exports.MaxLoginDto = exports.RevokeUserDto = exports.CreateInvitationDto = exports.TelegramLoginDto = exports.DevLoginDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class DevLoginDto {
    userId;
}
exports.DevLoginDto = DevLoginDto;
__decorate([
    (0, swagger_1.ApiProperty)({ format: "uuid" }),
    (0, class_validator_1.IsUUID)("all"),
    __metadata("design:type", String)
], DevLoginDto.prototype, "userId", void 0);
class ImpersonateDto {
    userId;
}
exports.ImpersonateDto = ImpersonateDto;
__decorate([
    (0, swagger_1.ApiProperty)({ format: "uuid" }),
    (0, class_validator_1.IsUUID)("all"),
    __metadata("design:type", String)
], ImpersonateDto.prototype, "userId", void 0);
class TelegramLoginDto {
    initData;
    invitationToken;
}
exports.TelegramLoginDto = TelegramLoginDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: "Raw Telegram.WebApp.initData, validated only by the server",
        maxLength: 16384,
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(1),
    (0, class_validator_1.MaxLength)(16384),
    __metadata("design:type", String)
], TelegramLoginDto.prototype, "initData", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: "One-time invitation, supplied for first channel binding",
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Matches)(/^[A-Za-z0-9_-]{43}$/),
    __metadata("design:type", String)
], TelegramLoginDto.prototype, "invitationToken", void 0);
class MaxLoginDto {
    initData;
    invitationToken;
}
exports.MaxLoginDto = MaxLoginDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: "Raw MAX WebApp.initData, validated only by the server",
        maxLength: 16384,
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(1),
    (0, class_validator_1.MaxLength)(16384),
    __metadata("design:type", String)
], MaxLoginDto.prototype, "initData", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: "One-time invitation, supplied for first channel binding",
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Matches)(/^[A-Za-z0-9_-]{43}$/),
    __metadata("design:type", String)
], MaxLoginDto.prototype, "invitationToken", void 0);
class CreateInvitationDto {
    userId;
    telegramUserId;
}
exports.CreateInvitationDto = CreateInvitationDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        format: "uuid",
        description: "Existing approved active driver or staff account; invitation does not grant roles or department access",
    }),
    (0, class_validator_1.IsUUID)("all"),
    __metadata("design:type", String)
], CreateInvitationDto.prototype, "userId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: "Verified Telegram user ID, obtained through the internal identity-check process",
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Matches)(/^[1-9]\d{0,15}$/),
    __metadata("design:type", String)
], CreateInvitationDto.prototype, "telegramUserId", void 0);
class CreateMaxInvitationDto {
    userId;
    maxUserId;
}
exports.CreateMaxInvitationDto = CreateMaxInvitationDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        format: "uuid",
        description: "Existing approved active driver or staff account; invitation does not grant roles or department access",
    }),
    (0, class_validator_1.IsUUID)("all"),
    __metadata("design:type", String)
], CreateMaxInvitationDto.prototype, "userId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: "Verified MAX user ID, obtained through the internal identity-check process",
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Matches)(/^[1-9]\d{0,15}$/),
    __metadata("design:type", String)
], CreateMaxInvitationDto.prototype, "maxUserId", void 0);
class PasswordLoginDto {
    phone;
    password;
    rememberDevice;
}
exports.PasswordLoginDto = PasswordLoginDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: "Phone in E.164 or Russian 7/8 format", maxLength: 64 }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(64),
    __metadata("design:type", String)
], PasswordLoginDto.prototype, "phone", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ maxLength: 128, format: "password" }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(128),
    __metadata("design:type", String)
], PasswordLoginDto.prototype, "password", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ type: Boolean, default: true }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], PasswordLoginDto.prototype, "rememberDevice", void 0);
class IssuePasswordDto {
    phone;
}
exports.IssuePasswordDto = IssuePasswordDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: "Phone for the existing approved employee", maxLength: 64 }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(1),
    (0, class_validator_1.MaxLength)(64),
    __metadata("design:type", String)
], IssuePasswordDto.prototype, "phone", void 0);
class RevokeUserDto {
    reasonCode;
}
exports.RevokeUserDto = RevokeUserDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        enum: ["employment_ended", "access_review", "security_incident"],
    }),
    (0, class_validator_1.IsIn)(["employment_ended", "access_review", "security_incident"]),
    __metadata("design:type", String)
], RevokeUserDto.prototype, "reasonCode", void 0);
//# sourceMappingURL=auth.dto.js.map
