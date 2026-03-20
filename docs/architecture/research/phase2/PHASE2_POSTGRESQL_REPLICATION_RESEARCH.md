# PostgreSQL High Availability Replication Research for n8n

## Executive Summary

### Current Situation
- **Setup**: Single PostgreSQL instance on same VM as n8n
- **Risk**: No high availability (HA), single point of failure, data loss risk on VM failure
- **Workload**: n8n workflow automation with PostgreSQL backend

### Recommended Solution
**Option B: Primary + Hot Standby (Different Zone) with Asynchronous Streaming Replication**

This provides the optimal balance of:
- **High Availability**: Automatic failover capability with < 1 minute RTO
- **Data Protection**: Near-zero RPO with proper monitoring
- **Cost Efficiency**: ~2x compute cost vs 3-4x for managed Cloud SQL
- **Operational Control**: Full access to tune for n8n workload patterns

### Key Benefits
| Metric | Current | With Replication | Improvement |
|--------|---------|------------------|-------------|
| Availability | ~99.5% | ~99.95% | +0.45% |
| RTO (Recovery Time) | Hours | < 60 seconds | -99.9% |
| RPO (Data Loss) | Hours/Days | < 5 seconds | -99.9% |
| Failover | Manual | Semi-automated | Automated |

### Quick Cost Comparison (Monthly)
| Option | Compute | Storage | Network | Total |
|--------|---------|---------|---------|-------|
| Current (Single VM) | $50 | $10 | $0 | $60 |
| **Recommended (HA)** | **$100** | **$20** | **$5** | **$125** |
| Cloud SQL HA | $200 | $25 | $0 | $225 |

---

## 1. PostgreSQL Replication Modes Comparison

### 1.1 Physical (Streaming) Replication vs Logical Replication

| Aspect | Streaming Replication | Logical Replication |
|--------|----------------------|---------------------|
| **Replication Level** | Block-level (physical) | Row-level (logical) |
| **Replication Content** | WAL files (binary) | SQL changes (decoded) |
| **Schema Changes** | Replicated automatically | Must be manual (DDL) |
| **Version Compatibility** | Same version only | Cross-version supported |
| **Granularity** | Entire cluster | Selective tables/databases |
| **Conflict Resolution** | Not applicable | Manual handling required |
| **Use Case** | HA, DR, read scaling | Data migration, consolidation |
| **Performance** | Very high throughput | Higher overhead |

**Recommendation for n8n**: Streaming replication is the clear choice for HA scenarios. Logical replication is better suited for data migration or selective replication use cases.

### 1.2 Synchronous vs Asynchronous Replication

| Aspect | Asynchronous | Synchronous |
|--------|--------------|-------------|
| **Commit Behavior** | Primary commits immediately | Waits for standby confirmation |
| **Performance Impact** | Minimal | Significant latency increase |
| **Data Loss Risk (RPO)** | Seconds to minutes | Zero (if both don't fail) |
| **Network Dependency** | Tolerant of latency | Requires low latency (< 10ms) |
| **Complexity** | Simple | More complex |
| **Use Case** | Most HA scenarios | Financial, critical transactions |

**Recommendation for n8n**: Start with **asynchronous replication** for the following reasons:
1. n8n workflows are generally idempotent and can tolerate brief replay
2. Synchronous replication in different zones adds 5-20ms latency per transaction
3. Can upgrade to synchronous for specific critical transactions if needed

### 1.3 Hot Standby vs Warm Standby

| Aspect | Hot Standby | Warm Standby |
|--------|-------------|--------------|
| **Read Queries** | Allowed (read-only) | Not allowed |
| **Failover Time** | Immediate | Requires startup |
| **Resource Usage** | Higher (query processing) | Lower |
| **Lag Visibility** | Observable via queries | Must check logs |
| **Use Case** | Read scaling, HA | DR only |

**Recommendation for n8n**: **Hot Standby** to enable:
- Read query offloading (reporting, analytics)
- Immediate failover capability
- Better visibility into replication health

---

## 2. Architecture Options Analysis

### 2.1 Option A: Primary + Hot Standby (Same Zone)

```
┌─────────────────────────────────────────────────────────────┐
│                    GCP Zone: us-central1-a                  │
│  ┌─────────────────────┐         ┌─────────────────────┐   │
│  │   PostgreSQL        │◄────────│  PostgreSQL         │   │
│  │   Primary           │  SYNC   │  Hot Standby        │   │
│  │   (n8n VM)          │         │  (separate VM)      │   │
│  └─────────────────────┘         └─────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

**Pros:**
- Low latency replication (< 1ms)
- No cross-zone network costs
- Simple network configuration

**Cons:**
- Zone failure affects both nodes
- Not true disaster recovery
- Limited to zone-level HA

**Best For:** Non-critical workloads, cost-sensitive environments

### 2.2 Option B: Primary + Hot Standby (Different Zone) ⭐ RECOMMENDED

```
┌─────────────────────────────────────────────────────────────┐
│                        GCP Region                           │
│  ┌─────────────────────┐         ┌─────────────────────┐   │
│  │   Zone: us-central1-a      │         │   Zone: us-central1-b      │   │
│  │  ┌─────────────────┐│         │  ┌─────────────────┐│   │
│  │  │  PostgreSQL     ││         │  │  PostgreSQL     ││   │
│  │  │  Primary        │◄────────────►│  Hot Standby    ││   │
│  │  │  (n8n VM)       ││   ASYNC   │  │  (separate VM)  ││   │
│  │  └─────────────────┘│         │  └─────────────────┘│   │
│  └─────────────────────┘         └─────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

**Pros:**
- Zone-level failure protection
- True HA with geographic separation
- Reasonable replication lag (1-10ms)
- Moderate cost increase

**Cons:**
- Cross-zone network latency
- Slightly higher network costs (~$0.01/GB)

**Best For:** Production workloads requiring true HA

### 2.3 Option C: Cloud SQL with HA (Managed)

```
┌─────────────────────────────────────────────────────────────┐
│              Google Cloud SQL (Managed)                     │
│                                                             │
│   ┌───────────────────────────────────────────────────┐    │
│   │           Cloud SQL HA Instance                   │    │
│   │  ┌───────────────┐     ┌───────────────┐         │    │
│   │  │   Primary     │◄───►│   Standby     │         │    │
│   │  │  (Zone A)     │ SYNC│  (Zone B)     │         │    │
│   │  └───────────────┘     └───────────────┘         │    │
│   └───────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

**Pros:**
- Fully managed (backups, patching, monitoring)
- Automatic failover
- 99.95% SLA
- Built-in read replicas

**Cons:**
- ~3-4x cost of self-managed
- Limited configuration access
- Connection limits (up to 4000)
- Vendor lock-in

**Best For:** Teams without DBA expertise, rapid scaling needs

### 2.4 Recommendation Matrix

| Scenario | Recommended Option | RTO | RPO | Monthly Cost* |
|----------|-------------------|-----|-----|---------------|
| Development/Lab | Option A | 5 min | 5 min | $80 |
| **Production (Recommended)** | **Option B** | **< 60s** | **< 5s** | **$125** |
| Enterprise/Critical | Option C | < 30s | 0 | $225+ |
| Multi-region DR | Option B + C | < 5 min | < 1 min | $350+ |

*Cost estimates based on e2-standard-2 instances (2 vCPU, 8GB RAM)

---

## 3. Implementation Design

### 3.1 Architecture Overview

```
                              ┌─────────────────┐
                              │   Application   │
                              │   (n8n)         │
                              └────────┬────────┘
                                       │
                              ┌────────▼────────┐
                              │   PgBouncer     │
                              │   (Port 6432)   │
                              └────────┬────────┘
                                       │
                    ┌──────────────────┼──────────────────┐
                    │                  │                  │
                    ▼                  ▼                  ▼
           ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
           │   Primary DB    │ │    Standby DB   │ │   Monitoring    │
           │  (Zone A)       │ │   (Zone B)      │ │   (Prometheus   │
           │                 │ │                 │ │    + Grafana)   │
           └────────┬────────┘ └─────────────────┘ └─────────────────┘
                    │
           ┌────────▼────────┐
           │   WAL Archive   │
           │   (GCS Bucket)  │
           └─────────────────┘
```

### 3.2 Primary Server Configuration

#### postgresql.conf
```ini
# =============================================================================
# PostgreSQL Primary Server Configuration for n8n HA
# =============================================================================

# -----------------------------------------------------------------------------
# Connection Settings
# -----------------------------------------------------------------------------
listen_addresses = '*'
port = 5432
max_connections = 200
superuser_reserved_connections = 3

# -----------------------------------------------------------------------------
# Memory Settings (adjust based on available RAM)
# For 8GB RAM server:
# -----------------------------------------------------------------------------
shared_buffers = 2GB
effective_cache_size = 6GB
work_mem = 16MB
maintenance_work_mem = 512MB
huge_pages = try

# -----------------------------------------------------------------------------
# Write-Ahead Logging (WAL) - Replication Critical
# -----------------------------------------------------------------------------
wal_level = replica
wal_log_hints = on
max_wal_size = 2GB
min_wal_size = 512MB
wal_keep_size = 1GB
wal_compression = on

# -----------------------------------------------------------------------------
# Streaming Replication Settings
# -----------------------------------------------------------------------------
max_wal_senders = 10
max_replication_slots = 5
wal_sender_timeout = 60s

# Hot standby feedback prevents query cancellation on standby
hot_standby_feedback = on

# -----------------------------------------------------------------------------
# Checkpoint Settings
# -----------------------------------------------------------------------------
checkpoint_timeout = 10min
checkpoint_completion_target = 0.9
checkpoint_flush_after = 256kB

# -----------------------------------------------------------------------------
# Query Tuning for n8n Workloads
# -----------------------------------------------------------------------------
random_page_cost = 1.1
effective_io_concurrency = 200
seq_page_cost = 1.0

# -----------------------------------------------------------------------------
# Logging
# -----------------------------------------------------------------------------
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

# -----------------------------------------------------------------------------
# Autovacuum (Critical for n8n's high-churn tables)
# -----------------------------------------------------------------------------
autovacuum = on
autovacuum_max_workers = 3
autovacuum_naptime = 1min
autovacuum_vacuum_threshold = 50
autovacuum_analyze_threshold = 50
autovacuum_vacuum_scale_factor = 0.1
autovacuum_analyze_scale_factor = 0.05

# Aggressive settings for n8n execution_entity table
autovacuum_vacuum_insert_threshold = 1000
autovacuum_vacuum_insert_scale_factor = 0.05

# -----------------------------------------------------------------------------
# Statistics and Monitoring
# -----------------------------------------------------------------------------
shared_preload_libraries = 'pg_stat_statements'
track_activities = on
track_counts = on
track_io_timing = on
track_functions = all

# pg_stat_statements settings
pg_stat_statements.max = 10000
pg_stat_statements.track = all

# -----------------------------------------------------------------------------
# SSL Configuration
# -----------------------------------------------------------------------------
ssl = on
ssl_cert_file = '/etc/ssl/certs/server.crt'
ssl_key_file = '/etc/ssl/private/server.key'
ssl_ca_file = '/etc/ssl/certs/ca.crt'
```

#### pg_hba.conf
```
# =============================================================================
# PostgreSQL Client Authentication Configuration
# =============================================================================

# TYPE  DATABASE        USER            ADDRESS                 METHOD

# Local connections
local   all             postgres                                peer
local   all             all                                     md5

# IPv4 local connections:
host    all             all             127.0.0.1/32            scram-sha-256

# IPv6 local connections:
host    all             all             ::1/128                 scram-sha-256

# Replication connections from standby server
host    replication     replicator      <standby-ip>/32         scram-sha-256

# n8n application connections
host    n8n             n8n_app         <n8n-vm-ip>/32          scram-sha-256

# PgBouncer connections
host    n8n             n8n_app         <pgbouncer-ip>/32       scram-sha-256

# Monitoring connections
host    all             prometheus      <monitoring-ip>/32      scram-sha-256

# Administrative access (restrict in production)
host    all             postgres        <admin-vpc>/24          scram-sha-256
```

### 3.3 Standby Server Configuration

#### postgresql.conf (Standby-specific settings)
```ini
# =============================================================================
# PostgreSQL Standby Server Configuration
# =============================================================================

# Inherit all primary settings, then add/modify:

# -----------------------------------------------------------------------------
# Hot Standby Settings
# -----------------------------------------------------------------------------
hot_standby = on
hot_standby_feedback = on

# Maximum delay before canceling queries on standby
max_standby_archive_delay = 60s
max_standby_streaming_delay = 30s

# -----------------------------------------------------------------------------
# WAL Receiver Settings
# -----------------------------------------------------------------------------
wal_receiver_status_interval = 10s
wal_receiver_timeout = 60s
wal_retrieve_retry_interval = 5s

# -----------------------------------------------------------------------------
# Recovery Settings
# -----------------------------------------------------------------------------
# These are set via postgresql.auto.conf after pg_basebackup
# primary_conninfo = 'host=<primary-ip> port=5432 user=replicator password=<password> application_name=standby1'
# primary_slot_name = 'standby1_slot'
```

#### Standby Setup Script
```bash
#!/bin/bash
# setup-standby.sh - Run on standby server after primary is configured

set -e

PRIMARY_HOST="<primary-ip>"
REPLICATOR_USER="replicator"
REPLICATOR_PASSWORD="<secure-password>"
STANDBY_SLOT_NAME="standby1_slot"
PG_DATA="/var/lib/postgresql/16/main"

# Stop PostgreSQL if running
sudo systemctl stop postgresql

# Remove old data directory
sudo rm -rf ${PG_DATA}/*

# Create base backup from primary
echo "Creating base backup from primary..."
sudo -u postgres pg_basebackup \
    -h ${PRIMARY_HOST} \
    -U ${REPLICATOR_USER} \
    -D ${PG_DATA} \
    -P \
    -v \
    -R \
    -X stream \
    -C -S ${STANDBY_SLOT_NAME} \
    -W

# Configure standby signal
touch ${PG_DATA}/standby.signal

# Set correct permissions
sudo chown -R postgres:postgres ${PG_DATA}
sudo chmod 700 ${PG_DATA}

# Start PostgreSQL
sudo systemctl start postgresql

echo "Standby setup complete. Check logs with: sudo tail -f /var/log/postgresql/postgresql-16-main.log"
```

### 3.4 Replication Slot Configuration

#### On Primary (create slot)
```sql
-- Create physical replication slot for standby
SELECT pg_create_physical_replication_slot('standby1_slot', true);

-- Verify slot creation
SELECT slot_name, slot_type, active, restart_lsn 
FROM pg_replication_slots 
WHERE slot_name = 'standby1_slot';

-- Create replicator user
CREATE ROLE replicator WITH 
    REPLICATION 
    LOGIN 
    PASSWORD '<secure-password>'
    CONNECTION LIMIT 5;

-- Grant necessary permissions
GRANT CONNECT ON DATABASE n8n TO replicator;
```

#### Monitoring Replication Slots
```sql
-- Check replication slot lag
SELECT 
    slot_name,
    slot_type,
    active,
    pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)) AS slot_lag,
    restart_lsn
FROM pg_replication_slots;

-- Check if slot is causing WAL accumulation
SELECT 
    slot_name,
    active,
    pg_wal_lsn_diff(pg_current_wal_lsn(), confirmed_flush_lsn) AS lag_bytes
FROM pg_replication_slots
WHERE slot_type = 'physical';
```

### 3.5 PgBouncer Connection Pooling Configuration

#### pgbouncer.ini
```ini
; =============================================================================
; PgBouncer Configuration for n8n HA Setup
; =============================================================================

[databases]
; Primary database for writes
n8n_primary = host=<primary-ip> port=5432 dbname=n8n

; Standby database for reads (optional, for read scaling)
n8n_standby = host=<standby-ip> port=5432 dbname=n8n

; Fallback to primary if standby unavailable
n8n = host=<primary-ip> port=5432 dbname=n8n

; =============================================================================
; PgBouncer Settings
; =============================================================================
[pgbouncer]
listen_port = 6432
listen_addr = 0.0.0.0
auth_type = scram-sha-256
auth_file = /etc/pgbouncer/userlist.txt

; Pool settings for n8n workload
pool_mode = transaction
default_pool_size = 30
min_pool_size = 10
reserve_pool_size = 5
reserve_pool_timeout = 3
max_client_conn = 500
max_db_connections = 100
max_user_connections = 100

; Connection limits
server_idle_timeout = 600
server_lifetime = 3600
server_connect_timeout = 15
server_login_retry = 3

; Timeouts
query_timeout = 300
query_wait_timeout = 120
client_idle_timeout = 0
client_login_timeout = 60

; Logging
log_connections = 1
log_disconnections = 1
log_pooler_errors = 1
log_stats = 1
stats_period = 60

; Admin console
admin_users = postgres,pgbouncer
stats_users = prometheus

; TLS settings
server_tls_sslmode = prefer
server_tls_ca_file = /etc/ssl/certs/ca.crt
server_tls_cert_file = /etc/ssl/certs/server.crt
server_tls_key_file = /etc/ssl/private/server.key
```

#### userlist.txt
```
"n8n_app" "<SCRAM-hash-or-plaintext>"
"postgres" "<SCRAM-hash-or-plaintext>"
"prometheus" "<SCRAM-hash-or-plaintext>"
```

#### PgBouncer Failover Configuration
```ini
; Add to pgbouncer.ini for automatic failover detection

; Server round-robin for high availability
n8n = host=<primary-ip>,<standby-ip> port=5432,5432 dbname=n8n

; Or use separate databases and switch in application
; Application connects to 'n8n' which points to current primary
```

---

## 4. n8n-Specific Considerations

### 4.1 n8n Database Schema Analysis

n8n uses the following key tables that generate high write volume:

| Table | Write Pattern | Criticality | Notes |
|-------|--------------|-------------|-------|
| `execution_entity` | High insert | Critical | Workflow execution logs |
| `workflow_entity` | Medium update | High | Workflow definitions |
| `credentials_entity` | Low update | High | Stored credentials |
| `tag_entity` | Low update | Medium | Workflow tags |
| `webhook_entity` | Medium insert | High | Active webhooks |

### 4.2 Connection Pool Tuning for n8n

#### Environment Variables
```bash
# n8n database connection settings for pooled connections
N8N_DB_TYPE=postgresdb
N8N_DB_POSTGRESDB_HOST=localhost
N8N_DB_POSTGRESDB_PORT=6432  # Connect to PgBouncer, not direct
N8N_DB_POSTGRESDB_DATABASE=n8n
N8N_DB_POSTGRESDB_USER=n8n_app
N8N_DB_POSTGRESDB_PASSWORD=<password>

# Pool size - align with PgBouncer default_pool_size
DB_POSTGRESDB_POOL_SIZE=10
DB_POSTGRESDB_POOL_SIZE_MASTER=10

# Connection timeout
DB_POSTGRESDB_CONNECTION_TIMEOUT=30000
```

### 4.3 Recommended Indexes for n8n

```sql
-- Add these indexes to improve n8n performance on standby reads

-- execution_entity table (high churn)
CREATE INDEX IF NOT EXISTS idx_execution_workflow_status 
ON execution_entity (workflowId, status, startedAt DESC);

CREATE INDEX IF NOT EXISTS idx_execution_finished 
ON execution_entity (finished, finishedAt DESC) 
WHERE finished = true;

CREATE INDEX IF NOT EXISTS idx_execution_stopped_at 
ON execution_entity (stoppedAt DESC) 
WHERE stoppedAt IS NOT NULL;

-- workflow_entity table
CREATE INDEX IF NOT EXISTS idx_workflow_active 
ON workflow_entity (active, updatedAt DESC);

CREATE INDEX IF NOT EXISTS idx_workflow_name 
ON workflow_entity USING gin (name gin_trgm_ops);

-- credentials_entity table
CREATE INDEX IF NOT EXISTS idx_credential_name 
ON credentials_entity (name);

-- webhook_entity table
CREATE INDEX IF NOT EXISTS idx_webhook_path_method 
ON webhook_entity (webhookPath, method);
```

### 4.4 Failover Detection in n8n

n8n does not have built-in database failover detection. Options:

#### Option 1: Connection String with Multiple Hosts (Recommended)
```bash
# PostgreSQL 14+ libpq supports multiple hosts
N8N_DB_POSTGRESDB_HOST=primary-ip,standby-ip
N8N_DB_POSTGRESDB_PORT=5432,5432
```

#### Option 2: Virtual IP with Keepalived
```
┌──────────────────────────────────────────┐
│         Virtual IP: 10.0.0.100           │
│              (Keepalived)                │
│                    │                     │
│      ┌─────────────┼─────────────┐       │
│      ▼             ▼             ▼       │
│   ┌─────────┐  ┌─────────┐  ┌─────────┐  │
│   │ Primary │  │ Standby │  │  VIP    │  │
│   │ (Master)│  │         │  │ (Backup)│  │
│   └─────────┘  └─────────┘  └─────────┘  │
└──────────────────────────────────────────┘
```

#### Option 3: Application-Level Retry Logic
```javascript
// Example retry configuration for n8n
const dbConfig = {
  host: process.env.DB_HOST,
  port: 5432,
  retry: {
    max: 10,
    delay: 3000,
    // On connection failure, try standby
    failoverHosts: [process.env.DB_STANDBY_HOST]
  },
  // Reconnect on connection loss
  reconnectOnError: (err) => {
    return err.code === 'ECONNRESET' || err.code === '57P01';
  }
};
```

---

## 5. Failover Procedures

### 5.1 Manual Failover Procedure

```bash
#!/bin/bash
# manual-failover.sh - Promote standby to primary

set -e

STANDBY_HOST="<standby-ip>"
STANDBY_SSH="standby-server"
PRIMARY_SSH="primary-server"

echo "=== Manual Failover Procedure ==="
echo "WARNING: This will promote standby to primary!"
read -p "Are you sure? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo "Aborted."
    exit 1
fi

# Step 1: Verify replication lag is acceptable
echo "Checking replication lag..."
LAG=$(ssh $STANDBY_SSH "psql -t -c \"SELECT EXTRACT(EPOCH FROM (now() - pg_last_xact_replay_timestamp()))::int;\"")

if [ "$LAG" -gt 300 ]; then
    echo "WARNING: Replication lag is ${LAG}s (> 5 min). Continue?"
    read -p "Continue? (yes/no): " confirm2
    if [ "$confirm2" != "yes" ]; then
        exit 1
    fi
fi

# Step 2: Stop application connections
echo "Stopping n8n..."
sudo systemctl stop n8n

# Step 3: Promote standby
echo "Promoting standby to primary..."
ssh $STANDBY_SSH "sudo -u postgres pg_ctl promote -D /var/lib/postgresql/16/main"

# Step 4: Update PgBouncer configuration
echo "Updating PgBouncer configuration..."
sudo sed -i "s/<old-primary-ip>/<new-primary-ip>/g" /etc/pgbouncer/pgbouncer.ini
sudo systemctl reload pgbouncer

# Step 5: Update n8n configuration if needed
# (if using direct connection instead of PgBouncer)

# Step 6: Start n8n
echo "Starting n8n..."
sudo systemctl start n8n

# Step 7: Verify connectivity
echo "Verifying database connectivity..."
sleep 5
psql -h localhost -p 6432 -U n8n_app -d n8n -c "SELECT pg_is_in_recovery();"

echo "=== Failover Complete ==="
echo "Old primary can be reconfigured as standby when available."
```

### 5.2 Semi-Automated Failover with repmgr

#### repmgr Configuration
```ini
# /etc/repmgr.conf - On both nodes
node_id=1
node_name=primary
conninfo='host=<primary-ip> user=repmgr dbname=repmgr connect_timeout=2'
data_directory='/var/lib/postgresql/16/main'

# Failover settings
failover=automatic
promote_command='repmgr standby promote -f /etc/repmgr.conf --log-to-file'
follow_command='repmgr standby follow -f /etc/repmgr.conf --log-to-file --upstream-node-id=%n'

# Monitoring
monitor_interval_secs=2
connection_check_type=ping
reconnect_attempts=4
reconnect_interval=5

# Event notifications
event_notification_command='/opt/repmgr/notify.sh %n %e %s "%t" "%d"'
events=master_register,standby_register,repromote,failover_success
```

#### Automatic Failover Workflow
```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│   Primary    │◄──►│   repmgrd    │◄──►│   Standby    │
│   (Node 1)   │    │   Monitor    │    │   (Node 2)   │
└──────┬───────┘    └──────┬───────┘    └──────┬───────┘
       │                   │                   │
       │    Heartbeat      │                   │
       │◄──────────────────►│                   │
       │                   │                   │
       │     Failure       │                   │
       │   Detected        │                   │
       │──────────────────►│                   │
       │                   │                   │
       │                   │   Promote         │
       │                   │──────────────────►│
       │                   │                   │
       │                   │   Update          │
       │                   │   PgBouncer       │
       │                   │──────────────────►│
```

### 5.3 Post-Failover Recovery

```bash
#!/bin/bash
# recover-old-primary.sh - Rebuild failed primary as new standby

OLD_PRIMARY_HOST="<old-primary-ip>"
NEW_PRIMARY_HOST="<new-primary-ip>"

# On old primary (now to be standby):

# Step 1: Stop PostgreSQL
sudo systemctl stop postgresql

# Step 2: Clean data directory
sudo rm -rf /var/lib/postgresql/16/main/*

# Step 3: Create new base backup
sudo -u postgres pg_basebackup \
    -h ${NEW_PRIMARY_HOST} \
    -U replicator \
    -D /var/lib/postgresql/16/main \
    -P \
    -v \
    -R \
    -X stream \
    -C -S standby_recovered_slot \
    -W

# Step 4: Create standby signal
touch /var/lib/postgresql/16/main/standby.signal

# Step 5: Start PostgreSQL
sudo systemctl start postgresql

# Step 6: Verify replication
echo "Verifying replication status..."
psql -c "SELECT pg_is_in_recovery();"  # Should return 't'
```

---

## 6. Backup Integration

### 6.1 PITR (Point-in-Time Recovery) Setup

#### WAL Archiving Configuration
```bash
# Create GCS bucket for WAL archives
gsutil mb -l us-central1 gs://n8n-postgres-wal-archive

# Create service account
gcloud iam service-accounts create postgres-archive \
    --display-name="PostgreSQL Archive"

gcloud projects add-iam-policy-binding <project-id> \
    --member="serviceAccount:postgres-archive@<project-id>.iam.gserviceaccount.com" \
    --role="roles/storage.objectAdmin"

# Create and download key
gcloud iam service-accounts keys create /etc/postgres/gcs-key.json \
    --iam-account=postgres-archive@<project-id>.iam.gserviceaccount.com

# Set permissions
sudo chown postgres:postgres /etc/postgres/gcs-key.json
sudo chmod 600 /etc/postgres/gcs-key.json
```

#### postgresql.conf (WAL Archive Settings)
```ini
# WAL Archiving for PITR
archive_mode = on
archive_command = 'gsutil cp %p gs://n8n-postgres-wal-archive/%f'
archive_timeout = 5min

# Alternative with wal-g (recommended for production)
# archive_command = 'wal-g wal-push %p'

# Recovery settings (for standby and PITR)
restore_command = 'gsutil cp gs://n8n-postgres-wal-archive/%f %p'
recovery_target_timeline = 'latest'
```

### 6.2 Backup Strategy

| Backup Type | Frequency | Retention | Tool | Storage |
|-------------|-----------|-----------|------|---------|
| Full Base Backup | Daily | 7 days | pg_basebackup / wal-g | GCS Coldline |
| WAL Archiving | Continuous | 30 days | archive_command | GCS Standard |
| Logical Backup | Weekly | 90 days | pg_dump | GCS Coldline |
| Cross-region Copy | Weekly | 30 days | gsutil rsync | GCS us-east1 |

#### Automated Backup Script
```bash
#!/bin/bash
# /opt/scripts/postgres-backup.sh

set -e

BACKUP_BUCKET="gs://n8n-postgres-backups"
WAL_BUCKET="gs://n8n-postgres-wal-archive"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/tmp/postgres-backup-${DATE}"

# Create base backup using wal-g
export WALG_GS_PREFIX="${BACKUP_BUCKET}/base"
export GOOGLE_APPLICATION_CREDENTIALS="/etc/postgres/gcs-key.json"

echo "Starting base backup at $(date)"
wal-g backup-push /var/lib/postgresql/16/main

# Verify backup
echo "Verifying backup..."
wal-g backup-verify

# Cleanup old backups (keep last 7)
echo "Cleaning up old backups..."
wal-g delete --confirm retain 7

# Update backup timestamp
psql -c "INSERT INTO admin.backup_log (backup_type, completed_at, location) 
         VALUES ('base', NOW(), '${BACKUP_BUCKET}/base');"

echo "Backup completed at $(date)"
```

### 6.3 PITR Recovery Procedure

```bash
#!/bin/bash
# point-in-time-recovery.sh

RECOVERY_TIME="2024-03-15 14:30:00"
RESTORE_DIR="/var/lib/postgresql/16/recovery"

# Step 1: Stop PostgreSQL
sudo systemctl stop postgresql

# Step 2: Prepare recovery directory
sudo rm -rf ${RESTORE_DIR}
sudo mkdir -p ${RESTORE_DIR}
sudo chown postgres:postgres ${RESTORE_DIR}

# Step 3: Fetch base backup
wal-g backup-fetch ${RESTORE_DIR} LATEST

# Step 4: Configure recovery
cat > ${RESTORE_DIR}/postgresql.auto.conf <<EOF
restore_command = 'gsutil cp gs://n8n-postgres-wal-archive/%f %p'
recovery_target_time = '${RECOVERY_TIME}'
recovery_target_action = 'pause'
EOF

# Step 5: Create recovery signal
touch ${RESTORE_DIR}/recovery.signal

# Step 6: Start recovery
sudo -u postgres pg_ctl -D ${RESTORE_DIR} start

# Step 7: Monitor recovery
# When recovery pauses at target time:
psql -c "SELECT pg_wal_replay_resume();"

# Step 8: Verify and switch
# If satisfied, stop and swap directories
sudo -u postgres pg_ctl -D ${RESTORE_DIR} stop
sudo mv /var/lib/postgresql/16/main /var/lib/postgresql/16/main.old
sudo mv ${RESTORE_DIR} /var/lib/postgresql/16/main
sudo systemctl start postgresql
```

### 6.4 Backup from Standby

```ini
# postgresql.conf on standby
# Enable backup from standby
hot_standby = on

# Allow backups during replication
checkpoint_timeout = 5min
```

```bash
# Create backup from standby to reduce primary load
pg_basebackup \
    -h <standby-ip> \
    -U replicator \
    -D /backup/standby-backup-$(date +%Y%m%d) \
    -P \
    -v \
    -X stream \
    --checkpoint=fast
```

---

## 7. Monitoring Setup

### 7.1 Key Metrics to Monitor

| Category | Metric | Warning Threshold | Critical Threshold |
|----------|--------|-------------------|-------------------|
| **Replication** | Replication Lag (bytes) | > 100 MB | > 1 GB |
| **Replication** | Replication Lag (seconds) | > 30s | > 5 min |
| **Replication** | Replication Slots Lag | > 100 MB | > 500 MB |
| **Connection** | Active Connections | > 80% | > 95% |
| **Connection** | Idle in Transaction | > 10 | > 50 |
| **Performance** | Query Duration | > 1s | > 10s |
| **Storage** | Disk Usage | > 80% | > 90% |
| **Storage** | WAL Archive Size | > 50 GB/day | > 100 GB/day |

### 7.2 Prometheus Configuration

#### prometheus.yml
```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'postgres-primary'
    static_configs:
      - targets: ['<primary-ip>:9187']
    labels:
      instance: 'postgres-primary'
      role: 'primary'

  - job_name: 'postgres-standby'
    static_configs:
      - targets: ['<standby-ip>:9187']
    labels:
      instance: 'postgres-standby'
      role: 'standby'

  - job_name: 'pgbouncer'
    static_configs:
      - targets: ['localhost:9127']
    labels:
      instance: 'pgbouncer'

  - job_name: 'postgres-exporter'
    static_configs:
      - targets: ['localhost:9187']
```

#### PostgreSQL Exporter Queries (queries.yml)
```yaml
pg_replication:
  query: |
    SELECT 
      client_addr,
      state,
      sync_state,
      pg_wal_lsn_diff(pg_current_wal_lsn(), sent_lsn) as sent_lag,
      pg_wal_lsn_diff(pg_current_wal_lsn(), flush_lsn) as flush_lag,
      pg_wal_lsn_diff(pg_current_wal_lsn(), replay_lsn) as replay_lag,
      write_lag,
      flush_lag,
      replay_lag
    FROM pg_stat_replication
  metrics:
    - client_addr:
        usage: "LABEL"
        description: "Client address"
    - state:
        usage: "LABEL"
        description: "Replication state"
    - sync_state:
        usage: "LABEL"
        description: "Synchronous state"
    - sent_lag:
        usage: "GAUGE"
        description: "Sent lag in bytes"
    - flush_lag:
        usage: "GAUGE"
        description: "Flush lag in bytes"
    - replay_lag:
        usage: "GAUGE"
        description: "Replay lag in bytes"
    - write_lag:
        usage: "GAUGE"
        description: "Write lag interval"
    - flush_lag:
        usage: "GAUGE"
        description: "Flush lag interval"
    - replay_lag:
        usage: "GAUGE"
        description: "Replay lag interval"

pg_replication_slots:
  query: |
    SELECT 
      slot_name,
      slot_type,
      active,
      pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn) as lag_bytes
    FROM pg_replication_slots
  metrics:
    - slot_name:
        usage: "LABEL"
    - slot_type:
        usage: "LABEL"
    - active:
        usage: "LABEL"
    - lag_bytes:
        usage: "GAUGE"
        description: "Replication slot lag in bytes"
```

### 7.3 Alertmanager Rules

```yaml
groups:
  - name: postgresql-replication
    rules:
      - alert: PostgreSQLReplicationLagHigh
        expr: pg_replication_replay_lag > 104857600  # 100 MB
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "PostgreSQL replication lag is high"
          description: "Replication lag on {{ $labels.instance }} is {{ $value | humanize }} bytes"

      - alert: PostgreSQLReplicationLagCritical
        expr: pg_replication_replay_lag > 1073741824  # 1 GB
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "PostgreSQL replication lag is critical"
          description: "Replication lag on {{ $labels.instance }} is {{ $value | humanize }} bytes"

      - alert: PostgreSQLReplicationStopped
        expr: pg_stat_replication_state != 'streaming'
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "PostgreSQL replication is not streaming"
          description: "Replication state on {{ $labels.instance }} is {{ $labels.state }}"

      - alert: PostgreSQLReplicationSlotInactive
        expr: pg_replication_slots_active == 0
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "PostgreSQL replication slot is inactive"
          description: "Replication slot {{ $labels.slot_name }} is inactive"

      - alert: PostgreSQLReplicationSlotLagHigh
        expr: pg_replication_slots_lag_bytes > 104857600  # 100 MB
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "PostgreSQL replication slot lag is high"
          description: "Slot {{ $labels.slot_name }} lag is {{ $value | humanize }} bytes"
```

### 7.4 Grafana Dashboard

Key panels for PostgreSQL HA dashboard:

```json
{
  "dashboard": {
    "title": "PostgreSQL HA Monitoring",
    "panels": [
      {
        "title": "Replication Lag (Bytes)",
        "targets": [{
          "expr": "pg_replication_replay_lag"
        }],
        "alert": {
          "conditions": [{
            "evaluator": { "params": [100000000], "type": "gt" }
          }]
        }
      },
      {
        "title": "Replication Lag (Time)",
        "targets": [{
          "expr": "pg_replication_replay_lag / 1000000"
        }]
      },
      {
        "title": "Replication State",
        "targets": [{
          "expr": "pg_stat_replication_state"
        }]
      },
      {
        "title": "PgBouncer Pool Usage",
        "targets": [{
          "expr": "pgbouncer_pools_client_active_connections"
        }]
      }
    ]
  }
}
```

### 7.5 Health Check Scripts

```bash
#!/bin/bash
# /opt/scripts/health-check.sh

# Check primary health
check_primary() {
    psql -h <primary-ip> -U postgres -c "SELECT 1;" > /dev/null 2>&1
    if [ $? -eq 0 ]; then
        echo "Primary: HEALTHY"
        return 0
    else
        echo "Primary: UNHEALTHY"
        return 1
    fi
}

# Check standby health and lag
check_standby() {
    LAG=$(psql -h <standby-ip> -U postgres -t -c "
        SELECT pg_wal_lsn_diff(pg_last_wal_receive_lsn(), pg_last_wal_replay_lsn());
    " 2>/dev/null | xargs)
    
    if [ -z "$LAG" ]; then
        echo "Standby: UNHEALTHY (no response)"
        return 1
    fi
    
    if [ "$LAG" -gt 100000000 ]; then
        echo "Standby: WARNING (lag: ${LAG} bytes)"
        return 1
    fi
    
    echo "Standby: HEALTHY (lag: ${LAG} bytes)"
    return 0
}

# Check replication
check_replication() {
    REPLICATION=$(psql -h <primary-ip> -U postgres -t -c "
        SELECT count(*) FROM pg_stat_replication WHERE state = 'streaming';
    " 2>/dev/null | xargs)
    
    if [ "$REPLICATION" -eq 1 ]; then
        echo "Replication: HEALTHY"
        return 0
    else
        echo "Replication: UNHEALTHY"
        return 1
    fi
}

# Run all checks
echo "=== PostgreSQL HA Health Check ==="
echo "Time: $(date)"
check_primary
check_standby
check_replication
```

---

## 8. Cost Analysis

### 8.1 Self-Managed HA (Recommended Option B)

#### Monthly Cost Breakdown

| Component | Specification | Unit Cost | Quantity | Monthly Cost |
|-----------|--------------|-----------|----------|--------------|
| **Compute** | | | | |
| Primary VM | e2-standard-2 (2 vCPU, 8GB) | $48.52/mo | 1 | $48.52 |
| Standby VM | e2-standard-2 (2 vCPU, 8GB) | $48.52/mo | 1 | $48.52 |
| Monitoring VM | e2-micro (shared core) | $6.11/mo | 1 | $6.11 |
| **Storage** | | | | |
| Primary SSD | 100GB pd-ssd | $17.00/mo | 1 | $17.00 |
| Standby SSD | 100GB pd-ssd | $17.00/mo | 1 | $17.00 |
| Backup Storage | 200GB Coldline | $4.00/mo | 1 | $4.00 |
| WAL Archive | 50GB Standard | $2.30/mo | 1 | $2.30 |
| **Networking** | | | | |
| Cross-zone egress | ~100GB/month | $0.01/GB | 100 | $1.00 |
| Internet egress | Minimal | - | - | $0.00 |
| **Total** | | | | **$144.45/mo** |

*Note: Prices based on us-central1 region as of 2024. Subject to change.*

### 8.2 Cloud SQL HA Comparison

| Component | Configuration | Monthly Cost |
|-----------|--------------|--------------|
| Cloud SQL HA | db-custom-2-7680 (2 vCPU, 7.5GB) | ~$200/mo |
| Storage | 100GB SSD | ~$17/mo |
| Backup Storage | 200GB | ~$4/mo |
| **Total Cloud SQL** | | **~$221/mo** |

### 8.3 Cost Comparison Summary

| Scenario | Monthly Cost | Annual Cost | Savings |
|----------|-------------|-------------|---------|
| Current (Single VM) | $60 | $720 | - |
| **Self-Managed HA (Rec.)** | **$145** | **$1,740** | - |
| Cloud SQL HA | $221 | $2,652 | 34% more |
| AWS RDS Multi-AZ | $230 | $2,760 | 37% more |

### 8.4 Cost Optimization Tips

1. **Committed Use Discounts (CUDs)**
   - 1-year CUD: ~20% savings
   - 3-year CUD: ~45% savings
   - With 1-year CUD: $145 → $116/month

2. **Right-sizing**
   - Start with smaller instances
   - Monitor CPU/memory usage
   - Scale up based on actual needs

3. **Storage Optimization**
   - Enable automatic storage increases only
   - Use Coldline for older backups
   - Implement WAL archive cleanup policies

4. **Reserved Instances Alternative**
   - Use Spot VMs for standby (if acceptable risk)
   - Potential 60-91% savings on standby

---

## 9. Operational Runbooks

### 9.1 Daily Operations

```bash
# Check replication status
psql -c "
SELECT 
    client_addr,
    state,
    sync_state,
    pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), replay_lsn)) as lag
FROM pg_stat_replication;
"

# Check connection counts
psql -c "
SELECT state, count(*) 
FROM pg_stat_activity 
GROUP BY state;
"

# Check disk space
df -h /var/lib/postgresql

# Check WAL archive size
gsutil du -sh gs://n8n-postgres-wal-archive/
```

### 9.2 Weekly Operations

```bash
# Verify backup integrity
wal-g backup-verify

# Check for replication slot lag
psql -c "
SELECT 
    slot_name,
    pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)) as slot_lag
FROM pg_replication_slots;
"

# Analyze tables for query optimization
psql -d n8n -c "
SELECT schemaname, tablename, last_analyze, last_autoanalyze
FROM pg_stat_user_tables
WHERE last_analyze < NOW() - INTERVAL '7 days'
ORDER BY last_analyze NULLS FIRST;
"

# Review slow queries
psql -c "
SELECT query, calls, mean_time, total_time
FROM pg_stat_statements
ORDER BY total_time DESC
LIMIT 10;
"
```

### 9.3 Monthly Operations

```bash
# Test failover procedure
# 1. Schedule maintenance window
# 2. Run manual failover test
# 3. Verify application connectivity
# 4. Fail back to original primary

# Review and rotate WAL archives
# Keep 30 days, delete older
gsutil ls gs://n8n-postgres-wal-archive/ | \
    awk -F'/' '{print $NF}' | \
    sort | \
    head -n -30 | \
    xargs -I {} gsutil rm gs://n8n-postgres-wal-archive/{}

# Full backup test restore
# 1. Spin up test instance
# 2. Restore backup
# 3. Verify data integrity
# 4. Terminate test instance
```

### 9.4 Incident Response

#### Scenario 1: Replication Lag Critical
```bash
# 1. Check network connectivity
ping <standby-ip>

# 2. Check standby resources
ssh <standby-ip> "top -bn1 | head -20"
ssh <standby-ip> "iostat -x 1 5"

# 3. Check for blocking queries on standby
psql -h <standby-ip> -c "
SELECT pid, state, query_start, query
FROM pg_stat_activity
WHERE state != 'idle';
"

# 4. If necessary, restart replication
# On standby:
sudo systemctl restart postgresql
```

#### Scenario 2: Primary Failure
```bash
# 1. Confirm primary is down
ping <primary-ip>

# 2. Promote standby
ssh <standby-ip> "sudo -u postgres pg_ctl promote -D /var/lib/postgresql/16/main"

# 3. Update PgBouncer to point to new primary
sudo sed -i "s/<old-primary>/<new-primary>/g" /etc/pgbouncer/pgbouncer.ini
sudo systemctl reload pgbouncer

# 4. Restart n8n to clear connections
sudo systemctl restart n8n

# 5. Verify
psql -h localhost -p 6432 -c "SELECT pg_is_in_recovery();"  # Should be 'f'
```

---

## 10. Implementation Timeline

| Phase | Task | Duration | Dependencies |
|-------|------|----------|--------------|
| **Week 1** | | | |
| | Provision standby VM | 1 day | - |
| | Configure primary for replication | 2 days | - |
| | Set up WAL archiving | 1 day | GCS bucket |
| | Initialize standby | 1 day | Primary config |
| **Week 2** | | | |
| | Configure PgBouncer | 1 day | - |
| | Update n8n connection settings | 1 day | PgBouncer ready |
| | Set up monitoring (Prometheus/Grafana) | 2 days | - |
| | Configure alerting | 1 day | Monitoring ready |
| | Testing | 1 day | All components |
| **Week 3** | | | |
| | Failover testing | 2 days | - |
| | Performance tuning | 2 days | - |
| | Documentation and handoff | 1 day | - |

---

## 11. Appendix

### 11.1 Quick Reference Commands

```bash
# Check replication status
psql -c "SELECT * FROM pg_stat_replication;"

# Check lag on standby
psql -c "SELECT pg_last_xact_replay_timestamp(), now();"

# Pause/resume replication
psql -c "SELECT pg_wal_replay_pause();"
psql -c "SELECT pg_wal_replay_resume();"

# Check replication slots
psql -c "SELECT * FROM pg_replication_slots;"

# Drop and recreate replication slot
psql -c "SELECT pg_drop_replication_slot('standby1_slot');"
psql -c "SELECT pg_create_physical_replication_slot('standby1_slot', true);"
```

### 11.2 Useful Queries

```sql
-- Detailed replication status
SELECT 
    client_addr,
    usename,
    application_name,
    state,
    sync_state,
    pg_size_pretty(pg_wal_lsn_diff(sent_lsn, write_lsn)) AS write_lag,
    pg_size_pretty(pg_wal_lsn_diff(sent_lsn, flush_lsn)) AS flush_lag,
    pg_size_pretty(pg_wal_lsn_diff(sent_lsn, replay_lsn)) AS replay_lag,
    reply_time
FROM pg_stat_replication;

-- Standby recovery status
SELECT 
    pg_is_in_recovery(),
    pg_last_wal_receive_lsn(),
    pg_last_wal_replay_lsn(),
    pg_last_xact_replay_timestamp(),
    pg_wal_lsn_diff(pg_last_wal_receive_lsn(), pg_last_wal_replay_lsn()) AS lag_bytes;

-- Connection summary
SELECT 
    datname,
    usename,
    state,
    count(*)
FROM pg_stat_activity
GROUP BY 1, 2, 3
ORDER BY 4 DESC;

-- Database size and growth
SELECT 
    datname,
    pg_size_pretty(pg_database_size(datname)) as size
FROM pg_database
WHERE datname NOT IN ('template0', 'template1');
```

### 11.3 Related Documentation

- [PostgreSQL Streaming Replication](https://www.postgresql.org/docs/current/warm-standby.html)
- [PgBouncer Documentation](https://www.pgbouncer.org/config.html)
- [n8n Database Configuration](https://docs.n8n.io/hosting/environment-variables/database/)
- [Google Cloud SQL](https://cloud.google.com/sql/docs/postgres/high-availability)

---

*Document Version: 1.0*
*Last Updated: March 2024*
*Author: Database Engineering Team*
