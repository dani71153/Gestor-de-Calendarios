import { SUMMARY_CARDS } from '../config/ui.config.js';
import { escapeHtml, formatDate } from '../core/formatters.js';

export function summaryCards(summary) {
  return SUMMARY_CARDS.map((card) => `
    <button class="summary-card" type="button" data-summary-filter="${card.key}"
      style="--accent:${card.color}" aria-label="Ver ${summary[card.key]} eventos: ${card.label}">
      <p>${card.label}</p><strong>${summary[card.key]}</strong><span>${card.note}</span>
    </button>
  `).join('');
}

export function upcomingEvents(events) {
  if (!events.length) return '<div class="empty-state">No hay eventos próximos.</div>';
  return events.map((event) => `
    <button class="upcoming-item row-action" data-event-id="${event.id}">
      <span class="date-block">
        <strong>${formatDate(event.startDatetime, { day: '2-digit' })}</strong>
        <small>${formatDate(event.startDatetime, { month: 'short' })}</small>
      </span>
      <span class="event-color" style="background:${event.calendarColor}"></span>
      <span class="event-info">
        <strong>${escapeHtml(event.title)}</strong>
        <small>${escapeHtml(event.calendarName)} · ${escapeHtml(event.responsibleName || 'Sin responsable')}</small>
      </span>
      <span class="time-badge">${formatDate(event.startDatetime, { hour: 'numeric', minute: '2-digit' })}</span>
    </button>
  `).join('');
}

export function calendarDistribution(calendars, events, limit = 5, scaleMaxActivities = 10) {
  const totals = {};
  events.forEach((event) => {
    totals[event.calendarId] = (totals[event.calendarId] || 0) + 1;
  });
  const scaleMax = Math.max(1, Number(scaleMaxActivities) || 10);
  const sorted = [...calendars].sort((a, b) => (totals[b.id] || 0) - (totals[a.id] || 0));
  const visible = sorted.slice(0, Math.max(1, Number(limit) || 5));
  const hidden = Math.max(0, sorted.length - visible.length);
  return `${visible.map((calendar) => {
    const total = totals[calendar.id] || 0;
    const percentage = Math.min(100, (total / scaleMax) * 100);
    return `
    <div class="distribution-row">
      <p>${escapeHtml(calendar.name)}</p><strong>${total}</strong>
      <div class="bar" role="progressbar" aria-label="${escapeHtml(calendar.name)}: ${total} de ${scaleMax} actividades"
        aria-valuenow="${total}" aria-valuemin="0" aria-valuemax="${scaleMax}">
        <span style="width:${percentage}%;background:${calendar.color}"></span>
      </div>
    </div>
  `; }).join('')}${hidden ? `<p class="distribution-overflow">+ ${hidden} calendarios fuera de esta vista</p>` : ''}
    <p class="distribution-scale">Escala: ${scaleMax} actividades = 100%</p>`;
}
