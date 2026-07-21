export const STATUS_LABELS = {
  draft: 'Borrador',
  pending: 'Pendiente',
  confirmed: 'Confirmado',
  in_progress: 'En proceso',
  completed: 'Completado',
  canceled: 'Cancelado',
  overdue: 'Vencido'
};

export const PRIORITY_LABELS = {
  low: 'Baja',
  normal: 'Normal',
  high: 'Alta',
  urgent: 'Urgente'
};

export const VIEW_TITLES = {
  dashboard: 'Resumen ejecutivo',
  calendar: 'Calendario general',
  events: 'Gestión de eventos',
  reports: 'Reportes operativos',
  admin: 'Administración',
  settings: 'Configuración',
  integrations: 'Integraciones'
};

export const SUMMARY_CARDS = [
  { key: 'today', label: 'Hoy', note: 'En la agenda', color: '#4F6BED' },
  { key: 'upcoming', label: 'Próximos', note: 'Siguientes 7 días', color: '#10B981' },
  { key: 'overdue', label: 'Vencidos', note: 'Requieren atención', color: '#E05252' },
  { key: 'unassigned', label: 'Sin responsable', note: 'Por asignar', color: '#F59E0B' },
  { key: 'conflicts', label: 'Conflictos', note: 'Superposiciones', color: '#8B5CF6' }
];
