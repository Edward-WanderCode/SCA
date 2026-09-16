# SCA Platform - Silent / Minimal Console Startup Script
$Host.UI.RawUI.WindowTitle = "SCA Platform Master Controller"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Clear-Host
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  >> SCA Platform - Khoi dong he thong (Giam thieu cua so) " -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
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

# 1. Start PostgreSQL (chay ngam)
Write-Host -NoNewline "[1/5] PostgreSQL 16... " -ForegroundColor Yellow
$pgListening = Get-NetTCPConnection -LocalPort 5432 -State Listen -ErrorAction SilentlyContinue
if (-not $pgListening) {
    Start-Process -FilePath "$PgBin\pg_ctl.exe" -ArgumentList @("start", "-D", "$PgData", "-l", "$PgLog") -WindowStyle Hidden
    $t = 15
    while ($t -gt 0) {
        Start-Sleep -Milliseconds 300
        if (Get-NetTCPConnection -LocalPort 5432 -State Listen -ErrorAction SilentlyContinue) { break }
        $t--
    }
}
Write-Host "[OK]" -ForegroundColor Green

# 2. Start Redis Server (chay ngam, khong hien cua so)
Write-Host -NoNewline "[2/5] Redis Server... " -ForegroundColor Yellow
$redisListening = Get-NetTCPConnection -LocalPort 6379 -State Listen -ErrorAction SilentlyContinue
if (-not $redisListening) {
    $redisProc = Start-Process -FilePath "$RedisDir\redis-server.exe" -ArgumentList "--port 6379" -WindowStyle Hidden -PassThru
    $pids["redis"] = $redisProc.Id
    $t = 10
    while ($t -gt 0) {
        Start-Sleep -Milliseconds 200
        if (Get-NetTCPConnection -LocalPort 6379 -State Listen -ErrorAction SilentlyContinue) { break }
        $t--
    }
}
Write-Host "[OK]" -ForegroundColor Green

# 3. Start Celery Worker (chay ngam, ghi log ra tools/logs/celery.log)
Write-Host -NoNewline "[3/5] Celery Worker... " -ForegroundColor Yellow
$celeryProc = Start-Process -FilePath $VenvCelery -ArgumentList "-A", "workers.celery_app", "worker", "--loglevel=info", "-P", "solo" -WorkingDirectory "$RootDir\backend" -WindowStyle Hidden -RedirectStandardOutput "$LogsDir\celery.log" -RedirectStandardError "$LogsDir\celery_err.log" -PassThru
$pids["celery"] = $celeryProc.Id
Write-Host "[OK] (PID: $($celeryProc.Id))" -ForegroundColor Green

# 4. Start Backend API (chay ngam, ghi log ra tools/logs/backend.log)
Write-Host -NoNewline "[4/5] Backend FastAPI... " -ForegroundColor Yellow
$backendProc = Start-Process -FilePath $VenvUvicorn -ArgumentList "main:app", "--reload", "--host", "0.0.0.0", "--port", "8000" -WorkingDirectory "$RootDir\backend" -WindowStyle Hidden -RedirectStandardOutput "$LogsDir\backend.log" -RedirectStandardError "$LogsDir\backend_err.log" -PassThru
$pids["backend"] = $backendProc.Id
Write-Host "[OK] (PID: $($backendProc.Id))" -ForegroundColor Green

# 5. Start Frontend Vite (chay ngam, ghi log ra tools/logs/frontend.log)
Write-Host -NoNewline "[5/5] Frontend Vite... " -ForegroundColor Yellow
$frontendProc = Start-Process -FilePath "cmd.exe" -ArgumentList "/c npm.cmd run dev" -WorkingDirectory "$RootDir\frontend" -WindowStyle Hidden -RedirectStandardOutput "$LogsDir\frontend.log" -RedirectStandardError "$LogsDir\frontend_err.log" -PassThru
$pids["frontend"] = $frontendProc.Id
Write-Host "[OK] (PID: $($frontendProc.Id))`n" -ForegroundColor Green

# Luu PIDs de stop_all su dung
$pids | ConvertTo-Json | Set-Content (Join-Path $ToolsDir "pids.json") -Encoding UTF8

Start-Sleep -Seconds 2

Write-Host "============================================================" -ForegroundColor Green
Write-Host "  TAT CA DICH VU DANG CHAY NGAM (KHONG MO CUA SO CONSOLE)  " -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host "  - Web Dashboard (Local):  http://localhost:3000" -ForegroundColor Cyan
Write-Host "  - Web Dashboard (Radmin): http://26.174.174.177:3000" -ForegroundColor Magenta
Write-Host "  - Backend API (Docs):     http://localhost:8000/docs" -ForegroundColor Cyan
Write-Host "  - Tai khoan mac dinh:     admin / Admin123!Change" -ForegroundColor White
Write-Host "============================================================" -ForegroundColor Green
Write-Host "  Log cac dich vu duoc luu tai: tools\logs\" -ForegroundColor DarkGray
Write-Host "  De xem log truc tiep: chay file view_logs.bat" -ForegroundColor DarkGray
Write-Host "  De tat toan bo he thong: chay file stop_all.bat hoac bam 'Q' tai day" -ForegroundColor Yellow
Write-Host "============================================================" -ForegroundColor Green

Start-Process "http://localhost:3000"

Write-Host "`nBam phim [Q] de dung he thong, hoac dong cua so nay (dich vu van chay ngam):"
while ($true) {
    if ([Console]::KeyAvailable) {
        $key = [Console]::ReadKey($true)
        if ($key.Key -eq [ConsoleKey]::Q) {
            Write-Host "`nDang dung he thong..." -ForegroundColor Red
            & (Join-Path $RootDir "stop_all.ps1")
            break
        }
    }
    Start-Sleep -Milliseconds 500
}