import { escapeHtml } from '../core/formatters.js';

function meter(value, color = '#4f6bed') {
  const width = Math.min(100, Math.max(0, Number(value) || 0));
  return `<div class="report-meter"><span style="width:${width}%;background:${color}"></span></div>`;
}

export function reportSummary(summary) {
  const cards = [
    ['Eventos', summary.total], ['Completados', summary.completed],
    ['Vencidos', summary.overdue], ['Cumplimiento', `${summary.completionRate}%`]
  ];
  return cards.map(([label, value]) => `<article><small>${label}</small><strong>${value}</strong></article>`).join('');
}

export function workloadRows(rows) {
  if (!rows.length) return '<div class="empty-state">No hay carga registrada en este periodo.</div>';
  return rows.map((row) => `
    <div class="report-row">
      <div><strong>${escapeHtml(row.name)}</strong><small>${row.total} actividades · ${row.completed} completadas</small></div>
      <div class="report-row-metric"><span>${row.scheduledHours} h / ${row.capacityHours} h</span>${meter(row.loadPercentage)}</div>
      <strong class="report-percent ${row.loadPercentage > 100 ? 'overload' : ''}">${row.loadPercentage}%</strong>
    </div>`).join('');
}

export function complianceRows(rows) {
  if (!rows.length) return '<div class="empty-state">No hay actividad por calendario en este periodo.</div>';
  return rows.map((row) => `
    <div class="report-row">
      <div><strong><i style="background:${row.color}"></i>${escapeHtml(row.name)}</strong><small>${row.total} actividades · ${row.overdue} vencidas</small></div>
      <div class="report-row-metric"><span>${row.completed} completadas</span>${meter(row.completionRate, row.color)}</div>
      <strong class="report-percent">${row.completionRate}%</strong>
    </div>`).join('');
}
