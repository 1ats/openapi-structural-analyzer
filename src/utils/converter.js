const yaml = require('js-yaml');
const crypto = require('crypto');

function parseContentToJson(content) {
  if (typeof content === 'object') return content;
  try {
    return JSON.parse(content);
  } catch (e) {
    // Se falhar o parse JSON, tenta converter como YAML
    return yaml.load(content);
  }
}

function generateSHA256(content) {
  const strContent = typeof content === 'object' ? JSON.stringify(content) : content;
  return crypto.createHash('sha256').update(strContent).digest('hex');
}

module.exports = { parseContentToJson, generateSHA256 };