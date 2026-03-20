#!/bin/bash
# =============================================================================
# Phase 1 Emergency Rollback Script
# =============================================================================
# Purpose: Emergency rollback of Phase 1 changes
# Usage:   ./rollback-phase1.sh [--component security|dr|monitoring|all]
# Owner:   DevOps Engineering Team
# Date:    March 19, 2026
# WARNING: Use only in emergency situations!
# =============================================================================

set -euo pipefail

# =============================================================================
# Configuration
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTANCE_NAME="n8n-instance"
ZONE="us-central1-a"
PROJECT_ID="${PROJECT_ID:-zaplit-production}"

# Rollback flags
ROLLBACK_SECURITY=false
ROLLBACK_DR=false
ROLLBACK_MONITORING=false
ROLLBACK_ALL=false

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
log_success() { echo -e "${GREEN}[PASS]${NC} $1"; }
log_error() { echo -e "${RED}[FAIL]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_section() { echo -e "\n${BOLD}${CYAN}$1${NC}"; }

# =============================================================================
# Utility Functions
# =============================================================================

print_banner() {
    echo -e "${BOLD}${RED}"
    echo "╔════════════════════════════════════════════════════════════════════╗"
    echo "║                    ⚠️  EMERGENCY ROLLBACK  ⚠️                      ║"
    echo "║                     Phase 1 Deployment Revert                      ║"
    echo "╚════════════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
    echo "Instance: ${INSTANCE_NAME}"
    echo "Zone: ${ZONE}"
    echo "Date: $(date '+%Y-%m-%d %H:%M:%S')"
    echo ""
    log_warn "This script will ROLLBACK Phase 1 changes!"
    echo ""
}

parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --component)
                case $2 in
                    security)
                        ROLLBACK_SECURITY=true
                        ;;
                    dr)
                        ROLLBACK_DR=true
                        ;;
                    monitoring)
                        ROLLBACK_MONITORING=true
                        ;;
                    all)
                        ROLLBACK_ALL=true
                        ;;
                    *)
                        log_error "Unknown component: $2"
                        exit 1
                        ;;
                esac
                shift 2
                ;;
            --help|-h)
                echo "Usage: $0 [OPTIONS]"
                echo ""
                echo "Options:"
                echo "  --component COMPONENT   Rollback specific component:"
                echo "                          security, dr, monitoring, all"
                echo "  --help, -h              Show this help message"
                echo ""
                echo "Examples:"
                echo "  $0 --component all      Rollback all Phase 1 changes"
                echo "  $0 --component security Rollback security changes only"
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                exit 1
                ;;
        esac
    done
    
    # If no component specified, default to all
    if [[ "$ROLLBACK_SECURITY" == false && "$ROLLBACK_DR" == false && "$ROLLBACK_MONITORING" == false ]]; then
        ROLLBACK_ALL=true
    fi
    
    if [[ "$ROLLBACK_ALL" == true ]]; then
        ROLLBACK_SECURITY=true
        ROLLBACK_DR=true
        ROLLBACK_MONITORING=true
    fi
}

confirm_rollback() {
    echo ""
    log_warn "YOU ARE ABOUT TO ROLLBACK PHASE 1 DEPLOYMENT!"
    echo ""
    echo "Components to rollback:"
    [[ "$ROLLBACK_SECURITY" == true ]] && echo "  ✗ Security Hardening (will disable auth!)"
    [[ "$ROLLBACK_DR" == true ]] && echo "  ✗ Disaster Recovery (will remove backups!)"
    [[ "$ROLLBACK_MONITORING" == true ]] && echo "  ✗ Monitoring Stack (will stop Prometheus/Grafana!)"
    echo ""
    log_error "This action may cause DOWNTIME and DATA LOSS!"
    echo ""
    
    # Double confirmation
    read -p "Type 'ROLLBACK' to confirm: " -r
    if [[ ! $REPLY == "ROLLBACK" ]]; then
        log_info "Rollback cancelled"
        exit 0
    fi
    
    # Triple confirmation for security rollback
    if [[ "$ROLLBACK_SECURITY" == true ]]; then
        echo ""
        log_error "SECURITY ROLLBACK: This will REMOVE encryption and authentication!"
        read -p "Type 'REMOVE SECURITY' to confirm: " -r
        if [[ ! $REPLY == "REMOVE SECURITY" ]]; then
            log_info "Rollback cancelled"
            exit 0
        fi
    fi
}

# =============================================================================
# Pre-Rollback Checks
# =============================================================================

check_prerequisites() {
    log_section "Pre-Rollback Checks"
    
    # Check gcloud
    if ! command -v gcloud &> /dev/null; then
        log_error "gcloud CLI is not installed"
        exit 1
    fi
    log_success "gcloud CLI is installed"
    
    # Check authentication
    if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q "@"; then
        log_error "Not authenticated with gcloud"
        exit 1
    fi
    log_success "Authenticated with gcloud"
    
    # Set project
    gcloud config set project "${PROJECT_ID}" > /dev/null 2>&1
    
    # Check if instance exists
    if ! gcloud compute instances describe "${INSTANCE_NAME}" --zone="${ZONE}" > /dev/null 2>&1; then
        log_error "Instance '${INSTANCE_NAME}' not found"
        exit 1
    fi
    log_success "Instance found"
    
    # Create emergency backup point
    log_info "Creating emergency backup point..."
    BACKUP_TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    gcloud compute ssh "${INSTANCE_NAME}" --zone="${ZONE}" --command="
        sudo mkdir -p /opt/n8n/rollback-backups
        sudo tar -czf /opt/n8n/rollback-backups/pre-rollback-${BACKUP_TIMESTAMP}.tar.gz \
            -C /opt/n8n docker-compose.yml monitoring/ scripts/ 2>/dev/null || true
    "
    log_success "Emergency backup created: pre-rollback-${BACKUP_TIMESTAMP}.tar.gz"
}

# =============================================================================
# Security Rollback
# =============================================================================

rollback_security() {
    log_section "Rolling Back Security Changes"
    
    # Find the most recent pre-security backup
    log_info "Finding backup to restore..."
    
    BACKUP_FILE=$(gcloud compute ssh "${INSTANCE_NAME}" --zone="${ZONE}" --command="
        ls -t /opt/n8n/backups/docker-compose.yml.pre-* 2>/dev/null | head -1
    " || echo "")
    
    if [ -n "$BACKUP_FILE" ]; then
        log_info "Found backup: ${BACKUP_FILE}"
        
        # Stop containers
        log_info "Stopping n8n containers..."
        gcloud compute ssh "${INSTANCE_NAME}" --zone="${ZONE}" --command="
            cd /opt/n8n && sudo docker-compose down
        "
        
        # Restore docker-compose
        log_info "Restoring docker-compose.yml..."
        gcloud compute ssh "${INSTANCE_NAME}" --zone="${ZONE}" --command="
            sudo cp '${BACKUP_FILE}' /opt/n8n/docker-compose.yml
        "
        
        # Restart containers
        log_info "Restarting n8n containers..."
        gcloud compute ssh "${INSTANCE_NAME}" --zone="${ZONE}" --command="
            cd /opt/n8n && sudo docker-compose up -d
        "
        
        log_success "Security configuration rolled back"
        log_warn "WARNING: Encryption key and basic auth have been removed!"
    else
        log_error "No backup found to restore"
        
        # Manual rollback instructions
        echo ""
        echo "Manual rollback required. Follow these steps:"
        echo "1. SSH to instance: gcloud compute ssh ${INSTANCE_NAME} --zone=${ZONE}"
        echo "2. Edit docker-compose.yml: sudo nano /opt/n8n/docker-compose.yml"
        echo "3. Remove these environment variables:"
        echo "   - N8N_ENCRYPTION_KEY"
        echo "   - N8N_BASIC_AUTH_ACTIVE"
        echo "   - N8N_BASIC_AUTH_USER"
        echo "   - N8N_BASIC_AUTH_PASSWORD"
        echo "   - WEBHOOK_HMAC_SECRET"
        echo "4. Restart: cd /opt/n8n && sudo docker-compose down && sudo docker-compose up -d"
    fi
}

# =============================================================================
# DR Rollback
# =============================================================================

rollback_dr() {
    log_section "Rolling Back Disaster Recovery"
    
    # Remove cron job
    log_info "Removing database backup cron job..."
    gcloud compute ssh "${INSTANCE_NAME}" --zone="${ZONE}" --command="
        crontab -l 2>/dev/null | grep -v backup-database | crontab -
    "
    log_success "Backup cron job removed"
    
    # Note: We don't delete the backup script or existing backups
    log_warn "Backup script and existing backups preserved at /opt/n8n/"
    
    # Remove snapshot schedule (optional - ask user)
    echo ""
    read -p "Remove GCP snapshot schedule? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        log_info "Removing snapshot schedule..."
        
        # Detach from disk first
        gcloud compute disks remove-resource-policies "${INSTANCE_NAME}" \
            --resource-policies="snapshot-schedule-n8n" \
            --zone="${ZONE}" --quiet 2>/dev/null || true
        
        # Delete schedule
        gcloud compute resource-policies delete "snapshot-schedule-n8n" \
            --region="${ZONE%-*}" --quiet 2>/dev/null || true
        
        log_success "Snapshot schedule removed"
    else
        log_info "Snapshot schedule preserved"
    fi
    
    # Revert Docker restart policy
    log_info "Reverting Docker restart policy..."
    gcloud compute ssh "${INSTANCE_NAME}" --zone="${ZONE}" --command="
        sudo sed -i 's/restart: always/restart: unless-stopped/g' /opt/n8n/docker-compose.yml
    "
    log_success "Docker restart policy reverted"
}

# =============================================================================
# Monitoring Rollback
# =============================================================================

rollback_monitoring() {
    log_section "Rolling Back Monitoring Stack"
    
    # Stop monitoring containers
    log_info "Stopping monitoring containers..."
    gcloud compute ssh "${INSTANCE_NAME}" --zone="${ZONE}" --command="
        cd /opt/n8n && sudo docker-compose stop prometheus grafana node-exporter 2>/dev/null || true
        cd /opt/n8n && sudo docker-compose rm -f prometheus grafana node-exporter 2>/dev/null || true
    "
    log_success "Monitoring containers stopped and removed"
    
    # Find and restore pre-monitoring docker-compose
    log_info "Restoring docker-compose.yml..."
    BACKUP_FILE=$(gcloud compute ssh "${INSTANCE_NAME}" --zone="${ZONE}" --command="
        ls -t /opt/n8n/backups/docker-compose.yml.pre-monitoring* 2>/dev/null | head -1
    " || echo "")
    
    if [ -n "$BACKUP_FILE" ]; then
        gcloud compute ssh "${INSTANCE_NAME}" --zone="${ZONE}" --command="
            sudo cp '${BACKUP_FILE}' /opt/n8n/docker-compose.yml
            cd /opt/n8n && sudo docker-compose up -d
        "
        log_success "Monitoring configuration removed"
    else
        # Manual removal of monitoring services from docker-compose
        log_warn "No backup found, manual cleanup may be required"
        log_info "Monitoring volumes preserved: prometheus_data, grafana_data"
    fi
    
    # Note about data
    log_warn "Monitoring data volumes NOT removed (preserved for safety)"
    log_info "To remove volumes, run on the VM:"
    echo "  docker volume rm prometheus_data grafana_data"
}

# =============================================================================
# Post-Rollback
# =============================================================================

post_rollback() {
    log_section "Post-Rollback Verification"
    
    # Wait for services
    log_info "Waiting for services to stabilize (30 seconds)..."
    sleep 30
    
    # Check n8n health
    log_info "Checking n8n status..."
    HEALTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
        "https://n8n.zaplit.com/healthz" 2>/dev/null || echo "000")
    
    if [ "$HEALTH_STATUS" = "200" ]; then
        log_success "n8n is healthy"
    else
        log_error "n8n health check failed (HTTP ${HEALTH_STATUS})"
    fi
    
    # Check basic auth status (should be disabled after security rollback)
    if [[ "$ROLLBACK_SECURITY" == true ]]; then
        AUTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
            "https://n8n.zaplit.com/" 2>/dev/null || echo "000")
        if [ "$AUTH_STATUS" = "200" ]; then
            log_warn "Basic authentication is disabled (rolled back)"
        fi
    fi
}

print_summary() {
    log_section "Rollback Summary"
    
    echo "=================================="
    echo "Rollback completed:"
    [[ "$ROLLBACK_SECURITY" == true ]] && echo "  ✓ Security configuration rolled back"
    [[ "$ROLLBACK_DR" == true ]] && echo "  ✓ DR configuration rolled back"
    [[ "$ROLLBACK_MONITORING" == true ]] && echo "  ✓ Monitoring stack rolled back"
    echo "=================================="
    echo ""
    
    log_warn "IMPORTANT NEXT STEPS:"
    echo "1. Verify n8n is functioning correctly"
    echo "2. Test form submissions if workflow was affected"
    echo "3. Review application logs for any issues"
    echo "4. Consider re-deployment if rollback was temporary"
    echo ""
    
    if [[ "$ROLLBACK_SECURITY" == true ]]; then
        log_error "SECURITY WARNING: Authentication has been removed!"
        echo "The system is now INSECURE. Re-enable security as soon as possible."
    fi
}

# =============================================================================
# Main
# =============================================================================

main() {
    print_banner
    parse_args "$@"
    confirm_rollback
    check_prerequisites
    
    # Execute rollbacks
    [[ "$ROLLBACK_SECURITY" == true ]] && rollback_security
    [[ "$ROLLBACK_DR" == true ]] && rollback_dr
    [[ "$ROLLBACK_MONITORING" == true ]] && rollback_monitoring
    
    # Post-rollback
    post_rollback
    print_summary
}

# Handle interrupts
trap 'log_error "Rollback interrupted! System may be in inconsistent state."; exit 1' INT TERM

# Run main
main "$@"
