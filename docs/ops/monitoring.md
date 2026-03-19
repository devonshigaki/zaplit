# Monitoring & Alerts

> **Production observability for Zaplit stack**

## Overview

| Component | Tool | Metrics |
|-----------|------|---------|
| Cloud Run | Cloud Monitoring | Requests, latency, errors |
| n8n | n8n metrics + Cloud Monitoring | Executions, failures |
| Twenty CRM | Cloud Monitoring | API health |
| Forms | Custom metrics | Submissions, validation failures |

## Cloud Run Monitoring

### Key Metrics

| Metric | Warning | Critical |
|--------|---------|----------|
| Request Count | - | - |
| Request Latency (p99) | > 500ms | > 1000ms |
| Container CPU | > 60% | > 80% |
| Container Memory | > 70% | > 85% |
| 5xx Errors | > 1% | > 5% |
| Cold Starts | > 2s | > 5s |

### Alerting Policies

```bash
# High latency alert
gcloud alpha monitoring policies create \
  --policy="displayName='High Latency',conditions=[{displayName='p99 latency > 500ms',conditionThreshold={filter='resource.type=\"cloud_run_revision\" AND metric.type=\"run.googleapis.com/request_latencies\"',aggregations=[{alignmentPeriod=300s,perSeriesAligner=ALIGN_PERCENTILE_99}],comparison=COMPARISON_GT,thresholdValue=500,duration=300s}}],alertStrategy=notificationRateLimit{period=3600s},severity=WARNING"

# High error rate alert
gcloud alpha monitoring policies create \
  --policy="displayName='High Error Rate',conditions=[{displayName='5xx error rate > 1%',conditionThreshold={filter='resource.type=\"cloud_run_revision\" AND metric.type=\"run.googleapis.com/request_count\" AND metric.labels.response_code_class=\"5xx\"',aggregations=[{alignmentPeriod=300s,perSeriesAligner=ALIGN_FRACTION_TRUE}],comparison=COMPARISON_GT,thresholdValue=0.01,duration=300s}}],severity=CRITICAL"
```

## n8n Monitoring

### Execution Metrics

Enable in n8n: **Settings** → **Metrics**

Key metrics to track:
- `n8n_executions_total` - Total executions
- `n8n_executions_failed` - Failed executions
- `n8n_webhook_calls_received` - Webhook hits
- `n8n_webhook_calls_answered` - Successful responses

### Prometheus + Grafana Setup

```yaml
# docker-compose.monitoring.yml
version: '3'
services:
  prometheus:
    image: prom/prometheus
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
    ports:
      - "9090:9090"
  
  grafana:
    image: grafana/grafana
    ports:
      - "3000:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
```

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'n8n'
    static_configs:
      - targets: ['n8n-server:5678']
    metrics_path: /metrics
```

### n8n Health Check

```bash
# Health endpoint
curl https://n8n.yourdomain.com/healthz

# Expected: {"status":"ok"}
```

## Form Submission Monitoring

### Custom Metrics

Track in application:

```typescript
// app/api/submit-form/route.ts
import { google } from 'googleapis';

const monitoring = google.monitoring('v3');

async function recordSubmission(formType: string, success: boolean) {
  await monitoring.projects.timeSeries.create({
    name: 'projects/zaplit-website-prod',
    requestBody: {
      timeSeries: [{
        metric: {
          type: 'custom.googleapis.com/form/submissions',
          labels: { form_type: formType, status: success ? 'success' : 'failure' }
        },
        points: [{
          interval: { endTime: { seconds: Date.now() / 1000 } },
          value: { int64Value: 1 }
        }]
      }]
    }
  });
}
```

## Log-Based Alerts

### Form Submission Failures

```
resource.type="cloud_run_revision"
jsonPayload.message=~"form submission failed|webhook error"
severity>=WARNING
```

### High Rate Limiting

```
resource.type="cloud_run_revision"
jsonPayload.message=~"rate limit exceeded"
-- Occurs more than 10 times in 5 minutes
```

## Dashboards

### Cloud Run Dashboard

Create in Cloud Monitoring:

1. **Request Overview**
   - Request count (grouped by response code)
   - Latency percentiles (p50, p95, p99)
   
2. **Resource Utilization**
   - Container CPU utilization
   - Container memory utilization
   - Instance count

3. **Error Analysis**
   - 5xx error rate
   - Error log entries

### n8n Dashboard (Grafana)

Import dashboard ID: `14381` (n8n official)

Key panels:
- Executions per hour
- Success rate
- Average execution time
- Failed workflows

## Alert Routing

### Notification Channels

```bash
# Email
gcloud alpha monitoring channels create \
  --channel-content="type=email,labels.email_address=alerts@zaplit.com"

# Slack (via webhook)
gcloud alpha monitoring channels create \
  --channel-content="type=slack,labels.channel_name=#alerts,auth_token=your-webhook-url"
```

### Severity Levels

| Severity | Response Time | Channels |
|----------|---------------|----------|
| CRITICAL | 5 minutes | PagerDuty, Email, Slack |
| WARNING | 1 hour | Email, Slack |
| INFO | 24 hours | Email digest |

## Runbooks

### High Latency

1. Check Cloud Run metrics for spikes
2. Review recent deployments
3. Check n8n response times
4. Scale up if needed:
   ```bash
   gcloud run services update zaplit-com --min-instances=3
   ```

### Form Submissions Failing

1. Check n8n webhook logs
2. Verify webhook secret
3. Test webhook manually:
   ```bash
   curl -X POST https://n8n.yourdomain.com/webhook/contact -H "X-Webhook-Secret: $SECRET"
   ```
4. Check Twenty CRM API health

---

**Related**: [Production Deployment](./production-deployment.md)
