#!/bin/bash
# VINZ PREDICT — Production Startup Script
# Menjalankan API server (port 8080) + Frontend preview (port 5000) bersamaan

set -e

echo "=== VINZ PREDICT Production Start ==="
echo "Starting API Server on port 8080..."
PORT=8080 node --enable-source-maps artifacts/api-server/dist/index.mjs &
API_PID=$!

echo "Starting Frontend on port 5000..."
pnpm --filter @workspace/crypto-saham run serve &
FRONTEND_PID=$!

echo "Both services started."
echo "  API Server PID   : $API_PID"
echo "  Frontend PID     : $FRONTEND_PID"
echo "  Frontend URL     : http://0.0.0.0:5000"
echo "  API URL          : http://0.0.0.0:8080"

# Tunggu salah satu proses selesai (jika crash, exit)
wait -n 2>/dev/null || wait
