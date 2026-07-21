const crypto = require('node:crypto');
const { db } = require('../database');
const {
  accessibleCalendarIds,
  calendarCapabilities,
  eventCapabilities,
  requireAdministrator
} = require('../authorization');

const oauthStates = new Map();
const STATE_DURATION_MS = 10 * 60 * 1000;

function requireSameOrigin(req, res, next) {
  const origin = req.get('origin');
  if (!origin) return next();
  const expectedOrigin = `${req.protocol}://${req.get('host')}`;
  if (origin !== expectedOrigin) {
    return res.status(403).json({ success: false, error: 'Origen de solicitud no permitido' });
  }
  next();
}

function validateProviderSettings(input) {
  if (!input.clientId?.trim()) return 'El Client ID es obligatorio';
  if (input.clientId.length > 500) return 'El Client ID es demasiado largo';
  if (input.clientSecret && input.clientSecret.length > 1000) return 'El Client Secret es demasiado largo';
  if (!input.redirectUri?.trim()) return 'La URI de redirección es obligatoria';
  try {
    const redirectUri = new URL(input.redirectUri);
    if (!['http:', 'https:'].includes(redirectUri.protocol)) return 'La URI debe usar HTTP o HTTPS';
    if (redirectUri.username || redirectUri.password) return 'La URI no puede contener credenciales';
    if (!redirectUri.pathname.endsWith('/api/integrations/google/callback')) {
      return 'La URI debe terminar en /api/integrations/google/callback';
    }
  } catch {
    return 'La URI de redirección no es válida';
  }
  return null;
}

function registerIntegrationRoutes(app, {
  authMiddleware,
  provider,
  repository,
  settingsRepository,
  syncService
}) {
  app.get(
    '/api/integrations/google/config',
    authMiddleware,
    requireAdministrator,
    (req, res) => {
      res.json({ success: true, settings: settingsRepository.publicSettings(provider.name) });
    }
  );

  app.put(
    '/api/integrations/google/config',
    authMiddleware,
    requireAdministrator,
    requireSameOrigin,
    (req, res) => {
      const input = req.body || {};
      const validationError = validateProviderSettings(input);
      if (validationError) {
        return res.status(400).json({ success: false, error: validationError });
      }

      const previous = settingsRepository.publicSettings(provider.name);
      const settings = settingsRepository.save({
        provider: provider.name,
        clientId: input.clientId.trim(),
        clientSecret: input.clientSecret?.trim() || null,
        redirectUri: input.redirectUri.trim(),
        configuredBy: req.user.id
      });
      db.prepare(`
        INSERT INTO audit_logs (
          user_id, action, entity_type, entity_id, old_values, new_values
        ) VALUES (?, 'configure', 'integration_provider', NULL, ?, ?)
      `).run(
        req.user.id,
        JSON.stringify(previous),
        JSON.stringify(settings)
      );
      res.json({ success: true, settings });
    }
  );

  app.delete(
    '/api/integrations/google/config',
    authMiddleware,
    requireAdministrator,
    requireSameOrigin,
    (req, res) => {
      const previous = settingsRepository.publicSettings(provider.name);
      const settings = settingsRepository.remove(provider.name);
      db.prepare(`
        INSERT INTO audit_logs (
          user_id, action, entity_type, entity_id, old_values, new_values
        ) VALUES (?, 'reset', 'integration_provider', NULL, ?, ?)
      `).run(req.user.id, JSON.stringify(previous), JSON.stringify(settings));
      res.json({ success: true, settings });
    }
  );

  app.get('/api/integrations/google/status', authMiddleware, (req, res) => {
    res.json({
      success: true,
      ...syncService.status(req.user.id, accessibleCalendarIds(req.user))
    });
  });

  app.post('/api/integrations/google/connect', authMiddleware, (req, res) => {
    try {
      const state = crypto.randomBytes(32).toString('base64url');
      oauthStates.set(state, { userId: req.user.id, expiresAt: Date.now() + STATE_DURATION_MS });
      res.json({ success: true, authorizationUrl: provider.getAuthorizationUrl(state) });
    } catch (error) {
      const status = error.code === 'PROVIDER_NOT_CONFIGURED' ? 503 : 500;
      res.status(status).json({ success: false, error: error.message, code: error.code });
    }
  });

  app.get('/api/integrations/google/callback', authMiddleware, async (req, res) => {
    const stateRecord = oauthStates.get(req.query.state);
    oauthStates.delete(req.query.state);
    if (!stateRecord || stateRecord.expiresAt < Date.now() || stateRecord.userId !== req.user.id) {
      return res.redirect('/?integration=error&message=Estado+OAuth+inválido');
    }
    if (req.query.error) {
      return res.redirect(`/?integration=error&message=${encodeURIComponent(req.query.error)}`);
    }
    if (!req.query.code) {
      return res.redirect('/?integration=error&message=Google+no+devolvió+un+código');
    }

    try {
      const tokens = await provider.exchangeCode(req.query.code);
      const account = await provider.getAccount(tokens.accessToken);
      repository.saveTokens({
        provider: provider.name,
        userId: req.user.id,
        accountEmail: account.email,
        ...tokens
      });
      res.redirect('/?integration=connected');
    } catch (error) {
      res.redirect(`/?integration=error&message=${encodeURIComponent(error.message)}`);
    }
  });

  app.delete('/api/integrations/google', authMiddleware, (req, res) => {
    repository.disconnect(provider.name, req.user.id);
    res.json({ success: true });
  });

  app.post('/api/events/:id/sync', authMiddleware, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const current = syncService.getEvent(id);
      if (!current) return res.status(404).json({ success: false, error: 'Evento no encontrado' });
      if (!eventCapabilities(req.user, current).canEdit) {
        return res.status(403).json({ success: false, error: 'No tienes permiso para sincronizar este evento' });
      }
      const event = await syncService.syncEvent(id, req.user.id);
      res.json({ success: true, event });
    } catch (error) {
      res.status(error.status && error.status < 500 ? 400 : 502).json({
        success: false,
        error: error.message
      });
    }
  });

  app.post('/api/sync/retry', authMiddleware, async (req, res) => {
    const results = await syncService.retry(
      req.user.id,
      (event) => eventCapabilities(req.user, event).canEdit
    );
    res.json({
      success: true,
      processed: results.length,
      succeeded: results.filter((item) => item.success).length,
      failed: results.filter((item) => !item.success).length,
      results
    });
  });

  app.post('/api/sync/import', authMiddleware, requireSameOrigin, async (req, res) => {
    const calendarId = Number(req.body?.calendarId);
    if (!calendarId) {
      return res.status(400).json({ success: false, error: 'Selecciona el calendario de destino' });
    }
    if (!calendarCapabilities(req.user, calendarId).canCreate) {
      return res.status(403).json({ success: false, error: 'No tienes permiso para importar en ese calendario' });
    }
    try {
      const result = await syncService.importChanges({
        userId: req.user.id,
        calendarId,
        canApply: (event) => eventCapabilities(req.user, event).canEdit
      });
      res.json({ success: true, result });
    } catch (error) {
      res.status(error.status && error.status < 500 ? 400 : 502).json({
        success: false,
        error: error.message
      });
    }
  });

  app.get('/api/sync/status', authMiddleware, (req, res) => {
    res.json({
      success: true,
      ...syncService.status(req.user.id, accessibleCalendarIds(req.user))
    });
  });
}

module.exports = { registerIntegrationRoutes };
