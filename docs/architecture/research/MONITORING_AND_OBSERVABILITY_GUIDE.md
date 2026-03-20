# Monitoring and Observability Guide: n8n Consultation Form to CRM

**Version:** 1.0  
**Last Updated:** March 19, 2026  
**Owner:** Site Reliability Engineering Team  
**Scope:** Production n8n workflows, webhook endpoints, Twenty CRM integration

---

## Executive Summary

This guide provides comprehensive monitoring and observability strategies for the **Consultation Form to CRM** workflow—a critical customer-facing integration requiring **99% uptime** and **<5s response time**.

### Key Objectives

| Objective | Target | Measurement |
|-----------|--------|-------------|
| Uptime | 99% | Monthly availability |
| Response Time (p99) | <5s | End-to-end webhook response |
| Error Rate | <1% | Failed executions / total executions |
| Alert Response | <5 min | P0 incident acknowledgment |
| Recovery Time | <15 min | P0 incident resolution |

---

## Table of Contents

1. [Key Metrics to Monitor](#1-key-metrics-to-monitor)
2. [Alerting Strategy](#2-alerting-strategy)
3. [Dashboard Design](#3-dashboard-design)
4. [Log Analysis](#4-log-analysis)
5. [Health Checks](#5-health-checks)
6. [Implementation Examples](#6-implementation-examples)
7. [Runbooks and Procedures](#7-runbooks-and-procedures)

---

## 1. Key Metrics to Monitor

### 1.1 Success/Failure Rates

#### Metric Definitions

| Metric | Description | Collection Method | Granularity |
|--------|-------------|-------------------|-------------|
| `n8n_execution_total` | Total workflow executions | n8n API / Prometheus | 1 minute |
| `n8n_execution_success_total` | Successful executions | n8n API / Prometheus | 1 minute |
| `n8n_execution_failed_total` | Failed executions | n8n API / Prometheus | 1 minute |
| `workflow_success_rate` | Success percentage | Calculated: success/total | 5 minutes |

#### Target Thresholds

```
Success Rate SLOs:
├── Target:     ≥ 99% (monthly)
├── Warning:    < 99% (rolling 5min)
├── Critical:   < 95% (rolling 5min)
└── Emergency:  < 90% (immediate page)
```

#### Collection Implementation

**Via n8n API (for custom monitoring):**

```bash
# Get recent executions
curl -X GET "https://n8n.zaplit.com/api/v1/executions?limit=100" \
  -H "X-N8N-API-KEY: ${N8N_API_KEY}"
```

**Via Prometheus (if metrics enabled):**

```promql
# Success rate over 5 minutes
sum(rate(n8n_execution_success_total[5m])) / sum(rate(n8n_execution_total[5m])) * 100

# Failed executions per minute
sum(rate(n8n_execution_failed_total[5m])) by (workflow_name)
```

---

### 1.2 Response Time Percentiles

#### Metric Definitions

| Percentile | Target | Description |
|------------|--------|-------------|
| p50 (Median) | <2s | Typical user experience |
| p95 | <5s | SLA threshold |
| p99 | <8s | Worst-case acceptable |
| p99.9 | <15s | Investigation threshold |

#### Collection Points

```
Response Time Measurement Points:
├── Client → Webhook:       Total end-to-end latency
├── Webhook → Process:      n8n internal processing
├── n8n → CRM API:          External API latency
└── CRM API → Response:     CRM processing time
```

#### PromQL Queries

```promql
# p95 response time
histogram_quantile(0.95, 
  sum(rate(n8n_execution_duration_seconds_bucket[5m])) by (le)
)

# p99 response time
histogram_quantile(0.99, 
  sum(rate(n8n_execution_duration_seconds_bucket[5m])) by (le)
)

# Response time by workflow
histogram_quantile(0.95,
  sum(rate(n8n_execution_duration_seconds_bucket[5m])) 
  by (le, workflow_name)
)
```

---

### 1.3 CRM API Latency

#### Metric Definitions

| Metric | Target | Critical Threshold |
|--------|--------|-------------------|
| `crm_api_response_time` | <2s | >5s |
| `crm_api_error_rate` | <0.1% | >1% |
| `crm_api_rate_limit_hits` | 0 | >0 |

#### Collection Method

**n8n HTTP Request Node Metrics:**

```javascript
// Add to workflow for custom timing
const startTime = Date.now();

// ... HTTP Request to CRM ...

const latency = Date.now() - startTime;

// Log to monitoring system
$execution.customData = {
  crm_latency_ms: latency,
  crm_status: $node["Create Person"].json.statusCode
};
```

**Via Cloud Monitoring (GCP):**

```yaml
# uptime check configuration
uptime_checks:
  - name: crm-api-health
    target: https://crm.zaplit.com/healthz
    period: 60s
    timeout: 10s
```

---

### 1.4 Error Types and Frequencies

#### Error Classification

| Category | Error Type | Severity | Example |
|----------|------------|----------|---------|
| **Authentication** | 401/403 | Critical | "Invalid API key" |
| **Validation** | 400/422 | Warning | "Invalid email format" |
| **Rate Limiting** | 429 | Warning | "Too many requests" |
| **Server Error** | 500/502/503 | Critical | "CRM unavailable" |
| **Timeout** | 504/ETIMEDOUT | Warning | "Request timeout" |
| **Network** | ECONNREFUSED | Critical | "Cannot connect" |

#### Error Tracking Query

```promql
# Error rate by type
sum(rate(n8n_execution_failed_total[5m])) by (error_type)

# Top error patterns
topk(5, 
  sum(increase(n8n_execution_failed_total[1h])) by (error_message)
)
```

---

### 1.5 Throughput (Submissions Per Minute)

#### Metric Definitions

| Metric | Description | Normal Range | Spike Threshold |
|--------|-------------|--------------|-----------------|
| `submissions_per_minute` | Form submissions | 0-10 | >50 |
| `concurrent_executions` | Active workflows | 0-5 | >20 |
| `queue_depth` | Pending executions | 0 | >10 |

#### Throughput Monitoring

```promql
# Submissions per minute by workflow
sum(rate(n8n_execution_total[1m])) by (workflow_name)

# Detect traffic spikes (compare to 1h average)
sum(rate(n8n_execution_total[5m])) > 
  3 * avg_over_time(sum(rate(n8n_execution_total[5m]))[1h:])
```

---

## 2. Alerting Strategy

### 2.1 Alert Severity Levels

| Level | Name | Response Time | Notification Channel | Use Case |
|-------|------|---------------|---------------------|----------|
| P0 | Critical | 5 minutes | PagerDuty + SMS + Slack #incidents | Service down, >10% failure rate |
| P1 | High | 15 minutes | Slack #incidents + Email | Degraded performance, >5% failure rate |
| P2 | Medium | 1 hour | Slack #engineering | Minor issues, workarounds available |
| P3 | Low | 4 hours | Daily digest | Cosmetic issues, no immediate impact |

### 2.2 Alert Thresholds Matrix

| Metric | Warning | Critical | Emergency | Duration |
|--------|---------|----------|-----------|----------|
| **Success Rate** | < 99% | < 95% | < 90% | 5 minutes |
| **Error Rate** | > 1% | > 5% | > 10% | 5 minutes |
| **Response Time (p95)** | > 5s | > 10s | > 15s | 5 minutes |
| **Failed Executions** | > 3/5min | > 10/5min | > 20/5min | 5 minutes |
| **CRM API Latency** | > 2s | > 5s | > 10s | 3 minutes |
| **CRM API Errors** | > 0.1% | > 1% | > 5% | 5 minutes |

### 2.3 Notification Routing

```yaml
# Alert routing configuration
notification_routes:
  p0_critical:
    channels:
      - pagerduty:
          service_key: "${PAGERDUTY_SERVICE_KEY}"
          urgency: "high"
      - slack:
          webhook: "${SLACK_WEBHOOK_INCIDENTS}"
          channel: "#incidents"
          mention: "@channel @oncall-sre"
      - sms:
          numbers: ["${ONCALL_PHONE_PRIMARY}", "${ONCALL_PHONE_SECONDARY}"]
    
  p1_high:
    channels:
      - slack:
          webhook: "${SLACK_WEBHOOK_INCIDENTS}"
          channel: "#incidents"
          mention: "@oncall-sre"
      - email:
          to: ["sre-team@zaplit.com"]
          
  p2_medium:
    channels:
      - slack:
          webhook: "${SLACK_WEBHOOK_ENGINEERING}"
          channel: "#engineering"
          
  p3_low:
    channels:
      - slack:
          webhook: "${SLACK_WEBHOOK_ENGINEERING}"
          channel: "#engineering"
    digest: daily
```

### 2.4 Escalation Procedures

```
Escalation Timeline (P0 Incident):

T+0min    Alert triggered (P0 conditions met)
T+5min    L1 On-call engineer acknowledges
          └─ If no acknowledgment → Escalate to L2
T+20min   L2 Senior Engineer engaged
          └─ If unresolved → Escalate to L3
T+50min   L3 Engineering Manager engaged
          └─ If unresolved → Escalate to L4
T+80min   L4 CTO engaged

Post-Resolution:
T+24h     Post-incident review due
T+1week   Action items completion deadline
```

### 2.5 Alert Fatigue Prevention

#### Grouping Rules

```yaml
# Group similar alerts to prevent spam
grouping:
  - name: "workflow_failures"
    match:
      - alertname: "N8nWorkflowFailed"
    group_by: ["workflow_name", "error_type"]
    group_wait: 30s
    group_interval: 5m
    repeat_interval: 4h
    
  - name: "crm_errors"
    match:
      - alertname: "CRMAPIError"
    group_by: ["error_code"]
    group_wait: 1m
    group_interval: 10m
    repeat_interval: 2h
```

#### Auto-Resolution

```yaml
# Auto-resolve alerts when conditions normalize
auto_resolve:
  - alert: "HighErrorRate"
    resolve_after: "10m"  # Must be normal for 10 minutes
    
  - alert: "SlowResponseTime"
    resolve_after: "15m"
```

### 2.6 Sample Alert Configurations

#### Grafana Alert (Success Rate)

```json
{
  "alert": {
    "name": "Consultation Form - Low Success Rate",
    "message": "Success rate is {{ $values.B }}% (below 95% threshold)",
    "condition": {
      "type": "query",
      "query": {
        "expr": "sum(rate(n8n_execution_success_total[5m])) / sum(rate(n8n_execution_total[5m])) * 100",
        "conditions": [
          {
            "evaluator": {"type": "lt", "params": [95]},
            "operator": {"type": "and"},
            "reducer": {"type": "avg"}
          }
        ]
      }
    },
    "labels": {
      "severity": "critical",
      "team": "sre",
      "service": "n8n"
    },
    "annotations": {
      "summary": "n8n workflow success rate is critically low",
      "runbook_url": "https://wiki.zaplit.com/runbooks/n8n-low-success-rate"
    }
  }
}
```

#### Google Cloud Monitoring Alert

```yaml
# gcp-deployment/hestia/terraform/monitoring.tf
resource "google_monitoring_alert_policy" "n8n_success_rate" {
  display_name = "n8n Consultation Form - Low Success Rate"
  combiner     = "OR"

  conditions {
    display_name = "Success rate below 95%"
    
    condition_threshold {
      filter          = <<-EOT
        resource.type="gce_instance"
        metric.type="custom.googleapis.com/n8n/success_rate"
        metadata.user_labels.service="n8n"
      EOT
      duration        = "300s"
      comparison      = "COMPARISON_LT"
      threshold_value = 95
      
      aggregations {
        alignment_period   = "300s"
        per_series_aligner = "ALIGN_MEAN"
      }
    }
  }
  
  notification_channels = var.alert_notification_channels
  severity              = "CRITICAL"
  
  documentation {
    content   = <<-EOT
      # n8n Success Rate Alert
      
      ## Quick Check
      1. Check n8n executions: https://n8n.zaplit.com/executions
      2. Check CRM API status: https://crm.zaplit.com/healthz
      3. Review recent deployments
      
      ## Runbook
      See: [RB002 - Incident Response](./runbooks/RB002-incident-response.md)
    EOT
    mime_type = "text/markdown"
  }
  
  alert_strategy {
    auto_close = "86400s"
  }
}
```

---

## 3. Dashboard Design

### 3.1 Dashboard Architecture

```
Dashboard Hierarchy:
├── Executive Summary (High-level KPIs)
├── Operations Center (Real-time monitoring)
├── Technical Deep-Dive (Detailed metrics)
└── Post-Incident Analysis (Historical views)
```

### 3.2 Executive Summary Dashboard

**Target Audience:** C-Suite, Product Managers  
**Refresh Rate:** 5 minutes  
**Time Range:** Last 24 hours / Last 7 days

#### Key Widgets

| Widget | Metric | Visualization | Threshold |
|--------|--------|---------------|-----------|
| **SLA Status** | Uptime % | Large number gauge | Green: ≥99%, Yellow: 95-99%, Red: <95% |
| **Form Submissions** | Total submissions | Counter with trend | N/A |
| **Avg Response Time** | p50 latency | Single value | Green: <2s, Yellow: 2-5s, Red: >5s |
| **Conversion Funnel** | Submitted → CRM Created | Funnel chart | Track drop-off |
| **24h Trend** | Success rate over time | Sparkline | Show anomalies |

#### Dashboard Layout

```
┌─────────────────────────────────────────────────────────────┐
│  EXECUTIVE SUMMARY - Consultation Form Integration          │
├──────────────┬──────────────┬──────────────┬────────────────┤
│              │              │              │                │
│   99.7%      │    1,247     │    1.8s      │    99.2%       │
│   UPTIME     │  SUBMISSIONS │  AVG LATENCY │  SUCCESS RATE  │
│   ↑ 0.2%     │   ↑ 12%      │   ↓ 0.3s     │   ↑ 0.5%       │
│              │              │              │                │
├──────────────┴──────────────┴──────────────┴────────────────┤
│  SUCCESS RATE (24H)                                         │
│  ████████████████████████████████████████████████████████  │
│  100% ┤                                                     │
│   95% ┤   ╭─╮                                               │
│   90% ┤  ╱   ╲    ╭──╮                                      │
│       └───────────────────────────────────────────────────  │
│       00:00  06:00  12:00  18:00  00:00                    │
├─────────────────────────────────────────────────────────────┤
│  CONVERSION FUNNEL                                          │
│  Form Submitted ████████████████████ 1,247 (100%)           │
│  Webhook Received ██████████████████ 1,245 (99.8%)          │
│  Person Created ████████████████     1,243 (99.6%)          │
│  Company Created ███████████████     1,243 (99.6%)          │
│  Note Created ████████████████       1,240 (99.4%)          │
└─────────────────────────────────────────────────────────────┘
```

---

### 3.3 Operations Center Dashboard

**Target Audience:** SRE Team, On-call Engineers  
**Refresh Rate:** 10 seconds  
**Time Range:** Last 1 hour / Real-time

#### Key Widgets

| Widget | Metric | Visualization |
|--------|--------|---------------|
| **Live Executions** | Active workflows | Real-time counter |
| **Success/Failure Gauge** | Current success rate | Gauge with color zones |
| **Error Log Stream** | Recent errors | Live scrolling table |
| **Latency Heatmap** | p50/p95/p99 over time | Heatmap |
| **CRM API Status** | External dependency health | Status indicators |
| **Alert History** | Recent alerts | Timeline |

#### Dashboard Layout

```
┌─────────────────────────────────────────────────────────────┐
│  OPERATIONS CENTER - Real-Time Monitoring                   │
│  Auto-refresh: 10s │ Last updated: 14:32:05 UTC              │
├──────────────┬──────────────┬───────────────────────────────┤
│              │              │                               │
│   ACTIVE: 3  │   98.5%      │  [========              ]     │
│              │              │   p50: 1.2s                   │
│              │              │   p95: 4.8s ⚠️                │
│              │              │   p99: 8.2s                   │
├──────────────┴──────────────┴───────────────────────────────┤
│  DEPENDENCY HEALTH                                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │ n8n         │  │ CRM API     │  │ Webhook     │         │
│  │ 🟢 Healthy  │  │ 🟢 45ms     │  │ 🟢 Active   │         │
│  │ Uptime: 99d │  │ Errors: 0   │  │ Rate: 2/min │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
├─────────────────────────────────────────────────────────────┤
│  RECENT ERRORS (Last 30 minutes)                            │
│  Time      │ Workflow    │ Error          │ Count │ Status  │
│  ─────────────────────────────────────────────────────────  │
│  14:31:22  │ Consultation│ 429 Rate Limit │   3   │ Active  │
│  14:28:15  │ Consultation│ Timeout        │   1   │ Resolved│
│  14:15:03  │ Contact     │ 500 Server Err │   2   │ Resolved│
└─────────────────────────────────────────────────────────────┘
```

---

### 3.4 Technical Deep-Dive Dashboard

**Target Audience:** Backend Engineers, Performance Engineers  
**Refresh Rate:** 1 minute  
**Time Range:** Configurable (1h to 30d)

#### Detailed Metrics Panels

```
┌─────────────────────────────────────────────────────────────┐
│  TECHNICAL DEEP-DIVE - Performance Analysis                 │
├─────────────────────────────────────────────────────────────┤
│  RESPONSE TIME DISTRIBUTION                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  <1s ████████████ 45%                               │   │
│  │  1-2s ████████ 30%                                  │   │
│  │  2-5s █████ 18%                                     │   │
│  │  5-10s ██ 5%                                        │   │
│  │  >10s █ 2%                                          │   │
│  └─────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────┤
│  NODE-LEVEL PERFORMANCE                                     │
│  Node            │ Avg Time │ p95     │ Errors │ Calls    │
│  ─────────────────────────────────────────────────────────  │
│  Webhook         │ 12ms     │ 25ms    │ 0      │ 1,247    │
│  Process Data    │ 45ms     │ 120ms   │ 0      │ 1,247    │
│  Create Person   │ 890ms    │ 2,100ms │ 4      │ 1,247    │
│  Create Company  │ 780ms    │ 1,800ms │ 3      │ 1,247    │
│  Create Note     │ 650ms    │ 1,500ms │ 2      │ 1,243    │
├─────────────────────────────────────────────────────────────┤
│  ERROR BREAKDOWN                                            │
│  Error Type           │ Count │ % of Total │ Trend          │
│  ─────────────────────────────────────────────────────────  │
│  CRM Timeout          │ 12    │ 0.96%      │ ↗ Increasing   │
│  Rate Limited (429)   │ 8     │ 0.64%      │ → Stable       │
│  Validation Error     │ 3     │ 0.24%      │ ↘ Decreasing   │
│  Auth Error (401)     │ 1     │ 0.08%      │ → Stable       │
└─────────────────────────────────────────────────────────────┘
```

---

### 3.5 Grafana Dashboard JSON Export

```json
{
  "dashboard": {
    "title": "n8n Consultation Form - Production",
    "tags": ["n8n", "production", "consultation-form"],
    "timezone": "utc",
    "refresh": "10s",
    "panels": [
      {
        "id": 1,
        "title": "Success Rate (5min)",
        "type": "stat",
        "targets": [{
          "expr": "sum(rate(n8n_execution_success_total{workflow=\"consultation-form\"}[5m])) / sum(rate(n8n_execution_total{workflow=\"consultation-form\"}[5m])) * 100",
          "legendFormat": "Success Rate"
        }],
        "fieldConfig": {
          "defaults": {
            "unit": "percent",
            "min": 0,
            "max": 100,
            "thresholds": {
              "mode": "absolute",
              "steps": [
                { "color": "red", "value": 0 },
                { "color": "yellow", "value": 95 },
                { "color": "green", "value": 99 }
              ]
            }
          }
        },
        "options": {
          "graphMode": "area",
          "colorMode": "background"
        }
      },
      {
        "id": 2,
        "title": "Executions Per Minute",
        "type": "timeseries",
        "targets": [{
          "expr": "sum(rate(n8n_execution_total{workflow=\"consultation-form\"}[1m]))",
          "legendFormat": "Executions/min"
        }]
      },
      {
        "id": 3,
        "title": "Response Time Percentiles",
        "type": "timeseries",
        "targets": [
          {
            "expr": "histogram_quantile(0.50, sum(rate(n8n_execution_duration_seconds_bucket{workflow=\"consultation-form\"}[5m])) by (le))",
            "legendFormat": "p50"
          },
          {
            "expr": "histogram_quantile(0.95, sum(rate(n8n_execution_duration_seconds_bucket{workflow=\"consultation-form\"}[5m])) by (le))",
            "legendFormat": "p95"
          },
          {
            "expr": "histogram_quantile(0.99, sum(rate(n8n_execution_duration_seconds_bucket{workflow=\"consultation-form\"}[5m])) by (le))",
            "legendFormat": "p99"
          }
        ],
        "fieldConfig": {
          "defaults": {
            "unit": "s",
            "custom": {
              "drawStyle": "line",
              "lineInterpolation": "smooth"
            }
          }
        }
      },
      {
        "id": 4,
        "title": "CRM API Latency",
        "type": "timeseries",
        "targets": [{
          "expr": "avg(crm_api_response_time_seconds{api=\"twenty-crm\"})",
          "legendFormat": "API Latency"
        }]
      },
      {
        "id": 5,
        "title": "Error Rate by Type",
        "type": "piechart",
        "targets": [{
          "expr": "sum(rate(n8n_execution_failed_total{workflow=\"consultation-form\"}[1h])) by (error_type)",
          "legendFormat": "{{error_type}}"
        }]
      },
      {
        "id": 6,
        "title": "Active Executions",
        "type": "stat",
        "targets": [{
          "expr": "n8n_active_executions{workflow=\"consultation-form\"}",
          "legendFormat": "Active"
        }]
      }
    ],
    "time": {
      "from": "now-1h",
      "to": "now"
    }
  }
}
```

---

## 4. Log Analysis

### 4.1 Logging Strategy Overview

```
Log Levels:
├── ERROR   - Failures requiring immediate attention
├── WARN    - Anomalies that may indicate issues
├── INFO    - Normal operation milestones
├── DEBUG   - Detailed execution data (dev only)
└── AUDIT   - Compliance/security events
```

### 4.2 What to Log (GDPR-Compliant)

#### Required Fields

| Field | Purpose | Example |
|-------|---------|---------|
| `timestamp` | Event timing | `2026-03-19T14:32:05.123Z` |
| `level` | Severity | `INFO`, `ERROR` |
| `service` | Source service | `n8n`, `zaplit-com` |
| `workflow` | Workflow identifier | `consultation-form` |
| `execution_id` | Unique execution ID | `exec_abc123` |
| `message` | Human-readable description | "Person created successfully" |

#### Optional Context (Non-PII)

| Field | Purpose | Example |
|-------|---------|---------|
| `duration_ms` | Execution time | `1250` |
| `node_name` | n8n node identifier | `Create Person` |
| `status_code` | HTTP response code | `201` |
| `error_type` | Error classification | `timeout`, `auth` |
| `retry_count` | Number of retries | `2` |
| `source_ip_hash` | Hashed client IP | `a3f2b...` (SHA-256) |

### 4.3 What NOT to Log (GDPR Compliance)

**Never log the following PII:**

| Field | Reason | Alternative |
|-------|--------|-------------|
| Full name | Personal identification | Log only first name initial: "J. Doe" |
| Email address | Contact information | Hash or use ID reference |
| Phone number | Contact information | Omit entirely |
| IP address | Location tracking | Hash with salt |
| Form message content | User input | Reference ID only |
| Company name | Business identification | Reference ID only |

### 4.4 Structured Log Format

#### JSON Log Schema

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
    "crm_person_id": "person_uuid_123",
    "retry_count": 0
  },
  "context": {
    "environment": "production",
    "version": "1.2.3"
  }
}
```

#### Error Log Format

```json
{
  "timestamp": "2026-03-19T14:35:22.456Z",
  "level": "ERROR",
  "service": "n8n",
  "workflow": "consultation-form",
  "execution_id": "exec_e5f6g7h8",
  "trace_id": "trace_m3n4o5p6",
  "node": "Create Person",
  "message": "Failed to create person in CRM",
  "error": {
    "type": "CRM_API_ERROR",
    "code": "RATE_LIMITED",
    "status_code": 429,
    "message": "Too many requests",
    "retryable": true,
    "retry_after": 60
  },
  "metadata": {
    "duration_ms": 2450,
    "attempt": 3,
    "crm_endpoint": "/rest/people"
  },
  "context": {
    "environment": "production",
    "version": "1.2.3"
  }
}
```

### 4.5 Log Aggregation Strategy

#### Architecture

```
Log Flow:
n8n Instance → Filebeat → Logstash → Elasticsearch → Kibana
                ↓
              Parse & Enrich
                ↓
           Structured Storage
                ↓
         Dashboards & Alerts
```

#### Filebeat Configuration

```yaml
# /etc/filebeat/filebeat.yml
filebeat.inputs:
- type: log
  enabled: true
  paths:
    - /var/log/n8n/*.log
    - /var/log/n8n/workflows/*.json
  fields:
    service: n8n
    environment: production
  fields_under_root: true
  
  # Parse JSON logs
  json.keys_under_root: true
  json.add_error_key: true
  json.message_key: message
  
  # Handle multiline stack traces
  multiline.pattern: '^\d{4}-\d{2}-\d{2}'
  multiline.negate: true
  multiline.match: after

# Logstash output for enrichment
output.logstash:
  hosts: ["logstash.zaplit.com:5044"]
  
# Or direct to Elasticsearch
output.elasticsearch:
  hosts: ["https://elasticsearch.zaplit.com:9200"]
  index: "n8n-logs-%{+yyyy.MM.dd}"
  
  # Index lifecycle management
  ilm.enabled: true
  ilm.rollover_alias: "n8n-logs"
  ilm.pattern: "{now/d}-000001"
```

#### Logstash Pipeline

```ruby
# /etc/logstash/conf.d/n8n.conf
input {
  beats {
    port => 5044
  }
}

filter {
  # Parse timestamp
  date {
    match => ["timestamp", "ISO8601"]
    target => "@timestamp"
  }
  
  # Add GeoIP for source IPs (if present)
  if [source_ip_hash] {
    mutate {
      add_field => { "geoip_available" => false }
    }
  }
  
  # Enrich with workflow metadata
  if [workflow] == "consultation-form" {
    mutate {
      add_field => { "criticality" => "high" }
    }
  }
  
  # Extract error patterns for alerting
  if [level] == "ERROR" {
    grok {
      match => {
        "message" => [
          "%{DATA:error_type}: %{GREEDYDATA:error_detail}",
          "Failed to %{DATA:action}"
        ]
      }
    }
  }
  
  # Remove sensitive fields (defense in depth)
  mutate {
    remove_field => ["email", "phone", "full_name", "message_content"]
  }
}

output {
  elasticsearch {
    hosts => ["elasticsearch:9200"]
    index => "n8n-%{+yyyy.MM.dd}"
  }
  
  # Send errors to separate index for faster queries
  if [level] == "ERROR" {
    elasticsearch {
      hosts => ["elasticsearch:9200"]
      index => "n8n-errors-%{+yyyy.MM.dd}"
    }
  }
}
```

### 4.6 Log Retention Policy

| Log Type | Retention | Storage Class | Rationale |
|----------|-----------|---------------|-----------|
| Application Logs (INFO+) | 30 days | Hot | Operational needs |
| Error Logs | 90 days | Warm | Debugging and compliance |
| Audit Logs | 2 years | Cold | GDPR compliance |
| Debug Logs | 7 days | Hot | Development only |
| Archived Logs | 1 year | Glacier | Legal requirements |

#### Elasticsearch ILM Policy

```json
{
  "policy": {
    "phases": {
      "hot": {
        "min_age": "0ms",
        "actions": {
          "rollover": {
            "max_primary_shard_size": "50gb",
            "max_age": "1d",
            "max_docs": 100000000
          }
        }
      },
      "warm": {
        "min_age": "7d",
        "actions": {
          "shrink": {
            "number_of_shards": 1
          },
          "forcemerge": {
            "max_num_segments": 1
          }
        }
      },
      "cold": {
        "min_age": "30d",
        "actions": {
          "freeze": {}
        }
      },
      "delete": {
        "min_age": "90d",
        "actions": {
          "delete": {}
        }
      }
    }
  }
}
```

---

## 5. Health Checks

### 5.1 Health Check Architecture

```
Health Check Layers:
├── Endpoint Health (Webhook availability)
├── Dependency Health (CRM API status)
├── Instance Health (n8n server)
└── Workflow Health (Execution capability)
```

### 5.2 Endpoint Health Monitoring

#### Webhook Health Check

```bash
#!/bin/bash
# scripts/health-check-webhook.sh

N8N_URL="${N8N_URL:-https://n8n.zaplit.com}"
WEBHOOK_PATH="${WEBHOOK_PATH:-/webhook/consultation}"

echo "Checking webhook endpoint..."

# OPTIONS check (CORS preflight)
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" \
  -X OPTIONS \
  -H "Origin: https://zaplit.com" \
  -H "Access-Control-Request-Method: POST" \
  "$N8N_URL$WEBHOOK_PATH" 2>/dev/null)

if [ "$RESPONSE" = "204" ] || [ "$RESPONSE" = "200" ]; then
  echo "✓ Webhook endpoint healthy (HTTP $RESPONSE)"
  exit 0
else
  echo "✗ Webhook endpoint unhealthy (HTTP $RESPONSE)"
  exit 1
fi
```

#### Full Integration Health Check

```bash
#!/bin/bash
#============================================================================
# Comprehensive Health Check for n8n-Twenty CRM Integration
#============================================================================

set -e

# Configuration
N8N_URL="${N8N_URL:-https://n8n.zaplit.com}"
TWENTY_URL="${TWENTY_URL:-https://crm.zaplit.com}"
WEBHOOK_PATH="${WEBHOOK_PATH:-/webhook/consultation}"
N8N_API_KEY="${N8N_API_KEY}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

EXIT_CODE=0

echo "======================================"
echo "Health Check: n8n-Twenty CRM Integration"
echo "======================================"
echo "Timestamp: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo ""

#----------------------------------------------------------------------------
# Check 1: n8n Instance Health
#----------------------------------------------------------------------------
echo -n "1. n8n instance health:     "
N8N_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" \
  "$N8N_URL/healthz" 2>/dev/null || echo "000")

if [ "$N8N_HEALTH" = "200" ]; then
  echo -e "${GREEN}✓ Healthy (HTTP 200)${NC}"
else
  echo -e "${RED}✗ Unhealthy (HTTP $N8N_HEALTH)${NC}"
  EXIT_CODE=1
fi

#----------------------------------------------------------------------------
# Check 2: n8n API Access
#----------------------------------------------------------------------------
echo -n "2. n8n API access:          "
if [ -n "$N8N_API_KEY" ]; then
  API_CHECK=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "X-N8N-API-KEY: $N8N_API_KEY" \
    "$N8N_URL/api/v1/workflows" 2>/dev/null || echo "000")
  
  if [ "$API_CHECK" = "200" ]; then
    echo -e "${GREEN}✓ Accessible (HTTP 200)${NC}"
  else
    echo -e "${RED}✗ Failed (HTTP $API_CHECK)${NC}"
    EXIT_CODE=1
  fi
else
  echo -e "${YELLOW}⚠ Skipped (no API key)${NC}"
fi

#----------------------------------------------------------------------------
# Check 3: Twenty CRM Health
#----------------------------------------------------------------------------
echo -n "3. Twenty CRM health:       "
TWENTY_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" \
  "$TWENTY_URL/healthz" 2>/dev/null || echo "000")

if [ "$TWENTY_HEALTH" = "200" ]; then
  echo -e "${GREEN}✓ Healthy (HTTP 200)${NC}"
else
  echo -e "${RED}✗ Unhealthy (HTTP $TWENTY_HEALTH)${NC}"
  EXIT_CODE=1
fi

#----------------------------------------------------------------------------
# Check 4: CRM API Response Time
#----------------------------------------------------------------------------
echo -n "4. CRM API latency:         "
START_TIME=$(date +%s%N)
CRM_API_CHECK=$(curl -s -o /dev/null -w "%{http_code}" \
  "$TWENTY_URL/rest/companies" \
  -H "Authorization: Bearer ${TWENTY_API_KEY:-test}" 2>/dev/null || echo "000")
END_TIME=$(date +%s%N)
LATENCY_MS=$(( (END_TIME - START_TIME) / 1000000 ))

if [ "$LATENCY_MS" -lt 2000 ]; then
  echo -e "${GREEN}✓ ${LATENCY_MS}ms${NC}"
elif [ "$LATENCY_MS" -lt 5000 ]; then
  echo -e "${YELLOW}⚠ ${LATENCY_MS}ms (elevated)${NC}"
else
  echo -e "${RED}✗ ${LATENCY_MS}ms (slow)${NC}"
  EXIT_CODE=1
fi

#----------------------------------------------------------------------------
# Check 5: Webhook Endpoint Availability
#----------------------------------------------------------------------------
echo -n "5. Webhook endpoint:        "
WEBHOOK_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" \
  -X OPTIONS "$N8N_URL$WEBHOOK_PATH" 2>/dev/null || echo "000")

if [ "$WEBHOOK_HEALTH" = "204" ] || [ "$WEBHOOK_HEALTH" = "200" ]; then
  echo -e "${GREEN}✓ Available (HTTP $WEBHOOK_HEALTH)${NC}"
else
  echo -e "${RED}✗ Unavailable (HTTP $WEBHOOK_HEALTH)${NC}"
  EXIT_CODE=1
fi

#----------------------------------------------------------------------------
# Check 6: Test Submission (Dry Run)
#----------------------------------------------------------------------------
echo -n "6. Test submission:         "
TEST_PAYLOAD=$(cat <<EOF
{
  "data": {
    "name": "Health Check",
    "email": "health_$(date +%s)@test.local",
    "company": "Health Corp",
    "role": "Test",
    "message": "Automated health check submission"
  },
  "metadata": {
    "source": "health-check",
    "submittedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  }
}
EOF
)

TEST_RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST "$N8N_URL$WEBHOOK_PATH" \
  -H "Content-Type: application/json" \
  -d "$TEST_PAYLOAD" 2>/dev/null || echo -e "\n000")

HTTP_CODE=$(echo "$TEST_RESPONSE" | tail -n1)
RESPONSE_BODY=$(echo "$TEST_RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
  echo -e "${GREEN}✓ Working (HTTP 200)${NC}"
else
  echo -e "${RED}✗ Failed (HTTP $HTTP_CODE)${NC}"
  EXIT_CODE=1
fi

#----------------------------------------------------------------------------
# Summary
#----------------------------------------------------------------------------
echo ""
echo "======================================"

if [ $EXIT_CODE -eq 0 ]; then
  echo -e "${GREEN}All health checks passed!${NC}"
else
  echo -e "${RED}Some health checks failed!${NC}"
fi

echo "======================================"
exit $EXIT_CODE
```

### 5.3 Dependency Health Monitoring

#### CRM API Health Monitor

```javascript
// n8n workflow: CRM Health Monitor
// Trigger: Schedule (every 5 minutes)

// Node 1: Check CRM Health
const healthCheck = {
  method: 'GET',
  url: '{{ $env.TWENTY_BASE_URL }}/healthz',
  timeout: 10000
};

// Node 2: Measure API Latency
const startTime = Date.now();
await $httpRequest({
  method: 'GET',
  url: '{{ $env.TWENTY_BASE_URL }}/rest/companies',
  headers: {
    'Authorization': 'Bearer {{ $credentials.twentyCRM.apiKey }}'
  }
});
const latency = Date.now() - startTime;

// Node 3: Log Health Metrics
return [{
  json: {
    timestamp: new Date().toISOString(),
    service: 'twenty-crm',
    healthy: $node["Check CRM Health"].json.statusCode === 200,
    latency_ms: latency,
    status_code: $node["Check CRM Health"].json.statusCode
  }
}];

// Node 4: Alert if Unhealthy
if (!$json.healthy || $json.latency_ms > 5000) {
  // Send alert to Slack/PagerDuty
}
```

### 5.4 n8n Instance Health

#### Built-in Health Endpoint

```bash
# n8n provides a health endpoint
GET https://n8n.zaplit.com/healthz

# Expected response:
# HTTP 200 - "OK"
```

#### Advanced Health Check

```javascript
// n8n workflow: Instance Health Check
// Trigger: Schedule (every 1 minute)

// Check memory usage
const memUsage = process.memoryUsage();
const memUsedPercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;

// Check active executions
const executions = await $httpRequest({
  method: 'GET',
  url: '{{ $env.N8N_BASE_URL }}/api/v1/executions',
  headers: {
    'X-N8N-API-KEY': '{{ $env.N8N_API_KEY }}'
  },
  qs: {
    limit: 1,
    status: 'running'
  }
});

const activeCount = executions.data?.length || 0;

// Check queue depth (if using queue mode)
const queueDepth = await $getQueueDepth(); // Custom function

return [{
  json: {
    timestamp: new Date().toISOString(),
    healthy: memUsedPercent < 90 && activeCount < 50,
    memory_used_percent: memUsedPercent.toFixed(2),
    active_executions: activeCount,
    queue_depth: queueDepth,
    uptime_seconds: process.uptime()
  }
}];
```

### 5.5 Automated Health Check Scripts

#### Kubernetes Liveness/Readiness Probes

```yaml
# kubernetes/health-probes.yaml
apiVersion: v1
kind: Pod
metadata:
  name: n8n
spec:
  containers:
  - name: n8n
    image: n8nio/n8n:latest
    livenessProbe:
      httpGet:
        path: /healthz
        port: 5678
      initialDelaySeconds: 30
      periodSeconds: 10
      timeoutSeconds: 5
      failureThreshold: 3
    readinessProbe:
      httpGet:
        path: /healthz
        port: 5678
      initialDelaySeconds: 5
      periodSeconds: 5
      timeoutSeconds: 3
      failureThreshold: 2
```

#### Cloud Run Health Check

```javascript
// zaplit-com/app/api/health/route.ts
import { NextResponse } from "next/server";

const N8N_WEBHOOK = process.env.N8N_WEBHOOK_CONSULTATION;

export async function GET() {
  const checks = {
    timestamp: new Date().toISOString(),
    status: "checking",
    version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || "unknown",
    uptime: process.uptime(),
    checks: {
      memory: checkMemory(),
      environment: checkEnvironment(),
      n8n_webhook: await checkN8NWebhook(),
    },
  };

  const allHealthy = Object.values(checks.checks)
    .every((c: any) => c.status === "ok" || c.status === "healthy");
  
  checks.status = allHealthy ? "healthy" : "unhealthy";

  return NextResponse.json(checks, { 
    status: allHealthy ? 200 : 503 
  });
}

async function checkN8NWebhook() {
  try {
    if (!N8N_WEBHOOK) {
      return { status: "unknown", reason: "URL not configured" };
    }
    
    const response = await fetch(N8N_WEBHOOK, {
      method: 'OPTIONS',
      signal: AbortSignal.timeout(5000)
    });
    
    return {
      status: response.ok ? "healthy" : "unhealthy",
      status_code: response.status,
      url: N8N_WEBHOOK.replace(/\/[^/]*$/, '/...') // Mask full path
    };
  } catch (error) {
    return {
      status: "unhealthy",
      error: error.message
    };
  }
}

function checkMemory() {
  const usage = process.memoryUsage();
  const maxMemory = 1024 * 1024 * 1024; // 1GB
  const usedPercent = (usage.heapUsed / maxMemory) * 100;
  
  return {
    status: usedPercent > 90 ? "warning" : "ok",
    usedPercent: Math.round(usedPercent * 100) / 100,
    heapUsed: Math.round(usage.heapUsed / 1024 / 1024) + "MB",
  };
}

function checkEnvironment() {
  const required = ["NODE_ENV"];
  const optional = ["N8N_WEBHOOK_CONSULTATION", "N8N_WEBHOOK_CONTACT"];
  
  const missing = required.filter(key => !process.env[key]);
  
  return {
    status: missing.length === 0 ? "ok" : "error",
    required: required.reduce((acc, key) => {
      acc[key] = process.env[key] ? "set" : "missing";
      return acc;
    }, {} as Record<string, string>),
    optional: optional.reduce((acc, key) => {
      acc[key] = process.env[key] ? "set" : "missing";
      return acc;
    }, {} as Record<string, string>),
  };
}
```

---

## 6. Implementation Examples

### 6.1 Complete Monitoring Workflow

```json
{
  "name": "Production Monitoring - Consultation Form",
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
            { "name": "limit", "value": "100" },
            { "name": "workflowId", "value": "consultation-form-id" }
          ]
        }
      }
    },
    {
      "type": "n8n-nodes-base.code",
      "name": "Calculate Metrics",
      "parameters": {
        "jsCode": "const executions = $input.first().json.data || [];\nconst now = Date.now();\nconst fiveMinutesAgo = now - (5 * 60 * 1000);\n\n// Filter recent executions\nconst recent = executions.filter(e => {\n  const startedAt = new Date(e.startedAt).getTime();\n  return startedAt >= fiveMinutesAgo;\n});\n\n// Calculate metrics\nconst successful = recent.filter(e => e.finished && !e.stoppedAt).length;\nconst failed = recent.filter(e => !e.finished || e.stoppedAt).length;\nconst total = recent.length;\nconst successRate = total > 0 ? (successful / total) * 100 : 100;\n\n// Calculate average duration\nconst avgDuration = recent.length > 0\n  ? recent.reduce((sum, e) => sum + (e.stoppedAt ? new Date(e.stoppedAt).getTime() - new Date(e.startedAt).getTime() : 0), 0) / recent.length\n  : 0;\n\nreturn [{\n  json: {\n    timestamp: new Date().toISOString(),\n    total,\n    successful,\n    failed,\n    successRate: parseFloat(successRate.toFixed(2)),\n    avgDurationMs: Math.round(avgDuration),\n    alertLevel: successRate < 90 ? 'critical' : successRate < 95 ? 'warning' : 'ok'\n  }\n}];"
      }
    },
    {
      "type": "n8n-nodes-base.if",
      "name": "Check Threshold",
      "parameters": {
        "conditions": {
          "options": {
            "leftValue": "={{ $json.alertLevel }}",
            "operator": { "type": "string", "operation": "notEquals" },
            "rightValue": "ok"
          }
        }
      }
    },
    {
      "type": "n8n-nodes-base.slack",
      "name": "Send Alert",
      "parameters": {
        "channel": "#incidents",
        "text": "🚨 *n8n Alert*\n\nWorkflow: Consultation Form\nSuccess Rate: {{ $json.successRate }}%\nFailed: {{ $json.failed }}/{{ $json.total }}\nAvg Duration: {{ $json.avgDurationMs }}ms\nLevel: {{ $json.alertLevel }}"
      }
    },
    {
      "type": "n8n-nodes-base.httpRequest",
      "name": "Send to Datadog",
      "parameters": {
        "method": "POST",
        "url": "https://api.datadoghq.com/api/v1/series",
        "authentication": "genericCredentialType",
        "genericAuthType": "httpHeaderAuth",
        "sendBody": true,
        "contentType": "json",
        "body": "={{ JSON.stringify({\n  series: [{\n    metric: 'n8n.consultation_form.success_rate',\n    points: [[Math.floor(Date.now()/1000), $json.successRate]],\n    type: 'gauge',\n    tags: ['env:production', 'workflow:consultation-form']\n  },\n  {\n    metric: 'n8n.consultation_form.executions',\n    points: [[Math.floor(Date.now()/1000), $json.total]],\n    type: 'count',\n    tags: ['env:production', 'workflow:consultation-form']\n  }]\n}) }}"
      }
    }
  ],
  "connections": {
    "Every 5 Minutes": {
      "main": [[{ "node": "Get Executions", "type": "main", "index": 0 }]]
    },
    "Get Executions": {
      "main": [[{ "node": "Calculate Metrics", "type": "main", "index": 0 }]]
    },
    "Calculate Metrics": {
      "main": [
        [{ "node": "Check Threshold", "type": "main", "index": 0 }],
        [{ "node": "Send to Datadog", "type": "main", "index": 0 }]
      ]
    },
    "Check Threshold": {
      "main": [
        [{ "node": "Send Alert", "type": "main", "index": 0 }]
      ]
    }
  }
}
```

### 6.2 GCP Cloud Monitoring Integration

```hcl
# gcp-deployment/monitoring/n8n-monitoring.tf

# Uptime check for webhook endpoint
resource "google_monitoring_uptime_check_config" "n8n_webhook" {
  display_name = "n8n Consultation Form Webhook"
  timeout      = "10s"
  period       = "60s"

  http_check {
    path         = "/webhook/consultation"
    port         = "443"
    use_ssl      = true
    request_method = "POST"
    content_type   = "URL_ENCODED"
    body           = base64encode(jsonencode({
      data = {
        name    = "Health Check"
        email   = "health@zaplit.com"
        company = "Test Corp"
        role    = "Test"
      }
    }))
  }

  monitored_resource {
    type = "uptime_url"
    labels = {
      project_id = var.project_id
      host       = "n8n.zaplit.com"
    }
  }
}

# Alert policy for uptime check failure
resource "google_monitoring_alert_policy" "webhook_uptime" {
  display_name = "n8n Webhook Down"
  combiner     = "OR"

  conditions {
    display_name = "Uptime check failed"
    
    condition_threshold {
      filter          = <<-EOT
        resource.type="uptime_url"
        metric.type="monitoring.googleapis.com/uptime_check/check_passed"
        resource.label.host="n8n.zaplit.com"
      EOT
      duration        = "300s"
      comparison      = "COMPARISON_LT"
      threshold_value = 1
      
      aggregations {
        alignment_period     = "300s"
        per_series_aligner   = "ALIGN_NEXT_OLDER"
        cross_series_reducer = "REDUCE_COUNT_FALSE"
      }
    }
  }
  
  notification_channels = var.alert_notification_channels
  severity              = "CRITICAL"
  
  documentation {
    content   = "n8n webhook endpoint is failing. Check n8n instance status and network connectivity."
    mime_type = "text/markdown"
  }
}

# Log-based metric for workflow errors
resource "google_logging_metric" "n8n_workflow_errors" {
  name   = "n8n-workflow-errors"
  filter = <<-EOT
    resource.type="gce_instance"
    jsonPayload.service="n8n"
    jsonPayload.level="ERROR"
    jsonPayload.workflow="consultation-form"
  EOT
  
  metric_descriptor {
    metric_kind  = "DELTA"
    value_type   = "INT64"
    unit         = "1"
    description  = "Count of n8n workflow errors"
    display_name = "n8n Workflow Errors"
  }
  
  label_extractors = {
    "error_type" = "EXTRACT(jsonPayload.error.type)"
  }
}

# Alert policy for error rate
resource "google_monitoring_alert_policy" "n8n_error_rate" {
  display_name = "n8n Error Rate High"
  combiner     = "OR"

  conditions {
    display_name = "Error rate exceeds threshold"
    
    condition_threshold {
      filter          = <<-EOT
        resource.type="global"
        metric.type="logging.googleapis.com/user/n8n-workflow-errors"
      EOT
      duration        = "300s"
      comparison      = "COMPARISON_GT"
      threshold_value = 5
      
      aggregations {
        alignment_period   = "300s"
        per_series_aligner = "ALIGN_COUNT"
      }
    }
  }
  
  notification_channels = var.alert_notification_channels
  severity              = "ERROR"
}

# Dashboard
resource "google_monitoring_dashboard" "n8n_production" {
  dashboard_json = jsonencode({
    displayName = "n8n Consultation Form - Production"
    gridLayout = {
      columns = "2"
      widgets = [
        {
          title = "Success Rate"
          xyChart = {
            dataSets = [{
              timeSeriesQuery = {
                timeSeriesFilter = {
                  filter = "metric.type=\"custom.googleapis.com/n8n/success_rate\""
                  aggregation = {
                    alignmentPeriod    = "300s"
                    perSeriesAligner   = "ALIGN_MEAN"
                  }
                }
              }
            }]
          }
        },
        {
          title = "Execution Count"
          xyChart = {
            dataSets = [{
              timeSeriesQuery = {
                timeSeriesFilter = {
                  filter = "metric.type=\"logging.googleapis.com/user/n8n-executions\""
                  aggregation = {
                    alignmentPeriod    = "60s"
                    perSeriesAligner   = "ALIGN_RATE"
                  }
                }
              }
            }]
          }
        },
        {
          title = "Error Count"
          xyChart = {
            dataSets = [{
              timeSeriesQuery = {
                timeSeriesFilter = {
                  filter = "metric.type=\"logging.googleapis.com/user/n8n-workflow-errors\""
                  aggregation = {
                    alignmentPeriod    = "300s"
                    perSeriesAligner   = "ALIGN_COUNT"
                  }
                }
              }
            }]
          }
        },
        {
          title = "Webhook Uptime"
          xyChart = {
            dataSets = [{
              timeSeriesQuery = {
                timeSeriesFilter = {
                  filter = "metric.type=\"monitoring.googleapis.com/uptime_check/check_passed\" resource.type=\"uptime_url\""
                  aggregation = {
                    alignmentPeriod    = "60s"
                    perSeriesAligner   = "ALIGN_NEXT_OLDER"
                  }
                }
              }
            }]
          }
        }
      ]
    }
  })
}
```

---

## 7. Runbooks and Procedures

### 7.1 Incident Response Quick Reference

```
┌─────────────────────────────────────────────────────────────┐
│  INCIDENT RESPONSE - Quick Reference                        │
├─────────────────────────────────────────────────────────────┤
│  1. ACKNOWLEDGE                                             │
│     • Post in #incidents: "Investigating [description]"     │
│     • Acknowledge in PagerDuty                              │
│                                                             │
│  2. ASSESS                                                  │
│     • Check dashboard: https://grafana.zaplit.com/n8n       │
│     • Review errors: https://kibana.zaplit.com/n8n-errors   │
│     • Check CRM status: https://crm.zaplit.com/healthz      │
│                                                             │
│  3. CLASSIFY                                                │
│     • P0: >10% failure rate → Page on-call                  │
│     • P1: 5-10% failure rate → Slack #incidents             │
│     • P2: <5% failure rate → Slack #engineering             │
│                                                             │
│  4. MITIGATE                                                │
│     • Auth failures → Check credentials                     │
│     • Rate limits → Enable backoff/retry                    │
│     • Timeouts → Check CRM status                           │
│     • High load → Scale n8n instance                        │
│                                                             │
│  5. RESOLVE                                                 │
│     • Post resolution in #incidents                         │
│     • Create post-mortem within 24h                         │
│     • Update runbooks if needed                             │
└─────────────────────────────────────────────────────────────┘
```

### 7.2 Common Alert Responses

#### Alert: "Success Rate Below 95%"

**Diagnosis Steps:**
```bash
# 1. Check recent failed executions
curl "https://n8n.zaplit.com/api/v1/executions?status=failed&limit=20" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" | jq '.data[] | {id, startedAt, stoppedAt, status}'

# 2. Check CRM API health
curl -w "\nHTTP %{http_code}\n" https://crm.zaplit.com/healthz

# 3. Check error logs
gcloud logging read "jsonPayload.service=\"n8n\" severity>=ERROR" \
  --limit=50 --format="value(jsonPayload.message)"
```

**Common Causes & Fixes:**

| Cause | Symptoms | Fix |
|-------|----------|-----|
| CRM API down | All CRM calls failing | Check Twenty CRM status page |
| Auth expired | 401 errors | Rotate API key (see RB001) |
| Rate limited | 429 errors, timeouts | Implement exponential backoff |
| Validation errors | 400 errors | Check form validation rules |
| Network issues | Connection timeouts | Check firewall, DNS |

#### Alert: "Response Time >10s"

**Diagnosis Steps:**
```bash
# 1. Check n8n resource usage
kubectl top pod -l app=n8n

# 2. Check CRM API latency
curl -w "\nTime: %{time_total}s\n" \
  https://crm.zaplit.com/rest/companies

# 3. Check concurrent executions
curl "https://n8n.zaplit.com/api/v1/executions?status=running" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" | jq '.data | length'
```

**Performance Tuning:**

| Issue | Solution |
|-------|----------|
| High CPU | Scale n8n instance or enable queue mode |
| Memory pressure | Increase heap size, enable pruning |
| Slow CRM API | Add caching, implement circuit breaker |
| Concurrent overload | Implement rate limiting |

### 7.3 Monthly Monitoring Review Checklist

**First Monday of Each Month:**

- [ ] Review alert history (false positive rate <10%)
- [ ] Verify dashboard accuracy
- [ ] Check log retention compliance
- [ ] Review and update thresholds
- [ ] Test escalation procedures
- [ ] Verify runbooks are current
- [ ] Review SLO adherence (target: 99%)
- [ ] Update documentation

---

## Appendix A: Metric Reference

### A.1 Custom Metrics

| Metric Name | Type | Description | Labels |
|-------------|------|-------------|--------|
| `n8n_execution_total` | Counter | Total workflow executions | workflow, status |
| `n8n_execution_duration_seconds` | Histogram | Execution duration | workflow, node |
| `n8n_crm_api_latency_seconds` | Histogram | CRM API call latency | endpoint, method |
| `n8n_crm_api_errors_total` | Counter | CRM API error count | error_type, status_code |
| `n8n_active_executions` | Gauge | Currently running workflows | workflow |
| `n8n_queue_depth` | Gauge | Pending executions | queue_name |

### A.2 Log Fields Reference

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `timestamp` | ISO8601 | Yes | Event timestamp |
| `level` | string | Yes | DEBUG, INFO, WARN, ERROR |
| `service` | string | Yes | Service name |
| `workflow` | string | Yes | Workflow identifier |
| `execution_id` | string | Yes | Unique execution ID |
| `trace_id` | string | No | Distributed trace ID |
| `message` | string | Yes | Human-readable message |
| `error` | object | No | Error details (type, code, message) |
| `metadata` | object | No | Additional context |
| `duration_ms` | number | No | Operation duration |

---

## Appendix B: Related Documentation

- [RB001: Credential Rotation](./runbooks/RB001-credential-rotation.md)
- [RB002: Incident Response](./runbooks/RB002-incident-response.md)
- [RB003: Workflow Rollback](./runbooks/RB003-workflow-rollback.md)
- [RB004: Monitoring Setup](./runbooks/RB004-monitoring-setup.md)
- [N8N_PRODUCTION_DEPLOYMENT_GUIDE.md](./N8N_PRODUCTION_DEPLOYMENT_GUIDE.md)

---

**Document Version History**

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-03-19 | SRE Team | Initial comprehensive guide |
