---
title: Monitoring & Observability Strategy
source: MONITORING_OBSERVABILITY_DEEP_DIVE.md
consolidated: 2026-03-19
---

# Monitoring & Observability Strategy

> Consolidated from: MONITORING_OBSERVABILITY_DEEP_DIVE.md, THIRD_RESEARCH_SYNTHESIS.md (Monitoring sections)

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

## Current State Assessment

### Existing Monitoring Infrastructure

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

### Current Monitoring Capabilities

#### What Exists Today

| Component | Capability | Access Method | Limitations |
|-----------|------------|---------------|-------------|
| **n8n Built-in** | Execution history | Web UI | 7-day retention, manual review only |
| **n8n API** | Execution metrics | REST API | Requires polling, no aggregation |
| **Health Endpoint** | Binary up/down | HTTP GET /healthz | No dependency health |
| **Console Logs** | Application events | Stdout/Files | No centralization, ephemeral |
| **Runbooks** | Incident procedures | Documentation | Manual execution required |

---

## Gap Analysis: The Three Pillars

### 1. Metrics Pillar

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

### 2. Logs Pillar

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

### 3. Tracing Pillar

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

---

## Alerting Strategy

### Alert Severity Framework

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

### Alert Threshold Matrix

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

---

## Observability Stack Recommendations

### Recommended Architecture

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

### Component Selection

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

---

## Implementation Phases

### Phase 1: Foundation (Week 1-2) - $0

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

### Phase 2: Log Aggregation (Week 3-4) - $0-50/mo

```yaml
phase_2_deliverables:
  - name: "Loki + Promtail"
    deployment: "Docker Compose"
    
  - name: "Structured Logging"
    format: "JSON with correlation IDs"
    
  - name: "Log-based Alerts"
    patterns:
      - "authentication_failure"
      - "rate_limit_exceeded"
      - "circuit_breaker_opened"
```

---

**Original Document:** [MONITORING_OBSERVABILITY_DEEP_DIVE.md](/MONITORING_OBSERVABILITY_DEEP_DIVE.md)
