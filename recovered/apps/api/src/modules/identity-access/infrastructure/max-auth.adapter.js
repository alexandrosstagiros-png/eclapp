"use strict";

const { createHash, createHmac, timingSafeEqual } = require("node:crypto");

const { ChannelAuthError } = require("../domain/channel-auth");
// Official protocol: https://dev.max.ru/docs/webapps/validation
class MaxAuthError extends ChannelAuthError {
  constructor() {
    super();
    this.name = "MaxAuthError";
  }
}

function parseInitData(payload) {
  if (typeof payload !== "string" || !payload || Buffer.byteLength(payload) > 16_384) {
    throw new MaxAuthError();
  }
  const params = new Map();
  for (const pair of payload.split("&")) {
    const split = pair.indexOf("=");
    if (split < 1) throw new MaxAuthError();
    let key, value;
    try {
      key = decodeURIComponent(pair.slice(0, split).replace(/\+/g, " "));
      value = decodeURIComponent(pair.slice(split + 1).replace(/\+/g, " "));
    } catch {
      throw new MaxAuthError();
    }
    // Reject duplicate decoded names and ambiguous canonical lines.
    if (!/^[a-z][a-z0-9_]*$/.test(key) || params.has(key) || /[\r\n]/.test(value)) {
      throw new MaxAuthError();
    }
    params.set(key, value);
  }
  return params;
}

class MaxAuthAdapter {
  #botToken;
  #maxAgeSeconds;
  #now;

  constructor(botToken, maxAgeSeconds = 300, now = Date.now) {
    if (typeof botToken !== "string" || !botToken.trim()) {
      throw new TypeError("MAX_BOT_TOKEN is required");
    }
    if (!Number.isInteger(maxAgeSeconds) || maxAgeSeconds < 60 || maxAgeSeconds > 3600) {
      throw new RangeError("MAX auth lifetime must be between 60 and 3600 seconds");
    }
    if (typeof now !== "function") throw new TypeError("Clock must be a function");
    this.#botToken = botToken;
    this.#maxAgeSeconds = maxAgeSeconds;
    this.#now = now;
  }

  verify(payload) {
    const params = parseInitData(payload);
    const signature = params.get("hash");
    if (!signature || !/^[a-f0-9]{64}$/i.test(signature)) throw new MaxAuthError();
    params.delete("hash");
    const canonical = [...params.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, value]) => `${key}=${value}`)
      .join("\n");
    const secret = createHmac("sha256", "WebAppData").update(this.#botToken).digest();
    const expected = createHmac("sha256", secret).update(canonical).digest();
    if (!timingSafeEqual(expected, Buffer.from(signature, "hex"))) throw new MaxAuthError();

    const authDate = params.get("auth_date");
    if (!authDate || !/^[1-9]\d{0,11}$/.test(authDate)) throw new MaxAuthError();
    const issuedAt = Number(authDate);
    const now = Math.floor(this.#now() / 1000);
    if (!Number.isFinite(now) || issuedAt > now + 30 || issuedAt + this.#maxAgeSeconds <= now) {
      throw new MaxAuthError();
    }
    let user;
    try {
      user = JSON.parse(params.get("user") ?? "null");
    } catch {
      throw new MaxAuthError();
    }
    if (!user || typeof user !== "object" || Array.isArray(user) ||
        !Number.isSafeInteger(user.id) || user.id <= 0) {
      throw new MaxAuthError();
    }

    return {
      provider: "max",
      providerUserId: String(user.id),
      // Store this hash transactionally with session issuance to reject replays.
      // Canonical data prevents bypass by reordering/encoding the same payload.
      replayHash: createHash("sha256")
        .update("max\0").update(canonical).update(expected).digest("hex"),
      expiresAt: new Date((issuedAt + this.#maxAgeSeconds) * 1000),
    };
  }
}

module.exports = { MaxAuthAdapter, MaxAuthError };
