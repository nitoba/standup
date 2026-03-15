#!/bin/sh
set -eu

cd /app/apps/api

echo "Running database migrations..."
bun ./src/shared/database/migrate.ts

echo "Starting standup-api..."
exec "$@"
