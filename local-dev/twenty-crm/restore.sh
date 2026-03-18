#!/bin/bash

# Twenty CRM Database Restore Script
# Usage: ./restore.sh <backup_file>

set -e

BACKUP_FILE=$1

if [ -z "$BACKUP_FILE" ]; then
  echo "❌ Error: Please specify a backup file"
  echo "Usage: ./restore.sh <backup_file>"
  echo ""
  echo "Available backups:"
  ls -1 ./backups/*/*.dump.gz 2>/dev/null || echo "  No backups found"
  exit 1
fi

# Decompress if needed
if [[ $BACKUP_FILE == *.gz ]]; then
  echo "🗜️ Decompressing backup..."
  gunzip -c "$BACKUP_FILE" > /tmp/restore_dump.tmp
  BACKUP_FILE="/tmp/restore_dump.tmp"
fi

echo "⚠️ WARNING: This will replace the current database!"
echo "   Backup file: ${BACKUP_FILE}"
echo ""
read -p "Are you sure you want to continue? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
  echo "❌ Restore cancelled"
  exit 1
fi

echo "🛑 Stopping Twenty services..."
cd "$(dirname "$0")"
docker compose stop server worker

echo "🔄 Restoring database..."
docker cp "$BACKUP_FILE" twenty-db-1:/tmp/restore.dump
docker exec twenty-db-1 pg_restore \
  -U postgres \
  -d default \
  --clean \
  --if-exists \
  --no-owner \
  "/tmp/restore.dump"

# Clean up
docker exec twenty-db-1 rm /tmp/restore.dump
rm -f /tmp/restore_dump.tmp

echo "🚀 Restarting Twenty services..."
docker compose start server worker

echo "⏳ Waiting for services to be ready..."
sleep 10

# Health check
if curl -s http://localhost:3001/healthz | grep -q "ok"; then
  echo "✅ Restore complete! Twenty CRM is running."
else
  echo "⚠️ Restore complete but health check failed. Check logs:"
  echo "   docker compose logs -f server"
fi
