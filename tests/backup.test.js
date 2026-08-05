const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const cwd = path.resolve(__dirname, '..');

function runNode(script, env) {
  return execFileSync(process.execPath, ['-e', script], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, SEED_MODE: 'blank', INITIAL_ADMIN_EMAIL: '', INITIAL_ADMIN_PASSWORD: '', ...env }
  });
}

function parseResult(output) {
  const line = output.split(/\r?\n/).find((item) => item.startsWith('RESULT:'));
  return JSON.parse(line.slice('RESULT:'.length));
}

test('el respaldo captura los cambios que aún viven en el WAL', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'calendar-manager-backup-'));
  const databasePath = path.join(tempDir, 'calendar.sqlite');
  const backupPath = path.join(tempDir, 'backups');
  const env = { DATABASE_PATH: databasePath, BACKUP_PATH: backupPath, BACKUP_ENABLED: 'false' };

  try {
    // La conexión permanece abierta al crear el respaldo, que es el escenario
    // real: el servidor sigue escribiendo mientras se copia.
    const output = runNode([
      "const { db, initializeDatabase, createAdminUser } = require('./src/database');",
      'initializeDatabase();',
      "createAdminUser({ name: 'Ana', email: 'ana@empresa.com', password: 'Clave-Larga-2026' });",
      "const { createBackup } = require('./src/backup');",
      'const snapshot = createBackup();',
      "const { DatabaseSync } = require('node:sqlite');",
      'const copy = new DatabaseSync(snapshot.path, { readOnly: true });',
      "console.log('RESULT:' + JSON.stringify({",
      "  original: db.prepare('SELECT COUNT(*) AS count FROM users').get().count,",
      "  enRespaldo: copy.prepare('SELECT COUNT(*) AS count FROM users').get().count,",
      "  correo: copy.prepare('SELECT email FROM users').get().email,",
      "  integridad: copy.prepare('PRAGMA integrity_check').get().integrity_check",
      '}));'
    ].join('\n'), env);

    assert.deepEqual(parseResult(output), {
      original: 1,
      enRespaldo: 1,
      correo: 'ana@empresa.com',
      integridad: 'ok'
    });
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('la rotación conserva solo los respaldos más recientes', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'calendar-manager-rotacion-'));
  const databasePath = path.join(tempDir, 'calendar.sqlite');
  const backupPath = path.join(tempDir, 'backups');
  const env = { DATABASE_PATH: databasePath, BACKUP_PATH: backupPath, BACKUP_ENABLED: 'false' };

  try {
    const output = runNode([
      "require('./src/database').initializeDatabase();",
      "const { createBackup, pruneBackups, listSnapshots } = require('./src/backup');",
      'for (let i = 0; i < 5; i += 1) createBackup();',
      'const antes = listSnapshots().length;',
      'const eliminados = pruneBackups({ keep: 2 });',
      "console.log('RESULT:' + JSON.stringify({",
      '  antes,',
      '  eliminados: eliminados.length,',
      '  quedan: listSnapshots().length',
      '}));'
    ].join('\n'), env);

    assert.deepEqual(parseResult(output), { antes: 5, eliminados: 3, quedan: 2 });
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('restaurar devuelve la base al contenido del respaldo', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'calendar-manager-restaurar-'));
  const databasePath = path.join(tempDir, 'calendar.sqlite');
  const backupPath = path.join(tempDir, 'backups');
  const env = { DATABASE_PATH: databasePath, BACKUP_PATH: backupPath, BACKUP_ENABLED: 'false' };

  try {
    // Estado inicial con un usuario, y respaldo de ese momento.
    runNode([
      "const { initializeDatabase, createAdminUser } = require('./src/database');",
      'initializeDatabase();',
      "createAdminUser({ name: 'Ana', email: 'ana@empresa.com', password: 'Clave-Larga-2026' });",
      "require('./src/backup').createBackup();"
    ].join('\n'), env);

    // Cambio posterior que la restauración debe deshacer.
    runNode([
      "const { db, initializeDatabase } = require('./src/database');",
      'initializeDatabase({ skipInitialAdmin: true });',
      "db.prepare('DELETE FROM users').run();"
    ].join('\n'), env);

    execFileSync(process.execPath, ['scripts/restore.js', '--latest', '--yes'], {
      cwd, encoding: 'utf8', env: { ...process.env, ...env }
    });

    const output = runNode([
      "const { db, initializeDatabase } = require('./src/database');",
      'initializeDatabase({ skipInitialAdmin: true });',
      "console.log('RESULT:' + JSON.stringify({",
      "  usuarios: db.prepare('SELECT COUNT(*) AS count FROM users').get().count,",
      "  correo: db.prepare('SELECT email FROM users').get()?.email || null",
      '}));'
    ].join('\n'), env);

    assert.deepEqual(parseResult(output), { usuarios: 1, correo: 'ana@empresa.com' });

    // La restauración debe dejar también una copia del estado que sustituyó.
    const previos = fs.readdirSync(backupPath).filter((name) => name.includes('previo-a-restaurar'));
    assert.equal(previos.length, 1);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('el respaldo escribe en todos los destinos el mismo snapshot', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'calendar-manager-destinos-'));
  const local = path.join(tempDir, 'local');
  const nube = path.join(tempDir, 'nube');
  const env = {
    DATABASE_PATH: path.join(tempDir, 'calendar.sqlite'),
    BACKUP_PATH: path.join(tempDir, 'por-defecto'),
    BACKUP_ENABLED: 'false'
  };

  try {
    const output = runNode([
      "const { db, initializeDatabase } = require('./src/database');",
      'initializeDatabase();',
      "const { normalizeSettings, DEFAULT_SETTINGS } = require('./src/settings');",
      `const destinos = ${JSON.stringify([local, nube])};`,
      'const norm = normalizeSettings({ ...DEFAULT_SETTINGS, backupDestinations: destinos, backupRetentionCount: 5 });',
      'if (norm.error) throw new Error(norm.error);',
      "const save = db.prepare('INSERT INTO system_settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');",
      'Object.entries(norm.settings).forEach(([k, v]) => save.run(k, JSON.stringify(v)));',
      "const { createBackups, backupDestinations } = require('./src/backup');",
      'const results = createBackups();',
      "const fs = require('node:fs');",
      "const path = require('node:path');",
      'const enLocal = fs.readdirSync(destinos[0]).filter((n) => n.endsWith(".sqlite"));',
      'const enNube = fs.readdirSync(destinos[1]).filter((n) => n.endsWith(".sqlite"));',
      "console.log('RESULT:' + JSON.stringify({",
      '  usaLosConfigurados: backupDestinations().length,',
      '  correctos: results.filter((r) => r.ok).length,',
      '  mismoNombre: enLocal[0] === enNube[0],',
      '  bytesIguales: Buffer.compare(',
      '    fs.readFileSync(path.join(destinos[0], enLocal[0])),',
      '    fs.readFileSync(path.join(destinos[1], enNube[0]))',
      '  ) === 0',
      '}));'
    ].join('\n'), env);

    assert.deepEqual(parseResult(output), {
      usaLosConfigurados: 2,
      correctos: 2,
      mismoNombre: true,
      bytesIguales: true
    });
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('un destino inaccesible no impide respaldar en los demás', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'calendar-manager-destino-roto-'));
  const local = path.join(tempDir, 'local');
  // Un archivo donde debería haber una carpeta reproduce un destino caído.
  const roto = path.join(tempDir, 'inaccesible');
  fs.writeFileSync(roto, 'no soy una carpeta');
  const env = {
    DATABASE_PATH: path.join(tempDir, 'calendar.sqlite'),
    BACKUP_PATH: path.join(tempDir, 'por-defecto'),
    BACKUP_ENABLED: 'false'
  };

  try {
    const output = runNode([
      "require('./src/database').initializeDatabase();",
      "const { createBackups } = require('./src/backup');",
      `const results = createBackups({ destinations: ${JSON.stringify([local, roto])}, keep: 5 });`,
      "const fs = require('node:fs');",
      "console.log('RESULT:' + JSON.stringify({",
      '  correctos: results.filter((r) => r.ok).length,',
      '  fallidos: results.filter((r) => !r.ok).length,',
      `  copiasEnElSano: fs.readdirSync(${JSON.stringify(local)}).filter((n) => n.endsWith('.sqlite')).length`,
      '}));'
    ].join('\n'), env);

    assert.deepEqual(parseResult(output), { correctos: 1, fallidos: 1, copiasEnElSano: 1 });
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('la configuración rechaza destinos relativos o donde no se puede escribir', () => {
  const { normalizeSettings, DEFAULT_SETTINGS } = require('../src/settings');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'calendar-manager-validacion-'));
  const roto = path.join(tempDir, 'archivo');
  fs.writeFileSync(roto, 'x');

  try {
    assert.match(
      normalizeSettings({ ...DEFAULT_SETTINGS, backupDestinations: ['respaldos'] }).error,
      /debe ser absoluta/
    );
    assert.match(
      normalizeSettings({ ...DEFAULT_SETTINGS, backupDestinations: [roto] }).error,
      /No se puede escribir/
    );

    // Duplicados y barras finales se normalizan en lugar de rechazarse.
    const limpio = normalizeSettings({
      ...DEFAULT_SETTINGS,
      backupDestinations: [tempDir, `${tempDir}${path.sep}`, tempDir.toUpperCase()]
    });
    assert.equal(limpio.settings.backupDestinations.length, 1);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('restaurar rechaza un archivo que no es una base válida', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'calendar-manager-corrupto-'));
  const corrupt = path.join(tempDir, 'roto.sqlite');
  fs.writeFileSync(corrupt, 'esto no es una base de datos');

  try {
    assert.throws(() => execFileSync(
      process.execPath,
      ['scripts/restore.js', '--file', corrupt, '--yes'],
      {
        cwd,
        encoding: 'utf8',
        stdio: 'pipe',
        env: {
          ...process.env,
          DATABASE_PATH: path.join(tempDir, 'calendar.sqlite'),
          BACKUP_PATH: path.join(tempDir, 'backups')
        }
      }
    ));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
