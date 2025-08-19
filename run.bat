@echo off
cd /d "%~dp0"
rem Ensure http-server is available; install globally if missing
where http-server >NUL 2>&1
IF %ERRORLEVEL% NEQ 0 (
  echo Installing http-server...
  npm install -g http-server
)
echo Starting static server on http://localhost:8080
http-server . -p 8080 -c-1
=======
rem Start a static server for the presentation app
npx http-server . -p 8080 -c-1
