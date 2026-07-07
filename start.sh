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

# Kill anything holding our ports or matching our process patterns
echo "Liberando portas..."
pkill -9 -f "dist/index.mjs" 2>/dev/null || true
pkill -9 -f "vite" 2>/dev/null || true
kill_port 8081
kill_port 5000
sleep 2

# Build the API server first
echo "Building API server..."
cd /home/runner/workspace/artifacts/api-server && pnpm run build
cd /home/runner/workspace

# Start API server in background (port 8081)
echo "Starting API server..."
pkill -9 -f "dist/index.mjs" 2>/dev/null || true
kill_port 8081
sleep 1
PORT=8081 node --enable-source-maps /home/runner/workspace/artifacts/api-server/dist/index.mjs &
API_PID=$!

# Wait for API server to be ready (up to 30s)
echo "Waiting for API server on port 8081..."
READY=0
for i in $(seq 1 30); do
  if curl -sf http://localhost:8081/api > /dev/null 2>&1; then
    echo "API server ready."
    READY=1
    break
  fi
  sleep 1
done

if [ "$READY" -eq 0 ]; then
  echo "API server failed to start. Killing and retrying..."
  pkill -9 -f "dist/index.mjs" 2>/dev/null || true
  kill_port 8081
  sleep 2
  PORT=8081 node --enable-source-maps /home/runner/workspace/artifacts/api-server/dist/index.mjs &
  API_PID=$!
  sleep 5
fi

# Start Vite dev server (port 5000) — invoke vite directly so PORT=5000 is not overridden
# by the dev script's PORT=${PORT:-24365} default
echo "Starting frontend..."
pkill -9 -f "vite" 2>/dev/null || true
kill_port 5000
sleep 1
cd /home/runner/workspace/artifacts/gol-da-sorte
PORT=5000 BASE_PATH=/ NODE_OPTIONS="--max-http-header-size=65536" pnpm exec vite --config vite.config.ts --host 0.0.0.0 &
VITE_PID=$!
cd /home/runner/workspace

# Trap exit signals to clean up both processes
cleanup() {
  echo "Shutting down..."
  pkill -9 -f "dist/index.mjs" 2>/dev/null || true
  pkill -9 -f "vite" 2>/dev/null || true
  kill $VITE_PID 2>/dev/null || true
  exit 0
}
trap cleanup SIGTERM SIGINT EXIT

# Watch loop: restart API server if it dies
while true; do
  if ! kill -0 $API_PID 2>/dev/null; then
    echo "API server stopped unexpectedly. Restarting..."
    pkill -9 -f "dist/index.mjs" 2>/dev/null || true
    kill_port 8081
    sleep 2
    PORT=8081 node --enable-source-maps /home/runner/workspace/artifacts/api-server/dist/index.mjs &
    API_PID=$!
  fi
  if ! kill -0 $VITE_PID 2>/dev/null; then
    echo "Frontend stopped. Exiting."
    exit 1
  fi
  sleep 5
done
