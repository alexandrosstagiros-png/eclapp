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
exports.TripListResponseDto = exports.TripDetailDto = exports.TripSummaryDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class NamedReferenceDto {
    id;
    name;
}
__decorate([
    (0, swagger_1.ApiProperty)({ format: "uuid" }),
    __metadata("design:type", String)
], NamedReferenceDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], NamedReferenceDto.prototype, "name", void 0);
class TripDriverProgressDto {
    driver;
    acceptedAt;
    startedAt;
    completedAt;
}
__decorate([
    (0, swagger_1.ApiProperty)({ type: NamedReferenceDto, description: "Водитель; имя скрыто без доступа к персональным данным." }),
    __metadata("design:type", NamedReferenceDto)
], TripDriverProgressDto.prototype, "driver", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: String, format: "date-time", nullable: true }),
    __metadata("design:type", Object)
], TripDriverProgressDto.prototype, "acceptedAt", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: String, format: "date-time", nullable: true }),
    __metadata("design:type", Object)
], TripDriverProgressDto.prototype, "startedAt", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: String, format: "date-time", nullable: true }),
    __metadata("design:type", Object)
], TripDriverProgressDto.prototype, "completedAt", void 0);
class VehicleDto {
    label;
    bodyType;
    capacityKg;
    fleetType;
}
__decorate([
    (0, swagger_1.ApiProperty)({ description: "Внутренняя метка автомобиля." }),
    __metadata("design:type", String)
], VehicleDto.prototype, "label", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ["refrigerated", "box"] }),
    __metadata("design:type", String)
], VehicleDto.prototype, "bodyType", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: "integer", minimum: 1 }),
    __metadata("design:type", Number)
], VehicleDto.prototype, "capacityKg", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ["own", "subcontracted"] }),
    __metadata("design:type", String)
], VehicleDto.prototype, "fleetType", void 0);
class TripStopDto {
    sequence;
    label;
    plannedArrivalAt;
}
__decorate([
    (0, swagger_1.ApiProperty)({ type: "integer", minimum: 1 }),
    __metadata("design:type", Number)
], TripStopDto.prototype, "sequence", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: "Обозначение точки без персональных контактов." }),
    __metadata("design:type", String)
], TripStopDto.prototype, "label", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: String, format: "date-time", nullable: true }),
    __metadata("design:type", Object)
], TripStopDto.prototype, "plannedArrivalAt", void 0);
class TripSummaryDto {
    id;
    reference;
    businessDate;
    status;
    project;
    region;
    legalEntity;
    responsibilityScope;
    vehicle;
    routeSummary;
    driverProgress;
}
exports.TripSummaryDto = TripSummaryDto;
__decorate([
    (0, swagger_1.ApiProperty)({ format: "uuid" }),
    __metadata("design:type", String)
], TripSummaryDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], TripSummaryDto.prototype, "reference", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ format: "date", description: "Рабочая дата рейса в регионе." }),
    __metadata("design:type", String)
], TripSummaryDto.prototype, "businessDate", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ["assigned"] }),
    __metadata("design:type", String)
], TripSummaryDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: NamedReferenceDto }),
    __metadata("design:type", NamedReferenceDto)
], TripSummaryDto.prototype, "project", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: NamedReferenceDto }),
    __metadata("design:type", NamedReferenceDto)
], TripSummaryDto.prototype, "region", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: NamedReferenceDto }),
    __metadata("design:type", NamedReferenceDto)
], TripSummaryDto.prototype, "legalEntity", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: NamedReferenceDto }),
    __metadata("design:type", NamedReferenceDto)
], TripSummaryDto.prototype, "responsibilityScope", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: VehicleDto }),
    __metadata("design:type", VehicleDto)
], TripSummaryDto.prototype, "vehicle", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], TripSummaryDto.prototype, "routeSummary", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [TripDriverProgressDto] }),
    __metadata("design:type", Array)
], TripSummaryDto.prototype, "driverProgress", void 0);
class TripDetailDto extends TripSummaryDto {
    stops;
    version;
}
exports.TripDetailDto = TripDetailDto;
__decorate([
    (0, swagger_1.ApiProperty)({ type: [TripStopDto] }),
    __metadata("design:type", Array)
], TripDetailDto.prototype, "stops", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: "integer", minimum: 1 }),
    __metadata("design:type", Number)
], TripDetailDto.prototype, "version", void 0);
class TripListResponseDto {
    items;
    nextCursor;
}
exports.TripListResponseDto = TripListResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ type: [TripSummaryDto] }),
    __metadata("design:type", Array)
], TripListResponseDto.prototype, "items", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        type: String,
        nullable: true,
        description: "Курсор следующей страницы либо null.",
    }),
    __metadata("design:type", Object)
], TripListResponseDto.prototype, "nextCursor", void 0);
//# sourceMappingURL=trip-response.dto.js.map