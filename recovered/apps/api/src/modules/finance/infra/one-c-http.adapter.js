"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OneCHttpAdapter = exports.OneCTransportError = void 0;
exports.validateOneCReceipt = validateOneCReceipt;
class OneCTransportError extends Error {
    code;
    constructor(code) {
        super(code);
        this.code = code;
    }
}
exports.OneCTransportError = OneCTransportError;
function validateOneCReceipt(value, payload) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        throw new OneCTransportError("INVALID_RECEIPT");
    const receipt = value;
    if (Object.keys(receipt).some((key) => !["schemaVersion", "status", "exchangeId", "registryId", "idempotencyKey", "sourceDocumentId"].includes(key)))
        throw new OneCTransportError("INVALID_RECEIPT");
    if (receipt.schemaVersion !== "transport.receipt.v1" || receipt.status !== "accepted" || receipt.exchangeId !== payload.exchangeId || receipt.registryId !== payload.registryId || receipt.idempotencyKey !== payload.idempotencyKey || typeof receipt.sourceDocumentId !== "string" || !/^[^\u0000-\u001f\u007f]{1,128}$/.test(receipt.sourceDocumentId) || !receipt.sourceDocumentId.trim())
        throw new OneCTransportError("INVALID_RECEIPT");
    return receipt;
}
/** Outbound-only adapter. The 1C owner provisions the endpoint and idempotent receiver. */
class OneCHttpAdapter {
    secret;
    url;
    constructor(url, secret) {
        this.secret = secret;
        const endpoint = new URL(url);
        if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || endpoint.hash || endpoint.search || !endpoint.hostname || secret.length < 32 || /[\r\n]/.test(secret))
            throw new Error("Invalid 1C HTTPS adapter configuration");
        this.url = endpoint.href;
    }
    async send(payload) {
        try {
            const response = await fetch(this.url, {
                method: "POST", redirect: "error", signal: AbortSignal.timeout(10000),
                headers: { Authorization: `Bearer ${this.secret}`, "Content-Type": "application/json", "Idempotency-Key": payload.idempotencyKey, "X-Exchange-Schema": payload.schemaVersion },
                body: JSON.stringify(payload),
            });
            if (!response.ok) {
                await response.body?.cancel();
                throw new OneCTransportError("HTTP_REJECTED");
            }
            if (!response.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
                await response.body?.cancel();
                throw new OneCTransportError("INVALID_RECEIPT");
            }
            const reader = response.body?.getReader();
            if (!reader)
                throw new OneCTransportError("INVALID_RECEIPT");
            const chunks = [];
            let size = 0;
            while (true) {
                const part = await reader.read();
                if (part.done)
                    break;
                size += part.value.length;
                if (size > 8192) {
                    await reader.cancel();
                    throw new OneCTransportError("INVALID_RECEIPT");
                }
                chunks.push(part.value);
            }
            let receipt;
            try {
                receipt = JSON.parse(Buffer.concat(chunks).toString("utf8"));
            }
            catch {
                throw new OneCTransportError("INVALID_RECEIPT");
            }
            return validateOneCReceipt(receipt, payload);
        }
        catch (error) {
            if (error instanceof OneCTransportError)
                throw error;
            throw new OneCTransportError("TIMEOUT_OR_NETWORK");
        }
    }
}
exports.OneCHttpAdapter = OneCHttpAdapter;
//# sourceMappingURL=one-c-http.adapter.js.map