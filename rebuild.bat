@echo off
rem Run this after updating the app's files: reinstalls packages and rebuilds.
cd /d "%~dp0"
rem Start from a clean build folder (a stale or locked cache can make builds fail).
if exist .next rmdir /s /q .next
if exist .next (
  echo Couldn't delete the .next folder. Close the app's black window, then run rebuild.bat again.
  pause
  exit /b 1
)
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
echo If it mentions "os error 32" or "used by another process": close other Brand Copywriter windows,
echo move the folder out of OneDrive/Dropbox if it is there, or restart the computer, then try again.
pause
exit /b 1
