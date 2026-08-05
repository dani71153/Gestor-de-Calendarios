#!/usr/bin/env node
/*
Crea (o restablece) una cuenta de Administrador sobre la base configurada.

  node scripts/create-admin.js --email jefe@empresa.com --password "Clave-larga-2026"
  node scripts/create-admin.js --email jefe@empresa.com --password "Nueva-clave" --force
  node scripts/create-admin.js --email jefe@empresa.com --password "..." --name "Daniel"

--force restablece la contraseña de una cuenta que ya existe, la reactiva y le
asigna el rol Administrador.

Los tres valores admiten también las variables INITIAL_ADMIN_EMAIL,
INITIAL_ADMIN_PASSWORD e INITIAL_ADMIN_NAME, útiles para no exponer la
contraseña en la lista de procesos. Los argumentos tienen prioridad.
*/
const { db, initializeDatabase, hashPassword, createAdminUser, assertAdminCredentials } = require('../src/database');
const config = require('../src/config');

function parseArguments(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    if (key === 'force') {
      values.force = true;
      continue;
    }
    const next = argv[index + 1];
    if (next === undefined || next.startsWith('--')) {
      throw new Error(`Falta el valor de --${key}`);
    }
    values[key] = next;
    index += 1;
  }
  return values;
}

function main() {
  const args = parseArguments(process.argv.slice(2));
  // process.loadEnvFile no pisa el entorno ya definido, así que una variable
  // exportada por quien invoca este script gana sobre el valor del .env.
  const email = String(args.email || process.env.INITIAL_ADMIN_EMAIL || '').trim().toLowerCase();
  const password = String(args.password || process.env.INITIAL_ADMIN_PASSWORD || '');
  const rawName = args.name !== undefined ? args.name : process.env.INITIAL_ADMIN_NAME;
  const name = rawName ? String(rawName).trim() : null;

  if (!email || !password) {
    console.error('Uso: node scripts/create-admin.js --email <correo> --password <contraseña> [--name <nombre>] [--force]');
    console.error('También admite INITIAL_ADMIN_EMAIL, INITIAL_ADMIN_PASSWORD e INITIAL_ADMIN_NAME.');
    process.exitCode = 1;
    return;
  }

  assertAdminCredentials(email, password);

  // Garantiza el esquema y los catálogos antes de tocar la tabla de usuarios.
  // skipInitialAdmin evita que el bootstrap cree la cuenta a partir de las
  // variables INITIAL_ADMIN_*: aquí decidimos nosotros entre crear y --force.
  initializeDatabase({ silent: true, skipInitialAdmin: true });

  const existing = db.prepare('SELECT id, name, status FROM users WHERE lower(email) = ?').get(email);
  if (existing && !args.force) {
    console.error(`Ya existe un usuario con el correo ${email}. Usa --force para restablecer su contraseña.`);
    process.exitCode = 1;
    return;
  }

  if (existing) {
    const role = db.prepare("SELECT id FROM roles WHERE name = 'Administrador'").get();
    db.prepare(`
      UPDATE users
      SET name = ?, password_hash = ?, role_id = ?, status = 'active', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `)
      // Sin --name se conserva el nombre actual: --force solo restablece el acceso.
      .run(name || existing.name, hashPassword(password), role.id, existing.id);
    // Las sesiones abiertas dejan de ser válidas tras cambiar la contraseña.
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(existing.id);
    console.log(`Administrador actualizado: ${email} (base: ${config.databasePath})`);
    return;
  }

  createAdminUser({ name, email, password });
  console.log(`Administrador creado: ${email} (base: ${config.databasePath})`);
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
