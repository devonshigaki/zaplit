#!/bin/bash
# =============================================================================
# Phase 1 Deployment Verification Script
# =============================================================================
# Purpose: Comprehensive post-deployment verification
# Usage:   ./verify-deployment.sh [--detailed] [--json]
# Owner:   DevOps Engineering Team
# Date:    March 19, 2026
# =============================================================================

set -euo pipefail

# =============================================================================
# Configuration
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTANCE_NAME="n8n-instance"
ZONE="us-central1-a"
PROJECT_ID="${PROJECT_ID:-zaplit-production}"
N8N_URL="https://n8n.zaplit.com"
CRM_URL="https://crm.zaplit.com"

# Flags
DETAILED=false
JSON_OUTPUT=false
VERBOSE=false

# Results tracking
PASS_COUNT=0
FAIL_COUNT=0
WARN_COUNT=0
declare -A TEST_RESULTS

# =============================================================================
# Colors and Logging
# =============================================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_pass() { echo -e "${GREEN}[PASS]${NC} $1"; ((PASS_COUNT++)) || true; }
log_fail() { echo -e "${RED}[FAIL]${NC} $1"; ((FAIL_COUNT++)) || true; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; ((WARN_COUNT++)) || true; }
log_section() { echo -e "\n${BOLD}${CYAN}$1${NC}"; }

# =============================================================================
# Utility Functions
# =============================================================================

print_banner() {
    echo -e "${BOLD}${CYAN}"
    echo "╔════════════════════════════════════════════════════════════════════╗"
    echo "║           Phase 1 Deployment Verification Script                  ║"
    echo "║                Post-Deployment Health Check                        ║"
    echo "╚════════════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
    echo "Instance: ${INSTANCE_NAME}"
    echo "Zone: ${ZONE}"
    echo "Date: $(date '+%Y-%m-%d %H:%M:%S')"
    echo ""
}

parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --detailed|-d)
                DETAILED=true
                shift
                ;;
            --json|-j)
                JSON_OUTPUT=true
                shift
                ;;
            --verbose|-v)
                VERBOSE=true
                shift
                ;;
            --help|-h)
                echo "Usage: $0 [OPTIONS]"
                echo ""
                echo "Options:"
                echo "  --detailed, -d    Show detailed test output"
                echo "  --json, -j        Output results as JSON"
                echo "  --verbose, -v     Enable verbose logging"
                echo "  --help, -h        Show this help message"
                exit 0
                ;;
            *)
                log_fail "Unknown option: $1"
                exit 1
                ;;
        esac
    done
}

record_result() {
    local category="$1"
    local test="$2"
    local result="$3"
    local details="${4:-}"
    
    TEST_RESULTS["${category}:${test}"]="${result}|${details}"
}

# =============================================================================
# Pre-Deployment Verification
# =============================================================================

verify_connectivity() {
    log_section "1. Connectivity Verification"
    
    # 1.1 SSH Connectivity
    log_info "Testing SSH connectivity..."
    if gcloud compute ssh "${INSTANCE_NAME}" --zone="${ZONE}" \
        --command="echo 'SSH OK'" > /dev/null 2>&1; then
        log_pass "SSH connectivity"
        record_result "connectivity" "ssh" "PASS" "SSH to ${INSTANCE_NAME} successful"
    else
        log_fail "SSH connectivity"
        record_result "connectivity" "ssh" "FAIL" "Cannot SSH to ${INSTANCE_NAME}"
    fi
    
    # 1.2 Docker Status
    log_info "Checking Docker status..."
    DOCKER_VERSION=$(gcloud compute ssh "${INSTANCE_NAME}" --zone="${ZONE}" \
        --command="docker version --format '{{.Server.Version}}'" 2>/dev/null || echo "")
    if [ -n "$DOCKER_VERSION" ]; then
        log_pass "Docker is running (v${DOCKER_VERSION})"
        record_result "connectivity" "docker" "PASS" "Docker v${DOCKER_VERSION}"
    else
        log_fail "Docker is not running"
        record_result "connectivity" "docker" "FAIL" "Docker not accessible"
    fi
    
    # 1.3 n8n Version
    log_info "Checking n8n version..."
    N8N_VERSION=$(gcloud compute ssh "${INSTANCE_NAME}" --zone="${ZONE}" \
        --command="docker exec n8n n8n --version 2>/dev/null || echo 'unknown'")
    if [[ "$N8N_VERSION" != "unknown" && -n "$N8N_VERSION" ]]; then
        log_pass "n8n version: ${N8N_VERSION}"
        record_result "connectivity" "n8n_version" "PASS" "${N8N_VERSION}"
    else
        log_warn "Could not determine n8n version"
        record_result "connectivity" "n8n_version" "WARN" "Version unknown"
    fi
}

verify_infrastructure() {
    log_section "2. Infrastructure Verification"
    
    # 2.1 Disk Space
    log_info "Checking disk space..."
    DISK_USAGE=$(gcloud compute ssh "${INSTANCE_NAME}" --zone="${ZONE}" \
        --command="df /opt | awk 'NR==2 {print \$5}' | sed 's/%//'" 2>/dev/null || echo "100")
    if [ "$DISK_USAGE" -lt 80 ]; then
        log_pass "Disk usage: ${DISK_USAGE}%"
        record_result "infrastructure" "disk_space" "PASS" "${DISK_USAGE}% used"
    elif [ "$DISK_USAGE" -lt 90 ]; then
        log_warn "Disk usage is high: ${DISK_USAGE}%"
        record_result "infrastructure" "disk_space" "WARN" "${DISK_USAGE}% used"
    else
        log_fail "Disk usage critical: ${DISK_USAGE}%"
        record_result "infrastructure" "disk_space" "FAIL" "${DISK_USAGE}% used"
    fi
    
    # 2.2 Memory Usage
    log_info "Checking memory usage..."
    MEM_USAGE=$(gcloud compute ssh "${INSTANCE_NAME}" --zone="${ZONE}" \
        --command="free | awk 'NR==2{printf \"%.0f\", \$3*100/\$2}'" 2>/dev/null || echo "100")
    if [ "$MEM_USAGE" -lt 80 ]; then
        log_pass "Memory usage: ${MEM_USAGE}%"
        record_result "infrastructure" "memory" "PASS" "${MEM_USAGE}% used"
    else
        log_warn "Memory usage high: ${MEM_USAGE}%"
        record_result "infrastructure" "memory" "WARN" "${MEM_USAGE}% used"
    fi
    
    # 2.3 Container Status
    log_info "Checking container status..."
    CONTAINERS=$(gcloud compute ssh "${INSTANCE_NAME}" --zone="${ZONE}" \
        --command="docker ps --format '{{.Names}}:{{.Status}}' | grep -E 'n8n|postgres'" 2>/dev/null || echo "")
    if echo "$CONTAINERS" | grep -q "n8n"; then
        log_pass "n8n container is running"
        record_result "infrastructure" "n8n_container" "PASS" "Running"
    else
        log_fail "n8n container is not running"
        record_result "infrastructure" "n8n_container" "FAIL" "Not running"
    fi
}

# =============================================================================
# Security Verification
# =============================================================================

verify_security() {
    log_section "3. Security Verification"
    
    # 3.1 Encryption Key
    log_info "Checking N8N_ENCRYPTION_KEY..."
    ENC_KEY=$(gcloud compute ssh "${INSTANCE_NAME}" --zone="${ZONE}" \
        --command="docker exec n8n printenv N8N_ENCRYPTION_KEY" 2>/dev/null || echo "")
    if [ -n "$ENC_KEY" ]; then
        KEY_LENGTH=${#ENC_KEY}
        if [[ "$ENC_KEY" =~ ^[a-f0-9]{64}$ ]]; then
            log_pass "Encryption key is valid (64 hex chars)"
            record_result "security" "encryption_key" "PASS" "64 hex characters"
        else
            log_warn "Encryption key format may be non-standard (${KEY_LENGTH} chars)"
            record_result "security" "encryption_key" "WARN" "${KEY_LENGTH} chars, non-standard format"
        fi
    else
        log_fail "N8N_ENCRYPTION_KEY is not set"
        record_result "security" "encryption_key" "FAIL" "Not configured"
    fi
    
    # 3.2 Basic Authentication
    log_info "Checking Basic Authentication..."
    AUTH_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "${N8N_URL}/" 2>/dev/null || echo "000")
    if [ "$AUTH_RESPONSE" = "401" ]; then
        log_pass "Basic authentication is active (returns 401)"
        record_result "security" "basic_auth" "PASS" "Active (HTTP 401)"
    elif [ "$AUTH_RESPONSE" = "200" ]; then
        log_fail "Basic authentication is NOT active (returns 200)"
        record_result "security" "basic_auth" "FAIL" "Not active (HTTP 200)"
    else
        log_warn "Could not verify basic auth (HTTP ${AUTH_RESPONSE})"
        record_result "security" "basic_auth" "WARN" "HTTP ${AUTH_RESPONSE}"
    fi
    
    # 3.3 HMAC Secret
    log_info "Checking Webhook HMAC secret..."
    HMAC_SECRET=$(gcloud compute ssh "${INSTANCE_NAME}" --zone="${ZONE}" \
        --command="docker exec n8n printenv WEBHOOK_HMAC_SECRET" 2>/dev/null || echo "")
    if [ -n "$HMAC_SECRET" ]; then
        log_pass "Webhook HMAC secret is configured"
        record_result "security" "hmac_secret" "PASS" "Configured"
    else
        log_warn "Webhook HMAC secret not found"
        record_result "security" "hmac_secret" "WARN" "Not configured"
    fi
    
    # 3.4 Webhook Security (if HMAC is configured)
    if [ -n "$HMAC_SECRET" ]; then
        log_info "Testing webhook HMAC verification..."
        PAYLOAD='{"test":"verification"}'
        SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$HMAC_SECRET" | cut -d' ' -f2)
        
        # Test with valid signature
        VALID_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" \
            -X POST "${N8N_URL}/webhook/consultation-form" \
            -H "Content-Type: application/json" \
            -H "X-Webhook-Signature: $SIGNATURE" \
            -d "$PAYLOAD" 2>/dev/null || echo "000")
        
        # Test without signature
        NO_SIG_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" \
            -X POST "${N8N_URL}/webhook/consultation-form" \
            -H "Content-Type: application/json" \
            -d "$PAYLOAD" 2>/dev/null || echo "000")
        
        if [[ "$VALID_RESPONSE" =~ ^(200|201)$ ]]; then
            log_pass "Webhook accepts valid HMAC signatures"
            record_result "security" "webhook_hmac_valid" "PASS" "HTTP ${VALID_RESPONSE}"
        else
            log_warn "Webhook response with valid HMAC: HTTP ${VALID_RESPONSE}"
            record_result "security" "webhook_hmac_valid" "WARN" "HTTP ${VALID_RESPONSE}"
        fi
        
        if [ "$NO_SIG_RESPONSE" = "401" ]; then
            log_pass "Webhook rejects requests without HMAC (401)"
            record_result "security" "webhook_hmac_missing" "PASS" "HTTP 401"
        else
            log_warn "Webhook response without HMAC: HTTP ${NO_SIG_RESPONSE}"
            record_result "security" "webhook_hmac_missing" "WARN" "HTTP ${NO_SIG_RESPONSE}"
        fi
    fi
}

# =============================================================================
# DR Verification
# =============================================================================

verify_dr() {
    log_section "4. Disaster Recovery Verification"
    
    # 4.1 Snapshot Schedule
    log_info "Checking GCP snapshot schedule..."
    if gcloud compute resource-policies describe snapshot-schedule-n8n \
        --region="${ZONE%-*}" > /dev/null 2>&1; then
        log_pass "Snapshot schedule exists"
        record_result "dr" "snapshot_schedule" "PASS" "Configured"
    else
        log_fail "Snapshot schedule not found"
        record_result "dr" "snapshot_schedule" "FAIL" "Not configured"
    fi
    
    # 4.2 Snapshot Attachment
    log_info "Checking snapshot schedule attachment..."
    DISK_POLICIES=$(gcloud compute disks describe "${INSTANCE_NAME}" \
        --zone="${ZONE}" --format="value(resourcePolicies)" 2>/dev/null || echo "")
    if echo "$DISK_POLICIES" | grep -q "snapshot-schedule"; then
        log_pass "Snapshot schedule attached to VM disk"
        record_result "dr" "snapshot_attached" "PASS" "Attached"
    else
        log_fail "Snapshot schedule not attached to VM disk"
        record_result "dr" "snapshot_attached" "FAIL" "Not attached"
    fi
    
    # 4.3 Backup Script
    log_info "Checking database backup script..."
    if gcloud compute ssh "${INSTANCE_NAME}" --zone="${ZONE}" \
        --command="test -x /opt/n8n/scripts/backup-database.sh" > /dev/null 2>&1; then
        log_pass "Database backup script exists and is executable"
        record_result "dr" "backup_script" "PASS" "Exists"
    else
        log_fail "Database backup script not found or not executable"
        record_result "dr" "backup_script" "FAIL" "Missing"
    fi
    
    # 4.4 Cron Job
    log_info "Checking backup cron job..."
    CRON_JOB=$(gcloud compute ssh "${INSTANCE_NAME}" --zone="${ZONE}" \
        --command="crontab -l 2>/dev/null | grep backup-database" || echo "")
    if [ -n "$CRON_JOB" ]; then
        log_pass "Backup cron job is configured"
        record_result "dr" "backup_cron" "PASS" "Configured"
        if [[ "$DETAILED" == true ]]; then
            echo "  Cron: $CRON_JOB"
        fi
    else
        log_fail "Backup cron job not configured"
        record_result "dr" "backup_cron" "FAIL" "Missing"
    fi
    
    # 4.5 GCS Bucket
    log_info "Checking GCS backup bucket..."
    if gsutil ls -b "gs://zaplit-n8n-backups" > /dev/null 2>&1; then
        log_pass "GCS backup bucket exists"
        record_result "dr" "gcs_bucket" "PASS" "Exists"
        
        # Check for recent backups
        LATEST_BACKUP=$(gsutil ls "gs://zaplit-n8n-backups/n8n-db-*.sql.gz" 2>/dev/null | sort | tail -1 || echo "")
        if [ -n "$LATEST_BACKUP" ]; then
            BACKUP_DATE=$(echo "$LATEST_BACKUP" | grep -o '[0-9]\{8\}_[0-9]\{6\}' || echo "unknown")
            log_pass "Latest backup: ${BACKUP_DATE}"
            record_result "dr" "latest_backup" "PASS" "${BACKUP_DATE}"
        else
            log_warn "No backups found in GCS bucket"
            record_result "dr" "latest_backup" "WARN" "None found"
        fi
    else
        log_fail "GCS backup bucket not found"
        record_result "dr" "gcs_bucket" "FAIL" "Missing"
    fi
    
    # 4.6 Docker Auto-Restart
    log_info "Checking Docker auto-restart..."
    RESTART_POLICY=$(gcloud compute ssh "${INSTANCE_NAME}" --zone="${ZONE}" \
        --command="grep 'restart:' /opt/n8n/docker-compose.yml | head -1" 2>/dev/null || echo "")
    if echo "$RESTART_POLICY" | grep -q "always"; then
        log_pass "Docker restart policy set to 'always'"
        record_result "dr" "docker_restart" "PASS" "Always"
    else
        log_warn "Docker restart policy not set to 'always'"
        record_result "dr" "docker_restart" "WARN" "Not always"
    fi
    
    DOCKER_ENABLED=$(gcloud compute ssh "${INSTANCE_NAME}" --zone="${ZONE}" \
        --command="sudo systemctl is-enabled docker" 2>/dev/null || echo "")
    if [ "$DOCKER_ENABLED" = "enabled" ]; then
        log_pass "Docker service enabled on boot"
        record_result "dr" "docker_enabled" "PASS" "Enabled"
    else
        log_warn "Docker service not enabled on boot"
        record_result "dr" "docker_enabled" "WARN" "Not enabled"
    fi
}

# =============================================================================
# Monitoring Verification
# =============================================================================

verify_monitoring() {
    log_section "5. Monitoring Verification"
    
    # 5.1 Prometheus
    log_info "Checking Prometheus..."
    PROM_STATUS=$(gcloud compute ssh "${INSTANCE_NAME}" --zone="${ZONE}" \
        --command="curl -s http://localhost:9090/-/healthy" 2>/dev/null || echo "")
    if [ "$PROM_STATUS" = "Prometheus is Healthy." ]; then
        log_pass "Prometheus is healthy"
        record_result "monitoring" "prometheus_health" "PASS" "Healthy"
    else
        log_fail "Prometheus is not responding"
        record_result "monitoring" "prometheus_health" "FAIL" "Not responding"
    fi
    
    # 5.2 Prometheus Targets
    log_info "Checking Prometheus targets..."
    TARGET_COUNT=$(gcloud compute ssh "${INSTANCE_NAME}" --zone="${ZONE}" \
        --command="curl -s http://localhost:9090/api/v1/targets | grep -o '"health":"up"' | wc -l" 2>/dev/null || echo "0")
    if [ "$TARGET_COUNT" -ge 2 ]; then
        log_pass "Prometheus has ${TARGET_COUNT} targets up"
        record_result "monitoring" "prometheus_targets" "PASS" "${TARGET_COUNT} up"
    else
        log_warn "Prometheus has only ${TARGET_COUNT} targets up"
        record_result "monitoring" "prometheus_targets" "WARN" "${TARGET_COUNT} up"
    fi
    
    # 5.3 Grafana
    log_info "Checking Grafana..."
    GRAFANA_HEALTH=$(gcloud compute ssh "${INSTANCE_NAME}" --zone="${ZONE}" \
        --command="curl -s http://localhost:3000/api/health | grep -o '"database":"[^"]*"'" 2>/dev/null || echo "")
    if echo "$GRAFANA_HEALTH" | grep -q '"database":"ok"'; then
        log_pass "Grafana is healthy"
        record_result "monitoring" "grafana_health" "PASS" "Healthy"
    else
        log_fail "Grafana is not responding properly"
        record_result "monitoring" "grafana_health" "FAIL" "Not responding"
    fi
    
    # 5.4 Alert Rules
    log_info "Checking alert rules..."
    ALERT_COUNT=$(gcloud compute ssh "${INSTANCE_NAME}" --zone="${ZONE}" \
        --command="curl -s http://localhost:9090/api/v1/rules | grep -o '"name":"[^"]*"' | wc -l" 2>/dev/null || echo "0")
    if [ "$ALERT_COUNT" -ge 3 ]; then
        log_pass "Alert rules loaded: ${ALERT_COUNT}"
        record_result "monitoring" "alert_rules" "PASS" "${ALERT_COUNT} rules"
    else
        log_warn "Alert rules may not be loaded: ${ALERT_COUNT}"
        record_result "monitoring" "alert_rules" "WARN" "${ALERT_COUNT} rules"
    fi
    
    # 5.5 Node Exporter
    log_info "Checking Node Exporter..."
    NODE_EXPORTER=$(gcloud compute ssh "${INSTANCE_NAME}" --zone="${ZONE}" \
        --command="curl -s http://localhost:9100/metrics | grep -c 'node_'" 2>/dev/null || echo "0")
    if [ "$NODE_EXPORTER" -gt 0 ]; then
        log_pass "Node Exporter is providing metrics"
        record_result "monitoring" "node_exporter" "PASS" "Metrics available"
    else
        log_warn "Node Exporter metrics not available"
        record_result "monitoring" "node_exporter" "WARN" "No metrics"
    fi
}

# =============================================================================
# Data Quality Verification
# =============================================================================

verify_data_quality() {
    log_section "6. Data Quality Verification"
    
    # 6.1 n8n Health Check
    log_info "Checking n8n health endpoint..."
    HEALTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${N8N_URL}/healthz" 2>/dev/null || echo "000")
    if [ "$HEALTH_STATUS" = "200" ]; then
        log_pass "n8n health check passed"
        record_result "data_quality" "n8n_health" "PASS" "HTTP 200"
    else
        log_fail "n8n health check failed (HTTP ${HEALTH_STATUS})"
        record_result "data_quality" "n8n_health" "FAIL" "HTTP ${HEALTH_STATUS}"
    fi
    
    # 6.2 API Accessibility
    log_info "Checking n8n API..."
    API_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${N8N_URL}/api/v1/health" 2>/dev/null || echo "000")
    if [ "$API_STATUS" = "200" ]; then
        log_pass "n8n API is accessible"
        record_result "data_quality" "n8n_api" "PASS" "HTTP 200"
    else
        log_warn "n8n API returned HTTP ${API_STATUS}"
        record_result "data_quality" "n8n_api" "WARN" "HTTP ${API_STATUS}"
    fi
    
    # 6.3 CRM Connectivity
    log_info "Checking CRM connectivity..."
    CRM_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
        -X POST "${CRM_URL}/graphql" \
        -H "Content-Type: application/json" \
        -d '{"query":"{ __typename }"}' 2>/dev/null || echo "000")
    if [[ "$CRM_STATUS" =~ ^(200|401|403)$ ]]; then
        log_pass "CRM is responding (HTTP ${CRM_STATUS})"
        record_result "data_quality" "crm_connectivity" "PASS" "HTTP ${CRM_STATUS}"
    else
        log_warn "CRM returned HTTP ${CRM_STATUS}"
        record_result "data_quality" "crm_connectivity" "WARN" "HTTP ${CRM_STATUS}"
    fi
}

# =============================================================================
# Summary and Output
# =============================================================================

print_summary() {
    log_section "Verification Summary"
    
    TOTAL_TESTS=$((PASS_COUNT + FAIL_COUNT + WARN_COUNT))
    
    echo "=================================="
    echo -e "${GREEN}Passed:${NC}  ${PASS_COUNT}/${TOTAL_TESTS}"
    echo -e "${YELLOW}Warnings:${NC} ${WARN_COUNT}/${TOTAL_TESTS}"
    echo -e "${RED}Failed:${NC}  ${FAIL_COUNT}/${TOTAL_TESTS}"
    echo "=================================="
    
    if [ $FAIL_COUNT -eq 0 ] && [ $WARN_COUNT -eq 0 ]; then
        echo -e "\n${GREEN}✓ All verification checks passed!${NC}"
        echo "Phase 1 deployment is healthy and fully operational."
        return 0
    elif [ $FAIL_COUNT -eq 0 ]; then
        echo -e "\n${YELLOW}⚠ Verification completed with warnings.${NC}"
        echo "Review warnings above for recommendations."
        return 0
    else
        echo -e "\n${RED}✗ Verification failed with ${FAIL_COUNT} errors.${NC}"
        echo "Review failures above and address critical issues."
        return 1
    fi
}

output_json() {
    local timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    
    echo "{"
    echo "  \"timestamp\": \"${timestamp}\","
    echo "  \"instance\": \"${INSTANCE_NAME}\","
    echo "  \"zone\": \"${ZONE}\","
    echo "  \"summary\": {"
    echo "    \"total\": $((PASS_COUNT + FAIL_COUNT + WARN_COUNT)),"
    echo "    \"passed\": ${PASS_COUNT},"
    echo "    \"failed\": ${FAIL_COUNT},"
    echo "    \"warnings\": ${WARN_COUNT}"
    echo "  },"
    echo "  \"results\": {"
    
    local first=true
    for key in "${!TEST_RESULTS[@]}"; do
        if [[ "$first" == false ]]; then
            echo ","
        fi
        first=false
        
        local category="${key%%:*}"
        local test="${key#*:}"
        local value="${TEST_RESULTS[$key]}"
        local result="${value%%|*}"
        local details="${value#*|}"
        
        echo -n "    \"${category}_${test}\": {"
        echo -n "\"result\": \"${result}\", \"details\": \"${details}\"}"
    done
    
    echo ""
    echo "  }"
    echo "}"
}

# =============================================================================
# Main
# =============================================================================

main() {
    print_banner
    parse_args "$@"
    
    # Set project
    gcloud config set project "${PROJECT_ID}" > /dev/null 2>&1
    
    # Run all verification checks
    verify_connectivity
    verify_infrastructure
    verify_security
    verify_dr
    verify_monitoring
    verify_data_quality
    
    # Output results
    if [[ "$JSON_OUTPUT" == true ]]; then
        output_json
    else
        print_summary
    fi
}

# Handle interrupts
trap 'echo -e "\n${RED}Verification interrupted${NC}"; exit 1' INT TERM

# Run main
main "$@"
