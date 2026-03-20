# Runbook: RB004 - Monitoring Setup

**Purpose:** Set up and configure monitoring for n8n workflows  
**Frequency:** Initial setup + monthly verification  
**Owner:** DevOps Team  
**Last Updated:** March 19, 2026

---

## Prerequisites

- [ ] Access to monitoring system (Grafana/Datadog)
- [ ] Access to n8n API
- [ ] Slack webhook URL for alerts
- [ ] PagerDuty integration (for P0 alerts)

---

## Step 1: n8n API Access Setup

### Generate API Key

1. Log in to n8n: https://n8n.zaplit.com
2. Settings → API
3. Generate new API key
4. Store securely: `N8N_API_KEY`

### Test API Access

```bash
curl -X GET \
  "https://n8n.zaplit.com/api/v1/workflows" \
  -H "X-N8N-API-KEY: ${N8N_API_KEY}"
```

---

## Step 2: Create Monitoring Workflow

### Workflow: Production Monitor

Create a new workflow that runs every 5 minutes:

```json
{
  "name": "Production Monitoring",
  "nodes": [
    {
      "type": "n8n-nodes-base.scheduleTrigger",
      "name": "Every 5 Minutes",
      "parameters": {
        "rule": {
          "interval": [{ "field": "minutes", "minutesInterval": 5 }]
        }
      }
    },
    {
      "type": "n8n-nodes-base.httpRequest",
      "name": "Get Executions",
      "parameters": {
        "method": "GET",
        "url": "https://n8n.zaplit.com/api/v1/executions",
        "authentication": "genericCredentialType",
        "genericAuthType": "httpHeaderAuth",
        "sendQueryParams": true,
        "queryParams": {
          "parameters": [
            { "name": "limit", "value": "100" }
          ]
        }
      }
    },
    {
      "type": "n8n-nodes-base.code",
      "name": "Calculate Metrics",
      "parameters": {
        "jsCode": "const executions = $input.first().json.data;\nconst now = Date.now();\nconst fiveMinutesAgo = now - (5 * 60 * 1000);\n\nconst recent = executions.filter(e => {\n  const startedAt = new Date(e.startedAt).getTime();\n  return startedAt >= fiveMinutesAgo;\n});\n\nconst successful = recent.filter(e => e.finished && !e.stoppedAt).length;\nconst failed = recent.filter(e => !e.finished || e.stoppedAt).length;\nconst total = recent.length;\nconst successRate = total > 0 ? (successful / total) * 100 : 100;\n\nreturn [{\n  json: {\n    timestamp: new Date().toISOString(),\n    total,\n    successful,\n    failed,\n    successRate: successRate.toFixed(2),\n    alert: successRate < 95 || failed > 5\n  }\n}];"
      }
    },
    {
      "type": "n8n-nodes-base.if",
      "name": "Check Threshold",
      "parameters": {
        "conditions": {
          "options": {
            "leftValue": "={{ $json.alert }}",
            "operator": { "type": "boolean", "operation": "equals" },
            "rightValue": true
          }
        }
      }
    },
    {
      "type": "n8n-nodes-base.slack",
      "name": "Send Alert",
      "parameters": {
        "channel": "#incidents",
        "text": "🚨 n8n Alert: Success rate {{ $json.successRate }}% ({{ $json.failed }} failures in 5 min)"
      }
    }
  ]
}
```

---

## Step 3: Grafana Dashboard Setup

### Dashboard JSON

```json
{
  "dashboard": {
    "title": "n8n Production",
    "tags": ["n8n", "production"],
    "timezone": "utc",
    "panels": [
      {
        "id": 1,
        "title": "Success Rate",
        "type": "stat",
        "targets": [{
          "expr": "sum(rate(n8n_execution_success_total[5m])) / sum(rate(n8n_execution_total[5m])) * 100"
        }],
        "fieldConfig": {
          "defaults": {
            "unit": "percent",
            "min": 0,
            "max": 100,
            "thresholds": {
              "steps": [
                { "color": "red", "value": 0 },
                { "color": "yellow", "value": 95 },
                { "color": "green", "value": 99 }
              ]
            }
          }
        }
      },
      {
        "id": 2,
        "title": "Executions Per Minute",
        "type": "graph",
        "targets": [{
          "expr": "sum(rate(n8n_execution_total[1m])) by (workflow_name)"
        }]
      },
      {
        "id": 3,
        "title": "Error Rate",
        "type": "graph",
        "targets": [{
          "expr": "sum(rate(n8n_execution_failed_total[5m]))"
        }]
      },
      {
        "id": 4,
        "title": "Response Time (p95)",
        "type": "graph",
        "targets": [{
          "expr": "histogram_quantile(0.95, sum(rate(n8n_execution_duration_seconds_bucket[5m])) by (le))"
        }]
      }
    ]
  }
}
```

---

## Step 4: Alert Configuration

### Slack Alerts

Create webhook in Slack:
1. Go to: https://api.slack.com/messaging/webhooks
2. Create app → Incoming Webhooks
3. Copy webhook URL
4. Store in n8n credential: `Slack-Production-Alerts`

### PagerDuty Integration (P0 Only)

1. Create integration in PagerDuty
2. Get integration key
3. Create webhook workflow for critical alerts

```javascript
// PagerDuty trigger node
{
  "routing_key": "{{ $env.PAGERDUTY_ROUTING_KEY }}",
  "event_action": "trigger",
  "payload": {
    "summary": "n8n Critical: {{ $json.error_message }}",
    "severity": "critical",
    "source": "n8n-production",
    "custom_details": {
      "workflow": "{{ $json.workflow_name }}",
      "error_count": "{{ $json.failed_count }}"
    }
  }
}
```

---

## Step 5: Log Aggregation

### Filebeat Configuration

```yaml
# /etc/filebeat/filebeat.yml
filebeat.inputs:
- type: log
  enabled: true
  paths:
    - /var/log/n8n/*.log
  fields:
    service: n8n
    environment: production
  fields_under_root: true
  multiline.pattern: '^\d{4}-\d{2}-\d{2}'
  multiline.negate: true
  multiline.match: after

output.elasticsearch:
  hosts: ["https://elasticsearch.zaplit.com:9200"]
  index: "n8n-logs-%{+yyyy.MM.dd}"

# Start filebeat
sudo systemctl enable filebeat
sudo systemctl start filebeat
```

---

## Verification Checklist

- [ ] n8n API key generated and tested
- [ ] Monitoring workflow created and activated
- [ ] Grafana dashboard imported
- [ ] Slack webhook configured
- [ ] Test alert sent successfully
- [ ] PagerDuty integration tested (if applicable)
- [ ] Log forwarding configured
- [ ] Documentation updated

---

## Monthly Verification

First Monday of each month:

1. [ ] Verify monitoring workflow is active
2. [ ] Check Grafana dashboard loads correctly
3. [ ] Send test alert to Slack
4. [ ] Review last month's alert history
5. [ ] Update alert thresholds if needed
6. [ ] Verify log retention policy

---

## Alert Thresholds

| Metric | Warning | Critical | Response |
|--------|---------|----------|----------|
| Success Rate | < 99% | < 95% | Slack / PagerDuty |
| Error Rate | > 1% | > 5% | Slack / PagerDuty |
| Response Time | > 5s | > 10s | Slack |
| Failed Executions | > 3/5min | > 10/5min | Slack / PagerDuty |

---

## Related Documentation

- [Production Deployment Guide](../N8N_PRODUCTION_DEPLOYMENT_GUIDE.md)
- [RB002: Incident Response](./RB002-incident-response.md)
