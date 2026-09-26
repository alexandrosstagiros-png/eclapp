"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FinanceModule = void 0;
const common_1 = require("@nestjs/common");
const identity_access_module_1 = require("../identity-access/identity-access.module");
const finance_service_1 = require("./application/finance.service");
const one_c_worker_service_1 = require("./application/one-c-worker.service");
const finance_controller_1 = require("./interface/finance.controller");
const pricing_service_1 = require("./application/pricing.service");
const pricing_controller_1 = require("./interface/pricing.controller");
const payroll_service_1 = require("./application/payroll.service");
const payroll_repository_1 = require("./infra/payroll.repository");
const payroll_controller_1 = require("./interface/payroll.controller");
const deposit_service_1 = require("./application/deposit.service");
const deposit_controller_1 = require("./interface/deposit.controller");
let FinanceModule = class FinanceModule {
};
exports.FinanceModule = FinanceModule;
exports.FinanceModule = FinanceModule = __decorate([
    (0, common_1.Module)({ imports: [identity_access_module_1.IdentityAccessModule], controllers: [finance_controller_1.FinanceController, pricing_controller_1.PricingController, payroll_controller_1.PayrollController, deposit_controller_1.DepositController, deposit_controller_1.DriverDepositController], providers: [finance_service_1.FinanceService, pricing_service_1.PricingService, one_c_worker_service_1.OneCWorkerService, payroll_service_1.PayrollService, payroll_repository_1.PayrollRepository, deposit_service_1.DepositService] })
], FinanceModule);
//# sourceMappingURL=finance.module.js.map