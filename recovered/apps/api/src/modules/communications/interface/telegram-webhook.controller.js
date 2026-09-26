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
exports.TelegramWebhookController = void 0;
exports.telegramWebhookSecretMatches = telegramWebhookSecretMatches;
const node_crypto_1 = require("node:crypto");
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const throttler_1 = require("@nestjs/throttler");
const telegram_communications_service_1 = require("../application/telegram-communications.service");
const telegram_config_1 = require("../domain/telegram-config");
const telegram_onboarding_1 = require("../domain/telegram-onboarding");
const { PhoneAutofillService } = require("../../phone-autofill/phone-autofill.module");
function telegramWebhookSecretMatches(supplied, expected) {
    if (typeof supplied !== "string" || supplied.length > 256)
        return false;
    return (0, node_crypto_1.timingSafeEqual)((0, node_crypto_1.createHash)("sha256").update(supplied).digest(), (0, node_crypto_1.createHash)("sha256").update(expected).digest());
}
let TelegramWebhookController = class TelegramWebhookController {
    telegram;
    config;
    constructor(telegram, config, phoneAutofill) {
        this.phoneAutofill = phoneAutofill;
        this.telegram = telegram;
        this.config = config;
    }
    receive(secret, body, request) {
        const config = this.config;
        if (!config.onboardingEnabled && !config.communicationsEnabled)
            throw new common_1.NotFoundException();
        if (!telegramWebhookSecretMatches(secret, config.webhookSecret))
            throw new common_1.UnauthorizedException("Webhook authentication failed");
        if (this.phoneAutofill.captureTelegramContact(body)) return { ok: true };
        if (config.onboardingEnabled) {
            const senderId = (0, telegram_onboarding_1.parseTelegramOnboardingStart)(body, config.botUsername);
            if (senderId)
                return {
                    method: "sendMessage", chat_id: senderId,
                    text: "Для входа откройте приложение и введите номер телефона и пароль, выданный администратором.",
                    reply_markup: { inline_keyboard: [[{ text: "Открыть приложение", web_app: { url: config.miniappUrl } }]] },
                };
        }
        // A direct webhook answer has no delivery receipt and may repeat on Telegram retry.
        return config.communicationsEnabled ? this.telegram.receive(body, request.correlationId) : { ok: true };
    }
};
exports.TelegramWebhookController = TelegramWebhookController;
__decorate([
    (0, common_1.Post)("webhook"),
    (0, common_1.HttpCode)(200),
    (0, common_1.Header)("Cache-Control", "no-store"),
    (0, throttler_1.Throttle)({ default: { limit: 600, ttl: 60000 } }),
    __param(0, (0, common_1.Headers)("x-telegram-bot-api-secret-token")),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], TelegramWebhookController.prototype, "receive", null);
exports.TelegramWebhookController = TelegramWebhookController = __decorate([
    (0, swagger_1.ApiTags)("Telegram webhook"),
    (0, common_1.Controller)("integrations/telegram"),
    __param(0, (0, common_1.Inject)(telegram_communications_service_1.TelegramCommunicationsService)),
    __param(1, (0, common_1.Inject)(telegram_config_1.TELEGRAM_WEBHOOK_CONFIG)),
    __param(2, (0, common_1.Inject)(PhoneAutofillService)),
    __metadata("design:paramtypes", [telegram_communications_service_1.TelegramCommunicationsService, Object, PhoneAutofillService])
], TelegramWebhookController);
//# sourceMappingURL=telegram-webhook.controller.js.map