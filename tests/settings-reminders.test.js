const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeSettings, DEFAULT_SETTINGS } = require('../src/settings');
const { normalizeReminderMinutes } = require('../src/reminders');

test('normaliza una configuración completa y válida', () => {
  const result = normalizeSettings(DEFAULT_SETTINGS);
  assert.deepEqual(result, { settings: DEFAULT_SETTINGS });
});

test('limita la distribución de calendarios al rango permitido', () => {
  const result = normalizeSettings({ ...DEFAULT_SETTINGS, distributionMaxCalendars: 21 });
  assert.match(result.error, /entre 1 y 20/);
  const scale = normalizeSettings({ ...DEFAULT_SETTINGS, distributionScaleMaxActivities: 0 });
  assert.match(scale.error, /entre 1 y 1000/);
});

test('valida los intervalos y el horario laboral', () => {
  assert.ok(normalizeSettings({ ...DEFAULT_SETTINGS, calendarSlotMinutes: 20 }).error);
  assert.ok(normalizeSettings({ ...DEFAULT_SETTINGS, workdayStartHour: 18, workdayEndHour: 8 }).error);
});

test('la integración con Google llega activa por omisión y puede desactivarse', () => {
  assert.equal(DEFAULT_SETTINGS.googleIntegrationEnabled, true);
  const off = normalizeSettings({ ...DEFAULT_SETTINGS, googleIntegrationEnabled: false });
  assert.equal(off.settings.googleIntegrationEnabled, false);
  // Igual que el resto de interruptores, un campo ausente equivale a desactivado.
  const missing = normalizeSettings({ ...DEFAULT_SETTINGS, googleIntegrationEnabled: undefined });
  assert.equal(missing.settings.googleIntegrationEnabled, false);
});

test('acepta recordatorios entre cinco minutos y siete días', () => {
  assert.equal(normalizeReminderMinutes(5), 5);
  assert.equal(normalizeReminderMinutes('10080'), 10080);
  assert.equal(normalizeReminderMinutes(4), null);
  assert.equal(normalizeReminderMinutes(10081), null);
});
