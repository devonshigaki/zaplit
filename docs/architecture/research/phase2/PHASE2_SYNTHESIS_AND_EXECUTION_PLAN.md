# Phase 2 (Harden) Synthesis & Execution Plan

**Project:** Zaplit Platform - n8n + Twenty CRM Integration  
**Phase:** Phase 2 - Harden (Resilience & Performance)  
**Date:** March 19, 2026  
**Status:** Research Complete → Ready for Execution

---

## Executive Summary

Phase 2 research is complete across 5 critical areas. This document synthesizes findings and provides a consolidated execution plan.

### Research Completed

| Area | Document | Key Finding | Priority |
|------|----------|-------------|----------|
| **Circuit Breaker** | PHASE2_CIRCUIT_BREAKER_RESEARCH.md | Redis-backed circuit breaker prevents cascade failures | P0 |
| **Dead Letter Queue** | PHASE2_DLQ_RESEARCH.md | Hybrid PostgreSQL + Sheets DLQ for zero data loss | P0 |
| **Parallel Processing** | PHASE2_PARALLEL_PROCESSING_RESEARCH.md | Fork-Join pattern reduces latency 28-37% | P1 |
| **Log Aggregation** | PHASE2_LOG_AGGREGATION_RESEARCH.md | Grafana Cloud Loki for centralized logging | P1 |
| **PostgreSQL Replication** | PHASE2_POSTGRESQL_REPLICATION_RESEARCH.md | Hot standby in different zones | P2 |

### Expected Outcomes

| Metric | Current | Phase 2 Target | Improvement |
|--------|---------|----------------|-------------|
| **P95 Latency** | 6.0s | 3.0s | -50% |
| **Auto-Recovery Rate** | 0% | 85-90% | +85-90% |
| **Data Loss Risk** | Medium | Near Zero | Critical |
| **MTTR** | 2 hours | 30 min | -75% |
| **Observability** | Basic metrics | Full logs + traces | Complete |

---

## 1. Cross-Domain Dependencies

```
┌─────────────────────────────────────────────────────────────────┐
│                    PHASE 2 DEPENDENCY GRAPH                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────┐                                            │
│  │ Circuit Breaker │◄────────────────────────────────────┐      │
│  │     (P0)        │                                     │      │
│  └────────┬────────┘                                     │      │
│           │                                              │      │
│           ▼                                              │      │
│  ┌─────────────────┐    ┌─────────────────┐             │      │
│  │      DLQ        │◄───┤  Parallel Proc  │             │      │
│  │     (P0)        │    │     (P1)        │             │      │
│  └────────┬────────┘    └────────┬────────┘             │      │
│           │                       │                      │      │
│           ▼                       ▼                      │      │
│  ┌─────────────────┐    ┌─────────────────┐             │      │
│  │  Log Aggregation│    │  PG Replication │             │      │
│  │     (P1)        │    │     (P2)        │             │      │
│  └─────────────────┘    └─────────────────┘             │      │
│           │                                              │      │
│           └──────────────────────────────────────────────┘      │
│                            │                                    │
│                            ▼                                    │
│                  ┌─────────────────┐                           │
│                  │ Unified Dashboard│                          │
│                  │   (Grafana)      │                          │
│                  └─────────────────┘                           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Key Dependencies

1. **Circuit Breaker → DLQ**: When circuit opens, failed requests go to DLQ
2. **Circuit Breaker → Parallel Processing**: Both need Redis for state/synchronization
3. **DLQ → Log Aggregation**: DLQ operations need comprehensive logging
4. **Parallel Processing → PG Replication**: Need reliable DB for async processing
5. **All → Monitoring**: Each component feeds metrics/logs to unified dashboard

---

## 2. Implementation Roadmap

### Phase 2A: Critical Resilience (Weeks 1-2)
**Goal:** Prevent cascade failures and ensure zero data loss

| # | Task | Effort | Dependencies | Risk |
|---|------|--------|--------------|------|
| 2.1 | Deploy Redis (single instance) | 4h | None | Low |
| 2.2 | Implement Circuit Breaker | 16h | 2.1 | Medium |
| 2.3 | Deploy DLQ (PostgreSQL table) | 8h | None | Low |
| 2.4 | Create DLQ capture workflow | 8h | 2.3 | Medium |
| 2.5 | Create retry processor workflow | 12h | 2.3, 2.4 | Medium |
| 2.6 | Integration testing | 8h | All above | Low |

**Deliverables:**
- Redis running on GCP VM
- Circuit breaker active on CRM API calls
- DLQ capturing all failures
- Auto-retry working (85% recovery rate)

### Phase 2B: Performance Optimization (Weeks 3-4)
**Goal:** Reduce P95 latency to <3s

| # | Task | Effort | Dependencies | Risk |
|---|------|--------|--------------|------|
| 2.7 | Implement parallel Person+Company | 8h | None | Low |
| 2.8 | Configure HTTP Keep-Alive | 4h | None | Low |
| 2.9 | Optimize Merge node | 4h | 2.7 | Low |
| 2.10 | Load testing & tuning | 8h | 2.7-2.9 | Low |

**Deliverables:**
- Parallel workflow processing
- P95 latency <3s
- Throughput increased to 33/min

### Phase 2C: Observability (Weeks 5-6)
**Goal:** Full visibility with centralized logging

| # | Task | Effort | Dependencies | Risk |
|---|------|--------|--------------|------|
| 2.11 | Set up Grafana Cloud Loki | 8h | None | Low |
| 2.12 | Deploy Promtail agents | 8h | 2.11 | Low |
| 2.13 | Create unified dashboards | 16h | 2.11-2.12 | Low |
| 2.14 | Configure log-based alerts | 8h | 2.13 | Low |

**Deliverables:**
- Loki ingesting all logs
- Unified Grafana dashboard
- LogQL-based alerts active

### Phase 2D: Database HA (Weeks 7-8)
**Goal:** Zero RPO with hot standby

| # | Task | Effort | Dependencies | Risk |
|---|------|--------|--------------|------|
| 2.15 | Provision standby VM | 4h | None | Low |
| 2.16 | Configure streaming replication | 16h | 2.15 | High |
| 2.17 | Set up PgBouncer | 8h | 2.16 | Medium |
| 2.18 | Test failover procedure | 8h | 2.16-2.17 | Medium |

**Deliverables:**
- Hot standby in different zone
- Replication lag <1s
- Failover tested and documented

---

## 3. Architecture Overview

### Post-Phase 2 Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         PHASE 2 ARCHITECTURE                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   [Client] ──POST──┐                                                     │
│                    ▼                                                     │
│   ┌──────────────────────────────────────────────────┐                  │
│   │              n8n Workflow (Enhanced)              │                  │
│   │  ┌──────────────┐  ┌──────────────┐              │                  │
│   │  │   Validate   │──┤   Circuit    │──┐           │                  │
│   │  │   & Process  │  │   Breaker    │  │           │                  │
│   │  └──────────────┘  └──────────────┘  │           │                  │
│   │                         │            │           │                  │
│   │              ┌──────────┴──────────┐ │           │                  │
│   │              ▼                     ▼ │           │                  │
│   │  ┌─────────────────┐  ┌─────────────────┐        │                  │
│   │  │  Create Person  │  │ Create Company  │        │                  │
│   │  │   (Parallel)    │  │   (Parallel)    │        │                  │
│   │  └────────┬────────┘  └────────┬────────┘        │                  │
│   │           └──────────┬─────────┘                │                  │
│   │                      ▼                          │                  │
│   │           ┌─────────────────┐                   │                  │
│   │           │  Merge Results  │                   │                  │
│   │           └────────┬────────┘                   │                  │
│   │                    ▼                            │                  │
│   │  ┌──────────────────────────────────────┐      │                  │
│   │  │  Extract IDs → Link → Create Note    │      │                  │
│   │  └──────────────────────────────────────┘      │                  │
│   │                    │                            │                  │
│   └────────────────────┼────────────────────────────┘                  │
│                        │                                                 │
│        Failure ────────┼─────────► ┌──────────────┐                    │
│        (any step)      │           │     DLQ      │                    │
│                        │           │  PostgreSQL  │                    │
│                        │           └──────┬───────┘                    │
│                        │                  │                             │
│                        ▼                  ▼                             │
│              ┌──────────────────┐  ┌──────────────┐                    │
│              │  Success Response│  │   Retry      │                    │
│              └──────────────────┘  │  Processor   │                    │
│                                    └──────────────┘                    │
│                                                                          │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │                        Redis                                   │   │
│   │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │   │
│   │  │   Circuit    │  │   DLQ Job    │  │  Rate Limit  │         │   │
│   │  │   Breaker    │  │   Queue      │  │  Tracking    │         │   │
│   │  │   State      │  │              │  │              │         │   │
│   │  └──────────────┘  └──────────────┘  └──────────────┘         │   │
│   └────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│   ┌──────────────────┐  ┌──────────────────┐                          │
│   │   PostgreSQL     │  │   PostgreSQL     │                          │
│   │    (Primary)     │◄─┤   (Standby)      │                          │
│   │  us-central1-a   │  │  us-central1-b   │                          │
│   └──────────────────┘  └──────────────────┘                          │
│                                                                          │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │                    Observability Stack                         │   │
│   │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │   │
│   │  │  Prometheus  │  │    Loki      │  │   Grafana    │         │   │
│   │  │   (Metrics)  │  │   (Logs)     │  │ (Dashboards) │         │   │
│   │  └──────────────┘  └──────────────┘  └──────────────┘         │   │
│   └────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Implementation Details

### 4.1 Circuit Breaker Implementation

**Approach:** Redis-backed circuit breaker (Option D)

**Configuration:**
```javascript
const CIRCUIT_BREAKER_CONFIG = {
  failureThreshold: 5,        // Open after 5 failures
  recoveryTimeout: 60000,     // Try half-open after 60s
  successThreshold: 3,        // Close after 3 successes
  monitoringPeriod: 60000,    // 1-minute sliding window
  redis: {
    host: process.env.REDIS_HOST,
    port: 6379,
    keyPrefix: 'cb:twenty-crm:'
  }
};
```

**States:**
- **CLOSED**: Normal operation, requests pass through
- **OPEN**: Failing fast, requests rejected immediately
- **HALF_OPEN**: Testing recovery with limited traffic

**Integration:** Code node in n8n workflow before CRM HTTP requests

### 4.2 DLQ Implementation

**Approach:** Hybrid PostgreSQL + Google Sheets

**Schema:**
```sql
CREATE TABLE form_submission_dlq (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_payload JSONB NOT NULL,
  failure_category dlq_failure_category NOT NULL,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  status dlq_status DEFAULT 'PENDING',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_retry_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ
);
```

**Retry Schedule:**
- Retry 1: 5 minutes
- Retry 2: 10 minutes  
- Retry 3: 20 minutes
- Retry 4: 40 minutes
- Retry 5: 80 minutes
- After 5 failures: Permanent failure (human review)

**Integration:**
1. DLQ Capture Workflow: Error trigger → PostgreSQL → Google Sheets
2. Retry Processor Workflow: Scheduled every 5 minutes

### 4.3 Parallel Processing Implementation

**Approach:** Fork-Join pattern with Merge node

**Workflow Structure:**
```
Webhook → Validation → Split ─┬─► Create Person ─┐
                               │                  ├──► Merge ─► Create Note
                               └─► Create Company─┘
```

**Configuration:**
- HTTP Request nodes: `continueOnFail: true`
- Merge node: `mode: waitForAll`
- Keep-Alive: Enabled (150ms savings per call)

**Expected Performance:**
- Sequential: ~4560ms P95
- Parallel: ~2880ms P95 (37% improvement)

### 4.4 Log Aggregation Implementation

**Approach:** Grafana Cloud Loki (managed)

**Deployment:**
```yaml
# docker-compose addition
promtail:
  image: grafana/promtail:latest
  volumes:
    - /var/log:/var/log:ro
    - /var/lib/docker/containers:/var/lib/docker/containers:ro
    - ./promtail.yml:/etc/promtail/config.yml
  command: -config.file=/etc/promtail/config.yml
```

**Log Format:**
```json
{
  "timestamp": "2026-03-19T10:00:00Z",
  "level": "info",
  "workflow": "consultation-form",
  "execution_id": "abc-123",
  "node": "Create Person",
  "duration_ms": 850,
  "status": "success"
}
```

**Cost:** ~$100/month for 10GB/day ingestion

### 4.5 PostgreSQL Replication Implementation

**Approach:** Streaming replication, async, hot standby

**Architecture:**
- Primary: us-central1-a (existing)
- Standby: us-central1-b (new)
- PgBouncer: Connection pooling on primary

**Configuration:**
```ini
# postgresql.conf (Primary)
wal_level = replica
max_wal_senders = 3
wal_keep_size = 1GB
archive_mode = on
archive_command = 'gsutil cp %p gs://zaplit-postgres-wal/%f'
```

**Monitoring:**
- Replication lag: `SELECT EXTRACT(EPOCH FROM (NOW() - pg_last_xact_replay_timestamp()))`
- Alert if lag > 10 seconds

**Cost:** ~$145/month (vs $221 Cloud SQL HA)

---

## 5. Testing Strategy

### 5.1 Unit Testing

| Component | Test Coverage | Tools |
|-----------|--------------|-------|
| Circuit Breaker | State transitions, threshold logic | Jest |
| DLQ Processor | Retry logic, backoff calculation | Jest |
| Parallel Merge | Synchronization, error handling | Jest |

### 5.2 Integration Testing

| Scenario | Test | Expected Result |
|----------|------|-----------------|
| Circuit breaker opens | Force 5 CRM failures | Requests rejected, DLQ populated |
| Circuit recovers | Restore CRM, wait 60s | Gradual recovery, success rate increases |
| DLQ retry | Create failed record | Auto-retry at intervals, eventual success |
| Parallel execution | Submit 10 concurrent forms | P95 <3s, no errors |
| Failover | Stop primary PostgreSQL | Automatic failover to standby, <2min downtime |

### 5.3 Load Testing

```bash
# Circuit breaker stress test
autocannon -c 20 -d 60 -m POST \
  -H "Content-Type: application/json" \
  -b '{"data":{"name":"Test","email":"test@example.com"}}' \
  https://n8n.zaplit.com/webhook/consultation

# Expected: 10% error rate max, quick fail when circuit open
```

### 5.4 Chaos Testing

| Failure | Injection Method | Expected Behavior |
|---------|-----------------|-------------------|
| CRM API down | Block outbound 443 | Circuit opens, DLQ populated |
| Redis down | Stop Redis container | Graceful degradation, direct calls |
| Primary DB down | Stop PostgreSQL | Failover to standby, alert fired |
| Network partition | iptables drop | Timeout, circuit opens |

---

## 6. Risk Matrix

| Risk | Probability | Impact | Mitigation | Status |
|------|-------------|--------|------------|--------|
| Redis single point of failure | Medium | High | Redis Sentinel or managed Redis | Planned |
| Replication lag too high | Medium | Medium | Monitoring + alerts, async acceptable | Monitored |
| Circuit breaker false positives | Low | Medium | Tuning thresholds, gradual opening | Configurable |
| DLQ infinite retry loop | Low | High | Max retry limit, poison message detection | Implemented |
| Performance regression | Low | High | A/B testing, gradual rollout, rollback plan | Mitigated |
| Data inconsistency (parallel) | Low | High | Continue-on-fail disabled, transaction logs | Monitored |

---

## 7. Success Criteria

### 7.1 Technical Metrics

| Metric | Baseline | Target | Measurement |
|--------|----------|--------|-------------|
| P95 Latency | 6.0s | <3.0s | Prometheus histogram |
| Auto-recovery rate | 0% | 85-90% | DLQ metrics |
| Circuit breaker false positive | - | <5% | Error classification |
| Replication lag | N/A | <10s | PostgreSQL stats |
| Log query response | - | <2s | Loki query timing |

### 7.2 Business Metrics

| Metric | Baseline | Target |
|--------|----------|--------|
| Form submission success | 95% | 99.5% |
| Manual intervention needed | Daily | Weekly |
| Time to detect issues | Hours | <5 min |
| Time to resolve | Hours | <30 min |

---

## 8. Execution Checklist

### Pre-Execution
- [ ] Phase 1 deployment completed and verified
- [ ] Redis instance provisioned (4GB RAM minimum)
- [ ] Standby VM provisioned (same specs as primary)
- [ ] Grafana Cloud account set up
- [ ] Team trained on new procedures
- [ ] Rollback plan reviewed

### Phase 2A: Critical Resilience
- [ ] 2.1 Redis deployed and accessible
- [ ] 2.2 Circuit breaker implemented and tested
- [ ] 2.3 DLQ table created in PostgreSQL
- [ ] 2.4 DLQ capture workflow active
- [ ] 2.5 Retry processor workflow scheduled
- [ ] 2.6 Integration testing passed

### Phase 2B: Performance
- [ ] 2.7 Parallel workflow implemented
- [ ] 2.8 HTTP Keep-Alive configured
- [ ] 2.9 Merge node optimized
- [ ] 2.10 Load testing passed (P95 <3s)

### Phase 2C: Observability
- [ ] 2.11 Grafana Cloud Loki configured
- [ ] 2.12 Promtail deployed on all nodes
- [ ] 2.13 Unified dashboard created
- [ ] 2.14 Log-based alerts active

### Phase 2D: Database HA
- [ ] 2.15 Standby VM provisioned
- [ ] 2.16 Streaming replication configured
- [ ] 2.17 PgBouncer deployed
- [ ] 2.18 Failover tested successfully

---

## 9. Appendix: Resource Requirements

### Infrastructure

| Component | Specs | Cost/Month |
|-----------|-------|------------|
| Redis (VM) | e2-medium, 4GB RAM | $25 |
| Standby PostgreSQL | e2-medium, 50GB disk | $50 |
| PgBouncer | Shared with n8n | $0 |
| Grafana Cloud Loki | 10GB/day ingestion | $100 |
| **Total Additional** | | **$175** |

### Engineering Effort

| Phase | Hours | FTE |
|-------|-------|-----|
| 2A: Resilience | 56 | 1.4 weeks |
| 2B: Performance | 24 | 0.6 weeks |
| 2C: Observability | 40 | 1.0 weeks |
| 2D: Database HA | 36 | 0.9 weeks |
| **Total** | **156** | **~4 weeks** |

---

## 10. References

- Circuit Breaker: `PHASE2_CIRCUIT_BREAKER_RESEARCH.md`
- DLQ: `PHASE2_DLQ_RESEARCH.md`
- Parallel Processing: `PHASE2_PARALLEL_PROCESSING_RESEARCH.md`
- Log Aggregation: `PHASE2_LOG_AGGREGATION_RESEARCH.md`
- PostgreSQL Replication: `PHASE2_POSTGRESQL_REPLICATION_RESEARCH.md`
- Phase 1 Synthesis: `SYNTHESIS_AND_REMEDIATION_PLAN.md`

---

**Document Version:** 1.0  
**Last Updated:** March 19, 2026  
**Next Review:** Post Phase 2A Completion
