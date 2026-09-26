"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TelegramAuthAdapter = void 0;
const node_crypto_1 = require("node:crypto");
const channel_auth_1 = require("../domain/channel-auth");
/** HMAC validation: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app */
class TelegramAuthAdapter {
    botToken;
    maxAgeSeconds;
    now;
    constructor(botToken, maxAgeSeconds, now = Date.now) {
        this.botToken = botToken;
        this.maxAgeSeconds = maxAgeSeconds;
        this.now = now;
    }
    verify(payload) {
        if (!payload ||
            payload.length > 16_384 ||
            /%(?![0-9a-fA-F]{2})/.test(payload)) {
            throw new channel_auth_1.ChannelAuthError();
        }
        const params = new URLSearchParams(payload);
        const seen = new Set();
        for (const [key] of params) {
            if (!/^[a-z_]+$/.test(key) || seen.has(key))
                throw new channel_auth_1.ChannelAuthError();
            seen.add(key);
        }
        const hash = params.get("hash");
        if (!hash || !/^[0-9a-fA-F]{64}$/.test(hash))
            throw new channel_auth_1.ChannelAuthError();
        params.delete("hash");
        const dataCheckString = [...params.entries()]
            .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
            .map(([key, value]) => `${key}=${value}`)
            .join("\n");
        const secretKey = (0, node_crypto_1.createHmac)("sha256", "WebAppData")
            .update(this.botToken)
            .digest();
        const expected = (0, node_crypto_1.createHmac)("sha256", secretKey)
            .update(dataCheckString)
            .digest();
        if (!(0, node_crypto_1.timingSafeEqual)(expected, Buffer.from(hash, "hex")))
            throw new channel_auth_1.ChannelAuthError();
        const authDate = params.get("auth_date");
        if (!authDate || !/^\d{1,12}$/.test(authDate))
            throw new channel_auth_1.ChannelAuthError();
        const issuedAt = Number(authDate);
        const now = Math.floor(this.now() / 1_000);
        if (issuedAt > now + 30 || issuedAt + this.maxAgeSeconds <= now)
            throw new channel_auth_1.ChannelAuthError();
        let user;
        try {
            user = JSON.parse(params.get("user") ?? "null");
        }
        catch {
            throw new channel_auth_1.ChannelAuthError();
        }
        if (user === null ||
            typeof user !== "object" ||
            !("id" in user) ||
            typeof user.id !== "number" ||
            !Number.isSafeInteger(user.id) ||
            user.id <= 0 ||
            user.id > 2 ** 52 - 1)
            throw new channel_auth_1.ChannelAuthError();
        return {
            provider: "telegram",
            providerUserId: String(user.id),
            // Canonical form prevents replay through query reordering or alternate URL encoding.
            replayHash: (0, node_crypto_1.createHash)("sha256")
                .update(dataCheckString)
                .update(expected)
                .digest("hex"),
            expiresAt: new Date((issuedAt + this.maxAgeSeconds) * 1_000),
        };
    }
}
exports.TelegramAuthAdapter = TelegramAuthAdapter;
//# sourceMappingURL=telegram-auth.adapter.js.map