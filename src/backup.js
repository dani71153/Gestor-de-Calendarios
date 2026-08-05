const fs = require('node:fs');
const path = require('node:path');
const { db } = require('./database');
const { readSettings } = require('./settings');
const config = require('./config');

const SNAPSHOT_PREFIX = 'calendar-manager-';
const SNAPSHOT_PATTERN = /^calendar-manager-.*\.sqlite$/;
const DAY_MS = 24 * 60 * 60 * 1000;
// Un reinicio del servidor no debe generar un snapshot si ya hay uno reciente:
// con --watch o con la aplicación en el arranque de Windows serían decenas al día.
const MIN_HOURS_BETWEEN_SNAPSHOTS = 6;

// La fecha va en el nombre en formato ordenable, así el orden alfabético de la
// carpeta coincide con el cronológico y la rotación no necesita leer metadatos.
function snapshotName(date = new Date()) {
  return `${SNAPSHOT_PREFIX}${date.toISOString().replace(/[:.]/g, '-').slice(0, 19)}.sqlite`;
}

function listSnapshots(directory = config.backupPath) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory)
    .filter((name) => SNAPSHOT_PATTERN.test(name))
    .sort()
    .reverse()
    .map((name) => path.join(directory, name));
}

function latestSnapshot(directory = config.backupPath) {
  return listSnapshots(directory)[0] || null;
}

// VACUUM INTO produce un snapshot consistente de una base en uso y en un solo
// archivo. Copiar el .sqlite mientras el servidor escribe puede dejar fuera lo
// que todavía vive en el WAL, o capturar un estado a medias.
function createBackup({ directory = config.backupPath, label = '' } = {}) {
  fs.mkdirSync(directory, { recursive: true });

  let target = path.join(directory, label
    ? `${SNAPSHOT_PREFIX}${label}-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.sqlite`
    : snapshotName());

  // VACUUM INTO falla si el destino existe; dos ejecuciones en el mismo segundo
  // chocarían.
  let attempt = 1;
  while (fs.existsSync(target)) {
    target = target.replace(/(-\d+)?\.sqlite$/, `-${attempt}.sqlite`);
    attempt += 1;
  }

  db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
  return { path: target, size: fs.statSync(target).size };
}

// Conserva los más recientes y devuelve los que se eliminaron.
function pruneBackups({ directory = config.backupPath, keep = config.backupRetention } = {}) {
  const obsolete = listSnapshots(directory).slice(Math.max(keep, 1));
  obsolete.forEach((file) => fs.rmSync(file, { force: true }));
  return obsolete;
}

function hoursSinceLastSnapshot(directory = config.backupPath) {
  const latest = latestSnapshot(directory);
  if (!latest) return Infinity;
  return (Date.now() - fs.statSync(latest).mtimeMs) / (60 * 60 * 1000);
}

// La lista de Configuración manda; BACKUP_PATH queda como destino de partida
// mientras no se haya definido ninguno desde la interfaz.
function backupDestinations() {
  const configured = readSettings().backupDestinations;
  if (Array.isArray(configured) && configured.length) return configured;
  return [config.backupPath];
}

function backupRetention() {
  const configured = Number(readSettings().backupRetentionCount);
  return Number.isInteger(configured) && configured > 0 ? configured : config.backupRetention;
}

// Un único VACUUM INTO y copias byte a byte desde ahí: así todos los destinos
// guardan exactamente el mismo instante, y la base solo se recorre una vez.
// Un destino caído no impide que los demás se escriban.
function createBackups({ destinations = backupDestinations(), keep = backupRetention() } = {}) {
  const results = [];
  let source = null;

  for (const directory of destinations) {
    try {
      const snapshot = source
        ? copySnapshot(source, directory)
        : createBackup({ directory });
      if (!source) source = snapshot;
      const removed = pruneBackups({ directory, keep });
      results.push({ directory, ok: true, path: snapshot.path, size: snapshot.size, removed: removed.length });
    } catch (error) {
      results.push({ directory, ok: false, error: error.message });
    }
  }

  return results;
}

function copySnapshot(snapshot, directory) {
  fs.mkdirSync(directory, { recursive: true });
  const target = path.join(directory, path.basename(snapshot.path));
  fs.copyFileSync(snapshot.path, target);
  return { path: target, size: snapshot.size };
}

function runScheduledBackup() {
  try {
    if (hoursSinceLastSnapshot(backupDestinations()[0]) < MIN_HOURS_BETWEEN_SNAPSHOTS) return null;
    const results = createBackups();
    results.filter((item) => item.ok)
      .forEach((item) => console.log(`Respaldo creado: ${item.path} (${Math.round(item.size / 1024)} KB)`));
    results.filter((item) => !item.ok)
      .forEach((item) => console.error(`Destino de respaldo con error: ${item.directory} — ${item.error}`));
    return results;
  } catch (error) {
    // Un fallo de respaldo no debe tumbar el servidor.
    console.error('No se pudo crear el respaldo automático:', error.message);
    return null;
  }
}

function startBackupScheduler() {
  if (!config.backupEnabled) return;
  runScheduledBackup();
  const timer = setInterval(runScheduledBackup, DAY_MS);
  timer.unref?.();
  return timer;
}

module.exports = {
  createBackup,
  createBackups,
  backupDestinations,
  backupRetention,
  pruneBackups,
  listSnapshots,
  latestSnapshot,
  snapshotName,
  hoursSinceLastSnapshot,
  runScheduledBackup,
  startBackupScheduler,
  MIN_HOURS_BETWEEN_SNAPSHOTS
};
