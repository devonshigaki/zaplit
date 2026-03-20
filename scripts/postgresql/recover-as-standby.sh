#!/bin/bash
# =============================================================================
# PostgreSQL Old Primary Recovery Script
# =============================================================================
# File: /opt/scripts/recover-as-standby.sh
# Purpose: Rebuild a former primary as a new standby after failover
# Based on: PHASE2_POSTGRESQL_REPLICATION_RESEARCH.md
#
# Usage:
#   ./recover-as-standby.sh <new-primary-host>
#
# Arguments:
#   new-primary-host - Hostname/IP of the current primary (new primary after failover)
#
# Environment Variables:
#   PGUSER - PostgreSQL username (default: postgres)
#   REPLICATOR_USER - Replication username (default: replicator)
#   REPLICATOR_PASSWORD - Replication password
#   PGDATA - PostgreSQL data directory (default: /var/lib/postgresql/16/main)
#   SLOT_NAME - Replication slot name (default: standby_recovered_slot)
#
# IMPORTANT:
#   - This script will WIPE the existing data directory
#   - Only run on the OLD PRIMARY after it has been failed over
#   - Ensure the new primary is healthy and accepting connections
# =============================================================================

set -euo pipefail

# -----------------------------------------------------------------------------
# Configuration
# -----------------------------------------------------------------------------
NEW_PRIMARY_HOST="${1:-}"
PGUSER="${PGUSER:-postgres}"
REPLICATOR_USER="${REPLICATOR_USER:-replicator}"
REPLICATOR_PASSWORD="${REPLICATOR_PASSWORD:-}"
PG_VERSION="${PG_VERSION:-16}"
PGDATA="${PGDATA:-/var/lib/postgresql/${PG_VERSION}/main}"
SLOT_NAME="${SLOT_NAME:-standby_recovered_slot}"

# Colors for output
if [[ -t 1 ]]; then
    RED='\033[0;31m'
    YELLOW='\033[1;33m'
    GREEN='\033[0;32m'
    BLUE='\033[0;34m'
    NC='\033[0m'
else
    RED=''
    YELLOW=''
    GREEN=''
    BLUE=''
    NC=''
fi

# -----------------------------------------------------------------------------
# Helper Functions
# -----------------------------------------------------------------------------
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_ok() {
    echo -e "${GREEN}[OK]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_section() {
    echo ""
    echo "======================================================================"
    echo "  $1"
    echo "======================================================================"
}

confirm() {
    local message="$1"
    read -r -p "$message (yes/no): " response
    if [[ "$response" != "yes" ]]; then
        log_info "Aborted by user"
        exit 0
    fi
}

# -----------------------------------------------------------------------------
# Validation
# -----------------------------------------------------------------------------

validate_environment() {
    log_section "Environment Validation"
    
    # Check if new primary host is provided
    if [[ -z "$NEW_PRIMARY_HOST" ]]; then
        log_error "New primary host is required"
        echo "Usage: $0 <new-primary-host>"
        exit 1
    fi
    
    log_info "New Primary: $NEW_PRIMARY_HOST"
    log_info "Data Directory: $PGDATA"
    log_info "Replication Slot: $SLOT_NAME"
    
    # Check if running as root (we need to switch to postgres user for some operations)
    if [[ $EUID -ne 0 ]]; then
        log_warn "Script not running as root - some operations may require sudo"
    fi
    
    # Check if PostgreSQL is installed
    if ! command -v pg_basebackup &> /dev/null; then
        log_error "PostgreSQL tools not found (pg_basebackup not in PATH)"
        exit 1
    fi
    
    # Verify new primary is accessible
    log_info "Testing connectivity to new primary..."
    if ! psql -h "$NEW_PRIMARY_HOST" -U "$PGUSER" -c "SELECT 1;" > /dev/null 2>&1; then
        log_error "Cannot connect to new primary at $NEW_PRIMARY_HOST"
        exit 1
    fi
    
    # Verify new primary is actually primary (not in recovery)
    local in_recovery
    in_recovery=$(psql -h "$NEW_PRIMARY_HOST" -U "$PGUSER" -tAc "SELECT pg_is_in_recovery();" 2>/dev/null || echo "t")
    if [[ "$in_recovery" == "t" ]]; then
        log_error "New primary ($NEW_PRIMARY_HOST) is in recovery mode - cannot use as primary"
        exit 1
    fi
    
    log_ok "New primary is accessible and running as primary"
    
    # Check if this server (old primary) is running PostgreSQL
    if systemctl is-active --quiet postgresql 2>/dev/null; then
        log_warn "PostgreSQL is currently running on this server"
        confirm "Stop PostgreSQL and continue?"
    fi
}

# -----------------------------------------------------------------------------
# Recovery Steps
# -----------------------------------------------------------------------------

stop_postgresql() {
    log_section "Step 1: Stop PostgreSQL"
    
    if systemctl is-active --quiet postgresql 2>/dev/null; then
        log_info "Stopping PostgreSQL..."
        systemctl stop postgresql
        
        # Wait for shutdown
        local attempts=0
        while systemctl is-active --quiet postgresql 2>/dev/null && [[ $attempts -lt 30 ]]; do
            sleep 1
            attempts=$((attempts + 1))
        done
        
        if systemctl is-active --quiet postgresql 2>/dev/null; then
            log_error "PostgreSQL did not stop gracefully - may need manual intervention"
            exit 1
        fi
        
        log_ok "PostgreSQL stopped"
    else
        log_info "PostgreSQL already stopped"
    fi
}

clean_data_directory() {
    log_section "Step 2: Clean Data Directory"
    
    log_warn "This will DELETE all data in $PGDATA"
    confirm "Are you sure you want to wipe the data directory?"
    
    # Backup postgresql.conf if it exists
    if [[ -f "$PGDATA/postgresql.conf" ]]; then
        log_info "Backing up postgresql.conf..."
        cp "$PGDATA/postgresql.conf" "/tmp/postgresql.conf.backup.$(date +%Y%m%d_%H%M%S)"
    fi
    
    # Remove old data
    log_info "Removing old data directory contents..."
    rm -rf "${PGDATA:?}"/*
    
    log_ok "Data directory cleaned"
}

create_base_backup() {
    log_section "Step 3: Create Base Backup from New Primary"
    
    log_info "Starting pg_basebackup from $NEW_PRIMARY_HOST..."
    log_info "This may take several minutes depending on database size..."
    
    # Create base backup
    if [[ -n "$REPLICATOR_PASSWORD" ]]; then
        # Use environment variable for password
        PGPASSWORD="$REPLICATOR_PASSWORD" pg_basebackup \
            -h "$NEW_PRIMARY_HOST" \
            -U "$REPLICATOR_USER" \
            -D "$PGDATA" \
            -P \
            -v \
            -R \
            -X stream \
            -C -S "$SLOT_NAME" \
            -W
    else
        # Will prompt for password
        pg_basebackup \
            -h "$NEW_PRIMARY_HOST" \
            -U "$REPLICATOR_USER" \
            -D "$PGDATA" \
            -P \
            -v \
            -R \
            -X stream \
            -C -S "$SLOT_NAME" \
            -W
    fi
    
    log_ok "Base backup completed"
}

configure_standby() {
    log_section "Step 4: Configure as Standby"
    
    # Create standby.signal file
    log_info "Creating standby.signal..."
    touch "$PGDATA/standby.signal"
    
    # Set correct permissions
    log_info "Setting permissions..."
    chown -R postgres:postgres "$PGDATA"
    chmod 700 "$PGDATA"
    
    # Add standby-specific settings to postgresql.auto.conf
    log_info "Configuring standby settings..."
    cat >> "$PGDATA/postgresql.auto.conf" << EOF

# Standby-specific settings added by recover-as-standby.sh
hot_standby = on
hot_standby_feedback = on
max_standby_archive_delay = 60s
max_standby_streaming_delay = 30s
wal_receiver_status_interval = 10s
wal_receiver_timeout = 60s
wal_retrieve_retry_interval = 5s
EOF
    
    log_ok "Standby configuration complete"
}

start_postgresql() {
    log_section "Step 5: Start PostgreSQL"
    
    log_info "Starting PostgreSQL..."
    systemctl start postgresql
    
    # Wait for startup
    sleep 5
    
    # Verify it's running
    if systemctl is-active --quiet postgresql; then
        log_ok "PostgreSQL started successfully"
    else
        log_error "PostgreSQL failed to start"
        log_info "Check logs: journalctl -u postgresql -n 100"
        exit 1
    fi
}

verify_replication() {
    log_section "Step 6: Verify Replication"
    
    # Wait for replication to establish
    log_info "Waiting for replication to establish..."
    sleep 10
    
    # Check if in recovery mode
    local in_recovery
    in_recovery=$(psql -U "$PGUSER" -tAc "SELECT pg_is_in_recovery();" 2>/dev/null || echo "f")
    
    if [[ "$in_recovery" == "t" ]]; then
        log_ok "Server is running in standby mode"
    else
        log_error "Server is NOT in standby mode - check configuration"
        exit 1
    fi
    
    # Check replication lag
    local lag_info
    lag_info=$(psql -U "$PGUSER" -c "
        SELECT 
            pg_last_wal_receive_lsn() as receive_lsn,
            pg_last_wal_replay_lsn() as replay_lsn,
            pg_wal_lsn_diff(pg_last_wal_receive_lsn(), pg_last_wal_replay_lsn()) as lag_bytes;
    " 2>/dev/null)
    
    log_info "Replication status:"
    echo "$lag_info"
    
    # Check replication status on primary
    local primary_status
    primary_status=$(psql -h "$NEW_PRIMARY_HOST" -U "$PGUSER" -c "
        SELECT 
            client_addr,
            state,
            sync_state
        FROM pg_stat_replication
        WHERE application_name = '$SLOT_NAME';
    " 2>/dev/null)
    
    if [[ -n "$primary_status" ]]; then
        log_ok "Replication connection visible on primary"
        echo "$primary_status"
    else
        log_warn "Replication connection not yet visible on primary - may still be connecting"
    fi
}

# -----------------------------------------------------------------------------
# Main Execution
# -----------------------------------------------------------------------------
main() {
    log_section "PostgreSQL Old Primary Recovery"
    log_info "Rebuilding server as new standby"
    
    validate_environment
    stop_postgresql
    clean_data_directory
    create_base_backup
    configure_standby
    start_postgresql
    verify_replication
    
    log_section "Recovery Complete"
    log_ok "Server has been successfully rebuilt as a standby!"
    
    echo ""
    echo "======================================================================"
    echo "Summary"
    echo "======================================================================"
    echo "New Primary: $NEW_PRIMARY_HOST"
    echo "This Server: Now running as STANDBY"
    echo "Replication Slot: $SLOT_NAME"
    echo ""
    echo "Next Steps:"
    echo "  1. Monitor replication lag: watch -n 5 'psql -c \"SELECT pg_is_in_recovery(), pg_last_xact_replay_timestamp();\"'"
    echo "  2. Update PgBouncer configuration to use this server as standby"
    echo "  3. Update monitoring alerts for new standby location"
    echo "  4. Test failover procedure with new configuration"
    echo "======================================================================"
}

# -----------------------------------------------------------------------------
# Execute main if script is not sourced
# -----------------------------------------------------------------------------
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
