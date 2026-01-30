#!/bin/sh

# Script to check and mark offline hosts
# This script is executed by cron inside the container

# Load environment variables from .env if exists
if [ -f /app/.env ]; then
  set -a
  . /app/.env
  set +a
fi

# Default values (will use env vars from container if available)
DB_HOST=${DB_HOST:-postgres}
DB_PORT=${DB_PORT:-5432}
DB_USER=${DB_USER:-ui4monit}
DB_PASSWORD=${DB_PASSWORD:-ui4monit}
DB_NAME=${DB_NAME:-ui4monit}

# Export password for psql
export PGPASSWORD="${DB_PASSWORD}"

# Execute the function and log result
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
RESULT=$(psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" \
  -c "SELECT check_offline_hosts(2);" \
  -t -A 2>&1)

# Log the result
if [ $? -eq 0 ]; then
  echo "[${TIMESTAMP}] Checked offline hosts. Result: ${RESULT}"
else
  echo "[${TIMESTAMP}] ERROR checking offline hosts: ${RESULT}" >&2
fi

# Unset password
unset PGPASSWORD

