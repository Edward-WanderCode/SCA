# SCA Platform - Silent / Clean Shutdown Script
$Host.UI.RawUI.WindowTitle = "SCA Platform Shutdown"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "============================================================" -ForegroundColor Red
Write-Host "  >> Dang dung toan bo he thong SCA Platform..." -ForegroundColor Red
Write-Host "============================================================" -ForegroundColor Red

$RootDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
if (-not $RootDir) { $RootDir = (Get-Location).Path }
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
                # MUST kill process tree first with taskkill /T before Stop-Process
                taskkill /F /T /PID $pidToKill 2>$null
                Stop-Process -Id $pidToKill -Force -ErrorAction SilentlyContinue
            }
        }
    } catch {}
    Remove-Item $PidsFile -Force -ErrorAction SilentlyContinue
}

# 2. Stop PostgreSQL 16
Write-Host "[1/4] Dung PostgreSQL 16..." -ForegroundColor Yellow
if (Test-Path "$PgBin\pg_ctl.exe") {
    Start-Process -FilePath "$PgBin\pg_ctl.exe" -ArgumentList @("stop", "-D", "$PgData", "-m", "fast") -WindowStyle Hidden -Wait
}
Stop-Process -Name "postgres" -Force -ErrorAction SilentlyContinue

# 3. Stop Redis
Write-Host "[2/4] Dung Redis..." -ForegroundColor Yellow
if (Test-Path "$RedisDir\redis-cli.exe") {
    & "$RedisDir\redis-cli.exe" shutdown 2>$null
}
Stop-Process -Name "redis-server" -Force -ErrorAction SilentlyContinue

# 4. Cleanup any lingering processes on ports 8000 and 3000
Write-Host "[3/4] Dung Backend API & Celery Worker..." -ForegroundColor Yellow
# Stop uvicorn and celery process trees
Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { 
    $_.Name -match '^(python|uvicorn|celery)\.exe$' -and (
        $_.CommandLine -like "*$RootDir\backend*" -or 
        $_.CommandLine -like "*workers.celery_app*" -or 
        $_.CommandLine -like "*uvicorn*"
    )
} | ForEach-Object {
    taskkill /F /T /PID $_.ProcessId 2>$null
}
Stop-Process -Name "uvicorn", "celery" -Force -ErrorAction SilentlyContinue

# Find any process listening on 8000 or 3000 and terminate process tree
$portProcesses = Get-NetTCPConnection -LocalPort 8000, 3000 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
foreach ($p in $portProcesses) {
    if ($p -gt 0) {
        taskkill /F /T /PID $p 2>$null
        Stop-Process -Id $p -Force -ErrorAction SilentlyContinue
    }
}

Write-Host "[4/4] Dung Frontend..." -ForegroundColor Yellow
Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
    $_.Name -eq "node.exe" -and $_.CommandLine -like "*$RootDir\frontend*"
} | ForEach-Object {
    taskkill /F /T /PID $_.ProcessId 2>$null
}

Write-Host "`n============================================================" -ForegroundColor Green
Write-Host "  DA TAT TOAN BO CAC DICH VU THANH CONG!" -ForegroundColor Green
Write-Host "============================================================`n" -ForegroundColor Green