#!/bin/bash
# =============================================================================
# Phase 1 (Stabilize) Master Deployment Script
# =============================================================================
# Purpose: Orchestrates all Phase 1 deployment tasks
# Usage:   ./deploy-phase1.sh [--dry-run] [--skip-security] [--skip-dr] [--skip-monitoring]
# Owner:   DevOps Engineering Team
# Date:    March 19, 2026
# =============================================================================

set -euo pipefail

# =============================================================================
# Configuration
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
INSTANCE_NAME="n8n-instance"
ZONE="us-central1-a"
PROJECT_ID="${PROJECT_ID:-zaplit-production}"

# Deployment flags
DRY_RUN=false
SKIP_SECURITY=false
SKIP_DR=false
SKIP_MONITORING=false
SKIP_DATA_QUALITY=false

# Track deployment status
declare -A DEPLOYMENT_STATUS
FAILED_STEPS=()
COMPLETED_STEPS=()

# =============================================================================
# Colors and Logging
# =============================================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[PASS]${NC} $1"; }
log_error() { echo -e "${RED}[FAIL]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_section() { echo -e "\n${BOLD}${CYAN}$1${NC}\n"; }

# =============================================================================
# Utility Functions
# =============================================================================

print_banner() {
    echo -e "${BOLD}${CYAN}"
    echo "╔════════════════════════════════════════════════════════════════════╗"
    echo "║              Phase 1 (Stabilize) Deployment Script                ║"
    echo "║                    Production Deployment                           ║"
    echo "╚════════════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
    echo "Instance: ${INSTANCE_NAME}"
    echo "Zone: ${ZONE}"
    echo "Project: ${PROJECT_ID}"
    echo "Date: $(date '+%Y-%m-%d %H:%M:%S')"
    echo ""
}

parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --dry-run)
                DRY_RUN=true
                log_warn "DRY RUN MODE: No changes will be made"
                shift
                ;;
            --skip-security)
                SKIP_SECURITY=true
                log_warn "Skipping security deployment"
                shift
                ;;
            --skip-dr)
                SKIP_DR=true
                log_warn "Skipping DR deployment"
                shift
                ;;
            --skip-monitoring)
                SKIP_MONITORING=true
                log_warn "Skipping monitoring deployment"
                shift
                ;;
            --skip-data-quality)
                SKIP_DATA_QUALITY=true
                log_warn "Skipping data quality deployment"
                shift
                ;;
            --help|-h)
                echo "Usage: $0 [OPTIONS]"
                echo ""
                echo "Options:"
                echo "  --dry-run           Simulate deployment without making changes"
                echo "  --skip-security     Skip security hardening deployment"
                echo "  --skip-dr           Skip disaster recovery deployment"
                echo "  --skip-monitoring   Skip monitoring deployment"
                echo "  --skip-data-quality Skip data quality deployment"
                echo "  --help, -h          Show this help message"
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                exit 1
                ;;
        esac
    done
}

confirm_deployment() {
    if [[ "$DRY_RUN" == true ]]; then
        return 0
    fi
    
    echo ""
    log_warn "This will deploy Phase 1 changes to PRODUCTION"
    echo ""
    echo "Components to deploy:"
    [[ "$SKIP_SECURITY" == false ]] && echo "  ✓ Security Hardening (CRITICAL)"
    [[ "$SKIP_DR" == false ]] && echo "  ✓ Disaster Recovery (HIGH)"
    [[ "$SKIP_MONITORING" == false ]] && echo "  ✓ Monitoring Stack (HIGH)"
    [[ "$SKIP_DATA_QUALITY" == false ]] && echo "  ✓ Data Quality (MEDIUM)"
    echo ""
    
    read -p "Are you sure you want to proceed? (yes/no): " -r
    if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
        log_info "Deployment cancelled by user"
        exit 0
    fi
}

# =============================================================================
# Pre-Deployment Checks
# =============================================================================

check_prerequisites() {
    log_section "Phase 0: Pre-Deployment Verification"
    
    # Check gcloud
    if ! command -v gcloud &> /dev/null; then
        log_error "gcloud CLI is not installed"
        exit 1
    fi
    log_success "gcloud CLI is installed"
    
    # Check authentication
    if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q "@"; then
        log_error "Not authenticated with gcloud. Run: gcloud auth login"
        exit 1
    fi
    log_success "Authenticated with gcloud"
    
    # Set project
    gcloud config set project "${PROJECT_ID}" > /dev/null 2>&1
    log_success "GCP project set to ${PROJECT_ID}"
    
    # Check if instance exists
    if ! gcloud compute instances describe "${INSTANCE_NAME}" --zone="${ZONE}" > /dev/null 2>&1; then
        log_error "Instance '${INSTANCE_NAME}' not found in zone '${ZONE}'"
        exit 1
    fi
    log_success "Instance ${INSTANCE_NAME} exists"
    
    # Test SSH connectivity
    if ! gcloud compute ssh "${INSTANCE_NAME}" --zone="${ZONE}" \
        --command="echo 'SSH test successful'" > /dev/null 2>&1; then
        log_error "Cannot SSH to instance. Check SSH keys and permissions."
        exit 1
    fi
    log_success "SSH connectivity verified"
    
    # Check Docker status
    DOCKER_STATUS=$(gcloud compute ssh "${INSTANCE_NAME}" --zone="${ZONE}" \
        --command="docker info --format '{{.ServerVersion}}'" 2>/dev/null || echo "")
    if [ -z "$DOCKER_STATUS" ]; then
        log_error "Docker is not running on the instance"
        exit 1
    fi
    log_success "Docker is running (version: ${DOCKER_STATUS})"
    
    # Get n8n version
    N8N_VERSION=$(gcloud compute ssh "${INSTANCE_NAME}" --zone="${ZONE}" \
        --command="docker exec n8n n8n --version 2>/dev/null || echo 'unknown'")
    log_info "n8n version: ${N8N_VERSION}"
    
    # Check disk space
    DISK_USAGE=$(gcloud compute ssh "${INSTANCE_NAME}" --zone="${ZONE}" \
        --command="df /opt | awk 'NR==2 {print \$5}' | sed 's/%//'")
    if [ "$DISK_USAGE" -gt 85 ]; then
        log_warn "Disk usage is high: ${DISK_USAGE}%. Consider cleaning up before deployment."
    else
        log_success "Disk usage is healthy: ${DISK_USAGE}%"
    fi
    
    # Check backup directory exists
    if [[ "$DRY_RUN" == false ]]; then
        gcloud compute ssh "${INSTANCE_NAME}" --zone="${ZONE}" --command="
            sudo mkdir -p /opt/n8n/backups
            sudo mkdir -p /opt/n8n/scripts
        "
        log_success "Backup directories ready"
    fi
    
    COMPLETED_STEPS+=("prerequisites")
}

# =============================================================================
# Phase 1A: Security Deployment
# =============================================================================

deploy_security() {
    log_section "Phase 1A: Security Hardening (CRITICAL)"
    
    if [[ "$SKIP_SECURITY" == true ]]; then
        log_warn "Skipped"
        DEPLOYMENT_STATUS["security"]="SKIPPED"
        return 0
    fi
    
    if [[ "$DRY_RUN" == true ]]; then
        log_info "[DRY RUN] Would deploy security hardening"
        DEPLOYMENT_STATUS["security"]="DRY_RUN"
        return 0
    fi
    
    # Step 1A.1: Verify Encryption Key
    log_info "Step 1A.1: Verifying N8N_ENCRYPTION_KEY..."
    if [ -f "${SCRIPT_DIR}/security/verify-encryption-key.sh" ]; then
        if "${SCRIPT_DIR}/security/verify-encryption-key.sh" "${INSTANCE_NAME}" "${ZONE}"; then
            log_success "Encryption key verified"
        else
            log_error "Encryption key verification failed"
            FAILED_STEPS+=("security:encryption-key")
            return 1
        fi
    else
        log_warn "verify-encryption-key.sh not found, skipping verification"
    fi
    
    # Step 1A.2: Enable Basic Auth
    log_info "Step 1A.2: Enabling Basic Authentication..."
    if [ -f "${SCRIPT_DIR}/security/enable-basic-auth.sh" ]; then
        # Run non-interactively by setting defaults
        export N8N_BASIC_AUTH_USER="${N8N_BASIC_AUTH_USER:-zaplit-admin}"
        if "${SCRIPT_DIR}/security/enable-basic-auth.sh" "${INSTANCE_NAME}" "${ZONE}" "${N8N_BASIC_AUTH_USER}"; then
            log_success "Basic authentication enabled"
        else
            log_error "Failed to enable basic authentication"
            FAILED_STEPS+=("security:basic-auth")
            return 1
        fi
    else
        log_warn "enable-basic-auth.sh not found, skipping"
    fi
    
    # Step 1A.3: Configure Webhook HMAC
    log_info "Step 1A.3: Configuring Webhook HMAC Secret..."
    
    # Generate HMAC secret if not exists
    if ! gcloud secrets describe webhook-hmac-secret > /dev/null 2>&1; then
        WEBHOOK_SECRET=$(openssl rand -hex 32)
        echo -n "$WEBHOOK_SECRET" | gcloud secrets create webhook-hmac-secret \
            --data-file=- --labels="service=n8n,env=production"
        log_success "Created webhook HMAC secret"
    else
        log_info "Webhook HMAC secret already exists"
    fi
    
    # Update docker-compose with HMAC secret
    WEBHOOK_SECRET=$(gcloud secrets versions access latest --secret=webhook-hmac-secret)
    gcloud compute ssh "${INSTANCE_NAME}" --zone="${ZONE}" --command="
        # Backup
        sudo cp /opt/n8n/docker-compose.yml /opt/n8n/backups/docker-compose.yml.pre-hmac.$(date +%Y%m%d_%H%M%S)
        
        # Add HMAC secret if not exists
        if ! sudo grep -q 'WEBHOOK_HMAC_SECRET' /opt/n8n/docker-compose.yml; then
            sudo sed -i '/N8N_BASIC_AUTH_PASSWORD/a\      - WEBHOOK_HMAC_SECRET=${WEBHOOK_SECRET}' /opt/n8n/docker-compose.yml
            echo 'HMAC secret added'
        else
            sudo sed -i 's/WEBHOOK_HMAC_SECRET=.*/WEBHOOK_HMAC_SECRET=${WEBHOOK_SECRET}/' /opt/n8n/docker-compose.yml
            echo 'HMAC secret updated'
        fi
    "
    
    log_success "Webhook HMAC configured"
    
    DEPLOYMENT_STATUS["security"]="SUCCESS"
    COMPLETED_STEPS+=("security")
}

# =============================================================================
# Phase 1B: Disaster Recovery
# =============================================================================

deploy_dr() {
    log_section "Phase 1B: Disaster Recovery (HIGH)"
    
    if [[ "$SKIP_DR" == true ]]; then
        log_warn "Skipped"
        DEPLOYMENT_STATUS["dr"]="SKIPPED"
        return 0
    fi
    
    if [[ "$DRY_RUN" == true ]]; then
        log_info "[DRY RUN] Would deploy DR configuration"
        DEPLOYMENT_STATUS["dr"]="DRY_RUN"
        return 0
    fi
    
    # Step 1B.1: Configure VM Snapshots
    log_info "Step 1B.1: Configuring GCP VM Snapshots..."
    if [ -f "${SCRIPT_DIR}/dr/setup-snapshot-schedule.sh" ]; then
        if "${SCRIPT_DIR}/dr/setup-snapshot-schedule.sh"; then
            log_success "Snapshot schedule configured"
        else
            log_error "Failed to configure snapshot schedule"
            FAILED_STEPS+=("dr:snapshots")
        fi
    else
        log_warn "setup-snapshot-schedule.sh not found"
    fi
    
    # Step 1B.2: Setup Database Backup
    log_info "Step 1B.2: Setting up Database Backup..."
    if [ -f "${SCRIPT_DIR}/dr/backup-database.sh" ]; then
        # Copy script to VM
        gcloud compute scp "${SCRIPT_DIR}/dr/backup-database.sh" \
            "${INSTANCE_NAME}:/opt/n8n/scripts/" --zone="${ZONE}"
        
        # Configure on VM
        gcloud compute ssh "${INSTANCE_NAME}" --zone="${ZONE}" --command="
            chmod +x /opt/n8n/scripts/backup-database.sh
            
            # Setup cron job
            (crontab -l 2>/dev/null | grep -v backup-database; 
             echo '0 3 * * * /opt/n8n/scripts/backup-database.sh >> /var/log/n8n-backup.log 2>&1') | crontab -
            
            echo 'Backup cron job configured'
        "
        log_success "Database backup configured"
    else
        log_warn "backup-database.sh not found"
    fi
    
    # Step 1B.3: Configure Docker Auto-Restart
    log_info "Step 1B.3: Configuring Docker Auto-Restart..."
    gcloud compute ssh "${INSTANCE_NAME}" --zone="${ZONE}" --command="
        # Backup
        sudo cp /opt/n8n/docker-compose.yml /opt/n8n/backups/docker-compose.yml.pre-restart.$(date +%Y%m%d_%H%M%S)
        
        # Update restart policies
        sudo sed -i 's/restart: unless-stopped/restart: always/g' /opt/n8n/docker-compose.yml
        
        # Enable Docker on boot
        sudo systemctl enable docker
        
        echo 'Auto-restart configured'
    "
    log_success "Docker auto-restart configured"
    
    DEPLOYMENT_STATUS["dr"]="SUCCESS"
    COMPLETED_STEPS+=("dr")
}

# =============================================================================
# Phase 1C: Monitoring Deployment
# =============================================================================

deploy_monitoring() {
    log_section "Phase 1C: Monitoring Stack (HIGH)"
    
    if [[ "$SKIP_MONITORING" == true ]]; then
        log_warn "Skipped"
        DEPLOYMENT_STATUS["monitoring"]="SKIPPED"
        return 0
    fi
    
    if [[ "$DRY_RUN" == true ]]; then
        log_info "[DRY RUN] Would deploy monitoring stack"
        DEPLOYMENT_STATUS["monitoring"]="DRY_RUN"
        return 0
    fi
    
    # Step 1C.1: Deploy Prometheus + Grafana
    log_info "Step 1C.1: Deploying Prometheus and Grafana..."
    if [ -f "${SCRIPT_DIR}/monitoring/deploy-monitoring.sh" ]; then
        # Copy script to VM
        gcloud compute scp "${SCRIPT_DIR}/monitoring/deploy-monitoring.sh" \
            "${INSTANCE_NAME}:/opt/n8n/scripts/" --zone="${ZONE}"
        
        # Run on VM (non-interactively)
        gcloud compute ssh "${INSTANCE_NAME}" --zone="${ZONE}" --command="
            cd /opt/n8n
            chmod +x scripts/deploy-monitoring.sh
            export GRAFANA_ADMIN_PASSWORD='${GRAFANA_ADMIN_PASSWORD:-$(openssl rand -base64 16 | tr -dc 'a-zA-Z0-9' | head -c 16)}'
            sudo -E ./scripts/deploy-monitoring.sh <<< 'y'
        "
        log_success "Monitoring stack deployed"
    else
        log_warn "deploy-monitoring.sh not found"
    fi
    
    # Step 1C.2: Configure Alert Rules
    log_info "Step 1C.2: Configuring Alert Rules..."
    if [ -f "${PROJECT_ROOT}/monitoring/alert-rules.yml" ]; then
        gcloud compute scp "${PROJECT_ROOT}/monitoring/alert-rules.yml" \
            "${INSTANCE_NAME}:/opt/n8n/monitoring/" --zone="${ZONE}"
        
        # Reload Prometheus
        gcloud compute ssh "${INSTANCE_NAME}" --zone="${ZONE}" \
            --command="curl -X POST http://localhost:9090/-/reload 2>/dev/null || echo 'Prometheus reload may require manual restart'"
        log_success "Alert rules configured"
    fi
    
    # Step 1C.3: Configure Slack Notifications
    log_info "Step 1C.3: Configuring Slack Notifications..."
    
    # Store Slack webhook if provided
    if [[ -n "${SLACK_WEBHOOK_URL:-}" ]]; then
        echo -n "$SLACK_WEBHOOK_URL" | gcloud secrets create slack-webhook-url \
            --data-file=- --labels="service=n8n,env=production" 2>/dev/null || \
        echo -n "$SLACK_WEBHOOK_URL" | gcloud secrets versions add slack-webhook-url --data-file=-
        log_success "Slack webhook stored"
    else
        log_warn "SLACK_WEBHOOK_URL not set, skipping Slack configuration"
    fi
    
    DEPLOYMENT_STATUS["monitoring"]="SUCCESS"
    COMPLETED_STEPS+=("monitoring")
}

# =============================================================================
# Phase 1D: Data Quality
# =============================================================================

deploy_data_quality() {
    log_section "Phase 1D: Data Quality (MEDIUM)"
    
    if [[ "$SKIP_DATA_QUALITY" == true ]]; then
        log_warn "Skipped"
        DEPLOYMENT_STATUS["data_quality"]="SKIPPED"
        return 0
    fi
    
    if [[ "$DRY_RUN" == true ]]; then
        log_info "[DRY RUN] Would deploy data quality improvements"
        DEPLOYMENT_STATUS["data_quality"]="DRY_RUN"
        return 0
    fi
    
    # Step 1D.1: Import Enhanced Workflow
    log_info "Step 1D.1: Importing Enhanced Workflow v3..."
    log_warn "Manual step required: Import workflow via n8n UI or API"
    log_info "Workflow file: n8n-workflow-consultation-form-twenty-crm.json"
    
    # Step 1D.2: Configure CRM Credentials
    log_info "Step 1D.2: Verifying CRM Credentials..."
    log_warn "Manual step required: Verify CRM credentials in n8n"
    
    # Step 1D.3: Test Validation
    log_info "Step 1D.3: Testing Form Validation..."
    log_warn "Manual step required: Test form submission after workflow import"
    
    DEPLOYMENT_STATUS["data_quality"]="MANUAL_REQUIRED"
    COMPLETED_STEPS+=("data_quality")
}

# =============================================================================
# Post-Deployment
# =============================================================================

post_deployment() {
    log_section "Post-Deployment Verification"
    
    if [[ "$DRY_RUN" == true ]]; then
        log_info "[DRY RUN] Skipping post-deployment verification"
        return 0
    fi
    
    # Restart n8n to apply all changes
    log_info "Restarting n8n to apply configuration changes..."
    gcloud compute ssh "${INSTANCE_NAME}" --zone="${ZONE}" --command="
        cd /opt/n8n && sudo docker-compose down && sudo docker-compose up -d
    "
    
    log_info "Waiting for n8n to be ready (60 seconds)..."
    sleep 60
    
    # Check n8n health
    HEALTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
        https://n8n.zaplit.com/healthz 2>/dev/null || echo "000")
    
    if [ "$HEALTH_STATUS" = "200" ]; then
        log_success "n8n is healthy"
    else
        log_error "n8n health check failed (HTTP ${HEALTH_STATUS})"
        FAILED_STEPS+=("post:n8n-health")
    fi
    
    # Check basic auth
    AUTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
        https://n8n.zaplit.com/ 2>/dev/null || echo "000")
    
    if [ "$AUTH_STATUS" = "401" ]; then
        log_success "Basic authentication is active"
    else
        log_warn "Basic authentication may not be active (HTTP ${AUTH_STATUS})"
    fi
}

print_summary() {
    log_section "Deployment Summary"
    
    echo -e "${BOLD}Deployment Status:${NC}"
    echo "=================================="
    
    for component in security dr monitoring data_quality; do
        status="${DEPLOYMENT_STATUS[$component]:-NOT_STARTED}"
        case "$status" in
            SUCCESS)
                echo -e "  ${GREEN}✓${NC} $component: $status"
                ;;
            SKIPPED|DRY_RUN)
                echo -e "  ${YELLOW}○${NC} $component: $status"
                ;;
            MANUAL_REQUIRED)
                echo -e "  ${YELLOW}⚠${NC} $component: $status"
                ;;
            *)
                echo -e "  ${RED}✗${NC} $component: $status"
                ;;
        esac
    done
    
    echo ""
    echo -e "${BOLD}Completed Steps:${NC} ${#COMPLETED_STEPS[@]}"
    for step in "${COMPLETED_STEPS[@]}"; do
        echo "  ✓ $step"
    done
    
    if [ ${#FAILED_STEPS[@]} -gt 0 ]; then
        echo ""
        echo -e "${BOLD}${RED}Failed Steps:${NC} ${#FAILED_STEPS[@]}"
        for step in "${FAILED_STEPS[@]}"; do
            echo "  ✗ $step"
        done
    fi
    
    echo ""
    echo "=================================="
    echo "Next Steps:"
    echo "  1. Run verification: ./scripts/verify-deployment.sh"
    echo "  2. Review runbook: runbooks/RB-DEPLOY-001-Phase1.md"
    echo "  3. Complete manual data quality steps"
    echo ""
    
    if [ ${#FAILED_STEPS[@]} -eq 0 ]; then
        echo -e "${GREEN}Phase 1 deployment completed successfully!${NC}"
        exit 0
    else
        echo -e "${YELLOW}Phase 1 deployment completed with warnings.${NC}"
        echo "Review failed steps and re-run if necessary."
        exit 1
    fi
}

# =============================================================================
# Main
# =============================================================================

main() {
    print_banner
    parse_args "$@"
    confirm_deployment
    
    # Run deployment phases
    check_prerequisites
    deploy_security
    deploy_dr
    deploy_monitoring
    deploy_data_quality
    post_deployment
    
    # Print summary
    print_summary
}

# Handle interrupts
trap 'log_error "Deployment interrupted"; exit 1' INT TERM

# Run main
main "$@"
