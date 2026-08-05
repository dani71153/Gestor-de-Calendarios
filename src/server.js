const express = require('express');
const path = require('node:path');
const config = require('./config');
const { initializeDatabase } = require('./database');
const { authMiddleware, csrfMiddleware, registerAuthRoutes } = require('./auth');
const { securityHeaders, requireSameOrigin } = require('./security');
const { registerEventRoutes } = require('./events');
const { registerAdministrationRoutes } = require('./administration');
const { registerSettingsRoutes } = require('./settings');
const { registerReminderRoutes, startReminderScheduler } = require('./reminders');
const { registerReportRoutes } = require('./reports');
const { IntegrationRepository } = require('./integrations/integration.repository');
const { ProviderSettingsRepository } = require('./integrations/provider-settings.repository');
const { GoogleCalendarProvider } = require('./integrations/google-calendar.provider');
const { SyncService } = require('./integrations/sync.service');
const { registerIntegrationRoutes } = require('./integrations/integration.routes');

initializeDatabase();

const app = express();
app.disable('x-powered-by');
if (config.isProduction) app.set('trust proxy', 1);
app.use(securityHeaders);
app.use(express.json({ limit: '1mb' }));
app.use('/api', requireSameOrigin, csrfMiddleware);
app.use(express.static(path.join(config.rootDir, 'public')));

app.get('/api/health', (req, res) => {
  res.json({ success: true, status: 'ok', timezone: config.timezone });
});

registerAuthRoutes(app);
registerEventRoutes(app, authMiddleware);
registerAdministrationRoutes(app, authMiddleware);
registerSettingsRoutes(app, authMiddleware);
registerReminderRoutes(app, authMiddleware);
registerReportRoutes(app, authMiddleware);
const integrationRepository = new IntegrationRepository();
const providerSettingsRepository = new ProviderSettingsRepository(config.google);
const googleProvider = new GoogleCalendarProvider(() => providerSettingsRepository.credentials('google'));
const syncService = new SyncService({ provider: googleProvider, repository: integrationRepository });
registerIntegrationRoutes(app, {
  authMiddleware,
  provider: googleProvider,
  repository: integrationRepository,
  settingsRepository: providerSettingsRepository,
  syncService
});

app.use('/api', (req, res) => {
  res.status(404).json({ success: false, error: 'Ruta no encontrada' });
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({ success: false, error: 'Error interno del servidor' });
});

const server = app.listen(config.port, () => {
  console.log(`Gestor de Calendarios disponible en http://localhost:${config.port}`);
  if (config.isProduction && !config.cookieSecure) {
    console.warn(
      'COOKIE_SECURE=false: la cookie de sesión viaja sin el atributo Secure. '
      + 'Úsalo solo en una red local de confianza y quítalo al servir por HTTPS.'
    );
  }
});
startReminderScheduler();

module.exports = { app, server };
