# Log Aggregation with Loki: Research and Implementation Guide

**Project:** n8n + Twenty CRM System  
**Phase:** 2 - Log Aggregation Infrastructure  
**Document Version:** 1.0  
**Last Updated:** March 19, 2026  
**Owner:** Site Reliability Engineering Team  

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Loki Architecture Overview](#2-loki-architecture-overview)
3. [Deployment Options Analysis](#3-deployment-options-analysis)
4. [Recommended Deployment Architecture](#4-recommended-deployment-architecture)
5. [Configuration Files](#5-configuration-files)
6. [Log Schema Design](#6-log-schema-design)
7. [LogQL Query Examples](#7-logql-query-examples)
8. [Alerting Rules](#8-alerting-rules)
9. [Integration with Current Monitoring](#9-integration-with-current-monitoring)
10. [Implementation Plan](#10-implementation-plan)
11. [Cost Analysis](#11-cost-analysis)

---

## 1. Executive Summary

### Current State
- Logs are only accessible through n8n UI
- No centralized log aggregation
- Cannot search across workflow executions
- No log-based alerting capabilities
- Limited visibility into error patterns

### Proposed Solution
Implement **Grafana Loki** as the central log aggregation system with the following characteristics:

| Feature | Benefit |
|---------|---------|
| Label-based indexing | Efficient storage and fast queries |
| LogQL query language | Powerful log analysis and pattern detection |
| Native Grafana integration | Unified metrics and logs visualization |
| Cloud-native design | Scalable on GCP infrastructure |
| Cost-effective storage | 10x cheaper than full-text indexing |

### Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Deployment Model | **Grafana Cloud Loki** (Managed) | Zero operational overhead, instant scaling |
| Log Shipper | **Promtail** | Native Loki integration, Docker-aware |
| Storage | GCS (fallback) | Cost-effective long-term retention |
| Retention | 30 days hot, 1 year cold | Balance cost vs compliance needs |

### Expected Outcomes

```
Benefits:
├── Search across all workflow executions in <2s
├── Correlate logs with metrics in single dashboard
├── Proactive alerting on error patterns
├── Root cause analysis time reduced by 70%
└── Compliance-ready audit trails
```

---

## 2. Loki Architecture Overview

### 2.1 Core Components

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          Loki Architecture                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌───────────┐ │
│  │  Clients    │───▶│ Distributor │───▶│  Ingester   │───▶│   Store   │ │
│  │ (Promtail)  │    │             │    │             │    │           │ │
│  └─────────────┘    └─────────────┘    └─────────────┘    └─────┬─────┘ │
│         │                              │                        │       │
│         │                              │                        │       │
│         ▼                              ▼                        ▼       │
│  ┌─────────────┐                ┌─────────────┐           ┌───────────┐ │
│  │   Grafana   │◀───────────────│   Querier   │◀──────────│  Index    │ │
│  │             │    LogQL       │             │           │  Store    │ │
│  └─────────────┘                └─────────────┘           └───────────┘ │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

#### Component Responsibilities

| Component | Function | Scaling Characteristic |
|-----------|----------|----------------------|
| **Distributor** | Validates, sanitizes, and forwards log streams to ingesters | Stateless, horizontally scalable |
| **Ingester** | Batches log entries into chunks and writes to storage | Stateful, requires careful handoff |
| **Querier** | Executes LogQL queries, fetches chunks from storage | Stateless, horizontally scalable |
| **Store** | Long-term storage backend (GCS/S3/filesystem) | Managed by cloud provider |
| **Index** | Index storage for labels (Bigtable/DynamoDB/Cassandra) | Managed service preferred |

### 2.2 Label-Based Indexing

Unlike Elasticsearch which indexes the full log content, Loki only indexes **labels**:

```
Traditional Indexing (Elasticsearch):
┌────────────────────────────────────────────────────────┐
│ Every word indexed → High memory usage, slower writes  │
│ Index size ≈ 50-100% of raw log volume                 │
└────────────────────────────────────────────────────────┘

Loki Label-Based Indexing:
┌────────────────────────────────────────────────────────┐
│ Only labels indexed → Low memory, fast writes          │
│ Index size ≈ 0.5-1% of raw log volume                  │
│ Content searched at query time (parallel)              │
└────────────────────────────────────────────────────────┘
```

#### Label Design Best Practices

```yaml
# High Cardinality (BAD - Creates too many streams)
labels:
  - user_id      # Unlimited unique values
  - request_id   # Unique per request
  - timestamp    # Changes every millisecond

# Good Cardinality (GOOD - Controlled unique values)
labels:
  - service      # n8n, twenty-crm, nginx
  - environment  # production, staging
  - level        # error, warn, info, debug
  - workflow     # consultation-form, demo-booking
```

### 2.3 LogQL Query Language

LogQL is Loki's query language combining Prometheus-style selectors with log filtering.

#### Basic Syntax

```logql
# Select logs from a service
{service="n8n"}

# Select with multiple labels
{service="n8n", environment="production", level="error"}

# Filter with regex
{service="n8n"} |= "execution failed" |~ "workflow.*consultation"

# Parse JSON and filter
{service="n8n"} 
  | json 
  | workflow_name="consultation-form" 
  | status="failed"
```

#### Query Types

| Type | Purpose | Example |
|------|---------|---------|
| **Range queries** | Logs over time | `{service="n8n"}[5m]` |
| **Filter queries** | Search patterns | `\|= "error" \|~ "timeout\|failed"` |
| **Parser queries** | Extract fields | `\| json \| line_format "{{.message}}"` |
| **Metric queries** | Aggregate to metrics | `rate({level="error"}[5m])` |

---

## 3. Deployment Options Analysis

### 3.1 Option A: Self-Hosted Loki (Docker Compose)

```yaml
# docker-compose.logging.yml
version: '3.8'

services:
  loki:
    image: grafana/loki:2.9.4
    ports:
      - "3100:3100"
    volumes:
      - ./config/loki.yml:/etc/loki/local-config.yaml
      - loki-data:/loki
    command: -config.file=/etc/loki/local-config.yaml
    networks:
      - monitoring

  promtail:
    image: grafana/promtail:2.9.4
    volumes:
      - ./config/promtail.yml:/etc/promtail/config.yml
      - /var/log:/var/log:ro
      - /var/lib/docker/containers:/var/lib/docker/containers:ro
    command: -config.file=/etc/promtail/config.yml
    networks:
      - monitoring

volumes:
  loki-data:

networks:
  monitoring:
    external: true
```

**Pros:**
- Full control over configuration
- No external dependencies
- Predictable costs for small deployments

**Cons:**
- Operational overhead (backups, updates, scaling)
- Single point of failure in single-instance mode
- Manual capacity planning required

**Cost Estimate:** $50-100/month (VM + storage)

---

### 3.2 Option B: Grafana Cloud Loki (Managed)

```yaml
# promtail-cloud-config.yml
# Ships logs directly to Grafana Cloud

clients:
  - url: https://logs-prod-us-central1.grafana.net/loki/api/v1/push
    basic_auth:
      username: ${GRAFANA_CLOUD_LOKI_USER}
      password: ${GRAFANA_CLOUD_API_KEY}
    
    # Batch settings for efficiency
    batchwait: 1s
    batchsize: 102400
    
    # Retry configuration
    backoff_config:
      min_period: 100ms
      max_period: 5s
      max_retries: 10
```

**Pros:**
- Zero operational overhead
- Automatic scaling
- Built-in high availability
- Integrated with Grafana Cloud

**Cons:**
- Per-GB ingestion costs
- Data egress considerations
- Vendor lock-in

**Cost Estimate:** 
- 10GB/day ingestion: ~$100/month
- 50GB/day ingestion: ~$400/month

---

### 3.3 Option C: GKE with Loki Helm Chart

```yaml
# loki-values-gke.yaml
loki:
  auth_enabled: false
  
  storage:
    type: gcs
    gcs:
      bucket_name: zaplit-loki-logs
      
  # Use GCS for index and chunks
  schema_config:
    configs:
      - from: 2026-01-01
        store: gcs
        object_store: gcs
        schema: v12
        index:
          prefix: loki_index_
          period: 24h

ingester:
  replicas: 2
  persistence:
    enabled: true
    size: 10Gi

distributor:
  replicas: 2

querier:
  replicas: 2
  persistence:
    enabled: true
    size: 10Gi
    
query_frontend:
  replicas: 2
```

**Pros:**
- Kubernetes-native
- Horizontal scaling
- GCS integration for cost-effective storage

**Cons:**
- Requires GKE cluster (or adds complexity)
- Kubernetes operational expertise needed
- Higher baseline cost

**Cost Estimate:** $200-400/month (GKE + GCS)

---

### 3.4 Deployment Recommendation

**Recommended: Option B - Grafana Cloud Loki (Managed)**

| Factor | Score | Rationale |
|--------|-------|-----------|
| Operational Simplicity | 10/10 | No infrastructure to manage |
| Time to Value | 10/10 | Deploy in hours, not days |
| Scalability | 9/10 | Automatic scaling |
| Cost (Initial) | 8/10 | Pay for what you use |
| Integration | 10/10 | Native Grafana integration |
| **Overall** | **9.4/10** | Best fit for current needs |

**Migration Path:**
```
Phase 1: Grafana Cloud Loki (Immediate)
  └── Start shipping logs within hours
  
Phase 2: GKE Self-Hosted (Future, if needed)
  └── Migrate if costs exceed $500/month
  └── Or if data residency requirements change
```

---

## 4. Recommended Deployment Architecture

### 4.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Log Aggregation Architecture                       │
│                              (Grafana Cloud Loki)                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                         GCP Project (zaplit-prod)                     │   │
│  │                                                                      │   │
│  │   ┌──────────────┐      ┌──────────────┐      ┌──────────────┐      │   │
│  │   │   n8n VM     │      │   Promtail   │      │  Postgres    │      │   │
│  │   │  (Container) │─────▶│   (Agent)    │      │  (Logs via   │      │   │
│  │   │              │      │              │◀─────│   pg_audit)  │      │   │
│  │   └──────────────┘      └──────┬───────┘      └──────────────┘      │   │
│  │                                │                                     │   │
│  │   ┌──────────────┐            │                                      │   │
│  │   │   Twenty CRM │            │                                      │   │
│  │   │   (Container)│───────────▶│                                      │   │
│  │   │              │            │                                      │   │
│  │   └──────────────┘            │                                      │   │
│  │                                │                                      │   │
│  │   ┌──────────────┐            │                                      │   │
│  │   │    Nginx     │            │                                      │   │
│  │   │   (Reverse   │───────────▶│                                      │   │
│  │   │    Proxy)    │            │                                      │   │
│  │   └──────────────┘            │                                      │   │
│  │                                │                                      │   │
│  │   ┌──────────────┐            │                                      │   │
│  │   │ System Logs  │            │                                      │   │
│  │   │  (/var/log)  │───────────▶│                                      │   │
│  │   └──────────────┘            │                                      │   │
│  │                                │                                      │   │
│  └────────────────────────────────┼──────────────────────────────────────┘   │
│                                   │                                          │
│                                   ▼                                          │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                    Grafana Cloud (Managed)                            │   │
│  │  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐              │   │
│  │  │    Loki     │◀───│  Distributor│◀───│   Promtail  │              │   │
│  │  │   (Store)   │    │             │    │   (Remote)  │              │   │
│  │  └──────┬──────┘    └─────────────┘    └─────────────┘              │   │
│  │         │                                                           │   │
│  │         ▼                                                           │   │
│  │  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐              │   │
│  │  │   Grafana   │◀───│   Querier   │◀───│    Index    │              │   │
│  │  │ (Dashboard) │    │             │    │             │              │   │
│  │  └─────────────┘    └─────────────┘    └─────────────┘              │   │
│  │                                                                      │   │
│  │  ┌──────────────────────────────────────────────────────────────┐   │   │
│  │  │                   Alert Manager                               │   │   │
│  │  │  (Routes log-based alerts to PagerDuty/Slack/Email)         │   │   │
│  │  └──────────────────────────────────────────────────────────────┘   │   │
│  │                                                                      │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Network Flow

```
Log Flow:
1. Application logs to stdout/stderr (Docker)
2. Docker json-file driver persists logs
3. Promtail tails Docker container logs
4. Promtail adds labels and batches logs
5. Promtail pushes to Grafana Cloud Loki
6. Loki stores in managed object storage
7. Grafana queries Loki for visualization

Security:
- TLS 1.3 for all external communication
- API key authentication to Grafana Cloud
- No sensitive data in log labels
- Log scrubbing for PII (optional)
```

---

## 5. Configuration Files

### 5.1 Promtail Configuration

```yaml
# /etc/promtail/promtail.yml
# Promtail configuration for shipping logs to Grafana Cloud Loki

server:
  http_listen_port: 9080
  grpc_listen_port: 0
  log_level: info

positions:
  filename: /tmp/positions.yaml
  sync_period: 10s

clients:
  - url: https://${GRAFANA_CLOUD_LOKI_HOST}/loki/api/v1/push
    basic_auth:
      username: ${GRAFANA_CLOUD_LOKI_USER}
      password: ${GRAFANA_CLOUD_API_KEY}
    
    # Batch settings
    batchwait: 1s
    batchsize: 102400
    
    # Timeout configuration
    timeout: 10s
    
    # Retry with backoff
    backoff_config:
      min_period: 100ms
      max_period: 5s
      max_retries: 10
    
    # External labels applied to all logs
    external_labels:
      cluster: zaplit-prod
      region: us-central1

scrape_configs:
  # ============================================
  # n8n Container Logs
  # ============================================
  - job_name: n8n-containers
    static_configs:
      - targets:
          - localhost
        labels:
          job: n8n
          service: n8n
          __path__: /var/lib/docker/containers/*/*-json.log
    
    pipeline_stages:
      # Parse Docker JSON logs
      - json:
          expressions:
            log: log
            stream: stream
            timestamp: time
      
      # Set the timestamp from the log
      - timestamp:
          source: timestamp
          format: RFC3339Nano
      
      # Parse n8n log format (if structured)
      - json:
          source: log
          expressions:
            level: level
            workflow_id: workflowId
            workflow_name: workflowName
            execution_id: executionId
            message: msg
            error: err
      
      # Add level label from parsed log
      - labels:
          level:
          workflow_name:
      
      # Clean up the output line
      - output:
          source: log
      
      # Drop debug logs in production (optional)
      - drop:
          source: level
          value: debug
          drop_counter_reason: debug_logs_filtered

  # ============================================
  # Twenty CRM Container Logs
  # ============================================
  - job_name: twenty-crm-containers
    static_configs:
      - targets:
          - localhost
        labels:
          job: twenty-crm
          service: twenty-crm
          __path__: /var/lib/docker/containers/twenty*/*-json.log
    
    pipeline_stages:
      - json:
          expressions:
            log: log
            stream: stream
            timestamp: time
      
      - timestamp:
          source: timestamp
          format: RFC3339Nano
      
      # Twenty CRM log parsing
      - regex:
          source: log
          expression: '(?P<timestamp>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d+Z)\s+(?P<level>\w+)\s+(?P<message>.*)'
      
      - labels:
          level:
      
      - output:
          source: message

  # ============================================
  # Nginx Access Logs
  # ============================================
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
          expression: '^(?P<remote_addr>\S+) - (?P<remote_user>\S+) \[(?P<time_local>[^\]]+)\] "(?P<request>\S+ \S+ \S+)" (?P<status>\d{3}) (?P<body_bytes_sent>\d+) "(?P<http_referer>[^"]+)" "(?P<http_user_agent>[^"]+)"'
      
      - timestamp:
          source: time_local
          format: "02/Jan/2006:15:04:05 -0700"
      
      - labels:
          status:
          method:
      
      - output:
          source: request

  # ============================================
  # Nginx Error Logs
  # ============================================
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
          expression: '^(?P<time>\d{4}/\d{2}/\d{2} \d{2}:\d{2}:\d{2}) \[(?P<level>\w+)\] (?P<pid>\d+)#(?P<tid>\d+): (?P<message>.*)$'
      
      - timestamp:
          source: time
          format: "2006/01/02 15:04:05"
      
      - labels:
          level:

  # ============================================
  # System Logs (syslog)
  # ============================================
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
          expression: '^(?P<timestamp>\w{3}\s+\d{1,2} \d{2}:\d{2}:\d{2}) (?P<hostname>\S+) (?P<service>\S+): (?P<message>.*)$'
      
      - timestamp:
          source: timestamp
          format: "Jan 2 15:04:05"
      
      - labels:
          service:

  # ============================================
  # Journald (systemd services)
  # ============================================
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
```

### 5.2 Loki Configuration (Self-Hosted Reference)

```yaml
# /etc/loki/loki.yml
# Reference configuration for self-hosted Loki
# (Not needed for Grafana Cloud, but useful for migration)

auth_enabled: false

server:
  http_listen_port: 3100
  grpc_listen_port: 9096
  log_level: info
  # Graceful shutdown
  http_server_read_timeout: 30s
  http_server_write_timeout: 30s
  http_server_idle_timeout: 120s

common:
  path_prefix: /loki
  storage:
    filesystem:
      chunks_directory: /loki/chunks
      rules_directory: /loki/rules
  replication_factor: 1
  ring:
    instance_addr: 127.0.0.1
    kvstore:
      store: inmemory

# Storage configuration (for GCS migration)
storage_config:
  gcs:
    bucket_name: zaplit-loki-logs
    # Use workload identity or service account
  
  # For index storage
  boltdb_shipper:
    active_index_directory: /loki/index
    cache_location: /loki/cache
    cache_ttl: 24h
    shared_store: gcs

schema_config:
  configs:
    - from: 2026-01-01
      store: boltdb-shipper
      object_store: gcs
      schema: v12
      index:
        prefix: index_
        period: 24h

# Compactor for retention
compactor:
  working_directory: /loki/compactor
  shared_store: gcs
  compaction_interval: 10m
  retention_enabled: true
  retention_delete_delay: 2h
  retention_delete_worker_count: 150

# Retention configuration
limits_config:
  reject_old_samples: true
  reject_old_samples_max_age: 168h  # 7 days
  retention_period: 720h  # 30 days
  ingestion_rate_mb: 10
  ingestion_burst_size_mb: 20
  per_stream_rate_limit: 3MB
  per_stream_rate_limit_burst: 15MB
  max_global_streams_per_user: 5000
  max_chunks_per_query: 2000000
  max_query_length: 721h  # 30 days + 1h
  max_query_parallelism: 32
  
# Chunk configuration
chunk_store_config:
  max_look_back_period: 720h
  
# Table manager (for index tables)
table_manager:
  retention_deletes_enabled: true
  retention_period: 720h

# Query frontend (for caching)
query_frontend:
  compress_responses: true
  max_outstanding_per_tenant: 2048
  
  # Cache configuration
  cache_results: true
  results_cache:
    cache:
      enable_fifocache: true
      fifocache:
        max_size_bytes: 1073741824  # 1GB
        ttl: 1h

# Query scheduler
query_scheduler:
  max_outstanding_requests_per_tenant: 2048

# Analytics
tracing:
  enabled: true
  
analytics:
  reporting_enabled: false  # Disable for privacy
```

### 5.3 Grafana Data Source Configuration

```yaml
# provisioning/datasources/loki.yml
# Configure Loki as a Grafana data source

apiVersion: 1

datasources:
  - name: Loki
    type: loki
    access: proxy
    url: https://logs-prod-us-central1.grafana.net  # Grafana Cloud
    
    # Authentication
    basicAuth: true
    basicAuthUser: ${GRAFANA_CLOUD_LOKI_USER}
    secureJsonData:
      basicAuthPassword: ${GRAFANA_CLOUD_API_KEY}
    
    # Datasource settings
    isDefault: false
    editable: false
    
    jsonData:
      # Maximum lines to return
      maxLines: 1000
      
      # Derived fields for linking to traces
      derivedFields:
        - name: "TraceID"
          matcherRegex: '"trace_id":"(\w+)"'
          url: '$${__value.raw}'
          datasourceUid: tempo  # If using Tempo for tracing
      
      # Timeout settings
      timeout: 30
      
      # Query timeout
      queryTimeout: 60s

  # Alternative: Self-hosted Loki
  - name: Loki-Local
    type: loki
    access: proxy
    url: http://loki:3100
    isDefault: false
    editable: false
    jsonData:
      maxLines: 1000
```

### 5.4 Environment Variables Template

```bash
# .env.loki - Environment variables for Loki integration
# DO NOT COMMIT THIS FILE - Add to .gitignore

# ============================================
# Grafana Cloud Configuration
# ============================================

# Get these from Grafana Cloud portal:
# https://grafana.com/orgs/<org>/stacks/<stack>

GRAFANA_CLOUD_LOKI_HOST=logs-prod-us-central1.grafana.net
GRAFANA_CLOUD_LOKI_USER=123456  # Your Loki instance ID
GRAFANA_CLOUD_API_KEY=glc_ey... # Your Grafana Cloud API key

# Alternative: Use token-based auth
GRAFANA_CLOUD_TOKEN=<your-token>

# ============================================
# Promtail Configuration
# ============================================

PROMTAIL_HTTP_PORT=9080
PROMTAIL_LOG_LEVEL=info

# Position file (tracks read position)
PROMTAIL_POSITIONS_FILE=/var/lib/promtail/positions.yaml

# Batch settings
PROMTAIL_BATCH_WAIT=1s
PROMTAIL_BATCH_SIZE=102400

# ============================================
# Label Configuration
# ============================================

# External labels added to all logs
CLUSTER_NAME=zaplit-prod
REGION=us-central1
ENVIRONMENT=production

# ============================================
# Retention Settings
# ============================================

LOKI_RETENTION_DAYS=30
COLD_STORAGE_DAYS=365

# ============================================
# Alert Configuration
# ============================================

# Alert webhook URLs
ALERT_SLACK_WEBHOOK=https://hooks.slack.com/services/...
ALERT_PAGERDUTY_KEY=<pagerduty-integration-key>
```

---

## 6. Log Schema Design

### 6.1 Label Schema (High Cardinality Control)

Labels are indexed and should have **low cardinality**:

```yaml
# Core Labels (Always Present)
labels:
  cluster: "zaplit-prod"           # Cluster identifier
  environment: "production"         # Environment name
  service: "n8n"                   # Service name (n8n, twenty-crm, nginx)
  job: "n8n-containers"            # Scrape job name

# Service-Specific Labels (Controlled Cardinality)
labels:
  # n8n specific
  workflow_name: "consultation-form"  # Workflow name (limited set)
  workflow_id: "xyz123"               # Workflow ID (only if needed)
  execution_mode: "webhook"           # webhook, schedule, manual, trigger
  
  # Log level (4 values)
  level: "error"                      # debug, info, warn, error
  
  # Component (limited set)
  component: "webhook-handler"        # webhook-handler, execution-engine, etc

# Infrastructure Labels
labels:
  instance: "n8n-vm-01"              # VM instance name
  region: "us-central1"              # GCP region
  zone: "us-central1-a"              # GCP zone
```

### 6.2 Structured Log Format (JSON Lines)

Applications should output structured JSON logs:

```json
{
  "timestamp": "2026-03-19T18:51:12.487Z",
  "level": "error",
  "service": "n8n",
  "component": "webhook-handler",
  "trace_id": "abc123def456",
  "span_id": "span789",
  "workflow": {
    "id": " workflow-xyz",
    "name": "consultation-form",
    "version": "1.2.3"
  },
  "execution": {
    "id": "exec-789",
    "mode": "webhook",
    "start_time": "2026-03-19T18:51:10.123Z",
    "duration_ms": 2364
  },
  "request": {
    "method": "POST",
    "path": "/webhook/consultation",
    "remote_ip": "192.168.1.100",
    "user_agent": "Mozilla/5.0..."
  },
  "error": {
    "type": "ValidationError",
    "message": "Invalid email format",
    "code": "E001",
    "stack": "Error: Invalid email..."
  },
  "context": {
    "node_id": "validate-email",
    "node_type": "Function",
    "attempt": 1,
    "max_retries": 3
  },
  "metadata": {
    "version": "1.0.0",
    "environment": "production"
  }
}
```

### 6.3 Log Line Format by Service

#### n8n Logs

```json
{
  "ts": "2026-03-19T18:51:12.487Z",
  "level": "info",
  "workflowId": "abc123",
  "workflowName": "consultation-form",
  "executionId": "exec-456",
  "msg": "Webhook received",
  "node": "Webhook",
  "data": {
    "method": "POST",
    "path": "/webhook/consultation"
  }
}
```

#### Twenty CRM Logs

```json
{
  "timestamp": "2026-03-19T18:51:12.487Z",
  "level": "info",
  "service": "twenty-crm",
  "requestId": "req-789",
  "userId": "user-123",
  "action": "person.create",
  "duration": 45,
  "status": "success"
}
```

#### Nginx Access Logs

```json
{
  "timestamp": "2026-03-19T18:51:12.487Z",
  "remote_addr": "192.168.1.100",
  "remote_user": "-",
  "request": "POST /webhook/consultation HTTP/1.1",
  "status": 200,
  "body_bytes_sent": 456,
  "request_time": 2.345,
  "http_referer": "https://zaplit.com/contact",
  "http_user_agent": "Mozilla/5.0...",
  "trace_id": "abc123"
}
```

### 6.4 Retention Policies

```yaml
# Retention tiers based on log type

retention_policies:
  # Hot storage - Fast queries, expensive
  hot:
    duration: 7d
    storage: ssd
    queryable: true
    
  # Warm storage - Balanced
  warm:
    duration: 23d  # 30 days total
    storage: standard
    queryable: true
    
  # Cold storage - Archive, cheap
  cold:
    duration: 335d  # 1 year total
    storage: nearline
    queryable: false  # Restore required
    
  # Permanent - Compliance
  archive:
    duration: 2555d  # 7 years
    storage: coldline
    queryable: false

# Service-specific retention
service_retention:
  n8n:
    hot: 7d
    warm: 23d
    cold: 335d
    
  twenty-crm:
    hot: 7d
    warm: 23d
    cold: 335d
    
  nginx:
    hot: 3d    # Less critical
    warm: 27d
    cold: 0d   # Delete after 30 days
    
  system:
    hot: 7d
    warm: 23d
    cold: 0d
```

---

## 7. LogQL Query Examples

### 7.1 Basic Queries

```logql
# All n8n logs
{service="n8n"}

# All error logs
{level="error"}

# n8n errors only
{service="n8n", level="error"}

# Specific workflow
{service="n8n", workflow_name="consultation-form"}
```

### 7.2 Filtering Queries

```logql
# Contains string
{service="n8n"} |= "execution failed"

# Does not contain
{service="n8n"} != "debug"

# Regex match
{service="n8n"} |~ "(error|failed|exception)"

# Regex exclude
{service="n8n"} !~ "success|completed"

# Case-insensitive (use (?i) flag in regex)
{service="n8n"} |~ "(?i)error"

# Multiple filters (pipeline)
{service="n8n"} 
  |= "webhook" 
  |~ "POST|PUT" 
  != "healthcheck"
```

### 7.3 Parsing Queries

```logql
# Parse JSON logs
{service="n8n"} 
  | json 
  | workflow_name="consultation-form"
  | line_format "{{.ts}} - {{.level}} - {{.msg}}"

# Parse with specific fields
{service="n8n"} 
  | json workflowId, executionId, level, msg
  | executionId="exec-123"

# Extract fields with regex
{service="nginx"} 
  | regexp "(?P<method>\w+) (?P<path>\S+) HTTP/(?P<version>\d\.\d)" 
  | method="POST"

# Pattern extraction
{service="n8n"} 
  | pattern "<_> level=<level> <_> msg=<message>"
  | level="error"
```

### 7.4 Metric Queries (Log-to-Metric)

```logql
# Error rate per minute
sum(rate({level="error"}[1m])) by (service)

# Workflow execution rate
sum(rate({service="n8n"} | json | workflow_name="consultation-form"[5m]))

# 95th percentile response time from nginx logs
histogram_quantile(0.95, 
  sum(rate({service="nginx"} 
    | json 
    | unwrap request_time [5m]
  )) by (le)
)

# Top 5 error messages
sum by (msg) (
  rate({service="n8n", level="error"} 
    | json msg [5m]
  )
)
```

### 7.5 Common Scenarios

```logql
# Find slow webhook responses
{service="nginx"} 
  | json 
  | path=~"/webhook.*" 
  | request_time > 5

# Track CRM API failures
{service="n8n"} 
  | json 
  | msg=~"CRM.*failed"
  | line_format "{{.ts}} - Workflow: {{.workflowName}} - {{.msg}}"

# Failed executions by workflow
sum by (workflow_name) (
  rate({service="n8n", level="error"} 
    | json workflow_name [1h]
  )
)

# Webhook 4xx errors
{service="nginx"} 
  | json 
  | status >= 400 
  | status < 500
  | line_format "{{.remote_addr}} - {{.request}} - {{.status}}"

# Database connection errors
{service="n8n"} 
  |~ "ECONNREFUSED|connection.*refused|timeout"
```

### 7.6 Time Range Queries

```logql
# Last 5 minutes
{service="n8n"}[5m]

# Last hour
{service="n8n"}[1h]

# Specific time range
{service="n8n"} 
  | json 
  | ts > "2026-03-19T18:00:00Z" 
  | ts < "2026-03-19T19:00:00Z"

# Yesterday's errors
sum(
  rate({level="error"}[24h])
)
```

---

## 8. Alerting Rules

### 8.1 LogQL-Based Alert Rules

```yaml
# alert-rules-loki.yml
# Grafana Cloud Alert Rules for Loki

groups:
  - name: n8n-log-alerts
    interval: 1m
    rules:
      # ============================================
      # High Error Rate Alert
      # ============================================
      - alert: N8nHighErrorRate
        expr: |
          sum(rate({service="n8n", level="error"}[5m])) 
          / 
          sum(rate({service="n8n"}[5m])) > 0.05
        for: 2m
        labels:
          severity: critical
          service: n8n
          team: platform
        annotations:
          summary: "n8n error rate is high"
          description: "Error rate is {{ $value | humanizePercentage }} for the last 5 minutes"
          runbook_url: "https://wiki.internal/runbooks/n8n-high-error-rate"
          dashboard_url: "https://grafana.zaplit.com/d/n8n-logs"
      
      # ============================================
      # Specific Error Pattern - Webhook Failures
      # ============================================
      - alert: N8nWebhookFailures
        expr: |
          sum(rate({service="n8n"} 
            |= "webhook" 
            |~ "failed|error|timeout" [5m]
          )) > 0.1
        for: 1m
        labels:
          severity: critical
          service: n8n
          component: webhook
        annotations:
          summary: "Webhook processing failures detected"
          description: "{{ $value }} webhook failures per second"
      
      # ============================================
      # CRM Integration Failures
      # ============================================
      - alert: CRMIntegrationFailures
        expr: |
          sum(rate({service="n8n"} 
            | json 
            | msg=~"CRM.*(failed|error|timeout)" [5m]
          )) > 0.05
        for: 2m
        labels:
          severity: warning
          service: n8n
          integration: twenty-crm
        annotations:
          summary: "CRM integration experiencing issues"
          description: "{{ $value }} CRM failures per second"
      
      # ============================================
      # Unusual Log Volume (Possible Attack)
      # ============================================
      - alert: UnusualLogVolume
        expr: |
          (
            sum(rate({service="n8n"}[5m])) 
            > 
            2 * avg_over_time(sum(rate({service="n8n"}[5m]))[1h:5m])
          )
        for: 5m
        labels:
          severity: warning
          service: n8n
          type: anomaly
        annotations:
          summary: "Unusual log volume detected"
          description: "Log volume is 2x higher than 1h average"
      
      # ============================================
      # Database Connection Errors
      # ============================================
      - alert: DatabaseConnectionErrors
        expr: |
          sum(rate({service="n8n"} 
            |~ "ECONNREFUSED|connection.*refused|database.*unavailable" [5m]
          )) > 0
        for: 1m
        labels:
          severity: critical
          service: n8n
          component: database
        annotations:
          summary: "Database connection issues"
          description: "Database connection errors detected"
      
      # ============================================
      # Workflow Specific Alert - Consultation Form
      # ============================================
      - alert: ConsultationFormFailures
        expr: |
          sum(rate({service="n8n"} 
            | json 
            | workflow_name="consultation-form" 
            | level="error" [5m]
          )) > 0.01
        for: 2m
        labels:
          severity: critical
          service: n8n
          workflow: consultation-form
        annotations:
          summary: "Consultation form workflow failing"
          description: "{{ $value }} errors per second in consultation form"

  - name: nginx-log-alerts
    interval: 1m
    rules:
      # ============================================
      # High 5xx Rate
      # ============================================
      - alert: NginxHigh5xxRate
        expr: |
          (
            sum(rate({service="nginx"} | json | status=~"5.."[5m]))
            /
            sum(rate({service="nginx"}[5m]))
          ) > 0.01
        for: 2m
        labels:
          severity: critical
          service: nginx
        annotations:
          summary: "High 5xx error rate"
          description: "5xx rate is {{ $value | humanizePercentage }}"
      
      # ============================================
      # Slow Response Time
      # ============================================
      - alert: NginxSlowResponses
        expr: |
          histogram_quantile(0.95,
            sum(rate({service="nginx"} | json | unwrap request_time [5m])) by (le)
          ) > 5
        for: 3m
        labels:
          severity: warning
          service: nginx
        annotations:
          summary: "Slow responses detected"
          description: "p95 response time is {{ $value }}s"
      
      # ============================================
      # Rate Limiting (429 errors)
      # ============================================
      - alert: RateLimitingTriggered
        expr: |
          sum(rate({service="nginx"} | json | status="429"[5m])) > 0
        for: 1m
        labels:
          severity: info
          service: nginx
        annotations:
          summary: "Rate limiting active"
          description: "Clients are being rate limited"

  - name: system-log-alerts
    interval: 5m
    rules:
      # ============================================
      # Out of Memory Errors
      # ============================================
      - alert: OutOfMemoryErrors
        expr: |
          sum(rate({service="system"} |~ "Out of memory|OOM|killed process"[5m])) > 0
        for: 1m
        labels:
          severity: critical
          service: system
        annotations:
          summary: "Out of memory errors"
          description: "OOM killer triggered"
      
      # ============================================
      # Disk Full
      # ============================================
      - alert: DiskFull
        expr: |
          sum(rate({service="system"} |~ "No space left on device"[5m])) > 0
        for: 1m
        labels:
          severity: critical
          service: system
        annotations:
          summary: "Disk full errors"
          description: "Disk space exhausted"
```

### 8.2 Alert Routing Configuration

```yaml
# alertmanager-loki.yml
# Alert routing for Loki-based alerts

route:
  group_by: ['alertname', 'severity', 'service']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h
  receiver: default
  
  routes:
    # Critical alerts go to PagerDuty + Slack
    - match:
        severity: critical
      receiver: pagerduty-critical
      continue: true
      
    # Warning alerts to Slack only
    - match:
        severity: warning
      receiver: slack-warnings
      
    # Info alerts to Slack with different channel
    - match:
        severity: info
      receiver: slack-info
      
    # Service-specific routing
    - match:
        service: n8n
      routes:
        - match:
            workflow: consultation-form
          receiver: slack-crm-team

receivers:
  - name: default
    slack_configs:
      - api_url: '${SLACK_WEBHOOK_DEFAULT}'
        channel: '#alerts'
        title: '{{ .GroupLabels.alertname }}'
        text: '{{ .CommonAnnotations.summary }}'
        
  - name: pagerduty-critical
    pagerduty_configs:
      - service_key: '${PAGERDUTY_SERVICE_KEY}'
        description: '{{ .GroupLabels.alertname }}'
        severity: critical
        
  - name: slack-warnings
    slack_configs:
      - api_url: '${SLACK_WEBHOOK_WARNINGS}'
        channel: '#alerts-warnings'
        title: '⚠️ {{ .GroupLabels.alertname }}'
        text: '{{ .CommonAnnotations.summary }}'
        
  - name: slack-crm-team
    slack_configs:
      - api_url: '${SLACK_WEBHOOK_CRM}'
        channel: '#crm-alerts'
        title: '🔔 Workflow Alert: {{ .GroupLabels.workflow }}'
        text: '{{ .CommonAnnotations.description }}'
```

---

## 9. Integration with Current Monitoring

### 9.1 Unified Dashboard Design

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Unified n8n Monitoring Dashboard                         │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │  n8n Status  │  │ Success Rate │  │ Error Rate   │  │ p95 Latency  │   │
│  │   [Prom]     │  │   [Prom]     │  │   [Prom]     │  │   [Prom]     │   │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘   │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                    Execution Rate Graph [Prometheus]                  │   │
│  │  Shows: rate(n8n_execution_total[5m]) colored by status              │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                    Recent Error Logs [Loki]                           │   │
│  │  Query: {service="n8n", level="error"} | json | line_format...       │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌──────────────────────────────┐  ┌────────────────────────────────────┐   │
│  │   Error Rate by Workflow     │  │     Top Error Messages             │   │
│  │      [Prometheus]            │  │         [Loki]                     │   │
│  │  Shows: rate by workflow_id  │  │  Query: topk(10, error messages)   │   │
│  └──────────────────────────────┘  └────────────────────────────────────┘   │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │              Logs Volume + Error Rate Correlation                     │   │
│  │  Combines: log volume from Loki + error rate from Prometheus          │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  [Metrics Time Range] [Logs Time Range] [Auto-refresh: 30s]                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 9.2 Dashboard Panel Examples

```json
{
  "dashboard": {
    "title": "n8n Unified Monitoring",
    "panels": [
      {
        "title": "Recent Error Logs",
        "type": "logs",
        "datasource": "Loki",
        "targets": [
          {
            "expr": "{service=\"n8n\", level=\"error\"} | json | line_format \"{{.ts}} {{.workflowName}}: {{.msg}}\"",
            "refId": "A"
          }
        ],
        "options": {
          "showTime": true,
          "wrapLogMessage": true,
          "sortOrder": "Descending"
        }
      },
      {
        "title": "Error Rate (Logs-Derived)",
        "type": "timeseries",
        "datasource": "Loki",
        "targets": [
          {
            "expr": "sum(rate({service=\"n8n\", level=\"error\"}[5m]))",
            "refId": "A",
            "legendFormat": "Error Rate"
          }
        ]
      },
      {
        "title": "Top Error Messages",
        "type": "table",
        "datasource": "Loki",
        "targets": [
          {
            "expr": "topk(10, sum by (msg) (rate({service=\"n8n\", level=\"error\"} | json msg [1h])))",
            "refId": "A",
            "instant": true
          }
        ]
      }
    ]
  }
}
```

### 9.3 Correlation Between Metrics and Logs

```logql
# Example: When Prometheus alert fires for high error rate,
# this LogQL query helps investigate:

# 1. Get error context
{service="n8n", level="error"} 
  | json 
  | workflow_name="consultation-form" 
  | ts > "${ALERT_START_TIME}"

# 2. Find related traces
{service="n8n"} 
  | json 
  | trace_id="${TRACE_ID_FROM_METRIC}"

# 3. Cross-service correlation
{service=~"n8n|twenty-crm"} 
  | json 
  | trace_id="${CORRELATION_ID}"
```

### 9.4 Drill-Down Workflows

```
Alert Fires (Prometheus)
    │
    ▼
┌─────────────────────┐
│ Click Alert Link    │
│ Opens Grafana       │
└─────────┬───────────┘
          │
          ▼
┌─────────────────────────────────┐
│ Unified Dashboard Shows:        │
│ - Metric context                │
│ - Related logs (auto-filtered)  │
│ - Correlated traces             │
└─────────┬───────────────────────┘
          │
          ▼
┌─────────────────────────────────┐
│ Click on specific log line      │
│ Shows:                          │
│ - Full log context              │
│ - Adjacent logs                 │
│ - Link to explore more          │
└─────────┬───────────────────────┘
          │
          ▼
┌─────────────────────────────────┐
│ Explore view for deep analysis  │
│ - Arbitrary LogQL queries       │
│ - Time range adjustment         │
│ - Export/share findings         │
└─────────────────────────────────┘
```

---

## 10. Implementation Plan

### 10.1 Phase 1: Foundation (Week 1)

| Task | Owner | Duration | Deliverable |
|------|-------|----------|-------------|
| Create Grafana Cloud account | SRE | 1 day | Account provisioned |
| Generate API keys | SRE | 1 day | Keys in secret manager |
| Deploy Promtail to n8n VM | SRE | 2 days | Logs flowing to Loki |
| Verify log ingestion | SRE | 1 day | Ingestion dashboard OK |

**Success Criteria:**
- Logs visible in Grafana Explore
- Basic LogQL queries working
- No performance impact on n8n

### 10.2 Phase 2: Dashboards (Week 2)

| Task | Owner | Duration | Deliverable |
|------|-------|----------|-------------|
| Create unified dashboard | SRE | 2 days | Dashboard published |
| Add log panels | SRE | 1 day | Panels showing real data |
| Add correlation features | SRE | 2 days | Drill-down working |

**Success Criteria:**
- Dashboard shows metrics + logs together
- Drill-down from alerts to logs works
- Team trained on usage

### 10.3 Phase 3: Alerting (Week 3)

| Task | Owner | Duration | Deliverable |
|------|-------|----------|-------------|
| Create log-based alert rules | SRE | 2 days | Rules deployed |
| Configure alert routing | SRE | 1 day | Routing tested |
| Test alert scenarios | SRE | 2 days | Tests passed |

**Success Criteria:**
- All critical alerts working
- False positive rate < 5%
- Alert response SLO met

### 10.4 Phase 4: Optimization (Week 4)

| Task | Owner | Duration | Deliverable |
|------|-------|----------|-------------|
| Tune label cardinality | SRE | 2 days | Stream count optimized |
| Implement retention policies | SRE | 1 day | Policies active |
| Document runbooks | SRE | 2 days | Runbooks published |

**Success Criteria:**
- Query performance < 2s
- Cost within budget
- Team self-sufficient

### 10.5 Rollback Plan

```yaml
rollback_triggers:
  - metric: n8n_response_time_p95
    threshold: "> 10s"
    duration: 5m
    
  - metric: n8n_error_rate
    threshold: "> 20%"
    duration: 2m
    
  - metric: log_ingestion_rate
    threshold: "< 50%"
    duration: 10m

rollback_procedure:
  1: Stop promtail service
  2: Verify n8n performance recovers
  3: Diagnose issue
  4: Fix and re-deploy
  5: Verify logs flowing again
```

---

## 11. Cost Analysis

### 11.1 Grafana Cloud Loki Pricing

| Tier | Logs/Day | Retention | Cost/Month |
|------|----------|-----------|------------|
| Free | 50GB | 7 days | $0 |
| Pay-as-you-go | 10GB | 30 days | ~$100 |
| Pay-as-you-go | 50GB | 30 days | ~$400 |
| Pay-as-you-go | 100GB | 30 days | ~$750 |
| Enterprise | Custom | Custom | Custom pricing |

*Pricing as of March 2026. Check https://grafana.com/pricing/ for current rates.*

### 11.2 Self-Hosted Cost Estimate

| Component | Specs | Cost/Month |
|-----------|-------|------------|
| GCE VM (n2-standard-2) | 2 vCPU, 8GB RAM | $50 |
| GCS Storage (100GB) | Standard class | $2 |
| GCS Operations | Reads/Writes | $5 |
| Network Egress | ~50GB/month | $5 |
| **Total** | | **~$62/month** |

### 11.3 Cost Optimization Strategies

```yaml
# 1. Log Sampling (reduce volume)
promtail_config:
  pipeline_stages:
    - match:
        selector: '{service="n8n"} | json | level="debug"'
        action: drop
        drop_counter_reason: debug_sampled
        
    - match:
        selector: '{service="nginx"}'
        stages:
          # Only send 10% of 200 OK responses
          - match:
              selector: '{service="nginx"} | json | status="200"'
              action: drop
              drop_counter_reason: success_sampled

# 2. Dynamic Level Filtering
log_level_filter:
  production:
    min_level: info
  staging:
    min_level: debug

# 3. Structured Logging (more compact)
structured_vs_unstructured:
  unstructured_size: "500 bytes/log"
  structured_size: "200 bytes/log"
  savings: "60%"

# 4. Retention Tiering
retention_tiers:
  hot: 7d    # Fast, expensive
  warm: 23d  # Standard
  cold: 0d   # Delete (no archive needed)
```

### 11.4 Cost Monitoring

```logql
# Monitor ingestion rate
sum(rate({}[1h]))

# Estimate daily volume
sum(bytes_rate({}[1h])) * 24

# Top services by volume
topk(5, sum(bytes_rate({}[1h])) by (service))
```

---

## Appendix A: Deployment Scripts

### A.1 Promtail Installation Script

```bash
#!/bin/bash
# install-promtail.sh - Install Promtail on n8n VM

set -euo pipefail

PROMTAIL_VERSION="2.9.4"
GRAFANA_CLOUD_URL="${GRAFANA_CLOUD_URL:-}"
GRAFANA_CLOUD_USER="${GRAFANA_CLOUD_USER:-}"
GRAFANA_CLOUD_API_KEY="${GRAFANA_CLOUD_API_KEY:-}"

echo "=== Installing Promtail ${PROMTAIL_VERSION} ==="

# Download Promtail
cd /tmp
curl -O -L "https://github.com/grafana/loki/releases/download/v${PROMTAIL_VERSION}/promtail-linux-amd64.zip"
unzip promtail-linux-amd64.zip
chmod +x promtail-linux-amd64
sudo mv promtail-linux-amd64 /usr/local/bin/promtail

# Create directories
sudo mkdir -p /etc/promtail /var/lib/promtail

# Create config
cat > /etc/promtail/promtail.yml << 'CONFIG'
server:
  http_listen_port: 9080
  grpc_listen_port: 0

positions:
  filename: /var/lib/promtail/positions.yaml

clients:
  - url: ${GRAFANA_CLOUD_URL}/loki/api/v1/push
    basic_auth:
      username: ${GRAFANA_CLOUD_USER}
      password: ${GRAFANA_CLOUD_API_KEY}
    external_labels:
      cluster: zaplit-prod
      region: us-central1

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
CONFIG

# Create systemd service
cat > /etc/systemd/system/promtail.service << 'SERVICE'
[Unit]
Description=Promtail service
After=network.target

[Service]
Type=simple
User=root
ExecStart=/usr/local/bin/promtail -config.file=/etc/promtail/promtail.yml
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
SERVICE

# Start service
sudo systemctl daemon-reload
sudo systemctl enable promtail
sudo systemctl start promtail

echo "=== Promtail installed and started ==="
echo "Check status: sudo systemctl status promtail"
echo "View logs: sudo journalctl -u promtail -f"
```

### A.2 Docker Compose Integration

```yaml
# docker-compose.monitoring.yml
version: '3.8'

services:
  promtail:
    image: grafana/promtail:2.9.4
    container_name: promtail
    volumes:
      - ./config/promtail.yml:/etc/promtail/config.yml:ro
      - /var/log:/var/log:ro
      - /var/lib/docker/containers:/var/lib/docker/containers:ro
      - promtail-data:/var/lib/promtail
    command: -config.file=/etc/promtail/config.yml
    restart: unless-stopped
    networks:
      - monitoring
    environment:
      - GRAFANA_CLOUD_URL=${GRAFANA_CLOUD_URL}
      - GRAFANA_CLOUD_USER=${GRAFANA_CLOUD_USER}
      - GRAFANA_CLOUD_API_KEY=${GRAFANA_CLOUD_API_KEY}
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"

volumes:
  promtail-data:

networks:
  monitoring:
    external: true
```

---

## Appendix B: Troubleshooting Guide

### B.1 Common Issues

| Issue | Symptoms | Solution |
|-------|----------|----------|
| No logs in Grafana | Empty query results | Check Promtail status, verify API key |
| High memory usage | OOM errors | Reduce batch size, add label filters |
| Duplicate logs | Same log multiple times | Check positions file, verify single Promtail |
| Missing labels | Labels not appearing | Verify pipeline stages, check label cardinality |
| Slow queries | Query timeout | Add time filters, use more specific labels |

### B.2 Debug Commands

```bash
# Check Promtail status
sudo systemctl status promtail
sudo journalctl -u promtail -f

# Test config
promtail -config.file=/etc/promtail/promtail.yml -config.expand-env=true -dry-run

# View positions (where Promtail is reading)
cat /var/lib/promtail/positions.yaml

# Check log volume
sudo du -sh /var/lib/docker/containers/*

# Test Loki connection
curl -u "${GRAFANA_CLOUD_USER}:${GRAFANA_CLOUD_API_KEY}" \
  "${GRAFANA_CLOUD_URL}/loki/api/v1/label/service/values"
```

---

## Appendix C: Security Considerations

### C.1 Data Protection

```yaml
# PII scrubbing in Promtail
pipeline_stages:
  - regex:
      expression: '(?P<email>[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})'
  - replace:
      source: email
      expression: '([a-zA-Z0-9._%+-])@'
      replace: '***@'
      
  - regex:
      expression: '(?P<phone>\b\d{3}[-.]?\d{3}[-.]?\d{4}\b)'
  - replace:
      source: phone
      expression: '\d'
      replace: '*'
```

### C.2 Access Control

```yaml
# Grafana Cloud organization settings
rbac:
  - role: viewer
    permissions:
      - query_logs
      - view_dashboards
      
  - role: editor
    permissions:
      - query_logs
      - create_dashboards
      - create_alerts
      
  - role: admin
    permissions:
      - all
```

---

## Summary

This research document provides a comprehensive guide for implementing Grafana Loki as the central log aggregation system for the n8n + Twenty CRM infrastructure. The recommended approach uses **Grafana Cloud Loki** for zero operational overhead, with Promtail as the log shipper.

Key outcomes:
- Centralized log aggregation across all services
- LogQL-based querying and alerting
- Unified metrics and logs dashboards
- 70% reduction in MTTR through better log visibility
- Production-ready configurations and deployment scripts

Next step: Proceed with Phase 1 implementation (Foundation).
