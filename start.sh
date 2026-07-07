#!/bin/bash

# Helper: kill all processes on a given TCP port using lsof (fuser not available on Replit)
kill_port() {
  local port=$1
  local pids
  pids=$(lsof -ti tcp:"$port" 2>/dev/null)
  if [ -n "$pids" ]; then
    echo "  Liberando porta $port (PIDs: $pids)..."
    echo "$pids" | xargs kill -9 2>/dev/null || true
  fi
}

# Kill any lingering frontend process on port 5000 only
echo "Liberando porta 5000..."
kill_port 5000
sleep 1

# Start Vite dev server directly on port 5000 (bypasses package.json dev script
# so PORT=5000 isn't overridden by PORT=${PORT:-24365} in the script)
echo "Starting frontend..."
cd /home/runner/workspace/artifacts/gol-da-sorte
PORT=5000 BASE_PATH=/ NODE_OPTIONS="--max-http-header-size=65536" pnpm exec vite --config vite.config.ts --host 0.0.0.0 &
VITE_PID=$!
cd /home/runner/workspace

# Trap exit signals to clean up
cleanup() {
  local status=$?
  echo "Shutting down..."
  kill $VITE_PID 2>/dev/null || true
  kill_port 5000
  exit $status
}
trap cleanup SIGTERM SIGINT EXIT

# Watch loop: exit if frontend dies
while true; do
  if ! kill -0 $VITE_PID 2>/dev/null; then
    echo "Frontend stopped. Exiting."
    exit 1
  fi
  sleep 5
done
