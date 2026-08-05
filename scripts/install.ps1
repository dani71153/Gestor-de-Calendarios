<#
Instalación completa en un PC nuevo.

  .\scripts\install.ps1

Ejecuta los pasos en orden y pregunta lo que no puede deducir:

  1. comprueba Node.js;
  2. instala dependencias;
  3. crea .env con secretos generados, si todavía no existe;
  4. pide correo y contraseña y crea la cuenta de Administrador;
  5. crea el acceso directo del escritorio.

Es re-ejecutable: no sobrescribe un .env existente ni borra la base de datos.

Instalación desatendida:

  .\scripts\install.ps1 -Email admin@empresa.com -Password "clave-de-12-o-mas" -Startup
#>
[CmdletBinding()]
param(
  [string]$Email,
  [string]$Password,
  [string]$Name,
  [int]$Port = 3000,
  [string]$Timezone = 'America/Santo_Domingo',
  [switch]$Startup,
  [switch]$SkipShortcut
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $root '.env'
$unattended = [bool]$Email -and [bool]$Password

function Write-Step {
  param([int]$Number, [string]$Title)
  Write-Host "`n[$Number/5] $Title" -ForegroundColor Cyan
}

function Write-Ok {
  param([string]$Message)
  Write-Host "      $Message" -ForegroundColor Green
}

function Write-Info {
  param([string]$Message)
  Write-Host "      $Message" -ForegroundColor DarkGray
}

function Stop-Install {
  param([string]$Message)
  Write-Host "`nInstalación detenida." -ForegroundColor Red
  Write-Host "  $Message"
  exit 1
}

function New-Secret {
  param([string]$NodePath)
  & $NodePath -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
}

function Test-EmailFormat {
  param([string]$Value)
  return $Value -match '^\S+@\S+\.\S+$'
}

function Read-EmailInteractive {
  while ($true) {
    $value = (Read-Host 'Correo del administrador').Trim()

    if (Test-EmailFormat -Value $value) {
      return $value.ToLower()
    }

    Write-Host '  Ese correo no tiene un formato válido. Inténtalo de nuevo.' -ForegroundColor Yellow
  }
}

function Read-PasswordInteractive {
  while ($true) {
    $first = Read-Host 'Contraseña (mínimo 12 caracteres)' -AsSecureString
    $plain = [System.Net.NetworkCredential]::new('', $first).Password

    if ($plain.Length -lt 12) {
      Write-Host '  Demasiado corta: se requieren al menos 12 caracteres.' -ForegroundColor Yellow
      continue
    }

    if ($plain -eq 'Demo123!') {
      Write-Host '  Esa es la contraseña de demostración. Elige otra.' -ForegroundColor Yellow
      continue
    }

    $second = Read-Host 'Repite la contraseña' -AsSecureString
    $confirm = [System.Net.NetworkCredential]::new('', $second).Password

    if ($plain -ne $confirm) {
      Write-Host '  Las contraseñas no coinciden. Inténtalo de nuevo.' -ForegroundColor Yellow
      continue
    }

    return $plain
  }
}

Write-Host "`nINSTALACIÓN DEL GESTOR DE CALENDARIOS" -ForegroundColor Cyan
Write-Host '-------------------------------------'
Write-Info "Carpeta: $root"

# ---------------------------------------------------------------- 1. Node.js
Write-Step -Number 1 -Title 'Comprobando Node.js'

$node = Get-Command node.exe -ErrorAction SilentlyContinue
if (-not $node) {
  Stop-Install 'No se encontró Node.js. Instala la versión 24 desde https://nodejs.org y vuelve a ejecutar este script.'
}

$nodeVersion = (& $node.Source -v).TrimStart('v')
$nodeMajor = [int]($nodeVersion.Split('.')[0])

if ($nodeMajor -lt 24) {
  Stop-Install "Node.js $nodeVersion es demasiado antiguo. Se requiere la versión 24 o superior (la base de datos usa el módulo node:sqlite)."
}

Write-Ok "Node.js $nodeVersion"

# ------------------------------------------------------------ 2. Dependencias
Write-Step -Number 2 -Title 'Instalando dependencias'

$npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $npm) {
  Stop-Install 'No se encontró npm. Reinstala Node.js incluyendo npm.'
}

Push-Location $root
try {
  & $npm.Source install --no-fund --no-audit
  if ($LASTEXITCODE -ne 0) {
    Stop-Install 'npm install falló. Revisa la conexión a internet y vuelve a intentarlo.'
  }
}
finally {
  Pop-Location
}

Write-Ok 'Dependencias instaladas'

# ------------------------------------------------------------------- 3. .env
Write-Step -Number 3 -Title 'Configurando .env'

if (Test-Path $envPath) {
  Write-Ok 'Ya existe un .env: se conserva sin cambios'
  Write-Info 'Si quieres regenerarlo, renómbralo o bórralo y vuelve a ejecutar este script.'
}
else {
  $sessionSecret = New-Secret -NodePath $node.Source
  $encryptionKey = New-Secret -NodePath $node.Source

  # Se construye como array en vez de here-string: Windows PowerShell 5.1 exige
  # terminadores CRLF en los here-strings y este archivo usa LF.
  $content = @(
    'NODE_ENV=production',
    'COOKIE_SECURE=false',
    "PORT=$Port",
    'DATABASE_PATH=./data/calendar-manager.sqlite',
    "SESSION_SECRET=$sessionSecret",
    "INTEGRATION_ENCRYPTION_KEY=$encryptionKey",
    "DEFAULT_TIMEZONE=$Timezone",
    'SEED_MODE=base'
  )

  Set-Content -Path $envPath -Value $content -Encoding utf8
  Write-Ok 'Creado .env con secretos generados'
  Write-Info 'COOKIE_SECURE=false permite servir por HTTP en la red local. Quítalo al pasar a HTTPS.'
}

# --------------------------------------------------------- 4. Administrador
Write-Step -Number 4 -Title 'Creando la cuenta de Administrador'

if ($unattended) {
  if (-not (Test-EmailFormat -Value $Email)) {
    Stop-Install "El correo '$Email' no tiene un formato válido."
  }
  if ($Password.Length -lt 12) {
    Stop-Install 'La contraseña debe tener al menos 12 caracteres.'
  }
  $adminEmail = $Email.Trim().ToLower()
  $adminPassword = $Password
  $adminName = $Name
}
else {
  Write-Info 'Con estos datos se iniciará sesión en la aplicación.'
  $adminEmail = Read-EmailInteractive
  $adminPassword = Read-PasswordInteractive
  $adminName = (Read-Host 'Nombre para mostrar (opcional)').Trim()
}

# Se pasa por entorno y no por argumentos para que la contraseña no quede
# visible en la lista de procesos del sistema.
$env:INITIAL_ADMIN_EMAIL = $adminEmail
$env:INITIAL_ADMIN_PASSWORD = $adminPassword
if ($adminName) {
  $env:INITIAL_ADMIN_NAME = $adminName
}

Push-Location $root
try {
  # Se consulta antes de invocar create-admin.js para no mostrar su mensaje de
  # error en una reinstalación, que es un caso previsto y no un fallo.
  $probe = "const {db,initializeDatabase}=require('./src/database');"
  $probe += "initializeDatabase({silent:true,skipInitialAdmin:true});"
  $probe += "const row=db.prepare('SELECT 1 AS found FROM users WHERE lower(email) = ?').get(process.argv[1]);"
  $probe += "console.log(row ? 'EXISTS' : 'MISSING');"

  $probeResult = & $node.Source '-e' $probe $adminEmail
  if ($LASTEXITCODE -ne 0) {
    Stop-Install 'No se pudo abrir la base de datos para comprobar la cuenta.'
  }

  $alreadyExists = ($probeResult -join '') -match 'EXISTS'
  $arguments = @('scripts/create-admin.js')

  if ($alreadyExists) {
    Write-Host "      Ya hay una cuenta con el correo $adminEmail." -ForegroundColor Yellow

    if ($unattended) {
      $reset = $true
    }
    else {
      $answer = Read-Host '      ¿Restablecer su contraseña con la que acabas de escribir? (s/n)'
      $reset = $answer -match '^[sSyY]'
    }

    if (-not $reset) {
      Write-Info 'Se conserva la cuenta existente sin cambios.'
      $arguments = $null
    }
    else {
      $arguments += '--force'
    }
  }

  if ($arguments) {
    & $node.Source $arguments
    if ($LASTEXITCODE -ne 0) {
      Stop-Install 'No se pudo configurar la cuenta de Administrador.'
    }
  }
}
finally {
  Pop-Location
  Remove-Item Env:INITIAL_ADMIN_EMAIL -ErrorAction SilentlyContinue
  Remove-Item Env:INITIAL_ADMIN_PASSWORD -ErrorAction SilentlyContinue
  Remove-Item Env:INITIAL_ADMIN_NAME -ErrorAction SilentlyContinue
}

Write-Ok "Acceso configurado para $adminEmail"

# ------------------------------------------------------------ 5. Acceso directo
Write-Step -Number 5 -Title 'Creando el acceso directo'

if ($SkipShortcut) {
  Write-Info 'Omitido por -SkipShortcut.'
}
else {
  $addStartup = $Startup

  if (-not $unattended -and -not $Startup) {
    $answer = Read-Host '¿Abrir la aplicación al iniciar sesión en Windows? (s/n)'
    $addStartup = $answer -match '^[sSyY]'
  }

  $shortcutScript = Join-Path $PSScriptRoot 'install-shortcut.ps1'
  if ($addStartup) {
    & $shortcutScript -Startup
  }
  else {
    & $shortcutScript
  }
}

# ------------------------------------------------------------------ Resumen
Write-Host "`n-------------------------------------" -ForegroundColor Cyan
Write-Host 'INSTALACIÓN COMPLETA' -ForegroundColor Green
Write-Host "`n  Aplicación : http://localhost:$Port/"
Write-Host "  Usuario    : $adminEmail"
Write-Host "  Base       : $(Join-Path $root 'data\calendar-manager.sqlite')"

Write-Host "`nAbre la aplicación con el icono del escritorio.`n"

Write-Host 'Recuerda:' -ForegroundColor Yellow
Write-Host '  - Copia el archivo .env fuera de este equipo. Si se pierde'
Write-Host '    INTEGRATION_ENCRYPTION_KEY, los tokens guardados de Google'
Write-Host '    dejan de poder descifrarse.'
Write-Host '  - Respalda la base con: .\scripts\manage.ps1 -Action backup-db'
Write-Host '    y guarda las copias en otro equipo.'
Write-Host ''
