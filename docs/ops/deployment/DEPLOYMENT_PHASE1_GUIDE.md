# Phase 1 (Stabilize) Production Deployment Guide

**Version:** 1.0  
**Date:** March 19, 2026  
**Status:** Production Ready  
**Owner:** DevOps Engineering Team

---

## Executive Summary

This guide provides comprehensive deployment procedures for Phase 1 (Stabilize) fixes to the Zaplit n8n production environment. Phase 1 focuses on critical security hardening, disaster recovery capabilities, monitoring infrastructure, and data quality improvements.

### Deployment Scope

| Component | Priority | Status | ETA |
|-----------|----------|--------|-----|
| Security Hardening | CRITICAL | Ready | 2 hours |
| Disaster Recovery | HIGH | Ready | 3 hours |
| Monitoring Stack | HIGH | Ready | 2 hours |
| Data Quality | MEDIUM | Ready | 1 hour |

### Target Environment

- **n8n Instance:** https://n8n.zaplit.com (GCP VM: 34.132.198.35)
- **Twenty CRM:** https://crm.zaplit.com
- **GCP Project:** zaplit-production
- **VM Zone:** us-central1-a

---

## Table of Contents

1. [Pre-Deployment Requirements](#pre-deployment-requirements)
2. [Phase 1A: Security Deployment](#phase-1a-security-deployment)
3. [Phase 1B: Disaster Recovery](#phase-1b-disaster-recovery)
4. [Phase 1C: Monitoring Deployment](#phase-1c-monitoring-deployment)
5. [Phase 1D: Data Quality](#phase-1d-data-quality)
6. [Post-Deployment Verification](#post-deployment-verification)
7. [Rollback Procedures](#rollback-procedures)
8. [Troubleshooting](#troubleshooting)

---

## Pre-Deployment Requirements

### 1.1 Access Requirements

Verify you have the following access before starting:

```bash
# Test GCP access
gcloud auth list
gcloud config get-value project

# Test SSH access to VM
gcloud compute ssh n8n-instance --zone=us-central1-a --command="whoami"

# Test n8n web access
curl -s -o /dev/null -w "%{http_code}" https://n8n.zaplit.com/healthz
```

**Expected Output:**
```
ACTIVE: your-email@zaplit.com
zaplit-production
ubuntu
200
```

### 1.2 Pre-Deployment Checklist

Run the pre-deployment verification script:

```bash
./scripts/verify-predeploy.sh
```

**Manual Verification Checklist:**

- [ ] GCP CLI authenticated and configured
- [ ] SSH access to n8n-instance VM confirmed
- [ ] n8n web interface accessible at https://n8n.zaplit.com
- [ ] Current workflow export completed and saved
- [ ] Maintenance window scheduled and stakeholders notified
- [ ] Rollback plan reviewed and understood

### 1.3 Backup Current State

```bash
# Export all workflows via n8n API
N8N_API_KEY="your-api-key"
curl -X GET "https://n8n.zaplit.com/api/v1/workflows" \
  -H "X-N8N-API-KEY: ${N8N_API_KEY}" \
  -o backups/workflows-$(date +%Y%m%d_%H%M%S).json

# Backup docker-compose.yml
gcloud compute ssh n8n-instance --zone=us-central1-a \
  --command="sudo cp /opt/n8n/docker-compose.yml /opt/n8n/backups/docker-compose.yml.$(date +%Y%m%d_%H%M%S)"
```

---

## Phase 1A: Security Deployment

**Priority:** CRITICAL  
**Estimated Duration:** 2 hours  
**Downtime:** ~5 minutes (container restart)

### 1A.1 Verify N8N_ENCRYPTION_KEY

**Purpose:** Ensure all credentials are encrypted at rest

```bash
# Run verification script
./scripts/security/verify-encryption-key.sh n8n-instance us-central1-a
```

**Expected Output:**
```
========================================
n8n Encryption Key Verification Tool
========================================
[PASS] Instance found
[PASS] n8n container is running: Up 3 days
[PASS] N8N_ENCRYPTION_KEY is set (length: 64 chars)
[PASS] Key format appears valid (64 hex characters)
```

**If Key Missing:**

```bash
# Generate new encryption key
NEW_KEY=$(openssl rand -hex 32)
echo "Generated key: $NEW_KEY"

# SSH to instance and update
gcloud compute ssh n8n-instance --zone=us-central1-a

# Edit docker-compose.yml
sudo nano /opt/n8n/docker-compose.yml

# Add to environment section:
environment:
  - N8N_ENCRYPTION_KEY=$NEW_KEY

# Restart n8n
cd /opt/n8n && sudo docker-compose down && sudo docker-compose up -d
```

**⚠️ WARNING:** After setting encryption key, ALL credentials must be re-entered!

### 1A.2 Enable n8n Basic Authentication

**Purpose:** Protect n8n editor from unauthorized access

```bash
# Run basic auth setup script
./scripts/security/enable-basic-auth.sh n8n-instance us-central1-a zaplit-admin
```

**Manual Verification:**

```bash
# Test that auth is required
curl -s -o /dev/null -w "%{http_code}" https://n8n.zaplit.com/
# Expected: 401

# Test with credentials
curl -u zaplit-admin:$(gcloud secrets versions access latest --secret=n8n-admin-password) \
  -s -o /dev/null -w "%{http_code}" https://n8n.zaplit.com/
# Expected: 200
```

### 1A.3 Configure Webhook HMAC Secret

**Purpose:** Verify webhook authenticity and prevent spoofing

```bash
# Generate HMAC secret
WEBHOOK_SECRET=$(openssl rand -hex 32)

# Store in GCP Secret Manager
echo -n "$WEBHOOK_SECRET" | gcloud secrets create webhook-hmac-secret \
  --data-file=- --labels="service=n8n,env=production"

# SSH to VM and update docker-compose
gcloud compute ssh n8n-instance --zone=us-central1-a << 'EOF'
# Backup current compose
sudo cp /opt/n8n/docker-compose.yml /opt/n8n/backups/docker-compose.yml.pre-hmac

# Add HMAC secret to environment
sudo sed -i '/N8N_BASIC_AUTH_PASSWORD/a\      - WEBHOOK_HMAC_SECRET='"$WEBHOOK_SECRET"'' /opt/n8n/docker-compose.yml

# Restart n8n
cd /opt/n8n && sudo docker-compose down && sudo docker-compose up -d
EOF
```

### 1A.4 Import HMAC Workflow

**Purpose:** Deploy workflow with HMAC verification

```bash
# Import the HMAC-enabled workflow
N8N_API_KEY="your-api-key"

# Deactivate current workflow first
curl -X PATCH "https://n8n.zaplit.com/api/v1/workflows/{workflow-id}" \
  -H "X-N8N-API-KEY: ${N8N_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"active": false}'

# Import new workflow with HMAC
curl -X POST "https://n8n.zaplit.com/api/v1/workflows" \
  -H "X-N8N-API-KEY: ${N8N_API_KEY}" \
  -H "Content-Type: application/json" \
  -d @workflows/consultation-form-v3-hmac.json

# Activate new workflow
curl -X PATCH "https://n8n.zaplit.com/api/v1/workflows/{new-workflow-id}" \
  -H "X-N8N-API-KEY: ${N8N_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"active": true}'
```

### 1A.5 Update Frontend for HMAC

**Purpose:** Configure frontend forms to send HMAC signatures

```bash
# Update zaplit.com frontend
gcloud compute ssh n8n-instance --zone=us-central1-a << 'EOF'
# Update frontend config
sudo tee /opt/n8n/frontend-config.json << 'CONFIG'
{
  "webhook": {
    "url": "https://n8n.zaplit.com/webhook/consultation-form",
    "hmacEnabled": true,
    "hmacHeader": "X-Webhook-Signature"
  }
}
CONFIG
EOF
```

**Verification:**

```bash
# Test webhook with HMAC
curl -X POST "https://n8n.zaplit.com/webhook/consultation-form" \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Signature: $(echo -n '{"test":"data"}' | openssl dgst -sha256 -hmac "$WEBHOOK_SECRET" | cut -d' ' -f2)" \
  -d '{"test":"data"}' \
  -v

# Expected: 200 OK with valid HMAC
# Expected: 401 Unauthorized with invalid/missing HMAC
```

---

## Phase 1B: Disaster Recovery

**Priority:** HIGH  
**Estimated Duration:** 3 hours  
**Downtime:** None (background processes)

### 1B.1 Configure GCP VM Snapshots

**Purpose:** Automated VM-level backups for rapid recovery

```bash
# Run snapshot schedule setup
./scripts/dr/setup-snapshot-schedule.sh
```

**Verification:**

```bash
# Check snapshot schedule
gcloud compute resource-policies describe snapshot-schedule-n8n \
  --region=us-central1

# Check attached to VM
gcloud compute disks describe n8n-instance \
  --zone=us-central1-a \
  --format="table(name, resourcePolicies)"
```

**Expected Output:**
```
name              resourcePolicies
n8n-instance      https://www.googleapis.com/compute/v1/projects/zaplit-production/...
```

### 1B.2 Set Up Database Backup Script

**Purpose:** Automated PostgreSQL backups to GCS

```bash
# Copy backup script to VM
gcloud compute scp scripts/dr/backup-database.sh \
  n8n-instance:/opt/n8n/scripts/ \
  --zone=us-central1-a

# Configure on VM
gcloud compute ssh n8n-instance --zone=us-central1-a << 'EOF'
# Make executable
chmod +x /opt/n8n/scripts/backup-database.sh

# Create backup directories
sudo mkdir -p /opt/n8n/backups
sudo mkdir -p /var/log

# Setup cron job (daily at 3:00 AM UTC)
(crontab -l 2>/dev/null | grep -v backup-database; 
 echo "0 3 * * * /opt/n8n/scripts/backup-database.sh >> /var/log/n8n-backup.log 2>&1") | crontab -

# Verify cron job
crontab -l | grep backup-database
EOF
```

**Manual Backup Test:**

```bash
# Trigger manual backup
gcloud compute ssh n8n-instance --zone=us-central1-a \
  --command="sudo /opt/n8n/scripts/backup-database.sh"

# Check backup created
gsutil ls gs://zaplit-n8n-backups/ | head -5
```

### 1B.3 Test Restore Procedure

**Purpose:** Verify backup integrity and restore process

```bash
# Run restore test (non-destructive)
gcloud compute ssh n8n-instance --zone=us-central1-a << 'EOF'
# Get latest backup
LATEST_BACKUP=$(gsutil ls gs://zaplit-n8n-backups/n8n-db-*.sql.gz | sort | tail -1)
echo "Testing backup: $LATEST_BACKUP"

# Download to temp location
gsutil cp "$LATEST_BACKUP" /tmp/test-backup.sql.gz

# Test gzip integrity
gzip -t /tmp/test-backup.sql.gz && echo "✓ Backup integrity verified"

# Test SQL syntax (first 100 lines)
zcat /tmp/test-backup.sql.gz | head -100 | grep -q "PostgreSQL database dump" && echo "✓ Valid PostgreSQL dump"

# Cleanup
rm -f /tmp/test-backup.sql.gz
EOF
```

### 1B.4 Configure Docker Auto-Restart

**Purpose:** Ensure n8n automatically recovers from crashes

```bash
# Update docker-compose with restart policies
gcloud compute ssh n8n-instance --zone=us-central1-a << 'EOF'
# Backup current config
sudo cp /opt/n8n/docker-compose.yml /opt/n8n/backups/docker-compose.yml.pre-restart-policy

# Update restart policies
sudo sed -i 's/restart: unless-stopped/restart: always/g' /opt/n8n/docker-compose.yml

# Also ensure Docker service starts on boot
sudo systemctl enable docker

# Verify changes
sudo grep "restart:" /opt/n8n/docker-compose.yml
EOF
```

**Verification:**

```bash
# Check Docker auto-start setting
gcloud compute ssh n8n-instance --zone=us-central1-a \
  --command="sudo systemctl is-enabled docker"

# Expected: enabled
```

---

## Phase 1C: Monitoring Deployment

**Priority:** HIGH  
**Estimated Duration:** 2 hours  
**Downtime:** ~3 minutes (monitoring stack deployment)

### 1C.1 Deploy Prometheus + Grafana

**Purpose:** Centralized metrics collection and visualization

```bash
# Copy and run monitoring deployment
gcloud compute scp scripts/monitoring/deploy-monitoring.sh \
  n8n-instance:/opt/n8n/scripts/ \
  --zone=us-central1-a

gcloud compute ssh n8n-instance --zone=us-central1-a << 'EOF'
cd /opt/n8n
chmod +x scripts/deploy-monitoring.sh
sudo ./scripts/deploy-monitoring.sh
EOF
```

**Verification:**

```bash
# Check Prometheus
gcloud compute ssh n8n-instance --zone=us-central1-a \
  --command="curl -s http://localhost:9090/api/v1/status/targets" | jq '.data.activeTargets | length'

# Expected: 3 (prometheus, n8n, node-exporter)

# Check Grafana
gcloud compute ssh n8n-instance --zone=us-central1-a \
  --command="curl -s http://localhost:3000/api/health" | jq '.database'

# Expected: "ok"
```

### 1C.2 Configure Alert Rules

**Purpose:** Automated alerting for critical issues

```bash
# Copy alert rules
gcloud compute scp monitoring/alert-rules.yml \
  n8n-instance:/opt/n8n/monitoring/ \
  --zone=us-central1-a

# Reload Prometheus configuration
gcloud compute ssh n8n-instance --zone=us-central1-a \
  --command="curl -X POST http://localhost:9090/-/reload"
```

**Test Alert Rules:**

```bash
# Verify rules are loaded
gcloud compute ssh n8n-instance --zone=us-central1-a \
  --command="curl -s http://localhost:9090/api/v1/rules" | jq '.data.groups[].rules[].name'
```

**Expected Rules:**
- N8nDown
- HighErrorRate
- DiskSpaceLow
- MemoryHigh
- CPUHigh
- PrometheusTargetMissing

### 1C.3 Set Up Slack Notifications

**Purpose:** Real-time alerts to team Slack channel

```bash
# Store Slack webhook in Secret Manager
SLACK_WEBHOOK="https://hooks.slack.com/services/YOUR/WEBHOOK/URL"
echo -n "$SLACK_WEBHOOK" | gcloud secrets create slack-webhook-url \
  --data-file=- --labels="service=n8n,env=production"

# Update monitoring config
gcloud compute ssh n8n-instance --zone=us-central1-a << 'EOF'
# Create alertmanager config
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

inhibit_rules:
- source_match:
    severity: 'p0'
  target_match:
    severity: 'p1'
  equal: ['alertname']
CONFIG

# Update Slack webhook placeholder with actual secret
SLACK_URL=$(gcloud secrets versions access latest --secret=slack-webhook-url)
sudo sed -i "s|SLACK_WEBHOOK_URL|$SLACK_URL|g" /opt/n8n/monitoring/alertmanager.yml
EOF
```

**Test Notification:**

```bash
# Send test alert
gcloud compute ssh n8n-instance --zone=us-central1-a << 'EOF'
curl -X POST http://localhost:9093/-/reload 2>/dev/null || true

# Trigger test notification via webhook
curl -X POST "YOUR_SLACK_WEBHOOK_URL" \
  -H 'Content-type: application/json' \
  --data '{"text":"🧪 Test alert from n8n monitoring setup"}'
EOF
```

### 1C.4 Verify Dashboards

**Purpose:** Ensure Grafana dashboards are accessible

```bash
# Access Grafana (from local machine with port forwarding)
gcloud compute ssh n8n-instance --zone=us-central1-a \
  -- -L 3000:localhost:3000 -N &

# Open browser to http://localhost:3000
# Login: admin / (password from /opt/n8n/monitoring/.grafana-admin-password)

# Check dashboards are available
curl -s http://localhost:3000/api/search \
  -u admin:$(gcloud compute ssh n8n-instance --zone=us-central1-a \
    --command="sudo cat /opt/n8n/monitoring/.grafana-admin-password") | jq '.[].title'
```

---

## Phase 1D: Data Quality Deployment

**Priority:** MEDIUM  
**Estimated Duration:** 1 hour  
**Downtime:** ~2 minutes (workflow swap)

### 1D.1 Import Enhanced Workflow v3

**Purpose:** Deploy improved workflow with better validation

```bash
# Import enhanced workflow
N8N_API_KEY="your-api-key"

# First, export current workflow for rollback
curl -X GET "https://n8n.zaplit.com/api/v1/workflows/{current-workflow-id}" \
  -H "X-N8N-API-KEY: ${N8N_API_KEY}" \
  -o backups/consultation-form-pre-v3.json

# Deactivate current workflow
curl -X PATCH "https://n8n.zaplit.com/api/v1/workflows/{current-workflow-id}" \
  -H "X-N8N-API-KEY: ${N8N_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"active": false}'

# Import v3 workflow
curl -X POST "https://n8n.zaplit.com/api/v1/workflows" \
  -H "X-N8N-API-KEY: ${N8N_API_KEY}" \
  -H "Content-Type: application/json" \
  -d @n8n-workflow-consultation-form-twenty-crm.json

# Note the new workflow ID from response and activate
NEW_WORKFLOW_ID="{id-from-response}"
curl -X PATCH "https://n8n.zaplit.com/api/v1/workflows/${NEW_WORKFLOW_ID}" \
  -H "X-N8N-API-KEY: ${N8N_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"active": true}'
```

### 1D.2 Configure CRM Credentials

**Purpose:** Ensure Twenty CRM integration is properly configured

```bash
# Verify CRM credentials in n8n
N8N_API_KEY="your-api-key"

# List credentials
curl -X GET "https://n8n.zaplit.com/api/v1/credentials" \
  -H "X-N8N-API-KEY: ${N8N_API_KEY}" | jq '.data[] | {id, name, type}'

# Test CRM connectivity
curl -X POST "https://crm.zaplit.com/graphql" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"query":"{ __typename }"}'
```

### 1D.3 Test Form Validation

**Purpose:** Verify end-to-end form submission and validation

```bash
# Test valid submission
curl -X POST "https://n8n.zaplit.com/webhook/consultation-form" \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Signature: $(echo -n '{"name":"Test User","email":"test@example.com","company":"Test Corp"}' | openssl dgst -sha256 -hmac "$WEBHOOK_SECRET" | cut -d' ' -f2)" \
  -d '{
    "name": "Test User",
    "email": "test@example.com",
    "company": "Test Corp",
    "projectType": "integration",
    "budget": "10000-50000",
    "timeline": "3-months",
    "message": "Test submission"
  }'

# Test invalid submission (should fail validation)
curl -X POST "https://n8n.zaplit.com/webhook/consultation-form" \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Signature: $(echo -n '{"email":"invalid-email"}' | openssl dgst -sha256 -hmac "$WEBHOOK_SECRET" | cut -d' ' -f2)" \
  -d '{"email":"invalid-email"}' \
  -v

# Expected: 400 Bad Request with validation error
```

---

## Post-Deployment Verification

### Complete Verification Script

Run the comprehensive verification script:

```bash
./scripts/verify-deployment.sh
```

### Manual Verification Checklist

#### Security Verification

- [ ] N8N_ENCRYPTION_KEY is set (64 hex characters)
- [ ] Basic authentication returns 401 without credentials
- [ ] Basic authentication returns 200 with valid credentials
- [ ] HMAC secret is configured in environment
- [ ] Webhook requests without HMAC signature return 401
- [ ] Webhook requests with valid HMAC return 200

#### DR Verification

- [ ] GCP snapshot schedule is active
- [ ] Snapshot schedule attached to VM disk
- [ ] Database backup script exists at /opt/n8n/scripts/backup-database.sh
- [ ] Cron job configured for daily backups
- [ ] GCS bucket exists: gs://zaplit-n8n-backups
- [ ] Latest backup file exists in GCS bucket
- [ ] Docker restart policy is set to "always"
- [ ] Docker service enabled on boot

#### Monitoring Verification

- [ ] Prometheus accessible on port 9090
- [ ] Grafana accessible on port 3000
- [ ] All 3 targets showing as UP in Prometheus
- [ ] Alert rules loaded in Prometheus
- [ ] Grafana dashboards imported
- [ ] Slack notifications configured
- [ ] Test alert received in Slack

#### Data Quality Verification

- [ ] V3 workflow imported and active
- [ ] CRM credentials configured
- [ ] Test form submission succeeds
- [ ] CRM record created from submission
- [ ] Validation rejects invalid submissions

---

## Rollback Procedures

### Emergency Rollback

If deployment fails, execute immediate rollback:

```bash
./scripts/rollback-phase1.sh
```

### Manual Rollback Steps

#### Rollback Security Changes

```bash
# Revert to previous docker-compose
gcloud compute ssh n8n-instance --zone=us-central1-a << 'EOF'
# Stop containers
cd /opt/n8n && sudo docker-compose down

# Restore previous configuration
sudo cp /opt/n8n/backups/docker-compose.yml.pre-security /opt/n8n/docker-compose.yml

# Restart
cd /opt/n8n && sudo docker-compose up -d
EOF
```

#### Rollback Workflow Changes

```bash
# Restore previous workflow
N8N_API_KEY="your-api-key"

# Deactivate new workflow
curl -X PATCH "https://n8n.zaplit.com/api/v1/workflows/{new-workflow-id}" \
  -H "X-N8N-API-KEY: ${N8N_API_KEY}" \
  -d '{"active": false}'

# Reactivate old workflow
curl -X PATCH "https://n8n.zaplit.com/api/v1/workflows/{old-workflow-id}" \
  -H "X-N8N-API-KEY: ${N8N_API_KEY}" \
  -d '{"active": true}'
```

#### Rollback Monitoring

```bash
# Stop monitoring services
gcloud compute ssh n8n-instance --zone=us-central1-a \
  --command="cd /opt/n8n && sudo docker-compose stop prometheus grafana node-exporter"

# Remove monitoring from docker-compose
gcloud compute ssh n8n-instance --zone=us-central1-a << 'EOF'
# Restore original docker-compose
sudo cp /opt/n8n/backups/docker-compose.yml.pre-monitoring /opt/n8n/docker-compose.yml

# Restart core services only
cd /opt/n8n && sudo docker-compose up -d
EOF
```

---

## Troubleshooting

### Common Issues

#### Issue: Encryption Key Not Working

**Symptoms:** Credentials not decrypting, n8n errors

**Resolution:**
```bash
# Verify key format
gcloud compute ssh n8n-instance --zone=us-central1-a \
  --command="docker exec n8n printenv N8N_ENCRYPTION_KEY | wc -c"

# Should be 65 (64 chars + newline)

# If wrong, regenerate and re-enter all credentials
```

#### Issue: Webhook HMAC Verification Failing

**Symptoms:** All webhook requests return 401

**Resolution:**
```bash
# Check HMAC secret is set
gcloud compute ssh n8n-instance --zone=us-central1-a \
  --command="docker exec n8n printenv WEBHOOK_HMAC_SECRET | head -c 10"

# Verify HMAC generation on client side
echo -n '{"test":"data"}' | openssl dgst -sha256 -hmac "$SECRET"
```

#### Issue: Prometheus Targets Down

**Symptoms:** n8n target showing as DOWN

**Resolution:**
```bash
# Check n8n metrics endpoint
gcloud compute ssh n8n-instance --zone=us-central1-a \
  --command="curl -s http://localhost:5678/metrics | head -5"

# Check Prometheus logs
gcloud compute ssh n8n-instance --zone=us-central1-a \
  --command="docker logs prometheus 2>&1 | tail -20"
```

#### Issue: Database Backup Failing

**Symptoms:** No new backups in GCS bucket

**Resolution:**
```bash
# Check backup logs
gcloud compute ssh n8n-instance --zone=us-central1-a \
  --command="tail -50 /var/log/n8n-backup.log"

# Test manual backup
gcloud compute ssh n8n-instance --zone=us-central1-a \
  --command="sudo /opt/n8n/scripts/backup-database.sh"

# Verify GCS permissions
gcloud compute ssh n8n-instance --zone=us-central1-a \
  --command="gsutil ls gs://zaplit-n8n-backups/"
```

### Support Contacts

| Issue Type | Contact | Escalation |
|------------|---------|------------|
| Infrastructure | DevOps Team | SRE On-call |
| n8n Workflows | Automation Team | Tech Lead |
| CRM Integration | Development Team | Product Owner |

---

## Appendix

### A. File Locations

| Component | Path |
|-----------|------|
| docker-compose.yml | /opt/n8n/docker-compose.yml |
| Backup scripts | /opt/n8n/scripts/ |
| Monitoring config | /opt/n8n/monitoring/ |
| Backup storage | gs://zaplit-n8n-backups/ |
| Logs | /var/log/n8n-backup.log |

### B. Useful Commands

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

# List workflows via API
curl -H "X-N8N-API-KEY: $N8N_API_KEY" \
  https://n8n.zaplit.com/api/v1/workflows | jq '.data[].name'
```

### C. Related Documentation

- [RB-DEPLOY-001-Phase1.md](./runbooks/RB-DEPLOY-001-Phase1.md) - Detailed runbook
- [RB-DR-001-VM-Recovery.md](./runbooks/RB-DR-001-VM-Recovery.md) - DR runbook
- [RB002-incident-response.md](./runbooks/RB002-incident-response.md) - Incident response
- [RB004-monitoring-setup.md](./runbooks/RB004-monitoring-setup.md) - Monitoring setup

---

**Document Control:**
- Last Updated: March 19, 2026
- Version: 1.0
- Owner: DevOps Engineering Team
- Review Cycle: Quarterly
