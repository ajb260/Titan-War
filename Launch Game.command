#!/bin/bash
PORT=8080
DIR="$(cd "$(dirname "$0")" && pwd)"

lsof -ti tcp:$PORT | xargs kill -9 2>/dev/null

cd "$DIR"
echo "Titan War running at http://localhost:$PORT — close this window to stop"
python3 -m http.server $PORT &
SERVER_PID=$!

sleep 0.3
open "http://localhost:$PORT"

trap "kill $SERVER_PID 2>/dev/null" EXIT
wait $SERVER_PID
