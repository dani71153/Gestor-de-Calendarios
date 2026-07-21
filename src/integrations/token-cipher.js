const crypto = require('node:crypto');
const config = require('../config');

const algorithm = 'aes-256-gcm';
const key = crypto.scryptSync(config.integrationEncryptionKey, 'calendar-manager-integrations-v1', 32);

function encrypt(value) {
  if (!value) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((part) => part.toString('base64url')).join('.');
}

function decrypt(payload) {
  if (!payload) return null;
  const [ivValue, tagValue, encryptedValue] = payload.split('.');
  if (!ivValue || !tagValue || !encryptedValue) throw new Error('Token cifrado inválido');
  const decipher = crypto.createDecipheriv(algorithm, key, Buffer.from(ivValue, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, 'base64url')),
    decipher.final()
  ]).toString('utf8');
}

module.exports = { encrypt, decrypt };
