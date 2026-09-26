"use strict";
const { ForbiddenException } = require("@nestjs/common");

const COOKIE_PATH = "/api/v1/auth";
const HEADER = "x-session-refresh";
function cookieName(config) { return config.nodeEnv === "production" ? "__Secure-ecl_refresh" : "ecl_refresh_dev"; }
function readRememberedCookie(request, config) {
  const header = request.headers.cookie;
  if (typeof header !== "string" || header.length > 16384) return undefined;
  const name = cookieName(config);
  const found = header.split(";").map(part => part.trim()).filter(part => part.startsWith(name + "="));
  if (found.length !== 1) return undefined;
  const token = found[0].slice(name.length + 1);
  return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : undefined;
}
function rememberedCookie(config, token, expiresAt) {
  const prod = config.nodeEnv === "production";
  const maxAge = token ? Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)) : 0;
  const expiry = token ? new Date(expiresAt).toUTCString() : new Date(0).toUTCString();
  return `${cookieName(config)}=${token || ""}; Path=${COOKIE_PATH}; Max-Age=${maxAge}; Expires=${expiry}; HttpOnly; SameSite=${prod ? "None" : "Lax"}${prod ? "; Secure; Partitioned" : ""}`;
}
function requireTrustedAuthOrigin(request, config, requireRefreshHeader = false) {
  const origin = request.headers.origin;
  // Non-browser bearer/password API clients may omit Origin. Browser cookie
  // endpoints always require a trusted Origin plus a non-simple request header.
  if (origin !== undefined && (typeof origin !== "string" || !config.allowedOrigins.includes(origin))) throw new ForbiddenException();
  if (origin === undefined && (requireRefreshHeader || request.headers["sec-fetch-site"] !== undefined)) throw new ForbiddenException();
  if (requireRefreshHeader && request.headers[HEADER] !== "1") throw new ForbiddenException();
}
module.exports = { cookieName, readRememberedCookie, rememberedCookie, requireTrustedAuthOrigin, HEADER };
