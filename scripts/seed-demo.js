#!/usr/bin/env node
/*
Carga los datos de demostración (usuarios, calendarios, eventos y recursos de
ejemplo) sobre la base configurada. Equivale a arrancar con SEED_MODE=demo.

  npm run seed:demo

Solo actúa si la base todavía no tiene usuarios, y nunca en producción.
*/
const config = require('../src/config');
const { db, initializeDatabase } = require('../src/database');

function main() {
  if (config.isProduction) {
    throw new Error('Los datos de demostración no se pueden cargar con NODE_ENV=production.');
  }

  // Crea el esquema sin sembrar nada para poder contar los usuarios existentes.
  initializeDatabase({ seed: 'blank', silent: true });
  const before = db.prepare('SELECT COUNT(*) AS count FROM users').get().count;
  if (before > 0) {
    throw new Error(`La base ya tiene ${before} usuario(s). Elimínala antes de cargar la demostración.`);
  }

  initializeDatabase({ seed: 'demo' });
  const users = db.prepare('SELECT COUNT(*) AS count FROM users').get().count;
  const events = db.prepare('SELECT COUNT(*) AS count FROM events').get().count;
  console.log(`Datos de demostración cargados: ${users} usuarios, ${events} eventos.`);
  console.log('Acceso: admin@empresa.com / Demo123!');
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
