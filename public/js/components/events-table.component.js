import { STATUS_LABELS, PRIORITY_LABELS } from '../config/ui.config.js';
import { escapeHtml, formatDate } from '../core/formatters.js';

function syncLabel(status) {
  return {
    synced: 'Sincronizado',
    pending: 'Pendiente',
    error: 'Error',
    not_synced: 'Local'
  }[status] || status;
}

export function eventRows(events) {
  return events.map((event) => `
    <tr>
      <td>
        <strong>${formatDate(event.startDatetime, { day: '2-digit', month: 'short' })}</strong><br>
        <small>${formatDate(event.startDatetime, { hour: 'numeric', minute: '2-digit' })}</small>
      </td>
      <td class="event-title-cell">
        <strong>${escapeHtml(event.title)}</strong><small>${escapeHtml(event.eventType)}</small>
      </td>
      <td>
        <span class="calendar-pill"><i style="background:${event.calendarColor}"></i>${escapeHtml(event.calendarName)}</span>
      </td>
      <td>${escapeHtml(event.responsibleName || 'Sin asignar')}</td>
      <td><span class="status-pill ${event.status}">${STATUS_LABELS[event.status] || event.status}</span></td>
      <td><span class="priority-pill ${event.priority}">${PRIORITY_LABELS[event.priority]}</span></td>
      <td><span class="sync-pill ${event.syncStatus}">${syncLabel(event.syncStatus)}</span></td>
      <td><button class="row-action" data-event-id="${event.id}">${event.canEdit ? 'Editar' : 'Ver'}</button></td>
    </tr>
  `).join('');
}
