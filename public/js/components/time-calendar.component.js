import { escapeHtml, formatDate, localInputValue } from '../core/formatters.js';

export const PIXELS_PER_HOUR = 72;

function startOfWeek(date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return start;
}

function dayKey(date) {
  return localInputValue(date).slice(0, 10);
}

export function timeCalendar({ currentDate, mode, events, calendarId = 0, settings }) {
  const startHour = Number(settings.workdayStartHour) || 8;
  const endHour = Number(settings.workdayEndHour) || 18;
  const slotMinutes = Number(settings.calendarSlotMinutes) || 30;
  const firstDay = mode === 'day' ? new Date(currentDate) : startOfWeek(currentDate);
  firstDay.setHours(0, 0, 0, 0);
  const days = Array.from({ length: mode === 'day' ? 1 : 7 }, (_, index) => {
    const date = new Date(firstDay);
    date.setDate(firstDay.getDate() + index);
    return date;
  });
  const height = (endHour - startHour) * PIXELS_PER_HOUR;
  const slotLines = Array.from({ length: ((endHour - startHour) * 60) / slotMinutes }, (_, index) => (
    `<i class="time-slot-line" style="top:${index * PIXELS_PER_HOUR * slotMinutes / 60}px"></i>`
  )).join('');
  const filtered = events.filter((event) => !calendarId || event.calendarId === calendarId);
  const today = dayKey(new Date());

  const headers = days.map((day) => `
    <div class="time-day-header ${dayKey(day) === today ? 'today' : ''}">
      <span>${formatDate(day, { weekday: 'short' })}</span>
      <strong>${day.getDate()}</strong>
    </div>
  `).join('');

  const labels = Array.from({ length: endHour - startHour + 1 }, (_, index) => {
    const hour = startHour + index;
    return `<span class="time-hour-label" style="top:${index * PIXELS_PER_HOUR}px">${String(hour).padStart(2, '0')}:00</span>`;
  }).join('');

  const columns = days.map((day) => {
    const dayStart = new Date(day);
    dayStart.setHours(startHour, 0, 0, 0);
    const dayEnd = new Date(day);
    dayEnd.setHours(endHour, 0, 0, 0);
    const dayEvents = filtered.filter((event) => (
      new Date(event.startDatetime) < dayEnd && new Date(event.endDatetime) > dayStart
    ));
    return `
      <div class="time-day-column ${dayKey(day) === today ? 'today' : ''}"
        data-time-day="${dayKey(day)}" data-start-hour="${startHour}"
        style="--slot-height:${PIXELS_PER_HOUR * slotMinutes / 60}px">
        ${slotLines}
        ${dayEvents.map((event) => {
          const rawStart = new Date(event.startDatetime);
          const rawEnd = new Date(event.endDatetime);
          const visibleStart = rawStart < dayStart ? dayStart : rawStart;
          const visibleEnd = rawEnd > dayEnd ? dayEnd : rawEnd;
          const top = ((visibleStart - dayStart) / 3600000) * PIXELS_PER_HOUR;
          const eventHeight = Math.max(28, ((visibleEnd - visibleStart) / 3600000) * PIXELS_PER_HOUR);
          return `
            <button class="time-event" type="button" data-event-id="${event.id}"
              draggable="${Boolean(event.canEdit)}" data-can-edit="${Boolean(event.canEdit)}"
              style="top:${top}px;height:${eventHeight}px;--event-color:${event.calendarColor}">
              <strong>${escapeHtml(event.title)}</strong>
              <span>${formatDate(rawStart, { hour: '2-digit', minute: '2-digit' })}–${formatDate(rawEnd, { hour: '2-digit', minute: '2-digit' })}</span>
              ${event.resourceName ? `<small>${escapeHtml(event.resourceName)}</small>` : ''}
              ${event.canEdit ? `<i class="event-resize-handle" data-resize-event-id="${event.id}" aria-label="Cambiar duración"></i>` : ''}
            </button>
          `;
        }).join('')}
      </div>
    `;
  }).join('');

  const lastDay = days.at(-1);
  const label = mode === 'day'
    ? formatDate(firstDay, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : `${formatDate(firstDay, { day: 'numeric', month: 'short' })} – ${formatDate(lastDay, { day: 'numeric', month: 'short', year: 'numeric' })}`;

  return {
    label,
    html: `
      <div class="time-calendar ${mode}" style="--day-count:${days.length}">
        <div class="time-calendar-header"><span></span>${headers}</div>
        <div class="time-calendar-scroll">
          <div class="time-calendar-body" style="height:${height}px">
            <div class="time-label-column">${labels}</div>
            <div class="time-day-columns">${columns}</div>
          </div>
        </div>
      </div>
    `
  };
}
