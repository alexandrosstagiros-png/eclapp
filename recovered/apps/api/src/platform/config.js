"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigService = void 0;
exports.readConfig = readConfig;
const common_1 = require("@nestjs/common");
function readConfig(env = process.env) {
    const nodeEnv = env.NODE_ENV ?? "development";
    if (!["development", "test", "production"].includes(nodeEnv))
        throw new Error("Invalid NODE_ENV");
    if (env.DEV_AUTH_ENABLED && !["true", "false"].includes(env.DEV_AUTH_ENABLED))
        throw new Error("Invalid DEV_AUTH_ENABLED");
    const devAuthEnabled = env.DEV_AUTH_ENABLED === "true";
    if (env.DEMO_AUTH_ENABLED && !["true", "false"].includes(env.DEMO_AUTH_ENABLED))
        throw new Error("Invalid DEMO_AUTH_ENABLED");
    const demoAuthEnabled = env.DEMO_AUTH_ENABLED === "true";
    if (env.DEMO_EMPLOYEE_CREATION_ENABLED && !["true", "false"].includes(env.DEMO_EMPLOYEE_CREATION_ENABLED))
        throw new Error("Invalid DEMO_EMPLOYEE_CREATION_ENABLED");
    const demoEmployeeCreationEnabled = env.DEMO_EMPLOYEE_CREATION_ENABLED === "true";
    const host = env.HOST ?? "127.0.0.1";
    if (env.TRUST_PROXY_LOOPBACK && !["true", "false"].includes(env.TRUST_PROXY_LOOPBACK))
        throw new Error("Invalid TRUST_PROXY_LOOPBACK");
    const trustProxyLoopback = env.TRUST_PROXY_LOOPBACK === "true";
    if (trustProxyLoopback && host !== "127.0.0.1")
        throw new Error("Trusted local proxy requires loopback binding");
    if (demoAuthEnabled && (nodeEnv === "production" || !devAuthEnabled || host !== "127.0.0.1"))
        throw new Error("Demo login requires explicit development auth and loopback binding");
    if (nodeEnv === "production" && devAuthEnabled)
        throw new Error("Development authentication is forbidden in production");
    if (nodeEnv === "production" && env.DEV_AUTH_KEY)
        throw new Error("Remove DEV_AUTH_KEY in production");
    if (devAuthEnabled && (!env.DEV_AUTH_KEY || env.DEV_AUTH_KEY.length < 32))
        throw new Error("DEV_AUTH_KEY must contain at least 32 characters");
    if (!env.DATABASE_URL)
        throw new Error("DATABASE_URL is required");
    const databaseUrl = new URL(env.DATABASE_URL);
    if (!["postgres:", "postgresql:"].includes(databaseUrl.protocol))
        throw new Error("Invalid DATABASE_URL protocol");
    if (databaseUrl.username === "postgres")
        throw new Error("The API must use a restricted database role");
    const integer = (key, fallback, minimum, maximum) => {
        const raw = env[key] ?? String(fallback);
        if (!/^\d+$/.test(raw))
            throw new Error(`Invalid ${key}`);
        const value = Number(raw);
        if (value < minimum || value > maximum)
            throw new Error(`Invalid ${key}`);
        return value;
    };
    const allowedOrigins = (env.ALLOWED_ORIGINS ?? "").split(",").filter(Boolean);
    for (const origin of allowedOrigins) {
        const url = new URL(origin);
        if (url.origin !== origin ||
            (nodeEnv === "production" && url.protocol !== "https:"))
            throw new Error("Invalid ALLOWED_ORIGINS");
        if (demoAuthEnabled && !["localhost", "127.0.0.1"].includes(url.hostname))
            throw new Error("Demo origins must be loopback");
    }
    return {
        nodeEnv,
        devAuthEnabled,
        demoAuthEnabled,
        demoEmployeeCreationEnabled,
        devAuthKey: env.DEV_AUTH_KEY,
        databaseUrl: env.DATABASE_URL,
        telegramBotToken: env.TELEGRAM_BOT_TOKEN || undefined,
        maxBotToken: env.MAX_BOT_TOKEN || undefined,
        sessionTtlSeconds: integer("SESSION_TTL_SECONDS", 1800, 60, 3600),
        rememberedDeviceTtlSeconds: 30 * 24 * 60 * 60,
        rememberedDeviceAbsoluteTtlSeconds: 90 * 24 * 60 * 60,
        rememberedDeviceRotationGraceSeconds: 15,
        telegramAuthMaxAgeSeconds: integer("TELEGRAM_AUTH_MAX_AGE_SECONDS", 300, 30, 600),
        maxAuthMaxAgeSeconds: integer("MAX_AUTH_MAX_AGE_SECONDS", 300, 60, 600),
        port: integer("PORT", 3000, 1, 65535),
        host,
        trustProxyLoopback,
        allowedOrigins,
    };
}
let ConfigService = class ConfigService {
    value = readConfig();
};
exports.ConfigService = ConfigService;
exports.ConfigService = ConfigService = __decorate([
    (0, common_1.Injectable)()
], ConfigService);
//# sourceMappingURL=config.js.map
