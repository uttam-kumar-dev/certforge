@echo off
setlocal enabledelayedexpansion

:: Get script root directory
set ROOT=%~dp0

:: Colors (limited in cmd, so keeping simple)
echo.
echo  🏆 CertForge — Certificate Generator
echo.

:: [1/4] Install Python dependencies
echo [1/4] Installing Python dependencies...
cd /d "%ROOT%backend"
pip install -r requirements.txt >nul

:: [2/4] Start FastAPI backend
echo [2/4] Starting FastAPI backend on :8000...
start "backend" cmd /c "uvicorn main:app --reload --port 8000 --log-level warning"
set BACKEND_STARTED=0

:: Wait for backend (simple ping loop)
for /l %%i in (1,1,10) do (
    timeout /t 1 >nul
    curl -sf http://localhost:8000/ >nul 2>&1 && (
        echo     ✓ Backend ready
        set BACKEND_STARTED=1
        goto :backend_ready
    )
)

:backend_ready

:: [3/4] Install Node dependencies
echo [3/4] Installing Node dependencies...
cd /d "%ROOT%frontend"
npm install --silent

:: [4/4] Start React dev server
echo [4/4] Starting React dev server on :5173...
start "frontend" cmd /c "npm run dev"

:: Done
echo.
echo  ✓ CertForge is running!
echo.
echo  🌐 App:      http://localhost:5173
echo  📚 API Docs: http://localhost:8000/docs
echo.
echo  Press Ctrl+C to stop

:: Keep window alive
pause

:: Cleanup (optional: kill processes)
echo Stopping servers...
taskkill /fi "windowtitle eq backend*" /f >nul 2>&1
taskkill /fi "windowtitle eq frontend*" /f >nul 2>&1

endlocal