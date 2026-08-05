const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { validateProductionEnvironment, resolveCookieSecure } = require('../src/config');
const { AttemptLimiter } = require('../src/rate-limit');
const { securityHeaders, requireSameOrigin } = require('../src/security');

test('producción exige base explícita y secretos fuertes independientes', () => {
  const errors = validateProductionEnvironment({ NODE_ENV: 'production' });
  assert.match(errors.join(' '), /DATABASE_PATH/);
  assert.match(errors.join(' '), /SESSION_SECRET/);
  assert.match(errors.join(' '), /INTEGRATION_ENCRYPTION_KEY/);

  assert.deepEqual(validateProductionEnvironment({
    NODE_ENV: 'production',
    DATABASE_PATH: '/var/data/calendar.sqlite',
    SESSION_SECRET: 's'.repeat(48),
    INTEGRATION_ENCRYPTION_KEY: 'e'.repeat(48)
  }), []);

  const repeated = 'same-secret-'.repeat(4);
  assert.match(validateProductionEnvironment({
    NODE_ENV: 'production',
    DATABASE_PATH: '/var/data/calendar.sqlite',
    SESSION_SECRET: repeated,
    INTEGRATION_ENCRYPTION_KEY: repeated
  }).join(' '), /deben ser diferentes/);
});

test('producción rechaza un callback OAuth sin HTTPS cuando hay credenciales de entorno', () => {
  const errors = validateProductionEnvironment({
    NODE_ENV: 'production',
    DATABASE_PATH: '/var/data/calendar.sqlite',
    SESSION_SECRET: 's'.repeat(48),
    INTEGRATION_ENCRYPTION_KEY: 'e'.repeat(48),
    GOOGLE_CLIENT_ID: 'client',
    GOOGLE_CLIENT_SECRET: 'secret',
    GOOGLE_REDIRECT_URI: 'http://calendar.example.com/api/integrations/google/callback'
  });
  assert.match(errors.join(' '), /HTTPS/);
});

test('el limitador bloquea después de cinco fallos y permite reiniciar la clave', () => {
  const limiter = new AttemptLimiter({ maxAttempts: 5, windowMs: 1000 });
  const keys = ['ip:127.0.0.1', 'email:user@example.com'];
  for (let attempt = 0; attempt < 5; attempt += 1) limiter.recordFailure(keys, 100);
  assert.equal(limiter.inspect(keys, 200).limited, true);
  limiter.reset(keys);
  assert.equal(limiter.inspect(keys, 200).limited, false);
});

test('la protección de origen rechaza mutaciones cross-site', () => {
  const req = {
    method: 'POST',
    protocol: 'https',
    is: () => true,
    get(name) {
      return {
        origin: 'https://attacker.example',
        host: 'calendar.example.com',
        'sec-fetch-site': 'cross-site'
      }[name];
    }
  };
  let response;
  const res = {
    status(code) { response = { code }; return this; },
    json(body) { response.body = body; return this; }
  };
  requireSameOrigin(req, res, () => assert.fail('No debe aceptar un origen externo'));
  assert.equal(response.code, 403);
});

test('las mutaciones rechazan cuerpos que no sean JSON', () => {
  const req = { method: 'POST', is: () => false };
  let response;
  const res = {
    status(code) { response = { code }; return this; },
    json(body) { response.body = body; return this; }
  };
  requireSameOrigin(req, res, () => assert.fail('No debe aceptar otro Content-Type'));
  assert.equal(response.code, 415);
});

test('las cabeceras de seguridad incluyen CSP, anti-framing y HSTS en producción', () => {
  const headers = {};
  const req = { path: '/api/health', app: { get: () => 'production' } };
  const res = { setHeader(name, value) { headers[name] = value; } };
  securityHeaders(req, res, () => {});
  assert.match(headers['Content-Security-Policy'], /frame-ancestors 'none'/);
  assert.equal(headers['X-Frame-Options'], 'DENY');
  assert.match(headers['Strict-Transport-Security'], /max-age=31536000/);
  assert.equal(headers['Cache-Control'], 'no-store');
});

test('una base nueva de producción crea solo el administrador configurado y persiste sesiones', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'calendar-manager-production-'));
  const databasePath = path.join(tempDir, 'calendar.sqlite');
  const script = [
    "const { db, initializeDatabase } = require('./src/database');",
    'initializeDatabase();',
    "const { createSession } = require('./src/auth');",
    "const user = db.prepare('SELECT id, email FROM users').get();",
    'const session = createSession(user.id);',
    "const stored = db.prepare('SELECT token_hash AS tokenHash FROM sessions').get();",
    "console.log('RESULT:' + JSON.stringify({",
    "  users: db.prepare('SELECT COUNT(*) AS count FROM users').get().count,",
    "  events: db.prepare('SELECT COUNT(*) AS count FROM events').get().count,",
    '  email: user.email,',
    '  sessionPersisted: Boolean(stored),',
    '  rawTokenStored: stored.tokenHash === session.token',
    '}));'
  ].join('\n');
  try {
    const output = execFileSync(process.execPath, ['-e', script], {
      cwd: path.resolve(__dirname, '..'),
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_ENV: 'production',
        DATABASE_PATH: databasePath,
        SESSION_SECRET: 'session-secret-'.repeat(4),
        INTEGRATION_ENCRYPTION_KEY: 'integration-secret-'.repeat(4),
        INITIAL_ADMIN_NAME: 'Admin Producción',
        INITIAL_ADMIN_EMAIL: 'owner@example.com',
        INITIAL_ADMIN_PASSWORD: 'A-strong-production-password!',
        GOOGLE_CLIENT_ID: '',
        GOOGLE_CLIENT_SECRET: '',
        GOOGLE_REDIRECT_URI: ''
      }
    });
    const resultLine = output.split(/\r?\n/).find((line) => line.startsWith('RESULT:'));
    const result = JSON.parse(resultLine.slice('RESULT:'.length));
    assert.deepEqual(result, {
      users: 1,
      events: 0,
      email: 'owner@example.com',
      sessionPersisted: true,
      rawTokenStored: false
    });
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('producción bloquea una base que todavía conserva credenciales demo activas', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'calendar-manager-demo-'));
  const databasePath = path.join(tempDir, 'calendar.sqlite');
  const cwd = path.resolve(__dirname, '..');
  const command = "require('./src/database').initializeDatabase()";
  try {
    execFileSync(process.execPath, ['-e', command], {
      cwd,
      env: { ...process.env, NODE_ENV: 'development', SEED_MODE: 'demo', DATABASE_PATH: databasePath }
    });
    assert.throws(() => execFileSync(process.execPath, ['-e', command], {
      cwd,
      encoding: 'utf8',
      stdio: 'pipe',
      env: {
        ...process.env,
        NODE_ENV: 'production',
        DATABASE_PATH: databasePath,
        SESSION_SECRET: 'session-secret-'.repeat(4),
        INTEGRATION_ENCRYPTION_KEY: 'integration-secret-'.repeat(4),
        GOOGLE_CLIENT_ID: '',
        GOOGLE_CLIENT_SECRET: '',
        GOOGLE_REDIRECT_URI: ''
      }
    }), (error) => /Producción bloqueada/.test(String(error.stderr)));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('la cookie usa Secure en producción salvo que COOKIE_SECURE lo desactive', () => {
  assert.equal(resolveCookieSecure({ NODE_ENV: 'production' }), true);
  assert.equal(resolveCookieSecure({ NODE_ENV: 'development' }), false);
  // Habilita servir por HTTP plano en una red local sin abandonar el modo producción.
  assert.equal(resolveCookieSecure({ NODE_ENV: 'production', COOKIE_SECURE: 'false' }), false);
  assert.equal(resolveCookieSecure({ NODE_ENV: 'production', COOKIE_SECURE: '0' }), false);
  assert.equal(resolveCookieSecure({ NODE_ENV: 'development', COOKIE_SECURE: 'true' }), true);
  // Un valor sin sentido no debe relajar la seguridad por accidente.
  assert.equal(resolveCookieSecure({ NODE_ENV: 'production', COOKIE_SECURE: 'quizas' }), true);
});

test('el arranque predeterminado deja la base sin usuarios, calendarios ni eventos', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'calendar-manager-blank-'));
  const databasePath = path.join(tempDir, 'calendar.sqlite');
  const script = [
    "const { db, initializeDatabase } = require('./src/database');",
    'initializeDatabase();',
    "console.log('RESULT:' + JSON.stringify({",
    "  users: db.prepare('SELECT COUNT(*) AS count FROM users').get().count,",
    "  calendars: db.prepare('SELECT COUNT(*) AS count FROM calendars').get().count,",
    "  events: db.prepare('SELECT COUNT(*) AS count FROM events').get().count,",
    "  resources: db.prepare('SELECT COUNT(*) AS count FROM resources').get().count,",
    "  roles: db.prepare('SELECT COUNT(*) AS count FROM roles').get().count",
    '}));'
  ].join('\n');
  try {
    const output = execFileSync(process.execPath, ['-e', script], {
      cwd: path.resolve(__dirname, '..'),
      encoding: 'utf8',
      // Sin SEED_MODE ni INITIAL_ADMIN_*: es el arranque que ve un usuario nuevo.
      env: {
        ...process.env,
        NODE_ENV: 'development',
        SEED_MODE: '',
        DATABASE_PATH: databasePath,
        INITIAL_ADMIN_EMAIL: '',
        INITIAL_ADMIN_PASSWORD: ''
      }
    });
    const resultLine = output.split(/\r?\n/).find((line) => line.startsWith('RESULT:'));
    const result = JSON.parse(resultLine.slice('RESULT:'.length));
    assert.deepEqual(result, {
      users: 0,
      calendars: 0,
      events: 0,
      resources: 0,
      roles: 4
    });
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
