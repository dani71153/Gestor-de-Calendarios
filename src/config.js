const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');
const envPath = path.join(rootDir, '.env');

if (fs.existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

module.exports = {
  port: Number(process.env.PORT || 3000),
  databasePath: path.resolve(rootDir, process.env.DATABASE_PATH || 'data/calendar-manager.sqlite'),
  sessionSecret: process.env.SESSION_SECRET || 'development-only-secret',
  integrationEncryptionKey: process.env.INTEGRATION_ENCRYPTION_KEY || process.env.SESSION_SECRET || 'development-only-encryption-key',
  timezone: process.env.DEFAULT_TIMEZONE || 'America/Santo_Domingo',
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    redirectUri: process.env.GOOGLE_REDIRECT_URI || `http://localhost:${process.env.PORT || 3000}/api/integrations/google/callback`
  },
  rootDir
};
