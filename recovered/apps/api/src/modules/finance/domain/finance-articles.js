'use strict';

const clean = (value) =>
  String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ');
const normalizeArticleName = (value) =>
  clean(value).toLocaleLowerCase('ru').replace(/ё/g, 'е');
const normalizeArticleCode = (value) => clean(value).toLocaleUpperCase('ru');
const unpack = (row) => ({
  ...row,
  ...(row?.data || {}),
  id: row?.id || row?.data?.id,
});
function fail(code, message) {
  const error = new Error(`FINANCE_ARTICLE_${code}: ${message}`);
  Object.assign(error, {
    code: `FINANCE_ARTICLE_${code}`,
    status: 400,
    userMessage: message,
  });
  throw error;
}
function field(value, max, label, required = false) {
  if (value != null && typeof value !== 'string')
    fail('INVALID', `Проверьте поле «${label}».`);
  if (/[\u0000-\u001f\u007f]/.test(value || ''))
    fail('INVALID', `Недопустимые символы в поле «${label}».`);
  const text = clean(value);
  if ((required && !text) || text.length > max)
    fail('INVALID', `Проверьте поле «${label}».`);
  return text;
}
function validateArticle(raw = {}) {
  const value = unpack(raw);
  for (const field of ['archived', 'active'])
    if (value[field] !== undefined && typeof value[field] !== 'boolean')
      fail('INVALID', 'Состояние статьи должно быть логическим значением.');
  value.name = field(value.name, 200, 'Название', true);
  value.code = normalizeArticleCode(field(value.code, 60, 'Код'));
  value.group = field(value.group, 120, 'Группа');
  value.description = field(value.description, 2000, 'Описание');
  if (!['income', 'expense', 'other'].includes(value.category))
    fail('CATEGORY', 'Выберите тип статьи: доходы, расходы или прочее.');
  if (value.directionIds == null) value.directionIds = [];
  if (
    !Array.isArray(value.directionIds) ||
    value.directionIds.length > 200 ||
    value.directionIds.some(
      (id) =>
        typeof id !== 'string' ||
        !id.trim() ||
        id !== id.trim() ||
        id === '__unassigned__',
    )
  )
    fail(
      'DIRECTIONS',
      'Выберите направления статьи; пустой список означает все направления.',
    );
  value.directionIds = [...new Set(value.directionIds)];
  return value;
}
function records(state) {
  const rows = Array.isArray(state)
    ? state
    : state?.catalogs || state?.articles || [];
  return rows
    .filter((row) => typeof row === 'object' && row)
    .map(unpack)
    .filter((row) => !row.kind || row.kind === 'articles');
}
function articleBelongs(article, input) {
  if (
    input.legalEntityId &&
    article.legalEntityId &&
    article.legalEntityId !== input.legalEntityId &&
    !article.legalEntityIds?.includes(input.legalEntityId)
  )
    return false;
  const requested =
    input.responsibilityScopeIds ||
    input.scopeIds ||
    [input.responsibilityScopeId].filter(Boolean);
  const permitted = article.responsibilityScopeIds || article.scopeIds || [];
  return !permitted.length || requested.every((id) => permitted.includes(id));
}
function articleApplies(article, directionIds) {
  return (
    !article.directionIds?.length ||
    directionIds.every((id) => article.directionIds.includes(id))
  );
}
function resolveArticle(input = {}, state = {}, options = {}) {
  const directionIds = [
    ...new Set(
      options.directionIds ||
        input.directionIds ||
        [input.directionId].filter(Boolean),
    ),
  ];
  const all = records(state);
  const active = (row) =>
    options.allowArchived || (!row.archived && row.active !== false);
  if (input.articleId != null && input.articleId !== '') {
    if (typeof input.articleId !== 'string')
      fail('UNAVAILABLE', 'Статья недоступна.');
    const article = all.find((row) => row.id === input.articleId);
    if (!article || !articleBelongs(article, input))
      fail('UNAVAILABLE', 'Статья недоступна для этой организации.');
    if (!active(article))
      fail('ARCHIVED', 'Архивную статью нельзя выбрать для новой операции.');
    if (!articleApplies(article, directionIds))
      fail('DIRECTION', 'Статья не разрешена для всех направлений операции.');
    return { articleId: article.id, article: article.name };
  }
  const name = field(input.article, 200, 'Статья');
  if (!name) return { articleId: null, article: '' };
  const named = all.filter(
    (row) =>
      articleBelongs(row, input) &&
      normalizeArticleName(row.name) === normalizeArticleName(name),
  );
  const matches = named.filter(active);
  // Names are evidence, not authority. Ambiguous historical text is retained
  // for review and never creates a catalog entry or guesses a direction.
  if (!matches.length && named.length)
    fail('ARCHIVED', 'Архивную статью нельзя выбрать для новой операции.');
  if (matches.length === 1 && !articleApplies(matches[0], directionIds))
    fail('DIRECTION', 'Статья не разрешена для всех направлений операции.');
  if (matches.length === 1)
    return { articleId: matches[0].id, article: matches[0].name };
  return {
    articleId: null,
    article: name,
    articleWarning: {
      code: 'LEGACY_ARTICLE',
      message:
        matches.length > 1
          ? 'Название соответствует нескольким статьям; выберите статью.'
          : 'Статья источника не сопоставлена со справочником.',
    },
  };
}
module.exports = {
  normalizeArticleName,
  normalizeArticleCode,
  validateArticle,
  resolveArticle,
  articleBelongs,
  articleApplies,
};
