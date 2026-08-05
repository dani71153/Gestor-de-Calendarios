<#
Arranca el servidor sin ventana de consola y abre la aplicación en el navegador.

Pensado para ejecutarse desde el acceso directo que crea install-shortcut.ps1,
no a mano. Si el servidor ya está activo, solo abre el navegador.
#>
[CmdletBinding()]
param(
  [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'

function Get-ProjectRoot {
  Split-Path -Parent $PSScriptRoot
}

function Show-Error {
  param([string]$Message)

  Add-Type -AssemblyName System.Windows.Forms
  [System.Windows.Forms.MessageBox]::Show(
    $Message,
    'Gestor de Calendarios',
    [System.Windows.Forms.MessageBoxButtons]::OK,
    [System.Windows.Forms.MessageBoxIcon]::Error
  ) | Out-Null
}

function Get-ConfiguredPort {
  param([string]$Root)

  $envFile = Join-Path $Root '.env'
  if (Test-Path $envFile) {
    foreach ($line in Get-Content $envFile) {
      if ($line -match '^\s*PORT\s*=\s*(\d+)\s*$') {
        return [int]$Matches[1]
      }
    }
  }

  return 3000
}

function Get-ServerProcesses {
  Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object {
      $_.CommandLine -and
      $_.CommandLine -match 'src[\\/]+server\.js'
    }
}

function Test-ServerReady {
  param([int]$Port)

  try {
    $response = Invoke-WebRequest `
      -Uri "http://localhost:$Port/api/health" `
      -UseBasicParsing `
      -TimeoutSec 2
    return $response.StatusCode -eq 200
  }
  catch {
    return $false
  }
}

try {
  $root = Get-ProjectRoot
  $port = Get-ConfiguredPort -Root $root

  $node = Get-Command node.exe -ErrorAction SilentlyContinue
  if (-not $node) {
    Show-Error "No se encontró Node.js.`n`nInstala Node.js 24 desde https://nodejs.org y vuelve a intentarlo."
    exit 1
  }

  if (-not (Test-Path (Join-Path $root 'node_modules'))) {
    Show-Error "Faltan las dependencias.`n`nAbre una terminal en la carpeta del proyecto y ejecuta: npm install"
    exit 1
  }

  # Arranca solo si no hay ya un servidor vivo: el acceso directo puede pulsarse
  # varias veces y dos procesos sobre el mismo SQLite provocarían bloqueos.
  if (@(Get-ServerProcesses).Count -eq 0) {
    Start-Process `
      -FilePath $node.Source `
      -ArgumentList 'src/server.js' `
      -WorkingDirectory $root `
      -WindowStyle Hidden
  }

  $ready = $false
  foreach ($attempt in 1..30) {
    if (Test-ServerReady -Port $port) {
      $ready = $true
      break
    }
    Start-Sleep -Milliseconds 500
  }

  if (-not $ready) {
    Show-Error "El servidor no respondió en el puerto $port.`n`nRevisa la configuración con: .\scripts\manage.ps1 -Action status"
    exit 1
  }

  if (-not $NoBrowser) {
    Start-Process "http://localhost:$port/"
  }
}
catch {
  Show-Error "No se pudo iniciar la aplicación.`n`n$($_.Exception.Message)"
  exit 1
}
