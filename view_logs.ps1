# SCA Platform - Live Log Viewer
$Host.UI.RawUI.WindowTitle = "SCA Platform Log Viewer"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$LogsDir = Join-Path $RootDir "tools\logs"

Clear-Host
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  >> SCA Platform - Trinh theo doi Log truc tiep" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  [1] Xem log Backend API (FastAPI)" -ForegroundColor Yellow
Write-Host "  [2] Xem log Celery Worker (Task quet)" -ForegroundColor Yellow
Write-Host "  [3] Xem log Frontend (React + Vite)" -ForegroundColor Yellow
Write-Host "  [4] Xem log PostgreSQL" -ForegroundColor Yellow
Write-Host "  [5] Thoat" -ForegroundColor Gray
Write-Host "============================================================" -ForegroundColor Cyan

$choice = Read-Host "Nhap lua chon cua ban (1-5)"
switch ($choice) {
    "1" {
        $logFile = Join-Path $LogsDir "backend.log"
        Write-Host "`n--- Dang xem log Backend (Ctrl+C de thoat) ---`n" -ForegroundColor Green
        Get-Content $logFile -Wait -Tail 50 -ErrorAction SilentlyContinue
    }
    "2" {
        $logFile = Join-Path $LogsDir "celery.log"
        Write-Host "`n--- Dang xem log Celery Worker (Ctrl+C de thoat) ---`n" -ForegroundColor Green
        Get-Content $logFile -Wait -Tail 50 -ErrorAction SilentlyContinue
    }
    "3" {
        $logFile = Join-Path $LogsDir "frontend.log"
        Write-Host "`n--- Dang xem log Frontend (Ctrl+C de thoat) ---`n" -ForegroundColor Green
        Get-Content $logFile -Wait -Tail 50 -ErrorAction SilentlyContinue
    }
    "4" {
        $logFile = Join-Path $LogsDir "postgres.log"
        Write-Host "`n--- Dang xem log PostgreSQL (Ctrl+C de thoat) ---`n" -ForegroundColor Green
        Get-Content $logFile -Wait -Tail 50 -ErrorAction SilentlyContinue
    }
    default {
        Write-Host "Thoat."
    }
}