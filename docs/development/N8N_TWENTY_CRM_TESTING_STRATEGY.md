# n8n-Twenty CRM Integration Testing Strategy

## Executive Summary

This document provides a comprehensive testing strategy for the n8n-Twenty CRM consultation form workflow. It covers unit testing, integration testing, error scenario testing, production monitoring, validation strategies, and load testing approaches.

**Current Workflow Overview:**
```
Webhook → Process Form Data (Code) → Create Person → Create Company → Create Note → Response
```

---

## Table of Contents

1. [Testing Architecture](#1-testing-architecture)
2. [Unit Testing Individual Nodes](#2-unit-testing-individual-nodes)
3. [Integration Testing](#3-integration-testing)
4. [Error Scenario Testing](#4-error-scenario-testing)
5. [Production Monitoring](#5-production-monitoring)
6. [Validation Strategies](#6-validation-strategies)
7. [Load Testing](#7-load-testing)
8. [Test Case Matrix](#8-test-case-matrix)
9. [Current Setup Gaps](#9-current-setup-gaps)
10. [Implementation Roadmap](#10-implementation-roadmap)

---

## 1. Testing Architecture

### 1.1 Testing Pyramid for n8n Workflows

```
                    /\
                   /  \
                  / E2E\          (Production validation)
                 /______\
                /        \
               /Integration\      (Workflow + CRM integration)
              /____________\
             /              \
            /   Unit Tests    \    (Individual nodes)
           /__________________\
```

### 1.2 Testing Environments

| Environment | Purpose | Data Strategy |
|-------------|---------|---------------|
| **Local Dev** | Unit testing, node development | Mock data via pinned data |
| **Staging** | Integration testing | Test CRM instance + synthetic data |
| **Production** | Health checks, monitoring | Real data, read-only validation |

### 1.3 Test Data Management

**Approach: Data Pinning + Mock Nodes**

n8n provides built-in data mocking through:
- **Data Pinning**: Save real execution data for reuse
- **Code/Set Nodes**: Generate synthetic test data
- **Customer Datastore Node**: Use fake datasets for exploration

---

## 2. Unit Testing Individual Nodes

### 2.1 Testing the Process Form Data (Code Node)

**Node Logic Analysis:**
```javascript
// Parse form data and prepare for CRM
const input = $input.first().json.body;

// Split name into first and last
const nameParts = input.data.name?.split(' ') || ['Unknown'];
const firstName = nameParts[0];
const lastName = nameParts.slice(1).join(' ') || '';

// Format arrays
const techStack = Array.isArray(input.data.techStack) 
  ? input.data.techStack.join(', ') 
  : input.data.techStack || '';
```

**Test Cases:**

| Test Case | Input | Expected Output |
|-----------|-------|-----------------|
| TC-001: Single name | `name: "John"` | `firstName: "John"`, `lastName: ""` |
| TC-002: Two-part name | `name: "John Smith"` | `firstName: "John"`, `lastName: "Smith"` |
| TC-003: Multi-part name | `name: "John Michael Smith"` | `firstName: "John"`, `lastName: "Michael Smith"` |
| TC-004: Empty name | `name: ""` | `firstName: "Unknown"`, `lastName: ""` |
| TC-005: Missing name | `name: undefined` | `firstName: "Unknown"`, `lastName: ""` |
| TC-006: Tech stack array | `techStack: ["CRM: Salesforce", "Comm: Slack"]` | `techStack: "CRM: Salesforce, Comm: Slack"` |
| TC-007: Tech stack string | `techStack: "Salesforce"` | `techStack: "Salesforce"` |
| TC-008: Empty tech stack | `techStack: []` | `techStack: ""` |

**Unit Testing Approach:**

Since n8n doesn't have a built-in unit testing framework for Code nodes, use this approach:

1. **Create a Test Workflow** with the Code node
2. **Use Set Node** to inject test inputs
3. **Pin expected outputs** for comparison
4. **Document test cases** in the workflow description

```json
{
  "name": "Test - Process Form Data",
  "nodes": [
    {
      "name": "Test Input - Single Name",
      "type": "n8n-nodes-base.set",
      "parameters": {
        "assignments": {
          "assignments": [
            {"name": "body", "value": "{\"data\":{\"name\":\"John\",\"email\":\"john@test.com\"}}"}
          ]
        }
      }
    },
    {
      "name": "Process Form Data",
      "type": "n8n-nodes-base.code",
      "parameters": {
        "jsCode": "// (production code here)"
      }
    },
    {
      "name": "Assert - Check First Name",
      "type": "n8n-nodes-base.if",
      "parameters": {
        "conditions": {
          "conditions": [
            {
              "leftValue": "={{ $json.person.firstName }}",
              "rightValue": "John",
              "operator": {"type": "string", "operation": "equals"}
            }
          ]
        }
      }
    }
  ]
}
```

### 2.2 Testing HTTP Request Nodes in Isolation

**Mock Strategy for CRM API Calls:**

**Option A: Use n8n Data Pinning (Recommended for development)**
1. Execute the HTTP node once with real API
2. Pin the successful response
3. Use pinned data for subsequent tests
4. Create separate pinned scenarios for error cases

**Option B: Mock Server Approach (Advanced)**
```javascript
// Create a mock HTTP endpoint using n8n's webhook
// This returns predetermined responses based on request payload
{
  "name": "Mock Twenty CRM API",
  "type": "n8n-nodes-base.webhook",
  "parameters": {
    "path": "mock/crm/people",
    "responseMode": "onReceived"
  }
}
// → Set Node returns mock responses based on conditions
```

### 2.3 Mocking External API Calls

**HTTP Request Node Test Configuration:**

| Scenario | Mock Response | Test Purpose |
|----------|---------------|--------------|
| Person created | `{"data": {"id": "uuid-123", "name": {"firstName": "John"}}}` | Happy path validation |
| Duplicate email | `{"error": "DUPLICATE_DATA", "message": "Email already exists"}` | Error handling |
| Auth failure | `{"error": "UNAUTHORIZED", "status": 401}` | Credential validation |
| Rate limited | `{"error": "RATE_LIMITED", "retryAfter": 60}` | Retry logic |
| Server error | `{"error": "INTERNAL_ERROR", "status": 500}` | Failover handling |

**Implementation Steps:**

1. Create a "Mock Mode" environment variable
2. Add IF nodes before HTTP requests to route to mock responses
3. Use Set nodes to return predefined responses

```javascript
// Environment-based routing
{{ $env.MOCK_MODE === 'true' ? 'mock_response' : 'real_api' }}
```

---

## 3. Integration Testing

### 3.1 End-to-End Workflow Testing

**Full Integration Test Flow:**

```
[Test Trigger] 
    → [Inject Test Data] 
    → [Webhook Simulation] 
    → [Process Form Data] 
    → [Create Person] 
    → [Create Company] 
    → [Create Note] 
    → [Validate CRM Records] 
    → [Cleanup Test Data]
```

**Step-by-Step Testing Procedure:**

1. **Prepare Test Environment**
   ```bash
   # Set test environment variables
   export TWENTY_CRM_URL=https://crm-staging.zaplit.com
   export N8N_WEBHOOK_URL=https://n8n-staging.zaplit.com/webhook/consultation
   export TEST_DATA_PREFIX="TEST_$(date +%s)_"
   ```

2. **Create Test Payload**
   ```json
   {
     "data": {
       "name": "TEST_1742412345_John Smith",
       "email": "test_1742412345@example.com",
       "company": "TEST_1742412345_Acme Corp",
       "role": "CTO",
       "teamSize": "11-50",
       "techStack": ["CRM: Salesforce", "Comm: Slack"],
       "securityLevel": "high",
       "compliance": ["soc2", "gdpr"],
       "message": "Integration test submission"
     },
     "metadata": {
       "testId": "integration_001",
       "timestamp": "2026-03-19T20:00:00Z"
     }
   }
   ```

3. **Execute Test**
   ```bash
   curl -X POST "$N8N_WEBHOOK_URL" \
     -H "Content-Type: application/json" \
     -d @test-payload.json \
     -v
   ```

4. **Verify CRM Records**
   ```bash
   # Query Twenty CRM API for created records
   curl -X GET "$TWENTY_CRM_URL/rest/people" \
     -H "Authorization: Bearer $TOKEN" \
     -G --data-urlencode "search=TEST_1742412345"
   ```

### 3.2 Test Data Setup and Teardown

**Setup Script:**
```bash
#!/bin/bash
# setup-test-data.sh

TEST_ID="TEST_$(date +%s)"
echo "TEST_ID=$TEST_ID" > .test-env

# Create test data template
cat > test-data.json <<EOF
{
  "testId": "$TEST_ID",
  "person": {
    "name": "${TEST_ID}_John Smith",
    "email": "${TEST_ID}@test.com",
    "role": "CTO"
  },
  "company": {
    "name": "${TEST_ID}_Acme Corp"
  }
}
EOF
```

**Teardown Script:**
```bash
#!/bin/bash
# cleanup-test-data.sh

source .test-env

# Delete test records from CRM
curl -X DELETE "$TWENTY_CRM_URL/rest/people" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"filter\": \"name startsWith \\"$TEST_ID\\"\"}"

curl -X DELETE "$TWENTY_CRM_URL/rest/companies" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"filter\": \"name startsWith \\"$TEST_ID\\"\"}"
```

### 3.3 Verifying CRM Record Creation

**Validation Checklist:**

| Entity | Field | Validation Method |
|--------|-------|-------------------|
| Person | Name | API query + response comparison |
| Person | Email | Exact match verification |
| Person | Job Title | Field existence check |
| Company | Name | API query + response comparison |
| Note | Title | Contains person name |
| Note | Body | Contains all form fields |
| Note | Relationships | Linked to Person and Company |

**Automated Validation Query:**
```graphql
# Query to verify complete record creation
query VerifyTestRecord($testEmail: String!) {
  people(filter: { emails: { primaryEmail: { eq: $testEmail } } }) {
    edges {
      node {
        id
        name { firstName lastName }
        emails { primaryEmail }
        jobTitle
        company { name }
        notes {
          edges {
            node {
              title
              body
            }
          }
        }
      }
    }
  }
}
```

---

## 4. Error Scenario Testing

### 4.1 Testing API Failures

**Failure Modes to Test:**

| Error Type | HTTP Status | Expected Behavior |
|------------|-------------|-------------------|
| Authentication Failure | 401 | Log error, return 401 to client |
| Authorization Failure | 403 | Log error, return 403 to client |
| Not Found | 404 | Log error, continue workflow |
| Rate Limited | 429 | Retry with backoff, fail after 3 attempts |
| Server Error | 500 | Retry with backoff, fail after 3 attempts |
| Timeout | 504 | Retry, fail if persistent |

**Test Implementation:**

```javascript
// Error simulation in Code node
// Add this at the start of Process Form Data for testing

if ($env.TEST_ERROR_MODE === 'auth_failure') {
  return [{ json: { error: 'TEST_AUTH_FAILURE', status: 401 } }];
}

if ($env.TEST_ERROR_MODE === 'rate_limited') {
  return [{ json: { error: 'TEST_RATE_LIMIT', status: 429, retryAfter: 60 } }];
}
```

### 4.2 Testing Duplicate Records

**Twenty CRM Duplicate Handling:**

Twenty CRM enforces unique constraints on:
- Person email addresses
- Company domain names (if configured)

**Test Cases:**

| Test Case | First Request | Second Request | Expected Result |
|-----------|---------------|----------------|-----------------|
| Duplicate Email | Create person with email A | Create another with email A | Second request should update or return error |
| Duplicate Company | Create "Acme Corp" | Create "Acme Corp" again | Use existing company ID |
| Case Sensitivity | "john@test.com" | "John@Test.com" | Handle case-insensitive comparison |

**Workflow Enhancement for Duplicate Handling:**

```javascript
// Enhanced Create Person logic with duplicate check
const existingPerson = await searchPersonByEmail(email);
if (existingPerson) {
  // Update existing person instead of creating
  return await updatePerson(existingPerson.id, personData);
} else {
  return await createPerson(personData);
}
```

### 4.3 Testing Malformed Data

**Malformed Data Scenarios:**

| Scenario | Malformed Input | Expected Handling |
|----------|-----------------|-------------------|
| Missing required field | No email field | Validation error, graceful response |
| Invalid email format | "not-an-email" | Validation error before API call |
| Wrong data type | `teamSize: 123` (number vs string) | Type coercion or error |
| XSS attempt | `<script>alert('xss')</script>` | Sanitization before storage |
| SQL injection | `'; DROP TABLE people; --` | Parameterized queries prevent injection |
| Oversized payload | 10MB message field | Size limit validation |

**Validation Node Implementation:**

```javascript
// Add validation before Process Form Data node
const body = $input.first().json.body;
const errors = [];

// Required field validation
if (!body.data?.email || !body.data.email.includes('@')) {
  errors.push('Valid email is required');
}

if (!body.data?.name || body.data.name.trim() === '') {
  errors.push('Name is required');
}

// Email format validation
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
if (!emailRegex.test(body.data.email)) {
  errors.push('Invalid email format');
}

// Size validation
if (body.data?.message && body.data.message.length > 5000) {
  errors.push('Message exceeds maximum length of 5000 characters');
}

if (errors.length > 0) {
  return [{ json: { success: false, errors }, error: true }];
}

return $input.all();
```

### 4.4 Testing Timeout Scenarios

**Timeout Configuration:**

| Node | Default Timeout | Recommended Timeout |
|------|-----------------|---------------------|
| Webhook | 30s | 30s |
| HTTP Request | 60s | 30s |
| Code | 60s | 30s |

**Retry Configuration:**

```json
{
  "name": "Create Person",
  "type": "n8n-nodes-base.httpRequest",
  "parameters": {
    "options": {
      "timeout": 30000,
      "retry": {
        "enabled": true,
        "maxRetries": 3,
        "retryDelay": 2000
      }
    }
  }
}
```

---

## 5. Production Monitoring

### 5.1 Monitoring Workflow Executions

**n8n Built-in Monitoring:**

| Feature | Location | Metrics |
|---------|----------|---------|
| Execution List | /executions | Success/failure count |
| Execution Details | Drill into execution | Step-by-step logs |
| Insights | /insights | Performance trends |

**Custom Monitoring Workflow:**

Create a dedicated monitoring workflow:

```json
{
  "name": "Consultation Form Monitoring",
  "trigger": {
    "type": "n8n-nodes-base.scheduleTrigger",
    "parameters": {
      "rule": {
        "interval": [{"field": "minutes", "minutesInterval": 5}]
      }
    }
  },
  "nodes": [
    {
      "name": "Fetch Executions",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "method": "GET",
        "url": "={{ $env.N8N_BASE_URL }}/api/v1/executions",
        "authentication": "genericCredentialType",
        "genericAuthType": "httpHeaderAuth",
        "sendQueryParams": true,
        "queryParameters": {
          "parameters": [
            {"name": "workflowId", "value": "CONSULTATION_WORKFLOW_ID"},
            {"name": "since", "value": "={{ $moment().subtract(5, 'minutes').toISOString() }}"}
          ]
        }
      }
    },
    {
      "name": "Analyze Failures",
      "type": "n8n-nodes-base.code",
      "parameters": {
        "jsCode": "const executions = $input.first().json.data;\nconst failures = executions.filter(e => e.status === 'error');\nconst successRate = (executions.length - failures.length) / executions.length * 100;\nreturn [{\n  json: {\n    total: executions.length,\n    failures: failures.length,\n    successRate: successRate.toFixed(2),\n    recentFailures: failures.slice(0, 5)\n  }\n}];"
      }
    },
    {
      "name": "Alert if Failure Rate High",
      "type": "n8n-nodes-base.if",
      "parameters": {
        "conditions": {
          "conditions": [
            {
              "leftValue": "={{ $json.failures }}",
              "rightValue": "0",
              "operator": {"type": "number", "operation": "gt"}
            }
          ]
        }
      }
    }
  ]
}
```

### 5.2 Setting Up Alerts for Failures

**Multi-Channel Alert Strategy:**

| Severity | Channels | Trigger Condition |
|----------|----------|-------------------|
| Critical | SMS + Email + Slack | >3 failures in 5 minutes |
| High | Email + Slack | Any workflow failure |
| Medium | Slack | Success rate < 95% in 1 hour |
| Low | Daily digest | Weekly summary |

**Slack Alert Format:**

```javascript
{
  "text": "🚨 n8n Workflow Failure Alert",
  "attachments": [{
    "color": "danger",
    "fields": [
      {"title": "Workflow", "value": "Consultation Form → CRM", "short": true},
      {"title": "Failed Node", "value": "{{ $json.error.node }}", "short": true},
      {"title": "Error", "value": "{{ $json.error.message }}"},
      {"title": "Execution URL", "value": "{{ $env.N8N_BASE_URL }}/execution/{{ $json.executionId }}"}
    ],
    "footer": "n8n Monitoring",
    "ts": "={{ Math.floor(Date.now() / 1000) }}"
  }]
}
```

### 5.3 Execution Log Analysis

**Log Aggregation Strategy:**

1. **Export to Google Sheets** for analysis:
   - Execution ID
   - Timestamp
   - Status (success/error)
   - Failed node name
   - Error message
   - Input data summary

2. **Key Metrics to Track:**

| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| Success Rate | >99% | <95% |
| Average Execution Time | <5s | >10s |
| Failure Count (5min) | 0 | >2 |
| CRM API Response Time | <2s | >5s |

### 5.4 Success Rate Metrics

**Dashboard Configuration:**

```javascript
// Code node to calculate metrics
const executions = $input.all()[0].json;

const now = new Date();
const oneHourAgo = new Date(now - 60 * 60 * 1000);
const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);

const hourExecutions = executions.filter(e => new Date(e.startedAt) > oneHourAgo);
const dayExecutions = executions.filter(e => new Date(e.startedAt) > oneDayAgo);

const calculateMetrics = (list) => {
  const total = list.length;
  const successful = list.filter(e => e.status === 'success').length;
  const failed = total - successful;
  const successRate = total > 0 ? (successful / total * 100).toFixed(2) : 0;
  const avgDuration = total > 0 
    ? (list.reduce((sum, e) => sum + (e.stoppedAt - e.startedAt), 0) / total / 1000).toFixed(2)
    : 0;
  
  return { total, successful, failed, successRate, avgDuration };
};

return [{
  json: {
    lastHour: calculateMetrics(hourExecutions),
    last24Hours: calculateMetrics(dayExecutions),
    timestamp: now.toISOString()
  }
}];
```

---

## 6. Validation Strategies

### 6.1 Pre-Submission Form Validation

**Client-Side Validation (zaplit-org website):**

```typescript
// Form validation schema (to be implemented)
const consultationSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  company: z.string().min(1, "Company name is required"),
  role: z.string().min(1, "Role is required"),
  teamSize: z.enum(["1-10", "11-50", "51-200", "200+"]),
  techStack: z.array(z.string()).optional(),
  securityLevel: z.enum(["standard", "high", "enterprise"]),
  compliance: z.array(z.string()).optional(),
  message: z.string().max(5000, "Message too long").optional()
});
```

**Validation Layer in n8n:**

Add a validation node immediately after the webhook:

```javascript
// Validation node
const input = $input.first().json.body;
const validation = {
  valid: true,
  errors: []
};

// Required fields
const required = ['name', 'email', 'company', 'role'];
required.forEach(field => {
  if (!input.data?.[field]) {
    validation.valid = false;
    validation.errors.push(`${field} is required`);
  }
});

// Email validation
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
if (input.data?.email && !emailRegex.test(input.data.email)) {
  validation.valid = false;
  validation.errors.push('Invalid email format');
}

if (!validation.valid) {
  return [{
    json: {
      success: false,
      error: 'Validation failed',
      details: validation.errors
    }
  }];
}

return $input.all();
```

### 6.2 API Response Validation

**Response Schema Validation:**

```javascript
// Validate Create Person response
const response = $input.first().json;

const expectedSchema = {
  data: {
    id: 'string',
    name: {
      firstName: 'string',
      lastName: 'string'
    }
  }
};

// Check required fields
if (!response.data?.id) {
  throw new Error('Create Person failed: No ID in response');
}

if (!response.data?.name?.firstName) {
  throw new Error('Create Person failed: No firstName in response');
}

return $input.all();
```

### 6.3 Data Integrity Checks

**Post-Creation Verification:**

```javascript
// Verify all records were created correctly
const person = $items('Create Person')[0].json;
const company = $items('Create Company')[0].json;
const note = $items('Create Note')[0].json;

const checks = {
  personCreated: !!person.data?.id,
  companyCreated: !!company.data?.id,
  noteCreated: !!note.data?.id,
  personHasName: !!person.data?.name?.firstName,
  companyHasName: !!company.data?.name,
  noteHasContent: !!note.data?.body
};

const allPassed = Object.values(checks).every(v => v === true);

if (!allPassed) {
  return [{
    json: {
      success: false,
      error: 'Data integrity check failed',
      checks: checks
    }
  }];
}

return [{
  json: {
    success: true,
    personId: person.data.id,
    companyId: company.data.id,
    noteId: note.data.id
  }
}];
```

---

## 7. Load Testing

### 7.1 Handling Multiple Simultaneous Submissions

**Twenty CRM Rate Limits:**
- 100 requests per minute
- Batch operations: up to 60 records per request

**Load Testing Strategy:**

```bash
#!/bin/bash
# load-test.sh

N8N_WEBHOOK="https://n8n.zaplit.com/webhook/consultation"
CONCURRENT_REQUESTS=10
TOTAL_REQUESTS=100

# Generate test payloads
for i in $(seq 1 $TOTAL_REQUESTS); do
  cat > "payload_$i.json" <<EOF
{
  "data": {
    "name": "Load Test User $i",
    "email": "loadtest_$i@example.com",
    "company": "Load Test Corp $i",
    "role": "Tester",
    "message": "Load testing submission $i"
  }
}
EOF
done

# Run parallel requests
echo "Starting load test with $CONCURRENT_REQUESTS concurrent requests..."
seq 1 $TOTAL_REQUESTS | xargs -P $CONCURRENT_REQUESTS -I {} \
  curl -s -X POST "$N8N_WEBHOOK" \
    -H "Content-Type: application/json" \
    -d @payload_{}.json \
    -w "%{http_code},%{time_total}\n" \
    -o /dev/null

# Cleanup
rm -f payload_*.json
```

### 7.2 Rate Limiting Considerations

**Client-Side Rate Limiting:**

```javascript
// Implement in zaplit-org form submission
const rateLimiter = {
  lastSubmission: 0,
  minInterval: 5000, // 5 seconds between submissions
  
  canSubmit() {
    const now = Date.now();
    if (now - this.lastSubmission < this.minInterval) {
      return false;
    }
    this.lastSubmission = now;
    return true;
  }
};
```

**n8n-Side Rate Limiting:**

Add a rate limit check node:

```javascript
// Rate limiting using n8n's static data
const now = Date.now();
const windowMs = 60 * 1000; // 1 minute
const maxRequests = 100;

// Get or initialize rate limit data
let rateData = $getWorkflowStaticData('global');
if (!rateData.requests) {
  rateData.requests = [];
}

// Clean old requests
rateData.requests = rateData.requests.filter(
  time => now - time < windowMs
);

// Check limit
if (rateData.requests.length >= maxRequests) {
  return [{
    json: {
      success: false,
      error: 'Rate limit exceeded',
      retryAfter: Math.ceil((rateData.requests[0] + windowMs - now) / 1000)
    }
  }];
}

// Record this request
rateData.requests.push(now);

return $input.all();
```

### 7.3 Performance Bottlenecks

**Identified Bottlenecks:**

| Component | Potential Issue | Mitigation |
|-----------|-----------------|------------|
| Sequential API calls | 4 sequential HTTP requests | Parallelize where possible |
| Twenty CRM response time | Slow API responses | Add caching, implement retries |
| Large payloads | Big note content | Compress/truncate if needed |
| n8n instance resources | Memory/CPU limits | Monitor and scale |

**Optimization Recommendations:**

1. **Parallel Execution** where dependencies allow:
   ```
   Create Person ─┐
                  ├→ Create Note (when both complete)
   Create Company ─┘
   ```

2. **Timeout Configuration:**
   - Set aggressive timeouts (10-15s per HTTP request)
   - Fail fast and alert rather than hang

3. **Async Processing Option:**
   ```
   Webhook → Queue → Background Processing → CRM
          ↘ Immediate Response
   ```

---

## 8. Test Case Matrix

### 8.1 Happy Path Test Cases

| ID | Test Case | Steps | Expected Result | Priority |
|----|-----------|-------|-----------------|----------|
| HP-001 | Complete form submission | Submit all required fields | Person, Company, Note created | P0 |
| HP-002 | Minimal form submission | Submit only required fields | Person, Company created | P0 |
| HP-003 | Full tech stack selection | Select all tech stack options | Tech stack formatted in note | P1 |
| HP-004 | Multiple compliance options | Select multiple compliance | All compliance items in note | P1 |
| HP-005 | Long message | Submit 5000 char message | Message stored correctly | P1 |
| HP-006 | Special characters in name | Name with accents, hyphens | Name split correctly | P2 |

### 8.2 Error Scenario Test Cases

| ID | Test Case | Steps | Expected Result | Priority |
|----|-----------|-------|-----------------|----------|
| ERR-001 | Missing required field | Submit without email | Validation error returned | P0 |
| ERR-002 | Invalid email format | Submit "not-an-email" | Validation error returned | P0 |
| ERR-003 | Duplicate email | Submit same email twice | Graceful handling | P0 |
| ERR-004 | CRM API 500 error | Simulate server error | Retry 3x, then fail with alert | P0 |
| ERR-005 | CRM API timeout | Delay response >30s | Timeout error, alert sent | P0 |
| ERR-006 | Rate limiting | Submit >100 req/min | Rate limit response | P1 |
| ERR-007 | Invalid auth token | Use expired JWT | Auth error, alert sent | P0 |
| ERR-008 | Malformed JSON | Send invalid JSON | Parse error handled | P1 |
| ERR-009 | XSS attempt | Include script tags | Content sanitized | P1 |
| ERR-010 | Oversized payload | Send >1MB payload | Size limit error | P2 |

### 8.3 Edge Case Test Cases

| ID | Test Case | Steps | Expected Result | Priority |
|----|-----------|-------|-----------------|----------|
| EDGE-001 | Single character name | Name: "X" | FirstName: "X", LastName: "" | P2 |
| EDGE-002 | Very long name | Name: 100 chars | Name split at first space | P2 |
| EDGE-003 | Unicode characters | Name: "姓名测试" | Stored correctly | P2 |
| EDGE-004 | Empty optional fields | No message, no techStack | Note created without these | P1 |
| EDGE-005 | Simultaneous submissions | 10 concurrent requests | All processed correctly | P0 |
| EDGE-006 | Network interruption | Disconnect mid-request | Error logged, alert sent | P1 |

---

## 9. Current Setup Gaps

### 9.1 Critical Gaps

| Gap | Impact | Priority | Remediation |
|-----|--------|----------|-------------|
| No duplicate handling | Duplicate person/company records | P0 | Add duplicate check nodes |
| No error handling | Silent failures, data loss | P0 | Add error branches to all HTTP nodes |
| No retry logic | Transient failures cause total failure | P0 | Configure retry options |
| No input validation | Malformed data reaches CRM | P0 | Add validation node |
| No monitoring workflow | Failures go unnoticed | P1 | Create monitoring workflow |

### 9.2 Testing Infrastructure Gaps

| Gap | Impact | Priority | Remediation |
|-----|--------|----------|-------------|
| No automated test suite | Manual testing only | P1 | Create test workflows |
| No mock server | Testing requires live CRM | P2 | Create mock workflow |
| No test data cleanup | Test records pollute CRM | P2 | Implement cleanup scripts |
| No performance baseline | Can't detect degradation | P2 | Establish metrics |

### 9.3 Production Readiness Gaps

| Gap | Impact | Priority | Remediation |
|-----|--------|----------|-------------|
| No alerting | Failures discovered late | P0 | Set up Slack/email alerts |
| No execution logging | Hard to debug issues | P1 | Export logs to Sheets/DB |
| No health check endpoint | Can't verify system status | P1 | Create health check workflow |
| No rate limiting | Vulnerable to abuse | P2 | Implement rate limiting |

---

## 10. Implementation Roadmap

### Phase 1: Critical Fixes (Week 1)

- [ ] Add input validation node
- [ ] Add error handling to all HTTP nodes
- [ ] Configure retry logic (3 retries, exponential backoff)
- [ ] Implement basic duplicate checking
- [ ] Set up error alert workflow

### Phase 2: Testing Infrastructure (Week 2)

- [ ] Create unit test workflows for Code nodes
- [ ] Set up pinned test data for each scenario
- [ ] Create integration test script
- [ ] Document test data setup/cleanup procedures

### Phase 3: Monitoring & Observability (Week 3)

- [ ] Create monitoring workflow
- [ ] Set up Google Sheets logging
- [ ] Configure Slack alerts
- [ ] Create health check endpoint

### Phase 4: Advanced Testing (Week 4)

- [ ] Implement load testing scripts
- [ ] Set up rate limiting
- [ ] Create mock server for isolated testing
- [ ] Document complete testing procedures

---

## Appendix A: Quick Reference Commands

### Manual Testing

```bash
# Test webhook directly
curl -X POST https://n8n.zaplit.com/webhook/consultation \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "name": "Test User",
      "email": "test@example.com",
      "company": "TestCorp",
      "role": "CTO",
      "teamSize": "11-50",
      "techStack": ["React", "Node.js"],
      "securityLevel": "high",
      "compliance": ["soc2"],
      "message": "Test message"
    }
  }'

# Query Twenty CRM for test records
curl -X GET "https://crm.zaplit.com/rest/people" \
  -H "Authorization: Bearer $TOKEN" \
  -G --data-urlencode "search=Test User"
```

### Health Check

```bash
# Check n8n instance health
curl -s https://n8n.zaplit.com/healthz

# Check Twenty CRM health
curl -s https://crm.zaplit.com/healthz
```

---

## Appendix B: Recommended n8n Configuration

### Workflow Settings

```json
{
  "settings": {
    "executionOrder": "v1",
    "saveExecutionProgress": true,
    "saveManualExecutions": true,
    "callerPolicy": "workflowsFromSameOwner",
    "errorWorkflow": "ERROR_HANDLING_WORKFLOW_ID"
  }
}
```

### Error Handling Node Configuration

```json
{
  "parameters": {
    "onError": "continue",
    "options": {
      "timeout": 30000,
      "retry": {
        "enabled": true,
        "maxRetries": 3,
        "retryDelay": 2000
      }
    }
  }
}
```

---

## Summary

This testing strategy provides a comprehensive framework for ensuring the reliability and correctness of the n8n-Twenty CRM integration. Key priorities:

1. **Immediate**: Implement error handling, retries, and input validation
2. **Short-term**: Set up monitoring and alerting
3. **Medium-term**: Build automated testing infrastructure
4. **Ongoing**: Regular load testing and performance monitoring

By following this strategy, you can ensure that form submissions are reliably processed and any issues are detected and resolved quickly.
