"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseTelegramOnboardingStart = parseTelegramOnboardingStart;
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value) ? value : undefined;
const positiveId = (value) => typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= 2 ** 52 - 1;
/** A stateless hint for the sender only. It neither creates nor authenticates a platform identity. */
function parseTelegramOnboardingStart(value, botUsername) {
    const update = object(value);
    if (!update || !Number.isSafeInteger(update.update_id) || Number(update.update_id) < 0 || Object.keys(update).some(key => key !== "update_id" && key !== "message"))
        return undefined;
    const message = object(update.message);
    const from = object(message?.from);
    const chat = object(message?.chat);
    if (!message || !from || !chat || chat.type !== "private" || from.is_bot !== false || !positiveId(from.id) || from.id !== chat.id || !positiveId(message.message_id))
        return undefined;
    const excluded = ["forward_origin", "forward_from", "forward_from_chat", "forward_sender_name", "forward_date", "is_automatic_forward", "business_connection_id", "sender_business_bot", "is_from_offline", "edit_date", "sender_chat", "via_bot", "photo", "document", "audio", "voice", "video", "video_note", "animation", "sticker", "contact", "location", "venue", "caption", "poll", "dice", "story", "paid_media"];
    if (excluded.some(key => key in message) || typeof message.text !== "string")
        return undefined;
    const text = message.text;
    if (text !== "/start" && !(text.startsWith("/start@") && text.slice(7).toLowerCase() === botUsername.toLowerCase()))
        return undefined;
    return String(from.id);
}
//# sourceMappingURL=telegram-onboarding.js.map