# Runbook: RB-DEPLOY-001-Phase1

**Title:** Phase 1 (Stabilize) Production Deployment  
**Purpose:** Execute Phase 1 security, DR, monitoring, and data quality deployments  
**Frequency:** One-time deployment + as-needed for updates  
**Owner:** DevOps Engineering Team  
**Last Updated:** March 19, 2026  
**Severity:** CRITICAL - Production deployment

---

## Table of Contents

1. [Overview](#overview)
2. [Pre-Deployment](#pre-deployment)
3. [Deployment Procedures](#deployment-procedures)
4. [Verification](#verification)
5. [Rollback Procedures](#rollback-procedures)
6. [Troubleshooting](#troubleshooting)
7. [Post-Deployment](#post-deployment)

---

## Overview

### Deployment Scope

Phase 1 (Stabilize) deployment includes:

| Component | Priority | Estimated Time | Risk Level |
|-----------|----------|----------------|------------|
| Security Hardening | CRITICAL | 2 hours | High |
| Disaster Recovery | HIGH | 3 hours | Medium |
| Monitoring Stack | HIGH | 2 hours | Low |
| Data Quality | MEDIUM | 1 hour | Medium |

### Target Environment

- **n8n URL:** https://n8n.zaplit.com
- **GCP VM:** n8n-instance (34.132.198.35)
- **Zone:** us-central1-a
- **Project:** zaplit-production

### Required Access

- GCP Project Owner or Compute Admin
- n8n Admin access
- GCP Secret Manager access

### Communication Plan

Before deployment:
- [ ] Notify stakeholders of maintenance window
- [ ] Post in #deployments Slack channel
- [ ] Set status page to "Maintenance"

After deployment:
- [ ] Update #deployments with completion status
- [ ] Update status page to "Operational"
- [ ] Send deployment summary email

---

## Pre-Deployment

### Step 1: Pre-Flight Checks (15 minutes)

#### 1.1 Verify GCP Access

```bash
# Check authentication
gcloud auth list
gcloud config get-value project

# Expected output:
# ACTIVE: your-email@zaplit.com
# zaplit-production
```

#### 1.2 Test SSH Connectivity

```bash
# Test SSH
gcloud compute ssh n8n-instance --zone=us-central1-a --command="whoami"

# Expected output:
# ubuntu
```

#### 1.3 Check Current State

```bash
# Check n8n health
curl -s https://n8n.zaplit.com/healthz

# Expected: 200 OK
```

#### 1.4 Create Backup Point

```bash
# Export workflows via API
export N8N_API_KEY="your-api-key"

curl -X GET "https://n8n.zaplit.com/api/v1/workflows" \
  -H "X-N8N-API-KEY: ${N8N_API_KEY}" \
  -o backups/workflows-pre-phase1-$(date +%Y%m%d_%H%M%S).json

# Backup docker-compose on VM
gcloud compute ssh n8n-instance --zone=us-central1-a --command="
  sudo mkdir -p /opt/n8n/backups
  sudo cp /opt/n8n/docker-compose.yml \
    /opt/n8n/backups/docker-compose-pre-phase1-$(date +%Y%m%d_%H%M%S).yml
"
```

### Step 2: Maintenance Window Setup (5 minutes)

1. Set status page maintenance mode
2. Post in #general Slack channel:
   ```
   🔧 Scheduled Maintenance: n8n Phase 1 Deployment
   Time: Now - Estimated 2 hours
   Impact: Brief interruption to form submissions
   Status: https://status.zaplit.com
   ```

---

## Deployment Procedures

### Automated Deployment (Recommended)

```bash
# Run master deployment script
./scripts/deploy-phase1.sh

# Or run specific components only:
./scripts/deploy-phase1.sh --skip-dr --skip-monitoring  # Security only
./scripts/deploy-phase1.sh --skip-security              # Everything except security

# Dry run (no changes)
./scripts/deploy-phase1.sh --dry-run
```

### Manual Deployment

If automated deployment fails, follow manual procedures below.

---

### Phase 1A: Security Deployment (CRITICAL)

**Estimated Time:** 2 hours  
**Downtime:** ~5 minutes

#### Step 1A.1: Verify Encryption Key (15 minutes)

```bash
# Run verification script
./scripts/security/verify-encryption-key.sh n8n-instance us-central1-a
```

**Expected Output:**
```
[PASS] Instance found
[PASS] n8n container is running
[PASS] N8N_ENCRYPTION_KEY is set (length: 64 chars)
[PASS] Key format appears valid (64 hex characters)
```

**If Key Missing:**

```bash
# Generate new key
NEW_KEY=$(openssl rand -hex 32)
echo "Generated: $NEW_KEY"

# Store in Secret Manager
echo -n "$NEW_KEY" | gcloud secrets create n8n-encryption-key \
  --data-file=- --labels="service=n8n,env=production"

# SSH to VM and update
gcloud compute ssh n8n-instance --zone=us-central1-a

# Edit docker-compose.yml
sudo nano /opt/n8n/docker-compose.yml

# Add environment variable:
environment:
  - N8N_ENCRYPTION_KEY=$NEW_KEY

# Restart n8n
cd /opt/n8n && sudo docker-compose down && sudo docker-compose up -d
```

⚠️ **WARNING:** After setting encryption key, ALL credentials must be re-entered!

#### Step 1A.2: Enable Basic Authentication (30 minutes)

```bash
# Run basic auth setup
./scripts/security/enable-basic-auth.sh n8n-instance us-central1-a zaplit-admin
```

**Manual Alternative:**

```bash
# Generate password
PASSWORD=$(openssl rand -base64 24)

# Store in Secret Manager
echo -n "$PASSWORD" | gcloud secrets create n8n-admin-password \
  --data-file=- --labels="service=n8n,env=production"

# SSH to VM
gcloud compute ssh n8n-instance --zone=us-central1-a

# Backup docker-compose
sudo cp /opt/n8n/docker-compose.yml \
  /opt/n8n/backups/docker-compose-pre-auth-$(date +%Y%m%d_%H%M%S).yml

# Edit docker-compose.yml
sudo nano /opt/n8n/docker-compose.yml

# Add to n8n environment:
environment:
  - N8N_BASIC_AUTH_ACTIVE=true
  - N8N_BASIC_AUTH_USER=zaplit-admin
  - N8N_BASIC_AUTH_PASSWORD=$PASSWORD

# Restart n8n
cd /opt/n8n && sudo docker-compose down && sudo docker-compose up -d
```

**Verification:**

```bash
# Test auth required
curl -s -o /dev/null -w "%{http_code}" https://n8n.zaplit.com/
# Expected: 401

# Test with credentials
curl -u zaplit-admin:$(gcloud secrets versions access latest --secret=n8n-admin-password) \
  -s -o /dev/null -w "%{http_code}" https://n8n.zaplit.com/
# Expected: 200
```

#### Step 1A.3: Configure Webhook HMAC (30 minutes)

```bash
# Generate HMAC secret
WEBHOOK_SECRET=$(openssl rand -hex 32)

# Store in Secret Manager
echo -n "$WEBHOOK_SECRET" | gcloud secrets create webhook-hmac-secret \
  --data-file=- --labels="service=n8n,env=production"

# SSH to VM and configure
gcloud compute ssh n8n-instance --zone=us-central1-a << 'EOF'
  # Backup
  sudo cp /opt/n8n/docker-compose.yml \
    /opt/n8n/backups/docker-compose-pre-hmac-$(date +%Y%m%d_%H%M%S).yml
  
  # Add HMAC secret
  WEBHOOK_SECRET=$(gcloud secrets versions access latest --secret=webhook-hmac-secret)
  
  # Update docker-compose
  sudo sed -i '/N8N_BASIC_AUTH_PASSWORD/a\      - WEBHOOK_HMAC_SECRET='$WEBHOOK_SECRET'' \
    /opt/n8n/docker-compose.yml
  
  # Restart
  cd /opt/n8n && sudo docker-compose down && sudo docker-compose up -d
EOF
```

**Verification:**

```bash
# Get secret
WEBHOOK_SECRET=$(gcloud secrets versions access latest --secret=webhook-hmac-secret)

# Generate valid signature
PAYLOAD='{"test":"data"}'
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$WEBHOOK_SECRET" | cut -d' ' -f2)

# Test with valid signature
curl -X POST "https://n8n.zaplit.com/webhook/consultation-form" \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Signature: $SIGNATURE" \
  -d "$PAYLOAD" \
  -v

# Test without signature (should fail)
curl -X POST "https://n8n.zaplit.com/webhook/consultation-form" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" \
  -v
# Expected: 401 Unauthorized
```

#### Step 1A.4: Import HMAC Workflow (30 minutes)

```bash
# Export current workflow for backup
curl -X GET "https://n8n.zaplit.com/api/v1/workflows/{workflow-id}" \
  -H "X-N8N-API-KEY: ${N8N_API_KEY}" \
  -o backups/workflow-pre-hmac.json

# Deactivate current workflow
curl -X PATCH "https://n8n.zaplit.com/api/v1/workflows/{workflow-id}" \
  -H "X-N8N-API-KEY: ${N8N_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"active": false}'

# Import HMAC-enabled workflow
curl -X POST "https://n8n.zaplit.com/api/v1/workflows" \
  -H "X-N8N-API-KEY: ${N8N_API_KEY}" \
  -H "Content-Type: application/json" \
  -d @n8n-workflow-consultation-form-twenty-crm.json

# Activate new workflow (update ID from response)
curl -X PATCH "https://n8n.zaplit.com/api/v1/workflows/{new-workflow-id}" \
  -H "X-N8N-API-KEY: ${N8N_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"active": true}'
```

---

### Phase 1B: Disaster Recovery (HIGH)

**Estimated Time:** 3 hours  
**Downtime:** None (background processes)

#### Step 1B.1: Configure VM Snapshots (45 minutes)

```bash
# Run snapshot schedule setup
./scripts/dr/setup-snapshot-schedule.sh
```

**Manual Alternative:**

```bash
# Create snapshot schedule
gcloud compute resource-policies create snapshot-schedule-n8n \
  --description="Daily backup for n8n VM" \
  --max-retention-days=30 \
  --on-source-disk-delete=keep-auto-snapshots \
  --daily-schedule \
  --start-time="02:00" \
  --region=us-central1

# Attach to VM disk
gcloud compute disks add-resource-policies n8n-instance \
  --resource-policies=snapshot-schedule-n8n \
  --zone=us-central1-a
```

**Verification:**

```bash
# Check schedule
gcloud compute resource-policies describe snapshot-schedule-n8n \
  --region=us-central1

# Check attachment
gcloud compute disks describe n8n-instance --zone=us-central1-a \
  --format="table(name, resourcePolicies)"
```

#### Step 1B.2: Setup Database Backup (45 minutes)

```bash
# Copy backup script to VM
gcloud compute scp scripts/dr/backup-database.sh \
  n8n-instance:/opt/n8n/scripts/ --zone=us-central1-a

# Configure on VM
gcloud compute ssh n8n-instance --zone=us-central1-a << 'EOF'
  chmod +x /opt/n8n/scripts/backup-database.sh
  
  # Setup cron job
  (crontab -l 2>/dev/null | grep -v backup-database; 
   echo "0 3 * * * /opt/n8n/scripts/backup-database.sh >> /var/log/n8n-backup.log 2>&1") | crontab -
  
  # Verify
  crontab -l | grep backup-database
EOF
```

**Verification:**

```bash
# Trigger manual backup
gcloud compute ssh n8n-instance --zone=us-central1-a \
  --command="sudo /opt/n8n/scripts/backup-database.sh"

# Check backup created
gsutil ls gs://zaplit-n8n-backups/ | head -5
```

#### Step 1B.3: Test Restore Procedure (60 minutes)

Follow detailed restore test in [RB-DR-001-VM-Recovery.md](./RB-DR-001-VM-Recovery.md)

Quick verification:

```bash
# Get latest backup
LATEST=$(gsutil ls gs://zaplit-n8n-backups/n8n-db-*.sql.gz | sort | tail -1)

# Download and verify integrity
gcloud compute ssh n8n-instance --zone=us-central1-a << EOF
  gsutil cp $LATEST /tmp/test-backup.sql.gz
  gzip -t /tmp/test-backup.sql.gz && echo "✓ Backup integrity verified"
  rm /tmp/test-backup.sql.gz
EOF
```

#### Step 1B.4: Configure Docker Auto-Restart (30 minutes)

```bash
# SSH to VM and configure
gcloud compute ssh n8n-instance --zone=us-central1-a << 'EOF'
  # Backup
  sudo cp /opt/n8n/docker-compose.yml \
    /opt/n8n/backups/docker-compose-pre-restart-$(date +%Y%m%d_%H%M%S).yml
  
  # Update restart policy
  sudo sed -i 's/restart: unless-stopped/restart: always/g' /opt/n8n/docker-compose.yml
  
  # Enable Docker on boot
  sudo systemctl enable docker
  
  # Verify
  sudo grep "restart:" /opt/n8n/docker-compose.yml
  sudo systemctl is-enabled docker
EOF
```

---

### Phase 1C: Monitoring Deployment (HIGH)

**Estimated Time:** 2 hours  
**Downtime:** ~3 minutes

#### Step 1C.1: Deploy Prometheus + Grafana (60 minutes)

```bash
# Copy and run monitoring deployment
gcloud compute scp scripts/monitoring/deploy-monitoring.sh \
  n8n-instance:/opt/n8n/scripts/ --zone=us-central1-a

gcloud compute ssh n8n-instance --zone=us-central1-a << 'EOF'
  cd /opt/n8n
  chmod +x scripts/deploy-monitoring.sh
  export GRAFANA_ADMIN_PASSWORD='secure-password-here'
  sudo -E ./scripts/deploy-monitoring.sh
EOF
```

**Verification:**

```bash
# Check Prometheus
gcloud compute ssh n8n-instance --zone=us-central1-a \
  --command="curl -s http://localhost:9090/-/healthy"

# Check Grafana
gcloud compute ssh n8n-instance --zone=us-central1-a \
  --command="curl -s http://localhost:3000/api/health"
```

#### Step 1C.2: Configure Alert Rules (30 minutes)

```bash
# Copy alert rules
gcloud compute scp monitoring/alert-rules.yml \
  n8n-instance:/opt/n8n/monitoring/ --zone=us-central1-a

# Reload Prometheus
gcloud compute ssh n8n-instance --zone=us-central1-a \
  --command="curl -X POST http://localhost:9090/-/reload"
```

#### Step 1C.3: Configure Slack Notifications (30 minutes)

```bash
# Store Slack webhook
echo -n "https://hooks.slack.com/services/YOUR/WEBHOOK/URL" | \
  gcloud secrets create slack-webhook-url \
  --data-file=- --labels="service=n8n,env=production"

# Create alertmanager config on VM
gcloud compute ssh n8n-instance --zone=us-central1-a << 'EOF'
  sudo tee /opt/n8n/monitoring/alertmanager.yml << 'CONFIG'
global:
  slack_api_url: 'SLACK_WEBHOOK_URL'

route:
  receiver: 'slack-notifications'
  group_by: ['alertname', 'severity']
  group_wait: 10s
  group_interval: 10s
  repeat_interval: 1h

receivers:
- name: 'slack-notifications'
  slack_configs:
  - channel: '#incidents'
    title: 'n8n Alert: {{ range .Alerts }}{{ .Annotations.summary }}{{ end }}'
    text: '{{ range .Alerts }}{{ .Annotations.description }}{{ end }}'
    send_resolved: true
CONFIG

  # Update webhook URL
  SLACK_URL=$(gcloud secrets versions access latest --secret=slack-webhook-url)
  sudo sed -i "s|SLACK_WEBHOOK_URL|$SLACK_URL|g" /opt/n8n/monitoring/alertmanager.yml
EOF
```

---

### Phase 1D: Data Quality (MEDIUM)

**Estimated Time:** 1 hour  
**Downtime:** ~2 minutes

#### Step 1D.1: Import Enhanced Workflow

```bash
# Follow workflow import procedure from Phase 1A.4
# Use: n8n-workflow-consultation-form-twenty-crm.json
```

#### Step 1D.2: Configure CRM Credentials

1. Log in to n8n: https://n8n.zaplit.com
2. Navigate to Settings → Credentials
3. Verify Twenty CRM credential exists and is valid
4. Test connection

#### Step 1D.3: Test Form Validation

```bash
# Test valid submission
curl -X POST "https://n8n.zaplit.com/webhook/consultation-form" \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Signature: $SIGNATURE" \
  -d '{
    "name": "Test User",
    "email": "test@example.com",
    "company": "Test Corp",
    "projectType": "integration",
    "budget": "10000-50000",
    "timeline": "3-months"
  }'

# Test invalid submission
curl -X POST "https://n8n.zaplit.com/webhook/consultation-form" \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Signature: $SIGNATURE" \
  -d '{"email":"invalid"}'
# Expected: 400 Bad Request
```

---

## Verification

### Automated Verification

```bash
# Run comprehensive verification
./scripts/verify-deployment.sh

# Detailed output
./scripts/verify-deployment.sh --detailed

# JSON output for automation
./scripts/verify-deployment.sh --json > verification-results.json
```

### Manual Verification Checklist

#### Security Verification

- [ ] N8N_ENCRYPTION_KEY is set (64 hex characters)
- [ ] Basic auth returns 401 without credentials
- [ ] Basic auth returns 200 with valid credentials
- [ ] HMAC secret configured in environment
- [ ] Webhook rejects requests without HMAC (401)
- [ ] Webhook accepts requests with valid HMAC (200)

#### DR Verification

- [ ] GCP snapshot schedule active
- [ ] Snapshot schedule attached to VM disk
- [ ] Database backup script exists and executable
- [ ] Cron job configured for daily backups
- [ ] GCS bucket exists with recent backups
- [ ] Docker restart policy set to "always"
- [ ] Docker service enabled on boot

#### Monitoring Verification

- [ ] Prometheus healthy (port 9090)
- [ ] Grafana healthy (port 3000)
- [ ] All targets UP in Prometheus
- [ ] Alert rules loaded
- [ ] Grafana dashboards accessible
- [ ] Test alert received in Slack

#### Data Quality Verification

- [ ] V3 workflow active
- [ ] CRM credentials valid
- [ ] Test form submission succeeds
- [ ] CRM record created from submission
- [ ] Validation rejects invalid data

---

## Rollback Procedures

### Emergency Rollback

```bash
# Rollback all Phase 1 changes
./scripts/rollback-phase1.sh --component all

# Rollback specific component
./scripts/rollback-phase1.sh --component security
```

### Manual Rollback

#### Rollback Security Changes

```bash
# Restore pre-security docker-compose
gcloud compute ssh n8n-instance --zone=us-central1-a << 'EOF'
  cd /opt/n8n && sudo docker-compose down
  
  # Find and restore backup
  BACKUP=$(ls -t /opt/n8n/backups/docker-compose.pre-security* | head -1)
  sudo cp "$BACKUP" /opt/n8n/docker-compose.yml
  
  sudo docker-compose up -d
EOF
```

#### Rollback DR Changes

```bash
# Remove cron job
gcloud compute ssh n8n-instance --zone=us-central1-a \
  --command="crontab -l | grep -v backup-database | crontab -"

# Remove snapshot schedule (optional)
gcloud compute disks remove-resource-policies n8n-instance \
  --resource-policies=snapshot-schedule-n8n --zone=us-central1-a
gcloud compute resource-policies delete snapshot-schedule-n8n \
  --region=us-central1
```

#### Rollback Monitoring

```bash
# Stop monitoring services
gcloud compute ssh n8n-instance --zone=us-central1-a << 'EOF'
  cd /opt/n8n
  sudo docker-compose stop prometheus grafana node-exporter
  sudo docker-compose rm -f prometheus grafana node-exporter
EOF
```

---

## Troubleshooting

### Issue: Encryption Key Verification Fails

**Symptoms:** Credentials not decrypting, n8n errors

**Resolution:**
```bash
# Verify key format
gcloud compute ssh n8n-instance --zone=us-central1-a \
  --command="docker exec n8n printenv N8N_ENCRYPTION_KEY | wc -c"
# Expected: 65 (64 chars + newline)

# If wrong, check for special characters
# Regenerate if needed and re-enter all credentials
```

### Issue: Basic Auth Not Working

**Symptoms:** Still getting 200 without credentials

**Resolution:**
```bash
# Check env vars are set
gcloud compute ssh n8n-instance --zone=us-central1-a \
  --command="docker exec n8n env | grep BASIC_AUTH"

# Restart container
gcloud compute ssh n8n-instance --zone=us-central1-a \
  --command="cd /opt/n8n && sudo docker-compose restart n8n"
```

### Issue: Webhook HMAC Failing

**Symptoms:** All webhook requests return 401

**Resolution:**
```bash
# Verify HMAC secret
gcloud compute ssh n8n-instance --zone=us-central1-a \
  --command="docker exec n8n printenv WEBHOOK_HMAC_SECRET"

# Test signature generation
WEBHOOK_SECRET=$(gcloud secrets versions access latest --secret=webhook-hmac-secret)
echo -n '{"test":"data"}' | openssl dgst -sha256 -hmac "$WEBHOOK_SECRET"
```

### Issue: Database Backup Failing

**Symptoms:** No new backups in GCS

**Resolution:**
```bash
# Check backup logs
gcloud compute ssh n8n-instance --zone=us-central1-a \
  --command="tail -50 /var/log/n8n-backup.log"

# Test manual backup
gcloud compute ssh n8n-instance --zone=us-central1-a \
  --command="sudo /opt/n8n/scripts/backup-database.sh"
```

---

## Post-Deployment

### Step 1: Remove Maintenance Mode (5 minutes)

1. Set status page to "Operational"
2. Post in #general Slack channel:
   ```
   ✅ Phase 1 Deployment Complete
   All systems operational
   Summary: https://wiki.zaplit.com/deployments/phase1
   ```

### Step 2: Documentation Update (15 minutes)

Update the following documents:
- [ ] Deployment log with actual timestamps
- [ ] Configuration changes documentation
- [ ] Credential locations in Secret Manager
- [ ] Dashboard URLs and access credentials

### Step 3: Team Notification (5 minutes)

Send deployment summary email including:
- Deployment status
- Any issues encountered and resolutions
- New credentials/access information
- Links to monitoring dashboards

---

## Related Documentation

- [DEPLOYMENT_PHASE1_GUIDE.md](../DEPLOYMENT_PHASE1_GUIDE.md) - Master deployment guide
- [RB-DR-001-VM-Recovery.md](./RB-DR-001-VM-Recovery.md) - DR runbook
- [RB002-incident-response.md](./RB002-incident-response.md) - Incident response
- [RB004-monitoring-setup.md](./RB004-monitoring-setup.md) - Monitoring setup

---

## Appendix

### A. Quick Reference Commands

```bash
# Check n8n logs
gcloud compute ssh n8n-instance --zone=us-central1-a \
  --command="docker logs n8n --tail 100 -f"

# Restart n8n
gcloud compute ssh n8n-instance --zone=us-central1-a \
  --command="cd /opt/n8n && sudo docker-compose restart n8n"

# Check disk space
gcloud compute ssh n8n-instance --zone=us-central1-a \
  --command="df -h"

# Access monitoring (with port forwarding)
gcloud compute ssh n8n-instance --zone=us-central1-a \
  -- -L 3000:localhost:3000 -L 9090:localhost:9090 -N
```

### B. Emergency Contacts

| Role | Contact | Escalation |
|------|---------|------------|
| DevOps Lead | devops@zaplit.com | +1-xxx-xxx-xxxx |
| SRE On-call | sre-oncall@zaplit.com | PagerDuty |
| Product Owner | product@zaplit.com | Slack #incidents |

### C. Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-03-19 | DevOps Team | Initial release |

---

**Document Control:**
- Classification: Internal
- Review Cycle: Per deployment
- Distribution: DevOps, SRE, Engineering
