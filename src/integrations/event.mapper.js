function toGoogleEvent(event) {
  const payload = {
    summary: event.title,
    description: event.description || undefined,
    location: event.location || undefined,
    start: event.allDay
      ? { date: event.startDatetime.slice(0, 10) }
      : { dateTime: event.startDatetime, timeZone: event.timezone },
    end: event.allDay
      ? { date: event.endDatetime.slice(0, 10) }
      : { dateTime: event.endDatetime, timeZone: event.timezone },
    reminders: event.reminderMinutes
      ? { useDefault: false, overrides: [{ method: 'popup', minutes: Number(event.reminderMinutes) }] }
      : undefined,
    extendedProperties: {
      private: {
        internalEventId: String(event.id),
        source: 'gestor-central-calendarios'
      }
    }
  };
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));
}

function fromGoogleEvent(event, { timezone = 'America/Santo_Domingo' } = {}) {
  if (!event?.id || event.status === 'cancelled' || event.status === 'canceled') return null;
  const allDay = Boolean(event.start?.date);
  const startValue = event.start?.dateTime || (event.start?.date ? `${event.start.date}T00:00:00.000Z` : null);
  const endValue = event.end?.dateTime || (event.end?.date ? `${event.end.date}T00:00:00.000Z` : null);
  const start = startValue ? new Date(startValue) : null;
  const end = endValue ? new Date(endValue) : null;
  if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return null;
  const reminder = event.reminders?.overrides?.find((item) => (
    ['popup', 'email'].includes(item.method) && Number.isInteger(Number(item.minutes))
  ));
  return {
    googleEventId: event.id,
    internalEventId: event.extendedProperties?.private?.source === 'gestor-central-calendarios'
      ? Number(event.extendedProperties.private.internalEventId) || null
      : null,
    title: event.summary?.trim() || 'Evento de Google',
    description: event.description || null,
    location: event.location || null,
    virtualLink: event.hangoutLink || event.htmlLink || null,
    startDatetime: start.toISOString(),
    endDatetime: end.toISOString(),
    allDay: allDay ? 1 : 0,
    timezone: event.start?.timeZone || event.end?.timeZone || timezone,
    googleUpdatedAt: event.updated || null,
    reminderMinutes: reminder ? Number(reminder.minutes) : null
  };
}

module.exports = { toGoogleEvent, fromGoogleEvent };
