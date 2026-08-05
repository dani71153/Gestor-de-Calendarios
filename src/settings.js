const fs = require('node:fs');
const path = require('node:path');
const { db } = require('./database');
const { requireAdministrator } = require('./authorization');

const MAX_BACKUP_DESTINATIONS = 5;

const DEFAULT_SETTINGS = {
  distributionMaxCalendars: 5,
  distributionScaleMaxActivities: 10,
  defaultCalendarView: 'month',
  workdayStartHour: 8,
  workdayEndHour: 18,
  calendarSlotMinutes: 30,
  remindersEnabled: true,
  defaultReminderMinutes: 30,
  notificationsEnabled: true,
  browserPushEnabled: false,
  emailNotificationsEnabled: false,
  emailWebhookUrl: '',
  whatsappNotificationsEnabled: false,
  whatsappWebhookUrl: '',
  whatsappRecipient: '',
  notificationRetentionDays: 30,
  locationConflictsEnabled: true,
  resourceConflictsEnabled: true,
  googleIntegrationEnabled: true,
  // Lista vacía significa «usa BACKUP_PATH». Al añadir destinos desde la
  // interfaz, esta lista pasa a mandar sobre esa variable.
  backupDestinations: [],
  backupRetentionCount: 30,
  developerModeEnabled: false
};

// Se comprueba de verdad que se pueda escribir: aceptar una ruta de red caída
// daría una falsa sensación de respaldo hasta el día en que hiciera falta.
function checkDestination(destination) {
  if (!path.isAbsolute(destination) && !/^[a-zA-Z]:[\\/]/.test(destination) && !destination.startsWith('\\\\')) {
    return `La ruta "${destination}" debe ser absoluta`;
  }
  try {
    fs.mkdirSync(destination, { recursive: true });
    const probe = path.join(destination, `.escritura-${process.pid}.tmp`);
    fs.writeFileSync(probe, 'ok');
    fs.rmSync(probe, { force: true });
    return null;
  } catch (error) {
    return `No se puede escribir en "${destination}": ${error.code || error.message}`;
  }
}

function normalizeBackupDestinations(input) {
  const list = Array.isArray(input) ? input : [];
  const cleaned = [];
  const seen = new Set();

  for (const item of list) {
    const value = String(item || '').trim().replace(/[\\/]+$/, '');
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push(value);
  }

  if (cleaned.length > MAX_BACKUP_DESTINATIONS) {
    return { error: `No se admiten más de ${MAX_BACKUP_DESTINATIONS} destinos de respaldo` };
  }
  for (const destination of cleaned) {
    const error = checkDestination(destination);
    if (error) return { error };
  }
  return { destinations: cleaned };
}

function readSettings() {
  const stored = Object.fromEntries(db.prepare('SELECT key, value FROM system_settings').all().map((setting) => {
    try {
      return [setting.key, JSON.parse(setting.value)];
    } catch {
      return [setting.key, setting.value];
    }
  }));
  return { ...DEFAULT_SETTINGS, ...stored };
}

function normalizeSettings(input) {
  const settings = {
    distributionMaxCalendars: Number(input.distributionMaxCalendars),
    distributionScaleMaxActivities: Number(input.distributionScaleMaxActivities),
    defaultCalendarView: input.defaultCalendarView,
    workdayStartHour: Number(input.workdayStartHour),
    workdayEndHour: Number(input.workdayEndHour),
    calendarSlotMinutes: Number(input.calendarSlotMinutes),
    remindersEnabled: Boolean(input.remindersEnabled),
    defaultReminderMinutes: Number(input.defaultReminderMinutes),
    notificationsEnabled: Boolean(input.notificationsEnabled),
    browserPushEnabled: Boolean(input.browserPushEnabled),
    emailNotificationsEnabled: Boolean(input.emailNotificationsEnabled),
    emailWebhookUrl: String(input.emailWebhookUrl || '').trim(),
    whatsappNotificationsEnabled: Boolean(input.whatsappNotificationsEnabled),
    whatsappWebhookUrl: String(input.whatsappWebhookUrl || '').trim(),
    whatsappRecipient: String(input.whatsappRecipient || '').trim(),
    notificationRetentionDays: Number(input.notificationRetentionDays),
    locationConflictsEnabled: Boolean(input.locationConflictsEnabled),
    resourceConflictsEnabled: Boolean(input.resourceConflictsEnabled),
    googleIntegrationEnabled: Boolean(input.googleIntegrationEnabled),
    backupDestinations: [],
    backupRetentionCount: Number(input.backupRetentionCount),
    developerModeEnabled: Boolean(input.developerModeEnabled)
  };
  const backups = normalizeBackupDestinations(input.backupDestinations);
  if (backups.error) return { error: backups.error };
  settings.backupDestinations = backups.destinations;
  if (!Number.isInteger(settings.backupRetentionCount)
    || settings.backupRetentionCount < 1 || settings.backupRetentionCount > 365) {
    return { error: 'La cantidad de respaldos conservados debe estar entre 1 y 365' };
  }
  if (!Number.isInteger(settings.distributionMaxCalendars)
    || settings.distributionMaxCalendars < 1 || settings.distributionMaxCalendars > 20) {
    return { error: 'El máximo de calendarios debe estar entre 1 y 20' };
  }
  if (!Number.isInteger(settings.distributionScaleMaxActivities)
    || settings.distributionScaleMaxActivities < 1 || settings.distributionScaleMaxActivities > 1000) {
    return { error: 'La escala de actividades debe estar entre 1 y 1000' };
  }
  if (!['month', 'week', 'day'].includes(settings.defaultCalendarView)) {
    return { error: 'La vista predeterminada no es válida' };
  }
  if (!Number.isInteger(settings.workdayStartHour) || !Number.isInteger(settings.workdayEndHour)
    || settings.workdayStartHour < 0 || settings.workdayEndHour > 24
    || settings.workdayEndHour <= settings.workdayStartHour) {
    return { error: 'El horario laboral no es válido' };
  }
  if (![15, 30, 60].includes(settings.calendarSlotMinutes)) {
    return { error: 'El intervalo debe ser de 15, 30 o 60 minutos' };
  }
  if (!Number.isInteger(settings.defaultReminderMinutes)
    || settings.defaultReminderMinutes < 5 || settings.defaultReminderMinutes > 10080) {
    return { error: 'El recordatorio predeterminado debe estar entre 5 minutos y 7 días' };
  }
  if (!Number.isInteger(settings.notificationRetentionDays)
    || settings.notificationRetentionDays < 1 || settings.notificationRetentionDays > 365) {
    return { error: 'La retención debe estar entre 1 y 365 días' };
  }
  for (const [enabled, url, label] of [
    [settings.emailNotificationsEnabled, settings.emailWebhookUrl, 'correo'],
    [settings.whatsappNotificationsEnabled, settings.whatsappWebhookUrl, 'WhatsApp']
  ]) {
    if (enabled && !url) return { error: `Configura el webhook de ${label} antes de activarlo` };
    if (url) {
      try {
        const parsed = new URL(url);
        if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error();
      } catch {
        return { error: `La URL del webhook de ${label} no es válida` };
      }
    }
  }
  if (settings.whatsappNotificationsEnabled && !settings.whatsappRecipient) {
    return { error: 'Indica el número destinatario de WhatsApp' };
  }
  return { settings };
}

function validateResource(input) {
  if (!input.name?.trim()) return 'El nombre del recurso es obligatorio';
  if (!['room', 'equipment', 'vehicle', 'other'].includes(input.type)) return 'Tipo de recurso no válido';
  if (input.status && !['active', 'inactive'].includes(input.status)) return 'Estado de recurso no válido';
  return null;
}

function audit(userId, action, entityType, entityId, oldValues, newValues) {
  db.prepare(`
    INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_values, new_values)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    userId,
    action,
    entityType,
    entityId,
    oldValues ? JSON.stringify(oldValues) : null,
    newValues ? JSON.stringify(newValues) : null
  );
}

function registerSettingsRoutes(app, authMiddleware) {
  app.get('/api/settings', authMiddleware, (req, res) => {
    const canEdit = req.user.role === 'Administrador';
    const settings = readSettings();
    if (!canEdit) {
      settings.emailWebhookUrl = '';
      settings.whatsappWebhookUrl = '';
      settings.whatsappRecipient = '';
    }
    res.json({ success: true, settings, canEdit });
  });

  app.put('/api/settings', authMiddleware, requireAdministrator, (req, res) => {
    const normalized = normalizeSettings(req.body || {});
    if (normalized.error) return res.status(400).json({ success: false, error: normalized.error });
    const previous = readSettings();
    const save = db.prepare(`
      INSERT INTO system_settings (key, value, updated_by, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value,
        updated_by = excluded.updated_by, updated_at = CURRENT_TIMESTAMP
    `);
    db.exec('BEGIN');
    try {
      Object.entries(normalized.settings).forEach(([key, value]) => {
        save.run(key, JSON.stringify(value), req.user.id);
      });
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    audit(req.user.id, 'update', 'settings', null, previous, normalized.settings);
    res.json({ success: true, settings: normalized.settings });
  });

  // Estado por destino: con varios configurados hay que poder ver cuál está
  // recibiendo copias y cuál lleva días fallando.
  app.get('/api/backups', authMiddleware, requireAdministrator, (req, res) => {
    const { backupDestinations, listSnapshots, backupRetention } = require('./backup');
    const destinations = backupDestinations().map((directory) => {
      const snapshots = listSnapshots(directory);
      const newest = snapshots[0];
      return {
        directory,
        count: snapshots.length,
        writable: checkDestination(directory) === null,
        lastBackupAt: newest ? fs.statSync(newest).mtime.toISOString() : null,
        lastBackupSize: newest ? fs.statSync(newest).size : null
      };
    });
    res.json({ success: true, destinations, retention: backupRetention() });
  });

  app.post('/api/backups/run', authMiddleware, requireAdministrator, (req, res) => {
    const { createBackups } = require('./backup');
    const results = createBackups();
    const failed = results.filter((item) => !item.ok);
    // Que un destino falle no invalida los que sí se escribieron: se informa
    // del detalle y el cliente decide cómo presentarlo.
    res.json({
      success: results.some((item) => item.ok),
      results,
      error: failed.length ? failed.map((item) => item.error).join(' · ') : undefined
    });
  });

  app.get('/api/resources', authMiddleware, (req, res) => {
    const resources = db.prepare(`
      SELECT id, name, type, location, status
      FROM resources WHERE status = 'active' ORDER BY name
    `).all();
    res.json({ success: true, resources });
  });

  app.get('/api/admin/resources', authMiddleware, requireAdministrator, (req, res) => {
    const resources = db.prepare(`
      SELECT id, name, type, location, status,
             created_at AS createdAt, updated_at AS updatedAt
      FROM resources ORDER BY status, name
    `).all();
    res.json({ success: true, resources });
  });

  app.post('/api/admin/resources', authMiddleware, requireAdministrator, (req, res) => {
    const input = req.body || {};
    const error = validateResource(input);
    if (error) return res.status(400).json({ success: false, error });
    if (db.prepare('SELECT id FROM resources WHERE lower(name) = lower(?)').get(input.name.trim())) {
      return res.status(409).json({ success: false, error: 'Ya existe un recurso con ese nombre' });
    }
    const result = db.prepare(`
      INSERT INTO resources (name, type, location, status) VALUES (?, ?, ?, ?)
    `).run(input.name.trim(), input.type, input.location?.trim() || null, input.status || 'active');
    const id = Number(result.lastInsertRowid);
    audit(req.user.id, 'create', 'resource', id, null, input);
    res.status(201).json({ success: true, resourceId: id });
  });

  app.put('/api/admin/resources/:id', authMiddleware, requireAdministrator, (req, res) => {
    const id = Number(req.params.id);
    const previous = db.prepare('SELECT * FROM resources WHERE id = ?').get(id);
    if (!previous) return res.status(404).json({ success: false, error: 'Recurso no encontrado' });
    const input = req.body || {};
    const error = validateResource(input);
    if (error) return res.status(400).json({ success: false, error });
    const duplicate = db.prepare('SELECT id FROM resources WHERE lower(name) = lower(?) AND id != ?')
      .get(input.name.trim(), id);
    if (duplicate) return res.status(409).json({ success: false, error: 'Ya existe un recurso con ese nombre' });
    db.prepare(`
      UPDATE resources SET name = ?, type = ?, location = ?, status = ?,
        updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(input.name.trim(), input.type, input.location?.trim() || null, input.status || 'active', id);
    audit(req.user.id, 'update', 'resource', id, previous, input);
    res.json({ success: true });
  });

  app.delete('/api/admin/resources/:id', authMiddleware, requireAdministrator, (req, res) => {
    const id = Number(req.params.id);
    const previous = db.prepare('SELECT * FROM resources WHERE id = ?').get(id);
    if (!previous) return res.status(404).json({ success: false, error: 'Recurso no encontrado' });
    db.prepare("UPDATE resources SET status = 'inactive', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
    audit(req.user.id, 'deactivate', 'resource', id, previous, { status: 'inactive' });
    res.json({ success: true });
  });
}

module.exports = {
  DEFAULT_SETTINGS,
  MAX_BACKUP_DESTINATIONS,
  readSettings,
  normalizeSettings,
  normalizeBackupDestinations,
  checkDestination,
  registerSettingsRoutes
};
