---
title: Monitoring & Observability Operations Guide
topics:
  - MONITORING_AND_OBSERVABILITY_GUIDE.md
  - EXECUTION_MONITORING_FIXES.md
  - MONITORING_IMPLEMENTATION_CHECKLIST.md
  - PERFORMANCE_OPTIMIZATION_GUIDE.md
---

# Monitoring & Observability Operations Guide

## Quick Reference

### Access URLs
- **Prometheus:** http://<vm-ip>:9090
- **Grafana:** http://<vm-ip>:3000 (admin + generated password)

### Key Metrics Dashboard

| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| Success Rate | > 99% | < 95% (Critical) |
| Response Time (p95) | < 5s | > 10s (Critical) |
| Error Rate | < 1% | > 5% (Critical) |
| CRM API Latency | < 2s | > 5s (Warning) |

### PromQL Queries
```promql
# Success rate over 5 minutes
sum(rate(n8n_execution_success_total[5m])) / sum(rate(n8n_execution_total[5m])) * 100

# p95 response time
histogram_quantile(0.95, sum(rate(n8n_execution_duration_seconds_bucket[5m])) by (le))

# Failed executions per minute
sum(rate(n8n_execution_failed_total[5m])) by (workflow_name)
```

### Deployment Commands
```bash
# Deploy monitoring stack
chmod +x scripts/monitoring/deploy-monitoring.sh
scp -r monitoring user@gcp-vm:/opt/n8n/
ssh user@gcp-vm "sudo /opt/n8n/monitoring/deploy-monitoring.sh"

# Check Prometheus targets
curl http://localhost:9090/api/v1/targets

# Verify n8n metrics endpoint
curl http://localhost:5678/metrics
```

---

## Detailed Procedures

### 1. Monitoring Architecture

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
│                    ┌─────────────┐                              │
│                    │ Node Exporter│                             │
│                    │   :9100     │                              │
│                    │(system metrics)                            │
│                    └─────────────┘                              │
└─────────────────────────────────────────────────────────────────┘
```

### 2. Prometheus Configuration

**File:** `monitoring/prometheus.yml`

```yaml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']

  - job_name: 'n8n'
    static_configs:
      - targets: ['n8n:5678']
    metrics_path: /metrics

  - job_name: 'node-exporter'
    static_configs:
      - targets: ['node-exporter:9100']
```

**Alert Rules:** `monitoring/alert-rules.yml`

| Alert | Severity | Condition |
|-------|----------|-----------|
| N8nDown | P0 | n8n unavailable >1min |
| HighErrorRate | P0 | Failure rate >10% for >2min |
| DiskSpaceLow | P1 | Disk <10% available |
| MemoryHigh | P1 | Memory usage >85% |
| CPUHigh | P1 | CPU usage >80% |
| PrometheusTargetMissing | P2 | Any target down >5min |

### 3. Grafana Dashboard

**File:** `monitoring/grafana/dashboards/n8n-basic-dashboard.json`

**Panels:**
- Status indicators (n8n up/down, success/failure rates, p95 latency)
- Execution rate graph (success vs failed)
- Response time percentiles (p50, p95, p99)
- System resources (CPU, Memory, Disk usage)

### 4. Docker Compose Services

```yaml
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

### 5. Alert Configuration

#### Alert Severity Levels

| Level | Name | Response Time | Notification Channel |
|-------|------|---------------|---------------------|
| P0 | Critical | 5 minutes | PagerDuty + SMS + Slack #incidents |
| P1 | High | 15 minutes | Slack #incidents + Email |
| P2 | Medium | 1 hour | Slack #engineering |
| P3 | Low | 4 hours | Daily digest |

#### Slack Alert Setup
```javascript
// Error Alert Workflow
const webhookUrl = $env.SLACK_WEBHOOK_URL;

const alert = {
  text: "🚨 n8n Workflow Failure Alert",
  blocks: [
    {
      type: "header",
      text: { type: "plain_text", text: "Workflow Execution Failed" }
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Workflow:*\n${$json.workflowName}` },
        { type: "mrkdwn", text: `*Node:*\n${$json.nodeName}` },
        { type: "mrkdwn", text: `*Time:*\n${new Date().toISOString()}` },
        { type: "mrkdwn", text: `*Error:*\n${$json.errorMessage?.substring(0, 100)}` }
      ]
    }
  ]
};
```

### 6. Log Aggregation

#### Structured Log Format
```json
{
  "timestamp": "2026-03-19T14:32:05.123Z",
  "level": "INFO",
  "service": "n8n",
  "workflow": "consultation-form",
  "execution_id": "exec_a1b2c3d4",
  "trace_id": "trace_x9y8z7w6",
  "node": "Create Person",
  "message": "CRM person created successfully",
  "metadata": {
    "duration_ms": 890,
    "status_code": 201,
    "crm_person_id": "person_uuid_123"
  }
}
```

#### Log Retention Policy

| Log Type | Retention | Storage Class |
|----------|-----------|---------------|
| Application Logs (INFO+) | 30 days | Hot |
| Error Logs | 90 days | Warm |
| Audit Logs | 2 years | Cold |
| Debug Logs | 7 days | Hot |

### 7. Health Checks

```bash
#!/bin/bash
# Webhook Health Check

N8N_URL="${N8N_URL:-https://n8n.zaplit.com}"
WEBHOOK_PATH="${WEBHOOK_PATH:-/webhook/consultation}"

# OPTIONS check (CORS preflight)
curl -s -o /dev/null -w "%{http_code}" \
  -X OPTIONS \
  -H "Origin: https://zaplit.com" \
  -H "Access-Control-Request-Method: POST" \
  "${N8N_URL}${WEBHOOK_PATH}"
```

### 8. Performance Monitoring

#### Key Performance Metrics

| Metric | Warning | Critical | Action |
|--------|---------|----------|--------|
| p95 Latency | >3s | >5s | Scale up / Optimize |
| Error Rate | >1% | >5% | Investigate / Rollback |
| Success Rate | <99% | <95% | Page on-call |
| Memory Usage | >70% | >90% | Scale / Restart |
| Queue Depth | >100 | >500 | Scale workers |

#### Performance Regression Detection
```javascript
const BASELINE_P95 = 3000; // 3 seconds
const REGRESSION_THRESHOLD = 1.5; // 50% increase

async function detectRegression() {
  const currentP95 = await getP95Duration('last_15m');
  const baselineP95 = await getBaselineP95();
  
  if (currentP95 > baselineP95 * REGRESSION_THRESHOLD) {
    await sendAlert({
      severity: 'warning',
      message: `Performance regression: p95 ${currentP95}ms (baseline: ${baselineP95}ms)`,
      regression: ((currentP95 - baselineP95) / baselineP95 * 100).toFixed(1) + '%'
    });
  }
}
```

---

## Implementation Checklist

### Phase 1: Foundation (Week 1-2)

**Day 1-2: Prometheus + Grafana Setup**
- [ ] Provision monitoring VM (2CPU/4GB/50GB)
- [ ] Deploy Prometheus container
- [ ] Deploy Grafana container
- [ ] Configure data source

**Day 3-4: Core Dashboards**
- [ ] Success rate panel
- [ ] Execution count graph
- [ ] Error rate visualization
- [ ] Latency percentiles

**Day 5: First Alerts**
- [ ] Service down detection
- [ ] High error rate (> 10%)
- [ ] High latency (> 10s)
- [ ] Slack webhook configured

### Phase 2: Alerting & Notifications (Week 2)
- [ ] Deploy Alertmanager
- [ ] PagerDuty integration
- [ ] Escalation policies

### Phase 3: Log Aggregation (Week 3-4)
- [ ] Deploy Loki
- [ ] Configure log shipping
- [ ] PII redaction

### Phase 4: Advanced Features (Week 4)
- [ ] Synthetic monitoring
- [ ] CRM health monitoring
- [ ] Team training

---

## Troubleshooting

### Prometheus targets down
```bash
curl http://localhost:9090/api/v1/targets
docker-compose logs prometheus | grep -i "target"
```

### Grafana not loading dashboard
```bash
docker-compose logs grafana | grep -i "provisioning"
jq . /opt/n8n/monitoring/grafana/dashboards/n8n-basic-dashboard.json
```

### No metrics from n8n
```yaml
environment:
  - N8N_METRICS=true
```

---

## Related Documents

- **Monitoring Implementation:** [EXECUTION_MONITORING_FIXES.md](../../EXECUTION_MONITORING_FIXES.md)
- **Monitoring Checklist:** [MONITORING_IMPLEMENTATION_CHECKLIST.md](../../MONITORING_IMPLEMENTATION_CHECKLIST.md)
- **Full Observability Guide:** [MONITORING_AND_OBSERVABILITY_GUIDE.md](../../MONITORING_AND_OBSERVABILITY_GUIDE.md)
- **Performance Guide:** [PERFORMANCE_OPTIMIZATION_GUIDE.md](../../PERFORMANCE_OPTIMIZATION_GUIDE.md)
- **Monitoring Setup Runbook:** [runbooks/RB004-monitoring-setup.md](runbooks/RB004-monitoring-setup.md)
