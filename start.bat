@echo off
setlocal

REM 默认端口
set PORT=5001

REM 解析命令行参数
:parse_args
if "%~1"=="" goto :run
if "%~1"=="--port" (
    set PORT=%~2
    shift
    shift
    goto :parse_args
) else (
    echo 未知参数: %~1
    echo 用法: %0 [--port ^<端口号^>]
    echo 示例: %0 --port 5001
    exit /b 1
)

:run
echo [Info] Starting VLLM GUI server...
echo [Info] Server will start at http://localhost:%PORT%
echo [Info] Press Ctrl+C to stop the server
echo.

REM Start Flask server and open browser
start "" "http://localhost:%PORT%"
python vllm_server.py --port %PORT%

echo.
echo [Info] Server stopped
pause
