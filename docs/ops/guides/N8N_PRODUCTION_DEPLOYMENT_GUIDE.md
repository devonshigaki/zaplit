# n8n Workflow Production Deployment Guide

**Project:** Zaplit - Consultation Form to Twenty CRM Integration  
**Date:** March 19, 2026  
**Version:** 1.0  

---

## Executive Summary

This guide provides a comprehensive production deployment playbook for n8n workflows, specifically tailored for the Zaplit consultation form-to-CRM integration. It covers pre-deployment checklists, deployment procedures, monitoring setup, incident response, and ongoing maintenance.

---

## Table of Contents

1. [Pre-Production Checklist](#1-pre-production-checklist)
2. [Deployment Process](#2-deployment-process)
3. [Monitoring Setup](#3-monitoring-setup)
4. [Incident Response Plan](#4-incident-response-plan)
5. [Maintenance Schedule](#5-maintenance-schedule)
6. [Documentation Requirements](#6-documentation-requirements)
7. [Quick Reference](#7-quick-reference)

---

## 1. Pre-Production Checklist

### 1.1 Security Hardening

#### Encryption & Secrets Management
```bash
# Required Environment Variables
N8N_ENCRYPTION_KEY=<32-character-random-hex-string>
N8N_BASIC_AUTH_ACTIVE=true
N8N_BASIC_AUTH_USER=<admin-username>
N8N_BASIC_AUTH_PASSWORD=<strong-password>

# Generate encryption key:
# openssl rand -hex 16
# OR: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

| Check | Status | Notes |
|-------|--------|-------|
| `N8N_ENCRYPTION_KEY` configured | ⬜ | 32+ character random string |
| Basic auth enabled | ⬜ | Prevent unauthorized n8n access |
| HTTPS enforced | ⬜ | TLS 1.2+ on all endpoints |
| CORS configured | ⬜ | Whitelist specific origins only |

#### Credential Security
- [ ] Twenty CRM API key stored in n8n credential store (NOT hardcoded)
- [ ] Webhook authentication enabled (HMAC or Bearer token)
- [ ] Separate credentials for production/staging/development
- [ ] Credential naming convention followed: `{Service}-{Environment}-{Purpose}`

```javascript
// Webhook Authentication Options (ranked by security)

// Option 1: HMAC Signature (Most Secure)
const crypto = require('crypto');
const secret = process.env.WEBHOOK_SECRET;
const signature = $input.headers['x-signature'];
const payload = JSON.stringify($input.body);
const expectedSignature = crypto
  .createHmac('sha256', secret)
  .update(payload)
  .digest('hex');

// Option 2: Bearer Token
const authHeader = $input.headers['authorization'];
const expectedToken = process.env.WEBHOOK_BEARER_TOKEN;

// Option 3: API Key in Header
const apiKey = $input.headers['x-api-key'];
const expectedKey = process.env.WEBHOOK_API_KEY;
```

#### Data Privacy & GDPR Compliance
```bash
# Execution Data Retention Settings
EXECUTIONS_DATA_PRUNE=true
EXECUTIONS_DATA_MAX_AGE=168        # 7 days for production
EXECUTIONS_DATA_SAVE_ON_ERROR=all  # Keep error logs
EXECUTIONS_DATA_SAVE_ON_SUCCESS=none
EXECUTIONS_DATA_SAVE_MANUAL_EXECUTIONS=false

# Disable telemetry
N8N_DIAGNOSTICS_ENABLED=false
N8N_VERSION_NOTIFICATIONS_ENABLED=false
```

- [ ] Execution logs prune enabled
- [ ] PII sanitization implemented in workflows
- [ ] Data retention policy documented
- [ ] Right to erasure workflow documented

### 1.2 Performance Optimization

#### n8n Instance Configuration
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

| Metric | Target | Configuration |
|--------|--------|---------------|
| Response Time | < 10 seconds | `N8N_DEFAULT_TIMEOUT=30000` |
| Concurrent Workflows | 50 | `N8N_CONCURRENCY_PRODUCTION_LIMIT` |
| Payload Size | < 16MB | `N8N_PAYLOAD_SIZE_MAX=16` |

#### Workflow Optimization Checklist
- [ ] Parallel execution used where possible (Person + Company creation)
- [ ] Appropriate timeouts set on HTTP Request nodes (30s)
- [ ] Retry logic configured (3 retries, 1s delay)
- [ ] Continue On Fail set appropriately per node
- [ ] No pinned data in production workflows

### 1.3 Error Handling Verification

#### Error Handling Architecture
```
Webhook
    ↓
Validate Input (IF Node)
    ↓
Create Person [Continue On Fail: true] ─┐
    ↓                                    ├→ Merge → Create Note → Response
Create Company [Continue On Fail: true] ─┘
```

| Node | Continue On Fail | Rationale |
|------|-----------------|-----------|
| Create Person | false | Required - stop workflow |
| Create Company | true | Optional - can proceed without |
| Create Note | true | Optional - error logged but response sent |
| Link Person | true | Optional - retry later |

#### Error Handling Verification
- [ ] Input validation node implemented
- [ ] Error branches configured for critical paths
- [ ] Global error workflow configured
- [ ] Retry logic with exponential backoff
- [ ] Circuit breaker pattern for external APIs

### 1.4 Backup & Rollback Strategy

#### Backup Procedures
```bash
#!/bin/bash
# n8n-backup.sh

# Database backup
pg_dump -h $DB_HOST -U n8n n8n > n8n-backup-$(date +%Y%m%d).sql

# Workflow export via n8n API
# Requires N8N_API_KEY environment variable
curl -X GET \
  "https://n8n.zaplit.com/api/v1/workflows" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" \
  > workflows-backup-$(date +%Y%m%d).json

# Credentials (manual - export from UI)
# Settings → Credentials → Export

# Retention: Keep 30 days of backups
find /backups/n8n -name "*.sql" -mtime +30 -delete
find /backups/n8n -name "*.json" -mtime +30 -delete
```

| Backup Type | Frequency | Retention | Method |
|-------------|-----------|-----------|--------|
| Database | Daily | 30 days | Automated (pg_dump) |
| Workflows | Weekly | 90 days | API export |
| Credentials | On change | Latest only | Manual export |
| Full System | Weekly | 4 weeks | Volume snapshot |

#### Rollback Procedure
```bash
#!/bin/bash
# rollback-workflow.sh <workflow-id> <backup-file>

WORKFLOW_ID=$1
BACKUP_FILE=$2

# 1. Deactivate workflow
curl -X POST \
  "https://n8n.zaplit.com/api/v1/workflows/$WORKFLOW_ID/deactivate" \
  -H "X-N8N-API-KEY: $N8N_API_KEY"

# 2. Import previous version
curl -X POST \
  "https://n8n.zaplit.com/api/v1/workflows" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" \
  -H "Content-Type: application/json" \
  -d @$BACKUP_FILE

# 3. Verify and activate
echo "Review workflow manually, then activate in UI"
```

---

## 2. Deployment Process

### 2.1 Test to Production Transition

#### Pre-Deployment Steps
1. **Verify Test Environment Success**
   ```bash
   # Run test suite
   curl -X POST https://n8n-staging.zaplit.com/webhook/consultation \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer $TEST_TOKEN" \
     -d @test-payload.json
   ```

2. **Export Current Production Workflow**
   ```bash
   # Backup before changes
   curl -X GET \
     "https://n8n.zaplit.com/api/v1/workflows/$WORKFLOW_ID" \
     -H "X-N8N-API-KEY: $N8N_API_KEY" \
     > production-backup-$(date +%Y%m%d-%H%M).json
   ```

3. **Review Change Log**
   - [ ] All P0 issues addressed
   - [ ] Security review completed
   - [ ] Performance benchmarks met
   - [ ] Documentation updated

#### Activation Steps
```
┌─────────────────────────────────────────────────────────────┐
│  STEP-BY-STEP DEPLOYMENT CHECKLIST                          │
├─────────────────────────────────────────────────────────────┤
│  ⬜ 1. Complete final testing in staging                    │
│  ⬜ 2. Export production workflow backup                    │
│  ⬜ 3. Import/Update workflow in production                 │
│  ⬜ 4. Reconnect all credentials                            │
│  ⬜ 5. Verify webhook path configuration                    │
│  ⬜ 6. Test with single submission                          │
│  ⬜ 7. Monitor for 5 minutes                                 │
│  ⬜ 8. Activate workflow                                    │
│  ⬜ 9. Verify webhook URL is active                         │
│  ⬜ 10. Monitor for 30 minutes                              │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Webhook URL Configuration

#### Production Webhook Setup
| Environment | URL | Status |
|-------------|-----|--------|
| Production | `https://n8n.zaplit.com/webhook/consultation` | Active |
| Staging | `https://n8n-staging.zaplit.com/webhook/consultation` | Test Only |

#### Webhook Configuration Checklist
```javascript
// Webhook Node Settings
{
  "path": "consultation",
  "httpMethod": "POST",
  "responseMode": "responseNode",  // Using Respond to Webhook node
  "options": {
    "responseData": "allEntries",
    "responseHeaders": {
      "Access-Control-Allow-Origin": "https://zaplit.com",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Strict-Transport-Security": "max-age=31536000"
    }
  }
}
```

- [ ] Path configured correctly (`consultation`)
- [ ] Response mode set to `responseNode`
- [ ] CORS headers configured for zaplit.com
- [ ] HTTPS enforced (TLS 1.2+)
- [ ] Authentication enabled

### 2.3 DNS & Routing Considerations

#### DNS Configuration
```
# A Record for n8n subdomain
n8n.zaplit.com    A    <n8n-server-ip>
n8n.zaplit.com    AAAA <n8n-server-ipv6>  # Optional

# CNAME for CRM (if needed)
crm.zaplit.com    CNAME    <twenty-crm-endpoint>
```

#### Load Balancer/Router Configuration
```nginx
# nginx.conf - Reverse proxy for n8n
upstream n8n {
    server 127.0.0.1:5678;
}

server {
    listen 443 ssl http2;
    server_name n8n.zaplit.com;

    # SSL Configuration
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options nosniff;
    add_header X-Frame-Options DENY;

    # WebSocket support (for n8n UI)
    location / {
        proxy_pass http://n8n;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # Webhook endpoint with rate limiting
    location /webhook/ {
        limit_req zone=webhook_limit burst=20 nodelay;
        proxy_pass http://n8n/webhook/;
    }
}
```

### 2.4 Zero-Downtime Deployment Options

#### Option 1: Blue-Green Deployment
```bash
#!/bin/bash
# blue-green-deploy.sh

# 1. Deploy to "green" environment
# 2. Run smoke tests
# 3. Switch load balancer from blue to green
# 4. Keep blue running for rollback

# Switch DNS/Load Balancer
update_load_balancer_target green

# Verify health
curl -f https://n8n.zaplit.com/healthz || rollback
```

#### Option 2: Feature Flags (Recommended for n8n)
```javascript
// In workflow, check feature flag
const useNewFlow = $env.FEATURE_NEW_CRM_FLOW === 'true';

if (useNewFlow) {
  // New workflow path
} else {
  // Legacy workflow path
}
```

#### Option 3: Workflow Versioning
```bash
# Deploy as new workflow with version suffix
# Old: Consultation Form to CRM
# New: Consultation Form to CRM v2

# Test v2 with separate webhook
# Gradually migrate traffic
# Deactivate old version after validation
```

---

## 3. Monitoring Setup

### 3.1 Key Metrics to Track

#### Primary Metrics Dashboard

| Metric | Target | Alert Threshold | Frequency |
|--------|--------|-----------------|-----------|
| Success Rate | > 99% | < 95% | Real-time |
| Response Time (p95) | < 5s | > 10s | Real-time |
| Error Rate | < 1% | > 5% | Real-time |
| Webhook Requests/min | Baseline | > 200% of baseline | 5 min |
| CRM API Failures | 0 | > 3 in 5 min | Real-time |

#### n8n Execution Metrics
```javascript
// Monitoring workflow - runs every 5 minutes
const executions = await $http.request({
  method: 'GET',
  url: 'https://n8n.zaplit.com/api/v1/executions',
  headers: { 'X-N8N-API-KEY': $env.N8N_API_KEY }
});

// Calculate metrics
const recent = executions.json.data.filter(e => {
  const executionTime = new Date(e.startedAt);
  return Date.now() - executionTime < 5 * 60 * 1000; // 5 minutes
});

const metrics = {
  total: recent.length,
  successful: recent.filter(e => e.finished && !e.stoppedAt).length,
  failed: recent.filter(e => !e.finished || e.stoppedAt).length,
  avgDuration: recent.reduce((sum, e) => sum + (e.stoppedAt - e.startedAt), 0) / recent.length
};

// Send to monitoring system
return [{ json: metrics }];
```

### 3.2 Alerting Configuration

#### Slack Alert Setup
```javascript
// Error Alert Workflow
const webhookUrl = $env.SLACK_WEBHOOK_URL;

const alert = {
  text: "🚨 n8n Workflow Failure Alert",
  blocks: [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: "Workflow Execution Failed"
      }
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Workflow:*\n${$json.workflowName}` },
        { type: "mrkdwn", text: `*Node:*\n${$json.nodeName}` },
        { type: "mrkdwn", text: `*Time:*\n${new Date().toISOString()}` },
        { type: "mrkdwn", text: `*Error:*\n${$json.errorMessage?.substring(0, 100)}` }
      ]
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "View in n8n" },
          url: `https://n8n.zaplit.com/workflow/${$json.workflowId}/executions/${$json.executionId}`
        }
      ]
    }
  ]
};

// Send to Slack
await $http.request({
  method: 'POST',
  url: webhookUrl,
  headers: { 'Content-Type': 'application/json' },
  body: alert
});
```

#### Email Alert Setup
```javascript
// PagerDuty/Email integration for critical alerts
const criticalErrors = [
  '401',  // Auth failure
  '403',  // Forbidden
  'ECONNREFUSED',  // CRM down
  'ETIMEDOUT'      // Timeout
];

if (criticalErrors.some(e => $json.errorMessage?.includes(e))) {
  // Send immediate page
  await $http.request({
    method: 'POST',
    url: $env.PAGERDUTY_WEBHOOK_URL,
    body: {
      routing_key: $env.PAGERDUTY_ROUTING_KEY,
      event_action: 'trigger',
      payload: {
        summary: `Critical: n8n ${$json.workflowName} failure`,
        severity: 'critical',
        source: 'n8n-production'
      }
    }
  });
}
```

#### Alert Severity Levels

| Level | Trigger | Response Time | Notification |
|-------|---------|---------------|--------------|
| P0 - Critical | Auth failure, CRM down | 5 min | Page/SMS + Slack |
| P1 - High | >5% error rate | 15 min | Slack + Email |
| P2 - Medium | Performance degradation | 1 hour | Slack |
| P3 - Low | Single failure, recovered | 4 hours | Daily digest |

### 3.3 Dashboard Setup

#### Recommended Dashboard Panels (Grafana/Datadog)

```json
{
  "dashboard": {
    "title": "n8n Production Monitoring",
    "panels": [
      {
        "title": "Success Rate",
        "type": "stat",
        "targets": [{
          "expr": "sum(rate(n8n_execution_success_total[5m])) / sum(rate(n8n_execution_total[5m]))"
        }],
        "thresholds": [
          { "color": "red", "value": 0.95 },
          { "color": "yellow", "value": 0.99 },
          { "color": "green", "value": 0.995 }
        ]
      },
      {
        "title": "Response Time (p95)",
        "type": "graph",
        "targets": [{
          "expr": "histogram_quantile(0.95, sum(rate(n8n_execution_duration_seconds_bucket[5m])) by (le))"
        }]
      },
      {
        "title": "Executions Per Minute",
        "type": "graph",
        "targets": [{
          "expr": "sum(rate(n8n_execution_total[1m])) by (workflow_name)"
        }]
      }
    ]
  }
}
```

### 3.4 Log Aggregation

#### Log Configuration
```bash
# n8n logging environment variables
N8N_LOG_LEVEL=info
N8N_LOG_OUTPUT=console,file
N8N_LOG_FILE=/var/log/n8n/n8n.log
N8N_LOG_FILE_SIZE_MAX=50
N8N_LOG_FILE_MAX_COUNT=5
```

#### Log Forwarding (Filebeat)
```yaml
# filebeat.yml
filebeat.inputs:
- type: log
  paths:
    - /var/log/n8n/*.log
  fields:
    service: n8n
    environment: production
  fields_under_root: true

output.elasticsearch:
  hosts: ["https://elasticsearch.zaplit.com:9200"]
  index: "n8n-logs-%{+yyyy.MM.dd}"
```

#### Structured Logging Pattern
```javascript
// In workflow nodes - structured log output
const logEntry = {
  timestamp: new Date().toISOString(),
  level: 'info',
  workflow: 'consultation-form-to-crm',
  execution_id: $execution.id,
  node: 'Create Person',
  message: 'Creating person record',
  metadata: {
    email_hash: hashEmail($json.person.email), // Hashed for privacy
    company: $json.company.name
  }
};

console.log(JSON.stringify(logEntry));
```

---

## 4. Incident Response Plan

### 4.1 Common Failure Scenarios

#### Scenario Matrix

| Scenario | Symptom | Root Cause | Response |
|----------|---------|------------|----------|
| Auth Failure (401) | All requests fail | JWT/API Key expired | Rotate credentials immediately |
| CRM Timeout | Intermittent 504s | Network/CRM overload | Enable retry with backoff |
| Duplicate Records | Multiple entries | No deduplication logic | Implement search-first pattern |
| Validation Errors | 400 responses | Malformed form data | Add client-side validation |
| Webhook Spam | High request volume | No rate limiting | Implement IP-based rate limiting |
| Data Loss | Missing fields | Incorrect node mapping | Review data transformation logic |
| Workflow Hang | Executions stuck | Infinite loop/deadlock | Set execution timeout, kill stuck runs |

#### Response Runbooks

**Runbook 1: Authentication Failure**
```bash
# 1. Verify credential status
curl -X GET https://crm.zaplit.com/rest/people \
  -H "Authorization: Bearer $CRM_TOKEN"

# 2. If 401, generate new token:
# - Log in to Twenty CRM
# - Settings → APIs & Webhooks → Generate New Key

# 3. Update n8n credential:
# - n8n Settings → Credentials → Twenty CRM
# - Update Header Auth value

# 4. Test workflow

# 5. Document in incident log
```

**Runbook 2: High Error Rate**
```bash
# 1. Check recent executions
# n8n → Executions → Filter by "Error"

# 2. Identify common error pattern
# Look for: node name, error message, timestamp correlation

# 3. If CRM API errors:
# - Check Twenty CRM status page
# - Verify network connectivity
# - Review rate limit headers

# 4. If timeout errors:
# - Increase HTTP timeout to 60s
# - Check for slow queries in CRM

# 5. If data errors:
# - Review recent form submissions
# - Check for new field types
```

**Runbook 3: Performance Degradation**
```bash
# 1. Check system resources
# - CPU usage
# - Memory usage
# - Database connection pool

# 2. Check concurrent executions
# n8n → Executions → Running

# 3. If > 50 concurrent:
# - Increase N8N_CONCURRENCY_PRODUCTION_LIMIT
# - Consider queue mode

# 4. If database bottleneck:
# - Check slow query log
# - Consider read replicas
```

### 4.2 Rollback Procedures

#### Emergency Rollback (< 5 minutes)
```bash
#!/bin/bash
# emergency-rollback.sh

WORKFLOW_ID="consultation-form-to-crm"
BACKUP_DIR="/backups/n8n"

# 1. Deactivate workflow immediately
curl -X POST \
  "https://n8n.zaplit.com/api/v1/workflows/$WORKFLOW_ID/deactivate" \
  -H "X-N8N-API-KEY: $N8N_API_KEY"

echo "⚠️  Workflow deactivated - form submissions will fail"

# 2. Find most recent backup
LATEST_BACKUP=$(ls -t $BACKUP_DIR/workflow-$WORKFLOW_ID-*.json | head -1)

# 3. Restore from backup
curl -X PUT \
  "https://n8n.zaplit.com/api/v1/workflows/$WORKFLOW_ID" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" \
  -H "Content-Type: application/json" \
  -d @$LATEST_BACKUP

echo "✅ Workflow restored from: $LATEST_BACKUP"

# 4. Manual verification required
echo "⚠️  VERIFY CREDENTIALS BEFORE ACTIVATING"
```

#### Gradual Rollback
```
Step 1: Disable form submission on website
Step 2: Wait for in-flight executions to complete
Step 3: Export current workflow state
Step 4: Import previous version
Step 5: Verify credentials
Step 6: Test with single submission
Step 7: Re-enable form
Step 8: Monitor for 30 minutes
```

### 4.3 Emergency Contact Plan

#### Escalation Matrix

| Level | Role | Contact | When to Escalate |
|-------|------|---------|------------------|
| L1 | On-call Engineer | Slack: #incidents | All production issues |
| L2 | Senior Engineer | Phone: +1-XXX-XXX-XXXX | > 15 min without resolution |
| L3 | Engineering Manager | Phone: +1-XXX-XXX-XXXX | > 30 min, customer impact |
| L4 | CTO | Phone: +1-XXX-XXX-XXXX | > 1 hour, major outage |

#### Communication Templates

**Slack - Initial Alert**
```
🚨 INCIDENT ALERT
Service: n8n Consultation Form Workflow
Severity: P1 (High)
Impact: Form submissions failing
Started: 2026-03-19 14:30 UTC
Engineer: @on-call
Status: Investigating

Thread: Link to incident channel
```

**Status Page Update**
```
[Investigating] Consultation Form Submission Issues

We are currently investigating issues with form submissions on zaplit.com. 
Users may experience errors when submitting the consultation form.

Next update: 30 minutes or upon resolution
```

### 4.4 Post-Incident Review Process

#### Post-Mortem Template
```markdown
# Post-Incident Review: [Incident Title]

## Summary
- **Date:** YYYY-MM-DD
- **Duration:** HH:MM
- **Severity:** P0/P1/P2
- **Impact:** X form submissions failed

## Timeline
- 14:30 - Issue detected via monitoring alert
- 14:35 - Engineer acknowledged
- 14:45 - Root cause identified
- 14:50 - Fix deployed
- 15:00 - Service restored

## Root Cause
[Detailed explanation]

## Resolution
[Steps taken to resolve]

## Action Items
| Action | Owner | Due Date |
|--------|-------|----------|
| [Item] | [Name] | [Date] |

## Lessons Learned
- What went well:
- What could be improved:
```

---

## 5. Maintenance Schedule

### 5.1 Credential Rotation

#### Twenty CRM API Key Rotation
| Frequency | Environment | Procedure |
|-----------|-------------|-----------|
| 90 days | Production | Automated reminder, manual rotation |
| 30 days | Staging | Automated reminder, manual rotation |
| On demand | Development | As needed |

**Rotation Procedure:**
```bash
# 1. Generate new API key in Twenty CRM
# Settings → APIs & Webhooks → Create New Key

# 2. Add new credential to n8n (don't delete old yet)
# Settings → Credentials → Create New

# 3. Update workflow to use new credential
# Test with single execution

# 4. Monitor for 24 hours

# 5. Delete old API key in Twenty CRM

# 6. Remove old credential from n8n
```

### 5.2 Workflow Version Updates

#### Version Control Strategy
```
workflow/
├── production/           # Active workflows
│   └── consultation-form-to-crm-v2.json
├── staging/              # Testing workflows
│   └── consultation-form-to-crm-v3-beta.json
└── archive/              # Previous versions
    └── consultation-form-to-crm-v1.json
```

#### Update Schedule
| Type | Frequency | Process |
|------|-----------|---------|
| Bug fixes | As needed | Hotfix → Test → Deploy |
| Feature updates | Monthly | Sprint cycle |
| Major refactoring | Quarterly | Architecture review |

### 5.3 Dependency Updates

#### n8n Version Updates
```bash
# Check current version
docker exec n8n n8n --version

# Update process:
# 1. Review changelog for breaking changes
# 2. Deploy to staging
# 3. Run full test suite
# 4. Deploy to production during maintenance window
# 5. Monitor for 2 hours

# Maintenance window: Sundays 2-4 AM UTC
```

#### Update Schedule
| Component | Check Frequency | Update Window |
|-----------|-----------------|---------------|
| n8n | Weekly | Monthly (Sundays 2-4 AM UTC) |
| Node.js | Monthly | Quarterly |
| PostgreSQL | Monthly | Quarterly |
| OS patches | Weekly | As needed |

### 5.4 Performance Reviews

#### Monthly Performance Review
| Metric | Review Action |
|--------|---------------|
| Response Time p95 | Optimize if > 5s |
| Error Rate | Investigate if > 0.5% |
| Concurrent Executions | Scale if > 80% capacity |
| Database Size | Archive old executions |
| API Rate Limits | Optimize if approaching limits |

#### Quarterly Architecture Review
- [ ] Review workflow architecture for optimization
- [ ] Analyze error patterns
- [ ] Evaluate new n8n features
- [ ] Security audit
- [ ] Cost optimization review

---

## 6. Documentation Requirements

### 6.1 Runbooks for Common Issues

#### Runbook: Form Submission Not Creating CRM Records
```markdown
# Form Submission Not Creating CRM Records

## Symptoms
- Form submits successfully (user sees success message)
- No records in Twenty CRM
- n8n execution shows error

## Diagnostic Steps
1. Check n8n Executions (Settings → Executions)
   - Filter by workflow name
   - Look for failed executions

2. Check specific execution details
   - Which node failed?
   - What error message?

3. Common causes:
   - Authentication failure (401)
   - Validation error (400)
   - CRM timeout (504)
   - Workflow deactivated

## Resolution
| Error | Resolution |
|-------|------------|
| 401 Unauthorized | Rotate API key |
| 400 Bad Request | Check form payload |
| 504 Timeout | Retry or increase timeout |
| Workflow inactive | Activate workflow |
```

#### Runbook: Duplicate Records in CRM
```markdown
# Duplicate Records in CRM

## Symptoms
- Multiple Person records for same email
- Multiple Company records for same name

## Diagnostic Steps
1. Check workflow logic
   - Is search-before-create implemented?
   - Are IDs being captured?

2. Check execution timing
   - Are rapid submissions creating race conditions?

## Resolution
1. Implement deduplication logic
2. Add unique constraints in CRM if possible
3. Clean up duplicates manually
```

### 6.2 On-Call Procedures

#### On-Call Checklist
```markdown
# On-Call Engineer Checklist

## Shift Start
- [ ] Acknowledge on-call in PagerDuty
- [ ] Verify access to n8n production
- [ ] Verify access to Twenty CRM
- [ ] Review open incidents from previous shift
- [ ] Check monitoring dashboards

## During Shift (Every 2 Hours)
- [ ] Check error rate dashboard
- [ ] Review failed executions
- [ ] Check system resource usage

## Shift End
- [ ] Document any incidents
- [ ] Hand off to next on-call
- [ ] Update incident log
```

### 6.3 Escalation Paths

```
┌─────────────────────────────────────────────────────────────┐
│                    ESCALATION FLOW                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Issue Detected                                             │
│       ↓                                                     │
│  L1: On-call Engineer                                       │
│       ↓ (Cannot resolve in 15 min)                          │
│  L2: Senior Engineer + Team Channel                         │
│       ↓ (Cannot resolve in 30 min)                          │
│  L3: Engineering Manager + War Room                         │
│       ↓ (Major customer impact > 1 hour)                    │
│  L4: CTO + Executive Notification                           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 6.4 Troubleshooting Guides

#### Troubleshooting Flowchart
```
Start
  ↓
Form submission fails?
  ├─ YES → Check n8n executions
  │          ↓
│        Execution found?
│          ├─ YES → Check error message
│          │          ↓
│          │        401/403?
│          │          ├─ YES → Fix credentials
│          │          ↓
│          │        500/504?
│          │          ├─ YES → Check CRM status
│          │          ↓
│          │        Timeout?
│          │          ├─ YES → Increase timeout
│          │          ↓
│          │        Other → Review workflow logic
│          ↓
│        NO → Check webhook URL
│               ↓
│             Workflow active?
│               ├─ NO → Activate workflow
│               ↓
│             Webhook path correct?
│               ├─ NO → Fix webhook path
│               ↓
│             DNS resolving?
│               ├─ NO → Check DNS/network
│
  └─ NO → Check CRM records
             ↓
           Records created?
             ├─ NO → Check data mapping
             ↓
           Records linked?
             ├─ NO → Check ID extraction
```

---

## 7. Quick Reference

### 7.1 Essential Commands

```bash
# Workflow Management
n8n export:workflow --id=<id> --output=workflow.json
n8n import:workflow --input=workflow.json
n8n update:workflow --id=<id> --active=true

# Execution Monitoring
n8n list:workflow
n8n execute:workflow --id=<id>

# Database
pg_dump -h $DB_HOST -U n8n n8n > backup.sql
psql -h $DB_HOST -U n8n n8n < backup.sql
```

### 7.2 Key URLs

| Environment | n8n | CRM | Monitoring |
|-------------|-----|-----|------------|
| Production | https://n8n.zaplit.com | https://crm.zaplit.com | https://grafana.zaplit.com |
| Staging | https://n8n-staging.zaplit.com | https://crm-staging.zaplit.com | https://grafana-staging.zaplit.com |

### 7.3 Emergency Contacts

| Role | Slack | Phone |
|------|-------|-------|
| On-call | #incidents | See PagerDuty |
| Engineering | #engineering | N/A |
| Escalation | @channel | Manager on-call |

### 7.4 Production Checklist Summary

```
PRE-DEPLOYMENT:
  ⬜ Security: Encryption key set, auth enabled, HTTPS
  ⬜ Credentials: Stored in n8n, named properly
  ⬜ Error Handling: Branches configured, retry logic
  ⬜ Backup: Current state exported
  ⬜ Performance: Timeouts set, parallel execution

DEPLOYMENT:
  ⬜ Staging tests passed
  ⬜ Production backup created
  ⬜ Workflow imported/updated
  ⬜ Credentials reconnected
  ⬜ Webhook configured
  ⬜ Single test submission successful
  ⬜ Workflow activated

POST-DEPLOYMENT:
  ⬜ Monitoring dashboard verified
  ⬜ Alerts tested
  ⬜ Logs flowing to aggregation
  ⬜ 30-minute monitoring period complete
  ⬜ Documentation updated
```

---

## Appendix A: n8n Environment Variables Reference

```bash
# Core
N8N_BASIC_AUTH_ACTIVE=true
N8N_BASIC_AUTH_USER=
N8N_BASIC_AUTH_PASSWORD=
N8N_ENCRYPTION_KEY=

# Database
DB_TYPE=postgres
DB_POSTGRESDB_HOST=
DB_POSTGRESDB_PORT=5432
DB_POSTGRESDB_DATABASE=n8n
DB_POSTGRESDB_USER=
DB_POSTGRESDB_PASSWORD=

# Execution
EXECUTIONS_DATA_PRUNE=true
EXECUTIONS_DATA_MAX_AGE=168
EXECUTIONS_DATA_SAVE_ON_ERROR=all
EXECUTIONS_DATA_SAVE_ON_SUCCESS=none

# Performance
N8N_CONCURRENCY_PRODUCTION_LIMIT=50
N8N_DEFAULT_TIMEOUT=30000
N8N_PAYLOAD_SIZE_MAX=16

# Security
N8N_HSTS_MAX_AGE=31536000
N8N_DIAGNOSTICS_ENABLED=false

# Logging
N8N_LOG_LEVEL=info
N8N_LOG_FILE=/var/log/n8n/n8n.log
```

---

## Appendix B: Workflow JSON Structure Reference

```json
{
  "name": "Consultation Form to CRM",
  "nodes": [
    {
      "type": "n8n-nodes-base.webhook",
      "name": "Consultation Webhook",
      "parameters": {
        "httpMethod": "POST",
        "path": "consultation",
        "responseMode": "responseNode"
      }
    },
    {
      "type": "n8n-nodes-base.code",
      "name": "Validate and Process",
      "parameters": {
        "jsCode": "// Validation and transformation logic"
      }
    },
    {
      "type": "n8n-nodes-base.httpRequest",
      "name": "Create Person",
      "parameters": {
        "method": "POST",
        "url": "https://crm.zaplit.com/rest/people"
      },
      "continueOnFail": false
    }
  ],
  "settings": {
    "errorWorkflow": "Error Handler",
    "saveManualExecutions": false
  }
}
```

---

**Document Owner:** DevOps Team  
**Last Updated:** March 19, 2026  
**Review Schedule:** Quarterly  
**Next Review:** June 19, 2026
