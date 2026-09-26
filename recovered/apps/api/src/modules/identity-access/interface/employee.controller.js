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
exports.EmployeeController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
const employee_directory_service_1 = require("../application/employee-directory.service");
const auth_guard_1 = require("./auth.guard");
const current_actor_decorator_1 = require("./current-actor.decorator");
const employee_response_dto_1 = require("./employee-response.dto");
class EmployeeListDto {
    search;
    role;
    status = "all";
    cursor;
    limit = 30;
}
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ maxLength: 80 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(80),
    __metadata("design:type", String)
], EmployeeListDto.prototype, "search", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: ["driver", "dispatcher", "manager", "recruiter", "tender_specialist", "external_recruiter", "document_specialist", "mechanic", "access_admin", "auditor"] }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(["driver", "dispatcher", "manager", "recruiter", "tender_specialist", "external_recruiter", "document_specialist", "mechanic", "access_admin", "auditor"]),
    __metadata("design:type", String)
], EmployeeListDto.prototype, "role", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: ["all", "active", "inactive"], default: "all" }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(["all", "active", "inactive"]),
    __metadata("design:type", String)
], EmployeeListDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ format: "uuid" }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUUID)("all"),
    __metadata("design:type", String)
], EmployeeListDto.prototype, "cursor", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ default: 30, minimum: 1, maximum: 50 }),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(50),
    __metadata("design:type", Object)
], EmployeeListDto.prototype, "limit", void 0);
class CreateDemoEmployeeDto {
    idempotencyKey;
    role;
    scopeId;
    adaptationRequired;
}
__decorate([
    (0, swagger_1.ApiProperty)({ format: "uuid" }),
    (0, class_validator_1.IsUUID)("all"),
    __metadata("design:type", String)
], CreateDemoEmployeeDto.prototype, "idempotencyKey", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ["driver", "dispatcher", "manager", "recruiter", "tender_specialist", "document_specialist", "mechanic"] }),
    (0, class_validator_1.IsIn)(["driver", "dispatcher", "manager", "recruiter", "tender_specialist", "document_specialist", "mechanic"]),
    __metadata("design:type", String)
], CreateDemoEmployeeDto.prototype, "role", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ format: "uuid" }),
    (0, class_validator_1.IsUUID)("all"),
    __metadata("design:type", String)
], CreateDemoEmployeeDto.prototype, "scopeId", void 0);
class CreateExternalRecruiterDto {
    idempotencyKey;
    scopeId;
    displayName;
    adaptationRequired;
}
for (const dto of [CreateDemoEmployeeDto, CreateExternalRecruiterDto]) {
    __decorate([
        (0, swagger_1.ApiPropertyOptional)({ type: Boolean, default: false, description: "Require knowledge-base adaptation for a new internal employee; unavailable to drivers and external recruiters" }),
        (0, class_validator_1.ValidateIf)((_object, value) => value !== undefined),
        (0, class_validator_1.IsBoolean)(),
        __metadata("design:type", Boolean)
    ], dto.prototype, "adaptationRequired", void 0);
}
for (const key of ["idempotencyKey", "scopeId"]) {
    __decorate([(0, class_validator_1.IsUUID)("all"), __metadata("design:type", String)], CreateExternalRecruiterDto.prototype, key, void 0);
}
__decorate([(0, class_validator_1.IsString)(), (0, class_validator_1.MaxLength)(160),
    __metadata("design:type", String)], CreateExternalRecruiterDto.prototype, "displayName", void 0);
class AttachExternalScopeDto { userId; scopeId; }
for (const key of ["userId", "scopeId"]) {
    __decorate([(0, class_validator_1.IsUUID)("all"), __metadata("design:type", String)], AttachExternalScopeDto.prototype, key, void 0);
}
class InspectionPhotoPermissionDto { scopeId; enabled; }
__decorate([
    (0, swagger_1.ApiProperty)({ format: "uuid" }),
    (0, class_validator_1.IsUUID)("all"), __metadata("design:type", String)
], InspectionPhotoPermissionDto.prototype, "scopeId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: Boolean }),
    (0, class_validator_1.IsBoolean)(), __metadata("design:type", Boolean)
], InspectionPhotoPermissionDto.prototype, "enabled", void 0);
class CreatePlannerEmployeeDto { idempotencyKey; displayName; role; scopeId; personalDataVisible; }
for (const key of ["idempotencyKey", "scopeId"]) {
    __decorate([
        (0, swagger_1.ApiProperty)({ format: "uuid" }),
        (0, class_validator_1.IsUUID)("all"), __metadata("design:type", String)
    ], CreatePlannerEmployeeDto.prototype, key, void 0);
}
__decorate([
    (0, swagger_1.ApiProperty)({ minLength: 1, maxLength: 160 }),
    (0, class_validator_1.IsString)(), (0, class_validator_1.MinLength)(1), (0, class_validator_1.MaxLength)(160),
    __metadata("design:type", String)
], CreatePlannerEmployeeDto.prototype, "displayName", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ["dispatcher", "manager"] }),
    (0, class_validator_1.IsIn)(["dispatcher", "manager"]), __metadata("design:type", String)
], CreatePlannerEmployeeDto.prototype, "role", void 0);
class PlanningAccessGrantDto { scopeId; personalDataVisible; }
__decorate([
    (0, swagger_1.ApiProperty)({ format: "uuid" }),
    (0, class_validator_1.IsUUID)("all"), __metadata("design:type", String)
], PlanningAccessGrantDto.prototype, "scopeId", void 0);
for (const dto of [CreatePlannerEmployeeDto, PlanningAccessGrantDto]) {
    __decorate([
        (0, swagger_1.ApiProperty)({ type: Boolean, description: "Personal-data permission within this assigned area" }),
        (0, class_validator_1.IsBoolean)(), __metadata("design:type", Boolean)
    ], dto.prototype, "personalDataVisible", void 0);
}
class UpdatePlanningAccessDto { version; grants; }
__decorate([
    (0, swagger_1.ApiProperty)({ pattern: "^[0-9a-f]{64}$", description: "Version returned by GET planning-access" }),
    (0, class_validator_1.IsString)(), (0, class_validator_1.Matches)(/^[0-9a-f]{64}$/),
    __metadata("design:type", String)
], UpdatePlanningAccessDto.prototype, "version", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [PlanningAccessGrantDto], minItems: 1, maxItems: 100,
        description: "Complete replacement of assigned areas; omitted areas lose all access" }),
    (0, class_validator_1.IsArray)(), (0, class_validator_1.ArrayMinSize)(1), (0, class_validator_1.ArrayMaxSize)(100),
    (0, class_validator_1.ValidateNested)({ each: true }), (0, class_transformer_1.Type)(() => PlanningAccessGrantDto),
    __metadata("design:type", Array)
], UpdatePlanningAccessDto.prototype, "grants", void 0);
let EmployeeController = class EmployeeController {
    employees;
    constructor(employees) {
        this.employees = employees;
    }
    options(actor) { return this.employees.options(actor); }
    list(actor, query) { return this.employees.list(actor, query); }
    create(actor, input, request) {
        return this.employees.createDemo(actor, input, request.correlationId);
    }
    attachExternalScope(actor, input, request) {
        return this.employees.attachExternalScope(actor, input, request.correlationId);
    }
    createExternal(actor, input, request) {
        return this.employees.createExternal(actor, input, request.correlationId);
    }
    createTenderSpecialist(actor, input, request) {
        return this.employees.createTenderSpecialist(actor, input, request.correlationId);
    }
    createRecruiter(actor, input, request) {
        return this.employees.createRecruiter(actor, input, request.correlationId);
    }
    attachRecruiterScope(actor, input, request) {
        return this.employees.attachRecruiterScope(actor, input, request.correlationId);
    }
    setInspectionPhotoPermission(actor, employeeId, input, request) {
        return this.employees.setInspectionPhotoPermission(actor, employeeId, input, request.correlationId);
    }
    createPlanner(actor, input, request) {
        return this.employees.createPlanner(actor, input, request.correlationId);
    }
    planningAccess(actor, employeeId) {
        return this.employees.planningAccess(actor, employeeId);
    }
    updatePlanningAccess(actor, employeeId, input, request) {
        return this.employees.updatePlanningAccess(actor, employeeId, input, request.correlationId);
    }
};
exports.EmployeeController = EmployeeController;
__decorate([
    (0, common_1.Post)("planner"),
    (0, common_1.Header)("Cache-Control", "no-store"),
    (0, swagger_1.ApiCreatedResponse)({ type: employee_response_dto_1.EmployeeSummaryDto }),
    (0, swagger_1.ApiOperation)({ summary: "Create a named dispatcher or manager with an authorized area and explicit personal-data permission" }),
    __param(0, (0, current_actor_decorator_1.CurrentActor)()),
    __param(1, (0, common_1.Body)()), __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, CreatePlannerEmployeeDto, Object]),
    __metadata("design:returntype", void 0)
], EmployeeController.prototype, "createPlanner", null);
__decorate([
    (0, common_1.Get)(":employeeId/planning-access"),
    (0, common_1.Header)("Cache-Control", "no-store"),
    (0, swagger_1.ApiOkResponse)({ type: employee_response_dto_1.EmployeePlanningAccessDto }),
    (0, swagger_1.ApiOperation)({ summary: "Read versioned assigned areas and personal-data permissions for a managed dispatcher or manager" }),
    __param(0, (0, current_actor_decorator_1.CurrentActor)()),
    __param(1, (0, common_1.Param)("employeeId", new common_1.ParseUUIDPipe({ version: "all" }))),
    __metadata("design:type", Function), __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], EmployeeController.prototype, "planningAccess", null);
__decorate([
    (0, common_1.Put)(":employeeId/planning-access"),
    (0, common_1.Header)("Cache-Control", "no-store"),
    (0, swagger_1.ApiOkResponse)({ type: employee_response_dto_1.EmployeePlanningAccessDto }),
    (0, swagger_1.ApiConflictResponse)({ description: "Permissions changed since the editor was loaded" }),
    (0, swagger_1.ApiOperation)({ summary: "Replace assigned areas atomically while preserving unrelated permissions in retained areas" }),
    __param(0, (0, current_actor_decorator_1.CurrentActor)()),
    __param(1, (0, common_1.Param)("employeeId", new common_1.ParseUUIDPipe({ version: "all" }))),
    __param(2, (0, common_1.Body)()), __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function), __metadata("design:paramtypes", [Object, String, UpdatePlanningAccessDto, Object]),
    __metadata("design:returntype", void 0)
], EmployeeController.prototype, "updatePlanningAccess", null);
__decorate([
    (0, common_1.Patch)(":employeeId/inspection-photo-permission"),
    (0, common_1.Header)("Cache-Control", "no-store"),
    (0, swagger_1.ApiOkResponse)({ type: employee_response_dto_1.EmployeeSummaryDto }),
    (0, swagger_1.ApiOperation)({ summary: "Appoint or remove an explicit scoped chief-mechanic photo-deletion permission" }),
    __param(0, (0, current_actor_decorator_1.CurrentActor)()),
    __param(1, (0, common_1.Param)("employeeId", new common_1.ParseUUIDPipe({ version: "all" }))),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, InspectionPhotoPermissionDto, Object]),
    __metadata("design:returntype", void 0)
], EmployeeController.prototype, "setInspectionPhotoPermission", null);
__decorate([
    (0, common_1.Get)("options"),
    (0, swagger_1.ApiOkResponse)({ type: employee_response_dto_1.EmployeeDirectoryOptionsDto }),
    (0, swagger_1.ApiOperation)({ summary: "Permitted demo creation roles and named employee scopes; 1C directory is not connected" }),
    __param(0, (0, current_actor_decorator_1.CurrentActor)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], EmployeeController.prototype, "options", null);
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOkResponse)({ type: employee_response_dto_1.EmployeeDirectoryResponseDto }),
    (0, swagger_1.ApiOperation)({ summary: "List only fully manageable employee accounts; mask private display names before searching" }),
    __param(0, (0, current_actor_decorator_1.CurrentActor)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, EmployeeListDto]),
    __metadata("design:returntype", void 0)
], EmployeeController.prototype, "list", null);
__decorate([
    (0, common_1.Post)("demo"),
    (0, swagger_1.ApiCreatedResponse)({ type: employee_response_dto_1.EmployeeSummaryDto }),
    (0, swagger_1.ApiOperation)({ summary: "Create one synthetic employee with limited grants and an audited idempotent request" }),
    __param(0, (0, current_actor_decorator_1.CurrentActor)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, CreateDemoEmployeeDto, Object]),
    __metadata("design:returntype", void 0)
], EmployeeController.prototype, "create", null);
__decorate([
    (0, common_1.Post)("external"),
    (0, common_1.Header)("Cache-Control", "no-store"),
    (0, swagger_1.ApiCreatedResponse)({ type: employee_response_dto_1.EmployeeSummaryDto }),
    (0, swagger_1.ApiOperation)({ summary: "Create an external recruiter account; request access must be granted separately" }),
    __param(0, (0, current_actor_decorator_1.CurrentActor)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, CreateExternalRecruiterDto, Object]),
    __metadata("design:returntype", void 0)
], EmployeeController.prototype, "createExternal", null);
__decorate([
    (0, common_1.Post)("tender-specialist"),
    (0, common_1.Header)("Cache-Control", "no-store"),
    (0, swagger_1.ApiCreatedResponse)({ type: employee_response_dto_1.EmployeeSummaryDto }),
    (0, swagger_1.ApiOperation)({ summary: "Create a named tender specialist with one authorized scope and no finance or personal-data grants" }),
    __param(0, (0, current_actor_decorator_1.CurrentActor)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, CreateExternalRecruiterDto, Object]),
    __metadata("design:returntype", void 0)
], EmployeeController.prototype, "createTenderSpecialist", null);
__decorate([
    (0, common_1.Post)("recruiter"),
    (0, common_1.Header)("Cache-Control", "no-store"),
    (0, swagger_1.ApiCreatedResponse)({ type: employee_response_dto_1.EmployeeSummaryDto }),
    (0, swagger_1.ApiOperation)({ summary: "Create a named internal recruiter in an authorized personal-data scope without finance access" }),
    __param(0, (0, current_actor_decorator_1.CurrentActor)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, CreateExternalRecruiterDto, Object]),
    __metadata("design:returntype", void 0)
], EmployeeController.prototype, "createRecruiter", null);
__decorate([
    (0, common_1.Post)("recruiter-scope"),
    (0, common_1.Header)("Cache-Control", "no-store"),
    (0, swagger_1.ApiCreatedResponse)({ type: employee_response_dto_1.EmployeeSummaryDto }),
    (0, swagger_1.ApiOperation)({ summary: "Attach an authorized scope to a managed internal recruiter without changing their role or credentials" }),
    __param(0, (0, current_actor_decorator_1.CurrentActor)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, AttachExternalScopeDto, Object]),
    __metadata("design:returntype", void 0)
], EmployeeController.prototype, "attachRecruiterScope", null);
__decorate([
    (0, common_1.Post)("external-scope"),
    (0, common_1.Header)("Cache-Control", "no-store"),
    __param(0, (0, current_actor_decorator_1.CurrentActor)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, AttachExternalScopeDto, Object]),
    __metadata("design:returntype", void 0)
], EmployeeController.prototype, "attachExternalScope", null);
exports.EmployeeController = EmployeeController = __decorate([
    (0, swagger_1.ApiTags)("Employee directory"),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    (0, common_1.Controller)("access/employees"),
    __param(0, (0, common_1.Inject)(employee_directory_service_1.EmployeeDirectoryService)),
    __metadata("design:paramtypes", [employee_directory_service_1.EmployeeDirectoryService])
], EmployeeController);
//# sourceMappingURL=employee.controller.js.map
