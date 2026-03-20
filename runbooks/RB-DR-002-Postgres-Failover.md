# Runbook: RB-DR-002 PostgreSQL Failover

| Attribute | Value |
|-----------|-------|
| **Runbook ID** | RB-DR-002 |
| **Title** | PostgreSQL Primary-Standby Failover |
| **Severity** | Critical |
| **Category** | Database / Disaster Recovery |
| **Owner** | Database Engineering |
| **Last Updated** | March 2024 |
| **Related Documents** | PHASE2_POSTGRESQL_REPLICATION_RESEARCH.md |

---

## 1. Overview

### 1.1 Purpose

This runbook provides step-by-step procedures for performing a manual failover of the PostgreSQL primary-standby replication setup used by n8n. Failover promotes the standby server to become the new primary when the current primary is unavailable or requires maintenance.

### 1.2 Scope

This runbook covers:
- Planned (maintenance) failover
- Unplanned (emergency) failover
- Post-failover verification
- Recovery of old primary as new standby

### 1.3 Prerequisites

| Requirement | Details |
|-------------|---------|
| Access | SSH access to standby server, PgBouncer, and n8n host |
| Permissions | `sudo` privileges on PostgreSQL and application servers |
| Tools | `psql`, `pg_ctl`, `ssh`, `systemctl` |
| Information | Current primary and standby hostnames/IPs |

### 1.4 Risks and Considerations

| Risk | Mitigation |
|------|------------|
| Data Loss | Check replication lag before failover; use `--force` only in emergencies |
| Split-Brain | Never start old primary after failover without rebuilding |
| Application Downtime | Coordinate with application team; typical downtime < 2 minutes |
| Replication Slot Accumulation | Monitor WAL accumulation during extended outages |

---

## 2. When to Failover

### 2.1 Planned Failover Scenarios

✅ **Appropriate for planned failover:**
- Primary server hardware maintenance
- Operating system updates requiring reboot
- PostgreSQL major version upgrade
- Data center migration
- Performance testing of failover procedure

### 2.2 Emergency Failover Scenarios

🚨 **Perform emergency failover when:**
- Primary server is completely unresponsive
- Primary disk is full or corrupted
- Primary network is unreachable
- Primary PostgreSQL process cannot be restarted
- Critical security vulnerability requires immediate shutdown

### 2.3 Do NOT Failover When

❌ **Avoid failover when:**
- Replication lag is > 1 hour (risk of significant data loss)
- Standby server is unhealthy or lagging significantly
- Issue can be resolved without failover (e.g., connection pool exhaustion)
- During peak business hours without coordination

---

## 3. Pre-Failover Checklist

### 3.1 Information Gathering

```bash
# Document current state
PRIMARY_HOST="<current-primary-ip>"
STANDBY_HOST="<standby-ip>"
PGBOUNCER_HOST="<pgbouncer-ip>"
N8N_HOST="<n8n-host>"

# Verify environment variables are set
export PGUSER=postgres
export PGPORT=5432
```

### 3.2 Health Assessment

```bash
# Run health check script
/opt/scripts/check-replication.sh $PRIMARY_HOST $STANDBY_HOST
```

**Expected Results:**
- ✅ Primary: Accessible and not in recovery
- ✅ Standby: Accessible and in recovery mode
- ✅ Replication: Streaming with acceptable lag (< 100 MB or < 30s)

### 3.3 Notify Stakeholders

| Role | Notification Channel | Timing |
|------|---------------------|--------|
| Application Team | Slack #database-alerts | 15 min before |
| On-Call Engineer | PagerDuty | At start |
| Management | Email | Within 30 min (emergency only) |

---

## 4. Failover Procedure

### 4.1 Option A: Automated Failover (Recommended)

```bash
# Execute automated failover script
sudo /opt/scripts/failover.sh

# Or with options
sudo /opt/scripts/failover.sh --no-confirm --recover-old
```

**The automated script performs:**
1. Environment validation
2. Replication lag check
3. Application shutdown (n8n)
4. Standby promotion
5. PgBouncer reconfiguration
6. New primary verification
7. Application restart
8. Old primary documentation

### 4.2 Option B: Manual Step-by-Step Failover

If automated script is unavailable, follow these manual steps:

#### Step 1: Stop Application

```bash
# Stop n8n to prevent writes to old primary
ssh $N8N_HOST "sudo systemctl stop n8n"

# Verify n8n is stopped
ssh $N8N_HOST "sudo systemctl status n8n"
```

#### Step 2: Verify Standby Status

```bash
# Check standby is in recovery mode
psql -h $STANDBY_HOST -U postgres -c "SELECT pg_is_in_recovery();"

# Check replication lag
psql -h $STANDBY_HOST -U postgres -c "
    SELECT 
        pg_is_in_recovery(),
        pg_last_wal_receive_lsn(),
        pg_last_wal_replay_lsn(),
        pg_wal_lsn_diff(pg_last_wal_receive_lsn(), pg_last_wal_replay_lsn()) as lag_bytes,
        now() - pg_last_xact_replay_timestamp() as lag_time;
"
```

**Decision Point:** If lag > 5 minutes, consider waiting or accepting data loss.

#### Step 3: Promote Standby

```bash
# Method 1: Using pg_ctl (preferred)
ssh $STANDBY_HOST "sudo -u postgres pg_ctl promote -D /var/lib/postgresql/16/main"

# Method 2: Using trigger file (if pg_ctl fails)
# ssh $STANDBY_HOST "sudo -u postgres touch /var/lib/postgresql/16/main/promote.signal"

# Wait for promotion (check every 2 seconds)
for i in {1..30}; do
    sleep 2
    recovery=$(psql -h $STANDBY_HOST -U postgres -tAc "SELECT pg_is_in_recovery();")
    if [ "$recovery" = "f" ]; then
        echo "Promotion successful!"
        break
    fi
    echo "Waiting for promotion... ($i/30)"
done
```

#### Step 4: Verify New Primary

```bash
# Confirm not in recovery
psql -h $STANDBY_HOST -U postgres -c "SELECT pg_is_in_recovery();"
# Expected: f (false)

# Test write capability
psql -h $STANDBY_HOST -U postgres -c "
    CREATE TABLE failover_test (id serial);
    INSERT INTO failover_test DEFAULT VALUES;
    SELECT count(*) FROM failover_test;
    DROP TABLE failover_test;
"
```

#### Step 5: Update PgBouncer

```bash
# Backup current configuration
ssh $PGBOUNCER_HOST "sudo cp /etc/pgbouncer/pgbouncer.ini /etc/pgbouncer/pgbouncer.ini.$(date +%Y%m%d_%H%M%S).bak"

# Update primary host in PgBouncer configuration
ssh $PGBOUNCER_HOST "sudo sed -i 's/host=$PRIMARY_HOST/host=$STANDBY_HOST/g' /etc/pgbouncer/pgbouncer.ini"

# Reload PgBouncer
ssh $PGBOUNCER_HOST "sudo systemctl reload pgbouncer"

# Verify PgBouncer status
ssh $PGBOUNCER_HOST "sudo systemctl status pgbouncer"
```

#### Step 6: Restart Application

```bash
# Start n8n
ssh $N8N_HOST "sudo systemctl start n8n"

# Verify n8n is running
ssh $N8N_HOST "sudo systemctl status n8n"

# Check n8n logs for database connectivity
ssh $N8N_HOST "sudo journalctl -u n8n -n 50 --no-pager"
```

#### Step 7: Verify Application Connectivity

```bash
# Test connection through PgBouncer
psql -h $PGBOUNCER_HOST -p 6432 -U n8n_app -d n8n -c "SELECT version();"

# Check n8n workflow execution
# (Check n8n web interface or API for successful database operations)
```

---

## 5. Post-Failover Actions

### 5.1 Immediate Actions

| Action | Command/Step | Owner |
|--------|-------------|-------|
| Verify application functionality | Test n8n workflows | App Team |
| Monitor error logs | Check n8n and PostgreSQL logs | DBA |
| Update DNS/Load Balancer | If using hostname-based routing | Infrastructure |
| Update monitoring alerts | Adjust primary/standby labels | Monitoring |

### 5.2 Update Documentation

```bash
# Record failover details
cat >> /var/log/postgres-failover.log << EOF
Failover Record: $(date)
Old Primary: $PRIMARY_HOST
New Primary: $STANDBY_HOST
Reason: [planned/emergency maintenance/hardware failure]
Performed By: $(whoami)
Replication Lag at Failover: [value from pre-check]
Notes: [any issues encountered]
EOF
```

### 5.3 Recover Old Primary as New Standby

**⚠️ CRITICAL: Do not start old primary as-is!**

Starting the old primary without rebuilding will cause split-brain (two primaries).

#### Option A: Automated Recovery

```bash
# On old primary (now to be new standby)
ssh $PRIMARY_HOST "sudo /opt/scripts/recover-as-standby.sh $STANDBY_HOST"
```

#### Option B: Manual Recovery

```bash
# Step 1: Stop PostgreSQL on old primary (if running)
ssh $PRIMARY_HOST "sudo systemctl stop postgresql"

# Step 2: Clean data directory
ssh $PRIMARY_HOST "sudo rm -rf /var/lib/postgresql/16/main/*"

# Step 3: Create new base backup from new primary
ssh $PRIMARY_HOST "
    sudo -u postgres pg_basebackup \
        -h $STANDBY_HOST \
        -U replicator \
        -D /var/lib/postgresql/16/main \
        -P -v -R -X stream \
        -C -S standby_recovered_slot \
        -W
"

# Step 4: Create standby signal
ssh $PRIMARY_HOST "sudo -u postgres touch /var/lib/postgresql/16/main/standby.signal"

# Step 5: Set permissions
ssh $PRIMARY_HOST "
    sudo chown -R postgres:postgres /var/lib/postgresql/16/main
    sudo chmod 700 /var/lib/postgresql/16/main
"

# Step 6: Start PostgreSQL
ssh $PRIMARY_HOST "sudo systemctl start postgresql"

# Step 7: Verify replication
psql -h $STANDBY_HOST -U postgres -c "SELECT * FROM pg_stat_replication;"
```

---

## 6. Verification Steps

### 6.1 Replication Verification

```bash
# On new primary (previously standby)
psql -h $STANDBY_HOST -U postgres -c "
    SELECT 
        client_addr,
        state,
        sync_state,
        pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), replay_lsn)) as lag
    FROM pg_stat_replication;
"

# Expected: streaming state, minimal lag
```

### 6.2 Application Verification

```bash
# Check n8n database connectivity
psql -h $PGBOUNCER_HOST -p 6432 -U n8n_app -d n8n -c "SELECT 1;"

# Verify write operations
psql -h $PGBOUNCER_HOST -p 6432 -U n8n_app -d n8n -c "
    INSERT INTO execution_entity (workflowId, mode, status, startedAt) 
    VALUES (1, 'manual', 'running', now()) 
    RETURNING id;
"
```

### 6.3 Health Check Script

```bash
# Run comprehensive health check
/opt/scripts/check-replication.sh $STANDBY_HOST $PRIMARY_HOST
```

---

## 7. Rollback Procedure

If failover needs to be reverted (only if old primary was not modified):

```bash
# ⚠️ Only execute if old primary has not been started

# 1. Stop n8n
ssh $N8N_HOST "sudo systemctl stop n8n"

# 2. Demote new primary back to standby
# (Requires stopping and reconfiguring - essentially a reverse failover)

# 3. Start old primary
ssh $PRIMARY_HOST "sudo systemctl start postgresql"

# 4. Update PgBouncer
ssh $PGBOUNCER_HOST "sudo sed -i 's/host=$STANDBY_HOST/host=$PRIMARY_HOST/g' /etc/pgbouncer/pgbouncer.ini"
ssh $PGBOUNCER_HOST "sudo systemctl reload pgbouncer"

# 5. Start n8n
ssh $N8N_HOST "sudo systemctl start n8n"
```

---

## 8. Troubleshooting

### 8.1 Common Issues

#### Issue: Standby promotion fails

**Symptoms:**
- `pg_ctl promote` returns error
- `pg_is_in_recovery()` still returns `t`

**Resolution:**
```bash
# Check PostgreSQL logs
ssh $STANDBY_HOST "sudo tail -100 /var/log/postgresql/postgresql-16-main.log"

# Try trigger file method
ssh $STANDBY_HOST "sudo -u postgres touch /var/lib/postgresql/16/main/promote.signal"
ssh $STANDBY_HOST "sudo systemctl restart postgresql"
```

#### Issue: Replication lag too high

**Symptoms:**
- Lag > 1 GB or > 5 minutes
- Pre-failover check fails

**Resolution:**
1. Wait for lag to reduce (if primary is accessible)
2. Accept data loss (emergency only)
3. Use PITR recovery instead (if available)

```bash
# Check WAL receiver status on standby
psql -h $STANDBY_HOST -U postgres -c "
    SELECT 
        pg_last_wal_receive_lsn(),
        pg_last_wal_replay_lsn(),
        pg_wal_lsn_diff(pg_last_wal_receive_lsn(), pg_last_wal_replay_lsn()) as apply_lag,
        now() - pg_last_xact_replay_timestamp() as time_lag;
"
```

#### Issue: PgBouncer not routing to new primary

**Symptoms:**
- Application cannot connect
- Connection errors in n8n logs

**Resolution:**
```bash
# Check PgBouncer configuration
ssh $PGBOUNCER_HOST "sudo cat /etc/pgbouncer/pgbouncer.ini | grep -A5 '\[databases\]'"

# Restart PgBouncer (if reload didn't work)
ssh $PGBOUNCER_HOST "sudo systemctl restart pgbouncer"

# Test direct connection to new primary
psql -h $STANDBY_HOST -p 5432 -U n8n_app -d n8n -c "SELECT 1;"
```

### 8.2 Emergency Contacts

| Role | Contact | Escalation Time |
|------|---------|-----------------|
| Database On-Call | PagerDuty: Database Team | Immediate |
| Application On-Call | PagerDuty: App Team | 15 minutes |
| Infrastructure Team | Slack #infrastructure | 30 minutes |
| Engineering Manager | Email/Phone | 1 hour |

---

## 9. Reference

### 9.1 Quick Command Reference

```bash
# Check replication status
psql -h <primary> -c "SELECT * FROM pg_stat_replication;"

# Check standby lag
psql -h <standby> -c "
    SELECT 
        pg_is_in_recovery(),
        pg_wal_lsn_diff(pg_last_wal_receive_lsn(), pg_last_wal_replay_lsn());
"

# Promote standby manually
ssh <standby> "sudo -u postgres pg_ctl promote -D /var/lib/postgresql/16/main"

# Reload PgBouncer
ssh <pgbouncer> "sudo systemctl reload pgbouncer"
```

### 9.2 Related Runbooks

| Runbook ID | Title | Purpose |
|------------|-------|---------|
| RB-DR-001 | PostgreSQL Backup and Recovery | PITR and base backup procedures |
| RB-DR-003 | PostgreSQL Performance Issues | Query tuning and resource issues |
| RB-DR-004 | PostgreSQL Connection Issues | Connection pool and network issues |
| RB-MO-001 | PostgreSQL Monitoring Setup | Exporter and alert configuration |

### 9.3 Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2024-03 | Database Engineering | Initial version |

---

## 10. Approval

| Role | Name | Signature | Date |
|------|------|-----------|------|
| Author | Database Engineering | | |
| Reviewer | SRE Lead | | |
| Approver | CTO | | |

---

*This runbook is a controlled document. All changes must be reviewed and approved.*
