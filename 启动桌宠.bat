@echo off
cd /d "%~dp0"
if exist "%~dp0restart.ps1" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0restart.ps1"
)
set "EXE=%~dp0node_modules\electron\dist\electron.exe"
set "APP=%~dp0"
if "%APP:~-1%"=="\" set "APP=%APP:~0,-1%"
if not exist "%EXE%" (
  echo [ERROR] This is the SOURCE version, not the ready-to-run app.
  echo.
  echo For ordinary users: download the ready-to-run zip from GitHub Releases:
  echo   https://github.com/bekeke1228/aesthetic-frog-pet/releases
  echo Unzip the WHOLE folder first, then double-click the main .exe inside.
  echo Do NOT run files directly inside the zip.
  echo.
  echo Developers: run "pnpm install" first, then this bat again.
  pause
  exit /b 1
)
start "" "%EXE%" "%APP%"
