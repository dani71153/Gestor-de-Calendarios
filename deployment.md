# Deployment — Gestor Central de Calendarios

## 1. Objetivo

Este documento define una ruta de despliegue para publicar el Gestor Central de Calendarios en internet de forma progresiva.

La implementación actual utiliza:

- Node.js y Express;
- SQLite;
- sesiones y estados OAuth persistidos en SQLite;
- un scheduler ejecutado dentro del servidor;
- OAuth 2.0 con Google Calendar;
- archivos estáticos servidos por el mismo proceso.

Estas características obligan a ejecutar inicialmente una sola instancia con almacenamiento persistente. La aplicación no debe desplegarse como un frontend estático ni como funciones serverless independientes.

## 2. Estrategia recomendada

Se proponen dos etapas:

1. **Piloto controlado:** una instancia de Node.js y SQLite sobre un disco persistente.
2. **Producción escalable:** PostgreSQL, sesiones compartidas y procesos de background separados.

## 3. Arquitectura del piloto

~~~mermaid
flowchart TD
    User[Usuarios] -->|HTTPS| Domain[Dominio público]
    Domain --> Service[Render Web Service]
    Service --> Node[Node.js + Express]
    Node --> Static[SPA estática]
    Node --> Scheduler[Scheduler local]
    Node --> Disk[Disco persistente]
    Disk --> SQLite[(SQLite)]
    Node --> Google[Google Calendar API]
    Scheduler --> Webhooks[Webhooks externos]
~~~

### 3.1 Plataforma sugerida

La opción principal es **Render Web Service** con una instancia pagada y un disco persistente.

Render permite:

- desplegar directamente desde Git;
- ejecutar Node.js y Express;
- configurar variables y secretos;
- asociar un dominio;
- emitir y renovar certificados TLS;
- configurar un health check;
- adjuntar almacenamiento persistente;
- crear snapshots diarios del disco.

Un disco persistente solo puede conectarse a una instancia. Esta restricción coincide con la arquitectura actual, que tampoco soporta varias instancias debido a SQLite y al scheduler local.

Referencias:

- [Render Web Services](https://render.com/docs/web-services)
- [Render Persistent Disks](https://render.com/docs/disks)
- [Render Custom Domains](https://render.com/docs/custom-domains)
- [Render TLS](https://render.com/docs/tls)

## 4. Configuración de Render

### 4.1 Servicio web

| Propiedad | Valor recomendado |
|---|---|
| Runtime | Node |
| Branch | main |
| Build command | npm ci |
| Start command | npm start |
| Health check | /api/health |
| Auto deploy | Activado para main |
| Número de instancias | 1 |
| Región | La más cercana a los usuarios |

La aplicación ya utiliza la variable PORT entregada por la plataforma.

### 4.2 Versión de Node.js

El proyecto requiere Node.js 24 o superior debido al uso de node:sqlite.

Se recomienda cambiar el rango de package.json a:

~~~json
{
  "engines": {
    "node": ">=24 <25"
  }
}
~~~

Otra alternativa es definir NODE_VERSION con una versión 24 concreta.

Los rangos sin límite superior pueden seleccionar automáticamente una futura versión mayor incompatible. Véase [Setting Your Node.js Version](https://render.com/docs/node-version).

### 4.3 Disco persistente

Montar el disco en:

~~~text
/opt/render/project/src/data
~~~

Configurar:

~~~env
DATABASE_PATH=/opt/render/project/src/data/calendar-manager.sqlite
~~~

Solo los archivos guardados bajo el punto de montaje sobreviven reinicios y despliegues.

No debe utilizarse el filesystem efímero para SQLite.

### 4.4 Variables

~~~env
NODE_ENV=production
DATABASE_PATH=/opt/render/project/src/data/calendar-manager.sqlite
SESSION_SECRET=<secreto-aleatorio-largo>
INTEGRATION_ENCRYPTION_KEY=<secreto-aleatorio-independiente>
DEFAULT_TIMEZONE=America/Santo_Domingo

INITIAL_ADMIN_NAME=Administrador
INITIAL_ADMIN_EMAIL=admin@example.com
INITIAL_ADMIN_PASSWORD=<contraseña-inicial-de-al-menos-12-caracteres>

GOOGLE_CLIENT_ID=<client-id>
GOOGLE_CLIENT_SECRET=<client-secret>
GOOGLE_REDIRECT_URI=https://calendario.example.com/api/integrations/google/callback
~~~

PORT debe ser administrado por Render.

SESSION_SECRET e INTEGRATION_ENCRYPTION_KEY deben ser diferentes, aleatorios y almacenados como secretos de la plataforma.

La clave de integración debe conservarse junto con los respaldos. Si se pierde o cambia, los tokens y Client Secrets guardados dejan de ser descifrables.

Después del primer arranque exitoso, inicia sesión, cambia la contraseña del Administrador y elimina INITIAL_ADMIN_PASSWORD de la plataforma. Una base existente no vuelve a ejecutar el bootstrap; una base vacía sin esa variable se negará a iniciar.

## 5. Controles de publicación

Los controles 5.1 a 5.9 ya están implementados en el código. La configuración de infraestructura, los secretos reales y la política de webhooks continúan siendo responsabilidad del despliegue.

### 5.1 Eliminar credenciales demo

Una base nueva solo crea usuarios demo en desarrollo.

En producción el código ahora:

- desactiva el seed demo;
- exige INITIAL_ADMIN_EMAIL e INITIAL_ADMIN_PASSWORD si la base está vacía;
- crea un único Administrador inicial;
- exige al menos 12 caracteres para su contraseña;
- no crea calendarios, eventos ni recursos de demostración;
- bloquea el arranque si detecta cuentas demo activas con la contraseña conocida.

En una base ya existente se deben eliminar o desactivar manualmente las cuentas demo antes de publicar.

### 5.2 Rechazar secretos predeterminados

En producción el servidor se niega a iniciar cuando:

- SESSION_SECRET no esté definido;
- INTEGRATION_ENCRYPTION_KEY no esté definido;
- una clave siga usando el valor de desarrollo;
- DATABASE_PATH no se haya definido explícitamente.

### 5.3 Confiar en el proxy

Render termina HTTPS antes de enviar la solicitud al proceso Node.

Express incluye:

~~~js
app.set('trust proxy', 1);
~~~

Esto también es necesario para que requireSameOrigin() interprete correctamente req.protocol. Sin esta configuración, una solicitud originada en HTTPS puede compararse contra un origen HTTP interno y producir un 403 incorrecto.

### 5.4 Cookie de sesión

La cookie de producción incluye:

~~~text
HttpOnly
Secure
SameSite=Lax
Path=/
Max-Age=28800
~~~

Secure debe activarse solamente sobre HTTPS, que será obligatorio en producción.

### 5.5 Protección CSRF

La validación de origen y el token CSRF se aplican globalmente a todas las operaciones que modifican estado:

- POST;
- PUT;
- PATCH;
- DELETE.

La implementación combina:

- validación Origin y Sec-Fetch-Site;
- token CSRF;
- SameSite en cookies;
- rechazo de Content-Type no esperado.

### 5.6 Protección del login

El login incluye:

- rate limiting por IP y correo;
- bloqueo temporal después del límite;
- cabecera Retry-After;
- mensajes que no permitan enumerar usuarios.

### 5.7 Cabeceras HTTP

La aplicación configura:

- Content-Security-Policy;
- Strict-Transport-Security;
- X-Content-Type-Options;
- Referrer-Policy;
- protección contra framing.

También aplica Permissions-Policy, Cache-Control no-store a la API y Cross-Origin-Opener-Policy.

### 5.8 Sesiones

Las sesiones se almacenan en SQLite y el token de la cookie solo se conserva como hash HMAC.

Esto permite:

- conservar sesiones después de reinicios y despliegues;
- invalidarlas desde la base;
- asociar un token CSRF a cada sesión;
- limpiar sesiones expiradas durante el login.

Antes de escalar a varias instancias deben moverse a Redis/Valkey u otro almacén compartido.

### 5.9 Estados OAuth

Los estados OAuth se almacenan como hashes en SQLite durante diez minutos y se consumen una sola vez.

La implementación:

- conserva el flujo después de un reinicio;
- elimina estados expirados;
- valida usuario y vencimiento;
- elimina el estado al consumirlo.

Para múltiples instancias:

- almacenar estados OAuth en Redis/Valkey;
- asociarlos a usuario, sesión y fecha de expiración;
- consumirlos una única vez.

### 5.10 Webhooks

Los webhooks ya tienen timeout de diez segundos y restricción de protocolo HTTP/HTTPS en la configuración. Antes de habilitarlos públicamente todavía se recomienda incorporar:

- tamaño máximo de respuesta;
- restricción de protocolos a HTTPS;
- validación o allowlist de destinos;
- firma del payload;
- reintentos con backoff;
- límite de concurrencia;
- protección contra SSRF.

Hasta completar estos puntos, mantener deshabilitados los canales de correo y WhatsApp en producción o utilizar exclusivamente URLs controladas por la organización.

## 6. Google Calendar en producción

### 6.1 URI de redirección

Registrar exactamente:

~~~text
https://calendario.example.com/api/integrations/google/callback
~~~

Google exige HTTPS para redirect URIs públicas. Esquema, dominio, puerto, ruta y barra final deben coincidir exactamente.

Referencia: [OAuth 2.0 for Web Server Applications](https://developers.google.com/identity/protocols/oauth2/web-server).

### 6.2 Configuración de la aplicación

Preparar:

- proyecto de Google Cloud separado para producción;
- Google Calendar API activada;
- dominio verificado;
- nombre e identidad visual definitivos;
- correo de soporte;
- página de inicio;
- política de privacidad;
- términos de servicio, si aplica;
- justificación del uso de cada scope.

### 6.3 Audiencia

Si todos los usuarios pertenecen a una misma organización de Google Workspace o Cloud Identity, puede configurarse como aplicación Internal.

Si los usuarios pertenecen a cuentas o dominios distintos:

- utilizar External;
- mantener Testing durante el piloto;
- registrar expresamente los usuarios de prueba;
- solicitar verificación antes del lanzamiento general.

En Testing existe un máximo de 100 usuarios de prueba y las autorizaciones de usuarios de prueba caducan después de siete días.

Referencia: [Manage App Audience](https://support.google.com/cloud/answer/15549945).

### 6.4 Verificación

El acceso a eventos de Google Calendar puede considerarse sensible. Una aplicación externa pública probablemente deberá completar la verificación de scopes sensibles.

Google solicita, entre otros elementos:

- dominio verificado;
- política de privacidad;
- explicación del uso de los datos;
- video de demostración;
- credenciales o instrucciones para que el equipo revisor pruebe el flujo.

Debe reservarse tiempo para este proceso antes del lanzamiento.

Referencia: [Sensitive Scope Verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification).

## 7. Backups y recuperación

### 7.1 SQLite

No es suficiente copiar únicamente calendar-manager.sqlite mientras el proceso está escribiendo, porque SQLite utiliza WAL.

Se recomienda:

1. utilizar los snapshots del disco de la plataforma;
2. ejecutar una copia consistente mediante la API de backup de SQLite;
3. guardar copias adicionales fuera del proveedor;
4. cifrar los respaldos;
5. limitar acceso;
6. documentar y probar la restauración.

### 7.2 Frecuencia sugerida

| Elemento | Frecuencia |
|---|---|
| Snapshot del volumen | Diario |
| Backup SQLite consistente | Diario |
| Copia externa | Semanal |
| Prueba de restauración | Mensual |
| Revisión de crecimiento | Mensual |

### 7.3 Información que debe conservarse

- base SQLite;
- INTEGRATION_ENCRYPTION_KEY;
- variables y configuración de despliegue;
- configuración OAuth;
- versión exacta del código;
- procedimiento de restauración.

Los secretos no deben almacenarse dentro del mismo backup sin protección adicional.

## 8. Monitoreo

Configurar como mínimo:

- comprobación externa de /api/health;
- alerta cuando el proceso no responda;
- alerta por errores HTTP 5xx;
- alerta por espacio de disco;
- captura de excepciones;
- revisión de fallos de sincronización;
- revisión de entregas webhook fallidas;
- seguimiento de uso de CPU y memoria.

Servicios posibles:

- monitoreo y logs de Render;
- Sentry para excepciones;
- Better Stack o UptimeRobot para disponibilidad;
- un agregador de logs cuando aumente el volumen.

El health check actual solo confirma que el proceso responde. En una segunda etapa debe comprobar también:

- acceso a la base;
- posibilidad de ejecutar una consulta;
- estado del scheduler;
- espacio disponible.

Las dependencias externas no deben volver no saludable al servidor; deben presentarse como estado degradado.

## 9. Dominio y TLS

Usar un subdominio dedicado:

~~~text
calendario.example.com
~~~

Pasos:

1. comprar o usar un dominio existente;
2. crear el registro DNS requerido por Render;
3. verificar el dominio;
4. esperar la emisión del certificado;
5. confirmar la redirección HTTP a HTTPS;
6. actualizar GOOGLE_REDIRECT_URI;
7. actualizar Google Cloud;
8. probar login, logout e integración.

Render crea y renueva certificados TLS para dominios personalizados. Véase [Custom Domains](https://render.com/docs/custom-domains).

Cloudflare puede utilizarse opcionalmente para DNS, proxy, WAF y controles adicionales.

## 10. Alternativas de hosting

### 10.1 Railway

Railway permite desplegar el servicio con un volumen persistente y crear backups manuales o programados.

Consideraciones:

- una instancia cuando se utiliza un volumen;
- pequeño downtime durante despliegues;
- el volumen no puede compartirse entre réplicas;
- es necesario montar DATABASE_PATH dentro del volumen.

Referencias:

- [Railway Volumes](https://docs.railway.com/volumes/reference)
- [Railway Backups](https://docs.railway.com/volumes/backups)

### 10.2 VPS

Un VPS de DigitalOcean, Hetzner o un proveedor similar ofrece mayor control.

Arquitectura:

~~~mermaid
flowchart TD
    Internet --> Firewall
    Firewall --> Caddy[Caddy HTTPS]
    Caddy --> App[Contenedor Node]
    App --> Volume[(Volumen SQLite)]
    Backup[Backup programado] --> Object[Almacenamiento externo]
    Volume --> Backup
~~~

Componentes:

- Ubuntu LTS;
- Docker y Docker Compose;
- Caddy como reverse proxy;
- firewall;
- volumen persistente;
- backups externos;
- monitoreo;
- actualizaciones de seguridad.

Caddy obtiene y renueva automáticamente certificados públicos cuando el dominio y los puertos están configurados correctamente.

Referencias:

- [Caddy Automatic HTTPS](https://caddyserver.com/docs/automatic-https)
- [Caddy Reverse Proxy](https://caddyserver.com/docs/quick-starts/reverse-proxy)
- [DigitalOcean Backups](https://docs.digitalocean.com/products/backups/details/features/)

La opción VPS requiere que el equipo sea responsable de parches, firewall, Docker, almacenamiento, copias y recuperación.

### 10.3 Plataformas que deben evitarse para el estado actual

No desplegar directamente sobre una plataforma con filesystem efímero y ejecución serverless si SQLite continúa siendo la base principal.

Tampoco deben ejecutarse varias réplicas apuntando a copias independientes del archivo SQLite, porque producirían calendarios y usuarios divergentes.

## 11. Arquitectura para producción escalable

Cuando se requiera alta disponibilidad o concurrencia mayor:

~~~mermaid
flowchart TD
    User[Usuarios] --> Edge[DNS, TLS y WAF]
    Edge --> Web[Web Service: 2+ instancias]
    Web --> PG[(PostgreSQL)]
    Web --> KV[(Redis/Valkey)]
    Web --> Queue[Cola de trabajos]
    Queue --> Worker[Background Worker]
    Worker --> PG
    Worker --> Google[Google Calendar]
    Worker --> Channels[Correo y WhatsApp]
~~~

### 11.1 PostgreSQL

La migración permite:

- múltiples instancias web;
- mayor concurrencia;
- backups administrados;
- recuperación a un punto en el tiempo;
- mantenimiento y observabilidad superiores;
- transacciones sin bloquear el event loop con DatabaseSync.

Render ofrece PostgreSQL administrado y recuperación a un punto en el tiempo para bases pagadas.

Referencias:

- [Render Postgres](https://render.com/docs/postgresql)
- [Postgres Recovery and Backups](https://render.com/docs/postgresql-backups)

### 11.2 Redis o Valkey

Usos recomendados:

- sesiones;
- estados OAuth;
- rate limiting;
- locks distribuidos;
- cola de sincronización;
- coordinación del scheduler.

Render Key Value es compatible con clientes Redis y utiliza Valkey en instancias nuevas.

Referencia: [Render Key Value](https://render.com/docs/key-value).

### 11.3 Worker

Mover al worker:

- procesamiento de recordatorios;
- marcado de vencidos;
- reintentos de Google;
- importaciones programadas;
- webhooks;
- limpieza de notificaciones.

La aplicación web debe crear trabajos y responder rápidamente. El worker debe procesarlos con idempotencia, reintentos y registro de resultados.

## 12. Proceso de lanzamiento

### Fase 1 — Preparación

- [x] Deshabilitar cuentas demo en production.
- [x] Implementar creación segura del primer Administrador.
- [x] Exigir secretos obligatorios.
- [x] Añadir trust proxy.
- [x] Activar cookie Secure.
- [x] Añadir CSRF.
- [x] Añadir rate limiting.
- [x] Configurar cabeceras de seguridad.
- [ ] Definir política de webhooks.
- [x] Fijar Node 24.
- [x] Ejecutar pruebas automatizadas.

### Fase 2 — Infraestructura

- [ ] Crear servicio web.
- [ ] Crear disco persistente.
- [ ] Configurar DATABASE_PATH.
- [ ] Configurar secretos.
- [ ] Configurar health check.
- [ ] Asociar dominio.
- [ ] Verificar HTTPS.
- [ ] Configurar backups.
- [ ] Configurar monitoreo.

### Fase 3 — Google

- [ ] Crear proyecto de producción.
- [ ] Activar Calendar API.
- [ ] Registrar redirect URI HTTPS.
- [ ] Configurar audiencia.
- [ ] Agregar usuarios de prueba.
- [ ] Preparar política de privacidad.
- [ ] Probar conexión, renovación e importación.
- [ ] Iniciar verificación si la audiencia es externa.

### Fase 4 — Validación

- [x] Crear una base limpia de prueba.
- [x] Confirmar que no existen cuentas demo.
- [x] Crear Administrador.
- [ ] Crear calendario.
- [ ] Asignar permisos.
- [ ] Crear y editar una entrada.
- [ ] Probar recurrencia.
- [ ] Probar recordatorio.
- [ ] Conectar Google.
- [ ] Exportar e importar una entrada.
- [ ] Reiniciar el servicio.
- [ ] Restaurar un backup en un entorno separado.
- [ ] Revisar logs y auditoría.

### Fase 5 — Piloto

- [ ] Limitar inicialmente el número de usuarios.
- [ ] Recoger errores y métricas.
- [ ] Revisar fallos de sincronización diariamente.
- [ ] Confirmar backups.
- [ ] Establecer responsable de soporte.
- [ ] Documentar incidentes.

## 13. Rollback

Antes de cada despliegue:

1. crear backup consistente;
2. registrar el commit actualmente estable;
3. revisar cambios de esquema;
4. confirmar compatibilidad hacia atrás;
5. evitar despliegues durante importaciones.

En caso de fallo:

1. detener escrituras si existe riesgo de corrupción;
2. volver al commit estable;
3. validar /api/health;
4. verificar acceso a SQLite;
5. revisar sync_logs y audit_logs;
6. restaurar la base solo si el problema afectó los datos;
7. no cambiar INTEGRATION_ENCRYPTION_KEY durante el rollback.

## 14. Recomendación final

Para el primer lanzamiento:

1. aplicar los cambios de seguridad bloqueantes;
2. utilizar una instancia pagada de Render;
3. mantener SQLite en un disco persistente;
4. utilizar un dominio con HTTPS;
5. lanzar Google OAuth como Internal o Testing;
6. habilitar backups y monitoreo;
7. comenzar con un grupo reducido de usuarios.

La migración a PostgreSQL, Redis/Valkey y un worker separado debe realizarse antes de utilizar múltiples instancias, exigir alta disponibilidad o abrir el sistema a una audiencia grande.

---

Última revisión: 2026-07-21.
