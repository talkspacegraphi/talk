@echo off
echo Building Vortex Messenger Desktop...
echo.

echo [1/3] Building web app...
call npm run build -w apps/web
if %errorlevel% neq 0 exit /b %errorlevel%

echo.
echo [2/3] Building server...
call npm run build -w apps/server
if %errorlevel% neq 0 exit /b %errorlevel%

echo.
echo [3/3] Building Electron app...
cd apps\desktop
call npm run build:win
if %errorlevel% neq 0 exit /b %errorlevel%

echo.
echo ✓ Build complete! Check apps\desktop\dist-electron\
pause
