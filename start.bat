@echo off
echo ==========================================
echo    Revision Database App - Startup
echo ==========================================
echo.

echo [1/2] Checking dependencies...
python -m pip install flask --quiet

echo [2/2] Starting server...
echo.
python app.py

pause
