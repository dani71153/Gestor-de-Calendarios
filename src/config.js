const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');
const envPath = path.join(rootDir, '.env');

if (fs.existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';

// Modos de arranque de datos. El predeterminado deja la base sin usuarios,
// calendarios ni eventos: los datos de demostración solo se cargan si se piden.
const SEED_MODES = ['blank', 'base', 'demo'];

function resolveSeedMode(env = process.env) {
  const requested = String(env.SEED_MODE || 'base').trim().toLowerCase();
  if (!SEED_MODES.includes(requested)) {
    throw new Error(`SEED_MODE inválido: "${requested}". Valores admitidos: ${SEED_MODES.join(', ')}`);
  }
  if (requested === 'demo' && (env.NODE_ENV || 'development') === 'production') {
    throw new Error('SEED_MODE=demo no está permitido en producción');
  }
  return requested;
}

// La cookie de sesión lleva el atributo Secure en producción. COOKIE_SECURE=false
// lo desactiva para servir por HTTP plano en una red local de confianza, donde no
// hay certificado y el navegador descartaría la cookie dejando el login inservible.
function resolveCookieSecure(env = process.env) {
  const requested = String(env.COOKIE_SECURE || '').trim().toLowerCase();
  if (requested === 'false' || requested === '0') return false;
  if (requested === 'true' || requested === '1') return true;
  return (env.NODE_ENV || 'development') === 'production';
}

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
  seedMode: resolveSeedMode(),
  cookieSecure: resolveCookieSecure(),
  port: Number(process.env.PORT || 3000),
  databasePath: path.resolve(rootDir, process.env.DATABASE_PATH || 'data/calendar-manager.sqlite'),
  sessionSecret: process.env.SESSION_SECRET || 'development-only-secret',
  integrationEncryptionKey: process.env.INTEGRATION_ENCRYPTION_KEY || process.env.SESSION_SECRET || 'development-only-encryption-key',
  timezone: process.env.DEFAULT_TIMEZONE || 'America/Santo_Domingo',
  // Apuntar BACKUP_PATH a una carpeta sincronizada o a un recurso de red es todo
  // lo que hace falta para que las copias salgan del equipo.
  backupPath: path.resolve(rootDir, process.env.BACKUP_PATH || 'data/backups'),
  backupRetention: Number(process.env.BACKUP_RETENTION || 30),
  backupEnabled: String(process.env.BACKUP_ENABLED || 'true').trim().toLowerCase() !== 'false',
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
module.exports.resolveSeedMode = resolveSeedMode;
module.exports.resolveCookieSecure = resolveCookieSecure;
module.exports.SEED_MODES = SEED_MODES;
