# Launch all SCA services in background without terminal blocking
$RootDir = Split-Path -Parent $PSScriptRoot
if (-not $RootDir) { $RootDir = "D:\Code\SCA" }
$ToolsDir = Join-Path $RootDir "tools"
$LogsDir = Join-Path $ToolsDir "logs"
if (-not (Test-Path $LogsDir)) { New-Item -ItemType Directory -Path $LogsDir -Force | Out-Null }

$PgBin = Join-Path $ToolsDir "pgsql\pgsql\bin"
$PgData = Join-Path $ToolsDir "pgsql\data"
$PgLog = Join-Path $LogsDir "postgres.log"
$RedisDir = Join-Path $ToolsDir "redis"
$ScannersDir = Join-Path $ToolsDir "scanners"
$VenvDir = Join-Path $RootDir "backend\.venv\Scripts"
$VenvUvicorn = Join-Path $VenvDir "uvicorn.exe"
$VenvCelery = Join-Path $VenvDir "celery.exe"

$nodeDir = "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\OpenJS.NodeJS.LTS_Microsoft.Winget.Source_8wekyb3d8bbwe\node-v24.19.0-win-x64"
$trivyDir = "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\AquaSecurity.Trivy_Microsoft.Winget.Source_8wekyb3d8bbwe"
$env:Path = "$VenvDir;$ScannersDir;$PgBin;$RedisDir;$trivyDir;$nodeDir;" + $env:Path
$env:PYTHONIOENCODING = "utf-8"

$pids = @{}

# 1. PostgreSQL
Write-Host "Starting PostgreSQL 16..."
$pgListening = Get-NetTCPConnection -LocalPort 5432 -State Listen -ErrorAction SilentlyContinue
if (-not $pgListening) {
    Start-Process -FilePath "$PgBin\pg_ctl.exe" -ArgumentList @("start", "-D", "$PgData", "-l", "$PgLog") -WindowStyle Hidden
    $t = 20
    while ($t -gt 0) {
        Start-Sleep -Milliseconds 300
        if (Get-NetTCPConnection -LocalPort 5432 -State Listen -ErrorAction SilentlyContinue) { break }
        $t--
    }
}
Write-Host "PostgreSQL: OK"

# 2. Redis
Write-Host "Starting Redis Server..."
$redisListening = Get-NetTCPConnection -LocalPort 6379 -State Listen -ErrorAction SilentlyContinue
if (-not $redisListening) {
    $redisProc = Start-Process -FilePath "$RedisDir\redis-server.exe" -ArgumentList "--port 6379" -WindowStyle Hidden -PassThru
    $pids["redis"] = $redisProc.Id
    $t = 15
    while ($t -gt 0) {
        Start-Sleep -Milliseconds 200
        if (Get-NetTCPConnection -LocalPort 6379 -State Listen -ErrorAction SilentlyContinue) { break }
        $t--
    }
}
Write-Host "Redis: OK"

# 3. Celery Worker
Write-Host "Starting Celery Worker..."
$celeryProc = Start-Process -FilePath $VenvCelery -ArgumentList "-A", "workers.celery_app", "worker", "--loglevel=info", "-P", "solo" -WorkingDirectory "$RootDir\backend" -WindowStyle Hidden -RedirectStandardOutput "$LogsDir\celery.log" -RedirectStandardError "$LogsDir\celery_err.log" -PassThru
$pids["celery"] = $celeryProc.Id
Write-Host "Celery Worker: OK (PID: $($celeryProc.Id))"

# 4. Backend FastAPI
Write-Host "Starting Backend FastAPI..."
$backendProc = Start-Process -FilePath $VenvUvicorn -ArgumentList "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload" -WorkingDirectory "$RootDir\backend" -WindowStyle Hidden -RedirectStandardOutput "$LogsDir\backend.log" -RedirectStandardError "$LogsDir\backend_err.log" -PassThru
$pids["backend"] = $backendProc.Id
$t = 20
while ($t -gt 0) {
    Start-Sleep -Milliseconds 300
    if (Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue) { break }
    $t--
}
Write-Host "Backend FastAPI: OK (PID: $($backendProc.Id))"

# 5. Frontend Vite
Write-Host "Starting Frontend Vite..."
$frontendListening = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if (-not $frontendListening) {
    $frontendProc = Start-Process -FilePath "npm.cmd" -ArgumentList "run", "dev", "--", "--host", "0.0.0.0", "--port", "3000" -WorkingDirectory "$RootDir\frontend" -WindowStyle Hidden -RedirectStandardOutput "$LogsDir\frontend.log" -RedirectStandardError "$LogsDir\frontend_err.log" -PassThru
    $pids["frontend"] = $frontendProc.Id
    $t = 20
    while ($t -gt 0) {
        Start-Sleep -Milliseconds 300
        if (Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue) { break }
        $t--
    }
}
Write-Host "Frontend Vite: OK"

# Save PIDs
$pids | ConvertTo-Json | Set-Content (Join-Path $ToolsDir "pids.json")
Write-Host "`nAll SCA Platform services are running in background!"
