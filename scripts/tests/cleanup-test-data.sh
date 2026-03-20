#!/bin/bash
#==============================================================================
# Test Data Cleanup Script for Twenty CRM
# Removes test records created during testing
#==============================================================================

set -e

# Configuration
TWENTY_CRM_URL="${TWENTY_CRM_URL:-https://crm.zaplit.com}"
TWENTY_TOKEN="${TWENTY_TOKEN:-}"
DRY_RUN="${DRY_RUN:-false}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

#==============================================================================
# Helper Functions
#==============================================================================

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

#==============================================================================
# Validation
#==============================================================================

if [ -z "$TWENTY_TOKEN" ]; then
    log_error "TWENTY_TOKEN environment variable not set"
    exit 1
fi

if [ -z "$1" ]; then
    log_error "Usage: $0 <test-prefix>"
    log_info "Example: $0 TEST_1742412345"
    exit 1
fi

TEST_PREFIX="$1"

#==============================================================================
# Query Functions
#==============================================================================

query_people() {
    local filter="{\"name\":{\"contains\":\"$TEST_PREFIX\"}}"
    curl -s -X GET "$TWENTY_CRM_URL/rest/people" \
        -H "Authorization: Bearer $TWENTY_TOKEN" \
        -G --data-urlencode "filter=$filter" 2>/dev/null
}

query_companies() {
    local filter="{\"name\":{\"contains\":\"$TEST_PREFIX\"}}"
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
# Delete Functions
#==============================================================================

delete_person() {
    local person_id="$1"
    if [ "$DRY_RUN" = "true" ]; then
        log_info "[DRY RUN] Would delete person: $person_id"
        return 0
    fi
    
    curl -s -X DELETE "$TWENTY_CRM_URL/rest/people/$person_id" \
        -H "Authorization: Bearer $TWENTY_TOKEN" 2>/dev/null
}

delete_company() {
    local company_id="$1"
    if [ "$DRY_RUN" = "true" ]; then
        log_info "[DRY RUN] Would delete company: $company_id"
        return 0
    fi
    
    curl -s -X DELETE "$TWENTY_CRM_URL/rest/companies/$company_id" \
        -H "Authorization: Bearer $TWENTY_TOKEN" 2>/dev/null
}

delete_note() {
    local note_id="$1"
    if [ "$DRY_RUN" = "true" ]; then
        log_info "[DRY RUN] Would delete note: $note_id"
        return 0
    fi
    
    curl -s -X DELETE "$TWENTY_CRM_URL/rest/notes/$note_id" \
        -H "Authorization: Bearer $TWENTY_TOKEN" 2>/dev/null
}

#==============================================================================
# Main Logic
#==============================================================================

echo "======================================"
echo "Twenty CRM Test Data Cleanup"
echo "======================================"
echo ""
echo "Test Prefix: $TEST_PREFIX"
echo "CRM URL: $TWENTY_CRM_URL"
echo "Dry Run: $DRY_RUN"
echo ""

# Counters
PEOPLE_DELETED=0
COMPANIES_DELETED=0
NOTES_DELETED=0

#==============================================================================
# Step 1: Query and Delete People
#==============================================================================

log_info "Querying people with prefix: $TEST_PREFIX"
PEOPLE_RESPONSE=$(query_people)
PEOPLE_IDS=$(echo "$PEOPLE_RESPONSE" | jq -r '.data[].id' 2>/dev/null || true)
PEOPLE_COUNT=$(echo "$PEOPLE_IDS" | grep -c '^' || echo "0")

if [ -n "$PEOPLE_IDS" ] && [ "$PEOPLE_COUNT" -gt 0 ]; then
    log_info "Found $PEOPLE_COUNT people to delete"
    
    # First, delete notes linked to these people
    for person_id in $PEOPLE_IDS; do
        NOTES_RESPONSE=$(query_notes_by_person "$person_id")
        NOTE_IDS=$(echo "$NOTES_RESPONSE" | jq -r '.data[].id' 2>/dev/null || true)
        
        for note_id in $NOTE_IDS; do
            if [ -n "$note_id" ]; then
                delete_note "$note_id"
                ((NOTES_DELETED++)) || true
            fi
        done
    done
    
    # Delete people
    for person_id in $PEOPLE_IDS; do
        if [ -n "$person_id" ]; then
            delete_person "$person_id"
            ((PEOPLE_DELETED++)) || true
        fi
    done
else
    log_warning "No people found with prefix: $TEST_PREFIX"
fi

#==============================================================================
# Step 2: Query and Delete Companies
#==============================================================================

log_info "Querying companies with prefix: $TEST_PREFIX"
COMPANIES_RESPONSE=$(query_companies)
COMPANY_IDS=$(echo "$COMPANIES_RESPONSE" | jq -r '.data[].id' 2>/dev/null || true)
COMPANY_COUNT=$(echo "$COMPANY_IDS" | grep -c '^' || echo "0")

if [ -n "$COMPANY_IDS" ] && [ "$COMPANY_COUNT" -gt 0 ]; then
    log_info "Found $COMPANY_COUNT companies to delete"
    
    for company_id in $COMPANY_IDS; do
        if [ -n "$company_id" ]; then
            delete_company "$company_id"
            ((COMPANIES_DELETED++)) || true
        fi
    done
else
    log_warning "No companies found with prefix: $TEST_PREFIX"
fi

#==============================================================================
# Summary
#==============================================================================

echo ""
echo "======================================"
echo "Cleanup Summary"
echo "======================================"
if [ "$DRY_RUN" = "true" ]; then
    log_info "DRY RUN - No actual deletions performed"
fi
log_success "People deleted: $PEOPLE_DELETED"
log_success "Companies deleted: $COMPANIES_DELETED"
log_success "Notes deleted: $NOTES_DELETED"
echo "======================================"
