const { db } = require('./database');
const config = require('./config');
const { readSettings } = require('./settings');
const { saveEventReminder, cancelEventReminder, normalizeReminderMinutes } = require('./reminders');
const { normalizeRecurrence, occurrenceDates } = require('./recurrence');
const {
  accessibleCalendarIds,
  calendarCapabilities,
  eventCapabilities
} = require('./authorization');

const validStatuses = ['draft', 'pending', 'confirmed', 'in_progress', 'completed', 'canceled', 'overdue'];
const validPriorities = ['low', 'normal', 'high', 'urgent'];

const baseSelect = `
  SELECT e.id, e.title, e.description,
         e.start_datetime AS startDatetime, e.end_datetime AS endDatetime,
         e.all_day AS allDay, e.timezone, e.priority, e.status, e.location,
         e.virtual_link AS virtualLink, e.sync_status AS syncStatus,
         e.google_event_id AS googleEventId,
         e.calendar_id AS calendarId, c.name AS calendarName, c.color AS calendarColor,
         e.event_type_id AS eventTypeId, et.name AS eventType,
         e.responsible_user_id AS responsibleUserId, u.name AS responsibleName,
         e.resource_id AS resourceId, r.name AS resourceName, r.type AS resourceType,
         er.minutes_before AS reminderMinutes,
         e.series_id AS seriesId, e.occurrence_index AS occurrenceIndex,
         es.frequency AS recurrenceFrequency, es.interval_value AS recurrenceInterval,
         es.occurrence_count AS recurrenceCount,
         e.created_by AS createdBy
  FROM events e
  JOIN calendars c ON c.id = e.calendar_id
  JOIN event_types et ON et.id = e.event_type_id
  LEFT JOIN users u ON u.id = e.responsible_user_id
  LEFT JOIN resources r ON r.id = e.resource_id
  LEFT JOIN event_reminders er ON er.event_id = e.id AND er.status != 'canceled'
  LEFT JOIN event_series es ON es.id = e.series_id
`;

function markOverdue() {
  db.prepare(`
    UPDATE events
    SET status = 'overdue', updated_at = CURRENT_TIMESTAMP
    WHERE end_datetime < ?
      AND status NOT IN ('completed', 'canceled', 'draft', 'overdue')
      AND deleted_at IS NULL
  `).run(new Date().toISOString());
}

function validateEvent(input) {
  if (!input.title?.trim()) return 'El título es obligatorio';
  if (!input.calendarId) return 'El calendario es obligatorio';
  if (!input.eventTypeId) return 'El tipo de evento es obligatorio';
  if (!input.startDatetime || !input.endDatetime) return 'Las fechas de inicio y fin son obligatorias';
  if (new Date(input.endDatetime) <= new Date(input.startDatetime)) {
    return 'La fecha final debe ser posterior a la inicial';
  }
  if (input.status && !validStatuses.includes(input.status)) return 'Estado no válido';
  if (input.priority && !validPriorities.includes(input.priority)) return 'Prioridad no válida';
  if (input.resourceId && !db.prepare("SELECT id FROM resources WHERE id = ? AND status = 'active'").get(Number(input.resourceId))) {
    return 'El recurso seleccionado no está disponible';
  }
  if (input.reminderMinutes !== null && input.reminderMinutes !== undefined && input.reminderMinutes !== ''
    && !normalizeReminderMinutes(input.reminderMinutes)) {
    return 'El recordatorio debe estar entre 5 minutos y 7 días';
  }
  const recurrence = normalizeRecurrence(input.recurrence);
  if (recurrence?.error) return recurrence.error;
  if (input.seriesScope && !['single', 'future', 'series'].includes(input.seriesScope)) return 'Alcance de serie no válido';
  return null;
}

function detectConflicts(event, excludeId = 0) {
  const settings = readSettings();
  const responsibleUserId = Number(event.responsibleUserId) || null;
  const resourceId = settings.resourceConflictsEnabled ? Number(event.resourceId) || null : null;
  const location = settings.locationConflictsEnabled ? event.location?.trim().toLowerCase() || null : null;
  if (!responsibleUserId && !resourceId && !location) return [];
  const candidates = db.prepare(`
    SELECT e.id, e.title, e.start_datetime AS startDatetime, e.end_datetime AS endDatetime,
           e.calendar_id AS calendarId, e.created_by AS createdBy,
           e.responsible_user_id AS responsibleUserId, e.resource_id AS resourceId,
           e.location, r.name AS resourceName
    FROM events e
    LEFT JOIN resources r ON r.id = e.resource_id
    WHERE e.id != ?
      AND e.deleted_at IS NULL
      AND e.status NOT IN ('canceled', 'completed')
      AND e.start_datetime < ?
      AND e.end_datetime > ?
    ORDER BY e.start_datetime
  `).all(excludeId, event.endDatetime, event.startDatetime);
  return candidates.map((candidate) => {
    const types = [];
    const reasons = [];
    if (responsibleUserId && Number(candidate.responsibleUserId) === responsibleUserId) {
      types.push('responsible');
      reasons.push('La persona responsable ya tiene otro evento');
    }
    if (resourceId && Number(candidate.resourceId) === resourceId) {
      types.push('resource');
      reasons.push(`${candidate.resourceName || 'El recurso'} ya está reservado`);
    }
    if (location && candidate.location?.trim().toLowerCase() === location) {
      types.push('location');
      reasons.push(`La ubicación ${candidate.location} ya está ocupada`);
    }
    return types.length ? { ...candidate, types, reasons } : null;
  }).filter(Boolean);
}

function conflictPredicate(left = 'e', right = 'conflicting') {
  const settings = readSettings();
  const predicates = [`(${left}.responsible_user_id IS NOT NULL AND ${right}.responsible_user_id = ${left}.responsible_user_id)`];
  if (settings.resourceConflictsEnabled) {
    predicates.push(`(${left}.resource_id IS NOT NULL AND ${right}.resource_id = ${left}.resource_id)`);
  }
  if (settings.locationConflictsEnabled) {
    predicates.push(`(TRIM(COALESCE(${left}.location, '')) != '' AND LOWER(TRIM(${right}.location)) = LOWER(TRIM(${left}.location)))`);
  }
  return `(${predicates.join(' OR ')})`;
}

function decorateEvent(user, event) {
  const capabilities = eventCapabilities(user, event);
  return { ...event, canEdit: capabilities.canEdit, canDelete: capabilities.canDelete };
}

function visibleConflicts(user, conflicts) {
  return conflicts.filter((conflict) => eventCapabilities(user, conflict).canView);
}

function audit(userId, action, entityId, oldValues, newValues) {
  db.prepare(`
    INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_values, new_values)
    VALUES (?, ?, 'event', ?, ?, ?)
  `).run(userId, action, entityId, oldValues ? JSON.stringify(oldValues) : null, newValues ? JSON.stringify(newValues) : null);
}

function registerEventRoutes(app, authMiddleware) {
  app.get('/api/calendars', authMiddleware, (req, res) => {
    const calendarIds = accessibleCalendarIds(req.user, { activeOnly: true });
    if (!calendarIds.length) return res.json({ success: true, calendars: [] });
    const calendars = db.prepare(`
      SELECT id, name, description, color, visibility, sync_enabled AS syncEnabled, status
      FROM calendars WHERE status = 'active'
        AND id IN (${calendarIds.map(() => '?').join(',')})
      ORDER BY name
    `).all(...calendarIds).map((calendar) => ({
      ...calendar,
      ...calendarCapabilities(req.user, calendar.id)
    }));
    res.json({ success: true, calendars });
  });

  app.get('/api/event-types', authMiddleware, (req, res) => {
    const eventTypes = db.prepare(`
      SELECT id, name, description, color, requires_responsible AS requiresResponsible
      FROM event_types WHERE status = 'active' ORDER BY name
    `).all();
    res.json({ success: true, eventTypes });
  });

  app.get('/api/users', authMiddleware, (req, res) => {
    const users = db.prepare(`
      SELECT u.id, u.name, u.email, r.name AS role, d.name AS department
      FROM users u JOIN roles r ON r.id = u.role_id
      LEFT JOIN departments d ON d.id = u.department_id
      WHERE u.status = 'active' ORDER BY u.name
    `).all();
    res.json({ success: true, users });
  });

  app.get('/api/events', authMiddleware, (req, res) => {
    markOverdue();
    const conditions = ['e.deleted_at IS NULL'];
    const params = [];
    const calendarIds = accessibleCalendarIds(req.user);
    if (!calendarIds.length) return res.json({ success: true, events: [] });
    conditions.push(`e.calendar_id IN (${calendarIds.map(() => '?').join(',')})`);
    params.push(...calendarIds);
    const now = new Date();
    if (req.query.start) {
      conditions.push('e.end_datetime >= ?');
      params.push(req.query.start);
    }
    if (req.query.end) {
      conditions.push('e.start_datetime <= ?');
      params.push(req.query.end);
    }
    if (req.query.calendarId) {
      conditions.push('e.calendar_id = ?');
      params.push(Number(req.query.calendarId));
    }
    if (req.query.status) {
      conditions.push('e.status = ?');
      params.push(req.query.status);
    }
    if (req.query.responsibleUserId) {
      conditions.push('e.responsible_user_id = ?');
      params.push(Number(req.query.responsibleUserId));
    }
    // Quién lo registró es una pregunta distinta de quién debe atenderlo.
    if (req.query.createdBy) {
      conditions.push('e.created_by = ?');
      params.push(Number(req.query.createdBy));
    }
    if (req.query.unassigned === 'true') {
      conditions.push('e.responsible_user_id IS NULL');
    }
    if (typeof req.query.q === 'string' && req.query.q.trim()) {
      const query = `%${req.query.q.trim().toLowerCase()}%`;
      conditions.push("(LOWER(e.title) LIKE ? OR LOWER(COALESCE(e.description, '')) LIKE ?)");
      params.push(query, query);
    }
    if (req.query.preset === 'today') {
      const startToday = new Date(now);
      startToday.setHours(0, 0, 0, 0);
      const tomorrow = new Date(startToday);
      tomorrow.setDate(tomorrow.getDate() + 1);
      conditions.push('e.start_datetime >= ? AND e.start_datetime < ?');
      params.push(startToday.toISOString(), tomorrow.toISOString());
    }
    if (req.query.preset === 'upcoming') {
      const nextWeek = new Date(now);
      nextWeek.setDate(nextWeek.getDate() + 7);
      conditions.push("e.start_datetime >= ? AND e.start_datetime <= ? AND e.status NOT IN ('canceled', 'completed')");
      params.push(now.toISOString(), nextWeek.toISOString());
    }
    if (req.query.preset === 'conflicts') {
      conditions.push(`
        e.status NOT IN ('canceled', 'completed', 'draft')
        AND EXISTS (
          SELECT 1
          FROM events conflicting
          WHERE conflicting.id != e.id
            AND ${conflictPredicate('e', 'conflicting')}
            AND conflicting.deleted_at IS NULL
            AND conflicting.status NOT IN ('canceled', 'completed', 'draft')
            AND conflicting.start_datetime < e.end_datetime
            AND conflicting.end_datetime > e.start_datetime
        )
      `);
    }
    const events = db.prepare(`${baseSelect} WHERE ${conditions.join(' AND ')} ORDER BY e.start_datetime`)
      .all(...params)
      .map((event) => decorateEvent(req.user, event));
    res.json({ success: true, events });
  });

  app.post('/api/events/check-conflicts', authMiddleware, (req, res) => {
    const input = req.body || {};
    if (!input.startDatetime || !input.endDatetime) {
      return res.status(400).json({ success: false, error: 'Indica el inicio y el final para revisar conflictos' });
    }
    if (new Date(input.endDatetime) <= new Date(input.startDatetime)) {
      return res.status(400).json({ success: false, error: 'La fecha final debe ser posterior a la inicial' });
    }
    if (input.id) {
      const existing = db.prepare(`
        SELECT id, calendar_id AS calendarId, created_by AS createdBy
        FROM events WHERE id = ? AND deleted_at IS NULL
      `).get(Number(input.id));
      if (!existing || !eventCapabilities(req.user, existing).canEdit) {
        return res.status(403).json({ success: false, error: 'No tienes permiso para editar este evento' });
      }
    } else if (!calendarCapabilities(req.user, Number(input.calendarId)).canCreate) {
      return res.status(403).json({ success: false, error: 'No tienes permiso para crear eventos en este calendario' });
    }
    const conflicts = visibleConflicts(req.user, detectConflicts(input, Number(input.id || 0)));
    res.json({ success: true, hasConflict: conflicts.length > 0, conflicts });
  });

  app.get('/api/events/:id', authMiddleware, (req, res) => {
    const event = db.prepare(`${baseSelect} WHERE e.id = ? AND e.deleted_at IS NULL`).get(Number(req.params.id));
    if (!event) return res.status(404).json({ success: false, error: 'Evento no encontrado' });
    if (!eventCapabilities(req.user, event).canView) {
      return res.status(403).json({ success: false, error: 'No tienes acceso a este evento' });
    }
    res.json({ success: true, event: decorateEvent(req.user, event) });
  });

  app.post('/api/events', authMiddleware, (req, res) => {
    const input = req.body || {};
    const error = validateEvent(input);
    if (error) return res.status(400).json({ success: false, error });
    if (!calendarCapabilities(req.user, input.calendarId).canCreate) {
      return res.status(403).json({ success: false, error: 'No tienes permiso para crear eventos en este calendario' });
    }
    // Con la integración desactivada nada debe encolarse para sincronizar,
    // aunque el cliente envíe la marca.
    if (!readSettings().googleIntegrationEnabled) input.syncWithGoogle = false;
    const recurrence = normalizeRecurrence(input.recurrence);
    const dates = recurrence
      ? occurrenceDates(input.startDatetime, input.endDatetime, recurrence)
      : [{ startDatetime: new Date(input.startDatetime).toISOString(), endDatetime: new Date(input.endDatetime).toISOString(), occurrenceIndex: null }];
    const conflicts = dates.flatMap((datesForOccurrence) => visibleConflicts(req.user, detectConflicts({
      ...input, ...datesForOccurrence
    })));
    const insertEvent = db.prepare(`
      INSERT INTO events (
        calendar_id, event_type_id, title, description, start_datetime, end_datetime,
        all_day, timezone, priority, status, location, virtual_link,
        responsible_user_id, resource_id, created_by, sync_status, series_id, occurrence_index
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    let id;
    let seriesId = null;
    db.exec('BEGIN');
    try {
      if (recurrence) {
        const series = db.prepare(`
          INSERT INTO event_series (frequency, interval_value, occurrence_count, created_by)
          VALUES (?, ?, ?, ?)
        `).run(recurrence.frequency, recurrence.interval, recurrence.count, req.user.id);
        seriesId = Number(series.lastInsertRowid);
      }
      dates.forEach((occurrence) => {
        const result = insertEvent.run(
          input.calendarId, input.eventTypeId, input.title.trim(), input.description || null,
          occurrence.startDatetime, occurrence.endDatetime,
          input.allDay ? 1 : 0, input.timezone || config.timezone, input.priority || 'normal',
          input.status || 'pending', input.location || null, input.virtualLink || null,
          input.responsibleUserId || null, input.resourceId || null, req.user.id,
          input.syncWithGoogle ? 'pending' : 'not_synced', seriesId, occurrence.occurrenceIndex
        );
        const occurrenceId = Number(result.lastInsertRowid);
        if (id === undefined) id = occurrenceId;
        if (!['canceled', 'completed'].includes(input.status)) {
          saveEventReminder(occurrenceId, input.reminderMinutes, input.responsibleUserId || req.user.id);
        }
        audit(req.user.id, 'create', occurrenceId, null, { ...input, seriesId, occurrenceIndex: occurrence.occurrenceIndex });
      });
      db.exec('COMMIT');
    } catch (transactionError) {
      db.exec('ROLLBACK');
      throw transactionError;
    }
    const event = decorateEvent(req.user, db.prepare(`${baseSelect} WHERE e.id = ?`).get(id));
    res.status(201).json({
      success: true, event, seriesId, occurrencesCreated: dates.length,
      hasConflict: conflicts.length > 0, conflicts
    });
  });

  app.put('/api/events/:id', authMiddleware, (req, res) => {
    const id = Number(req.params.id);
    const previous = db.prepare('SELECT * FROM events WHERE id = ? AND deleted_at IS NULL').get(id);
    if (!previous) return res.status(404).json({ success: false, error: 'Evento no encontrado' });
    const previousEvent = { calendarId: previous.calendar_id, createdBy: previous.created_by };
    if (!eventCapabilities(req.user, previousEvent).canEdit) {
      return res.status(403).json({ success: false, error: 'No tienes permiso para editar este evento' });
    }
    const input = req.body || {};
    const error = validateEvent(input);
    if (error) return res.status(400).json({ success: false, error });
    if (Number(input.calendarId) !== previous.calendar_id
      && !calendarCapabilities(req.user, input.calendarId).canCreate) {
      return res.status(403).json({ success: false, error: 'No puedes mover el evento a ese calendario' });
    }
    if (!readSettings().googleIntegrationEnabled) input.syncWithGoogle = false;
    const conflicts = visibleConflicts(req.user, detectConflicts(input, id));
    const seriesScope = previous.series_id ? (input.seriesScope || 'single') : 'single';
    const targets = seriesScope === 'single' ? [previous] : db.prepare(`
      SELECT * FROM events WHERE series_id = ? AND deleted_at IS NULL
        ${seriesScope === 'future' ? 'AND occurrence_index >= ?' : ''}
      ORDER BY occurrence_index
    `).all(...(seriesScope === 'future'
      ? [previous.series_id, previous.occurrence_index]
      : [previous.series_id]));
    const startDelta = new Date(input.startDatetime) - new Date(previous.start_datetime);
    const duration = new Date(input.endDatetime) - new Date(input.startDatetime);
    const updateEvent = db.prepare(`
      UPDATE events SET
        calendar_id = ?, event_type_id = ?, title = ?, description = ?,
        start_datetime = ?, end_datetime = ?, all_day = ?, timezone = ?,
        priority = ?, status = ?, location = ?, virtual_link = ?,
        responsible_user_id = ?, resource_id = ?, sync_status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    db.exec('BEGIN');
    try {
      targets.forEach((target) => {
        const targetStart = new Date(new Date(target.start_datetime).getTime() + startDelta);
        const targetEnd = new Date(targetStart.getTime() + duration);
        updateEvent.run(
          input.calendarId, input.eventTypeId, input.title.trim(), input.description || null,
          targetStart.toISOString(), targetEnd.toISOString(), input.allDay ? 1 : 0,
          input.timezone || config.timezone, input.priority || 'normal', input.status || 'pending',
          input.location || null, input.virtualLink || null, input.responsibleUserId || null,
          input.resourceId || null, input.syncWithGoogle ? 'pending' : target.sync_status, target.id
        );
        if (['canceled', 'completed'].includes(input.status)) cancelEventReminder(target.id);
        else saveEventReminder(target.id, input.reminderMinutes, input.responsibleUserId || target.created_by);
        audit(req.user.id, 'update', target.id, target, { ...input, seriesScope });
      });
      db.exec('COMMIT');
    } catch (transactionError) {
      db.exec('ROLLBACK');
      throw transactionError;
    }
    const event = decorateEvent(req.user, db.prepare(`${baseSelect} WHERE e.id = ?`).get(id));
    res.json({ success: true, event, occurrencesUpdated: targets.length, hasConflict: conflicts.length > 0, conflicts });
  });

  app.patch('/api/events/:id/status', authMiddleware, (req, res) => {
    const id = Number(req.params.id);
    const { status } = req.body || {};
    if (!validStatuses.includes(status)) return res.status(400).json({ success: false, error: 'Estado no válido' });
    const previous = db.prepare(`
      SELECT status, calendar_id AS calendarId, created_by AS createdBy
      FROM events WHERE id = ? AND deleted_at IS NULL
    `).get(id);
    if (!previous) return res.status(404).json({ success: false, error: 'Evento no encontrado' });
    if (!eventCapabilities(req.user, previous).canEdit) {
      return res.status(403).json({ success: false, error: 'No tienes permiso para actualizar este evento' });
    }
    db.prepare('UPDATE events SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(status, id);
    if (['canceled', 'completed'].includes(status)) cancelEventReminder(id);
    audit(req.user.id, 'status_change', id, previous, { status });
    res.json({ success: true });
  });

  app.delete('/api/events/:id', authMiddleware, (req, res) => {
    const id = Number(req.params.id);
    const previous = db.prepare('SELECT * FROM events WHERE id = ? AND deleted_at IS NULL').get(id);
    if (!previous) return res.status(404).json({ success: false, error: 'Evento no encontrado' });
    const previousEvent = { calendarId: previous.calendar_id, createdBy: previous.created_by };
    if (!eventCapabilities(req.user, previousEvent).canDelete) {
      return res.status(403).json({ success: false, error: 'No tienes permiso para cancelar este evento' });
    }
    const seriesScope = previous.series_id ? (req.body?.seriesScope || 'single') : 'single';
    if (!['single', 'future', 'series'].includes(seriesScope)) {
      return res.status(400).json({ success: false, error: 'Alcance de serie no válido' });
    }
    const targets = seriesScope === 'single' ? [previous] : db.prepare(`
      SELECT * FROM events WHERE series_id = ? AND deleted_at IS NULL
        ${seriesScope === 'future' ? 'AND occurrence_index >= ?' : ''}
      ORDER BY occurrence_index
    `).all(...(seriesScope === 'future'
      ? [previous.series_id, previous.occurrence_index]
      : [previous.series_id]));
    const cancel = db.prepare(`
      UPDATE events SET status = 'canceled', deleted_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `);
    db.exec('BEGIN');
    try {
      targets.forEach((target) => {
        cancel.run(target.id);
        cancelEventReminder(target.id);
        audit(req.user.id, 'cancel', target.id, target, { status: 'canceled', seriesScope });
      });
      db.exec('COMMIT');
    } catch (transactionError) {
      db.exec('ROLLBACK');
      throw transactionError;
    }
    res.json({ success: true, occurrencesCanceled: targets.length });
  });

  app.get('/api/dashboard/summary', authMiddleware, (req, res) => {
    markOverdue();
    const calendarIds = accessibleCalendarIds(req.user);
    if (!calendarIds.length) {
      return res.json({
        success: true,
        summary: { today: 0, upcoming: 0, overdue: 0, unassigned: 0, conflicts: 0 },
        upcoming: []
      });
    }
    const calendarScope = `e.calendar_id IN (${calendarIds.map(() => '?').join(',')})`;
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    const startToday = new Date(now);
    startToday.setHours(0, 0, 0, 0);
    const nextWeek = new Date(now);
    nextWeek.setDate(nextWeek.getDate() + 7);

    const count = (where, ...params) => db.prepare(`
      SELECT COUNT(*) AS count FROM events e
      WHERE e.deleted_at IS NULL AND ${calendarScope} AND ${where}
    `).get(...calendarIds, ...params).count;

    const summary = {
      today: count('e.start_datetime >= ? AND e.start_datetime < ?', startToday.toISOString(), tomorrow.toISOString()),
      upcoming: count("e.start_datetime >= ? AND e.start_datetime <= ? AND e.status NOT IN ('canceled', 'completed')", now.toISOString(), nextWeek.toISOString()),
      overdue: count("e.status = 'overdue'"),
      unassigned: count("e.responsible_user_id IS NULL AND e.status NOT IN ('canceled', 'completed')")
    };

    const conflicts = db.prepare(`
      SELECT COUNT(*) AS count
      FROM events e
      WHERE e.deleted_at IS NULL
        AND ${calendarScope}
        AND e.status NOT IN ('canceled', 'completed', 'draft')
        AND EXISTS (
          SELECT 1
          FROM events conflicting
          WHERE conflicting.id != e.id
            AND ${conflictPredicate('e', 'conflicting')}
            AND conflicting.deleted_at IS NULL
            AND conflicting.calendar_id IN (${calendarIds.map(() => '?').join(',')})
            AND conflicting.status NOT IN ('canceled', 'completed', 'draft')
            AND conflicting.start_datetime < e.end_datetime
            AND conflicting.end_datetime > e.start_datetime
        )
    `).get(...calendarIds, ...calendarIds).count;

    const upcoming = db.prepare(`
      ${baseSelect}
      WHERE e.deleted_at IS NULL AND e.end_datetime >= ?
        AND ${calendarScope}
        AND e.status NOT IN ('canceled', 'completed')
      ORDER BY e.start_datetime LIMIT 6
    `).all(now.toISOString(), ...calendarIds)
      .map((event) => decorateEvent(req.user, event));

    res.json({ success: true, summary: { ...summary, conflicts }, upcoming });
  });
}

module.exports = { registerEventRoutes, markOverdue, validateEvent, detectConflicts };
