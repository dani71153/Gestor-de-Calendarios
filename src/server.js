const express = require('express');
const path = require('node:path');
const config = require('./config');
const { initializeDatabase } = require('./database');
const { authMiddleware, csrfMiddleware, registerAuthRoutes } = require('./auth');
const { securityHeaders, requireSameOrigin } = require('./security');
const { registerEventRoutes } = require('./events');
const { registerAttachmentRoutes, MAX_ATTACHMENT_BYTES } = require('./attachments');
const { registerAdministrationRoutes } = require('./administration');
const { registerSettingsRoutes } = require('./settings');
const { registerReminderRoutes, startReminderScheduler } = require('./reminders');
const { startBackupScheduler } = require('./backup');
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
// El cuerpo multipart llega sin parsear a la ruta de subida, que lo interpreta
// con Response.formData(). El margen sobre el límite cubre las cabeceras del
// propio formulario, para que el rechazo por tamaño lo dé la ruta con su mensaje.
registerAttachmentRoutes(app, authMiddleware, express.raw({
  type: 'multipart/form-data',
  limit: MAX_ATTACHMENT_BYTES + 512 * 1024
}));
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
  // Los errores del parser de cuerpo traen su propio código y describen algo que
  // hizo el cliente; devolverlos como 500 ocultaba el motivo real.
  if (error?.type === 'entity.too.large') {
    return res.status(413).json({
      success: false,
      error: `El archivo supera el límite de ${Math.round(MAX_ATTACHMENT_BYTES / 1024 / 1024)} MB`
    });
  }
  if (error?.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, error: 'El cuerpo de la solicitud no es JSON válido' });
  }
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
startBackupScheduler();

module.exports = { app, server };
