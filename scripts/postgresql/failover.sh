#!/bin/bash
# =============================================================================
# PostgreSQL Manual Failover Script
# =============================================================================
# File: /opt/scripts/failover.sh
# Purpose: Promote standby to primary and update application configuration
# Based on: PHASE2_POSTGRESQL_REPLICATION_RESEARCH.md
#
# Usage:
#   ./failover.sh [--force] [--no-confirm]
#
# Options:
#   --force        - Skip lag check
#   --no-confirm   - Skip confirmation prompts (for automation)
#   --recover-old  - Rebuild old primary as new standby after failover
#
# Environment Variables:
#   PRIMARY_HOST      - Current primary hostname/IP
#   STANDBY_HOST      - Standby hostname/IP (to be promoted)
#   STANDBY_SSH       - SSH connection string for standby
#   PGBOUNCER_HOST    - PgBouncer hostname/IP
#   N8N_HOST          - n8n application hostname/IP
#   MAX_LAG_SECONDS   - Maximum acceptable replication lag (default: 300)
#
# IMPORTANT: This script should be run from a management/bastion host with
# SSH access to all PostgreSQL servers, PgBouncer, and n8n.
# =============================================================================

set -euo pipefail

# -----------------------------------------------------------------------------
# Configuration
# -----------------------------------------------------------------------------
PRIMARY_HOST="${PRIMARY_HOST:-}"
STANDBY_HOST="${STANDBY_HOST:-}"
STANDBY_SSH="${STANDBY_SSH:-${STANDBY_HOST}}"
PGBOUNCER_HOST="${PGBOUNCER_HOST:-localhost}"
N8N_HOST="${N8N_HOST:-localhost}"
MAX_LAG_SECONDS="${MAX_LAG_SECONDS:-300}"

# PostgreSQL settings
PGUSER="${PGUSER:-postgres}"
PGPASSWORD="${PGPASSWORD:-}"
PGPORT="${PGPORT:-5432}"
PGDATA="${PGDATA:-/var/lib/postgresql/16/main}"

# Script behavior
FORCE=false
NO_CONFIRM=false
RECOVER_OLD=false

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

run_psql() {
    local host="$1"
    local query="$2"
    local db="${3:-postgres}"
    
    export PGPASSWORD
    psql -h "$host" -p "$PGPORT" -U "$PGUSER" -d "$db" -tAc "$query" 2>/dev/null || echo ""
}

run_ssh() {
    local host="$1"
    shift
    ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=no "$host" "$@"
}

confirm() {
    local message="$1"
    if [[ "$NO_CONFIRM" == true ]]; then
        return 0
    fi
    
    read -r -p "$message (yes/no): " response
    if [[ "$response" != "yes" ]]; then
        log_info "Aborted by user"
        exit 0
    fi
}

# -----------------------------------------------------------------------------
# Validation Functions
# -----------------------------------------------------------------------------

validate_environment() {
    log_section "Environment Validation"
    
    # Check required variables
    if [[ -z "$STANDBY_HOST" ]]; then
        log_error "STANDBY_HOST environment variable is required"
        exit 1
    fi
    
    if [[ -z "$STANDBY_SSH" ]]; then
        STANDBY_SSH="$STANDBY_HOST"
    fi
    
    log_info "Primary Host: ${PRIMARY_HOST:-<unknown>}"
    log_info "Standby Host: $STANDBY_HOST"
    log_info "PgBouncer Host: $PGBOUNCER_HOST"
    log_info "n8n Host: $N8N_HOST"
    
    # Check SSH connectivity to standby
    if ! run_ssh "$STANDBY_SSH" "echo 'SSH OK'" > /dev/null 2>&1; then
        log_error "Cannot SSH to standby server ($STANDBY_SSH)"
        exit 1
    fi
    log_ok "SSH connectivity to standby: OK"
    
    # Check if standby is accessible via PostgreSQL
    if ! run_psql "$STANDBY_HOST" "SELECT 1;" > /dev/null 2>&1; then
        log_error "Cannot connect to standby PostgreSQL ($STANDBY_HOST:$PGPORT)"
        exit 1
    fi
    log_ok "PostgreSQL connectivity to standby: OK"
    
    # Check if standby is actually in recovery mode
    local in_recovery
    in_recovery=$(run_psql "$STANDBY_HOST" "SELECT pg_is_in_recovery();")
    if [[ "$in_recovery" != "t" ]]; then
        log_error "Standby server is NOT in recovery mode - already a primary?"
        exit 1
    fi
    log_ok "Standby is in recovery mode (ready for promotion)"
}

check_replication_lag() {
    log_section "Replication Lag Check"
    
    if [[ "$FORCE" == true ]]; then
        log_warn "Skipping lag check (--force specified)"
        return 0
    fi
    
    # Get replication lag in seconds
    local lag_seconds
    lag_seconds=$(run_psql "$STANDBY_HOST" "SELECT EXTRACT(EPOCH FROM (now() - pg_last_xact_replay_timestamp()))::int;")
    
    if [[ -z "$lag_seconds" || ! "$lag_seconds" =~ ^[0-9]+$ ]]; then
        log_warn "Could not determine replication lag"
        confirm "Continue without lag information?"
        return 0
    fi
    
    log_info "Current replication lag: ${lag_seconds} seconds"
    
    if [[ "$lag_seconds" -gt "$MAX_LAG_SECONDS" ]]; then
        log_error "Replication lag is ${lag_seconds}s (exceeds maximum ${MAX_LAG_SECONDS}s)"
        log_warn "Failover now may result in data loss!"
        confirm "Continue with high replication lag?"
    else
        log_ok "Replication lag is acceptable"
    fi
    
    # Show detailed lag information
    local lag_info
    lag_info=$(run_psql "$STANDBY_HOST" "
        SELECT 
            pg_last_wal_receive_lsn() as receive_lsn,
            pg_last_wal_replay_lsn() as replay_lsn,
            pg_wal_lsn_diff(pg_last_wal_receive_lsn(), pg_last_wal_replay_lsn()) as lag_bytes,
            pg_last_xact_replay_timestamp() as replay_timestamp;
    ")
    log_info "Detailed lag info: $lag_info"
}

# -----------------------------------------------------------------------------
# Failover Steps
# -----------------------------------------------------------------------------

stop_application() {
    log_section "Step 1: Stop Application Connections"
    
    log_info "Stopping n8n application..."
    if run_ssh "$N8N_HOST" "sudo systemctl stop n8n" 2>/dev/null; then
        log_ok "n8n stopped successfully"
    else
        log_warn "Could not stop n8n (may not be running or accessible)"
    fi
    
    # Wait for connections to drain
    log_info "Waiting for connections to drain..."
    sleep 5
}

promote_standby() {
    log_section "Step 2: Promote Standby to Primary"
    
    log_info "Triggering promotion on standby..."
    
    # Method 1: Using pg_ctl promote (preferred)
    if run_ssh "$STANDBY_SSH" "sudo -u postgres pg_ctl promote -D $PGDATA" 2>/dev/null; then
        log_ok "Promotion command executed successfully"
    else
        # Method 2: Using trigger file (fallback)
        log_warn "pg_ctl promote failed, trying trigger file method..."
        if run_ssh "$STANDBY_SSH" "sudo -u postgres touch $PGDATA/promote.signal" 2>/dev/null; then
            log_ok "Trigger file created"
        else
            log_error "Failed to promote standby"
            exit 1
        fi
    fi
    
    # Wait for promotion to complete
    log_info "Waiting for promotion to complete..."
    local attempts=0
    local max_attempts=30
    
    while [[ $attempts -lt $max_attempts ]]; do
        sleep 2
        local in_recovery
        in_recovery=$(run_psql "$STANDBY_HOST" "SELECT pg_is_in_recovery();" 2>/dev/null || echo "t")
        
        if [[ "$in_recovery" == "f" ]]; then
            log_ok "Standby promoted to primary successfully!"
            return 0
        fi
        
        attempts=$((attempts + 1))
        log_info "Waiting for promotion... ($attempts/$max_attempts)"
    done
    
    log_error "Promotion did not complete within expected time"
    exit 1
}

update_pgbouncer() {
    log_section "Step 3: Update PgBouncer Configuration"
    
    log_info "Updating PgBouncer to point to new primary ($STANDBY_HOST)..."
    
    # Backup current configuration
    run_ssh "$PGBOUNCER_HOST" "sudo cp /etc/pgbouncer/pgbouncer.ini /etc/pgbouncer/pgbouncer.ini.$(date +%Y%m%d_%H%M%S).bak" 2>/dev/null || true
    
    # Update the primary database entry in pgbouncer.ini
    # This assumes the old primary IP is stored or we replace the host in the n8n database entry
    if [[ -n "${OLD_PRIMARY_HOST:-}" ]]; then
        run_ssh "$PGBOUNCER_HOST" "sudo sed -i 's/host=${OLD_PRIMARY_HOST}/host=${STANDBY_HOST}/g' /etc/pgbouncer/pgbouncer.ini" 2>/dev/null || {
            log_warn "Could not update PgBouncer configuration via sed"
            log_info "Manual update required: Change primary host to $STANDBY_HOST in /etc/pgbouncer/pgbouncer.ini"
        }
    fi
    
    # Reload PgBouncer configuration
    if run_ssh "$PGBOUNCER_HOST" "sudo systemctl reload pgbouncer" 2>/dev/null; then
        log_ok "PgBouncer configuration reloaded"
    else
        log_warn "Could not reload PgBouncer automatically"
        log_info "Run manually: sudo systemctl reload pgbouncer"
    fi
}

verify_new_primary() {
    log_section "Step 4: Verify New Primary"
    
    # Wait a moment for connections to establish
    sleep 3
    
    # Check if we can connect and it's not in recovery
    local in_recovery
    in_recovery=$(run_psql "$STANDBY_HOST" "SELECT pg_is_in_recovery();")
    
    if [[ "$in_recovery" == "f" ]]; then
        log_ok "New primary is accepting read/write connections"
    else
        log_error "New primary is still in recovery mode"
        exit 1
    fi
    
    # Test a write operation
    if run_psql "$STANDBY_HOST" "CREATE TABLE IF NOT EXISTS failover_test (id serial primary key, test_time timestamp default now()); INSERT INTO failover_test DEFAULT VALUES; SELECT count(*) FROM failover_test;" "postgres" > /dev/null 2>&1; then
        log_ok "Write test successful on new primary"
        # Cleanup test table
        run_psql "$STANDBY_HOST" "DROP TABLE IF EXISTS failover_test;" "postgres" > /dev/null 2>&1 || true
    else
        log_warn "Write test failed - new primary may have issues"
    fi
    
    # Show new primary info
    local primary_info
    primary_info=$(run_psql "$STANDBY_HOST" "SELECT inet_server_addr(), inet_server_port(), current_database(), version();")
    log_info "New primary info: $primary_info"
}

restart_application() {
    log_section "Step 5: Restart Application"
    
    log_info "Starting n8n application..."
    if run_ssh "$N8N_HOST" "sudo systemctl start n8n" 2>/dev/null; then
        log_ok "n8n started successfully"
    else
        log_warn "Could not start n8n automatically"
        log_info "Run manually: sudo systemctl start n8n"
    fi
    
    # Wait for n8n to be ready
    sleep 5
    
    # Check if n8n is running
    if run_ssh "$N8N_HOST" "sudo systemctl is-active n8n" > /dev/null 2>&1; then
        log_ok "n8n is running"
    else
        log_warn "n8n status check failed - please verify manually"
    fi
}

document_old_primary() {
    log_section "Post-Failover: Old Primary Documentation"
    
    OLD_PRIMARY_HOST="${OLD_PRIMARY_HOST:-$PRIMARY_HOST}"
    
    if [[ -z "$OLD_PRIMARY_HOST" ]]; then
        log_warn "Old primary host unknown - skipping documentation"
        return 0
    fi
    
    log_info "Old Primary: $OLD_PRIMARY_HOST"
    log_info "New Primary: $STANDBY_HOST"
    
    # Save failover information
    local failover_info_file="/tmp/failover_info_$(date +%Y%m%d_%H%M%S).txt"
    cat > "$failover_info_file" << EOF
PostgreSQL Failover Record
==========================
Date: $(date)
Old Primary: $OLD_PRIMARY_HOST
New Primary: $STANDBY_HOST
PgBouncer: $PGBOUNCER_HOST
Triggered By: $(whoami)@$(hostname)

Recovery Instructions for Old Primary:
--------------------------------------
1. Do NOT start old primary as-is - it will cause split-brain!
2. Rebuild old primary as new standby using:
   /opt/scripts/recover-old-primary.sh
3. Or manually rebuild with pg_basebackup

Next Steps:
-----------
1. Verify application functionality
2. Monitor replication lag on new standby (when rebuilt)
3. Update documentation and runbooks
4. Investigate cause of failover
EOF
    
    log_info "Failover documentation saved to: $failover_info_file"
    cat "$failover_info_file"
}

recover_old_primary() {
    if [[ "$RECOVER_OLD" != true ]]; then
        return 0
    fi
    
    log_section "Post-Failover: Recover Old Primary as Standby"
    
    OLD_PRIMARY_HOST="${OLD_PRIMARY_HOST:-$PRIMARY_HOST}"
    
    if [[ -z "$OLD_PRIMARY_HOST" ]]; then
        log_warn "Old primary host unknown - cannot auto-recover"
        return 0
    fi
    
    confirm "Rebuild old primary ($OLD_PRIMARY_HOST) as new standby now?"
    
    log_info "Rebuilding old primary as standby..."
    
    # Run recovery script on old primary
    if run_ssh "$OLD_PRIMARY_HOST" "sudo /opt/scripts/recover-as-standby.sh $STANDBY_HOST" 2>/dev/null; then
        log_ok "Old primary rebuilt as standby successfully"
    else
        log_warn "Could not automatically rebuild old primary"
        log_info "Run manually on old primary: sudo /opt/scripts/recover-as-standby.sh $STANDBY_HOST"
    fi
}

# -----------------------------------------------------------------------------
# Main Execution
# -----------------------------------------------------------------------------
main() {
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --force)
                FORCE=true
                shift
                ;;
            --no-confirm)
                NO_CONFIRM=true
                shift
                ;;
            --recover-old)
                RECOVER_OLD=true
                shift
                ;;
            --help|-h)
                echo "Usage: $0 [--force] [--no-confirm] [--recover-old]"
                echo ""
                echo "Options:"
                echo "  --force        Skip lag check"
                echo "  --no-confirm   Skip confirmation prompts"
                echo "  --recover-old  Rebuild old primary as standby after failover"
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                exit 1
                ;;
        esac
    done
    
    log_section "PostgreSQL Manual Failover"
    log_warn "This will promote standby ($STANDBY_HOST) to primary"
    
    if [[ -n "${PRIMARY_HOST:-}" ]]; then
        log_info "Current primary ($PRIMARY_HOST) will be demoted"
    fi
    
    confirm "Are you sure you want to proceed with failover?"
    
    # Execute failover steps
    validate_environment
    check_replication_lag
    stop_application
    promote_standby
    update_pgbouncer
    verify_new_primary
    restart_application
    document_old_primary
    recover_old_primary
    
    log_section "Failover Complete"
    log_ok "PostgreSQL failover completed successfully!"
    log_info "New Primary: $STANDBY_HOST"
    
    echo ""
    echo "======================================================================"
    echo "Post-Failover Checklist:"
    echo "  [ ] Verify n8n application is functioning normally"
    echo "  [ ] Check application logs for database errors"
    echo "  [ ] Monitor replication when old primary is rebuilt as standby"
    echo "  [ ] Update DNS/load balancer configurations if needed"
    echo "  [ ] Investigate root cause of the failover requirement"
    echo "======================================================================"
}

# -----------------------------------------------------------------------------
# Execute main if script is not sourced
# -----------------------------------------------------------------------------
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
