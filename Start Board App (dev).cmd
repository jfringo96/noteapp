@echo off
title Board App - development
cd /d "%~dp0"

if not exist "node_modules" (
  echo First run: installing dependencies. This takes a minute or two.
  echo.
  call npm install
  echo.
)

echo Starting Board App.
echo Leave this window open while you use it. Closing the app stops everything.
echo.

call npm run dev

echo.
echo Board App has stopped.
pause
