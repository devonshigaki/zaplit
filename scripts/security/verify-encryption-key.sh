#!/bin/bash
#
# N8N Encryption Key Verification Script
# Usage: ./verify-encryption-key.sh [INSTANCE_NAME] [ZONE]
#

set -euo pipefail

# Configuration
INSTANCE_NAME="${1:-n8n-instance}"
ZONE="${2:-us-central1-a}"
PROJECT_ID="${3:-$(gcloud config get-value project 2>/dev/null || echo 'zaplit-production')}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[PASS]${NC} $1"; }
log_error() { echo -e "${RED}[FAIL]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }

# Header
echo "=========================================="
echo "n8n Encryption Key Verification Tool"
echo "=========================================="
echo "Instance: ${INSTANCE_NAME}"
echo "Zone: ${ZONE}"
echo "Project: ${PROJECT_ID}"
echo "=========================================="
echo

# Check gcloud is installed
if ! command -v gcloud &> /dev/null; then
    log_error "gcloud CLI is not installed"
    echo "Install from: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Check gcloud authentication
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q "@"; then
    log_error "Not authenticated with gcloud"
    echo "Run: gcloud auth login"
    exit 1
fi

log_info "Authenticated with gcloud"

# Set project
gcloud config set project "${PROJECT_ID}" > /dev/null 2>&1

# Check if instance exists
log_info "Checking if instance exists..."
if ! gcloud compute instances describe "${INSTANCE_NAME}" --zone="${ZONE}" > /dev/null 2>&1; then
    log_error "Instance '${INSTANCE_NAME}' not found in zone '${ZONE}'"
    exit 1
fi
log_success "Instance found"

# Check if n8n container is running
log_info "Checking n8n container status..."
CONTAINER_STATUS=$(gcloud compute ssh "${INSTANCE_NAME}" --zone="${ZONE}" \
    --command="docker ps --filter 'name=n8n' --format '{{.Status}}'" 2>/dev/null || echo "")

if [ -z "$CONTAINER_STATUS" ]; then
    log_error "n8n container is not running"
    exit 1
fi
log_success "n8n container is running: ${CONTAINER_STATUS}"

# Check current encryption key
log_info "Checking N8N_ENCRYPTION_KEY..."
ENCRYPTION_KEY=$(gcloud compute ssh "${INSTANCE_NAME}" --zone="${ZONE}" \
    --command="docker exec n8n printenv N8N_ENCRYPTION_KEY" 2>/dev/null || echo "")

if [ -z "$ENCRYPTION_KEY" ]; then
    log_error "N8N_ENCRYPTION_KEY is NOT SET"
    echo
    echo "╔══════════════════════════════════════════════════════════════════╗"
    echo "║  CRITICAL SECURITY ISSUE: Encryption key is missing!             ║"
    echo "╠══════════════════════════════════════════════════════════════════╣"
    echo "║  This means:                                                     ║"
    echo "║  • Credentials are stored unencrypted                            ║"
    echo "║  • Any data breach exposes all saved credentials                 ║"
    echo "║  • Compliance violations (SOC2, GDPR, etc.)                      ║"
    echo "╚══════════════════════════════════════════════════════════════════╝"
    echo
    log_warn "Run the following to generate and set a new encryption key:"
    echo
    echo "  # Generate new key"
    echo "  NEW_KEY=\$(openssl rand -hex 32)"
    echo "  echo \"Generated key: \$NEW_KEY\""
    echo
    echo "  # SSH to instance and update docker-compose.yml"
    echo "  gcloud compute ssh ${INSTANCE_NAME} --zone=${ZONE}"
    echo
    echo "  # Add to docker-compose.yml environment section:"
    echo "  environment:"
    echo "    - N8N_ENCRYPTION_KEY=\$NEW_KEY"
    echo
    echo "  # Restart n8n"
    echo "  cd /opt/n8n && docker-compose down && docker-compose up -d"
    echo
    log_warn "⚠️  WARNING: After setting encryption key, ALL credentials must be re-entered!"
    exit 2
else
    KEY_LENGTH=${#ENCRYPTION_KEY}
    if [ "$KEY_LENGTH" -ge 32 ]; then
        log_success "N8N_ENCRYPTION_KEY is set (length: ${KEY_LENGTH} chars)"
        
        # Check if key looks like a proper hex key
        if [[ "$ENCRYPTION_KEY" =~ ^[a-f0-9]{64}$ ]]; then
            log_success "Key format appears valid (64 hex characters)"
        elif [[ "$ENCRYPTION_KEY" =~ ^[a-f0-9]{32}$ ]]; then
            log_warn "Key is 32 hex characters (128-bit). Consider using 64 hex characters (256-bit) for stronger security"
        else
            log_warn "Key format is non-standard. May be a passphrase instead of hex key"
        fi
    else
        log_error "Encryption key is too short (${KEY_LENGTH} chars). Minimum 32 characters required."
        exit 2
    fi
fi

# Check if key is using default/weak value
WEAK_KEYS=("n8n" "password" "secret" "admin" "123456" "default" "change-me" "")
for weak in "${WEAK_KEYS[@]}"; do
    if [ "$ENCRYPTION_KEY" = "$weak" ]; then
        log_error "Encryption key appears to be a weak/default value: '${weak}'"
        log_warn "Generate a new secure key with: openssl rand -hex 32"
        exit 2
    fi
done

# Verify basic auth is enabled
log_info "Checking Basic Authentication configuration..."
BASIC_AUTH=$(gcloud compute ssh "${INSTANCE_NAME}" --zone="${ZONE}" \
    --command="docker exec n8n printenv N8N_BASIC_AUTH_ACTIVE" 2>/dev/null || echo "")

if [ "$BASIC_AUTH" = "true" ]; then
    log_success "Basic Authentication is ENABLED"
    
    BASIC_AUTH_USER=$(gcloud compute ssh "${INSTANCE_NAME}" --zone="${ZONE}" \
        --command="docker exec n8n printenv N8N_BASIC_AUTH_USER" 2>/dev/null || echo "")
    
    if [ -n "$BASIC_AUTH_USER" ]; then
        log_success "Basic Auth User: ${BASIC_AUTH_USER}"
    else
        log_warn "Basic Auth user not set"
    fi
else
    log_error "Basic Authentication is NOT enabled"
    echo
    echo "╔══════════════════════════════════════════════════════════════════╗"
    echo "║  CRITICAL SECURITY ISSUE: Basic Authentication is disabled!      ║"
    echo "╠══════════════════════════════════════════════════════════════════╣"
    echo "║  This means:                                                     ║"
    echo "║  • Anyone can access the n8n editor                              ║"
    echo "║  • Workflows can be viewed/modified by unauthorized users        ║"
    echo "║  • Webhooks can be triggered by anyone                           ║"
    echo "╚══════════════════════════════════════════════════════════════════╝"
    echo
    log_warn "Run ./enable-basic-auth.sh to enable basic authentication"
    exit 3
fi

# Check webhook HMAC configuration
log_info "Checking Webhook HMAC configuration..."
HMAC_SECRET=$(gcloud compute ssh "${INSTANCE_NAME}" --zone="${ZONE}" \
    --command="docker exec n8n printenv WEBHOOK_HMAC_SECRET" 2>/dev/null || echo "")

if [ -n "$HMAC_SECRET" ]; then
    log_success "Webhook HMAC secret is configured"
else
    log_warn "Webhook HMAC secret not found in environment variables"
    log_info "Ensure HMAC verification is implemented in workflow logic"
fi

# Summary
echo
echo "=========================================="
echo "Verification Summary"
echo "=========================================="
log_success "Encryption Key: CONFIGURED"
log_success "Basic Auth: ENABLED"

if [ -n "$HMAC_SECRET" ]; then
    log_success "HMAC Secret: CONFIGURED"
else
    log_warn "HMAC Secret: NOT CONFIGURED (manual workflow verification required)"
fi

echo
log_info "Security checks complete!"
log_info "Instance: https://n8n.zaplit.com"
echo

exit 0
