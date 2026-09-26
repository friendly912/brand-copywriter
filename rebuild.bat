@echo off
rem Run this after updating the app's files: reinstalls packages and rebuilds.
cd /d "%~dp0"
call npm install --no-audit --no-fund || goto :fail
echo ok> node_modules\.installed-win
call npm run build || goto :fail
echo ok> .next\.built-win
echo.
echo Done. Start the app with start.bat
pause
goto :eof
:fail
echo Rebuild failed. See the messages above.
pause
exit /b 1
