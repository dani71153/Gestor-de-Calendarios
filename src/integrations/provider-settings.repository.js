const { db } = require('../database');
const { encrypt, decrypt } = require('./token-cipher');

class ProviderSettingsRepository {
  constructor(fallbackSettings = {}) {
    this.fallbackSettings = fallbackSettings;
  }

  find(provider) {
    return db.prepare(`
      SELECT id, provider, client_id AS clientId,
             client_secret_encrypted AS clientSecretEncrypted,
             redirect_uri AS redirectUri, configured_by AS configuredBy,
             created_at AS createdAt, updated_at AS updatedAt
      FROM integration_provider_settings
      WHERE provider = ?
    `).get(provider);
  }

  credentials(provider) {
    const stored = this.find(provider);
    if (stored) {
      return {
        clientId: stored.clientId,
        clientSecret: decrypt(stored.clientSecretEncrypted),
        redirectUri: stored.redirectUri,
        source: 'database'
      };
    }
    return {
      clientId: this.fallbackSettings.clientId || '',
      clientSecret: this.fallbackSettings.clientSecret || '',
      redirectUri: this.fallbackSettings.redirectUri || '',
      source: 'environment'
    };
  }

  publicSettings(provider) {
    const credentials = this.credentials(provider);
    return {
      provider,
      configured: Boolean(credentials.clientId && credentials.clientSecret && credentials.redirectUri),
      clientId: credentials.clientId,
      clientSecretConfigured: Boolean(credentials.clientSecret),
      redirectUri: credentials.redirectUri,
      source: credentials.source
    };
  }

  save({ provider, clientId, clientSecret, redirectUri, configuredBy }) {
    const existing = this.find(provider);
    const fallbackSecret = this.fallbackSettings.clientSecret || '';
    const encryptedSecret = clientSecret
      ? encrypt(clientSecret)
      : existing?.clientSecretEncrypted || (fallbackSecret ? encrypt(fallbackSecret) : null);

    if (!encryptedSecret) {
      throw new Error('El Client Secret es obligatorio para la configuración inicial');
    }

    db.prepare(`
      INSERT INTO integration_provider_settings (
        provider, client_id, client_secret_encrypted, redirect_uri, configured_by
      ) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(provider) DO UPDATE SET
        client_id = excluded.client_id,
        client_secret_encrypted = excluded.client_secret_encrypted,
        redirect_uri = excluded.redirect_uri,
        configured_by = excluded.configured_by,
        updated_at = CURRENT_TIMESTAMP
    `).run(provider, clientId, encryptedSecret, redirectUri, configuredBy);

    return this.publicSettings(provider);
  }

  remove(provider) {
    db.prepare('DELETE FROM integration_provider_settings WHERE provider = ?').run(provider);
    return this.publicSettings(provider);
  }
}

module.exports = { ProviderSettingsRepository };
