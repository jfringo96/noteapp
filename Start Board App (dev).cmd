@echo off
title Board App - development
cd /d "%~dp0"

rem ---------------------------------------------------------------------------
rem  Already running? Say so plainly. Starting a second copy just fails on the
rem  port with a stack trace that looks like something is broken.
rem ---------------------------------------------------------------------------
tasklist /FI "IMAGENAME eq electron.exe" 2>nul | find /I "electron.exe" >nul
if %errorlevel%==0 (
  echo.
  echo   Board App is already running.
  echo.
  echo   Look for the window - it may be behind this one, or on another
  echo   desktop. Any changes made since you opened it are already in there.
  echo.
  echo   Close that window first if you want to start fresh.
  echo.
  pause
  exit /b
)

rem ---------------------------------------------------------------------------
rem  No app window, but the dev server can outlive it if things ended abruptly.
rem  Nothing else uses this port, so anything still holding it is ours.
rem ---------------------------------------------------------------------------
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":5173" ^| findstr LISTENING') do (
  echo   Clearing a leftover dev server...
  taskkill /PID %%p /F >nul 2>&1
)

if not exist "node_modules" (
  echo   First run: installing dependencies. This takes a minute or two.
  echo.
  call npm install
  echo.
)

echo.
echo   Starting Board App.
echo   Leave this window open while you use it. Closing the app stops everything.
echo.

call npm run dev

echo.
echo   Board App has stopped.
pause
