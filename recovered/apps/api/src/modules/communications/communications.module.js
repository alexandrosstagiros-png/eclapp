"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommunicationsModule = void 0;
const common_1 = require("@nestjs/common");
const identity_access_module_1 = require("../identity-access/identity-access.module");
const communications_service_1 = require("./application/communications.service");
const communications_repository_1 = require("./infra/communications.repository");
const communications_controller_1 = require("./interface/communications.controller");
const telegram_communications_service_1 = require("./application/telegram-communications.service");
const telegram_delivery_worker_1 = require("./infra/telegram-delivery.worker");
const telegram_webhook_controller_1 = require("./interface/telegram-webhook.controller");
const telegram_config_1 = require("./domain/telegram-config");
const { PhoneAutofillModule } = require("../phone-autofill/phone-autofill.module");
let CommunicationsModule = class CommunicationsModule {
};
exports.CommunicationsModule = CommunicationsModule;
exports.CommunicationsModule = CommunicationsModule = __decorate([
    (0, common_1.Module)({ imports: [identity_access_module_1.IdentityAccessModule, PhoneAutofillModule], controllers: [communications_controller_1.CommunicationsController, telegram_webhook_controller_1.TelegramWebhookController], providers: [
            communications_service_1.CommunicationsService, communications_repository_1.CommunicationsRepository, telegram_communications_service_1.TelegramCommunicationsService, telegram_delivery_worker_1.TelegramDeliveryWorker,
            { provide: telegram_config_1.TELEGRAM_WEBHOOK_CONFIG, useFactory: () => (0, telegram_config_1.readTelegramWebhookConfig)() },
        ] })
], CommunicationsModule);
//# sourceMappingURL=communications.module.js.map