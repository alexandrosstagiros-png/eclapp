"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseTelegramUpdate = parseTelegramUpdate;
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value) ? value : undefined;
const positiveId = (value) => Number.isSafeInteger(value) && Number(value) > 0 && Number(value) <= 2 ** 52 - 1;
/** Only ordinary, private, human-authored messages participate. Edits cannot rewrite evidence. */
function parseTelegramUpdate(value) {
    const update = object(value);
    const message = object(update?.message);
    const from = object(message?.from);
    const chat = object(message?.chat);
    if (!update || !Number.isSafeInteger(update.update_id) || Number(update.update_id) < 0 || !message || !from || !chat || chat.type !== "private" || from.is_bot !== false || !positiveId(from.id) || from.id !== chat.id || !positiveId(message.message_id))
        return undefined;
    const reply = object(message.reply_to_message);
    const result = { updateId: Number(update.update_id), chatId: String(chat.id), messageId: message.message_id, ...(positiveId(reply?.message_id) ? { replyToMessageId: reply.message_id } : {}), input: { kind: "unsupported" } };
    // Captions and forwarded messages are not accepted as authored text in this slice.
    if (message.forward_origin || message.photo || message.document || message.audio || message.voice || message.video || message.sticker || message.contact || message.location || typeof message.text !== "string")
        return result;
    const text = message.text.trim();
    const start = /^\/start (c_[A-Za-z0-9_-]{32})$/.exec(text);
    if (start)
        result.input = { kind: "start", token: start[1] };
    else if (text.startsWith("/"))
        result.input = { kind: "help" };
    else if (text.length > 0 && text.length <= 3500 && !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(text))
        result.input = { kind: "text", text };
    return result;
}
//# sourceMappingURL=telegram-update.js.map