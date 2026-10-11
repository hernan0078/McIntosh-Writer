#!/bin/bash
# 双击运行：在这个文件夹启动本地服务器，并用浏览器打开 McIntosh Writer。关掉这个终端窗口就停止。
# （网页要读字体文件，不能直接双击 index.html 打开）
cd "$(dirname "$0")" || exit 1
PORT=8000
while lsof -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; do PORT=$((PORT + 1)); done
REFRESH=$(date +%s)
(sleep 1 && open "http://localhost:$PORT/?refresh=$REFRESH") &
echo "McIntosh Writer is running at http://localhost:$PORT/. Close this window to stop."
echo "McIntosh Writer 正在 http://localhost:$PORT/ 运行。关闭此窗口即可停止。"
exec python3 writer-server.py "$PORT"
