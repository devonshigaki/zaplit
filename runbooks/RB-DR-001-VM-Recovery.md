# Runbook: RB-DR-001 - VM Recovery & Disaster Recovery

**Purpose:** Restore n8n VM from snapshot or recover from complete failure  
**Frequency:** As needed (DR event)  
**Owner:** SRE/DevOps Team  
**Last Updated:** March 19, 2026  
**RTO Target:** 2 hours  
**RPO Target:** 24 hours (daily backups)

---

## Table of Contents

1. [Incident Classification](#incident-classification)
2. [Prerequisites](#prerequisites)
3. [Scenario A: VM Restore from Snapshot](#scenario-a-vm-restore-from-snapshot)
4. [Scenario B: Database Recovery Only](#scenario-b-database-recovery-only)
5. [Scenario C: Complete VM Rebuild](#scenario-c-complete-vm-rebuild)
6. [Verification Steps](#verification-steps)
7. [RTO Validation](#rto-validation)
8. [Post-Recovery Actions](#post-recovery-actions)

---

## Incident Classification

| Severity | Description | Response Time | RTO |
|----------|-------------|---------------|-----|
| **P1** | Complete VM failure / Data corruption | 15 minutes | 2 hours |
| **P2** | Database corruption only | 30 minutes | 1 hour |
| **P3** | Partial data loss / Single workflow issue | 1 hour | 30 minutes |
| **P4** | Preventive restore / Testing | 4 hours | N/A |

### Activation Criteria

Activate this runbook when:
- [ ] VM is unreachable for > 5 minutes
- [ ] Database corruption detected
- [ ] Critical data loss confirmed
- [ ] Complete zone/regional failure
- [ ] Security incident requiring VM rebuild

---

## Prerequisites

### Access Requirements

- [ ] GCP Project access with Compute Admin role
- [ ] SSH key access to n8n-instance or ability to create new keys
- [ ] Access to GCS bucket: `gs://zaplit-n8n-backups/`
- [ ] DNS management access for zaplit.com

### Information Required

| Item | Location | Purpose |
|------|----------|---------|
| VM Name | `n8n-instance` | Target for recovery |
| Zone | `us-central1-a` | VM deployment zone |
| Latest Snapshot | GCP Console > Snapshots | Restore point |
| Latest DB Backup | `gs://zaplit-n8n-backups/` | Database recovery |
| Docker Compose Config | `/opt/n8n/docker-compose.yml` | Service restoration |

---

## Scenario A: VM Restore from Snapshot

**Use when:** VM disk corruption, OS failure, but VM instance still exists

### Step 1: Identify Recovery Point

```bash
# List available snapshots
PROJECT_ID=$(gcloud config get-value project)
gcloud compute snapshots list --filter="sourceDisk~n8n-instance" \
    --format="table(name, creationTimestamp, diskSizeGb, storageBytes)"

# Identify the snapshot to restore from
# Look for the most recent successful snapshot before the incident
SNAPSHOT_NAME="n8n-instance-20260319-020000"
```

### Step 2: Stop the VM

```bash
# Stop the VM gracefully
gcloud compute instances stop n8n-instance --zone=us-central1-a

# Verify VM is stopped
gcloud compute instances describe n8n-instance --zone=us-central1-a \
    --format="value(status)"
# Expected: TERMINATED
```

### Step 3: Create Disk from Snapshot

```bash
# Get the boot disk name
DISK_NAME=$(gcloud compute instances describe n8n-instance --zone=us-central1-a \
    --format="value(disks[0].deviceName)")

# Create new disk from snapshot (keep original as backup)
NEW_DISK_NAME="${DISK_NAME}-restore-$(date +%Y%m%d)"

gcloud compute disks create "$NEW_DISK_NAME" \
    --source-snapshot="$SNAPSHOT_NAME" \
    --zone=us-central1-a \
    --description="Restored from $SNAPSHOT_NAME during DR event"

# Verify disk creation
gcloud compute disks describe "$NEW_DISK_NAME" --zone=us-central1-a \
    --format="table(name, sizeGb, status)"
```

### Step 4: Detach Old Disk and Attach New

```bash
# Detach the corrupted disk
gcloud compute instances detach-disk n8n-instance \
    --disk="$DISK_NAME" \
    --zone=us-central1-a

# Attach the restored disk as boot disk
gcloud compute instances attach-disk n8n-instance \
    --disk="$NEW_DISK_NAME" \
    --boot \
    --zone=us-central1-a
```

### Step 5: Start VM and Verify

```bash
# Start the VM
gcloud compute instances start n8n-instance --zone=us-central1-a

# Wait for VM to be ready
sleep 30

# Check VM status
gcloud compute instances describe n8n-instance --zone=us-central1-a \
    --format="table(name, status, networkInterfaces[0].accessConfigs[0].natIP)"
```

### Step 6: Verify Services

```bash
# SSH into the VM
gcloud compute ssh n8n-instance --zone=us-central1-a

# Check Docker containers
sudo docker ps

# Expected output should show:
# - n8n container running
# - postgres container running

# Check n8n health
curl -f http://localhost:5678/healthz || echo "Health check failed"

# Exit SSH
exit
```

---

## Scenario B: Database Recovery Only

**Use when:** Database corruption, but VM and n8n application are healthy

### Step 1: Identify Latest Backup

```bash
# List available database backups
gsutil ls -l gs://zaplit-n8n-backups/ | grep "n8n-db-" | sort -k2,2r | head -10

# Set backup file to restore
BACKUP_FILE="n8n-db-20260318_030015.sql.gz"
```

### Step 2: SSH to VM and Stop Services

```bash
# SSH to the VM
gcloud compute ssh n8n-instance --zone=us-central1-a

# Stop n8n (keep database running)
cd /opt/n8n
sudo docker-compose stop n8n

# Verify n8n is stopped
sudo docker ps --filter "name=n8n" --format "{{.Names}}: {{.Status}}"
```

### Step 3: Download and Prepare Backup

```bash
# Create restore directory
mkdir -p /opt/n8n/restore
cd /opt/n8n/restore

# Download backup from GCS
gsutil cp "gs://zaplit-n8n-backups/${BACKUP_FILE}" .

# Extract backup
gunzip -c "$BACKUP_FILE" > restore.sql

# Verify backup integrity
head -20 restore.sql
# Should show PostgreSQL dump header
```

### Step 4: Backup Current Database (if accessible)

```bash
# Create emergency backup of current state (in case we need to rollback)
cd /opt/n8n
docker exec n8n-postgres pg_dump -U n8n n8n > "backups/n8n-db-emergency-$(date +%Y%m%d_%H%M%S).sql"
```

### Step 5: Restore Database

```bash
cd /opt/n8n/restore

# Drop and recreate database
docker exec n8n-postgres psql -U n8n -c "DROP DATABASE IF EXISTS n8n;"
docker exec n8n-postgres psql -U n8n -c "CREATE DATABASE n8n;"

# Restore from backup
cat restore.sql | docker exec -i n8n-postgres psql -U n8n -d n8n

# Verify restoration
WORKFLOW_COUNT=$(docker exec n8n-postgres psql -U n8n -t -c "SELECT COUNT(*) FROM workflow_entity;")
echo "Restored workflows: $WORKFLOW_COUNT"
```

### Step 6: Restart Services

```bash
cd /opt/n8n

# Start n8n
sudo docker-compose start n8n

# Verify containers are running
sudo docker-compose ps

# Check logs for errors
sudo docker-compose logs --tail=50 n8n
```

### Step 7: Cleanup

```bash
# Remove restore files
rm -rf /opt/n8n/restore

# Exit SSH
exit
```

---

## Scenario C: Complete VM Rebuild

**Use when:** Complete VM loss, zone failure, or security compromise

### Step 1: Create New VM Instance

```bash
# Create new VM from scratch (similar to original deployment)
NEW_VM_NAME="n8n-instance-recovery"

gcloud compute instances create "$NEW_VM_NAME" \
    --machine-type=e2-medium \
    --image-family=ubuntu-2204-lts \
    --image-project=ubuntu-os-cloud \
    --boot-disk-size=20GB \
    --boot-disk-type=pd-standard \
    --zone=us-central1-a \
    --tags=n8n,http-server,https-server \
    --metadata-from-file startup-script=<(cat << 'EOF'
#!/bin/bash
# Install Docker
curl -fsSL https://get.docker.com | sh
usermod -aG docker $USER

# Install Docker Compose
apt-get update && apt-get install -y docker-compose-plugin
EOF
)
```

### Step 2: Restore from Latest Snapshot (if available)

If a recent snapshot exists in another zone/region:

```bash
# Copy snapshot to current zone
gcloud compute snapshots list --filter="sourceDisk~n8n-instance"
SNAPSHOT_NAME="n8n-instance-20260319-020000"

# Create disk from snapshot and attach to new VM
gcloud compute instances detach-disk "$NEW_VM_NAME" --zone=us-central1-a

gcloud compute disks delete "${NEW_VM_NAME}" --zone=us-central1-a --quiet

gcloud compute disks create "${NEW_VM_NAME}" \
    --source-snapshot="$SNAPSHOT_NAME" \
    --zone=us-central1-a

gcloud compute instances attach-disk "$NEW_VM_NAME" \
    --disk="${NEW_VM_NAME}" \
    --boot \
    --zone=us-central1-a
```

### Step 3: Rebuild from Scratch (No Snapshot)

If no snapshot is available, rebuild manually:

```bash
# SSH to new VM
gcloud compute ssh "$NEW_VM_NAME" --zone=us-central1-a

# Setup directories
sudo mkdir -p /opt/n8n
cd /opt/n8n

# Download docker-compose.yml from backup or recreate
gsutil cp gs://zaplit-n8n-backups/docker-compose.yml . 2>/dev/null || echo "Need to recreate config"

# Restore database from latest backup
mkdir -p backups
gsutil cp "gs://zaplit-n8n-backups/$(gsutil ls gs://zaplit-n8n-backups/ | grep n8n-db- | tail -1)" backups/

# Start PostgreSQL first
docker-compose up -d postgres
sleep 10

# Restore database
LATEST_BACKUP=$(ls -t backups/n8n-db-*.sql.gz | head -1)
gunzip -c "$LATEST_BACKUP" | docker exec -i n8n-postgres psql -U n8n -d n8n

# Start n8n
docker-compose up -d n8n

# Exit SSH
exit
```

### Step 4: Update DNS

```bash
# Get new VM external IP
NEW_IP=$(gcloud compute instances describe "$NEW_VM_NAME" --zone=us-central1-a \
    --format="value(networkInterfaces[0].accessConfigs[0].natIP)")

# Update Cloud DNS (using gcloud)
gcloud dns record-sets update n8n.zaplit.com \
    --type=A \
    --zone=zaplit-zone \
    --rrdatas="$NEW_IP"

# Or update via Cloudflare/DNS provider
echo "Update DNS A record: n8n.zaplit.com -> $NEW_IP"
```

---

## Verification Steps

### Basic Health Checks

```bash
# 1. VM Accessibility
gcloud compute ssh n8n-instance --zone=us-central1-a --command="echo 'SSH OK'"

# 2. Docker Status
gcloud compute ssh n8n-instance --zone=us-central1-a --command="sudo docker ps"

# 3. n8n Health Endpoint
curl -sf http://n8n.zaplit.com/healthz && echo "n8n Health: OK"

# 4. Webhook Endpoint
curl -sf -X POST http://n8n.zaplit.com/webhook-test/consultation-form \
    -H "Content-Type: application/json" \
    -d '{"test":true}' && echo "Webhook: OK"
```

### Data Integrity Checks

```bash
# SSH to VM
gcloud compute ssh n8n-instance --zone=us-central1-a

# Check database connectivity
docker exec n8n-postgres psql -U n8n -c "SELECT version();"

# Verify workflow count (should match pre-incident)
docker exec n8n-postgres psql -U n8n -c "SELECT COUNT(*) as workflows FROM workflow_entity;"

# Verify credential count
docker exec n8n-postgres psql -U n8n -c "SELECT COUNT(*) as credentials FROM credentials_entity;"

# Check execution history
docker exec n8n-postgres psql -U n8n -c "SELECT COUNT(*) as executions FROM execution_entity;"

exit
```

### Application Functionality

| Test | Command/URL | Expected Result |
|------|-------------|-----------------|
| UI Access | https://n8n.zaplit.com | Login page loads |
| API Health | https://n8n.zaplit.com/healthz | `{"status":"ok"}` |
| Webhook | POST /webhook/consultation-form | 200 OK |
| Workflow List | n8n UI > Workflows | All workflows visible |
| Credential Access | n8n UI > Credentials | Credentials accessible |

---

## RTO Validation

### Recovery Time Objective: 2 Hours

Track the following timestamps during recovery:

| Milestone | Target Time | Actual Time | Status |
|-----------|-------------|-------------|--------|
| Incident Detected | T+0 | | |
| Runbook Activated | T+5 min | | |
| Recovery Started | T+10 min | | |
| VM Restored | T+45 min | | |
| Database Restored | T+60 min | | |
| Services Online | T+75 min | | |
| DNS Updated | T+90 min | | |
| Verification Complete | T+120 min | | |

### RTO Achievement Criteria

- [ ] n8n UI accessible within 2 hours of incident detection
- [ ] All workflows functional
- [ ] Database integrity verified
- [ ] External integrations (Twenty CRM, Google Sheets) working

---

## Post-Recovery Actions

### Immediate (Within 1 hour)

- [ ] Notify stakeholders of recovery completion
- [ ] Verify all monitoring alerts are green
- [ ] Test critical workflows (consultation form)
- [ ] Document actual RTO achieved

### Short-term (Within 24 hours)

- [ ] Root cause analysis (if not already done)
- [ ] Update incident postmortem
- [ ] Verify backup integrity (create new backup)
- [ ] Review and update this runbook if needed
- [ ] Conduct team retrospective

### Long-term (Within 1 week)

- [ ] Implement preventive measures
- [ ] Update disaster recovery plan
- [ ] Schedule DR drill (if this was a real incident)
- [ ] Review backup retention policies

---

## Rollback Procedures

If recovery fails or causes issues:

### Rollback to Original State

```bash
# If original disk was kept
gcloud compute instances stop n8n-instance --zone=us-central1-a
gcloud compute instances detach-disk n8n-instance --disk="$NEW_DISK_NAME" --zone=us-central1-a
gcloud compute instances attach-disk n8n-instance --disk="$DISK_NAME" --boot --zone=us-central1-a
gcloud compute instances start n8n-instance --zone=us-central1-a
```

---

## Emergency Contacts

| Role | Contact | Escalation |
|------|---------|------------|
| Primary SRE | DevOps Team | P1: Immediate |
| Engineering Lead | Engineering | P2: 30 min |
| Executive | CTO | P1: 1 hour |

---

## Related Documentation

- [Disaster Recovery Deep Dive](../DISASTER_RECOVERY_DEEP_DIVE.md)
- [Backup Script](../scripts/dr/backup-database.sh)
- [Snapshot Setup](../scripts/dr/setup-snapshot-schedule.sh)
- [Production Deployment Guide](../N8N_PRODUCTION_DEPLOYMENT_GUIDE.md)

---

## Change Log

| Date | Version | Changes | Author |
|------|---------|---------|--------|
| 2026-03-19 | 1.0 | Initial runbook created | SRE Team |
