@echo off
setlocal EnableExtensions EnableDelayedExpansion

cd /d "%~dp0"
set "DEMO_URL=http://localhost:3000/"
set "AI_URL=http://127.0.0.1:3765/v1/status"

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

echo N4 Demo did not start within 30 seconds.
echo Please run npm install in this project folder and try again.
pause
exit /b 1

:ready
rem The AI bridge is optional; the vocabulary demo works without Codex.
where codex.exe >nul 2>&1
if not errorlevel 1 (
  codex login status >nul 2>&1
  if not errorlevel 1 (
    powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference = 'Stop'; try { Invoke-WebRequest -UseBasicParsing -Uri '%AI_URL%' -TimeoutSec 1 | Out-Null; exit 0 } catch { exit 1 }" >nul 2>&1
    if errorlevel 1 start "N4 Kotoba AI Bridge" /min cmd /c "npm.cmd run dev:ai-bridge"
  )
)

start "" "%DEMO_URL%"
endlocal
