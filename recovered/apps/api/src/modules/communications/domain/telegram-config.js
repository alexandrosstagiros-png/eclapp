"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TELEGRAM_WEBHOOK_CONFIG = void 0;
exports.readTelegramCommunicationsConfig = readTelegramCommunicationsConfig;
exports.readTelegramWebhookConfig = readTelegramWebhookConfig;
function readTelegramCommunicationsConfig(env = process.env) {
    const flag = env.TELEGRAM_COMMUNICATIONS_ENABLED;
    if (flag !== undefined && !["true", "false"].includes(flag))
        throw new Error("Invalid TELEGRAM_COMMUNICATIONS_ENABLED");
    const enabled = flag === "true";
    const botUsername = env.TELEGRAM_BOT_USERNAME || undefined;
    const botToken = env.TELEGRAM_BOT_TOKEN || undefined;
    const webhookSecret = env.TELEGRAM_WEBHOOK_SECRET || undefined;
    if (enabled) {
        if (!botUsername || !/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(botUsername) || !/bot$/i.test(botUsername))
            throw new Error("Invalid TELEGRAM_BOT_USERNAME");
        if (!botToken || !/^\d{5,16}:[A-Za-z0-9_-]{30,100}$/.test(botToken))
            throw new Error("Invalid TELEGRAM_BOT_TOKEN");
        if (!webhookSecret || !/^[A-Za-z0-9_-]{32,256}$/.test(webhookSecret))
            throw new Error("Invalid TELEGRAM_WEBHOOK_SECRET");
        if (webhookSecret === botToken)
            throw new Error("Webhook secret must be independent");
    }
    return { enabled, botUsername, webhookSecret, botToken };
}
exports.TELEGRAM_WEBHOOK_CONFIG = Symbol("TELEGRAM_WEBHOOK_CONFIG");
function readTelegramWebhookConfig(env = process.env) {
    const communications = readTelegramCommunicationsConfig(env);
    const flag = env.TELEGRAM_ONBOARDING_ENABLED;
    if (flag !== undefined && !["true", "false"].includes(flag))
        throw new Error("Invalid TELEGRAM_ONBOARDING_ENABLED");
    const onboardingEnabled = flag === "true";
    let miniappUrl;
    if (onboardingEnabled) {
        if (!communications.botUsername || !/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(communications.botUsername) || !/bot$/i.test(communications.botUsername))
            throw new Error("Invalid TELEGRAM_BOT_USERNAME");
        if (communications.webhookSecret === env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_BOT_TOKEN)
            throw new Error("Webhook secret must be independent");
        if (!communications.webhookSecret || !/^[A-Za-z0-9_-]{32,256}$/.test(communications.webhookSecret))
            throw new Error("Invalid TELEGRAM_WEBHOOK_SECRET");
        const raw = env.TELEGRAM_MINIAPP_URL;
        if (!raw || raw.length > 2048 || /[\u0000-\u0020\u007f\\?#]/.test(raw))
            throw new Error("Invalid TELEGRAM_MINIAPP_URL");
        let url;
        try {
            url = new URL(raw);
        }
        catch {
            throw new Error("Invalid TELEGRAM_MINIAPP_URL");
        }
        const allowedOrigins = (env.ALLOWED_ORIGINS ?? "").split(",").filter(Boolean);
        if (url.protocol !== "https:" || url.username || url.password || /:\/\/[^/]*@/.test(raw) || !allowedOrigins.includes(url.origin))
            throw new Error("Invalid TELEGRAM_MINIAPP_URL");
        miniappUrl = url.href;
    }
    return Object.freeze({ communicationsEnabled: communications.enabled, onboardingEnabled, botUsername: communications.botUsername, webhookSecret: communications.webhookSecret, miniappUrl });
}
//# sourceMappingURL=telegram-config.js.map