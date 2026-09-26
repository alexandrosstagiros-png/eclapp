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
exports.EmployeeDirectoryOptionsDto = exports.EmployeeDirectoryResponseDto = exports.EmployeeSummaryDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class EmployeeNamedReferenceDto {
    id;
    name;
}
__decorate([
    (0, swagger_1.ApiProperty)({ format: "uuid" }),
    __metadata("design:type", String)
], EmployeeNamedReferenceDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], EmployeeNamedReferenceDto.prototype, "name", void 0);
class EmployeeScopeDto {
    id;
    legalEntity;
    region;
    project;
    responsibilityScope;
    inspectionPhotoDelete;
    canManageInspectionPhotoDelete;
    personalDataVisible;
}
__decorate([
    (0, swagger_1.ApiProperty)({ type: Boolean, description: "Existing personal-data permission in this responsibility scope; not changed by chief-mechanic appointment" }),
    __metadata("design:type", Boolean)
], EmployeeScopeDto.prototype, "personalDataVisible", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: Boolean, description: "Explicit chief-mechanic permission in this responsibility scope" }),
    __metadata("design:type", Boolean)
], EmployeeScopeDto.prototype, "inspectionPhotoDelete", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ type: Boolean, description: "Whether this administrator can change the mechanic's photo-deletion permission" }),
    __metadata("design:type", Boolean)
], EmployeeScopeDto.prototype, "canManageInspectionPhotoDelete", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ format: "uuid", description: "Responsibility scope ID used when creating a demo profile" }),
    __metadata("design:type", String)
], EmployeeScopeDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: EmployeeNamedReferenceDto }),
    __metadata("design:type", EmployeeNamedReferenceDto)
], EmployeeScopeDto.prototype, "legalEntity", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: EmployeeNamedReferenceDto }),
    __metadata("design:type", EmployeeNamedReferenceDto)
], EmployeeScopeDto.prototype, "region", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: EmployeeNamedReferenceDto }),
    __metadata("design:type", EmployeeNamedReferenceDto)
], EmployeeScopeDto.prototype, "project", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: EmployeeNamedReferenceDto }),
    __metadata("design:type", EmployeeNamedReferenceDto)
], EmployeeScopeDto.prototype, "responsibilityScope", void 0);
class EmployeePlanningScopeDto { id; legalEntity; region; project; responsibilityScope; personalDataVisible; }
__decorate([
    (0, swagger_1.ApiProperty)({ format: "uuid" }), __metadata("design:type", String)
], EmployeePlanningScopeDto.prototype, "id", void 0);
for (const key of ["legalEntity", "region", "project", "responsibilityScope"]) {
    __decorate([
        (0, swagger_1.ApiProperty)({ type: EmployeeNamedReferenceDto }), __metadata("design:type", EmployeeNamedReferenceDto)
    ], EmployeePlanningScopeDto.prototype, key, void 0);
}
__decorate([
    (0, swagger_1.ApiProperty)({ type: Boolean, description: "Whether the administrator may grant personal-data access in this area" }),
    __metadata("design:type", Boolean)
], EmployeePlanningScopeDto.prototype, "personalDataVisible", void 0);
class EmployeePlanningGrantDto { scopeId; personalDataVisible; }
__decorate([
    (0, swagger_1.ApiProperty)({ format: "uuid" }), __metadata("design:type", String)
], EmployeePlanningGrantDto.prototype, "scopeId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: Boolean }), __metadata("design:type", Boolean)
], EmployeePlanningGrantDto.prototype, "personalDataVisible", void 0);
class EmployeePlanningAccessDto { employeeId; version; grants; scopes; }
exports.EmployeePlanningAccessDto = EmployeePlanningAccessDto;
__decorate([
    (0, swagger_1.ApiProperty)({ format: "uuid" }), __metadata("design:type", String)
], EmployeePlanningAccessDto.prototype, "employeeId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ pattern: "^[0-9a-f]{64}$", description: "Opaque version of the complete current grant state" }),
    __metadata("design:type", String)
], EmployeePlanningAccessDto.prototype, "version", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [EmployeePlanningGrantDto] }), __metadata("design:type", Array)
], EmployeePlanningAccessDto.prototype, "grants", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [EmployeePlanningScopeDto] }), __metadata("design:type", Array)
], EmployeePlanningAccessDto.prototype, "scopes", void 0);
class EmployeeSummaryDto {
    id;
    employeeNumber;
    displayName;
    displayNameMasked;
    role;
    sourceKind;
    active;
    approved;
    adaptationRequired;
    adaptationScopeId;
    adaptationCompletedAt;
    telegramLinked;
    invitationPending;
    scopes;
    canInvite;
    maxLinked;
    maxInvitationPending;
    canInviteMax;
    phoneLoginEnabled;
    phoneMasked;
    canIssuePassword;
    canImpersonate;
    canRevoke;
}
exports.EmployeeSummaryDto = EmployeeSummaryDto;
__decorate([
    (0, swagger_1.ApiProperty)({ default: false }),
    __metadata("design:type", Boolean)
], EmployeeSummaryDto.prototype, "adaptationRequired", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: String, format: "uuid", nullable: true }),
    __metadata("design:type", Object)
], EmployeeSummaryDto.prototype, "adaptationScopeId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: String, format: "date-time", nullable: true }),
    __metadata("design:type", Object)
], EmployeeSummaryDto.prototype, "adaptationCompletedAt", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ format: "uuid" }),
    __metadata("design:type", String)
], EmployeeSummaryDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], EmployeeSummaryDto.prototype, "employeeNumber", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], EmployeeSummaryDto.prototype, "displayName", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Boolean)
], EmployeeSummaryDto.prototype, "displayNameMasked", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ["driver", "dispatcher", "manager", "recruiter", "tender_specialist", "external_recruiter", "document_specialist", "mechanic", "access_admin", "auditor"] }),
    __metadata("design:type", String)
], EmployeeSummaryDto.prototype, "role", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ["existing", "demo_seed", "demo_manual", "external_manual", "external_invitation", "internal_manual"] }),
    __metadata("design:type", String)
], EmployeeSummaryDto.prototype, "sourceKind", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Boolean)
], EmployeeSummaryDto.prototype, "active", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Boolean)
], EmployeeSummaryDto.prototype, "approved", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Boolean)
], EmployeeSummaryDto.prototype, "telegramLinked", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Boolean)
], EmployeeSummaryDto.prototype, "invitationPending", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [EmployeeScopeDto] }),
    __metadata("design:type", Array)
], EmployeeSummaryDto.prototype, "scopes", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Boolean)
], EmployeeSummaryDto.prototype, "canInvite", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Boolean)
], EmployeeSummaryDto.prototype, "canRevoke", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Boolean)
], EmployeeSummaryDto.prototype, "maxLinked", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Boolean)
], EmployeeSummaryDto.prototype, "maxInvitationPending", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Boolean)
], EmployeeSummaryDto.prototype, "canInviteMax", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Boolean)
], EmployeeSummaryDto.prototype, "phoneLoginEnabled", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Boolean)
], EmployeeSummaryDto.prototype, "canIssuePassword", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Boolean)
], EmployeeSummaryDto.prototype, "canImpersonate", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({type: String, nullable: true}),
    __metadata("design:type", Object)
], EmployeeSummaryDto.prototype, "phoneMasked", void 0);
class EmployeeDirectoryResponseDto {
    items;
    nextCursor;
}
exports.EmployeeDirectoryResponseDto = EmployeeDirectoryResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ type: [EmployeeSummaryDto] }),
    __metadata("design:type", Array)
], EmployeeDirectoryResponseDto.prototype, "items", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: String, format: "uuid", nullable: true }),
    __metadata("design:type", Object)
], EmployeeDirectoryResponseDto.prototype, "nextCursor", void 0);
class EmployeeDirectoryOptionsDto {
    demoCreationEnabled;
    tenderCreationEnabled;
    recruiterCreationEnabled;
    recruiterScopes;
    plannerCreationEnabled;
    plannerRoles;
    plannerScopes;
    roles;
    scopes;
    oneCStatus;
}
exports.EmployeeDirectoryOptionsDto = EmployeeDirectoryOptionsDto;
__decorate([
    (0, swagger_1.ApiProperty)({ type: Boolean }), __metadata("design:type", Boolean)
], EmployeeDirectoryOptionsDto.prototype, "plannerCreationEnabled", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ["dispatcher", "manager"], isArray: true }), __metadata("design:type", Array)
], EmployeeDirectoryOptionsDto.prototype, "plannerRoles", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [EmployeePlanningScopeDto] }), __metadata("design:type", Array)
], EmployeeDirectoryOptionsDto.prototype, "plannerScopes", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Boolean)
], EmployeeDirectoryOptionsDto.prototype, "demoCreationEnabled", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Boolean)
], EmployeeDirectoryOptionsDto.prototype, "tenderCreationEnabled", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Boolean)
], EmployeeDirectoryOptionsDto.prototype, "recruiterCreationEnabled", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [EmployeeScopeDto] }),
    __metadata("design:type", Array)
], EmployeeDirectoryOptionsDto.prototype, "recruiterScopes", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ["driver", "dispatcher", "manager", "recruiter", "tender_specialist", "document_specialist", "mechanic"], isArray: true }),
    __metadata("design:type", Array)
], EmployeeDirectoryOptionsDto.prototype, "roles", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [EmployeeScopeDto] }),
    __metadata("design:type", Array)
], EmployeeDirectoryOptionsDto.prototype, "scopes", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ["not_connected"] }),
    __metadata("design:type", String)
], EmployeeDirectoryOptionsDto.prototype, "oneCStatus", void 0);
//# sourceMappingURL=employee-response.dto.js.map
