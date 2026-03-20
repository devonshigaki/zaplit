# n8n Testing Implementation Guide

## Practical Test Scripts and Code Examples

This guide provides concrete implementation examples for testing the n8n-Twenty CRM workflow.

---

## 1. Test Workflow JSON Files

### 1.1 Unit Test Workflow for Process Form Data Node

Save as: `test-process-form-data.json`

```json
{
  "name": "TEST - Process Form Data Node",
  "nodes": [
    {
      "parameters": {},
      "id": "trigger-test",
      "name": "Manual Trigger",
      "type": "n8n-nodes-base.manualTrigger",
      "typeVersion": 1,
      "position": [240, 300]
    },
    {
      "parameters": {
        "assignments": {
          "assignments": [
            {
              "id": "test-case-1",
              "name": "body",
              "value": "={\"data\":{\"name\":\"John Smith\",\"email\":\"john@test.com\",\"company\":\"Acme\",\"role\":\"CTO\",\"techStack\":[\"CRM: Salesforce\",\"Comm: Slack\"],\"securityLevel\":\"high\",\"compliance\":[\"soc2\"],\"message\":\"Test message\",\"teamSize\":\"11-50\"}}",
              "type": "object"
            }
          ]
        },
        "options": {}
      },
      "name": "Test Input - Standard Case",
      "type": "n8n-nodes-base.set",
      "typeVersion": 3.2,
      "position": [460, 300]
    },
    {
      "parameters": {
        "jsCode": "// Parse form data and prepare for CRM\nconst input = $input.first().json.body;\n\n// Split name into first and last\nconst nameParts = input.data.name?.split(' ') || ['Unknown'];\nconst firstName = nameParts[0];\nconst lastName = nameParts.slice(1).join(' ') || '';\n\n// Format techStack and compliance arrays\nconst techStack = Array.isArray(input.data.techStack) \n  ? input.data.techStack.join(', ') \n  : input.data.techStack || '';\n  \nconst compliance = Array.isArray(input.data.compliance) \n  ? input.data.compliance.join(', ') \n  : input.data.compliance || '';\n\nreturn [{\n  json: {\n    person: {\n      firstName: firstName,\n      lastName: lastName,\n      email: input.data.email,\n      jobTitle: input.data.role\n    },\n    company: {\n      name: input.data.company\n    },\n    note: {\n      message: input.data.message,\n      techStack: techStack,\n      securityLevel: input.data.securityLevel,\n      compliance: compliance,\n      teamSize: input.data.teamSize\n    }\n  }\n}];"
      },
      "name": "Process Form Data",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [680, 300]
    },
    {
      "parameters": {
        "conditions": {
          "options": {
            "caseSensitive": true,
            "leftValue": "",
            "typeValidation": "strict"
          },
          "conditions": [
            {
              "id": "check-firstname",
              "leftValue": "={{ $json.person.firstName }}",
              "rightValue": "John",
              "operator": {
                "type": "string",
                "operation": "equals"
              }
            },
            {
              "id": "check-lastname",
              "leftValue": "={{ $json.person.lastName }}",
              "rightValue": "Smith",
              "operator": {
                "type": "string",
                "operation": "equals"
              }
            },
            {
              "id": "check-email",
              "leftValue": "={{ $json.person.email }}",
              "rightValue": "john@test.com",
              "operator": {
                "type": "string",
                "operation": "equals"
              }
            },
            {
              "id": "check-techstack",
              "leftValue": "={{ $json.note.techStack }}",
              "rightValue": "CRM: Salesforce, Comm: Slack",
              "operator": {
                "type": "string",
                "operation": "equals"
              }
            }
          ],
          "combinator": "and"
        }
      },
      "name": "Assert All Fields",
      "type": "n8n-nodes-base.if",
      "typeVersion": 2,
      "position": [900, 200]
    },
    {
      "parameters": {
        "respondWith": "json",
        "responseBody": "{\"test\": \"PASSED\", \"message\": \"All assertions passed\"}",
        "options": {}
      },
      "name": "Test Passed",
      "type": "n8n-nodes-base.respondToWebhook",
      "typeVersion": 1.1,
      "position": [1120, 100]
    },
    {
      "parameters": {
        "respondWith": "json",
        "responseBody": "={\"test\": \"FAILED\", \"message\": \"Assertions failed\", \"actual\": $json}",
        "options": {}
      },
      "name": "Test Failed",
      "type": "n8n-nodes-base.respondToWebhook",
      "typeVersion": 1.1,
      "position": [1120, 300]
    }
  ],
  "connections": {
    "Manual Trigger": {
      "main": [
        [
          {
            "node": "Test Input - Standard Case",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Test Input - Standard Case": {
      "main": [
        [
          {
            "node": "Process Form Data",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Process Form Data": {
      "main": [
        [
          {
            "node": "Assert All Fields",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Assert All Fields": {
      "main": [
        [
          {
            "node": "Test Passed",
            "type": "main",
            "index": 0
          }
        ],
        [
          {
            "node": "Test Failed",
            "type": "main",
            "index": 0
          }
        ]
      ]
    }
  },
  "settings": {
    "executionOrder": "v1"
  }
}
```

### 1.2 Error Handling Workflow Template

Save as: `error-handling-template.json`

```json
{
  "name": "ERROR HANDLER - Consultation Form",
  "nodes": [
    {
      "parameters": {},
      "name": "Error Trigger",
      "type": "n8n-nodes-base.errorTrigger",
      "typeVersion": 1,
      "position": [240, 300]
    },
    {
      "parameters": {
        "jsCode": "const error = $input.first().json;\n\n// Extract error details\nconst errorInfo = {\n  timestamp: new Date().toISOString(),\n  workflow: error.workflow.name,\n  executionId: error.execution.id,\n  failedNode: error.execution.lastNodeExecuted,\n  errorMessage: error.execution.error?.message || 'Unknown error',\n  errorStack: error.execution.error?.stack || '',\n  executionUrl: `${$env.N8N_BASE_URL}/execution/${error.execution.id}`\n};\n\n// Determine severity\nif (errorInfo.errorMessage.includes('Unauthorized') || errorInfo.errorMessage.includes('401')) {\n  errorInfo.severity = 'CRITICAL';\n} else if (errorInfo.errorMessage.includes('rate') || errorInfo.errorMessage.includes('429')) {\n  errorInfo.severity = 'HIGH';\n} else {\n  errorInfo.severity = 'MEDIUM';\n}\n\nreturn [{ json: errorInfo }];"
      },
      "name": "Format Error Details",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [460, 300]
    },
    {
      "parameters": {
        "conditions": {
          "options": {
            "caseSensitive": true,
            "leftValue": "",
            "typeValidation": "strict"
          },
          "conditions": [
            {
              "id": "is-critical",
              "leftValue": "={{ $json.severity }}",
              "rightValue": "CRITICAL",
              "operator": {
                "type": "string",
                "operation": "equals"
              }
            }
          ]
        }
      },
      "name": "Is Critical?",
      "type": "n8n-nodes-base.if",
      "typeVersion": 2,
      "position": [680, 300]
    },
    {
      "parameters": {
        "authentication": "oAuth2",
        "channel": "#alerts",
        "text": "={\"text\": \"🚨 n8n Workflow Failure - CRITICAL\", \"attachments\": [{\"color\": \"danger\", \"fields\": [{\"title\": \"Workflow\", \"value\": \"{{ $json.workflow }}\", \"short\": true}, {\"title\": \"Node\", \"value\": \"{{ $json.failedNode }}\", \"short\": true}, {\"title\": \"Error\", \"value\": \"{{ $json.errorMessage }}\"}, {\"title\": \"Execution\", \"value\": \"{{ $json.executionUrl }}\"}]}]}",
        "options": {}
      },
      "name": "Slack Alert - Critical",
      "type": "n8n-nodes-base.slack",
      "typeVersion": 2.1,
      "position": [900, 200]
    },
    {
      "parameters": {
        "authentication": "oAuth2",
        "channel": "#alerts",
        "text": "={\"text\": \"⚠️ n8n Workflow Failure - {{ $json.severity }}\", \"attachments\": [{\"color\": \"warning\", \"fields\": [{\"title\": \"Workflow\", \"value\": \"{{ $json.workflow }}\", \"short\": true}, {\"title\": \"Node\", \"value\": \"{{ $json.failedNode }}\", \"short\": true}, {\"title\": \"Error\", \"value\": \"{{ $json.errorMessage }}\"}]}]}",
        "options": {}
      },
      "name": "Slack Alert - Standard",
      "type": "n8n-nodes-base.slack",
      "typeVersion": 2.1,
      "position": [900, 400]
    },
    {
      "parameters": {
        "documentId": {
          "__rl": true,
          "value": "YOUR_GOOGLE_SHEET_ID",
          "mode": "id"
        },
        "sheetName": {
          "__rl": true,
          "value": "gid=0",
          "mode": "id"
        },
        "columns": {
          "mappingMode": "autoMap",
          "value": {
            "Timestamp": "={{ $json.timestamp }}",
            "Severity": "={{ $json.severity }}",
            "Workflow": "={{ $json.workflow }}",
            "Failed Node": "={{ $json.failedNode }}",
            "Error Message": "={{ $json.errorMessage }}",
            "Execution ID": "={{ $json.executionId }}",
            "Execution URL": "={{ $json.executionUrl }}"
          },
          "matchingColumns": [],
          "schema": [
            {"id": "Timestamp", "type": "string"},
            {"id": "Severity", "type": "string"},
            {"id": "Workflow", "type": "string"},
            {"id": "Failed Node", "type": "string"},
            {"id": "Error Message", "type": "string"},
            {"id": "Execution ID", "type": "string"},
            {"id": "Execution URL", "type": "string"}
          ]
        },
        "options": {}
      },
      "name": "Log to Google Sheets",
      "type": "n8n-nodes-base.googleSheets",
      "typeVersion": 4.4,
      "position": [1120, 300]
    }
  ],
  "connections": {
    "Error Trigger": {
      "main": [
        [
          {
            "node": "Format Error Details",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Format Error Details": {
      "main": [
        [
          {
            "node": "Is Critical?",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Is Critical?": {
      "main": [
        [
          {
            "node": "Slack Alert - Critical",
            "type": "main",
            "index": 0
          }
        ],
        [
          {
            "node": "Slack Alert - Standard",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Slack Alert - Critical": {
      "main": [
        [
          {
            "node": "Log to Google Sheets",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Slack Alert - Standard": {
      "main": [
        [
          {
            "node": "Log to Google Sheets",
            "type": "main",
            "index": 0
          }
        ]
      ]
    }
  },
  "settings": {
    "executionOrder": "v1"
  }
}
```

---

## 2. Shell Test Scripts

### 2.1 Integration Test Script

Save as: `scripts/test-integration.sh`

```bash
#!/bin/bash
# Integration test for Consultation Form → CRM workflow

set -e

# Configuration
N8N_WEBHOOK_URL="${N8N_WEBHOOK_URL:-https://n8n.zaplit.com/webhook/consultation}"
TWENTY_CRM_URL="${TWENTY_CRM_URL:-https://crm.zaplit.com}"
TWENTY_TOKEN="${TWENTY_TOKEN:-}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test data
TEST_ID="TEST_$(date +%s)"
TEST_EMAIL="${TEST_ID}@test.com"
TEST_NAME="${TEST_ID}_John Smith"
TEST_COMPANY="${TEST_ID}_Acme Corp"

echo "================================"
echo "n8n-Twenty CRM Integration Test"
echo "================================"
echo "Test ID: $TEST_ID"
echo ""

# Check dependencies
if [ -z "$TWENTY_TOKEN" ]; then
    echo -e "${RED}Error: TWENTY_TOKEN environment variable not set${NC}"
    exit 1
fi

# Step 1: Submit form
echo -e "${YELLOW}Step 1: Submitting test form...${NC}"

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$N8N_WEBHOOK_URL" \
    -H "Content-Type: application/json" \
    -d "{
        \"data\": {
            \"name\": \"$TEST_NAME\",
            \"email\": \"$TEST_EMAIL\",
            \"company\": \"$TEST_COMPANY\",
            \"role\": \"CTO\",
            \"teamSize\": \"11-50\",
            \"techStack\": [\"CRM: Salesforce\", \"Comm: Slack\"],
            \"securityLevel\": \"high\",
            \"compliance\": [\"soc2\", \"gdpr\"],
            \"message\": \"Integration test submission\"
        },
        \"metadata\": {
            \"testId\": \"$TEST_ID\",
            \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"
        }
    }")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" != "200" ]; then
    echo -e "${RED}✗ Form submission failed (HTTP $HTTP_CODE)${NC}"
    echo "Response: $BODY"
    exit 1
fi

echo -e "${GREEN}✓ Form submitted successfully${NC}"
echo "Response: $BODY"
echo ""

# Wait for processing
sleep 2

# Step 2: Verify Person created
echo -e "${YELLOW}Step 2: Verifying Person creation...${NC}"

PERSON_RESPONSE=$(curl -s -X GET "$TWENTY_CRM_URL/rest/people" \
    -H "Authorization: Bearer $TWENTY_TOKEN" \
    -G --data-urlencode "search=$TEST_EMAIL")

if echo "$PERSON_RESPONSE" | grep -q "$TEST_EMAIL"; then
    echo -e "${GREEN}✓ Person created successfully${NC}"
    PERSON_ID=$(echo "$PERSON_RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
    echo "  Person ID: $PERSON_ID"
else
    echo -e "${RED}✗ Person not found in CRM${NC}"
    echo "Response: $PERSON_RESPONSE"
    exit 1
fi
echo ""

# Step 3: Verify Company created
echo -e "${YELLOW}Step 3: Verifying Company creation...${NC}"

COMPANY_RESPONSE=$(curl -s -X GET "$TWENTY_CRM_URL/rest/companies" \
    -H "Authorization: Bearer $TWENTY_TOKEN" \
    -G --data-urlencode "search=$TEST_COMPANY")

if echo "$COMPANY_RESPONSE" | grep -q "$TEST_COMPANY"; then
    echo -e "${GREEN}✓ Company created successfully${NC}"
    COMPANY_ID=$(echo "$COMPANY_RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
    echo "  Company ID: $COMPANY_ID"
else
    echo -e "${RED}✗ Company not found in CRM${NC}"
    echo "Response: $COMPANY_RESPONSE"
    exit 1
fi
echo ""

# Step 4: Cleanup
echo -e "${YELLOW}Step 4: Cleaning up test data...${NC}"

if [ -n "$PERSON_ID" ]; then
    curl -s -X DELETE "$TWENTY_CRM_URL/rest/people/$PERSON_ID" \
        -H "Authorization: Bearer $TWENTY_TOKEN" > /dev/null
    echo -e "${GREEN}✓ Deleted test person${NC}"
fi

if [ -n "$COMPANY_ID" ]; then
    curl -s -X DELETE "$TWENTY_CRM_URL/rest/companies/$COMPANY_ID" \
        -H "Authorization: Bearer $TWENTY_TOKEN" > /dev/null
    echo -e "${GREEN}✓ Deleted test company${NC}"
fi

echo ""
echo "================================"
echo -e "${GREEN}All tests passed!${NC}"
echo "================================"
```

### 2.2 Load Test Script

Save as: `scripts/test-load.sh`

```bash
#!/bin/bash
# Load test for Consultation Form webhook

N8N_WEBHOOK_URL="${N8N_WEBHOOK_URL:-https://n8n.zaplit.com/webhook/consultation}"
CONCURRENT_REQUESTS="${1:-10}"
TOTAL_REQUESTS="${2:-100}"

echo "Load Test Configuration:"
echo "  Webhook URL: $N8N_WEBHOOK_URL"
echo "  Concurrent requests: $CONCURRENT_REQUESTS"
echo "  Total requests: $TOTAL_REQUESTS"
echo ""

# Create temp directory for results
TMPDIR=$(mktemp -d)
trap "rm -rf $TMPDIR" EXIT

# Generate test payloads
echo "Generating test payloads..."
for i in $(seq 1 $TOTAL_REQUESTS); do
    cat > "$TMPDIR/payload_$i.json" <<EOF
{
  "data": {
    "name": "Load Test User $i",
    "email": "loadtest_$i@example.com",
    "company": "Load Test Corp $i",
    "role": "Tester",
    "teamSize": "11-50",
    "techStack": ["CRM: Salesforce", "Comm: Slack"],
    "securityLevel": "high",
    "compliance": ["soc2"],
    "message": "Load testing submission $i"
  },
  "metadata": {
    "loadTestId": "LOAD_$(date +%s)",
    "sequence": $i
  }
}
EOF
done

# Function to make request
make_request() {
    local i=$1
    local start_time=$(date +%s%N)
    
    RESPONSE=$(curl -s -w "\n%{http_code}\n%{time_total}" \
        -X POST "$N8N_WEBHOOK_URL" \
        -H "Content-Type: application/json" \
        -d "@$TMPDIR/payload_$i.json" \
        2>/dev/null)
    
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | sed '$d' | sed '$d')
    
    echo "$i,$HTTP_CODE,$(echo "$RESPONSE" | tail -n1)" >> "$TMPDIR/results.csv"
}

export -f make_request
export N8N_WEBHOOK_URL TMPDIR

echo "Running load test..."
echo "sequence,http_code,response_time" > "$TMPDIR/results.csv"

START_TIME=$(date +%s)
seq 1 $TOTAL_REQUESTS | xargs -P $CONCURRENT_REQUESTS -I {} bash -c 'make_request "$@"' _ {}
END_TIME=$(date +%s)

# Analyze results
echo ""
echo "=== Load Test Results ==="
echo ""

TOTAL_TIME=$((END_TIME - START_TIME))
SUCCESS_COUNT=$(grep -c ',200,' "$TMPDIR/results.csv" || echo "0")
ERROR_COUNT=$(grep -v ',200,' "$TMPDIR/results.csv" | grep -c ',' || echo "0")

# Calculate response times
AVG_TIME=$(awk -F',' 'NR>1 && $3 {sum+=$3; count++} END {printf "%.3f", sum/count}' "$TMPDIR/results.csv")
MAX_TIME=$(awk -F',' 'NR>1 && $3 {if($3>max) max=$3} END {printf "%.3f", max}' "$TMPDIR/results.csv")
MIN_TIME=$(awk -F',' 'NR>1 && $3 {if(min==0 || $3<min) min=$3} END {printf "%.3f", min}' "$TMPDIR/results.csv")

echo "Summary:"
echo "  Total time: ${TOTAL_TIME}s"
echo "  Requests/sec: $(echo "scale=2; $TOTAL_REQUESTS / $TOTAL_TIME" | bc)"
echo "  Successful: $SUCCESS_COUNT"
echo "  Failed: $ERROR_COUNT"
echo "  Success rate: $(echo "scale=2; $SUCCESS_COUNT * 100 / $TOTAL_REQUESTS" | bc)%"
echo ""
echo "Response Times:"
echo "  Min: ${MIN_TIME}s"
echo "  Avg: ${AVG_TIME}s"
echo "  Max: ${MAX_TIME}s"
echo ""

# Show error breakdown if any
if [ "$ERROR_COUNT" -gt 0 ]; then
    echo "Error Breakdown:"
    grep -v ',200,' "$TMPDIR/results.csv" | cut -d',' -f2 | sort | uniq -c | sort -rn
fi
```

### 2.3 Health Check Script

Save as: `scripts/health-check.sh`

```bash
#!/bin/bash
# Health check for n8n-Twenty CRM integration

N8N_URL="${N8N_URL:-https://n8n.zaplit.com}"
TWENTY_URL="${TWENTY_URL:-https://crm.zaplit.com}"
WEBHOOK_PATH="${WEBHOOK_PATH:-/webhook/consultation}"

echo "=== Health Check ==="
echo "Timestamp: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo ""

# Check n8n health
echo -n "n8n instance: "
N8N_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" "$N8N_URL/healthz" 2>/dev/null || echo "000")
if [ "$N8N_HEALTH" = "200" ]; then
    echo "✓ Healthy (HTTP 200)"
else
    echo "✗ Unhealthy (HTTP $N8N_HEALTH)"
fi

# Check Twenty CRM health
echo -n "Twenty CRM:   "
TWENTY_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" "$TWENTY_URL/healthz" 2>/dev/null || echo "000")
if [ "$TWENTY_HEALTH" = "200" ]; then
    echo "✓ Healthy (HTTP 200)"
else
    echo "✗ Unhealthy (HTTP $TWENTY_HEALTH)"
fi

# Test webhook endpoint (OPTIONS request)
echo -n "Webhook endpoint: "
WEBHOOK_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" -X OPTIONS "$N8N_URL$WEBHOOK_PATH" 2>/dev/null || echo "000")
if [ "$WEBHOOK_HEALTH" = "204" ] || [ "$WEBHOOK_HEALTH" = "200" ]; then
    echo "✓ Available (HTTP $WEBHOOK_HEALTH)"
else
    echo "✗ Unavailable (HTTP $WEBHOOK_HEALTH)"
fi

# Test with minimal payload
echo -n "Test submission:  "
TEST_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$N8N_URL$WEBHOOK_PATH" \
    -H "Content-Type: application/json" \
    -d '{"data":{"name":"Health Check","email":"health@test.com","company":"Health Corp","role":"Test"}}' \
    2>/dev/null)
HTTP_CODE=$(echo "$TEST_RESPONSE" | tail -n1)

if [ "$HTTP_CODE" = "200" ]; then
    echo "✓ Working (HTTP 200)"
else
    echo "✗ Failed (HTTP $HTTP_CODE)"
fi

echo ""
echo "=== End Health Check ==="
```

---

## 3. Monitoring Workflow JSON

### 3.1 Execution Monitoring Workflow

Save as: `monitoring-workflow.json`

```json
{
  "name": "MONITOR - Consultation Form Metrics",
  "nodes": [
    {
      "parameters": {
        "rule": {
          "interval": [
            {
              "field": "minutes",
              "minutesInterval": 5
            }
          ]
        }
      },
      "name": "Every 5 Minutes",
      "type": "n8n-nodes-base.scheduleTrigger",
      "typeVersion": 1.2,
      "position": [240, 300]
    },
    {
      "parameters": {
        "authentication": "oAuth2",
        "operation": "getAll",
        "workflowId": "YOUR_WORKFLOW_ID",
        "returnAll": false,
        "limit": 100,
        "options": {}
      },
      "name": "Get Recent Executions",
      "type": "n8n-nodes-base.n8n",
      "typeVersion": 1,
      "position": [460, 300]
    },
    {
      "parameters": {
        "jsCode": "const executions = $input.all()[0].json;\nconst now = new Date();\nconst fiveMinutesAgo = new Date(now - 5 * 60 * 1000);\n\n// Filter executions from last 5 minutes\nconst recentExecutions = executions.filter(e => \n  new Date(e.startedAt) > fiveMinutesAgo\n);\n\n// Calculate metrics\nconst total = recentExecutions.length;\nconst successful = recentExecutions.filter(e => e.status === 'success').length;\nconst failed = total - successful;\nconst successRate = total > 0 ? (successful / total * 100).toFixed(2) : 100;\n\n// Calculate average duration\nconst avgDuration = total > 0\n  ? (recentExecutions.reduce((sum, e) => {\n      const duration = new Date(e.stoppedAt) - new Date(e.startedAt);\n      return sum + duration;\n    }, 0) / total / 1000).toFixed(2)\n  : 0;\n\n// Get recent failures\nconst recentFailures = recentExecutions\n  .filter(e => e.status === 'error')\n  .map(e => ({\n    executionId: e.id,\n    startedAt: e.startedAt,\n    errorMessage: e.error?.message || 'Unknown error'\n  }));\n\nreturn [{\n  json: {\n    timestamp: now.toISOString(),\n    window: '5 minutes',\n    total,\n    successful,\n    failed,\n    successRate,\n    avgDuration,\n    recentFailures\n  }\n}];"
      },
      "name": "Calculate Metrics",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [680, 300]
    },
    {
      "parameters": {
        "conditions": {
          "options": {
            "caseSensitive": true,
            "leftValue": "",
            "typeValidation": "strict"
          },
          "conditions": [
            {
              "id": "has-failures",
              "leftValue": "={{ $json.failed }}",
              "rightValue": "0",
              "operator": {
                "type": "number",
                "operation": "gt"
              }
            }
          ]
        }
      },
      "name": "Has Failures?",
      "type": "n8n-nodes-base.if",
      "typeVersion": 2,
      "position": [900, 300]
    },
    {
      "parameters": {
        "authentication": "oAuth2",
        "channel": "#alerts",
        "text": "={\"text\": \"🚨 Consultation Form Failures Detected\", \"attachments\": [{\"color\": \"danger\", \"fields\": [{\"title\": \"Failed Executions\", \"value\": \"{{ $json.failed }}\", \"short\": true}, {\"title\": \"Success Rate\", \"value\": \"{{ $json.successRate }}%\", \"short\": true}, {\"title\": \"Recent Failures\", \"value\": \"{{ JSON.stringify($json.recentFailures) }}\"}]}]}",
        "options": {}
      },
      "name": "Send Slack Alert",
      "type": "n8n-nodes-base.slack",
      "typeVersion": 2.1,
      "position": [1120, 200]
    },
    {
      "parameters": {
        "documentId": {
          "__rl": true,
          "value": "YOUR_METRICS_SHEET_ID",
          "mode": "id"
        },
        "sheetName": {
          "__rl": true,
          "value": "gid=0",
          "mode": "id"
        },
        "columns": {
          "mappingMode": "autoMap",
          "value": {
            "Timestamp": "={{ $json.timestamp }}",
            "Window": "={{ $json.window }}",
            "Total": "={{ $json.total }}",
            "Successful": "={{ $json.successful }}",
            "Failed": "={{ $json.failed }}",
            "SuccessRate": "={{ $json.successRate }}",
            "AvgDuration": "={{ $json.avgDuration }}"
          },
          "matchingColumns": [],
          "schema": [
            {"id": "Timestamp", "type": "string"},
            {"id": "Window", "type": "string"},
            {"id": "Total", "type": "number"},
            {"id": "Successful", "type": "number"},
            {"id": "Failed", "type": "number"},
            {"id": "SuccessRate", "type": "string"},
            {"id": "AvgDuration", "type": "string"}
          ]
        },
        "options": {}
      },
      "name": "Log Metrics",
      "type": "n8n-nodes-base.googleSheets",
      "typeVersion": 4.4,
      "position": [1120, 400]
    }
  ],
  "connections": {
    "Every 5 Minutes": {
      "main": [
        [
          {
            "node": "Get Recent Executions",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Get Recent Executions": {
      "main": [
        [
          {
            "node": "Calculate Metrics",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Calculate Metrics": {
      "main": [
        [
          {
            "node": "Has Failures?",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Has Failures?": {
      "main": [
        [
          {
            "node": "Send Slack Alert",
            "type": "main",
            "index": 0
          }
        ],
        [
          {
            "node": "Log Metrics",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Send Slack Alert": {
      "main": [
        [
          {
            "node": "Log Metrics",
            "type": "main",
            "index": 0
          }
        ]
      ]
    }
  },
  "settings": {
    "executionOrder": "v1"
  }
}
```

---

## 4. Validation Code Examples

### 4.1 Enhanced Validation Node

```javascript
// Validation Node - Add immediately after Webhook
const body = $input.first().json.body;
const errors = [];
const warnings = [];

// Required field validation
const requiredFields = ['name', 'email', 'company', 'role'];
requiredFields.forEach(field => {
  if (!body.data?.[field] || String(body.data[field]).trim() === '') {
    errors.push(`${field} is required`);
  }
});

// Email format validation
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
if (body.data?.email && !emailRegex.test(body.data.email)) {
  errors.push('Invalid email format');
}

// Email domain validation (optional)
const blockedDomains = ['tempmail.com', '10minutemail.com'];
const emailDomain = body.data?.email?.split('@')[1];
if (emailDomain && blockedDomains.includes(emailDomain.toLowerCase())) {
  errors.push('Temporary email addresses are not allowed');
}

// Name validation
if (body.data?.name) {
  const nameLength = body.data.name.trim().length;
  if (nameLength < 2) {
    errors.push('Name must be at least 2 characters');
  }
  if (nameLength > 100) {
    errors.push('Name exceeds maximum length of 100 characters');
  }
}

// Message size validation
if (body.data?.message) {
  const messageLength = body.data.message.length;
  if (messageLength > 5000) {
    errors.push('Message exceeds maximum length of 5000 characters');
  }
  if (messageLength > 1000) {
    warnings.push('Long message - may be truncated in notifications');
  }
}

// Enum validation
const validTeamSizes = ['1-10', '11-50', '51-200', '200+'];
if (body.data?.teamSize && !validTeamSizes.includes(body.data.teamSize)) {
  errors.push(`Invalid teamSize. Must be one of: ${validTeamSizes.join(', ')}`);
}

const validSecurityLevels = ['standard', 'high', 'enterprise'];
if (body.data?.securityLevel && !validSecurityLevels.includes(body.data.securityLevel)) {
  errors.push(`Invalid securityLevel. Must be one of: ${validSecurityLevels.join(', ')}`);
}

// XSS sanitization check
const xssPattern = /<script|javascript:|on\w+=/i;
const fieldsToCheck = ['name', 'company', 'role', 'message'];
fieldsToCheck.forEach(field => {
  if (body.data?.[field] && xssPattern.test(body.data[field])) {
    errors.push(`Potentially malicious content detected in ${field}`);
  }
});

// Return validation result
if (errors.length > 0) {
  return [{
    json: {
      success: false,
      error: 'Validation failed',
      errors: errors,
      warnings: warnings
    }
  }];
}

// Add warnings to output if any
if (warnings.length > 0) {
  return [{
    json: {
      ...body,
      _validation: {
        passed: true,
        warnings: warnings
      }
    }
  }];
}

return $input.all();
```

### 4.2 Duplicate Check Enhancement

```javascript
// Add before Create Person node to check for duplicates
const email = $input.first().json.person?.email;

if (!email) {
  return [{ json: { skipDuplicateCheck: true } }];
}

// Search for existing person by email
const searchResponse = await $httpRequest({
  method: 'GET',
  url: `https://crm.zaplit.com/rest/people`,
  authentication: 'genericCredentialType',
  genericAuthType: 'httpHeaderAuth',
  sendQueryParams: true,
  queryParameters: {
    parameters: [
      { name: 'search', value: email }
    ]
  }
});

const existingPeople = searchResponse.data?.data || [];
const existingPerson = existingPeople.find(p => 
  p.emails?.primaryEmail?.toLowerCase() === email.toLowerCase()
);

if (existingPerson) {
  return [{
    json: {
      isDuplicate: true,
      existingPersonId: existingPerson.id,
      person: existingPerson
    }
  }];
}

return [{ json: { isDuplicate: false } }];
```

---

## 5. Quick Start Commands

```bash
# 1. Install test scripts
chmod +x scripts/*.sh

# 2. Run health check
./scripts/health-check.sh

# 3. Run integration test
export TWENTY_TOKEN="your-jwt-token"
./scripts/test-integration.sh

# 4. Run load test (10 concurrent, 100 total)
./scripts/test-load.sh 10 100

# 5. Import test workflow to n8n
curl -X POST "https://n8n.zaplit.com/api/v1/workflows" \
  -H "X-N8N-API-KEY: your-api-key" \
  -H "Content-Type: application/json" \
  -d @test-process-form-data.json
```

---

## Summary

This implementation guide provides:

1. **Ready-to-import workflow JSON files** for testing and monitoring
2. **Shell scripts** for integration testing, load testing, and health checks
3. **Code examples** for validation and error handling
4. **Step-by-step procedures** for testing the complete flow

Import these workflows into your n8n instance, configure credentials, and run the test scripts to validate your integration.
