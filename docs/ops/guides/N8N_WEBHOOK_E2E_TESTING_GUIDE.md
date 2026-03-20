# End-to-End Testing Guide: n8n Webhook Workflows with Twenty CRM

**Comprehensive Testing Strategy for Webhook → Validation → CRM Operations → Response Workflows**

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Test Data Strategy](#2-test-data-strategy)
3. [Testing Approaches](#3-testing-approaches)
4. [Test Case Matrix](#4-test-case-matrix)
5. [Verification Methods](#5-verification-methods)
6. [Load Testing](#6-load-testing)
7. [Regression Testing](#7-regression-testing)
8. [Automation Scripts](#8-automation-scripts)
9. [CI/CD Integration](#9-cicd-integration)

---

## 1. Executive Summary

### Current Workflow Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Webhook Trigger │────▶│  Process Form    │────▶│  Create Person  │
│  (POST /consult) │     │  (Code Node)     │     │  (HTTP Request) │
└─────────────────┘     └──────────────────┘     └────────┬────────┘
                                                          │
                              ┌───────────────────────────┘
                              ▼
                    ┌─────────────────┐     ┌─────────────────┐
                    │  Create Company │────▶│  Create Note    │
                    │  (HTTP Request) │     │  (HTTP Request) │
                    └─────────────────┘     └────────┬────────┘
                                                     │
                                                     ▼
                                            ┌─────────────────┐
                                            │  Response Node  │
                                            │  (JSON Response)│
                                            └─────────────────┘
```

### Testing Objectives

| Objective | Success Criteria |
|-----------|-----------------|
| Data Integrity | Person, Company, Note created correctly with proper relationships |
| Response Time | < 10 seconds end-to-end |
| Success Rate | > 99% for valid submissions |
| Error Handling | Graceful failures with appropriate error messages |
| Data Isolation | Test data does not pollute production CRM |

---

## 2. Test Data Strategy

### 2.1 Test Data Philosophy

**Use fake but realistic-looking data** that can be easily identified and cleaned up.

### 2.2 Test Data Naming Convention

```
Format: TEST_<timestamp>_<descriptive-name>

Examples:
- TEST_1742412345_John Smith
- TEST_1742412345_Acme Corporation
- TEST_1742412345_john.smith@test.example.com
```

### 2.3 Test Data Factory

```javascript
// test-data-factory.js
class TestDataFactory {
  constructor() {
    this.testId = `TEST_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  }

  generatePerson(overrides = {}) {
    return {
      name: overrides.name || `${this.testId}_John Smith`,
      email: overrides.email || `${this.testId}@test.example.com`.toLowerCase(),
      role: overrides.role || 'CTO',
      ...overrides
    };
  }

  generateCompany(overrides = {}) {
    return {
      name: overrides.name || `${this.testId}_Acme Corporation`,
      ...overrides
    };
  }

  generateFullSubmission(overrides = {}) {
    const person = this.generatePerson(overrides.person);
    const company = this.generateCompany(overrides.company);
    
    return {
      data: {
        ...person,
        ...company,
        teamSize: overrides.teamSize || '11-50',
        techStack: overrides.techStack || ['CRM: Salesforce', 'Comm: Slack'],
        securityLevel: overrides.securityLevel || 'high',
        compliance: overrides.compliance || ['soc2', 'gdpr'],
        message: overrides.message || 'Integration test submission'
      },
      metadata: {
        testId: this.testId,
        timestamp: new Date().toISOString(),
        testCase: overrides.testCase || 'standard'
      }
    };
  }
}

module.exports = TestDataFactory;
```

### 2.4 Edge Case Test Data

| Category | Test Data | Expected Behavior |
|----------|-----------|-------------------|
| **Special Characters** | `O'Connor-Smith`, `José García`, `姓名测试` | Proper handling of unicode and special chars |
| **Long Strings** | Name: 100 chars, Message: 5000 chars | Truncation or acceptance with warnings |
| **Empty Fields** | `name: ""`, `message: null` | Validation error or default values |
| **HTML/Script Injection** | `<script>alert('xss')</script>` | Content sanitization |
| **SQL Injection** | `'; DROP TABLE people; --` | Parameterized query protection |
| **Email Edge Cases** | `user+tag@example.com`, `user.name@sub.domain.co.uk` | Valid acceptance |
| **Array Edge Cases** | Empty arrays, single item, 50+ items | Proper formatting in note |

### 2.5 Test Data Cleanup Strategy

```bash
#!/bin/bash
# cleanup-test-data.sh

TWENTY_CRM_URL="${TWENTY_CRM_URL:-https://crm.zaplit.com}"
TWENTY_TOKEN="${TWENTY_TOKEN:-}"
TEST_PREFIX="${1:-TEST_}"

echo "Cleaning up test data with prefix: $TEST_PREFIX"

# 1. Query for test people
PEOPLE_RESPONSE=$(curl -s -X GET "$TWENTY_CRM_URL/rest/people" \
    -H "Authorization: Bearer $TWENTY_TOKEN" \
    -G --data-urlencode "filter={\"name\":{\"startsWith\":\"$TEST_PREFIX\"}}")

# 2. Delete each test person
echo "$PEOPLE_RESPONSE" | jq -r '.data[].id' | while read personId; do
    echo "Deleting person: $personId"
    curl -s -X DELETE "$TWENTY_CRM_URL/rest/people/$personId" \
        -H "Authorization: Bearer $TWENTY_TOKEN"
done

# 3. Query for test companies
COMPANIES_RESPONSE=$(curl -s -X GET "$TWENTY_CRM_URL/rest/companies" \
    -H "Authorization: Bearer $TWENTY_TOKEN" \
    -G --data-urlencode "filter={\"name\":{\"startsWith\":\"$TEST_PREFIX\"}}")

# 4. Delete each test company
echo "$COMPANIES_RESPONSE" | jq -r '.data[].id' | while read companyId; do
    echo "Deleting company: $companyId"
    curl -s -X DELETE "$TWENTY_CRM_URL/rest/companies/$companyId" \
        -H "Authorization: Bearer $TWENTY_TOKEN"
done

echo "Cleanup complete"
```

### 2.6 Test Data Isolation Levels

| Level | Approach | Use Case |
|-------|----------|----------|
| **L1: Timestamp Prefix** | `TEST_<timestamp>_` | Parallel test execution |
| **L2: Test Run ID** | `TEST_<run-id>_<timestamp>_` | CI/CD pipeline isolation |
| **L3: Developer Prefix** | `TEST_<dev-name>_<timestamp>_` | Shared dev environment |
| **L4: UUID Suffix** | `TEST_<timestamp>_<uuid>_` | Maximum isolation |

---

## 3. Testing Approaches

### 3.1 Testing Pyramid for n8n Workflows

```
                    /\
                   /  \
                  / E2E \          ← Browser automation, full flow
                 /________\
                /          \
               / Integration \      ← API testing, CRM verification
              /______________\
             /                \
            /   Component/Unit  \    ← Node-level testing with pinned data
           /____________________\
```

### 3.2 Direct API Testing (Recommended for CI/CD)

```bash
#!/bin/bash
# test-webhook-api.sh

N8N_WEBHOOK="${N8N_WEBHOOK:-https://n8n.zaplit.com/webhook/consultation}"
TEST_ID="TEST_$(date +%s)"

echo "=== API Test: $TEST_ID ==="

# Test 1: Happy Path
echo "Test 1: Happy Path"
curl -s -X POST "$N8N_WEBHOOK" \
  -H "Content-Type: application/json" \
  -d "{
    \"data\": {
      \"name\": \"$TEST_ID John Smith\",
      \"email\": \"$TEST_ID@example.com\",
      \"company\": \"$TEST_ID Acme Corp\",
      \"role\": \"CTO\",
      \"teamSize\": \"11-50\",
      \"techStack\": [\"CRM: Salesforce\", \"Comm: Slack\"],
      \"securityLevel\": \"high\",
      \"compliance\": [\"soc2\"],
      \"message\": \"Test message\"
    },
    \"metadata\": { \"testId\": \"$TEST_ID\", \"testCase\": \"happy-path\" }
  }" | jq .

# Test 2: Validation Error
echo -e "\nTest 2: Validation Error (missing email)"
curl -s -X POST "$N8N_WEBHOOK" \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "name": "Test User",
      "company": "Test Corp"
    }
  }' | jq .

# Test 3: Edge Case - Special Characters
echo -e "\nTest 3: Special Characters"
curl -s -X POST "$N8N_WEBHOOK" \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "name": "José García O'\''Connor",
      "email": "jose.garcia@example.com",
      "company": "Café & Co.",
      "role": "CEO",
      "message": "Test with unicode: 你好世界 émojis 🎉"
    },
    "metadata": { "testCase": "unicode" }
  }' | jq .
```

### 3.3 UI Testing (Browser Automation)

```javascript
// e2e-test-consultation-form.spec.ts
import { test, expect } from '@playwright/test';

const TEST_ID = `TEST_${Date.now()}`;
const TWENTY_API_URL = process.env.TWENTY_CRM_URL || 'https://crm.zaplit.com';
const TWENTY_TOKEN = process.env.TWENTY_TOKEN;

test.describe('Consultation Form E2E', () => {
  test.afterAll(async () => {
    // Cleanup test data
    await cleanupTestData(TEST_ID);
  });

  test('complete form submission creates CRM records', async ({ page }) => {
    // 1. Navigate to form
    await page.goto('https://zaplit.com/consultation');
    
    // 2. Fill form
    await page.fill('[name="name"]', `${TEST_ID} John Smith`);
    await page.fill('[name="email"]', `${TEST_ID}@example.com`);
    await page.fill('[name="company"]', `${TEST_ID} Acme Corp`);
    await page.selectOption('[name="teamSize"]', '11-50');
    await page.fill('[name="message"]', 'E2E test submission');
    
    // 3. Submit form
    await page.click('button[type="submit"]');
    
    // 4. Verify success message
    await expect(page.locator('.success-message')).toBeVisible();
    
    // 5. Wait for async processing
    await page.waitForTimeout(3000);
    
    // 6. Verify CRM records via API
    const person = await findPersonByEmail(`${TEST_ID}@example.com`);
    expect(person).toBeTruthy();
    expect(person.name.firstName).toBe(`${TEST_ID}`);
    
    const company = await findCompanyByName(`${TEST_ID} Acme Corp`);
    expect(company).toBeTruthy();
    
    // 7. Verify note was created
    const notes = await findNotesByPersonId(person.id);
    expect(notes.length).toBeGreaterThan(0);
    expect(notes[0].body).toContain('E2E test submission');
  });
});

async function cleanupTestData(testId: string) {
  // Implementation using Twenty CRM API
}

async function findPersonByEmail(email: string) {
  const response = await fetch(`${TWENTY_API_URL}/rest/people?filter={"emails":{"primaryEmail":{"eq":"${email}"}}}`, {
    headers: { 'Authorization': `Bearer ${TWENTY_TOKEN}` }
  });
  const data = await response.json();
  return data.data?.[0];
}
```

### 3.4 Mocking vs Real CRM Calls

| Approach | When to Use | Pros | Cons |
|----------|-------------|------|------|
| **Real CRM (Staging)** | Integration testing, E2E testing | Tests actual integration | Slower, requires cleanup |
| **Mock Server** | Unit testing, CI/CD speed | Fast, deterministic | May not catch real API issues |
| **Data Pinning** | Development, debugging | Real data captured once | Stale data, not for CI |
| **Hybrid** | Complex test suites | Balance of speed and accuracy | More setup required |

### 3.5 Mock Server Implementation

```javascript
// mock-twenty-crm.js
const express = require('express');
const app = express();
app.use(express.json());

const mockData = {
  people: new Map(),
  companies: new Map(),
  notes: new Map()
};

// Create Person
app.post('/rest/people', (req, res) => {
  const id = `person_${Date.now()}`;
  const person = { id, ...req.body, createdAt: new Date().toISOString() };
  mockData.people.set(id, person);
  res.status(201).json({ data: person });
});

// Create Company
app.post('/rest/companies', (req, res) => {
  const id = `company_${Date.now()}`;
  const company = { id, ...req.body, createdAt: new Date().toISOString() };
  mockData.companies.set(id, company);
  res.status(201).json({ data: company });
});

// Create Note
app.post('/rest/notes', (req, res) => {
  const id = `note_${Date.now()}`;
  const note = { id, ...req.body, createdAt: new Date().toISOString() };
  mockData.notes.set(id, note);
  res.status(201).json({ data: note });
});

// Simulate errors
app.post('/simulate/error/:code', (req, res) => {
  const code = parseInt(req.params.code);
  res.status(code).json({ 
    error: 'Simulated Error',
    message: `This is a simulated ${code} error`
  });
});

app.listen(3001, () => console.log('Mock Twenty CRM running on port 3001'));
```

### 3.6 Test Isolation Strategy

```yaml
# test-environments.yml
environments:
  local:
    n8n_url: http://localhost:5678
    crm_url: http://localhost:3001  # Mock server
    cleanup: false
    
  staging:
    n8n_url: https://n8n-staging.zaplit.com
    crm_url: https://crm-staging.zaplit.com
    cleanup: true
    test_prefix: TEST_STAGING_
    
  production:
    n8n_url: https://n8n.zaplit.com
    crm_url: https://crm.zaplit.com
    cleanup: true
    test_prefix: TEST_PROD_
    read_only: true  # Only health checks, no mutations
```

---

## 4. Test Case Matrix

### 4.1 Happy Path Tests

| ID | Test Case | Input | Expected Output | Priority |
|----|-----------|-------|-----------------|----------|
| HP-001 | Complete submission | All fields filled | 200 OK, all records created | P0 |
| HP-002 | Minimal submission | Required fields only | 200 OK, Person & Company created | P0 |
| HP-003 | Full tech stack | All 10+ tech options | Note includes all selections | P1 |
| HP-004 | All compliance | SOC2, GDPR, HIPAA, CCPA | Note includes all compliance | P1 |
| HP-005 | Long message | 5000 char message | Message stored completely | P1 |
| HP-006 | Special characters | Unicode, accents | Properly encoded and stored | P1 |

### 4.2 Validation Failure Tests

| ID | Test Case | Input | Expected Output | Priority |
|----|-----------|-------|-----------------|----------|
| VAL-001 | Missing email | No email field | 400 Bad Request, validation error | P0 |
| VAL-002 | Invalid email | "not-an-email" | 400 Bad Request, email format error | P0 |
| VAL-003 | Missing name | Empty name | 400 Bad Request, name required | P0 |
| VAL-004 | Missing company | No company field | 400 Bad Request, company required | P0 |
| VAL-005 | Invalid teamSize | "invalid-value" | 400 Bad Request, enum error | P1 |
| VAL-006 | Invalid securityLevel | "ultra-high" | 400 Bad Request, enum error | P1 |
| VAL-007 | Oversized message | 10000 chars | 400 Bad Request, size limit | P1 |
| VAL-008 | XSS attempt | `<script>alert(1)</script>` | 400 Bad Request, sanitized | P1 |

### 4.3 CRM API Failure Tests

| ID | Test Case | Simulation | Expected Behavior | Priority |
|----|-----------|------------|-------------------|----------|
| CRM-001 | Auth failure | Invalid token | 401 response, alert sent | P0 |
| CRM-002 | Rate limiting | 429 response | Retry 3x with backoff | P0 |
| CRM-003 | Server error | 500 response | Retry 3x, then fail gracefully | P0 |
| CRM-004 | Timeout | 30s delay | Timeout error after 10s | P0 |
| CRM-005 | Person creation fails | 400 on POST /people | Continue to Company creation | P1 |
| CRM-006 | Company creation fails | 400 on POST /companies | Continue, Person created | P1 |
| CRM-007 | Note creation fails | 400 on POST /notes | Alert sent, partial success | P1 |

### 4.4 Edge Case Tests

| ID | Test Case | Input | Expected Result | Priority |
|----|-----------|-------|-----------------|----------|
| EDGE-001 | Single char name | "X" | FirstName: "X", LastName: "" | P2 |
| EDGE-002 | Very long name | 100 chars no spaces | FirstName: full, LastName: "" | P2 |
| EDGE-003 | Multiple spaces | "John  Michael   Smith" | Handles extra spaces | P2 |
| EDGE-004 | Unicode name | "姓名测试" | Stored correctly | P2 |
| EDGE-005 | Empty arrays | `techStack: []` | Note shows empty or omit | P2 |
| EDGE-006 | Single item arrays | `techStack: ["CRM"]` | Properly formatted | P2 |
| EDGE-007 | Duplicate email | Same email twice | Update or error handled | P0 |
| EDGE-008 | Concurrent submissions | 10 parallel requests | All processed, no duplicates | P0 |

---

## 5. Verification Methods

### 5.1 CRM Record Verification Checklist

```javascript
// verification-checklist.js
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
      containsTechStack: note.body.includes(expected.techStack[0]),
      linkedToPerson: note.person === expected.personId,
      linkedToCompany: note.company === expected.companyId
    })
  }
};

async function verifyCompleteRecord(testId, expectedData) {
  const results = {
    testId,
    timestamp: new Date().toISOString(),
    checks: {}
  };

  // Verify Person
  const person = await queryPersonByEmail(expectedData.email);
  results.checks.person = verificationSteps.person.validate(person, expectedData);
  results.personId = person?.id;

  // Verify Company
  const company = await queryCompanyByName(expectedData.companyName);
  results.checks.company = verificationSteps.company.validate(company, expectedData);
  results.companyId = company?.id;

  // Verify Note
  const notes = await queryNotesByPersonId(results.personId);
  results.checks.note = verificationSteps.note.validate(notes[0], {
    ...expectedData,
    personId: results.personId,
    companyId: results.companyId
  });

  // Overall result
  results.allPassed = Object.values(results.checks)
    .every(check => Object.values(check).every(v => v === true));

  return results;
}
```

### 5.2 API Query Helpers

```bash
#!/bin/bash
# verify-crm-records.sh

TWENTY_URL="${TWENTY_CRM_URL:-https://crm.zaplit.com}"
TOKEN="${TWENTY_TOKEN}"
TEST_ID="$1"

if [ -z "$TEST_ID" ]; then
    echo "Usage: $0 <test-id>"
    exit 1
fi

echo "=== Verifying Records for: $TEST_ID ==="

# Query Person
echo -e "\n1. Person Record:"
PERSON=$(curl -s -X GET "$TWENTY_URL/rest/people" \
    -H "Authorization: Bearer $TOKEN" \
    -G --data-urlencode "filter={\"name\":{\"contains\":\"$TEST_ID\"}}")

echo "$PERSON" | jq '.data[0] | {id, name, emails, jobTitle, createdAt}'

PERSON_ID=$(echo "$PERSON" | jq -r '.data[0].id')

# Query Company
echo -e "\n2. Company Record:"
COMPANY=$(curl -s -X GET "$TWENTY_URL/rest/companies" \
    -H "Authorization: Bearer $TOKEN" \
    -G --data-urlencode "filter={\"name\":{\"contains\":\"$TEST_ID\"}}")

echo "$COMPANY" | jq '.data[0] | {id, name, createdAt}'

COMPANY_ID=$(echo "$COMPANY" | jq -r '.data[0].id')

# Query Notes
echo -e "\n3. Note Records:"
if [ -n "$PERSON_ID" ]; then
    NOTES=$(curl -s -X GET "$TWENTY_URL/rest/notes" \
        -H "Authorization: Bearer $TOKEN" \
        -G --data-urlencode "filter={\"person\":{\"eq\":\"$PERSON_ID\"}}")
    
    echo "$NOTES" | jq '.data[] | {id, title, body, person, company}'
fi

echo -e "\n=== Verification Complete ==="
```

### 5.3 Response Validation

```javascript
// response-validator.js
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
  },
  serverError: {
    statusCode: 500,
    body: {
      success: false,
      error: 'string'
    }
  }
};

function validateResponse(response, expectedType) {
  const schema = responseSchema[expectedType];
  
  if (response.statusCode !== schema.statusCode) {
    return {
      valid: false,
      error: `Expected status ${schema.statusCode}, got ${response.statusCode}`
    };
  }

  // Add more detailed validation as needed
  return { valid: true };
}
```

---

## 6. Load Testing

### 6.1 Concurrent Submission Testing

```bash
#!/bin/bash
# load-test.sh

N8N_WEBHOOK="${N8N_WEBHOOK:-https://n8n.zaplit.com/webhook/consultation}"
CONCURRENT="${1:-10}"
TOTAL="${2:-100}"
TEST_ID="LOAD_$(date +%s)"

TMPDIR=$(mktemp -d)
trap "rm -rf $TMPDIR" EXIT

echo "=== Load Test ==="
echo "Concurrent: $CONCURRENT, Total: $TOTAL"
echo "Test ID: $TEST_ID"

# Generate payloads
for i in $(seq 1 $TOTAL); do
    cat > "$TMPDIR/payload_$i.json" <<EOF
{
  "data": {
    "name": "$TEST_ID User $i",
    "email": "$TEST_ID_$i@test.com",
    "company": "$TEST_ID Corp $i",
    "role": "Tester",
    "teamSize": "11-50",
    "message": "Load test submission $i"
  },
  "metadata": {
    "loadTestId": "$TEST_ID",
    "sequence": $i
  }
}
EOF
done

# Execute load test
echo "sequence,status,response_time" > "$TMPDIR/results.csv"

START=$(date +%s)
seq 1 $TOTAL | xargs -P $CONCURRENT -I {} \
    bash -c 'curl -s -w "\n%{http_code},%{time_total}" \
        -X POST "'$N8N_WEBHOOK'" \
        -H "Content-Type: application/json" \
        -d "@'$TMPDIR'/payload_{}.json" \
        -o /dev/null >> "'$TMPDIR'/results.csv"'
END=$(date +%s)

# Analyze results
echo -e "\n=== Results ==="
TOTAL_TIME=$((END - START))
SUCCESS=$(grep -c ',200,' "$TMPDIR/results.csv" || echo "0")
FAILED=$((TOTAL - SUCCESS))

awk -F',' 'NR>1 && $3 {
    sum+=$3; count++
    if($3>max) max=$3
    if(min==0 || $3<min) min=$3
} END {
    printf "Avg Response: %.3fs\n", sum/count
    printf "Min Response: %.3fs\n", min
    printf "Max Response: %.3fs\n", max
}' "$TMPDIR/results.csv"

echo "Total Time: ${TOTAL_TIME}s"
echo "Requests/sec: $(echo "scale=2; $TOTAL / $TOTAL_TIME" | bc)"
echo "Success: $SUCCESS, Failed: $FAILED"
echo "Success Rate: $(echo "scale=2; $SUCCESS * 100 / $TOTAL" | bc)%"
```

### 6.2 Rate Limit Testing

```javascript
// rate-limit-test.js
const axios = require('axios');

async function testRateLimit() {
  const requests = [];
  const results = { success: 0, rateLimited: 0, errors: 0 };

  // Send 120 requests in 10 seconds (exceeds 100/min limit)
  for (let i = 0; i < 120; i++) {
    requests.push(
      axios.post('https://n8n.zaplit.com/webhook/consultation', {
        data: {
          name: `Rate Test ${i}`,
          email: `rate${i}@test.com`,
          company: `Rate Corp ${i}`,
          role: 'Tester'
        }
      }).then(() => results.success++)
        .catch(err => {
          if (err.response?.status === 429) results.rateLimited++;
          else results.errors++;
        })
    );
  }

  await Promise.all(requests);
  
  console.log('Rate Limit Test Results:');
  console.log(`  Success: ${results.success}`);
  console.log(`  Rate Limited: ${results.rateLimited}`);
  console.log(`  Errors: ${results.errors}`);
  
  return results;
}

testRateLimit();
```

### 6.3 Timeout Testing

```bash
#!/bin/bash
# timeout-test.sh

# Test with progressively slower responses
for delay in 1 5 10 15 20 30 35; do
    echo "Testing with ${delay}s delay..."
    
    # This would require a mock server that delays responses
    curl -s -w "\nHTTP: %{http_code}, Time: %{time_total}s\n" \
        -X POST "https://httpbin.org/delay/$delay" \
        -H "Content-Type: application/json" \
        -d '{"test": "timeout"}' \
        -m 10  # 10 second max timeout
done
```

---

## 7. Regression Testing

### 7.1 Post-Change Testing Checklist

```yaml
regression_checklist:
  workflow_changes:
    - name: "JSON structure validation"
      command: "jq empty n8n-workflow-consultation-to-crm-complete.json"
    
    - name: "Import test"
      steps:
        - Import workflow to test n8n instance
        - Verify all nodes load without errors
        - Verify connections are preserved
    
    - name: "Credential validation"
      steps:
        - Check all HTTP nodes have credentials assigned
        - Test credential connectivity
    
    - name: "Node configuration"
      steps:
        - Verify webhook path is correct
        - Verify response mode is set to 'responseNode'
        - Verify HTTP methods are POST

  functional_tests:
    - test_case: HP-001
      description: "Happy path - complete submission"
      must_pass: true
    
    - test_case: VAL-001
      description: "Validation - missing email"
      must_pass: true
    
    - test_case: EDGE-007
      description: "Duplicate email handling"
      must_pass: true
    
    - test_case: CRM-002
      description: "Rate limiting behavior"
      must_pass: true

  performance_tests:
    - metric: response_time_p95
      threshold: "< 10s"
    
    - metric: success_rate
      threshold: "> 99%"
```

### 7.2 Automated Regression Suite

```javascript
// regression-suite.js
const testCases = require('./test-cases');
const { runTest, cleanup } = require('./test-helpers');

const REGRESSION_TESTS = [
  'HP-001', 'HP-002', 'HP-003',
  'VAL-001', 'VAL-002', 'VAL-003',
  'EDGE-001', 'EDGE-007', 'EDGE-008'
];

async function runRegressionSuite() {
  const results = {
    passed: [],
    failed: [],
    startTime: new Date()
  };

  console.log('=== Starting Regression Suite ===\n');

  for (const testId of REGRESSION_TESTS) {
    const testCase = testCases[testId];
    console.log(`Running ${testId}: ${testCase.name}`);
    
    try {
      const result = await runTest(testCase);
      if (result.success) {
        results.passed.push(testId);
        console.log(`  ✅ PASSED\n`);
      } else {
        results.failed.push({ id: testId, error: result.error });
        console.log(`  ❌ FAILED: ${result.error}\n`);
      }
    } catch (err) {
      results.failed.push({ id: testId, error: err.message });
      console.log(`  ❌ ERROR: ${err.message}\n`);
    }
  }

  // Cleanup
  await cleanup();

  // Report
  results.endTime = new Date();
  results.duration = results.endTime - results.startTime;

  console.log('\n=== Regression Suite Complete ===');
  console.log(`Passed: ${results.passed.length}/${REGRESSION_TESTS.length}`);
  console.log(`Failed: ${results.failed.length}/${REGRESSION_TESTS.length}`);
  console.log(`Duration: ${results.duration}ms`);

  if (results.failed.length > 0) {
    console.log('\nFailed Tests:');
    results.failed.forEach(f => console.log(`  - ${f.id}: ${f.error}`));
    process.exit(1);
  }
}

runRegressionSuite();
```

### 7.3 Version Control for Workflows

```bash
#!/bin/bash
# workflow-version-control.sh

# Export workflow from n8n
export_workflow() {
    local workflow_id=$1
    local output_file=$2
    
    curl -s -X GET "https://n8n.zaplit.com/api/v1/workflows/$workflow_id" \
        -H "X-N8N-API-KEY: $N8N_API_KEY" \
        | jq '.' > "$output_file"
    
    echo "Exported workflow to $output_file"
}

# Compare workflows
diff_workflows() {
    local file1=$1
    local file2=$2
    
    # Compare ignoring execution data and IDs
    diff <(jq -S 'del(.id, .nodes[].id, .nodes[].webhookId)' "$file1") \
         <(jq -S 'del(.id, .nodes[].id, .nodes[].webhookId)' "$file2")
}

# Pre-commit hook for workflow validation
validate_workflow() {
    local workflow_file=$1
    
    # Check JSON validity
    if ! jq empty "$workflow_file" 2>/dev/null; then
        echo "❌ Invalid JSON: $workflow_file"
        return 1
    fi
    
    # Check required nodes exist
    local has_webhook=$(jq '[.nodes[] | select(.type == "n8n-nodes-base.webhook")] | length' "$workflow_file")
    local has_response=$(jq '[.nodes[] | select(.type == "n8n-nodes-base.respondToWebhook")] | length' "$workflow_file")
    
    if [ "$has_webhook" -eq 0 ]; then
        echo "❌ Missing Webhook node"
        return 1
    fi
    
    if [ "$has_response" -eq 0 ]; then
        echo "❌ Missing Response node"
        return 1
    fi
    
    echo "✅ Workflow validation passed"
    return 0
}
```

---

## 8. Automation Scripts

### 8.1 Complete Test Suite Script

```bash
#!/bin/bash
# run-complete-test-suite.sh

set -e

# Configuration
export N8N_WEBHOOK="${N8N_WEBHOOK:-https://n8n.zaplit.com/webhook/consultation}"
export TWENTY_CRM_URL="${TWENTY_CRM_URL:-https://crm.zaplit.com}"
export TWENTY_TOKEN="${TWENTY_TOKEN:-}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "======================================"
echo "n8n-Twenty CRM Complete Test Suite"
echo "======================================"
echo ""

# Check prerequisites
if [ -z "$TWENTY_TOKEN" ]; then
    echo -e "${RED}Error: TWENTY_TOKEN not set${NC}"
    exit 1
fi

# Generate test run ID
export TEST_RUN_ID="SUITE_$(date +%s)"
echo "Test Run ID: $TEST_RUN_ID"
echo ""

# Track results
PASSED=0
FAILED=0

# Test function
run_test() {
    local test_name=$1
    local test_cmd=$2
    
    echo -n "Testing $test_name... "
    if eval "$test_cmd" > /tmp/test_output.log 2>&1; then
        echo -e "${GREEN}✓ PASS${NC}"
        ((PASSED++))
        return 0
    else
        echo -e "${RED}✗ FAIL${NC}"
        echo "  Output: $(cat /tmp/test_output.log)"
        ((FAILED++))
        return 1
    fi
}

# === TEST SUITE ===

# 1. Health Checks
run_test "Webhook Health" "curl -s -o /dev/null -w '%{http_code}' $N8N_WEBHOOK -X OPTIONS | grep -q '204\\|200'"
run_test "CRM API Health" "curl -s -o /dev/null -w '%{http_code}' $TWENTY_CRM_URL/rest/people -H 'Authorization: Bearer $TWENTY_TOKEN' | grep -q '200'"

# 2. Happy Path Tests
run_test "Happy Path - Full Submission" "./tests/happy-path-full.sh $TEST_RUN_ID"
run_test "Happy Path - Minimal Submission" "./tests/happy-path-minimal.sh $TEST_RUN_ID"

# 3. Validation Tests
run_test "Validation - Missing Email" "./tests/validation-missing-email.sh"
run_test "Validation - Invalid Email" "./tests/validation-invalid-email.sh"
run_test "Validation - Missing Name" "./tests/validation-missing-name.sh"

# 4. Edge Case Tests
run_test "Edge Case - Special Characters" "./tests/edge-special-chars.sh $TEST_RUN_ID"
run_test "Edge Case - Unicode" "./tests/edge-unicode.sh $TEST_RUN_ID"
run_test "Edge Case - Long Message" "./tests/edge-long-message.sh $TEST_RUN_ID"

# 5. Load Test (light)
run_test "Load Test - 10 Concurrent" "./tests/load-test-light.sh"

# Cleanup
echo ""
echo "Cleaning up test data..."
./cleanup-test-data.sh "$TEST_RUN_ID" > /dev/null 2>&1

# Summary
echo ""
echo "======================================"
echo "Test Suite Complete"
echo "======================================"
echo -e "Passed: ${GREEN}$PASSED${NC}"
echo -e "Failed: ${RED}$FAILED${NC}"
echo "Total: $((PASSED + FAILED))"

if [ $FAILED -gt 0 ]; then
    exit 1
fi
```

### 8.2 Quick Reference: Testing Commands

```bash
# One-liner test commands

# Quick health check
curl -s -X POST https://n8n.zaplit.com/webhook/consultation \
  -H "Content-Type: application/json" \
  -d '{"data":{"name":"Health Check","email":"health@test.com","company":"Health Corp","role":"Test"}}'

# Test with full data
curl -s -X POST https://n8n.zaplit.com/webhook/consultation \
  -H "Content-Type: application/json" \
  -d @test-payloads/full-submission.json | jq .

# Test validation error
curl -s -X POST https://n8n.zaplit.com/webhook/consultation \
  -H "Content-Type: application/json" \
  -d '{"data":{"name":"Test"}}' | jq .

# Verify CRM records
curl -s -X GET "https://crm.zaplit.com/rest/people?filter={\"emails\":{\"primaryEmail\":{\"eq\":\"test@example.com\"}}}" \
  -H "Authorization: Bearer $TWENTY_TOKEN" | jq .

# Load test (10 requests, 5 concurrent)
seq 1 10 | xargs -P 5 -I {} curl -s -X POST https://n8n.zaplit.com/webhook/consultation \
  -H "Content-Type: application/json" \
  -d '{"data":{"name":"Load Test","email":"load{}@test.com","company":"Load Corp","role":"Tester"}}'
```

---

## 9. CI/CD Integration

### 9.1 GitHub Actions Workflow

```yaml
# .github/workflows/n8n-integration-tests.yml
name: n8n-Twenty CRM Integration Tests

on:
  push:
    branches: [main, develop]
    paths:
      - 'n8n-workflow-*.json'
      - 'scripts/**'
  pull_request:
    paths:
      - 'n8n-workflow-*.json'

jobs:
  validate-workflow:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Validate JSON Syntax
        run: |
          for file in n8n-workflow-*.json; do
            echo "Validating $file..."
            jq empty "$file" || exit 1
          done
      
      - name: Check Required Nodes
        run: |
          jq -e '[.nodes[] | select(.type == "n8n-nodes-base.webhook")] | length > 0' n8n-workflow-consultation-to-crm-complete.json
          jq -e '[.nodes[] | select(.type == "n8n-nodes-base.respondToWebhook")] | length > 0' n8n-workflow-consultation-to-crm-complete.json

  integration-tests:
    runs-on: ubuntu-latest
    needs: validate-workflow
    environment: staging
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      
      - name: Install Dependencies
        run: npm ci
      
      - name: Run Integration Tests
        env:
          N8N_WEBHOOK: ${{ secrets.N8N_STAGING_WEBHOOK }}
          TWENTY_CRM_URL: ${{ secrets.TWENTY_STAGING_URL }}
          TWENTY_TOKEN: ${{ secrets.TWENTY_STAGING_TOKEN }}
        run: |
          npm run test:integration
      
      - name: Run Load Tests
        env:
          N8N_WEBHOOK: ${{ secrets.N8N_STAGING_WEBHOOK }}
        run: |
          npm run test:load -- --requests 50 --concurrent 5
      
      - name: Cleanup Test Data
        if: always()
        env:
          TWENTY_CRM_URL: ${{ secrets.TWENTY_STAGING_URL }}
          TWENTY_TOKEN: ${{ secrets.TWENTY_STAGING_TOKEN }}
        run: |
          ./scripts/cleanup-test-data.sh TEST_

  deploy-production:
    runs-on: ubuntu-latest
    needs: integration-tests
    if: github.ref == 'refs/heads/main'
    environment: production
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Import Workflow to Production n8n
        env:
          N8N_API_KEY: ${{ secrets.N8N_PROD_API_KEY }}
          N8N_URL: ${{ secrets.N8N_PROD_URL }}
        run: |
          curl -X POST "$N8N_URL/api/v1/workflows" \
            -H "X-N8N-API-KEY: $N8N_API_KEY" \
            -H "Content-Type: application/json" \
            -d @n8n-workflow-consultation-to-crm-complete.json
      
      - name: Health Check
        run: |
          curl -s -X POST "${{ secrets.N8N_PROD_WEBHOOK }}" \
            -H "Content-Type: application/json" \
            -d '{"data":{"name":"Deploy Check","email":"deploy@test.com","company":"Deploy Corp","role":"Test"}}' \
            | jq -e '.success == true'
```

### 9.2 Pre-Deployment Checklist

```markdown
## Pre-Deployment Testing Checklist

### Workflow Validation
- [ ] JSON syntax valid
- [ ] All required nodes present
- [ ] Node connections valid
- [ ] No hardcoded credentials
- [ ] Environment variables used for URLs

### Functional Testing
- [ ] Happy path test passed
- [ ] Validation error test passed
- [ ] Edge case tests passed
- [ ] Error handling verified

### Integration Testing
- [ ] Person created in CRM
- [ ] Company created in CRM
- [ ] Note created with correct content
- [ ] Entity relationships verified

### Performance Testing
- [ ] Response time < 10s (p95)
- [ ] Load test 50 concurrent passed
- [ ] No memory leaks detected

### Security Testing
- [ ] XSS attempts blocked
- [ ] SQL injection prevented
- [ ] Authentication required
- [ ] No PII in logs
```

---

## Appendix A: Test Data Templates

### Full Submission Template
```json
{
  "data": {
    "name": "TEST_${TEST_ID}_John Smith",
    "email": "test_${TEST_ID}@example.com",
    "company": "TEST_${TEST_ID}_Acme Corporation",
    "role": "Chief Technology Officer",
    "teamSize": "51-200",
    "techStack": [
      "CRM: Salesforce",
      "Communication: Slack",
      "Project Management: Asana",
      "Finance: Stripe",
      "Marketing: HubSpot",
      "Storage: Google Drive"
    ],
    "securityLevel": "enterprise",
    "compliance": ["SOC2", "GDPR", "HIPAA", "CCPA"],
    "message": "We're looking to implement AI agents to automate our customer support and sales processes. Currently handling 10,000+ tickets/month."
  },
  "metadata": {
    "testId": "${TEST_ID}",
    "timestamp": "${ISO_TIMESTAMP}",
    "source": "automated-test"
  }
}
```

### Minimal Submission Template
```json
{
  "data": {
    "name": "TEST_${TEST_ID}_Jane Doe",
    "email": "test_${TEST_ID}@example.com",
    "company": "TEST_${TEST_ID}_Startup Inc",
    "role": "CEO"
  }
}
```

---

## Appendix B: Troubleshooting Guide

| Issue | Cause | Solution |
|-------|-------|----------|
| 404 on webhook | Wrong path | Verify webhook path is `/consultation` |
| 401 from CRM | Expired JWT | Refresh token in n8n credentials |
| Duplicate records | No duplicate check | Implement search-before-create |
| Timeout errors | Slow CRM API | Increase timeout, add retry logic |
| Missing note links | IDs not captured | Extract IDs from HTTP responses |
| Test data pollution | No cleanup | Run cleanup script after tests |
| Validation bypass | Client-side only | Add server-side validation node |

---

*Guide Version: 1.0*  
*Last Updated: 2026-03-19*  
*Maintained by: QA Engineering Team*
