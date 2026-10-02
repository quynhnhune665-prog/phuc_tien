const crypto = require('crypto');

function hashSHA256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function normalizeText(text) {
  return text
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9,;.()\-+×÷=°]/g, '')
    .trim();
}

function hashNormalized(text) {
  const normalized = normalizeText(text);
  return hashSHA256(normalized);
}

module.exports = {
  hashSHA256,
  normalizeText,
  hashNormalized
};
