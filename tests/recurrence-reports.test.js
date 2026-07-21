const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeRecurrence, occurrenceDates } = require('../src/recurrence');
const { weekdaysBetween } = require('../src/reports');

test('normaliza una regla recurrente dentro de los límites', () => {
  assert.deepEqual(normalizeRecurrence({ frequency: 'weekly', interval: 2, count: 6 }), {
    frequency: 'weekly', interval: 2, count: 6
  });
  assert.match(normalizeRecurrence({ frequency: 'yearly', interval: 1, count: 2 }).error, /frecuencia/i);
  assert.match(normalizeRecurrence({ frequency: 'daily', interval: 1, count: 101 }).error, /2 y 100/i);
});

test('genera ocurrencias preservando duración e intervalo', () => {
  const items = occurrenceDates('2026-07-20T13:00:00.000Z', '2026-07-20T14:30:00.000Z', {
    frequency: 'weekly', interval: 1, count: 3
  });
  assert.equal(items.length, 3);
  assert.equal(items[1].startDatetime, '2026-07-27T13:00:00.000Z');
  assert.equal(new Date(items[2].endDatetime) - new Date(items[2].startDatetime), 90 * 60 * 1000);
});

test('calcula capacidad solo sobre días laborables', () => {
  assert.equal(weekdaysBetween(new Date('2026-07-20'), new Date('2026-07-26')), 5);
});
