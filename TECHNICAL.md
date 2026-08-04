# TECHNICAL.md — Gestor Central de Calendarios

## 1. Identidad técnica del producto

El Gestor Central de Calendarios es una aplicación web interna para administrar varios calendarios empresariales desde un único punto.

El núcleo del producto es el **calendario**:

- define un ámbito organizativo;
- pertenece a un propietario o departamento;
- establece quién puede verlo y operar sobre él;
- agrupa entradas de agenda;
- participa en la vista consolidada;
- puede vincularse con un calendario externo.

Los eventos no constituyen un producto independiente. Son entradas subordinadas a un calendario y siempre se consultan, autorizan, reportan y sincronizan dentro del alcance de uno o más calendarios.

La aplicación actúa como capa administrativa sobre la agenda empresarial. La base interna conserva calendarios, permisos, responsables y reglas de operación; Google Calendar funciona como proveedor externo de sincronización.

## 2. Alcance implementado

La versión actual permite:

- crear, editar y archivar calendarios internos;
- organizar calendarios por departamento, propietario y visibilidad;
- asignar permisos por usuario y calendario;
- presentar una agenda consolidada mensual, semanal o diaria;
- filtrar la agenda por calendario;
- registrar entradas simples o recurrentes;
- asignar responsables, salas y recursos;
- detectar solapamientos;
- generar recordatorios y notificaciones;
- calcular indicadores por calendario;
- conectar una cuenta de Google;
- enviar entradas seleccionadas a Google Calendar;
- importar cambios desde Google hacia un calendario interno;
- auditar operaciones administrativas y de agenda.

No están completos los participantes, invitaciones, RSVP, calendarios públicos, Outlook ni la consulta visual de auditoría.

## 3. Stack real

| Área | Tecnología | Uso actual |
|---|---|---|
| Runtime | Node.js 24+ | Servidor, criptografía, SQLite y tareas periódicas |
| Backend | Express 5.1 | API JSON y publicación de archivos estáticos |
| Persistencia | node:sqlite | Base SQLite abierta mediante DatabaseSync |
| Frontend | HTML, CSS y JavaScript nativo | SPA sin compilación ni framework |
| Integración | Google Calendar API v3 | OAuth 2.0 y sincronización |
| Seguridad criptográfica | node:crypto | Scrypt, tokens aleatorios y AES-256-GCM |
| Pruebas | node:test | Pruebas unitarias |

La aplicación es un monolito modular de una sola instancia. No utiliza ORM, TypeScript, bundler ni motor de colas. Las sesiones se persisten en SQLite.

## 4. Arquitectura

~~~mermaid
flowchart LR
    Browser[Navegador]
    Static[SPA estática]
    API[API Express]
    Auth[Autenticación y autorización]
    Calendar[Dominio de calendarios]
    Agenda[Agenda y entradas]
    Services[Recordatorios, reportes y sincronización]
    DB[(SQLite)]
    Google[Google Calendar API]
    Hooks[Webhooks externos]

    Browser --> Static
    Browser -->|JSON + cookie| API
    API --> Auth
    Auth --> Calendar
    Calendar --> Agenda
    Agenda --> Services
    Calendar --> DB
    Agenda --> DB
    Services --> DB
    Services --> Google
    Services --> Hooks
~~~

### 4.1 Composición del proceso

src/server.js realiza el arranque:

1. carga configuración;
2. inicializa SQLite y los datos base;
3. configura Express;
4. publica public/;
5. registra las rutas de sesión, calendarios, agenda, administración, configuración, recordatorios, reportes e integraciones;
6. crea el proveedor de Google y el servicio de sincronización;
7. inicia el servidor HTTP;
8. inicia el scheduler de recordatorios.

Todos los módulos comparten la misma conexión síncrona a SQLite.

### 4.2 Flujo de autorización

~~~mermaid
flowchart TD
    Request[Solicitud autenticada] --> Session[Validar cookie y sesión]
    Session --> User[Cargar usuario activo]
    User --> Scope[Calcular calendarios accesibles]
    Scope --> Capability[Calcular capacidad sobre calendario]
    Capability --> Operation{Operación permitida}
    Operation -->|Sí| Domain[Ejecutar regla de dominio]
    Operation -->|No| Forbidden[HTTP 403]
    Domain --> DB[(SQLite)]
~~~

La autorización no depende de controles visuales. Cada consulta u operación sensible vuelve a calcular el alcance en el backend.

## 5. Organización del código

~~~text
src/
├── server.js
├── config.js
├── database.js
├── auth.js
├── authorization.js
├── administration.js
├── events.js
├── recurrence.js
├── settings.js
├── reminders.js
├── external-notifications.js
├── reports.js
└── integrations/
    ├── calendar-provider.js
    ├── google-calendar.provider.js
    ├── event.mapper.js
    ├── token-cipher.js
    ├── integration.repository.js
    ├── provider-settings.repository.js
    ├── sync.service.js
    └── integration.routes.js

public/
├── index.html
├── app.js
├── theme.css
├── styles.css
├── sw.js
└── js/
    ├── config/
    ├── core/
    ├── services/
    └── components/

tests/
├── administration.test.js
├── authorization.test.js
├── events.test.js
├── integrations.test.js
├── recurrence-reports.test.js
└── settings-reminders.test.js
~~~

### 5.1 Responsabilidades

| Módulo | Responsabilidad |
|---|---|
| config.js | Resolver entorno, rutas y credenciales alternativas |
| database.js | Crear esquema, índices, columnas incrementales y bootstrap según entorno |
| auth.js | Login, logout, sesiones persistentes, cookie, CSRF y rate limiting |
| security.js | Cabeceras HTTP y validación global de origen |
| rate-limit.js | Limitador reutilizable de intentos |
| authorization.js | Visibilidad y capacidades por calendario |
| administration.js | Calendarios, usuarios, departamentos y permisos |
| events.js | Entradas de calendario, consultas de agenda, conflictos y resumen |
| recurrence.js | Expandir recurrencias en entradas individuales |
| settings.js | Preferencias globales y recursos reservables |
| reminders.js | Recordatorios y bandeja interna |
| external-notifications.js | Entrega mediante webhooks |
| reports.js | Agregados de cumplimiento y carga por calendario |
| integrations/* | OAuth, credenciales, mapeo y sincronización externa |

Aunque el archivo se llama events.js, sus consultas están limitadas por accessibleCalendarIds(). Técnicamente es el módulo de contenido y proyección de agenda de los calendarios autorizados.

## 6. Modelo de dominio

### 6.1 Calendario

La tabla calendars representa el agregado principal.

| Campo | Función |
|---|---|
| name, description, color | Identidad visual y funcional |
| department_id | Ámbito departamental |
| owner_user_id | Propietario |
| visibility | private, department o company |
| google_calendar_id | Identificador del calendario remoto |
| sync_enabled | Indicador preparado para sincronización |
| status | active o archived |

Un calendario archivado deja de estar disponible para usuarios no administradores y no admite nuevas entradas.

### 6.2 Permiso de calendario

calendar_permissions contiene una ACL por usuario y calendario:

- can_view;
- can_create;
- can_edit;
- can_delete.

Crear, editar o cancelar implica lectura. El rol Consulta se normaliza siempre a solo lectura.

### 6.3 Entrada de calendario

El código y la API utilizan el nombre event. Cada entrada:

- pertenece obligatoriamente a un calendario;
- tiene tipo, intervalo temporal, estado y prioridad;
- puede tener responsable y recurso;
- puede formar parte de una serie;
- puede programar un recordatorio;
- puede vincularse con una entrada de Google.

Las fechas se guardan como texto ISO 8601 y se conserva una zona horaria por entrada.

### 6.4 Serie

event_series agrupa las ocurrencias generadas. El sistema materializa cada ocurrencia como una fila en events; no calcula la serie durante cada lectura.

Frecuencias disponibles:

- diaria;
- semanal;
- mensual.

El intervalo permitido es de 1 a 12 y cada serie contiene entre 2 y 100 ocurrencias.

### 6.5 Recursos

resources modela salas, equipos, vehículos y otros activos. Una entrada puede reservar un recurso. Los recursos se desactivan de forma lógica.

### 6.6 Integración

La conexión OAuth pertenece a un usuario mediante integrations. El cursor de importación pertenece a la combinación:

~~~text
integración del usuario + calendario interno
~~~

Esto permite que una cuenta conectada importe en distintos calendarios internos con estados incrementales independientes.

## 7. Modelo de datos

~~~mermaid
erDiagram
    DEPARTMENTS ||--o{ USERS : contiene
    ROLES ||--o{ USERS : asigna
    DEPARTMENTS ||--o{ CALENDARS : organiza
    USERS ||--o{ CALENDARS : posee
    USERS ||--o{ CALENDAR_PERMISSIONS : recibe
    CALENDARS ||--o{ CALENDAR_PERMISSIONS : controla
    CALENDARS ||--o{ EVENTS : contiene
    EVENT_TYPES ||--o{ EVENTS : clasifica
    EVENT_SERIES ||--o{ EVENTS : agrupa
    RESOURCES ||--o{ EVENTS : reserva
    USERS ||--o{ EVENTS : responsabiliza
    EVENTS ||--o| EVENT_REMINDERS : programa
    EVENT_REMINDERS ||--o| NOTIFICATIONS : genera
    NOTIFICATIONS ||--o{ NOTIFICATION_DELIVERIES : entrega
    USERS ||--o{ INTEGRATIONS : conecta
    INTEGRATIONS ||--o{ EVENTS : vincula
    INTEGRATIONS ||--o{ INTEGRATION_SYNC_STATES : mantiene
    CALENDARS ||--o{ INTEGRATION_SYNC_STATES : recibe
~~~

### 7.1 Tablas operativas

| Grupo | Tablas |
|---|---|
| Identidad | roles, departments, users |
| Calendarios | calendars, calendar_permissions |
| Agenda | event_types, event_series, events, resources |
| Avisos | event_reminders, notifications, notification_deliveries |
| Integraciones | integrations, integration_provider_settings, integration_sync_states, sync_logs |
| Configuración y control | system_settings, audit_logs |
| Preparadas, sin flujo completo | event_participants, event_conflicts |

### 7.2 Inicialización

SQLite se abre con:

~~~sql
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
PRAGMA journal_mode = WAL;
~~~

El esquema se crea con IF NOT EXISTS. Algunas columnas se agregan mediante PRAGMA table_info y ALTER TABLE. No existe un sistema de migraciones versionadas.

El bootstrap solo se ejecuta si no existen usuarios. En desarrollo carga datos demo. En producción crea catálogos básicos y un único Administrador desde `INITIAL_ADMIN_*`, sin calendarios, eventos, recursos ni cuentas demo. La configuración predeterminada se completa de forma idempotente.

## 8. Gobierno y acceso a calendarios

### 8.1 Reglas de lectura

Un calendario es visible cuando se cumple alguna condición:

- el usuario es Administrador;
- la visibilidad es company;
- la visibilidad es department y coincide el departamento;
- el usuario es propietario;
- el Supervisor pertenece al departamento del calendario;
- existe can_view.

Los calendarios archivados solo permanecen visibles para Administradores.

### 8.2 Reglas de escritura

| Rol o condición | Crear entradas | Editar/cancelar entradas |
|---|---|---|
| Administrador | En calendarios activos | Cualquier entrada visible |
| Supervisor del departamento | Sí | Sí |
| Propietario del calendario | Sí | Según propiedad/permisos calculados |
| Empleado con ACL | Según can_create | Según can_edit/can_delete |
| Empleado creador | No implica crear en otro calendario | Puede operar su entrada visible |
| Consulta | No | No |

La API devuelve capacidades calculadas junto con calendarios y entradas para que la interfaz represente las acciones permitidas.

## 9. Flujos principales

### 9.1 Crear y gobernar un calendario

1. Un Administrador crea el calendario.
2. Define nombre, color, departamento y visibilidad.
3. El servidor asigna como propietario al Administrador creador.
4. Se configuran permisos explícitos por usuario.
5. La operación queda registrada en audit_logs.
6. El calendario aparece en la agenda de cada usuario cuyo alcance lo permita.

Archivar usa borrado lógico mediante status = archived.

### 9.2 Construir la agenda consolidada

1. El usuario se autentica.
2. accessibleCalendarIds() calcula su conjunto de calendarios.
3. /api/events limita la consulta a esos identificadores.
4. Opcionalmente aplica rango, calendario, estado, responsable, búsqueda o preset.
5. Cada resultado incluye calendario, color y capacidades.
6. El frontend proyecta el mismo contenido en vista mensual, semanal, diaria o tabla.

La agenda consolidada es una proyección de varios calendarios; no es un calendario adicional persistido.

### 9.3 Agregar una entrada

1. El usuario selecciona un calendario con canCreate.
2. El backend valida datos, fechas, recurso y recurrencia.
3. Se revisan conflictos de responsable, ubicación o recurso.
4. La advertencia de conflicto no bloquea la operación.
5. Se guarda la entrada o toda la serie dentro de una transacción.
6. Se crea el recordatorio si corresponde.
7. Se registra auditoría.
8. Si se pidió Google, la entrada queda con sync_status = pending.

### 9.4 Sincronizar con Google

~~~mermaid
sequenceDiagram
    participant U as Usuario
    participant A as Gestor
    participant D as SQLite
    participant G as Google Calendar

    U->>A: Conectar cuenta
    A->>G: OAuth 2.0
    G-->>A: Access + refresh token
    A->>D: Guardar tokens cifrados
    U->>A: Sincronizar entrada
    A->>D: Leer calendario y entrada
    A->>G: Crear/actualizar/cancelar
    G-->>A: Identificador y fecha remota
    A->>D: Actualizar estado y sync log
~~~

La sincronización es de consistencia eventual: la escritura local y la llamada remota no forman una transacción distribuida.

### 9.5 Importar desde Google

1. El usuario elige un calendario interno donde puede crear.
2. El servicio toma google_calendar_id o usa primary.
3. La primera ejecución descarga el calendario remoto completo.
4. Las siguientes usan el syncToken guardado.
5. Las altas se crean dentro del calendario seleccionado.
6. Las modificaciones actualizan la entrada vinculada.
7. Las cancelaciones remotas cancelan la entrada local.
8. Cambios locales pending o error no son sobrescritos.
9. Un cursor HTTP 410 fuerza una nueva carga completa.

## 10. API

La respuesta normal usa:

~~~json
{ "success": true }
~~~

Los errores controlados usan:

~~~json
{ "success": false, "error": "Descripción" }
~~~

### 10.1 Sesión

| Método | Ruta |
|---|---|
| POST | /api/auth/login |
| GET | /api/auth/me |
| POST | /api/auth/logout |
| GET | /api/health |

### 10.2 Calendarios y permisos

| Método | Ruta | Uso |
|---|---|---|
| GET | /api/calendars | Calendarios activos accesibles |
| GET | /api/calendars/:id | Detalle y capacidades |
| POST | /api/calendars | Crear, solo Administrador |
| PUT | /api/calendars/:id | Editar, solo Administrador |
| DELETE | /api/calendars/:id | Archivar, solo Administrador |
| GET | /api/admin/calendars | Inventario administrativo |
| GET | /api/calendars/:id/permissions | Leer ACL |
| PUT | /api/calendars/:id/permissions | Reemplazar ACL |

### 10.3 Contenido de agenda

| Método | Ruta | Uso |
|---|---|---|
| GET | /api/events | Consultar la agenda accesible |
| GET | /api/events/:id | Consultar una entrada |
| POST | /api/events | Crear entrada o serie |
| PUT | /api/events/:id | Editar una entrada o alcance de serie |
| PATCH | /api/events/:id/status | Cambiar estado |
| DELETE | /api/events/:id | Cancelar lógicamente |
| POST | /api/events/check-conflicts | Evaluar solapamientos |
| GET | /api/event-types | Catálogo de tipos |
| GET | /api/resources | Recursos activos |

GET /api/events acepta start, end, calendarId, status, responsibleUserId, unassigned, q y preset.

### 10.4 Administración

| Grupo | Rutas |
|---|---|
| Usuarios | GET/POST /api/admin/users, PUT /api/admin/users/:id |
| Roles | GET /api/roles |
| Departamentos | GET /api/departments |
| Recursos | GET/POST /api/admin/resources, PUT/DELETE /api/admin/resources/:id |
| Configuración | GET/PUT /api/settings |

### 10.5 Integración

| Método | Ruta |
|---|---|
| GET/PUT/DELETE | /api/integrations/google/config |
| GET | /api/integrations/google/status |
| POST | /api/integrations/google/connect |
| GET | /api/integrations/google/callback |
| DELETE | /api/integrations/google |
| POST | /api/events/:id/sync |
| POST | /api/sync/import |
| POST | /api/sync/retry |
| GET | /api/sync/status |

### 10.6 Notificaciones y reportes

| Grupo | Rutas |
|---|---|
| Notificaciones | GET/DELETE /api/notifications |
| Operación individual | PATCH /api/notifications/:id/read, DELETE /api/notifications/:id |
| Lectura masiva | POST /api/notifications/read-all |
| Prueba | POST /api/developer/notifications/test |
| Reporte | GET /api/reports/operations |
| Dashboard | GET /api/dashboard/summary |

## 11. Google Calendar

### 11.1 Configuración

Las credenciales pueden provenir de:

1. integration_provider_settings, configurada por un Administrador;
2. variables GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET y GOOGLE_REDIRECT_URI.

La configuración de base de datos tiene prioridad. El Client Secret se cifra y no se devuelve al frontend.

### 11.2 OAuth

Scopes solicitados:

~~~text
openid
email
https://www.googleapis.com/auth/calendar.events
~~~

El proveedor solicita acceso offline y fuerza consentimiento para obtener refresh token. El state vive diez minutos en memoria y se asocia al usuario.

### 11.3 Cifrado

Access token, refresh token y Client Secret se cifran con AES-256-GCM:

- clave derivada con scrypt;
- IV aleatorio de 12 bytes;
- etiqueta de autenticación;
- serialización Base64URL.

Cambiar INTEGRATION_ENCRYPTION_KEY impide descifrar credenciales existentes.

### 11.4 Estado real de la integración

El esquema permite google_calendar_id y sync_enabled por calendario. Sin embargo, la administración actual no expone la edición del identificador remoto ni utiliza sync_enabled para ejecutar un job automático.

En la implementación actual:

- el calendario remoto predeterminado es primary;
- el usuario inicia la importación manualmente;
- el envío ocurre con “Sincronizar ahora” o mediante reintento;
- marcar una entrada para Google establece pending, pero no ejecuta inmediatamente una cola externa;
- cada conexión de Google pertenece al usuario, no globalmente al calendario.

Estas condiciones son importantes para no interpretar la integración actual como sincronización continua por calendario.

## 12. Recordatorios y canales externos

Un scheduler local se ejecuta al iniciar y cada 30 segundos.

El flujo es:

1. localizar recordatorios pendientes cuyo momento ya venció;
2. crear una notificación interna;
3. marcar el recordatorio como enviado;
4. registrar entregas externas pendientes;
5. enviar JSON a webhooks habilitados;
6. conservar estado, código HTTP y error.

Canales:

- centro interno;
- notificación local del navegador;
- webhook de correo;
- webhook de WhatsApp.

El Service Worker solo apoya notificaciones mientras la aplicación está abierta. No existe Web Push remoto con VAPID.

## 13. Frontend

La SPA no requiere build.

| Archivo | Responsabilidad |
|---|---|
| public/index.html | Vistas, formularios, diálogos e iconos |
| public/app.js | Estado, navegación, llamadas y acciones |
| public/theme.css | Tokens visuales |
| public/styles.css | Layout y componentes |
| public/js/services/api.service.js | Cliente HTTP |
| public/js/core/formatters.js | Escape y fechas |
| public/js/components/* | Renderizadores de vistas |
| public/sw.js | Clic en notificaciones del sistema |

La interfaz ofrece panel consolidado, calendario mensual/semanal/diario, tabla de entradas, reportes, administración de calendarios y usuarios, configuración e integraciones.

La selección visual de un calendario es un filtro de la agenda; el backend sigue aplicando el alcance autorizado completo.

## 14. Configuración de entorno

~~~env
PORT=3000
NODE_ENV=development
DATABASE_PATH=./data/calendar-manager.sqlite
SESSION_SECRET=change-this-secret
INTEGRATION_ENCRYPTION_KEY=change-this-encryption-key
DEFAULT_TIMEZONE=America/Santo_Domingo

INITIAL_ADMIN_NAME=Administrador
INITIAL_ADMIN_EMAIL=
INITIAL_ADMIN_PASSWORD=

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:3000/api/integrations/google/callback
~~~

NODE_ENV activa controles estrictos en producción. DATABASE_PATH y ambos secretos son obligatorios; cada secreto debe tener al menos 32 caracteres. SESSION_SECRET se utiliza para derivar el hash HMAC de los tokens de sesión e INTEGRATION_ENCRYPTION_KEY protege los secretos OAuth.

## 15. Autenticación y seguridad

### 15.1 Implementado

- contraseñas derivadas con scrypt y sal aleatoria;
- comparación con tiempo constante;
- tokens de sesión aleatorios de 32 bytes, almacenados únicamente como hash HMAC;
- sesiones y tokens CSRF persistidos en SQLite;
- cookie HttpOnly, SameSite=Lax y Secure en producción;
- sesión de ocho horas;
- rate limiting del login por IP y correo;
- validación global de origen y token CSRF para mutaciones;
- CSP, HSTS, anti-framing, no-sniff y política de permisos;
- consultas preparadas;
- límite JSON de 1 MB;
- x-powered-by desactivado;
- secretos OAuth cifrados;
- autorización en servidor;
- auditoría de operaciones sensibles;
- estados OAuth de un solo uso persistidos en SQLite.

### 15.2 Restricciones

- Varias instancias siguen sin ser viables porque SQLite y el scheduler local no están coordinados entre procesos.
- El rate limiting vive en memoria y debe migrarse a un almacén compartido antes de escalar horizontalmente.
- En desarrollo existen secretos de fallback; producción los rechaza durante el arranque.
- Los webhooks no implementan política avanzada de reintentos ni firma de payload.

## 16. Reportes

GET /api/reports/operations agrega únicamente entradas pertenecientes a calendarios accesibles.

Calcula:

- total;
- completadas;
- vencidas;
- canceladas;
- porcentaje de cumplimiento;
- horas programadas por responsable;
- distribución y cumplimiento por calendario.

La capacidad se calcula con días laborables de lunes a viernes y la jornada global. No considera feriados, ausencias ni calendarios laborales específicos.

## 17. Pruebas

Ejecución:

~~~powershell
npm test
~~~

La suite contiene 27 pruebas y cubre permisos por calendario, roles, validación de entradas, configuración, recordatorios, recurrencia, capacidad laboral, cifrado, OAuth, mapeo Google, paginación y cursor incremental.

No existen pruebas E2E, pruebas completas de rutas HTTP ni pruebas de concurrencia.

## 18. Ejecución local

~~~powershell
npm install
Copy-Item .env.example .env
npm run dev
~~~

Producción del MVP:

~~~powershell
npm start
~~~

La aplicación se publica en http://localhost:3000 salvo que se cambie PORT.

En desarrollo, una base nueva crea cuentas demo con contraseña Demo123!. En producción esas cuentas no existen: `INITIAL_ADMIN_EMAIL` y `INITIAL_ADMIN_PASSWORD` son obligatorios al inicializar una base vacía.

## 19. Operación y respaldo

El activo persistente principal es el archivo definido por DATABASE_PATH.

SQLite usa WAL. Para un respaldo consistente se debe detener el proceso antes de copiar o usar un mecanismo de backup compatible con SQLite. También debe conservarse INTEGRATION_ENCRYPTION_KEY.

La aplicación registra:

- errores generales en consola;
- cambios de dominio en audit_logs;
- operaciones externas en sync_logs;
- último estado incremental en integration_sync_states.

No dispone de métricas, trazas, logging estructurado ni interfaz de auditoría.

## 20. Limitaciones y próximos pasos técnicos

Prioridades antes de escalar el producto:

1. Hacer editable la asociación entre calendario interno y calendario remoto.
2. Definir el significado operativo de sync_enabled.
3. Decidir si la sincronización será manual, programada o dirigida por webhooks.
4. Externalizar sesiones, estados OAuth y rate limiting para múltiples instancias.
5. Convertir el scheduler local en un worker con coordinación.
6. Incorporar migraciones versionadas.
7. Migrar a PostgreSQL cuando la concurrencia supere el uso de una sola instancia.
8. Mantener y auditar CSRF, cookie Secure, rate limiting y cabeceras de seguridad.
9. Añadir participantes, invitaciones y confirmación de asistencia.
10. Crear pruebas HTTP y E2E centradas en aislamiento entre calendarios.
11. Exponer auditoría con filtros por calendario, usuario y operación.
12. Añadir una política de resolución de conflictos de sincronización.

## 21. Criterios de integridad del producto

Cualquier cambio futuro debe conservar estas reglas:

- toda entrada pertenece a un calendario;
- ninguna consulta puede escapar del conjunto de calendarios accesibles;
- las capacidades se calculan en el servidor;
- archivar un calendario no debe borrar su historial;
- la vista consolidada es una proyección, no una copia de datos;
- una integración externa no debe reemplazar permisos ni responsables internos;
- los secretos nunca deben formar parte de una respuesta;
- los fallos externos deben quedar reintentables y observables;
- las operaciones masivas deben ejecutarse dentro de transacciones locales.

---

Última revisión contra el código: 2026-07-21.
