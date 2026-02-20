@echo off
chcp 437 >nul 2>&1
cd /d "I:\AI-Chat\vllm-gui启动器"

:: Set default port
set PORT=5002

echo [Info] Starting VLLM GUI server...
echo [Info] Server port: %PORT%
echo.

:: Check Python installation
python --version >nul 2>&1
if errorlevel 1 (
    echo [Error] Python not found! Please add Python to system PATH.
    pause
    exit /b 1
)

:: Check if vllm_server.py exists
if not exist "vllm_server.py" (
    echo [Error] vllm_server.py not found! Check the file path.
    pause
    exit /b 1
)

:: Start server and open browser
start "" "http://localhost:%PORT%"
python "vllm_server.py" --port %PORT%

echo.
echo [Info] Server stopped
pause