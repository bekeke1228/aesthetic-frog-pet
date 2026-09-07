@echo off
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0restart.ps1"
set "EXE=%~dp0node_modules\electron\dist\electron.exe"
set "APP=%~dp0"
if "%APP:~-1%"=="\" set "APP=%APP:~0,-1%"
if not exist "%EXE%" (
  echo [ERROR] Electron not found. Please run: pnpm install
  pause
  exit /b 1
)
start "" "%EXE%" "%APP%"
