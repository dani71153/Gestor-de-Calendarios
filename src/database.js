const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const config = require('./config');

fs.mkdirSync(path.dirname(config.databasePath), { recursive: true });

const db = new DatabaseSync(config.databasePath);
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA busy_timeout = 5000;');
db.exec('PRAGMA journal_mode = WAL;');

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

// Modos de arranque de datos (options.seed o la variable SEED_MODE):
//   'blank' -> solo los roles que el código necesita para autorizar.
//   'base'  -> roles, departamentos y tipos de evento. Es el predeterminado.
//   'demo'  -> 'base' más usuarios, calendarios, eventos y recursos de ejemplo.
// En 'blank' y 'base' no se crea ningún usuario salvo el administrador inicial
// definido en INITIAL_ADMIN_EMAIL / INITIAL_ADMIN_PASSWORD.
function initializeDatabase(options = {}) {
  const seed = normalizeSeedMode(options.seed);
  const silent = options.silent === true;
  db.exec(`
    CREATE TABLE IF NOT EXISTS roles (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT
    );

    CREATE TABLE IF NOT EXISTS departments (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'active'
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role_id INTEGER NOT NULL REFERENCES roles(id),
      department_id INTEGER REFERENCES departments(id),
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      csrf_token TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS oauth_states (
      state_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS calendars (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      color TEXT NOT NULL DEFAULT '#5374e7',
      department_id INTEGER REFERENCES departments(id),
      owner_user_id INTEGER REFERENCES users(id),
      visibility TEXT NOT NULL DEFAULT 'department',
      google_calendar_id TEXT,
      sync_enabled INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS calendar_permissions (
      id INTEGER PRIMARY KEY,
      calendar_id INTEGER NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      can_view INTEGER NOT NULL DEFAULT 1,
      can_create INTEGER NOT NULL DEFAULT 0,
      can_edit INTEGER NOT NULL DEFAULT 0,
      can_delete INTEGER NOT NULL DEFAULT 0,
      UNIQUE(calendar_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS event_types (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      color TEXT NOT NULL,
      requires_responsible INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active'
    );

    CREATE TABLE IF NOT EXISTS event_series (
      id INTEGER PRIMARY KEY,
      frequency TEXT NOT NULL,
      interval_value INTEGER NOT NULL DEFAULT 1,
      occurrence_count INTEGER NOT NULL,
      created_by INTEGER NOT NULL REFERENCES users(id),
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS integrations (
      id INTEGER PRIMARY KEY,
      provider TEXT NOT NULL,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      account_email TEXT,
      access_token_encrypted TEXT,
      refresh_token_encrypted TEXT,
      expires_at TEXT,
      scope TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      last_error TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(provider, user_id)
    );

    CREATE TABLE IF NOT EXISTS integration_provider_settings (
      id INTEGER PRIMARY KEY,
      provider TEXT NOT NULL UNIQUE,
      client_id TEXT NOT NULL,
      client_secret_encrypted TEXT NOT NULL,
      redirect_uri TEXT NOT NULL,
      configured_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS integration_sync_states (
      id INTEGER PRIMARY KEY,
      integration_id INTEGER NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
      calendar_id INTEGER NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
      remote_calendar_id TEXT NOT NULL DEFAULT 'primary',
      sync_token TEXT,
      last_success_at TEXT,
      last_created INTEGER NOT NULL DEFAULT 0,
      last_updated INTEGER NOT NULL DEFAULT 0,
      last_canceled INTEGER NOT NULL DEFAULT 0,
      last_skipped INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(integration_id, calendar_id)
    );

    CREATE TABLE IF NOT EXISTS resources (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL DEFAULT 'room',
      location TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_by INTEGER REFERENCES users(id),
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY,
      calendar_id INTEGER NOT NULL REFERENCES calendars(id),
      event_type_id INTEGER NOT NULL REFERENCES event_types(id),
      title TEXT NOT NULL,
      description TEXT,
      start_datetime TEXT NOT NULL,
      end_datetime TEXT NOT NULL,
      all_day INTEGER NOT NULL DEFAULT 0,
      timezone TEXT NOT NULL DEFAULT 'America/Santo_Domingo',
      priority TEXT NOT NULL DEFAULT 'normal',
      status TEXT NOT NULL DEFAULT 'pending',
      location TEXT,
      virtual_link TEXT,
      responsible_user_id INTEGER REFERENCES users(id),
      supervisor_user_id INTEGER REFERENCES users(id),
      created_by INTEGER NOT NULL REFERENCES users(id),
      google_event_id TEXT,
      sync_status TEXT NOT NULL DEFAULT 'not_synced',
      recurrence_rule TEXT,
      integration_id INTEGER REFERENCES integrations(id),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS event_participants (
      id INTEGER PRIMARY KEY,
      event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id),
      participation_status TEXT NOT NULL DEFAULT 'pending',
      UNIQUE(event_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS event_reminders (
      id INTEGER PRIMARY KEY,
      event_id INTEGER NOT NULL UNIQUE REFERENCES events(id) ON DELETE CASCADE,
      recipient_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      minutes_before INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      sent_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS event_attachments (
      id INTEGER PRIMARY KEY,
      event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size INTEGER NOT NULL,
      data BLOB NOT NULL,
      uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      event_id INTEGER REFERENCES events(id) ON DELETE SET NULL,
      reminder_id INTEGER UNIQUE REFERENCES event_reminders(id) ON DELETE SET NULL,
      type TEXT NOT NULL DEFAULT 'reminder',
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      read_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS notification_deliveries (
      id INTEGER PRIMARY KEY,
      notification_id INTEGER NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
      channel TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      response_code INTEGER,
      error TEXT,
      delivered_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(notification_id, channel)
    );

    CREATE TABLE IF NOT EXISTS event_conflicts (
      id INTEGER PRIMARY KEY,
      event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      conflicting_event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      conflict_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(event_id, conflicting_event_id, conflict_type)
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id INTEGER,
      old_values TEXT,
      new_values TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sync_logs (
      id INTEGER PRIMARY KEY,
      event_id INTEGER REFERENCES events(id) ON DELETE SET NULL,
      integration_id INTEGER REFERENCES integrations(id) ON DELETE SET NULL,
      provider TEXT NOT NULL,
      operation TEXT NOT NULL,
      status TEXT NOT NULL,
      external_event_id TEXT,
      error_message TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_events_dates ON events(start_datetime, end_datetime);
    CREATE INDEX IF NOT EXISTS idx_events_responsible ON events(responsible_user_id);
    CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
    CREATE INDEX IF NOT EXISTS idx_oauth_states_expires ON oauth_states(expires_at);
    CREATE INDEX IF NOT EXISTS idx_event_reminders_due ON event_reminders(status, event_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read_at, created_at);
    CREATE INDEX IF NOT EXISTS idx_event_attachments_event ON event_attachments(event_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_sync_logs_event ON sync_logs(event_id, created_at);
  `);

  ensureColumn('events', 'integration_id', 'INTEGER REFERENCES integrations(id)');
  ensureColumn('events', 'resource_id', 'INTEGER REFERENCES resources(id)');
  ensureColumn('events', 'google_updated_at', 'TEXT');
  ensureColumn('events', 'last_synced_at', 'TEXT');
  ensureColumn('events', 'series_id', 'INTEGER REFERENCES event_series(id)');
  ensureColumn('events', 'occurrence_index', 'INTEGER');
  db.exec('CREATE INDEX IF NOT EXISTS idx_events_resource ON events(resource_id);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_events_google_link ON events(integration_id, google_event_id);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_events_series ON events(series_id, occurrence_index);');
  db.exec(`
    UPDATE events
    SET sync_status = 'not_synced'
    WHERE sync_status = 'synced' AND google_event_id IS NULL;
  `);
  if (seed === 'demo') {
    seedBaseCatalogs();
    seedDemoData();
    ensureDemoPermissions();
    ensureDefaultResources();
  } else {
    if (seed === 'base') {
      seedBaseCatalogs();
    } else {
      seedRoles();
    }
    // skipInitialAdmin lo usa create-admin.js, que gestiona la cuenta por su
    // cuenta y necesita distinguir si ya existía antes de tocar nada.
    if (!options.skipInitialAdmin) seedInitialAdmin({ silent });
  }
  if (config.isProduction) {
    assertNoActiveDemoCredentials();
  }
  ensureDefaultSettings();
}

// Acepta los alias históricos ('auto', 'none') para no romper llamadas antiguas.
function normalizeSeedMode(requested) {
  if (!requested || requested === 'auto') return config.seedMode;
  if (requested === 'none') return 'blank';
  if (!['blank', 'base', 'demo'].includes(requested)) {
    throw new Error(`Modo de siembra inválido: "${requested}"`);
  }
  if (requested === 'demo' && config.isProduction) {
    throw new Error('El modo de siembra "demo" no está permitido en producción');
  }
  return requested;
}

function ensureColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some((item) => item.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

// Los roles no son datos de ejemplo: authorization.js compara contra estos nombres,
// así que existen en todos los modos de arranque.
function seedRoles() {
  const insertRole = db.prepare('INSERT OR IGNORE INTO roles (name, description) VALUES (?, ?)');
  ['Administrador', 'Supervisor', 'Empleado', 'Consulta'].forEach((roleName) => {
    insertRole.run(roleName, `Rol ${roleName.toLowerCase()}`);
  });
}

// Catálogos mínimos para que la aplicación funcione sin datos de demostración.
// Es idempotente y no abre transacción propia para poder reutilizarse dentro de otra.
function seedBaseCatalogs() {
  seedRoles();

  const insertDepartment = db.prepare('INSERT OR IGNORE INTO departments (name, description) VALUES (?, ?)');
  ['Dirección', 'Operaciones', 'Reservas', 'Ventas', 'Marketing'].forEach((departmentName) => {
    insertDepartment.run(departmentName, `Departamento de ${departmentName.toLowerCase()}`);
  });

  const insertType = db.prepare(`
    INSERT OR IGNORE INTO event_types (name, description, color, requires_responsible)
    VALUES (?, ?, ?, ?)
  `);
  [
    ['Reserva', 'Gestión de una reserva', '#10B981', 1],
    ['Reunión', 'Reunión interna o externa', '#8B5CF6', 1],
    ['Pago', 'Pago o vencimiento financiero', '#F59E0B', 1],
    ['Seguimiento', 'Seguimiento comercial', '#4F6BED', 1],
    ['Publicación', 'Contenido de marketing', '#EC4899', 0],
    ['Entrega', 'Entrega de documentos', '#06B6D4', 1]
  ].forEach((type) => insertType.run(...type));
}

function seedDemoData() {
  const existing = db.prepare('SELECT COUNT(*) AS count FROM users').get().count;
  if (existing > 0) return;

  db.exec('BEGIN');
  try {
    const insertUser = db.prepare(`
      INSERT INTO users (name, email, password_hash, role_id, department_id)
      VALUES (?, ?, ?, ?, ?)
    `);
    const password = hashPassword('Demo123!');
    [
      ['Daniel Administrador', 'admin@empresa.com', 1, 1],
      ['Laura Supervisora', 'supervisor@empresa.com', 2, 2],
      ['Carlos Reservas', 'reservas@empresa.com', 3, 3],
      ['María Ventas', 'ventas@empresa.com', 3, 4]
    ].forEach(([name, email, roleId, departmentId]) => {
      insertUser.run(name, email, password, roleId, departmentId);
    });

    const insertCalendar = db.prepare(`
      INSERT INTO calendars (name, description, color, department_id, owner_user_id, visibility)
      VALUES (?, ?, ?, ?, 1, 'company')
    `);
    [
      ['Operaciones', 'Coordinación operativa', '#4F6BED', 2],
      ['Reservas', 'Reservas y viajes', '#10B981', 3],
      ['Pagos', 'Pagos y vencimientos', '#F59E0B', 1],
      ['Marketing', 'Campañas y publicaciones', '#EC4899', 5],
      ['Reuniones', 'Reuniones empresariales', '#8B5CF6', 1]
    ].forEach((calendar) => insertCalendar.run(...calendar));

    const today = new Date();
    const at = (offsetDays, hour, minute = 0) => {
      const date = new Date(today);
      date.setDate(date.getDate() + offsetDays);
      date.setHours(hour, minute, 0, 0);
      return date.toISOString();
    };
    const insertEvent = db.prepare(`
      INSERT INTO events (
        calendar_id, event_type_id, title, description, start_datetime, end_datetime,
        priority, status, responsible_user_id, created_by, sync_status, timezone
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `);
    [
      [2, 1, 'Seguimiento de reserva', 'Confirmar documentos y pago pendiente', at(0, 10), at(0, 10, 45), 'high', 'confirmed', 3, 'synced'],
      [3, 3, 'Pago pendiente proveedor', 'Validar factura antes de procesar', at(1, 9), at(1, 9, 30), 'urgent', 'pending', 2, 'not_synced'],
      [1, 2, 'Reunión operativa', 'Revisión semanal del equipo', at(0, 10, 30), at(0, 11, 30), 'normal', 'confirmed', 2, 'synced'],
      [4, 5, 'Publicación de campaña', 'Lanzamiento de campaña de temporada', at(3, 12), at(3, 12, 30), 'normal', 'pending', 4, 'not_synced'],
      [2, 6, 'Entrega de documentos', 'Documentación de viaje del cliente', at(-2, 15), at(-2, 16), 'high', 'pending', 3, 'error']
    ].forEach((event) => insertEvent.run(...event, config.timezone));

    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

// Única cuenta que se crea automáticamente. Solo actúa sobre una base sin usuarios:
// si ya hay alguien registrado, no toca nada.
function seedInitialAdmin({ silent = false } = {}) {
  const existing = db.prepare('SELECT COUNT(*) AS count FROM users').get().count;
  if (existing > 0) return;

  const { name, email, password } = config.initialAdmin;
  if (!email.trim() && !password) {
    if (config.isProduction) {
      throw new Error(
        'INITIAL_ADMIN_EMAIL e INITIAL_ADMIN_PASSWORD son obligatorios para inicializar una base vacía en producción'
      );
    }
    if (!silent) {
      console.warn(
        'Base de datos sin usuarios. Define INITIAL_ADMIN_EMAIL / INITIAL_ADMIN_PASSWORD '
        + 'o ejecuta "npm run create-admin" para poder iniciar sesión.'
      );
    }
    return;
  }

  createAdminUser({ name, email, password });
  if (!silent) console.log(`Administrador inicial creado para ${email.trim().toLowerCase()}`);
}

function assertAdminCredentials(email, password) {
  if (!/^\S+@\S+\.\S+$/.test(String(email).trim())) {
    throw new Error('El correo del administrador inicial no es válido');
  }
  if (String(password).length < 12) {
    throw new Error('La contraseña del administrador inicial debe tener al menos 12 caracteres');
  }
  if (password === 'Demo123!') {
    throw new Error('La contraseña del administrador inicial no puede ser la contraseña de demostración');
  }
}

// Crea el administrador dentro de su propia transacción. Devuelve el id creado.
function createAdminUser({ name, email, password }) {
  assertAdminCredentials(email, password);

  db.exec('BEGIN');
  try {
    seedRoles();
    const role = db.prepare("SELECT id FROM roles WHERE name = 'Administrador'").get();
    // En modo 'blank' no existen departamentos: la columna admite NULL.
    const department = db.prepare("SELECT id FROM departments WHERE name = 'Dirección'").get();
    const result = db.prepare(`
      INSERT INTO users (name, email, password_hash, role_id, department_id)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      String(name || '').trim() || 'Administrador',
      email.trim().toLowerCase(),
      hashPassword(password),
      role.id,
      department ? department.id : null
    );
    db.exec('COMMIT');
    return Number(result.lastInsertRowid);
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function ensureDemoPermissions() {
  const grants = [
    ['supervisor@empresa.com', 'Operaciones', 1, 1, 1, 1],
    ['reservas@empresa.com', 'Reservas', 1, 1, 1, 1],
    ['ventas@empresa.com', 'Marketing', 1, 1, 1, 0]
  ];
  const insert = db.prepare(`
    INSERT OR IGNORE INTO calendar_permissions (
      calendar_id, user_id, can_view, can_create, can_edit, can_delete
    )
    SELECT c.id, u.id, ?, ?, ?, ?
    FROM calendars c, users u
    WHERE c.name = ? AND lower(u.email) = lower(?)
  `);
  grants.forEach(([email, calendar, canView, canCreate, canEdit, canDelete]) => {
    insert.run(canView, canCreate, canEdit, canDelete, calendar, email);
  });
}

function passwordMatches(password, stored) {
  if (typeof stored !== 'string' || !stored.includes(':')) return false;
  const [salt, expected] = stored.split(':');
  const actual = crypto.scryptSync(password, salt, 64);
  const expectedBuffer = Buffer.from(expected, 'hex');
  return actual.length === expectedBuffer.length && crypto.timingSafeEqual(actual, expectedBuffer);
}

function assertNoActiveDemoCredentials() {
  const demoEmails = [
    'admin@empresa.com',
    'supervisor@empresa.com',
    'reservas@empresa.com',
    'ventas@empresa.com'
  ];
  const users = db.prepare(`
    SELECT email, password_hash AS passwordHash
    FROM users
    WHERE status = 'active' AND lower(email) IN (${demoEmails.map(() => '?').join(',')})
  `).all(...demoEmails);
  const exposed = users.filter((user) => passwordMatches('Demo123!', user.passwordHash));
  if (exposed.length) {
    throw new Error(
      `Producción bloqueada: cambia o desactiva las credenciales demo de ${exposed.map((user) => user.email).join(', ')}`
    );
  }
}

function ensureDefaultResources() {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO resources (name, type, location) VALUES (?, ?, ?)
  `);
  [
    ['Sala de juntas', 'room', 'Sede principal'],
    ['Sala de capacitación', 'room', 'Segundo nivel'],
    ['Proyector móvil', 'equipment', 'Almacén de operaciones']
  ].forEach((resource) => insert.run(...resource));
}

function ensureDefaultSettings() {
  const defaults = {
    distributionMaxCalendars: 5,
    distributionScaleMaxActivities: 10,
    defaultCalendarView: 'month',
    workdayStartHour: 8,
    workdayEndHour: 18,
    calendarSlotMinutes: 30,
    remindersEnabled: true,
    defaultReminderMinutes: 30,
    notificationsEnabled: true,
    notificationRetentionDays: 30,
    locationConflictsEnabled: true,
    resourceConflictsEnabled: true,
    googleIntegrationEnabled: true,
    // Vacío significa «usa BACKUP_PATH»; la retención hereda el valor del entorno
    // en una base nueva y a partir de ahí se administra desde Configuración.
    backupDestinations: [],
    backupRetentionCount: config.backupRetention,
    developerModeEnabled: false
  };
  const insert = db.prepare('INSERT OR IGNORE INTO system_settings (key, value) VALUES (?, ?)');
  Object.entries(defaults).forEach(([key, value]) => insert.run(key, JSON.stringify(value)));
}

module.exports = {
  db,
  initializeDatabase,
  hashPassword,
  passwordMatches,
  createAdminUser,
  assertAdminCredentials
};
