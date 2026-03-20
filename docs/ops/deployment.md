---
title: Deployment Operations Guide
topics:
  - N8N_PRODUCTION_DEPLOYMENT_GUIDE.md
  - EXECUTION_DR_FIXES.md
  - FINAL_EXECUTION_REPORT.md
  - MASTER_EXECUTION_SUMMARY.md
---

# Deployment Operations Guide

## Quick Reference

### Pre-Deployment Checklist
- [ ] `N8N_ENCRYPTION_KEY` configured (32+ character random string)
- [ ] Basic auth enabled (`N8N_BASIC_AUTH_ACTIVE=true`)
- [ ] HTTPS enforced (TLS 1.2+)
- [ ] Twenty CRM API key stored in n8n credential store
- [ ] Webhook authentication enabled (HMAC or Bearer token)
- [ ] Execution logs prune enabled (`EXECUTIONS_DATA_PRUNE=true`)

### Deployment Commands
```bash
# Export production workflow backup
curl -X GET "https://n8n.zaplit.com/api/v1/workflows/$WORKFLOW_ID" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" \
  > production-backup-$(date +%Y%m%d-%H%M).json

# Verify encryption key
docker exec n8n printenv N8N_ENCRYPTION_KEY | wc -c
# Should return: 65 (64 hex chars + newline)

# Test webhook endpoint
curl -I https://n8n.zaplit.com/webhook/consultation
```

### Emergency Rollback (< 5 minutes)
```bash
#!/bin/bash
# Deactivate workflow immediately
curl -X POST \
  "https://n8n.zaplit.com/api/v1/workflows/$WORKFLOW_ID/deactivate" \
  -H "X-N8N-API-KEY: $N8N_API_KEY"

# Restore from backup
curl -X PUT \
  "https://n8n.zaplit.com/api/v1/workflows/$WORKFLOW_ID" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" \
  -H "Content-Type: application/json" \
  -d @$LATEST_BACKUP
```

---

## Detailed Procedures

### 1. Security Hardening

#### Required Environment Variables
```bash
# Critical: Encryption key (generate with: openssl rand -hex 32)
N8N_ENCRYPTION_KEY=<32-character-random-hex-string>

# Basic Authentication
N8N_BASIC_AUTH_ACTIVE=true
N8N_BASIC_AUTH_USER=<admin-username>
N8N_BASIC_AUTH_PASSWORD=<strong-password>

# Data Retention (GDPR compliance)
EXECUTIONS_DATA_PRUNE=true
EXECUTIONS_DATA_MAX_AGE=168        # 7 days
EXECUTIONS_DATA_SAVE_ON_ERROR=all
EXECUTIONS_DATA_SAVE_ON_SUCCESS=none

# Privacy
N8N_DIAGNOSTICS_ENABLED=false
N8N_VERSION_NOTIFICATIONS_ENABLED=false
```

#### Credential Security
- Store Twenty CRM API key in n8n credential store (NOT hardcoded)
- Use separate credentials for production/staging/development
- Naming convention: `{Service}-{Environment}-{Purpose}`
- Enable webhook authentication (HMAC-SHA256 recommended)

### 2. Performance Configuration

```bash
# Performance tuning
N8N_CONCURRENCY_PRODUCTION_LIMIT=50
N8N_DEFAULT_TIMEOUT=30000          # 30 seconds
N8N_PAYLOAD_SIZE_MAX=16            # 16MB max payload

# Database (PostgreSQL recommended)
DB_TYPE=postgres
DB_POSTGRESDB_HOST=<db-host>
DB_POSTGRESDB_PORT=5432
DB_POSTGRESDB_DATABASE=n8n
DB_POSTGRESDB_USER=n8n
DB_POSTGRESDB_PASSWORD=<secure-password>
```

### 3. Backup & Rollback Strategy

| Backup Type | Frequency | Retention | Method |
|-------------|-----------|-----------|--------|
| Database | Daily | 30 days | Automated (pg_dump) |
| Workflows | Weekly | 90 days | API export |
| Credentials | On change | Latest only | Manual export |
| Full System | Weekly | 4 weeks | Volume snapshot |

#### GCP VM Snapshot Schedule
```bash
# Deploy snapshot automation
gcloud compute scp scripts/dr/*.sh n8n-instance:/opt/n8n/scripts/ --zone=us-central1-a
gcloud compute ssh n8n-instance --zone=us-central1-a
sudo /opt/n8n/scripts/setup-snapshot-schedule.sh
```

**Snapshot Configuration:**
- Schedule: Daily at 02:00 UTC
- Retention: 30 days
- Target: n8n-instance boot disk

#### Database Backup Script
File: `scripts/dr/backup-database.sh`

Features:
- PostgreSQL dump with gzip compression
- GCS upload with verification
- Metadata generation (JSON)
- Automatic cleanup (local: 7 days, GCS: 90 days)
- Slack/email notifications
- Comprehensive logging

Cron schedule: `0 3 * * *` (runs daily at 3:00 AM UTC)

### 4. Webhook URL Configuration

| Environment | URL | Status |
|-------------|-----|--------|
| Production | `https://n8n.zaplit.com/webhook/consultation` | Active |
| Staging | `https://n8n-staging.zaplit.com/webhook/consultation` | Test Only |

**Webhook Node Settings:**
```json
{
  "path": "consultation",
  "httpMethod": "POST",
  "responseMode": "responseNode",
  "options": {
    "responseData": "allEntries",
    "responseHeaders": {
      "Access-Control-Allow-Origin": "https://zaplit.com",
      "Access-Control-Allow-Methods": "POST, OPTIONS"
    }
  }
}
```

### 5. DNS & Routing Configuration

```
# A Record for n8n subdomain
n8n.zaplit.com    A    <n8n-server-ip>

# CNAME for CRM
crm.zaplit.com    CNAME    <twenty-crm-endpoint>
```

### 6. Deployment Process

#### Step-by-Step Deployment Checklist
```
⬜ 1. Complete final testing in staging
⬜ 2. Export production workflow backup
⬜ 3. Import/Update workflow in production
⬜ 4. Reconnect all credentials
⬜ 5. Verify webhook path configuration
⬜ 6. Test with single submission
⬜ 7. Monitor for 5 minutes
⬜ 8. Activate workflow
⬜ 9. Verify webhook URL is active
⬜ 10. Monitor for 30 minutes
```

#### Zero-Downtime Deployment Options

**Option 1: Blue-Green Deployment**
```bash
# Deploy to "green" environment
# Run smoke tests
# Switch load balancer from blue to green
update_load_balancer_target green
curl -f https://n8n.zaplit.com/healthz || rollback
```

**Option 2: Feature Flags (Recommended for n8n)**
```javascript
// In workflow, check feature flag
const useNewFlow = $env.FEATURE_NEW_CRM_FLOW === 'true';
if (useNewFlow) {
  // New workflow path
} else {
  // Legacy workflow path
}
```

**Option 3: Workflow Versioning**
```bash
# Deploy as new workflow with version suffix
# Old: Consultation Form to CRM
# New: Consultation Form to CRM v2
# Test v2 with separate webhook
# Gradually migrate traffic
```

### 7. Docker Configuration

#### Required docker-compose.yml Updates
```yaml
services:
  n8n:
    image: n8nio/n8n:latest
    restart: unless-stopped
    environment:
      - N8N_ENCRYPTION_KEY=${N8N_ENCRYPTION_KEY}
      - N8N_BASIC_AUTH_ACTIVE=true
      - N8N_BASIC_AUTH_USER=${N8N_BASIC_AUTH_USER}
      - N8N_BASIC_AUTH_PASSWORD=${N8N_ADMIN_PASSWORD}
      - DB_TYPE=postgresdb
      - DB_POSTGRESDB_HOST=postgres
    ports:
      - "127.0.0.1:5678:5678"  # Only bind to localhost

  postgres:
    image: postgres:15-alpine
    restart: unless-stopped
    environment:
      - POSTGRES_USER=n8n
      - POSTGRES_PASSWORD=${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
```

---

## Recovery Procedures

### VM Recovery Runbook
File: `runbooks/RB-DR-001-VM-Recovery.md`

**Recovery Scenarios:**

| Scenario | Use Case | Estimated Time |
|----------|----------|----------------|
| A: VM Restore from Snapshot | Disk/OS corruption | 45-60 minutes |
| B: Database Recovery Only | DB corruption only | 15-30 minutes |
| C: Complete VM Rebuild | Total loss/zone failure | 90-120 minutes |

**RTO Target:** 2 hours

### Risk Assessment

| Risk | Mitigation | Status |
|------|------------|--------|
| Single VM still a SPOF | Documented rebuild procedures | Mitigated |
| Database corruption | Daily backups + 30-day retention | Mitigated |
| Snapshot failure | GCS backups as secondary | Mitigated |
| Manual recovery too slow | Runbook with step-by-step guide | Mitigated |

---

## Related Documents

- **Original DR Fixes:** [EXECUTION_DR_FIXES.md](../../EXECUTION_DR_FIXES.md)
- **Production Deployment Guide:** [N8N_PRODUCTION_DEPLOYMENT_GUIDE.md](../../N8N_PRODUCTION_DEPLOYMENT_GUIDE.md)
- **Master Execution Summary:** [MASTER_EXECUTION_SUMMARY.md](../../MASTER_EXECUTION_SUMMARY.md)
- **VM Recovery Runbook:** [runbooks/RB-DR-001-VM-Recovery.md](runbooks/RB-DR-001-VM-Recovery.md)
- **Workflow Rollback Runbook:** [runbooks/RB003-workflow-rollback.md](runbooks/RB003-workflow-rollback.md)
- **GCP Snapshot Documentation:** https://cloud.google.com/compute/docs/disks/scheduled-snapshots
