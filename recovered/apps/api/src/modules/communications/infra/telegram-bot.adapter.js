"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TelegramBotAdapter = exports.TelegramTransportError = void 0;
class TelegramTransportError extends Error {
    code;
    constructor(code) {
        super(code);
        this.code = code;
    }
}
exports.TelegramTransportError = TelegramTransportError;
/** Fixed provider host; transport errors deliberately discard URLs, credentials and provider text. */
class TelegramBotAdapter {
    botToken;
    request;
    constructor(botToken, request = globalThis.fetch) {
        this.botToken = botToken;
        this.request = request;
        if (!/^\d{5,16}:[A-Za-z0-9_-]{30,100}$/.test(botToken))
            throw new Error("Invalid Telegram bot token");
    }
    async send(message) {
        if (!/^[1-9]\d{0,15}$/.test(message.chatId) || Number(message.chatId) > 2 ** 52 - 1 || message.text.length < 1 || message.text.length > 4096)
            throw new TelegramTransportError("API_REJECTED");
        try {
            const response = await this.request(`https://api.telegram.org/bot${this.botToken}/sendMessage`, {
                method: "POST", redirect: "error", signal: AbortSignal.timeout(6000),
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ chat_id: message.chatId, text: message.text, protect_content: true, link_preview_options: { is_disabled: true }, ...(message.forceReply ? { reply_markup: { force_reply: true, input_field_placeholder: "Ответ по этому обращению" } } : {}) }),
            });
            if (!response.ok)
                throw new TelegramTransportError(response.status === 429 ? "RATE_LIMITED" : response.status === 403 ? "CHAT_UNAVAILABLE" : "API_REJECTED");
            if (!response.headers.get("content-type")?.includes("application/json"))
                throw new TelegramTransportError("INVALID_RECEIPT");
            const reader = response.body?.getReader();
            if (!reader)
                throw new TelegramTransportError("INVALID_RECEIPT");
            const chunks = [];
            let size = 0;
            while (true) {
                const { value, done } = await reader.read();
                if (done)
                    break;
                size += value.length;
                if (size > 65536) {
                    await reader.cancel();
                    throw new TelegramTransportError("INVALID_RECEIPT");
                }
                chunks.push(value);
            }
            let body;
            try {
                body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
            }
            catch {
                throw new TelegramTransportError("INVALID_RECEIPT");
            }
            if (body?.ok !== true || !Number.isSafeInteger(body?.result?.message_id) || body.result.message_id <= 0 || body.result.chat?.type !== "private" || String(body.result.chat.id) !== message.chatId)
                throw new TelegramTransportError("INVALID_RECEIPT");
            return { messageId: body.result.message_id };
        }
        catch (error) {
            if (error instanceof TelegramTransportError)
                throw error;
            throw new TelegramTransportError("NETWORK_OR_TIMEOUT");
        }
    }
}
exports.TelegramBotAdapter = TelegramBotAdapter;
//# sourceMappingURL=telegram-bot.adapter.js.map