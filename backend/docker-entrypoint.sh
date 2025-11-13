#!/bin/bash
set -euo pipefail

echo "Starting backend service..."

# Ensure uploads directory exists with correct permissions
UPLOADS_DIR="/usr/src/app/uploads"
mkdir -p "$UPLOADS_DIR"
chmod 775 "$UPLOADS_DIR"

# Wait for PostgreSQL to become available when connection details are provided.
if [ -n "${DB_HOST:-}" ] && [ -n "${DB_PORT:-}" ]; then
  MAX_RETRIES="${DB_MAX_RETRIES:-30}"
  RETRY_DELAY="${DB_RETRY_DELAY_MS:-2000}"
  RETRY_COUNTER=0
  RETRY_DELAY_SECONDS=$(( (RETRY_DELAY + 999) / 1000 ))

  echo "Waiting for PostgreSQL at ${DB_HOST}:${DB_PORT} (max ${MAX_RETRIES} attempts)..."
  until pg_isready -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER:-postgres}" >/dev/null 2>&1; do
    if [ "${RETRY_COUNTER}" -ge "${MAX_RETRIES}" ]; then
      echo "PostgreSQL is unavailable after ${MAX_RETRIES} attempts; exiting."
      exit 1
    fi
    RETRY_COUNTER=$((RETRY_COUNTER + 1))
    echo "PostgreSQL not ready yet (attempt ${RETRY_COUNTER}/${MAX_RETRIES}); retrying in ${RETRY_DELAY_SECONDS}s..."
    sleep "${RETRY_DELAY_SECONDS}"
  done
  echo "PostgreSQL is available. Continuing startup."
fi

exec node server.js

