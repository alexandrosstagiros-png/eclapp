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
exports.OneCAcknowledgeDto = exports.RegistryCreateDto = exports.RegistryPreviewDto = exports.TariffCreateDto = exports.FinanceKeyDto = exports.FinanceScopeDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class FinanceScopeDto {
    projectId;
    responsibilityScopeId;
}
exports.FinanceScopeDto = FinanceScopeDto;
__decorate([
    (0, swagger_1.ApiProperty)({ format: "uuid" }),
    (0, class_validator_1.IsUUID)("all"),
    __metadata("design:type", String)
], FinanceScopeDto.prototype, "projectId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ format: "uuid" }),
    (0, class_validator_1.IsUUID)("all"),
    __metadata("design:type", String)
], FinanceScopeDto.prototype, "responsibilityScopeId", void 0);
class FinanceKeyDto {
    idempotencyKey;
}
exports.FinanceKeyDto = FinanceKeyDto;
__decorate([
    (0, swagger_1.ApiProperty)({ format: "uuid" }),
    (0, class_validator_1.IsUUID)("all"),
    __metadata("design:type", String)
], FinanceKeyDto.prototype, "idempotencyKey", void 0);
class TariffCreateDto extends FinanceScopeDto {
    effectiveFrom;
    effectiveTo;
    baseKopecks;
    perStopKopecks;
    perWaitingMinuteKopecks;
    idempotencyKey;
}
exports.TariffCreateDto = TariffCreateDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Matches)(/^\d{4}-\d{2}-\d{2}$/),
    __metadata("design:type", String)
], TariffCreateDto.prototype, "effectiveFrom", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Matches)(/^\d{4}-\d{2}-\d{2}$/),
    __metadata("design:type", Object)
], TariffCreateDto.prototype, "effectiveTo", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ minimum: 0, maximum: 1000000000 }),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.Max)(1000000000),
    __metadata("design:type", Number)
], TariffCreateDto.prototype, "baseKopecks", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ minimum: 0, maximum: 1000000000 }),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.Max)(1000000000),
    __metadata("design:type", Number)
], TariffCreateDto.prototype, "perStopKopecks", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ minimum: 0, maximum: 1000000000 }),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.Max)(1000000000),
    __metadata("design:type", Number)
], TariffCreateDto.prototype, "perWaitingMinuteKopecks", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ format: "uuid" }),
    (0, class_validator_1.IsUUID)("all"),
    __metadata("design:type", String)
], TariffCreateDto.prototype, "idempotencyKey", void 0);
class RegistryPreviewDto extends FinanceScopeDto {
    csv;
}
exports.RegistryPreviewDto = RegistryPreviewDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: "UTF-8 CSV: trip_reference,amount_rub; up to 500 data rows", maxLength: 262144 }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(262144),
    __metadata("design:type", String)
], RegistryPreviewDto.prototype, "csv", void 0);
class RegistryCreateDto extends RegistryPreviewDto {
    idempotencyKey;
}
exports.RegistryCreateDto = RegistryCreateDto;
__decorate([
    (0, swagger_1.ApiProperty)({ format: "uuid" }),
    (0, class_validator_1.IsUUID)("all"),
    __metadata("design:type", String)
], RegistryCreateDto.prototype, "idempotencyKey", void 0);
class OneCAcknowledgeDto extends FinanceKeyDto {
    sourceSystem;
    sourceDocumentId;
}
exports.OneCAcknowledgeDto = OneCAcknowledgeDto;
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ["1C"] }),
    (0, class_validator_1.IsIn)(["1C"]),
    __metadata("design:type", String)
], OneCAcknowledgeDto.prototype, "sourceSystem", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ maxLength: 128 }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Matches)(/^[^\u0000-\u001f\u007f]{1,128}$/),
    __metadata("design:type", String)
], OneCAcknowledgeDto.prototype, "sourceDocumentId", void 0);
//# sourceMappingURL=finance.dto.js.map