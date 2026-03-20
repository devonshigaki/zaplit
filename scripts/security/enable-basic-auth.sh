#!/bin/bash
#
# N8N Basic Authentication Setup Script
# Usage: ./enable-basic-auth.sh [INSTANCE_NAME] [ZONE] [USERNAME]
#

set -euo pipefail

# Configuration
INSTANCE_NAME="${1:-n8n-instance}"
ZONE="${2:-us-central1-a}"
USERNAME="${3:-zaplit-admin}"
PROJECT_ID="${4:-$(gcloud config get-value project 2>/dev/null || echo 'zaplit-production')}"

COMPOSE_FILE="/opt/n8n/docker-compose.yml"
BACKUP_DIR="/opt/n8n/backups"

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
echo "n8n Basic Authentication Setup"
echo "=========================================="
echo "Instance: ${INSTANCE_NAME}"
echo "Zone: ${ZONE}"
echo "Username: ${USERNAME}"
echo "Project: ${PROJECT_ID}"
echo "=========================================="
echo

# Pre-flight checks
log_info "Performing pre-flight checks..."

# Check gcloud
if ! command -v gcloud &> /dev/null; then
    log_error "gcloud CLI is not installed"
    exit 1
fi

# Check authentication
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q "@"; then
    log_error "Not authenticated with gcloud. Run: gcloud auth login"
    exit 1
fi

log_success "gcloud authenticated"

# Set project
gcloud config set project "${PROJECT_ID}" > /dev/null 2>&1

# Check if instance exists
if ! gcloud compute instances describe "${INSTANCE_NAME}" --zone="${ZONE}" > /dev/null 2>&1; then
    log_error "Instance '${INSTANCE_NAME}' not found in zone '${ZONE}'"
    exit 1
fi
log_success "Instance exists"

# Generate strong password
log_info "Generating secure password..."
PASSWORD=$(openssl rand -base64 24)
log_success "Password generated (length: ${#PASSWORD} chars)"

# Store password in GCP Secret Manager
log_info "Storing password in GCP Secret Manager..."
SECRET_NAME="n8n-admin-password"

if gcloud secrets describe "${SECRET_NAME}" > /dev/null 2>&1; then
    log_warn "Secret '${SECRET_NAME}' already exists"
    read -p "Update existing secret? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo -n "${PASSWORD}" | gcloud secrets versions add "${SECRET_NAME}" --data-file=-
        log_success "Secret updated in GCP Secret Manager"
    else
        log_info "Using existing secret (password not changed)"
        PASSWORD=$(gcloud secrets versions access latest --secret="${SECRET_NAME}")
    fi
else
    echo -n "${PASSWORD}" | gcloud secrets create "${SECRET_NAME}" --data-file=- \
        --labels="service=n8n,env=production" \
        --replication-policy="automatic"
    log_success "Secret created in GCP Secret Manager"
fi

# SSH to instance and update docker-compose
echo
log_info "Connecting to instance to update configuration..."
echo

# Create backup directory if needed
gcloud compute ssh "${INSTANCE_NAME}" --zone="${ZONE}" --command="
    sudo mkdir -p ${BACKUP_DIR}
    sudo chmod 700 ${BACKUP_DIR}
"

# Check if docker-compose.yml exists
gcloud compute ssh "${INSTANCE_NAME}" --zone="${ZONE}" --command="
    if [ ! -f ${COMPOSE_FILE} ]; then
        echo 'ERROR: docker-compose.yml not found at ${COMPOSE_FILE}'
        exit 1
    fi
"

if [ $? -ne 0 ]; then
    log_error "docker-compose.yml not found on instance"
    exit 1
fi

# Backup current docker-compose.yml
BACKUP_FILE="${BACKUP_DIR}/docker-compose.yml.backup.$(date +%Y%m%d_%H%M%S)"
log_info "Creating backup: ${BACKUP_FILE}"

gcloud compute ssh "${INSTANCE_NAME}" --zone="${ZONE}" --command="
    sudo cp ${COMPOSE_FILE} ${BACKUP_FILE}
    sudo chmod 600 ${BACKUP_FILE}
"
log_success "Backup created"

# Check current basic auth status
CURRENT_AUTH=$(gcloud compute ssh "${INSTANCE_NAME}" --zone="${ZONE}" \
    --command="sudo grep -o 'N8N_BASIC_AUTH_ACTIVE=.*' ${COMPOSE_FILE} | cut -d= -f2" 2>/dev/null || echo "")

if [ "$CURRENT_AUTH" = "true" ]; then
    log_warn "Basic auth already enabled"
    read -p "Proceed with update? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Aborted by user"
        exit 0
    fi
fi

# Create the updated environment configuration
ENV_CONFIG=$(cat << 'EOF'
  n8n:
    environment:
      - N8N_BASIC_AUTH_ACTIVE=true
      - N8N_BASIC_AUTH_USER=USERNAME_PLACEHOLDER
      - N8N_BASIC_AUTH_PASSWORD=PASSWORD_PLACEHOLDER
      - N8N_ENCRYPTION_KEY=${N8N_ENCRYPTION_KEY}
      - WEBHOOK_URL=https://n8n.zaplit.com/
      - N8N_HOST=n8n.zaplit.com
EOF
)

ENV_CONFIG="${ENV_CONFIG/USERNAME_PLACEHOLDER/$USERNAME}"
ENV_CONFIG="${ENV_CONFIG/PASSWORD_PLACEHOLDER/$PASSWORD}"

log_info "Preparing docker-compose update..."

# Apply the configuration update
gcloud compute ssh "${INSTANCE_NAME}" --zone="${ZONE}" --command="
    # Create a temporary file for the update
    cat > /tmp/env_update.txt << 'ENVEOF'
${ENV_CONFIG}
ENVEOF

    # Check if environment section exists in current docker-compose
    if sudo grep -q 'environment:' ${COMPOSE_FILE}; then
        # Update existing environment section
        echo 'Updating existing environment section...'
        
        # Use sed to update or add basic auth vars
        sudo sed -i 's/N8N_BASIC_AUTH_ACTIVE=.*/N8N_BASIC_AUTH_ACTIVE=true/' ${COMPOSE_FILE} 2>/dev/null || true
        
        if ! sudo grep -q 'N8N_BASIC_AUTH_USER=' ${COMPOSE_FILE}; then
            sudo sed -i '/environment:/a\      - N8N_BASIC_AUTH_USER=${USERNAME}' ${COMPOSE_FILE}
        else
            sudo sed -i "s/N8N_BASIC_AUTH_USER=.*/N8N_BASIC_AUTH_USER=${USERNAME}/" ${COMPOSE_FILE}
        fi
        
        if ! sudo grep -q 'N8N_BASIC_AUTH_PASSWORD=' ${COMPOSE_FILE}; then
            sudo sed -i '/N8N_BASIC_AUTH_USER=/a\      - N8N_BASIC_AUTH_PASSWORD=${PASSWORD}' ${COMPOSE_FILE}
        else
            sudo sed -i "s/N8N_BASIC_AUTH_PASSWORD=.*/N8N_BASIC_AUTH_PASSWORD=${PASSWORD}/" ${COMPOSE_FILE}
        fi
    else
        # Add new environment section to n8n service
        echo 'Adding new environment section...'
        sudo sed -i '/^  n8n:/,/^  [a-z]/ { /^  [a-z]/i\    environment:\n      - N8N_BASIC_AUTH_ACTIVE=true\n      - N8N_BASIC_AUTH_USER='"${USERNAME}"'\n      - N8N_BASIC_AUTH_PASSWORD='"${PASSWORD}"'
        }' ${COMPOSE_FILE}
    fi
    
    # Verify the changes
    echo 'Verifying configuration changes...'
    if sudo grep -q 'N8N_BASIC_AUTH_ACTIVE=true' ${COMPOSE_FILE}; then
        echo 'SUCCESS: Basic auth configuration added'
    else
        echo 'WARNING: Could not verify configuration change'
    fi
"

if [ $? -ne 0 ]; then
    log_error "Failed to update docker-compose.yml"
    log_info "Restoring from backup..."
    gcloud compute ssh "${INSTANCE_NAME}" --zone="${ZONE}" --command="
        sudo cp ${BACKUP_FILE} ${COMPOSE_FILE}
    "
    exit 1
fi

log_success "docker-compose.yml updated"

# Restart n8n container
echo
log_warn "About to restart n8n to apply changes..."
read -p "Continue with restart? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    log_info "Aborted. Changes saved but not applied."
    log_info "To apply manually, SSH to instance and run:"
    echo "  cd /opt/n8n && docker-compose down && docker-compose up -d"
    exit 0
fi

log_info "Restarting n8n container..."
gcloud compute ssh "${INSTANCE_NAME}" --zone="${ZONE}" --command="
    cd /opt/n8n && sudo docker-compose down && sudo docker-compose up -d
"

if [ $? -ne 0 ]; then
    log_error "Failed to restart n8n"
    log_info "Restoring from backup..."
    gcloud compute ssh "${INSTANCE_NAME}" --zone="${ZONE}" --command="
        sudo cp ${BACKUP_FILE} ${COMPOSE_FILE}
        cd /opt/n8n && sudo docker-compose down && sudo docker-compose up -d
    "
    exit 1
fi

log_success "n8n restarted successfully"

# Wait for n8n to be ready
echo
log_info "Waiting for n8n to be ready (30 seconds)..."
sleep 30

# Verify basic auth is working
log_info "Verifying basic authentication..."
AUTH_CHECK=$(curl -s -o /dev/null -w "%{http_code}" https://n8n.zaplit.com/ 2>/dev/null || echo "000")

if [ "$AUTH_CHECK" = "401" ]; then
    log_success "Basic Authentication is active (401 response without credentials)"
elif [ "$AUTH_CHECK" = "200" ]; then
    log_warn "Basic Authentication may not be active (200 response)"
else
    log_warn "Could not verify basic auth status (HTTP ${AUTH_CHECK})"
fi

# Summary
echo
echo "=========================================="
echo "Setup Complete!"
echo "=========================================="
log_success "Basic Authentication enabled"
echo
echo "Access Details:"
echo "  URL:      https://n8n.zaplit.com"
echo "  Username: ${USERNAME}"
echo "  Password: [Stored in GCP Secret Manager: ${SECRET_NAME}]"
echo
echo "To retrieve password:"
echo "  gcloud secrets versions access latest --secret=${SECRET_NAME}"
echo
log_warn "IMPORTANT: Save these credentials securely!"
echo

# Test login command
echo "Test login with:"
echo "  curl -u ${USERNAME}:$(echo $PASSWORD | head -c 10)... https://n8n.zaplit.com/"
echo

exit 0
