const { db } = require('./database');
const { readSettings } = require('./settings');

async function sendWebhook(url, payload) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw Object.assign(new Error(`HTTP ${response.status}`), { status: response.status });
  return response.status;
}

async function dispatchExternalNotifications(limit = 20) {
  const settings = readSettings();
  const channels = [
    settings.emailNotificationsEnabled && settings.emailWebhookUrl
      ? { name: 'email', url: settings.emailWebhookUrl } : null,
    settings.whatsappNotificationsEnabled && settings.whatsappWebhookUrl
      ? { name: 'whatsapp', url: settings.whatsappWebhookUrl } : null
  ].filter(Boolean);
  if (!channels.length) return { delivered: 0, failed: 0 };
  const missingDelivery = channels.map(() => `NOT EXISTS (
    SELECT 1 FROM notification_deliveries d
    WHERE d.notification_id = n.id AND d.channel = ?
  )`).join(' OR ');
  const notifications = db.prepare(`
    SELECT n.id, n.type, n.title, n.message, n.created_at AS createdAt,
           u.name AS userName, u.email AS userEmail,
           e.id AS eventId, e.start_datetime AS eventStart
    FROM notifications n
    JOIN users u ON u.id = n.user_id
    LEFT JOIN events e ON e.id = n.event_id
    WHERE ${missingDelivery}
    ORDER BY n.id LIMIT ?
  `).all(...channels.map((channel) => channel.name), limit * channels.length);
  let delivered = 0;
  let failed = 0;
  for (const notification of notifications) {
    for (const channel of channels) {
      const exists = db.prepare('SELECT id FROM notification_deliveries WHERE notification_id = ? AND channel = ?')
        .get(notification.id, channel.name);
      if (exists) continue;
      const created = db.prepare(`
        INSERT INTO notification_deliveries (notification_id, channel, status) VALUES (?, ?, 'processing')
      `).run(notification.id, channel.name);
      try {
        const responseCode = await sendWebhook(channel.url, {
          channel: channel.name,
          recipient: channel.name === 'email'
            ? { name: notification.userName, email: notification.userEmail }
            : { name: notification.userName, phone: settings.whatsappRecipient },
          notification: {
            id: notification.id, type: notification.type, title: notification.title,
            message: notification.message, createdAt: notification.createdAt
          },
          event: notification.eventId ? { id: notification.eventId, startDatetime: notification.eventStart } : null
        });
        db.prepare(`UPDATE notification_deliveries SET status = 'delivered', response_code = ?,
          delivered_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
          .run(responseCode, Number(created.lastInsertRowid));
        delivered += 1;
      } catch (error) {
        db.prepare(`UPDATE notification_deliveries SET status = 'failed', response_code = ?, error = ?,
          updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
          .run(error.status || null, String(error.message).slice(0, 500), Number(created.lastInsertRowid));
        failed += 1;
      }
      if (delivered + failed >= limit) return { delivered, failed };
    }
  }
  return { delivered, failed };
}

module.exports = { dispatchExternalNotifications };
