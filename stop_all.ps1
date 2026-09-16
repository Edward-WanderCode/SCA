# SCA Platform - Silent / Clean Shutdown Script
$Host.UI.RawUI.WindowTitle = "SCA Platform Shutdown"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "============================================================" -ForegroundColor Red
Write-Host "  >> Dang dung toan bo he thong SCA Platform..." -ForegroundColor Red
Write-Host "============================================================" -ForegroundColor Red

$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ToolsDir = Join-Path $RootDir "tools"
$PgBin = Join-Path $ToolsDir "pgsql\pgsql\bin"
$PgData = Join-Path $ToolsDir "pgsql\data"
$RedisDir = Join-Path $ToolsDir "redis"
$PidsFile = Join-Path $ToolsDir "pids.json"

# 1. Stop background processes by saved PIDs
if (Test-Path $PidsFile) {
    try {
        $pidsJson = Get-Content $PidsFile -Raw | ConvertFrom-Json
        foreach ($prop in $pidsJson.PSObject.Properties) {
            $pidToKill = $prop.Value
            if ($pidToKill) {
                # Stop process tree
                Stop-Process -Id $pidToKill -Force -ErrorAction SilentlyContinue
                # Kill children using taskkill
                taskkill /F /T /PID $pidToKill 2>$null
            }
        }
    } catch {}
    Remove-Item $PidsFile -Force -ErrorAction SilentlyContinue
}

# 2. Stop PostgreSQL 16
Write-Host "[1/4] Dung PostgreSQL 16..." -ForegroundColor Yellow
Start-Process -FilePath "$PgBin\pg_ctl.exe" -ArgumentList @("stop", "-D", "$PgData", "-m", "fast") -WindowStyle Hidden -Wait

# 3. Stop Redis
Write-Host "[2/4] Dung Redis..." -ForegroundColor Yellow
& "$RedisDir\redis-cli.exe" shutdown 2>$null
Stop-Process -Name "redis-server" -Force -ErrorAction SilentlyContinue

# 4. Cleanup any lingering processes on ports 8000 and 3000
Write-Host "[3/4] Dung Backend API & Celery Worker..." -ForegroundColor Yellow
Stop-Process -Name "uvicorn", "celery" -Force -ErrorAction SilentlyContinue

# Find any process listening on 8000 or 3000 and terminate
$portProcesses = Get-NetTCPConnection -LocalPort 8000, 3000 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
foreach ($p in $portProcesses) {
    if ($p -gt 0) {
        Stop-Process -Id $p -Force -ErrorAction SilentlyContinue
    }
}

Write-Host "[4/4] Dung Frontend..." -ForegroundColor Yellow
Get-Process | Where-Object { $_.MainWindowTitle -match "SCA - Frontend" } | Stop-Process -Force -ErrorAction SilentlyContinue

Write-Host "`n============================================================" -ForegroundColor Green
Write-Host "  DA TAT TOAN BO CAC DICH VU THANH CONG!" -ForegroundColor Green
Write-Host "============================================================`n" -ForegroundColor Green