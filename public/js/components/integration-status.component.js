import { escapeHtml, formatDate } from '../core/formatters.js';

export function renderConnectionStatus(status) {
  const state = !status.configured
    ? { className: 'warning', label: 'Falta configuración', detail: 'Agrega las credenciales OAuth.' }
    : status.lastError
      ? { className: 'warning', label: 'Requiere atención', detail: status.lastError }
    : status.connected
      ? { className: 'success', label: 'Conectado', detail: status.accountEmail }
      : { className: 'neutral', label: 'Sin conexión', detail: 'Conecta una cuenta para importar y sincronizar.' };
  return `
    <div class="connection-state ${state.className}">
      <span class="connection-dot" aria-hidden="true"></span>
      <div><strong>${state.label}</strong><small>${escapeHtml(state.detail || '')}</small></div>
    </div>`;
}

export function renderImportState(status) {
  if (!status.lastImport) return `
    <div class="import-empty-state">
      <strong>Aún no has importado eventos</strong>
      <span>La primera importación traerá los eventos existentes; después solo consultará los cambios.</span>
    </div>`;
  const item = status.lastImport;
  return `
    <div class="last-import-state ${item.error ? 'has-error' : ''}">
      <div>
        <strong>${item.error ? 'No pudimos completar la última importación' : 'Última importación completada'}</strong>
        <small>${escapeHtml(item.calendarName)}${item.at ? ` · ${formatDate(item.at, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}` : ''}</small>
      </div>
      ${item.error
        ? `<p>${escapeHtml(item.error)}</p>`
        : `<span>${item.created} nuevos · ${item.updated} actualizados · ${item.canceled} cancelados${item.skipped ? ` · ${item.skipped} omitidos` : ''}</span>`}
    </div>`;
}

export function renderSyncHealth(status) {
  const issueCount = status.counts.pending + status.counts.errors;
  return `
    <div class="sync-health-heading">
      <div>
        <p class="eyebrow">Eventos enviados a Google</p>
        <h4>${issueCount ? `${issueCount} ${issueCount === 1 ? 'evento requiere' : 'eventos requieren'} atención` : 'Sin acciones pendientes'}</h4>
      </div>
      <div class="sync-summary" aria-label="Estado de sincronización">
        <span><strong>${status.counts.synced}</strong> sincronizados</span>
        <span><strong>${status.counts.pending}</strong> pendientes</span>
        <span class="${status.counts.errors ? 'has-error' : ''}"><strong>${status.counts.errors}</strong> con error</span>
      </div>
    </div>
    ${status.syncIssue ? `
      <div class="sync-issue" role="status">
        <div><strong>${escapeHtml(status.syncIssue.title || 'Evento sin sincronizar')}</strong>
          <span>${escapeHtml(status.syncIssue.error || 'Google no pudo procesar este evento.')}</span></div>
        <small>${status.syncIssue.at ? formatDate(status.syncIssue.at, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : ''}</small>
      </div>` : ''}`;
}
