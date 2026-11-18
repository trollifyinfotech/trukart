@echo off
setlocal
cd /d "%~dp0"
title Veloura - local website
set PORT=8090
set PY=

echo ==============================================================
echo  Veloura - starting your website at  http://localhost:%PORT%/
echo  Keep this window OPEN while you use the website.
echo  Close it (or press Ctrl+C) to stop.
echo ==============================================================
echo.
findstr /C:"YOUR_SUPABASE_PROJECT_URL" "supabase\supabase.js" >nul 2>nul && (
  echo NOTE: You have not entered your Supabase URL/key yet.
  echo       Open supabase\supabase.js in Notepad and edit the two values, then refresh the browser.
  echo.
)

py -3 --version >nul 2>nul && set PY=py -3
if not defined PY python --version >nul 2>nul && set PY=python

if defined PY goto usepython
echo Python was not found (or is only the Microsoft Store shortcut).
echo Using the built-in Windows PowerShell web server instead - nothing needs to be installed.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1" -Port %PORT%
if errorlevel 1 (
  echo.
  echo ERROR: The built-in server could not start. Possible reasons: port %PORT% is in use, or PowerShell is blocked by policy.
  echo FIX: install Python from https://www.python.org/downloads/ ^(tick "Add python.exe to PATH"^) and run this file again.
)
goto end

:usepython
start "" cmd /c "ping -n 3 127.0.0.1 >nul & start http://localhost:%PORT%/index.html"
%PY% "%~dp0server.py" %PORT%
if errorlevel 1 (
  echo.
  echo ERROR: could not start the server. Is port %PORT% already in use? Close the other program and try again.
)

:end
echo.
pause
