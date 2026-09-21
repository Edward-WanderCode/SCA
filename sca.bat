<# :
@powershell -NoProfile -ExecutionPolicy Bypass -Command "& ([ScriptBlock]::Create((Get-Content -Encoding UTF8 -LiteralPath '%~f0' -Raw)))" %* & exit /b
#>
param($action, $subAction)

$Host.UI.RawUI.WindowTitle = "SCA Platform Master Controller"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$RootDir = if ($PSScriptRoot) { $PSScriptRoot } else { (Get-Location).Path }
if (-not $RootDir -or (Test-Path (Join-Path $RootDir "tools") -PathType Container) -eq $false) {
    $RootDir = "D:\Code\SCA"
}
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
$PidsFile = Join-Path $ToolsDir "pids.json"

$nodeDir = "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\OpenJS.NodeJS.LTS_Microsoft.Winget.Source_8wekyb3d8bbwe\node-v24.19.0-win-x64"
$trivyDir = "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\AquaSecurity.Trivy_Microsoft.Winget.Source_8wekyb3d8bbwe"
$env:Path = "$VenvDir;$ScannersDir;$PgBin;$RedisDir;$trivyDir;$nodeDir;" + $env:Path
$env:PYTHONIOENCODING = "utf-8"

function Get-PortProcess($port) {
    $conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($conn) { return $conn.OwningProcess }
    return $null
}

function Show-Status() {
    Write-Host "`n=== TRẠNG THÁI CÁC DỊCH VỤ SCA PLATFORM ===" -ForegroundColor Cyan
    
    $pgPid = Get-PortProcess 5432
    if ($pgPid) {
        Write-Host "  [●] PostgreSQL 16   (Port 5432) : " -NoNewline; Write-Host "ONLINE (PID: $pgPid)" -ForegroundColor Green
    } else {
        Write-Host "  [○] PostgreSQL 16   (Port 5432) : " -NoNewline; Write-Host "OFFLINE" -ForegroundColor Red
    }

    $redisPid = Get-PortProcess 6379
    if ($redisPid) {
        Write-Host "  [●] Redis Server    (Port 6379) : " -NoNewline; Write-Host "ONLINE (PID: $redisPid)" -ForegroundColor Green
    } else {
        Write-Host "  [○] Redis Server    (Port 6379) : " -NoNewline; Write-Host "OFFLINE" -ForegroundColor Red
    }

    $backendPid = Get-PortProcess 8000
    if ($backendPid) {
        Write-Host "  [●] FastAPI Backend (Port 8000) : " -NoNewline; Write-Host "ONLINE (PID: $backendPid)" -ForegroundColor Green
    } else {
        Write-Host "  [○] FastAPI Backend (Port 8000) : " -NoNewline; Write-Host "OFFLINE" -ForegroundColor Red
    }

    $celeryProc = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
        $_.Name -match '^(python|celery)\.exe$' -and $_.CommandLine -like "*workers.celery_app*"
    } | Select-Object -First 1
    if ($celeryProc) {
        Write-Host "  [●] Celery Worker               : " -NoNewline; Write-Host "ONLINE (PID: $($celeryProc.ProcessId))" -ForegroundColor Green
    } else {
        Write-Host "  [○] Celery Worker               : " -NoNewline; Write-Host "OFFLINE" -ForegroundColor Red
    }

    $frontendPid = Get-PortProcess 3000
    if ($frontendPid) {
        Write-Host "  [●] Frontend Vite   (Port 3000) : " -NoNewline; Write-Host "ONLINE (PID: $frontendPid)" -ForegroundColor Green
    } else {
        Write-Host "  [○] Frontend Vite   (Port 3000) : " -NoNewline; Write-Host "OFFLINE" -ForegroundColor Red
    }
    Write-Host "============================================`n" -ForegroundColor Cyan
}

function Start-All() {
    Write-Host "`n[+] Đang khởi động toàn bộ dịch vụ SCA Platform..." -ForegroundColor Yellow

    # Load existing PIDs
    $pids = @{}
    if (Test-Path $PidsFile) {
        try { $pids = Get-Content $PidsFile -Raw | ConvertFrom-Json -AsHashtable } catch {}
    }

    # 1. PostgreSQL
    $pgPid = Get-PortProcess 5432
    if (-not $pgPid) {
        Write-Host "  [1/5] Khởi động PostgreSQL 16..." -ForegroundColor DarkYellow
        $postmasterPid = Join-Path $PgData "postmaster.pid"
        if (Test-Path $postmasterPid) {
            $oldPid = (Get-Content $postmasterPid | Select-Object -First 1).Trim()
            $procExists = Get-Process -Id $oldPid -ErrorAction SilentlyContinue
            if (-not $procExists) {
                Remove-Item $postmasterPid -Force -ErrorAction SilentlyContinue
            }
        }
        Start-Process -FilePath "$PgBin\pg_ctl.exe" -ArgumentList @("start", "-D", "$PgData", "-l", "$PgLog") -WindowStyle Hidden
        $t = 15
        while ($t -gt 0) {
            Start-Sleep -Milliseconds 300
            if (Get-PortProcess 5432) { break }
            $t--
        }
    }
    Write-Host "  [✓] PostgreSQL 16: Sẵn sàng." -ForegroundColor Green

    # 2. Redis
    $redisPid = Get-PortProcess 6379
    if (-not $redisPid) {
        Write-Host "  [2/5] Khởi động Redis Server..." -ForegroundColor DarkYellow
        $redisProc = Start-Process -FilePath "$RedisDir\redis-server.exe" -ArgumentList "--port 6379" -WindowStyle Hidden -PassThru
        $pids["redis"] = $redisProc.Id
        $t = 15
        while ($t -gt 0) {
            Start-Sleep -Milliseconds 200
            if (Get-PortProcess 6379) { break }
            $t--
        }
    }
    Write-Host "  [✓] Redis Server: Sẵn sàng." -ForegroundColor Green

    # 3. Celery
    $celeryProc = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
        $_.Name -match '^(python|celery)\.exe$' -and $_.CommandLine -like "*workers.celery_app*"
    }
    if (-not $celeryProc) {
        Write-Host "  [3/5] Khởi động Celery Worker..." -ForegroundColor DarkYellow
        $cp = Start-Process -FilePath $VenvCelery -ArgumentList "-A", "workers.celery_app", "worker", "--loglevel=info", "-P", "solo" -WorkingDirectory "$RootDir\backend" -WindowStyle Hidden -RedirectStandardOutput "$LogsDir\celery.log" -RedirectStandardError "$LogsDir\celery_err.log" -PassThru
        $pids["celery"] = $cp.Id
    }
    Write-Host "  [✓] Celery Worker: Sẵn sàng." -ForegroundColor Green

    # 4. FastAPI Backend
    $backendPid = Get-PortProcess 8000
    if (-not $backendPid) {
        Write-Host "  [4/5] Khởi động Backend FastAPI..." -ForegroundColor DarkYellow
        $bp = Start-Process -FilePath $VenvUvicorn -ArgumentList "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload" -WorkingDirectory "$RootDir\backend" -WindowStyle Hidden -RedirectStandardOutput "$LogsDir\backend.log" -RedirectStandardError "$LogsDir\backend_err.log" -PassThru
        $pids["backend"] = $bp.Id
        $t = 20
        while ($t -gt 0) {
            Start-Sleep -Milliseconds 300
            if (Get-PortProcess 8000) { break }
            $t--
        }
    }
    Write-Host "  [✓] Backend FastAPI: Sẵn sàng." -ForegroundColor Green

    # 5. Frontend Vite
    $frontendPid = Get-PortProcess 3000
    if (-not $frontendPid) {
        Write-Host "  [5/5] Khởi động Frontend Vite..." -ForegroundColor DarkYellow
        $fp = Start-Process -FilePath "npm.cmd" -ArgumentList "run", "dev", "--", "--host", "0.0.0.0", "--port", "3000" -WorkingDirectory "$RootDir\frontend" -WindowStyle Hidden -RedirectStandardOutput "$LogsDir\frontend.log" -RedirectStandardError "$LogsDir\frontend_err.log" -PassThru
        $pids["frontend"] = $fp.Id
        $t = 20
        while ($t -gt 0) {
            Start-Sleep -Milliseconds 300
            if (Get-PortProcess 3000) { break }
            $t--
        }
    }
    Write-Host "  [✓] Frontend Vite: Sẵn sàng." -ForegroundColor Green

    # Save PIDs
    $pids | ConvertTo-Json | Set-Content $PidsFile -Force

    Write-Host "`n============================================================" -ForegroundColor Green
    Write-Host "  KHỞI ĐỘNG THÀNH CÔNG! TẤT CẢ DỊCH VỤ ĐANG CHẠY NGẦM" -ForegroundColor Green
    Write-Host "  - Web Dashboard:  http://localhost:3000" -ForegroundColor Cyan
    Write-Host "  - Backend API:    http://localhost:8000/docs" -ForegroundColor Cyan
    Write-Host "  - Đăng nhập:      admin / Admin123!Change" -ForegroundColor Yellow
    Write-Host "============================================================`n" -ForegroundColor Green

    Start-Process "http://localhost:3000"
}

function Stop-All() {
    Write-Host "`n[-] Đang dừng toàn bộ dịch vụ SCA Platform..." -ForegroundColor Red

    # 1. Dừng theo pids.json
    if (Test-Path $PidsFile) {
        try {
            $pidsJson = Get-Content $PidsFile -Raw | ConvertFrom-Json
            foreach ($prop in $pidsJson.PSObject.Properties) {
                $pidToKill = $prop.Value
                if ($pidToKill) {
                    taskkill /F /T /PID $pidToKill 2>$null
                    Stop-Process -Id $pidToKill -Force -ErrorAction SilentlyContinue
                }
            }
        } catch {}
        Remove-Item $PidsFile -Force -ErrorAction SilentlyContinue
    }

    # 2. Dừng PostgreSQL
    Write-Host "  [1/4] Dừng PostgreSQL 16..." -ForegroundColor DarkYellow
    if (Test-Path "$PgBin\pg_ctl.exe") {
        Start-Process -FilePath "$PgBin\pg_ctl.exe" -ArgumentList @("stop", "-D", "$PgData", "-m", "fast") -WindowStyle Hidden -Wait
    }
    Stop-Process -Name "postgres" -Force -ErrorAction SilentlyContinue
    $postmasterPid = Join-Path $PgData "postmaster.pid"
    if (Test-Path $postmasterPid) { Remove-Item $postmasterPid -Force -ErrorAction SilentlyContinue }

    # 3. Dừng Redis
    Write-Host "  [2/4] Dừng Redis Server..." -ForegroundColor DarkYellow
    if (Test-Path "$RedisDir\redis-cli.exe") {
        & "$RedisDir\redis-cli.exe" shutdown 2>$null
    }
    Stop-Process -Name "redis-server" -Force -ErrorAction SilentlyContinue

    # 4. Dừng Backend, Celery và giải phóng Port 8000, 3000
    Write-Host "  [3/4] Dừng Backend API & Celery Worker..." -ForegroundColor DarkYellow
    Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
        $_.Name -match '^(python|uvicorn|celery)\.exe$' -and (
            $_.CommandLine -like "*$RootDir\backend*" -or 
            $_.CommandLine -like "*workers.celery_app*" -or 
            $_.CommandLine -like "*uvicorn*"
        )
    } | ForEach-Object {
        taskkill /F /T /PID $_.ProcessId 2>$null
    }

    $portProcesses = Get-NetTCPConnection -LocalPort 8000, 3000 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($p in $portProcesses) {
        if ($p -gt 0) {
            taskkill /F /T /PID $p 2>$null
            Stop-Process -Id $p -Force -ErrorAction SilentlyContinue
        }
    }

    # 5. Dừng Frontend
    Write-Host "  [4/4] Dừng Frontend..." -ForegroundColor DarkYellow
    Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
        $_.Name -eq "node.exe" -and $_.CommandLine -like "*$RootDir\frontend*"
    } | ForEach-Object {
        taskkill /F /T /PID $_.ProcessId 2>$null
    }

    Write-Host "`n[✓] ĐÃ DỪNG TOÀN BỘ DỊCH VỤ SẠCH SẼ!`n" -ForegroundColor Green
}

function Restart-All() {
    Stop-All
    Start-Sleep -Seconds 2
    Start-All
}

function View-Logs($sub) {
    if ($sub) {
        $logMap = @{
            "backend" = "backend.log";
            "celery" = "celery.log";
            "frontend" = "frontend.log";
            "postgres" = "postgres.log";
        }
        if ($logMap.ContainsKey($sub.ToLower())) {
            $f = Join-Path $LogsDir $logMap[$sub.ToLower()]
            Write-Host "`n--- Log $sub (Nhấn Ctrl+C để thoát) ---`n" -ForegroundColor Green
            Get-Content $f -Wait -Tail 50 -ErrorAction SilentlyContinue
            return
        }
    }

    Clear-Host
    Write-Host "============================================================" -ForegroundColor Cyan
    Write-Host "  >> SCA Platform - Xem Log Trực Tiếp" -ForegroundColor Cyan
    Write-Host "============================================================" -ForegroundColor Cyan
    Write-Host "  [1] Xem log Backend API (FastAPI)" -ForegroundColor Yellow
    Write-Host "  [2] Xem log Celery Worker (Task quét)" -ForegroundColor Yellow
    Write-Host "  [3] Xem log Frontend (React + Vite)" -ForegroundColor Yellow
    Write-Host "  [4] Xem log PostgreSQL 16" -ForegroundColor Yellow
    Write-Host "  [0] Quay lại menu chính" -ForegroundColor Gray
    Write-Host "============================================================" -ForegroundColor Cyan
    $ch = Read-Host "Nhập lựa chọn của bạn (0-4)"
    switch ($ch) {
        "1" {
            $f = Join-Path $LogsDir "backend.log"
            Write-Host "`n--- Log Backend (Nhấn Ctrl+C để thoát) ---`n" -ForegroundColor Green
            Get-Content $f -Wait -Tail 50 -ErrorAction SilentlyContinue
        }
        "2" {
            $f = Join-Path $LogsDir "celery.log"
            Write-Host "`n--- Log Celery (Nhấn Ctrl+C để thoát) ---`n" -ForegroundColor Green
            Get-Content $f -Wait -Tail 50 -ErrorAction SilentlyContinue
        }
        "3" {
            $f = Join-Path $LogsDir "frontend.log"
            Write-Host "`n--- Log Frontend (Nhấn Ctrl+C để thoát) ---`n" -ForegroundColor Green
            Get-Content $f -Wait -Tail 50 -ErrorAction SilentlyContinue
        }
        "4" {
            $f = Join-Path $LogsDir "postgres.log"
            Write-Host "`n--- Log PostgreSQL (Nhấn Ctrl+C để thoát) ---`n" -ForegroundColor Green
            Get-Content $f -Wait -Tail 50 -ErrorAction SilentlyContinue
        }
        default { return }
    }
}

# --- CLI Arguments Handler ---
if ($action) {
    switch ($action.ToLower()) {
        "start" { Start-All; exit 0 }
        "stop" { Stop-All; exit 0 }
        "restart" { Restart-All; exit 0 }
        "status" { Show-Status; exit 0 }
        "logs" { View-Logs $subAction; exit 0 }
        default {
            Write-Host "`nCách sử dụng sca.bat:" -ForegroundColor Yellow
            Write-Host "  sca.bat                : Mở giao diện menu quản trị trực quan"
            Write-Host "  sca.bat start          : Khởi động toàn bộ dịch vụ"
            Write-Host "  sca.bat stop           : Dừng toàn bộ dịch vụ an toàn"
            Write-Host "  sca.bat restart        : Khởi động lại toàn bộ dịch vụ"
            Write-Host "  sca.bat status         : Kiểm tra trạng thái hoạt động của 5 dịch vụ"
            Write-Host "  sca.bat logs [service] : Xem log (backend | celery | frontend | postgres)"
            Write-Host ""
            exit 0
        }
    }
}

# --- Interactive Menu Loop ---
while ($true) {
    Clear-Host
    Write-Host "============================================================" -ForegroundColor Cyan
    Write-Host "       🛡️  SCA PLATFORM - TRUNG TÂM ĐIỀU KHIỂN HỆ THỐNG" -ForegroundColor Cyan
    Write-Host "============================================================" -ForegroundColor Cyan
    
    Show-Status

    Write-Host "  [1] 🚀 Khởi động toàn bộ hệ thống (Start All)" -ForegroundColor Green
    Write-Host "  [2] ⏹️  Dừng toàn bộ hệ thống (Stop All)" -ForegroundColor Red
    Write-Host "  [3] 🔄 Khởi động lại hệ thống (Restart All)" -ForegroundColor Yellow
    Write-Host "  [4] 📜 Xem Logs trực tiếp (Backend, Celery, DB...)" -ForegroundColor Cyan
    Write-Host "  [5] 🌐 Mở Web Dashboard (http://localhost:3000)" -ForegroundColor Blue
    Write-Host "  [0] ❌ Thoát menu" -ForegroundColor Gray
    Write-Host "============================================================" -ForegroundColor Cyan
    
    $sel = Read-Host "Chọn chức năng (0-5)"
    switch ($sel) {
        "1" { Start-All; Read-Host "Nhấn Enter để tiếp tục..." }
        "2" { Stop-All; Read-Host "Nhấn Enter để tiếp tục..." }
        "3" { Restart-All; Read-Host "Nhấn Enter để tiếp tục..." }
        "4" { View-Logs $null; Read-Host "Nhấn Enter để tiếp tục..." }
        "5" { Start-Process "http://localhost:3000" }
        "0" { exit 0 }
        default {
            Write-Host "Lựa chọn không hợp lệ!" -ForegroundColor Red
            Start-Sleep -Seconds 1
        }
    }
}
