const { db } = require('./database');
const { readSettings } = require('./settings');
const { requireAdministrator } = require('./authorization');
const { dispatchExternalNotifications } = require('./external-notifications');

function normalizeReminderMinutes(value) {
  if (value === null || value === undefined || value === '') return null;
  const minutes = Number(value);
  return Number.isInteger(minutes) && minutes >= 5 && minutes <= 10080 ? minutes : null;
}

function saveEventReminder(eventId, minutesBefore, recipientUserId) {
  db.prepare('DELETE FROM event_reminders WHERE event_id = ?').run(eventId);
  const minutes = normalizeReminderMinutes(minutesBefore);
  if (!minutes || !recipientUserId) return null;
  const result = db.prepare(`
    INSERT INTO event_reminders (event_id, recipient_user_id, minutes_before)
    VALUES (?, ?, ?)
  `).run(eventId, recipientUserId, minutes);
  return Number(result.lastInsertRowid);
}

function cancelEventReminder(eventId) {
  db.prepare("UPDATE event_reminders SET status = 'canceled', updated_at = CURRENT_TIMESTAMP WHERE event_id = ?")
    .run(eventId);
}

function processDueReminders(now = new Date()) {
  const settings = readSettings();
  if (!settings.remindersEnabled || !settings.notificationsEnabled) return 0;
  const reminders = db.prepare(`
    SELECT r.id, r.event_id AS eventId, r.recipient_user_id AS recipientUserId,
           r.minutes_before AS minutesBefore, e.title, e.start_datetime AS startDatetime
    FROM event_reminders r
    JOIN events e ON e.id = r.event_id
    WHERE r.status = 'pending' AND e.deleted_at IS NULL
      AND e.status NOT IN ('canceled', 'completed')
  `).all();
  const due = reminders.filter((reminder) => (
    new Date(reminder.startDatetime).getTime() - reminder.minutesBefore * 60000 <= now.getTime()
  ));
  if (!due.length) return 0;
  const insertNotification = db.prepare(`
    INSERT OR IGNORE INTO notifications
      (user_id, event_id, reminder_id, type, title, message)
    VALUES (?, ?, ?, 'reminder', ?, ?)
  `);
  const markSent = db.prepare(`
    UPDATE event_reminders SET status = 'sent', sent_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `);
  db.exec('BEGIN');
  try {
    due.forEach((reminder) => {
      const start = new Date(reminder.startDatetime).toLocaleString('es-DO', {
        dateStyle: 'medium', timeStyle: 'short'
      });
      insertNotification.run(
        reminder.recipientUserId,
        reminder.eventId,
        reminder.id,
        `Recordatorio: ${reminder.title}`,
        `El evento comienza ${start}.`
      );
      markSent.run(reminder.id);
    });
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return due.length;
}

function cleanupNotifications() {
  const days = Number(readSettings().notificationRetentionDays) || 30;
  db.prepare(`
    DELETE FROM notifications
    WHERE read_at IS NOT NULL AND created_at < datetime('now', ?)
  `).run(`-${days} days`);
}

function registerReminderRoutes(app, authMiddleware) {
  app.get('/api/notifications', authMiddleware, (req, res) => {
    processDueReminders();
    const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100);
    const notifications = db.prepare(`
      SELECT n.id, n.event_id AS eventId, n.type, n.title, n.message,
             n.read_at AS readAt, n.created_at AS createdAt
      FROM notifications n
      WHERE n.user_id = ?
      ORDER BY n.created_at DESC LIMIT ?
    `).all(req.user.id, limit);
    const unread = db.prepare(`
      SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND read_at IS NULL
    `).get(req.user.id).count;
    res.json({ success: true, notifications, unread });
  });

  app.patch('/api/notifications/:id/read', authMiddleware, (req, res) => {
    const result = db.prepare(`
      UPDATE notifications SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
      WHERE id = ? AND user_id = ?
    `).run(Number(req.params.id), req.user.id);
    if (!result.changes) return res.status(404).json({ success: false, error: 'Notificación no encontrada' });
    res.json({ success: true });
  });

  app.delete('/api/notifications/:id', authMiddleware, (req, res) => {
    const result = db.prepare('DELETE FROM notifications WHERE id = ? AND user_id = ?')
      .run(Number(req.params.id), req.user.id);
    if (!result.changes) return res.status(404).json({ success: false, error: 'Notificación no encontrada' });
    res.json({ success: true });
  });

  app.post('/api/notifications/read-all', authMiddleware, (req, res) => {
    db.prepare(`
      UPDATE notifications SET read_at = CURRENT_TIMESTAMP
      WHERE user_id = ? AND read_at IS NULL
    `).run(req.user.id);
    res.json({ success: true });
  });

  app.delete('/api/notifications', authMiddleware, (req, res) => {
    const result = db.prepare('DELETE FROM notifications WHERE user_id = ?').run(req.user.id);
    res.json({ success: true, deleted: result.changes });
  });

  app.post('/api/developer/notifications/test', authMiddleware, requireAdministrator, async (req, res) => {
    if (!readSettings().developerModeEnabled) {
      return res.status(403).json({
        success: false,
        error: 'Activa y guarda el modo desarrollador antes de generar pruebas'
      });
    }
    const variant = req.body?.variant === 'reminder' ? 'reminder' : 'test';
    const content = variant === 'reminder'
      ? {
        title: 'Recordatorio de prueba',
        message: 'Esta simulación confirma que el flujo de recordatorios está funcionando.'
      }
      : {
        title: 'Notificación de prueba',
        message: 'El centro de notificaciones recibió correctamente este mensaje de desarrollo.'
      };
    const result = db.prepare(`
      INSERT INTO notifications (user_id, type, title, message)
      VALUES (?, ?, ?, ?)
    `).run(req.user.id, variant, content.title, content.message);
    const external = await dispatchExternalNotifications(10);
    res.status(201).json({ success: true, notificationId: Number(result.lastInsertRowid), external });
  });
}

function startReminderScheduler() {
  const run = () => {
    try {
      processDueReminders();
      cleanupNotifications();
      dispatchExternalNotifications().catch((error) => console.error('No se pudieron enviar avisos externos:', error));
    } catch (error) {
      console.error('No se pudieron procesar los recordatorios:', error);
    }
  };
  const initial = setTimeout(run, 1000);
  initial.unref?.();
  const timer = setInterval(run, 30000);
  timer.unref?.();
  return timer;
}

module.exports = {
  normalizeReminderMinutes,
  saveEventReminder,
  cancelEventReminder,
  processDueReminders,
  registerReminderRoutes,
  startReminderScheduler
};
