---
title: Disaster Recovery & Business Continuity
source: DISASTER_RECOVERY_DEEP_DIVE.md, ERROR_RECOVERY_AND_DR_GUIDE.md
consolidated: 2026-03-19
---

# Disaster Recovery & Business Continuity

> Consolidated from: DISASTER_RECOVERY_DEEP_DIVE.md, ERROR_RECOVERY_AND_DR_GUIDE.md

## Executive Summary

This audit analyzes the disaster recovery and business continuity posture of the Zaplit n8n + Twenty CRM integration. The current single-VM deployment presents **significant resilience gaps** that expose the business to extended outages and potential data loss.

### Key Findings

| Category | Risk Level | Impact | Status |
|----------|------------|--------|--------|
| Single VM Infrastructure | **CRITICAL** | Total outage on failure | No redundancy |
| Backup Strategy | **HIGH** | Partial data loss possible | Gaps identified |
| RTO Achievement | **MEDIUM** | 1-4 hour recovery window | Exceeds target |
| Third-Party Dependencies | **HIGH** | Cascade failures possible | No circuit breakers |
| Monitoring Coverage | **MEDIUM** | Delayed incident detection | Incomplete |

### Recovery Objectives

| Metric | Current | Target | Gap |
|--------|---------|--------|-----|
| **RTO** (Recovery Time Objective) | 1-2 hours | 15 minutes | **At Risk** |
| **RPO** (Recovery Point Objective) | 24h | Zero data loss | **At Risk** |
| **Availability** | ~95% | 99.9% | **Gap** |

---

## Single Points of Failure (SPOF) Analysis

### Infrastructure SPOFs

#### Single GCP VM Instance

| Attribute | Current State | Risk Assessment |
|-----------|---------------|-----------------|
| **Compute** | Single e2-medium VM | **CRITICAL** - No redundancy |
| **Zone** | Single zone deployment | **CRITICAL** - Zone failure = total outage |
| **Region** | us-central1 only | **HIGH** - Regional disaster = extended outage |
| **Disk** | Single persistent disk | **HIGH** - Disk failure = data loss |
| **Network** | Single NIC | **MEDIUM** - NIC failure = isolation |

**Failure Scenario: VM Termination**

```
Timeline of VM Failure:
├── T+0s    - VM becomes unreachable (crash/termination)
├── T+30s   - Health check fails
├── T+60s   - Monitoring alert fires (if configured)
├── T+5min  - On-call engineer acknowledges
├── T+15min - Investigation confirms VM failure
├── T+30min - New VM provisioning initiated
├── T+45min - OS and dependencies installed
├── T+60min - n8n and PostgreSQL restored from backup
├── T+75min - Workflows imported, credentials configured
├── T+90min - DNS updated, traffic directed to new VM
├── T+120min - Verification complete
└── Total Downtime: ~2 hours
```

### Data SPOFs

#### Data Storage Risk Matrix

| Data Store | Replication | Backup Frequency | RPO | Risk Level |
|------------|-------------|------------------|-----|------------|
| n8n PostgreSQL | None (single instance) | Daily (assumed) | 24h | **CRITICAL** |
| Workflow definitions | Git repository | On change | 0h | Low |
| Google Sheets backup | Google-managed | Real-time | 0h | Low |
| Execution logs | Local only | None | N/A | **HIGH** |
| Credentials | n8n encrypted store | Manual export | Variable | **MEDIUM** |

### Third-Party Dependency Risks

| Dependency | Criticality | Failure Mode | Impact | Mitigation |
|------------|-------------|--------------|--------|------------|
| **Twenty CRM API** | CRITICAL | API outage, rate limiting, auth failure | Submissions fail | No circuit breaker |
| **Google Sheets API** | HIGH | Quota exceeded, auth failure | Backup fails | Partial (separate credential) |
| **GCP Compute** | CRITICAL | VM failure, zone outage | Total system down | No redundancy |
| **Cloudflare DNS** | HIGH | DNS resolution failure | Form unreachable | TTL-based caching |
| **Let's Encrypt** | MEDIUM | Certificate expiration | HTTPS failures | Auto-renewal configured |

---

## Failure Scenario Analysis

### Scenario Matrix

| Scenario | Probability | Impact | Detection | Current Response | Gap |
|----------|-------------|--------|-----------|------------------|-----|
| GCP VM failure | Medium | Critical | Health check | Manual recovery | **No auto-failover** |
| PostgreSQL corruption | Low | Critical | Error alerts | Restore from backup | **No replication** |
| Twenty CRM API outage | Medium | High | API health check | Failures cascade | **No circuit breaker** |
| n8n service crash | Low-Medium | Critical | Process monitor | Manual restart | **No auto-restart** |
| Network partition | Low | High | Connectivity checks | Timeout failures | **No retry queue** |
| Credential expiration | Medium | High | Auth failures | Manual rotation | **No auto-rotation** |
| Rate limiting (CRM) | Medium | Medium | 429 errors | Immediate retry | **No backoff strategy** |
| DDoS attack | Low | High | Traffic spike | Service overload | **No rate limiting** |

### Detailed Failure Scenarios

#### Scenario: GCP VM Failure

```
Failure Description:
├── VM crashes due to kernel panic
├── VM terminated by GCP maintenance
├── Disk failure causing VM unbootable
└── Resource exhaustion (OOM, disk full)

Impact Assessment:
├── All form submissions fail immediately
├── In-flight executions lost
├── Webhook endpoints unreachable
├── Recovery requires full rebuild
└── Estimated downtime: 1-2 hours

Current Mitigation:
├── Daily backups (assumed)
├── Infrastructure as code (Terraform)
├── Documented recovery procedures
└── Google Sheets backup persists data

Gaps:
├── No automated failover
├── No hot standby
├── Manual intervention required
└── Recovery time exceeds RTO

Recommended Mitigation:
├── Implement health-check auto-restart
├── Create VM snapshot schedule
├── Deploy standby in different zone
├── Implement load balancer with health checks
└── Automate recovery with Cloud Functions
```

#### Scenario: Twenty CRM API Outage

```
Failure Description:
├── CRM provider infrastructure issues
├── API rate limiting triggered
├── Authentication token expiration
└── Network connectivity to CRM

Impact Assessment:
├── Form submissions fail at CRM creation step
├── Partial data (Person created, Company fails)
├── User sees error message
└── Data potentially lost if no fallback

Current Mitigation:
├── Google Sheets backup captures data
├── Error logging for failed submissions
└── Manual recovery possible from Sheets

Gaps:
├── No circuit breaker to prevent cascade
├── No automatic retry queue
├── No graceful degradation
├── No immediate notification to users
└── Potential for data inconsistency

Recommended Mitigation:
├── Implement circuit breaker pattern
├── Store failed submissions in DLQ
├── Return graceful error to users
├── Process DLQ when CRM recovers
├── Alert on-call for extended outages
```

---

## Resilience Patterns

### Circuit Breaker Pattern

```javascript
// Circuit Breaker Implementation
const CIRCUIT_STATE = {
  CLOSED: 'CLOSED',      // Normal operation
  OPEN: 'OPEN',          // Failing, reject fast
  HALF_OPEN: 'HALF_OPEN' // Testing if recovered
};

const CIRCUIT_CONFIG = {
  failureThreshold: 5,        // Open after 5 failures
  resetTimeoutMs: 60000,      // Try again after 60s
  halfOpenMaxCalls: 3         // Test with 3 calls when half-open
};

// Store circuit state (in production, use Redis/shared storage)
let circuitState = {
  state: CIRCUIT_STATE.CLOSED,
  failures: 0,
  lastFailureTime: null,
  successCount: 0
};

function checkCircuitBreaker() {
  const now = Date.now();
  
  switch (circuitState.state) {
    case CIRCUIT_STATE.OPEN:
      if (now - circuitState.lastFailureTime > CIRCUIT_CONFIG.resetTimeoutMs) {
        circuitState.state = CIRCUIT_STATE.HALF_OPEN;
        circuitState.successCount = 0;
        console.log('Circuit breaker: Transitioning to HALF_OPEN');
      } else {
        throw new Error('CIRCUIT_OPEN: Service temporarily unavailable');
      }
      break;
      
    case CIRCUIT_STATE.HALF_OPEN:
      if (circuitState.successCount >= CIRCUIT_CONFIG.halfOpenMaxCalls) {
        circuitState.state = CIRCUIT_STATE.CLOSED;
        circuitState.failures = 0;
        console.log('Circuit breaker: Transitioning to CLOSED');
      }
      break;
  }
  
  return circuitState.state;
}
```

### Dead Letter Queue (DLQ)

```
Recommended DLQ Architecture:
┌─────────────────────────────────────────────────────┐
│              Dead Letter Queue                       │
│  ┌───────────────────────────────────────────────┐ │
│  │  Priority Queue                                │ │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐         │ │
│  │  │ HIGH    │ │ NORMAL  │ │ LOW     │         │ │
│  │  │ Retry:  │ │ Retry:  │ │ Retry:  │         │ │
│  │  │ 1 min   │ │ 5 min   │ │ 15 min  │         │ │
│  │  └─────────┘ └─────────┘ └─────────┘         │ │
│  └───────────────────────────────────────────────┘ │
│                          │                          │
│                          ▼                          │
│  ┌───────────────────────────────────────────────┐ │
│  │  DLQ Processor (runs every 5 minutes)          │ │
│  │  - Check circuit breaker                       │ │
│  │  - Retry eligible messages                     │ │
│  │  - Move to poison queue after 5 failures       │ │
│  └───────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

---

## High Availability Architecture Options

### Option 1: Hot Standby (Active-Passive)

```
Hot Standby Deployment:

┌─────────────────────────────────────────────────────────────┐
│                      GCP us-central1                        │
│  ┌─────────────────────┐         ┌─────────────────────┐   │
│  │   Zone: us-c1-a     │         │   Zone: us-c1-b     │   │
│  │                     │         │                     │   │
│  │  ┌───────────────┐  │         │  ┌───────────────┐  │   │
│  │  │  n8n Primary  │  │◀────────│  │  n8n Standby  │  │   │
│  │  │   (Active)    │  │  Sync   │  │  (Passive)    │  │   │
│  │  │               │  │         │  │               │  │   │
│  │  │ - PostgreSQL  │  │         │  │ - PostgreSQL  │  │   │
│  │  │   (primary)   │  │         │  │   (replica)   │  │   │
│  │  │ - All services│  │         │  │ - Services    │  │   │
│  │  │   active      │  │         │  │   stopped     │  │   │
│  │  └───────┬───────┘  │         │  └───────┬───────┘  │   │
│  │          │          │         │          │          │   │
│  │    ┌─────┴─────┐    │         │    ┌─────┴─────┐    │   │
│  │    │  SSD Disk │    │         │    │  SSD Disk │    │   │
│  │    │ (Primary) │    │         │    │ (Replica) │    │   │
│  │    └───────────┘    │         │    └───────────┘    │   │
│  └─────────────────────┘         └─────────────────────┘   │
│                             │                               │
│                             ▼                               │
│                    ┌─────────────────┐                      │
│                    │  Cloud DNS      │                      │
│                    │  (Health Check) │                      │
│                    │                 │                      │
│                    │  A Record:      │                      │
│                    │  n8n.zaplit.com │                      │
│                    │  -> Primary IP  │                      │
│                    └─────────────────┘                      │
└─────────────────────────────────────────────────────────────┘

Failover Process:
1. Health check detects primary failure
2. DNS updated to point to standby IP
3. Standby PostgreSQL promoted to primary
4. Standby services started
5. Traffic redirected to standby

RTO: 5-10 minutes
RPO: Near-zero (streaming replication)
Cost: 2x compute cost
```

### Option 2: Cloud Run Serverless (Recommended)

```
Cloud Run Serverless Deployment:

┌─────────────────────────────────────────────────────────────┐
│                    GCP Cloud Run                            │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │           Cloud Run Service (n8n)                    │   │
│  │                                                      │   │
│  │   ┌─────────┐  ┌─────────┐  ┌─────────┐             │   │
│  │   │Instance1│  │Instance2│  │Instance3│  ...         │   │
│  │   │ (zone a)│  │ (zone b)│  │ (zone c)│             │   │
│  │   └────┬────┘  └────┬────┘  └────┬────┘             │   │
│  │        └─────────────┼─────────────┘                 │   │
│  │                      │                               │   │
│  │              Auto-scaling (1-100 instances)          │   │
│  │              Zero-downtime deployments               │   │
│  │              Automatic traffic distribution          │   │
│  └──────────────────────┼───────────────────────────────┘   │
│                         │                                   │
│                         ▼                                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │         Cloud SQL (PostgreSQL)                       │   │
│  │                                                      │   │
│  │   ┌─────────────┐         ┌─────────────┐           │   │
│  │   │   Primary   │◀───────▶│   Replica   │           │   │
│  │   │  (Zone a)   │  Sync   │  (Zone b)   │           │   │
│  │   └─────────────┘         └─────────────┘           │   │
│  │                                                      │   │
│  │   - Automatic backups                                │   │
│  │   - Point-in-time recovery                           │   │
│  │   - High availability (99.95% SLA)                   │   │
│  └──────────────────────┼───────────────────────────────┘   │
│                         │                                   │
│  ┌──────────────────────┴───────────────────────────────┐   │
│  │              Cloud Load Balancer + Cloud DNS          │   │
│  │                                                      │   │
│  │   Global anycast IP with automatic health checks     │   │
│  │   SSL termination with managed certificates          │   │
│  │   DDoS protection and WAF                            │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘

Benefits:
├── Automatic scaling (0 to N instances)
├── Pay-per-use (scales to zero)
├── Built-in load balancing
├── Automatic HTTPS
├── Regional deployment (multi-zone)
├── Zero-downtime deployments
├── Managed database with HA
└── Reduced operational burden

RTO: 0 (automatic)
RPO: 0 (Cloud SQL HA)
Cost: Pay-per-use (potentially lower than VM)
```

### Architecture Comparison

| Criteria | Current (Single VM) | Hot Standby | Cloud Run (Rec.) | Multi-Region |
|----------|---------------------|-------------|------------------|--------------|
| **RTO** | 60-120 min | 5-10 min | Instant | Instant |
| **RPO** | 24h? | Near-zero | Zero | Zero |
| **Availability** | ~95% | ~99.5% | ~99.95% | ~99.99% |
| **Monthly Cost** | $50-100 | $150-250 | $50-200* | $300-600 |
| **Complexity** | Low | Medium | Low | High |
| **Scalability** | None | Limited | Excellent | Excellent |
| **Operational Burden** | High | Medium | Low | Medium |
| **Migration Effort** | N/A | Medium | High | Very High |

---

## DR Runbooks

### Runbook Inventory

| ID | Runbook | Priority | Status | Complexity |
|----|---------|----------|--------|------------|
| RB-DR-001 | VM Failure Recovery | Critical | To Create | Medium |
| RB-DR-002 | Database Corruption Recovery | Critical | To Create | High |
| RB-DR-003 | Complete System Loss Recovery | Critical | To Create | High |
| RB-DR-004 | CRM API Outage Response | High | To Create | Low |
| RB-DR-005 | Network Partition Handling | Medium | To Create | Medium |
| RB-DR-006 | Zone Failure Failover | High | To Create | Medium |
| RB-DR-007 | Data Recovery from Backups | Critical | To Create | Medium |
| RB-DR-008 | Credential Emergency Rotation | High | Exists | Low |

### Emergency Rollback Procedure (< 5 minutes)

```bash
#!/bin/bash
# emergency-rollback.sh - Execute in case of critical failure

set -e

WORKFLOW_NAME="consultation-form-to-crm"
ENVIRONMENT="production"
N8N_URL="https://n8n.zaplit.com"
ROLLBACK_VERSION=${1:-""}  # Optional: specific version to rollback to

echo "🚨 EMERGENCY ROLLBACK INITIATED"
echo "================================"
echo "Time: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo "Workflow: $WORKFLOW_NAME"
echo ""

# Step 1: Immediate Deactivation (T+0s)
echo "[T+0s] Step 1/6: Deactivating workflow..."
# ... workflow deactivation logic ...

echo "✅ Workflow deactivated"
echo ""

# Step 2-6: Rollback process...
# See original ERROR_RECOVERY_AND_DR_GUIDE.md for full script
```

---

## Implementation Roadmap

### Immediate Actions (Week 1)

| Priority | Action | Owner | Effort | Impact |
|----------|--------|-------|--------|--------|
| P0 | Implement automated VM snapshots (daily) | SRE | 2h | High |
| P0 | Verify and document backup restoration process | SRE | 4h | Critical |
| P0 | Configure Docker auto-restart policy | SRE | 1h | Medium |
| P1 | Implement circuit breaker for CRM API | Eng | 8h | Critical |
| P1 | Add health check endpoint monitoring | SRE | 4h | High |
| P1 | Document runbook for VM failure recovery | SRE | 4h | High |

### Short-Term (Month 1)

| Priority | Action | Owner | Effort | Impact |
|----------|--------|-------|--------|--------|
| P1 | Implement Dead Letter Queue for failed submissions | Eng | 16h | High |
| P1 | Deploy PostgreSQL streaming replication | SRE | 16h | Critical |
| P2 | Implement exponential backoff with jitter | Eng | 4h | Medium |
| P2 | Create hot standby VM in different zone | SRE | 16h | High |
| P2 | Automate backup verification testing | SRE | 8h | Medium |
| P2 | Implement credential expiration monitoring | Sec | 8h | Medium |

### Medium-Term (Quarter 1)

| Priority | Action | Owner | Effort | Impact |
|----------|--------|-------|--------|--------|
| P2 | Migrate to Cloud Run for auto-scaling | SRE | 40h | High |
| P2 | Implement bulkhead pattern for form isolation | Eng | 16h | Medium |
| P3 | Set up multi-region DR capability | SRE | 80h | Medium |
| P3 | Implement chaos engineering testing | SRE | 24h | Medium |
| P3 | Complete runbook automation | SRE | 40h | Medium |

---

**Original Documents:** [DISASTER_RECOVERY_DEEP_DIVE.md](/DISASTER_RECOVERY_DEEP_DIVE.md), [ERROR_RECOVERY_AND_DR_GUIDE.md](/ERROR_RECOVERY_AND_DR_GUIDE.md)
