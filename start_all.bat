@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start_all.ps1"
if %ERRORLEVEL% neq 0 (
    echo.
    echo [!] Co loi xay ra trong qua trinh thuc thi.
    pause
)
