<#
Administrador local del proyecto.

Uso interactivo:
  .\scripts\manage.ps1

Uso directo:
  .\scripts\manage.ps1 -Action status
  .\scripts\manage.ps1 -Action start-server
  .\scripts\manage.ps1 -Action reset-blank -Force
  .\scripts\manage.ps1 -Action seed-demo
#>
param(
  [ValidateSet(
    'help',
    'status',
    'backup-db',
    'delete-db',
    'reset-blank',
    'seed-demo',
    'create-admin',
    'install-shortcut',
    'stop-server',
    'start-server'
  )]
  [string]$Action,

  [switch]$Force
)

# param() debe ser la primera instrucción del script: cualquier línea anterior
# hace que PowerShell lo trate como un comando desconocido y descarte -Action.
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

function Get-ProjectRoot {
  Split-Path -Parent $PSScriptRoot
}

function Get-ServerProcesses {
  Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object {
      $_.CommandLine -and
      $_.CommandLine -match 'src[\\/]+server\.js'
    }
}

function Get-DbFiles {
  $dataDir = Join-Path (Get-ProjectRoot) 'data'

  if (-not (Test-Path $dataDir)) {
    return @()
  }

  @(
    Get-ChildItem `
      -Path $dataDir `
      -Filter 'calendar-manager.sqlite*' `
      -File `
      -ErrorAction SilentlyContinue
  )
}

function Show-Help {
  Write-Host "`nADMINISTRADOR DEL PROYECTO" -ForegroundColor Cyan
  Write-Host "--------------------------"

  Write-Host "1. Estado"
  Write-Host "   Muestra el servidor y los archivos de la base de datos."

  Write-Host "`n2. Iniciar servidor"
  Write-Host "   Ejecuta npm start si el servidor no esta activo."

  Write-Host "`n3. Detener servidor"
  Write-Host "   Cierra los procesos asociados a src/server.js."

  Write-Host "`n4. Respaldar base de datos"
  Write-Host "   Copia la base de datos en data/backups."

  Write-Host "`n5. Eliminar base de datos"
  Write-Host "   Borra SQLite y sus archivos auxiliares."

  Write-Host "`n6. Reiniciar en blanco"
  Write-Host "   Detiene el servidor, respalda y borra la base. Al arrancar queda sin usuarios."

  Write-Host "`n7. Cargar datos de demostracion"
  Write-Host "   Crea usuarios, calendarios y eventos de ejemplo (admin@empresa.com / Demo123!)."

  Write-Host "`n8. Crear administrador"
  Write-Host "   Registra o restablece una cuenta de Administrador."

  Write-Host "`n9. Crear acceso directo"
  Write-Host "   Pone un icono en el escritorio que abre la aplicacion con doble clic."

  Write-Host "`n0. Salir"
}

function Show-Status {
  $root = Get-ProjectRoot
  $dbFiles = @(Get-DbFiles)
  $processes = @(Get-ServerProcesses)

  Write-Host "`nESTADO DEL PROYECTO" -ForegroundColor Cyan
  Write-Host "Ruta: $root"

  if ($processes.Count -gt 0) {
    Write-Host "Servidor: ACTIVO" -ForegroundColor Green

    foreach ($process in $processes) {
      Write-Host "  PID: $($process.ProcessId)"
    }
  }
  else {
    Write-Host "Servidor: DETENIDO" -ForegroundColor Yellow
  }

  if ($dbFiles.Count -gt 0) {
    Write-Host "Base de datos: ENCONTRADA" -ForegroundColor Green

    foreach ($file in $dbFiles) {
      $sizeKb = [math]::Round($file.Length / 1KB, 2)
      Write-Host ('  {0} - {1} KB' -f $file.Name, $sizeKb)
    }
  }
  else {
    Write-Host "Base de datos: NO ENCONTRADA" -ForegroundColor Yellow
  }
}

function Backup-Db {
  $files = @(Get-DbFiles)

  if ($files.Count -eq 0) {
    Write-Host "No hay base de datos para respaldar." -ForegroundColor Yellow
    return
  }

  $backupDir = Join-Path (Get-ProjectRoot) 'data\backups'
  New-Item -ItemType Directory -Path $backupDir -Force | Out-Null

  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'

  foreach ($file in $files) {
    $destination = Join-Path $backupDir "$($file.Name).$stamp.bak"
    Copy-Item $file.FullName $destination -Force

    Write-Host "Respaldo creado:" -ForegroundColor Green
    Write-Host "  $destination"
  }
}

function Delete-Db {
  $files = @(Get-DbFiles)

  if ($files.Count -eq 0) {
    Write-Host "No hay base de datos para eliminar." -ForegroundColor Yellow
    return
  }

  if (-not $Force) {
    Write-Host "`nSe eliminarán:" -ForegroundColor Red
    $files | ForEach-Object { Write-Host "  $($_.FullName)" }

    $confirmation = Read-Host "Escribe ELIMINAR para confirmar"

    if ($confirmation -cne 'ELIMINAR') {
      Write-Host "Operación cancelada."
      return
    }
  }

  $files | Remove-Item -Force
  Write-Host "Base de datos eliminada." -ForegroundColor Green
}

function Invoke-Npm {
  param([string[]]$Arguments)

  $npm = Get-Command npm.cmd -ErrorAction SilentlyContinue

  if (-not $npm) {
    Write-Host "No se encontró npm. Verifica Node.js." -ForegroundColor Red
    return
  }

  & $npm.Source @Arguments
}

function Reset-Blank {
  Stop-Server
  Backup-Db
  Delete-Db

  Write-Host "`nLa próxima vez que inicies el servidor la base quedará sin usuarios," -ForegroundColor Cyan
  Write-Host "salvo el administrador definido en INITIAL_ADMIN_EMAIL / INITIAL_ADMIN_PASSWORD."
}

function Seed-Demo {
  Invoke-Npm @('run', 'seed:demo')
}

function Create-Admin {
  $email = Read-Host 'Correo del administrador'
  $secure = Read-Host 'Contraseña (mínimo 12 caracteres)' -AsSecureString
  $name = Read-Host 'Nombre (opcional)'

  if (-not $email -or -not $secure) {
    Write-Host "Operación cancelada." -ForegroundColor Yellow
    return
  }

  $password = [System.Net.NetworkCredential]::new('', $secure).Password
  $arguments = @('run', 'create-admin', '--', '--email', $email, '--password', $password)

  if ($name) {
    $arguments += @('--name', $name)
  }

  if ($Force) {
    $arguments += '--force'
  }

  Invoke-Npm $arguments
}

function Install-Shortcut {
  $script = Join-Path $PSScriptRoot 'install-shortcut.ps1'

  if ($Force) {
    & $script -Startup
  }
  else {
    & $script
  }
}

function Stop-Server {
  $processes = @(Get-ServerProcesses)

  if ($processes.Count -eq 0) {
    Write-Host "El servidor ya está detenido." -ForegroundColor Yellow
    return
  }

  foreach ($process in $processes) {
    Stop-Process -Id $process.ProcessId -Force
    Write-Host "Proceso $($process.ProcessId) detenido." -ForegroundColor Green
  }
}

function Start-Server {
  if (@(Get-ServerProcesses).Count -gt 0) {
    Write-Host "El servidor ya está ejecutándose." -ForegroundColor Yellow
    return
  }

  $npm = Get-Command npm.cmd -ErrorAction SilentlyContinue

  if (-not $npm) {
    Write-Host "No se encontró npm. Verifica Node.js." -ForegroundColor Red
    return
  }

  Start-Process `
    -FilePath $npm.Source `
    -ArgumentList 'start' `
    -WorkingDirectory (Get-ProjectRoot) `
    -WindowStyle Minimized

  Write-Host "Servidor iniciado." -ForegroundColor Green
}

function Invoke-Action {
  param([string]$SelectedAction)

  switch ($SelectedAction) {
    'help'         { Show-Help }
    'status'       { Show-Status }
    'backup-db'    { Backup-Db }
    'delete-db'    { Delete-Db }
    'reset-blank'  { Reset-Blank }
    'seed-demo'    { Seed-Demo }
    'create-admin' { Create-Admin }
    'install-shortcut' { Install-Shortcut }
    'stop-server'  { Stop-Server }
    'start-server' { Start-Server }
  }
}

if ($Action) {
  Invoke-Action $Action
  exit
}

do {
  Clear-Host
  Show-Help
  $option = Read-Host "`nSelecciona una opción"

  # Sin consola interactiva Read-Host devuelve vacío: se sale en lugar de repetir.
  if ($null -eq $option -or $option -eq '') {
    return
  }

  switch ($option) {
    '1' { Show-Status }
    '2' { Start-Server }
    '3' { Stop-Server }
    '4' { Backup-Db }
    '5' { Delete-Db }
    '6' { Reset-Blank }
    '7' { Seed-Demo }
    '8' { Create-Admin }
    '9' { Install-Shortcut }
    '0' { return }
    default {
      Write-Host "Opción inválida." -ForegroundColor Red
    }
  }

  Write-Host
  Read-Host 'Presiona Enter para continuar'
}
while ($true)