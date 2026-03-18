#!/bin/bash

# Twenty CRM Database Backup Script
# Usage: ./backup.sh [daily|weekly|monthly]

set -e

BACKUP_TYPE=${1:-daily}
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_DIR="./backups/${BACKUP_TYPE}"
RETENTION_DAYS=${RETENTION_DAYS:-30}

# S3 Configuration (optional)
S3_BUCKET=${S3_BUCKET:-}
S3_PREFIX=${S3_PREFIX:-twenty-crm-backups}

# Create backup directory
mkdir -p "${BACKUP_DIR}"

echo "📦 Starting ${BACKUP_TYPE} backup at ${TIMESTAMP}..."

# Database backup
echo "💾 Backing up PostgreSQL database..."
docker exec twenty-db-1 pg_dump \
  -U postgres \
  -d default \
  --format=custom \
  --compress=9 \
  --file="/tmp/twenty_backup_${TIMESTAMP}.dump"

# Copy backup from container
docker cp "twenty-db-1:/tmp/twenty_backup_${TIMESTAMP}.dump" \
  "${BACKUP_DIR}/twenty_db_${TIMESTAMP}.dump"

# Clean up container
docker exec twenty-db-1 rm "/tmp/twenty_backup_${TIMESTAMP}.dump"

# Create metadata file
cat > "${BACKUP_DIR}/metadata_${TIMESTAMP}.json" <<EOF
{
  "backup_type": "${BACKUP_TYPE}",
  "timestamp": "${TIMESTAMP}",
  "date_iso": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "postgres_version": "$(docker exec twenty-db-1 psql -U postgres -c "SELECT version();" -t | head -1)",
  "database_size": "$(docker exec twenty-db-1 psql -U postgres -c "SELECT pg_size_pretty(pg_database_size('default'));" -t | tr -d ' ')"
}
EOF

# Compress backup
echo "🗜️ Compressing backup..."
gzip -f "${BACKUP_DIR}/twenty_db_${TIMESTAMP}.dump"

BACKUP_SIZE=$(du -h "${BACKUP_DIR}/twenty_db_${TIMESTAMP}.dump.gz" | cut -f1)
echo "✅ Backup created: ${BACKUP_DIR}/twenty_db_${TIMESTAMP}.dump.gz (${BACKUP_SIZE})"

# Upload to S3 if configured
if [ -n "$S3_BUCKET" ]; then
  echo "☁️ Uploading to S3..."
  aws s3 cp "${BACKUP_DIR}/twenty_db_${TIMESTAMP}.dump.gz" \
    "s3://${S3_BUCKET}/${S3_PREFIX}/${BACKUP_TYPE}/"
  aws s3 cp "${BACKUP_DIR}/metadata_${TIMESTAMP}.json" \
    "s3://${S3_BUCKET}/${S3_PREFIX}/${BACKUP_TYPE}/"
  echo "✅ Uploaded to S3"
fi

# Clean up old backups
echo "🧹 Cleaning up backups older than ${RETENTION_DAYS} days..."
find "${BACKUP_DIR}" -name "twenty_db_*.dump.gz" -mtime +${RETENTION_DAYS} -delete
find "${BACKUP_DIR}" -name "metadata_*.json" -mtime +${RETENTION_DAYS} -delete

echo "✅ Backup complete!"
echo ""
echo "📊 Backup Summary:"
echo "   Type: ${BACKUP_TYPE}"
echo "   File: twenty_db_${TIMESTAMP}.dump.gz"
echo "   Size: ${BACKUP_SIZE}"
echo "   Location: ${BACKUP_DIR}/"
if [ -n "$S3_BUCKET" ]; then
  echo "   S3: s3://${S3_BUCKET}/${S3_PREFIX}/${BACKUP_TYPE}/"
fi

# Restore instructions
echo ""
echo "🔄 To restore this backup:"
echo "   ./restore.sh twenty_db_${TIMESTAMP}.dump.gz"
