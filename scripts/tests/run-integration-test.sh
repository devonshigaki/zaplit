#!/bin/bash
#==============================================================================
# Integration Test Runner
# End-to-end test for n8n → Twenty CRM workflow
#==============================================================================

set -e

# Configuration
N8N_WEBHOOK="${N8N_WEBHOOK:-https://n8n.zaplit.com/webhook/consultation}"
TWENTY_CRM_URL="${TWENTY_CRM_URL:-https://crm.zaplit.com}"
TWENTY_TOKEN="${TWENTY_TOKEN:-}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

#==============================================================================
# Helper Functions
#==============================================================================

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[PASS]${NC} $1"; }
log_error() { echo -e "${RED}[FAIL]${NC} $1"; }
log_step() { echo -e "${YELLOW}[STEP]${NC} $1"; }

#==============================================================================
# Validation
#==============================================================================

if [ -z "$TWENTY_TOKEN" ]; then
    log_error "TWENTY_TOKEN environment variable not set"
    exit 1
fi

#==============================================================================
# Test Data Setup
#==============================================================================

TEST_ID="INTEGRATION_$(date +%s)"
TEST_EMAIL="${TEST_ID}@test.example.com"
TEST_NAME="${TEST_ID}_John Smith"
TEST_COMPANY="${TEST_ID}_Acme Corporation"

echo "======================================"
echo "Integration Test: n8n → Twenty CRM"
echo "======================================"
echo "Test ID: $TEST_ID"
echo "Webhook: $N8N_WEBHOOK"
echo ""

EXIT_CODE=0

#==============================================================================
# Step 1: Submit Form
#==============================================================================

log_step "1. Submitting test form..."

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$N8N_WEBHOOK" \
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
            \"message\": \"Integration test submission - checking end-to-end flow\"
        },
        \"metadata\": {
            \"testId\": \"$TEST_ID\",
            \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"
        }
    }")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" != "200" ]; then
    log_error "Form submission failed (HTTP $HTTP_CODE)"
    log_error "Response: $BODY"
    exit 1
fi

log_success "Form submitted successfully"
log_info "Response: $BODY"
echo ""

# Wait for processing
log_info "Waiting for CRM processing (3s)..."
sleep 3

#==============================================================================
# Step 2: Verify Person
#==============================================================================

log_step "2. Verifying Person creation..."

PERSON_RESPONSE=$(curl -s -X GET "$TWENTY_CRM_URL/rest/people" \
    -H "Authorization: Bearer $TWENTY_TOKEN" \
    -G --data-urlencode "filter={\"emails\":{\"email\":{\"eq\":\"$TEST_EMAIL\"}}}")

if echo "$PERSON_RESPONSE" | grep -q "$TEST_EMAIL"; then
    log_success "Person created successfully"
    PERSON_ID=$(echo "$PERSON_RESPONSE" | jq -r '.data[0].id')
    log_info "Person ID: $PERSON_ID"
else
    log_error "Person not found in CRM"
    log_error "Response: $PERSON_RESPONSE"
    EXIT_CODE=1
fi
echo ""

#==============================================================================
# Step 3: Verify Company
#==============================================================================

log_step "3. Verifying Company creation..."

COMPANY_RESPONSE=$(curl -s -X GET "$TWENTY_CRM_URL/rest/companies" \
    -H "Authorization: Bearer $TWENTY_TOKEN" \
    -G --data-urlencode "filter={\"name\":{\"contains\":\"$TEST_ID\"}}")

if echo "$COMPANY_RESPONSE" | grep -q "$TEST_COMPANY"; then
    log_success "Company created successfully"
    COMPANY_ID=$(echo "$COMPANY_RESPONSE" | jq -r '.data[0].id')
    log_info "Company ID: $COMPANY_ID"
else
    log_error "Company not found in CRM"
    log_error "Response: $COMPANY_RESPONSE"
    EXIT_CODE=1
fi
echo ""

#==============================================================================
# Step 4: Verify Notes
#==============================================================================

if [ -n "$PERSON_ID" ]; then
    log_step "4. Verifying Note creation..."
    
    NOTES_RESPONSE=$(curl -s -X GET "$TWENTY_CRM_URL/rest/notes" \
        -H "Authorization: Bearer $TWENTY_TOKEN" \
        -G --data-urlencode "filter={\"person\":{\"eq\":\"$PERSON_ID\"}}")
    
    NOTES_COUNT=$(echo "$NOTES_RESPONSE" | jq '.data | length')
    
    if [ "$NOTES_COUNT" -gt 0 ]; then
        log_success "Note created successfully"
        NOTE_ID=$(echo "$NOTES_RESPONSE" | jq -r '.data[0].id')
        log_info "Note ID: $NOTE_ID"
        
        # Check note content
        NOTE_BODY=$(echo "$NOTES_RESPONSE" | jq -r '.data[0].body')
        if echo "$NOTE_BODY" | grep -q "Integration test submission"; then
            log_success "Note contains expected message"
        else
            log_error "Note does not contain expected message"
            EXIT_CODE=1
        fi
    else
        log_error "No notes found for person"
        EXIT_CODE=1
    fi
    echo ""
fi

#==============================================================================
# Step 5: Cleanup
#==============================================================================

log_step "5. Cleaning up test data..."

if [ -n "$PERSON_ID" ]; then
    curl -s -X DELETE "$TWENTY_CRM_URL/rest/people/$PERSON_ID" \
        -H "Authorization: Bearer $TWENTY_TOKEN" > /dev/null
    log_success "Deleted test person"
fi

if [ -n "$COMPANY_ID" ]; then
    curl -s -X DELETE "$TWENTY_CRM_URL/rest/companies/$COMPANY_ID" \
        -H "Authorization: Bearer $TWENTY_TOKEN" > /dev/null
    log_success "Deleted test company"
fi

echo ""

#==============================================================================
# Summary
#==============================================================================

echo "======================================"
if [ $EXIT_CODE -eq 0 ]; then
    log_success "Integration test PASSED"
else
    log_error "Integration test FAILED"
fi
echo "======================================"

exit $EXIT_CODE
