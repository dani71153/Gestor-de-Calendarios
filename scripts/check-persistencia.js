#!/usr/bin/env node
/*
Comprobación de persistencia: crea actividades de todas las formas que admite la
aplicación, cierra y reabre el servidor varias veces, y verifica que nada cambie
entre reinicios.

  npm run check
  npm run check -- --eventos 100 --reinicios 4

Trabaja siempre sobre una base temporal propia y arranca el servidor real por
HTTP: no toca la base de trabajo ni requiere que el servidor esté levantado.

Salida distinta de cero si alguna verificación falla.
*/
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');

const raiz = path.resolve(__dirname, '..');
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function parseArgumentos(argv) {
  const valores = { eventos: 60, reinicios: 3 };
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith('--')) continue;
    const clave = argv[i].slice(2);
    const valor = Number(argv[i + 1]);
    if (Number.isInteger(valor) && valor > 0) valores[clave] = valor;
    i += 1;
  }
  return valores;
}

function puertoLibre() {
  return new Promise((resolve) => {
    const sonda = net.createServer();
    sonda.listen(0, () => {
      const { port } = sonda.address();
      sonda.close(() => resolve(port));
    });
  });
}

const espera = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// --- Servidor -----------------------------------------------------------------

class Servidor {
  constructor({ puerto, basePath }) {
    this.puerto = puerto;
    this.basePath = basePath;
    this.url = `http://localhost:${puerto}`;
    this.proceso = null;
  }

  async arrancar() {
    this.proceso = spawn(process.execPath, ['src/server.js'], {
      cwd: raiz,
      stdio: 'ignore',
      env: {
        ...process.env,
        PORT: String(this.puerto),
        DATABASE_PATH: this.basePath,
        BACKUP_ENABLED: 'false',
        SEED_MODE: 'base',
        NODE_ENV: 'development',
        INITIAL_ADMIN_EMAIL: 'jefe@empresa.com',
        INITIAL_ADMIN_PASSWORD: 'Clave-De-Prueba-2026'
      }
    });
    for (let intento = 0; intento < 80; intento += 1) {
      try {
        await fetch(`${this.url}/api/health`);
        return;
      } catch {
        await espera(250);
      }
    }
    throw new Error('El servidor no respondió al arrancar');
  }

  // forzado simula un cierre abrupto: es donde SQLite tiene que recuperar el WAL.
  async detener({ forzado = false } = {}) {
    if (!this.proceso) return;
    const cerrado = new Promise((resolve) => this.proceso.once('exit', resolve));
    this.proceso.kill(forzado ? 'SIGKILL' : 'SIGTERM');
    await cerrado;
    this.proceso = null;
    // Margen para que el sistema libere los descriptores del archivo.
    await espera(300);
  }
}

// --- Cliente ------------------------------------------------------------------

class Cliente {
  constructor(url) {
    this.url = url;
    this.cookie = null;
    this.csrf = null;
  }

  async entrar(email, password) {
    const respuesta = await fetch(`${this.url}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: this.url },
      body: JSON.stringify({ email, password })
    });
    if (!respuesta.ok) throw new Error(`Login fallido para ${email}`);
    this.cookie = respuesta.headers.getSetCookie()[0].split(';')[0];
    this.csrf = (await respuesta.json()).csrfToken;
    return this;
  }

  async pedir(ruta, opciones = {}) {
    const metodo = opciones.method || 'GET';
    const cabeceras = { Cookie: this.cookie, Origin: this.url };
    if (opciones.body !== undefined) cabeceras['Content-Type'] = 'application/json';
    if (metodo !== 'GET') cabeceras['X-CSRF-Token'] = this.csrf;
    const respuesta = await fetch(`${this.url}${ruta}`, {
      ...opciones,
      headers: { ...cabeceras, ...(opciones.headers || {}) },
      body: opciones.body === undefined ? undefined : JSON.stringify(opciones.body)
    });
    const datos = await respuesta.json();
    if (!respuesta.ok) throw new Error(`${metodo} ${ruta} -> ${respuesta.status}: ${datos.error}`);
    return datos;
  }

  async subirArchivo(eventoId, nombre, contenido) {
    const formulario = new FormData();
    formulario.append('file', new Blob([contenido]), nombre);
    const respuesta = await fetch(`${this.url}/api/events/${eventoId}/attachments`, {
      method: 'POST',
      headers: { Cookie: this.cookie, Origin: this.url, 'X-CSRF-Token': this.csrf },
      body: formulario
    });
    if (!respuesta.ok) throw new Error(`Subida fallida: ${(await respuesta.json()).error}`);
    return respuesta.json();
  }
}

// --- Inventario ---------------------------------------------------------------

// Se lee del archivo, con el servidor detenido: es la prueba de que lo guardado
// sobrevive al cierre, sin intermediación de ninguna caché en memoria.
function inventario(basePath) {
  const db = new DatabaseSync(basePath, { readOnly: true });
  try {
    const integridad = db.prepare('PRAGMA integrity_check').get().integrity_check;
    const eventos = db.prepare(`
      SELECT id, title, start_datetime AS inicio, end_datetime AS fin, status AS estado,
             calendar_id AS calendario, responsible_user_id AS responsable,
             resource_id AS recurso, location AS lugar, series_id AS serie,
             occurrence_index AS ocurrencia, deleted_at AS borrado
      FROM events ORDER BY id
    `).all();
    const cuenta = (sql) => db.prepare(sql).get().c;
    return {
      integridad,
      eventos,
      totales: {
        eventos: eventos.length,
        activos: eventos.filter((e) => !e.borrado).length,
        cancelados: eventos.filter((e) => e.borrado).length,
        series: cuenta('SELECT COUNT(*) c FROM event_series'),
        adjuntos: cuenta('SELECT COUNT(*) c FROM event_attachments'),
        bytesAdjuntos: db.prepare('SELECT COALESCE(SUM(size),0) c FROM event_attachments').get().c,
        recordatorios: cuenta('SELECT COUNT(*) c FROM event_reminders'),
        auditoria: cuenta("SELECT COUNT(*) c FROM audit_logs WHERE entity_type='event'"),
        usuarios: cuenta('SELECT COUNT(*) c FROM users'),
        calendarios: cuenta('SELECT COUNT(*) c FROM calendars'),
        recursos: cuenta('SELECT COUNT(*) c FROM resources')
      }
    };
  } finally {
    db.close();
  }
}

function compararInventarios(previo, actual) {
  const fallos = [];
  for (const [clave, valor] of Object.entries(previo.totales)) {
    if (actual.totales[clave] !== valor) {
      fallos.push(`${clave}: había ${valor}, ahora ${actual.totales[clave]}`);
    }
  }
  if (actual.integridad !== 'ok') fallos.push(`integrity_check devolvió "${actual.integridad}"`);

  const antes = new Map(previo.eventos.map((e) => [e.id, e]));
  for (const evento of actual.eventos) {
    const original = antes.get(evento.id);
    if (!original) {
      fallos.push(`el evento ${evento.id} apareció de la nada`);
      continue;
    }
    for (const campo of ['title', 'inicio', 'fin', 'estado', 'calendario', 'responsable', 'recurso', 'lugar', 'serie', 'ocurrencia']) {
      if (String(original[campo]) !== String(evento[campo])) {
        fallos.push(`evento ${evento.id}, campo ${campo}: "${original[campo]}" -> "${evento[campo]}"`);
      }
    }
    antes.delete(evento.id);
  }
  antes.forEach((evento) => fallos.push(`el evento ${evento.id} ("${evento.title}") desapareció`));
  return fallos;
}

// --- Creación de actividades --------------------------------------------------

function fecha(dias, hora) {
  const momento = new Date();
  momento.setDate(momento.getDate() + dias);
  momento.setHours(hora, 0, 0, 0);
  return momento.toISOString().slice(0, 16);
}

async function prepararEscenario(cliente) {
  const calendarios = [];
  for (const [nombre, color] of [['Operaciones', '#4F6BED'], ['Reservas', '#10B981'], ['Marketing', '#EC4899']]) {
    await cliente.pedir('/api/calendars', {
      method: 'POST',
      body: { name: nombre, description: `Calendario de ${nombre}`, color, visibility: 'company' }
    });
  }
  const { calendars } = await cliente.pedir('/api/admin/calendars');
  calendarios.push(...calendars.map((c) => c.id));

  const { roles } = await cliente.pedir('/api/roles');
  const { departments } = await cliente.pedir('/api/departments');
  const rolEmpleado = roles.find((r) => r.name === 'Empleado') || roles[0];
  for (const nombre of ['Ana Operaciones', 'Luis Reservas']) {
    await cliente.pedir('/api/admin/users', {
      method: 'POST',
      body: {
        name: nombre,
        email: `${nombre.split(' ')[0].toLowerCase()}@empresa.com`,
        password: 'Clave-De-Prueba-2026',
        roleId: rolEmpleado.id,
        departmentId: departments[0]?.id || null
      }
    });
  }
  const { users } = await cliente.pedir('/api/admin/users');

  for (const [nombre, tipo] of [['Sala grande', 'room'], ['Proyector', 'equipment']]) {
    await cliente.pedir('/api/admin/resources', { method: 'POST', body: { name: nombre, type: tipo } });
  }
  const { resources } = await cliente.pedir('/api/admin/resources');
  const { eventTypes } = await cliente.pedir('/api/event-types');

  return {
    calendarios,
    usuarios: users.map((u) => u.id),
    recursos: resources.map((r) => r.id),
    tiposEvento: eventTypes.map((t) => t.id)
  };
}

// Cada variante ejercita un camino distinto del código, no solo el alta simple.
async function crearActividades(cliente, escenario, objetivo, registro) {
  const variantes = [];
  let indice = 0;

  const siguiente = () => {
    indice += 1;
    return {
      calendarId: escenario.calendarios[indice % escenario.calendarios.length],
      eventTypeId: escenario.tiposEvento[indice % escenario.tiposEvento.length],
      startDatetime: fecha(indice % 40, 8 + (indice % 9)),
      endDatetime: fecha(indice % 40, 9 + (indice % 9))
    };
  };

  while (registro.creados < objetivo) {
    const restantes = objetivo - registro.creados;
    // La variante se elige por número de operación y no por eventos creados: una
    // serie añade cuatro de golpe y hacía inalcanzables las variantes siguientes.
    const variante = registro.operaciones % 8;
    registro.operaciones += 1;

    if (variante === 0) {
      const datos = siguiente();
      const r = await cliente.pedir('/api/events', {
        method: 'POST', body: { ...datos, title: `Simple ${registro.creados}` }
      });
      registro.creados += r.occurrencesCreated;
      variantes.push('simple');
    } else if (variante === 1) {
      const datos = siguiente();
      const r = await cliente.pedir('/api/events', {
        method: 'POST',
        body: {
          ...datos,
          title: `Con responsable ${registro.creados}`,
          responsibleUserId: escenario.usuarios[registro.creados % escenario.usuarios.length],
          priority: 'high',
          reminderMinutes: 30
        }
      });
      registro.creados += r.occurrencesCreated;
      variantes.push('responsable+recordatorio');
    } else if (variante === 2) {
      const datos = siguiente();
      const r = await cliente.pedir('/api/events', {
        method: 'POST',
        body: {
          ...datos,
          title: `Con recurso ${registro.creados}`,
          resourceId: escenario.recursos[registro.creados % escenario.recursos.length],
          location: 'Sede principal'
        }
      });
      registro.creados += r.occurrencesCreated;
      variantes.push('recurso+ubicacion');
    } else if (variante === 3 && restantes >= 4) {
      const datos = siguiente();
      const frecuencias = ['daily', 'weekly', 'monthly'];
      const r = await cliente.pedir('/api/events', {
        method: 'POST',
        body: {
          ...datos,
          title: `Serie ${registro.creados}`,
          recurrence: {
            frequency: frecuencias[registro.creados % 3],
            interval: 1,
            count: Math.min(4, restantes)
          }
        }
      });
      registro.creados += r.occurrencesCreated;
      registro.series += 1;
      variantes.push(`serie x${r.occurrencesCreated}`);
    } else if (variante === 4) {
      const datos = siguiente();
      const r = await cliente.pedir('/api/events', {
        method: 'POST', body: { ...datos, title: `Para editar ${registro.creados}` }
      });
      registro.creados += r.occurrencesCreated;
      await cliente.pedir(`/api/events/${r.event.id}`, {
        method: 'PUT',
        body: {
          ...datos,
          title: `Editado ${registro.creados}`,
          status: 'confirmed',
          description: 'Modificado tras crearlo'
        }
      });
      registro.editados += 1;
      variantes.push('creado+editado');
    } else if (variante === 5) {
      const datos = siguiente();
      const r = await cliente.pedir('/api/events', {
        method: 'POST', body: { ...datos, title: `Con adjunto ${registro.creados}` }
      });
      registro.creados += r.occurrencesCreated;
      await cliente.subirArchivo(
        r.event.id,
        `flyer-${registro.creados}.png`,
        Buffer.concat([PNG, Buffer.from(`contenido ${registro.creados}`.repeat(20))])
      );
      registro.adjuntos += 1;
      variantes.push('con adjunto');
    } else if (variante === 6) {
      const datos = siguiente();
      const r = await cliente.pedir('/api/events', {
        method: 'POST', body: { ...datos, title: `Para cancelar ${registro.creados}` }
      });
      registro.creados += r.occurrencesCreated;
      await cliente.pedir(`/api/events/${r.event.id}`, { method: 'DELETE', body: { seriesScope: 'single' } });
      registro.cancelados += 1;
      variantes.push('creado+cancelado');
    } else {
      // Dos a la misma hora y responsable: el camino con conflicto detectado.
      const datos = siguiente();
      const responsable = escenario.usuarios[0];
      const primero = await cliente.pedir('/api/events', {
        method: 'POST', body: { ...datos, title: `Choque A ${registro.creados}`, responsibleUserId: responsable }
      });
      registro.creados += primero.occurrencesCreated;
      if (registro.creados < objetivo) {
        const segundo = await cliente.pedir('/api/events', {
          method: 'POST', body: { ...datos, title: `Choque B ${registro.creados}`, responsibleUserId: responsable }
        });
        registro.creados += segundo.occurrencesCreated;
        if (!segundo.hasConflict) registro.avisos.push('un solapamiento no se reportó como conflicto');
      }
      variantes.push('conflicto');
    }
  }
  return variantes;
}

// --- Ejecución ----------------------------------------------------------------

async function main() {
  const opciones = parseArgumentos(process.argv.slice(2));
  const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'gestor-persistencia-'));
  const basePath = path.join(carpeta, 'calendario.sqlite');
  const puerto = await puertoLibre();
  const servidor = new Servidor({ puerto, basePath });
  const fallos = [];
  const registro = { creados: 0, operaciones: 0, editados: 0, cancelados: 0, adjuntos: 0, series: 0, avisos: [] };

  console.log('COMPROBACIÓN DE PERSISTENCIA');
  console.log('----------------------------');
  console.log(`  objetivo   : ${opciones.eventos} actividades`);
  console.log(`  reinicios  : ${opciones.reinicios}`);
  console.log(`  base       : ${basePath}`);
  console.log(`  puerto     : ${puerto}\n`);

  try {
    await servidor.arrancar();
    const cliente = await new Cliente(servidor.url).entrar('jefe@empresa.com', 'Clave-De-Prueba-2026');
    const escenario = await prepararEscenario(cliente);
    console.log(`Escenario: ${escenario.calendarios.length} calendarios, ${escenario.usuarios.length} usuarios, ${escenario.recursos.length} recursos\n`);

    const variantes = await crearActividades(cliente, escenario, opciones.eventos, registro);
    const usadas = [...new Set(variantes.map((v) => v.replace(/ x\d+$/, '')))];
    const esperadas = ['simple', 'responsable+recordatorio', 'recurso+ubicacion', 'serie',
      'creado+editado', 'con adjunto', 'creado+cancelado', 'conflicto'];
    const ausentes = esperadas.filter((v) => !usadas.includes(v));
    if (ausentes.length) fallos.push(`formas no ejercitadas: ${ausentes.join(', ')}`);
    console.log(`Creadas ${registro.creados} actividades en ${variantes.length} operaciones`);
    console.log(`  formas ejercitadas: ${usadas.join(', ')}`);
    console.log(`  editadas: ${registro.editados} · canceladas: ${registro.cancelados} · con adjunto: ${registro.adjuntos} · series: ${registro.series}\n`);

    await servidor.detener();
    let referencia = inventario(basePath);
    console.log('Inventario inicial tras cerrar:');
    console.log(`  ${JSON.stringify(referencia.totales)}`);
    console.log(`  integridad: ${referencia.integridad}\n`);

    for (let vuelta = 1; vuelta <= opciones.reinicios; vuelta += 1) {
      const forzado = vuelta % 2 === 0;
      console.log(`Reinicio ${vuelta}/${opciones.reinicios} (${forzado ? 'cierre abrupto' : 'cierre normal'})`);

      await servidor.arrancar();
      // Se consulta por HTTP para comprobar que la aplicación sirve lo guardado.
      const sesion = await new Cliente(servidor.url).entrar('jefe@empresa.com', 'Clave-De-Prueba-2026');
      const { events } = await sesion.pedir('/api/events?start=2000-01-01&end=2100-01-01');
      const activosEsperados = referencia.totales.activos;
      if (events.length !== activosEsperados) {
        fallos.push(`reinicio ${vuelta}: la API devolvió ${events.length} eventos y se esperaban ${activosEsperados}`);
      }
      console.log(`  la API devuelve ${events.length} eventos activos`);

      await servidor.detener({ forzado });
      const actual = inventario(basePath);
      const diferencias = compararInventarios(referencia, actual);
      if (diferencias.length) {
        diferencias.forEach((d) => fallos.push(`reinicio ${vuelta}: ${d}`));
        console.log(`  DIFERENCIAS: ${diferencias.length}`);
        diferencias.slice(0, 5).forEach((d) => console.log(`    - ${d}`));
      } else {
        console.log('  sin diferencias respecto al inventario anterior');
      }
      referencia = actual;
      console.log('');
    }

    // Los adjuntos se comprueban aparte: viven como BLOB y son lo más pesado.
    if (registro.adjuntos > 0) {
      await servidor.arrancar();
      const sesion = await new Cliente(servidor.url).entrar('jefe@empresa.com', 'Clave-De-Prueba-2026');
      const db = new DatabaseSync(basePath, { readOnly: true });
      const adjuntos = db.prepare('SELECT id, size FROM event_attachments').all();
      db.close();
      let servidos = 0;
      for (const adjunto of adjuntos) {
        const respuesta = await fetch(`${servidor.url}/api/attachments/${adjunto.id}`, {
          headers: { Cookie: sesion.cookie }
        });
        const bytes = Buffer.from(await respuesta.arrayBuffer());
        if (respuesta.ok && bytes.length === adjunto.size) servidos += 1;
        else fallos.push(`el adjunto ${adjunto.id} no se sirvió íntegro`);
      }
      console.log(`Adjuntos servidos correctamente tras los reinicios: ${servidos}/${adjuntos.length}\n`);
      await servidor.detener();
    }

    registro.avisos.forEach((aviso) => console.log(`Aviso: ${aviso}`));
  } catch (error) {
    fallos.push(`error durante la comprobación: ${error.message}`);
  } finally {
    await servidor.detener({ forzado: true });
    fs.rmSync(carpeta, { recursive: true, force: true });
  }

  console.log('----------------------------');
  if (fallos.length) {
    console.log(`RESULTADO: ${fallos.length} FALLO(S)`);
    fallos.forEach((f) => console.log(`  - ${f}`));
    process.exitCode = 1;
  } else {
    console.log('RESULTADO: CORRECTO');
    console.log('La información se mantuvo intacta en todos los reinicios.');
  }
}

main();
