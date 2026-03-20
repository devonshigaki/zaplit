# Monitoring Infrastructure Setup

## Overview

This document describes the foundational monitoring infrastructure for n8n on GCP VM using Prometheus + Grafana.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        GCP VM Instance                          │
│                                                                 │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │
│  │    n8n      │    │ Prometheus  │    │   Grafana   │         │
│  │   :5678     │◄───│   :9090     │───►│   :3000     │         │
│  │  /metrics   │    │  (scrapes)  │    │ (dashboards)│         │
│  └─────────────┘    └─────────────┘    └─────────────┘         │
│                           ▲                                     │
│                           │                                     │
│                    ┌─────────────┐                              │
│                    │ Node Exporter│                             │
│                    │   :9100     │                              │
│                    │(system metrics)                            │
│                    └─────────────┘                              │
└─────────────────────────────────────────────────────────────────┘
```

## Files Created

### 1. Prometheus Configuration
**Path:** `/Users/devonshigaki/Downloads/zaplit/monitoring/prometheus.yml`

- Global scrape interval: 15s
- Scrapes: Prometheus self, n8n (:5678), node-exporter (:9100)
- Includes alert rules configuration

### 2. Alert Rules
**Path:** `/Users/devonshigaki/Downloads/zaplit/monitoring/alert-rules.yml`

**Critical Alerts (P0):**
- `N8nDown` - n8n instance unavailable for >1min
- `HighErrorRate` - Execution failure rate >10% for >2min

**Warning Alerts (P1):**
- `DiskSpaceLow` - Disk <10% available
- `MemoryHigh` - Memory usage >85%
- `CPUHigh` - CPU usage >80%

**Info Alerts (P2):**
- `PrometheusTargetMissing` - Any target down for >5min

### 3. Grafana Dashboard
**Path:** `/Users/devonshigaki/Downloads/zaplit/monitoring/grafana/dashboards/n8n-basic-dashboard.json`

**Panels:**
- Status indicators (n8n up/down, success/failure rates, p95 latency)
- Execution rate graph (success vs failed)
- Response time percentiles (p50, p95, p99)
- System resources (CPU, Memory, Disk usage)

### 4. Deployment Script
**Path:** `/Users/devonshigaki/Downloads/zaplit/scripts/monitoring/deploy-monitoring.sh`

Features:
- Automated directory setup
- Configuration generation
- Docker Compose integration
- Grafana admin password generation
- Deployment with health checks

## Docker Compose Services

```yaml
# Services added to docker-compose.yml

prometheus:
  image: prom/prometheus:latest
  ports: ["9090:9090"]
  volumes:
    - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml
    - ./monitoring/alert-rules.yml:/etc/prometheus/alert-rules.yml
    - prometheus_data:/prometheus

grafana:
  image: grafana/grafana:latest
  ports: ["3000:3000"]
  environment:
    - GF_SECURITY_ADMIN_PASSWORD=<generated>
  volumes:
    - grafana_data:/var/lib/grafana
    - ./monitoring/grafana/provisioning:/etc/grafana/provisioning

node-exporter:
  image: prom/node-exporter:latest
  volumes:
    - /proc:/host/proc:ro
    - /sys:/host/sys:ro
    - /:/rootfs:ro
```

## Deployment Instructions

### Option 1: Automated Deployment

```bash
# Set custom password (optional)
export GRAFANA_ADMIN_PASSWORD="your-secure-password"

# Run deployment script
chmod +x /Users/devonshigaki/Downloads/zaplit/scripts/monitoring/deploy-monitoring.sh
scp -r /Users/devonshigaki/Downloads/zaplit/monitoring user@gcp-vm:/opt/n8n/
ssh user@gcp-vm "sudo /opt/n8n/monitoring/deploy-monitoring.sh"
```

### Option 2: Manual Deployment

```bash
# 1. Copy files to server
scp -r /Users/devonshigaki/Downloads/zaplit/monitoring user@gcp-vm:/opt/n8n/

# 2. SSH to server
ssh user@gcp-vm

# 3. Update docker-compose.yml
cd /opt/n8n
# Add monitoring services from docker-compose snippet above

# 4. Start services
docker-compose up -d prometheus grafana node-exporter
```

## Access URLs

After deployment:
- **Prometheus:** http://<vm-ip>:9090
- **Grafana:** http://<vm-ip>:3000
  - Username: `admin`
  - Password: Generated during deployment (saved in `/opt/n8n/monitoring/.grafana-admin-password`)

## Post-Deployment Configuration

### 1. Configure Grafana Data Source

Grafana auto-provisions Prometheus as default datasource. Verify at:
```
Configuration → Data Sources → Prometheus
URL: http://prometheus:9090
```

### 2. Import Dashboard

Dashboard auto-provisions. To manually import:
```
Dashboards → Import → Upload JSON
Select: /opt/n8n/monitoring/grafana/dashboards/n8n-basic-dashboard.json
```

### 3. Firewall Rules (GCP)

```bash
# Allow access from specific IP ranges only
gcloud compute firewall-rules create allow-monitoring \
    --allow tcp:9090,tcp:3000 \
    --source-ranges="YOUR_OFFICE_IP/32" \
    --target-tags=n8n-server
```

**Security Note:** Do NOT expose ports 9090 and 3000 to the internet. Use:
- VPN/SSH tunnel
- GCP IAP (Identity-Aware Proxy)
- Internal load balancer with auth

## Metrics Reference

### n8n Metrics (if metrics enabled)
- `n8n_execution_success_total` - Successful executions counter
- `n8n_execution_failed_total` - Failed executions counter
- `n8n_execution_duration_seconds_bucket` - Execution duration histogram

### Node Exporter Metrics
- `node_cpu_seconds_total` - CPU usage
- `node_memory_MemAvailable_bytes` - Available memory
- `node_memory_MemTotal_bytes` - Total memory
- `node_filesystem_avail_bytes` - Available disk space

## Troubleshooting

### Prometheus targets down
```bash
# Check targets status
curl http://localhost:9090/api/v1/targets

# Check n8n metrics endpoint
curl http://localhost:5678/metrics
```

### Grafana not loading dashboard
```bash
# Check provisioning logs
docker-compose logs grafana | grep -i "provisioning"

# Verify dashboard JSON is valid
jq . /opt/n8n/monitoring/grafana/dashboards/n8n-basic-dashboard.json
```

### No metrics from n8n
n8n requires metrics to be explicitly enabled. Check n8n environment:
```yaml
environment:
  - N8N_METRICS=true
```

## Next Steps

1. **Alertmanager Integration:** Configure alert notifications (Slack, PagerDuty, email)
2. **SSL/TLS:** Add reverse proxy (Caddy/Nginx) with HTTPS
3. **Log Aggregation:** Add Loki for log aggregation
4. **Uptime Monitoring:** External monitoring (UptimeRobot, Pingdom)
5. **Backup:** Configure backup for Prometheus/Grafana data volumes

## Cost Estimate (GCP)

- **VM:** e2-medium (2 vCPU, 4GB) - ~$25/month
- **Disk:** 20GB additional for monitoring data - ~$1/month
- **Network:** Minimal egress for monitoring - ~$1-2/month
- **Total:** ~$27-30/month additional
