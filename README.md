# Gestor Central de Calendarios

Primera versión funcional del MVP descrito en `design_gestor_calendarios.md`.

## Documentación

- [`MANUAL_USUARIO.md`](MANUAL_USUARIO.md): uso diario, roles, administración y resolución de problemas.
- [`TECHNICAL.md`](TECHNICAL.md): arquitectura y referencia técnica.
- [`deployment.md`](deployment.md): preparación y publicación en producción.
- [`docs/adr/`](docs/adr/): registro de decisiones de arquitectura y por qué se tomaron.

## Requisitos

- Node.js 24.x.
- npm.

## Instalación y ejecución

Para desarrollo:

```bash
npm install
npm start
```

La aplicación estará disponible en <http://localhost:3000>.

La base de datos SQLite se crea automáticamente en `data/calendar-manager.sqlite`.

Para instalar en el equipo de una persona que va a usar la aplicación, sin pasos manuales, consulta [Instalación en un PC nuevo](#instalación-en-un-pc-nuevo).

## Datos iniciales

Una base vacía arranca **sin usuarios, calendarios ni eventos** en cualquier entorno. Lo que se crea depende de `SEED_MODE`:

| `SEED_MODE` | Qué crea |
| --- | --- |
| `blank` | Solo los cuatro roles del sistema. |
| `base` (predeterminado) | Roles, departamentos y tipos de evento. |
| `demo` | Lo anterior más usuarios, calendarios, eventos y recursos de ejemplo. Rechazado con `NODE_ENV=production`. |

El único usuario que se crea de forma automática es el Administrador inicial, y solo si defines `INITIAL_ADMIN_EMAIL` e `INITIAL_ADMIN_PASSWORD` (mínimo 12 caracteres). En producción son obligatorios; sin ellos el arranque falla. En desarrollo, si no los defines, el servidor avisa de que la base quedó sin usuarios.

También puedes crear o recuperar el acceso sin variables de entorno:

```bash
npm run create-admin -- --email admin@tu-dominio.com --password "una-contraseña-larga" --name "Nombre"
npm run create-admin -- --email admin@tu-dominio.com --password "nueva-contraseña" --force   # restablece el acceso
```

Para trabajar con datos de ejemplo sobre una base recién borrada:

```bash
npm run seed:demo   # crea admin@empresa.com / Demo123! y datos de prueba
```

## Uso local sin integración de Google

La aplicación funciona por completo sin Google Calendar. Solo depende de `express`; el resto son módulos nativos de Node y la base es un único archivo SQLite. Si no hay credenciales configuradas, las rutas de integración responden `503` y los eventos permanecen en `sync_status = 'not_synced'`. Calendarios, eventos, series, permisos, reportes y recordatorios no se ven afectados.

Esto permite instalarlo en un PC de la oficina mientras se resuelve el alojamiento definitivo. `.env` para ese caso:

```env
NODE_ENV=production
COOKIE_SECURE=false
PORT=3000
DATABASE_PATH=./data/calendar-manager.sqlite
SESSION_SECRET=<32+ caracteres aleatorios>
INTEGRATION_ENCRYPTION_KEY=<otros 32+ caracteres, distintos>
DEFAULT_TIMEZONE=America/Santo_Domingo
SEED_MODE=base
```

`COOKIE_SECURE=false` es necesario porque en producción la cookie de sesión lleva el atributo `Secure` y el navegador no la enviaría por HTTP plano. Al pasar a HTTPS hay que quitar esa línea. El servidor advierte en consola mientras esté activa.

Para generar los secretos:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Después, crea la cuenta con `npm run create-admin` y arranca con `npm start` o `.\scripts\manage.ps1 -Action start-server`.

### Acceso directo de escritorio

Para que la aplicación se abra con doble clic, sin terminal:

```powershell
.\scripts\install-shortcut.ps1            # solo escritorio
.\scripts\install-shortcut.ps1 -Startup   # además, al iniciar sesión en Windows
.\scripts\install-shortcut.ps1 -Remove    # eliminar los accesos directos
```

El acceso directo ejecuta `scripts/start-app.ps1`, que levanta el servidor sin ventana de consola, espera a que `/api/health` responda y abre el navegador. Si el servidor ya estaba activo solo abre el navegador, así que pulsarlo dos veces no crea un segundo proceso sobre el mismo archivo SQLite.

Cuando algo falla muestra un cuadro de diálogo en lugar de un error en consola: Node.js ausente, dependencias sin instalar o el servidor que no responde en el puerto configurado.

#### Limitaciones conocidas

- **El icono es el de Node.js.** El proyecto no incluye un `.ico`, y Windows no acepta el `public/favicon.svg` en accesos directos. Para cambiarlo, edita la propiedad `IconLocation` en [`scripts/install-shortcut.ps1`](scripts/install-shortcut.ps1) apuntando a un archivo `.ico` propio.
- **Hay un parpadeo breve de consola al arrancar.** El acceso directo se crea en modo minimizado y PowerShell se invoca oculto, que es lo máximo alcanzable sin recurrir a VBScript, tecnología en proceso de retirada en Windows 11.

Ambas desaparecerían empaquetando con Electron, pendiente en [Mejoras a futuro](#mejoras-a-futuro).

### Instalación en un PC nuevo

Con Node.js 24.x ya instalado, un único comando deja el equipo listo:

```powershell
.\scripts\install.ps1
```

Ejecuta seis pasos y pregunta solo lo que no puede deducir:

1. comprueba que Node.js existe y que su versión es 24 o superior, requisito del módulo `node:sqlite`;
2. instala las dependencias con `npm install`;
3. crea el `.env` con `SESSION_SECRET` e `INTEGRATION_ENCRYPTION_KEY` generados aleatoriamente;
4. pide correo, contraseña (dos veces, oculta) y nombre, y crea la cuenta de Administrador;
5. crea el acceso directo, preguntando si debe abrirse al iniciar sesión en Windows;
6. registra la tarea de Windows que respalda la base a diario.

**Es re-ejecutable.** No sobrescribe un `.env` existente ni toca la base de datos. Si la cuenta ya existe, pregunta antes de restablecer su contraseña.

Para instalación desatendida, sin preguntas:

```powershell
.\scripts\install.ps1 -Email admin@empresa.com -Password "clave-de-12-o-mas" -Startup
```

Otros parámetros: `-Name`, `-Port`, `-Timezone`, `-SkipShortcut` y `-SkipBackupTask`.

La contraseña se pasa a `create-admin.js` mediante variables de entorno y no como argumento, para que no quede visible en la lista de procesos del sistema.

Conserva `INTEGRATION_ENCRYPTION_KEY` fuera del equipo: si se pierde en una reinstalación, los tokens cifrados en la base dejan de ser descifrables y las cuentas de Google conectadas deben volver a autorizarse.

#### Instalación manual

Si prefieres hacerlo paso a paso, el script equivale a:

```powershell
npm install                                                    # requiere internet una sola vez
# crear .env con el contenido indicado más arriba
npm run create-admin -- --email usuario@empresa.com --password "clave-de-12-o-mas"
.\scripts\install-shortcut.ps1 -Startup
```

### Desinstalar

```powershell
.\scripts\uninstall.ps1
```

Por omisión hace solo lo reversible: detiene el servidor, elimina los accesos directos y borra `node_modules`. **La base de datos y el `.env` se conservan** salvo que se pidan expresamente, y en modo interactivo hay que escribir `ELIMINAR` para confirmar el borrado de la base.

Antes de borrar la base guarda una copia —incluyendo el `.env`— en `Documentos\gestor-calendarios-respaldo-<fecha>`, fuera de la carpeta del proyecto, para que sobreviva aunque después borres la carpeta entera.

```powershell
.\scripts\uninstall.ps1 -RemoveData -RemoveEnv -Force   # desatendido, borra todo
.\scripts\uninstall.ps1 -KeepModules                    # conserva node_modules
.\scripts\uninstall.ps1 -RemoveData -NoBackup           # sin copia de seguridad
```

`-Force` implica modo desatendido: no pregunta nada, y por tanto **no borra datos** a menos que se lo indiques con `-RemoveData` o `-RemoveEnv`.

No desinstala Node.js ni borra la carpeta del proyecto. Los accesos directos viven en el perfil del usuario de Windows, así que se eliminan aunque ejecutes el script desde una copia del proyecto situada en otra ruta.

### Respaldos y restauración

Los respaldos usan `VACUUM INTO`, que produce un snapshot íntegro de una base en uso, en un único archivo sin WAL ni SHM asociados. **No hace falta detener el servidor.** Copiar `calendar-manager.sqlite` con el explorador o con `Copy-Item` no es equivalente: lo que todavía vive en el archivo WAL quedaría fuera.

```powershell
npm run backup                      # snapshot + rotación
npm run backup -- --list            # ver los respaldos existentes
npm run backup -- --keep 60         # conservar más copias
npm run backup -- --dir "D:\Copias" # destino puntual distinto
```

Se disparan por dos vías, redundantes a propósito:

| Vía | Cuándo | Si falla la otra |
| --- | --- | --- |
| Servidor | Al arrancar y cada 24 h | Cubre los días en que la tarea no llegó a correr |
| Tarea de Windows | Diaria a las 13:00 | Cubre los días en que la aplicación no se abrió |

El servidor omite el snapshot si ya hay uno de hace menos de seis horas, para que reiniciar la aplicación no genere decenas de copias. La tarea programada no aplica esa espera: cuando se lanza, respalda.

```powershell
.\scripts\manage.ps1 -Action install-backup-task   # registrar la tarea
.\scripts\manage.ps1 -Action remove-backup-task    # quitarla
```

`install.ps1` la registra sola. Si no puede, avisa pero no da la instalación por fallida: el respaldo del servidor sigue cubriendo.

#### Restaurar

```powershell
npm run restore -- --latest                  # desde el respaldo más reciente
npm run restore -- --file "data\backups\..." # desde uno concreto
```

Antes de sustituir nada verifica que el respaldo pase `PRAGMA integrity_check` y contenga las tablas esperadas, y guarda un snapshot del estado actual con el prefijo `previo-a-restaurar`, de modo que una restauración equivocada también se pueda deshacer.

El servidor debe estar detenido. En Windows el archivo en uso no se puede reemplazar, así que la operación falla de forma segura en lugar de dejar la base a medias.

#### Destinos

**Configuración → Respaldos** permite definir varios destinos, que no se excluyen: uno local y otro en una carpeta sincronizada con la nube o en un recurso de red conviven sin problema. Se admiten hasta cinco.

Todos reciben **el mismo snapshot**: se hace un único `VACUUM INTO` y de ahí se copia byte a byte al resto. Así las copias representan exactamente el mismo instante y la base solo se recorre una vez.

**Un destino caído no impide que los demás se escriban.** Si la ruta de red está inaccesible, esa copia falla y las otras se completan; el resultado detalla qué destino funcionó y cuál no. El panel de estado bajo la lista muestra, por destino, cuántas copias tiene y de cuándo es la última.

Las rutas se validan al guardar escribiendo un archivo de prueba: una ruta relativa o un recurso inaccesible se rechazan en el momento, en lugar de dar una falsa sensación de respaldo hasta el día en que haga falta.

El botón **Respaldar ahora** ejecuta el respaldo en todos los destinos y refresca el estado. Es la forma de confirmar que una ruta de red recién añadida funciona de verdad.

#### Variables de entorno

| Variable | Por omisión | Para qué |
| --- | --- | --- |
| `BACKUP_PATH` | `./data/backups` | Destino usado **mientras no haya ninguno en Configuración** |
| `BACKUP_RETENTION` | `30` | Retención inicial de una base nueva |
| `BACKUP_ENABLED` | `true` | `false` desactiva el respaldo automático del servidor |

La lista de Configuración manda sobre `BACKUP_PATH`. Esa variable queda como destino de partida para instalaciones que nunca hayan tocado la pantalla, y la retención de Configuración sustituye a `BACKUP_RETENTION` desde el primer arranque.

**Con un único destino local, un disco dañado se lleva la base y sus copias a la vez.** Añadir un segundo destino en una carpeta sincronizada lo resuelve: el snapshot es inmutable una vez escrito, así que sincronizarlo es seguro, cosa que no ocurre con la base viva.

`INTEGRATION_ENCRYPTION_KEY` no viaja en los snapshots, y sin ella los tokens de Google guardados dentro son indescifrables. Guarda una copia del `.env` **una sola vez** en un gestor de contraseñas o sobre físico, no junto a cada respaldo: la clave al lado de los datos que cifra anula el cifrado.

### Scripts disponibles

| Script | Para qué sirve |
| --- | --- |
| [`install.ps1`](scripts/install.ps1) | Instalación completa en un PC nuevo. Re-ejecutable. |
| [`uninstall.ps1`](scripts/uninstall.ps1) | Desinstala. Conserva datos salvo que se pidan borrar. |
| [`manage.ps1`](scripts/manage.ps1) | Menú de administración: estado, arranque, respaldos, borrado y siembra. También por `-Action`. |
| [`start-app.ps1`](scripts/start-app.ps1) | Arranca el servidor sin consola y abre el navegador. Lo invoca el acceso directo. |
| [`install-shortcut.ps1`](scripts/install-shortcut.ps1) | Crea o elimina el acceso directo del escritorio y el de inicio de Windows. |
| [`create-admin.js`](scripts/create-admin.js) | Crea o restablece una cuenta de Administrador. `npm run create-admin` |
| [`backup.js`](scripts/backup.js) | Snapshot consistente con rotación. `npm run backup` |
| [`restore.js`](scripts/restore.js) | Restaura desde un respaldo, verificándolo antes. `npm run restore` |
| [`seed-demo.js`](scripts/seed-demo.js) | Carga los datos de demostración. `npm run seed:demo` |

Acciones de `manage.ps1`: `status`, `start-server`, `stop-server`, `backup-db`, `restore-db`, `delete-db`, `reset-blank`, `seed-demo`, `create-admin`, `install-shortcut`, `install-backup-task`, `remove-backup-task` y `help`.

#### Nota al editar los scripts de PowerShell

Los `.ps1` deben guardarse en **UTF-8 con BOM y saltos de línea CRLF**. Windows PowerShell 5.1 interpreta como ANSI cualquier archivo sin BOM, y entonces las mayúsculas acentuadas rompen el parseo: `Ó` en UTF-8 son los bytes `0xC3 0x93`, y leídos como ANSI producen `Ã` más `"` tipográfica, que PowerShell trata como delimitador de cadena. Los here-strings (`@"…"@`) fallan además con saltos LF, por lo que conviene evitarlos y construir el texto multilínea como array.

Para comprobar un script sin ejecutarlo:

```powershell
$err = $null
[System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path .\scripts\install.ps1).Path, [ref]$null, [ref]$err)
$err
```

Si otras personas de la red van a conectarse, accederán a `http://<ip-del-pc>:3000` y ese PC debe permanecer encendido. La base de datos vivirá únicamente en esa máquina: programa respaldos con `.\scripts\manage.ps1 -Action backup-db` y cópialos fuera del equipo.

## Preparación para producción

Antes de iniciar con `NODE_ENV=production`, define una ruta persistente y secretos fuertes:

```env
NODE_ENV=production
DATABASE_PATH=/ruta/persistente/calendar-manager.sqlite
SESSION_SECRET=secreto-aleatorio-de-al-menos-32-caracteres
INTEGRATION_ENCRYPTION_KEY=otra-clave-aleatoria-de-al-menos-32-caracteres
INITIAL_ADMIN_NAME=Administrador
INITIAL_ADMIN_EMAIL=admin@tu-dominio.com
INITIAL_ADMIN_PASSWORD=una-contraseña-inicial-segura
```

En producción, el servidor rechaza valores predeterminados inseguros. Las sesiones y los estados OAuth se conservan en SQLite; las mutaciones requieren origen válido y token CSRF. Consulta [`deployment.md`](deployment.md) para la configuración de Render, Cloudflare, Google OAuth, backups y monitoreo.

Después del primer inicio de producción, cambia la contraseña del Administrador y elimina `INITIAL_ADMIN_PASSWORD` del entorno.

## Alcance implementado

- Inicio y cierre de sesión.
- Dashboard con indicadores y escala configurable para la distribución por calendario.
- Calendario mensual, semanal y diario.
- Reprogramación por arrastre y cambio visual de la duración de eventos.
- Listado y filtros de eventos.
- Crear, editar y cancelar eventos.
- Eventos recurrentes diarios, semanales y mensuales con edición o cancelación por alcance.
- Responsables, tipos, prioridades y estados.
- Detección de conflictos por responsable, ubicación, sala o recurso.
- Recordatorios por evento y centro de notificaciones internas.
- Lectura, eliminación individual y limpieza completa de notificaciones.
- Contador de notificaciones sin leer en el título y el icono de la pestaña.
- Marcado automático de eventos vencidos.
- Auditoría de cambios en la base de datos.
- Administración de usuarios, roles, departamentos, estados y asignación de múltiples calendarios.
- Administración de salas, equipos, vehículos y otros recursos.
- Creación, edición y archivado de calendarios.
- Permisos por calendario para ver, crear, editar y cancelar.
- Autorización de eventos por rol, departamento, propiedad y permiso explícito.
- Diseño adaptable a escritorio y móvil.
- Integración OAuth 2.0 con Google Calendar.
- Creación, actualización, cancelación y reintento de eventos externos.
- Sincronización bidireccional incremental para importar altas, cambios y cancelaciones desde Google Calendar.
- Tokens de Google cifrados con AES-256-GCM.
- Configuración administrativa de jornada, intervalos, avisos, conflictos y distribución.
- Modo desarrollador para simular notificaciones y recordatorios.
- Push local del navegador y adaptadores webhook para correo y WhatsApp.
- Reportes de cumplimiento y carga laboral por responsable y calendario.

## Configurar Google Calendar

1. Crea o selecciona un proyecto en Google Cloud.
2. Activa **Google Calendar API**.
3. Configura la pantalla de consentimiento OAuth.
4. Crea un cliente OAuth 2.0 de tipo **Aplicación web**.
5. Registra esta URI de redirección autorizada:

   ```text
   http://localhost:3000/api/integrations/google/callback
   ```

6. Copia `.env.example` como `.env` y define al menos las claves maestras:

   ```env
   SESSION_SECRET=un-secreto-largo
   INTEGRATION_ENCRYPTION_KEY=otra-clave-larga
   ```

7. Inicia el servidor y abre **Integraciones → Configurar integración**.
8. Introduce el Client ID y Client Secret en el modal administrativo.
9. Guarda la configuración y selecciona **Conectar cuenta de Google**.

### Resolver `Error 403: access_denied` durante las pruebas

Si Google muestra que **Calendar-Controller no ha completado el proceso de verificación**, el proyecto OAuth está en modo **Testing** y la cuenta que intenta conectarse no figura como usuario de prueba.

1. Entra en [Google Cloud Console](https://console.cloud.google.com/).
2. Selecciona el mismo proyecto al que pertenece el Client ID configurado en Calendar-Controller.
3. Abre **Google Auth Platform → Audience**.
4. Confirma que la aplicación es externa y que su estado de publicación es **Testing**.
5. En **Test users**, selecciona **Add users**.
6. Agrega la cuenta de Google que conectará el calendario y guarda los cambios.
7. Regresa a Calendar-Controller y selecciona nuevamente **Conectar cuenta de Google**. Si el navegador mantiene otra sesión, elige expresamente la cuenta agregada como tester.

Comprueba además que:

- **Google Calendar API** esté habilitada en ese proyecto.
- El cliente OAuth sea de tipo **Web application**.
- La URI autorizada coincida exactamente con `http://localhost:3000/api/integrations/google/callback`.
- El Client ID guardado en el modal pertenezca al proyecto donde se agregaron los testers.

Google limita las aplicaciones externas en estado Testing a los usuarios incluidos expresamente en la lista de testers. Como la aplicación solicita el scope `https://www.googleapis.com/auth/calendar.events`, los refresh tokens emitidos durante las pruebas normalmente caducan después de siete días y puede ser necesario reconectar la cuenta. Consulta la documentación oficial sobre [audiencias OAuth](https://support.google.com/cloud/answer/15549945) y [expiración de refresh tokens](https://developers.google.com/identity/protocols/oauth2#expiration).

Para desarrollo local se recomienda conservar el estado Testing y registrar las cuentas necesarias como testers.

### Publicar la integración para uso interno

Para el uso real en la empresa la decisión adoptada es **audiencia External publicada en producción, sin verificar**. Con alrededor de 10 usuarios se está muy por debajo del tope de 100 que Google aplica a las aplicaciones sin verificación, y la advertencia de "app no verificada" resulta aceptable en un contexto interno.

Publicar no es opcional aunque la advertencia no moleste: **en Testing los refresh tokens caducan a los siete días**, y al vencer la integración queda marcada con error y los eventos en `sync_status = 'error'`, obligando a cada usuario a reconectar su cuenta cada semana.

1. Crea un proyecto de Google Cloud dedicado a producción, distinto del de pruebas.
2. Habilita **Google Calendar API**.
3. En **Google Auth Platform → Branding**, define nombre de la aplicación, correo de soporte y correo del desarrollador.
4. En **Audience**, deja **External** y pulsa **Publish app**. El estado debe quedar en *In production*. Si Google pide página principal y política de privacidad, bastan páginas simples en tu propio dominio.
5. En **Credentials**, crea un *OAuth client ID* de tipo **Web application** y registra el redirect URI definitivo:

   ```text
   https://tu-dominio.com/api/integrations/google/callback
   ```

6. Configura ese Client ID y Client Secret desde **Integraciones → Configurar integración**, o mediante `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` y `GOOGLE_REDIRECT_URI`.
7. Cada usuario conecta su cuenta y pasa una sola vez por **Advanced → Continue**.

El redirect URI necesita el dominio definitivo con HTTPS, así que conviene resolver primero el alojamiento y solo después registrarlo en Google. Consulta [`deployment.md` §6.3](deployment.md) y [§10.3](deployment.md) para las opciones, incluida la de mantener el servidor dentro de la oficina mediante un túnel inverso.

Si la empresa adopta Google Workspace con dominio propio, la audiencia puede cambiarse a **Internal**, lo que elimina la advertencia, el tope de usuarios y todo trámite de verificación.

Conserva `INTEGRATION_ENCRYPTION_KEY` junto con los respaldos: sin ella los refresh tokens cifrados en la base dejan de ser descifrables y todos los usuarios deberán reconectar.

El Client Secret se envía una sola vez al backend, se cifra con AES-256-GCM y nunca se devuelve al navegador. Dejar el campo vacío al editar conserva el secreto existente. Solo el rol Administrador puede consultar o modificar esta configuración.

Las variables `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` y `GOOGLE_REDIRECT_URI` continúan disponibles como configuración alternativa en `.env`. La configuración cifrada guardada desde el modal tiene prioridad.

La aplicación solicita acceso `offline` para renovar el token sin intervención del usuario. Tanto las credenciales del proveedor como los tokens OAuth se conservan cifrados en SQLite.

### Importar cambios desde Google Calendar

Después de conectar una cuenta, abre **Integraciones**, selecciona el **Calendario interno de destino** y utiliza **Importar eventos ahora**. La primera consulta realiza una importación completa; las siguientes usan el cursor incremental entregado por Google para solicitar únicamente los cambios posteriores.

- Los eventos nuevos de Google se crean en el calendario interno seleccionado.
- Los eventos vinculados se actualizan sin modificar su responsable o recurso interno.
- Las cancelaciones realizadas en Google cancelan el evento local correspondiente.
- Si un evento tiene cambios locales pendientes o con error, la importación no lo sobrescribe y lo reporta como omitido.
- Si Google invalida el cursor incremental, el gestor descarta ese cursor y ejecuta una nueva sincronización completa.

El estado de Integraciones muestra la fecha, el calendario y el resultado de la última importación.

## Organización de la interfaz

- `public/theme.css`: colores, superficies, sombras y tokens visuales.
- `public/styles.css`: composición y estilos de los componentes.
- `public/js/config/ui.config.js`: textos, estados y configuración visible.
- `public/js/services/api.service.js`: acceso desacoplado al backend.
- `public/js/components/`: renderizadores reutilizables.
- `public/app.js`: coordinación de vistas y acciones.

Esta separación permite cambiar la apariencia sin modificar la integración ni las reglas de negocio.

## Series, reportes y avisos externos

Al crear un evento puedes hacerlo diario, semanal o mensual, definir el intervalo y generar entre 2 y 100 ocurrencias. Al editar o cancelar una ocurrencia, el selector **Aplicar cambios a** permite actuar solo sobre esa fecha, sobre esa fecha y las siguientes o sobre toda la serie.

La pestaña **Reportes** calcula cumplimiento y carga laboral para el periodo elegido. La capacidad disponible toma la jornada definida en Configuración y considera solamente los días laborables; cada usuario ve únicamente los calendarios a los que tiene acceso.

En **Configuración → Canales externos** se pueden activar adaptadores webhook para correo y WhatsApp. Ambos envían una solicitud `POST` JSON con el canal, destinatario, notificación y evento. Esto permite conectarlos con el proveedor o automatizador elegido sin acoplar el gestor a una marca concreta. WhatsApp requiere además el número de destino en formato internacional.

El push del navegador se habilita con **Autorizar este navegador**. Esta implementación muestra notificaciones del sistema mientras la aplicación está abierta; no requiere claves VAPID. Con el modo desarrollador activo, los botones de prueba validan el centro interno, el push y los webhooks configurados.

### Indicador en la pestaña del navegador

Las notificaciones sin leer se reflejan en la propia pestaña, sin necesidad de tener la aplicación en primer plano:

| Sin leer | Pestaña |
| --- | --- |
| 0 | `Gestor Central de Calendarios`, con el icono normal |
| 3 | `(3) Gestor Central de Calendarios`, con un punto rojo sobre el icono |
| más de 99 | `(99+) Gestor Central de Calendarios` |

La cifra va en el título y no en el icono porque a 16×16 píxeles un número resulta ilegible: el punto solo señala que hay algo pendiente.

El sondeo continúa mientras la pestaña está en segundo plano, que es justamente cuando el indicador sirve, aunque espaciado a tres minutos en lugar de uno para no cargar al servidor sin motivo. Al volver a la pestaña se refresca de inmediato.

**Al cambiar el icono hay que tocar dos archivos.** El SVG está duplicado en la constante `FAVICON_BODY` de [`public/app.js`](public/app.js), porque el punto de aviso se compone sobre él y se aplica como `data:` URI sin una petición adicional. Si editas [`public/favicon.svg`](public/favicon.svg), replica el cambio en esa constante o el icono cambiará solo mientras no haya notificaciones pendientes.

## Pendiente

### Decisiones de despliegue

- **Elegir alojamiento.** Las opciones evaluadas están en [`deployment.md` §10](deployment.md): túnel inverso con el servidor en la oficina (recomendada), dominio propio con DNS interno, o hosting público. La integración de Google exige HTTPS con dominio público en cualquiera de los tres casos; sin esa integración la aplicación puede servirse por HTTP en la red local.
- **Publicar el proyecto OAuth en producción** antes de repartir la integración, para evitar la caducidad de refresh tokens a los siete días.
- **Verificar `trust proxy` detrás del túnel elegido.** `server.js` ya lo activa en producción; falta comprobar sobre el proxy real que `req.protocol` valga `https` y que `requireSameOrigin` no rechace las mutaciones.
- **Generar los secretos definitivos** (`SESSION_SECRET`, `INTEGRATION_ENCRYPTION_KEY`) y definir dónde se respaldan.

### Funcionalidad

- Participantes, invitaciones y confirmación de asistencia.
- Consulta visual del registro de auditoría y actividad.

### Mejoras a futuro

- **Empaquetar con Electron.** Descartado por ahora en favor del enfoque BYOB: ver [ADR 001](docs/adr/001-byob-frente-a-electron.md), que recoge el razonamiento completo y las condiciones bajo las que conviene reconsiderarlo. Sustituiría el acceso directo por una aplicación con ventana propia, icono e instalador, eliminando el parpadeo de consola. Requiere resolver tres puntos del código, que hoy asumen que el proyecto se ejecuta desde su carpeta de origen:
  - [`config.js:4`](src/config.js#L4) — `rootDir` se calcula desde `__dirname`, que empaquetado apunta dentro del `asar`, de solo lectura.
  - [`config.js:86`](src/config.js#L86) — `databasePath` se resuelve relativo a `rootDir`; instalado en `Program Files` fallaría por permisos. Debe apuntar a `app.getPath('userData')`.
  - [`config.js:5-9`](src/config.js#L5-L9) — el `.env` se lee desde `rootDir` y no existirá empaquetado; la configuración debe inyectarse como variables de entorno desde el proceso principal.

  Los tres se resuelven en el `main.js` de Electron, definiendo las variables antes de requerir el servidor. Un instalador sin firma digital dispara el aviso de SmartScreen de Windows, aceptable en uso interno. Electron no cambia la arquitectura: si otras personas se conectan, ese PC sigue siendo el servidor.
- Añadir un `.ico` propio para el acceso directo y para el eventual instalador.
- Migrar la audiencia OAuth a **Internal** si la empresa adopta Google Workspace con dominio propio.
- Completar la verificación de scopes sensibles solo si la integración llega a abrirse a usuarios externos a la empresa.
- Sustituir SQLite por PostgreSQL si se requiere concurrencia o alta disponibilidad, según [`deployment.md` §11](deployment.md).
