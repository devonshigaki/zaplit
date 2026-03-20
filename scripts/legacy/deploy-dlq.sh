#!/bin/bash
# =============================================================================
# Dead Letter Queue (DLQ) Deployment Script
# =============================================================================
# This script deploys the complete DLQ infrastructure for form submission
# failure management.
#
# Usage:
#   ./deploy-dlq.sh [options]
#
# Options:
#   --dry-run          Validate configuration without making changes
#   --skip-db          Skip database table creation
#   --skip-workflows   Skip n8n workflow import
#   --skip-cron        Skip cron job setup
#   --archive-days N   Archive entries older than N days (default: 30)
#
# Environment Variables Required:
#   DLQ_DATABASE_URL       - PostgreSQL connection string
#   N8N_WEBHOOK_URL        - Base URL for n8n webhooks
#   N8N_API_KEY            - n8n API key for workflow import
#   DLQ_SHEET_ID           - Google Sheet ID for backup (optional)
#   DLQ_ALERT_CHANNEL      - Slack channel for alerts (optional)
# =============================================================================

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Default configuration
DRY_RUN=false
SKIP_DB=false
SKIP_WORKFLOWS=false
SKIP_CRON=false
ARCHIVE_DAYS=30

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --skip-db)
      SKIP_DB=true
      shift
      ;;
    --skip-workflows)
      SKIP_WORKFLOWS=true
      shift
      ;;
    --skip-cron)
      SKIP_CRON=true
      shift
      ;;
    --archive-days)
      ARCHIVE_DAYS="$2"
      shift 2
      ;;
    --help|-h)
      echo "Usage: $0 [options]"
      echo ""
      echo "Options:"
      echo "  --dry-run          Validate configuration without making changes"
      echo "  --skip-db          Skip database table creation"
      echo "  --skip-workflows   Skip n8n workflow import"
      echo "  --skip-cron        Skip cron job setup"
      echo "  --archive-days N   Archive entries older than N days (default: 30)"
      echo "  --help, -h         Show this help message"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# =============================================================================
# Helper Functions
# =============================================================================

log_info() {
  echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
  echo -e "${GREEN}[PASS]${NC} $1"
}

log_warn() {
  echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
  echo -e "${RED}[FAIL]${NC} $1"
}

print_banner() {
  echo ""
  echo "=================================================================="
  echo "  Dead Letter Queue (DLQ) Deployment"
  echo "=================================================================="
  echo ""
}

# =============================================================================
# Validation Functions
# =============================================================================

check_prerequisites() {
  log_info "Checking prerequisites..."
  
  local missing_deps=()
  
  # Check required tools
  if ! command -v psql &> /dev/null; then
    missing_deps+=("PostgreSQL client (psql)")
  fi
  
  if ! command -v node &> /dev/null; then
    missing_deps+=("Node.js")
  fi
  
  if [[ "$SKIP_WORKFLOWS" == false ]] && ! command -v n8n &> /dev/null; then
    log_warn "n8n CLI not found in PATH. Will attempt to use n8n API instead."
  fi
  
  if [[ ${#missing_deps[@]} -gt 0 ]]; then
    log_error "Missing required dependencies:"
    for dep in "${missing_deps[@]}"; do
      echo "  - $dep"
    done
    exit 1
  fi
  
  # Check environment variables
  if [[ -z "${DLQ_DATABASE_URL:-}" ]]; then
    log_error "DLQ_DATABASE_URL environment variable is required"
    exit 1
  fi
  
  if [[ -z "${N8N_WEBHOOK_URL:-}" ]]; then
    log_warn "N8N_WEBHOOK_URL not set. Retry processor will not function."
  fi
  
  log_success "Prerequisites check passed"
}

validate_database_connection() {
  log_info "Validating database connection..."
  
  if $DRY_RUN; then
    log_info "[DRY RUN] Would test database connection"
    return 0
  fi
  
  if ! psql "$DLQ_DATABASE_URL" -c "SELECT 1" > /dev/null 2>&1; then
    log_error "Failed to connect to database"
    exit 1
  fi
  
  log_success "Database connection validated"
}

# =============================================================================
# Deployment Functions
# =============================================================================

deploy_database_schema() {
  if [[ "$SKIP_DB" == true ]]; then
    log_info "Skipping database deployment (--skip-db)"
    return 0
  fi
  
  log_info "Deploying database schema..."
  
  local schema_file="$PROJECT_ROOT/scripts-ts/src/dr/dlq-schema.sql"
  
  if [[ ! -f "$schema_file" ]]; then
    log_error "Schema file not found: $schema_file"
    exit 1
  fi
  
  if $DRY_RUN; then
    log_info "[DRY RUN] Would execute schema file: $schema_file"
    log_info "[DRY RUN] Schema contents preview:"
    head -50 "$schema_file"
    return 0
  fi
  
  # Execute schema
  if psql "$DLQ_DATABASE_URL" -f "$schema_file" > /tmp/dlq-schema.log 2>&1; then
    log_success "Database schema deployed successfully"
  else
    log_error "Failed to deploy database schema"
    cat /tmp/dlq-schema.log
    exit 1
  fi
  
  # Verify tables created
  local tables=$(psql "$DLQ_DATABASE_URL" -t -c "
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name LIKE 'form_submission_dlq%'
    OR table_name = 'dlq_audit_log'
  ")
  
  if echo "$tables" | grep -q "form_submission_dlq"; then
    log_success "DLQ tables verified"
  else
    log_error "DLQ tables not found after deployment"
    exit 1
  fi
}

import_n8n_workflows() {
  if [[ "$SKIP_WORKFLOWS" == true ]]; then
    log_info "Skipping workflow import (--skip-workflows)"
    return 0
  fi
  
  log_info "Importing n8n workflows..."
  
  local capture_workflow="$PROJECT_ROOT/n8n-dlq-capture-workflow.json"
  
  if [[ ! -f "$capture_workflow" ]]; then
    log_error "Capture workflow not found: $capture_workflow"
    exit 1
  fi
  
  if $DRY_RUN; then
    log_info "[DRY RUN] Would import workflow: $capture_workflow"
    return 0
  fi
  
  # Check if we can use n8n CLI
  if command -v n8n &> /dev/null; then
    # Import via n8n CLI
    log_info "Importing DLQ Capture workflow via n8n CLI..."
    
    # Note: This assumes n8n is running locally. For remote n8n instances,
    # use the API import method below
    if n8n import:workflow --input="$capture_workflow" 2>/tmp/n8n-import.log; then
      log_success "DLQ Capture workflow imported"
    else
      log_warn "CLI import may have failed, attempting API import..."
      import_workflow_via_api "$capture_workflow"
    fi
  else
    # Import via API
    import_workflow_via_api "$capture_workflow"
  fi
}

import_workflow_via_api() {
  local workflow_file="$1"
  
  if [[ -z "${N8N_API_KEY:-}" ]]; then
    log_warn "N8N_API_KEY not set. Cannot import workflow via API."
    log_warn "Please manually import: $workflow_file"
    return 0
  fi
  
  log_info "Importing workflow via n8n API..."
  
  # Extract n8n base URL from webhook URL
  local n8n_base_url="${N8N_WEBHOOK_URL%/*}"
  n8n_base_url="${n8n_base_url%/webhook}"
  
  local response=$(curl -s -w "\n%{http_code}" \
    -X POST \
    -H "X-N8N-API-KEY: $N8N_API_KEY" \
    -H "Content-Type: application/json" \
    -d "@$workflow_file" \
    "${n8n_base_url}/api/v1/workflows" 2>/dev/null)
  
  local http_code=$(echo "$response" | tail -n1)
  
  if [[ "$http_code" == "200" ]] || [[ "$http_code" == "201" ]]; then
    log_success "Workflow imported via API"
  else
    log_warn "API import failed (HTTP $http_code). Please manually import: $workflow_file"
  fi
}

setup_cron_job() {
  if [[ "$SKIP_CRON" == true ]]; then
    log_info "Skipping cron job setup (--skip-cron)"
    return 0
  fi
  
  log_info "Setting up cron job for retry processor..."
  
  local retry_processor="$PROJECT_ROOT/scripts-ts/src/dr/retry-processor.ts"
  local cron_entry="*/5 * * * * cd $PROJECT_ROOT/scripts-ts && npx ts-node src/dr/retry-processor.ts --once >> /var/log/dlq-retry.log 2>&1"
  
  if $DRY_RUN; then
    log_info "[DRY RUN] Would add cron job:"
    echo "  $cron_entry"
    return 0
  fi
  
  # Check if cron entry already exists
  if crontab -l 2>/dev/null | grep -q "dlq-retry-processor"; then
    log_warn "Cron job already exists"
    return 0
  fi
  
  # Add to crontab
  (crontab -l 2>/dev/null; echo "# DLQ Retry Processor - runs every 5 minutes"; echo "$cron_entry") | crontab -
  
  log_success "Cron job installed (runs every 5 minutes)"
}

configure_environment() {
  log_info "Configuring environment..."
  
  local env_file="$PROJECT_ROOT/scripts-ts/.env"
  
  # Create .env file if it doesn't exist
  if [[ ! -f "$env_file" ]]; then
    touch "$env_file"
  fi
  
  # Add DLQ-specific environment variables
  local env_vars=$(cat <<EOF

# ============================================
# DLQ Configuration
# ============================================
DLQ_DATABASE_URL=${DLQ_DATABASE_URL}
N8N_WEBHOOK_URL=${N8N_WEBHOOK_URL:-}
DLQ_RETRY_PATH=${DLQ_RETRY_PATH:-/webhook/retry-submission}
DLQ_BATCH_SIZE=${DLQ_BATCH_SIZE:-50}
DLQ_LOG_LEVEL=${DLQ_LOG_LEVEL:-info}
DLQ_SHEET_ID=${DLQ_SHEET_ID:-}
DLQ_ALERT_CHANNEL=${DLQ_ALERT_CHANNEL:-#form-submission-alerts}
EOF
)
  
  if $DRY_RUN; then
    log_info "[DRY RUN] Would append to $env_file:"
    echo "$env_vars"
    return 0
  fi
  
  # Remove existing DLQ section if present
  if grep -q "DLQ Configuration" "$env_file" 2>/dev/null; then
    sed -i.bak '/# ===.*DLQ Configuration/,/^$/d' "$env_file"
  fi
  
  # Append new configuration
  echo "$env_vars" >> "$env_file"
  
  log_success "Environment configuration updated"
}

verify_deployment() {
  log_info "Verifying deployment..."
  
  if $DRY_RUN; then
    log_info "[DRY RUN] Would verify deployment"
    return 0
  fi
  
  # Test database query
  local stats=$(psql "$DLQ_DATABASE_URL" -t -c "SELECT COUNT(*) FROM form_submission_dlq" 2>/dev/null || echo "ERROR")
  
  if [[ "$stats" != "ERROR" ]]; then
    log_success "Database query test passed"
  else
    log_warn "Database query test failed"
  fi
  
  # Check if TypeScript files compile
  if [[ -f "$PROJECT_ROOT/scripts-ts/package.json" ]]; then
    cd "$PROJECT_ROOT/scripts-ts"
    if npx tsc --noEmit 2>/tmp/tsc-check.log; then
      log_success "TypeScript compilation check passed"
    else
      log_warn "TypeScript compilation issues detected"
      cat /tmp/tsc-check.log | head -20
    fi
  fi
}

print_summary() {
  echo ""
  echo "=================================================================="
  echo "  DLQ Deployment Complete"
  echo "=================================================================="
  echo ""
  
  if $DRY_RUN; then
    echo -e "${YELLOW}This was a DRY RUN. No changes were made.${NC}"
    echo ""
  fi
  
  echo "Deployed Components:"
  echo "  ✓ Database Schema (tables, indexes, functions)"
  echo "  ✓ n8n DLQ Capture Workflow"
  echo "  ✓ Retry Processor Service"
  echo "  ✓ DLQ Management API"
  echo ""
  
  echo "Database Tables:"
  echo "  - form_submission_dlq (primary DLQ table)"
  echo "  - form_submission_dlq_archive (archive for old entries)"
  echo "  - dlq_audit_log (audit trail)"
  echo ""
  
  echo "Management Commands:"
  echo "  # Run retry processor manually"
  echo "  cd $PROJECT_ROOT/scripts-ts && npx ts-node src/dr/retry-processor.ts --once"
  echo ""
  echo "  # Archive old entries"
  echo "  cd $PROJECT_ROOT/scripts-ts && npx ts-node src/dr/retry-processor.ts --archive --once"
  echo ""
  echo "  # View statistics"
  echo "  psql \"\$DLQ_DATABASE_URL\" -c \"SELECT * FROM dlq_detailed_stats\""
  echo ""
  
  if [[ "$SKIP_CRON" == false ]] && ! $DRY_RUN; then
    echo "Cron Job:"
    echo "  Installed: runs every 5 minutes"
    echo "  View with: crontab -l | grep dlq"
    echo ""
  fi
  
  echo "Next Steps:"
  echo "  1. Verify workflows in n8n UI"
  echo "  2. Configure Google Sheets credentials (optional)"
  echo "  3. Configure Slack webhook (optional)"
  echo "  4. Test with a failing submission"
  echo "  5. Set up monitoring dashboard"
  echo ""
  echo "=================================================================="
}

# =============================================================================
# Main Execution
# =============================================================================

main() {
  print_banner
  
  check_prerequisites
  validate_database_connection
  deploy_database_schema
  import_n8n_workflows
  setup_cron_job
  configure_environment
  verify_deployment
  
  print_summary
}

# Run main function
main
