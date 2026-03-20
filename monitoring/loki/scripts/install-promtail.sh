#!/bin/bash
# install-promtail.sh - Install and configure Promtail for Loki integration
# 
# Usage: ./install-promtail.sh
# Required environment variables:
#   GRAFANA_CLOUD_LOKI_HOST - Your Grafana Cloud Loki endpoint
#   GRAFANA_CLOUD_LOKI_USER - Your Loki user ID  
#   GRAFANA_CLOUD_API_KEY   - Your Grafana Cloud API key
#
# Optional environment variables:
#   PROMTAIL_VERSION        - Promtail version (default: 2.9.4)
#   INSTALL_DIR             - Installation directory (default: /usr/local/bin)
#   CONFIG_DIR              - Config directory (default: /etc/promtail)

set -euo pipefail

# Configuration
PROMTAIL_VERSION="${PROMTAIL_VERSION:-2.9.4}"
INSTALL_DIR="${INSTALL_DIR:-/usr/local/bin}"
CONFIG_DIR="${CONFIG_DIR:-/etc/promtail}"
DATA_DIR="${DATA_DIR:-/var/lib/promtail}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
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

# Check if running as root
check_root() {
    if [[ $EUID -ne 0 ]]; then
        log_error "This script must be run as root or with sudo"
        exit 1
    fi
}

# Check required environment variables
check_env() {
    local missing=()
    
    [[ -z "${GRAFANA_CLOUD_LOKI_HOST:-}" ]] && missing+=("GRAFANA_CLOUD_LOKI_HOST")
    [[ -z "${GRAFANA_CLOUD_LOKI_USER:-}" ]] && missing+=("GRAFANA_CLOUD_LOKI_USER")
    [[ -z "${GRAFANA_CLOUD_API_KEY:-}" ]] && missing+=("GRAFANA_CLOUD_API_KEY")
    
    if [[ ${#missing[@]} -ne 0 ]]; then
        log_error "Missing required environment variables:"
        printf '%s\n' "${missing[@]}"
        log_error "Please set these variables and try again."
        log_info "Get these values from: https://grafana.com/orgs/<your-org>/stacks/<stack>"
        exit 1
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

# Download and install Promtail
install_promtail() {
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
    
    log_info "Promtail installed successfully"
    log_info "Version: $(promtail --version 2>&1 | head -1)"
}

# Create directories
create_directories() {
    log_info "Creating directories..."
    
    mkdir -p "$CONFIG_DIR"
    mkdir -p "$DATA_DIR"
    
    # Set permissions
    chmod 755 "$CONFIG_DIR"
    chmod 755 "$DATA_DIR"
}

# Create Promtail configuration
create_config() {
    log_info "Creating Promtail configuration..."
    
    cat > "${CONFIG_DIR}/promtail.yml" << 'EOF'
server:
  http_listen_port: 9080
  grpc_listen_port: 0
  log_level: info

positions:
  filename: /var/lib/promtail/positions.yaml
  sync_period: 10s

clients:
  - url: https://${GRAFANA_CLOUD_LOKI_HOST}/loki/api/v1/push
    basic_auth:
      username: ${GRAFANA_CLOUD_LOKI_USER}
      password: ${GRAFANA_CLOUD_API_KEY}
    batchwait: 1s
    batchsize: 102400
    timeout: 10s
    backoff_config:
      min_period: 100ms
      max_period: 5s
      max_retries: 10
    external_labels:
      cluster: zaplit-prod
      region: us-central1
      environment: production

scrape_configs:
  - job_name: n8n-containers
    static_configs:
      - targets:
          - localhost
        labels:
          job: n8n
          service: n8n
          __path__: /var/lib/docker/containers/*/*-json.log
    pipeline_stages:
      - json:
          expressions:
            log: log
            stream: stream
            timestamp: time
      - timestamp:
          source: timestamp
          format: RFC3339Nano
      - json:
          source: log
          expressions:
            level: level
            workflow_name: workflowName
      - labels:
          level:
          workflow_name:
      - output:
          source: log

  - job_name: twenty-crm-containers
    static_configs:
      - targets:
          - localhost
        labels:
          job: twenty-crm
          service: twenty-crm
          __path__: /var/lib/docker/containers/*twenty*/*-json.log
    pipeline_stages:
      - json:
          expressions:
            log: log
            stream: stream
            timestamp: time
      - timestamp:
          source: timestamp
          format: RFC3339Nano
      - output:
          source: log

  - job_name: nginx-access
    static_configs:
      - targets:
          - localhost
        labels:
          job: nginx
          service: nginx
          log_type: access
          __path__: /var/log/nginx/access.log
    pipeline_stages:
      - regex:
          expression: '^(?P<remote_addr>\S+) - (?P<remote_user>\S+) \[(?P<time_local>[^\]]+)\] "(?P<method>\S+) (?P<path>\S+) \S+" (?P<status>\d{3}) (?P<body_bytes_sent>\d+)'
      - timestamp:
          source: time_local
          format: "02/Jan/2006:15:04:05 -0700"
      - labels:
          status:
          method:
      - output:
          source: path

  - job_name: nginx-error
    static_configs:
      - targets:
          - localhost
        labels:
          job: nginx
          service: nginx
          log_type: error
          __path__: /var/log/nginx/error.log
    pipeline_stages:
      - regex:
          expression: '^(?P<time>\d{4}/\d{2}/\d{2} \d{2}:\d{2}:\d{2}) \[(?P<level>\w+)\]'
      - timestamp:
          source: time
          format: "2006/01/02 15:04:05"
      - labels:
          level:

  - job_name: system-syslog
    static_configs:
      - targets:
          - localhost
        labels:
          job: system
          service: system
          __path__: /var/log/syslog
    pipeline_stages:
      - regex:
          expression: '^(?P<timestamp>\w{3}\s+\d{1,2} \d{2}:\d{2}:\d{2}) (?P<hostname>\S+) (?P<service_name>\S+):'
      - timestamp:
          source: timestamp
          format: "Jan 2 15:04:05"
      - labels:
          service_name:

  - job_name: journald
    journal:
      max_age: 12h
      labels:
        job: journald
        service: systemd
    relabel_configs:
      - source_labels: ['__journal__systemd_unit']
        target_label: unit
      - source_labels: ['__journal__hostname']
        target_label: hostname
      - source_labels: ['__journal_priority']
        target_label: level
EOF

    # Set permissions
    chmod 644 "${CONFIG_DIR}/promtail.yml"
    log_info "Configuration created at ${CONFIG_DIR}/promtail.yml"
}

# Create systemd service
create_systemd_service() {
    log_info "Creating systemd service..."
    
    cat > /etc/systemd/system/promtail.service << EOF
[Unit]
Description=Promtail Log Shipper for Loki
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
ReadWritePaths=${DATA_DIR}
ReadOnlyPaths=/var/log /var/lib/docker/containers ${CONFIG_DIR}

[Install]
WantedBy=multi-user.target
EOF

    # Reload systemd
    systemctl daemon-reload
    log_info "Systemd service created"
}

# Test configuration
test_config() {
    log_info "Testing Promtail configuration..."
    
    if ! promtail -config.file="${CONFIG_DIR}/promtail.yml" -config.expand-env=true -dry-run 2>&1; then
        log_error "Configuration test failed"
        log_info "Checking configuration file..."
        cat "${CONFIG_DIR}/promtail.yml"
        exit 1
    fi
    
    log_info "Configuration test passed"
}

# Start service
start_service() {
    log_info "Starting Promtail service..."
    
    systemctl enable promtail
    systemctl start promtail
    
    # Wait a moment for service to start
    sleep 2
    
    # Check status
    if systemctl is-active --quiet promtail; then
        log_info "Promtail service is running"
    else
        log_error "Promtail service failed to start"
        systemctl status promtail --no-pager
        exit 1
    fi
}

# Verify installation
verify_installation() {
    log_info "Verifying installation..."
    
    # Check promtail binary
    if [[ -x "${INSTALL_DIR}/promtail" ]]; then
        log_info "Promtail binary: OK"
    else
        log_error "Promtail binary not found or not executable"
        return 1
    fi
    
    # Check config file
    if [[ -f "${CONFIG_DIR}/promtail.yml" ]]; then
        log_info "Configuration file: OK"
    else
        log_error "Configuration file not found"
        return 1
    fi
    
    # Check service status
    if systemctl is-active --quiet promtail; then
        log_info "Service status: RUNNING"
    else
        log_warn "Service status: NOT RUNNING"
    fi
    
    # Check metrics endpoint
    if curl -s http://localhost:9080/metrics > /dev/null 2>&1; then
        log_info "Metrics endpoint: OK (http://localhost:9080/metrics)"
    else
        log_warn "Metrics endpoint: Not responding yet (may take a moment)"
    fi
}

# Print next steps
print_next_steps() {
    echo ""
    log_info "Installation complete!"
    echo ""
    echo "Next steps:"
    echo "  1. Verify logs are flowing to Grafana Cloud"
    echo "  2. Go to: https://${GRAFANA_CLOUD_LOKI_HOST}/explore"
    echo "  3. Run query: {service=\"n8n\"}"
    echo ""
    echo "Useful commands:"
    echo "  - Check status:   sudo systemctl status promtail"
    echo "  - View logs:      sudo journalctl -u promtail -f"
    echo "  - Restart:        sudo systemctl restart promtail"
    echo "  - Test config:    sudo promtail -config.file=${CONFIG_DIR}/promtail.yml -dry-run"
    echo "  - View metrics:   curl http://localhost:9080/metrics"
    echo ""
    echo "Configuration file: ${CONFIG_DIR}/promtail.yml"
    echo "Data directory:     ${DATA_DIR}"
}

# Main function
main() {
    echo "=============================================="
    echo "  Promtail Installation for Loki"
    echo "  Version: ${PROMTAIL_VERSION}"
    echo "=============================================="
    echo ""
    
    check_root
    check_env
    
    log_info "Starting installation..."
    
    install_promtail
    create_directories
    create_config
    create_systemd_service
    test_config
    start_service
    verify_installation
    
    print_next_steps
}

# Run main function
main "$@"
