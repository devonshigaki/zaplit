# Production Deployment Gaps Analysis

**Stack:** Next.js + n8n + Twenty CRM  
**Current State:** Local Docker Compose development setup  
**Target:** Production-ready deployment

---

## Executive Summary

This document identifies critical gaps between the current local development setup and production readiness. The current configuration uses basic Docker Compose with minimal security, no monitoring, local database storage, and hardcoded credentials. **Immediate attention is required** for secrets management, database backup strategies, SSL/TLS termination, and monitoring/alerting before production deployment.

---

## 1. Environment Variable Management

### Current State
- Plain `.env` files with hardcoded credentials
- No environment separation (dev/staging/prod)
- Secrets committed to `.env.example` in repository
- No versioning or rotation strategy

### Critical Gaps

| Gap | Risk Level | Impact |
|-----|------------|--------|
| Plaintext secrets in files | **CRITICAL** | Data breach, credential exposure |
| No environment separation | **HIGH** | Accidental prod data corruption |
| Secrets in version control | **CRITICAL** | Permanent audit trail of credentials |
| No rotation policy | **MEDIUM** | Extended exposure window if breached |
| Local-only configuration | **HIGH** | Inconsistent deployments |

### Production Requirements

#### Recommended Solutions (in order of preference)

**Option A: 1Password Secrets Automation (Recommended for small-medium teams)**
```yaml
# Production deployment with 1Password
services:
  app:
    image: zaplit-app:latest
    environment:
      - OP_SERVICE_ACCOUNT_TOKEN=${OP_SERVICE_ACCOUNT_TOKEN}
    command: ["op", "run", "--env-file=/app/.env.production", "--", "node", "server.js"]
```
- **Pros:** No additional infrastructure, service accounts for CI/CD, audit logging
- **Cons:** Rate limits on API calls, requires 1Password Business ($19.99/user/month)
- **Best for:** Teams already using 1Password

**Option B: Doppler (Recommended for multi-cloud)**
```bash
# Inject secrets at runtime
doppler run --token=${DOPPLER_TOKEN} -- docker-compose up -d
```
- **Pros:** Real-time sync, multi-cloud, version control, easy rotation
- **Cons:** SaaS dependency, additional cost
- **Best for:** Multi-environment, multi-cloud deployments

**Option C: HashiCorp Vault (Enterprise-grade)**
- **Pros:** Self-hosted, extensive authentication methods, dynamic secrets
- **Cons:** Complex setup, requires dedicated infrastructure, steep learning curve
- **Best for:** Large enterprises with dedicated DevOps/SRE teams

### Action Items
- [ ] Remove all secrets from `.env.example` and git history
- [ ] Implement secrets management solution
- [ ] Create environment-specific configurations (dev/staging/prod)
- [ ] Document secret rotation procedures
- [ ] Set up service accounts for CI/CD pipelines

---

## 2. Secrets Management

### Current State Analysis
```bash
# Current local-dev/.env - CRITICAL ISSUES
N8N_BASIC_AUTH_PASSWORD=zaplit-local-dev          # Weak password
DB_POSTGRESDB_PASSWORD=n8n-password               # Hardcoded
TWENTY_API_KEY=eyJhbGciOiJIUzI1Ni...              # Exposed JWT
APP_SECRET=twenty_local_dev_secret_key_32_chars_long  # Predictable
```

### Critical Security Gaps

1. **Weak Authentication**
   - Basic auth with predictable passwords
   - No MFA/2FA implementation
   - No IP allowlisting

2. **Encryption Key Management**
   - `N8N_ENCRYPTION_KEY` not set (will be auto-generated, lost on container restart)
   - `APP_SECRET` is predictable
   - No key backup/rotation strategy

3. **API Key Exposure**
   - Twenty CRM API key in plaintext
   - No key expiration/rotation
   - No scope limitation

### Production Hardening Checklist

```yaml
# Required n8n Production Environment Variables
N8N_ENCRYPTION_KEY=<32-char-random-base64>        # BACKUP THIS KEY
N8N_BASIC_AUTH_ACTIVE=true
N8N_BASIC_AUTH_USER=<strong-username>
N8N_BASIC_AUTH_PASSWORD=<strong-password-16+chars>
N8N_SECURE_COOKIE=true                            # HTTPS only
N8N_BLOCK_ENV_ACCESS_IN_NODE=true                 # Security hardening
```

```yaml
# Required Twenty CRM Production Settings
APP_SECRET=<openssl-rand-base64-32>
STORAGE_TYPE=s3                                   # Move from local to S3
STORAGE_S3_REGION=us-east-1
STORAGE_S3_NAME=twenty-production-bucket
```

---

## 3. Database Backup Strategies for Twenty CRM

### Current State
- Single PostgreSQL container with local volume
- No backup mechanism configured
- Data stored in Docker volume (`db-data`)
- Volume destruction = Total data loss

### Critical Gaps

| Component | Current | Production Required |
|-----------|---------|---------------------|
| Backup frequency | None | Every 4-24 hours |
| Backup retention | None | 30 days minimum |
| Offsite storage | None | Required (S3/other region) |
| Point-in-time recovery | None | PITR capability |
| Automated testing | None | Weekly restore tests |
| Encryption at rest | Default | AES-256 enforced |

### Recommended Backup Strategy

#### Option A: Automated pg_dump with S3 (Basic)
```yaml
# docker-compose.production.yml additions
  backup:
    image: postgres:16-alpine
    volumes:
      - ./backups:/backups
    environment:
      - PGPASSWORD_FILE=/run/secrets/db_password
      - AWS_ACCESS_KEY_ID_FILE=/run/secrets/aws_key
      - AWS_SECRET_ACCESS_KEY_FILE=/run/secrets/aws_secret
    command: >
      sh -c '
        while true; do
          pg_dump -h db -U postgres -d default | gzip > /backups/twenty_$$(date +%Y%m%d_%H%M%S).sql.gz
          aws s3 sync /backups s3://twenty-backups-$${ENV}/ --exclude "*" --include "*.gz"
          find /backups -name "*.gz" -mtime +7 -delete
          sleep 86400
        done
      '
    secrets:
      - db_password
      - aws_key
      - aws_secret
```

#### Option B: WAL-G for Point-in-Time Recovery (Recommended)
```yaml
  backup-wal:
    image: wal-g/wal-g:latest
    environment:
      - WALG_S3_PREFIX=s3://twenty-backups/wal
      - PGHOST=db
      - PGUSER=postgres
    command: wal-g backup-push /var/lib/postgresql/data
```

#### Option C: Managed Database (AWS RDS, Cloud SQL)
- Automated daily backups
- Point-in-time recovery (up to 35 days)
- Cross-region replication
- Automated failover (Multi-AZ)

### RTO/RPO Targets
| Metric | Target | Implementation |
|--------|--------|----------------|
| RPO (Data Loss) | < 1 hour | Continuous WAL archiving |
| RTO (Downtime) | < 4 hours | Automated restore + S3 |

### Action Items
- [ ] Implement automated daily backups
- [ ] Configure offsite backup storage (S3 with versioning)
- [ ] Test restore procedures monthly
- [ ] Set up backup monitoring and alerting
- [ ] Document disaster recovery runbook

---

## 4. n8n Production Deployment Considerations

### Current State
```yaml
# Current: Single instance, SQLite (implied), no queue
services:
  n8n:
    image: n8nio/n8n:latest    # No version pinning
    environment:
      - N8N_BASIC_AUTH_ACTIVE=true
      - WEBHOOK_URL=http://localhost:5678/   # Local only
```

### Critical Production Gaps

#### A. Database: SQLite → PostgreSQL
**Current:** SQLite (default) - not suitable for production  
**Required:** PostgreSQL with connection pooling

```yaml
# Production n8n database
  n8n-postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: n8n
      POSTGRES_USER: n8n
      POSTGRES_PASSWORD_FILE: /run/secrets/n8n_db_password
    volumes:
      - n8n_postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U n8n -d n8n"]
      interval: 10s
      timeout: 5s
      retries: 5
```

#### B. Execution Mode: Own → Queue Mode (Required for Scale)
```yaml
# Production Queue Mode Configuration
  n8n:
    image: n8nio/n8n:1.115.2   # Pin specific version
    environment:
      - EXECUTIONS_MODE=queue
      - QUEUE_BULL_REDIS_HOST=redis
      - QUEUE_BULL_REDIS_PORT=6379
      - QUEUE_BULL_REDIS_PASSWORD_FILE=/run/secrets/redis_password
      - N8N_DISABLE_PRODUCTION_MAIN_PROCESS=true
      - OFFLOAD_MANUAL_EXECUTIONS_TO_WORKERS=true
      - DB_TYPE=postgresdb
      - DB_POSTGRESDB_HOST=n8n-postgres
      - DB_POSTGRESDB_DATABASE=n8n
      - N8N_ENCRYPTION_KEY_FILE=/run/secrets/n8n_encryption_key
      # Webhook configuration
      - WEBHOOK_URL=https://n8n.yourdomain.com/
      - N8N_HOST=n8n.yourdomain.com
      - N8N_PROTOCOL=https
      - N8N_PORT=5678
      # Performance
      - N8N_PAYLOAD_SIZE_MAX=268435456  # 256MB for large payloads
      - N8N_DEFAULT_BINARY_DATA_MODE=filesystem
      - N8N_RUNNERS_ENABLED=true
      - N8N_RUNNERS_MODE=external
    depends_on:
      - n8n-postgres
      - redis

  n8n-worker:
    image: n8nio/n8n:1.115.2
    command: worker
    environment:
      - EXECUTIONS_MODE=queue
      - QUEUE_BULL_REDIS_HOST=redis
      - DB_TYPE=postgresdb
      - DB_POSTGRESDB_HOST=n8n-postgres
      - N8N_ENCRYPTION_KEY_FILE=/run/secrets/n8n_encryption_key
    deploy:
      replicas: 2  # Scale based on workload
    depends_on:
      - redis
      - n8n-postgres
```

#### C. Webhook URL Configuration
| Environment | WEBHOOK_URL Value |
|-------------|-------------------|
| Development | `http://localhost:5678/` |
| Staging | `https://n8n-staging.yourdomain.com/` |
| Production | `https://n8n.yourdomain.com/` |

**Critical:** Webhook URLs must be publicly accessible HTTPS endpoints.

### Resource Requirements
| Deployment Size | CPU | RAM | Workers | Concurrent Exec |
|-----------------|-----|-----|---------|-----------------|
| Small (<1K/day) | 2 cores | 4GB | 1 | 5 |
| Medium (<10K/day) | 4 cores | 8GB | 2-3 | 10-15 |
| Large (>10K/day) | 8+ cores | 16GB+ | 4+ | 20+ |

---

## 5. Monitoring and Alerting

### Current State
- No monitoring configured
- No health checks beyond basic Docker
- No alerting mechanism
- No error tracking

### Required Production Monitoring Stack

#### A. Application Error Tracking: Sentry
```typescript
// next.config.mjs additions
import { withSentryConfig } from '@sentry/nextjs';

const nextConfig = {
  // ... existing config
};

export default withSentryConfig(nextConfig, {
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,  // Adjust based on traffic
  replaysSessionSampleRate: 0.01,
  replaysOnErrorSampleRate: 1.0,
});
```

**Sentry Setup for n8n:**
```yaml
  n8n:
    environment:
      - N8N_LOG_LEVEL=debug
      - N8N_LOG_OUTPUT=console
    logging:
      driver: "fluentd"
      options:
        fluentd-address: localhost:24224
        tag: docker.n8n
```

#### B. Infrastructure Monitoring: DataDog or Prometheus+Grafana

**Key Metrics to Monitor:**
| Component | Metric | Alert Threshold |
|-----------|--------|-----------------|
| n8n | Queue depth | > 100 pending |
| n8n | Failed executions | > 5% error rate |
| n8n | Worker CPU | > 80% for 5min |
| Twenty | API response time | > 2s p95 |
| Twenty | Database connections | > 80% of max |
| Next.js | Error rate | > 1% |
| Next.js | Core Web Vitals | LCP > 2.5s |
| All | Disk usage | > 85% |
| All | Memory usage | > 90% |

#### C. Health Checks
```yaml
  nextjs:
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/api/health"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 40s

  n8n:
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:5678/healthz"]
      interval: 30s
      timeout: 10s
      retries: 3

  twenty-server:
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/healthz"]
      interval: 10s
      timeout: 5s
      retries: 10
```

#### D. Uptime Monitoring
- **External:** Pingdom, UptimeRobot, or StatusCake
- **Check intervals:** 1-5 minutes
- **Alert channels:** Email, Slack, PagerDuty

### Alerting Channels Configuration
```yaml
# Example alert routing
severity:
  critical:  # Paging
    - pagerduty
    - slack-on-call
    - email-on-call
  warning:   # Working hours
    - slack-dev-channel
    - email-team
  info:      # Dashboard only
    - slack-ops-channel
```

---

## 6. SSL/TLS Termination and Certificate Management

### Current State
- No SSL configuration
- HTTP only (port 80/5678/3000/3001)
- No certificate management

### Production Requirements

#### Option A: Traefik (Recommended - Automatic SSL)
```yaml
  traefik:
    image: traefik:v3.0
    command:
      - "--api.insecure=true"  # Disable in production
      - "--providers.docker=true"
      - "--providers.docker.exposedbydefault=false"
      - "--entrypoints.web.address=:80"
      - "--entrypoints.web.http.redirections.entryPoint.to=websecure"
      - "--entrypoints.websecure.address=:443"
      - "--certificatesresolvers.letsencrypt.acme.tlschallenge=true"
      - "--certificatesresolvers.letsencrypt.acme.email=admin@yourdomain.com"
      - "--certificatesresolvers.letsencrypt.acme.storage=/letsencrypt/acme.json"
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ./letsencrypt:/letsencrypt
    labels:
      - "traefik.enable=true"

  n8n:
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.n8n.rule=Host(`n8n.yourdomain.com`)"
      - "traefik.http.routers.n8n.entrypoints=websecure"
      - "traefik.http.routers.n8n.tls.certresolver=letsencrypt"
      - "traefik.http.services.n8n.loadbalancer.server.port=5678"

  nextjs:
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.nextjs.rule=Host(`www.yourdomain.com`)"
      - "traefik.http.routers.nextjs.entrypoints=websecure"
      - "traefik.http.routers.nextjs.tls.certresolver=letsencrypt"
```

#### Option B: Caddy (Simplest Configuration)
```dockerfile
# Caddyfile
n8n.yourdomain.com {
    reverse_proxy n8n:5678
    encode zstd gzip
    # Automatic HTTPS with Let's Encrypt
}

www.yourdomain.com {
    reverse_proxy nextjs:8080
    encode zstd gzip
}

twenty.yourdomain.com {
    reverse_proxy twenty-server:3000
    encode zstd gzip
}
```

#### Option C: Nginx + Certbot
```yaml
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf
      - ./certbot/conf:/etc/letsencrypt
      - ./certbot/www:/var/www/certbot

  certbot:
    image: certbot/certbot
    volumes:
      - ./certbot/conf:/etc/letsencrypt
      - ./certbot/www:/var/www/certbot
    entrypoint: "/bin/sh -c 'trap exit TERM; while :; do certbot renew; sleep 12h & wait $${!}; done;'"
```

### SSL Configuration Requirements
| Requirement | Implementation |
|-------------|----------------|
| TLS Version | Minimum 1.2 (1.3 preferred) |
| Certificate | Let's Encrypt (free) or commercial |
| Auto-renewal | 30 days before expiry |
| HSTS | Enable after SSL confirmed working |
| Cipher suites | Modern, no deprecated algorithms |

---

## 7. Load Balancing Considerations

### Current State
- Single container per service
- No load balancing
- No high availability

### Production Architecture

```
                    ┌─────────────────┐
                    │   Cloudflare    │
                    │    (CDN/WAF)    │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │  Load Balancer  │
                    │   (Traefik/Nginx)│
                    └────────┬────────┘
                             │
         ┌───────────────────┼───────────────────┐
         │                   │                   │
   ┌─────▼─────┐      ┌─────▼─────┐      ┌─────▼─────┐
   │  Next.js  │      │  Next.js  │      │  Next.js  │
   │  Instance │      │  Instance │      │  Instance │
   └───────────┘      └───────────┘      └───────────┘
         
   ┌──────────────────────────────────────────────────────┐
   │                 Docker Network                        │
   │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐   │
   │  │     n8n     │  │   n8n-worker│  │   n8n-worker│   │
   │  │   (main)    │  │    (exec)   │  │    (exec)   │   │
   │  └─────────────┘  └─────────────┘  └─────────────┘   │
   │                                                      │
   │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐   │
   │  │   Twenty    │  │   Twenty    │  │    Redis    │   │
   │  │   Server    │  │   Worker    │  │   (queue)   │   │
   │  └─────────────┘  └─────────────┘  └─────────────┘   │
   │                                                      │
   │  ┌─────────────────────────────────────────────────┐ │
   │  │         PostgreSQL (Primary + Replica)          │ │
   │  └─────────────────────────────────────────────────┘ │
   └──────────────────────────────────────────────────────┘
```

### Load Balancing Strategy

| Service | Load Balancing | Session Affinity | Health Check |
|---------|---------------|------------------|--------------|
| Next.js | Round-robin | Not required | /api/health |
| n8n (UI) | Round-robin | Sticky (WebSocket) | /healthz |
| n8n (Webhook) | Round-robin | Not required | /healthz |
| Twenty CRM | Round-robin | Sticky optional | /healthz |

### Scaling Considerations
```yaml
# Docker Compose deploy configuration
deploy:
  replicas: 3
  update_config:
    parallelism: 1
    delay: 10s
    failure_action: rollback
  restart_policy:
    condition: on-failure
    delay: 5s
    max_attempts: 3
  resources:
    limits:
      cpus: '2'
      memory: 4G
    reservations:
      cpus: '0.5'
      memory: 512M
```

---

## 8. Disaster Recovery Planning

### Current State
- No documented recovery procedures
- No RTO/RPO targets
- Single point of failure (single server)
- No geographic redundancy

### Disaster Recovery Framework

#### RTO/RPO Targets by Service
| Service | RTO | RPO | Strategy |
|---------|-----|-----|----------|
| Next.js (Static) | 1 hour | N/A | Rebuild/deploy from CI/CD |
| n8n Workflows | 4 hours | 24 hours | Export/import + DB restore |
| Twenty CRM | 4 hours | 1 hour | DB replication + backup |

#### Backup Strategy Matrix
| Data | Frequency | Retention | Location |
|------|-----------|-----------|----------|
| Twenty Database | 4 hours | 30 days | S3 + Cross-region |
| n8n Workflows | Daily | 90 days | S3 + Git |
| n8n Credentials | On change | 90 days | S3 + Secrets Manager |
| Next.js Build | On deploy | 10 versions | Container Registry |

### Disaster Recovery Runbook Template

```markdown
## Scenario: Complete Data Center Failure

### Detection
- Alert: All health checks failing
- Verification: Check external monitoring (Pingdom)

### Response (RTO: 4 hours)
1. **T+0: Declare Incident**
   - Page on-call engineer
   - Create incident channel
   - Notify stakeholders

2. **T+30min: Assess Damage**
   - Check backup availability
   - Verify S3 access
   - Confirm secondary region status

3. **T+1hr: Initiate Recovery**
   - Spin up infrastructure in secondary region
   - Restore database from latest backup
   - Verify data integrity

4. **T+3hr: Service Restoration**
   - Update DNS to point to secondary region
   - Verify all services responding
   - Run smoke tests

5. **T+4hr: Post-Incident**
   - Declare all-clear
   - Begin post-mortem
   - Document lessons learned
```

### Action Items
- [ ] Document RTO/RPO targets
- [ ] Create infrastructure-as-code for rapid redeployment
- [ ] Test restore procedures quarterly
- [ ] Set up cross-region backup replication
- [ ] Create incident response runbooks

---

## 9. Production Deployment Checklist

### Pre-Deployment
- [ ] All secrets moved to secrets manager
- [ ] SSL certificates configured
- [ ] Database backups automated and tested
- [ ] Health checks implemented
- [ ] Monitoring and alerting configured
- [ ] Load balancer configured
- [ ] Disaster recovery procedures documented

### Deployment
- [ ] Deploy to staging environment first
- [ ] Run automated smoke tests
- [ ] Gradual traffic shift (blue-green or canary)
- [ ] Monitor error rates during deployment
- [ ] Rollback plan ready

### Post-Deployment
- [ ] Verify all health checks passing
- [ ] Monitor for 24 hours
- [ ] Review application logs
- [ ] Validate backup completion
- [ ] Update documentation

---

## 10. Immediate Priority Actions

### Week 1 (Critical)
1. **Remove secrets from repository**
   - Audit git history with `git-secrets` or `truffleHog`
   - Rotate all exposed credentials
   - Implement `.gitignore` for `.env*` files

2. **Implement basic secrets management**
   - Set up 1Password Service Accounts OR
   - Configure Doppler for environment management

3. **Enable SSL/TLS**
   - Deploy Traefik or Caddy with Let's Encrypt
   - Update all webhook URLs to HTTPS

### Week 2 (High Priority)
4. **Configure database backups**
   - Implement automated pg_dump to S3
   - Test restore procedure

5. **Set up monitoring**
   - Configure Sentry for error tracking
   - Set up basic uptime monitoring

### Week 3-4 (Medium Priority)
6. **n8n production hardening**
   - Migrate to PostgreSQL
   - Configure queue mode with Redis
   - Pin n8n version

7. **Implement health checks**
   - Add to all services
   - Configure load balancer to use them

### Month 2+ (Ongoing)
8. Document disaster recovery procedures
9. Set up CI/CD pipeline with automated deployments
10. Implement comprehensive monitoring (DataDog/Grafana)

---

## 11. Cost Estimates

### Infrastructure (Monthly)
| Component | Small | Medium | Large |
|-----------|-------|--------|-------|
| VPS/Compute | $50-100 | $200-400 | $500-1000 |
| Database (Managed) | $50-100 | $150-300 | $400-800 |
| S3 Storage/Backups | $10-20 | $30-50 | $100-200 |
| Monitoring (Sentry/DataDog) | $29-100 | $100-300 | $300-500 |
| Secrets Manager | $0-20 | $20-50 | $50-100 |
| Load Balancer | $0 | $20-50 | $50-100 |
| **Total** | **$139-340** | **$520-1150** | **$1400-2700** |

---

## Summary

The current local development setup requires significant hardening before production deployment. The **most critical gaps** are:

1. **Secrets exposed in plaintext** - Immediate rotation and secrets manager implementation required
2. **No database backups** - Risk of total data loss
3. **No SSL/TLS** - Security and compliance requirement
4. **No monitoring** - Flying blind in production
5. **Single points of failure** - No redundancy or HA

**Recommended first steps:**
1. Implement 1Password or Doppler for secrets management
2. Deploy Traefik for automatic SSL
3. Set up automated database backups to S3
4. Configure Sentry for error tracking

With these fundamentals in place, the architecture can be incrementally improved toward full production readiness.
