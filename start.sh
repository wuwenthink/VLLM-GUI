#!/bin/bash

# VLLM GUI Server 快捷启动脚本 (WSL/Linux)

# 默认端口
PORT=5000

# 解析命令行参数
while [[ $# -gt 0 ]]; do
    case $1 in
        --port)
            PORT="$2"
            shift 2
            ;;
        *)
            echo "未知参数: $1"
            echo "用法: $0 [--port <端口号>]"
            echo "示例: $0 --port 5001"
            exit 1
            ;;
    esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "[Info] Starting VLLM GUI server..."
echo "[Info] Server will start at http://localhost:${PORT}"
echo "[Info] Press Ctrl+C to stop the server"
echo ""

# 自动打开浏览器
if command -v wslview &> /dev/null; then
    wslview "http://localhost:${PORT}" &
elif command -v xdg-open &> /dev/null; then
    xdg-open "http://localhost:${PORT}" &
elif command -v powershell.exe &> /dev/null; then
    powershell.exe -Command "Start-Process 'http://localhost:${PORT}'" &
else
    echo "[Info] No browser opener found, please open manually: http://localhost:${PORT}"
fi

python vllm_server.py --port $PORT

echo ""
echo "[Info] Server stopped"
