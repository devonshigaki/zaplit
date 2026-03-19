# n8n Production Best Practices Research Report

**Date:** March 19, 2026  
**Purpose:** Production handoff - comprehensive guide for deploying and operating n8n in production

---

## Executive Summary

This report covers 8 critical areas for production n8n deployments:
1. Deployment architecture (Cloud Run vs VM)
2. Webhook security (HMAC, secrets)
3. Error handling and retry logic
4. Database backend selection
5. Queue mode for high-volume processing
6. Monitoring and alerting
7. Backup and disaster recovery
8. API rate limiting

---

## 1. n8n Deployment: Cloud Run vs Dedicated VM

### Recommendation: **Dedicated VM (GCP Compute Engine)**

| Factor | Cloud Run | Dedicated VM | Winner |
|--------|-----------|--------------|--------|
| **Cold start latency** | 10-30 seconds | None | VM |
| **Queue mode support** | ❌ Not supported | ✅ Full support | VM |
| **Redis connectivity** | ❌ Limited | ✅ Native | VM |
| **File system persistence** | ❌ Ephemeral | ✅ Persistent | VM |
| **Cost (high volume)** | Higher per-execution | Predictable | Depends |
| **Auto-scaling** | ✅ Native | ⚠️ Manual/Docker | Cloud Run |
| **Webhooks reliability** | ❌ Cold start drops | ✅ Always on | VM |

### Why VM is Recommended for Production

n8n's **Queue Mode** (required for high-volume processing) cannot run on Cloud Run because:
- Requires persistent Redis connection
- Needs multiple worker processes
- File system access for imports/exports
- Long-running execution processes

### Production VM Configuration

**Recommended Specs:**
```
- Instance: e2-standard-2 (2 vCPU, 8GB RAM) minimum
- OS: Ubuntu 22.04 LTS
- Disk: 50GB SSD persistent disk
- Networking: VPC with private subnet for database
```

**Docker Compose Setup:**

```yaml
# docker-compose.yml
version: '3.8'

services:
  n8n:
    image: n8nio/n8n:latest
    restart: always
    ports:
      - "127.0.0.1:5678:5678"
    environment:
      - N8N_BASIC_AUTH_ACTIVE=true
      - N8N_BASIC_AUTH_USER=${N8N_BASIC_AUTH_USER}
      - N8N_BASIC_AUTH_PASSWORD=${N8N_BASIC_AUTH_PASSWORD}
      - N8N_ENCRYPTION_KEY=${N8N_ENCRYPTION_KEY}
      - DB_TYPE=postgresdb
      - DB_POSTGRESDB_HOST=postgres
      - DB_POSTGRESDB_PORT=5432
      - DB_POSTGRESDB_DATABASE=n8n
      - DB_POSTGRESDB_USER=n8n
      - DB_POSTGRESDB_PASSWORD=${POSTGRES_PASSWORD}
      - EXECUTIONS_MODE=queue
      - QUEUE_BULL_REDIS_HOST=redis
      - QUEUE_BULL_REDIS_PORT=6379
      - QUEUE_BULL_REDIS_PASSWORD=${REDIS_PASSWORD}
      - N8N_DISABLE_PRODUCTION_MAIN_PROCESS=true
      - OFFLOAD_MANUAL_EXECUTIONS_TO_WORKERS=true
      - WEBHOOK_URL=https://n8n.yourdomain.com
      - N8N_HOST=n8n.yourdomain.com
      - N8N_PORT=5678
      - N8N_PROTOCOL=https
      - NODE_ENV=production
      - N8N_LOG_LEVEL=info
      - N8N_METRICS=true
      - N8N_METRICS_INCLUDE_API_ENDPOINTS=true
      - EXECUTIONS_TIMEOUT=3600
      - EXECUTIONS_DATA_PRUNE=true
      - EXECUTIONS_DATA_MAX_AGE=336
      - EXECUTIONS_RETRY_MAX=3
      - N8N_BLOCK_ENV_ACCESS_IN_NODE=true
      - N8N_SECURE_COOKIE=true
    volumes:
      - n8n_data:/home/node/.n8n
    depends_on:
      - postgres
      - redis
    networks:
      - n8n-network

  n8n-worker:
    image: n8nio/n8n:latest
    command: worker
    restart: always
    environment:
      - N8N_ENCRYPTION_KEY=${N8N_ENCRYPTION_KEY}
      - DB_TYPE=postgresdb
      - DB_POSTGRESDB_HOST=postgres
      - DB_POSTGRESDB_PORT=5432
      - DB_POSTGRESDB_DATABASE=n8n
      - DB_POSTGRESDB_USER=n8n
      - DB_POSTGRESDB_PASSWORD=${POSTGRES_PASSWORD}
      - EXECUTIONS_MODE=queue
      - QUEUE_BULL_REDIS_HOST=redis
      - QUEUE_BULL_REDIS_PORT=6379
      - QUEUE_BULL_REDIS_PASSWORD=${REDIS_PASSWORD}
      - N8N_RUNNERS_ENABLED=true
      - N8N_RUNNERS_MODE=external
      - N8N_WORKER_CONCURRENCY=5
    depends_on:
      - postgres
      - redis
    deploy:
      replicas: 2
    networks:
      - n8n-network

  postgres:
    image: postgres:15-alpine
    restart: always
    environment:
      - POSTGRES_USER=n8n
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
      - POSTGRES_DB=n8n
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - n8n-network

  redis:
    image: redis:7-alpine
    restart: always
    command: redis-server --appendonly yes --requirepass ${REDIS_PASSWORD}
    volumes:
      - redis_data:/data
    networks:
      - n8n-network

  caddy:
    image: caddy:2-alpine
    restart: always
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
      - caddy_config:/config
    networks:
      - n8n-network

volumes:
  n8n_data:
  postgres_data:
  redis_data:
  caddy_data:
  caddy_config:

networks:
  n8n-network:
    driver: bridge
```

**Caddyfile (Reverse Proxy):**
```
n8n.yourdomain.com {
    reverse_proxy n8n:5678
    
    # Rate limiting
    rate_limit {
        zone static_example {
            key static
            events 10
            window 1s
        }
    }
    
    # Security headers
    header {
        X-Frame-Options "SAMEORIGIN"
        X-Content-Type-Options "nosniff"
        X-XSS-Protection "1; mode=block"
        Referrer-Policy "strict-origin-when-cross-origin"
    }
}
```

---

## 2. Webhook Security Best Practices

### Security Checklist

| Layer | Implementation | Priority |
|-------|---------------|----------|
| **Transport** | HTTPS only (TLS 1.3) | Critical |
| **Authentication** | HMAC signature validation | Critical |
| **Authorization** | API keys or JWT tokens | High |
| **Network** | IP allowlisting where possible | High |
| **Rate limiting** | Per-IP throttling | High |
| **Payload validation** | Schema validation | Medium |

### HMAC Signature Verification

**n8n Webhook Node Configuration:**

```javascript
// In Webhook node: Security → Enable Signature
// Set Secret: {{$env.WEBHOOK_SECRET}}
// Default header: x-n8n-signature (HMAC-SHA256)
```

**Custom HMAC Validation (Code Node):**

```javascript
const crypto = require('crypto');

// Get secret from environment variable
const secret = $env.WEBHOOK_SECRET;

// Get signature from header
const signature = $input.first().headers['x-webhook-signature'] || 
                  $input.first().headers['x-n8n-signature'];

// Get raw payload
const payload = JSON.stringify($input.first().body);

// Compute expected signature
const expectedSignature = crypto
  .createHmac('sha256', secret)
  .update(payload)
  .digest('hex');

// Constant-time comparison to prevent timing attacks
const signatureBuffer = Buffer.from(signature, 'hex');
const expectedBuffer = Buffer.from(expectedSignature, 'hex');

if (!crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
  throw new Error('Invalid webhook signature');
}

return $input.all();
```

**Provider-Specific Examples:**

**Stripe:**
```javascript
const crypto = require('crypto');
const secret = $env.STRIPE_WEBHOOK_SECRET;
const signatureHeader = $input.first().headers['stripe-signature'];
const rawBody = $input.first().body_raw;

// Stripe uses timestamped signatures
try {
  const event = stripe.webhooks.constructEvent(rawBody, signatureHeader, secret);
  return [{ verified: true, event }];
} catch (err) {
  throw new Error(`Stripe signature verification failed: ${err.message}`);
}
```

**GitHub:**
```javascript
const crypto = require('crypto');
const secret = $env.GITHUB_WEBHOOK_SECRET;
const signature = $input.first().headers['x-hub-signature-256'];
const payload = $input.first().body_raw;

const hmac = crypto.createHmac('sha256', secret).update(payload).digest('hex');
const expected = `sha256=${hmac}`;

if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
  throw new Error('Invalid GitHub signature');
}
return $input.all();
```

### Environment Variables for Security

```bash
# .env file - NEVER commit to git
N8N_ENCRYPTION_KEY=$(openssl rand -base64 32)
WEBHOOK_SECRET=$(openssl rand -base64 24)
STRIPE_WEBHOOK_SECRET=whsec_...
GITHUB_WEBHOOK_SECRET=...
N8N_BASIC_AUTH_USER=admin
N8N_BASIC_AUTH_PASSWORD=$(openssl rand -base64 16)
```

---

## 3. Workflow Error Handling and Retry Logic

### Error Handling Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Main Workflow  │────▶│  Error Workflow  │────▶│  Notifications  │
│  (Business Logic)│     │  (Error Trigger) │     │  (Slack/Email)  │
└─────────────────┘     └──────────────────┘     └─────────────────┘
         │
         ▼
┌─────────────────┐
│  Retry Logic    │
│  (Custom Loop)  │
└─────────────────┘
```

### Node-Level Retry Configuration

```javascript
// Node Settings → Retry On Fail
{
  "retry": {
    "enabled": true,
    "maxRetries": 3,
    "retryDelay": 2000,        // Initial delay (ms)
    "exponentialBackoff": true  // Double delay each retry
  }
}
```

### Custom Retry Pattern (Advanced)

```javascript
// Retry with exponential backoff + jitter
const maxRetries = 5;
const baseDelay = 1000; // 1 second
const jitter = () => Math.random() * 500;

for (let attempt = 1; attempt <= maxRetries; attempt++) {
  try {
    // Your API call here
    const result = await callExternalAPI();
    return [{ success: true, data: result, attempt }];
  } catch (error) {
    if (attempt === maxRetries) {
      throw new Error(`Failed after ${maxRetries} attempts: ${error.message}`);
    }
    
    // Calculate delay with exponential backoff + jitter
    const delay = (baseDelay * Math.pow(2, attempt - 1)) + jitter();
    
    // Wait before retry
    await new Promise(resolve => setTimeout(resolve, delay));
  }
}
```

### Error Workflow Pattern

**Error Workflow (triggered on failure):**

```javascript
// Error Trigger node captures:
// - $json.execution.id
// - $json.execution.url
// - $json.execution.error.message
// - $json.execution.error.stack
// - $json.workflow.id
// - $json.workflow.name

// Send Slack notification
const errorMessage = {
  text: "🚨 Workflow Error",
  blocks: [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Workflow:* ${$json.workflow.name}\n*Error:* ${$json.execution.error.message}`
      }
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "View Execution" },
          url: $json.execution.url
        }
      ]
    }
  ]
};

return [errorMessage];
```

### Circuit Breaker Pattern

```javascript
// Prevent cascade failures - pause retries after N failures
const circuitBreaker = {
  failureThreshold: 5,
  recoveryTimeout: 300000, // 5 minutes
  state: 'CLOSED' // CLOSED, OPEN, HALF_OPEN
};

// Check circuit state before execution
if (circuitBreaker.state === 'OPEN') {
  const timeSinceLastFailure = Date.now() - lastFailureTime;
  if (timeSinceLastFailure < circuitBreaker.recoveryTimeout) {
    throw new Error('Circuit breaker is OPEN - service temporarily unavailable');
  }
  circuitBreaker.state = 'HALF_OPEN';
}
```

### Error Handling by HTTP Status Code

```javascript
// IF node routing based on error
const errorCode = $json.error?.code || $json.statusCode;

switch (errorCode) {
  case 429: // Rate limited
    return [{ action: 'wait_and_retry', delay: 60000 }];
  case 500:
  case 502:
  case 503:
  case 504: // Server errors
    return [{ action: 'immediate_retry', maxRetries: 3 }];
  case 401: // Auth error
    return [{ action: 'alert_and_stop', severity: 'critical' }];
  case 400: // Bad request
    return [{ action: 'log_and_skip', severity: 'warning' }];
  default:
    return [{ action: 'default_retry', maxRetries: 3 }];
}
```

---

## 4. Database Backend: SQLite vs PostgreSQL

### Decision Matrix

| Factor | SQLite | PostgreSQL |
|--------|--------|------------|
| **Concurrent writes** | ❌ File lock bottleneck | ✅ Row-level locking |
| **Queue mode** | ❌ Not supported | ✅ Required |
| **Daily executions** | < 5,000 | Unlimited |
| **Concurrent workflows** | < 15 | 50+ |
| **Backup consistency** | ⚠️ Risk of corruption | ✅ pg_dump, WAL |
| **Data pruning** | ❌ Manual | ✅ Automated |
| **Memory usage** | Low | Medium |
| **Setup complexity** | Zero | Low |

### Recommendation: **PostgreSQL for ALL production deployments**

### PostgreSQL Configuration

```yaml
# docker-compose.yml postgres service
postgres:
  image: postgres:15-alpine
  restart: always
  environment:
    - POSTGRES_USER=n8n
    - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
    - POSTGRES_DB=n8n
    - POSTGRES_INITDB_ARGS=--encoding=UTF-8 --lc-collate=C --lc-ctype=C
  command: >
    postgres
    -c max_connections=200
    -c shared_buffers=512MB
    -c effective_cache_size=1536MB
    -c maintenance_work_mem=128MB
    -c checkpoint_completion_target=0.9
    -c wal_buffers=16MB
    -c default_statistics_target=100
    -c random_page_cost=1.1
    -c effective_io_concurrency=200
    -c work_mem=5242kB
    -c min_wal_size=1GB
    -c max_wal_size=4GB
  volumes:
    - postgres_data:/var/lib/postgresql/data
    - ./backups:/backups
  networks:
    - n8n-network
```

### Database Maintenance

```bash
# Automated pruning (set in n8n environment)
EXECUTIONS_DATA_PRUNE=true
EXECUTIONS_DATA_MAX_AGE=336  # Keep 14 days of execution data

# Manual database maintenance
# Connect to postgres
docker exec -it n8n_postgres psql -U n8n -d n8n

# Check table sizes
SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(tablename::regclass)) 
FROM pg_tables 
WHERE schemaname = 'public';

# Check execution count by status
SELECT status, COUNT(*) FROM execution_entity GROUP BY status;

# Vacuum and analyze
VACUUM ANALYZE execution_entity;
```

### Backup Strategy

```bash
#!/bin/bash
# backup-n8n.sh

BACKUP_DIR="/backups/$(date +%Y%m%d)"
mkdir -p $BACKUP_DIR

# PostgreSQL backup
docker exec n8n_postgres pg_dump -U n8n n8n > $BACKUP_DIR/n8n_postgres.sql

# Redis backup (if AOF enabled)
docker exec n8n_redis redis-cli BGSAVE

# n8n data backup
docker run --rm -v n8n_data:/data -v $BACKUP_DIR:/backup alpine tar czf /backup/n8n_data.tar.gz -C /data .

# Upload to cloud storage (optional)
gsutil cp -r $BACKUP_DIR gs://your-backup-bucket/n8n/

# Cleanup old backups (keep 30 days)
find /backups -type d -mtime +30 -exec rm -rf {} +
```

---

## 5. Queue Mode for High-Volume Processing

### When to Enable Queue Mode

| Indicator | Threshold |
|-----------|-----------|
| Daily executions | > 5,000 |
| Concurrent workflows | > 15 |
| Webhook burst traffic | > 50/minute |
| Workflow execution time | > 30 seconds |
| Team size | > 5 users |

### Queue Mode Architecture

```
┌─────────────────┐     ┌─────────────┐     ┌─────────────────┐
│   Webhook/API   │────▶│  n8n Main   │────▶│   PostgreSQL    │
│    Requests     │     │   (Queue)   │     │   (Database)    │
└─────────────────┘     └──────┬──────┘     └─────────────────┘
                               │
                               ▼
                        ┌─────────────┐
                        │    Redis    │
                        │   (Queue)   │
                        └──────┬──────┘
                               │
                               ▼
              ┌─────────────────────────────────┐
              │         n8n Workers             │
              │  ┌─────────┐    ┌─────────┐    │
              │  │ Worker 1│    │ Worker 2│    │
              │  │ (Conc:5)│    │ (Conc:5)│    │
              │  └─────────┘    └─────────┘    │
              └─────────────────────────────────┘
```

### Key Environment Variables

```bash
# Queue mode essentials
EXECUTIONS_MODE=queue
QUEUE_BULL_REDIS_HOST=redis
QUEUE_BULL_REDIS_PORT=6379
QUEUE_BULL_REDIS_PASSWORD=${REDIS_PASSWORD}

# Performance tuning
N8N_DISABLE_PRODUCTION_MAIN_PROCESS=true  # Main only queues, doesn't execute
OFFLOAD_MANUAL_EXECUTIONS_TO_WORKERS=true  # Interactive runs go to workers
N8N_WORKER_CONCURRENCY=5                   # Concurrent jobs per worker
QUEUE_HEALTH_CHECK_ACTIVE=true

# Task runners (JavaScript/Python code nodes)
N8N_RUNNERS_ENABLED=true
N8N_RUNNERS_MODE=external
N8N_RUNNERS_MAX_CONCURRENCY=5
```

### Worker Scaling Guide

| VPS Specs | Workers | Concurrency | Max Concurrent Jobs |
|-----------|---------|-------------|---------------------|
| 1 vCPU / 2GB | 1 | 3-5 | 3-5 |
| 2 vCPU / 4GB | 1-2 | 5 | 5-10 |
| 4 vCPU / 8GB | 2 | 8 | 16 |
| 8 vCPU / 16GB | 3-4 | 8-10 | 24-40 |

### Redis Configuration

```yaml
redis:
  image: redis:7-alpine
  restart: always
  command: >
    redis-server
    --appendonly yes
    --requirepass ${REDIS_PASSWORD}
    --maxmemory 512mb
    --maxmemory-policy allkeys-lru
    --save 900 1
    --save 300 10
    --save 60 10000
  volumes:
    - redis_data:/data
  networks:
    - n8n-network
```

### Monitoring Queue Health

```javascript
// Check queue depth via n8n API
const queueMetrics = {
  waiting: await getQueueCount('waiting'),
  active: await getQueueCount('active'),
  completed: await getQueueCount('completed'),
  failed: await getQueueCount('failed')
};

// Alert if queue backs up
if (queueMetrics.waiting > 100) {
  // Scale up workers or send alert
}
```

---

## 6. Monitoring and Alerting

### Monitoring Stack Architecture

```
┌─────────────────┐     ┌─────────────┐     ┌─────────────────┐
│      n8n        │────▶│  Prometheus │────▶│     Grafana     │
│   (/metrics)    │     │  (Scrape)   │     │  (Dashboards)   │
└─────────────────┘     └─────────────┘     └─────────────────┘
         │                                              │
         ▼                                              ▼
┌─────────────────┐                           ┌─────────────────┐
│  Node Exporter  │                           │    Alerting     │
│  (Host metrics) │                           │  (Slack/Email)  │
└─────────────────┘                           └─────────────────┘
```

### Enable n8n Metrics

```bash
# Environment variables
N8N_METRICS=true
N8N_METRICS_INCLUDE_API_ENDPOINTS=true
N8N_METRICS_INCLUDE_CACHE_METRICS=true
N8N_METRICS_INCLUDE_MESSAGE_EVENT_BUS_METRICS=true
```

### Prometheus Configuration

```yaml
# prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'n8n'
    static_configs:
      - targets: ['n8n:5678']
    metrics_path: '/metrics'
    scrape_interval: 15s

  - job_name: 'postgres'
    static_configs:
      - targets: ['postgres-exporter:9187']

  - job_name: 'redis'
    static_configs:
      - targets: ['redis-exporter:9121']

  - job_name: 'node'
    static_configs:
      - targets: ['node-exporter:9100']
```

### Key Metrics to Monitor

| Metric | Warning Threshold | Critical Threshold |
|--------|------------------|-------------------|
| n8n_up | - | < 1 |
| n8n_event_loop_lag_p99 | > 200ms | > 500ms |
| n8n_rss_memory_bytes | > 512MB | > 1GB |
| n8n_queue_jobs_waiting | > 50 | > 200 |
| n8n_queue_jobs_failed_rate | > 1% | > 5% |
| postgres_connections_active | > 150 | > 180 |
| redis_memory_used_bytes | > 400MB | > 480MB |

### Grafana Alert Rules (JSON)

```json
{
  "groups": [
    {
      "name": "n8n-production",
      "rules": [
        {
          "alert": "n8n_down",
          "expr": "up{job=\"n8n\"} == 0",
          "for": "2m",
          "labels": { "severity": "critical" },
          "annotations": {
            "summary": "n8n instance is down"
          }
        },
        {
          "alert": "n8n_high_event_loop_lag",
          "expr": "n8n_event_loop_lag_p99 > 500",
          "for": "5m",
          "labels": { "severity": "warning" },
          "annotations": {
            "summary": "n8n event loop lag is high"
          }
        },
        {
          "alert": "n8n_queue_backlog",
          "expr": "n8n_queue_jobs_waiting > 100",
          "for": "5m",
          "labels": { "severity": "warning" },
          "annotations": {
            "summary": "n8n queue has high backlog"
          }
        }
      ]
    }
  ]
}
```

### Health Check Endpoint

```bash
# n8n provides a health check endpoint
curl https://n8n.yourdomain.com/healthz

# Response: {"status": "ok"}
```

### Uptime Monitoring

```yaml
# uptime-check.yaml (Google Cloud Monitoring)
apiVersion: monitoring.cnrm.cloud.google.com/v1beta1
kind: MonitoringUptimeCheckConfig
metadata:
  name: n8n-uptime-check
spec:
  displayName: n8n Production Uptime
  monitoredResource:
    type: uptime_url
    labels:
      host: n8n.yourdomain.com
      project_id: your-project
  httpCheck:
    path: /healthz
    port: 443
    useSsl: true
    validateSsl: true
  period: 60s
  timeout: 10s
  contentMatchers:
    - content: '{"status": "ok"}'
      matcher: CONTAINS_STRING
```

---

## 7. Backup and Disaster Recovery

### Backup Strategy (3-2-1 Rule)

| Component | Frequency | Retention | Storage |
|-----------|-----------|-----------|---------|
| PostgreSQL | Daily | 30 days | GCS + Local |
| Redis (AOF) | Real-time | 7 days | Local |
| n8n workflows | On change | Git history | Git repository |
| Credentials | Weekly | 90 days | Encrypted GCS |

### Automated Backup Workflow

```json
{
  "name": "n8n_backup",
  "nodes": [
    {
      "type": "n8n-nodes-base.scheduleTrigger",
      "parameters": {
        "rule": [{ "interval": [{ "field": "hours", "value": 24 }] }]
      }
    },
    {
      "type": "n8n-nodes-base.executeCommand",
      "parameters": {
        "command": "docker exec n8n_postgres pg_dump -U n8n n8n > /backups/n8n_$(date +%Y%m%d).sql"
      }
    },
    {
      "type": "n8n-nodes-base.executeCommand",
      "parameters": {
        "command": "n8n export:workflow --all --output=/backups/workflows/"
      }
    },
    {
      "type": "n8n-nodes-base.awsS3",
      "parameters": {
        "operation": "upload",
        "bucketName": "n8n-backups",
        "fileName": "={{ $date.format('YYYY-MM-DD') }}/n8n_backup.sql"
      }
    }
  ]
}
```

### Disaster Recovery Runbook

```markdown
## n8n Disaster Recovery Procedure

### Scenario 1: Database Corruption

1. Stop n8n services:
   docker-compose stop n8n n8n-worker

2. Restore PostgreSQL from backup:
   docker exec -i n8n_postgres psql -U n8n -d n8n < /backups/n8n_YYYYMMDD.sql

3. Restart services:
   docker-compose up -d

4. Verify:
   curl https://n8n.yourdomain.com/healthz

### Scenario 2: Complete VM Loss

1. Provision new VM with same specs
2. Restore from configuration backup:
   - docker-compose.yml
   - .env file (with N8N_ENCRYPTION_KEY)
   - Caddyfile

3. Restore PostgreSQL data:
   - Download latest backup from GCS
   - Import to new Postgres container

4. Restart stack:
   docker-compose up -d

5. Verify all workflows and credentials

### Critical: N8N_ENCRYPTION_KEY

- Store encryption key in multiple secure locations
- Without this key, credentials CANNOT be recovered
- Test credential decryption after restore
```

### Git-Based Workflow Versioning

```bash
#!/bin/bash
# git-backup-workflows.sh

BACKUP_DIR="/opt/n8n-backups/workflows"
cd $BACKUP_DIR

# Export all workflows
docker exec n8n n8n export:workflow --all --output=$BACKUP_DIR

# Commit to git
git add .
git commit -m "Workflow backup $(date +%Y-%m-%d_%H:%M:%S)"
git push origin main
```

---

## 8. API Rate Limiting Considerations

### Rate Limiting Layers

```
┌─────────────────────────────────────────────────────────────┐
│                    Rate Limiting Stack                      │
├─────────────────────────────────────────────────────────────┤
│  Layer 1: Reverse Proxy (Caddy/Nginx) - Per IP              │
│  Layer 2: n8n Webhook Node - Built-in throttling            │
│  Layer 3: Workflow Logic - Custom rate limiting             │
│  Layer 4: External APIs - Respect provider limits           │
└─────────────────────────────────────────────────────────────┘
```

### Caddy Rate Limiting

```caddyfile
n8n.yourdomain.com {
    # Rate limit: 10 requests per second per IP
    rate_limit {
        zone static_example {
            key {remote_host}
            events 10
            window 1s
        }
    }
    
    # Stricter limits for API endpoints
    @api path /rest/*
    handle @api {
        rate_limit {
            zone api_limit {
                key {remote_host}
                events 5
                window 1s
            }
        }
    }
    
    reverse_proxy n8n:5678
}
```

### Nginx Rate Limiting Alternative

```nginx
# nginx.conf
limit_req_zone $binary_remote_addr zone=n8n:10m rate=10r/s;
limit_req_zone $binary_remote_addr zone=n8n_api:10m rate=5r/s;

server {
    listen 443 ssl;
    server_name n8n.yourdomain.com;
    
    location / {
        limit_req zone=n8n burst=20 nodelay;
        proxy_pass http://n8n:5678;
    }
    
    location /rest/ {
        limit_req zone=n8n_api burst=10 nodelay;
        proxy_pass http://n8n:5678;
    }
}
```

### Workflow-Level Rate Limiting

```javascript
// Custom rate limiting in workflow
const rateLimitKey = 'webhook_limit_' + $input.first().headers['x-forwarded-for'];
const maxRequests = 10;
const windowMs = 60000; // 1 minute

// Check if key exists in Redis/memory store
const current = await getRateLimitCounter(rateLimitKey);

if (current >= maxRequests) {
  return [{ 
    status: 429, 
    body: { error: 'Rate limit exceeded. Try again later.' }
  }];
}

// Increment counter
await incrementRateLimit(rateLimitKey, windowMs);
```

### External API Rate Limiting

```javascript
// Add delay between API calls to respect rate limits
const delay = 1000; // 1 second between calls

for (const item of $input.all()) {
  // Make API call
  await callExternalAPI(item);
  
  // Wait before next call (except for last item)
  if (item !== $input.all()[$input.all().length - 1]) {
    await new Promise(resolve => setTimeout(resolve, delay));
  }
}
```

### Common Provider Rate Limits

| Provider | Limit | Reset Window |
|----------|-------|--------------|
| Slack | 1+ req/sec | Burst allowed |
| Discord | 5 req/sec | Global |
| GitHub API | 5,000/hour | Hourly |
| Stripe | 100 req/sec | Rolling |
| OpenAI | RPM varies by tier | Minute |
| Google Sheets | 300 req/min | Per user |

### Rate Limit Response Handling

```javascript
// Handle 429 responses with Retry-After header
try {
  const response = await httpRequest({ url, method, body });
  return [response];
} catch (error) {
  if (error.statusCode === 429) {
    const retryAfter = error.headers['retry-after'] || 60;
    // Log for monitoring
    console.log(`Rate limited. Retry after ${retryAfter}s`);
    
    // Wait and retry
    await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
    return await httpRequest({ url, method, body });
  }
  throw error;
}
```

---

## Quick Reference: Production Checklist

### Pre-Deployment

- [ ] PostgreSQL database configured
- [ ] Redis for queue mode (if needed)
- [ ] N8N_ENCRYPTION_KEY generated and stored securely
- [ ] SSL/TLS certificates configured
- [ ] Reverse proxy (Caddy/Nginx) with rate limiting
- [ ] Basic auth or SSO enabled
- [ ] Environment variables secured (not in git)

### Security

- [ ] Webhook HMAC signatures configured
- [ ] IP allowlisting for admin interface
- [ ] N8N_BLOCK_ENV_ACCESS_IN_NODE=true
- [ ] N8N_SECURE_COOKIE=true
- [ ] Regular security updates scheduled

### Monitoring

- [ ] Prometheus metrics enabled
- [ ] Grafana dashboards configured
- [ ] Alert rules for critical metrics
- [ ] Health check endpoint monitored
- [ ] Log aggregation configured

### Backup & DR

- [ ] Daily PostgreSQL backups
- [ ] Workflows in Git version control
- [ ] N8N_ENCRYPTION_KEY backed up securely
- [ ] Recovery procedure documented
- [ ] Backup restoration tested monthly

### Performance

- [ ] Queue mode enabled (for high volume)
- [ ] Worker concurrency tuned
- [ ] Database indexes optimized
- [ ] Execution data pruning enabled
- [ ] Resource limits configured

---

## Resources

- [n8n Official Docs - Queue Mode](https://docs.n8n.io/hosting/scaling/queue-mode/)
- [n8n Security Hardening](https://docs.n8n.io/hosting/security/)
- [n8n Environment Variables](https://docs.n8n.io/hosting/environment-variables/)
- [Prometheus Metrics](https://docs.n8n.io/hosting/monitoring/)

---

**Document Version:** 1.0  
**Last Updated:** March 19, 2026  
**Next Review:** April 19, 2026
