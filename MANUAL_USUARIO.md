# Manual de usuario — Gestor Central de Calendarios

## 1. Introducción

El Gestor Central de Calendarios permite organizar calendarios empresariales, eventos, responsables, salas y otros recursos desde una sola aplicación. También ofrece recordatorios, reportes operativos y sincronización con Google Calendar.

Este manual describe el funcionamiento disponible en la versión actual. Las opciones visibles pueden variar según el rol y los permisos asignados a cada usuario.

## 2. Acceso al sistema

### 2.1 Iniciar sesión

1. Abre la dirección del gestor proporcionada por el administrador.
2. Escribe tu correo electrónico.
3. Escribe tu contraseña.
4. Selecciona **Entrar al gestor**.

Si los datos no son válidos, la aplicación mostrará un mensaje de error. Después de varios intentos fallidos, el acceso puede quedar bloqueado temporalmente por seguridad.

### 2.2 Cerrar sesión

Selecciona **Cerrar sesión** en la parte inferior del menú lateral. Hazlo siempre que termines de utilizar el sistema en un equipo compartido.

### 2.3 Contraseña olvidada

La versión actual no incluye recuperación automática de contraseña. Solicita al administrador que establezca una contraseña nueva desde **Administración → Usuarios**.

## 3. Roles y permisos

| Rol | Acceso general |
| --- | --- |
| **Administrador** | Acceso a todos los calendarios, eventos, usuarios, recursos, configuraciones e integraciones. |
| **Supervisor** | Puede consultar y gestionar los calendarios de su departamento. También puede recibir permisos adicionales. |
| **Empleado** | Consulta calendarios autorizados. Puede crear según sus permisos y editar o cancelar eventos propios. |
| **Consulta** | Acceso de solo lectura a los calendarios permitidos. No puede crear ni modificar eventos. |

Además del rol, un administrador puede conceder permisos específicos por calendario:

- **Ver:** consultar el calendario y sus eventos.
- **Crear:** registrar eventos nuevos.
- **Editar:** modificar eventos existentes.
- **Cancelar:** cancelar eventos.

Si una acción no aparece o un evento se abre como solo lectura, tu cuenta no dispone del permiso correspondiente.

## 4. Navegación principal

El menú lateral contiene las siguientes áreas:

- **Resumen:** indicadores y próximos eventos.
- **Calendario:** agenda mensual, semanal o diaria.
- **Eventos:** búsqueda, filtros y listado completo.
- **Reportes:** cumplimiento y carga laboral.
- **Administración:** usuarios, calendarios y permisos; solo administradores.
- **Configuración:** preferencias, avisos y recursos; solo administradores.
- **Integraciones:** conexión y sincronización con Google Calendar.

En la barra superior encontrarás tu nombre, rol, el centro de notificaciones, el acceso a integraciones y el botón **Nuevo evento** cuando tengas permiso para crear.

## 5. Resumen ejecutivo

La pantalla **Resumen** muestra los elementos que requieren atención:

- **Hoy:** eventos programados para la fecha actual.
- **Próximos:** eventos de los siguientes siete días.
- **Vencidos:** eventos cuya fecha terminó sin completarse.
- **Sin responsable:** eventos todavía no asignados.
- **Conflictos:** eventos con horarios o recursos superpuestos.

Selecciona una tarjeta para abrir **Eventos** con el filtro correspondiente. La sección **Próximos eventos** permite abrir directamente un evento, mientras que **Distribución por calendario** compara el volumen de actividad de cada calendario.

## 6. Consultar el calendario

1. Abre **Calendario**.
2. Elige **Mes**, **Semana** o **Día**.
3. Usa las flechas para avanzar o retroceder, o selecciona **Hoy** para volver a la fecha actual.
4. Usa **Todos los calendarios** para mostrar únicamente un calendario.
5. Selecciona un evento para abrir sus detalles.

En las vistas semanal y diaria, un usuario con permiso de edición puede:

- Arrastrar un evento para cambiar su horario.
- Arrastrar el control inferior del evento para modificar su duración.

El sistema volverá a comprobar los conflictos después del cambio. En la vista mensual también puedes seleccionar un día vacío para comenzar un evento en esa fecha.

## 7. Buscar y filtrar eventos

En **Eventos** puedes combinar estos criterios:

- Texto del título o la descripción.
- Calendario.
- Estado.
- **Mis eventos** o **Sin responsable**.

La pantalla indica cuántos resultados coinciden y muestra el contexto del filtro activo. Selecciona **Limpiar** para restablecer todos los criterios.

Cada fila muestra fecha, evento, calendario, responsable, estado, prioridad y situación de Google. Usa **Editar** o **Ver** para abrir el registro según tus permisos.

## 8. Crear un evento

1. Selecciona **Nuevo evento**.
2. Completa los campos obligatorios:
   - Título.
   - Calendario.
   - Tipo de evento.
   - Fecha y hora de inicio.
   - Fecha y hora de finalización.
3. Completa, si corresponde:
   - Responsable.
   - Estado y prioridad.
   - Ubicación.
   - Sala o recurso.
   - Recordatorio.
   - Descripción.
   - Sincronización con Google Calendar.
4. Revisa el aviso de conflictos.
5. Selecciona **Guardar evento**.

Solo aparecerán en el selector los calendarios donde tengas permiso para crear.

### 8.1 Estados disponibles

- **Borrador:** todavía no forma parte de la operación confirmada.
- **Pendiente:** requiere seguimiento o confirmación.
- **Confirmado:** ya está acordado.
- **En proceso:** se está ejecutando.
- **Completado:** terminó correctamente.
- **Vencido:** terminó el plazo y continúa sin completar.
- **Cancelado:** ya no se realizará.

### 8.2 Prioridades disponibles

- Baja.
- Normal.
- Alta.
- Urgente.

### 8.3 Conflictos

Mientras completas el horario, responsable, ubicación o recurso, el sistema busca superposiciones. Si encuentra alguna, muestra el evento relacionado, su horario y el motivo.

El conflicto funciona como advertencia y no impide guardar. Antes de continuar, confirma que la coincidencia sea intencional o ajusta el horario, responsable, ubicación o recurso.

## 9. Eventos recurrentes

Al crear un evento puedes elegir una repetición:

- Diaria.
- Semanal.
- Mensual.

Define cada cuántos periodos se repite y la cantidad de ocurrencias, entre 2 y 100. La repetición solo se define durante la creación de la serie.

Al editar o cancelar una ocurrencia existente, usa **Aplicar cambios a**:

- **Solo esta ocurrencia.**
- **Esta y las siguientes.**
- **Toda la serie.**

Revisa este campo antes de guardar o cancelar, ya que determina cuántos eventos serán afectados.

## 10. Editar, consultar o cancelar un evento

### 10.1 Editar

1. Abre el evento desde el resumen, calendario o listado.
2. Modifica los campos necesarios.
3. Si pertenece a una serie, selecciona el alcance del cambio.
4. Revisa los conflictos detectados.
5. Selecciona **Guardar evento**.

### 10.2 Solo lectura

Si puedes consultar el evento pero no modificarlo, el sistema abrirá **Detalle del evento** con los controles deshabilitados. Solicita permisos al administrador si necesitas gestionarlo.

### 10.3 Cancelar

1. Abre un evento que puedas cancelar.
2. En una serie, selecciona primero el alcance.
3. Selecciona **Cancelar evento**.
4. Confirma la acción.

Cancelar conserva el registro con estado cancelado; no equivale a borrarlo físicamente. Si estaba sincronizado con Google, el sistema intentará reflejar la cancelación externa.

## 11. Recordatorios y notificaciones

Si los recordatorios están habilitados, al crear o editar un evento puedes seleccionar:

- 5, 15 o 30 minutos antes.
- 1 hora antes.
- 1 día antes.
- Sin recordatorio.

El icono de campana muestra la cantidad de avisos no leídos. Desde el panel puedes:

- Abrir una notificación relacionada con un evento.
- Marcar avisos como leídos.
- Eliminar una notificación individual.
- Usar **Marcar leídas** para procesarlas todas.
- Usar **Limpiar** y confirmar para eliminar todas las notificaciones.

Las notificaciones del sistema operativo solo aparecen si el administrador habilitó el push local y el navegador recibió autorización. Esta versión requiere que la aplicación permanezca abierta para mostrar esos avisos.

## 12. Reportes

1. Abre **Reportes**.
2. Selecciona las fechas **Desde** y **Hasta**.
3. Selecciona **Actualizar**.

El reporte resume eventos, completados, pendientes, vencidos, cancelados y horas programadas. También presenta:

- **Carga por responsable:** horas asignadas frente a la capacidad disponible.
- **Cumplimiento por calendario:** proporción de eventos completados dentro de cada calendario.

La capacidad utiliza la jornada configurada y solo considera días laborables. Cada usuario ve exclusivamente la información de los calendarios a los que tiene acceso.

## 13. Google Calendar

### 13.1 Conectar una cuenta

La integración debe estar configurada previamente por un administrador.

1. Abre **Integraciones**.
2. Selecciona **Conectar cuenta de Google**.
3. Inicia sesión en Google y concede el acceso solicitado.
4. Regresa al gestor y verifica que la cuenta figure como conectada.

Cada usuario conecta su propia cuenta de Google.

### 13.2 Enviar un evento a Google

Al crear o editar un evento, activa **Marcar para sincronizar con Google Calendar** y guarda. En un evento existente también puedes usar **Sincronizar ahora**.

La columna **Google** y la sección de integraciones muestran si el evento está sincronizado, pendiente o presentó un error.

### 13.3 Importar desde Google

1. Conecta tu cuenta.
2. En **Importar desde Google**, selecciona el calendario interno de destino.
3. Selecciona **Importar eventos ahora**.

La primera importación consulta los eventos existentes del calendario principal de Google. Las siguientes importaciones procesan los cambios posteriores. Los nuevos eventos se crean en el calendario interno elegido; las modificaciones y cancelaciones vinculadas se actualizan localmente.

Un evento con cambios locales pendientes o con error no será sobrescrito durante la importación y puede aparecer como omitido.

### 13.4 Reintentar errores

Si existen elementos pendientes o fallidos, selecciona **Reintentar**. El sistema mostrará cuántos eventos se sincronizaron y cuántos continúan con error.

### 13.5 Desconectar

Selecciona **Desconectar** y confirma. Los eventos internos se conservan; solo se elimina la conexión de la cuenta.

## 14. Administración de calendarios

Esta sección es exclusiva del rol **Administrador**.

### 14.1 Crear un calendario

1. Abre **Administración**.
2. Selecciona **Nuevo calendario**.
3. Indica nombre, descripción y color.
4. Selecciona un departamento o **Toda la empresa**.
5. Define la visibilidad:
   - **Departamento:** disponible para el departamento asociado.
   - **Toda la empresa:** visible para todos los usuarios activos.
   - **Solo autorizados:** exige acceso explícito.
6. Mantén el estado **Activo**.
7. Asigna permisos por usuario.
8. Selecciona **Guardar calendario**.

Conceder Crear, Editar o Cancelar también activa automáticamente el permiso Ver.

### 14.2 Editar o archivar

Selecciona un calendario de la lista para modificar sus datos o permisos. Para retirarlo de la operación, selecciona **Archivar calendario** y vuelve a seleccionar **Confirmar archivado**.

Archivar evita el uso operativo del calendario sin eliminar su historial.

## 15. Administración de usuarios

Esta sección es exclusiva del rol **Administrador**.

### 15.1 Crear un usuario

1. Abre **Administración**.
2. Selecciona **Nuevo usuario**.
3. Completa nombre, correo y contraseña de al menos 8 caracteres.
4. Asigna rol, departamento y estado.
5. Configura el acceso a los calendarios.
6. Selecciona **Guardar usuario**.

Los niveles de acceso desde el perfil son:

- Sin acceso.
- Solo lectura.
- Crear.
- Gestionar, que permite editar y cancelar.

El rol Consulta se limita a lectura. El Administrador accede a todos los calendarios sin asignaciones adicionales.

### 15.2 Editar, desactivar o cambiar contraseña

Selecciona un usuario de la lista. Puedes cambiar sus datos, rol, departamento, estado y accesos. Deja la contraseña vacía para conservarla o escribe una nueva para reemplazarla.

Un usuario **Inactivo** no puede iniciar sesión. El sistema impide que el administrador autenticado se desactive a sí mismo o se quite su propio rol de Administrador.

## 16. Configuración del sistema

Esta sección es exclusiva del rol **Administrador**. Después de realizar cambios, selecciona **Guardar configuración**.

### 16.1 Visualización y jornada

- Cantidad de calendarios visibles en la distribución del resumen.
- Escala de actividades usada por las barras del resumen.
- Vista predeterminada: mes, semana o día.
- Inicio y fin de jornada.
- Intervalos de 15, 30 o 60 minutos.

### 16.2 Avisos

- Activar o desactivar recordatorios.
- Definir la anticipación predeterminada.
- Activar notificaciones internas.
- Establecer cuánto tiempo conservar avisos leídos.
- Habilitar push y autorizar el navegador.

### 16.3 Conflictos

- **Ubicaciones:** avisa cuando dos eventos ocupan el mismo lugar.
- **Salas y recursos:** avisa ante reservas simultáneas del mismo recurso.

### 16.4 Canales externos

El correo y WhatsApp utilizan webhooks configurados por el administrador. Por seguridad, no deben habilitarse en una instalación pública hasta que el responsable técnico haya validado el proveedor, la firma de las solicitudes y las restricciones de red descritas en `deployment.md`.

### 16.5 Modo desarrollador

Permite generar una notificación o simular un recordatorio para comprobar los canales configurados. Debe mantenerse desactivado durante el uso normal.

## 17. Salas y recursos

Los administradores pueden gestionar el inventario desde **Configuración → Salas y recursos**.

1. Selecciona **Nuevo recurso**.
2. Indica el nombre.
3. Elige el tipo: sala, equipo, vehículo u otro.
4. Define su ubicación y estado.
5. Selecciona **Guardar recurso**.

Selecciona un recurso existente para editarlo. Un recurso inactivo deja de estar disponible para nuevas reservas, aunque permanece asociado a los eventos históricos.

## 18. Configuración administrativa de Google

Solo el Administrador puede seleccionar **Configurar** en Integraciones. Debe introducir el Client ID, el Client Secret y la URI de redirección autorizada obtenidos de Google Cloud.

Consideraciones importantes:

- En producción, la URI debe utilizar HTTPS y coincidir exactamente con la registrada en Google Cloud.
- El Client Secret se cifra y no vuelve a mostrarse en el navegador.
- Al editar, deja el secreto vacío para conservar el existente.
- **Restablecer configuración** elimina las credenciales guardadas en la base de datos y vuelve a utilizar las variables del servidor, si existen.

La creación del proyecto de Google Cloud y la preparación del servidor se explican en `README.md` y `deployment.md`.

## 19. Resolución de problemas

### No puedo iniciar sesión

- Verifica el correo y la contraseña.
- Espera unos minutos si realizaste varios intentos fallidos.
- Confirma con el administrador que tu usuario esté activo.
- Si olvidaste la contraseña, solicita que la cambien.

### No aparece el botón Nuevo evento

No tienes permiso para crear en ningún calendario activo. Solicita acceso al administrador.

### Puedo ver un evento, pero no editarlo

Tu acceso es de solo lectura, el evento pertenece a otro usuario o no tienes permiso de edición sobre ese calendario.

### No aparece un calendario

Puede estar archivado, pertenecer a otro departamento, ser privado o no estar asignado a tu usuario.

### El sistema muestra un conflicto

Revisa los horarios y las razones indicadas. Modifica el responsable, ubicación, sala, recurso o rango de tiempo si la superposición no es intencional.

### No recibo notificaciones del navegador

- Confirma que el navegador tenga permiso para mostrar notificaciones.
- Comprueba que el push esté habilitado en Configuración.
- Mantén la aplicación abierta.
- Revisa que el evento tenga recordatorio.

### Google muestra acceso denegado

Si la aplicación OAuth está en modo de prueba, la cuenta debe estar registrada como usuario de prueba en Google Cloud. También confirma que Google Calendar API esté activa y que la URI de redirección coincida exactamente.

### Un evento no se sincroniza con Google

- Confirma que la cuenta siga conectada.
- Comprueba que el evento esté marcado para sincronización.
- Usa **Sincronizar ahora** o **Reintentar**.
- Si el error continúa, comunícalo al administrador.

### La sesión terminó inesperadamente

Por seguridad, las sesiones tienen una duración limitada. Inicia sesión nuevamente. Si ocurre de forma continua, informa al administrador.

## 20. Buenas prácticas

- No compartas tus credenciales.
- Cierra sesión en equipos compartidos.
- Usa títulos claros y descripciones breves pero suficientes.
- Asigna responsable, estado y prioridad para facilitar el seguimiento.
- Revisa los conflictos antes de guardar.
- Verifica el alcance antes de editar o cancelar una serie.
- Archiva calendarios y desactiva usuarios o recursos en lugar de perder el historial.
- No uses el modo desarrollador ni los webhooks sin una necesidad operativa controlada.

## 21. Funciones no disponibles en esta versión

La versión actual no incluye:

- Recuperación automática de contraseña.
- Invitaciones a participantes y confirmación de asistencia.
- Sincronización con Outlook.
- Vista administrativa del registro de auditoría.
- Push remoto con la aplicación completamente cerrada.

Para problemas técnicos de instalación, seguridad, copias de respaldo o publicación, consulta `deployment.md` y `TECHNICAL.md`.
