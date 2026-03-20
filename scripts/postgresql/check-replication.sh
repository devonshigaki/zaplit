#!/bin/bash
# =============================================================================
# PostgreSQL Replication Health Check Script
# =============================================================================
# File: /opt/scripts/check-replication.sh
# Purpose: Monitor PostgreSQL streaming replication health and report status
# Based on: PHASE2_POSTGRESQL_REPLICATION_RESEARCH.md
#
# Usage:
#   ./check-replication.sh [primary_host] [standby_host]
#
# Environment Variables:
#   PRIMARY_HOST - Primary PostgreSQL server hostname/IP (default: localhost)
#   STANDBY_HOST - Standby PostgreSQL server hostname/IP (default: localhost)
#   PGUSER - PostgreSQL username (default: postgres)
#   PGPASSWORD - PostgreSQL password
#   PGPORT - PostgreSQL port (default: 5432)
#
# Exit Codes:
#   0 - All checks passed
#   1 - Warning threshold exceeded
#   2 - Critical threshold exceeded
# =============================================================================

set -euo pipefail

# -----------------------------------------------------------------------------
# Configuration
# -----------------------------------------------------------------------------
PRIMARY_HOST="${PRIMARY_HOST:-localhost}"
STANDBY_HOST="${STANDBY_HOST:-localhost}"
PGUSER="${PGUSER:-postgres}"
PGPASSWORD="${PGPASSWORD:-}"
PGPORT="${PGPORT:-5432}"

# Thresholds
LAG_WARNING_BYTES="${LAG_WARNING_BYTES:-104857600}"      # 100 MB
LAG_CRITICAL_BYTES="${LAG_CRITICAL_BYTES:-1073741824}"   # 1 GB
LAG_WARNING_SECONDS="${LAG_WARNING_SECONDS:-30}"         # 30 seconds
LAG_CRITICAL_SECONDS="${LAG_CRITICAL_SECONDS:-300}"      # 5 minutes

# Colors for output (disable if not terminal)
if [[ -t 1 ]]; then
    RED='\033[0;31m'
    YELLOW='\033[1;33m'
    GREEN='\033[0;32m'
    BLUE='\033[0;34m'
    NC='\033[0m' # No Color
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

run_psql() {
    local host="$1"
    local query="$2"
    local db="${3:-postgres}"
    
    export PGPASSWORD
    psql -h "$host" -p "$PGPORT" -U "$PGUSER" -d "$db" -tAc "$query" 2>/dev/null || echo ""
}

format_bytes() {
    local bytes="$1"
    if command -v numfmt &> /dev/null; then
        numfmt --to=iec "$bytes" 2>/dev/null || echo "${bytes}B"
    else
        echo "${bytes} bytes"
    fi
}

# -----------------------------------------------------------------------------
# Health Check Functions
# -----------------------------------------------------------------------------

check_primary_health() {
    echo ""
    echo "=== Primary Server Health Check ==="
    
    # Check if primary is accessible
    if ! run_psql "$PRIMARY_HOST" "SELECT 1;" > /dev/null 2>&1; then
        log_error "Primary server ($PRIMARY_HOST) is NOT ACCESSIBLE"
        return 2
    fi
    log_ok "Primary server is accessible"
    
    # Check if primary is actually primary (not in recovery)
    local in_recovery
    in_recovery=$(run_psql "$PRIMARY_HOST" "SELECT pg_is_in_recovery();")
    if [[ "$in_recovery" == "t" ]]; then
        log_error "Server ($PRIMARY_HOST) is in recovery mode - expected PRIMARY"
        return 2
    fi
    log_ok "Server is running as PRIMARY"
    
    # Check active connections
    local connections
    connections=$(run_psql "$PRIMARY_HOST" "SELECT count(*) FROM pg_stat_activity;")
    log_info "Active connections: $connections"
    
    # Check replication connections
    local replication_count
    replication_count=$(run_psql "$PRIMARY_HOST" "SELECT count(*) FROM pg_stat_replication;")
    log_info "Replication connections: $replication_count"
    
    return 0
}

check_standby_health() {
    echo ""
    echo "=== Standby Server Health Check ==="
    
    # Check if standby is accessible
    if ! run_psql "$STANDBY_HOST" "SELECT 1;" > /dev/null 2>&1; then
        log_error "Standby server ($STANDBY_HOST) is NOT ACCESSIBLE"
        return 2
    fi
    log_ok "Standby server is accessible"
    
    # Check if standby is actually standby (in recovery)
    local in_recovery
    in_recovery=$(run_psql "$STANDBY_HOST" "SELECT pg_is_in_recovery();")
    if [[ "$in_recovery" != "t" ]]; then
        log_warn "Server ($STANDBY_HOST) is NOT in recovery mode - expected STANDBY"
        return 1
    fi
    log_ok "Server is running as STANDBY"
    
    # Check replay lag
    local lag_bytes
    lag_bytes=$(run_psql "$STANDBY_HOST" "SELECT pg_wal_lsn_diff(pg_last_wal_receive_lsn(), pg_last_wal_replay_lsn());")
    if [[ -n "$lag_bytes" && "$lag_bytes" =~ ^[0-9]+$ ]]; then
        if [[ "$lag_bytes" -gt "$LAG_CRITICAL_BYTES" ]]; then
            log_error "Replay lag: $(format_bytes "$lag_bytes") (CRITICAL > $(format_bytes "$LAG_CRITICAL_BYTES"))"
            return 2
        elif [[ "$lag_bytes" -gt "$LAG_WARNING_BYTES" ]]; then
            log_warn "Replay lag: $(format_bytes "$lag_bytes") (WARNING > $(format_bytes "$LAG_WARNING_BYTES"))"
            return 1
        else
            log_ok "Replay lag: $(format_bytes "$lag_bytes")"
        fi
    fi
    
    # Check time-based lag
    local last_replay_time
    last_replay_time=$(run_psql "$STANDBY_HOST" "SELECT pg_last_xact_replay_timestamp();")
    if [[ -n "$last_replay_time" && "$last_replay_time" != "null" ]]; then
        local lag_seconds
        lag_seconds=$(run_psql "$STANDBY_HOST" "SELECT EXTRACT(EPOCH FROM (now() - pg_last_xact_replay_timestamp()))::int;")
        if [[ -n "$lag_seconds" && "$lag_seconds" =~ ^[0-9]+$ ]]; then
            if [[ "$lag_seconds" -gt "$LAG_CRITICAL_SECONDS" ]]; then
                log_error "Time lag: ${lag_seconds}s (CRITICAL > ${LAG_CRITICAL_SECONDS}s)"
                return 2
            elif [[ "$lag_seconds" -gt "$LAG_WARNING_SECONDS" ]]; then
                log_warn "Time lag: ${lag_seconds}s (WARNING > ${LAG_WARNING_SECONDS}s)"
                return 1
            else
                log_ok "Time lag: ${lag_seconds}s"
            fi
        fi
    fi
    
    return 0
}

check_replication_status() {
    echo ""
    echo "=== Replication Status ==="
    
    # Get detailed replication info from primary
    local replication_info
    replication_info=$(run_psql "$PRIMARY_HOST" "
        SELECT 
            client_addr,
            state,
            sync_state,
            pg_wal_lsn_diff(pg_current_wal_lsn(), sent_lsn) as sent_lag,
            pg_wal_lsn_diff(pg_current_wal_lsn(), flush_lsn) as flush_lag,
            pg_wal_lsn_diff(pg_current_wal_lsn(), replay_lsn) as replay_lag,
            reply_time
        FROM pg_stat_replication;
    ")
    
    if [[ -z "$replication_info" ]]; then
        log_error "No replication connections found on primary"
        return 2
    fi
    
    echo "$replication_info" | while IFS='|' read -r client_addr state sync_state sent_lag flush_lag replay_lag reply_time; do
        log_info "Client: $client_addr"
        log_info "  State: $state"
        log_info "  Sync State: $sync_state"
        log_info "  Sent Lag: $(format_bytes "$sent_lag")"
        log_info "  Flush Lag: $(format_bytes "$flush_lag")"
        log_info "  Replay Lag: $(format_bytes "$replay_lag")"
        log_info "  Reply Time: $reply_time"
        
        # Check replication state
        if [[ "$state" != "streaming" ]]; then
            log_warn "Replication state is '$state' (expected: streaming)"
        fi
    done
    
    # Check for streaming replication
    local streaming_count
    streaming_count=$(run_psql "$PRIMARY_HOST" "SELECT count(*) FROM pg_stat_replication WHERE state = 'streaming';")
    if [[ "$streaming_count" -eq 0 ]]; then
        log_error "No streaming replication connections found"
        return 2
    fi
    log_ok "Found $streaming_count streaming replication connection(s)"
    
    return 0
}

check_replication_slots() {
    echo ""
    echo "=== Replication Slots ==="
    
    local slots
    slots=$(run_psql "$PRIMARY_HOST" "
        SELECT 
            slot_name,
            slot_type,
            active,
            pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn) as lag_bytes
        FROM pg_replication_slots;
    ")
    
    if [[ -z "$slots" ]]; then
        log_warn "No replication slots found"
        return 1
    fi
    
    echo "$slots" | while IFS='|' read -r slot_name slot_type active lag_bytes; do
        log_info "Slot: $slot_name (Type: $slot_type, Active: $active)"
        
        # Check if slot is active
        if [[ "$active" != "t" && "$active" != "true" ]]; then
            log_warn "Slot '$slot_name' is INACTIVE - may cause WAL accumulation"
        fi
        
        # Check slot lag
        if [[ -n "$lag_bytes" && "$lag_bytes" =~ ^[0-9]+$ ]]; then
            if [[ "$lag_bytes" -gt "$LAG_CRITICAL_BYTES" ]]; then
                log_error "  Lag: $(format_bytes "$lag_bytes") (CRITICAL)"
            elif [[ "$lag_bytes" -gt "$LAG_WARNING_BYTES" ]]; then
                log_warn "  Lag: $(format_bytes "$lag_bytes") (WARNING)"
            else
                log_ok "  Lag: $(format_bytes "$lag_bytes")"
            fi
        fi
    done
    
    return 0
}

check_wal_shipping() {
    echo ""
    echo "=== WAL Shipping Status ==="
    
    # Check current WAL LSN on primary
    local current_lsn
    current_lsn=$(run_psql "$PRIMARY_HOST" "SELECT pg_current_wal_lsn();")
    log_info "Primary current WAL LSN: $current_lsn"
    
    # Check archived WAL count (if using archive_command)
    local archived_count
    archived_count=$(run_psql "$PRIMARY_HOST" "
        SELECT count(*) 
        FROM pg_stat_archiver 
        WHERE last_archived_time > now() - interval '1 hour';
    ")
    log_info "Recent WAL archives (last hour): $archived_count"
    
    # Check archiver failures
    local failed_count
    failed_count=$(run_psql "$PRIMARY_HOST" "SELECT failed_count FROM pg_stat_archiver;")
    if [[ -n "$failed_count" && "$failed_count" != "0" && "$failed_count" != "" ]]; then
        log_warn "WAL archiver failures: $failed_count"
    else
        log_ok "No WAL archiver failures"
    fi
    
    return 0
}

check_disk_space() {
    echo ""
    echo "=== Disk Space Check ==="
    
    # Check data directory on primary
    log_info "Primary data directory:"
    run_psql "$PRIMARY_HOST" "
        SELECT 
            pg_size_pretty(pg_database_size(current_database())) as db_size,
            pg_size_pretty(pg_total_relation_size('pg_stat_statements')) as stats_size;
    " || true
    
    return 0
}

# -----------------------------------------------------------------------------
# Main Execution
# -----------------------------------------------------------------------------
main() {
    # Override hosts from command line if provided
    if [[ $# -ge 1 ]]; then
        PRIMARY_HOST="$1"
    fi
    if [[ $# -ge 2 ]]; then
        STANDBY_HOST="$2"
    fi
    
    echo "======================================================================"
    echo "PostgreSQL Replication Health Check"
    echo "======================================================================"
    echo "Primary: $PRIMARY_HOST:$PGPORT"
    echo "Standby: $STANDBY_HOST:$PGPORT"
    echo "Time: $(date)"
    echo "======================================================================"
    
    local exit_code=0
    
    # Run all checks
    check_primary_health || exit_code=$?
    check_standby_health || exit_code=$?
    check_replication_status || exit_code=$?
    check_replication_slots || exit_code=$?
    check_wal_shipping || exit_code=$?
    check_disk_space || exit_code=$?
    
    # Summary
    echo ""
    echo "======================================================================"
    echo "Summary"
    echo "======================================================================"
    case $exit_code in
        0)
            log_ok "All checks passed - Replication is HEALTHY"
            ;;
        1)
            log_warn "Some checks returned warnings - Review recommended"
            ;;
        2)
            log_error "Critical issues detected - Immediate attention required"
            ;;
    esac
    
    echo "======================================================================"
    
    exit $exit_code
}

# -----------------------------------------------------------------------------
# Execute main if script is not sourced
# -----------------------------------------------------------------------------
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
