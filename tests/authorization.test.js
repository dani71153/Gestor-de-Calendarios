const test = require('node:test');
const assert = require('node:assert/strict');
const {
  canViewCalendar,
  canCreateEvent,
  canEditEvent,
  canDeleteEvent
} = require('../src/authorization');

const activeCalendar = {
  id: 1,
  departmentId: 2,
  ownerUserId: 1,
  visibility: 'department',
  status: 'active'
};

const admin = { id: 1, role: 'Administrador', departmentId: 1 };
const supervisor = { id: 2, role: 'Supervisor', departmentId: 2 };
const employee = { id: 3, role: 'Empleado', departmentId: 3 };
const consultation = { id: 4, role: 'Consulta', departmentId: 2 };

test('el administrador conserva control total sobre calendarios', () => {
  assert.equal(canViewCalendar(admin, activeCalendar), true);
  assert.equal(canCreateEvent(admin, activeCalendar), true);
  assert.equal(canEditEvent(admin, { createdBy: 3 }, activeCalendar), true);
  assert.equal(canDeleteEvent(admin, { createdBy: 3 }, activeCalendar), true);
});

test('el supervisor administra eventos de su departamento', () => {
  assert.equal(canViewCalendar(supervisor, activeCalendar), true);
  assert.equal(canCreateEvent(supervisor, activeCalendar), true);
  assert.equal(canEditEvent(supervisor, { createdBy: 1 }, activeCalendar), true);
});

test('un empleado necesita permiso para crear y puede editar eventos propios visibles', () => {
  const companyCalendar = { ...activeCalendar, visibility: 'company' };
  assert.equal(canViewCalendar(employee, companyCalendar), true);
  assert.equal(canCreateEvent(employee, companyCalendar), false);
  assert.equal(canCreateEvent(employee, activeCalendar, { canCreate: 1 }), true);
  assert.equal(canEditEvent(employee, { createdBy: employee.id }, companyCalendar), true);
  assert.equal(canEditEvent(employee, { createdBy: admin.id }, companyCalendar), false);
});

test('el rol de consulta permanece en solo lectura aunque tenga visibilidad', () => {
  const grant = { canView: 1, canCreate: 1, canEdit: 1, canDelete: 1 };
  assert.equal(canViewCalendar(consultation, activeCalendar, grant), true);
  assert.equal(canCreateEvent(consultation, activeCalendar, grant), false);
  assert.equal(canEditEvent(consultation, { createdBy: consultation.id }, activeCalendar, grant), false);
  assert.equal(canDeleteEvent(consultation, { createdBy: consultation.id }, activeCalendar, grant), false);
});

test('los calendarios archivados solo permanecen accesibles al administrador', () => {
  const archived = { ...activeCalendar, status: 'archived' };
  assert.equal(canViewCalendar(admin, archived), true);
  assert.equal(canViewCalendar(supervisor, archived, { canView: 1 }), false);
  assert.equal(canCreateEvent(admin, archived), false);
});
