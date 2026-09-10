#!/bin/bash
cd "$(dirname "$0")"
PORT=8765
if lsof -ti:$PORT >/dev/null 2>&1; then
  open "http://127.0.0.1:$PORT/"
  exit 0
fi
# Prefer Vite dev server when node_modules exists
if [ -d node_modules ]; then
  npm run dev >/tmp/3d-slime-vite.log 2>&1 &
  sleep 1.2
  open "http://127.0.0.1:$PORT/"
  exit 0
fi
python3 -m http.server $PORT >/tmp/3d-slime-server.log 2>&1 &
sleep 0.5
open "http://127.0.0.1:$PORT/index.html"
