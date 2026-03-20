# Parallel Workflow Implementation Guide

**Version:** 4.0.0  
**Target:** <3s P95 Latency  
**Classification:** Production System Optimization

---

## Table of Contents

1. [Overview](#1-overview)
2. [Node-by-Node Configuration](#2-node-by-node-configuration)
3. [Performance Optimizations](#3-performance-optimizations)
4. [Error Handling Strategy](#4-error-handling-strategy)
5. [Testing Procedures](#5-testing-procedures)
6. [Rollback Plan](#6-rollback-plan)
7. [Appendix: Environment Variables](#7-appendix-environment-variables)

---

## 1. Overview

### 1.1 Architecture Summary

```
┌────────────────────────────────────────────────────────────────────────────────┐
│                    PARALLEL WORKFLOW ARCHITECTURE (v4)                          │
├────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  Phase 1: Pre-flight (Sequential)                                               │
│  ├─ Webhook Receive → Validation → Is Valid?                                    │
│  └─ Duration: 25-60ms                                                           │
│                                                                                 │
│  Phase 2: Parallel Execution (Fork-Join)                                        │
│  ├─ Prepare Parallel Data → Split to 2 branches                                 │
│  │   ├─ Branch A: Create Person (600-1200ms)                                   │
│  │   └─ Branch B: Create Company (700-1500ms)                                  │
│  │   ═══════════════════════════════════════                                   │
│  │   Parallel Duration: max(1210ms, 1510ms) = 1510ms                           │
│  └─ Duration: 600-1500ms (determined by slowest branch)                        │
│                                                                                 │
│  Phase 3: Synchronization                                                       │
│  ├─ Merge Records (waitForAll) → Combine Results                                │
│  └─ Duration: 10-20ms                                                           │
│                                                                                 │
│  Phase 4: Sequential Completion                                                 │
│  ├─ Link Person→Company (200-500ms)                                            │
│  ├─ Create Note (800-1400ms)                                                   │
│  ├─ Assemble Response → Success Response                                        │
│  └─ Duration: 1000-1900ms                                                       │
│                                                                                 │
├────────────────────────────────────────────────────────────────────────────────┤
│  Total Expected: 2525-3430ms (P95: ~2900ms)                                    │
│  Improvement: ~43% reduction vs sequential                                       │
└────────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Key Improvements

| Aspect | v3 (Current) | v4 (Optimized) | Improvement |
|--------|--------------|----------------|-------------|
| **P95 Latency** | 3260ms | ~2900ms | 12% faster |
| **Error Handling** | Basic | Comprehensive | Partial failure support |
| **Keep-Alive** | No | Yes | 10-15% reduction |
| **Observability** | Limited | Full metrics | Performance tracking |
| **Retry Logic** | None | Exponential backoff | Better resilience |

---

## 2. Node-by-Node Configuration

### 2.1 Webhook Node: "Consultation Webhook"

```json
{
  "parameters": {
    "httpMethod": "POST",
    "path": "consultation-v4",
    "responseMode": "responseNode",
    "options": {
      "responseHeaders": {
        "entries": [
          {
            "name": "X-Workflow-Version",
            "value": "v4-parallel"
          },
          {
            "name": "X-Request-ID",
            "value": "={{ $execution.id }}"
          }
        ]
      }
    }
  }
}
```

**Purpose:** Entry point for consultation form submissions  
**Key Configuration:**
- `responseMode: responseNode` - Waits for explicit response node
- Custom headers for tracing and version identification
- Path suffix `-v4` allows A/B testing with previous versions

---

### 2.2 Validation Node: "Entry Validation"

```json
{
  "parameters": {
    "jsCode": "// Comprehensive email validation with RFC 5322 subset\nconst emailValidation = validateEmail(body.data?.email);\n// Name parsing and normalization\nconst nameParts = parseFullName(body.data?.name);\n// Company validation with fallback\n// Metadata tracking for observability\n"
  }
}
```

**Purpose:** Validates and normalizes input data  
**Key Features:**
- RFC 5322 compliant email validation
- Name parsing (first/last extraction)
- Company name fallback to "Unknown Company"
- Validation timing metadata

**Error Handling:**
- Returns `{ valid: false, errors: [...] }` for invalid input
- Errors flow to "Validation Error" response node

---

### 2.3 Split Node: "Prepare Parallel Data"

```json
{
  "parameters": {
    "jsCode": "// Returns array with TWO outputs for parallel execution\nreturn [\n  { json: { branch: 'person', personData: {...}, noteData: {...} } },   // Index 0\n  { json: { branch: 'company', companyData: {...}, noteData: {...} } }  // Index 1\n];"
  }
}
```

**Purpose:** Forks execution into two parallel branches  
**Critical:** Must return exactly 2 array elements for parallel execution

**Branch 0 (Person):**
- `personData` - Complete person payload
- `noteData` - Shared note information
- `companyName` - For reference

**Branch 1 (Company):**
- `companyData` - Complete company payload
- `noteData` - Shared note information
- `personEmail` - For domain extraction

---

### 2.4 Parallel Branch A: Person Creation

#### Node: "Create Person" (HTTP Request)

```json
{
  "parameters": {
    "method": "POST",
    "url": "={{ $env.CRM_BASE_URL }}/rest/people",
    "authentication": "genericCredentialType",
    "genericAuthType": "httpHeaderAuth",
    "sendBody": true,
    "contentType": "application/json",
    "specifyBody": "json",
    "jsonBody": "={{ JSON.stringify($json.personData) }}",
    "options": {
      "timeout": 15000
    }
  },
  "continueOnFail": true,
  "retry": {
    "limit": 3,
    "delay": 1000,
    "backoff": "exponential"
  }
}
```

**Purpose:** Creates person record in Twenty CRM  
**Key Configuration:**
- `continueOnFail: true` - Allows workflow to continue on error
- `timeout: 15000` - 15 second timeout (fail fast)
- `retry: 3` - Exponential backoff retry

#### Node: "Extract Person ID" (Code)

```javascript
// Extracts person ID with error tracking
const response = $input.first().json;
const hasError = response.error !== undefined || 
                 (response.statusCode && response.statusCode >= 400);
const personId = !hasError ? (response.data?.id || response.id) : null;

return [{
  json: {
    personId: personId,
    personSuccess: !!personId && !hasError,
    personError: hasError ? response.error?.message : null,
    personDuration: duration
  }
}];
```

---

### 2.5 Parallel Branch B: Company Creation

#### Node: "Create Company" (HTTP Request)

```json
{
  "parameters": {
    "method": "POST",
    "url": "={{ $env.CRM_BASE_URL }}/rest/companies",
    "authentication": "genericCredentialType",
    "genericAuthType": "httpHeaderAuth",
    "sendBody": true,
    "contentType": "application/json",
    "specifyBody": "json",
    "jsonBody": "={{ JSON.stringify($json.companyData) }}",
    "options": {
      "timeout": 15000
    }
  },
  "continueOnFail": true,
  "retry": {
    "limit": 3,
    "delay": 1000,
    "backoff": "exponential"
  }
}
```

**Purpose:** Creates company record in Twenty CRM  
**Configuration identical to Person node**

---

### 2.6 Merge Node: "Merge Records"

```json
{
  "parameters": {
    "mode": "waitForAll"
  }
}
```

**Purpose:** Synchronizes parallel branches  
**Critical Configuration:**
- `mode: waitForAll` - Waits for BOTH branches to complete
- Input 0: Person branch result
- Input 1: Company branch result
- Output: Combined items from both branches

**Timing:** The merge completes when the SLOWEST branch finishes.

---

### 2.7 Synchronization Node: "Combine Results"

```javascript
// Combines parallel results with error handling
const inputs = $input.all();
const personInput = inputs[0].json;
const companyInput = inputs[1].json;

const personSuccess = personInput.personSuccess;
const companySuccess = companyInput.companySuccess;
const totalFailures = (personSuccess ? 0 : 1) + (companySuccess ? 0 : 1);

// Complete failure - throw error
if (totalFailures === 2) {
  throw new Error('PARALLEL_FAILURE: Both Person and Company creation failed');
}

// Partial failure - log warning and continue
if (totalFailures === 1) {
  console.warn('[PARALLEL] Partial failure detected');
}

return [{
  json: {
    personId: personInput.personId,
    companyId: companyInput.companyId,
    personSuccess: personSuccess,
    companySuccess: companySuccess,
    partialFailure: totalFailures === 1
  }
}];
```

---

### 2.8 Sequential Completion Nodes

#### Node: "Link Person to Company" (HTTP Request)

```json
{
  "parameters": {
    "method": "PATCH",
    "url": "={{ $env.CRM_BASE_URL }}/rest/people/{{ $json.personId }}",
    "jsonBody": "={\"companyId\": \"{{ $json.companyId }}\"}",
    "options": {
      "timeout": 15000,
      "ignoreHttpStatusErrors": true
    }
  },
  "continueOnFail": true
}
```

#### Node: "Create Note" (HTTP Request)

```json
{
  "parameters": {
    "method": "POST",
    "url": "={{ $env.CRM_BASE_URL }}/rest/notes",
    "jsonBody": "={\n  \"title\": \"Consultation Request...\",\n  \"body\": \"...\",\n  \"personId\": \"{{ $json.personId }}\",\n  \"companyId\": \"{{ $json.companyId }}\"\n}",
    "options": {
      "timeout": 15000
    }
  },
  "continueOnFail": true
}
```

---

## 3. Performance Optimizations

### 3.1 HTTP Keep-Alive Configuration

#### n8n Environment Variables

```bash
# Connection Pool Settings
export N8N_HTTP_POOL_SIZE=10
export N8N_HTTP_KEEP_ALIVE=true
export N8N_HTTP_KEEP_ALIVE_MSECS=30000
export N8N_HTTP_TIMEOUT=15000
export N8N_HTTP_MAX_REDIRECTS=3

# Apply to n8n container/deployment
```

#### Expected Impact

| Metric | Without Keep-Alive | With Keep-Alive | Improvement |
|--------|-------------------|-----------------|-------------|
| TCP Handshake | 50-100ms per call | Once per pool | -150-300ms |
| TLS Handshake | 100-200ms per call | Once per pool | -300-600ms |
| Connection Reuse | 0% | >80% | Significant |

### 3.2 Retry Configuration

```javascript
{
  "retry": {
    "limit": 3,
    "delay": 1000,
    "backoff": "exponential"  // 1s, 2s, 4s
  }
}
```

**Retry Behavior:**
- Attempt 1: Immediate
- Attempt 2: After 1000ms
- Attempt 3: After 2000ms (1000ms × 2¹)
- Attempt 4: After 4000ms (1000ms × 2²)

### 3.3 Timeout Tuning

| Node Type | Timeout | Rationale |
|-----------|---------|-----------|
| Person Creation | 15s | Typical: 600-1200ms |
| Company Creation | 15s | Typical: 700-1500ms |
| Link Operation | 15s | Typical: 200-500ms |
| Note Creation | 15s | Typical: 800-1400ms |

### 3.4 Expected Performance

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PERFORMANCE PROJECTION                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Phase 1: Pre-flight          25-60ms                                       │
│  Phase 2: Parallel            600-1500ms (max of Person/Company)           │
│  Phase 3: Merge               10-20ms                                       │
│  Phase 4: Sequential          1000-1900ms                                   │
│                                                                              │
│  ├─ Total P50: ~1800ms                                                     │
│  ├─ Total P95: ~2900ms  ✅ Target <3000ms                                   │
│  └─ Total P99: ~3800ms                                                     │
│                                                                              │
│  Without Keep-Alive: +300-600ms                                             │
│  With Keep-Alive: Baseline above                                           │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Error Handling Strategy

### 4.1 Partial Failure Scenarios

#### Scenario 1: Person Fails, Company Succeeds

```
Flow:
Create Person (FAIL) ──┐
                       ├─► Merge ──► Combine Results (detects partial)
Create Company (OK) ───┘                │
                                        ▼
                              Link Person→Company (skipped if no personId)
                                        │
                                        ▼
                              Create Note (company only)
                                        │
                                        ▼
                              Response: partialFailure: true
```

**Behavior:**
- Workflow continues
- Note created with company association only
- Response indicates partial success
- Error logged for manual review

#### Scenario 2: Company Fails, Person Succeeds

**Behavior:**
- Workflow continues
- Person created without company link
- Note created with person association only
- Response indicates partial success

#### Scenario 3: Both Fail

**Behavior:**
- `Combine Results` node throws error
- Error response returned to client
- Full context logged for debugging

### 4.2 Error Response Codes

| Scenario | HTTP Status | Response Code | Message |
|----------|-------------|---------------|---------|
| Validation Failed | 400 | VALIDATION_ERROR | Check your input |
| Partial Success | 200 | (success: true) | Partial success message |
| Both Failures | 500 | PROCESSING_ERROR | Try again later |
| Rate Limited | 429 | RATE_LIMIT | (handled by retry) |

### 4.3 Monitoring Error Scenarios

```javascript
// Log partial failures for alerting
if (totalFailures === 1) {
  console.warn('[PARALLEL] Partial failure', {
    executionId: $execution.id,
    personSuccess,
    companySuccess,
    personError: personInput.personError,
    companyError: companyInput.companyError
  });
}
```

---

## 5. Testing Procedures

### 5.1 Pre-Deployment Testing

#### Test 1: Basic Functionality

```bash
# Test valid submission
curl -X POST "https://n8n.zaplit.com/webhook/consultation-v4" \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "name": "Test User",
      "email": "test@example.com",
      "company": "Test Corp",
      "role": "Engineer",
      "message": "Test message"
    }
  }'
```

**Expected:**
- HTTP 200
- Response includes `personId` and `companyId`
- Total duration < 3.5s

#### Test 2: Validation Error

```bash
# Test invalid email
curl -X POST "https://n8n.zaplit.com/webhook/consultation-v4" \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "name": "Test",
      "email": "invalid-email",
      "company": "Test Corp"
    }
  }'
```

**Expected:**
- HTTP 400
- `success: false`
- Error array with details

#### Test 3: Partial Failure Simulation

```bash
# Test with invalid CRM IDs (if test environment supports)
# Or temporarily break one endpoint
```

### 5.2 Performance Testing

#### Load Test with autocannon

```bash
# Install autocannon
npm install -g autocannon

# Run load test
autocannon \
  --url "https://n8n.zaplit.com/webhook/consultation-v4" \
  --method POST \
  --headers "Content-Type: application/json" \
  --body '{"data":{"name":"Perf Test","email":"perf@test.com","company":"Perf Corp","role":"Tester","message":"Load test"}}' \
  --connections 10 \
  --duration 60 \
  --latency
```

#### Success Criteria

| Metric | Target | Acceptable |
|--------|--------|------------|
| P50 Latency | <2s | <2.5s |
| P95 Latency | <3s | <3.5s |
| P99 Latency | <4s | <5s |
| Error Rate | <0.5% | <1% |
| Throughput | >25 req/min | >20 req/min |

### 5.3 Comparison Testing

```bash
#!/bin/bash
# compare-v3-v4.sh - Compare performance between versions

WEBHOOK_V3="https://n8n.zaplit.com/webhook/consultation"
WEBHOOK_V4="https://n8n.zaplit.com/webhook/consultation-v4"

for version in v3 v4; do
  url=$([ "$version" = "v3" ] && echo $WEBHOOK_V3 || echo $WEBHOOK_V4)
  
  echo "Testing $version..."
  for i in {1..20}; do
    curl -w "@curl-format.txt" -o /dev/null -s -X POST "$url" \
      -H "Content-Type: application/json" \
      -d "{\"data\":{\"name\":\"$version Test $i\",\"email\":\"$version$i@test.com\",\"company\":\"Test Corp\",\"role\":\"Tester\",\"message\":\"Test\"}}"
  done
done
```

---

## 6. Rollback Plan

### 6.1 Rollback Triggers

**Immediate Rollback Required:**
- P95 latency increases >20% vs baseline
- Error rate exceeds 1% for >5 minutes
- Data integrity issues detected
- Customer complaints about form submission

**Automatic Rollback (if configured):**
- Error rate >5% for >2 minutes
- Complete workflow failure for >1 minute

### 6.2 Rollback Steps

#### Step 1: Revert Webhook Path (30 seconds)

```bash
# Option A: Update load balancer/configmap
kubectl patch configmap n8n-webhook-config \
  --patch '{"data":{"webhook.path":"consultation"}}'

# Option B: Update DNS/ingress
# Point consultation.zaplit.com back to v3 endpoint

# Option C: Fastest - Update n8n webhook paths
# In n8n UI:
# 1. Deactivate v4 workflow
# 2. Change v3 webhook path to "consultation"
# 3. Activate v3 workflow
```

#### Step 2: Verify Rollback (5 minutes)

```bash
# Check error rates
# Verify P95 latency returns to baseline
# Confirm successful form submissions
```

#### Step 3: Post-Rollback Actions

```bash
# 1. Preserve execution logs
kubectl cp n8n-pod:/home/node/.n8n/logs ./rollback-logs/$(date +%Y%m%d-%H%M%S)

# 2. Export failed executions for analysis
# In n8n UI: Settings > Export > Failed Executions

# 3. Create incident report
# Document: trigger, impact, rollback time, root cause
```

### 6.3 Rollback Verification

```bash
#!/bin/bash
# verify-rollback.sh

WEBHOOK_URL="https://n8n.zaplit.com/webhook/consultation"
TEST_ID="ROLLBACK_TEST_$(date +%s)"

# Test submission
echo "Testing post-rollback submission..."
response=$(curl -s -w "\n%{http_code}\n%{time_total}" \
  -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d "{\"data\":{\"name\":\"Rollback Test\",\"email\":\"$TEST_ID@test.com\",\"company\":\"Test\",\"role\":\"Tester\",\"message\":\"Post-rollback test\"}}")

http_code=$(echo "$response" | tail -2 | head -1)
time_total=$(echo "$response" | tail -1)

if [ "$http_code" = "200" ]; then
  echo "✅ Rollback successful - HTTP 200"
  echo "Response time: ${time_total}s"
else
  echo "❌ Rollback issue - HTTP $http_code"
fi
```

### 6.4 Recovery Timeline

| Phase | Duration | Action |
|-------|----------|--------|
| Detection | 0-2 min | Alert triggers |
| Decision | 2-5 min | Team decides to rollback |
| Execution | 1 min | Run rollback script |
| Verification | 5 min | Confirm restoration |
| **Total** | **8-13 min** | Full recovery |

---

## 7. Appendix: Environment Variables

### 7.1 n8n HTTP Configuration

```bash
# /etc/environment or docker-compose.env

# Connection Pool
N8N_HTTP_POOL_SIZE=10
N8N_HTTP_KEEP_ALIVE=true
N8N_HTTP_KEEP_ALIVE_MSECS=30000
N8N_HTTP_TIMEOUT=15000
N8N_HTTP_MAX_REDIRECTS=3

# Performance Monitoring
N8N_METRICS=true
N8N_METRICS_PREFIX=n8n_parallel_

# Execution Settings
N8N_EXECUTIONS_MODE=regular
N8N_EXECUTIONS_TIMEOUT=300
N8N_EXECUTIONS_DATA_SAVE_ON_ERROR=all
N8N_EXECUTIONS_DATA_SAVE_ON_SUCCESS=all
```

### 7.2 CRM Configuration

```bash
# CRM API Configuration
CRM_BASE_URL=https://crm.zaplit.com
CRM_API_TOKEN=xxx
CRM_RATE_LIMIT=100

# Retry Configuration
CRM_RETRY_MAX=3
CRM_RETRY_DELAY=1000
```

### 7.3 Verification Commands

```bash
# Verify environment variables are set
echo "N8N_HTTP_KEEP_ALIVE: $N8N_HTTP_KEEP_ALIVE"
echo "N8N_HTTP_POOL_SIZE: $N8N_HTTP_POOL_SIZE"

# Verify n8n is using Keep-Alive
kubectl logs deployment/n8n | grep -i "keep.*alive"

# Check connection pool status
kubectl exec -it deployment/n8n -- netstat -an | grep ESTABLISHED | wc -l
```

---

**Document Version:** 1.0  
**Last Updated:** March 19, 2026  
**Next Review:** April 2, 2026
