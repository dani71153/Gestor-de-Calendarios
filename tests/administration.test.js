const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeCalendarPermissions } = require('../src/administration');

const assignments = [{
  calendarId: 2,
  canView: false,
  canCreate: true,
  canEdit: false,
  canDelete: false
}, {
  calendarId: 4,
  canView: true,
  canCreate: true,
  canEdit: true,
  canDelete: true
}];

test('normaliza varios calendarios y activa lectura para permisos superiores', () => {
  const permissions = normalizeCalendarPermissions(assignments, 'Empleado');
  assert.equal(permissions.length, 2);
  assert.equal(permissions[0].canView, true);
  assert.equal(permissions[0].canCreate, true);
  assert.equal(permissions[1].canEdit, true);
  assert.equal(permissions[1].canDelete, true);
});

test('el rol Consulta conserva exclusivamente lectura', () => {
  const permissions = normalizeCalendarPermissions(assignments, 'Consulta');
  assert.equal(permissions.every((permission) => permission.canView), true);
  assert.equal(permissions.some((permission) => permission.canCreate), false);
  assert.equal(permissions.some((permission) => permission.canEdit), false);
  assert.equal(permissions.some((permission) => permission.canDelete), false);
});

test('un administrador no necesita asignaciones explícitas', () => {
  assert.deepEqual(normalizeCalendarPermissions(assignments, 'Administrador'), []);
});
