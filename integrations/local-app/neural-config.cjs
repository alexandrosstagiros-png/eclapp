'use strict';
const fs = require('node:fs/promises');
const KEYS = new Set(['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'DASHSCOPE_API_KEY', 'DASHSCOPE_WORKSPACE_ID', 'ZHIPU_API_KEY', 'YANDEX_API_KEY', 'YANDEX_FOLDER_ID']);
// Local integrations are explicit opt-ins; never inherit shell credentials.
async function readNeuralEnvironment(filename) {
  const stat = await fs.lstat(filename).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
  if (!stat) return {};
  if (!stat.isFile() || stat.size > 32768 || (stat.mode & 0o077) || (process.getuid && stat.uid !== process.getuid())) {
    throw new Error('Настройка нейросетей должна быть обычным файлом владельца с правами 0600 и размером до 32 КБ.');
  }
  let config;
  try { config = JSON.parse(await fs.readFile(filename, 'utf8')); }
  catch { throw new Error('Не удалось прочитать настройки нейросетей. Проверьте JSON в neural.json.'); }
  if (!config || typeof config !== 'object' || Array.isArray(config) || Object.keys(config).some(key => !KEYS.has(key))) throw new Error('В настройке нейросетей есть неизвестные поля.');
  const result = {};
  for (const [key, value] of Object.entries(config)) {
    if (typeof value !== 'string' || !value || value.length > 4096 || /[\u0000-\u0020\u007f]/.test(value)) throw new Error('Проверьте формат ключей нейросетей в neural.json.');
    result[key] = value;
  }
  return result;
}
module.exports = { readNeuralEnvironment };
