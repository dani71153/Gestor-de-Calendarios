const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');
const envPath = path.join(rootDir, '.env');

if (fs.existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';

function isUnsafeSecret(value = '') {
  const normalized = String(value).trim().toLowerCase();
  return normalized.length < 32
    || normalized.includes('change-this')
    || normalized.includes('development-only');
}

function validateProductionEnvironment(env = process.env) {
  if ((env.NODE_ENV || 'development') !== 'production') return [];
  const errors = [];
  if (!env.DATABASE_PATH?.trim()) errors.push('DATABASE_PATH es obligatorio en producción');
  if (isUnsafeSecret(env.SESSION_SECRET)) {
    errors.push('SESSION_SECRET debe tener al menos 32 caracteres y no puede usar el valor de desarrollo');
  }
  if (isUnsafeSecret(env.INTEGRATION_ENCRYPTION_KEY)) {
    errors.push('INTEGRATION_ENCRYPTION_KEY debe tener al menos 32 caracteres y ser explícito en producción');
  }
  if (env.SESSION_SECRET && env.SESSION_SECRET === env.INTEGRATION_ENCRYPTION_KEY) {
    errors.push('SESSION_SECRET e INTEGRATION_ENCRYPTION_KEY deben ser diferentes');
  }
  const googleConfigured = Boolean(env.GOOGLE_CLIENT_ID || env.GOOGLE_CLIENT_SECRET || env.GOOGLE_REDIRECT_URI);
  if (googleConfigured) {
    if (!env.GOOGLE_CLIENT_ID?.trim() || !env.GOOGLE_CLIENT_SECRET?.trim()) {
      errors.push('GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET deben configurarse juntos');
    }
    try {
      if (new URL(env.GOOGLE_REDIRECT_URI).protocol !== 'https:') {
        errors.push('GOOGLE_REDIRECT_URI debe usar HTTPS en producción');
      }
    } catch {
      errors.push('GOOGLE_REDIRECT_URI debe ser una URL HTTPS válida en producción');
    }
  }
  return errors;
}

const productionErrors = validateProductionEnvironment();
if (productionErrors.length) {
  throw new Error(`Configuración de producción inválida:\n- ${productionErrors.join('\n- ')}`);
}

module.exports = {
  nodeEnv,
  isProduction,
  port: Number(process.env.PORT || 3000),
  databasePath: path.resolve(rootDir, process.env.DATABASE_PATH || 'data/calendar-manager.sqlite'),
  sessionSecret: process.env.SESSION_SECRET || 'development-only-secret',
  integrationEncryptionKey: process.env.INTEGRATION_ENCRYPTION_KEY || process.env.SESSION_SECRET || 'development-only-encryption-key',
  timezone: process.env.DEFAULT_TIMEZONE || 'America/Santo_Domingo',
  initialAdmin: {
    name: process.env.INITIAL_ADMIN_NAME || 'Administrador',
    email: process.env.INITIAL_ADMIN_EMAIL || '',
    password: process.env.INITIAL_ADMIN_PASSWORD || ''
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    redirectUri: process.env.GOOGLE_REDIRECT_URI || `http://localhost:${process.env.PORT || 3000}/api/integrations/google/callback`
  },
  rootDir
};

module.exports.validateProductionEnvironment = validateProductionEnvironment;
module.exports.isUnsafeSecret = isUnsafeSecret;
