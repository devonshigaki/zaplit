#!/bin/bash
#===============================================================================
# Migrate to Parallel Workflow v4
#===============================================================================
# This script automates the migration from v3 sequential workflow to v4
# parallel optimized workflow with comprehensive safety checks.
#
# Usage:
#   ./migrate-to-parallel.sh [OPTIONS]
#
# Options:
#   --dry-run           Preview changes without executing
#   --skip-backup       Skip workflow backup (not recommended)
#   --force             Skip confirmation prompts
#   --webhook-v3 <url>  v3 webhook URL for testing
#   --webhook-v4 <url>  v4 webhook URL for testing
#   --n8n-url <url>     n8n instance URL
#
# Examples:
#   ./migrate-to-parallel.sh --dry-run
#   ./migrate-to-parallel.sh --force
#   ./migrate-to-parallel.sh --webhook-v4 https://n8n.example.com/webhook/consultation-v4
#===============================================================================

set -euo pipefail

# Colors for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m' # No Color

# Script configuration
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
readonly BACKUP_DIR="${PROJECT_DIR}/backups/workflows/$(date +%Y%m%d_%H%M%S)"
readonly LOG_FILE="${PROJECT_DIR}/logs/migrate-$(date +%Y%m%d_%H%M%S).log"
readonly MIGRATION_ID="MIGRATION_$(date +%s)"

# Default configuration
DRY_RUN=false
SKIP_BACKUP=false
FORCE=false
WEBHOOK_V3="${N8N_WEBHOOK_V3:-https://n8n.zaplit.com/webhook/consultation}"
WEBHOOK_V4="${N8N_WEBHOOK_V4:-https://n8n.zaplit.com/webhook/consultation-v4}"
N8N_URL="${N8N_URL:-https://n8n.zaplit.com}"
CRM_BASE_URL="${CRM_BASE_URL:-https://crm.zaplit.com}"

# Workflow files
V4_WORKFLOW_FILE="${PROJECT_DIR}/n8n-workflow-v4-parallel.json"
V3_WORKFLOW_FILE="${PROJECT_DIR}/n8n-workflow-v3-enhanced.json"

#===============================================================================
# Utility Functions
#===============================================================================

log() {
    local level="$1"
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    echo -e "${timestamp} [${level}] ${message}" | tee -a "$LOG_FILE" 2>/dev/null || true
}

info() { log "INFO" "$@"; }
success() { log "SUCCESS" "${GREEN}$*${NC}"; }
warn() { log "WARN" "${YELLOW}$*${NC}"; }
error() { log "ERROR" "${RED}$*${NC}"; }

check_command() {
    if ! command -v "$1" &> /dev/null; then
        error "Required command not found: $1"
        return 1
    fi
}

confirm() {
    if [[ "$FORCE" == true ]]; then
        return 0
    fi
    
    local message="$1"
    echo -e -n "${YELLOW}${message} [y/N]: ${NC}"
    read -r response
    case "$response" in
        [yY][eE][sS]|[yY]) return 0 ;;
        *) return 1 ;;
    esac
}

#===============================================================================
# Argument Parsing
#===============================================================================

parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            --skip-backup)
                SKIP_BACKUP=true
                shift
                ;;
            --force)
                FORCE=true
                shift
                ;;
            --webhook-v3)
                WEBHOOK_V3="$2"
                shift 2
                ;;
            --webhook-v4)
                WEBHOOK_V4="$2"
                shift 2
                ;;
            --n8n-url)
                N8N_URL="$2"
                shift 2
                ;;
            --help|-h)
                show_help
                exit 0
                ;;
            *)
                error "Unknown option: $1"
                show_help
                exit 1
                ;;
        esac
    done
}

show_help() {
    cat << EOF
Migrate to Parallel Workflow v4

Usage: $(basename "$0") [OPTIONS]

Options:
    --dry-run           Preview changes without executing
    --skip-backup       Skip workflow backup (not recommended)
    --force             Skip confirmation prompts
    --webhook-v3 <url>  v3 webhook URL for testing
    --webhook-v4 <url>  v4 webhook URL for testing
    --n8n-url <url>     n8n instance URL
    --help, -h          Show this help message

Environment Variables:
    N8N_WEBHOOK_V3      v3 webhook URL (default: https://n8n.zaplit.com/webhook/consultation)
    N8N_WEBHOOK_V4      v4 webhook URL (default: https://n8n.zaplit.com/webhook/consultation-v4)
    N8N_URL             n8n instance URL (default: https://n8n.zaplit.com)
    CRM_BASE_URL        CRM API base URL (default: https://crm.zaplit.com)

Examples:
    $(basename "$0") --dry-run
    $(basename "$0") --force
    $(basename "$0") --webhook-v4 https://n8n.example.com/webhook/consultation-v4
EOF
}

#===============================================================================
# Pre-flight Checks
#===============================================================================

preflight_checks() {
    info "Running pre-flight checks..."
    
    # Create necessary directories
    mkdir -p "$(dirname "$LOG_FILE")"
    mkdir -p "$BACKUP_DIR"
    
    # Check required commands
    check_command curl || return 1
    check_command jq || { warn "jq not found - some features will be limited"; }
    
    # Check workflow files exist
    if [[ ! -f "$V4_WORKFLOW_FILE" ]]; then
        error "v4 workflow file not found: $V4_WORKFLOW_FILE"
        return 1
    fi
    
    if [[ ! -f "$V3_WORKFLOW_FILE" ]]; then
        warn "v3 workflow file not found: $V3_WORKFLOW_FILE"
    fi
    
    # Validate v4 workflow JSON
    if command -v jq &> /dev/null; then
        if ! jq empty "$V4_WORKFLOW_FILE" 2>/dev/null; then
            error "v4 workflow file contains invalid JSON"
            return 1
        fi
        success "v4 workflow JSON is valid"
    fi
    
    # Check environment variables
    if [[ -z "${N8N_API_KEY:-}" ]]; then
        warn "N8N_API_KEY not set - API operations may fail"
    fi
    
    success "Pre-flight checks passed"
    return 0
}

#===============================================================================
# Step 1: Backup Current Workflow
#===============================================================================

backup_workflow() {
    if [[ "$SKIP_BACKUP" == true ]]; then
        warn "Skipping backup as requested"
        return 0
    fi
    
    info "Step 1: Backing up current workflow..."
    
    if [[ "$DRY_RUN" == true ]]; then
        info "[DRY RUN] Would backup workflow to: $BACKUP_DIR"
        return 0
    fi
    
    # Copy workflow files to backup
    if [[ -f "$V3_WORKFLOW_FILE" ]]; then
        cp "$V3_WORKFLOW_FILE" "$BACKUP_DIR/"
        success "Backed up v3 workflow"
    fi
    
    # Try to export active workflow from n8n via API
    if [[ -n "${N8N_API_KEY:-}" ]]; then
        local workflow_id="consultation-form-v3"
        curl -s -H "X-N8N-API-KEY: $N8N_API_KEY" \
            "${N8N_URL}/api/v1/workflows" \
            -o "$BACKUP_DIR/active-workflows.json" 2>/dev/null || true
    fi
    
    # Create backup metadata
    cat > "$BACKUP_DIR/metadata.json" << EOF
{
    "migrationId": "$MIGRATION_ID",
    "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "backedUpBy": "$USER",
    "hostname": "$(hostname)",
    "webhookV3": "$WEBHOOK_V3",
    "webhookV4": "$WEBHOOK_V4",
    "n8nUrl": "$N8N_URL"
}
EOF
    
    success "Backup completed: $BACKUP_DIR"
    return 0
}

#===============================================================================
# Step 2: Import Parallel Workflow
#===============================================================================

import_workflow() {
    info "Step 2: Importing parallel workflow v4..."
    
    if [[ "$DRY_RUN" == true ]]; then
        info "[DRY RUN] Would import workflow from: $V4_WORKFLOW_FILE"
        return 0
    fi
    
    # Option 1: Import via n8n API
    if [[ -n "${N8N_API_KEY:-}" ]]; then
        info "Importing via n8n API..."
        
        local response=$(curl -s -w "\n%{http_code}" \
            -X POST "${N8N_URL}/api/v1/workflows" \
            -H "Content-Type: application/json" \
            -H "X-N8N-API-KEY: $N8N_API_KEY" \
            -d @"$V4_WORKFLOW_FILE" 2>/dev/null)
        
        local http_code=$(echo "$response" | tail -1)
        
        if [[ "$http_code" == "200" || "$http_code" == "201" ]]; then
            success "Workflow imported successfully via API"
        else
            warn "API import returned HTTP $http_code - manual import may be required"
            warn "Please import manually via n8n UI: Settings > Import > Workflows"
        fi
    else
        warn "N8N_API_KEY not set - skipping API import"
        warn "Please import manually via n8n UI:"
        warn "  1. Open n8n at $N8N_URL"
        warn "  2. Settings > Import > Workflows"
        warn "  3. Select: $V4_WORKFLOW_FILE"
    fi
    
    return 0
}

#===============================================================================
# Step 3: Configure HTTP Keep-Alive
#===============================================================================

configure_keepalive() {
    info "Step 3: Configuring HTTP Keep-Alive..."
    
    if [[ "$DRY_RUN" == true ]]; then
        info "[DRY RUN] Would configure Keep-Alive settings"
        return 0
    fi
    
    # Create environment configuration file
    local env_file="${PROJECT_DIR}/.env.n8n-parallel"
    
    cat > "$env_file" << 'EOF'
# n8n Parallel Processing Configuration
# Generated by migrate-to-parallel.sh

# HTTP Connection Pool Settings
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
EOF
    
    success "Keep-Alive configuration written to: $env_file"
    
    info "Please apply these settings to your n8n deployment:"
    info "  - Docker: Add to docker-compose.yml environment section"
    info "  - Kubernetes: Add to ConfigMap or deployment env"
    info "  - Cloud Run: Set as environment variables in service"
    
    # Show current settings if available
    if [[ -n "${N8N_HTTP_KEEP_ALIVE:-}" ]]; then
        info "Current Keep-Alive setting: $N8N_HTTP_KEEP_ALIVE"
    fi
    
    return 0
}

#===============================================================================
# Step 4: Run Validation Tests
#===============================================================================

run_validation_tests() {
    info "Step 4: Running validation tests..."
    
    local test_passed=true
    local test_payload='{"data":{"name":"Migration Test","email":"migration@test.com","company":"Test Corp","role":"Tester","message":"Validation test"}}'
    
    # Test v4 webhook
    info "Testing v4 webhook: $WEBHOOK_V4"
    
    if [[ "$DRY_RUN" == true ]]; then
        info "[DRY RUN] Would test v4 webhook"
        return 0
    fi
    
    # Test 1: Basic connectivity
    local v4_response=$(curl -s -w "\n%{http_code}\n%{time_total}" \
        -X POST "$WEBHOOK_V4" \
        -H "Content-Type: application/json" \
        -H "X-Test-ID: $MIGRATION_ID" \
        -d "$test_payload" \
        --max-time 30 2>/dev/null || echo -e "\n000\n0")
    
    local v4_http_code=$(echo "$v4_response" | tail -2 | head -1)
    local v4_time=$(echo "$v4_response" | tail -1)
    
    if [[ "$v4_http_code" == "200" ]]; then
        success "v4 webhook test passed (HTTP 200, ${v4_time}s)"
    else
        error "v4 webhook test failed (HTTP $v4_http_code)"
        test_passed=false
    fi
    
    # Test 2: Validation error handling
    info "Testing validation error handling..."
    local invalid_payload='{"data":{"name":"Test","email":"invalid-email"}}'
    
    local validation_response=$(curl -s -w "\n%{http_code}" \
        -X POST "$WEBHOOK_V4" \
        -H "Content-Type: application/json" \
        -d "$invalid_payload" \
        --max-time 10 2>/dev/null || echo -e "\n000")
    
    local validation_http_code=$(echo "$validation_response" | tail -1)
    
    if [[ "$validation_http_code" == "400" ]]; then
        success "Validation error test passed (HTTP 400)"
    else
        warn "Validation error test returned HTTP $validation_http_code (expected 400)"
    fi
    
    # Test 3: Performance check
    info "Running performance check..."
    local perf_times=()
    
    for i in {1..5}; do
        local test_email="perf${i}_$(date +%s)@test.com"
        local perf_payload="{\"data\":{\"name\":\"Perf Test $i\",\"email\":\"$test_email\",\"company\":\"Perf Corp\",\"role\":\"Tester\",\"message\":\"Performance test\"}}"
        
        local perf_response=$(curl -s -w "\n%{http_code}\n%{time_total}" \
            -X POST "$WEBHOOK_V4" \
            -H "Content-Type: application/json" \
            -d "$perf_payload" \
            --max-time 30 2>/dev/null || echo -e "\n000\n0")
        
        local perf_http_code=$(echo "$perf_response" | tail -2 | head -1)
        local perf_time=$(echo "$perf_response" | tail -1)
        
        if [[ "$perf_http_code" == "200" ]]; then
            perf_times+=("$perf_time")
            info "  Request $i: ${perf_time}s"
        else
            warn "  Request $i failed (HTTP $perf_http_code)"
        fi
        
        sleep 0.5
    done
    
    # Calculate average
    if [[ ${#perf_times[@]} -gt 0 ]]; then
        local total=0
        for t in "${perf_times[@]}"; do
            total=$(echo "$total + $t" | bc 2>/dev/null || echo "0")
        done
        local avg=$(echo "scale=3; $total / ${#perf_times[@]}" | bc 2>/dev/null || echo "N/A")
        info "Average response time: ${avg}s"
        
        # Check if within target
        if [[ "$avg" != "N/A" && $(echo "$avg < 3.5" | bc 2>/dev/null || echo "0") -eq 1 ]]; then
            success "Performance within acceptable range (<3.5s)"
        else
            warn "Performance may be slower than target (>3.5s)"
        fi
    fi
    
    if [[ "$test_passed" == true ]]; then
        success "Validation tests completed"
        return 0
    else
        error "Some validation tests failed"
        return 1
    fi
}

#===============================================================================
# Step 5: Switch Traffic
#===============================================================================

switch_traffic() {
    info "Step 5: Switching traffic to v4 workflow..."
    
    if [[ "$DRY_RUN" == true ]]; then
        info "[DRY RUN] Would switch traffic to v4"
        info "[DRY RUN] Options for traffic switching:"
        info "[DRY RUN]   1. Update load balancer configuration"
        info "[DRY RUN]   2. Update DNS/ingress rules"
        info "[DRY RUN]   3. Update n8n webhook paths"
        return 0
    fi
    
    echo
    warn "╔════════════════════════════════════════════════════════════╗"
    warn "║  TRAFFIC SWITCH                                            ║"
    warn "╠════════════════════════════════════════════════════════════╣"
    warn "║  This will switch live traffic to the v4 workflow.         ║"
    warn "║  Ensure you have:                                          ║"
    warn "║    ✓ Completed all validation tests                        ║"
    warn "║    ✓ Have a rollback plan ready                            ║"
    warn "║    ✓ Can monitor for errors                                ║"
    warn "╚════════════════════════════════════════════════════════════╝"
    echo
    
    if ! confirm "Are you ready to switch traffic to v4?"; then
        info "Traffic switch cancelled by user"
        return 0
    fi
    
    # Option 1: Update webhook paths in n8n
    info "Option 1: Update n8n webhook paths"
    info "  - Change v4 webhook path to 'consultation'"
    info "  - Change v3 webhook path to 'consultation-v3' (backup)"
    info "  - Deactivate v3 workflow"
    
    # Option 2: Update load balancer
    info "Option 2: Update load balancer configuration"
    info "  - Route /webhook/consultation to v4 endpoint"
    
    # Option 3: Blue-green with DNS
    info "Option 3: DNS/ingress update"
    info "  - Update ingress rules to point to v4"
    
    echo
    warn "Manual action required: Please update your infrastructure to route traffic to:"
    warn "  $WEBHOOK_V4"
    
    # Create switch log
    cat > "$BACKUP_DIR/traffic-switch.log" << EOF
Traffic Switch Log
==================
Migration ID: $MIGRATION_ID
Timestamp: $(date -u +%Y-%m-%dT%H:%M:%SZ)
Switched by: $USER

v3 Webhook: $WEBHOOK_V3
v4 Webhook: $WEBHOOK_V4

Actions Required:
1. Update load balancer/ingress configuration
2. Monitor error rates for 15 minutes
3. Verify P95 latency meets target (<3s)

Rollback Command:
  ./scripts/rollback-parallel.sh --migration-id $MIGRATION_ID
EOF
    
    success "Traffic switch logged to: $BACKUP_DIR/traffic-switch.log"
    
    return 0
}

#===============================================================================
# Step 6: Post-Migration Verification
#===============================================================================

post_migration_verification() {
    info "Step 6: Post-migration verification..."
    
    if [[ "$DRY_RUN" == true ]]; then
        info "[DRY RUN] Would run post-migration verification"
        return 0
    fi
    
    # Create monitoring checklist
    cat > "$BACKUP_DIR/post-migration-checklist.md" << EOF
# Post-Migration Verification Checklist

**Migration ID:** $MIGRATION_ID  
**Completed:** $(date)

## Immediate Verification (0-15 minutes)

- [ ] Submit test form and verify success
- [ ] Check CRM for new Person record
- [ ] Check CRM for new Company record
- [ ] Check CRM for new Note with correct associations
- [ ] Monitor error logs for any issues
- [ ] Verify P95 latency is <3s

## Short-term Monitoring (15 minutes - 2 hours)

- [ ] Error rate remains <0.5%
- [ ] No customer complaints received
- [ ] All form submissions successful
- [ ] Partial failures handled gracefully

## Long-term Monitoring (2-24 hours)

- [ ] P95 latency stable
- [ ] Throughput meets targets
- [ ] No data integrity issues
- [ ] Connection pool performing well

## Rollback Plan

If issues are detected, execute:
\`\`\`bash
./scripts/rollback-parallel.sh --migration-id $MIGRATION_ID
\`\`\`

## Support Contacts

- Primary: ___________
- Escalation: ___________
EOF
    
    success "Post-migration checklist created: $BACKUP_DIR/post-migration-checklist.md"
    
    return 0
}

#===============================================================================
# Main Execution
#===============================================================================

main() {
    info "╔══════════════════════════════════════════════════════════════╗"
    info "║  Migrate to Parallel Workflow v4                              ║"
    info "║  Migration ID: $MIGRATION_ID                    ║"
    info "╚══════════════════════════════════════════════════════════════╝"
    echo
    
    parse_args "$@"
    
    if [[ "$DRY_RUN" == true ]]; then
        warn "╔════════════════════════════════════════════════════════════╗"
        warn "║  DRY RUN MODE - No changes will be made                   ║"
        warn "╚════════════════════════════════════════════════════════════╝"
        echo
    fi
    
    # Run pre-flight checks
    if ! preflight_checks; then
        error "Pre-flight checks failed. Aborting."
        exit 1
    fi
    
    # Show configuration
    info "Configuration:"
    info "  v3 Webhook: $WEBHOOK_V3"
    info "  v4 Webhook: $WEBHOOK_V4"
    info "  n8n URL: $N8N_URL"
    info "  Backup Dir: $BACKUP_DIR"
    info "  Dry Run: $DRY_RUN"
    echo
    
    # Confirm migration
    if ! confirm "Start migration to parallel workflow v4?"; then
        info "Migration cancelled by user"
        exit 0
    fi
    
    # Execute migration steps
    local failed=false
    
    backup_workflow || failed=true
    import_workflow || failed=true
    configure_keepalive || failed=true
    
    if [[ "$failed" == true ]]; then
        error "Migration encountered issues. Please review logs."
        exit 1
    fi
    
    run_validation_tests || warn "Some validation tests failed"
    switch_traffic || warn "Traffic switch requires manual action"
    post_migration_verification
    
    # Final summary
    echo
    success "╔══════════════════════════════════════════════════════════════╗"
    success "║  Migration Complete!                                          ║"
    success "╚══════════════════════════════════════════════════════════════╝"
    echo
    info "Backup Location: $BACKUP_DIR"
    info "Log File: $LOG_FILE"
    info "Migration ID: $MIGRATION_ID"
    echo
    info "Next Steps:"
    info "  1. Complete traffic switch (manual)"
    info "  2. Monitor for 15 minutes"
    info "  3. Follow post-migration checklist:"
    info "     $BACKUP_DIR/post-migration-checklist.md"
    echo
    info "Rollback (if needed):"
    info "  ./scripts/rollback-parallel.sh --migration-id $MIGRATION_ID"
    echo
}

# Handle script interruption
trap 'error "Migration interrupted"; exit 130' INT TERM

# Run main function
main "$@"
