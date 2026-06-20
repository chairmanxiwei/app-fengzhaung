@echo off
cd /d "%~dp0"
title Web-Package

if not exist "node_modules" (
    echo [*] Installing dependencies...
    call npm install --production
)

for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING') do (
    taskkill /pid %%a /f >nul 2>&1
)

echo.
echo   http://localhost:3000
echo   Press Ctrl+C to stop
echo.

node server.js

if errorlevel 1 (
    echo.
    echo [!] Server crashed. Press any key to exit...
    pause >nul
)
