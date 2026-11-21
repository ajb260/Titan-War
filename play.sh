#!/bin/bash
PORT=8080
DIR="$(cd "$(dirname "$0")" && pwd)"

# Kill any process already on the port
lsof -ti tcp:$PORT | xargs kill -9 2>/dev/null

cd "$DIR"
echo "Titan War running at http://localhost:$PORT — press Ctrl+C to stop"
python3 serve.py $PORT &
SERVER_PID=$!

sleep 1
open "http://localhost:$PORT/?t=$(date +%s)"  # unique address so Chrome never shows a stale saved copy

trap "kill $SERVER_PID 2>/dev/null; echo 'Server stopped.'" EXIT
wait $SERVER_PID
