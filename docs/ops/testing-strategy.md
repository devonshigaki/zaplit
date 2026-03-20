---
title: Testing Strategy Guide
topics:
  - N8N_TESTING_QUICK_START.md
  - N8N_WEBHOOK_E2E_TESTING_GUIDE.md
  - FINAL_EXECUTION_REPORT.md
  - ERROR_RECOVERY_AND_DR_GUIDE.md
---

# Testing Strategy Guide

## Quick Reference

### Quick Testing Commands
```bash
# 1. Health Check
./scripts/tests/health-check.sh

# 2. Integration Test
export TWENTY_TOKEN="your_token_here"
./scripts/tests/run-integration-test.sh

# 3. Quick API Test
curl -s -X POST https://n8n.zaplit.com/webhook/consultation \
  -H "Content-Type: application/json" \
  -d '{"data":{"name":"Test User","email":"test@example.com","company":"Test Corp","role":"CTO"}}' \
  | jq .

# 4. Load Test
./scripts/tests/load-test.sh 10 100  # 10 concurrent, 100 total

# 5. Verify CRM Records
./scripts/tests/verify-crm-records.sh TEST_1742412345

# 6. Cleanup Test Data
./scripts/tests/cleanup-test-data.sh TEST_1742412345
```

### Test Priority Matrix

| Priority | Tests |
|----------|-------|
| **P0 - Critical** | Happy path, validation, CRM API failures, duplicates |
| **P1 - High** | Edge cases, error responses, rate limiting, concurrent submissions |
| **P2 - Medium** | Long messages, XSS prevention, performance benchmarks |

### Test Matrix Summary

| Test Type | Command | Duration |
|-----------|---------|----------|
| Health Check | `./health-check.sh` | ~5s |
| Integration Test | `./run-integration-test.sh` | ~10s |
| Load Test (light) | `./load-test.sh 5 50` | ~15s |
| Load Test (full) | `./load-test.sh 20 500` | ~2min |
| Verify Records | `./verify-crm-records.sh <id>` | ~3s |
| Cleanup | `./cleanup-test-data.sh <id>` | ~5s |

---

## Detailed Procedures

### 1. Test Data Strategy

#### Test Data Naming Convention
```
Format: TEST_<timestamp>_<descriptive-name>

Examples:
- TEST_1742412345_John Smith
- TEST_1742412345_Acme Corporation
- TEST_1742412345_john.smith@test.example.com
```

#### Test Data Factory (JavaScript)
```javascript
class TestDataFactory {
  constructor() {
    this.testId = `TEST_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  }

  generateFullSubmission(overrides = {}) {
    return {
      data: {
        name: overrides.name || `${this.testId}_John Smith`,
        email: overrides.email || `${this.testId}@test.example.com`.toLowerCase(),
        company: overrides.company || `${this.testId}_Acme Corporation`,
        role: overrides.role || 'CTO',
        teamSize: overrides.teamSize || '11-50',
        techStack: overrides.techStack || ['CRM: Salesforce', 'Comm: Slack'],
        securityLevel: overrides.securityLevel || 'high',
        compliance: overrides.compliance || ['soc2', 'gdpr'],
        message: overrides.message || 'Integration test submission'
      },
      metadata: {
        testId: this.testId,
        timestamp: new Date().toISOString()
      }
    };
  }
}
```

#### Test Data Cleanup Script
```bash
#!/bin/bash
# cleanup-test-data.sh

TWENTY_CRM_URL="${TWENTY_CRM_URL:-https://crm.zaplit.com}"
TEST_PREFIX="${1:-TEST_}"

# Query and delete test people
PEOPLE_RESPONSE=$(curl -s -X GET "$TWENTY_CRM_URL/rest/people" \
    -H "Authorization: Bearer $TWENTY_TOKEN" \
    -G --data-urlencode "filter={\"name\":{\"startsWith\":\"$TEST_PREFIX\"}}")

echo "$PEOPLE_RESPONSE" | jq -r '.data[].id' | while read personId; do
    curl -s -X DELETE "$TWENTY_CRM_URL/rest/people/$personId" \
        -H "Authorization: Bearer $TWENTY_TOKEN"
done
```

### 2. Test Case Matrix

#### Happy Path Tests

| ID | Test Case | Input | Expected Output |
|----|-----------|-------|-----------------|
| HP-001 | Complete submission | All fields | 200 OK, all records created |
| HP-002 | Minimal submission | Required only | 200 OK, Person & Company created |
| HP-003 | Full tech stack | All 10+ options | Note includes all selections |
| HP-004 | All compliance | SOC2, GDPR, HIPAA | Note includes all compliance |
| HP-005 | Long message | 5000 chars | Message stored completely |
| HP-006 | Special chars | Unicode, accents | Properly encoded |

#### Validation Failure Tests

| ID | Test Case | Input | Expected Output |
|----|-----------|-------|-----------------|
| VAL-001 | Missing email | No email | 400 Bad Request |
| VAL-002 | Invalid email | "not-an-email" | 400, email format error |
| VAL-003 | Missing name | Empty name | 400, name required |
| VAL-004 | Missing company | No company | 400, company required |
| VAL-005 | XSS attempt | `<script>alert(1)</script>` | 400, sanitized |

#### CRM API Failure Tests

| ID | Test Case | Simulation | Expected Behavior |
|----|-----------|------------|-------------------|
| CRM-001 | Auth failure | Invalid token | 401 response, alert sent |
| CRM-002 | Rate limiting | 429 response | Retry 3x with backoff |
| CRM-003 | Server error | 500 response | Retry 3x, graceful fail |
| CRM-004 | Timeout | 30s delay | Timeout error after 10s |

#### Edge Case Tests

| ID | Test Case | Input | Expected Result |
|----|-----------|-------|-----------------|
| EDGE-001 | Single char name | "X" | FirstName: "X", LastName: "" |
| EDGE-002 | Unicode name | "姓名测试" | Stored correctly |
| EDGE-003 | Empty arrays | `techStack: []` | Note shows empty |
| EDGE-004 | Duplicate email | Same email twice | Update or error handled |
| EDGE-005 | Concurrent submissions | 10 parallel | All processed, no duplicates |

### 3. Testing Approaches

#### Testing Pyramid
```
                    /\
                   /  \
                  / E2E \          ← Browser automation
                 /________\
                /          \
               / Integration \      ← API testing
              /______________\
             /                \
            /   Component/Unit  \    ← Node-level testing
           /____________________\
```

#### Direct API Testing
```bash
#!/bin/bash
# test-webhook-api.sh

N8N_WEBHOOK="${N8N_WEBHOOK:-https://n8n.zaplit.com/webhook/consultation}"
TEST_ID="TEST_$(date +%s)"

# Test 1: Happy Path
curl -s -X POST "$N8N_WEBHOOK" \
  -H "Content-Type: application/json" \
  -d "{
    \"data\": {
      \"name\": \"$TEST_ID John Smith\",
      \"email\": \"$TEST_ID@example.com\",
      \"company\": \"$TEST_ID Acme Corp\",
      \"role\": \"CTO\",
      \"teamSize\": \"11-50\",
      \"message\": \"Test message\"
    }
  }" | jq .

# Test 2: Validation Error
curl -s -X POST "$N8N_WEBHOOK" \
  -H "Content-Type: application/json" \
  -d '{"data":{"name":"Test User","company":"Test Corp"}}' | jq .
```

#### UI Testing (Playwright)
```javascript
// e2e-test-consultation-form.spec.ts
import { test, expect } from '@playwright/test';

const TEST_ID = `TEST_${Date.now()}`;

test.describe('Consultation Form E2E', () => {
  test('complete form submission creates CRM records', async ({ page }) => {
    await page.goto('https://zaplit.com/consultation');
    
    await page.fill('[name="name"]', `${TEST_ID} John Smith`);
    await page.fill('[name="email"]', `${TEST_ID}@example.com`);
    await page.fill('[name="company"]', `${TEST_ID} Acme Corp`);
    await page.click('button[type="submit"]');
    
    await expect(page.locator('.success-message')).toBeVisible();
    
    // Verify CRM records via API
    const person = await findPersonByEmail(`${TEST_ID}@example.com`);
    expect(person).toBeTruthy();
  });
});
```

### 4. Load Testing

#### Concurrent Submission Testing
```bash
#!/bin/bash
# load-test.sh

N8N_WEBHOOK="${N8N_WEBHOOK:-https://n8n.zaplit.com/webhook/consultation}"
CONCURRENT="${1:-10}"
TOTAL="${2:-100}"
TEST_ID="LOAD_$(date +%s)"

TMPDIR=$(mktemp -d)

# Generate payloads
for i in $(seq 1 $TOTAL); do
    cat > "$TMPDIR/payload_$i.json" <<EOF
{
  "data": {
    "name": "$TEST_ID User $i",
    "email": "$TEST_ID_$i@test.com",
    "company": "$TEST_ID Corp $i",
    "role": "Tester"
  }
}
EOF
done

# Execute load test
echo "sequence,status,response_time" > "$TMPDIR/results.csv"

seq 1 $TOTAL | xargs -P $CONCURRENT -I {} \
    bash -c 'curl -s -w "\n%{http_code},%{time_total}" \
        -X POST "'$N8N_WEBHOOK'" \
        -H "Content-Type: application/json" \
        -d "@'$TMPDIR'/payload_{}.json" \
        -o /dev/null >> "'$TMPDIR'/results.csv"'

# Analyze results
SUCCESS=$(grep -c ',200,' "$TMPDIR/results.csv" || echo "0")
echo "Success Rate: $(echo "scale=2; $SUCCESS * 100 / $TOTAL" | bc)%"
```

#### Capacity Planning Matrix

| Concurrent Users | Requests/Min | Expected p95 Latency | Resource Requirement |
|------------------|--------------|----------------------|----------------------|
| 1 | 6 | 3s | 1 CPU, 512MB RAM |
| 5 | 30 | 3.5s | 1 CPU, 1GB RAM |
| 10 | 60 | 4s | 2 CPU, 2GB RAM |
| 20 | 120 | 5s | 2 CPU, 4GB RAM |
| 50 | 300 | 8s | 4 CPU, 8GB RAM + Queue Mode |
| 100+ | 600+ | 10s+ | Queue Mode + Auto-scaling |

### 5. Error Recovery Testing

#### Retry Strategy Testing
```javascript
// Retry Logic Code Node
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

async function executeWithRetry(operation) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await operation();
    } catch (error) {
      const isRetryable = [
        'ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED',
        'ENOTFOUND', 'EAI_AGAIN', 429, 502, 503, 504
      ].some(code => error.message?.includes(code));
      
      if (!isRetryable || attempt === MAX_RETRIES) throw error;
      
      const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}
```

#### Circuit Breaker Testing
```javascript
const CIRCUIT_CONFIG = {
  failureThreshold: 5,
  resetTimeoutMs: 60000,
  halfOpenMaxCalls: 3
};

// Test circuit opens after threshold
// Test circuit closes after timeout
// Test half-open state
```

### 6. Verification Methods

#### CRM Record Verification Checklist
```javascript
const verificationSteps = {
  person: {
    required: ['id', 'name.firstName', 'emails[0].email'],
    validate: (person, expected) => ({
      nameMatches: person.name.firstName.includes(expected.testId),
      emailMatches: person.emails[0].email === expected.email,
      hasJobTitle: !!person.jobTitle,
      createdRecently: new Date(person.createdAt) > expected.testStartTime
    })
  },
  company: {
    required: ['id', 'name'],
    validate: (company, expected) => ({
      nameMatches: company.name.includes(expected.testId),
      createdRecently: new Date(company.createdAt) > expected.testStartTime
    })
  },
  note: {
    required: ['id', 'body'],
    validate: (note, expected) => ({
      containsMessage: note.body.includes(expected.message),
      linkedToPerson: note.person === expected.personId,
      linkedToCompany: note.company === expected.companyId
    })
  }
};
```

#### Response Validation
```javascript
const responseSchema = {
  success: {
    statusCode: 200,
    body: {
      success: true,
      message: 'string'
    }
  },
  validationError: {
    statusCode: 400,
    body: {
      success: false,
      error: 'string',
      errors: 'array'
    }
  }
};
```

### 7. Regression Testing

#### Post-Change Checklist
```yaml
regression_checklist:
  workflow_changes:
    - name: "JSON structure validation"
      command: "jq empty n8n-workflow-consultation-to-crm-complete.json"
    
    - name: "Import test"
      steps:
        - Import workflow to test n8n instance
        - Verify all nodes load without errors
    
  functional_tests:
    - test_case: HP-001
      description: "Happy path - complete submission"
      must_pass: true
    
    - test_case: VAL-001
      description: "Validation - missing email"
      must_pass: true
```

### 8. Common Issues

| Issue | Solution |
|-------|----------|
| 404 from webhook | Check webhook path is `/consultation` |
| 401 from CRM | Refresh JWT token in credentials |
| Test data left in CRM | Run cleanup script with test ID |
| Timeout errors | Check CRM API health |
| Rate limited | Reduce concurrent requests |

---

## File Structure

```
scripts/tests/
├── health-check.sh              # Quick health check
├── run-integration-test.sh      # Full integration test
├── load-test.sh                 # Performance testing
├── verify-crm-records.sh        # Verify created records
├── cleanup-test-data.sh         # Remove test data
├── test-data-factory.js         # Generate test data
└── run-complete-test-suite.sh   # Run all tests
```

---

## Related Documents

- **Testing Quick Start:** [N8N_TESTING_QUICK_START.md](../../N8N_TESTING_QUICK_START.md)
- **E2E Testing Guide:** [N8N_WEBHOOK_E2E_TESTING_GUIDE.md](../../N8N_WEBHOOK_E2E_TESTING_GUIDE.md)
- **Error Recovery Guide:** [ERROR_RECOVERY_AND_DR_GUIDE.md](../../ERROR_RECOVERY_AND_DR_GUIDE.md)
- **Final Execution Report:** [FINAL_EXECUTION_REPORT.md](../../FINAL_EXECUTION_REPORT.md)
- **Incident Response Runbook:** [runbooks/RB002-incident-response.md](runbooks/RB002-incident-response.md)
