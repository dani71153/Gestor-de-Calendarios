const test = require('node:test');
const assert = require('node:assert/strict');
const { validateEvent } = require('../src/events');

const validEvent = {
  title: 'Reunión operativa',
  calendarId: 1,
  eventTypeId: 2,
  startDatetime: '2026-07-20T14:00:00.000Z',
  endDatetime: '2026-07-20T15:00:00.000Z',
  status: 'confirmed',
  priority: 'normal'
};

test('acepta un evento con los campos y fechas válidos', () => {
  assert.equal(validateEvent(validEvent), null);
});

test('rechaza un evento sin título', () => {
  assert.equal(validateEvent({ ...validEvent, title: '' }), 'El título es obligatorio');
});

test('rechaza un rango de fechas invertido', () => {
  assert.equal(
    validateEvent({
      ...validEvent,
      startDatetime: '2026-07-20T16:00:00.000Z',
      endDatetime: '2026-07-20T15:00:00.000Z'
    }),
    'La fecha final debe ser posterior a la inicial'
  );
});

test('rechaza estados y prioridades fuera del catálogo', () => {
  assert.equal(validateEvent({ ...validEvent, status: 'unknown' }), 'Estado no válido');
  assert.equal(validateEvent({ ...validEvent, priority: 'critical' }), 'Prioridad no válida');
});
