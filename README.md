# Gestor Central de Calendarios

Primera versión funcional del MVP descrito en `design_gestor_calendarios.md`.

## Documentación

- [`MANUAL_USUARIO.md`](MANUAL_USUARIO.md): uso diario, roles, administración y resolución de problemas.
- [`TECHNICAL.md`](TECHNICAL.md): arquitectura y referencia técnica.
- [`deployment.md`](deployment.md): preparación y publicación en producción.

## Requisitos

- Node.js 24.x.
- npm.

## Instalación y ejecución

```bash
npm install
npm start
```

La aplicación estará disponible en <http://localhost:3000>.

En desarrollo, una base vacía carga estas cuentas de demostración:

- Correo: `admin@empresa.com`
- Contraseña: `Demo123!`

Las cuentas `supervisor@empresa.com`, `reservas@empresa.com` y `ventas@empresa.com` usan la misma contraseña y permiten comprobar los diferentes alcances de permisos.

El modo producción no crea estas cuentas. Una base vacía exige `INITIAL_ADMIN_EMAIL` e `INITIAL_ADMIN_PASSWORD` para crear un único Administrador inicial; la contraseña debe tener al menos 12 caracteres.

La base de datos SQLite se crea automáticamente en `data/calendar-manager.sqlite` y se carga con calendarios, usuarios y eventos de prueba.

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

Para desarrollo local se recomienda conservar el estado Testing y registrar las cuentas necesarias como testers. Antes de abrir la integración a usuarios no registrados, cambia el proyecto a producción y completa la verificación que Google solicite para los scopes utilizados.

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

## Pendiente

- Participantes, invitaciones y confirmación de asistencia.
- Consulta visual del registro de auditoría y actividad.
