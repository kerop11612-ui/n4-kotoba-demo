@echo off
setlocal EnableExtensions

cd /d "%~dp0"
set "DEMO_URL=http://localhost:3000/"

where npm.cmd >nul 2>&1
if errorlevel 1 (
  echo npm was not found. Please install Node.js and try again.
  pause
  exit /b 1
)

if not exist "%~dp0node_modules" (
  echo Dependencies are not installed yet.
  echo Run npm install in this folder, then double-click this file again.
  pause
  exit /b 1
)

rem Reuse an already-running local demo when possible.
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference = 'Stop'; try { Invoke-WebRequest -UseBasicParsing -Uri '%DEMO_URL%' -TimeoutSec 1 | Out-Null; exit 0 } catch { exit 1 }" >nul 2>&1
if errorlevel 1 (
  start "N4 Kotoba Dev" /min cmd /c "npm.cmd run dev -- -p 3000"
)

for /l %%N in (1,1,30) do (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference = 'Stop'; try { Invoke-WebRequest -UseBasicParsing -Uri '%DEMO_URL%' -TimeoutSec 1 | Out-Null; exit 0 } catch { exit 1 }" >nul 2>&1
  if not errorlevel 1 goto ready
  timeout /t 1 /nobreak >nul
)

echo N4 Kotoba Demo did not start within 30 seconds.
echo Check the N4 Kotoba Dev window for the error details.
pause
exit /b 1

:ready
start "" "%DEMO_URL%"
endlocal
