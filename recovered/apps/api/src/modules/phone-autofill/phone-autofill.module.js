"use strict";
const { Module, Injectable, Inject, Controller, Post, Body, HttpCode, Header, BadRequestException, UnauthorizedException } = require('@nestjs/common');
const { Throttle } = require('@nestjs/throttler');
const { DatabaseService } = require('../../platform/database.service');
const { ConfigService } = require('../../platform/config');
const { TelegramAuthAdapter } = require('../identity-access/infrastructure/telegram-auth.adapter');
const { MaxAuthAdapter } = require('../identity-access/infrastructure/max-auth.adapter');

// Contacts are only a short-lived input hint, never a login credential or identity binding.
class PhoneAutofillService {
  constructor(database, config, now = Date.now) {
    this.database = database;
    this.config = config.value;
    this.now = now;
    this.contacts = new Map();
  }
  prune() {
    for (const [id, value] of this.contacts) if (value.expiresAt <= this.now()) this.contacts.delete(id);
  }
  captureTelegramContact(update) {
    const message = update?.message;
    const from = message?.from;
    const contact = message?.contact;
    const now = Math.floor(this.now() / 1000);
    if (!Number.isSafeInteger(from?.id) || from.id <= 0 || from.is_bot ||
        message?.chat?.type !== 'private' || message.chat.id !== from.id ||
        contact?.user_id !== from.id || message.forward_origin || message.forward_from || message.forward_from_chat ||
        !Number.isSafeInteger(message.date) || message.date > now + 30 || message.date < now - 300 ||
        typeof contact.phone_number !== 'string' || !/^\+?[1-9]\d{6,14}$/.test(contact.phone_number)) return false;
    this.prune();
    const id = String(from.id);
    if (!this.contacts.has(id) && this.contacts.size >= 1000) this.contacts.delete(this.contacts.keys().next().value);
    this.contacts.set(id, { phone: '+' + contact.phone_number.replace(/^\+/, ''), expiresAt: this.now() + 300_000 });
    return true;
  }
  async hint(body) {
    if (!body || !['telegram', 'max'].includes(body.provider) || typeof body.initData !== 'string' ||
        !body.initData || Buffer.byteLength(body.initData) > 16384) throw new BadRequestException('Invalid phone hint request');
    let identity;
    try {
      const token = body.provider === 'max' ? this.config.maxBotToken : this.config.telegramBotToken;
      if (!token) throw new Error('disabled');
      const Adapter = body.provider === 'max' ? MaxAuthAdapter : TelegramAuthAdapter;
      identity = new Adapter(token, body.provider === 'max' ? this.config.maxAuthMaxAgeSeconds : this.config.telegramAuthMaxAgeSeconds).verify(body.initData);
    } catch {
      throw new UnauthorizedException('Phone hint unavailable');
    }
    this.prune();
    if (identity.provider === 'telegram') {
      const contact = this.contacts.get(identity.providerUserId);
      if (contact) return { phone: contact.phone };
    }
    // A verified messenger may read only its own already-bound active account's login number.
    const result = await this.database.pool.query(`SELECT p.phone FROM phone_credentials p
      JOIN channel_identities c ON c.user_id=p.user_id
      JOIN users u ON u.id=p.user_id
      WHERE c.provider=$1 AND c.provider_user_id=$2 AND u.active AND u.approved`,
      [identity.provider, identity.providerUserId]);
    return { phone: result.rows[0]?.phone ?? null };
  }
}
Injectable()(PhoneAutofillService);
Inject(DatabaseService)(PhoneAutofillService, undefined, 0);
Inject(ConfigService)(PhoneAutofillService, undefined, 1);

class PhoneAutofillController {
  constructor(service) { this.service = service; }
  hint(body) { return this.service.hint(body); }
}
Inject(PhoneAutofillService)(PhoneAutofillController, undefined, 0);
Controller('auth')(PhoneAutofillController);
const descriptor = Object.getOwnPropertyDescriptor(PhoneAutofillController.prototype, 'hint');
Post('phone-hint')(PhoneAutofillController.prototype, 'hint', descriptor);
HttpCode(200)(PhoneAutofillController.prototype, 'hint', descriptor);
Header('Cache-Control', 'no-store')(PhoneAutofillController.prototype, 'hint', descriptor);
Throttle({ default: { limit: 60, ttl: 60000 } })(PhoneAutofillController.prototype, 'hint', descriptor);
Body()(PhoneAutofillController.prototype, 'hint', 0);
class PhoneAutofillModule {}
Module({ controllers: [PhoneAutofillController], providers: [PhoneAutofillService], exports: [PhoneAutofillService] })(PhoneAutofillModule);
module.exports = { PhoneAutofillModule, PhoneAutofillService };
