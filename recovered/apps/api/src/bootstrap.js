"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApp = createApp;
require("reflect-metadata");
const node_crypto_1 = require("node:crypto");
const core_1 = require("@nestjs/core");
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const helmet_1 = __importDefault(require("helmet"));
const express_1 = require("express");
const app_module_1 = require("./app.module");
const config_1 = require("./platform/config");
const database_service_1 = require("./platform/database.service");
const error_filter_1 = require("./platform/error.filter");
const { auditContext } = require("./platform/audit-context");
async function createApp() {
    (0, config_1.readConfig)();
    const app = await core_1.NestFactory.create(app_module_1.AppModule, {
        logger: false,
        abortOnError: false,
        bodyParser: false,
    });
    const config = app.get(config_1.ConfigService).value;
    // The local reverse proxy must replace all incoming forwarding headers.
    if (config.trustProxyLoopback)
        app.getHttpAdapter().getInstance().set("trust proxy", "127.0.0.1");
    app.use((req, res, next) => {
        if (req.method === 'PUT' && /^\/api\/v1\/profile\/?$/.test(req.path))
            return importBody(req, res, next);
        if (['POST', 'PUT'].includes(req.method) && /^\/api\/v1\/team\/(tasks|outcomes)(?:\/[a-f0-9-]+)?\/?$/i.test(req.path))
            return importBody(req, res, next);
        req.correlationId = (0, node_crypto_1.randomUUID)();
        res.setHeader("X-Correlation-Id", req.correlationId);
        res.setHeader("Cache-Control", "no-store");
        auditContext.run({ request: req }, next);
    });
    app.use((0, helmet_1.default)());
    const smallBody = (0, express_1.json)({ limit: "16kb" });
    // Telegram includes the quoted bot message in Reply updates as well as the new text.
    const telegramBody = (0, express_1.json)({ limit: "64kb" });
    const importBody = (0, express_1.json)({ limit: "512kb" });
    const calendarBody = (0, express_1.json)({ limit: "4mb" });
    const uploadBody = (0, express_1.json)({ limit: "14mb" });
    const teamMessageBody = (0, express_1.json)({ limit: "36mb" });
    const teamMessageEditBody = (0, express_1.json)({ limit: "64kb" });
    app.use((req, res, next) => {
        if (req.method === 'POST' && (/^\/api\/v1\/recruitment\/onboarding\/sessions\/[a-f0-9-]+\/photos\/?$/i.test(req.path) || /^\/api\/v1\/recruitment-onboarding\/upload\/?$/.test(req.path)))
            return uploadBody(req, res, next);
        if (/^\/api\/v1\/(?:recruitment\/onboarding|recruitment-onboarding)(?:\/|$)/.test(req.path))
            return importBody(req, res, next);
        if (/^\/api\/v1\/fleet-operations(?:\/|$)/.test(req.path))
            return importBody(req, res, next);
        if (/^\/api\/v1\/planning\/calendar\/?$/.test(req.path))
            return calendarBody(req, res, next);
        if (/^\/api\/v1\/planning(?:\/templates)?\/?$/.test(req.path))
            return importBody(req, res, next);
        if (/^\/api\/v1\/max\/downloads\/?$/.test(req.path))
            return uploadBody(req, res, next);
        if (req.method === 'POST' && /^\/api\/v1\/team\/messages\/?$/.test(req.path))
            return teamMessageBody(req, res, next);
        if (req.method === 'PUT' && /^\/api\/v1\/team\/messages\/[a-f0-9-]+\/?$/i.test(req.path))
            return teamMessageEditBody(req, res, next);
        if (req.method === 'POST' && /^\/api\/v1\/team\/articles\/import\/?$/.test(req.path))
            return uploadBody(req, res, next);
        if (/^\/api\/v1\/integrations\/telegram\/webhook\/?$/.test(req.path))
            return telegramBody(req, res, next);
        if (/^\/api\/v1\/workflow\/trips\/[a-f0-9-]+\/documents\/?$/i.test(req.path) || /^\/api\/v1\/inspections\/trips\/[a-f0-9-]+\/photos\/?$/i.test(req.path))
            return uploadBody(req, res, next);
        if (/^\/api\/v1\/inspections\/(templates|trips\/[a-f0-9-]+\/submissions)\/?$/i.test(req.path))
            return importBody(req, res, next);
        if (/^\/api\/v1\/(workflow\/import|finance\/registries)(\/|$)/.test(req.path) || /^\/api\/v1\/finance\/payroll\/(preview|confirm)\/?$/.test(req.path))
            return importBody(req, res, next);
        return smallBody(req, res, next);
    });
    app.enableCors({
        origin: config.allowedOrigins,
        methods: ["GET", "POST", "PUT"],
        allowedHeaders: ["Authorization", "Content-Type", "X-Dev-Auth-Key", "X-Session-Refresh"],
        credentials: true,
    });
    app.setGlobalPrefix("api/v1");
    app.useGlobalPipes(new common_1.ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        forbidUnknownValues: true,
    }));
    app.useGlobalFilters(new error_filter_1.SafeErrorFilter());
    app.enableShutdownHooks();
    const spec = new swagger_1.DocumentBuilder()
        .setTitle("Transport Operations · Demo MVP")
        .setVersion("1.0.0")
        .setDescription("Scoped operations, documents, reconciliation and staged 1C exchange. External connections require acceptance.")
        .addBearerAuth()
        .build();
    const document = swagger_1.SwaggerModule.createDocument(app, spec);
    if (config.nodeEnv !== "production")
        swagger_1.SwaggerModule.setup("api/docs", app, document, {
            jsonDocumentUrl: "api/openapi.json",
        });
    try {
        const role = await app.get(database_service_1.DatabaseService).pool
            .query(`SELECT rolsuper,rolcreaterole,rolcreatedb,rolbypassrls,
      has_table_privilege(current_user,'audit_events','UPDATE,DELETE,TRUNCATE') AS can_mutate_audit
      FROM pg_roles WHERE rolname=current_user`);
        const current = role.rows[0];
        if (!current ||
            current.rolsuper ||
            current.rolcreaterole ||
            current.rolcreatedb ||
            current.rolbypassrls ||
            current.can_mutate_audit)
            throw new Error("Unsafe runtime database privileges");
        await app.init();
        return { app, document };
    }
    catch (error) {
        await app.close();
        throw error;
    }
}
//# sourceMappingURL=bootstrap.js.map
