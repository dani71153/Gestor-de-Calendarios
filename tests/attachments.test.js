const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { detectMimeType, safeFilename } = require('../src/attachments');

const cwd = path.resolve(__dirname, '..');

// El servidor solo mira la firma de los primeros bytes, así que para las pruebas
// basta con una cabecera válida seguida de contenido arbitrario.
const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const pngWith = (text) => Buffer.concat([PNG_HEADER, Buffer.from(text)]);

test('el tipo se deduce de los bytes, no de lo que declare el cliente', () => {
  assert.equal(detectMimeType(PNG_HEADER), 'image/png');
  assert.equal(detectMimeType(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), 'image/jpeg');
  assert.equal(detectMimeType(Buffer.from('GIF89a')), 'image/gif');
  assert.equal(detectMimeType(Buffer.from('%PDF-1.7')), 'application/pdf');
  assert.equal(detectMimeType(Buffer.concat([
    Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 ')
  ])), 'image/webp');

  // Un ejecutable o un texto renombrado a .png no pasa.
  assert.equal(detectMimeType(Buffer.from('MZ ejecutable')), null);
  assert.equal(detectMimeType(Buffer.from('texto plano')), null);
});

test('el nombre del archivo se limpia de rutas y caracteres peligrosos', () => {
  assert.equal(safeFilename('..\\..\\windows\\system32\\evil.png'), 'evil.png');
  assert.equal(safeFilename('/etc/passwd'), 'passwd');
  assert.equal(safeFilename(''), 'archivo');
  assert.equal(safeFilename(null), 'archivo');
  assert.ok(safeFilename('a'.repeat(400)).length <= 120);
});

function freePort() {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.listen(0, () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

function waitForServer(base, attempts = 60) {
  return new Promise((resolve, reject) => {
    const attempt = async (left) => {
      try {
        await fetch(`${base}/api/health`);
        resolve();
      } catch (error) {
        if (left <= 0) return reject(error);
        setTimeout(() => attempt(left - 1), 250);
      }
    };
    attempt(attempts);
  });
}

test('subir, descargar y eliminar un adjunto a través de la API', async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'calendar-manager-adjuntos-'));
  const port = await freePort();
  const base = `http://localhost:${port}`;

  const server = spawn(process.execPath, ['src/server.js'], {
    cwd,
    stdio: 'ignore',
    env: {
      ...process.env,
      PORT: String(port),
      DATABASE_PATH: path.join(tempDir, 'calendar.sqlite'),
      BACKUP_ENABLED: 'false',
      SEED_MODE: 'base',
      INITIAL_ADMIN_EMAIL: 'admin@empresa.com',
      INITIAL_ADMIN_PASSWORD: 'Clave-Larga-Prueba-2026'
    }
  });

  // Hay que esperar a que el proceso suelte el archivo: en Windows borrar la
  // carpeta con la base todavía abierta da EPERM.
  t.after(async () => {
    const closed = new Promise((resolve) => server.once('exit', resolve));
    server.kill();
    await closed;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  await waitForServer(base);

  const login = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: base },
    body: JSON.stringify({ email: 'admin@empresa.com', password: 'Clave-Larga-Prueba-2026' })
  });
  const cookie = login.headers.getSetCookie()[0].split(';')[0];
  const { csrfToken } = await login.json();
  const json = { 'Content-Type': 'application/json', Origin: base, Cookie: cookie, 'X-CSRF-Token': csrfToken };

  await fetch(`${base}/api/calendars`, {
    method: 'POST',
    headers: json,
    body: JSON.stringify({ name: 'Marketing', description: 'x', color: '#EC4899', visibility: 'company' })
  });
  const { calendars } = await (await fetch(`${base}/api/admin/calendars`, { headers: { Cookie: cookie } })).json();
  const created = await (await fetch(`${base}/api/events`, {
    method: 'POST',
    headers: json,
    body: JSON.stringify({
      calendarId: calendars[0].id,
      eventTypeId: 1,
      title: 'Promo',
      startDatetime: '2026-08-20T14:00',
      endDatetime: '2026-08-20T15:00'
    })
  })).json();
  const eventId = created.eventId || created.id || 1;

  const upload = async (buffer, filename) => {
    const form = new FormData();
    form.append('file', new Blob([buffer]), filename);
    return fetch(`${base}/api/events/${eventId}/attachments`, {
      method: 'POST',
      headers: { Origin: base, Cookie: cookie, 'X-CSRF-Token': csrfToken },
      body: form
    });
  };

  const contenido = pngWith('flyer-de-instagram');
  const ok = await upload(contenido, 'flyer.png');
  assert.equal(ok.status, 201);

  // Un tipo no admitido se rechaza aunque el nombre diga .png.
  const rechazado = await upload(Buffer.from('texto disfrazado'), 'trampa.png');
  assert.equal(rechazado.status, 415);

  const lista = await (await fetch(`${base}/api/events/${eventId}/attachments`, { headers: { Cookie: cookie } })).json();
  assert.equal(lista.attachments.length, 1);
  assert.equal(lista.attachments[0].filename, 'flyer.png');
  assert.equal(lista.attachments[0].mimeType, 'image/png');

  // El archivo vuelve idéntico y con el tipo deducido al subirlo.
  const descarga = await fetch(`${base}/api/attachments/${lista.attachments[0].id}`, { headers: { Cookie: cookie } });
  assert.equal(descarga.headers.get('content-type'), 'image/png');
  assert.ok(Buffer.from(await descarga.arrayBuffer()).equals(contenido));

  // Sin sesión no se sirve.
  assert.equal((await fetch(`${base}/api/attachments/${lista.attachments[0].id}`)).status, 401);

  const borrado = await fetch(`${base}/api/attachments/${lista.attachments[0].id}`, {
    method: 'DELETE',
    headers: json
  });
  assert.equal(borrado.status, 200);

  const vacia = await (await fetch(`${base}/api/events/${eventId}/attachments`, { headers: { Cookie: cookie } })).json();
  assert.equal(vacia.attachments.length, 0);
});

test('los adjuntos desaparecen al eliminar el evento', () => {
  const { execFileSync } = require('node:child_process');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'calendar-manager-cascada-'));

  try {
    const output = execFileSync(process.execPath, ['-e', [
      "const { db, initializeDatabase, createAdminUser } = require('./src/database');",
      'initializeDatabase();',
      "const userId = createAdminUser({ name: 'Ana', email: 'ana@empresa.com', password: 'Clave-Larga-2026' });",
      "db.prepare(\"INSERT INTO calendars (name,color,owner_user_id,visibility) VALUES ('C','#000000',?,'company')\").run(userId);",
      "db.prepare(\"INSERT INTO events (calendar_id,event_type_id,title,start_datetime,end_datetime,created_by,timezone) VALUES (1,1,'E','2026-08-20T14:00:00Z','2026-08-20T15:00:00Z',?,'UTC')\").run(userId);",
      "db.prepare('INSERT INTO event_attachments (event_id,filename,mime_type,size,data) VALUES (1,?,?,?,?)').run('f.png','image/png',3,Buffer.from('abc'));",
      "const antes = db.prepare('SELECT COUNT(*) AS c FROM event_attachments').get().c;",
      "db.prepare('DELETE FROM events WHERE id = 1').run();",
      "const despues = db.prepare('SELECT COUNT(*) AS c FROM event_attachments').get().c;",
      "console.log('RESULT:' + JSON.stringify({ antes, despues }));"
    ].join('\n')], {
      cwd,
      encoding: 'utf8',
      env: {
        ...process.env,
        DATABASE_PATH: path.join(tempDir, 'calendar.sqlite'),
        BACKUP_ENABLED: 'false',
        SEED_MODE: 'base',
        INITIAL_ADMIN_EMAIL: '',
        INITIAL_ADMIN_PASSWORD: ''
      }
    });
    const line = output.split(/\r?\n/).find((item) => item.startsWith('RESULT:'));
    assert.deepEqual(JSON.parse(line.slice('RESULT:'.length)), { antes: 1, despues: 0 });
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
