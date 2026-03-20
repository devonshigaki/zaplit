#!/bin/bash
#==============================================================================
# CRM Record Verification Script
# Verifies that test records were created correctly
#==============================================================================

set -e

# Configuration
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
log_detail() { echo -e "  $1"; }

#==============================================================================
# Validation
#==============================================================================

if [ -z "$TWENTY_TOKEN" ]; then
    log_error "TWENTY_TOKEN environment variable not set"
    exit 1
fi

if [ -z "$1" ]; then
    log_error "Usage: $0 <test-id>"
    exit 1
fi

TEST_ID="$1"

#==============================================================================
# Query Functions
#==============================================================================

query_person_by_name() {
    local filter="{\"name\":{\"contains\":\"$TEST_ID\"}}"
    curl -s -X GET "$TWENTY_CRM_URL/rest/people" \
        -H "Authorization: Bearer $TWENTY_TOKEN" \
        -G --data-urlencode "filter=$filter" 2>/dev/null
}

query_company_by_name() {
    local filter="{\"name\":{\"contains\":\"$TEST_ID\"}}"
    curl -s -X GET "$TWENTY_CRM_URL/rest/companies" \
        -H "Authorization: Bearer $TWENTY_TOKEN" \
        -G --data-urlencode "filter=$filter" 2>/dev/null
}

query_notes_by_person() {
    local person_id="$1"
    local filter="{\"person\":{\"eq\":\"$person_id\"}}"
    curl -s -X GET "$TWENTY_CRM_URL/rest/notes" \
        -H "Authorization: Bearer $TWENTY_TOKEN" \
        -G --data-urlencode "filter=$filter" 2>/dev/null
}

#==============================================================================
# Verification Functions
#==============================================================================

verify_person() {
    local response="$1"
    local person_data=$(echo "$response" | jq '.data[0]')
    
    if [ -z "$person_data" ] || [ "$person_data" = "null" ]; then
        log_error "Person not found"
        return 1
    fi
    
    local person_id=$(echo "$person_data" | jq -r '.id')
    local first_name=$(echo "$person_data" | jq -r '.name.firstName')
    local last_name=$(echo "$person_data" | jq -r '.name.lastName')
    local email=$(echo "$person_data" | jq -r '.emails[0].email // .email')
    local job_title=$(echo "$person_data" | jq -r '.jobTitle')
    
    log_success "Person found: $first_name $last_name"
    log_detail "ID: $person_id"
    log_detail "Email: $email"
    log_detail "Job Title: $job_title"
    
    # Verify name contains test ID
    if [[ "$first_name" == *"$TEST_ID"* ]]; then
        log_success "Name contains test ID"
    else
        log_error "Name does not contain test ID"
        return 1
    fi
    
    echo "$person_id"
}

verify_company() {
    local response="$1"
    local company_data=$(echo "$response" | jq '.data[0]')
    
    if [ -z "$company_data" ] || [ "$company_data" = "null" ]; then
        log_error "Company not found"
        return 1
    fi
    
    local company_id=$(echo "$company_data" | jq -r '.id')
    local name=$(echo "$company_data" | jq -r '.name')
    
    log_success "Company found: $name"
    log_detail "ID: $company_id"
    
    # Verify name contains test ID
    if [[ "$name" == *"$TEST_ID"* ]]; then
        log_success "Company name contains test ID"
    else
        log_error "Company name does not contain test ID"
        return 1
    fi
    
    echo "$company_id"
}

verify_notes() {
    local person_id="$1"
    local response=$(query_notes_by_person "$person_id")
    local notes_count=$(echo "$response" | jq '.data | length')
    
    if [ "$notes_count" -eq 0 ]; then
        log_error "No notes found for person"
        return 1
    fi
    
    log_success "Found $notes_count note(s)"
    
    # Verify first note has content
    local note_body=$(echo "$response" | jq -r '.data[0].body')
    local note_title=$(echo "$response" | jq -r '.data[0].title')
    
    log_detail "Title: $note_title"
    log_detail "Body preview: ${note_body:0:100}..."
    
    if [ -n "$note_body" ] && [ ${#note_body} -gt 10 ]; then
        log_success "Note has meaningful content"
    else
        log_error "Note body is empty or too short"
        return 1
    fi
}

#==============================================================================
# Main
#==============================================================================

echo "======================================"
echo "CRM Record Verification"
echo "======================================"
echo "Test ID: $TEST_ID"
echo ""

EXIT_CODE=0

#==============================================================================
# Step 1: Verify Person
#==============================================================================

log_info "Querying person..."
PERSON_RESPONSE=$(query_person_by_name)
PERSON_ID=$(verify_person "$PERSON_RESPONSE") || EXIT_CODE=1

echo ""

#==============================================================================
# Step 2: Verify Company
#==============================================================================

log_info "Querying company..."
COMPANY_RESPONSE=$(query_company_by_name)
COMPANY_ID=$(verify_company "$COMPANY_RESPONSE") || EXIT_CODE=1

echo ""

#==============================================================================
# Step 3: Verify Notes
#==============================================================================

if [ -n "$PERSON_ID" ]; then
    log_info "Querying notes..."
    verify_notes "$PERSON_ID" || EXIT_CODE=1
else
    log_error "Skipping note verification - person not found"
    EXIT_CODE=1
fi

#==============================================================================
# Summary
#==============================================================================

echo ""
echo "======================================"
if [ $EXIT_CODE -eq 0 ]; then
    log_success "All verifications passed!"
else
    log_error "Some verifications failed"
fi
echo "======================================"

exit $EXIT_CODE
