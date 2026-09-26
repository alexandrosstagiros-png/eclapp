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
exports.IdentityRepository = void 0;
const common_1 = require("@nestjs/common");
const database_service_1 = require("../../../platform/database.service");
const { mayManageAccess } = require("../domain/access-policy");
let IdentityRepository = class IdentityRepository {
    database;
    constructor(database) {
        this.database = database;
    }
    async grants(userId, client) {
        const result = await (client ?? this.database.pool).query(`
      SELECT legal_entity_id AS "legalEntityId", region_id AS "regionId",
        project_id AS "projectId", responsibility_scope_id AS "responsibilityScopeId",
        finance_visible AS "financeVisible", personal_data_visible AS "personalDataVisible",
        inspection_photo_delete AS "inspectionPhotoDelete"
      FROM access_grants WHERE user_id = $1
      ORDER BY legal_entity_id, region_id, project_id, responsibility_scope_id`, [userId]);
        return result.rows;
    }
    async lockUsers(client, ids) {
        // Serialize identity/grant mutations and session revalidation in one order.
        // User IDs are immutable: KEY SHARE locks for references (mentions, chat
        // members, audit actors) must remain compatible with these locks, or an
        // unrelated reader waiting for a scope lock can deadlock its writer.
        await client.query("SELECT id FROM users WHERE id = ANY($1::uuid[]) ORDER BY id FOR NO KEY UPDATE", [ids]);
    }
    async user(client, id) {
        const result = await client.query("SELECT * FROM users WHERE id = $1", [id]);
        return result.rows[0];
    }
    async actorByToken(tokenHash) {
        return this.sessionActor("s.token_hash = $1", tokenHash);
    }
    async actorBySession(client, sessionId) {
        return this.sessionActor("s.id = $1", sessionId, client);
    }
    async sessionActor(predicate, value, client) {
        const result = await (client ?? this.database.pool).query(`
      SELECT u.id, u.display_name AS "displayName", u.role, u.auth_version AS "authVersion",
        s.id AS "sessionId", s.channel, s.remembered_device_id AS "rememberedDeviceId",
        s.expires_at AS "expiresAt", s.impersonation_parent_session_id AS "parentSessionId",
        p.user_id AS "administratorId", a.display_name AS "administratorDisplayName",
        p.channel AS "administratorChannel"
      FROM sessions s JOIN users u ON u.id = s.user_id
      LEFT JOIN sessions p ON p.id = s.impersonation_parent_session_id
      LEFT JOIN users a ON a.id = p.user_id
      WHERE ${predicate} AND s.revoked_at IS NULL AND s.expires_at > clock_timestamp()
        AND u.active AND u.approved AND s.auth_version = u.auth_version
        AND (s.impersonation_parent_session_id IS NULL OR (
          p.impersonation_parent_session_id IS NULL AND p.revoked_at IS NULL
          AND p.expires_at > clock_timestamp() AND s.expires_at <= p.expires_at
          AND a.active AND a.approved AND a.role = 'access_admin'
          AND p.auth_version = a.auth_version AND p.user_id <> s.user_id
        ))`, [value]);
        const row = result.rows[0];
        if (!row)
            return undefined;
        const { parentSessionId, administratorId, administratorDisplayName, administratorChannel, expiresAt, ...identity } = row;
        const actor = { ...identity, grants: await this.grants(row.id, client) };
        // Expiry and parent transport policy are private session validation data.
        Object.defineProperty(actor, "expiresAt", { value: expiresAt });
        if (parentSessionId) {
            const administrator = { role: "access_admin", grants: await this.grants(administratorId, client) };
            if (!mayManageAccess(administrator, actor.grants)) return undefined;
            actor.impersonation = { administratorId, administratorDisplayName, parentSessionId };
            Object.defineProperty(actor, "administratorChannel", { value: administratorChannel });
        }
        return actor;
    }
    async insertSession(client, session) {
        await client.query(`INSERT INTO sessions (id, user_id, token_hash, auth_version, expires_at, channel, remembered_device_id, impersonation_parent_session_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, [
            session.id,
            session.userId,
            session.tokenHash,
            session.authVersion,
            session.expiresAt,
            session.channel,
            session.rememberedDeviceId ?? null,
            session.parentSessionId ?? null,
        ]);
    }
    async rememberedToken(client, tokenHash, lock = false) {
        const result = await client.query(`SELECT d.*,t.token_hash,t.consumed_at,clock_timestamp() AS now
            FROM remembered_device_tokens t JOIN remembered_devices d ON d.id=t.device_id
            WHERE t.token_hash=$1 ${lock ? "FOR UPDATE OF d,t" : ""}`, [tokenHash]);
        return result.rows[0];
    }
    async insertRememberedDevice(client, device) {
        await client.query(`INSERT INTO remembered_devices(id,user_id,auth_version,expires_at,absolute_expires_at)
            VALUES($1,$2,$3,$4,$5)`, [device.id,device.userId,device.authVersion,device.expiresAt,device.absoluteExpiresAt]);
        await this.insertRememberedToken(client, device.id, device.tokenHash);
    }
    async insertRememberedToken(client, deviceId, tokenHash) {
        await client.query("INSERT INTO remembered_device_tokens(token_hash,device_id) VALUES($1,$2)", [tokenHash,deviceId]);
    }
    async rotateRememberedToken(client, current, tokenHash, expiresAt) {
        await client.query("UPDATE remembered_device_tokens SET consumed_at=clock_timestamp() WHERE token_hash=$1", [current.token_hash]);
        await this.insertRememberedToken(client, current.id, tokenHash);
        await client.query("UPDATE remembered_devices SET last_used_at=clock_timestamp(),expires_at=$2 WHERE id=$1", [current.id,expiresAt]);
    }
    async revokeRememberedDevice(client, id) {
        await client.query("UPDATE remembered_devices SET revoked_at=COALESCE(revoked_at,clock_timestamp()) WHERE id=$1", [id]);
        await client.query("UPDATE sessions SET revoked_at=COALESCE(revoked_at,clock_timestamp()) WHERE remembered_device_id=$1", [id]);
    }
    async revokeUserDevices(client, userId) {
        await client.query("UPDATE remembered_devices SET revoked_at=COALESCE(revoked_at,clock_timestamp()) WHERE user_id=$1", [userId]);
    }
    async consumeReplay(client, replayHash, expiresAt) {
        const result = await client.query(`INSERT INTO auth_replays (replay_hash, expires_at) VALUES ($1, $2)
      ON CONFLICT (replay_hash) DO NOTHING RETURNING replay_hash`, [replayHash, expiresAt]);
        return result.rowCount === 1;
    }
    async channelUser(client, providerUserId, provider = "telegram") {
        const result = await client.query(`
      SELECT user_id FROM channel_identities WHERE provider = $2 AND provider_user_id = $1`, [providerUserId, provider]);
        return result.rows[0]?.user_id;
    }
    async channelForUser(client, userId, provider = "telegram") {
        const result = await client.query(`
      SELECT provider_user_id FROM channel_identities WHERE provider = $2 AND user_id = $1`, [userId, provider]);
        return result.rows[0]?.provider_user_id;
    }
    async invitation(client, tokenHash, lock = false) {
        const result = await client.query(`
      SELECT id, user_id, telegram_user_id FROM invitations
      WHERE token_hash = $1 AND consumed_at IS NULL AND expires_at > clock_timestamp()
      ${lock ? "FOR UPDATE" : ""}`, [tokenHash]);
        return result.rows[0];
    }
    async maxInvitation(client, tokenHash, lock = false) {
        const result = await client.query(`
      SELECT id, user_id, max_user_id FROM max_invitations
      WHERE token_hash = $1 AND consumed_at IS NULL AND expires_at > clock_timestamp()
      ${lock ? "FOR UPDATE" : ""}`, [tokenHash]);
        return result.rows[0];
    }
    async bindChannel(client, userId, providerUserId, provider = "telegram") {
        const result = await client.query(`INSERT INTO channel_identities (provider, provider_user_id, user_id)
      VALUES ($3, $1, $2) ON CONFLICT DO NOTHING RETURNING user_id`, [providerUserId, userId, provider]);
        return result.rowCount === 1;
    }
    async consumeInvitation(client, invitationId) {
        await client.query("UPDATE invitations SET consumed_at = clock_timestamp() WHERE id = $1", [invitationId]);
    }
    async invalidateInvitations(client, userId) {
        await client.query(`UPDATE invitations SET expires_at = LEAST(expires_at, clock_timestamp())
      WHERE user_id = $1 AND consumed_at IS NULL`, [userId]);
    }
    async insertInvitation(client, invitation) {
        await client.query(`INSERT INTO invitations
      (id, user_id, telegram_user_id, token_hash, expires_at, created_by) VALUES ($1, $2, $3, $4, $5, $6)`, [
            invitation.id,
            invitation.userId,
            invitation.telegramUserId,
            invitation.tokenHash,
            invitation.expiresAt,
            invitation.createdBy,
        ]);
    }
    async consumeMaxInvitation(client, invitationId) {
        await client.query("UPDATE max_invitations SET consumed_at = clock_timestamp() WHERE id = $1", [invitationId]);
    }
    async invalidateMaxInvitations(client, userId) {
        await client.query(`UPDATE max_invitations SET expires_at = LEAST(expires_at, clock_timestamp())
      WHERE user_id = $1 AND consumed_at IS NULL`, [userId]);
    }
    async insertMaxInvitation(client, invitation) {
        await client.query(`INSERT INTO max_invitations
      (id, user_id, max_user_id, token_hash, expires_at, created_by) VALUES ($1, $2, $3, $4, $5, $6)`, [
            invitation.id,
            invitation.userId,
            invitation.maxUserId,
            invitation.tokenHash,
            invitation.expiresAt,
            invitation.createdBy,
        ]);
    }
    async passwordUserId(client, phone) {
        const result = await client.query("SELECT user_id FROM phone_credentials WHERE phone = $1", [phone]);
        return result.rows[0]?.user_id;
    }
    async passwordCredential(client, userId, phone) {
        const result = await client.query("SELECT * FROM phone_credentials WHERE user_id = $1 AND phone = $2", [userId, phone]);
        return result.rows[0];
    }
    async passwordForUser(client, userId) {
        const result = await client.query("SELECT phone FROM phone_credentials WHERE user_id = $1", [userId]);
        return result.rows[0];
    }
    async prunePasswordAttempts() {
        // Independent autocommit statement: never acquire unrelated phone locks while
        // holding user locks. Retain every active window and prune at most 100 old rows.
        await this.database.pool.query(`DELETE FROM phone_login_attempts WHERE phone_hash IN (
            SELECT phone_hash FROM phone_login_attempts
            WHERE window_started_at < clock_timestamp() - interval '24 hours'
              AND (blocked_until IS NULL OR blocked_until <= clock_timestamp())
            ORDER BY window_started_at, phone_hash LIMIT 100 FOR UPDATE SKIP LOCKED
        )`);
    }
    async lockPasswordAttempt(client, phoneHash) {
        await client.query(`INSERT INTO phone_login_attempts (phone_hash) VALUES ($1)
            ON CONFLICT (phone_hash) DO NOTHING`, [phoneHash]);
        const result = await client.query(`SELECT *, clock_timestamp() AS now FROM phone_login_attempts
            WHERE phone_hash = $1 FOR UPDATE`, [phoneHash]);
        return result.rows[0];
    }
    async clearPasswordFailures(client, phoneHash) {
        const result = await client.query(`UPDATE phone_login_attempts SET failure_count = 0,
            window_started_at = clock_timestamp(), blocked_until = NULL WHERE phone_hash = $1
            RETURNING *, clock_timestamp() AS now`, [phoneHash]);
        return result.rows[0];
    }
    async recordPasswordFailure(client, phoneHash) {
        await client.query(`UPDATE phone_login_attempts SET failure_count = LEAST(failure_count + 1, 5),
            blocked_until = CASE WHEN failure_count + 1 >= 5 THEN clock_timestamp() + interval '15 minutes'
                ELSE NULL END WHERE phone_hash = $1`, [phoneHash]);
    }
    async clearPasswordPhones(client, phoneHashes) {
        // Users are already locked; sort phone rows for resets involving two numbers.
        await client.query(`SELECT phone_hash FROM phone_login_attempts WHERE phone_hash = ANY($1::text[])
            ORDER BY phone_hash FOR UPDATE`, [phoneHashes]);
        await client.query("DELETE FROM phone_login_attempts WHERE phone_hash = ANY($1::text[])", [phoneHashes]);
    }
    async savePassword(client, credential) {
        await client.query(`INSERT INTO phone_credentials
            (user_id,phone,password_salt,password_hash,hash_algorithm,created_by)
            VALUES ($1,$2,$3,$4,$5,$6)
            ON CONFLICT (user_id) DO UPDATE SET phone=EXCLUDED.phone,
                password_salt=EXCLUDED.password_salt,password_hash=EXCLUDED.password_hash,
                hash_algorithm=EXCLUDED.hash_algorithm,updated_at=clock_timestamp()`,
            [credential.userId,credential.phone,credential.password_salt,credential.password_hash,
                credential.hash_algorithm,credential.createdBy]);
    }
    async invalidateUserSessions(client, userId) {
        await client.query("UPDATE users SET auth_version = auth_version + 1 WHERE id = $1", [userId]);
        await client.query("UPDATE sessions SET revoked_at = clock_timestamp() WHERE user_id = $1 AND revoked_at IS NULL", [userId]);
        await this.revokeUserDevices(client, userId);
    }
    async revokeUser(client, userId) {
        await client.query("UPDATE users SET active = false, auth_version = auth_version + 1 WHERE id = $1", [userId]);
        await client.query("UPDATE sessions SET revoked_at = clock_timestamp() WHERE user_id = $1 AND revoked_at IS NULL", [userId]);
        await this.invalidateInvitations(client, userId);
        await this.invalidateMaxInvitations(client, userId);
        await this.revokeUserDevices(client, userId);
    }
    async revokeSession(client, sessionId) {
        await client.query("UPDATE sessions SET revoked_at = clock_timestamp() WHERE id = $1 AND revoked_at IS NULL", [sessionId]);
    }
};
exports.IdentityRepository = IdentityRepository;
exports.IdentityRepository = IdentityRepository = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_service_1.DatabaseService)),
    __metadata("design:paramtypes", [database_service_1.DatabaseService])
], IdentityRepository);
//# sourceMappingURL=identity.repository.js.map
