@echo off
cd /d "%~dp0"
rem Start a static server for the presentation app
npx http-server . -p 8080 -c-1
