#!/bin/sh
set -e

# Start cron daemon in background
echo "[Entrypoint] Starting cron daemon..."
crond -f -l 2 &
CRON_PID=$!

# Wait a moment for cron to start
sleep 1

# Test cron is running
if ! kill -0 $CRON_PID 2>/dev/null; then
  echo "[Entrypoint] Warning: Cron daemon may not have started correctly"
else
  echo "[Entrypoint] Cron daemon started (PID: $CRON_PID)"
fi

# Run the main command (npm start/dev)
echo "[Entrypoint] Starting application..."
exec "$@"

