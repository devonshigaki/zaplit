#!/bin/bash
# =============================================================================
# n8n Database Backup Script
# =============================================================================
# Purpose: Automated PostgreSQL backup for n8n with GCS upload
# Usage:   /opt/n8n/scripts/backup-database.sh
# Cron:    0 3 * * * (Daily at 3:00 AM UTC)
# Owner:   DevOps/SRE Team
# Date:    March 19, 2026
# =============================================================================

set -euo pipefail

# Configuration
BACKUP_DIR="/opt/n8n/backups"
GCS_BUCKET="gs://zaplit-n8n-backups"
DATE=$(date +%Y%m%d_%H%M%S)
HOSTNAME=$(hostname)
LOG_FILE="/var/log/n8n-backup.log"
RETENTION_DAYS_LOCAL=7
RETENTION_DAYS_GCS=90

# Database Configuration (from docker-compose environment)
DB_CONTAINER="n8n-postgres"
DB_USER="n8n"
DB_NAME="n8n"

# Notification settings (optional)
ALERT_EMAIL="devops@zaplit.com"
SLACK_WEBHOOK_URL="${SLACK_WEBHOOK_URL:-}"  # Set via environment variable

# =============================================================================
# Logging Functions
# =============================================================================

log() {
    local level="$1"
    local message="$2"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$timestamp] [$level] $message" | tee -a "$LOG_FILE"
}

log_info() {
    log "INFO" "$1"
}

log_warn() {
    log "WARN" "$1"
}

log_error() {
    log "ERROR" "$1"
}

# =============================================================================
# Notification Functions
# =============================================================================

send_slack_notification() {
    local status="$1"
    local message="$2"
    
    if [[ -z "$SLACK_WEBHOOK_URL" ]]; then
        return 0
    fi
    
    local color="good"
    if [[ "$status" == "FAILURE" ]]; then
        color="danger"
    elif [[ "$status" == "WARNING" ]]; then
        color="warning"
    fi
    
    local payload=$(cat <<EOF
{
    "attachments": [
        {
            "color": "$color",
            "title": "n8n Database Backup - $status",
            "text": "$message",
            "fields": [
                {"title": "Host", "value": "$HOSTNAME", "short": true},
                {"title": "Timestamp", "value": "$(date '+%Y-%m-%d %H:%M:%S UTC')", "short": true}
            ]
        }
    ]
}
EOF
)
    
    curl -s -X POST -H 'Content-type: application/json' \
        --data "$payload" "$SLACK_WEBHOOK_URL" > /dev/null || true
}

send_email_alert() {
    local subject="$1"
    local body="$2"
    
    if command -v mail &> /dev/null; then
        echo "$body" | mail -s "$subject" "$ALERT_EMAIL" || true
    fi
}

# =============================================================================
# Health Checks
# =============================================================================

check_prerequisites() {
    log_info "Starting backup process - checking prerequisites"
    
    # Check if running as root or with sudo
    if [[ $EUID -ne 0 ]]; then
        log_warn "Script not running as root. Some operations may fail."
    fi
    
    # Check if Docker is running
    if ! docker info &> /dev/null; then
        log_error "Docker is not running or not accessible"
        exit 1
    fi
    
    # Check if PostgreSQL container is running
    if ! docker ps --format "{{.Names}}" | grep -q "^${DB_CONTAINER}$"; then
        log_error "PostgreSQL container '$DB_CONTAINER' is not running"
        exit 1
    fi
    
    # Create backup directory if it doesn't exist
    mkdir -p "$BACKUP_DIR"
    
    # Check disk space (need at least 1GB free)
    local available_space=$(df "$BACKUP_DIR" | awk 'NR==2 {print $4}')
    if [[ $available_space -lt 1048576 ]]; then  # 1GB in KB
        log_error "Insufficient disk space for backup"
        exit 1
    fi
    
    log_info "Prerequisites check passed"
}

# =============================================================================
# Backup Functions
# =============================================================================

create_database_backup() {
    local backup_file="$BACKUP_DIR/n8n-db-${DATE}.sql"
    local compressed_file="${backup_file}.gz"
    
    log_info "Creating database backup: $backup_file"
    
    # Create backup using pg_dump
    if ! docker exec "$DB_CONTAINER" pg_dump -U "$DB_USER" "$DB_NAME" > "$backup_file" 2>/dev/null; then
        log_error "Failed to create database backup"
        rm -f "$backup_file"
        return 1
    fi
    
    # Compress the backup
    log_info "Compressing backup file"
    gzip -f "$backup_file"
    
    # Calculate file size
    local file_size=$(du -h "$compressed_file" | cut -f1)
    log_info "Backup created successfully: $compressed_file ($file_size)"
    
    # Verify backup integrity
    if ! gzip -t "$compressed_file" 2>/dev/null; then
        log_error "Backup file integrity check failed"
        rm -f "$compressed_file"
        return 1
    fi
    
    echo "$compressed_file"
}

upload_to_gcs() {
    local file="$1"
    local filename=$(basename "$file")
    
    log_info "Uploading to GCS: $GCS_BUCKET/$filename"
    
    if ! gsutil cp "$file" "$GCS_BUCKET/" 2>/dev/null; then
        log_error "Failed to upload backup to GCS"
        return 1
    fi
    
    # Verify upload
    if gsutil ls "$GCS_BUCKET/$filename" &> /dev/null; then
        log_info "Upload verified successfully"
    else
        log_error "Upload verification failed"
        return 1
    fi
}

create_metadata() {
    local backup_file="$1"
    local metadata_file="$BACKUP_DIR/n8n-db-${DATE}.meta.json"
    
    # Get database size
    local db_size=$(docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" \
        -t -c "SELECT pg_size_pretty(pg_database_size('$DB_NAME'));" 2>/dev/null | xargs)
    
    # Get workflow count
    local workflow_count=$(docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" \
        -t -c "SELECT COUNT(*) FROM workflow_entity;" 2>/dev/null | xargs)
    
    cat > "$metadata_file" << EOF
{
    "backup_timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "hostname": "$HOSTNAME",
    "database": {
        "name": "$DB_NAME",
        "size": "$db_size",
        "container": "$DB_CONTAINER"
    },
    "n8n": {
        "workflow_count": $workflow_count
    },
    "backup_file": {
        "name": "$(basename "$backup_file")",
        "size": "$(du -h "$backup_file" | cut -f1)",
        "checksum": "$(md5sum "$backup_file" | cut -d' ' -f1)"
    },
    "retention": {
        "local_days": $RETENTION_DAYS_LOCAL,
        "gcs_days": $RETENTION_DAYS_GCS
    }
}
EOF
    
    log_info "Metadata created: $metadata_file"
}

cleanup_old_backups() {
    log_info "Cleaning up old backups (older than $RETENTION_DAYS_LOCAL days)"
    
    local deleted_count=0
    
    # Clean up local backups
    while IFS= read -r file; do
        if [[ -f "$file" ]]; then
            rm -f "$file"
            log_info "Deleted old backup: $(basename "$file")"
            ((deleted_count++)) || true
        fi
    done < <(find "$BACKUP_DIR" -name "n8n-db-*.sql.gz" -mtime +$RETENTION_DAYS_LOCAL 2>/dev/null)
    
    # Clean up old metadata files
    find "$BACKUP_DIR" -name "n8n-db-*.meta.json" -mtime +$RETENTION_DAYS_LOCAL -delete 2>/dev/null || true
    
    log_info "Cleanup complete: $deleted_count files removed"
}

# =============================================================================
# Verification
# =============================================================================

verify_backup() {
    local file="$1"
    
    log_info "Running backup verification"
    
    # Check file exists and is not empty
    if [[ ! -s "$file" ]]; then
        log_error "Backup file is empty or does not exist"
        return 1
    fi
    
    # Test gzip integrity
    if ! gzip -t "$file" 2>/dev/null; then
        log_error "Backup file is corrupted"
        return 1
    fi
    
    # Check if GCS copy exists
    local filename=$(basename "$file")
    if gsutil ls "$GCS_BUCKET/$filename" &> /dev/null; then
        log_info "GCS backup verified"
    else
        log_warn "GCS backup not found (may still be uploading)"
    fi
    
    log_info "Backup verification passed"
}

# =============================================================================
# Main Execution
# =============================================================================

main() {
    local backup_file=""
    local exit_code=0
    
    log_info "========================================"
    log_info "n8n Database Backup Started"
    log_info "========================================"
    
    # Run health checks
    if ! check_prerequisites; then
        log_error "Prerequisites check failed"
        send_slack_notification "FAILURE" "Backup prerequisites check failed"
        exit 1
    fi
    
    # Create backup
    if backup_file=$(create_database_backup); then
        log_info "Database backup created: $backup_file"
        
        # Upload to GCS
        if upload_to_gcs "$backup_file"; then
            log_info "Backup uploaded to GCS successfully"
            
            # Create metadata
            create_metadata "$backup_file"
            
            # Verify backup
            verify_backup "$backup_file"
            
            # Cleanup old backups
            cleanup_old_backups
            
            # Send success notification
            local file_size=$(du -h "$backup_file" | cut -f1)
            send_slack_notification "SUCCESS" "Backup completed successfully. Size: $file_size"
            
            log_info "========================================"
            log_info "Backup completed successfully"
            log_info "========================================"
        else
            log_error "GCS upload failed"
            send_slack_notification "FAILURE" "Backup created but GCS upload failed"
            exit_code=1
        fi
    else
        log_error "Database backup creation failed"
        send_slack_notification "FAILURE" "Database backup creation failed"
        send_email_alert "[ALERT] n8n Backup Failed" "Database backup failed on $HOSTNAME at $(date)"
        exit_code=1
    fi
    
    exit $exit_code
}

# Handle script interruption
trap 'log_error "Backup script interrupted"; exit 1' INT TERM

# Run main function
main "$@"
