# Mejoras de calidad de vida

Lista de mejoras que no añaden funciones nuevas al producto, sino que reducen fricción en el uso diario. Cada una indica qué problema resuelve, qué haría falta y qué hay ya construido que la abarata.

Las decisiones estructurales viven en [`docs/adr/`](docs/adr/); esto es otra cosa: trabajo pendiente, ordenado por lo que aporta frente a lo que cuesta.

## Estado

| # | Mejora | Estado |
| --- | --- | --- |
| 1 | Pegar imágenes con `Ctrl+V` | **Hecho** |
| 2 | Arrastrar archivos al evento | **Hecho** |
| 3 | Deshacer la cancelación | Pendiente |
| 4 | Conservar el borrador del formulario | Pendiente |
| 5 | Duplicar evento | Pendiente |
| 6 | Atajos de teclado | Pendiente |
| 7 | Imprimir o exportar la agenda | Pendiente |
| 8 | Acciones en lote | Pendiente |
| 9 | Pautas visibles del calendario | **Hecho** |
| 10 | Avisar antes de descartar cambios | **Hecho** |

---

## 1. Pegar imágenes con `Ctrl+V` — hecho

**Problema.** Adjuntar un flyer que llega por Instagram exigía cuatro pasos: captura, guardar el archivo, pulsar *Añadir archivo*, buscarlo en el diálogo.

**Cómo quedó.** Con el evento abierto, `Ctrl+V` adjunta lo que haya en el portapapeles. Funciona igual en un evento nuevo —queda en espera hasta guardar— que en uno ya guardado, y admite varias imágenes de una vez.

El manejador vive en `document` y no en el modal: cuando el foco está en un punto neutro, el evento `paste` nace en `body` y no llegaría a burbujear hasta el modal. Solo actúa si el portapapeles trae archivos, así que pegar texto en la descripción sigue funcionando con normalidad, y no hace nada con el modal cerrado o en modo consulta.

**La trampa, resuelta del todo.** El portapapeles entrega siempre `image.png`. Se renombra con el título del evento y la fecha: `promocion-semana-santa-2026-08-06-094352.png`. La primera versión usaba resolución de minutos y **dos pegados seguidos compartían nombre**; ahora lleva segundos y, además, comprueba los nombres ya usados y añade un sufijo. Verificado con tres pegados en el mismo segundo.

Sin título escrito todavía, el nombre empieza por `pegado-`.

## 2. Arrastrar archivos al evento — hecho

**Problema.** Cuando el flyer ya estaba descargado, había que pasar igualmente por el diálogo de archivos.

**Cómo quedó.** Arrastrar uno o varios archivos sobre el evento los adjunta. Mientras se arrastra encima, el panel se realza con un borde discontinuo. Conservan su nombre original —que es información útil, a diferencia del `image.png` del portapapeles— y solo se desambigua con un sufijo cuando ya existe otro igual en el mismo evento.

**Cómo convive con el arrastre del calendario.** El calendario usa `dragstart`, `dragover` y `drop` para reprogramar eventos, sobre `.time-event` y `.time-day-column`. Los manejadores nuevos comprueban que el arrastre traiga **archivos** (`dataTransfer.types` incluye `Files`), lo que separa ambos casos sin depender de qué elemento escuche. Verificado que reprogramar arrastrando sigue funcionando.

**Detalle que evita un disgusto.** Soltar un archivo fuera del modal hacía que el navegador lo abriera, perdiendo todo lo escrito. Un guard en `document` ignora esos soltados, y por la misma comprobación de `Files` no toca los arrastres internos del calendario.

**Trampa del realce.** `dragleave` salta también al pasar sobre los elementos hijos, así que quitar el realce en ese evento lo haría parpadear. Se cuenta la profundidad de entradas y salidas.

## 3. Deshacer la cancelación

**Problema.** Cancelar un evento pide confirmación con un `confirm()`, y quien acepta por inercia lo pierde. Desde la interfaz no hay vuelta atrás.

**Qué haría falta.** Una acción *Deshacer* en el aviso durante unos segundos, y una ruta que reponga el evento.

**Lo que abarata.** Cancelar es un **borrado reversible**: [`events.js`](src/events.js) marca `deleted_at` y `status = 'canceled'`, pero la fila permanece intacta con sus adjuntos y su recordatorio. Restaurar es un `UPDATE` que ponga `deleted_at = NULL` y devuelva el estado anterior.

**A decidir.** Qué estado recuperar. El anterior a la cancelación no se guarda en ningún sitio; habría que registrarlo o asumir `pending`.

## 4. Conservar el borrador del formulario

**Problema.** Si el modal se cierra sin querer —`Escape`, un clic fuera— se pierde todo lo escrito. Con eventos largos, con descripción y adjuntos en espera, duele.

**Qué haría falta.** Guardar los valores del formulario en `localStorage` mientras se escribe y ofrecer recuperarlos al reabrir un evento nuevo.

**A decidir.** Los archivos en espera no se pueden serializar a `localStorage`. O se avisa de que los adjuntos no se conservan, o se descarta el borrador cuando los hay.

**Relación con la 10.** Avisar antes de descartar ya evita la pérdida accidental. Esta seguiría teniendo sentido para el cierre del navegador o un corte de luz, pero deja de ser urgente.

## 5. Duplicar evento

**Problema.** Las reservas se repiten con variaciones que no encajan en una serie formal: mismo cliente, otro día, otro importe. Hoy hay que reescribirlo todo.

**Qué haría falta.** Un botón *Duplicar* en el modal que abra uno nuevo con los mismos valores y las fechas desplazadas, sin `id` —cuidado con esto, ver la nota al final— y sin adjuntos.

## 6. Atajos de teclado

**Problema.** Cada acción frecuente exige apuntar y hacer clic.

**Qué haría falta.** `N` para nuevo evento, `/` para enfocar la búsqueda. `Escape` ya cierra modales y el desplegable de compartir.

**Cuidado.** Los atajos no deben dispararse mientras se escribe en un campo. Hace falta comprobar `event.target` antes de actuar.

## 7. Imprimir o exportar la agenda

**Problema.** No hay forma de sacar los datos de la aplicación. Ni imprimir el día ni mandar la lista por correo.

**Qué haría falta.** Una hoja de estilos `@media print` que oculte la navegación y los controles, y una exportación a CSV del listado con los filtros aplicados.

**Nota.** El CSV es también una salida de emergencia: si algún día hay que abandonar la aplicación, los datos se llevan consigo.

## 8. Acciones en lote

**Problema.** Marcar diez eventos como completados exige abrir diez veces el modal.

**Qué haría falta.** Casillas de selección en el listado y una barra de acciones para cambiar estado o responsable a varios a la vez.

**Cuidado.** Cada evento tiene sus propios permisos. La acción debe aplicarse solo a los que la persona puede editar, e informar de los que se omitieron en vez de fallar entera.

## 9. Pautas visibles del calendario — hecho

**Problema.** Los calendarios y los tipos de evento tienen un campo de descripción que se rellena al crearlos, pero **no se mostraba en ninguna parte**. Las pautas escritas ahí no llegaban a quien registra los eventos.

**Cómo quedó.** Un botón de ayuda junto al selector de calendario, que solo aparece si ese calendario tiene pautas escritas. Se abren solas la primera vez que ese navegador las encuentra y quedan plegadas después.

La primera versión las mostraba de forma permanente e incluía también la descripción del tipo de evento. Se sentía recargado, y con razón: las descripciones de los tipos son relleno del catálogo que repite la etiqueta —«Entrega» → «Entrega de documentos»—, así que la mitad del bloque no decía nada. Se quitaron.

Fue solo frontend: `/api/calendars` ya devolvía `description`; nadie la pintaba.

## 10. Avisar antes de descartar cambios — hecho

**Problema.** El modal de evento se cerraba sin más al pulsar fuera, con `Escape` o con *Cerrar*, descartando en silencio todo lo escrito. Bastaba un clic mal puesto para perder un evento a medio redactar.

**Cómo quedó.** Al cerrar con cambios sin guardar pide confirmación. Si hay imágenes pegadas todavía sin subir, el aviso lo menciona expresamente, porque esas se pierden aunque el resto pudiera recuperarse.

**Cómo se detecta.** Se toma una foto del formulario serializado al abrirlo y se compara al cerrar. Comparar contra «campos vacíos» no habría servido: en un evento nuevo las fechas y el recordatorio ya vienen puestos, y en uno existente lo sucio es cualquier desvío de lo cargado. La misma comparación cubre los dos casos.

**Qué no pregunta.** El modo consulta —nada que perder—, y los cierres automáticos tras guardar, cancelar o sincronizar, que siguen usando `closeEventModal()` mientras los cierres iniciados por la persona pasan por `requestCloseEventModal()`.

Verificados los siete caminos: abrir y cerrar sin tocar nada, cerrar con texto escrito cancelando y aceptando, cerrar con una imagen pegada, evento existente sin modificar y modificado, y guardar sin que pregunte nada.

---

## Nota transversal

Al implementar cualquiera de estas, cuidado con el campo oculto `id` del formulario. En un `<input type="hidden">` asignar `.value` escribe el **atributo**, así que `form.reset()` no lo limpia. Ese detalle provocó que crear un evento tras abrir otro sobrescribiera el anterior. Está resuelto en `resetForm()`, y cualquier flujo nuevo que reutilice el formulario —duplicar, por ejemplo— debe pasar por ahí.
