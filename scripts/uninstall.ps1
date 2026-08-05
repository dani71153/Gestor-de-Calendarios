<#
Desinstala la aplicación de este equipo.

  .\scripts\uninstall.ps1                        # interactivo, pregunta qué quitar
  .\scripts\uninstall.ps1 -RemoveData -Force     # desatendido, quita también los datos

Por omisión solo detiene el servidor, elimina los accesos directos y borra
node_modules. La base de datos y el .env se conservan salvo que se pidan
expresamente: contienen los datos de la empresa y las claves de cifrado.

Antes de borrar la base se guarda una copia fuera de la carpeta del proyecto,
en Documentos, para que un -Force no destruya la única copia existente.

No desinstala Node.js ni borra la carpeta del proyecto: de eso te encargas tú
cuando ya no la necesites.
#>
[CmdletBinding()]
param(
  [switch]$RemoveData,
  [switch]$RemoveEnv,
  [switch]$KeepModules,
  [switch]$NoBackup,
  [switch]$Force
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$dataDir = Join-Path $root 'data'
$envPath = Join-Path $root '.env'
$modulesPath = Join-Path $root 'node_modules'
$shortcutName = 'Gestor de Calendarios.lnk'
$unattended = [bool]$Force

function Write-Step {
  param([string]$Title)
  Write-Host "`n$Title" -ForegroundColor Cyan
}

function Write-Ok {
  param([string]$Message)
  Write-Host "  $Message" -ForegroundColor Green
}

function Write-Info {
  param([string]$Message)
  Write-Host "  $Message" -ForegroundColor DarkGray
}

function Confirm-Action {
  param(
    [string]$Question,
    [bool]$DefaultYes = $false
  )

  if ($unattended) {
    return $false
  }

  if ($DefaultYes) {
    $suffix = '(S/n)'
  }
  else {
    $suffix = '(s/N)'
  }

  $answer = Read-Host "  $Question $suffix"

  if ([string]::IsNullOrWhiteSpace($answer)) {
    return $DefaultYes
  }

  return $answer -match '^[sSyY]'
}

function Get-DbFiles {
  if (-not (Test-Path $dataDir)) {
    return @()
  }

  @(Get-ChildItem -Path $dataDir -Filter 'calendar-manager.sqlite*' -File -ErrorAction SilentlyContinue)
}

Write-Host "`nDESINSTALACIÓN DEL GESTOR DE CALENDARIOS" -ForegroundColor Cyan
Write-Host '----------------------------------------'
Write-Info "Carpeta: $root"

# ------------------------------------------------------------- Detener servidor
Write-Step 'Deteniendo el servidor'

$processes = @(
  Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -and $_.CommandLine -match 'src[\\/]+server\.js' }
)

if ($processes.Count -eq 0) {
  Write-Info 'No había ningún servidor en ejecución.'
}
else {
  foreach ($process in $processes) {
    Stop-Process -Id $process.ProcessId -Force
    Write-Ok "Proceso $($process.ProcessId) detenido"
  }
}

# ------------------------------------------------------------ Tarea de respaldo
Write-Step 'Eliminando la tarea de respaldo programada'

try {
  & (Join-Path $PSScriptRoot 'manage.ps1') -Action remove-backup-task
}
catch {
  Write-Info "No se pudo eliminar la tarea: $($_.Exception.Message)"
}

# ----------------------------------------------------------- Accesos directos
Write-Step 'Eliminando los accesos directos'

$shortcuts = @(
  (Join-Path ([Environment]::GetFolderPath('Desktop')) $shortcutName),
  (Join-Path ([Environment]::GetFolderPath('Startup')) $shortcutName)
)

$removedShortcuts = 0
foreach ($shortcut in $shortcuts) {
  if (Test-Path $shortcut) {
    Remove-Item $shortcut -Force
    Write-Ok "Eliminado: $shortcut"
    $removedShortcuts++
  }
}

if ($removedShortcuts -eq 0) {
  Write-Info 'No se encontraron accesos directos.'
}

# ------------------------------------------------------------- node_modules
Write-Step 'Dependencias instaladas'

if (-not (Test-Path $modulesPath)) {
  Write-Info 'node_modules no existe.'
}
elseif ($KeepModules) {
  Write-Info 'Se conserva node_modules por -KeepModules.'
}
else {
  # Se recuperan con npm install, así que no requieren confirmación.
  Remove-Item $modulesPath -Recurse -Force
  Write-Ok 'node_modules eliminado (se recupera con npm install)'
}

# --------------------------------------------------------------------- .env
Write-Step 'Configuración (.env)'

$envExists = $false
$dropEnv = $false

if (-not (Test-Path $envPath)) {
  Write-Info 'No hay ningún .env.'
}
else {
  $envExists = $true
  $dropEnv = $RemoveEnv

  if (-not $dropEnv -and -not $unattended) {
    Write-Info 'Contiene INTEGRATION_ENCRYPTION_KEY. Sin esa clave, los tokens de'
    Write-Info 'Google ya guardados dejan de poder descifrarse.'
    $dropEnv = Confirm-Action -Question '¿Eliminar el .env?'
  }

  # El borrado se aplica al final: si también se elimina la base, el respaldo de
  # seguridad debe poder incluir este archivo con la clave de cifrado.
  if (-not $dropEnv) {
    Write-Info 'Se conserva el .env.'
  }
}

# ---------------------------------------------------------------- Base de datos
Write-Step 'Base de datos'

$dbFiles = @(Get-DbFiles)

if ($dbFiles.Count -eq 0) {
  Write-Info 'No hay base de datos.'
}
else {
  $sizeKb = [math]::Round((($dbFiles | Measure-Object -Property Length -Sum).Sum) / 1KB, 2)
  Write-Info "$($dbFiles.Count) archivo(s), $sizeKb KB en total."

  $dropData = $RemoveData

  if (-not $dropData -and -not $unattended) {
    Write-Host '  Contiene los calendarios, eventos y usuarios de la empresa.' -ForegroundColor Yellow
    $dropData = Confirm-Action -Question '¿Eliminar la base de datos?'
  }

  if (-not $dropData) {
    Write-Info 'Se conserva la base de datos.'
  }
  else {
    if ($NoBackup) {
      Write-Info 'Copia de seguridad omitida por -NoBackup.'
    }
    else {
      # La copia va fuera del proyecto: si se borra la carpeta entera después,
      # el respaldo sobrevive.
      $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
      $backupDir = Join-Path ([Environment]::GetFolderPath('MyDocuments')) "gestor-calendarios-respaldo-$stamp"
      New-Item -ItemType Directory -Path $backupDir -Force | Out-Null

      foreach ($file in $dbFiles) {
        Copy-Item $file.FullName (Join-Path $backupDir $file.Name) -Force
      }

      if (Test-Path $envPath) {
        Copy-Item $envPath (Join-Path $backupDir '.env') -Force
      }

      Write-Ok "Copia guardada en: $backupDir"
    }

    if (-not $unattended) {
      $typed = Read-Host '  Escribe ELIMINAR para confirmar el borrado'
      if ($typed -cne 'ELIMINAR') {
        Write-Host '  Cancelado: la base de datos no se ha tocado.' -ForegroundColor Yellow
        $dropData = $false
      }
    }

    if ($dropData) {
      $dbFiles | Remove-Item -Force
      $backupsDir = Join-Path $dataDir 'backups'
      if (Test-Path $backupsDir) {
        Remove-Item $backupsDir -Recurse -Force
        Write-Ok 'Respaldos internos eliminados'
      }
      Write-Ok 'Base de datos eliminada'
    }
  }
}

# ------------------------------------------------- Borrado diferido del .env
if ($envExists -and $dropEnv) {
  Remove-Item $envPath -Force
  Write-Step 'Configuración (.env)'
  Write-Ok '.env eliminado'
}

# ------------------------------------------------------------------- Resumen
Write-Host "`n----------------------------------------" -ForegroundColor Cyan
Write-Host 'DESINSTALACIÓN COMPLETA' -ForegroundColor Green

$pending = @()
if (Test-Path $envPath) { $pending += '.env' }
if (@(Get-DbFiles).Count -gt 0) { $pending += 'la base de datos' }

if ($pending.Count -gt 0) {
  Write-Host "`nSe conservan $($pending -join ' y '). Para reinstalar:" -ForegroundColor Yellow
  Write-Host '  .\scripts\install.ps1'
}
else {
  Write-Host "`nNo queda ningún dato de la aplicación en este equipo."
}

Write-Host "`nNode.js y la carpeta del proyecto siguen instalados: bórralos a mano si ya no los necesitas.`n"
