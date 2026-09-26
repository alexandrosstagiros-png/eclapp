// SPDX-License-Identifier: MIT
"use strict";
const { BadRequestException, ConflictException, ForbiddenException, NotFoundException } = require('@nestjs/common');
const { createHash } = require('node:crypto');
const { mediaMatches } = require('./team-media-input');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
const MAX_KNOWLEDGE_FILE_BYTES = 8 * 1024 * 1024;
const MAX_ATTACHMENTS = 5;
const REACTION_EMOJI = Object.freeze(['👍', '❤️', '😂', '🎉', '👀', '✅', '🙏']);
function fail(message = 'Проверьте заполненные поля.') { throw new BadRequestException({ code: 'TEAM_VALIDATION', message }); }
function conflict(message = 'Запись уже изменена. Обновите данные перед сохранением.') { throw new ConflictException({ code: 'TEAM_CONFLICT', message }); }
function forbidden(message = 'Нет доступа к корпоративной среде в этой области.') { throw new ForbiddenException({ code: 'TEAM_FORBIDDEN', message }); }
function unavailable() { throw new NotFoundException({ code: 'TEAM_NOT_FOUND', message: 'Запись недоступна в выбранной области.' }); }
function object(body, allowed) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || ![Object.prototype, null].includes(Object.getPrototypeOf(body))) fail();
  if (Object.keys(body).some(key => !allowed.includes(key))) fail('Переданы неизвестные поля. Обновите страницу.');
}
function uuid(value, label = 'идентификатор') {
  if (typeof value !== 'string' || !UUID.test(value)) fail(`Проверьте поле «${label}».`);
  return value.toLowerCase();
}
function string(value, maximum, label) {
  if (typeof value !== 'string' || value.length > maximum || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) fail(`Проверьте поле «${label}».`);
  const result = value.trim();
  if (!result) fail(`Заполните поле «${label}».`);
  return result;
}
function attachmentFilename(value) {
  if (typeof value !== 'string' || value.length > 255 || /[\u0000-\u001f\u007f-\u009f/\\\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u.test(value) ||
    /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/u.test(value)) fail('Недопустимое имя файла.');
  const filename = value.normalize('NFC').trim();
  if (!filename || filename === '.' || filename === '..' || Buffer.byteLength(filename, 'utf8') > 255) fail('Имя файла должно содержать от 1 до 255 байт UTF-8.');
  return filename;
}
function attachmentsInput(value, maximumBytes = MAX_ATTACHMENT_BYTES) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_ATTACHMENTS) fail('К сообщению можно прикрепить до 5 файлов.');
  let totalBytes = 0;
  const ids = new Set();
  return value.map(file => {
    object(file, ['id', 'filename', 'mimeType', 'contentBase64', 'kind']);
    const kind = file.kind === undefined ? 'file' : file.kind;
    if (!['file', 'image', 'audio', 'video', 'round'].includes(kind)) fail('Некорректный вид вложения.');
    const id = uuid(file.id, 'файл');
    if (ids.has(id)) fail('Идентификаторы прикреплённых файлов должны различаться.');
    ids.add(id);
    const filename = attachmentFilename(file.filename);
    if (typeof file.mimeType !== 'string' || file.mimeType.length > 127 ||
      !/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i.test(file.mimeType)) fail('Некорректный тип файла.');
    if (typeof file.contentBase64 !== 'string' || file.contentBase64.length > Math.ceil(maximumBytes / 3) * 4 ||
      file.contentBase64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(file.contentBase64)) fail('Некорректное содержимое файла.');
    const content = Buffer.from(file.contentBase64, 'base64');
    if (content.toString('base64') !== file.contentBase64) fail('Некорректное содержимое файла.');
    totalBytes += content.length;
    if (totalBytes > maximumBytes) fail(`Общий размер прикреплённых файлов не должен превышать ${maximumBytes / 1024 / 1024} МБ.`);
    if (!mediaMatches(kind, file.mimeType.toLowerCase(), content)) fail('Формат медиафайла не соответствует его содержимому. Прикрепите его как обычный файл.');
    return { id, filename, mimeType: file.mimeType.toLowerCase(), byteSize: content.length,
      sha256: createHash('sha256').update(content).digest('hex'), content, kind };
  });
}
function attachmentDisposition(filename) {
  const safe = filename.replace(/[^A-Za-z0-9._ -]/g, '_').slice(0, 120) || 'attachment';
  const encoded = encodeURIComponent(filename).replace(/['()*]/g, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${safe}"; filename*=UTF-8''${encoded}`;
}
function conversationMembers(visibility, value, direct = false) {
  if (!['public', 'private'].includes(visibility) || (direct && visibility !== 'private')) fail('Выберите открытый или закрытый канал.');
  if (!Array.isArray(value) || value.length > 200) fail('В закрытом канале может быть до 200 участников.');
  const memberIds = value.map(id => uuid(id, 'участник')).sort();
  if (new Set(memberIds).size !== memberIds.length || (direct ? memberIds.length !== 2 : visibility === 'public' ? memberIds.length !== 0 : !memberIds.length))
    fail('Проверьте участников: личный чат — два сотрудника, закрытый канал — выбранные участники, открытый — вся компания.');
  return memberIds;
}
function conversationInput(body) {
  object(body, ['id', 'responsibilityScopeId', 'kind', 'title', 'memberIds', 'visibility']);
  if (!['channel', 'direct'].includes(body.kind)) fail('Выберите канал или личный чат.');
  const visibility = body.visibility === undefined ? (body.kind === 'direct' ? 'private' : 'public') : body.visibility;
  const memberIds = conversationMembers(visibility, body.memberIds, body.kind === 'direct');
  return { id: uuid(body.id), responsibilityScopeId: uuid(body.responsibilityScopeId, 'область работы'), kind: body.kind, visibility,
    title: string((body.title === undefined || body.title === '') && body.kind === 'direct' ? 'Личный чат' : body.title, 160, 'название'), memberIds };
}
function conversationAccessInput(body) {
  object(body, ['responsibilityScopeId', 'operationId', 'version', 'visibility', 'memberIds']);
  if (!Number.isSafeInteger(body.version) || body.version < 1 || body.version >= 2147483646) fail('Укажите актуальную версию доступа к каналу.');
  return { responsibilityScopeId: uuid(body.responsibilityScopeId, 'область работы'), operationId: uuid(body.operationId, 'операция'),
    version: body.version, visibility: body.visibility, memberIds: conversationMembers(body.visibility, body.memberIds) };
}
function channelManagementInput(body, operation) {
  object(body, ['responsibilityScopeId', 'operationId', 'version', ...(operation === 'order' ? ['direction', 'targetId', 'targetVersion', 'placement'] : ['action'])]);
  if (!Number.isSafeInteger(body.version) || body.version < 1 || body.version >= 2147483646) fail('Укажите актуальную версию канала.');
  const result = { responsibilityScopeId: uuid(body.responsibilityScopeId, 'область работы'), operationId: uuid(body.operationId, 'операция'), version: body.version };
  if (operation !== 'order') {
    if (!['archive', 'restore', 'delete'].includes(body.action)) fail('Выберите действие с каналом.');
    return { ...result, action: body.action };
  }
  if ('direction' in body) {
    if (['targetId', 'targetVersion', 'placement'].some(field => field in body) || !['up', 'down'].includes(body.direction)) fail('Выберите один способ перемещения канала.');
    return { ...result, direction: body.direction };
  }
  if (!Number.isSafeInteger(body.targetVersion) || body.targetVersion < 1 || body.targetVersion >= 2147483646) fail('Укажите актуальную версию соседнего канала.');
  if (!['before', 'after'].includes(body.placement)) fail('Выберите положение канала.');
  return { ...result, targetId: uuid(body.targetId, 'соседний канал'), targetVersion: body.targetVersion, placement: body.placement };
}
function messageInput(body) {
  object(body, ['id', 'responsibilityScopeId', 'conversationId', 'parentId', 'text', 'attachments', 'mentions']);
  const attachments = attachmentsInput(body.attachments);
  if (typeof body.text !== 'string' || body.text.length > 12000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(body.text)) fail('Проверьте поле «сообщение».');
  const text = body.text.trim();
  if (!text && !attachments.length) fail('Добавьте сообщение или прикрепите файл.');
  const result = { id: uuid(body.id), responsibilityScopeId: uuid(body.responsibilityScopeId, 'область работы'),
    conversationId: uuid(body.conversationId, 'чат'), parentId: body.parentId == null ? null : uuid(body.parentId, 'ветка'),
    text, attachments, mentions: mentionsInput(body.mentions, text) };
  if (result.id === result.parentId) fail('Сообщение не может отвечать самому себе.');
  return result;
}
function mentionsInput(value, text) {
  if (value === undefined) value = { userIds: [], all: false };
  object(value, ['userIds', 'all']);
  if (!Array.isArray(value.userIds) || value.userIds.length > 100 || typeof value.all !== 'boolean') fail('Проверьте список упоминаний.');
  const userIds = value.userIds.map(id => uuid(id, 'упоминание')).sort();
  if (new Set(userIds).size !== userIds.length) fail('Упоминания сотрудников не должны повторяться.');
  const matches = [...text.matchAll(/@\[([^\]\r\n]+)\]\(user:([0-9a-f-]{36})\)/gi)];
  if (matches.some(match => !match[1].trim())) fail('У упоминания должно быть видимое имя.');
  const tokens = matches.map(match => uuid(match[2], 'упоминание'));
  const visibleIds = [...new Set(tokens)].sort();
  const all = /(^|[\s(])@all(?=$|[\s.,!?;:)\]])/.test(text);
  if (JSON.stringify(userIds) !== JSON.stringify(visibleIds) || all !== value.all) fail('Упоминания должны совпадать с именами в тексте сообщения.');
  return { userIds, all };
}
function messageControlInput(body, action) {
  object(body, action === 'edit' ? ['responsibilityScopeId', 'operationId', 'version', 'text', 'mentions'] : ['responsibilityScopeId', 'operationId', 'version']);
  if (!Number.isSafeInteger(body.version) || body.version < 1 || body.version >= 2147483646) fail('Укажите актуальную версию сообщения.');
  const result = { responsibilityScopeId: uuid(body.responsibilityScopeId, 'область работы'), operationId: uuid(body.operationId, 'операция'), version: body.version };
  if (action === 'edit') {
    if (typeof body.text !== 'string' || body.text.length > 12000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(body.text)) fail('Проверьте поле «сообщение».');
    result.text = body.text.trim();
    result.mentions = mentionsInput(body.mentions, result.text);
  }
  return result;
}
function reactionInput(body) {
  object(body, ['responsibilityScopeId', 'emoji', 'present']);
  if (!REACTION_EMOJI.includes(body.emoji) || typeof body.present !== 'boolean') fail('Выберите допустимую реакцию.');
  return { responsibilityScopeId: uuid(body.responsibilityScopeId, 'область работы'), emoji: body.emoji, present: body.present };
}
function moderationInput(body) {
  object(body, ['responsibilityScopeId', 'operationId', 'enabled']);
  if (typeof body.enabled !== 'boolean') fail('Укажите состояние режима общения.');
  return { responsibilityScopeId: uuid(body.responsibilityScopeId, 'область работы'), operationId: uuid(body.operationId, 'операция'), enabled: body.enabled };
}
function messageReadInput(body) {
  object(body, ['responsibilityScopeId', 'messages']);
  if (!Array.isArray(body.messages) || !body.messages.length || body.messages.length > 100) fail('Укажите от 1 до 100 показанных сообщений.');
  const messages = body.messages.map(message => {
    object(message, ['id', 'version']);
    if (!Number.isSafeInteger(message.version) || message.version < 1 || message.version >= 2147483646) fail('Укажите версию показанного сообщения.');
    return { id: uuid(message.id, 'сообщение'), version: message.version };
  });
  if (new Set(messages.map(message => message.id)).size !== messages.length) fail('Сообщения не должны повторяться.');
  return { responsibilityScopeId: uuid(body.responsibilityScopeId, 'область работы'), messages };
}
function notificationPreferencesInput(body, scoped = false) {
  object(body, scoped ? ['responsibilityScopeId', 'muteNotifications', 'muteSound'] : ['muteNotifications', 'muteSound']);
  if (typeof body.muteNotifications !== 'boolean' || typeof body.muteSound !== 'boolean') fail('Укажите настройки уведомлений и звука.');
  return { ...(scoped ? { responsibilityScopeId: uuid(body.responsibilityScopeId, 'область работы') } : {}),
    muteNotifications: body.muteNotifications, muteSound: body.muteSound };
}
function articleInput(body) {
  const fields = ['reason', 'purpose', 'result', 'audiencePositionIds'];
  object(body, ['id', 'responsibilityScopeId', 'title', 'body', 'version', ...fields]);
  if (!Number.isSafeInteger(body.version) || body.version < 0 || body.version >= 2147483646) fail('Некорректная версия статьи. Обновите страницу.');
  const result = { id: uuid(body.id), responsibilityScopeId: uuid(body.responsibilityScopeId, 'область работы'),
    title: string(body.title, 200, 'тема'), body: string(body.body, 60000, 'текст статьи'), version: body.version,
    structured: fields.some(field => field in body) };
  if (result.structured) {
    result.reason = string(body.reason, 4000, 'причина создания');
    result.purpose = string(body.purpose, 4000, 'задача создания');
    result.result = string(body.result, 4000, 'результат');
    if (!Array.isArray(body.audiencePositionIds) || !body.audiencePositionIds.length || body.audiencePositionIds.length > 100) fail('Выберите от 1 до 100 должностей в поле «Для кого».');
    result.audiencePositionIds = body.audiencePositionIds.map(id => uuid(id, 'должность')).sort();
    if (new Set(result.audiencePositionIds).size !== result.audiencePositionIds.length) fail('Выбранные должности не должны повторяться.');
  }
  return result;
}
module.exports = { fail, conflict, forbidden, unavailable, object, uuid, string, conversationInput, conversationAccessInput, channelManagementInput, messageInput, articleInput,
  attachmentsInput, attachmentFilename, attachmentDisposition, mentionsInput, messageControlInput, reactionInput, moderationInput, messageReadInput, notificationPreferencesInput, REACTION_EMOJI,
  MAX_ATTACHMENT_BYTES, MAX_KNOWLEDGE_FILE_BYTES, MAX_ATTACHMENTS };
