"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.IdentityAccessModule = void 0;
const common_1 = require("@nestjs/common");
const auth_service_1 = require("./application/auth.service");
const identity_repository_1 = require("./infrastructure/identity.repository");
const auth_controller_1 = require("./interface/auth.controller");
const auth_guard_1 = require("./interface/auth.guard");
const employee_controller_1 = require("./interface/employee.controller");
const employee_directory_service_1 = require("./application/employee-directory.service");
const employee_repository_1 = require("./infrastructure/employee.repository");
let IdentityAccessModule = class IdentityAccessModule {
};
exports.IdentityAccessModule = IdentityAccessModule;
exports.IdentityAccessModule = IdentityAccessModule = __decorate([
    (0, common_1.Module)({
        controllers: [auth_controller_1.AuthController, auth_controller_1.IdentityController, auth_controller_1.AccessController, employee_controller_1.EmployeeController],
        providers: [identity_repository_1.IdentityRepository, auth_service_1.AuthService, auth_guard_1.AuthGuard, employee_repository_1.EmployeeRepository, employee_directory_service_1.EmployeeDirectoryService],
        exports: [auth_service_1.AuthService, auth_guard_1.AuthGuard, identity_repository_1.IdentityRepository],
    })
], IdentityAccessModule);
//# sourceMappingURL=identity-access.module.js.map