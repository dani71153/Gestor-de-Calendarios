const { db } = require('./database');
const { accessibleCalendarIds } = require('./authorization');
const { readSettings } = require('./settings');

function validDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function weekdaysBetween(start, end) {
  let count = 0;
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  const last = new Date(end);
  last.setHours(0, 0, 0, 0);
  while (cursor <= last) {
    if (cursor.getDay() !== 0 && cursor.getDay() !== 6) count += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

function registerReportRoutes(app, authMiddleware) {
  app.get('/api/reports/operations', authMiddleware, (req, res) => {
    const start = validDate(req.query.start);
    const end = validDate(req.query.end);
    if (!start || !end || end < start) {
      return res.status(400).json({ success: false, error: 'El rango del reporte no es válido' });
    }
    const ids = accessibleCalendarIds(req.user);
    const settings = readSettings();
    const workdayHours = Math.max(1, Number(settings.workdayEndHour) - Number(settings.workdayStartHour));
    const capacityHours = weekdaysBetween(start, end) * workdayHours;
    if (!ids.length) return res.json({
      success: true,
      range: { start: start.toISOString(), end: end.toISOString(), capacityHours },
      summary: { total: 0, completed: 0, overdue: 0, canceled: 0, completionRate: 0 },
      workload: [], calendars: []
    });
    const placeholders = ids.map(() => '?').join(',');
    const params = [...ids, start.toISOString(), end.toISOString()];
    const rows = db.prepare(`
      SELECT e.id, e.status, e.start_datetime AS startDatetime, e.end_datetime AS endDatetime,
             e.responsible_user_id AS responsibleUserId, u.name AS responsibleName,
             c.id AS calendarId, c.name AS calendarName, c.color AS calendarColor
      FROM events e
      JOIN calendars c ON c.id = e.calendar_id
      LEFT JOIN users u ON u.id = e.responsible_user_id
      WHERE e.calendar_id IN (${placeholders})
        AND e.start_datetime >= ? AND e.start_datetime <= ?
    `).all(...params);
    const now = Date.now();
    const completed = rows.filter((row) => row.status === 'completed').length;
    const overdue = rows.filter((row) => row.status === 'overdue'
      || (!['completed', 'canceled'].includes(row.status) && new Date(row.endDatetime).getTime() < now)).length;
    const canceled = rows.filter((row) => row.status === 'canceled').length;
    const actionable = Math.max(0, rows.length - canceled);
    const summary = {
      total: rows.length, completed, overdue, canceled,
      completionRate: actionable ? Math.round((completed / actionable) * 100) : 0
    };
    const group = (keyFn) => rows.reduce((map, row) => {
      const key = keyFn(row);
      if (!map.has(key.id)) map.set(key.id, { ...key, total: 0, completed: 0, overdue: 0, scheduledHours: 0 });
      const item = map.get(key.id);
      item.total += 1;
      if (row.status === 'completed') item.completed += 1;
      if (row.status === 'overdue' || (!['completed', 'canceled'].includes(row.status)
        && new Date(row.endDatetime).getTime() < now)) item.overdue += 1;
      if (row.status !== 'canceled') {
        item.scheduledHours += Math.max(0, new Date(row.endDatetime) - new Date(row.startDatetime)) / 3600000;
      }
      return map;
    }, new Map());
    const workload = [...group((row) => ({
      id: row.responsibleUserId || 'unassigned', name: row.responsibleName || 'Sin asignar'
    })).values()].map((item) => ({
      ...item,
      scheduledHours: Math.round(item.scheduledHours * 10) / 10,
      capacityHours,
      loadPercentage: capacityHours ? Math.round((item.scheduledHours / capacityHours) * 100) : 0,
      completionRate: item.total ? Math.round((item.completed / item.total) * 100) : 0
    })).sort((a, b) => b.scheduledHours - a.scheduledHours);
    const calendars = [...group((row) => ({
      id: row.calendarId, name: row.calendarName, color: row.calendarColor
    })).values()].map((item) => ({
      ...item,
      scheduledHours: Math.round(item.scheduledHours * 10) / 10,
      completionRate: item.total ? Math.round((item.completed / item.total) * 100) : 0
    })).sort((a, b) => b.total - a.total);
    res.json({ success: true, range: { start: start.toISOString(), end: end.toISOString(), capacityHours }, summary, workload, calendars });
  });
}

module.exports = { registerReportRoutes, weekdaysBetween };
