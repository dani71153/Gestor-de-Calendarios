#!/usr/bin/env node
/*
Crea un respaldo consistente de la base de datos y rota los antiguos.

  npm run backup
  node scripts/backup.js --keep 60
  node scripts/backup.js --dir "D:\\Respaldos\\gestor"
  node scripts/backup.js --list

Usa VACUUM INTO, que produce un snapshot íntegro de una base en uso y en un solo
archivo. No hace falta detener el servidor.

El destino predeterminado es BACKUP_PATH, o data/backups si no está definido.
*/
const fs = require('node:fs');
const config = require('../src/config');
const { createBackup, pruneBackups, listSnapshots } = require('../src/backup');

function parseArguments(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    if (key === 'list') {
      values.list = true;
      continue;
    }
    const next = argv[index + 1];
    if (next === undefined || next.startsWith('--')) throw new Error(`Falta el valor de --${key}`);
    values[key] = next;
    index += 1;
  }
  return values;
}

function main() {
  const args = parseArguments(process.argv.slice(2));
  const directory = args.dir || config.backupPath;

  if (args.list) {
    const snapshots = listSnapshots(directory);
    if (!snapshots.length) {
      console.log(`No hay respaldos en ${directory}`);
      return;
    }
    console.log(`Respaldos en ${directory}:`);
    snapshots.forEach((file) => {
      const stats = fs.statSync(file);
      console.log(`  ${file.split(/[\\/]/).pop()}  ${Math.round(stats.size / 1024)} KB  ${stats.mtime.toISOString()}`);
    });
    return;
  }

  const keep = args.keep === undefined ? config.backupRetention : Number(args.keep);
  if (!Number.isInteger(keep) || keep < 1) throw new Error('--keep debe ser un entero mayor que cero');

  const snapshot = createBackup({ directory });
  const removed = pruneBackups({ directory, keep });

  console.log(`Respaldo creado: ${snapshot.path}`);
  console.log(`  tamaño: ${Math.round(snapshot.size / 1024)} KB`);
  if (removed.length) console.log(`  rotación: ${removed.length} respaldo(s) antiguo(s) eliminado(s)`);
  console.log(`  conservados: ${listSnapshots(directory).length} de ${keep}`);
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
