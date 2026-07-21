const { db } = require('./database');

const ROLE_ADMIN = 'Administrador';
const ROLE_SUPERVISOR = 'Supervisor';
const ROLE_EMPLOYEE = 'Empleado';
const ROLE_READ_ONLY = 'Consulta';

function emptyGrant() {
  return { canView: 0, canCreate: 0, canEdit: 0, canDelete: 0 };
}

function normalizeGrant(grant) {
  return grant || emptyGrant();
}

function canViewCalendar(user, calendar, grant = emptyGrant()) {
  if (!calendar) return false;
  if (user.role === ROLE_ADMIN) return true;
  if (calendar.status !== 'active') return false;
  if (calendar.visibility === 'company') return true;
  if (calendar.visibility === 'department' && calendar.departmentId === user.departmentId) return true;
  if (calendar.ownerUserId === user.id) return true;
  if (user.role === ROLE_SUPERVISOR && calendar.departmentId === user.departmentId) return true;
  return Boolean(normalizeGrant(grant).canView);
}

function canCreateEvent(user, calendar, grant = emptyGrant()) {
  if (!calendar || calendar.status !== 'active') return false;
  if (user.role === ROLE_ADMIN) return true;
  if (user.role === ROLE_READ_ONLY) return false;
  if (user.role === ROLE_SUPERVISOR && calendar.departmentId === user.departmentId) return true;
  if (calendar.ownerUserId === user.id) return true;
  return Boolean(normalizeGrant(grant).canCreate);
}

function canEditEvent(user, event, calendar, grant = emptyGrant()) {
  if (!event || !canViewCalendar(user, calendar, grant)) return false;
  if (user.role === ROLE_ADMIN) return true;
  if (user.role === ROLE_READ_ONLY) return false;
  if (user.role === ROLE_SUPERVISOR && calendar.departmentId === user.departmentId) return true;
  if (normalizeGrant(grant).canEdit) return true;
  return user.role === ROLE_EMPLOYEE && event.createdBy === user.id;
}

function canDeleteEvent(user, event, calendar, grant = emptyGrant()) {
  if (!event || !canViewCalendar(user, calendar, grant)) return false;
  if (user.role === ROLE_ADMIN) return true;
  if (user.role === ROLE_READ_ONLY) return false;
  if (user.role === ROLE_SUPERVISOR && calendar.departmentId === user.departmentId) return true;
  if (normalizeGrant(grant).canDelete) return true;
  return user.role === ROLE_EMPLOYEE && event.createdBy === user.id;
}

function calendarContext(calendarId, userId) {
  const calendar = db.prepare(`
    SELECT id, department_id AS departmentId, owner_user_id AS ownerUserId,
           visibility, status
    FROM calendars WHERE id = ?
  `).get(Number(calendarId));
  if (!calendar) return { calendar: null, grant: emptyGrant() };
  const grant = db.prepare(`
    SELECT can_view AS canView, can_create AS canCreate,
           can_edit AS canEdit, can_delete AS canDelete
    FROM calendar_permissions WHERE calendar_id = ? AND user_id = ?
  `).get(calendar.id, userId);
  return { calendar, grant: normalizeGrant(grant) };
}

function calendarCapabilities(user, calendarId) {
  const { calendar, grant } = calendarContext(calendarId, user.id);
  return {
    canView: canViewCalendar(user, calendar, grant),
    canCreate: canCreateEvent(user, calendar, grant),
    canEdit: user.role === ROLE_ADMIN || Boolean(grant.canEdit)
      || (user.role === ROLE_SUPERVISOR && calendar?.departmentId === user.departmentId),
    canDelete: user.role === ROLE_ADMIN || Boolean(grant.canDelete)
      || (user.role === ROLE_SUPERVISOR && calendar?.departmentId === user.departmentId)
  };
}

function eventCapabilities(user, event) {
  const { calendar, grant } = calendarContext(event.calendarId, user.id);
  return {
    canView: canViewCalendar(user, calendar, grant),
    canEdit: canEditEvent(user, event, calendar, grant),
    canDelete: canDeleteEvent(user, event, calendar, grant)
  };
}

function accessibleCalendarIds(user, { activeOnly = false } = {}) {
  const calendars = db.prepare(`
    SELECT id, department_id AS departmentId, owner_user_id AS ownerUserId,
           visibility, status
    FROM calendars
    ${activeOnly ? "WHERE status = 'active'" : ''}
    ORDER BY id
  `).all();
  if (user.role === ROLE_ADMIN) return calendars.map((calendar) => calendar.id);
  const grants = new Map(db.prepare(`
    SELECT calendar_id AS calendarId, can_view AS canView, can_create AS canCreate,
           can_edit AS canEdit, can_delete AS canDelete
    FROM calendar_permissions WHERE user_id = ?
  `).all(user.id).map((grant) => [grant.calendarId, grant]));
  return calendars
    .filter((calendar) => canViewCalendar(user, calendar, grants.get(calendar.id)))
    .map((calendar) => calendar.id);
}

function requireAdministrator(req, res, next) {
  if (req.user.role !== ROLE_ADMIN) {
    return res.status(403).json({ success: false, error: 'Solo un administrador puede realizar esta acción' });
  }
  next();
}

module.exports = {
  ROLE_ADMIN,
  ROLE_SUPERVISOR,
  ROLE_EMPLOYEE,
  ROLE_READ_ONLY,
  canViewCalendar,
  canCreateEvent,
  canEditEvent,
  canDeleteEvent,
  calendarCapabilities,
  eventCapabilities,
  accessibleCalendarIds,
  requireAdministrator
};
