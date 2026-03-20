#!/bin/bash
#
# Monitoring Infrastructure Deployment Script
# Deploys Prometheus + Grafana + Node Exporter for n8n observability
#

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
N8N_DIR="${N8N_DIR:-/opt/n8n}"
MONITORING_DIR="${N8N_DIR}/monitoring"
GRAFANA_ADMIN_PASSWORD="${GRAFANA_ADMIN_PASSWORD:-}"

# Logging functions
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Generate secure password if not provided
generate_password() {
    openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 16
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check if running on the n8n server or in correct directory
    if [[ ! -d "$N8N_DIR" ]]; then
        log_error "n8n directory not found at $N8N_DIR"
        log_info "Set N8N_DIR environment variable if different location"
        exit 1
    fi
    
    # Check if docker-compose.yml exists
    if [[ ! -f "$N8N_DIR/docker-compose.yml" ]]; then
        log_error "docker-compose.yml not found in $N8N_DIR"
        exit 1
    fi
    
    # Check Docker is available
    if ! command -v docker &> /dev/null; then
        log_error "Docker not found. Please install Docker first."
        exit 1
    fi
    
    log_success "Prerequisites check passed"
}

# Create directory structure
setup_directories() {
    log_info "Setting up monitoring directories..."
    
    mkdir -p "$MONITORING_DIR"
    mkdir -p "$MONITORING_DIR/grafana/dashboards"
    mkdir -p "$MONITORING_DIR/grafana/provisioning/datasources"
    mkdir -p "$MONITORING_DIR/grafana/provisioning/dashboards"
    
    log_success "Directories created"
}

# Create Prometheus configuration
create_prometheus_config() {
    log_info "Creating Prometheus configuration..."
    
    cat > "$MONITORING_DIR/prometheus.yml" << 'EOF'
global:
  scrape_interval: 15s
  evaluation_interval: 15s
  external_labels:
    monitor: 'n8n-monitor'
    environment: 'production'

alerting:
  alertmanagers:
    - static_configs:
        - targets: []
      # For production, add alertmanager endpoint here:
      # - targets: ['alertmanager:9093']

rule_files:
  - 'alert-rules.yml'

scrape_configs:
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']
    scrape_interval: 15s
  
  - job_name: 'n8n'
    static_configs:
      - targets: ['n8n:5678']
    metrics_path: '/metrics'
    scrape_interval: 15s
    scrape_timeout: 10s
  
  - job_name: 'node-exporter'
    static_configs:
      - targets: ['node-exporter:9100']
    scrape_interval: 15s
EOF
    
    log_success "Prometheus configuration created"
}

# Create alert rules
create_alert_rules() {
    log_info "Creating alert rules..."
    
    cat > "$MONITORING_DIR/alert-rules.yml" << 'EOF'
groups:
  - name: n8n-critical
    interval: 15s
    rules:
      - alert: N8nDown
        expr: up{job="n8n"} == 0
        for: 1m
        labels:
          severity: p0
          service: n8n
        annotations:
          summary: "n8n is down"
          description: "n8n instance has been down for more than 1 minute"
      
      - alert: HighErrorRate
        expr: rate(n8n_execution_failed_total[5m]) > 0.1
        for: 2m
        labels:
          severity: p0
          service: n8n
        annotations:
          summary: "High error rate detected in n8n executions"
          description: "Error rate is above 10% for more than 2 minutes"
      
      - alert: DiskSpaceLow
        expr: (node_filesystem_avail_bytes / node_filesystem_size_bytes) < 0.1
        for: 5m
        labels:
          severity: p1
          service: infrastructure
        annotations:
          summary: "Disk space below 10%"
          description: "Filesystem has less than 10% space remaining"
      
      - alert: MemoryHigh
        expr: (1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) > 0.85
        for: 5m
        labels:
          severity: p1
          service: infrastructure
        annotations:
          summary: "High memory usage"
          description: "Memory usage is above 85% for more than 5 minutes"
      
      - alert: CPUHigh
        expr: 100 - (avg by (instance) (irate(node_cpu_seconds_total{mode="idle"}[5m])) * 100) > 80
        for: 5m
        labels:
          severity: p1
          service: infrastructure
        annotations:
          summary: "High CPU usage"
          description: "CPU usage is above 80% for more than 5 minutes"

  - name: n8n-warnings
    interval: 30s
    rules:
      - alert: PrometheusTargetMissing
        expr: up == 0
        for: 5m
        labels:
          severity: p2
          service: monitoring
        annotations:
          summary: "Prometheus target is missing"
          description: "Target has been down for more than 5 minutes"
EOF
    
    log_success "Alert rules created"
}

# Create Grafana provisioning configs
create_grafana_provisioning() {
    log_info "Creating Grafana provisioning configuration..."
    
    # Create datasource provisioning
    cat > "$MONITORING_DIR/grafana/provisioning/datasources/prometheus.yml" << 'EOF'
apiVersion: 1
datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
    editable: false
EOF
    
    # Create dashboard provisioning
    cat > "$MONITORING_DIR/grafana/provisioning/dashboards/dashboards.yml" << 'EOF'
apiVersion: 1
providers:
  - name: 'default'
    orgId: 1
    folder: ''
    type: file
    disableDeletion: false
    editable: true
    options:
      path: /etc/grafana/provisioning/dashboards
EOF
    
    log_success "Grafana provisioning created"
}

# Generate Grafana admin password
setup_grafana_password() {
    if [[ -z "$GRAFANA_ADMIN_PASSWORD" ]]; then
        GRAFANA_ADMIN_PASSWORD=$(generate_password)
        log_warn "Generated Grafana admin password (save this!): $GRAFANA_ADMIN_PASSWORD"
    fi
    
    # Save password to file with restricted permissions
    echo "$GRAFANA_ADMIN_PASSWORD" > "$MONITORING_DIR/.grafana-admin-password"
    chmod 600 "$MONITORING_DIR/.grafana-admin-password"
    
    log_info "Grafana admin password saved to $MONITORING_DIR/.grafana-admin-password"
}

# Update docker-compose.yml with monitoring services
update_docker_compose() {
    log_info "Updating docker-compose.yml..."
    
    local compose_file="$N8N_DIR/docker-compose.yml"
    
    # Check if monitoring services already exist
    if grep -q "prometheus:" "$compose_file"; then
        log_warn "Monitoring services already in docker-compose.yml"
        return 0
    fi
    
    # Backup original
    cp "$compose_file" "$compose_file.backup.$(date +%Y%m%d%H%M%S)"
    
    # Append monitoring services
    cat >> "$compose_file" << EOF

  # Monitoring Stack
  prometheus:
    image: prom/prometheus:latest
    container_name: prometheus
    volumes:
      - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - ./monitoring/alert-rules.yml:/etc/prometheus/alert-rules.yml:ro
      - prometheus_data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--storage.tsdb.retention.time=15d'
      - '--web.console.libraries=/etc/prometheus/console_libraries'
      - '--web.console.templates=/etc/prometheus/consoles'
      - '--web.enable-lifecycle'
    ports:
      - "9090:9090"
    restart: unless-stopped
    networks:
      - n8n-network

  grafana:
    image: grafana/grafana:latest
    container_name: grafana
    volumes:
      - grafana_data:/var/lib/grafana
      - ./monitoring/grafana/provisioning:/etc/grafana/provisioning:ro
      - ./monitoring/grafana/dashboards:/etc/grafana/provisioning/dashboards:ro
    ports:
      - "3000:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_ADMIN_PASSWORD}
      - GF_USERS_ALLOW_SIGN_UP=false
      - GF_SERVER_ROOT_URL=http://localhost:3000
    restart: unless-stopped
    networks:
      - n8n-network
    depends_on:
      - prometheus

  node-exporter:
    image: prom/node-exporter:latest
    container_name: node-exporter
    volumes:
      - /proc:/host/proc:ro
      - /sys:/host/sys:ro
      - /:/rootfs:ro
    command:
      - '--path.procfs=/host/proc'
      - '--path.rootfs=/rootfs'
      - '--path.sysfs=/host/sys'
      - '--collector.filesystem.mount-points-exclude=^/(sys|proc|dev|host|etc)($$|/)'
    restart: unless-stopped
    networks:
      - n8n-network

volumes:
  prometheus_data:
  grafana_data:
EOF
    
    log_success "docker-compose.yml updated with monitoring services"
}

# Deploy monitoring stack
deploy_stack() {
    log_info "Deploying monitoring stack..."
    
    cd "$N8N_DIR"
    
    # Pull latest images
    log_info "Pulling latest images..."
    docker-compose pull prometheus grafana node-exporter
    
    # Start monitoring services
    log_info "Starting monitoring services..."
    docker-compose up -d prometheus grafana node-exporter
    
    # Wait for services to be ready
    log_info "Waiting for services to be ready..."
    sleep 10
    
    # Check service health
    if docker-compose ps | grep -q "prometheus.*Up"; then
        log_success "Prometheus is running on port 9090"
    else
        log_error "Prometheus failed to start"
        docker-compose logs prometheus
    fi
    
    if docker-compose ps | grep -q "grafana.*Up"; then
        log_success "Grafana is running on port 3000"
    else
        log_error "Grafana failed to start"
        docker-compose logs grafana
    fi
    
    if docker-compose ps | grep -q "node-exporter.*Up"; then
        log_success "Node Exporter is running"
    else
        log_error "Node Exporter failed to start"
        docker-compose logs node-exporter
    fi
}

# Print access information
print_access_info() {
    local server_ip
    server_ip=$(hostname -I | awk '{print $1}')
    
    echo ""
    echo "=========================================="
    echo "  Monitoring Stack Deployed Successfully!"
    echo "=========================================="
    echo ""
    echo -e "${BLUE}Prometheus:${NC}"
    echo "  URL: http://${server_ip}:9090"
    echo "  Status: http://${server_ip}:9090/targets"
    echo "  Alerts: http://${server_ip}:9090/alerts"
    echo ""
    echo -e "${BLUE}Grafana:${NC}"
    echo "  URL: http://${server_ip}:3000"
    echo "  Username: admin"
    echo "  Password: ${GRAFANA_ADMIN_PASSWORD}"
    echo "  (Saved in: ${MONITORING_DIR}/.grafana-admin-password)"
    echo ""
    echo -e "${YELLOW}IMPORTANT: Secure your Grafana installation!${NC}"
    echo "  - Change default admin password"
    echo "  - Consider enabling HTTPS/SSL"
    echo "  - Restrict port access with firewall"
    echo ""
    echo "=========================================="
}

# Main function
main() {
    echo "=========================================="
    echo "  n8n Monitoring Stack Deployment"
    echo "=========================================="
    echo ""
    
    check_prerequisites
    setup_directories
    create_prometheus_config
    create_alert_rules
    create_grafana_provisioning
    setup_grafana_password
    update_docker_compose
    
    # Ask before deploying
    read -p "Deploy monitoring stack now? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        deploy_stack
        print_access_info
    else
        log_info "Deployment skipped. Run 'docker-compose up -d' manually to deploy."
        print_access_info
    fi
}

# Run main function
main "$@"
