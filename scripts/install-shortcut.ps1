<#
Crea el acceso directo de escritorio que arranca la aplicación.

  .\scripts\install-shortcut.ps1              # solo escritorio
  .\scripts\install-shortcut.ps1 -Startup     # además, al iniciar sesión en Windows
  .\scripts\install-shortcut.ps1 -Remove      # elimina los accesos directos creados

El acceso directo llama a start-app.ps1 con la ventana oculta: levanta el
servidor si hace falta y abre el navegador en la aplicación.
#>
[CmdletBinding()]
param(
  [switch]$Startup,
  [switch]$Remove
)

$ErrorActionPreference = 'Stop'

$shortcutName = 'Gestor de Calendarios.lnk'
$root = Split-Path -Parent $PSScriptRoot
$desktopPath = Join-Path ([Environment]::GetFolderPath('Desktop')) $shortcutName
$startupPath = Join-Path ([Environment]::GetFolderPath('Startup')) $shortcutName

function New-AppShortcut {
  param([string]$Path)

  $launcher = Join-Path $PSScriptRoot 'start-app.ps1'
  $powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
  $node = Get-Command node.exe -ErrorAction SilentlyContinue

  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($Path)
  $shortcut.TargetPath = $powershell
  $shortcut.Arguments = '-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "{0}"' -f $launcher
  $shortcut.WorkingDirectory = $root
  $shortcut.Description = 'Gestor Central de Calendarios'
  # 7 = minimizado: reduce el parpadeo de la consola al arrancar.
  $shortcut.WindowStyle = 7

  # Sin un .ico propio se reutiliza el icono de Node.js, que al menos es reconocible.
  if ($node) {
    $shortcut.IconLocation = $node.Source
  }

  $shortcut.Save()
}

if ($Remove) {
  foreach ($path in @($desktopPath, $startupPath)) {
    if (Test-Path $path) {
      Remove-Item $path -Force
      Write-Host "Eliminado: $path" -ForegroundColor Green
    }
  }
  return
}

New-AppShortcut -Path $desktopPath
Write-Host "Acceso directo creado en el escritorio:" -ForegroundColor Green
Write-Host "  $desktopPath"

if ($Startup) {
  New-AppShortcut -Path $startupPath
  Write-Host "`nTambién se abrirá al iniciar sesión en Windows:" -ForegroundColor Green
  Write-Host "  $startupPath"
}

Write-Host "`nAntes de entregarlo, comprueba que existe .env y que hay un administrador creado:" -ForegroundColor Cyan
Write-Host "  npm run create-admin -- --email <correo> --password <clave>"
