# Estrategia UX del Gestor Central de Calendarios

## Alcance y nivel de confianza

Este documento aplica el método de `ux-researcher-designer` al MVP actual. La evidencia disponible es:

- El alcance, los roles, las reglas y los flujos descritos en `design_gestor_calendarios.md`.
- La interfaz y los endpoints implementados.
- Los datos de demostración incluidos en el proyecto.

No hay entrevistas, analítica de producto ni pruebas de usabilidad. Por eso los perfiles siguientes son **arquetipos provisionales**, no personas validadas. La confianza es baja y deben revisarse con usuarios reales.

## Arquetipos provisionales

### Coordinador operativo

- Roles relacionados: Administrador y Supervisor.
- Contexto: entra varias veces al día y trabaja principalmente desde escritorio.
- Objetivo: identificar qué requiere atención, asignar responsables y resolver solapamientos.
- Necesita: pasar de una señal del panel a la lista accionable sin reconstruir filtros.
- Riesgo UX: un panel informativo que no permita actuar obliga a buscar manualmente.

### Responsable de ejecución

- Rol relacionado: Empleado.
- Contexto: consulta su carga de trabajo y actualiza eventos propios.
- Objetivo: encontrar rápidamente “lo mío” y saber qué ocurre hoy.
- Necesita: un filtro directo por responsabilidad y resultados fáciles de revisar.
- Riesgo UX: una lista global aumenta el tiempo de búsqueda y la posibilidad de actuar sobre el evento incorrecto.

### Administrador de integraciones

- Rol relacionado: Administrador.
- Contexto: configura OAuth con poca frecuencia y necesita seguridad y recuperación claras.
- Objetivo: configurar, conectar y comprobar el estado de Google Calendar.
- Necesita: distinguir configuración del proveedor, conexión de cuenta y estado de sincronización.
- Riesgo UX: mezclar esas tres etapas hace difícil diagnosticar en qué punto falló la integración.

### Usuario de consulta

- Rol relacionado: Consulta.
- Contexto: visita ocasionalmente el sistema para localizar información.
- Objetivo: encontrar un evento por nombre, calendario, responsable o estado.
- Necesita: búsqueda visible, filtros reversibles y ausencia de acciones no permitidas.
- Riesgo UX: demasiadas acciones de edición reducen confianza y claridad.

## Journeys críticos

### 1. Atender una señal del resumen

1. El usuario ve “Vencidos”, “Sin responsable” o “Conflictos”.
2. Abre el conjunto exacto de eventos implicados.
3. Revisa el contexto del filtro activo y la cantidad de resultados.
4. Edita el evento.
5. Limpia el filtro y vuelve al registro completo.

Resultado esperado: un clic desde el indicador hasta una lista explicable y reversible.

### 2. Crear o reprogramar un evento

1. El usuario define título, horario y responsable.
2. El sistema revisa el rango antes de guardar.
3. Si hay solapamientos, muestra cuáles son y cuándo ocurren.
4. El usuario decide si reprograma o continúa, porque el conflicto es una advertencia.
5. El sistema guarda y confirma el resultado.

Resultado esperado: prevenir errores antes de la acción, sin bloquear el flujo permitido por el diseño.

### 3. Consultar la agenda propia

1. El usuario abre Eventos.
2. Selecciona “Mis eventos”.
3. Combina ese alcance con búsqueda, calendario o estado.
4. Revisa el número de resultados.
5. Limpia todos los criterios con una sola acción.

Resultado esperado: reducir el tiempo para localizar trabajo propio y mantener visibles los criterios aplicados.

## Hallazgos priorizados

| Prioridad | Hallazgo | Impacto | Decisión |
| --- | --- | --- | --- |
| P0 | La lista filtrada reemplaza el conjunto usado por el calendario | El calendario puede ocultar eventos sin explicar por qué | Separar el estado de lista y calendario |
| P0 | Los conflictos aparecen después de guardar | El usuario descubre tarde un problema prevenible | Previsualizar conflictos dentro del editor |
| P1 | Los indicadores del resumen no son accionables | Se pierde el contexto y se repite trabajo de filtrado | Convertirlos en accesos a listas filtradas |
| P1 | No existe búsqueda ni acceso directo a eventos propios | Localizar tareas requiere escaneo manual | Añadir búsqueda y filtro de responsabilidad |
| P1 | Los filtros no muestran alcance ni ofrecen limpieza global | Es fácil olvidar por qué faltan resultados | Mostrar contexto, conteo y acción “Limpiar” |
| P2 | Los permisos deben explicarse sin convertir cada pantalla en una matriz técnica | Un usuario puede confundir “ver” con “editar” | Mostrar eventos sin permiso como detalle de solo lectura y reservar la matriz completa para Administración |
| P2 | Cancelar depende de una confirmación nativa y no ofrece recuperación | Recuperación débil ante errores | Diseñar cancelación reversible en una iteración posterior |

## Criterios de validación

- Cada indicador del resumen abre la lista con el criterio correcto.
- Filtrar la lista no cambia los eventos mostrados en el calendario.
- “Mis eventos” usa el usuario autenticado, no un nombre escrito en el cliente.
- La búsqueda funciona sobre título y descripción.
- El sistema avisa de conflictos antes de guardar y sigue permitiendo continuar.
- El usuario puede ver cuántos resultados hay y limpiar todos los filtros con una acción.

## Próxima investigación recomendada

Realizar cinco pruebas moderadas: dos supervisores, dos empleados y un administrador. Tareas: atender un vencido, asignar un evento sin responsable, reprogramar ante un conflicto, localizar un evento propio y conectar Google Calendar. Medir éxito, tiempo, retrocesos y dudas verbales. Esa evidencia permitirá reemplazar estos arquetipos provisionales por patrones reales.
