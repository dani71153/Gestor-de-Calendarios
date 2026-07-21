const { db } = require('../database');
const { encrypt, decrypt } = require('./token-cipher');

class IntegrationRepository {
  find(provider, userId) {
    return db.prepare(`
      SELECT id, provider, user_id AS userId, account_email AS accountEmail,
             access_token_encrypted AS accessTokenEncrypted,
             refresh_token_encrypted AS refreshTokenEncrypted,
             expires_at AS expiresAt, scope, status, last_error AS lastError,
             created_at AS createdAt, updated_at AS updatedAt
      FROM integrations WHERE provider = ? AND user_id = ?
    `).get(provider, userId);
  }

  findById(id) {
    return db.prepare(`
      SELECT id, provider, user_id AS userId, account_email AS accountEmail,
             access_token_encrypted AS accessTokenEncrypted,
             refresh_token_encrypted AS refreshTokenEncrypted,
             expires_at AS expiresAt, scope, status, last_error AS lastError
      FROM integrations WHERE id = ?
    `).get(id);
  }

  findActive(provider, userId) {
    const integration = this.find(provider, userId);
    return integration?.status === 'active' ? integration : null;
  }

  credentials(integration) {
    if (!integration) return null;
    return {
      accessToken: decrypt(integration.accessTokenEncrypted),
      refreshToken: decrypt(integration.refreshTokenEncrypted),
      expiresAt: integration.expiresAt,
      scope: integration.scope
    };
  }

  saveTokens({ provider, userId, accountEmail, accessToken, refreshToken, expiresAt, scope }) {
    const existing = this.find(provider, userId);
    const accountChanged = existing?.accountEmail && accountEmail
      && existing.accountEmail.toLowerCase() !== accountEmail.toLowerCase();
    const accessEncrypted = accessToken ? encrypt(accessToken) : existing?.accessTokenEncrypted;
    const refreshEncrypted = refreshToken ? encrypt(refreshToken) : existing?.refreshTokenEncrypted;

    db.prepare(`
      INSERT INTO integrations (
        provider, user_id, account_email, access_token_encrypted,
        refresh_token_encrypted, expires_at, scope, status, last_error
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', NULL)
      ON CONFLICT(provider, user_id) DO UPDATE SET
        account_email = excluded.account_email,
        access_token_encrypted = excluded.access_token_encrypted,
        refresh_token_encrypted = excluded.refresh_token_encrypted,
        expires_at = excluded.expires_at,
        scope = excluded.scope,
        status = 'active',
        last_error = NULL,
        updated_at = CURRENT_TIMESTAMP
    `).run(
      provider, userId, accountEmail || existing?.accountEmail || null,
      accessEncrypted, refreshEncrypted, expiresAt || null, scope || null
    );
    if (accountChanged) {
      db.prepare('DELETE FROM integration_sync_states WHERE integration_id = ?').run(existing.id);
    }
    return this.find(provider, userId);
  }

  updateAccessToken(id, accessToken, expiresAt) {
    db.prepare(`
      UPDATE integrations SET access_token_encrypted = ?, expires_at = ?,
      status = 'active', last_error = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(encrypt(accessToken), expiresAt, id);
  }

  markError(id, message) {
    db.prepare(`
      UPDATE integrations SET status = 'error', last_error = ?,
      updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(String(message).slice(0, 1000), id);
  }

  disconnect(provider, userId) {
    db.prepare(`
      UPDATE integrations SET status = 'disconnected',
      access_token_encrypted = NULL, refresh_token_encrypted = NULL,
      updated_at = CURRENT_TIMESTAMP WHERE provider = ? AND user_id = ?
    `).run(provider, userId);
  }
}

module.exports = { IntegrationRepository };
