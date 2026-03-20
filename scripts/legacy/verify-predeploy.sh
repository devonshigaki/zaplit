#!/bin/bash
# =============================================================================
# Pre-Deployment Verification Script
# =============================================================================
# Purpose: Verify all prerequisites before Phase 1 deployment
# Usage:   ./verify-predeploy.sh
# Owner:   DevOps Engineering Team
# Date:    March 19, 2026
# =============================================================================

set -euo pipefail

# =============================================================================
# Configuration
# =============================================================================

INSTANCE_NAME="n8n-instance"
ZONE="us-central1-a"
PROJECT_ID="${PROJECT_ID:-zaplit-production}"
N8N_URL="https://n8n.zaplit.com"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_pass() { echo -e "${GREEN}[PASS]${NC} $1"; }
log_fail() { echo -e "${RED}[FAIL]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_section() { echo -e "\n${BOLD}$1${NC}"; }

PASS_COUNT=0
FAIL_COUNT=0
WARN_COUNT=0

# =============================================================================
# Checks
# =============================================================================

check_gcloud() {
    log_section "Checking GCP CLI"
    
    if ! command -v gcloud &> /dev/null; then
        log_fail "gcloud CLI not installed"
        log_info "Install from: https://cloud.google.com/sdk/docs/install"
        return 1
    fi
    log_pass "gcloud CLI installed"
    
    VERSION=$(gcloud version | head -1)
    log_info "Version: $VERSION"
}

check_gcp_auth() {
    log_section "Checking GCP Authentication"
    
    ACCOUNT=$(gcloud auth list --filter=status:ACTIVE --format="value(account)" 2>/dev/null || echo "")
    if [ -z "$ACCOUNT" ]; then
        log_fail "Not authenticated with gcloud"
        log_info "Run: gcloud auth login"
        return 1
    fi
    log_pass "Authenticated as: $ACCOUNT"
    
    PROJECT=$(gcloud config get-value project 2>/dev/null || echo "")
    if [ -z "$PROJECT" ]; then
        log_warn "No GCP project configured"
        log_info "Run: gcloud config set project zaplit-production"
    else
        log_pass "Project configured: $PROJECT"
    fi
}

check_ssh_access() {
    log_section "Checking SSH Access"
    
    log_info "Testing SSH to ${INSTANCE_NAME}..."
    if gcloud compute ssh "${INSTANCE_NAME}" --zone="${ZONE}" \
        --command="echo 'SSH OK'" > /dev/null 2>&1; then
        log_pass "SSH access confirmed"
    else
        log_fail "Cannot SSH to ${INSTANCE_NAME}"
        log_info "Check SSH keys and IAP permissions"
        return 1
    fi
}

check_instance() {
    log_section "Checking Instance Status"
    
    if ! gcloud compute instances describe "${INSTANCE_NAME}" --zone="${ZONE}" > /dev/null 2>&1; then
        log_fail "Instance ${INSTANCE_NAME} not found in zone ${ZONE}"
        return 1
    fi
    log_pass "Instance exists"
    
    STATUS=$(gcloud compute instances describe "${INSTANCE_NAME}" --zone="${ZONE}" \
        --format="value(status)" 2>/dev/null || echo "UNKNOWN")
    if [ "$STATUS" = "RUNNING" ]; then
        log_pass "Instance status: RUNNING"
    else
        log_warn "Instance status: $STATUS"
    fi
}

check_docker() {
    log_section "Checking Docker"
    
    DOCKER_VERSION=$(gcloud compute ssh "${INSTANCE_NAME}" --zone="${ZONE}" \
        --command="docker version --format '{{.Server.Version}}'" 2>/dev/null || echo "")
    
    if [ -n "$DOCKER_VERSION" ]; then
        log_pass "Docker running (version: $DOCKER_VERSION)"
    else
        log_fail "Docker not accessible"
        return 1
    fi
    
    COMPOSE_VERSION=$(gcloud compute ssh "${INSTANCE_NAME}" --zone="${ZONE}" \
        --command="docker-compose version --short" 2>/dev/null || echo "")
    if [ -n "$COMPOSE_VERSION" ]; then
        log_pass "Docker Compose available (version: $COMPOSE_VERSION)"
    else
        log_warn "Docker Compose version check failed"
    fi
}

check_n8n() {
    log_section "Checking n8n"
    
    # Check container
    N8N_CONTAINER=$(gcloud compute ssh "${INSTANCE_NAME}" --zone="${ZONE}" \
        --command="docker ps --filter 'name=n8n' --format '{{.Names}}'" 2>/dev/null || echo "")
    
    if [ -n "$N8N_CONTAINER" ]; then
        log_pass "n8n container running"
    else
        log_fail "n8n container not found"
        return 1
    fi
    
    # Check health
    HEALTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${N8N_URL}/healthz" 2>/dev/null || echo "000")
    if [ "$HEALTH_STATUS" = "200" ]; then
        log_pass "n8n health check passed (HTTP 200)"
    else
        log_warn "n8n health check returned HTTP $HEALTH_STATUS"
    fi
    
    # Get version
    N8N_VERSION=$(gcloud compute ssh "${INSTANCE_NAME}" --zone="${ZONE}" \
        --command="docker exec n8n n8n --version 2>/dev/null || echo 'unknown'")
    log_info "n8n version: $N8N_VERSION"
}

check_disk_space() {
    log_section "Checking Disk Space"
    
    DISK_USAGE=$(gcloud compute ssh "${INSTANCE_NAME}" --zone="${ZONE}" \
        --command="df /opt | awk 'NR==2 {print \$5}' | sed 's/%//'" 2>/dev/null || echo "100")
    
    if [ "$DISK_USAGE" -lt 70 ]; then
        log_pass "Disk usage: ${DISK_USAGE}%"
    elif [ "$DISK_USAGE" -lt 85 ]; then
        log_warn "Disk usage: ${DISK_USAGE}% (consider cleanup)"
    else
        log_fail "Disk usage critical: ${DISK_USAGE}%"
        return 1
    fi
}

check_backup_dirs() {
    log_section "Checking Backup Directories"
    
    gcloud compute ssh "${INSTANCE_NAME}" --zone="${ZONE}" --command="
        sudo mkdir -p /opt/n8n/backups
        sudo mkdir -p /opt/n8n/scripts
        sudo mkdir -p /var/log
    " > /dev/null 2>&1
    
    log_pass "Backup directories ready"
}

check_gcs() {
    log_section "Checking GCS Access"
    
    if gsutil ls -b "gs://zaplit-n8n-backups" > /dev/null 2>&1; then
        log_pass "GCS bucket exists: gs://zaplit-n8n-backups"
    else
        log_warn "GCS bucket not found (will be created during deployment)"
    fi
}

# =============================================================================
# Summary
# =============================================================================

print_summary() {
    echo ""
    echo "=================================="
    echo "Pre-Deployment Verification Summary"
    echo "=================================="
    echo -e "${GREEN}Passed:${NC}  $PASS_COUNT"
    echo -e "${YELLOW}Warnings:${NC} $WARN_COUNT"
    echo -e "${RED}Failed:${NC}  $FAIL_COUNT"
    echo "=================================="
    echo ""
    
    if [ $FAIL_COUNT -eq 0 ]; then
        echo -e "${GREEN}✓ All critical checks passed!${NC}"
        echo "Ready for Phase 1 deployment."
        echo ""
        echo "Next steps:"
        echo "  1. Review DEPLOYMENT_PHASE1_GUIDE.md"
        echo "  2. Complete DEPLOYMENT_CHECKLIST.md"
        echo "  3. Run: ./scripts/deploy-phase1.sh"
        return 0
    else
        echo -e "${RED}✗ Pre-deployment checks failed.${NC}"
        echo "Please address failures before proceeding."
        return 1
    fi
}

# =============================================================================
# Main
# =============================================================================

main() {
    echo "=================================="
    echo "Pre-Deployment Verification"
    echo "=================================="
    echo "Instance: ${INSTANCE_NAME}"
    echo "Zone: ${ZONE}"
    echo "Date: $(date '+%Y-%m-%d %H:%M:%S')"
    echo ""
    
    check_gcloud
    check_gcp_auth
    check_ssh_access
    check_instance
    check_docker
    check_n8n
    check_disk_space
    check_backup_dirs
    check_gcs
    
    print_summary
}

# Handle interrupts
trap 'echo -e "\nVerification interrupted"; exit 1' INT TERM

main "$@"
