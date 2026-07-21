import { escapeHtml } from '../core/formatters.js';

export function adminCalendarItems(calendars) {
  if (!calendars.length) return '<div class="empty-state">No hay calendarios registrados.</div>';
  return calendars.map((calendar) => `
    <button class="admin-record" type="button" data-admin-calendar-id="${calendar.id}">
      <span class="record-mark" style="background:${calendar.color}"></span>
      <span class="record-main">
        <strong>${escapeHtml(calendar.name)}</strong>
        <small>${escapeHtml(calendar.department || 'Toda la empresa')} · ${visibilityLabel(calendar.visibility)}</small>
      </span>
      <span class="record-meta">
        <small>${calendar.permissionCount} ${calendar.permissionCount === 1 ? 'acceso' : 'accesos'}</small>
        <span class="status-pill ${calendar.status === 'active' ? 'confirmed' : 'canceled'}">
          ${calendar.status === 'active' ? 'Activo' : 'Archivado'}
        </span>
      </span>
    </button>
  `).join('');
}

export function adminUserItems(users) {
  if (!users.length) return '<div class="empty-state">No hay usuarios registrados.</div>';
  return users.map((user) => `
    <button class="admin-record" type="button" data-admin-user-id="${user.id}">
      <span class="record-avatar">${escapeHtml(user.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase())}</span>
      <span class="record-main">
        <strong>${escapeHtml(user.name)}</strong>
        <small>${escapeHtml(user.email)}</small>
      </span>
      <span class="record-meta">
        <small>${escapeHtml(user.department || 'Sin departamento')} · ${user.calendarCount || 0} ${(user.calendarCount || 0) === 1 ? 'calendario' : 'calendarios'}</small>
        <span class="status-pill ${user.status === 'active' ? 'confirmed' : 'canceled'}">
          ${escapeHtml(user.role)} · ${user.status === 'active' ? 'Activo' : 'Inactivo'}
        </span>
      </span>
    </button>
  `).join('');
}

export function userCalendarAssignments(calendars, permissions = [], role = 'Empleado') {
  const grants = new Map(permissions.map((permission) => [Number(permission.calendarId), permission]));
  const isAdministrator = role === 'Administrador';
  const isReadOnly = role === 'Consulta';
  const activeCalendars = calendars.filter((calendar) => calendar.status === 'active');
  if (!activeCalendars.length) return '<div class="empty-state compact">No hay calendarios activos para asignar.</div>';
  return activeCalendars.map((calendar) => {
    const grant = grants.get(calendar.id) || {};
    let level = 'none';
    if (grant.canEdit || grant.canDelete) level = 'manage';
    else if (grant.canCreate) level = 'create';
    else if (grant.canView) level = 'view';
    if (isReadOnly && level !== 'none') level = 'view';
    return `
      <div class="user-calendar-row" data-user-calendar-id="${calendar.id}">
        <span class="record-mark" style="background:${calendar.color}"></span>
        <span class="user-calendar-info">
          <strong>${escapeHtml(calendar.name)}</strong>
          <small>${escapeHtml(calendar.department || 'Toda la empresa')}</small>
        </span>
        <select data-calendar-access aria-label="Acceso a ${escapeHtml(calendar.name)}" ${isAdministrator ? 'disabled' : ''}>
          <option value="none" ${level === 'none' ? 'selected' : ''}>Sin permiso adicional</option>
          <option value="view" ${level === 'view' ? 'selected' : ''}>Solo lectura</option>
          <option value="create" ${level === 'create' ? 'selected' : ''} ${isReadOnly ? 'disabled' : ''}>Crear eventos</option>
          <option value="manage" ${level === 'manage' ? 'selected' : ''} ${isReadOnly ? 'disabled' : ''}>Gestionar eventos</option>
        </select>
      </div>
    `;
  }).join('');
}

export function permissionRows(permissions) {
  if (!permissions.length) return '<div class="empty-state compact">No hay usuarios activos para asignar.</div>';
  return permissions.map((permission) => `
    <div class="permission-row" role="row" data-permission-user-id="${permission.userId}">
      <span class="permission-user">
        <strong>${escapeHtml(permission.name)}</strong>
        <small>${escapeHtml(permission.role)}</small>
      </span>
      ${permissionCheckbox(permission, 'canView', 'ver')}
      ${permissionCheckbox(permission, 'canCreate', 'crear')}
      ${permissionCheckbox(permission, 'canEdit', 'editar')}
      ${permissionCheckbox(permission, 'canDelete', 'cancelar')}
    </div>
  `).join('');
}

function permissionCheckbox(permission, key, label) {
  return `
    <label class="permission-check" aria-label="Permitir ${label} a ${escapeHtml(permission.name)}">
      <input type="checkbox" data-permission="${key}" ${permission[key] ? 'checked' : ''}>
      <span></span>
    </label>
  `;
}

function visibilityLabel(visibility) {
  return {
    company: 'Toda la empresa',
    department: 'Departamento',
    private: 'Solo autorizados'
  }[visibility] || visibility;
}
