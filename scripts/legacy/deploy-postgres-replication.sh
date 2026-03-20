#!/bin/bash
# =============================================================================
# PostgreSQL Streaming Replication Deployment Script
# =============================================================================
# File: /opt/scripts/deploy-postgres-replication.sh
# Purpose: Complete deployment of PostgreSQL primary-standby replication
# Based on: PHASE2_POSTGRESQL_REPLICATION_RESEARCH.md
#
# Usage:
#   ./deploy-postgres-replication.sh --config <config-file>
#   ./deploy-postgres-replication.sh --primary <host> --standby <host> [options]
#
# Prerequisites:
#   - Primary PostgreSQL server running PostgreSQL 16
#   - Standby VM provisioned and accessible via SSH
#   - GCS bucket created for WAL archiving
#   - SSH key-based authentication configured
#
# Environment Variables:
#   GCP_PROJECT_ID        - Google Cloud project ID
#   GCP_REGION            - GCP region (default: us-central1)
#   PRIMARY_ZONE          - Primary zone (default: us-central1-a)
#   STANDBY_ZONE          - Standby zone (default: us-central1-b)
#   GCS_BUCKET            - GCS bucket for WAL archives
#   REPLICATOR_PASSWORD   - Password for replication user
#   N8N_DB_PASSWORD       - Password for n8n_app database user
# =============================================================================

set -euo pipefail

# -----------------------------------------------------------------------------
# Configuration Variables
# -----------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOG_FILE="/tmp/postgres-replication-deploy-${TIMESTAMP}.log"

# GCP Settings
GCP_PROJECT_ID="${GCP_PROJECT_ID:-}"
GCP_REGION="${GCP_REGION:-us-central1}"
PRIMARY_ZONE="${PRIMARY_ZONE:-us-central1-a}"
STANDBY_ZONE="${STANDBY_ZONE:-us-central1-b}"

# PostgreSQL Settings
PG_VERSION="${PG_VERSION:-16}"
PGDATA="/var/lib/postgresql/${PG_VERSION}/main"
PGCONF_DIR="/etc/postgresql/${PG_VERSION}/main"
GCS_BUCKET="${GCS_BUCKET:-n8n-postgres-wal-archive}"
REPLICATOR_USER="${REPLICATOR_USER:-replicator}"
REPLICATOR_PASSWORD="${REPLICATOR_PASSWORD:-$(openssl rand -base64 32)}"
N8N_DB_USER="${N8N_DB_USER:-n8n_app}"
N8N_DB_PASSWORD="${N8N_DB_PASSWORD:-}"
STANDBY_SLOT_NAME="${STANDBY_SLOT_NAME:-standby1_slot}"

# Host Settings (will be set from command line)
PRIMARY_HOST=""
STANDBY_HOST=""
PGBOUNCER_HOST=""
STANDBY_VM_NAME=""
MONITORING_HOST=""

# Deployment Options
SKIP_VM_PROVISION="${SKIP_VM_PROVISION:-false}"
SKIP_GCS_SETUP="${SKIP_GCS_SETUP:-false}"
SKIP_MONITORING="${SKIP_MONITORING:-false}"
FORCE="${FORCE:-false}"

# -----------------------------------------------------------------------------
# Logging Functions
# -----------------------------------------------------------------------------
log_info() {
    local message="[INFO] $(date '+%Y-%m-%d %H:%M:%S') - $1"
    echo -e "\033[0;34m${message}\033[0m" | tee -a "$LOG_FILE"
}

log_ok() {
    local message="[OK] $(date '+%Y-%m-%d %H:%M:%S') - $1"
    echo -e "\033[0;32m${message}\033[0m" | tee -a "$LOG_FILE"
}

log_warn() {
    local message="[WARN] $(date '+%Y-%m-%d %H:%M:%S') - $1"
    echo -e "\033[1;33m${message}\033[0m" | tee -a "$LOG_FILE"
}

log_error() {
    local message="[ERROR] $(date '+%Y-%m-%d %H:%M:%S') - $1"
    echo -e "\033[0;31m${message}\033[0m" | tee -a "$LOG_FILE"
}

log_section() {
    echo "" | tee -a "$LOG_FILE"
    echo "======================================================================" | tee -a "$LOG_FILE"
    echo "  $1" | tee -a "$LOG_FILE"
    echo "======================================================================" | tee -a "$LOG_FILE"
}

# -----------------------------------------------------------------------------
# Helper Functions
# -----------------------------------------------------------------------------
run_ssh() {
    local host="$1"
    shift
    ssh -o ConnectTimeout=30 -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null "$host" "$@" 2>&1
}

run_psql() {
    local host="$1"
    local query="$2"
    local user="${3:-postgres}"
    local db="${4:-postgres}"
    
    PGPASSWORD="${PGPASSWORD:-}" psql -h "$host" -U "$user" -d "$db" -tAc "$query" 2>/dev/null
}

# -----------------------------------------------------------------------------
# Phase 1: Provision Standby VM
# -----------------------------------------------------------------------------
provision_standby_vm() {
    log_section "Phase 1: Provisioning Standby VM"
    
    if [[ "$SKIP_VM_PROVISION" == true ]]; then
        log_info "Skipping VM provisioning (SKIP_VM_PROVISION=true)"
        return 0
    fi
    
    STANDBY_VM_NAME="${STANDBY_VM_NAME:-postgres-standby-${TIMESTAMP}}"
    
    log_info "Creating standby VM: $STANDBY_VM_NAME"
    log_info "Zone: $STANDBY_ZONE"
    log_info "Machine type: e2-standard-2"
    
    # Create the VM
    gcloud compute instances create "$STANDBY_VM_NAME" \
        --project="$GCP_PROJECT_ID" \
        --zone="$STANDBY_ZONE" \
        --machine-type=e2-standard-2 \
        --network-interface=network-tier=PREMIUM,subnet=default \
        --metadata=enable-oslogin=true \
        --maintenance-policy=MIGRATE \
        --provisioning-model=STANDARD \
        --service-account="postgres-replicator@$GCP_PROJECT_ID.iam.gserviceaccount.com" \
        --scopes=https://www.googleapis.com/auth/cloud-platform \
        --tags=postgres,standby \
        --create-disk=auto-delete=yes,boot=yes,device-name="$STANDBY_VM_NAME",image-family=ubuntu-2204-lts,image-project=ubuntu-os-cloud,mode=rw,size=100,type=pd-ssd \
        --no-shielded-secure-boot \
        --shielded-vtpm \
        --shielded-integrity-monitoring \
        --labels=env=production,role=postgres-standby \
        2>&1 | tee -a "$LOG_FILE"
    
    # Get the standby IP
    STANDBY_HOST=$(gcloud compute instances describe "$STANDBY_VM_NAME" \
        --project="$GCP_PROJECT_ID" \
        --zone="$STANDBY_ZONE" \
        --format='get(networkInterfaces[0].accessConfigs[0].natIP)')
    
    log_ok "Standby VM created: $STANDBY_HOST"
    
    # Wait for VM to be ready
    log_info "Waiting for VM to be ready..."
    sleep 30
    
    # Install PostgreSQL on standby
    log_info "Installing PostgreSQL $PG_VERSION on standby..."
    run_ssh "$STANDBY_HOST" "
        export DEBIAN_FRONTEND=noninteractive
        apt-get update -qq
        apt-get install -y -qq gnupg2 wget curl
        
        # Add PostgreSQL repository
        sh -c 'echo \"deb http://apt.postgresql.org/pub/repos/apt \$(lsb_release -cs)-pgdg main\" > /etc/apt/sources.list.d/pgdg.list'
        wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | apt-key add -
        
        apt-get update -qq
        apt-get install -y -qq postgresql-${PG_VERSION} postgresql-client-${PG_VERSION} postgresql-contrib-${PG_VERSION}
        
        # Install Google Cloud SDK for gsutil
        apt-get install -y -qq google-cloud-sdk
        
        # Stop PostgreSQL (will be configured as standby)
        systemctl stop postgresql
    " | tee -a "$LOG_FILE"
    
    log_ok "PostgreSQL installed on standby"
}

# -----------------------------------------------------------------------------
# Phase 2: Configure Primary for Replication
# -----------------------------------------------------------------------------
configure_primary() {
    log_section "Phase 2: Configuring Primary for Replication"
    
    log_info "Configuring primary PostgreSQL: $PRIMARY_HOST"
    
    # Backup existing configuration
    run_ssh "$PRIMARY_HOST" "
        cp $PGCONF_DIR/postgresql.conf $PGCONF_DIR/postgresql.conf.pre-replication.${TIMESTAMP}
        cp $PGCONF_DIR/pg_hba.conf $PGCONF_DIR/pg_hba.conf.pre-replication.${TIMESTAMP}
    " 2>&1 | tee -a "$LOG_FILE"
    
    # Upload primary configuration
    log_info "Uploading primary postgresql.conf..."
    cat > /tmp/primary-postgresql.conf << 'EOF'
# PostgreSQL Primary Server Configuration for n8n HA
# Generated by deploy-postgres-replication.sh

# Connection Settings
listen_addresses = '*'
port = 5432
max_connections = 200
superuser_reserved_connections = 3

# Memory Settings
shared_buffers = 2GB
effective_cache_size = 6GB
work_mem = 16MB
maintenance_work_mem = 512MB
huge_pages = try

# Write-Ahead Logging (WAL)
wal_level = replica
wal_log_hints = on
max_wal_size = 2GB
min_wal_size = 512MB
wal_keep_size = 1GB
wal_compression = on

# WAL Archiving for GCS
archive_mode = on
archive_command = 'gsutil cp %p gs://__GCS_BUCKET__/%f'
archive_timeout = 5min
restore_command = 'gsutil cp gs://__GCS_BUCKET__/%f %p'
recovery_target_timeline = 'latest'

# Streaming Replication
max_wal_senders = 10
max_replication_slots = 5
wal_sender_timeout = 60s
hot_standby_feedback = on

# Checkpoint Settings
checkpoint_timeout = 10min
checkpoint_completion_target = 0.9
checkpoint_flush_after = 256kB

# Query Tuning for n8n
random_page_cost = 1.1
effective_io_concurrency = 200

# Logging
logging_collector = on
log_directory = 'log'
log_filename = 'postgresql-%Y-%m-%d_%H%M%S.log'
log_rotation_age = 1d
log_rotation_size = 100MB
log_min_duration_statement = 1000
log_checkpoints = on
log_connections = on
log_disconnections = on
log_lock_waits = on
log_replication_commands = on

# Autovacuum
autovacuum = on
autovacuum_max_workers = 3
autovacuum_naptime = 1min

# Statistics
shared_preload_libraries = 'pg_stat_statements'
track_activities = on
track_counts = on
track_io_timing = on
EOF
    
    sed -i "s|__GCS_BUCKET__|$GCS_BUCKET|g" /tmp/primary-postgresql.conf
    
    scp /tmp/primary-postgresql.conf "$PRIMARY_HOST":/tmp/postgresql.conf 2>&1 | tee -a "$LOG_FILE"
    run_ssh "$PRIMARY_HOST" "sudo mv /tmp/postgresql.conf $PGCONF_DIR/postgresql.conf" 2>&1 | tee -a "$LOG_FILE"
    
    # Configure pg_hba.conf for replication
    log_info "Configuring pg_hba.conf..."
    
    # Get standby internal IP
    STANDBY_INTERNAL_IP=$(run_ssh "$STANDBY_HOST" "hostname -I | awk '{print \$1}'" 2>/dev/null || echo "")
    
    cat > /tmp/pg_hba.conf << EOF
# PostgreSQL Client Authentication Configuration
# Generated by deploy-postgres-replication.sh

# TYPE  DATABASE        USER            ADDRESS                 METHOD

# Local connections
local   all             postgres                                peer
local   all             all                                     md5

# IPv4 local connections
host    all             all             127.0.0.1/32            scram-sha-256

# IPv6 local connections
host    all             all             ::1/128                 scram-sha-256

# Replication connections from standby server
host    replication     $REPLICATOR_USER  $STANDBY_INTERNAL_IP/32   scram-sha-256

# Application connections
host    n8n             $N8N_DB_USER      10.0.0.0/8               scram-sha-256
host    all             all               10.0.0.0/8               scram-sha-256

# Allow connections from standby network
host    all             all               10.128.0.0/16            scram-sha-256
EOF
    
    scp /tmp/pg_hba.conf "$PRIMARY_HOST":/tmp/pg_hba.conf 2>&1 | tee -a "$LOG_FILE"
    run_ssh "$PRIMARY_HOST" "sudo mv /tmp/pg_hba.conf $PGCONF_DIR/pg_hba.conf" 2>&1 | tee -a "$LOG_FILE"
    
    # Create replicator user and replication slot
    log_info "Creating replication user..."
    run_psql "$PRIMARY_HOST" "
        DO \$\$
        BEGIN
            IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '$REPLICATOR_USER') THEN
                CREATE ROLE $REPLICATOR_USER WITH REPLICATION LOGIN PASSWORD '$REPLICATOR_PASSWORD' CONNECTION LIMIT 5;
            END IF;
        END
        \$\$;
    " "postgres" "postgres" 2>&1 | tee -a "$LOG_FILE"
    
    # Create replication slot
    log_info "Creating replication slot: $STANDBY_SLOT_NAME"
    run_psql "$PRIMARY_HOST" "
        SELECT pg_create_physical_replication_slot('$STANDBY_SLOT_NAME', true);
    " "postgres" "postgres" 2>&1 | tee -a "$LOG_FILE" || log_warn "Slot may already exist"
    
    # Restart PostgreSQL
    log_info "Restarting PostgreSQL on primary..."
    run_ssh "$PRIMARY_HOST" "sudo systemctl restart postgresql" 2>&1 | tee -a "$LOG_FILE"
    
    sleep 5
    
    # Verify primary is running
    if run_psql "$PRIMARY_HOST" "SELECT pg_is_in_recovery();" | grep -q "f"; then
        log_ok "Primary PostgreSQL is running and accepting connections"
    else
        log_error "Primary PostgreSQL failed to start or is in recovery mode"
        exit 1
    fi
    
    log_ok "Primary configured successfully"
}

# -----------------------------------------------------------------------------
# Phase 3: Setup Standby with pg_basebackup
# -----------------------------------------------------------------------------
setup_standby() {
    log_section "Phase 3: Setting Up Standby with pg_basebackup"
    
    log_info "Preparing standby server..."
    
    # Stop PostgreSQL on standby
    run_ssh "$STANDBY_HOST" "sudo systemctl stop postgresql" 2>&1 | tee -a "$LOG_FILE"
    
    # Clean data directory
    run_ssh "$STANDBY_HOST" "sudo rm -rf ${PGDATA}/*" 2>&1 | tee -a "$LOG_FILE"
    
    # Create base backup
    log_info "Creating base backup from primary (this may take several minutes)..."
    run_ssh "$STANDBY_HOST" "
        sudo -u postgres pg_basebackup \
            -h $PRIMARY_HOST \
            -U $REPLICATOR_USER \
            -D $PGDATA \
            -P \
            -v \
            -R \
            -X stream \
            -C -S $STANDBY_SLOT_NAME \
            -W
    " 2>&1 | tee -a "$LOG_FILE" << EOF
$REPLICATOR_PASSWORD
EOF
    
    # Create standby.signal file
    run_ssh "$STANDBY_HOST" "sudo -u postgres touch $PGDATA/standby.signal" 2>&1 | tee -a "$LOG_FILE"
    
    # Set correct permissions
    run_ssh "$STANDBY_HOST" "
        sudo chown -R postgres:postgres $PGDATA
        sudo chmod 700 $PGDATA
    " 2>&1 | tee -a "$LOG_FILE"
    
    # Configure standby-specific settings
    log_info "Configuring standby settings..."
    
    cat > /tmp/standby-postgresql.conf << EOF
# Standby-specific settings
hot_standby = on
hot_standby_feedback = on
max_standby_archive_delay = 60s
max_standby_streaming_delay = 30s
wal_receiver_status_interval = 10s
wal_receiver_timeout = 60s
wal_retrieve_retry_interval = 5s
EOF
    
    scp /tmp/standby-postgresql.conf "$STANDBY_HOST":/tmp/standby.conf 2>&1 | tee -a "$LOG_FILE"
    run_ssh "$STANDBY_HOST" "sudo mv /tmp/standby.conf $PGCONF_DIR/conf.d/standby.conf" 2>&1 | tee -a "$LOG_FILE"
    run_ssh "$STANDBY_HOST" "sudo mkdir -p $PGCONF_DIR/conf.d" 2>&1 | tee -a "$LOG_FILE"
    run_ssh "$STANDBY_HOST" "sudo mv /tmp/standby.conf $PGCONF_DIR/conf.d/standby.conf" 2>&1 | tee -a "$LOG_FILE" || \
        run_ssh "$STANDBY_HOST" "sudo bash -c 'cat >> $PGCONF_DIR/postgresql.conf' < /tmp/standby.conf" 2>&1 | tee -a "$LOG_FILE"
    
    # Start PostgreSQL on standby
    log_info "Starting PostgreSQL on standby..."
    run_ssh "$STANDBY_HOST" "sudo systemctl start postgresql" 2>&1 | tee -a "$LOG_FILE"
    
    sleep 5
    
    # Verify standby is running
    if run_psql "$STANDBY_HOST" "SELECT pg_is_in_recovery();" | grep -q "t"; then
        log_ok "Standby PostgreSQL is running in recovery mode"
    else
        log_warn "Standby may not be in recovery mode - check status"
    fi
    
    log_ok "Standby setup complete"
}

# -----------------------------------------------------------------------------
# Phase 4: Configure PgBouncer
# -----------------------------------------------------------------------------
configure_pgbouncer() {
    log_section "Phase 4: Configuring PgBouncer"
    
    # If PgBouncer host not specified, use primary
    PGBOUNCER_HOST="${PGBOUNCER_HOST:-$PRIMARY_HOST}"
    
    log_info "Installing PgBouncer on $PGBOUNCER_HOST..."
    
    run_ssh "$PGBOUNCER_HOST" "
        apt-get update -qq
        apt-get install -y -qq pgbouncer
    " 2>&1 | tee -a "$LOG_FILE"
    
    # Create pgbouncer configuration
    log_info "Creating PgBouncer configuration..."
    
    cat > /tmp/pgbouncer.ini << EOF
[databases]
n8n = host=$PRIMARY_HOST port=5432 dbname=n8n
n8n_primary = host=$PRIMARY_HOST port=5432 dbname=n8n
n8n_standby = host=$STANDBY_HOST port=5432 dbname=n8n
postgres = host=$PRIMARY_HOST port=5432 dbname=postgres

[pgbouncer]
listen_port = 6432
listen_addr = 0.0.0.0
auth_type = scram-sha-256
auth_file = /etc/pgbouncer/userlist.txt
pool_mode = transaction
default_pool_size = 30
min_pool_size = 10
reserve_pool_size = 5
reserve_pool_timeout = 3
max_client_conn = 500
max_db_connections = 100
server_idle_timeout = 600
server_lifetime = 3600
server_connect_timeout = 15
query_timeout = 300
query_wait_timeout = 120
client_idle_timeout = 0
log_connections = 1
log_disconnections = 1
log_pooler_errors = 1
log_stats = 1
stats_period = 60
admin_users = postgres,pgbouncer
stats_users = prometheus
EOF
    
    # Create userlist.txt
    N8N_DB_PASSWORD_HASH="md5$(echo -n "${N8N_DB_PASSWORD}${N8N_DB_USER}" | md5sum | cut -d' ' -f1)"
    
    cat > /tmp/userlist.txt << EOF
"$N8N_DB_USER" "$N8N_DB_PASSWORD_HASH"
"postgres" ""
"replicator" ""
EOF
    
    scp /tmp/pgbouncer.ini "$PGBOUNCER_HOST":/tmp/pgbouncer.ini 2>&1 | tee -a "$LOG_FILE"
    scp /tmp/userlist.txt "$PGBOUNCER_HOST":/tmp/userlist.txt 2>&1 | tee -a "$LOG_FILE"
    
    run_ssh "$PGBOUNCER_HOST" "
        sudo mv /tmp/pgbouncer.ini /etc/pgbouncer/pgbouncer.ini
        sudo mv /tmp/userlist.txt /etc/pgbouncer/userlist.txt
        sudo chmod 640 /etc/pgbouncer/userlist.txt
        sudo chown pgbouncer:pgbouncer /etc/pgbouncer/userlist.txt
    " 2>&1 | tee -a "$LOG_FILE"
    
    # Start PgBouncer
    log_info "Starting PgBouncer..."
    run_ssh "$PGBOUNCER_HOST" "sudo systemctl restart pgbouncer" 2>&1 | tee -a "$LOG_FILE"
    
    # Verify PgBouncer is running
    if run_ssh "$PGBOUNCER_HOST" "sudo systemctl is-active pgbouncer" > /dev/null 2>&1; then
        log_ok "PgBouncer is running"
    else
        log_warn "PgBouncer status check failed"
    fi
    
    log_ok "PgBouncer configured"
}

# -----------------------------------------------------------------------------
# Phase 5: Test Replication
# -----------------------------------------------------------------------------
test_replication() {
    log_section "Phase 5: Testing Replication"
    
    log_info "Verifying replication is working..."
    
    # Wait for replication to establish
    sleep 10
    
    # Check replication status on primary
    local replication_status
    replication_status=$(run_psql "$PRIMARY_HOST" "
        SELECT 
            client_addr,
            state,
            sync_state,
            pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), replay_lsn)) as lag
        FROM pg_stat_replication;
    " "postgres" "postgres")
    
    log_info "Replication status:"
    echo "$replication_status" | tee -a "$LOG_FILE"
    
    # Check if streaming
    if echo "$replication_status" | grep -q "streaming"; then
        log_ok "Replication is streaming"
    else
        log_warn "Replication may not be streaming yet - check logs"
    fi
    
    # Test write on primary
    log_info "Testing write on primary..."
    run_psql "$PRIMARY_HOST" "
        CREATE TABLE IF NOT EXISTS replication_test (id serial primary key, test_data text, created_at timestamp default now());
        INSERT INTO replication_test (test_data) VALUES ('Replication test at $(date)');
    " "postgres" "n8n" 2>&1 | tee -a "$LOG_FILE"
    
    # Wait for replication
    sleep 3
    
    # Test read on standby
    log_info "Testing read on standby..."
    local standby_result
    standby_result=$(run_psql "$STANDBY_HOST" "
        SELECT test_data FROM replication_test ORDER BY id DESC LIMIT 1;
    " "postgres" "n8n" 2>&1) || true
    
    if [[ -n "$standby_result" ]]; then
        log_ok "Replication test successful - data replicated to standby"
    else
        log_warn "Could not verify replication on standby - check logs"
    fi
    
    # Cleanup test table
    run_psql "$PRIMARY_HOST" "DROP TABLE IF EXISTS replication_test;" "postgres" "n8n" 2>&1 | tee -a "$LOG_FILE" || true
    
    # Test PgBouncer connection
    log_info "Testing PgBouncer connection..."
    if PGPASSWORD="$N8N_DB_PASSWORD" psql -h "$PGBOUNCER_HOST" -p 6432 -U "$N8N_DB_USER" -d n8n -c "SELECT 1;" > /dev/null 2>&1; then
        log_ok "PgBouncer connection test successful"
    else
        log_warn "PgBouncer connection test failed - check configuration"
    fi
    
    log_ok "Replication testing complete"
}

# -----------------------------------------------------------------------------
# Phase 6: Setup Monitoring
# -----------------------------------------------------------------------------
setup_monitoring() {
    log_section "Phase 6: Setting Up Monitoring"
    
    if [[ "$SKIP_MONITORING" == true ]]; then
        log_info "Skipping monitoring setup (SKIP_MONITORING=true)"
        return 0
    fi
    
    # Install postgres_exporter on primary
    log_info "Installing postgres_exporter on primary..."
    
    run_ssh "$PRIMARY_HOST" "
        # Download and install postgres_exporter
        curl -sL https://github.com/prometheus-community/postgres_exporter/releases/download/v0.15.0/postgres_exporter-0.15.0.linux-amd64.tar.gz | \
            tar -xzf - -C /tmp
        sudo mv /tmp/postgres_exporter-*.linux-amd64/postgres_exporter /usr/local/bin/
        sudo chmod +x /usr/local/bin/postgres_exporter
        
        # Create systemd service
        sudo tee /etc/systemd/system/postgres_exporter.service > /dev/null << 'SERVICEFILE'
[Unit]
Description=PostgreSQL Exporter
After=network.target

[Service]
Type=simple
User=postgres
Environment=DATA_SOURCE_NAME=postgresql://localhost:5432/postgres?sslmode=disable
ExecStart=/usr/local/bin/postgres_exporter --web.listen-address=:9187
Restart=always

[Install]
WantedBy=multi-user.target
SERVICEFILE

        sudo systemctl daemon-reload
        sudo systemctl enable postgres_exporter
        sudo systemctl start postgres_exporter
    " 2>&1 | tee -a "$LOG_FILE"
    
    # Install on standby too
    log_info "Installing postgres_exporter on standby..."
    run_ssh "$STANDBY_HOST" "
        curl -sL https://github.com/prometheus-community/postgres_exporter/releases/download/v0.15.0/postgres_exporter-0.15.0.linux-amd64.tar.gz | \
            tar -xzf - -C /tmp
        sudo mv /tmp/postgres_exporter-*.linux-amd64/postgres_exporter /usr/local/bin/
        sudo chmod +x /usr/local/bin/postgres_exporter
        
        sudo tee /etc/systemd/system/postgres_exporter.service > /dev/null << 'SERVICEFILE'
[Unit]
Description=PostgreSQL Exporter
After=network.target

[Service]
Type=simple
User=postgres
Environment=DATA_SOURCE_NAME=postgresql://localhost:5432/postgres?sslmode=disable
ExecStart=/usr/local/bin/postgres_exporter --web.listen-address=:9187
Restart=always

[Install]
WantedBy=multi-user.target
SERVICEFILE

        sudo systemctl daemon-reload
        sudo systemctl enable postgres_exporter
        sudo systemctl start postgres_exporter
    " 2>&1 | tee -a "$LOG_FILE"
    
    log_ok "Monitoring setup complete"
    
    # Save monitoring configuration
    cat > /tmp/postgres-monitoring.yml << EOF
# Prometheus scrape configuration for PostgreSQL
scrape_configs:
  - job_name: 'postgres-primary'
    static_configs:
      - targets: ['$PRIMARY_HOST:9187']
    labels:
      instance: 'postgres-primary'
      role: 'primary'
  
  - job_name: 'postgres-standby'
    static_configs:
      - targets: ['$STANDBY_HOST:9187']
    labels:
      instance: 'postgres-standby'
      role: 'standby'
EOF
    
    log_info "Prometheus configuration saved to: /tmp/postgres-monitoring.yml"
}

# -----------------------------------------------------------------------------
# Save Configuration
# -----------------------------------------------------------------------------
save_deployment_info() {
    log_section "Saving Deployment Information"
    
    local info_file="/tmp/postgres-replication-info-${TIMESTAMP}.txt"
    
    cat > "$info_file" << EOF
PostgreSQL Replication Deployment Information
=============================================
Deployment Date: $(date)
Deployment Log: $LOG_FILE

Infrastructure
--------------
Primary Host: $PRIMARY_HOST
Standby Host: $STANDBY_HOST
Standby VM Name: ${STANDBY_VM_NAME:-<not created>}
PgBouncer Host: $PGBOUNCER_HOST
GCP Region: $GCP_REGION
Primary Zone: $PRIMARY_ZONE
Standby Zone: $STANDBY_ZONE
GCS Bucket: $GCS_BUCKET

Credentials (SAVE SECURELY)
---------------------------
Replication User: $REPLICATOR_USER
Replication Password: $REPLICATOR_PASSWORD
n8n Database User: $N8N_DB_USER
Replication Slot: $STANDBY_SLOT_NAME

Connection Information
----------------------
n8n Connection String:
  Host: $PGBOUNCER_HOST
  Port: 6432
  Database: n8n
  User: $N8N_DB_USER

PostgreSQL Direct:
  Primary: $PRIMARY_HOST:5432
  Standby: $STANDBY_HOST:5432

Useful Commands
---------------
# Check replication status
psql -h $PRIMARY_HOST -U postgres -c "SELECT * FROM pg_stat_replication;"

# Check standby lag
psql -h $STANDBY_HOST -U postgres -c "SELECT pg_is_in_recovery(), pg_last_xact_replay_timestamp();"

# Test PgBouncer
psql -h $PGBOUNCER_HOST -p 6432 -U $N8N_DB_USER -d n8n -c "SELECT 1;"

# Manual failover
/opt/scripts/failover.sh

# Health check
/opt/scripts/check-replication.sh $PRIMARY_HOST $STANDBY_HOST

Monitoring
----------
Postgres Exporter (Primary): http://$PRIMARY_HOST:9187/metrics
Postgres Exporter (Standby): http://$STANDBY_HOST:9187/metrics

Next Steps
----------
1. Configure n8n to use PgBouncer (port 6432)
2. Set up Prometheus/Grafana for monitoring
3. Configure alerting rules
4. Test failover procedure
5. Document runbook procedures
EOF
    
    log_info "Deployment information saved to: $info_file"
    cat "$info_file" | tee -a "$LOG_FILE"
}

# -----------------------------------------------------------------------------
# Main Execution
# -----------------------------------------------------------------------------
main() {
    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --primary)
                PRIMARY_HOST="$2"
                shift 2
                ;;
            --standby)
                STANDBY_HOST="$2"
                shift 2
                ;;
            --pgbouncer)
                PGBOUNCER_HOST="$2"
                shift 2
                ;;
            --standby-vm-name)
                STANDBY_VM_NAME="$2"
                shift 2
                ;;
            --project)
                GCP_PROJECT_ID="$2"
                shift 2
                ;;
            --region)
                GCP_REGION="$2"
                shift 2
                ;;
            --gcs-bucket)
                GCS_BUCKET="$2"
                shift 2
                ;;
            --replicator-password)
                REPLICATOR_PASSWORD="$2"
                shift 2
                ;;
            --n8n-password)
                N8N_DB_PASSWORD="$2"
                shift 2
                ;;
            --skip-vm-provision)
                SKIP_VM_PROVISION=true
                shift
                ;;
            --skip-monitoring)
                SKIP_MONITORING=true
                shift
                ;;
            --force)
                FORCE=true
                shift
                ;;
            --help|-h)
                echo "Usage: $0 --primary <host> --standby <host> [options]"
                echo ""
                echo "Required:"
                echo "  --primary <host>     Primary PostgreSQL hostname/IP"
                echo "  --standby <host>     Standby PostgreSQL hostname/IP"
                echo ""
                echo "Options:"
                echo "  --pgbouncer <host>   PgBouncer hostname/IP (default: primary)"
                echo "  --project <id>       GCP project ID"
                echo "  --region <region>    GCP region (default: us-central1)"
                echo "  --gcs-bucket <name>  GCS bucket for WAL archives"
                echo "  --n8n-password <pwd> n8n database password"
                echo "  --skip-vm-provision  Skip VM provisioning (use existing VM)"
                echo "  --skip-monitoring    Skip monitoring setup"
                echo "  --force              Force deployment without confirmations"
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                exit 1
                ;;
        esac
    done
    
    # Validate required parameters
    if [[ -z "$PRIMARY_HOST" ]]; then
        log_error "--primary is required"
        exit 1
    fi
    
    if [[ -z "$STANDBY_HOST" && "$SKIP_VM_PROVISION" == true ]]; then
        log_error "--standby is required when --skip-vm-provision is set"
        exit 1
    fi
    
    if [[ -z "$N8N_DB_PASSWORD" ]]; then
        log_warn "n8n database password not provided - will need manual configuration"
    fi
    
    # Start deployment
    log_section "PostgreSQL Streaming Replication Deployment"
    log_info "Log file: $LOG_FILE"
    
    # Execute deployment phases
    provision_standby_vm
    configure_primary
    setup_standby
    configure_pgbouncer
    test_replication
    setup_monitoring
    save_deployment_info
    
    log_section "Deployment Complete"
    log_ok "PostgreSQL streaming replication has been successfully deployed!"
    
    echo ""
    echo "======================================================================"
    echo "Deployment Summary"
    echo "======================================================================"
    echo "Primary: $PRIMARY_HOST"
    echo "Standby: $STANDBY_HOST"
    echo "PgBouncer: $PGBOUNCER_HOST:6432"
    echo ""
    echo "Next Steps:"
    echo "  1. Update n8n configuration to use PgBouncer (port 6432)"
    echo "  2. Review and secure credentials in deployment info file"
    echo "  3. Test failover procedure: /opt/scripts/failover.sh"
    echo "  4. Set up Prometheus/Grafana dashboards"
    echo "  5. Configure backup schedule"
    echo "======================================================================"
}

# -----------------------------------------------------------------------------
# Execute main if script is not sourced
# -----------------------------------------------------------------------------
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
