# Phase 1 (Stabilize) Deployment Checklist

**Version:** 1.0  
**Date:** March 19, 2026  
**Status:** Production Ready

---

## Pre-Deployment Checklist

### Access & Permissions

- [ ] GCP CLI installed and authenticated (`gcloud auth list`)
- [ ] SSH access to n8n-instance VM confirmed
- [ ] n8n Admin API key available
- [ ] GCP Secret Manager access confirmed
- [ ] Slack webhook URL for notifications available

### Environment Verification

- [ ] Target instance confirmed: n8n-instance (us-central1-a)
- [ ] Current n8n version documented
- [ ] Current docker-compose.yml backed up
- [ ] All workflows exported to local backup
- [ ] Disk usage below 80% (`df -h`)
- [ ] Memory usage below 80% (`free -m`)

### Communication

- [ ] Maintenance window scheduled with stakeholders
- [ ] #deployments Slack channel notified
- [ ] Status page set to "Maintenance"
- [ ] Emergency contact list confirmed

---

## Phase 1A: Security Deployment (CRITICAL)

### Encryption Key Verification

- [ ] Run: `./scripts/security/verify-encryption-key.sh n8n-instance us-central1-a`
- [ ] Verify: N8N_ENCRYPTION_KEY is set (64 hex characters)
- [ ] Verify: Key format is valid (not default/weak value)
- [ ] Document: Current encryption key status

**Result:** _______________  **Time:** _______________

### Basic Authentication Setup

- [ ] Run: `./scripts/security/enable-basic-auth.sh n8n-instance us-central1-a zaplit-admin`
- [ ] Verify: Password stored in GCP Secret Manager (n8n-admin-password)
- [ ] Verify: Basic auth returns 401 without credentials
- [ ] Verify: Basic auth returns 200 with valid credentials
- [ ] Document: Admin username and password location

**Result:** _______________  **Time:** _______________

### Webhook HMAC Configuration

- [ ] Generate HMAC secret: `openssl rand -hex 32`
- [ ] Store in Secret Manager: `webhook-hmac-secret`
- [ ] Update docker-compose.yml with WEBHOOK_HMAC_SECRET
- [ ] Restart n8n container
- [ ] Verify: Webhook rejects requests without HMAC (401)
- [ ] Verify: Webhook accepts requests with valid HMAC (200)

**Result:** _______________  **Time:** _______________

### HMAC Workflow Import

- [ ] Export current workflow for backup
- [ ] Deactivate current workflow
- [ ] Import: `n8n-workflow-consultation-form-twenty-crm.json`
- [ ] Activate new workflow
- [ ] Test webhook with valid HMAC signature
- [ ] Test webhook without HMAC signature (should fail)

**Result:** _______________  **Time:** _______________

### Security Phase Sign-off

- [ ] All security checks passed
- [ ] No security warnings in logs
- [ ] Stakeholder notification sent

**Signed:** _______________  **Date:** _______________

---

## Phase 1B: Disaster Recovery (HIGH)

### VM Snapshot Configuration

- [ ] Run: `./scripts/dr/setup-snapshot-schedule.sh`
- [ ] Verify: Snapshot schedule `snapshot-schedule-n8n` created
- [ ] Verify: Schedule attached to n8n-instance disk
- [ ] Confirm: Daily snapshot at 02:00 UTC
- [ ] Confirm: 30-day retention policy

**Result:** _______________  **Time:** _______________

### Database Backup Setup

- [ ] Copy backup script to VM: `/opt/n8n/scripts/backup-database.sh`
- [ ] Make script executable
- [ ] Configure cron job (daily at 03:00 UTC)
- [ ] Verify: GCS bucket `zaplit-n8n-backups` exists
- [ ] Run manual backup test
- [ ] Verify: Backup file uploaded to GCS

**Result:** _______________  **Time:** _______________

### Restore Procedure Test

- [ ] Download latest backup from GCS
- [ ] Verify backup integrity (gzip test)
- [ ] Verify backup contains valid PostgreSQL dump
- [ ] Document restore procedure timing
- [ ] Update RB-DR-001 with actual restore steps

**Result:** _______________  **Time:** _______________

### Docker Auto-Restart

- [ ] Update docker-compose.yml restart policy to "always"
- [ ] Enable Docker service on boot: `systemctl enable docker`
- [ ] Verify: Docker restart policy in compose file
- [ ] Verify: Docker service enabled

**Result:** _______________  **Time:** _______________

### DR Phase Sign-off

- [ ] All DR components configured
- [ ] Backup verification completed
- [ ] Restore procedure documented

**Signed:** _______________  **Date:** _______________

---

## Phase 1C: Monitoring Deployment (HIGH)

### Prometheus + Grafana Deployment

- [ ] Copy deploy script to VM
- [ ] Run: `./scripts/monitoring/deploy-monitoring.sh`
- [ ] Verify: Prometheus container running (port 9090)
- [ ] Verify: Grafana container running (port 3000)
- [ ] Verify: Node Exporter container running (port 9100)
- [ ] Document: Grafana admin password location

**Result:** _______________  **Time:** _______________

### Alert Rules Configuration

- [ ] Copy alert-rules.yml to VM: `/opt/n8n/monitoring/`
- [ ] Reload Prometheus configuration
- [ ] Verify: N8nDown alert rule loaded
- [ ] Verify: HighErrorRate alert rule loaded
- [ ] Verify: DiskSpaceLow alert rule loaded
- [ ] Verify: MemoryHigh alert rule loaded
- [ ] Verify: CPUHigh alert rule loaded

**Result:** _______________  **Time:** _______________

### Slack Notifications

- [ ] Store Slack webhook in Secret Manager
- [ ] Create alertmanager.yml configuration
- [ ] Configure alert routing rules
- [ ] Send test alert to Slack
- [ ] Verify: Test alert received in #incidents channel

**Result:** _______________  **Time:** _______________

### Dashboard Verification

- [ ] Access Grafana at http://localhost:3000 (with port forward)
- [ ] Login with admin credentials
- [ ] Verify: n8n Production dashboard exists
- [ ] Verify: Success Rate panel showing data
- [ ] Verify: Error Rate panel showing data
- [ ] Verify: Response Time panel showing data

**Result:** _______________  **Time:** _______________

### Monitoring Phase Sign-off

- [ ] All monitoring components deployed
- [ ] Alerts tested and verified
- [ ] Dashboards accessible and functional

**Signed:** _______________  **Date:** _______________

---

## Phase 1D: Data Quality (MEDIUM)

### Enhanced Workflow Import

- [ ] Export current workflow for rollback
- [ ] Import: `n8n-workflow-consultation-form-twenty-crm.json`
- [ ] Activate new workflow
- [ ] Verify: Workflow shows as active in n8n UI
- [ ] Document: New workflow ID

**Result:** _______________  **Time:** _______________

### CRM Credentials

- [ ] Verify Twenty CRM credential exists in n8n
- [ ] Test CRM connectivity from n8n
- [ ] Verify: API token valid and not expired
- [ ] Document: Credential ID for reference

**Result:** _______________  **Time:** _______________

### Form Validation Testing

- [ ] Test valid form submission
- [ ] Verify: HTTP 200 response
- [ ] Verify: CRM record created
- [ ] Test invalid submission (missing required fields)
- [ ] Verify: HTTP 400 response with validation error
- [ ] Test invalid email format
- [ ] Verify: HTTP 400 response with validation error

**Result:** _______________  **Time:** _______________

### Data Quality Sign-off

- [ ] Workflow functioning correctly
- [ ] Form validation working as expected
- [ ] CRM integration verified

**Signed:** _______________  **Date:** _______________

---

## Post-Deployment Verification

### Automated Verification

- [ ] Run: `./scripts/verify-deployment.sh`
- [ ] Review: All checks passed (PASS count)
- [ ] Review: Any warnings documented
- [ ] Review: Any failures addressed

**Result:** _______________  **Time:** _______________

### Manual Verification

- [ ] n8n health check: `curl https://n8n.zaplit.com/healthz`
- [ ] Basic auth active: `curl -I https://n8n.zaplit.com/`
- [ ] Docker containers running: `docker ps`
- [ ] Disk space healthy: `< 80%`
- [ ] Memory usage healthy: `< 80%`
- [ ] Backup script exists and executable
- [ ] Cron job configured
- [ ] Prometheus healthy
- [ ] Grafana healthy

**Result:** _______________  **Time:** _______________

### End-to-End Test

- [ ] Submit test form on zaplit.com
- [ ] Verify: Form submission successful
- [ ] Verify: Webhook received by n8n
- [ ] Verify: CRM record created
- [ ] Verify: Confirmation email sent (if applicable)

**Result:** _______________  **Time:** _______________

---

## Post-Deployment Tasks

### Communication

- [ ] Update status page to "Operational"
- [ ] Post completion notice in #deployments
- [ ] Send deployment summary email
- [ ] Update project documentation

### Documentation

- [ ] Update deployment log with actual times
- [ ] Document any issues encountered
- [ ] Document any deviations from plan
- [ ] Update runbook with lessons learned

### Cleanup

- [ ] Remove maintenance mode banners
- [ ] Archive deployment artifacts
- [ ] Clean up temporary files on VM
- [ ] Verify no sensitive data in logs

---

## Rollback Preparedness

### Rollback Verification

- [ ] Rollback script tested: `./scripts/rollback-phase1.sh --dry-run`
- [ ] Backup files verified and accessible
- [ ] Rollback procedure reviewed
- [ ] Emergency contacts confirmed available

**Result:** _______________  **Time:** _______________

---

## Final Sign-off

### Deployment Summary

| Metric | Planned | Actual | Variance |
|--------|---------|--------|----------|
| Start Time | | | |
| End Time | | | |
| Total Duration | 8 hours | | |
| Downtime | ~10 min | | |

### Issues Encountered

| Issue | Severity | Resolution | Time Lost |
|-------|----------|------------|-----------|
| | | | |
| | | | |

### Final Verification

- [ ] All phases completed successfully
- [ ] All verification checks passed
- [ ] Rollback plan tested and ready
- [ ] Documentation updated
- [ ] Team notified of completion

### Approval

**Deployed by:** _______________  **Date:** _______________

**Verified by:** _______________  **Date:** _______________

**Approved by:** _______________  **Date:** _______________

---

## Quick Reference

### Important URLs

| Service | URL | Credentials |
|---------|-----|-------------|
| n8n | https://n8n.zaplit.com | Secret Manager: n8n-admin-password |
| CRM | https://crm.zaplit.com | Twenty CRM login |
| Prometheus | http://34.132.198.35:9090 | N/A |
| Grafana | http://34.132.198.35:3000 | Secret: grafana-admin-password |

### Useful Commands

```bash
# Check deployment status
./scripts/verify-deployment.sh

# View n8n logs
gcloud compute ssh n8n-instance --zone=us-central1-a \
  --command="docker logs n8n --tail 100 -f"

# Get admin password
gcloud secrets versions access latest --secret=n8n-admin-password

# Check backups
gsutil ls gs://zaplit-n8n-backups/ | tail -5

# Emergency rollback
./scripts/rollback-phase1.sh --component all
```

### Emergency Contacts

| Role | Contact | Method |
|------|---------|--------|
| DevOps Lead | devops@zaplit.com | Email/Slack |
| SRE On-call | sre-oncall@zaplit.com | PagerDuty |
| Engineering Lead | eng-lead@zaplit.com | Slack |

---

**Document Control:**
- Version: 1.0
- Last Updated: March 19, 2026
- Owner: DevOps Engineering Team
- Review: Per deployment
