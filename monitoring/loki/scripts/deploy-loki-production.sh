#!/bin/bash
# deploy-loki-production.sh - Production deployment script for Loki log aggregation
#
# This script:
#   - Checks prerequisites
#   - Deploys Promtail with production configuration
#   - Configures log rotation
#   - Tests log shipping
#   - Verifies logs in Grafana
#
# Usage:
#   export GRAFANA_CLOUD_LOKI_HOST=logs-prod-us-central1.grafana.net
#   export GRAFANA_CLOUD_LOKI_USER=123456
#   export GRAFANA_CLOUD_API_KEY=glc_ey...
#   sudo ./deploy-loki-production.sh

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOKI_DIR="$(dirname "$SCRIPT_DIR")"
PROMTAIL_VERSION="${PROMTAIL_VERSION:-2.9.4}"
INSTALL_DIR="${INSTALL_DIR:-/usr/local/bin}"
CONFIG_DIR="${CONFIG_DIR:-/etc/promtail}"
DATA_DIR="${DATA_DIR:-/var/lib/promtail}"
LOG_DIR="${LOG_DIR:-/var/log/promtail}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_section() {
    echo -e "${BLUE}[SECTION]${NC} $1"
    echo "=============================================="
}

# Check if running as root
check_root() {
    if [[ $EUID -ne 0 ]]; then
        log_error "This script must be run as root or with sudo"
        exit 1
    fi
}

# Check prerequisites
check_prerequisites() {
    log_section "Checking Prerequisites"
    
    local missing=()
    
    # Check required tools
    command -v docker >/dev/null 2>&1 || missing+=("docker")
    command -v docker-compose >/dev/null 2>&1 || missing+=("docker-compose")
    command -v curl >/dev/null 2>&1 || missing+=("curl")
    command -v jq >/dev/null 2>&1 || missing+=("jq")
    
    if [[ ${#missing[@]} -ne 0 ]]; then
        log_error "Missing required tools: ${missing[*]}"
        log_info "Please install the missing tools and try again"
        exit 1
    fi
    
    log_info "All required tools are installed"
    
    # Check required environment variables
    local missing_env=()
    
    [[ -z "${GRAFANA_CLOUD_LOKI_HOST:-}" ]] && missing_env+=("GRAFANA_CLOUD_LOKI_HOST")
    [[ -z "${GRAFANA_CLOUD_LOKI_USER:-}" ]] && missing_env+=("GRAFANA_CLOUD_LOKI_USER")
    [[ -z "${GRAFANA_CLOUD_API_KEY:-}" ]] && missing_env+=("GRAFANA_CLOUD_API_KEY")
    
    if [[ ${#missing_env[@]} -ne 0 ]]; then
        log_error "Missing required environment variables:"
        printf '%s\n' "${missing_env[@]}"
        log_info "Get these values from: https://grafana.com/orgs/<your-org>/stacks/<stack>"
        exit 1
    fi
    
    log_info "Environment variables configured"
    
    # Check Docker is running
    if ! docker info >/dev/null 2>&1; then
        log_error "Docker is not running"
        exit 1
    fi
    
    log_info "Docker is running"
    
    # Check monitoring network exists
    if ! docker network ls | grep -q "monitoring"; then
        log_warn "Docker network 'monitoring' does not exist"
        log_info "Creating monitoring network..."
        docker network create monitoring
    else
        log_info "Docker network 'monitoring' exists"
    fi
    
    # Check log directories exist
    if [[ ! -d "/var/lib/docker/containers" ]]; then
        log_warn "Docker containers directory not found at /var/lib/docker/containers"
        log_info "Promtail may not be able to scrape container logs"
    fi
    
    if [[ ! -d "/var/log" ]]; then
        log_warn "/var/log directory not found"
    fi
}

# Detect architecture
detect_arch() {
    local arch=$(uname -m)
    case $arch in
        x86_64)
            echo "amd64"
            ;;
        aarch64|arm64)
            echo "arm64"
            ;;
        *)
            log_error "Unsupported architecture: $arch"
            exit 1
            ;;
    esac
}

# Deploy Promtail binary deploy_promtail_binary() {
    log_section "Deploying Promtail Binary"
    
    local arch=$(detect_arch)
    local download_url="https://github.com/grafana/loki/releases/download/v${PROMTAIL_VERSION}/promtail-linux-${arch}.zip"
    local temp_dir=$(mktemp -d)
    
    log_info "Downloading Promtail v${PROMTAIL_VERSION} for ${arch}..."
    
    cd "$temp_dir"
    
    if ! curl -fsSL -o promtail.zip "$download_url"; then
        log_error "Failed to download Promtail from $download_url"
        rm -rf "$temp_dir"
        exit 1
    fi
    
    log_info "Extracting Promtail..."
    unzip -q promtail.zip
    
    log_info "Installing Promtail to ${INSTALL_DIR}..."
    chmod +x "promtail-linux-${arch}"
    mv "promtail-linux-${arch}" "${INSTALL_DIR}/promtail"
    
    # Cleanup
    cd -
    rm -rf "$temp_dir"
    
    log_info "Promtail installed: $(promtail --version 2>&1 | head -1)"
}

# Create directories
create_directories() {
    log_section "Creating Directories"
    
    mkdir -p "$CONFIG_DIR"
    mkdir -p "$DATA_DIR"
    mkdir -p "$LOG_DIR"
    
    # Set permissions
    chmod 755 "$CONFIG_DIR"
    chmod 755 "$DATA_DIR"
    chmod 755 "$LOG_DIR"
    
    log_info "Created directories:"
    log_info "  Config: $CONFIG_DIR"
    log_info "  Data:   $DATA_DIR"
    log_info "  Logs:   $LOG_DIR"
}

# Copy production configuration
deploy_config() {
    log_section "Deploying Configuration"
    
    if [[ -f "${LOKI_DIR}/promtail-production.yml" ]]; then
        cp "${LOKI_DIR}/promtail-production.yml" "${CONFIG_DIR}/promtail.yml"
        log_info "Copied production configuration"
    else
        log_error "Production config not found at ${LOKI_DIR}/promtail-production.yml"
        exit 1
    fi
    
    chmod 644 "${CONFIG_DIR}/promtail.yml"
    log_info "Configuration deployed to ${CONFIG_DIR}/promtail.yml"
}

# Create systemd service
create_systemd_service() {
    log_section "Creating Systemd Service"
    
    cat > /etc/systemd/system/promtail.service << EOF
[Unit]
Description=Promtail Log Shipper for Loki (Production)
Documentation=https://grafana.com/docs/loki/latest/clients/promtail/
After=network.target docker.service
Wants=docker.service

[Service]
Type=simple
User=root
ExecStart=${INSTALL_DIR}/promtail -config.file=${CONFIG_DIR}/promtail.yml -config.expand-env=true
ExecReload=/bin/kill -HUP \$MAINPID
Restart=always
RestartSec=5
StartLimitInterval=60s
StartLimitBurst=3

# Environment variables for config expansion
Environment="GRAFANA_CLOUD_LOKI_HOST=${GRAFANA_CLOUD_LOKI_HOST}"
Environment="GRAFANA_CLOUD_LOKI_USER=${GRAFANA_CLOUD_LOKI_USER}"
Environment="GRAFANA_CLOUD_API_KEY=${GRAFANA_CLOUD_API_KEY}"

# Resource limits
LimitNOFILE=65536
MemoryMax=512M

# Security
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=${DATA_DIR} ${LOG_DIR}
ReadOnlyPaths=/var/log /var/lib/docker/containers ${CONFIG_DIR}

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=promtail

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload
    log_info "Systemd service created"
}

# Configure log rotation
configure_log_rotation() {
    log_section "Configuring Log Rotation"
    
    # Create logrotate config for Promtail
    cat > /etc/logrotate.d/promtail << 'EOF'
/var/log/promtail/*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    create 0644 root root
    sharedscripts
    postrotate
        /bin/kill -HUP $(cat /var/run/promtail.pid 2>/dev/null) 2>/dev/null || true
    endscript
}
EOF

    log_info "Log rotation configured for Promtail"
    
    # Configure Docker log rotation if not already done
    if [[ ! -f "/etc/docker/daemon.json" ]]; then
        log_info "Configuring Docker log rotation..."
        mkdir -p /etc/docker
        cat > /etc/docker/daemon.json << 'EOF'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "100m",
    "max-file": "3",
    "labels": "service,job",
    "env": "OS_VERSION"
  }
}
EOF
        log_warn "Docker configuration updated. Restart Docker to apply: sudo systemctl restart docker"
    else
        log_info "Docker daemon.json already exists, please ensure log rotation is configured"
    fi
}

# Test configuration
test_configuration() {
    log_section "Testing Configuration"
    
    log_info "Running configuration validation..."
    
    if ! promtail -config.file="${CONFIG_DIR}/promtail.yml" -config.expand-env=true -dry-run 2>&1; then
        log_error "Configuration test failed"
        log_info "Checking configuration file..."
        cat "${CONFIG_DIR}/promtail.yml"
        exit 1
    fi
    
    log_info "Configuration validation passed"
}

# Start and enable service
start_service() {
    log_section "Starting Promtail Service"
    
    systemctl enable promtail
    
    # Stop existing service if running
    if systemctl is-active --quiet promtail 2>/dev/null; then
        log_info "Stopping existing Promtail service..."
        systemctl stop promtail
        sleep 2
    fi
    
    log_info "Starting Promtail service..."
    systemctl start promtail
    
    # Wait for service to start
    sleep 3
    
    # Check status
    if systemctl is-active --quiet promtail; then
        log_info "Promtail service is running"
    else
        log_error "Promtail service failed to start"
        systemctl status promtail --no-pager
        exit 1
    fi
}

# Test log shipping
test_log_shipping() {
    log_section "Testing Log Shipping"
    
    local test_id="deploy-test-$(date +%s)-$RANDOM"
    
    log_info "Generating test log entry (ID: $test_id)..."
    logger -t "promtail-deploy" "TEST_ID=$test_id Promtail deployment test log"
    
    log_info "Waiting for log to be ingested (30s)..."
    sleep 30
    
    # Query Loki for the test log
    local query="{service=\"system\"} |= \"$test_id\""
    local encoded_query=$(printf '%s' "$query" | jq -sRr @uri 2>/dev/null || echo "")
    
    if [[ -z "$encoded_query" ]]; then
        # Fallback URL encoding
        encoded_query=$(echo "$query" | sed 's/ /%20/g; s/=/%3D/g; s/"/%22/g; s/{/%7B/g; s/}/%7D/g; s/|/%7C/g')
    fi
    
    local url="https://${GRAFANA_CLOUD_LOKI_HOST}/loki/api/v1/query?query=${encoded_query}&limit=10"
    
    log_info "Querying Loki for test log..."
    local response
    response=$(curl -s -u "${GRAFANA_CLOUD_LOKI_USER}:${GRAFANA_CLOUD_API_KEY}" \
        --max-time 15 \
        "$url" 2>/dev/null || echo '{"status": "error"}')
    
    if echo "$response" | grep -q "$test_id"; then
        log_info "✓ Test log found in Loki"
        return 0
    else
        log_warn "✗ Test log not found in Loki yet (may take longer to appear)"
        log_info "Check manually in Grafana: https://${GRAFANA_CLOUD_LOKI_HOST}/explore"
        return 1
    fi
}

# Verify in Grafana
verify_grafana() {
    log_section "Verifying Grafana Integration"
    
    log_info "Checking available labels in Loki..."
    
    local url="https://${GRAFANA_CLOUD_LOKI_HOST}/loki/api/v1/label/service/values"
    local response
    
    response=$(curl -s -u "${GRAFANA_CLOUD_LOKI_USER}:${GRAFANA_CLOUD_API_KEY}" \
        --max-time 15 \
        "$url" 2>/dev/null || echo '{"data": []}')
    
    if echo "$response" | grep -qE '"n8n"|"nginx"|"system"'; then
        log_info "✓ Service labels detected in Loki"
        echo "$response" | jq -r '.data[]' | head -10 | while read -r label; do
            log_info "  - $label"
        done
    else
        log_warn "No service labels found yet (logs may still be ingesting)"
    fi
    
    log_info ""
    log_info "Grafana Cloud URL: https://${GRAFANA_CLOUD_LOKI_HOST}/explore"
    log_info ""
    log_info "Sample LogQL queries to try:"
    log_info '  {service="n8n"}'
    log_info '  {service="n8n", level="error"}'
    log_info '  {service="nginx", status=~"5.."}'
}

# Print deployment summary
print_summary() {
    log_section "Deployment Summary"
    
    echo ""
    echo "Promtail has been deployed successfully!"
    echo ""
    echo "Configuration:"
    echo "  Config file: ${CONFIG_DIR}/promtail.yml"
    echo "  Data dir:    ${DATA_DIR}"
    echo "  Log dir:     ${LOG_DIR}"
    echo ""
    echo "Service Status:"
    systemctl status promtail --no-pager | grep -E "Active:|Loaded:" | sed 's/^/  /'
    echo ""
    echo "Useful commands:"
    echo "  Check status:   sudo systemctl status promtail"
    echo "  View logs:      sudo journalctl -u promtail -f"
    echo "  Restart:        sudo systemctl restart promtail"
    echo "  Test config:    sudo promtail -config.file=${CONFIG_DIR}/promtail.yml -dry-run"
    echo "  View metrics:   curl http://localhost:9080/metrics"
    echo ""
    echo "Grafana Cloud:"
    echo "  Explore logs:   https://${GRAFANA_CLOUD_LOKI_HOST}/explore"
    echo ""
    echo "Next steps:"
    echo "  1. Verify logs are flowing in Grafana Cloud Explore"
    echo "  2. Import the unified dashboard from:"
    echo "     ${LOKI_DIR}/../grafana/dashboards/unified-observability.json"
    echo "  3. Configure alert rules in Grafana Cloud Alerting"
    echo ""
}

# Main deployment function
main() {
    echo "=============================================="
    echo "  Loki Log Aggregation - Production Deploy"
    echo "  Version: ${PROMTAIL_VERSION}"
    echo "  Date: $(date)"
    echo "=============================================="
    echo ""
    
    check_root
    check_prerequisites
    deploy_promtail_binary
    create_directories
    deploy_config
    create_systemd_service
    configure_log_rotation
    test_configuration
    start_service
    test_log_shipping
    verify_grafana
    print_summary
    
    log_info "Deployment complete!"
}

# Run main function
main "$@"
