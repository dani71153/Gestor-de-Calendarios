#!/usr/bin/env node
/*
Restaura la base de datos desde un respaldo.

  node scripts/restore.js --latest
  node scripts/restore.js --file "data/backups/calendar-manager-2026-08-05T09-18-30.sqlite"
  node scripts/restore.js --latest --yes      # sin confirmación

Antes de sustituir nada verifica que el respaldo esté íntegro y guarda un
snapshot del estado actual, de modo que una restauración equivocada también
se pueda deshacer.

El servidor debe estar detenido: en Windows el archivo en uso no se puede
reemplazar y la operación fallará de forma segura.
*/
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { DatabaseSync } = require('node:sqlite');
const config = require('../src/config');

const REQUIRED_TABLES = ['users', 'calendars', 'events', 'system_settings'];

function parseArguments(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    if (key === 'latest' || key === 'yes') {
      values[key] = true;
      continue;
    }
    const next = argv[index + 1];
    if (next === undefined || next.startsWith('--')) throw new Error(`Falta el valor de --${key}`);
    values[key] = next;
    index += 1;
  }
  return values;
}

function newestSnapshot(directory) {
  if (!fs.existsSync(directory)) return null;
  const files = fs.readdirSync(directory)
    .filter((name) => /^calendar-manager-.*\.sqlite$/.test(name))
    .sort()
    .reverse();
  return files.length ? path.join(directory, files[0]) : null;
}

// Un archivo puede existir y estar corrupto: restaurarlo a ciegas cambiaría una
// base buena por una inservible.
function inspectSnapshot(file) {
  const snapshot = new DatabaseSync(file, { readOnly: true });
  try {
    const integrity = snapshot.prepare('PRAGMA integrity_check').get();
    const result = integrity.integrity_check || integrity['integrity_check'];
    if (result !== 'ok') throw new Error(`El respaldo no supera la comprobación de integridad: ${result}`);

    const tables = new Set(snapshot.prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all().map((row) => row.name));
    const missing = REQUIRED_TABLES.filter((table) => !tables.has(table));
    if (missing.length) throw new Error(`El respaldo no contiene las tablas: ${missing.join(', ')}`);

    return {
      users: snapshot.prepare('SELECT COUNT(*) AS count FROM users').get().count,
      calendars: snapshot.prepare('SELECT COUNT(*) AS count FROM calendars').get().count,
      events: snapshot.prepare('SELECT COUNT(*) AS count FROM events').get().count
    };
  } finally {
    snapshot.close();
  }
}

function snapshotCurrentDatabase() {
  if (!fs.existsSync(config.databasePath)) return null;
  fs.mkdirSync(config.backupPath, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const target = path.join(config.backupPath, `calendar-manager-previo-a-restaurar-${stamp}.sqlite`);
  const current = new DatabaseSync(config.databasePath);
  try {
    current.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
  } finally {
    current.close();
  }
  return target;
}

function confirm(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(/^[sSyY]/.test(answer.trim()));
    });
  });
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  const file = args.file || (args.latest ? newestSnapshot(config.backupPath) : null);

  if (!file) {
    console.error('Uso: node scripts/restore.js --latest | --file <ruta> [--yes]');
    process.exitCode = 1;
    return;
  }
  if (!fs.existsSync(file)) throw new Error(`No existe el respaldo: ${file}`);

  const contents = inspectSnapshot(file);
  console.log(`Respaldo: ${file}`);
  console.log(`  íntegro, contiene ${contents.users} usuario(s), ${contents.calendars} calendario(s), ${contents.events} evento(s)`);
  console.log(`Se sustituirá: ${config.databasePath}`);

  if (!args.yes && !await confirm('¿Continuar con la restauración? (s/N) ')) {
    console.log('Restauración cancelada.');
    return;
  }

  const safety = snapshotCurrentDatabase();
  if (safety) console.log(`Estado actual guardado en: ${safety}`);

  // El snapshot es autocontenido: los WAL y SHM antiguos deben desaparecer o
  // SQLite intentaría aplicarlos sobre una base que ya no les corresponde.
  [config.databasePath, `${config.databasePath}-wal`, `${config.databasePath}-shm`]
    .forEach((target) => fs.rmSync(target, { force: true }));

  fs.copyFileSync(file, config.databasePath);
  console.log('Restauración completada. Arranca el servidor para comprobarlo.');
}

main().catch((error) => {
  console.error(error.message);
  if (/EBUSY|EPERM|resource busy/i.test(error.message)) {
    console.error('Detén el servidor antes de restaurar: .\\scripts\\manage.ps1 -Action stop-server');
  }
  process.exitCode = 1;
});
