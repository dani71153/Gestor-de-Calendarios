const { db } = require('../database');
const config = require('../config');
const { saveEventReminder, cancelEventReminder } = require('../reminders');
const { toGoogleEvent, fromGoogleEvent } = require('./event.mapper');

class SyncService {
  constructor({ provider, repository }) {
    this.provider = provider;
    this.repository = repository;
  }

  getEvent(eventId) {
    return db.prepare(`
      SELECT e.id, e.title, e.description,
             e.start_datetime AS startDatetime, e.end_datetime AS endDatetime,
             e.all_day AS allDay, e.timezone, e.status, e.location,
             e.google_event_id AS googleEventId, e.sync_status AS syncStatus,
             e.integration_id AS integrationId,
             e.calendar_id AS calendarId, e.created_by AS createdBy,
             e.responsible_user_id AS responsibleUserId,
             e.google_updated_at AS googleUpdatedAt,
             er.minutes_before AS reminderMinutes,
             COALESCE(c.google_calendar_id, 'primary') AS googleCalendarId
      FROM events e JOIN calendars c ON c.id = e.calendar_id
      LEFT JOIN event_reminders er ON er.event_id = e.id AND er.status != 'canceled'
      WHERE e.id = ?
    `).get(eventId);
  }

  async validAccessToken(integration) {
    const credentials = this.repository.credentials(integration);
    const expiresSoon = !credentials.expiresAt || new Date(credentials.expiresAt).getTime() <= Date.now() + 60_000;
    if (!expiresSoon && credentials.accessToken) return credentials.accessToken;
    if (!credentials.refreshToken) throw new Error('La conexión no tiene refresh token; vuelve a conectar Google Calendar');

    const refreshed = await this.provider.refreshAccessToken(credentials.refreshToken);
    this.repository.updateAccessToken(integration.id, refreshed.accessToken, refreshed.expiresAt);
    return refreshed.accessToken;
  }

  async syncEvent(eventId, userId) {
    const event = this.getEvent(eventId);
    if (!event) throw new Error('Evento no encontrado');
    if (event.status === 'draft') throw new Error('Los eventos en borrador no se sincronizan');

    const integration = event.integrationId
      ? this.repository.findById(event.integrationId)
      : this.repository.findActive(this.provider.name, userId);

    if (!integration || integration.status !== 'active') {
      db.prepare("UPDATE events SET sync_status = 'error' WHERE id = ?").run(eventId);
      throw new Error('Conecta una cuenta de Google Calendar antes de sincronizar');
    }

    let operation = event.googleEventId ? 'update' : 'create';
    try {
      const accessToken = await this.validAccessToken(integration);
      let externalEvent = null;

      if (event.status === 'canceled') {
        operation = 'delete';
        if (event.googleEventId) {
          await this.provider.deleteEvent(accessToken, event.googleCalendarId, event.googleEventId);
        }
      } else if (event.googleEventId) {
        externalEvent = await this.provider.updateEvent(
          accessToken, event.googleCalendarId, event.googleEventId, toGoogleEvent(event)
        );
      } else {
        externalEvent = await this.provider.createEvent(
          accessToken, event.googleCalendarId, toGoogleEvent(event)
        );
      }

      if (event.status === 'canceled') {
        db.prepare(`
          UPDATE events SET google_event_id = NULL, sync_status = 'synced',
          integration_id = ?, last_synced_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP WHERE id = ?
        `).run(integration.id, eventId);
      } else {
        db.prepare(`
          UPDATE events SET google_event_id = COALESCE(?, google_event_id),
          sync_status = 'synced', integration_id = ?, google_updated_at = ?,
          last_synced_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(externalEvent?.id || null, integration.id, externalEvent?.updated || null, eventId);
      }
      this.log(eventId, integration.id, operation, 'success', externalEvent?.id || event.googleEventId, null);
      return this.getEvent(eventId);
    } catch (error) {
      db.prepare("UPDATE events SET sync_status = 'error', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(eventId);
      this.log(eventId, integration.id, operation, 'error', event.googleEventId, error.message);
      if (error.status === 401 || error.status === 403) this.repository.markError(integration.id, error.message);
      throw error;
    }
  }

  getSyncState(integrationId, calendarId) {
    return db.prepare(`
      SELECT id, integration_id AS integrationId, calendar_id AS calendarId,
             remote_calendar_id AS remoteCalendarId, sync_token AS syncToken,
             last_success_at AS lastSuccessAt
      FROM integration_sync_states
      WHERE integration_id = ? AND calendar_id = ?
    `).get(integrationId, calendarId);
  }

  async collectRemoteChanges(accessToken, remoteCalendarId, syncToken = null) {
    const events = [];
    let pageToken = null;
    let nextSyncToken = null;
    let pages = 0;
    do {
      const page = await this.provider.listEvents(accessToken, remoteCalendarId, { pageToken, syncToken });
      events.push(...(page.items || []));
      pageToken = page.nextPageToken || null;
      nextSyncToken = page.nextSyncToken || nextSyncToken;
      pages += 1;
      if (pages > 100) throw new Error('Google devolvió demasiadas páginas durante la importación');
    } while (pageToken);
    if (!nextSyncToken) throw new Error('Google no devolvió el cursor para continuar la sincronización');
    return { events, nextSyncToken };
  }

  findLocalEvent(integrationId, remoteEvent) {
    let event = db.prepare(`
      SELECT id, calendar_id AS calendarId, created_by AS createdBy,
             responsible_user_id AS responsibleUserId, sync_status AS syncStatus,
             status, deleted_at AS deletedAt, google_updated_at AS googleUpdatedAt
      FROM events
      WHERE google_event_id = ? AND (integration_id = ? OR integration_id IS NULL)
      ORDER BY integration_id IS NULL, id LIMIT 1
    `).get(remoteEvent.id, integrationId);
    const internalId = remoteEvent.extendedProperties?.private?.source === 'gestor-central-calendarios'
      ? Number(remoteEvent.extendedProperties.private.internalEventId) || null
      : null;
    if (!event && internalId) {
      event = db.prepare(`
        SELECT id, calendar_id AS calendarId, created_by AS createdBy,
               responsible_user_id AS responsibleUserId, sync_status AS syncStatus,
               status, deleted_at AS deletedAt, google_updated_at AS googleUpdatedAt
        FROM events WHERE id = ?
      `).get(internalId);
    }
    return event || null;
  }

  auditImport(userId, action, eventId, previous, next) {
    db.prepare(`
      INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_values, new_values)
      VALUES (?, ?, 'event', ?, ?, ?)
    `).run(
      userId,
      action,
      eventId,
      previous ? JSON.stringify(previous) : null,
      next ? JSON.stringify(next) : null
    );
  }

  applyRemoteEvent({ remoteEvent, integration, targetCalendarId, eventTypeId, userId, canApply }) {
    const existing = this.findLocalEvent(integration.id, remoteEvent);
    const canceled = remoteEvent.status === 'cancelled' || remoteEvent.status === 'canceled';
    if (existing && !canApply(existing)) return 'skipped';
    if (existing && ['pending', 'error'].includes(existing.syncStatus)) return 'skipped';

    if (canceled) {
      if (!existing || existing.deletedAt || existing.status === 'canceled') return 'unchanged';
      db.prepare(`
        UPDATE events SET status = 'canceled', deleted_at = CURRENT_TIMESTAMP,
          sync_status = 'synced', google_updated_at = ?, last_synced_at = CURRENT_TIMESTAMP,
          integration_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `).run(remoteEvent.updated || null, integration.id, existing.id);
      cancelEventReminder(existing.id);
      this.auditImport(userId, 'sync_import_cancel', existing.id, existing, { status: 'canceled' });
      this.log(existing.id, integration.id, 'import_cancel', 'success', remoteEvent.id, null);
      return 'canceled';
    }

    const mapped = fromGoogleEvent(remoteEvent, { timezone: config.timezone });
    if (!mapped) return 'skipped';
    if (existing?.googleUpdatedAt && mapped.googleUpdatedAt
      && new Date(mapped.googleUpdatedAt) <= new Date(existing.googleUpdatedAt)) {
      return 'unchanged';
    }

    if (existing) {
      db.prepare(`
        UPDATE events SET title = ?, description = ?, start_datetime = ?, end_datetime = ?,
          all_day = ?, timezone = ?, location = ?, virtual_link = ?, status = 'confirmed',
          deleted_at = NULL, google_event_id = ?, integration_id = ?, sync_status = 'synced',
          google_updated_at = ?, last_synced_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `).run(
        mapped.title, mapped.description, mapped.startDatetime, mapped.endDatetime,
        mapped.allDay, mapped.timezone, mapped.location, mapped.virtualLink,
        mapped.googleEventId, integration.id, mapped.googleUpdatedAt, existing.id
      );
      saveEventReminder(
        existing.id,
        mapped.reminderMinutes,
        existing.responsibleUserId || existing.createdBy
      );
      this.auditImport(userId, 'sync_import_update', existing.id, existing, mapped);
      this.log(existing.id, integration.id, 'import_update', 'success', remoteEvent.id, null);
      return 'updated';
    }

    const result = db.prepare(`
      INSERT INTO events (
        calendar_id, event_type_id, title, description, start_datetime, end_datetime,
        all_day, timezone, priority, status, location, virtual_link,
        responsible_user_id, created_by, google_event_id, sync_status, integration_id,
        google_updated_at, last_synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'normal', 'confirmed', ?, ?, ?, ?, ?, 'synced', ?, ?, CURRENT_TIMESTAMP)
    `).run(
      targetCalendarId, eventTypeId, mapped.title, mapped.description,
      mapped.startDatetime, mapped.endDatetime, mapped.allDay, mapped.timezone,
      mapped.location, mapped.virtualLink, userId, userId, mapped.googleEventId,
      integration.id, mapped.googleUpdatedAt
    );
    const eventId = Number(result.lastInsertRowid);
    saveEventReminder(eventId, mapped.reminderMinutes, userId);
    this.auditImport(userId, 'sync_import_create', eventId, null, mapped);
    this.log(eventId, integration.id, 'import_create', 'success', remoteEvent.id, null);
    return 'created';
  }

  saveImportState(integrationId, calendarId, remoteCalendarId, syncToken, counts, error = null) {
    db.prepare(`
      INSERT INTO integration_sync_states (
        integration_id, calendar_id, remote_calendar_id, sync_token,
        last_success_at, last_created, last_updated, last_canceled, last_skipped,
        last_error, updated_at
      ) VALUES (?, ?, ?, ?, CASE WHEN ? IS NULL THEN CURRENT_TIMESTAMP ELSE NULL END,
        ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(integration_id, calendar_id) DO UPDATE SET
        remote_calendar_id = excluded.remote_calendar_id,
        sync_token = COALESCE(excluded.sync_token, integration_sync_states.sync_token),
        last_success_at = CASE WHEN excluded.last_error IS NULL THEN CURRENT_TIMESTAMP ELSE integration_sync_states.last_success_at END,
        last_created = excluded.last_created,
        last_updated = excluded.last_updated,
        last_canceled = excluded.last_canceled,
        last_skipped = excluded.last_skipped,
        last_error = excluded.last_error,
        updated_at = CURRENT_TIMESTAMP
    `).run(
      integrationId, calendarId, remoteCalendarId, syncToken, error,
      counts.created, counts.updated, counts.canceled, counts.skipped, error
    );
  }

  async importChanges({ userId, calendarId, canApply = () => true }) {
    const integration = this.repository.findActive(this.provider.name, userId);
    if (!integration) throw new Error('Conecta una cuenta de Google Calendar antes de importar cambios');
    const calendar = db.prepare(`
      SELECT id, COALESCE(google_calendar_id, 'primary') AS googleCalendarId
      FROM calendars WHERE id = ? AND status = 'active'
    `).get(calendarId);
    if (!calendar) throw new Error('El calendario de destino no está disponible');
    const eventType = db.prepare(`
      SELECT id FROM event_types WHERE status = 'active'
      ORDER BY CASE WHEN name = 'Reunión' THEN 0 ELSE 1 END, id LIMIT 1
    `).get();
    if (!eventType) throw new Error('No existe un tipo de evento activo para la importación');

    const accessToken = await this.validAccessToken(integration);
    let state = this.getSyncState(integration.id, calendar.id);
    let collection;
    let fullSync = !state?.syncToken;
    try {
      try {
        collection = await this.collectRemoteChanges(accessToken, calendar.googleCalendarId, state?.syncToken || null);
      } catch (error) {
        if (error.status !== 410 || !state?.syncToken) throw error;
        db.prepare('UPDATE integration_sync_states SET sync_token = NULL WHERE id = ?').run(state.id);
        state = null;
        fullSync = true;
        collection = await this.collectRemoteChanges(accessToken, calendar.googleCalendarId, null);
      }

      const counts = { created: 0, updated: 0, canceled: 0, skipped: 0, unchanged: 0 };
      db.exec('BEGIN');
      try {
        collection.events.forEach((remoteEvent) => {
          const outcome = this.applyRemoteEvent({
            remoteEvent,
            integration,
            targetCalendarId: calendar.id,
            eventTypeId: eventType.id,
            userId,
            canApply
          });
          counts[outcome] += 1;
        });
        this.saveImportState(
          integration.id,
          calendar.id,
          calendar.googleCalendarId,
          collection.nextSyncToken,
          counts
        );
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
      return { ...counts, received: collection.events.length, fullSync };
    } catch (error) {
      const counts = { created: 0, updated: 0, canceled: 0, skipped: 0 };
      this.saveImportState(
        integration.id,
        calendar.id,
        calendar.googleCalendarId,
        null,
        counts,
        error.message
      );
      this.log(null, integration.id, 'import', 'error', null, error.message);
      if (error.status === 401 || error.status === 403) this.repository.markError(integration.id, error.message);
      throw error;
    }
  }

  async retry(userId, canSync = () => true) {
    const events = db.prepare(`
      SELECT id, calendar_id AS calendarId, created_by AS createdBy FROM events
      WHERE sync_status IN ('pending', 'error')
        AND (deleted_at IS NULL OR google_event_id IS NOT NULL)
      ORDER BY updated_at LIMIT 50
    `).all().filter(canSync);
    const results = [];
    for (const event of events) {
      try {
        await this.syncEvent(event.id, userId);
        results.push({ eventId: event.id, success: true });
      } catch (error) {
        results.push({ eventId: event.id, success: false, error: error.message });
      }
    }
    return results;
  }

  status(userId, calendarIds = null) {
    const integration = this.repository.find(this.provider.name, userId);
    let counts = { synced: 0, pending: 0, errors: 0 };
    let lastImport = null;
    let syncIssue = null;
    if (!Array.isArray(calendarIds) || calendarIds.length) {
      const scope = Array.isArray(calendarIds)
        ? `AND calendar_id IN (${calendarIds.map(() => '?').join(',')})`
        : '';
      counts = db.prepare(`
        SELECT
          SUM(CASE WHEN sync_status = 'synced' THEN 1 ELSE 0 END) AS synced,
          SUM(CASE WHEN sync_status = 'pending' THEN 1 ELSE 0 END) AS pending,
          SUM(CASE WHEN sync_status = 'error' THEN 1 ELSE 0 END) AS errors
        FROM events WHERE deleted_at IS NULL ${scope}
      `).get(...(calendarIds || []));
      const issueScope = Array.isArray(calendarIds)
        ? `AND e.calendar_id IN (${calendarIds.map(() => '?').join(',')})`
        : '';
      syncIssue = db.prepare(`
        SELECT e.id AS eventId, e.title,
               COALESCE(sl.error_message,
                 CASE WHEN e.sync_status = 'pending' THEN 'Este evento todavía no se ha enviado a Google.'
                      ELSE 'Google no pudo procesar este evento.' END) AS error,
               COALESCE(sl.created_at, e.updated_at) AS at
        FROM events e
        LEFT JOIN sync_logs sl ON sl.id = (
          SELECT candidate.id FROM sync_logs candidate
          WHERE candidate.event_id = e.id AND candidate.status = 'error'
          ORDER BY candidate.id DESC LIMIT 1
        )
        WHERE e.deleted_at IS NULL AND e.sync_status IN ('pending', 'error') ${issueScope}
        ORDER BY CASE e.sync_status WHEN 'error' THEN 0 ELSE 1 END,
                 COALESCE(sl.created_at, e.updated_at) DESC LIMIT 1
      `).get(...(calendarIds || [])) || null;
    }
    if (integration && (!Array.isArray(calendarIds) || calendarIds.length)) {
      const scope = Array.isArray(calendarIds)
        ? `AND s.calendar_id IN (${calendarIds.map(() => '?').join(',')})`
        : '';
      lastImport = db.prepare(`
        SELECT s.calendar_id AS calendarId, c.name AS calendarName,
               s.last_success_at AS at, s.last_created AS created,
               s.last_updated AS updated, s.last_canceled AS canceled,
               s.last_skipped AS skipped, s.last_error AS error
        FROM integration_sync_states s
        JOIN calendars c ON c.id = s.calendar_id
        WHERE s.integration_id = ? ${scope}
        ORDER BY COALESCE(s.last_success_at, s.updated_at) DESC LIMIT 1
      `).get(integration.id, ...(calendarIds || [])) || null;
    }
    return {
      provider: this.provider.name,
      configured: this.provider.isConfigured(),
      connected: integration?.status === 'active',
      accountEmail: integration?.accountEmail || null,
      integrationStatus: integration?.status || 'not_connected',
      lastError: integration?.lastError || null,
      lastImport,
      syncIssue,
      counts: {
        synced: counts.synced || 0,
        pending: counts.pending || 0,
        errors: counts.errors || 0
      }
    };
  }

  log(eventId, integrationId, operation, status, externalEventId, errorMessage) {
    db.prepare(`
      INSERT INTO sync_logs (
        event_id, integration_id, provider, operation, status,
        external_event_id, error_message
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(eventId, integrationId, this.provider.name, operation, status, externalEventId || null, errorMessage || null);
  }
}

module.exports = { SyncService };
