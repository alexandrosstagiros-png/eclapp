// SPDX-License-Identifier: MIT
'use strict';
const { randomBytes, randomUUID, createHash } = require('node:crypto');
const { Injectable, Inject, Controller, Get, Post, Body, Query, Param, Req, Res, Header, HttpCode, UseGuards,
  UnauthorizedException, GoneException, ConflictException } = require('@nestjs/common');
const { Throttle } = require('@nestjs/throttler');
const { DatabaseService } = require('../../platform/database.service');
const { IdentityRepository } = require('../identity-access/infrastructure/identity.repository');
const { AuthService } = require('../identity-access/application/auth.service');
const { AuthGuard } = require('../identity-access/interface/auth.guard');
const { CurrentActor } = require('../identity-access/interface/current-actor.decorator');
const { requireTrustedAuthOrigin, rememberedCookie } = require('../identity-access/interface/remembered-cookie');
const passwordAuth = require('../identity-access/infrastructure/password-auth');
const { AuditService } = require('../audit/application/audit.service');
const { fail, forbidden, uuid, instant } = require('./recruitment-input');
const DAY = 86400000;
const digest = value => createHash('sha256').update(value).digest('hex');
const {tuple,whereScope:where,whereRead,companyScopes}=require('./recruitment-access');
const scopeKeys = ['legalEntityId', 'regionId', 'projectId', 'responsibilityScopeId'];
const COLUMNS = `id,legal_entity_id AS "legalEntityId",region_id AS "regionId",project_id AS "projectId",
 responsibility_scope_id AS "responsibilityScopeId",request_ids AS "requestIds",created_by AS "createdBy",created_at AS "createdAt",
 expires_at AS "expiresAt",access_expires_at AS "accessExpiresAt",revoked_at AS "revokedAt",consumed_at AS "consumedAt",accepted_user_id AS "acceptedUserId"`;
const unavailable = () => { throw new GoneException({ code: 'RECRUITMENT_INVITATION_UNAVAILABLE', message: 'Приглашение недоступно. Попросите администратора прислать новую ссылку.' }); };
const credentialsRejected = () => { throw new UnauthorizedException({ code: 'RECRUITMENT_INVITATION_CREDENTIALS', message: 'Не удалось подтвердить данные. Если аккаунт уже есть, выберите вход с существующим паролем.' }); };
function bodyFields(body, allowed) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !allowed.includes(key))) fail();
}
function tokenHash(token) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) unavailable();
  return digest(token);
}
function publicInvitation(row, now) {
  const { legalEntityId, regionId, projectId, ...result } = row;
  return { ...result, status: row.consumedAt ? 'accepted' : row.revokedAt ? 'revoked' : row.expiresAt <= now ? 'expired' : 'pending' };
}

class RecruitmentInvitationsService {
  constructor(database, identity, audit, auth) { Object.assign(this, { database, identity, audit, auth }); }
  async lockScope(client, scope) {
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,917042025))', [`scope:${JSON.stringify(tuple(scope))}`]);
  }
  async administrator(client, supplied, scopeId) {
    await this.identity.lockUsers(client, [supplied.id]);
    const actor = await this.auth.requireCurrentActor(client, supplied);
    if (actor.role !== 'access_admin' || actor.impersonation) forbidden('Приглашать внешних рекрутеров может администратор доступа.');
    const scopes=await companyScopes(client,actor);
    const scope=scopeId ? scopes.find(grant=>grant.responsibilityScopeId===scopeId) : scopes.length ? {readScopes:scopes} : null;
    if (!scope) forbidden();
    return { actor, scope };
  }
  async requestsValid(client, scope, ids) {
    const found = await client.query(`SELECT id FROM recruitment_requests WHERE ${where()} AND id=ANY($5::uuid[])`, [...tuple(scope), ids]);
    return found.rowCount === ids.length;
  }
  async append(client, actorId, channel, action, invitation, correlationId, metadata = {}) {
    await this.audit.append(client, { actorId, channel, correlationId: correlationId || randomUUID(), action,
      entityType: 'recruitment_invitation', entityId: invitation.id,
      scope: Object.fromEntries(scopeKeys.map(key => [key, invitation[key]])), metadata });
  }
  async create(supplied, body, correlationId) {
    bodyFields(body, ['responsibilityScopeId', 'requestIds', 'expiresAt', 'accessExpiresAt']);
    const scopeId = uuid(body.responsibilityScopeId, 'область работы');
    if (!Array.isArray(body.requestIds) || !body.requestIds.length || body.requestIds.length > 10000) fail('Выберите хотя бы одну потребность.');
    const requestIds = [...new Set(body.requestIds.map(id => uuid(id, 'потребность')))];
    const requestedExpiry = instant(body.expiresAt), accessExpiresAt = instant(body.accessExpiresAt);
    return this.database.transaction(async client => {
      const { actor, scope } = await this.administrator(client, supplied, scopeId);
      await this.lockScope(client, scope);
      const now = (await client.query('SELECT clock_timestamp() AS now')).rows[0].now;
      if (accessExpiresAt && new Date(accessExpiresAt) <= now) fail('Срок доступа должен быть в будущем.');
      const expiresAt = requestedExpiry ? new Date(requestedExpiry) : new Date(Math.min(now.getTime() + 7 * DAY, accessExpiresAt ? new Date(accessExpiresAt).getTime() : Infinity));
      if (expiresAt <= now || expiresAt.getTime() > now.getTime() + 30 * DAY || (accessExpiresAt && expiresAt > new Date(accessExpiresAt)))
        fail('Срок ссылки: не более 30 дней и не позднее окончания доступа.');
      if (!await this.requestsValid(client, scope, requestIds)) forbidden('Выбранные потребности должны принадлежать этой области.');
      const invitationToken = randomBytes(32).toString('base64url');
      const result = await client.query(`INSERT INTO recruitment_invitations(id,token_hash,legal_entity_id,region_id,project_id,
        responsibility_scope_id,request_ids,created_by,created_at,expires_at,access_expires_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING ${COLUMNS}`,
        [randomUUID(), digest(invitationToken), ...tuple(scope), requestIds, actor.id, now, expiresAt, accessExpiresAt]);
      const invitation = result.rows[0];
      await this.append(client, actor.id, actor.channel, 'recruitment.invitation.created', invitation, correlationId,
        { requestIds, expiresAt: expiresAt.toISOString(), accessExpiresAt });
      return { ...publicInvitation(invitation, now), invitationToken };
    });
  }
  async list(supplied, scopeId) {
    return this.database.transaction(async client => {
      const { scope } = await this.administrator(client, supplied, scopeId ? uuid(scopeId, 'проект') : null);
      const result = await client.query(`SELECT ${COLUMNS},clock_timestamp() AS now FROM recruitment_invitations WHERE ${whereRead(scope)} ORDER BY created_at DESC,id LIMIT 1001`, tuple(scope));
      return { invitations: result.rows.slice(0, 1000).map(({ now, ...row }) => publicInvitation(row, now)), truncated: result.rows.length > 1000 };
    });
  }
  async revoke(supplied, id, body, correlationId) {
    bodyFields(body, ['responsibilityScopeId']);
    uuid(id);
    return this.database.transaction(async client => {
      const { actor, scope } = await this.administrator(client, supplied, uuid(body.responsibilityScopeId, 'область работы'));
      await this.lockScope(client, scope);
      const found = await client.query(`SELECT ${COLUMNS},clock_timestamp() AS now FROM recruitment_invitations WHERE ${where()} AND id=$5 FOR UPDATE`, [...tuple(scope), id]);
      const invitation = found.rows[0];
      if (!invitation) forbidden();
      if (!invitation.revokedAt && !invitation.consumedAt) {
        await client.query('UPDATE recruitment_invitations SET revoked_at=clock_timestamp() WHERE id=$1', [id]);
        invitation.revokedAt = invitation.now;
        await this.append(client, actor.id, actor.channel, 'recruitment.invitation.revoked', invitation, correlationId);
      }
      const { now, ...row } = invitation;
      return publicInvitation(row, now);
    });
  }
  async candidate(client, hash) {
    return (await client.query(`SELECT ${COLUMNS} FROM recruitment_invitations WHERE token_hash=$1`, [hash])).rows[0];
  }
  async usable(client, candidate) {
    // User locks precede scope/invitation locks throughout identity and recruiting.
    await this.lockScope(client, candidate);
    const invitation = (await client.query(`SELECT ${COLUMNS},clock_timestamp() AS now FROM recruitment_invitations WHERE id=$1 FOR UPDATE`, [candidate.id])).rows[0];
    if (!invitation || invitation.revokedAt || invitation.consumedAt || invitation.expiresAt <= invitation.now ||
      (invitation.accessExpiresAt && invitation.accessExpiresAt <= invitation.now)) unavailable();
    const issuer = await this.identity.user(client, invitation.createdBy);
    const grants = issuer?.active && issuer.approved && issuer.role === 'access_admin' ? await this.identity.grants(issuer.id, client) : [];
    if (!grants.some(grant => grant.personalDataVisible && grant.legalEntityId===invitation.legalEntityId) ||
      !await this.requestsValid(client, invitation, invitation.requestIds)) unavailable();
    return invitation;
  }
  async preview(body) {
    bodyFields(body, ['token']);
    const hash = tokenHash(body.token);
    return this.database.transaction(async client => {
      const candidate = await this.candidate(client, hash);
      if (!candidate) unavailable();
      await this.identity.lockUsers(client, [candidate.createdBy]);
      const invitation = await this.usable(client, candidate);
      return { ready: true, expiresAt: invitation.expiresAt.toISOString() };
    });
  }
  async accept(body, correlationId) {
    bodyFields(body, ['token', 'displayName', 'phone', 'password', 'mode']);
    const hash = tokenHash(body.token), existingMode = body.mode === 'existing';
    if (body.mode != null && !['new', 'existing'].includes(body.mode)) fail();
    if (!passwordAuth.boundedPassword(body.password) || (!existingMode && body.password.length < 12)) fail('Пароль должен содержать от 12 до 128 символов.');
    const phone = passwordAuth.normalizePhone(body.phone);
    if (!phone) fail('Укажите телефон с кодом страны.');
    let displayName;
    if (!existingMode) {
      if (typeof body.displayName !== 'string' || body.displayName.trim().length < 2 || body.displayName.length > 160 || /[\u0000-\u001f\u007f]/.test(body.displayName)) fail('Укажите имя: от 2 до 160 символов.');
      displayName = body.displayName.trim();
    }
    await this.identity.prunePasswordAttempts();
    let result;
    try {
      result = await this.database.transaction(async client => {
        const candidate = await this.candidate(client, hash);
        if (!candidate) unavailable();
        const targetId = await this.identity.passwordUserId(client, phone);
        await this.identity.lockUsers(client, [candidate.createdBy, ...(targetId ? [targetId] : [])]);
        const phoneHash = digest(phone);
        let attempt = await this.identity.lockPasswordAttempt(client, phoneHash);
        if (attempt.blocked_until && attempt.blocked_until > attempt.now) return null;
        if (attempt.window_started_at.getTime() + 15 * 60000 <= attempt.now.getTime()) attempt = await this.identity.clearPasswordFailures(client, phoneHash);
        const invitation = await this.usable(client, candidate);
        // A racing registration/reset may have changed phone ownership after lookup.
        // Never take additional user locks after the phone lock or overwrite credentials.
        if ((await this.identity.passwordUserId(client, phone)) !== targetId) return null;
        let user = targetId ? await this.identity.user(client, targetId) : null;
        if (existingMode) {
          const credential = targetId ? await this.identity.passwordCredential(client, targetId, phone) : null;
          const matches = await passwordAuth.verifyPassword(body.password, credential);
          if (!matches || !user?.active || !user.approved || user.role !== 'external_recruiter') {
            await this.identity.recordPasswordFailure(client, phoneHash);
            return null;
          }
        } else {
          // One bounded KDF even for an occupied phone prevents a timing oracle.
          const credential = await passwordAuth.hashPassword(body.password);
          if (user) { await this.identity.recordPasswordFailure(client, phoneHash); return null; }
          user = (await client.query(`INSERT INTO users(id,display_name,role,active,approved) VALUES($1,$2,'external_recruiter',true,true) RETURNING *`, [randomUUID(), displayName])).rows[0];
          await client.query(`INSERT INTO employee_directory(user_id,source_kind,created_by,created_at) VALUES($1,'external_invitation',$2,clock_timestamp())`, [user.id, invitation.createdBy]);
          await this.identity.savePassword(client, { ...credential, userId: user.id, phone, createdBy: invitation.createdBy });
        }
        await client.query(`INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id,finance_visible,personal_data_visible)
          VALUES($1,$2,$3,$4,$5,false,true) ON CONFLICT(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id)
          DO NOTHING`, [user.id, ...tuple(invitation)]);
        const actualGrant = (await this.identity.grants(user.id, client)).find(grant => tuple(grant).every((value, i) => value === tuple(invitation)[i]));
        // Existing identity grants are never rewritten through a bearer invitation.
        // Inconsistent/restricted grants require the administrator's normal access flow.
        if (!actualGrant?.personalDataVisible || actualGrant.financeVisible) unavailable();
        const prior = (await client.query(`SELECT request_ids AS "requestIds",status,expires_at AS "expiresAt" FROM recruitment_external_access WHERE ${where()} AND user_id=$5 FOR UPDATE`, [...tuple(invitation), user.id])).rows[0];
        const priorActive = prior?.status === 'active' && (!prior.expiresAt || prior.expiresAt > invitation.now);
        if (priorActive && (prior.expiresAt?.getTime() ?? null) !== (invitation.accessExpiresAt?.getTime() ?? null)) {
          // The current model has one expiry for the whole scope. Taking the later
          // date would silently extend either old or newly selected requests.
          throw new ConflictException({ code: 'RECRUITMENT_INVITATION_ACCESS_CONFLICT',
            message: 'У вас уже есть доступ к этой области с другим сроком. Попросите администратора изменить потребности и срок в настройках вашего доступа.' });
        }
        // Existing recruiters explicitly join this scope with their own credentials.
        // Preserve other companies/scopes, identity and credentials without disclosing them to the inviter.
        const requestIds = [...new Set([...(priorActive ? prior.requestIds : []), ...invitation.requestIds])];
        if (requestIds.length > 10000) fail('Слишком много назначенных потребностей. Обратитесь к администратору.');
        const expiresAt = invitation.accessExpiresAt;
        await client.query(`INSERT INTO recruitment_external_access(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id,request_ids,status,expires_at,updated_by)
          VALUES($1,$2,$3,$4,$5,$6,'active',$7,$8) ON CONFLICT(user_id,responsibility_scope_id)
          DO UPDATE SET request_ids=EXCLUDED.request_ids,status='active',expires_at=EXCLUDED.expires_at,updated_by=EXCLUDED.updated_by,updated_at=clock_timestamp(),version=recruitment_external_access.version+1`,
          [user.id, ...tuple(invitation), requestIds, expiresAt, invitation.createdBy]);
        await client.query('UPDATE recruitment_invitations SET consumed_at=clock_timestamp(),accepted_user_id=$2 WHERE id=$1', [invitation.id, user.id]);
        await this.identity.clearPasswordFailures(client, phoneHash);
        await this.append(client, user.id, 'web', 'recruitment.invitation.accepted', invitation, correlationId,
          { userId: user.id, createdAccount: !existingMode, requestIds: invitation.requestIds });
        return this.auth.issueSession(client, user, 'web', correlationId || randomUUID());
      });
    } catch (error) {
      // Phone uniqueness is also enforced by the database against administrative resets.
      if (error?.code === '23505') credentialsRejected();
      throw error;
    }
    if (!result) credentialsRejected();
    return { ...result, rememberedDevice: false };
  }
}
Injectable()(RecruitmentInvitationsService);
for (const [i, dependency] of [DatabaseService, IdentityRepository, AuditService, AuthService].entries()) Inject(dependency)(RecruitmentInvitationsService, undefined, i);

class RecruitmentInvitationsController {
  constructor(service) { this.service = service; }
  list(actor, scopeId) { return this.service.list(actor, scopeId); }
  create(actor, body, request) { return this.service.create(actor, body, request.correlationId); }
  revoke(actor, id, body, request) { return this.service.revoke(actor, id, body, request.correlationId); }
}
Inject(RecruitmentInvitationsService)(RecruitmentInvitationsController, undefined, 0);
Controller('recruitment/invitations')(RecruitmentInvitationsController);
UseGuards(AuthGuard)(RecruitmentInvitationsController);
for (const [name, method] of [['list', Get()], ['create', Post()], ['revoke', Post(':id/revoke')]]) {
  const descriptor = Object.getOwnPropertyDescriptor(RecruitmentInvitationsController.prototype, name);
  method(RecruitmentInvitationsController.prototype, name, descriptor);
  Header('Cache-Control', 'no-store')(RecruitmentInvitationsController.prototype, name, descriptor);
  CurrentActor()(RecruitmentInvitationsController.prototype, name, 0);
}
Query('responsibilityScopeId')(RecruitmentInvitationsController.prototype, 'list', 1);
Body()(RecruitmentInvitationsController.prototype, 'create', 1);
Req()(RecruitmentInvitationsController.prototype, 'create', 2);
Param('id')(RecruitmentInvitationsController.prototype, 'revoke', 1);
Body()(RecruitmentInvitationsController.prototype, 'revoke', 2);
Req()(RecruitmentInvitationsController.prototype, 'revoke', 3);

class PublicRecruitmentInvitationsController {
  constructor(service) { this.service = service; }
  preview(body, request) { requireTrustedAuthOrigin(request, this.service.auth.config.value); return this.service.preview(body); }
  async accept(body, request, response) {
    const config = this.service.auth.config.value;
    requireTrustedAuthOrigin(request, config, true);
    const session = await this.service.accept(body, request.correlationId);
    // A previous user's remembered browser session must not restore after signup.
    response.setHeader('Set-Cookie', rememberedCookie(config));
    return session;
  }
}
Inject(RecruitmentInvitationsService)(PublicRecruitmentInvitationsController, undefined, 0);
Controller('recruitment-invitations')(PublicRecruitmentInvitationsController);
for (const name of ['preview', 'accept']) {
  const descriptor = Object.getOwnPropertyDescriptor(PublicRecruitmentInvitationsController.prototype, name);
  Post(name)(PublicRecruitmentInvitationsController.prototype, name, descriptor);
  HttpCode(200)(PublicRecruitmentInvitationsController.prototype, name, descriptor);
  Header('Cache-Control', 'no-store')(PublicRecruitmentInvitationsController.prototype, name, descriptor);
  Throttle({ default: { limit: process.env.NODE_ENV === 'test' ? 1000 : name === 'accept' ? 10 : 30, ttl: 60000 } })(PublicRecruitmentInvitationsController.prototype, name, descriptor);
  Body()(PublicRecruitmentInvitationsController.prototype, name, 0);
  Req()(PublicRecruitmentInvitationsController.prototype, name, 1);
}
Res({ passthrough: true })(PublicRecruitmentInvitationsController.prototype, 'accept', 2);
module.exports = { RecruitmentInvitationsService, RecruitmentInvitationsController, PublicRecruitmentInvitationsController };
