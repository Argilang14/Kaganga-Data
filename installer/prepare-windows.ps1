param(
    [string]$OutputDir = "dist/windows",
    [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$absOutput = Join-Path $projectRoot $OutputDir
$stageRoot = Join-Path $absOutput 'stage'
$appName = 'Rapkumer'
$appStage = Join-Path $stageRoot $appName

Write-Host "Preparing Windows staging layout for $appName" -ForegroundColor Cyan

# Helper: check whether a command exists on PATH
function Test-CommandExists { param($cmd) try { Get-Command $cmd -ErrorAction Stop > $null; return $true } catch { return $false } }

if (-not $SkipBuild) {
    Write-Host 'Running production build (pnpm build)...'
    Push-Location $projectRoot
    # Prefer pnpm if available, otherwise fall back to npm (installing dev deps first).
    if (Test-CommandExists 'pnpm') {
        pnpm build
    } else {
        Write-Host 'pnpm not found on PATH; falling back to npm. This will install devDependencies if needed.'
        # Ensure node/npm present
        if (-not (Test-CommandExists 'npm')) {
            throw 'Neither pnpm nor npm were found on PATH. Cannot run build.'
        }
        # Install dependencies (including dev) so build tools like vite are available
        npm install
        npm run build
    }
    Pop-Location
} else {
    Write-Host 'Skipping build step as requested.'
}

if (Test-Path $stageRoot) {
    Write-Host "Cleaning previous staging directory at $stageRoot"
    Remove-Item $stageRoot -Recurse -Force
}

New-Item -ItemType Directory -Path $appStage -Force | Out-Null

Write-Host 'Copying build artifacts...'
Copy-Item (Join-Path $projectRoot 'build') -Destination (Join-Path $appStage 'build') -Recurse -Force

Write-Host 'Copying static assets...'
$staticSource = Join-Path $projectRoot 'static'
if (Test-Path $staticSource) {
    Copy-Item $staticSource -Destination (Join-Path $appStage 'static') -Recurse -Force
} else {
    Write-Warning 'Static directory not found; skipping copy of static assets.'
}

$iconSource = Join-Path $projectRoot 'static/logo.ico'
if (Test-Path $iconSource) {
    $iconTarget = Join-Path $appStage 'rapkumer.ico'
    Copy-Item $iconSource -Destination $iconTarget -Force
} else {
    Write-Warning 'File static/logo.ico tidak ditemukan; ikon installer tidak akan diperbarui.'
}

# Generate a clean database specifically for new installations. Never package
# data/database.sqlite3 because it may contain development or school data.
Write-Host 'Generating clean installer database...'
Push-Location $projectRoot
$databasePath = Join-Path $absOutput 'installer-database.sqlite3'
node scripts/create-installer-db.mjs $databasePath
if ($LASTEXITCODE -ne 0) { throw 'Failed to generate clean installer database.' }
Pop-Location
if (Test-Path $databasePath) {
    Write-Host 'Bundling default SQLite database...'
    $dataDir = Join-Path $appStage 'data'
    New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
    Copy-Item $databasePath -Destination (Join-Path $dataDir 'database.sqlite3') -Force
} else {
    Write-Warning 'Default SQLite database not found; continuing without bundling data/database.sqlite3.'
}

    # Do not bundle Node runtime into the staged app; the installer expects
    # end-users to install Node.js beforehand. This keeps the installer small.
    Write-Host 'Not bundling Node runtime into staged app (require Node.js on target).' -ForegroundColor Yellow

Write-Host 'Generating runtime package manifest...'
$packageJsonPath = Join-Path $projectRoot 'package.json'
$package = Get-Content $packageJsonPath -Raw | ConvertFrom-Json
$runtimePackage = [ordered]@{
    name = $package.name
    version = $package.version
    private = $true
    type = 'module'
    scripts = @{ start = 'node build/index.js' }
    dependencies = $package.dependencies
}
$runtimeJson = $runtimePackage | ConvertTo-Json -Depth 5
Set-Content -Path (Join-Path $appStage 'package.json') -Value $runtimeJson -Encoding UTF8

Write-Host 'Copying runtime helper scripts...'
# Also include the new ESM starter so shortcuts can point to .mjs
$startMjs = Join-Path $projectRoot 'installer/files/start-rapkumer.mjs'
if (Test-Path $startMjs) { Copy-Item $startMjs (Join-Path $appStage 'start-rapkumer.mjs') -Force }

# Ensure start-build.mjs (used by start-rapkumer.mjs) is available at the app root
$startBuildSrc = Join-Path $projectRoot 'scripts/start-build.mjs'
if (Test-Path $startBuildSrc) { Copy-Item $startBuildSrc (Join-Path $appStage 'start-build.mjs') -Force }

# Copy convenience wrapper for manual migrations (optional for users)
$wrapperBat = Join-Path $projectRoot 'installer\run-migrations.bat'
if (Test-Path $wrapperBat) { Copy-Item $wrapperBat (Join-Path $appStage 'run-migrations.bat') -Force }

# Copy migrate helper JS so the convenience wrapper can run it from the staged app
$migrateJs = Join-Path $projectRoot 'scripts\migrate-installed-db.mjs'
if (Test-Path $migrateJs) {
    $scriptsDir = Join-Path $appStage 'scripts'
    New-Item -ItemType Directory -Path $scriptsDir -Force | Out-Null
    Copy-Item $migrateJs (Join-Path $scriptsDir 'migrate-installed-db.mjs') -Force
}

# Copy a minimal set of project scripts required by the migrator into the staged app
$requiredScripts = @(
    'ensure-columns.mjs',
    'fix-drizzle-indexes.mjs',
    'seed-default-admin.mjs',
    'grant-admin-permissions.mjs',
    'notify-server-reload.mjs',
    'start-build.mjs'
)
foreach ($s in $requiredScripts) {
    $src = Join-Path $projectRoot ('scripts\' + $s)
    if (Test-Path $src) {
        if (-not (Test-Path $scriptsDir)) { New-Item -ItemType Directory -Path $scriptsDir -Force | Out-Null }
        Copy-Item $src (Join-Path $scriptsDir $s) -Force
    } else {
        Write-Warning "Required script $s not found in project scripts directory; migrator on target may fail if this script is missing."
    }
}

# Copy drizzle config, migrations and schema so drizzle-kit can run on the installed app
$drizzleConfig = Join-Path $projectRoot 'drizzle.config.js'
if (Test-Path $drizzleConfig) { Copy-Item $drizzleConfig (Join-Path $appStage 'drizzle.config.js') -Force }

$drizzleDir = Join-Path $projectRoot 'drizzle'
if (Test-Path $drizzleDir) { Copy-Item $drizzleDir (Join-Path $appStage 'drizzle') -Recurse -Force }

# copy server-side schema referenced by drizzle.config.js if present
$schemaSrc = Join-Path $projectRoot 'src\lib\server\db\schema.ts'
if (Test-Path $schemaSrc) {
    $schemaDestDir = Join-Path $appStage 'src\lib\server\db'
    New-Item -ItemType Directory -Path $schemaDestDir -Force | Out-Null
    Copy-Item $schemaSrc (Join-Path $schemaDestDir 'schema.ts') -Force
}

$envSample = Join-Path $projectRoot '.env.example'
if (Test-Path $envSample) {
    Copy-Item $envSample (Join-Path $appStage '.env.example') -Force
}

# Create a default .env for the installed app that points to the user's
# local appdata folder so the installed app stores its DB in an per-user
# location. Do not overwrite an existing .env in the staged app.
$envTarget = Join-Path $appStage '.env'
if (-not (Test-Path $envTarget)) {
    $envContent = 'DB_URL=file:%LOCALAPPDATA%/Kaganga-data/database.sqlite3'
    $envContent += "`nBODY_SIZE_LIMIT=5M"
    Set-Content -Path $envTarget -Value $envContent -Encoding UTF8
    Write-Host "Wrote default .env to $envTarget" -ForegroundColor Green
} else {
    Write-Host '.env already exists in staged app; skipping creation.' -ForegroundColor Yellow
}

Write-Host 'Installing production dependencies with npm (omit dev)...'
Push-Location $appStage
if (Test-Path 'node_modules') { Remove-Item 'node_modules' -Recurse -Force }
if (Test-Path 'package-lock.json') { Remove-Item 'package-lock.json' -Force }
npm install --omit=dev --no-package-lock
Pop-Location

Write-Host "Staging complete. Contents available at $appStage" -ForegroundColor Green
