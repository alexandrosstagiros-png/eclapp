'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID, createHash } = require('node:crypto');
const { messageInput, attachmentDisposition, MAX_ATTACHMENT_BYTES } = require('../recovered/apps/api/src/modules/team/team-input');
const file = (patch = {}) => ({ id: randomUUID(), filename: 'Отчёт.pdf', mimeType: 'application/pdf', contentBase64: Buffer.from('Документ').toString('base64'), ...patch });
const message = (patch = {}) => ({ id: randomUUID(), responsibilityScopeId: randomUUID(), conversationId: randomUUID(), text: '', attachments: [file()], ...patch });
const invalid = body => assert.throws(() => messageInput(body), error => error.getStatus?.() === 400 && error.getResponse?.().code === 'TEAM_VALIDATION');

test('file-only messages accept empty files and derive stable bytes, size and sha256', () => {
  const parsed = messageInput(message());
  assert.equal(parsed.text, '');
  assert.equal(parsed.attachments[0].filename, 'Отчёт.pdf');
  assert.equal(parsed.attachments[0].content.toString(), 'Документ');
  assert.equal(parsed.attachments[0].byteSize, Buffer.byteLength('Документ'));
  assert.equal(parsed.attachments[0].sha256, createHash('sha256').update('Документ').digest('hex'));
  const empty = messageInput(message({ text: '  ', attachments: [file({ contentBase64: '' })] }));
  assert.equal(empty.attachments[0].byteSize, 0);
  assert.deepEqual(messageInput(message({ text: 'Text', attachments: undefined })).attachments, []);
  for (const attachments of [undefined, []]) invalid(message({ text: '  ', attachments }));
});

test('attachment validation rejects forged fields, duplicate IDs and noncanonical base64', () => {
  for (const contentBase64 of [undefined, null, 12, 'a', 'Zg', 'Zg=', 'Zh==', 'Zm9=', 'Zg===', 'Z g==', 'Zg==\n', '-_==', '=AAA', '====', 'Zg==AAAA'])
    invalid(message({ attachments: [file({ contentBase64 })] }));
  for (const attachments of [null, {}, [null], [file({ id: 'bad' })], [file({ byteSize: 0 })], Array.from({ length: 6 }, () => file())]) invalid(message({ attachments }));
  const duplicate = file();
  invalid(message({ attachments: [duplicate, duplicate] }));
  for (const mimeType of ['', undefined, 'text', 'text/html; charset=utf-8', 'text/plain\r\nX-Test: bad', 'a'.repeat(128)])
    invalid(message({ attachments: [file({ mimeType })] }));
  assert.equal(messageInput(message({ attachments: [file({ mimeType: 'Application/PDF' })] })).attachments[0].mimeType, 'application/pdf');
});

test('file names are normalized, bounded in UTF-8 and safe for HTTP headers', () => {
  for (const filename of ['', ' ', '.', '..', '../secret', 'a/b', 'a\\b', 'bad\nname', 'bad\tname', 'bad\u0000name', 'bad\u007fname', 'bad\u0085name',
    'bad\u202ename', 'bad\u2066name', 'bad\u200fname', '\ud800', '\udc00', 'я'.repeat(128)]) invalid(message({ attachments: [file({ filename })] }));
  const parsed = messageInput(message({ attachments: [file({ filename: '  cafe\u0301.txt  ' })] }));
  assert.equal(parsed.attachments[0].filename, 'café.txt');
  const astral = messageInput(message({ attachments: [file({ filename: '📎.txt' })] }));
  assert.equal(astral.attachments[0].filename, '📎.txt');
  const header = attachmentDisposition('Отчёт "финальный".pdf');
  assert.match(header, /^attachment; filename="[A-Za-z0-9._ -]+"; filename\*=UTF-8''/);
  assert.ok(header.endsWith(encodeURIComponent('Отчёт "финальный".pdf')));
  assert.equal(/[\r\n]/.test(header), false);
  assert.match(attachmentDisposition("Report'()*!.pdf"), /filename\*=UTF-8''Report%27%28%29%2A!\.pdf$/);
});

test('the total decoded byte limit accepts exactly the configured message size and rejects excess across files', () => {
  const half = Buffer.alloc(MAX_ATTACHMENT_BYTES / 2, 97).toString('base64');
  const accepted = messageInput(message({ attachments: [file({ contentBase64: half }), file({ contentBase64: half })] }));
  assert.equal(accepted.attachments.reduce((total, attachment) => total + attachment.byteSize, 0), MAX_ATTACHMENT_BYTES);
  invalid(message({ attachments: [file({ contentBase64: half }), file({ contentBase64: half }), file({ contentBase64: 'YQ==' })] }));
  invalid(message({ attachments: [file({ contentBase64: Buffer.alloc(MAX_ATTACHMENT_BYTES + 1).toString('base64') })] }));
});
