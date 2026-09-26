"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const input = require("../recovered/apps/api/src/modules/development/development-input");

const ticket = (patch = {}) => ({
  id: randomUUID(), responsibilityScopeId: randomUUID(), version: 0,
  title: "Не сохраняется карточка тендера", description: "После сохранения пропадает срок подачи.",
  section: "tenders", status: "new", ...patch,
});
const comment = (patch = {}) => ({
  id: randomUUID(), ticketId: randomUUID(), responsibilityScopeId: randomUUID(),
  text: "Ошибка повторяется после обновления страницы", ...patch,
});
const invalid = operation => assert.throws(operation,
  error => error.getStatus?.() === 400 && error.getResponse?.().code === "DEVELOPMENT_VALIDATION");

test("ticket text is trimmed and preserves the employee's multiline explanation", () => {
  const saved = input.ticketInput(ticket({ title: "  Срок подачи  ", description: "  Открыл карточку\nИзменил срок\nНажал сохранить  " }));
  assert.equal(saved.title, "Срок подачи");
  assert.equal(saved.description, "Открыл карточку\nИзменил срок\nНажал сохранить");
  assert.equal(saved.status, "new");
  assert.equal(saved.version, 0);
});

test("only the six workflow stages and existing application sections are accepted", () => {
  for (const status of ["new", "clarifying", "ready", "in_progress", "review", "done"]) {
    assert.equal(input.ticketInput(ticket({ status })).status, status);
  }
  for (const section of ["tenders", "recruitment", "fleet", "planning", "access", "other"]) {
    assert.equal(input.ticketInput(ticket({ section })).section, section);
  }
  for (const patch of [{ status: "published" }, { status: "" }, { section: "unknown" }, { section: "" }]) {
    invalid(() => input.ticketInput(ticket(patch)));
  }
});

test("ticket writes require valid identifiers, a title and an optimistic version", () => {
  for (const version of [undefined, null, -1, 1.5, "1", 2147483646, Number.MAX_SAFE_INTEGER, NaN]) {
    invalid(() => input.ticketInput(ticket({ version })));
  }
  for (const patch of [{ id: "bad" }, { responsibilityScopeId: "" }, { title: "" }, { title: "  " }, { title: null }]) {
    invalid(() => input.ticketInput(ticket(patch)));
  }
  for (const body of [null, [], "text", new Date(), Object.create({})]) {
    invalid(() => input.ticketInput(body));
    invalid(() => input.commentInput(body));
  }
});

test("bounded input rejects control characters and cannot replace server-owned identity or timestamps", () => {
  for (const [field, maximum] of [["title", 200], ["description", 6000]]) {
    assert.equal(input.ticketInput(ticket({ [field]: "я".repeat(maximum) }))[field].length, maximum);
    for (const value of ["я".repeat(maximum + 1), "ошибка\u0000", "ошибка\u007f", 42]) {
      invalid(() => input.ticketInput(ticket({ [field]: value })));
    }
  }
  invalid(() => input.ticketInput(ticket({
    number: 1000, authorId: randomUUID(), authorName: "Подмена автора", legalEntityId: randomUUID(),
    createdAt: "2000-01-01", updatedAt: "2000-01-01", pipeline: "production",
  })));
  const saved = input.ticketInput(ticket());
  assert.deepEqual(Object.keys(saved).sort(), ["description", "id", "responsibilityScopeId", "section", "status", "title", "version"]);
});

test("comments require stable UUIDs and nonblank text, preserving only writable fields", () => {
  invalid(() => input.commentInput(comment({ actorId: randomUUID(), createdAt: "2000-01-01" })));
  const saved = input.commentInput(comment({ text: "  Повторилось\nВторой раз  " }));
  assert.equal(saved.text, "Повторилось\nВторой раз");
  assert.deepEqual(Object.keys(saved).sort(), ["id", "responsibilityScopeId", "text", "ticketId"]);
  assert.equal(input.commentInput(comment({ text: "я".repeat(4000) })).text.length, 4000);
  for (const patch of [{ id: null }, { ticketId: "bad" }, { responsibilityScopeId: "bad" }, { text: "" }, { text: "  " }, { text: "я".repeat(4001) }, { text: "a\u0000b" }]) {
    invalid(() => input.commentInput(comment(patch)));
  }
});
