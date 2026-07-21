# Design.md — Gestor Central de Calendarios Empresariales

## 1. Descripción general

El sistema será una aplicación web interna para centralizar los calendarios de la empresa.

Su función principal será permitir que la empresa pueda:

- Crear calendarios por departamento o función.
- Registrar eventos empresariales.
- Asignar responsables.
- Relacionar eventos con clientes, reservas, pagos o tareas.
- Visualizar todos los eventos desde un único panel.
- Sincronizar determinados eventos con Google Calendar.
- Detectar conflictos, vencimientos y eventos sin responsable.

El sistema no busca reemplazar completamente Google Calendar. Funcionará como una capa administrativa que organiza la información empresarial y utiliza Google Calendar para sincronización, recordatorios y acceso desde dispositivos móviles.

---

# 2. Objetivo del prototipo

Construir un MVP funcional que permita:

1. Crear calendarios internos.
2. Crear, editar y eliminar eventos.
3. Asignar responsables.
4. Clasificar eventos.
5. Filtrar eventos.
6. Visualizar eventos en calendario y lista.
7. Sincronizar eventos seleccionados con Google Calendar.
8. Mostrar alertas básicas.

---

# 3. Alcance del MVP

## Incluido

- Inicio de sesión básico.
- Gestión de usuarios.
- Gestión de calendarios.
- Gestión de eventos.
- Responsables y participantes.
- Tipos de eventos.
- Vista mensual, semanal y diaria.
- Vista general de eventos próximos.
- Filtros por calendario, tipo, responsable y estado.
- Sincronización básica con Google Calendar.
- Registro de cambios.
- Alertas de eventos próximos y vencidos.

## Fuera del alcance inicial

- Aplicación móvil.
- Chat interno.
- Videollamadas.
- Gestión completa de tareas.
- Nómina y control de asistencia.
- Automatizaciones complejas.
- Inteligencia artificial.
- Sincronización con Outlook.
- Gestión documental avanzada.
- Facturación.

---

# 4. Usuarios del sistema

## Administrador

Puede:

- Crear y editar usuarios.
- Crear calendarios.
- Asignar permisos.
- Ver todos los eventos.
- Configurar integraciones.
- Consultar registros de cambios.

## Supervisor

Puede:

- Ver calendarios de su departamento.
- Crear y editar eventos.
- Asignar responsables.
- Ver conflictos y eventos pendientes.
- Aprobar determinados eventos.

## Empleado

Puede:

- Ver calendarios autorizados.
- Crear eventos si tiene permiso.
- Editar eventos propios.
- Confirmar participación.
- Marcar eventos como completados.

## Usuario de consulta

Puede:

- Ver determinados calendarios.
- Consultar eventos.
- No puede crear ni modificar información.

---

# 5. Tipos de calendarios

El sistema permitirá crear calendarios configurables.

Ejemplos iniciales:

- Dirección.
- Operaciones.
- Reservas y viajes.
- Ventas.
- Pagos y vencimientos.
- Marketing.
- Reuniones.
- Recursos humanos.
- Mantenimiento.
- Actividades externas.

Cada calendario tendrá:

- Nombre.
- Descripción.
- Color identificador.
- Departamento.
- Propietario.
- Visibilidad.
- Estado.
- Integración con Google Calendar.
- Lista de usuarios autorizados.

---

# 6. Tipos de eventos

Ejemplos:

- Reserva.
- Viaje.
- Reunión.
- Pago.
- Vencimiento.
- Seguimiento comercial.
- Publicación de marketing.
- Actividad de cliente.
- Entrega de documento.
- Mantenimiento.
- Capacitación.
- Evento interno.

Los tipos serán configurables desde la aplicación.

---

# 7. Información de un evento

Cada evento tendrá los siguientes campos:

## Información principal

- Título.
- Descripción.
- Fecha de inicio.
- Hora de inicio.
- Fecha de finalización.
- Hora de finalización.
- Evento de día completo.
- Zona horaria.

## Clasificación

- Calendario.
- Tipo de evento.
- Departamento.
- Prioridad.
- Estado.

## Responsabilidad

- Responsable principal.
- Participantes.
- Creador del evento.
- Supervisor.

## Relaciones empresariales

- Cliente relacionado.
- Reserva relacionada.
- Servicio relacionado.
- Pago relacionado.
- Proyecto relacionado.
- Proveedor relacionado.

## Control

- Recordatorios.
- Evento recurrente.
- Ubicación.
- Enlace virtual.
- Notas.
- Archivos adjuntos.
- Estado de sincronización.
- Identificador de Google Calendar.

---

# 8. Estados de los eventos

Estados iniciales:

- Borrador.
- Pendiente.
- Confirmado.
- En proceso.
- Completado.
- Cancelado.
- Vencido.

Reglas generales:

- Un evento vencido no completado cambia automáticamente a `Vencido`.
- Un evento cancelado no genera recordatorios.
- Un evento completado permanece visible en el historial.
- Los eventos en borrador no se sincronizan con Google Calendar.

---

# 9. Prioridades

- Baja.
- Normal.
- Alta.
- Urgente.

La prioridad no modifica automáticamente las fechas. Se utiliza para filtros, alertas y organización visual.

---

# 10. Flujo principal

```text
Usuario crea evento
        ↓
Sistema valida los datos
        ↓
Sistema verifica permisos
        ↓
Sistema revisa conflictos
        ↓
Evento se guarda en la base de datos
        ↓
Se asignan responsables y participantes
        ↓
Si la sincronización está activa:
        ↓
Se crea o actualiza el evento en Google Calendar
        ↓
El sistema guarda el identificador externo
        ↓
El evento aparece en el panel general
```

---

# 11. Flujo de sincronización con Google Calendar

## Creación

1. El usuario crea un evento interno.
2. El sistema guarda el evento.
3. El sistema envía el evento a Google Calendar.
4. Google devuelve un identificador externo.
5. El sistema guarda ese identificador.

## Actualización

1. El usuario modifica el evento.
2. El sistema actualiza la base de datos.
3. El sistema utiliza el identificador externo.
4. El evento correspondiente se actualiza en Google Calendar.

## Eliminación

1. El usuario cancela o elimina el evento.
2. El sistema actualiza su estado.
3. Si existe sincronización, se elimina o cancela el evento externo.

## Error de sincronización

Si Google Calendar no responde:

- El evento interno se mantiene.
- El estado de sincronización cambia a `Error`.
- El sistema permite reintentar.
- El error queda registrado.

---

# 12. Regla de fuente principal

La base de datos interna será la fuente principal de información.

Google Calendar será un sistema externo de apoyo.

```text
Base de datos interna
        ↓
Fuente principal
        ↓
Google Calendar
        ↓
Copia sincronizada
```

Esto evita que la lógica empresarial dependa completamente de Google Calendar.

---

# 13. Reglas de negocio

## Creación de eventos

- El título es obligatorio.
- La fecha de inicio es obligatoria.
- La fecha final no puede ser anterior a la inicial.
- Todo evento debe pertenecer a un calendario.
- Todo evento debe tener un creador.
- Algunos tipos de eventos requieren responsable.

## Permisos

- Un usuario solo puede ver calendarios autorizados.
- Un usuario solo puede modificar eventos propios o autorizados.
- Un supervisor puede modificar eventos de su departamento.
- El administrador puede modificar todos los eventos.

## Conflictos

El sistema debe advertir cuando:

- Un responsable tiene dos eventos simultáneos.
- Un recurso está reservado para dos eventos.
- Una ubicación está ocupada.
- Una reserva tiene eventos incompatibles.

En el MVP, los conflictos serán advertencias y no bloqueos obligatorios.

## Eventos recurrentes

El MVP permitirá:

- Repetición diaria.
- Repetición semanal.
- Repetición mensual.
- Fecha de finalización.
- Número máximo de repeticiones.

## Vencimientos

Un proceso automático revisará eventos pendientes.

```text
Fecha actual > fecha final
y estado != Completado
y estado != Cancelado
→ estado = Vencido
```

---

# 14. Pantallas del sistema

## 14.1 Inicio de sesión

Elementos:

- Correo.
- Contraseña.
- Botón de acceso.
- Mensaje de error.

## 14.2 Dashboard

Mostrar:

- Eventos de hoy.
- Próximos eventos.
- Eventos vencidos.
- Eventos sin responsable.
- Conflictos detectados.
- Eventos por departamento.
- Estado de sincronización.

## 14.3 Calendario general

Funciones:

- Vista mensual.
- Vista semanal.
- Vista diaria.
- Arrastrar eventos.
- Cambiar duración.
- Abrir detalle.
- Crear evento desde una fecha.
- Filtrar calendarios.

## 14.4 Lista de eventos

Columnas:

- Fecha.
- Hora.
- Título.
- Tipo.
- Calendario.
- Responsable.
- Estado.
- Prioridad.
- Sincronización.
- Acciones.

## 14.5 Formulario de evento

Secciones:

1. Información general.
2. Fecha y hora.
3. Clasificación.
4. Responsables.
5. Relaciones empresariales.
6. Recordatorios.
7. Sincronización.
8. Notas.

## 14.6 Gestión de calendarios

Funciones:

- Crear calendario.
- Editar calendario.
- Archivar calendario.
- Definir color.
- Asignar usuarios.
- Configurar Google Calendar.

## 14.7 Gestión de usuarios

Funciones:

- Crear usuario.
- Asignar rol.
- Asignar departamento.
- Definir calendarios autorizados.
- Activar o desactivar usuario.

## 14.8 Configuración

Secciones:

- Tipos de eventos.
- Estados.
- Prioridades.
- Departamentos.
- Integración con Google.
- Registro de actividad.

---

# 15. Modelo de datos

## Tabla: users

```text
id
name
email
password_hash
role_id
department_id
status
created_at
updated_at
```

## Tabla: roles

```text
id
name
description
```

## Tabla: departments

```text
id
name
description
status
```

## Tabla: calendars

```text
id
name
description
color
department_id
owner_user_id
visibility
google_calendar_id
sync_enabled
status
created_at
updated_at
```

## Tabla: calendar_permissions

```text
id
calendar_id
user_id
can_view
can_create
can_edit
can_delete
```

## Tabla: event_types

```text
id
name
description
color
requires_responsible
status
```

## Tabla: events

```text
id
calendar_id
event_type_id
title
description
start_datetime
end_datetime
all_day
timezone
priority
status
location
virtual_link
responsible_user_id
supervisor_user_id
created_by
google_event_id
sync_status
recurrence_rule
created_at
updated_at
deleted_at
```

## Tabla: event_participants

```text
id
event_id
user_id
participation_status
```

## Tabla: event_reminders

```text
id
event_id
reminder_type
minutes_before
status
```

## Tabla: event_relations

```text
id
event_id
entity_type
entity_id
```

Ejemplos de `entity_type`:

- client
- reservation
- payment
- supplier
- service
- project

## Tabla: event_conflicts

```text
id
event_id
conflicting_event_id
conflict_type
status
created_at
```

## Tabla: integrations

```text
id
provider
account_email
access_token_encrypted
refresh_token_encrypted
expires_at
status
created_at
updated_at
```

## Tabla: audit_logs

```text
id
user_id
action
entity_type
entity_id
old_values
new_values
created_at
```

---

# 16. Arquitectura técnica

## Backend

- Node.js.
- Express.js.
- SQLite para el prototipo.
- PostgreSQL para producción.
- JWT o sesiones para autenticación.
- Google Calendar API.
- Servicio programado para vencimientos y sincronización.

## Frontend

Para el prototipo:

- HTML.
- CSS.
- JavaScript.
- FullCalendar para la vista de calendario.

Alternativa posterior:

- React.
- Vue.
- TypeScript.

## Base de datos

### MVP

SQLite.

Ventajas:

- Instalación simple.
- Archivo local.
- Adecuado para pruebas.
- Fácil de respaldar.
- No requiere servidor separado.

### Producción

PostgreSQL.

Se recomienda migrar cuando existan:

- Varios usuarios simultáneos.
- Acceso remoto.
- Mayor volumen de eventos.
- Necesidad de alta disponibilidad.

---

# 17. Estructura del proyecto

```text
calendar-manager/
│
├── src/
│   ├── config/
│   │   ├── database.js
│   │   ├── environment.js
│   │   └── google.js
│   │
│   ├── controllers/
│   │   ├── auth.controller.js
│   │   ├── calendars.controller.js
│   │   ├── events.controller.js
│   │   ├── users.controller.js
│   │   └── sync.controller.js
│   │
│   ├── services/
│   │   ├── auth.service.js
│   │   ├── calendar.service.js
│   │   ├── event.service.js
│   │   ├── conflict.service.js
│   │   ├── reminder.service.js
│   │   ├── google-calendar.service.js
│   │   └── audit.service.js
│   │
│   ├── repositories/
│   │   ├── calendar.repository.js
│   │   ├── event.repository.js
│   │   ├── user.repository.js
│   │   └── integration.repository.js
│   │
│   ├── routes/
│   │   ├── auth.routes.js
│   │   ├── calendars.routes.js
│   │   ├── events.routes.js
│   │   ├── users.routes.js
│   │   └── sync.routes.js
│   │
│   ├── middleware/
│   │   ├── auth.middleware.js
│   │   ├── permissions.middleware.js
│   │   ├── validation.middleware.js
│   │   └── error.middleware.js
│   │
│   ├── jobs/
│   │   ├── mark-overdue-events.job.js
│   │   ├── sync-events.job.js
│   │   └── reminders.job.js
│   │
│   ├── database/
│   │   ├── migrations/
│   │   ├── seeds/
│   │   └── database.sqlite
│   │
│   ├── app.js
│   └── server.js
│
├── public/
│   ├── css/
│   ├── js/
│   ├── images/
│   ├── index.html
│   ├── calendar.html
│   ├── events.html
│   └── settings.html
│
├── tests/
│
├── .env
├── .env.example
├── package.json
├── README.md
└── design.md
```

---

# 18. Separación de responsabilidades

## Rutas

Reciben solicitudes HTTP y dirigen la petición al controlador.

## Controladores

Interpretan la solicitud y devuelven la respuesta.

## Servicios

Contienen la lógica de negocio.

Ejemplos:

- Validar fechas.
- Detectar conflictos.
- Verificar permisos.
- Marcar vencimientos.
- Sincronizar con Google Calendar.

## Repositorios

Se comunican directamente con la base de datos.

## Jobs

Ejecutan procesos automáticos programados.

---

# 19. API inicial

## Autenticación

```text
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/me
```

## Calendarios

```text
GET    /api/calendars
GET    /api/calendars/:id
POST   /api/calendars
PUT    /api/calendars/:id
DELETE /api/calendars/:id
```

## Eventos

```text
GET    /api/events
GET    /api/events/:id
POST   /api/events
PUT    /api/events/:id
DELETE /api/events/:id
PATCH  /api/events/:id/status
```

## Participantes

```text
POST   /api/events/:id/participants
DELETE /api/events/:id/participants/:userId
PATCH  /api/events/:id/participants/:userId
```

## Sincronización

```text
POST /api/integrations/google/connect
GET  /api/integrations/google/callback
POST /api/events/:id/sync
POST /api/sync/retry
GET  /api/sync/status
```

## Dashboard

```text
GET /api/dashboard/summary
GET /api/dashboard/upcoming
GET /api/dashboard/overdue
GET /api/dashboard/conflicts
```

---

# 20. Ejemplo de creación de evento

## Solicitud

```json
{
  "calendarId": 2,
  "eventTypeId": 1,
  "title": "Seguimiento de reserva",
  "description": "Confirmar documentos y pago pendiente",
  "startDatetime": "2026-07-25T10:00:00",
  "endDatetime": "2026-07-25T10:30:00",
  "priority": "high",
  "status": "confirmed",
  "responsibleUserId": 4,
  "participants": [5, 7],
  "syncWithGoogle": true,
  "relations": [
    {
      "entityType": "reservation",
      "entityId": 125
    }
  ]
}
```

## Respuesta

```json
{
  "success": true,
  "event": {
    "id": 348,
    "title": "Seguimiento de reserva",
    "syncStatus": "synced",
    "googleEventId": "google-event-id"
  }
}
```

---

# 21. Detección de conflictos

El servicio de conflictos consultará eventos que:

- Tengan el mismo responsable.
- No estén cancelados.
- Coincidan parcialmente en fecha y hora.

Condición básica:

```text
nuevo_inicio < evento_existente_fin
y
nuevo_fin > evento_existente_inicio
```

Si se cumple, existe superposición.

El sistema devolverá:

```json
{
  "hasConflict": true,
  "conflicts": [
    {
      "eventId": 80,
      "title": "Reunión de operaciones",
      "startDatetime": "2026-07-25T09:30:00",
      "endDatetime": "2026-07-25T10:30:00"
    }
  ]
}
```

---

# 22. Seguridad

## Requisitos mínimos

- Contraseñas almacenadas con hash.
- Validación de entradas.
- Protección contra inyección SQL.
- Control de permisos por ruta.
- Tokens de Google cifrados.
- Variables sensibles en `.env`.
- Registro de acciones críticas.
- Cierre de sesión.
- Tiempo de expiración de sesión.

## Datos que no deben exponerse al frontend

- Contraseñas.
- Refresh tokens.
- Access tokens.
- Credenciales de Google.
- Variables del servidor.
- Registros internos completos.

---

# 23. Variables de entorno

```env
PORT=3000
NODE_ENV=development

DATABASE_PATH=./src/database/database.sqlite

SESSION_SECRET=change-this-secret

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:3000/api/integrations/google/callback

DEFAULT_TIMEZONE=America/Santo_Domingo
```

---

# 24. Datos de prueba

El prototipo debe incluir:

## Usuarios

- Administrador.
- Supervisor de operaciones.
- Agente de reservas.
- Encargado de ventas.

## Calendarios

- Operaciones.
- Reservas.
- Pagos.
- Marketing.
- Reuniones.

## Eventos

- Seguimiento de reserva.
- Pago pendiente.
- Reunión operativa.
- Publicación de campaña.
- Entrega de documentos.

---

# 25. Fases de desarrollo

## Fase 1 — Base del sistema

- Configurar proyecto Node.js.
- Crear servidor Express.
- Configurar SQLite.
- Crear migraciones.
- Crear autenticación.
- Crear usuarios y roles.

## Fase 2 — Calendarios

- Crear calendarios.
- Editar calendarios.
- Asignar permisos.
- Mostrar calendarios autorizados.

## Fase 3 — Eventos

- Crear eventos.
- Editar eventos.
- Eliminar o cancelar eventos.
- Asignar responsables.
- Agregar participantes.
- Aplicar filtros.

## Fase 4 — Interfaz

- Dashboard.
- Vista de calendario.
- Vista de lista.
- Formulario de eventos.
- Gestión de calendarios.

## Fase 5 — Lógica empresarial

- Estados.
- Prioridades.
- Vencimientos.
- Conflictos.
- Eventos recurrentes.
- Registro de actividad.

## Fase 6 — Google Calendar

- Autenticación OAuth.
- Crear evento externo.
- Actualizar evento externo.
- Cancelar evento externo.
- Reintentar errores.

---

# 26. Criterios de aceptación del MVP

El prototipo se considera funcional cuando:

- Un usuario puede iniciar sesión.
- El administrador puede crear calendarios.
- Se pueden asignar permisos.
- Un usuario puede crear un evento.
- El evento aparece en la vista de calendario.
- El evento puede editarse.
- El evento puede cancelarse.
- Se puede asignar un responsable.
- Se pueden filtrar eventos.
- El sistema detecta conflictos básicos.
- El sistema identifica eventos vencidos.
- Un evento puede sincronizarse con Google Calendar.
- Los errores de sincronización quedan registrados.

---

# 27. Mejoras futuras

- Integración con Outlook.
- Aplicación móvil.
- Integración con reservas.
- Integración con pagos.
- Integración con tareas.
- IA para sugerir horarios.
- Creación de eventos desde formularios.
- Creación de eventos desde correos.
- Automatización desde publicaciones de Instagram.
- Calendarios públicos para clientes.

Ya incorporado después del alcance inicial: sincronización bidireccional con Google, recursos y salas, eventos recurrentes, avisos por webhook de correo y WhatsApp, push local, reportes de cumplimiento y panel de carga laboral.

---

# 28. Decisión principal del diseño

El gestor debe centralizar la lógica empresarial, mientras Google Calendar se utiliza como herramienta externa de sincronización y notificación.

```text
Procesos empresariales
        ↓
Gestor central
        ↓
Base de datos propia
        ↓
Google Calendar
```

Esta estructura permite que el sistema pueda crecer e integrarse posteriormente con reservas, pagos, ventas, clientes y operaciones sin depender completamente de una plataforma externa.
