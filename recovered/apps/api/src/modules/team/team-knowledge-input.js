// SPDX-License-Identifier: MIT
"use strict";
const { createHash } = require('node:crypto');
const { object, uuid, string, fail, attachmentFilename, attachmentsInput, MAX_KNOWLEDGE_FILE_BYTES } = require('./team-input');
const IMPORT_FILE_ID = '00000000-0000-4000-8000-000000000000';
function knowledgePath(value, allowEmpty = false) {
  if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') > 2048 || value.includes('\\')) fail('Некорректный путь документа.');
  if (allowEmpty && value === '') return '';
  const parts = value.split('/');
  if (parts.length > 32) fail('В пути документа слишком много папок.');
  return parts.map(attachmentFilename).join('/');
}
function articleImportId(scopeId, sourcePath) {
  const bytes = createHash('sha256').update(`team-knowledge-import:v1\0${scopeId}\0${sourcePath}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 15) | 128;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
function articleImportInput(body) {
  object(body, ['responsibilityScopeIds', 'visibility', 'sourcePath', 'folderPath', 'title', 'body', 'sourceArchive', 'file']);
  if (!Array.isArray(body.responsibilityScopeIds) || body.responsibilityScopeIds.length < 1 || body.responsibilityScopeIds.length > 100)
    fail('Выберите от 1 до 100 областей работы.');
  const responsibilityScopeIds = body.responsibilityScopeIds.map(id => uuid(id, 'область работы'));
  if (new Set(responsibilityScopeIds).size !== responsibilityScopeIds.length) fail('Области работы не должны повторяться.');
  if (!['scope', 'admin', 'staff'].includes(body.visibility)) fail('Выберите доступ области, сотрудников без водителей или только администратора.');
  const sourcePath = knowledgePath(body.sourcePath);
  const folderPath = knowledgePath(body.folderPath, true);
  object(body.file, ['filename', 'mimeType', 'contentBase64']);
  const file = attachmentsInput([{ ...body.file, id: IMPORT_FILE_ID }], MAX_KNOWLEDGE_FILE_BYTES)[0];
  const parts = sourcePath.split('/');
  if (parts.pop() !== file.filename || parts.join('/') !== folderPath) fail('Имя файла и папка должны совпадать с путём документа.');
  const title = string(body.title, 200, 'название');
  const text = string(body.body, 60000, 'текст статьи');
  return { responsibilityScopeIds, visibility: body.visibility, sourcePath, folderPath, title, body: text,
    bodySha256: createHash('sha256').update(text, 'utf8').digest('hex'), sourceArchive: attachmentFilename(body.sourceArchive), file };
}
function articleDeletionInput(body) {
  object(body, ['responsibilityScopeId', 'operationId', 'version']);
  if (!Number.isSafeInteger(body.version) || body.version < 1 || body.version >= 2147483646) fail('Укажите актуальную версию инструкции.');
  return { responsibilityScopeId: uuid(body.responsibilityScopeId, 'область работы'), operationId: uuid(body.operationId, 'операция'), version: body.version };
}
module.exports = { knowledgePath, articleImportId, articleImportInput, articleDeletionInput };
