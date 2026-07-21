import { escapeHtml, formatDate, localInputValue } from '../core/formatters.js';

export function monthCalendar({ currentDate, events, calendarId = 0 }) {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const first = new Date(year, month, 1);
  const gridStart = new Date(year, month, 1 - ((first.getDay() + 6) % 7));
  const today = new Date();
  const days = [];

  for (let i = 0; i < 42; i += 1) {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + i);
    const dayEvents = events.filter((event) => {
      const eventDate = new Date(event.startDatetime);
      return eventDate.toDateString() === date.toDateString() && (!calendarId || event.calendarId === calendarId);
    });
    const isToday = date.toDateString() === today.toDateString();
    days.push(`
      <div class="calendar-day ${date.getMonth() !== month ? 'outside' : ''} ${isToday ? 'today' : ''}" data-date="${localInputValue(date).slice(0, 10)}">
        <span class="day-number">${date.getDate()}</span>
        ${dayEvents.slice(0, 4).map((event) => `
          <button class="calendar-event" data-event-id="${event.id}" style="background:${event.calendarColor}1f;color:${event.calendarColor};border-left:3px solid ${event.calendarColor}">
            ${formatDate(event.startDatetime, { hour: '2-digit', minute: '2-digit' })} ${escapeHtml(event.title)}
          </button>
        `).join('')}
      </div>
    `);
  }

  return {
    label: formatDate(first, { month: 'long', year: 'numeric' }),
    days: days.join('')
  };
}
