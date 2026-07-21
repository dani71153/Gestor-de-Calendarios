const test = require('node:test');
const assert = require('node:assert/strict');
const { encrypt, decrypt } = require('../src/integrations/token-cipher');
const { GoogleCalendarProvider } = require('../src/integrations/google-calendar.provider');
const { toGoogleEvent, fromGoogleEvent } = require('../src/integrations/event.mapper');
const { SyncService } = require('../src/integrations/sync.service');

test('cifra y descifra tokens sin almacenarlos como texto plano', () => {
  const token = 'refresh-token-secreto';
  const encrypted = encrypt(token);
  assert.notEqual(encrypted, token);
  assert.equal(decrypt(encrypted), token);
});

test('genera una autorización OAuth offline con state y scope de eventos', () => {
  const provider = new GoogleCalendarProvider({
    clientId: 'client-id',
    clientSecret: 'client-secret',
    redirectUri: 'http://localhost:3000/callback'
  });
  const authorization = new URL(provider.getAuthorizationUrl('csrf-state'));
  assert.equal(authorization.searchParams.get('access_type'), 'offline');
  assert.equal(authorization.searchParams.get('state'), 'csrf-state');
  assert.match(authorization.searchParams.get('scope'), /calendar\.events/);
});

test('rechaza conexión cuando faltan credenciales del proveedor', () => {
  const provider = new GoogleCalendarProvider({
    clientId: '',
    clientSecret: '',
    redirectUri: 'http://localhost:3000/callback'
  });
  assert.throws(
    () => provider.getAuthorizationUrl('state'),
    (error) => error.code === 'PROVIDER_NOT_CONFIGURED'
  );
});

test('lee la configuración del proveedor de forma dinámica', () => {
  let settings = {
    clientId: '',
    clientSecret: '',
    redirectUri: 'http://localhost:3000/callback'
  };
  const provider = new GoogleCalendarProvider(() => settings);
  assert.equal(provider.isConfigured(), false);
  settings = {
    clientId: 'dynamic-client',
    clientSecret: 'dynamic-secret',
    redirectUri: 'http://localhost:3000/callback'
  };
  assert.equal(provider.isConfigured(), true);
  const authorization = new URL(provider.getAuthorizationUrl('dynamic-state'));
  assert.equal(authorization.searchParams.get('client_id'), 'dynamic-client');
});

test('mapea el evento interno al contrato de Google sin filtrar tokens', () => {
  const event = {
    id: 42,
    title: 'Reunión operativa',
    description: 'Revisión semanal',
    location: 'Sala Norte',
    startDatetime: '2026-07-20T14:00:00.000Z',
    endDatetime: '2026-07-20T15:00:00.000Z',
    timezone: 'America/Santo_Domingo',
    allDay: 0
  };
  assert.deepEqual(toGoogleEvent(event), {
    summary: 'Reunión operativa',
    description: 'Revisión semanal',
    location: 'Sala Norte',
    start: {
      dateTime: '2026-07-20T14:00:00.000Z',
      timeZone: 'America/Santo_Domingo'
    },
    end: {
      dateTime: '2026-07-20T15:00:00.000Z',
      timeZone: 'America/Santo_Domingo'
    },
    extendedProperties: {
      private: {
        internalEventId: '42',
        source: 'gestor-central-calendarios'
      }
    }
  });
});

test('mapea cambios remotos de Google al modelo interno', () => {
  const mapped = fromGoogleEvent({
    id: 'google-123',
    status: 'confirmed',
    summary: 'Cambio desde Google',
    description: 'Editado fuera del gestor',
    location: 'Sala Este',
    updated: '2026-07-21T16:30:00.000Z',
    start: { dateTime: '2026-07-22T14:00:00-04:00', timeZone: 'America/Santo_Domingo' },
    end: { dateTime: '2026-07-22T15:15:00-04:00', timeZone: 'America/Santo_Domingo' },
    reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 20 }] },
    extendedProperties: {
      private: { source: 'gestor-central-calendarios', internalEventId: '42' }
    }
  });
  assert.equal(mapped.googleEventId, 'google-123');
  assert.equal(mapped.internalEventId, 42);
  assert.equal(mapped.title, 'Cambio desde Google');
  assert.equal(mapped.startDatetime, '2026-07-22T18:00:00.000Z');
  assert.equal(mapped.endDatetime, '2026-07-22T19:15:00.000Z');
  assert.equal(mapped.reminderMinutes, 20);
});

test('recorre todas las páginas y conserva el cursor incremental de Google', async () => {
  const calls = [];
  const provider = {
    async listEvents(accessToken, calendarId, options) {
      calls.push({ accessToken, calendarId, options });
      if (!options.pageToken) return { items: [{ id: 'one' }], nextPageToken: 'page-2' };
      return { items: [{ id: 'two' }], nextSyncToken: 'next-sync-token' };
    }
  };
  const service = new SyncService({ provider, repository: {} });
  const result = await service.collectRemoteChanges('access-token', 'primary', 'previous-token');
  assert.deepEqual(result.events.map((event) => event.id), ['one', 'two']);
  assert.equal(result.nextSyncToken, 'next-sync-token');
  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.syncToken, 'previous-token');
  assert.equal(calls[1].options.pageToken, 'page-2');
});

test('la consulta incremental solicita eliminados y guarda nextSyncToken', async () => {
  const provider = new GoogleCalendarProvider({
    clientId: 'client-id', clientSecret: 'secret', redirectUri: 'http://localhost/callback'
  });
  let request;
  provider.calendarRequest = async (...args) => { request = args; return { items: [], nextSyncToken: 'token' }; };
  await provider.listEvents('access', 'primary', { syncToken: 'sync-1', pageToken: 'page-1' });
  const url = new URL(`https://local.test${request[1]}`);
  assert.equal(url.searchParams.get('showDeleted'), 'true');
  assert.equal(url.searchParams.get('singleEvents'), 'true');
  assert.equal(url.searchParams.get('syncToken'), 'sync-1');
  assert.equal(url.searchParams.get('pageToken'), 'page-1');
});
