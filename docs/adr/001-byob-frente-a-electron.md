# ADR 001 — BYOB frente a runtime empaquetado

## Estado

Aceptada — 2026-08-04.

## Contexto

La aplicación debía instalarse en el PC de una persona de la empresa para empezar a usarse de inmediato, mientras se resolvía el alojamiento definitivo. El requisito expresado fue que se comportara como «una app normal»: un icono, doble clic, sin terminal a la vista.

El punto de partida condiciona la decisión:

- el backend ya es un servidor HTTP local (Express) que sirve un frontend estático;
- la única dependencia externa es `express`; el resto son módulos nativos de Node, incluida la base de datos vía `node:sqlite`;
- no hay compilación de binarios nativos, de modo que la aplicación es portable copiando la carpeta;
- la integración con Google Calendar es opcional y no participa de esta decisión.

En el horizonte previsto, unas diez personas usarían la aplicación. La instalación inicial es para una sola, pero las demás se conectarían al mismo equipo por red.

## Alternativas consideradas

### A. BYOB — *Bring Your Own Browser*

La aplicación sirve su interfaz en `localhost` y se abre en el navegador que el usuario ya tiene instalado. Un acceso directo arranca el servidor sin consola y abre la URL.

Es el enfoque de Jupyter, Syncthing, Home Assistant o el Web UI de qBittorrent.

### B. Electron

Runtime empaquetado con Chromium propio. Da ventana nativa, icono e instalador.

Requiere resolver tres puntos del código, que hoy asumen que el proyecto se ejecuta desde su carpeta de origen:

- [`config.js:4`](../../src/config.js#L4) — `rootDir` se calcula desde `__dirname`, que empaquetado apunta dentro del `asar`, de solo lectura.
- [`config.js:86`](../../src/config.js#L86) — `databasePath` se resuelve relativo a `rootDir`; instalado en `Program Files` fallaría por permisos. Debe apuntar a `app.getPath('userData')`.
- [`config.js:5-9`](../../src/config.js#L5-L9) — el `.env` se lee desde `rootDir` y no existirá empaquetado; la configuración debe inyectarse como variables de entorno desde el proceso principal.

Los tres se resuelven en el `main.js` de Electron. El coste real no está ahí, sino en el pipeline de empaquetado y distribución.

### C. Node SEA — *Single Executable Application*

Ejecutable único nativo de Node 24, sin Chromium. Descartada por quedar en tierra de nadie: exige bundler y empaquetado como Electron, pero sigue abriendo el navegador para la interfaz, así que no aporta la ventana propia que motivaría el esfuerzo.

### D. Tauri

Runtime empaquetado sobre el WebView del sistema. Descartada porque exige toolchain de Rust y no evita mantener el servidor Node aparte.

## Decisión

Se adopta **BYOB**: acceso directo de escritorio que ejecuta [`scripts/start-app.ps1`](../../scripts/start-app.ps1), el cual levanta el servidor con ventana oculta, espera a que `/api/health` responda y abre el navegador predeterminado.

El argumento determinante no es el coste, sino el encaje con la arquitectura real: **el navegador ya era la interfaz para todos los usuarios menos uno**. Si varias personas se conectan al equipo que hace de servidor, todas usan el navegador de todos modos. Electron solo habría cambiado la forma en que abre la aplicación quien se sienta delante de esa máquina, dejando intacto el reparto de responsabilidades.

## Consecuencias

### A favor

- Cero dependencias nuevas. Sin `electron`, sin `electron-builder`, sin bundler.
- Sin pipeline de empaquetado ni distribución de instaladores.
- Sin los 200 MB de Chromium por instalación.
- Sin aviso de SmartScreen, que un instalador sin firma digital dispararía.
- El código sigue asumiendo ejecución desde su carpeta, sin las tres adaptaciones de rutas.
- La instalación se reduce a copiar la carpeta y ejecutar [`scripts/install.ps1`](../../scripts/install.ps1).

### En contra

- **El icono es el de Node.js.** El proyecto no incluye un `.ico`, y Windows no acepta el `public/favicon.svg` en accesos directos.
- **Hay un parpadeo breve de consola al arrancar.** El acceso directo se crea minimizado y PowerShell se invoca oculto, que es lo máximo alcanzable sin recurrir a VBScript, tecnología en retirada en Windows 11.
- La aplicación vive en una pestaña del navegador, no en una ventana propia.
- El usuario puede cerrar la pestaña sin detener el servidor, que sigue en segundo plano.

### Neutras

- La arquitectura no cambia: el equipo donde se instala sigue siendo el servidor para los demás. Electron tampoco lo habría cambiado.
- El trabajo hecho se conserva si más adelante se empaqueta: `.env`, cuenta de administrador y base de datos se reaprovechan sin cambios.

## Revisión

Conviene reconsiderar esta decisión si se cumple alguna condición:

- la aplicación se distribuye a equipos que no administra la empresa, donde el parpadeo de consola y el icono genérico pesan más;
- se requiere integración con el sistema operativo que el navegador no ofrece, como notificaciones nativas con la aplicación cerrada, bandeja del sistema o inicio como servicio;
- deja de haber un equipo central y cada persona necesita una instalación independiente.

El seguimiento está anotado en la sección **Mejoras a futuro** del [README](../../README.md).
