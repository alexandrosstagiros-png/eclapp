"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkflowModule = void 0;
const common_1 = require("@nestjs/common");
const identity_access_module_1 = require("../identity-access/identity-access.module");
const workflow_service_1 = require("./application/workflow.service");
const workflow_controller_1 = require("./interface/workflow.controller");
const workflow_repository_1 = require("./infra/workflow.repository");
let WorkflowModule = class WorkflowModule {
};
exports.WorkflowModule = WorkflowModule;
exports.WorkflowModule = WorkflowModule = __decorate([
    (0, common_1.Module)({
        imports: [identity_access_module_1.IdentityAccessModule],
        controllers: [workflow_controller_1.WorkflowController],
        providers: [workflow_service_1.WorkflowService, workflow_repository_1.WorkflowRepository],
    })
], WorkflowModule);
//# sourceMappingURL=workflow.module.js.map