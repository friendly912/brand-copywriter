@echo off
setlocal
title Brand Copywriter
cd /d "%~dp0"

rem Port can be changed by running:  set PORT=3001 ^& start.bat
if "%PORT%"=="" set PORT=3000

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Node.js is not installed.
  echo  Install the LTS version from https://nodejs.org  then run this file again.
  echo.
  pause
  exit /b 1
)

for /f "tokens=1 delims=." %%v in ('node -p "process.versions.node"') do set NODE_MAJOR=%%v
if %NODE_MAJOR% LSS 20 (
  echo.
  echo  Node.js 20 or newer is needed. You have:
  node -v
  echo  Install the LTS version from https://nodejs.org
  echo.
  pause
  exit /b 1
)

rem Already running (e.g. start.bat double-clicked twice)? Just open the browser.
rem Two copies building at once also lock each other's files.
netstat -ano | findstr /r /c:"127\.0\.0\.1:%PORT% .*LISTENING" >nul
if not errorlevel 1 (
  echo Brand Copywriter is already running. Opening it in your browser...
  start http://127.0.0.1:%PORT%
  timeout /t 3 /nobreak >nul
  exit /b 0
)

rem Marker files record that install/build ran on this Windows PC, so a folder
rem copied from another machine gets its own install and build.
if not exist node_modules\.installed-win (
  echo Installing, first run only. This takes a minute...
  call npm install --no-audit --no-fund
  if errorlevel 1 goto :fail
  echo ok> node_modules\.installed-win
  if exist .next\.built-win del .next\.built-win
)

if not exist .next\.built-win (
  echo Building the app, first run only...
  call npm run build
  if errorlevel 1 (
    rem A locked or half-written cache is the usual cause: clear the build and retry once.
    echo.
    echo Build failed. Clearing the old build and trying once more...
    if exist .next rmdir /s /q .next
    call npm run build
    if errorlevel 1 goto :buildfail
  )
  echo ok> .next\.built-win
)

echo.
echo  Brand Copywriter is running at http://127.0.0.1:%PORT%
echo  Keep this window open while you use it. Close it to stop the app.
echo.
start "" cmd /c "timeout /t 3 /nobreak >nul & start http://127.0.0.1:%PORT%"
call npx next start -H 127.0.0.1 -p %PORT%
goto :eof

:buildfail
echo.
echo  The build failed twice. Usually another program is holding the app's files:
echo   - close any other Brand Copywriter windows, then run start.bat again
echo   - if this folder is inside OneDrive or Dropbox, move it somewhere else, e.g. C:\BrandCopywriter
echo   - if it still fails, restart the computer and run rebuild.bat
pause
exit /b 1

:fail
echo.
echo  Something went wrong. See the messages above.
pause
exit /b 1
