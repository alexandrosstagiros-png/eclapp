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
exports.AuthService = void 0;
const node_crypto_1 = require("node:crypto");
const common_1 = require("@nestjs/common");
const config_1 = require("../../../platform/config");
const database_service_1 = require("../../../platform/database.service");
const audit_service_1 = require("../../audit/application/audit.service");
const access_policy_1 = require("../domain/access-policy");
const channel_auth_1 = require("../domain/channel-auth");
const identity_repository_1 = require("../infrastructure/identity.repository");
const telegram_auth_adapter_1 = require("../infrastructure/telegram-auth.adapter");
const max_auth_adapter_1 = require("../infrastructure/max-auth.adapter");
const password_auth = require("../infrastructure/password-auth");
const digest = (value) => (0, node_crypto_1.createHash)("sha256").update(value).digest("hex");
const denied = () => new common_1.UnauthorizedException("Authentication failed");
// Messenger login binds an existing approved account; it never assigns roles or department access.
const channelLoginRoles = [
    "driver", "dispatcher", "manager", "recruiter", "tender_specialist", "external_recruiter", "document_specialist", "mechanic", "access_admin", "auditor",
];
let AuthService = class AuthService {
    database;
    config;
    audit;
    repository;
    constructor(database, config, audit, repository) {
        this.database = database;
        this.config = config;
        this.audit = audit;
        this.repository = repository;
    }
    async demoProfiles() {
        if (!this.config.value.demoAuthEnabled)
            throw new common_1.NotFoundException();
        const result = await this.database.pool.query(`SELECT id, display_name AS "displayName", role FROM users
       WHERE id = ANY($1::uuid[]) AND active AND approved ORDER BY role, id`, [this.demoUserIds()]);
        return { enabled: true, profiles: result.rows };
    }
    async demoLogin(userId, correlationId) {
        if (!this.config.value.demoAuthEnabled)
            throw new common_1.NotFoundException();
        if (!this.demoUserIds().includes(userId))
            throw denied();
        return this.devLogin(userId, this.config.value.devAuthKey, correlationId);
    }
    demoUserIds() {
        // Fixed synthetic accounts only. Never enumerate or grant login as real employees.
        return [1, 2, 3, 4, 6].map((id) => `10000000-0000-4000-8000-00000000000${id}`);
    }
    async devLogin(userId, key, correlationId) {
        return this.loginAttempt("dev", correlationId, async () => {
            const config = this.config.value;
            if (!config.devAuthEnabled ||
                !["development", "test"].includes(config.nodeEnv))
                throw new common_1.NotFoundException();
            if (!key ||
                key.length > 512 ||
                !config.devAuthKey ||
                !(0, node_crypto_1.timingSafeEqual)(Buffer.from(digest(key), "hex"), Buffer.from(digest(config.devAuthKey), "hex")))
                throw denied();
            return this.database.transaction(async (client) => {
                await this.repository.lockUsers(client, [userId]);
                const user = await this.repository.user(client, userId);
                this.requireApproved(user);
                return this.issueSession(client, user, "dev", correlationId);
            });
        });
    }
    async telegramLogin(initData, invitationToken, correlationId) {
        return this.loginAttempt("telegram", correlationId, async () => {
            if (!this.config.value.telegramBotToken)
                throw new common_1.ServiceUnavailableException("Telegram authentication is not configured");
            const identity = new telegram_auth_adapter_1.TelegramAuthAdapter(this.config.value.telegramBotToken, this.config.value.telegramAuthMaxAgeSeconds).verify(initData);
            return this.database.transaction(async (client) => {
                // Insert and session issuance share one transaction: concurrent identical login cannot create two sessions.
                if (!(await this.repository.consumeReplay(client, identity.replayHash, identity.expiresAt)))
                    throw denied();
                let userId = await this.repository.channelUser(client, identity.providerUserId);
                const tokenHash = invitationToken ? digest(invitationToken) : undefined;
                if (!userId) {
                    if (!tokenHash)
                        throw denied();
                    const candidate = await this.repository.invitation(client, tokenHash);
                    if (!candidate ||
                        candidate.telegram_user_id !== identity.providerUserId)
                        throw denied();
                    userId = candidate.user_id;
                }
                await this.repository.lockUsers(client, [userId]);
                if (identity.expiresAt.getTime() <= Date.now())
                    throw denied();
                const user = await this.repository.user(client, userId);
                this.requireApproved(user);
                if (!channelLoginRoles.includes(user.role))
                    throw denied();
                const binding = await this.repository.channelUser(client, identity.providerUserId);
                if (!binding) {
                    if (!tokenHash)
                        throw denied();
                    const invitation = await this.repository.invitation(client, tokenHash, true);
                    if (!invitation ||
                        invitation.user_id !== user.id ||
                        invitation.telegram_user_id !== identity.providerUserId)
                        throw denied();
                    if (!(await this.repository.bindChannel(client, user.id, identity.providerUserId)))
                        throw denied();
                    await this.repository.consumeInvitation(client, invitation.id);
                    await this.audit.append(client, {
                        actorId: user.id,
                        action: "access.channel_bound",
                        entityType: "user",
                        entityId: user.id,
                        channel: "telegram",
                        correlationId,
                        metadata: { provider: "telegram", invitationId: invitation.id },
                    });
                }
                else if (binding !== user.id)
                    throw denied();
                return this.issueSession(client, user, "telegram", correlationId);
            });
        });
    }
    async maxLogin(initData, invitationToken, correlationId) {
        return this.loginAttempt("max", correlationId, async () => {
            if (!this.config.value.maxBotToken)
                throw new common_1.ServiceUnavailableException("MAX authentication is not configured");
            const identity = new max_auth_adapter_1.MaxAuthAdapter(this.config.value.maxBotToken, this.config.value.maxAuthMaxAgeSeconds).verify(initData);
            return this.database.transaction(async (client) => {
                // Insert and session issuance share one transaction: concurrent identical login cannot create two sessions.
                if (!(await this.repository.consumeReplay(client, identity.replayHash, identity.expiresAt)))
                    throw denied();
                let userId = await this.repository.channelUser(client, identity.providerUserId, "max");
                const tokenHash = invitationToken ? digest(invitationToken) : undefined;
                if (!userId) {
                    if (!tokenHash)
                        throw denied();
                    const candidate = await this.repository.maxInvitation(client, tokenHash);
                    if (!candidate ||
                        candidate.max_user_id !== identity.providerUserId)
                        throw denied();
                    userId = candidate.user_id;
                }
                await this.repository.lockUsers(client, [userId]);
                if (identity.expiresAt.getTime() <= Date.now())
                    throw denied();
                const user = await this.repository.user(client, userId);
                this.requireApproved(user);
                if (!channelLoginRoles.includes(user.role) || !(await this.repository.grants(user.id, client)).length)
                    throw denied();
                const binding = await this.repository.channelUser(client, identity.providerUserId, "max");
                if (!binding) {
                    if (!tokenHash)
                        throw denied();
                    const invitation = await this.repository.maxInvitation(client, tokenHash, true);
                    if (!invitation ||
                        invitation.user_id !== user.id ||
                        invitation.max_user_id !== identity.providerUserId)
                        throw denied();
                    if (!(await this.repository.bindChannel(client, user.id, identity.providerUserId, "max")))
                        throw denied();
                    await this.repository.consumeMaxInvitation(client, invitation.id);
                    await this.audit.append(client, {
                        actorId: user.id,
                        action: "access.channel_bound",
                        entityType: "user",
                        entityId: user.id,
                        channel: "max",
                        correlationId,
                        metadata: { provider: "max", invitationId: invitation.id },
                    });
                }
                else if (binding !== user.id)
                    throw denied();
                return this.issueSession(client, user, "max", correlationId);
            });
        });
    }
    async passwordLogin(phoneInput, password, correlationId, rememberDevice = false, previousRefreshToken) {
        return this.loginAttempt("web", correlationId, async () => {
            if (!password_auth.boundedPassword(password)) throw denied();
            const phone = password_auth.normalizePhone(phoneInput);
            const phoneHash = digest(phone ?? "invalid-phone");
            await this.repository.prunePasswordAttempts();
            const session = await this.database.transaction(async (client) => {
                // All credential mutations acquire user locks before the phone-attempt row.
                // An account created after this lookup is deliberately rejected until retry.
                const userId = phone ? await this.repository.passwordUserId(client, phone) : undefined;
                if (userId) await this.repository.lockUsers(client, [userId]);
                let attempt = await this.repository.lockPasswordAttempt(client, phoneHash);
                if (attempt.blocked_until && attempt.blocked_until.getTime() > attempt.now.getTime()) return undefined;
                if (attempt.window_started_at.getTime() + 15 * 60_000 <= attempt.now.getTime())
                    attempt = await this.repository.clearPasswordFailures(client, phoneHash);
                const credential = userId ? await this.repository.passwordCredential(client, userId, phone) : undefined;
                const matches = await password_auth.verifyPassword(password, credential);
                const user = userId ? await this.repository.user(client, userId) : undefined;
                const allowed = matches && user?.active && user.approved && channelLoginRoles.includes(user.role) &&
                    (await this.repository.grants(user.id, client)).length > 0;
                if (!allowed) {
                    // Commit the failure counter; throwing here would roll it back.
                    await this.repository.recordPasswordFailure(client, phoneHash);
                    return undefined;
                }
                await this.repository.clearPasswordFailures(client, phoneHash);
                if (/^[A-Za-z0-9_-]{43}$/.test(previousRefreshToken ?? "")) {
                    const previous = await this.repository.rememberedToken(client, digest(previousRefreshToken));
                    if (previous?.user_id === user.id) await this.repository.revokeRememberedDevice(client, previous.id);
                }
                let device;
                let refreshToken;
                if (rememberDevice) {
                    refreshToken = (0, node_crypto_1.randomBytes)(32).toString("base64url");
                    const now = Date.now();
                    device = {
                        id: (0, node_crypto_1.randomUUID)(), userId: user.id, authVersion: user.auth_version,
                        expiresAt: new Date(now + this.config.value.rememberedDeviceTtlSeconds * 1000),
                        absoluteExpiresAt: new Date(now + this.config.value.rememberedDeviceAbsoluteTtlSeconds * 1000),
                        tokenHash: digest(refreshToken),
                    };
                    await this.repository.insertRememberedDevice(client, device);
                    await this.audit.append(client, { actorId: user.id, action: "auth.device_remembered", entityType: "remembered_device", entityId: device.id, channel: "web", correlationId });
                }
                const issued = await this.issueSession(client, user, "web", correlationId, device?.id);
                issued.rememberedDevice = Boolean(device);
                issued.rememberedUntil = device?.expiresAt.toISOString() ?? null;
                // The transport alone reads this non-enumerable property for Set-Cookie.
                // JSON responses, audit events and object logging never include it.
                if (device) Object.defineProperty(issued, "refreshToken", { value: refreshToken });
                return issued;
            });
            if (!session) throw denied();
            return session;
        });
    }
    async rememberedDeviceStatus(token) {
        if (!/^[A-Za-z0-9_-]{43}$/.test(token ?? "")) return { rememberedDevice: false, rememberedUntil: null };
        const current = await this.repository.rememberedToken(this.database.pool, digest(token));
        if (!current || current.consumed_at || current.revoked_at || current.expires_at <= current.now || current.absolute_expires_at <= current.now)
            return { rememberedDevice: false, rememberedUntil: null };
        const user = await this.repository.user(this.database.pool, current.user_id);
        const allowed = user?.active && user.approved && user.auth_version === current.auth_version && channelLoginRoles.includes(user.role) && (await this.repository.grants(user.id)).length > 0;
        return { rememberedDevice: Boolean(allowed), rememberedUntil: allowed ? current.expires_at.toISOString() : null };
    }
    async refreshRemembered(token, correlationId) {
        if (!/^[A-Za-z0-9_-]{43}$/.test(token ?? "")) throw denied();
        const tokenHash = digest(token);
        const result = await this.database.transaction(async client => {
            const candidate = await this.repository.rememberedToken(client, tokenHash);
            if (!candidate) return { denied: true };
            // Password reset, revocation and refresh always lock the user first.
            await this.repository.lockUsers(client, [candidate.user_id]);
            const current = await this.repository.rememberedToken(client, tokenHash, true);
            if (!current || current.revoked_at || current.expires_at <= current.now || current.absolute_expires_at <= current.now) return { denied: true };
            const user = await this.repository.user(client, current.user_id);
            const allowed = user?.active && user.approved && user.auth_version === current.auth_version && channelLoginRoles.includes(user.role) && (await this.repository.grants(user.id, client)).length > 0;
            if (!allowed) {
                await this.repository.revokeRememberedDevice(client, current.id);
                return { denied: true };
            }
            if (current.consumed_at) {
                if (current.now.getTime() - current.consumed_at.getTime() <= this.config.value.rememberedDeviceRotationGraceSeconds * 1000) return { concurrent: true };
                // Commit revocation before returning 401: throwing in this transaction
                // would roll back replay protection. Replays never yield a new secret.
                await this.repository.revokeRememberedDevice(client, current.id);
                await this.audit.append(client, { actorId: user.id, action: "auth.device_replay_rejected", entityType: "remembered_device", entityId: current.id, channel: "web", correlationId });
                return { denied: true };
            }
            const refreshToken = (0, node_crypto_1.randomBytes)(32).toString("base64url");
            const expiresAt = new Date(Math.min(current.now.getTime() + this.config.value.rememberedDeviceTtlSeconds * 1000, current.absolute_expires_at.getTime()));
            await this.repository.rotateRememberedToken(client, current, digest(refreshToken), expiresAt);
            const session = await this.issueSession(client, user, "web", correlationId, current.id);
            session.rememberedDevice = true;
            session.rememberedUntil = expiresAt.toISOString();
            Object.defineProperty(session, "refreshToken", { value: refreshToken });
            return { session };
        });
        if (result.concurrent) throw new common_1.ConflictException("Refresh already completed; retry with the current cookie");
        if (!result.session) throw denied();
        return result.session;
    }
    async logoutRemembered(token, correlationId) {
        if (!/^[A-Za-z0-9_-]{43}$/.test(token ?? "")) return;
        await this.database.transaction(async client => {
            const candidate = await this.repository.rememberedToken(client, digest(token));
            if (!candidate) return;
            await this.repository.lockUsers(client, [candidate.user_id]);
            const current = await this.repository.rememberedToken(client, digest(token), true);
            if (!current || current.revoked_at) return;
            await this.repository.revokeRememberedDevice(client, current.id);
            await this.audit.append(client, { actorId: current.user_id, action: "auth.device_logout", entityType: "remembered_device", entityId: current.id, channel: "web", correlationId });
        });
    }
    async logoutCredentials(accessToken, refreshToken, correlationId) {
        if (accessToken) {
            let actor;
            try { actor = await this.authenticate(accessToken); }
            catch (error) { if (!(error instanceof common_1.UnauthorizedException)) throw error; }
            if (actor) {
                try { await this.logout(actor, correlationId); }
                catch (error) { if (!(error instanceof common_1.UnauthorizedException)) throw error; }
            }
        }
        await this.logoutRemembered(refreshToken, correlationId);
        return { ok: true };
    }
    async issuePassword(actor, userId, phoneInput, correlationId) {
        const phone = password_auth.normalizePhone(phoneInput);
        if (!phone) throw new common_1.BadRequestException("Invalid phone number");
        try {
            return await this.database.transaction(async (client) => {
                const { current, target } = await this.requireAccessAdministrator(client, actor, userId);
                if (!channelLoginRoles.includes(target.role) || !target.active || !target.approved)
                    throw new common_1.ForbiddenException("Approved active user required");
                const owner = await this.repository.passwordUserId(client, phone);
                if (owner && owner !== userId) throw new common_1.ConflictException("Phone number is already assigned");
                const previous = await this.repository.passwordForUser(client, userId);
                const password = password_auth.generatePassword();
                const credential = await password_auth.hashPassword(password);
                await this.repository.savePassword(client, { ...credential, userId, phone, createdBy: current.id });
                await this.repository.invalidateUserSessions(client, userId);
                await this.repository.clearPasswordPhones(client, [...new Set([phone, previous?.phone].filter(Boolean).map(digest))]);
                await this.audit.append(client, {
                    actorId: current.id,
                    action: previous ? "access.password_reset" : "access.password_issued",
                    entityType: "user", entityId: userId, channel: current.channel, correlationId,
                    metadata: { method: "password" },
                });
                return { userId, phone, password, issuedAt: new Date().toISOString() };
            });
        } catch (error) {
            if (error?.code === "23505") throw new common_1.ConflictException("Phone number is already assigned");
            throw error;
        }
    }
    async authenticate(token) {
        if (!/^[A-Za-z0-9_-]{43}$/.test(token))
            throw denied();
        const actor = await this.repository.actorByToken(digest(token));
        if (!actor || !this.channelAllowed(actor.channel) ||
            (actor.impersonation && !this.channelAllowed(actor.administratorChannel)))
            throw denied();
        return actor;
    }
    async impersonate(actor, userId, correlationId) {
        if (actor.impersonation || actor.role !== "access_admin" || actor.id === userId)
            throw new common_1.ForbiddenException("Administrator session required; self and nested impersonation are not permitted");
        return this.database.transaction(async client => {
            const { current, target } = await this.requireAccessAdministrator(client, actor, userId);
            if (current.id === target.id || !target.active || !target.approved || !channelLoginRoles.includes(target.role))
                throw new common_1.ForbiddenException("Approved active user required");
            const expiresAt = new Date(Math.min(Date.now() + 30 * 60_000,
                Date.now() + this.config.value.sessionTtlSeconds * 1000, current.expiresAt.getTime()));
            if (expiresAt.getTime() <= Date.now()) throw denied();
            const accessToken = (0, node_crypto_1.randomBytes)(32).toString("base64url");
            const sessionId = (0, node_crypto_1.randomUUID)();
            await this.repository.insertSession(client, {
                id: sessionId, userId: target.id, tokenHash: digest(accessToken), authVersion: target.auth_version,
                channel: "web", expiresAt, parentSessionId: current.sessionId,
            });
            const impersonated = await this.repository.actorBySession(client, sessionId);
            if (!impersonated) throw denied();
            await this.audit.append(client, {
                actorId: current.id, action: "auth.impersonation_started", entityType: "session",
                entityId: sessionId, channel: current.channel, correlationId,
                metadata: { impersonation: { ...impersonated.impersonation, targetUserId: target.id, sessionId } },
            });
            return { accessToken, expiresAt: expiresAt.toISOString(), actor: impersonated };
        });
    }
    async stopImpersonation(actor, correlationId) {
        if (!actor.impersonation)
            throw new common_1.ForbiddenException("Impersonation session required");
        return this.database.transaction(async client => {
            await this.repository.lockUsers(client, [actor.id, actor.impersonation.administratorId]);
            const current = await this.requireCurrentActor(client, actor);
            await this.repository.revokeSession(client, current.sessionId);
            await this.audit.append(client, {
                actorId: current.impersonation.administratorId, action: "auth.impersonation_stopped", entityType: "session",
                entityId: current.sessionId, channel: current.channel, correlationId,
                metadata: { impersonation: { ...current.impersonation, targetUserId: current.id, sessionId: current.sessionId } },
            });
            return { ok: true };
        });
    }
    async logout(actor, correlationId) {
        return this.database.transaction(async (client) => {
            await this.repository.lockUsers(client, [actor.id]);
            const current = await this.requireCurrentActor(client, actor);
            if (current.rememberedDeviceId) await this.repository.revokeRememberedDevice(client, current.rememberedDeviceId);
            await this.repository.revokeSession(client, current.sessionId);
            await this.audit.append(client, {
                actorId: current.id,
                action: "auth.logout",
                entityType: "session",
                entityId: current.sessionId,
                channel: current.channel,
                correlationId,
            });
            return { ok: true };
        });
    }
    async createInvitation(actor, userId, telegramUserId, correlationId) {
        if (!/^[1-9]\d{0,15}$/.test(telegramUserId) ||
            Number(telegramUserId) > 2 ** 52 - 1) {
            throw new common_1.BadRequestException("Invalid Telegram user ID");
        }
        return this.database.transaction(async (client) => {
            const { current, target } = await this.requireAccessAdministrator(client, actor, userId);
            if (!channelLoginRoles.includes(target.role) || !target.active || !target.approved)
                throw new common_1.ForbiddenException("Approved active user required");
            if ((await this.repository.channelForUser(client, userId)) ||
                (await this.repository.channelUser(client, telegramUserId)))
                throw new common_1.ForbiddenException("Channel already bound");
            const token = (0, node_crypto_1.randomBytes)(32).toString("base64url");
            const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1_000);
            const invitationId = (0, node_crypto_1.randomUUID)();
            await this.repository.invalidateInvitations(client, userId);
            await this.repository.insertInvitation(client, {
                id: invitationId,
                userId,
                telegramUserId,
                tokenHash: digest(token),
                expiresAt,
                createdBy: current.id,
            });
            await this.audit.append(client, {
                actorId: current.id,
                action: "access.invitation_created",
                entityType: "user",
                entityId: userId,
                channel: current.channel,
                correlationId,
                metadata: { invitationId, provider: "telegram" },
            });
            return {
                invitationToken: token,
                expiresAt: expiresAt.toISOString(),
                userId,
            };
        });
    }
    async createMaxInvitation(actor, userId, maxUserId, correlationId) {
        if (!/^[1-9]\d{0,15}$/.test(maxUserId) ||
            !Number.isSafeInteger(Number(maxUserId))) {
            throw new common_1.BadRequestException("Invalid MAX user ID");
        }
        return this.database.transaction(async (client) => {
            const { current, target } = await this.requireAccessAdministrator(client, actor, userId);
            if (!channelLoginRoles.includes(target.role) || !target.active || !target.approved)
                throw new common_1.ForbiddenException("Approved active user required");
            if ((await this.repository.channelForUser(client, userId, "max")) ||
                (await this.repository.channelUser(client, maxUserId, "max")))
                throw new common_1.ForbiddenException("Channel already bound");
            const token = (0, node_crypto_1.randomBytes)(32).toString("base64url");
            const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1_000);
            const invitationId = (0, node_crypto_1.randomUUID)();
            await this.repository.invalidateMaxInvitations(client, userId);
            await this.repository.insertMaxInvitation(client, {
                id: invitationId,
                userId,
                maxUserId,
                tokenHash: digest(token),
                expiresAt,
                createdBy: current.id,
            });
            await this.audit.append(client, {
                actorId: current.id,
                action: "access.invitation_created",
                entityType: "user",
                entityId: userId,
                channel: current.channel,
                correlationId,
                metadata: { invitationId, provider: "max" },
            });
            return {
                invitationToken: token,
                expiresAt: expiresAt.toISOString(),
                userId,
            };
        });
    }
    async revokeUser(actor, userId, reasonCode, correlationId) {
        return this.database.transaction(async (client) => {
            const { current } = await this.requireAccessAdministrator(client, actor, userId);
            if (current.id === userId)
                throw new common_1.ForbiddenException("Self-revocation is not permitted");
            await this.repository.revokeUser(client, userId);
            await this.audit.append(client, {
                actorId: current.id,
                action: "access.user_revoked",
                entityType: "user",
                entityId: userId,
                channel: current.channel,
                correlationId,
                metadata: { reasonCode },
            });
            return { ok: true };
        });
    }
    async requireAccessAdministrator(client, actor, userId) {
        if (actor.impersonation)
            throw new common_1.ForbiddenException("Access management is unavailable during impersonation");
        await this.repository.lockUsers(client, [actor.id, userId]);
        const current = await this.requireCurrentActor(client, actor);
        const target = await this.repository.user(client, userId);
        if (!target ||
            !(0, access_policy_1.mayManageAccess)(current, await this.repository.grants(userId, client))) {
            throw new common_1.ForbiddenException("Access management is outside the permitted scope");
        }
        return { current, target };
    }
    async requireCurrentActor(client, actor) {
        const current = await this.repository.actorBySession(client, actor.sessionId);
        if (!current ||
            current.id !== actor.id ||
            current.authVersion !== actor.authVersion ||
            !this.channelAllowed(current.channel) ||
            (current.impersonation && !this.channelAllowed(current.administratorChannel)))
            throw denied();
        return current;
    }
    channelAllowed(channel) {
        if (channel === "max")
            return Boolean(this.config.value.maxBotToken);
        return (channel !== "dev" ||
            (this.config.value.devAuthEnabled &&
                ["development", "test"].includes(this.config.value.nodeEnv)));
    }
    requireApproved(user) {
        if (!user?.active || !user.approved)
            throw denied();
    }
    async issueSession(client, user, channel, correlationId, rememberedDeviceId) {
        const accessToken = (0, node_crypto_1.randomBytes)(32).toString("base64url");
        const sessionId = (0, node_crypto_1.randomUUID)();
        const expiresAt = new Date(Date.now() + this.config.value.sessionTtlSeconds * 1_000);
        await this.repository.insertSession(client, {
            id: sessionId,
            userId: user.id,
            tokenHash: digest(accessToken),
            authVersion: user.auth_version,
            expiresAt,
            channel,
            rememberedDeviceId,
        });
        const actor = {
            id: user.id,
            displayName: user.display_name,
            role: user.role,
            authVersion: user.auth_version,
            sessionId,
            channel,
            grants: await this.repository.grants(user.id, client),
        };
        await this.audit.append(client, {
            actorId: user.id,
            action: "auth.login_succeeded",
            entityType: "session",
            entityId: sessionId,
            channel,
            correlationId,
        });
        return { accessToken, expiresAt: expiresAt.toISOString(), actor };
    }
    async loginAttempt(channel, correlationId, attempt) {
        try {
            return await attempt();
        }
        catch (error) {
            // Business work has finished; password failure counters are committed separately. Never persist credentials or supplied identities.
            await this.database.transaction((client) => this.audit.append(client, {
                action: "auth.login_failed",
                entityType: "authentication",
                channel,
                correlationId,
                metadata: {
                    reasonCode: error instanceof common_1.ServiceUnavailableException
                        ? "channel_unavailable"
                        : "credentials_rejected",
                },
            }));
            if (error instanceof channel_auth_1.ChannelAuthError)
                throw denied();
            throw error;
        }
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_service_1.DatabaseService)),
    __param(1, (0, common_1.Inject)(config_1.ConfigService)),
    __param(2, (0, common_1.Inject)(audit_service_1.AuditService)),
    __param(3, (0, common_1.Inject)(identity_repository_1.IdentityRepository)),
    __metadata("design:paramtypes", [database_service_1.DatabaseService,
        config_1.ConfigService,
        audit_service_1.AuditService,
        identity_repository_1.IdentityRepository])
], AuthService);
//# sourceMappingURL=auth.service.js.map
