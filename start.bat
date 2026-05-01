@echo off
setlocal
title Revision Tracker Pro - Server

echo ==========================================
echo    REVISION TRACKER PRO - STARTUP
echo ==========================================
echo.

:: Check for Python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python is not installed or not in your PATH.
    pause
    exit /b
)

echo [1/2] Verifying dependencies...
:: We now use Flask and SQLite (built-in)
python -m pip install flask --quiet

echo [2/2] Starting API Server...
echo.
:: Run app.py which now handles DB init and the SPA
python app.py

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] The server crashed or failed to start.
    pause
)

endlocal
