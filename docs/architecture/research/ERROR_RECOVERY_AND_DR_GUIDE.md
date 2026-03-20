# Error Recovery & Disaster Recovery Guide for n8n Workflows

**Project:** Zaplit - Consultation Form to Twenty CRM Integration  
**Version:** 1.0  
**Date:** March 19, 2026  
**Classification:** Critical Infrastructure Documentation

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Failure Recovery Patterns](#2-failure-recovery-patterns)
3. [Rollback Procedures](#3-rollback-procedures)
4. [Data Recovery](#4-data-recovery)
5. [Disaster Recovery](#5-disaster-recovery)
6. [Incident Response Integration](#6-incident-response-integration)
7. [Decision Trees](#7-decision-trees)
8. [Runbooks](#8-runbooks)
9. [Appendices](#9-appendices)

---

## 1. Executive Summary

This guide provides comprehensive error recovery and disaster recovery procedures for n8n workflows handling customer consultation form submissions to Twenty CRM. Given the critical nature of customer data and business continuity, this document establishes:

- **Recovery Time Objective (RTO):** 15 minutes for workflow failures, 1 hour for complete system failure
- **Recovery Point Objective (RPO):** Zero data loss for form submissions (all submissions captured in multiple systems)
- **Data Integrity Target:** 99.99% accuracy for CRM records

### Critical Workflow Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    DATA FLOW & FAILURE POINTS                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   Website Form → n8n Webhook → Process → Twenty CRM            │
│        │            │      │         │                          │
│        ▼            ▼      ▼         ▼                          │
│   ┌────────┐  ┌────────┐  │   ┌──────────────┐                 │
│   │ Fallback │  │ Queue  │  │   │ Dead Letter  │                 │
│   │ Storage │  │ Retry  │  │   │ Queue (DLQ)  │                 │
│   └────────┘  └────────┘  │   └──────────────┘                 │
│                           ▼                                     │
│                    ┌──────────────┐                            │
│                    │ Google Sheet │  ← Backup Storage           │
│                    │   (Backup)   │                            │
│                    └──────────────┘                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Failure Recovery Patterns

### 2.1 Retry Strategies

#### Exponential Backoff Implementation

```javascript
// Retry Logic Code Node - Insert before HTTP Request nodes
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

async function executeWithRetry(operation, context) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await operation();
    } catch (error) {
      const isRetryable = isRetryableError(error);
      
      if (!isRetryable || attempt === MAX_RETRIES) {
        throw error;
      }
      
      // Exponential backoff: 1s, 2s, 4s
      const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
      
      // Log retry attempt
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'warn',
        workflow: 'consultation-form-to-crm',
        node: context.nodeName,
        message: `Retry attempt ${attempt}/${MAX_RETRIES}`,
        delay_ms: delay,
        error: error.message
      }));
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

function isRetryableError(error) {
  const retryableCodes = [
    'ECONNRESET',      // Connection reset
    'ETIMEDOUT',       // Timeout
    'ECONNREFUSED',    // Connection refused (temporary)
    'ENOTFOUND',       // DNS failure (temporary)
    'EAI_AGAIN',       // Temporary DNS failure
    429,               // Rate limited
    502,               // Bad Gateway
    503,               // Service Unavailable
    504                // Gateway Timeout
  ];
  
  return retryableCodes.some(code => 
    error.message?.includes(code) || 
    error.code === code ||
    error.statusCode === code
  );
}

// Usage in workflow
return [{
  json: {
    retryConfig: {
      maxRetries: MAX_RETRIES,
      baseDelay: BASE_DELAY_MS,
      strategy: 'exponential_backoff'
    }
  }
}];
```

#### n8n Native Retry Configuration

```json
{
  "parameters": {
    "method": "POST",
    "url": "https://crm.zaplit.com/rest/people",
    "options": {
      "timeout": 30000
    }
  },
  "retryOnFail": true,
  "maxTries": 3,
  "waitBetweenTries": 2000,
  "continueOnFail": false
}
```

### 2.2 Circuit Breaker Pattern

```javascript
// Circuit Breaker Implementation
const CIRCUIT_STATE = {
  CLOSED: 'CLOSED',      // Normal operation
  OPEN: 'OPEN',          // Failing, reject fast
  HALF_OPEN: 'HALF_OPEN' // Testing if recovered
};

const CIRCUIT_CONFIG = {
  failureThreshold: 5,        // Open after 5 failures
  resetTimeoutMs: 60000,      // Try again after 60s
  halfOpenMaxCalls: 3         // Test with 3 calls when half-open
};

// Store circuit state (in production, use Redis/shared storage)
let circuitState = {
  state: CIRCUIT_STATE.CLOSED,
  failures: 0,
  lastFailureTime: null,
  successCount: 0
};

function checkCircuitBreaker() {
  const now = Date.now();
  
  switch (circuitState.state) {
    case CIRCUIT_STATE.OPEN:
      if (now - circuitState.lastFailureTime > CIRCUIT_CONFIG.resetTimeoutMs) {
        circuitState.state = CIRCUIT_STATE.HALF_OPEN;
        circuitState.successCount = 0;
        console.log('Circuit breaker: Transitioning to HALF_OPEN');
      } else {
        throw new Error('CIRCUIT_OPEN: Service temporarily unavailable');
      }
      break;
      
    case CIRCUIT_STATE.HALF_OPEN:
      if (circuitState.successCount >= CIRCUIT_CONFIG.halfOpenMaxCalls) {
        circuitState.state = CIRCUIT_STATE.CLOSED;
        circuitState.failures = 0;
        console.log('Circuit breaker: Transitioning to CLOSED');
      }
      break;
  }
  
  return circuitState.state;
}

function recordSuccess() {
  if (circuitState.state === CIRCUIT_STATE.HALF_OPEN) {
    circuitState.successCount++;
  } else {
    circuitState.failures = 0;
  }
}

function recordFailure() {
  circuitState.failures++;
  circuitState.lastFailureTime = Date.now();
  
  if (circuitState.failures >= CIRCUIT_CONFIG.failureThreshold) {
    circuitState.state = CIRCUIT_STATE.OPEN;
    console.error('Circuit breaker: Transitioning to OPEN');
    
    // Alert on-call engineer
    // sendAlert('Circuit breaker opened for CRM API');
  }
}

// Use in workflow before CRM calls
checkCircuitBreaker();
```

### 2.3 Dead Letter Queue (DLQ) for Failed Submissions

#### DLQ Workflow Architecture

```
Main Workflow → Failure Detected → DLQ Workflow → Storage → Alert
                     │
                     └→ Continue with Degraded Response
```

#### DLQ Workflow Implementation

```javascript
// Dead Letter Queue Handler Workflow
// Trigger: Error Trigger or explicit call from main workflow

const failedSubmission = $input.first().json;

// Enrich with metadata
const dlqEntry = {
  id: $execution.id,
  timestamp: new Date().toISOString(),
  originalPayload: failedSubmission.body || failedSubmission,
  errorDetails: {
    message: failedSubmission.error?.message || 'Unknown error',
    node: failedSubmission.error?.node || 'Unknown',
    stack: failedSubmission.error?.stack
  },
  retryAttempts: failedSubmission.retryCount || 0,
  status: 'PENDING_RETRY',
  priority: calculatePriority(failedSubmission)
};

function calculatePriority(submission) {
  // High priority for VIP customers or urgent requests
  if (submission.body?.data?.priority === 'urgent') return 'HIGH';
  if (submission.body?.data?.company?.includes('Enterprise')) return 'HIGH';
  return 'NORMAL';
}

// Store in multiple locations for redundancy

// 1. Google Sheets (immediate visibility)
const sheetData = {
  Timestamp: dlqEntry.timestamp,
  Execution_ID: dlqEntry.id,
  Email: failedSubmission.body?.data?.email || 'N/A',
  Company: failedSubmission.body?.data?.company || 'N/A',
  Error: dlqEntry.errorDetails.message.substring(0, 500),
  Status: dlqEntry.status,
  Priority: dlqEntry.priority,
  Retry_Count: dlqEntry.retryAttempts
};

// 2. PostgreSQL (structured storage)
const dbEntry = {
  table: 'failed_submissions',
  data: dlqEntry
};

// 3. Send alert
const alert = {
  severity: dlqEntry.priority === 'HIGH' ? 'critical' : 'warning',
  message: `Form submission failed - ${dlqEntry.errorDetails.message}`,
  executionId: dlqEntry.id,
  recoveryUrl: `https://n8n.zaplit.com/workflow/recovery?id=${dlqEntry.id}`
};

return [{
  json: {
    dlqEntry,
    sheetData,
    dbEntry,
    alert
  }
}];
```

#### DLQ Processing Workflow

```javascript
// DLQ Reprocessor - Run every 15 minutes

// 1. Query pending items from DLQ
const pendingItems = await fetchPendingDLQItems();

const results = {
  processed: 0,
  succeeded: 0,
  failed: 0,
  skipped: 0
};

for (const item of pendingItems) {
  // Skip items that haven't cooled down
  const ageMinutes = (Date.now() - new Date(item.timestamp)) / 60000;
  const cooldownMinutes = Math.pow(2, item.retryAttempts) * 5; // 5, 10, 20, 40...
  
  if (ageMinutes < cooldownMinutes) {
    results.skipped++;
    continue;
  }
  
  results.processed++;
  
  try {
    // Attempt to reprocess
    await reprocessSubmission(item);
    
    // Mark as resolved
    await updateDLQStatus(item.id, 'RESOLVED');
    results.succeeded++;
    
  } catch (error) {
    // Update retry count
    await incrementRetryCount(item.id);
    
    // Mark permanent failure after max retries
    if (item.retryAttempts >= 5) {
      await updateDLQStatus(item.id, 'PERMANENT_FAILURE');
      await notifyManualIntervention(item);
    }
    
    results.failed++;
  }
}

return [{ json: results }];
```

### 2.4 Manual Recovery Procedures

#### When to Use Manual Recovery

| Scenario | Automatic Recovery | Manual Intervention |
|----------|-------------------|---------------------|
| Transient network error | ✅ Yes | ❌ No |
| Rate limiting (429) | ✅ Yes (with backoff) | ❌ No |
| CRM temporarily down | ✅ Yes (retry) | ❌ No |
| Data validation error | ❌ No | ✅ Yes |
| Duplicate record conflict | ❌ No | ✅ Yes |
| Schema mismatch | ❌ No | ✅ Yes |
| Corrupted data | ❌ No | ✅ Yes |

#### Manual Recovery Process

```bash
#!/bin/bash
# manual-recovery.sh - Recover failed submissions

SUBMISSION_ID=$1
RECOVERY_MODE=${2:-"auto"}  # auto, dry-run, force

# 1. Fetch submission from DLQ
echo "Fetching submission $SUBMISSION_ID..."
submission=$(curl -s "https://n8n.zaplit.com/api/v1/dlq/$SUBMISSION_ID" \
  -H "X-N8N-API-KEY: $N8N_API_KEY")

# 2. Validate payload
echo "Validating payload..."
if ! echo "$submission" | jq -e '.body.data.email' > /dev/null; then
  echo "❌ Invalid payload - missing email"
  exit 1
fi

# 3. Check for duplicates in CRM
echo "Checking CRM for existing record..."
email=$(echo "$submission" | jq -r '.body.data.email')
existing=$(curl -s "https://crm.zaplit.com/rest/people?filter=email:${email}" \
  -H "Authorization: Bearer $CRM_TOKEN")

if [ "$existing" != "[]" ] && [ "$RECOVERY_MODE" != "force" ]; then
  echo "⚠️  Record already exists in CRM"
  echo "Use 'force' mode to update or review manually"
  exit 1
fi

# 4. Dry run or execute
if [ "$RECOVERY_MODE" == "dry-run" ]; then
  echo "🔍 Dry run - would process:"
  echo "$submission" | jq '.'
  exit 0
fi

# 5. Trigger recovery workflow
echo "Triggering recovery workflow..."
curl -X POST "https://n8n.zaplit.com/webhook/recover-submission" \
  -H "Content-Type: application/json" \
  -d "$submission"

echo "✅ Recovery initiated"
```

### 2.5 Automatic vs Manual Intervention Decision Matrix

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    INTERVENTION DECISION TREE                           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Error Detected                                                         │
│       │                                                                 │
│       ▼                                                                 │
│  Is it a transient error? ──YES──▶ Apply exponential backoff retry     │
│       │ NO                                                              │
│       ▼                                                                 │
│  Is it a data validation error? ──YES──▶ Route to DLQ + Alert          │
│       │ NO                                                              │
│       ▼                                                                 │
│  Is CRM available? ──NO──▶ Queue for later retry + Status page update  │
│       │ YES                                                             │
│       ▼                                                                 │
│  Is authentication failing? ──YES──▶ Alert on-call immediately         │
│       │ NO                                                              │
│       ▼                                                                 │
│  Record in DLQ + Attempt automatic recovery + Monitor                  │
│       │                                                                 │
│       ▼                                                                 │
│  After 3 auto-retries: Escalate to manual intervention                 │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Rollback Procedures

### 3.1 Workflow Version Management

#### Version Control Strategy

```
n8n-workflows/
├── production/
│   ├── active/
│   │   └── consultation-form-to-crm.json        (Current)
│   ├── archive/
│   │   ├── consultation-form-to-crm-v1.0.json   (2026-01-15)
│   │   ├── consultation-form-to-crm-v1.1.json   (2026-02-01)
│   │   └── consultation-form-to-crm-v1.2.json   (2026-03-01)
│   └── rollback/
│       └── consultation-form-to-crm-rollback-target.json
├── staging/
│   └── consultation-form-to-crm-v2.0-beta.json
└── templates/
    └── consultation-form-to-crm-template.json
```

#### Version Metadata Schema

```json
{
  "name": "Consultation Form to CRM",
  "version": "1.2.3",
  "versionInfo": {
    "major": 1,
    "minor": 2,
    "patch": 3,
    "createdAt": "2026-03-19T10:00:00Z",
    "createdBy": "devops@zaplit.com",
    "changeDescription": "Added circuit breaker pattern for CRM API",
    "rollbackTarget": "1.2.2",
    "deploymentId": "deploy-20260319-001"
  },
  "deployment": {
    "environment": "production",
    "deployedAt": "2026-03-19T14:30:00Z",
    "deployedBy": "jenkins@zaplit.com",
    "verifiedAt": "2026-03-19T14:35:00Z"
  }
}
```

### 3.2 Emergency Rollback Procedure (< 5 minutes)

```bash
#!/bin/bash
# emergency-rollback.sh - Execute in case of critical failure

set -e

WORKFLOW_NAME="consultation-form-to-crm"
ENVIRONMENT="production"
N8N_URL="https://n8n.zaplit.com"
ROLLBACK_VERSION=${1:-""}  # Optional: specific version to rollback to

echo "🚨 EMERGENCY ROLLBACK INITIATED"
echo "================================"
echo "Time: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo "Workflow: $WORKFLOW_NAME"
echo ""

# Step 1: Immediate Deactivation (T+0s)
echo "[T+0s] Step 1/6: Deactivating workflow..."
current_workflow_id=$(curl -s "$N8N_URL/api/v1/workflows" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" | \
  jq -r ".data[] | select(.name == \"$WORKFLOW_NAME\") | .id")

if [ -z "$current_workflow_id" ]; then
  echo "❌ Workflow not found!"
  exit 1
fi

curl -s -X POST "$N8N_URL/api/v1/workflows/$current_workflow_id/deactivate" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" > /dev/null

echo "✅ Workflow deactivated (ID: $current_workflow_id)"
echo "⚠️  Form submissions will now FAIL - inform users"
echo ""

# Step 2: Identify Rollback Target (T+10s)
echo "[T+10s] Step 2/6: Identifying rollback target..."

if [ -n "$ROLLBACK_VERSION" ]; then
  rollback_file="/backups/n8n/${WORKFLOW_NAME}-v${ROLLBACK_VERSION}.json"
else
  # Find most recent stable version
  rollback_file=$(ls -t /backups/n8n/${WORKFLOW_NAME}-v*.json | head -2 | tail -1)
fi

if [ ! -f "$rollback_file" ]; then
  echo "❌ Rollback file not found: $rollback_file"
  echo "Available backups:"
  ls -la /backups/n8n/${WORKFLOW_NAME}-v*.json | head -10
  exit 1
fi

echo "✅ Rollback target: $(basename $rollback_file)"
echo ""

# Step 3: Export Current State (T+20s)
echo "[T+20s] Step 3/6: Exporting current state for forensics..."
forensics_file="/backups/n8n/forensics/${WORKFLOW_NAME}-$(date +%Y%m%d-%H%M%S).json"
curl -s "$N8N_URL/api/v1/workflows/$current_workflow_id" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" > "$forensics_file"
echo "✅ Current state saved to: $forensics_file"
echo ""

# Step 4: Import Previous Version (T+30s)
echo "[T+30s] Step 4/6: Importing rollback version..."

# Prepare rollback file (update ID to match current)
jq --arg id "$current_workflow_id" '.id = $id' "$rollback_file" > /tmp/rollback-prepared.json

curl -s -X PUT "$N8N_URL/api/v1/workflows/$current_workflow_id" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" \
  -H "Content-Type: application/json" \
  -d @/tmp/rollback-prepared.json > /dev/null

echo "✅ Rollback version imported"
echo ""

# Step 5: Verification (T+45s)
echo "[T+45s] Step 5/6: Verifying rollback..."

# Check workflow exists and is valid
workflow_check=$(curl -s "$N8N_URL/api/v1/workflows/$current_workflow_id" \
  -H "X-N8N-API-KEY: $N8N_API_KEY")

if [ -z "$workflow_check" ]; then
  echo "❌ Workflow verification failed!"
  exit 1
fi

echo "✅ Workflow structure verified"
echo ""

# Step 6: Reactivation with Monitoring (T+60s)
echo "[T+60s] Step 6/6: Reactivating with monitoring..."

# Activate workflow
curl -s -X POST "$N8N_URL/api/v1/workflows/$current_workflow_id/activate" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" > /dev/null

echo "✅ Workflow reactivated"
echo ""

# Trigger test execution
echo "Running smoke test..."
test_result=$(curl -s -X POST "$N8N_URL/webhook/consultation" \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "name": "Rollback Test",
      "email": "rollback-test@zaplit.com",
      "company": "Test Corp",
      "message": "Rollback verification test"
    }
  }' \
  -w "%{http_code}" \
  -o /dev/null)

if [ "$test_result" == "200" ]; then
  echo "✅ Smoke test passed (HTTP 200)"
else
  echo "⚠️  Smoke test returned HTTP $test_result - investigate immediately"
fi

echo ""
echo "================================"
echo "🔄 ROLLBACK COMPLETE"
echo "Duration: ~60 seconds"
echo "Current Version: $(echo $rollback_file | grep -o 'v[0-9]\+\.[0-9]\+\.[0-9]\+' || echo 'unknown')"
echo ""
echo "⚠️  POST-ROLLBACK ACTIONS REQUIRED:"
echo "   1. Monitor for 30 minutes"
echo "   2. Verify CRM records are being created"
echo "   3. Check error rates in dashboard"
echo "   4. Update incident ticket"
echo "   5. Schedule post-mortem"
echo ""
```

### 3.3 Gradual Rollback (Zero-Downtime)

```bash
#!/bin/bash
# gradual-rollback.sh - Zero-downtime rollback using blue-green pattern

WORKFLOW_NAME="consultation-form-to-crm"
N8N_URL="https://n8n.zaplit.com"

# Phase 1: Drain In-Flight Executions (T+0 to T+5min)
echo "Phase 1/5: Draining in-flight executions..."

# Disable form on website
curl -X POST "https://zaplit.com/api/maintenance-mode" \
  -H "Authorization: Bearer $WEBSITE_API_TOKEN" \
  -d '{"formEnabled": false, "message": "Form temporarily unavailable. Please try again in a few minutes."}'

echo "✅ Form disabled on website"

# Wait for in-flight executions
wait_for_executions() {
  local max_wait=300  # 5 minutes
  local waited=0
  
  while [ $waited -lt $max_wait ]; do
    running=$(curl -s "$N8N_URL/api/v1/executions?filter={\"workflowName\":\"$WORKFLOW_NAME\",\"status\":\"running\"}" \
      -H "X-N8N-API-KEY: $N8N_API_KEY" | jq '.count')
    
    if [ "$running" == "0" ]; then
      echo "✅ All executions completed"
      return 0
    fi
    
    echo "  Waiting... $running executions still running"
    sleep 10
    waited=$((waited + 10))
  done
  
  echo "⚠️  Timeout waiting for executions - proceeding with caution"
  return 1
}

wait_for_executions

# Phase 2: Export Current State
echo ""
echo "Phase 2/5: Exporting current state..."
current_backup="/backups/n8n/pre-rollback-$(date +%Y%m%d-%H%M%S).json"
workflow_id=$(curl -s "$N8N_URL/api/v1/workflows" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" | \
  jq -r ".data[] | select(.name == \"$WORKFLOW_NAME\") | .id")

curl -s "$N8N_URL/api/v1/workflows/$workflow_id" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" > "$current_backup"
echo "✅ Current state exported: $current_backup"

# Phase 3: Deploy Previous Version
echo ""
echo "Phase 3/5: Deploying previous version..."
# (Same as emergency rollback steps 4-5)

# Phase 4: Test Before Re-enabling
echo ""
echo "Phase 4/5: Testing rollback version..."

# Run comprehensive test suite
./run-e2e-tests.sh --target=production --workflow=$WORKFLOW_NAME

if [ $? -eq 0 ]; then
  echo "✅ Test suite passed"
else
  echo "❌ Tests failed - aborting rollback"
  # Restore from current_backup
  exit 1
fi

# Phase 5: Re-enable Form
echo ""
echo "Phase 5/5: Re-enabling form..."
curl -X POST "https://zaplit.com/api/maintenance-mode" \
  -H "Authorization: Bearer $WEBSITE_API_TOKEN" \
  -d '{"formEnabled": true}'

echo "✅ Form re-enabled"
echo ""
echo "🔄 Gradual rollback complete"
echo "Monitor for 30 minutes before declaring success"
```

### 3.4 Blue-Green Deployment for Workflows

```javascript
// Feature Flag Pattern for Gradual Rollout
// Add at beginning of workflow

const DEPLOYMENT_CONFIG = {
  // Control traffic split
  newWorkflowPercentage: 10,  // Start with 10%
  
  // Enable for specific test users
  testUsers: ['test@zaplit.com', 'dev@zaplit.com'],
  
  // Enable for specific domains
  testDomains: ['zaplit.com'],
  
  // Emergency kill switch
  newWorkflowEnabled: $env.FEATURE_NEW_WORKFLOW_ENABLED === 'true'
};

function shouldUseNewWorkflow(input) {
  // Kill switch check
  if (!DEPLOYMENT_CONFIG.newWorkflowEnabled) {
    return false;
  }
  
  const email = input.body?.data?.email || '';
  const domain = email.split('@')[1] || '';
  
  // Test users always get new workflow
  if (DEPLOYMENT_CONFIG.testUsers.includes(email)) {
    console.log('Routing to NEW workflow (test user)');
    return true;
  }
  
  // Test domains always get new workflow
  if (DEPLOYMENT_CONFIG.testDomains.includes(domain)) {
    console.log('Routing to NEW workflow (test domain)');
    return true;
  }
  
  // Percentage-based routing
  // Use email hash for consistent routing
  const hash = email.split('').reduce((a, b) => {
    a = ((a << 5) - a) + b.charCodeAt(0);
    return a & a;
  }, 0);
  
  const bucket = Math.abs(hash) % 100;
  const useNew = bucket < DEPLOYMENT_CONFIG.newWorkflowPercentage;
  
  console.log(`Routing to ${useNew ? 'NEW' : 'OLD'} workflow (${bucket}/100)`);
  return useNew;
}

const useNewFlow = shouldUseNewWorkflow($input.first().json);

return [{
  json: {
    ...$input.first().json,
    workflowVersion: useNewFlow ? 'v2' : 'v1',
    useNewFlow: useNewFlow
  }
}];
```

### 3.5 Data Consistency During Rollback

```javascript
// Data Consistency Validation Node
// Run before and after rollback

async function validateDataConsistency() {
  const checks = {
    timestamp: new Date().toISOString(),
    passed: true,
    issues: []
  };
  
  // Check 1: Verify webhook is receiving
  const webhookHealth = await checkWebhookHealth();
  if (!webhookHealth.ok) {
    checks.passed = false;
    checks.issues.push(`Webhook health check failed: ${webhookHealth.error}`);
  }
  
  // Check 2: Verify CRM connectivity
  const crmHealth = await checkCRMHealth();
  if (!crmHealth.ok) {
    checks.passed = false;
    checks.issues.push(`CRM health check failed: ${crmHealth.error}`);
  }
  
  // Check 3: Verify recent submissions were processed
  const submissionLag = await checkSubmissionLag();
  if (submissionLag.minutes > 5) {
    checks.issues.push(`High submission lag: ${submissionLag.minutes} minutes`);
  }
  
  // Check 4: Verify no duplicate records created
  const duplicates = await checkDuplicateRecords();
  if (duplicates.count > 0) {
    checks.issues.push(`${duplicates.count} potential duplicate records detected`);
  }
  
  // Check 5: Verify data integrity
  const integrity = await verifyDataIntegrity();
  if (!integrity.ok) {
    checks.passed = false;
    checks.issues.push(`Data integrity check failed: ${integrity.details}`);
  }
  
  return checks;
}

async function checkWebhookHealth() {
  try {
    const response = await $http.request({
      method: 'GET',
      url: 'https://n8n.zaplit.com/webhook/consultation',
      // Expect 405 (Method Not Allowed) for GET - means endpoint exists
    });
    return { ok: false, error: 'Unexpected success' };
  } catch (error) {
    if (error.statusCode === 405) {
      return { ok: true };
    }
    return { ok: false, error: error.message };
  }
}

async function checkCRMHealth() {
  try {
    const response = await $http.request({
      method: 'GET',
      url: 'https://crm.zaplit.com/rest/companies?page=1&limit=1',
      headers: {
        'Authorization': 'Bearer {{$credentials.twentyCrmApiKey}}'
      }
    });
    return { ok: response.statusCode === 200 };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

// Execute validation
const consistencyCheck = await validateDataConsistency();

if (!consistencyCheck.passed) {
  // Alert and prevent rollback if critical
  await sendAlert({
    severity: 'critical',
    message: 'Data consistency check failed during rollback',
    details: consistencyCheck
  });
}

return [{ json: consistencyCheck }];
```

---

## 4. Data Recovery

### 4.1 CRM Record Corruption Recovery

#### Detection

```javascript
// Data Corruption Detection Workflow (runs hourly)

const CORRUPTION_CHECKS = {
  missingRequiredFields: ['email', 'name'],
  invalidEmailPattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  maxFieldLength: {
    name: 200,
    email: 254,
    company: 200
  }
};

async function detectCorruption() {
  const issues = [];
  const timeWindow = new Date(Date.now() - 3600000).toISOString(); // Last hour
  
  // Query recent records from CRM
  const recentRecords = await fetchRecentCRMRecords(timeWindow);
  
  for (const record of recentRecords) {
    const recordIssues = [];
    
    // Check 1: Missing required fields
    for (const field of CORRUPTION_CHECKS.missingRequiredFields) {
      if (!record[field]) {
        recordIssues.push(`Missing required field: ${field}`);
      }
    }
    
    // Check 2: Invalid email format
    if (record.email && !CORRUPTION_CHECKS.invalidEmailPattern.test(record.email)) {
      recordIssues.push(`Invalid email format: ${record.email}`);
    }
    
    // Check 3: Field length violations
    for (const [field, maxLength] of Object.entries(CORRUPTION_CHECKS.maxFieldLength)) {
      if (record[field] && record[field].length > maxLength) {
        recordIssues.push(`Field ${field} exceeds max length (${record[field].length}/${maxLength})`);
      }
    }
    
    // Check 4: Orphaned records (person without company link)
    if (record.type === 'person' && !record.companyId) {
      recordIssues.push('Orphaned person record - no company link');
    }
    
    if (recordIssues.length > 0) {
      issues.push({
        recordId: record.id,
        type: record.type,
        createdAt: record.createdAt,
        issues: recordIssues
      });
    }
  }
  
  return {
    scanTime: new Date().toISOString(),
    recordsScanned: recentRecords.length,
    issuesFound: issues.length,
    issues: issues
  };
}

const corruptionReport = await detectCorruption();

// Alert if issues found
if (corruptionReport.issuesFound > 0) {
  await sendAlert({
    severity: corruptionReport.issuesFound > 10 ? 'critical' : 'warning',
    message: `Data corruption detected: ${corruptionReport.issuesFound} issues`,
    report: corruptionReport
  });
}

return [{ json: corruptionReport }];
```

#### Recovery Procedures

```bash
#!/bin/bash
# recover-corrupted-records.sh

RECOVERY_MODE=${1:-"report"}  # report, dry-run, execute
ISSUE_THRESHOLD=${2:-10}

echo "CRM Record Corruption Recovery"
echo "=============================="
echo "Mode: $RECOVERY_MODE"
echo ""

# Fetch corruption report
report=$(curl -s "https://n8n.zaplit.com/api/v1/data-integrity/report" \
  -H "X-N8N-API-KEY: $N8N_API_KEY")

issue_count=$(echo "$report" | jq '.issuesFound')

echo "Issues found: $issue_count"

if [ "$issue_count" -eq 0 ]; then
  echo "✅ No corruption detected"
  exit 0
fi

if [ "$issue_count" -gt "$ISSUE_THRESHOLD" ]; then
  echo "⚠️  High issue count ($issue_count) - manual review recommended"
  echo "Set threshold with: $0 $RECOVERY_MODE <higher_threshold>"
  exit 1
fi

# Process each issue
echo "$report" | jq -c '.issues[]' | while read issue; do
  record_id=$(echo "$issue" | jq -r '.recordId')
  issues=$(echo "$issue" | jq -r '.issues[]')
  
  echo ""
  echo "Record: $record_id"
  echo "Issues:"
  echo "$issues" | sed 's/^/  - /'
  
  if [ "$RECOVERY_MODE" == "execute" ]; then
    # Attempt recovery based on issue type
    for specific_issue in $(echo "$issue" | jq -r '.issues[]'); do
      if echo "$specific_issue" | grep -q "Missing required field: email"; then
        # Flag for manual review - can't auto-recover missing email
        echo "  → Flagged for manual review (missing email)"
        flagForManualReview "$record_id" "$specific_issue"
      fi
      
      if echo "$specific_issue" | grep -q "Invalid email format"; then
        # Attempt to fix common email typos
        echo "  → Attempting email correction"
        fixEmail "$record_id"
      fi
      
      if echo "$specific_issue" | grep -q "Orphaned person record"; then
        # Create placeholder company
        echo "  → Creating placeholder company"
        createPlaceholderCompany "$record_id"
      fi
    done
  fi
done

echo ""
echo "=============================="
echo "Recovery ${RECOVERY_MODE} complete"
```

### 4.2 Lost Submission Recovery

#### Submission Reconstruction

```javascript
// Lost Submission Recovery Workflow

const RECOVERY_SOURCES = [
  { name: 'Google Sheets Backup', priority: 1 },
  { name: 'DLQ Database', priority: 2 },
  { name: 'n8n Execution Logs', priority: 3 },
  { name: 'Webhook Access Logs', priority: 4 }
];

async function recoverLostSubmissions(timeRange) {
  const recovered = [];
  const failed = [];
  
  for (const source of RECOVERY_SOURCES) {
    console.log(`Checking ${source.name}...`);
    
    try {
      const submissions = await fetchFromSource(source.name, timeRange);
      
      for (const submission of submissions) {
        // Check if already processed in CRM
        const exists = await checkCRMForDuplicate(submission.email, submission.timestamp);
        
        if (!exists) {
          // Attempt to reprocess
          try {
            await reprocessSubmission(submission);
            recovered.push({
              source: source.name,
              email: submission.email,
              timestamp: submission.timestamp,
              status: 'RECOVERED'
            });
          } catch (error) {
            failed.push({
              source: source.name,
              email: submission.email,
              timestamp: submission.timestamp,
              error: error.message,
              status: 'FAILED'
            });
          }
        }
      }
    } catch (error) {
      console.error(`Failed to query ${source.name}: ${error.message}`);
    }
  }
  
  return {
    recoveryTime: new Date().toISOString(),
    timeRange: timeRange,
    recovered: recovered,
    failed: failed,
    summary: {
      totalFound: recovered.length + failed.length,
      successfullyRecovered: recovered.length,
      failedToRecover: failed.length
    }
  };
}

async function fetchFromSource(sourceName, timeRange) {
  switch (sourceName) {
    case 'Google Sheets Backup':
      // Query Google Sheets for submissions in time range
      return await queryGoogleSheets(timeRange);
      
    case 'DLQ Database':
      // Query DLQ for failed submissions
      return await queryDLQ(timeRange);
      
    case 'n8n Execution Logs':
      // Query n8n API for execution data
      return await queryExecutionLogs(timeRange);
      
    case 'Webhook Access Logs':
      // Parse access logs for POST requests to /webhook/consultation
      return await parseAccessLogs(timeRange);
      
    default:
      return [];
  }
}

// Execute recovery for last 24 hours
const timeRange = {
  start: new Date(Date.now() - 86400000).toISOString(),
  end: new Date().toISOString()
};

const recoveryResult = await recoverLostSubmissions(timeRange);

// Alert on results
if (recoveryResult.summary.totalFound > 0) {
  await sendAlert({
    severity: recoveryResult.summary.failedToRecover > 0 ? 'warning' : 'info',
    message: `Submission recovery complete: ${recoveryResult.summary.successfullyRecovered}/${recoveryResult.summary.totalFound} recovered`,
    details: recoveryResult
  });
}

return [{ json: recoveryResult }];
```

### 4.3 Webhook Replay

```bash
#!/bin/bash
# replay-webhook.sh - Replay failed or lost webhooks

WEBHOOK_URL="https://n8n.zaplit.com/webhook/consultation"
SOURCE=${1:-"dlq"}  # dlq, logs, file
TIME_RANGE=${2:-"1h"}

echo "Webhook Replay Tool"
echo "==================="
echo "Source: $SOURCE"
echo "Time Range: $TIME_RANGE"
echo ""

# Fetch payloads to replay
case $SOURCE in
  dlq)
    payloads=$(curl -s "https://n8n.zaplit.com/api/v1/dlq?status=PENDING_RETRY&since=-${TIME_RANGE}" \
      -H "X-N8N-API-KEY: $N8N_API_KEY" | jq -c '.items[]')
    ;;
  logs)
    payloads=$(parse_n8n_logs "$TIME_RANGE" | jq -c '.[]')
    ;;
  file)
    payloads=$(cat "$3" | jq -c '.[]')
    ;;
esac

total=$(echo "$payloads" | wc -l)
echo "Found $total payloads to replay"
echo ""

# Replay each payload
success=0
failed=0

echo "$payloads" | while read payload; do
  email=$(echo "$payload" | jq -r '.body.data.email // "unknown"')
  
  echo -n "Replaying $email... "
  
  response=$(curl -s -w "\n%{http_code}" -X POST "$WEBHOOK_URL" \
    -H "Content-Type: application/json" \
    -d "$payload")
  
  http_code=$(echo "$response" | tail -1)
  
  if [ "$http_code" == "200" ]; then
    echo "✅ Success"
    ((success++))
  else
    echo "❌ Failed (HTTP $http_code)"
    ((failed++))
  fi
done

echo ""
echo "==================="
echo "Replay complete"
echo "Success: $success"
echo "Failed: $failed"
```

### 4.4 Data Reconciliation Procedures

```javascript
// Data Reconciliation Workflow - Daily reconciliation job

async function reconcileData() {
  const reconciliationId = `recon-${Date.now()}`;
  const startTime = new Date();
  
  console.log(`Starting reconciliation: ${reconciliationId}`);
  
  // Define data sources
  const sources = {
    googleSheets: await fetchGoogleSheetsSubmissions(last24Hours()),
    n8nExecutions: await fetchSuccessfulExecutions(last24Hours()),
    crmRecords: await fetchCRMRecords(last24Hours()),
    dlqPending: await fetchDLQPending(last24Hours())
  };
  
  const discrepancies = {
    inSheetsNotInCRM: [],
    inCRMNotInSheets: [],
    inExecutionsNotInCRM: [],
    duplicateInCRM: [],
    pendingInDLQ: []
  };
  
  // Build lookup maps
  const sheetsEmails = new Set(sources.googleSheets.map(s => s.email));
  const crmEmails = new Map(sources.crmRecords.map(r => [r.email, r]));
  const executionEmails = new Set(sources.n8nExecutions.map(e => e.email));
  
  // Check 1: Submissions in Sheets but not in CRM
  for (const submission of sources.googleSheets) {
    if (!crmEmails.has(submission.email)) {
      discrepancies.inSheetsNotInCRM.push(submission);
    }
  }
  
  // Check 2: Records in CRM but not in Sheets (manual entries)
  for (const [email, record] of crmEmails) {
    if (!sheetsEmails.has(email)) {
      discrepancies.inCRMNotInSheets.push(record);
    }
  }
  
  // Check 3: Successful executions but no CRM record
  for (const execution of sources.n8nExecutions) {
    if (!crmEmails.has(execution.email)) {
      discrepancies.inExecutionsNotInCRM.push(execution);
    }
  }
  
  // Check 4: Duplicate records in CRM
  const emailCounts = {};
  for (const record of sources.crmRecords) {
    emailCounts[record.email] = (emailCounts[record.email] || 0) + 1;
  }
  for (const [email, count] of Object.entries(emailCounts)) {
    if (count > 1) {
      discrepancies.duplicateInCRM.push({ email, count });
    }
  }
  
  // Check 5: Long-pending DLQ items
  for (const item of sources.dlqPending) {
    const age = Date.now() - new Date(item.timestamp).getTime();
    if (age > 3600000) { // Older than 1 hour
      discrepancies.pendingInDLQ.push(item);
    }
  }
  
  const report = {
    reconciliationId,
    startTime: startTime.toISOString(),
    endTime: new Date().toISOString(),
    sources: {
      googleSheets: sources.googleSheets.length,
      n8nExecutions: sources.n8nExecutions.length,
      crmRecords: sources.crmRecords.length,
      dlqPending: sources.dlqPending.length
    },
    discrepancies: {
      total: Object.values(discrepancies).flat().length,
      details: discrepancies
    },
    recommendations: generateRecommendations(discrepancies)
  };
  
  // Store report
  await storeReconciliationReport(report);
  
  // Alert if discrepancies found
  if (report.discrepancies.total > 0) {
    await sendAlert({
      severity: report.discrepancies.total > 10 ? 'critical' : 'warning',
      message: `Data reconciliation found ${report.discrepancies.total} discrepancies`,
      reconciliationId,
      summary: {
        inSheetsNotInCRM: discrepancies.inSheetsNotInCRM.length,
        inExecutionsNotInCRM: discrepancies.inExecutionsNotInCRM.length,
        duplicates: discrepancies.duplicateInCRM.length,
        dlqPending: discrepancies.pendingInDLQ.length
      }
    });
  }
  
  return report;
}

function generateRecommendations(discrepancies) {
  const recommendations = [];
  
  if (discrepancies.inSheetsNotInCRM.length > 0) {
    recommendations.push({
      priority: 'HIGH',
      action: 'Recover missing CRM records',
      count: discrepancies.inSheetsNotInCRM.length,
      workflow: 'recover-lost-submissions'
    });
  }
  
  if (discrepancies.duplicateInCRM.length > 0) {
    recommendations.push({
      priority: 'MEDIUM',
      action: 'Merge duplicate CRM records',
      count: discrepancies.duplicateInCRM.length,
      workflow: 'merge-duplicates'
    });
  }
  
  if (discrepancies.pendingInDLQ.length > 0) {
    recommendations.push({
      priority: 'HIGH',
      action: 'Process or clear DLQ items',
      count: discrepancies.pendingInDLQ.length,
      workflow: 'process-dlq'
    });
  }
  
  return recommendations;
}

const report = await reconcileData();
return [{ json: report }];
```

---

## 5. Disaster Recovery

### 5.1 n8n Instance Failure Scenarios

#### Scenario Matrix

| Scenario | Impact | RTO | Recovery Strategy |
|----------|--------|-----|-------------------|
| Single node failure | Degraded performance | 5 min | Auto-failover to standby |
| Database corruption | Data loss risk | 30 min | Restore from backup + replay |
| Complete n8n loss | Total outage | 1 hour | Rebuild from infrastructure as code |
| Network partition | Isolation | 15 min | DNS failover + queue draining |
| Configuration loss | Functional issues | 30 min | GitOps restore |

#### n8n Instance Recovery

```bash
#!/bin/bash
# n8n-disaster-recovery.sh - Full n8n instance recovery

RECOVERY_TYPE=${1:-"standard"}  # standard, database-corruption, complete-loss
BACKUP_DATE=${2:-"latest"}

echo "n8n Disaster Recovery"
echo "====================="
echo "Type: $RECOVERY_TYPE"
echo "Backup: $BACKUP_DATE"
echo "Started: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo ""

# Phase 1: Infrastructure Recovery
echo "Phase 1/5: Infrastructure Recovery"

if [ "$RECOVERY_TYPE" == "complete-loss" ]; then
  echo "Rebuilding infrastructure from Terraform..."
  cd /infrastructure/terraform
  terraform apply -auto-approve -var="environment=production"
  
  echo "Waiting for instances to be ready..."
  sleep 60
fi

# Verify n8n hosts are reachable
for host in n8n-primary.zaplit.com n8n-standby.zaplit.com; do
  until ping -c1 $host > /dev/null 2>&1; do
    echo "Waiting for $host..."
    sleep 5
  done
  echo "✅ $host is reachable"
done

# Phase 2: Database Recovery
echo ""
echo "Phase 2/5: Database Recovery"

if [ "$RECOVERY_TYPE" == "database-corruption" ] || [ "$RECOVERY_TYPE" == "complete-loss" ]; then
  if [ "$BACKUP_DATE" == "latest" ]; then
    backup_file=$(ls -t /backups/n8n/database/*.sql | head -1)
  else
    backup_file="/backups/n8n/database/n8n-${BACKUP_DATE}.sql"
  fi
  
  echo "Restoring from: $backup_file"
  
  # Stop n8n to prevent writes
  docker-compose -f /opt/n8n/docker-compose.yml stop n8n
  
  # Restore database
  docker exec -i n8n-db psql -U n8n -d n8n < "$backup_file"
  
  if [ $? -eq 0 ]; then
    echo "✅ Database restored"
  else
    echo "❌ Database restore failed"
    exit 1
  fi
fi

# Phase 3: Configuration Recovery
echo ""
echo "Phase 3/5: Configuration Recovery"

# Restore environment variables
if [ -f /backups/n8n/config/.env.production ]; then
  cp /backups/n8n/config/.env.production /opt/n8n/.env
  echo "✅ Environment restored"
fi

# Restore credentials (manual step - requires decryption)
echo "⚠️  Credentials must be restored manually from encrypted backup"
echo "   Location: /backups/n8n/credentials/ (encrypted)"

# Phase 4: Workflow Recovery
echo ""
echo "Phase 4/5: Workflow Recovery"

# Import workflows from Git
if [ -d /backups/n8n/workflows ]; then
  for workflow in /backups/n8n/workflows/production/*.json; do
    echo "Importing: $(basename $workflow)"
    curl -s -X POST "https://n8n.zaplit.com/api/v1/workflows" \
      -H "X-N8N-API-KEY: $N8N_API_KEY" \
      -H "Content-Type: application/json" \
      -d @$workflow > /dev/null
  done
  echo "✅ Workflows imported"
fi

# Phase 5: Verification & Activation
echo ""
echo "Phase 5/5: Verification & Activation"

# Start n8n
docker-compose -f /opt/n8n/docker-compose.yml up -d

# Wait for health check
echo "Waiting for n8n health check..."
until curl -sf https://n8n.zaplit.com/healthz > /dev/null; do
  echo "  Still waiting..."
  sleep 10
done

echo "✅ n8n is healthy"

# Activate critical workflows
curl -X POST "https://n8n.zaplit.com/api/v1/workflows/consultation-form-to-crm/activate" \
  -H "X-N8N-API-KEY: $N8N_API_KEY"

echo "✅ Critical workflows activated"

# Run smoke test
echo ""
echo "Running smoke test..."
./run-smoke-test.sh

if [ $? -eq 0 ]; then
  echo "✅ Smoke test passed"
else
  echo "❌ Smoke test failed - manual intervention required"
  exit 1
fi

# Replay any submissions during downtime
echo ""
echo "Replaying submissions from downtime..."
curl -X POST "https://n8n.zaplit.com/webhook/replay-dlq" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" \
  -d '{"since": "'"$BACKUP_DATE"'"}'

echo ""
echo "====================="
echo "✅ Disaster Recovery Complete"
echo "Duration: $(($(date +%s) - start_time)) seconds"
echo ""
echo "POST-RECOVERY ACTIONS:"
echo "  1. Verify all workflows are active"
echo "  2. Check credential connectivity"
echo "  3. Monitor for 1 hour"
echo "  4. Run data reconciliation"
echo "  5. Update incident documentation"
```

### 5.2 CRM Unavailability Handling

#### Degraded Mode Operation

```javascript
// CRM Unavailability Handler

const DEGRADED_MODE_CONFIG = {
  // Queue submissions when CRM is down
  enableQueueMode: true,
  
  // Alternative storage
  fallbackStorage: ['google_sheets', 's3', 'database'],
  
  // Notification settings
  notifyAfterMinutes: 5,
  
  // Auto-retry settings
  crmHealthCheckInterval: 60000,  // 1 minute
  maxQueueAge: 86400000           // 24 hours
};

async function handleCRMUnavailability(submission) {
  const health = await checkCRMHealth();
  
  if (!health.ok) {
    console.log('CRM unavailable - entering degraded mode');
    
    // Store in multiple fallback locations
    const storedLocations = [];
    
    // 1. Store in Google Sheets (immediate visibility)
    try {
      await storeInGoogleSheets(submission, { status: 'CRM_DOWN_PENDING' });
      storedLocations.push('google_sheets');
    } catch (error) {
      console.error('Failed to store in Google Sheets:', error);
    }
    
    // 2. Store in DLQ with extended TTL
    try {
      await storeInDLQ(submission, {
        priority: 'HIGH',
        retryAfter: DEGRADED_MODE_CONFIG.crmHealthCheckInterval,
        reason: 'CRM_UNAVAILABLE'
      });
      storedLocations.push('dlq');
    } catch (error) {
      console.error('Failed to store in DLQ:', error);
    }
    
    // 3. Send notification if this is a new outage
    if (await isNewOutage()) {
      await notifyOnCall({
        severity: 'high',
        message: 'CRM unavailable - degraded mode activated',
        affectedSubmissions: 1,
        storedLocations: storedLocations
      });
    }
    
    // Return success to user (we'll process later)
    return {
      success: true,
      message: "Submission received. We'll process it once our system is fully restored.",
      reference: submission.id,
      mode: 'DEGRADED'
    };
  }
  
  // CRM is available - process normally
  return null; // Continue to normal processing
}

async function checkCRMHealth() {
  try {
    const start = Date.now();
    const response = await $http.request({
      method: 'GET',
      url: 'https://crm.zaplit.com/rest/companies?page=1&limit=1',
      headers: { 'Authorization': 'Bearer {{$credentials.twentyCrmApiKey}}' },
      timeout: 5000
    });
    
    return {
      ok: response.statusCode === 200,
      responseTime: Date.now() - start
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message
    };
  }
}

// Background job to process queued submissions when CRM recovers
async function processQueuedSubmissions() {
  const health = await checkCRMHealth();
  
  if (!health.ok) {
    console.log('CRM still unavailable - skipping queue processing');
    return;
  }
  
  console.log('CRM recovered - processing queued submissions');
  
  // Fetch pending submissions
  const pending = await fetchPendingSubmissions();
  
  for (const submission of pending) {
    try {
      await processSubmission(submission);
      await markAsProcessed(submission.id);
      console.log(`Processed queued submission: ${submission.id}`);
    } catch (error) {
      console.error(`Failed to process queued submission ${submission.id}:`, error);
      // Will retry on next cycle
    }
  }
  
  // Notify that recovery is complete
  if (pending.length > 0) {
    await sendAlert({
      severity: 'info',
      message: `CRM recovery: Processed ${pending.length} queued submissions`
    });
  }
}
```

### 5.3 Complete System Failure Recovery

#### RTO/RPO Targets

| Component | RTO | RPO | Method |
|-----------|-----|-----|--------|
| n8n Workflows | 1 hour | 0 min | GitOps + Backups |
| n8n Database | 30 min | 5 min | Point-in-time recovery |
| CRM Data | 2 hours | 0 min | CRM-native backups |
| Google Sheets | 15 min | 0 min | Google Workspace backups |
| Form Submissions | 0 min | 0 min | Multi-layer storage |

#### Recovery Runbook

```markdown
# Complete System Failure Recovery Runbook

## Initial Assessment (0-5 minutes)

1. **Confirm Scope**
   - [ ] Check n8n status: https://n8n.zaplit.com/healthz
   - [ ] Check CRM status: https://crm.zaplit.com/rest/companies?page=1&limit=1
   - [ ] Check website status: https://zaplit.com
   - [ ] Check monitoring dashboard

2. **Determine Failure Scope**
   - [ ] Isolated component failure?
   - [ ] Regional outage?
   - [ ] Complete infrastructure failure?

## Communication (0-10 minutes)

1. **Internal Communication**
   - Post in #incidents channel:
   ```
   🚨 SYSTEM DOWN - Investigation in Progress
   
   Impact: Form submissions unavailable
   Started: [TIME]
   Status: Investigating
   
   Updates every 15 minutes
   ```

2. **Customer Communication** (if > 15 min expected)
   - Update status page
   - Prepare customer notification

## Recovery Execution (10-60 minutes)

### If n8n Down Only:
1. [ ] Execute: `./n8n-disaster-recovery.sh standard`
2. [ ] Verify workflows imported
3. [ ] Test form submission
4. [ ] Monitor for 30 minutes

### If CRM Down Only:
1. [ ] Enable degraded mode
2. [ ] Verify submissions queuing
3. [ ] Monitor CRM status page
4. [ ] Process backlog when CRM recovers

### If Complete Failure:
1. [ ] Execute: `./n8n-disaster-recovery.sh complete-loss`
2. [ ] Execute: `./verify-data-integrity.sh`
3. [ ] Execute: `./reconcile-all-data.sh`
4. [ ] Full E2E test suite

## Post-Recovery Verification (60-90 minutes)

1. **Functionality Tests**
   - [ ] Submit test form
   - [ ] Verify CRM record created
   - [ ] Verify notification sent
   - [ ] Verify Google Sheets entry

2. **Data Integrity Checks**
   - [ ] Run data reconciliation
   - [ ] Check for duplicates
   - [ ] Verify no data loss

3. **Performance Validation**
   - [ ] Response time < 5 seconds
   - [ ] No error spikes
   - [ ] Queue processing normally

## Post-Incident (90+ minutes)

1. [ ] Update incident timeline
2. [ ] Schedule post-mortem
3. [ ] Document lessons learned
4. [ ] Update runbooks if needed
```

### 5.4 Recovery Time Objective (RTO) and Recovery Point Objective (RPO)

```yaml
# disaster-recovery-config.yaml

rto_targets:
  workflow_failure:
    target: 15_minutes
    procedure: automatic_rollback_or_restart
    
  n8n_instance_failure:
    target: 30_minutes
    procedure: failover_to_standby
    
  database_corruption:
    target: 60_minutes
    procedure: point_in_time_recovery
    
  complete_system_failure:
    target: 120_minutes
    procedure: full_rebuild_from_backups

rpo_targets:
  form_submissions:
    target: 0_minutes
    method: synchronous_multi_write
    locations:
      - n8n_database
      - google_sheets
      - dlq_database
      
  workflow_configuration:
    target: 0_minutes
    method: gitops_version_control
    repository: github.com/zaplit/n8n-workflows
    
  execution_history:
    target: 5_minutes
    method: continuous_backup
    interval: 5_minutes

monitoring:
  health_check_interval: 30_seconds
  alert_on_rto_breach: true
  escalation_after_rto_breach: 15_minutes
```

---

## 6. Incident Response Integration

### 6.1 On-Call Procedures

#### On-Call Rotation

| Time Period | Primary | Secondary | Escalation |
|-------------|---------|-----------|------------|
| Week 1 | Engineer A | Engineer B | Manager |
| Week 2 | Engineer B | Engineer C | Manager |
| Week 3 | Engineer C | Engineer A | Manager |

#### On-Call Responsibilities

```markdown
# On-Call Engineer Checklist

## Shift Start (Handoff)
- [ ] Acknowledge on-call in PagerDuty
- [ ] Verify VPN access
- [ ] Verify n8n admin access: https://n8n.zaplit.com
- [ ] Verify CRM access: https://crm.zaplit.com
- [ ] Review open incidents from previous shift
- [ ] Check monitoring dashboards

## Every 2 Hours (During Shift)
- [ ] Review n8n execution error rate
- [ ] Check DLQ queue depth
- [ ] Verify CRM connectivity
- [ ] Review any alerts in #incidents

## Response to Alert (< 5 minutes)
1. Acknowledge alert in PagerDuty
2. Post in #incidents: "Investigating [ALERT_NAME]"
3. Follow appropriate runbook
4. Update incident thread every 15 minutes
5. Escalate if unresolved in 15 minutes

## Shift End (Handoff)
- [ ] Document any incidents in incident log
- [ ] Update runbook if new issue type encountered
- [ ] Hand off to next on-call engineer
- [ ] Set status to "off-call" in PagerDuty
```

### 6.2 Communication Templates

#### Initial Alert Template

```markdown
🚨 INCIDENT ALERT - [SEVERITY]

**Service:** n8n Consultation Form Workflow
**Severity:** [P0/P1/P2/P3]
**Started:** [TIMESTAMP]
**Impact:** [DESCRIPTION]

**Symptoms:**
- [Symptom 1]
- [Symptom 2]

**Engineer:** @[on-call-engineer]
**Status:** Investigating

**Thread:** [Link to incident channel thread]
```

#### Status Update Template

```markdown
📊 INCIDENT UPDATE - [MINUTES_ELAPSED] minutes

**Status:** [Investigating/Identified/Mitigating/Resolved]

**What we know:**
- [Fact 1]
- [Fact 2]

**What we're doing:**
- [Action 1]
- [Action 2]

**ETA for next update:** [TIME] or upon significant change
```

#### Resolution Template

```markdown
✅ INCIDENT RESOLVED

**Duration:** [DURATION]
**Resolved by:** @[engineer]

**Summary:**
[Brief description of what happened and how it was resolved]

**Impact:**
- Submissions affected: [COUNT]
- Records recovered: [COUNT]
- Data loss: [YES/NO - details if yes]

**Post-mortem:** Scheduled for [DATE/TIME]
```

#### Customer Communication Template

```markdown
Subject: [RESOLVED] Temporary Issue with Contact Form - Zaplit

Dear Valued Customer,

We experienced a temporary technical issue with our consultation form 
between [START_TIME] and [END_TIME] UTC.

**Impact:** Some form submissions may have been delayed.

**Resolution:** All submissions have been processed and no data was lost.

If you submitted a form during this time and have not received a 
confirmation within 24 hours, please contact us directly at hello@zaplit.com.

We sincerely apologize for any inconvenience.

Best regards,
The Zaplit Team
```

### 6.3 Post-Mortem Process

#### Post-Mortem Template

```markdown
# Post-Incident Review: [INCIDENT_TITLE]

## Basic Information
- **Incident ID:** INC-YYYY-MM-DD-XXX
- **Date:** YYYY-MM-DD
- **Duration:** HH:MM
- **Severity:** P0/P1/P2/P3
- **Reporter:** [Name]
- **Reviewers:** [Names]

## Executive Summary
[One-paragraph summary of the incident and resolution]

## Timeline (All times UTC)

| Time | Event | Actor |
|------|-------|-------|
| 14:30 | Issue detected via monitoring alert | Automated |
| 14:32 | On-call engineer acknowledged | @engineer |
| 14:35 | Investigation started | @engineer |
| 14:45 | Root cause identified | @engineer |
| 14:50 | Mitigation applied | @engineer |
| 15:00 | Service fully restored | @engineer |
| 15:30 | Post-incident monitoring complete | @engineer |

## Impact Assessment

### Quantitative
- Form submissions affected: [COUNT]
- CRM records delayed: [COUNT]
- Customer notifications delayed: [COUNT]
- Estimated revenue impact: $[AMOUNT]

### Qualitative
- Customer trust impact: [Low/Medium/High]
- Brand reputation impact: [Low/Medium/High]
- Team morale impact: [Low/Medium/High]

## Root Cause Analysis

### 5 Whys
1. **Why did the incident occur?**
   - [Answer]

2. **Why did [answer to 1] happen?**
   - [Answer]

3. **Why did [answer to 2] happen?**
   - [Answer]

4. **Why did [answer to 3] happen?**
   - [Answer]

5. **Why did [answer to 4] happen?**
   - [Answer - root cause]

### Root Cause
[Clear statement of the root cause]

### Contributing Factors
- [Factor 1]
- [Factor 2]

## Resolution

### Actions Taken
1. [Action 1]
2. [Action 2]

### What Worked Well
- [Positive 1]
- [Positive 2]

### What Could Have Been Better
- [Improvement 1]
- [Improvement 2]

## Action Items

| ID | Action | Owner | Due Date | Priority | Status |
|----|--------|-------|----------|----------|--------|
| 1 | [Action] | [Name] | YYYY-MM-DD | P0 | ⬜ |
| 2 | [Action] | [Name] | YYYY-MM-DD | P1 | ⬜ |

## Lessons Learned

### Technical
- [Lesson 1]
- [Lesson 2]

### Process
- [Lesson 1]
- [Lesson 2]

### Communication
- [Lesson 1]
- [Lesson 2]

## Prevention Measures

### Immediate (This Week)
- [ ] [Measure 1]
- [ ] [Measure 2]

### Short-term (This Month)
- [ ] [Measure 1]
- [ ] [Measure 2]

### Long-term (This Quarter)
- [ ] [Measure 1]
- [ ] [Measure 2]

## Attachments
- [Link to monitoring graphs]
- [Link to logs]
- [Link to incident thread]
```

### 6.4 Continuous Improvement from Incidents

#### Incident Metrics Dashboard

```javascript
// Monthly Incident Review Workflow

async function generateIncidentMetrics() {
  const month = $input.first().json.month || new Date().toISOString().slice(0, 7);
  
  // Fetch all incidents for the month
  const incidents = await fetchIncidents({ month });
  
  const metrics = {
    month,
    summary: {
      totalIncidents: incidents.length,
      bySeverity: countBy(incidents, 'severity'),
      byCategory: countBy(incidents, 'category'),
      mttr: calculateMTTR(incidents),  // Mean Time To Resolution
      mtbf: calculateMTBF(incidents)   // Mean Time Between Failures
    },
    trends: {
      vsPreviousMonth: compareToPrevious(incidents, month),
      recurringIssues: identifyRecurring(incidents)
    },
    actionItems: {
      completed: incidents.flatMap(i => i.actionItems).filter(a => a.status === 'done').length,
      pending: incidents.flatMap(i => i.actionItems).filter(a => a.status !== 'done').length,
      overdue: incidents.flatMap(i => i.actionItems).filter(a => isOverdue(a)).length
    }
  };
  
  // Generate recommendations
  metrics.recommendations = generateRecommendations(metrics);
  
  // Send monthly report
  await sendReport(metrics);
  
  return metrics;
}

function generateRecommendations(metrics) {
  const recommendations = [];
  
  if (metrics.summary.mttr > 30) {
    recommendations.push({
      type: 'process',
      priority: 'high',
      message: 'MTTR exceeds 30 minutes - review escalation procedures'
    });
  }
  
  if (metrics.actionItems.overdue > 3) {
    recommendations.push({
      type: 'action_items',
      priority: 'high',
      message: `${metrics.actionItems.overdue} action items overdue - schedule review`
    });
  }
  
  const recurring = Object.entries(metrics.trends.recurringIssues)
    .filter(([_, count]) => count > 2);
  
  if (recurring.length > 0) {
    recommendations.push({
      type: 'technical',
      priority: 'critical',
      message: `Recurring issues detected: ${recurring.map(([issue, _]) => issue).join(', ')}`
    });
  }
  
  return recommendations;
}
```

---

## 7. Decision Trees

### 7.1 Failure Type Decision Tree

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                     FAILURE TYPE DECISION TREE                                │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  FORM SUBMISSION FAILURE                                                       │
│       │                                                                        │
│       ▼                                                                        │
│  Is the workflow active?                                                      │
│       │                                                                        │
│   NO──┴──YES                                                                   │
│   │          │                                                                 │
│   ▼          ▼                                                                 │
│ Activate  Is there an execution in n8n?                                       │
│ workflow       │                                                               │
│              NO─┴──YES                                                         │
│              │          │                                                      │
│              ▼          ▼                                                      │
│         Check      What is the error?                                         │
│         webhook         │                                                      │
│         URL             ▼                                                      │
│                    ┌─────────┬─────────┬─────────┬─────────┐                  │
│                    │  401/   │  500/   │ Timeout │  Other  │                  │
│                    │  403    │  503    │         │         │                  │
│                    └────┬────┴────┬────┴────┬────┴────┬────┘                  │
│                         │         │         │         │                        │
│                         ▼         ▼         ▼         ▼                        │
│                   Rotate    Check    Retry   Review                          │
│                   API key   CRM      with    workflow                         │
│                             status   backoff   logic                          │
│                                                                               │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 7.2 Recovery Action Decision Tree

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                    RECOVERY ACTION DECISION TREE                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  DATA LOSS DETECTED                                                           │
│       │                                                                        │
│       ▼                                                                        │
│  Is the data in Google Sheets?                                                │
│       │                                                                        │
│   YES─┴──NO                                                                    │
│   │          │                                                                 │
│   ▼          ▼                                                                 │
│ Reconcile  Is it in DLQ?                                                      │
│ with CRM        │                                                              │
│              YES─┴──NO                                                         │
│              │          │                                                      │
│              ▼          ▼                                                      │
│         Process    Check access                                               │
│         DLQ        logs                                                       │
│                       │                                                        │
│                    FOUND─┴──NOT FOUND                                          │
│                       │          │                                             │
│                       ▼          ▼                                             │
│                  Replay       Check backup                                     │
│                  webhook      systems                                          │
│                                                                               │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 7.3 Escalation Decision Tree

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                      ESCALATION DECISION TREE                                 │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  ISSUE DETECTED                                                               │
│       │                                                                        │
│       ▼                                                                        │
│  Can you resolve in 5 minutes?                                                │
│       │                                                                        │
│   YES─┴──NO                                                                    │
│   │          │                                                                 │
│   ▼          ▼                                                                 │
│ Resolve  Is customer impact > 10 users?                                       │
│ issue         │                                                                │
│             NO─┴──YES                                                          │
│             │          │                                                       │
│             ▼          ▼                                                       │
│        Continue  Is data loss possible?                                       │
│        working        │                                                        │
│                   NO─┴──YES                                                    │
│                   │          │                                                 │
│                   ▼          ▼                                                 │
│              Escalate    EMERGENCY:                                           │
│              to L2       Immediate L3 +                                       │
│                          War Room                                             │
│                                                                               │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 8. Runbooks

### 8.1 Quick Reference Runbooks

#### Runbook: Workflow Not Responding

```markdown
# Workflow Not Responding

## Symptoms
- Form submissions timing out
- No executions visible in n8n
- Users reporting form errors

## Diagnosis Steps

1. Check workflow status
   ```bash
   curl https://n8n.zaplit.com/api/v1/workflows \
     -H "X-N8N-API-KEY: $N8N_API_KEY" | \
     jq '.data[] | select(.name == "Consultation Form to CRM") | {id, active}'
   ```

2. Check n8n health
   ```bash
   curl https://n8n.zaplit.com/healthz
   ```

3. Check recent executions
   - Open n8n UI → Executions
   - Filter by workflow name
   - Look for errors or stuck executions

## Resolution

### If workflow is inactive:
```bash
# Activate workflow
curl -X POST "https://n8n.zaplit.com/api/v1/workflows/$WORKFLOW_ID/activate" \
  -H "X-N8N-API-KEY: $N8N_API_KEY"
```

### If n8n is down:
1. Check server status
2. Restart if necessary: `docker-compose restart n8n`
3. Verify health endpoint returns 200

### If executions are stuck:
1. Identify stuck execution IDs
2. Kill executions:
   ```bash
   curl -X POST "https://n8n.zaplit.com/api/v1/executions/$EXEC_ID/stop" \
     -H "X-N8N-API-KEY: $N8N_API_KEY"
   ```

## Verification
- [ ] Submit test form
- [ ] Verify execution appears
- [ ] Verify CRM record created
```

#### Runbook: High Error Rate

```markdown
# High Error Rate

## Symptoms
- Error rate > 5%
- Multiple failed executions
- Alert firing

## Diagnosis Steps

1. Identify error pattern
   ```bash
   # Get recent failed executions
   curl "https://n8n.zaplit.com/api/v1/executions?filter={\"status\":\"error\"}" \
     -H "X-N8N-API-KEY: $N8N_API_KEY" | \
     jq '.data[] | {id, startedAt, stoppedAt, workflowName}'
   ```

2. Check CRM status
   ```bash
   curl -I https://crm.zaplit.com/rest/companies?page=1&limit=1
   ```

3. Review error messages
   - n8n UI → Executions → Click failed execution
   - Look for common error patterns

## Common Causes & Fixes

### CRM API errors (5xx):
- Check CRM status page
- Enable queue mode if CRM is struggling
- Implement circuit breaker

### Authentication errors (401/403):
- Rotate API key immediately
- Update credentials in n8n
- Test with single execution

### Timeout errors:
- Increase timeout to 60s
- Check CRM performance
- Consider async processing

### Data validation errors:
- Review recent form submissions
- Check for new field types
- Update validation logic
```

### 8.2 Rollback Checklist

```markdown
# Emergency Rollback Checklist

## Pre-Rollback (0-30 seconds)
- [ ] Alert team in #incidents
- [ ] Confirm rollback is necessary
- [ ] Identify rollback target version

## Rollback Execution (30-90 seconds)
- [ ] Deactivate workflow
- [ ] Export current state for forensics
- [ ] Import previous version
- [ ] Verify workflow structure
- [ ] Activate workflow

## Post-Rollback (90-300 seconds)
- [ ] Run smoke test
- [ ] Verify form submissions working
- [ ] Monitor error rate for 5 minutes
- [ ] Update status page if customer-facing

## Follow-up (5-60 minutes)
- [ ] Document rollback reason
- [ ] Update incident timeline
- [ ] Analyze root cause
- [ ] Schedule post-mortem
```

---

## 9. Appendices

### Appendix A: Emergency Contacts

| Role | Name | Slack | Phone | Escalation Time |
|------|------|-------|-------|-----------------|
| On-call Engineer | Rotation | #incidents | PagerDuty | 0 min |
| Senior Engineer | [Name] | @senior-eng | +1-XXX-XXX-XXXX | 15 min |
| Engineering Manager | [Name] | @eng-manager | +1-XXX-XXX-XXXX | 30 min |
| CTO | [Name] | @cto | +1-XXX-XXX-XXXX | 60 min |
| Twenty CRM Support | N/A | N/A | support@twenty.com | - |
| GCP Support | N/A | N/A | Cloud Console | - |

### Appendix B: Critical URLs

| Service | URL | Purpose |
|---------|-----|---------|
| n8n Production | https://n8n.zaplit.com | Workflow management |
| n8n Health | https://n8n.zaplit.com/healthz | Health checks |
| Twenty CRM | https://crm.zaplit.com | CRM system |
| Monitoring | https://grafana.zaplit.com | Metrics dashboard |
| Logs | https://logs.zaplit.com | Log aggregation |
| Status Page | https://status.zaplit.com | Public status |

### Appendix C: Backup Locations

| Data Type | Location | Retention | Frequency |
|-----------|----------|-----------|-----------|
| n8n Database | /backups/n8n/database/ | 30 days | Every 6 hours |
| Workflows | /backups/n8n/workflows/ | 90 days | On change |
| Credentials | /backups/n8n/credentials/ (encrypted) | Latest | On change |
| Execution Logs | Google Cloud Storage | 1 year | Continuous |
| DLQ | PostgreSQL + Google Sheets | 90 days | Real-time |

### Appendix D: Testing Procedures

```bash
#!/bin/bash
# test-recovery-procedures.sh - Quarterly DR test

echo "Disaster Recovery Test"
echo "======================"
echo "Date: $(date)"
echo ""

# Test 1: Workflow Rollback
echo "Test 1: Workflow Rollback"
./emergency-rollback.sh --dry-run
if [ $? -eq 0 ]; then echo "✅ PASS"; else echo "❌ FAIL"; fi

# Test 2: DLQ Processing
echo ""
echo "Test 2: DLQ Processing"
curl -sf https://n8n.zaplit.com/webhook/test-dlq
if [ $? -eq 0 ]; then echo "✅ PASS"; else echo "❌ FAIL"; fi

# Test 3: CRM Failover
echo ""
echo "Test 3: CRM Failover"
./test-crm-failover.sh
if [ $? -eq 0 ]; then echo "✅ PASS"; else echo "❌ FAIL"; fi

# Test 4: Data Reconciliation
echo ""
echo "Test 4: Data Reconciliation"
curl -sf -X POST https://n8n.zaplit.com/webhook/reconcile-test
if [ $? -eq 0 ]; then echo "✅ PASS"; else echo "❌ FAIL"; fi

echo ""
echo "======================"
echo "DR Test Complete"
```

---

**Document Owner:** DevOps Team  
**Last Updated:** March 19, 2026  
**Review Schedule:** Monthly  
**Next Review:** April 19, 2026  
**Distribution:** Engineering Team, On-Call Engineers

---

*This document contains critical operational procedures. Keep updated and practice regularly.*
