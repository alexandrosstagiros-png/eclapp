// SPDX-License-Identifier: MIT
'use strict';

// Call only after scope and visibility checks. These remain independent stored
// articles; the combined library shows one accessible copy of an exact import.
function knowledgeArticleKey(article) {
  if (!article.sourceFile) return null;
  return JSON.stringify([article.title, article.body, article.folderPath, article.visibility,
    article.sourceFile.sha256, article.sourceFile.filename, article.sourceFile.mimeType,
    Boolean(article.structured), article.reason || null, article.purpose || null, article.result || null,
    (article.audiencePositions || []).map(position => [position.id, position.title]).sort((a, b) => a[0].localeCompare(b[0]))]);
}
function deduplicateKnowledgeArticles(articles) {
  const imported = new Map(), manual = [];
  for (const article of articles) {
    if (!article.sourceFile) {
      manual.push(article);
      continue;
    }
    const key = knowledgeArticleKey(article);
    const previous = imported.get(key);
    if (!previous || (article.canEdit && !previous.canEdit) ||
      (Boolean(article.canEdit) === Boolean(previous.canEdit) && article.id < previous.id)) imported.set(key, article);
  }
  return [...manual, ...imported.values()];
}

module.exports = { knowledgeArticleKey, deduplicateKnowledgeArticles };
