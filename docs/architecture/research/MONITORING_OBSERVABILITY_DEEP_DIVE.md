# Monitoring & Observability Deep Dive: n8n + Twenty CRM Production System

**Version:** 1.0  
**Date:** March 19, 2026  
**Author:** Principal SRE/Observability Engineer  
**Scope:** Production n8n workflows, Twenty CRM integration, Webhook endpoints  
**Classification:** Internal - Production Operations

---

## Executive Summary

This document presents a comprehensive observability analysis of the Zaplit n8n + Twenty CRM production system. Based on assessment of existing documentation, architecture patterns, and industry best practices, we identify critical monitoring gaps and provide a roadmap to achieve production-grade observability.

### Key Findings

| Area | Current State | Target State | Gap Severity |
|------|--------------|--------------|--------------|
| **Metrics** | Basic n8n execution logs | Full Golden Signals + Business Metrics | 🔴 High |
| **Logs** | Unstructured console output | Structured, aggregated, searchable | 🔴 High |
| **Tracing** | None | Distributed trace correlation | 🟡 Medium |
| **Alerting** | Manual checks | Automated, tiered alerting | 🔴 High |
| **Dashboards** | n8n built-in only | Multi-layer observability views | 🟡 Medium |

### Critical Gaps Identified

1. **No centralized log aggregation** - Logs exist only on individual instances
2. **Missing business metrics** - No visibility into form conversion rates or funnel analysis
3. **No distributed tracing** - Cannot trace requests across n8n → CRM boundary
4. **Reactive alerting only** - No proactive anomaly detection
5. **No CRM health monitoring** - Blind to Twenty CRM API degradation
6. **Missing SLO dashboards** - No executive visibility into service health

---

## 1. Current State Assessment

### 1.1 Existing Monitoring Infrastructure

```
┌─────────────────────────────────────────────────────────────────┐
│                    CURRENT MONITORING ARCHITECTURE              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐         ┌─────────────┐                       │
│  │   n8n UI    │         │  n8n API    │                       │
│  │  (Built-in) │         │  (Manual)   │                       │
│  └──────┬──────┘         └──────┬──────┘                       │
│         │                       │                               │
│         ▼                       ▼                               │
│  ┌─────────────────────────────────────────┐                   │
│  │         Execution Logs (Local)          │                   │
│  │  • Success/failure counts               │                   │
│  │  • Basic duration metrics               │                   │
│  │  • Error messages (unstructured)        │                   │
│  └─────────────────────────────────────────┘                   │
│                                                                 │
│  Health Checks:                                                 │
│  ✓ n8n /healthz endpoint                                        │
│  ✓ Basic webhook OPTIONS check                                  │
│  ✗ No Twenty CRM health monitoring                              │
│  ✗ No synthetic transaction monitoring                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 Current Monitoring Capabilities

#### What Exists Today

| Component | Capability | Access Method | Limitations |
|-----------|------------|---------------|-------------|
| **n8n Built-in** | Execution history | Web UI | 7-day retention, manual review only |
| **n8n API** | Execution metrics | REST API | Requires polling, no aggregation |
| **Health Endpoint** | Binary up/down | HTTP GET /healthz | No dependency health |
| **Console Logs** | Application events | Stdout/Files | No centralization, ephemeral |
| **Runbooks** | Incident procedures | Documentation | Manual execution required |

#### Existing Documentation Review

The project already contains substantial monitoring guidance:

- **MONITORING_AND_OBSERVABILITY_GUIDE.md** - Comprehensive metrics, alerting, and dashboard specifications
- **RB004-monitoring-setup.md** - Monitoring workflow setup instructions
- **RB002-incident-response.md** - Incident response procedures
- **N8N_PRODUCTION_DEPLOYMENT_GUIDE.md** - Production deployment with monitoring considerations

**Gap:** Documentation exists but implementation appears incomplete based on context.

### 1.3 Log Coverage Analysis

```yaml
Current Log Sources:
  n8n_application:
    location: "stdout / container logs"
    format: "unstructured text"
    retention: "ephemeral (container lifecycle)"
    accessibility: "kubectl logs / docker logs only"
    
  webhook_requests:
    location: "n8n execution history"
    format: "UI display only"
    retention: "7 days (configurable)"
    accessibility: "Manual UI navigation"
    
  crm_api_calls:
    location: "HTTP Request node output"
    format: "JSON response only on success"
    retention: "per-execution"
    accessibility: "Individual execution inspection"

Log Coverage Gaps:
  - ❌ No structured JSON logging
  - ❌ No correlation IDs for request tracing
  - ❌ No centralized log aggregation
  - ❌ No log-based alerting
  - ❌ No error classification/indexing
```

### 1.4 Error Tracking Capabilities

| Error Type | Current Detection | Response Time | Improvement Needed |
|------------|------------------|---------------|-------------------|
| Workflow failures | Manual UI check | Hours | Automated alerting |
| CRM API errors | Execution failure logs | Hours | Real-time alerting |
| Webhook timeouts | Client-side timeout | Unknown | Synthetic monitoring |
| Authentication failures | Error logs | Days | Immediate alerting |
| Rate limiting (429) | Intermittent failures | Variable | Pattern detection |
| Validation errors | Execution logs | Manual review | Aggregation alerts |

### 1.5 Alerting Mechanisms

```
Current Alert State: REACTIVE ONLY

User Reports Issue
        ↓
Engineer checks n8n UI
        ↓
Identify problem
        ↓
Manual response

Alerting Infrastructure:
✗ No PagerDuty integration (documented but not implemented)
✗ No Slack alerting (documented but not implemented)
✗ No automated threshold monitoring
✗ No anomaly detection
✓ Manual monitoring workflows documented
```

---

## 2. Gap Analysis: The Three Pillars

### 2.1 Metrics Pillar

#### Current State

```
Available Metrics:
├── n8n_execution_total (if Prometheus enabled)
├── n8n_execution_success_total
├── n8n_execution_failed_total
├── Basic duration histograms
└── Memory usage (container level)

Missing Metrics:
├── Business funnel metrics
├── CRM API latency percentiles
├── Webhook endpoint availability
├── Queue depth (if queue mode)
├── Node-level performance
└── Error classification metrics
```

#### Golden Signals Gap Analysis

| Golden Signal | Current | Required | Priority |
|--------------|---------|----------|----------|
| **Latency** | Basic execution time | p50/p95/p99 by workflow, node, endpoint | P0 |
| **Traffic** | Total execution count | Requests/minute, concurrent executions | P0 |
| **Errors** | Failure count only | Error rate %, error type breakdown | P0 |
| **Saturation** | Memory only | CPU, memory, queue depth, DB connections | P1 |

#### Recommended Metrics Framework

```yaml
# Tier 1: Critical Business Metrics (P0)
business_metrics:
  - form_submission_rate:
      description: "Forms submitted per minute"
      type: counter
      labels: [form_type, source]
      
  - form_conversion_rate:
      description: "Successful CRM creation / form submissions"
      type: gauge
      target: "> 99%"
      
  - funnel_drop_off:
      description: "Percentage lost at each stage"
      type: gauge
      stages: [submitted, validated, person_created, company_linked, note_added]

# Tier 2: Technical Performance Metrics (P0)
technical_metrics:
  - webhook_response_time:
      description: "End-to-end webhook response latency"
      type: histogram
      buckets: [0.1, 0.5, 1, 2, 5, 10, 30]
      
  - workflow_execution_duration:
      description: "Workflow execution time by node"
      type: histogram
      labels: [workflow_name, node_name]
      
  - crm_api_latency:
      description: "Twenty CRM API call latency"
      type: histogram
      labels: [endpoint, method]
      
  - crm_api_error_rate:
      description: "Percentage of failed CRM API calls"
      type: gauge
      target: "< 0.1%"

# Tier 3: Infrastructure Metrics (P1)
infrastructure_metrics:
  - n8n_memory_usage:
      description: "Heap memory utilization"
      type: gauge
      alert_threshold: "> 85%"
      
  - active_executions:
      description: "Currently running workflows"
      type: gauge
      alert_threshold: "> 50"
      
  - queue_depth:
      description: "Pending executions (queue mode)"
      type: gauge
      alert_threshold: "> 100"
```

### 2.2 Logs Pillar

#### Current State vs. Target

| Aspect | Current | Target | Gap |
|--------|---------|--------|-----|
| **Format** | Unstructured text | Structured JSON | High |
| **Aggregation** | Local only | Centralized (Loki/ELK) | High |
| **Search** | grep/kubectl | Full-text + field queries | High |
| **Retention** | Ephemeral | 30-90 days configurable | Medium |
| **Correlation** | None | Trace ID across services | Medium |
| **Alerting** | None | Log-based alerts | High |

#### Structured Logging Requirements

```json
{
  "timestamp": "2026-03-19T14:32:05.123Z",
  "level": "INFO",
  "service": "n8n",
  "workflow": "consultation-form",
  "execution_id": "exec_a1b2c3d4",
  "trace_id": "trace_x9y8z7w6",
  "span_id": "span_abc123",
  "parent_span_id": null,
  "node": "Create Person",
  "message": "CRM person created successfully",
  "metadata": {
    "duration_ms": 890,
    "status_code": 201,
    "crm_person_id": "person_uuid_123",
    "retry_count": 0,
    "request_size_bytes": 1024,
    "response_size_bytes": 512
  },
  "context": {
    "environment": "production",
    "version": "1.2.3",
    "host": "n8n-prod-01",
    "datacenter": "us-east1"
  },
  "error": null
}
```

#### Required Log Types

```yaml
log_categories:
  audit_logs:
    description: "Security and compliance events"
    retention: "2 years"
    examples:
      - "API key rotation performed"
      - "Workflow activated/deactivated"
      - "Credential access"
      
  application_logs:
    description: "Normal operation events"
    retention: "30 days"
    examples:
      - "Workflow execution started/completed"
      - "CRM API call succeeded"
      - "Webhook received"
      
  error_logs:
    description: "Failure events requiring attention"
    retention: "90 days"
    examples:
      - "Workflow execution failed"
      - "CRM API error"
      - "Authentication failure"
      
  debug_logs:
    description: "Detailed execution data"
    retention: "7 days"
    examples:
      - "Node input/output data"
      - "Expression evaluations"
      - "Variable states"
```

### 2.3 Tracing Pillar

#### Current State

```
Tracing Maturity: LEVEL 0 (None)

Request Flow Visibility:
┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐
│  Form   │───▶│  n8n    │───▶│ Twenty  │───▶│ Response│
│ Submit  │    │ Webhook │    │   CRM   │    │         │
└─────────┘    └─────────┘    └─────────┘    └─────────┘
     ▼              ▼              ▼              ▼
  [No ID]       [No ID]        [No ID]        [No ID]
  
❌ Cannot trace a single request through the system
❌ Cannot identify bottlenecks across service boundaries
❌ Cannot correlate errors in downstream services
```

#### Distributed Tracing Requirements

```yaml
tracing_implementation:
  standard: "OpenTelemetry"
  sampling_rate: "1% (configurable)"
  
  trace_context_propagation:
    incoming:
      - "Extract traceparent from webhook headers"
      - "Generate new trace if not present"
    outgoing:
      - "Inject traceparent into CRM API calls"
      - "Include trace ID in response headers"
      
  spans:
    - name: "webhook_receive"
      attributes: [form_type, source_ip_hash]
      
    - name: "validate_form"
      attributes: [validation_duration_ms]
      
    - name: "crm_create_person"
      attributes: [api_latency_ms, status_code, retry_count]
      
    - name: "crm_create_company"
      attributes: [api_latency_ms, status_code]
      
    - name: "crm_create_note"
      attributes: [api_latency_ms, status_code]
      
    - name: "send_response"
      attributes: [response_duration_ms, status_code]
```

#### Trace-Driven Analysis Use Cases

```
Use Case 1: Latency Attribution
┌─────────────────────────────────────────────────────────┐
│ Trace ID: abc123                                        │
│ Total Duration: 4.2s                                    │
├─────────────────────────────────────────────────────────┤
│ webhook_receive     ████████░░░░░░░░░░░░  50ms (1%)    │
│ validate_form       ████░░░░░░░░░░░░░░░░  25ms (1%)    │
│ crm_create_person   ████████████████████  3200ms (76%) │
│ crm_create_company  ██████░░░░░░░░░░░░░░  800ms (19%)  │
│ crm_create_note     █░░░░░░░░░░░░░░░░░░░  100ms (2%)   │
│ send_response       █░░░░░░░░░░░░░░░░░░░  25ms (1%)    │
└─────────────────────────────────────────────────────────┘
→ Action: Investigate Twenty CRM person endpoint performance

Use Case 2: Error Correlation
Trace shows: webhook_receive → validate_form → crm_create_person [ERROR]
→ Root cause: CRM API 503
→ Impact: 100% failure rate for person creation
```

---

## 3. Critical Metrics Missing

### 3.1 Business Metrics

| Metric | Description | Calculation | Business Impact |
|--------|-------------|-------------|-----------------|
| **Form Submission Rate** | Forms submitted per hour | Count(webhook_calls) / hour | Lead generation velocity |
| **Lead Conversion Rate** | Successful CRM entries / submissions | (CRM_created / submitted) × 100 | Data quality indicator |
| **Funnel Drop-off Rate** | Loss at each processing stage | (stage_n - stage_n+1) / stage_n | Process optimization |
| **Time-to-CRM** | From submission to CRM entry | CRM_create_time - submit_time | Customer response SLA |
| **Duplicate Rate** | Duplicate submissions detected | Duplicates / Total | Form spam/refresh issues |
| **Peak Hour Traffic** | Max submissions in 1-hour window | Max(count submissions) | Capacity planning |
| **Geographic Distribution** | Submissions by region (anonymized) | Group by hashed IP geo | Marketing insights |

#### Business KPI Dashboard Requirements

```yaml
executive_dashboard:
  refresh_interval: "5 minutes"
  time_ranges: ["24h", "7d", "30d"]
  
  widgets:
    - title: "Daily Lead Volume"
      type: "stat"
      metric: "form_submission_rate"
      comparison: "previous_period"
      
    - title: "Conversion Funnel"
      type: "funnel"
      stages:
        - "Form Submitted"
        - "Data Validated"
        - "Person Created"
        - "Company Linked"
        - "Note Added"
        
    - title: "SLA Compliance"
      type: "gauge"
      metric: "time_to_crm_p95"
      threshold: "< 30s"
      
    - title: "Error Impact"
      type: "table"
      columns: [error_type, count, lost_leads_estimate]
```

### 3.2 Technical Metrics

#### API Performance Metrics

| Metric | Target | Alert Threshold | Measurement Point |
|--------|--------|-----------------|-------------------|
| **Webhook p50 Latency** | < 2s | > 5s | Client → n8n response |
| **Webhook p95 Latency** | < 5s | > 10s | Client → n8n response |
| **Webhook p99 Latency** | < 10s | > 15s | Client → n8n response |
| **CRM API p50 Latency** | < 500ms | > 2s | n8n → Twenty CRM |
| **CRM API p95 Latency** | < 2s | > 5s | n8n → Twenty CRM |
| **CRM API Error Rate** | < 0.1% | > 1% | HTTP 4xx/5xx responses |
| **Webhook Availability** | 99.9% | < 99% | Synthetic probe success |

#### Infrastructure Metrics

```yaml
infrastructure_monitoring:
  n8n_instance:
    - cpu_utilization_percent:
        alert: "> 80% for 5m"
        
    - memory_utilization_percent:
        alert: "> 85% for 5m"
        
    - disk_io_utilization:
        alert: "> 70% for 10m"
        
    - network_throughput:
        alert: "anomalous spike"
        
    - open_file_descriptors:
        alert: "> 80% of limit"
        
  database (if external):
    - connection_pool_utilization:
        alert: "> 80%"
        
    - query_latency_p95:
        alert: "> 100ms"
        
    - slow_query_count:
        alert: "> 10/min"
```

### 3.3 CRM Integration Health Metrics

```yaml
crm_health_metrics:
  twenty_crm:
    # Availability
    - health_check_pass_rate:
        endpoint: "/healthz"
        frequency: "60s"
        alert: "< 100% for 3m"
        
    # Performance
    - api_response_time:
        endpoints: ["/rest/people", "/rest/companies", "/rest/notes"]
        percentiles: [p50, p95, p99]
        
    # Reliability
    - rate_limit_approaching:
        metric: "x-ratelimit-remaining < 10"
        alert: "immediate"
        
    - auth_token_expiry:
        metric: "days_until_expiry"
        alert: "< 7 days"
        
    # Error Classification
    - error_breakdown:
        dimensions: [status_code, endpoint, error_type]
        
    - retry_success_rate:
        metric: "succeeded_after_retry / total_retries"
        target: "> 95%"
```

### 3.4 Webhook Failure Analysis

| Failure Mode | Detection Method | Metric | Alert |
|--------------|-----------------|--------|-------|
| **Timeout** | Response time > 30s | `webhook_timeout_rate` | > 1% |
| **Connection Refused** | TCP connection fail | `webhook_connection_failures` | Any occurrence |
| **SSL/TLS Error** | Certificate validation | `webhook_tls_errors` | Any occurrence |
| **DNS Failure** | Resolution failure | `webhook_dns_failures` | Any occurrence |
| **5xx Response** | HTTP status >= 500 | `webhook_server_error_rate` | > 0.1% |
| **4xx Response** | HTTP status >= 400 | `webhook_client_error_rate` | > 1% |

---

## 4. Alerting Strategy

### 4.1 Alert Severity Framework

```
┌─────────────────────────────────────────────────────────────────┐
│                    ALERT SEVERITY PYRAMID                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│                          ▲ P0                                   │
│                         ╱ ╲                                     │
│                        ╱   ╲  Critical                          │
│                       ╱     ╲  Service down                     │
│                      ╱───────╲  Immediate response              │
│                     ▲         ▲                                 │
│                    ╱ ╲       ╱ ╲                                │
│                   ╱   ╲     ╱   ╲  High                         │
│                  ╱  P1  ╲   ╱     ╲  Degraded                   │
│                 ╱─────────╲╱       ╲  15-min response           │
│                ▲                   ▲                            │
│               ╱ ╲                 ╱ ╲                           │
│              ╱   ╲               ╱   ╲  Medium                  │
│             ╱  P2  ╲             ╱     ╲  Warning               │
│            ╱────────╲           ╱       ╲  1-hour response      │
│           ▲                   ▲                                 │
│          ╱ ╲                 ╱ ╲                                │
│         ╱   ╲               ╱   ╲  Low                          │
│        ╱  P3  ╲             ╱     ╲  Info                       │
│       ╱────────╲           ╱       ╲  4-hour response           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 Alert Definitions

#### P0 - Critical Alerts (Page Immediately)

| Alert Name | Condition | Notification | Auto-Escalation |
|------------|-----------|--------------|-----------------|
| **Service Down** | Webhook endpoint down > 2m | PagerDuty + SMS + Slack | 5 min → L2 |
| **Critical Error Rate** | Success rate < 90% | PagerDuty + SMS + Slack | 5 min → L2 |
| **CRM Unavailable** | Twenty CRM health check fail | PagerDuty + Slack | 10 min → L2 |
| **Data Loss Risk** | Execution failures > 20/min | PagerDuty + SMS + Slack | Immediate |

#### P1 - High Alerts (Respond within 15 min)

| Alert Name | Condition | Notification | Response SLA |
|------------|-----------|--------------|--------------|
| **Elevated Error Rate** | Success rate 90-95% | Slack #incidents + Email | 15 min |
| **High Latency** | p95 response > 10s | Slack #incidents | 15 min |
| **CRM Degraded** | API latency > 5s or errors > 1% | Slack #incidents | 15 min |
| **Resource Saturation** | Memory/CPU > 90% | Slack #incidents | 15 min |
| **Queue Backlog** | Queue depth > 100 (queue mode) | Slack #incidents | 15 min |

#### P2 - Medium Alerts (Respond within 1 hour)

| Alert Name | Condition | Notification | Response SLA |
|------------|-----------|--------------|--------------|
| **Warning Error Rate** | Success rate 95-99% | Slack #engineering | 1 hour |
| **Elevated Latency** | p95 response 5-10s | Slack #engineering | 1 hour |
| **Retry Storm** | Retry rate > 10% | Slack #engineering | 1 hour |
| **Certificate Expiry** | TLS cert expires < 7 days | Slack #engineering | 1 hour |

#### P3 - Low Alerts (Daily Digest)

| Alert Name | Condition | Notification | Response SLA |
|------------|-----------|--------------|--------------|
| **Minor Error Spike** | Error rate 1-5% | Daily digest | 4 hours |
| **Performance Degradation** | p95 > 3s sustained | Daily digest | 4 hours |
| **Capacity Planning** | Resource trending toward limits | Weekly report | Best effort |

### 4.3 Alert Threshold Matrix

```yaml
alert_thresholds:
  success_rate:
    p0: "< 90% for 2 minutes"
    p1: "< 95% for 5 minutes"
    p2: "< 99% for 10 minutes"
    
  error_rate:
    p0: "> 10% for 2 minutes"
    p1: "> 5% for 5 minutes"
    p2: "> 1% for 10 minutes"
    
  latency_p95:
    p0: "> 15s for 3 minutes"
    p1: "> 10s for 5 minutes"
    p2: "> 5s for 10 minutes"
    
  crm_latency:
    p0: "> 10s for 3 minutes"
    p1: "> 5s for 5 minutes"
    p2: "> 2s for 10 minutes"
    
  failed_executions:
    p0: "> 20 failures in 5 minutes"
    p1: "> 10 failures in 5 minutes"
    p2: "> 3 failures in 5 minutes"
    
  queue_depth:
    p0: "> 500 jobs waiting"
    p1: "> 100 jobs waiting for > 5 minutes"
    p2: "> 50 jobs waiting for > 10 minutes"
```

### 4.4 Notification Routing

```yaml
notification_routes:
  p0_critical:
    channels:
      pagerduty:
        service_key: "${PAGERDUTY_SERVICE_KEY}"
        urgency: "high"
        priority: "P1"
      slack:
        channel: "#incidents"
        mention: "@channel @oncall-sre"
        include_runbook_links: true
      sms:
        recipients: ["${ONCALL_PHONE_PRIMARY}", "${ONCALL_PHONE_SECONDARY}"]
      webhook:
        url: "${INCIDENT_MANAGEMENT_WEBHOOK}"
        
  p1_high:
    channels:
      slack:
        channel: "#incidents"
        mention: "@oncall-sre"
      email:
        to: ["sre-team@zaplit.com", "oncall@zaplit.com"]
        
  p2_medium:
    channels:
      slack:
        channel: "#engineering"
        mention: "@here"
        
  p3_low:
    channels:
      slack:
        channel: "#engineering"
    digest:
      enabled: true
      schedule: "0 9 * * *"  # Daily at 9 AM
      
  # Special routing for specific alert types
  crm_issues:
    channels:
      slack:
        channel: "#crm-alerts"
        mention: "@crm-team"
        
  security_issues:
    channels:
      slack:
        channel: "#security"
        mention: "@security-team"
      email:
        to: ["security@zaplit.com"]
        priority: "high"
```

### 4.5 Escalation Policies

```
P0 Incident Escalation Timeline:
┌─────────────────────────────────────────────────────────────┐
│ T+0 min     Alert triggered                                 │
│         ┌─────────────────────────────────────────────────┐ │
│ T+5 min │ L1 On-call must acknowledge                     │ │
│         │ └─ If no ack → Auto-escalate to L2              │ │
│         └─────────────────────────────────────────────────┘ │
│         ┌─────────────────────────────────────────────────┐ │
│ T+20 min│ L2 Senior Engineer engaged                      │ │
│         │ └─ If unresolved → Escalate to L3               │ │
│         └─────────────────────────────────────────────────┘ │
│         ┌─────────────────────────────────────────────────┐ │
│ T+50 min│ L3 Engineering Manager engaged                  │ │
│         │ └─ If unresolved → Escalate to L4               │ │
│         └─────────────────────────────────────────────────┘ │
│         ┌─────────────────────────────────────────────────┐ │
│ T+80 min│ L4 CTO engaged                                  │ │
│         └─────────────────────────────────────────────────┘ │
│                                                             │
│ Post-Resolution:                                            │
│ T+24h     Post-incident review due                          │
│ T+1week   Action items completion deadline                  │
└─────────────────────────────────────────────────────────────┘
```

### 4.6 Alert Fatigue Prevention

```yaml
alert_optimization:
  grouping:
    workflow_failures:
      group_by: [workflow_name, error_type]
      group_wait: "30s"
      group_interval: "5m"
      repeat_interval: "4h"
      
    crm_errors:
      group_by: [error_code, endpoint]
      group_wait: "1m"
      group_interval: "10m"
      repeat_interval: "2h"
      
  inhibition:
    - source: "HostDown"
      target: "HighErrorRate"
      reason: "Host down causes errors"
      
    - source: "CRMUnavailable"
      target: "CRMLatencyHigh"
      reason: "CRM unavailable explains latency"
      
  auto_resolution:
    enabled: true
    conditions:
      - alert: "HighErrorRate"
        resolve_after: "10m of normal"
      - alert: "SlowResponseTime"
        resolve_after: "15m of normal"
      - alert: "QueueBacklog"
        resolve_after: "5m of normal"
```

---

## 5. Observability Stack Recommendations

### 5.1 Recommended Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    OBSERVABILITY STACK ARCHITECTURE                     │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                        DATA COLLECTION LAYER                     │   │
│  ├─────────────────────────────────────────────────────────────────┤   │
│  │                                                                  │   │
│  │   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐        │   │
│  │   │   n8n       │    │   n8n       │    │  Twenty     │        │   │
│  │   │  Metrics    │    │   Logs      │    │    CRM      │        │   │
│  │   │  (Prom)     │    │  (Stdout)   │    │  (Health)   │        │   │
│  │   └──────┬──────┘    └──────┬──────┘    └──────┬──────┘        │   │
│  │          │                  │                  │                │   │
│  │          ▼                  ▼                  ▼                │   │
│  │   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐        │   │
│  │   │  Prometheus │    │  Promtail   │    │  Synthetic  │        │   │
│  │   │  Scraper    │    │  (Log Agent)│    │   Probes    │        │   │
│  │   └──────┬──────┘    └──────┬──────┘    └──────┬──────┘        │   │
│  │          │                  │                  │                │   │
│  └──────────┼──────────────────┼──────────────────┼────────────────┘   │
│             │                  │                  │                     │
│             ▼                  ▼                  ▼                     │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                        STORAGE LAYER                             │   │
│  ├─────────────────────────────────────────────────────────────────┤   │
│  │                                                                  │   │
│  │   ┌─────────────────┐    ┌─────────────────┐                   │   │
│  │   │   Prometheus    │    │      Loki       │                   │   │
│  │   │  (Time Series)  │    │   (Log Store)   │                   │   │
│  │   │                 │    │                 │                   │   │
│  │   │ • Metrics       │    │ • Structured    │                   │   │
│  │   │ • Alert rules   │    │   logs          │                   │   │
│  │   │ • 15d retention │    │ • 30d retention │                   │   │
│  │   └────────┬────────┘    └────────┬────────┘                   │   │
│  │            │                      │                            │   │
│  │   ┌────────┴────────┐    ┌────────┴────────┐                   │   │
│  │   │   Alertmanager  │    │  Object Storage │                   │   │
│  │   │   (Alerting)    │    │  (Long-term)    │                   │   │
│  │   └────────┬────────┘    └─────────────────┘                   │   │
│  │            │                                                   │   │
│  └────────────┼───────────────────────────────────────────────────┘   │
│               │                                                       │
│               ▼                                                       │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                     VISUALIZATION LAYER                          │   │
│  ├─────────────────────────────────────────────────────────────────┤   │
│  │                                                                  │   │
│  │   ┌─────────────────────────────────────────────────────────┐   │   │
│  │   │                      Grafana                             │   │   │
│  │   │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │   │   │
│  │   │  │Executive │  │Operations│  │ Technical│  │  Error   │ │   │   │
│  │   │  │ Dashboard│  │ Dashboard│  │ Dashboard│  │ Dashboard│ │   │   │
│  │   │  └──────────┘  └──────────┘  └──────────┘  └──────────┘ │   │   │
│  │   └─────────────────────────────────────────────────────────┘   │   │
│  │                                                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                     NOTIFICATION LAYER                           │   │
│  ├─────────────────────────────────────────────────────────────────┤   │
│  │                                                                  │   │
│  │   ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐     │   │
│  │   │  Slack  │    │PagerDuty│    │  Email  │    │  SMS    │     │   │
│  │   │#incident│    │         │    │         │    │         │     │   │
│  │   └─────────┘    └─────────┘    └─────────┘    └─────────┘     │   │
│  │                                                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Component Selection

#### Option A: Full Open Source Stack (Recommended)

| Component | Purpose | Cost | Complexity |
|-----------|---------|------|------------|
| **Prometheus** | Metrics collection & alerting | Free | Medium |
| **Grafana** | Dashboards & visualization | Free (Cloud: $) | Low |
| **Loki** | Log aggregation | Free | Medium |
| **Promtail** | Log shipping | Free | Low |
| **Alertmanager** | Alert routing | Free | Medium |
| **Node Exporter** | Host metrics | Free | Low |
| **cAdvisor** | Container metrics | Free | Low |

#### Option B: Cloud-Native (GCP)

| Component | Purpose | Cost | Complexity |
|-----------|---------|------|------------|
| **Cloud Monitoring** | Metrics & alerting | $0.10/1000 API calls | Low |
| **Cloud Logging** | Log aggregation | $0.50/GB ingested | Low |
| **Cloud Trace** | Distributed tracing | Free tier available | Low |
| **Error Reporting** | Error aggregation | Included | Low |

#### Option C: Hybrid (Recommended for Startups)

| Component | Purpose | Cost | Rationale |
|-----------|---------|------|-----------|
| **Grafana Cloud** | Managed metrics/logs/traces | $8-15/editor/mo | Reduced ops overhead |
| **n8n Prometheus** | Self-hosted metrics | Free | Full control |
| **PagerDuty** | Incident management | $29/user/mo | Industry standard |
| **Slack** | Notifications | Free tier | Team communication |

### 5.3 n8n-Specific Monitoring Configuration

```yaml
# n8n environment configuration for observability
n8n_env:
  # Enable Prometheus metrics
  N8N_METRICS: "true"
  N8N_METRICS_PREFIX: "n8n_"
  
  # Include queue metrics (if using queue mode)
  N8N_METRICS_INCLUDE_QUEUE_METRICS: "true"
  N8N_METRICS_INCLUDE_WORKFLOW_ID_LABEL: "true"
  
  # Log configuration
  N8N_LOG_LEVEL: "info"  # debug, info, warn, error
  N8N_LOG_OUTPUT: "console"  # console, file, or both
  
  # Execution data pruning (for performance)
  EXECUTIONS_DATA_PRUNE: "true"
  EXECUTIONS_DATA_MAX_AGE: "168"  # 7 days
  EXECUTIONS_DATA_PRUNE_MAX_COUNT: "10000"
  
  # Error workflow
  N8N_ON_ERROR_WORKFLOW_ID: "error-handler-workflow-id"
```

```yaml
# Prometheus scrape configuration for n8n
prometheus_config:
  global:
    scrape_interval: 15s
    evaluation_interval: 15s
    
  scrape_configs:
    - job_name: 'n8n'
      static_configs:
        - targets: ['n8n:5678']
      metrics_path: '/metrics'
      scrape_interval: 15s
      
    - job_name: 'n8n-workers'
      static_configs:
        - targets: ['n8n-worker-1:5678', 'n8n-worker-2:5678']
      metrics_path: '/metrics'
      scrape_interval: 15s
      
    - job_name: 'node-exporter'
      static_configs:
        - targets: ['node-exporter:9100']
      
    - job_name: 'cadvisor'
      static_configs:
        - targets: ['cadvisor:8080']
```

### 5.4 Twenty CRM Monitoring

```yaml
# Synthetic monitoring for Twenty CRM
crm_monitoring:
  health_checks:
    - name: "twenty_crm_health"
      endpoint: "https://crm.zaplit.com/healthz"
      interval: "60s"
      timeout: "5s"
      expected_status: 200
      
    - name: "twenty_crm_api"
      endpoint: "https://crm.zaplit.com/rest/companies"
      interval: "300s"
      timeout: "10s"
      method: "GET"
      headers:
        Authorization: "Bearer ${TWENTY_API_KEY}"
      expected_status: 200
      
  metrics_collection:
    - metric: "crm_api_latency"
      collection_method: "n8n_http_request_timing"
      labels: [endpoint, method]
      
    - metric: "crm_api_errors"
      collection_method: "http_response_code"
      classify_by: status_code
```

### 5.5 Cost-Effective Implementation Phases

#### Phase 1: Foundation (Week 1-2) - $0

```yaml
phase_1_deliverables:
  - name: "Basic Prometheus + Grafana"
    deployment: "Docker Compose on existing VM"
    cost: "$0"
    
  - name: "Core Metrics Dashboard"
    metrics:
      - execution_success_rate
      - execution_duration
      - crm_api_latency
    
  - name: "Critical Alerts"
    alerts:
      - service_down
      - high_error_rate
      - crm_unavailable
```

#### Phase 2: Log Aggregation (Week 3-4) - $0-50/mo

```yaml
phase_2_deliverables:
  - name: "Loki + Promtail"
    deployment: "Docker Compose"
    storage: "Local SSD (30 days)"
    
  - name: "Structured Logging"
    implementation: "n8n code nodes for JSON logging"
    
  - name: "Log-based Alerts"
    examples:
      - "Error count > 5 in 5 minutes"
      - "Specific error pattern detected"
```

#### Phase 3: Advanced Observability (Month 2) - $100-300/mo

```yaml
phase_3_deliverables:
  - name: "Grafana Cloud"
    tier: "Pro"
    cost: "$149/mo (10 editors)"
    
  - name: "Distributed Tracing"
    implementation: "OpenTelemetry"
    backend: "Grafana Tempo"
    
  - name: "PagerDuty Integration"
    cost: "$29/user/mo"
    
  - name: "Synthetic Monitoring"
    tool: "Grafana Cloud Synthetic Monitoring"
    checks: "10k/mo included"
```

#### Phase 4: Enterprise (Month 3+) - $500+/mo

```yaml
phase_4_deliverables:
  - name: "Long-term Storage"
    solution: "GCS/S3 with lifecycle policies"
    retention: "2 years"
    
  - name: "Anomaly Detection"
    implementation: "Grafana Machine Learning"
    
  - name: "Custom Business Dashboards"
    audience: "Executives, Product, Marketing"
```

### 5.6 Dashboard Specifications

#### Dashboard 1: Executive Summary

```yaml
executive_dashboard:
  audience: [CEO, CTO, VP Product]
  refresh: "5m"
  
  panels:
    - title: "SLA Status"
      type: "stat"
      metrics:
        - uptime_percentage:
            target: "> 99%"
            alert: "< 99%"
            
    - title: "Daily Lead Volume"
      type: "stat"
      metrics:
        - submissions_24h:
            comparison: "previous_day"
            
    - title: "Conversion Rate"
      type: "gauge"
      metrics:
        - lead_to_crm_conversion:
            target: "> 99%"
            
    - title: "Error Impact"
      type: "table"
      columns: [period, failed_submissions, estimated_revenue_impact]
```

#### Dashboard 2: Operations Center

```yaml
operations_dashboard:
  audience: [SRE, DevOps, On-call]
  refresh: "10s"
  
  panels:
    - title: "Real-time Success Rate"
      type: "stat"
      query: |
        sum(rate(n8n_execution_success_total[5m])) 
        / 
        sum(rate(n8n_execution_total[5m])) * 100
      
    - title: "Active Executions"
      type: "gauge"
      metric: "n8n_active_executions"
      
    - title: "Recent Errors"
      type: "logs"
      datasource: "loki"
      query: '{service="n8n"} |= "ERROR"'
      
    - title: "CRM Health"
      type: "stat"
      metrics:
        - health_status
        - avg_latency
        - error_rate
```

#### Dashboard 3: Technical Deep-Dive

```yaml
technical_dashboard:
  audience: [Backend Engineers]
  refresh: "1m"
  
  panels:
    - title: "Node-Level Performance"
      type: "table"
      columns: [node_name, avg_duration, p95, error_count]
      
    - title: "Response Time Distribution"
      type: "heatmap"
      metric: "n8n_execution_duration_seconds_bucket"
      
    - title: "Error Breakdown"
      type: "piechart"
      metric: "n8n_execution_failed_total"
      by: error_type
      
    - title: "Resource Usage"
      type: "timeseries"
      metrics:
        - cpu_usage
        - memory_usage
        - disk_io
```

---

## 6. Implementation Roadmap

### 6.1 Week-by-Week Plan

```
WEEK 1: Metrics Foundation
┌─────────────────────────────────────────────────────────────┐
│ Day 1-2: Deploy Prometheus + Grafana                        │
│   • Docker Compose setup                                    │
│   • Basic n8n metrics collection                            │
│                                                             │
│ Day 3-4: Create Core Dashboards                             │
│   • Success rate monitoring                                 │
│   • Execution duration tracking                             │
│                                                             │
│ Day 5: Configure First Alerts                               │
│   • Service down detection                                  │
│   • High error rate alerting                                │
└─────────────────────────────────────────────────────────────┘

WEEK 2: Alerting & Notifications
┌─────────────────────────────────────────────────────────────┐
│ Day 1-2: Set up Alertmanager                                │
│   • Slack integration                                       │
│   • Email notifications                                     │
│                                                             │
│ Day 3-4: PagerDuty Integration                              │
│   • Service configuration                                   │
│   • Escalation policies                                     │
│                                                             │
│ Day 5: Runbook Creation                                     │
│   • RB005: Monitoring Playbook                              │
│   • Alert response procedures                               │
└─────────────────────────────────────────────────────────────┘

WEEK 3: Log Aggregation
┌─────────────────────────────────────────────────────────────┐
│ Day 1-2: Deploy Loki + Promtail                             │
│   • Log collection configuration                            │
│   • Structured logging implementation                       │
│                                                             │
│ Day 3-4: Log-based Dashboards                               │
│   • Error log explorer                                      │
│   • Pattern analysis                                        │
│                                                             │
│ Day 5: Log Alerts                                           │
│   • Error pattern detection                                 │
│   • Rate-based alerting                                     │
└─────────────────────────────────────────────────────────────┘

WEEK 4: Advanced Features
┌─────────────────────────────────────────────────────────────┐
│ Day 1-2: Synthetic Monitoring                               │
│   • Uptime checks                                           │
│   • Transaction monitoring                                    │
│                                                             │
│ Day 3-4: CRM Health Monitoring                              │
│   • Twenty CRM integration checks                           │
│   • API latency tracking                                    │
│                                                             │
│ Day 5: Documentation & Training                             │
│   • Team onboarding                                         │
│   • Dashboard walkthrough                                   │
└─────────────────────────────────────────────────────────────┘

MONTH 2: Enhancement
┌─────────────────────────────────────────────────────────────┐
│ Week 1: Distributed Tracing                                 │
│   • OpenTelemetry implementation                            │
│   • Trace correlation                                       │
│                                                             │
│ Week 2: Business Metrics                                    │
│   • Conversion funnel tracking                              │
│   • Executive dashboards                                    │
│                                                             │
│ Week 3: Anomaly Detection                                   │
│   • Baseline establishment                                  │
│   • ML-based alerting                                       │
│                                                             │
│ Week 4: Optimization                                        │
│   • Alert tuning                                            │
│   • Performance optimization                                │
└─────────────────────────────────────────────────────────────┘
```

### 6.2 Resource Requirements

| Phase | Engineering | Infrastructure | Cost |
|-------|-------------|----------------|------|
| Week 1-2 | 1 SRE (full-time) | 1 VM (2CPU/4GB) | $50/mo |
| Week 3-4 | 1 SRE (full-time) | 1 VM + 100GB disk | $100/mo |
| Month 2 | 0.5 SRE (part-time) | Grafana Cloud | $200/mo |
| Ongoing | 0.25 SRE (on-call) | Maintenance | $150/mo |

### 6.3 Success Criteria

```yaml
success_metrics:
  technical:
    - metric: "MTTR (Mean Time to Recovery)"
      target: "< 15 minutes"
      
    - metric: "Alert Response Time"
      target: "< 5 minutes for P0"
      
    - metric: "False Positive Rate"
      target: "< 10%"
      
    - metric: "Dashboard Usage"
      target: "> 5 daily active users"
      
  business:
    - metric: "Downtime Detection Time"
      target: "< 2 minutes"
      
    - metric: "Error Investigation Time"
      target: "< 10 minutes"
      
    - metric: "Post-Incident Review Completion"
      target: "100% within 24h"
```

---

## 7. Risk Assessment & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Alert fatigue | High | Medium | Progressive rollout, tuning periods |
| Storage costs | Medium | Medium | Retention policies, sampling |
| Performance overhead | Medium | Low | Async collection, resource limits |
| Team adoption | Medium | High | Training, documentation, champions |
| Tool complexity | Medium | Medium | Start simple, iterate |
| Vendor lock-in | Low | Medium | Open source preference |

---

## 8. Appendices

### Appendix A: Metric Reference

See [MONITORING_AND_OBSERVABILITY_GUIDE.md](./MONITORING_AND_OBSERVABILITY_GUIDE.md) Appendix A for complete metric definitions.

### Appendix B: Runbook Templates

#### RB005: Monitoring Alert Response

```markdown
# Runbook: RB005 - Monitoring Alert Response

**Purpose:** Respond to automated monitoring alerts  
**Trigger:** PagerDuty/Slack alert  
**Owner:** On-call Engineer

## Quick Reference

| Alert Type | First Action | Expected Resolution |
|------------|--------------|---------------------|
| Service Down | Check n8n health endpoint | 5-15 min |
| High Error Rate | Check CRM status | 10-30 min |
| High Latency | Check resource utilization | 15-30 min |
| Queue Backlog | Scale workers or investigate | 10-20 min |

## Response Procedure

1. Acknowledge alert in PagerDuty
2. Check executive dashboard for context
3. Follow diagnosis flowchart
4. Execute remediation steps
5. Document actions taken
6. Update incident status

## Escalation

- P0 unresolved > 15 min → Escalate to L2
- CRM issues → Contact CRM team
- Infrastructure issues → Page platform team
```

### Appendix C: Tool Comparison Matrix

| Feature | Prometheus+Grafana | Datadog | New Relic | Grafana Cloud |
|---------|-------------------|---------|-----------|---------------|
| Metrics | ✅ Excellent | ✅ Excellent | ✅ Excellent | ✅ Excellent |
| Logs | ⚠️ Loki needed | ✅ Built-in | ✅ Built-in | ✅ Built-in |
| Traces | ⚠️ Tempo needed | ✅ Built-in | ✅ Built-in | ✅ Built-in |
| Cost | Free (self-hosted) | $$$$ | $$$ | $$ |
| Setup Complexity | Medium | Low | Low | Low |
| Vendor Lock-in | None | High | High | Low |
| Best For | Technical teams | Enterprises | Enterprises | Startups/SMB |

### Appendix D: Related Documentation

- [MONITORING_AND_OBSERVABILITY_GUIDE.md](./MONITORING_AND_OBSERVABILITY_GUIDE.md) - Comprehensive monitoring guide
- [RB002-incident-response.md](./runbooks/RB002-incident-response.md) - Incident response procedures
- [RB004-monitoring-setup.md](./runbooks/RB004-monitoring-setup.md) - Monitoring setup instructions
- [N8N_PRODUCTION_DEPLOYMENT_GUIDE.md](./N8N_PRODUCTION_DEPLOYMENT_GUIDE.md) - Production deployment
- [PRODUCTION_DEPLOYMENT_GAPS.md](./PRODUCTION_DEPLOYMENT_GAPS.md) - Gap analysis

---

**Document Owner:** SRE Team  
**Review Schedule:** Monthly  
**Next Review:** April 19, 2026  
**Distribution:** Engineering, DevOps, Leadership

---

*This document is a living analysis. As the system evolves, update this document to reflect current state and emerging requirements.*
