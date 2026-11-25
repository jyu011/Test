@echo off
chcp 65001 >nul
title Relais - site local (laisse cette fenetre ouverte, tu peux la reduire)
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js n'est pas installe. Installe la version LTS depuis https://nodejs.org puis relance.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Premiere installation, patiente une minute...
  call npm install --no-fund --no-audit
)
if not exist data\relais.db call npm run seed
node scripts\windows.js raccourci --silencieux
set OUVRIR_NAVIGATEUR=1
if /i "%~1"=="--fond" set OUVRIR_NAVIGATEUR=
echo.
echo Relais demarre. Pour l'arreter, ferme cette fenetre.
node server.js
echo.
pause
