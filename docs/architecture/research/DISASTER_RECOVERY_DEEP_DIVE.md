# Disaster Recovery & Business Continuity Deep Dive

**System:** n8n + Twenty CRM Integration  
**Deployment Model:** Single GCP VM (Production)  
**Criticality:** HIGH - Customer-facing consultation form processing  
**Audit Date:** March 19, 2026  
**Auditor:** Principal Site Reliability Engineer  
**Classification:** CONFIDENTIAL - Infrastructure Security

---

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

### Audit Scope

```
┌─────────────────────────────────────────────────────────────────────┐
│                    SYSTEM BOUNDARY                                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  External        ┌──────────────────────┐        External           │
│  Users    ─────▶ │   GCP VM (n8n)       │ ────▶ Twenty CRM          │
│                  │   - Single instance  │                         │
│  Website  ─────▶ │   - Docker Compose   │ ────▶ Google Sheets       │
│  (zaplit.com)    │   - Local PostgreSQL │                         │
│                  └──────────────────────┘                         │
│                           │                                        │
│                           ▼                                        │
│                    ┌──────────────┐                               │
│                    │  Cloud DNS   │                               │
│                    │  (n8n.zaplit)│                               │
│                    └──────────────┘                               │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 1. Single Points of Failure (SPOF) Analysis

### 1.1 Infrastructure SPOFs

#### 1.1.1 Single GCP VM Instance

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

**Business Impact:**
- Form submissions completely unavailable
- Potential customer loss during outage
- Revenue impact for consultation-based business
- Reputation damage from extended downtime

#### 1.1.2 Single Database Instance

| Component | Risk | Impact | Mitigation Status |
|-----------|------|--------|-------------------|
| PostgreSQL on same VM | **CRITICAL** | DB corruption = total data loss | No replication |
| No automated failover | **CRITICAL** | Manual recovery required | Not implemented |
| Local disk storage | **HIGH** | Disk failure affects DB | No separation |
| No read replicas | **MEDIUM** | Query load cannot be distributed | Not implemented |


### 1.2 Network SPOFs

#### 1.2.1 Network Architecture Risks

| Component | SPOF? | Risk Level | Failure Impact |
|-----------|-------|------------|----------------|
| Single External IP | Yes | **HIGH** | Complete connectivity loss |
| Single VPC | Yes | **MEDIUM** | Network isolation |
| Single NAT Gateway | Yes | **MEDIUM** | Outbound traffic blocked |
| Single DNS A Record | Yes | **HIGH** | Resolution failures |
| No Load Balancer | Yes | **CRITICAL** | No traffic distribution |

#### 1.2.2 Third-Party Network Dependencies

```
External Dependency Chain:
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│   Website    │───▶│  n8n Webhook │───▶│ Twenty CRM   │
│ (zaplit.com) │    │ (n8n.zaplit) │    │  (REST API)  │
└──────────────┘    └──────────────┘    └──────────────┘
       │                   │                    │
       ▼                   ▼                    ▼
  Cloudflare DNS     GCP Network         CRM Provider
  
Failure at ANY point breaks the chain
```

### 1.3 Data SPOFs

#### 1.3.1 Data Storage Risk Matrix

| Data Store | Replication | Backup Frequency | RPO | Risk Level |
|------------|-------------|------------------|-----|------------|
| n8n PostgreSQL | None (single instance) | Daily (assumed) | 24h | **CRITICAL** |
| Workflow definitions | Git repository | On change | 0h | Low |
| Google Sheets backup | Google-managed | Real-time | 0h | Low |
| Execution logs | Local only | None | N/A | **HIGH** |
| Credentials | n8n encrypted store | Manual export | Variable | **MEDIUM** |

### 1.4 Third-Party Dependency Risks

#### 1.4.1 Dependency Risk Register

| Dependency | Criticality | Failure Mode | Impact | Mitigation |
|------------|-------------|--------------|--------|------------|
| **Twenty CRM API** | CRITICAL | API outage, rate limiting, auth failure | Submissions fail | No circuit breaker |
| **Google Sheets API** | HIGH | Quota exceeded, auth failure | Backup fails | Partial (separate credential) |
| **GCP Compute** | CRITICAL | VM failure, zone outage | Total system down | No redundancy |
| **Cloudflare DNS** | HIGH | DNS resolution failure | Form unreachable | TTL-based caching |
| **Let's Encrypt** | MEDIUM | Certificate expiration | HTTPS failures | Auto-renewal configured |

---

## 2. Backup & Recovery Analysis

### 2.1 Current Backup Strategy Assessment

#### 2.1.1 Backup Coverage Matrix

| Component | Current Backup | Frequency | Verified? | Risk Level |
|-----------|----------------|-----------|-----------|------------|
| PostgreSQL Database | pg_dump (assumed) | Daily? | Unknown | **CRITICAL** |
| n8n Workflows | Git repository | Real-time | Yes | Low |
| n8n Credentials | Manual export | Ad-hoc | Unknown | **HIGH** |
| Environment Config | Manual documentation | Ad-hoc | Unknown | **MEDIUM** |
| Execution History | None | N/A | N/A | **MEDIUM** |
| Google Sheets Data | Google-managed | Continuous | Yes | Low |
| SSL Certificates | Let's Encrypt | 90 days | Auto-renew | Low |

### 2.2 Recovery Time Objective (RTO) Analysis

#### 2.2.1 Current vs. Target RTO

| Scenario | Target RTO | Current Capability | Gap | Status |
|----------|------------|-------------------|-----|--------|
| Workflow failure | 15 min | 5-15 min | Met | Achievable |
| n8n service crash | 15 min | 30-60 min | 2-4x | **At Risk** |
| VM failure | 30 min | 60-120 min | 2-4x | **At Risk** |
| Database corruption | 60 min | 120-240 min | 2-4x | **At Risk** |
| Complete system loss | 120 min | 180-300 min | 1.5-2.5x | **At Risk** |

### 2.3 Recovery Point Objective (RPO) Analysis

#### 2.3.1 Data Loss Risk by Component

| Data Type | Current RPO | Acceptable RPO | Risk | Mitigation |
|-----------|-------------|----------------|------|------------|
| Form submissions | 0 (Google Sheets) | 0 | Met | Dual-write to Sheets |
| Workflow configurations | 0 (Git) | 24h | Met | Version control |
| Execution history | 24h+ | 24h | Acceptable | Pruning configured |
| CRM data | 0 (CRM backups) | 24h | Met | CRM-managed |
| n8n database | 24h? | 1h | **At Risk** | Backup frequency unknown |
| Failed submission queue | Unknown | 0 | Unclear | DLQ implementation? |


---

## 3. Failure Scenario Analysis

### 3.1 Scenario Matrix

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

### 3.2 Detailed Failure Scenarios

#### 3.2.1 Scenario: GCP VM Failure

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

#### 3.2.2 Scenario: Twenty CRM API Outage

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

#### 3.2.3 Scenario: Database Corruption

```
Failure Description:
├── PostgreSQL data file corruption
├── Write-ahead log (WAL) corruption
├── Index corruption causing crashes
├── Accidental data deletion
└── Disk failure affecting database files

Impact Assessment:
├── Total data loss from corruption point
├── All historical execution data lost
├── Workflow state information lost
├── Credential references potentially lost
└── Extended recovery time required

Current Mitigation:
├── Daily pg_dump backups (assumed)
├── PostgreSQL WAL archiving (if configured)
└── Point-in-time recovery capability (if configured)

Gaps:
├── No database replication
├── No automated backup verification
├── Unknown backup frequency and retention
├── Recovery procedure not tested
└── Potential for 24h+ data loss

Recommended Mitigation:
├── Implement PostgreSQL streaming replication
├── Enable point-in-time recovery (PITR)
├── Automate backup verification
├── Test recovery procedures monthly
├── Implement database health monitoring
```


---

## 4. Resilience Patterns Gap Analysis

### 4.1 Circuit Breaker Pattern

#### 4.1.1 Current State

| Aspect | Implementation | Status |
|--------|----------------|--------|
| Failure detection | Basic error handling | Partial |
| Threshold configuration | Hardcoded in workflow | Partial |
| State management | In-memory only | Missing |
| Automatic recovery | Manual only | Missing |
| Alerting | Slack notifications | Implemented |

#### 4.1.2 Recommended Implementation

```javascript
// Circuit Breaker Implementation for n8n
const CIRCUIT_CONFIG = {
  failureThreshold: 5,        // Open after 5 failures
  successThreshold: 3,        // Close after 3 successes in half-open
  timeout: 60000,             // Try half-open after 60s
  monitoringPeriod: 60000     // Track failures over 1 minute
};

// Store circuit state (use Redis/shared storage in production)
const circuitState = {
  state: 'CLOSED',            // CLOSED, OPEN, HALF_OPEN
  failures: 0,
  successes: 0,
  lastFailureTime: null,
  nextAttemptTime: null
};

function checkCircuit() {
  const now = Date.now();
  
  if (circuitState.state === 'OPEN') {
    if (now >= circuitState.nextAttemptTime) {
      circuitState.state = 'HALF_OPEN';
      circuitState.successes = 0;
      console.log('Circuit: Transitioning to HALF_OPEN');
    } else {
      throw new Error('CIRCUIT_OPEN: CRM API temporarily unavailable');
    }
  }
  
  return circuitState.state;
}

function recordSuccess() {
  if (circuitState.state === 'HALF_OPEN') {
    circuitState.successes++;
    if (circuitState.successes >= CIRCUIT_CONFIG.successThreshold) {
      circuitState.state = 'CLOSED';
      circuitState.failures = 0;
      console.log('Circuit: Transitioning to CLOSED');
    }
  } else {
    circuitState.failures = 0;
  }
}

function recordFailure() {
  circuitState.failures++;
  
  if (circuitState.failures >= CIRCUIT_CONFIG.failureThreshold) {
    circuitState.state = 'OPEN';
    circuitState.lastFailureTime = Date.now();
    circuitState.nextAttemptTime = Date.now() + CIRCUIT_CONFIG.timeout;
    console.error('Circuit: Transitioning to OPEN');
    
    // Alert on-call
    sendAlert('Circuit breaker opened for CRM API');
  }
}
```

### 4.2 Retry with Exponential Backoff

#### 4.2.1 Current vs. Recommended

```javascript
// Current Implementation (Fixed Delay)
{
  "retryOnFail": true,
  "maxTries": 3,
  "waitBetweenTries": 2000  // Fixed 2 second delay
}

// Recommended Implementation (Exponential Backoff with Jitter)
function calculateRetryDelay(attempt, baseDelay = 1000, maxDelay = 30000) {
  // Exponential backoff: 1s, 2s, 4s, 8s...
  const exponentialDelay = baseDelay * Math.pow(2, attempt - 1);
  
  // Cap at maximum delay
  const cappedDelay = Math.min(exponentialDelay, maxDelay);
  
  // Add jitter (+/-25%) to prevent thundering herd
  const jitter = cappedDelay * 0.25 * (Math.random() * 2 - 1);
  
  return Math.floor(cappedDelay + jitter);
}

// Retry schedule example:
// Attempt 1: ~1000ms  (0.75s - 1.25s with jitter)
// Attempt 2: ~2000ms  (1.5s - 2.5s with jitter)
// Attempt 3: ~4000ms  (3s - 5s with jitter)
// Total time: ~7 seconds vs current 4 seconds
```

### 4.3 Dead Letter Queue (DLQ)

#### 4.3.1 Implementation Gap

```
Current Failure Handling:
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Webhook   │──▶  │   Process   │──▶  │    Error    │
│   Received  │     │    Data     │     │   Handler   │
└─────────────┘     └─────────────┘     └──────┬──────┘
                                                │
                                                ▼
                                       ┌─────────────┐
                                       │  Log Error  │
                                       │  Sheets     │
                                       └─────────────┘

Issues:
├── No automatic retry
├── Manual intervention required
├── No prioritization
├── No visibility into queue depth
└── Risk of data loss if Sheets fails

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

## 5. High Availability Architecture Options

### 5.1 Option 1: Hot Standby (Active-Passive)

#### 5.1.1 Architecture

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

#### 5.1.2 Pros and Cons

| Aspect | Assessment |
|--------|------------|
| **RTO** | 5-10 minutes (automated) |
| **RPO** | Near-zero (streaming replication) |
| **Complexity** | Medium - requires automation |
| **Cost** | 2x compute (standby always running) |
| **Data consistency** | Strong (synchronous replication) |
| **Failover risk** | Low (tested procedure) |

### 5.2 Option 2: Cloud Run Serverless (Recommended)

#### 5.2.1 Architecture

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
│  └──────────────────────┬───────────────────────────────┘   │
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

### 5.3 Architecture Comparison

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

*Cloud Run cost varies based on usage


---

## 6. Risk Assessment Matrix

### 6.1 Risk Scoring Methodology

```
Risk Score = Probability x Impact

Probability Scale:
1 - Rare (once per year or less)
2 - Unlikely (once per 6-12 months)
3 - Possible (once per 3-6 months)
4 - Likely (once per 1-3 months)
5 - Almost Certain (multiple times per month)

Impact Scale:
1 - Negligible (no business impact)
2 - Minor (minor inconvenience, <1 hour downtime)
3 - Moderate (customer impact, 1-4 hours downtime)
4 - Major (revenue impact, 4-24 hours downtime)
5 - Critical (business-threatening, >24 hours downtime)

Risk Levels:
1-5:   Low (Acceptable)
6-10:  Medium (Monitor)
11-15: High (Mitigate)
16-25: Critical (Immediate Action Required)
```

### 6.2 Risk Register

| ID | Risk Description | Probability | Impact | Score | Level | Owner | Status |
|----|------------------|-------------|--------|-------|-------|-------|--------|
| R1 | Single VM failure causes total outage | 3 | 5 | 15 | **HIGH** | SRE | Open |
| R2 | Database corruption with no HA | 2 | 5 | 10 | **MEDIUM** | SRE | Open |
| R3 | CRM API outage causes cascade failure | 4 | 4 | 16 | **CRITICAL** | Eng | Open |
| R4 | Backup restore fails during recovery | 2 | 5 | 10 | **MEDIUM** | SRE | Open |
| R5 | Credential expiration undetected | 3 | 4 | 12 | **HIGH** | Sec | Open |
| R6 | Network partition causes split-brain | 2 | 4 | 8 | **MEDIUM** | SRE | Open |
| R7 | Data loss due to backup gaps | 2 | 5 | 10 | **MEDIUM** | SRE | Open |
| R8 | Zone outage causes extended downtime | 2 | 5 | 10 | **MEDIUM** | SRE | Open |
| R9 | Rate limiting blocks all submissions | 3 | 3 | 9 | **MEDIUM** | Eng | Open |
| R10 | Monitoring blind spot delays detection | 3 | 4 | 12 | **HIGH** | SRE | Open |

### 6.3 Risk Heat Map

```
                    IMPACT
            1      2      3      4      5
         ┌──────┬──────┬──────┬──────┬──────┐
    5    │      │      │      │  R3  │      │  ALMOST
         │      │      │      │ CRM  │      │  CERTAIN
P        ├──────┼──────┼──────┼──────┼──────┤
R   4    │      │      │      │      │      │
O        │      │      │      │      │      │  LIKELY
B        ├──────┼──────┼──────┼──────┼──────┤
A   3    │      │      │  R9  │ R5,  │  R1  │
B        │      │      │ Rate │ R10  │  VM  │  POSSIBLE
I        ├──────┼──────┼──────┼──────┼──────┤
L   2    │      │      │      │  R6  │R2,R4,│
I        │      │      │      │ Net  │R7,R8 │  UNLIKELY
T        ├──────┼──────┼──────┼──────┼──────┤
Y   1    │      │      │      │      │      │
         │      │      │      │      │      │  RARE
         └──────┴──────┴──────┴──────┴──────┘

LEGEND:
┌─────────────────────────────────────────────────────────┐
│  CRITICAL (16-25) │  HIGH (11-15)  │  MEDIUM (6-10)    │
│     Immediate     │   Mitigate     │    Monitor        │
│     Action        │    Soon        │                   │
└─────────────────────────────────────────────────────────┘
```

---

## 7. DR Strategy Recommendations

### 7.1 Immediate Actions (Week 1)

| Priority | Action | Owner | Effort | Impact |
|----------|--------|-------|--------|--------|
| P0 | Implement automated VM snapshots (daily) | SRE | 2h | High |
| P0 | Verify and document backup restoration process | SRE | 4h | Critical |
| P0 | Configure Docker auto-restart policy | SRE | 1h | Medium |
| P1 | Implement circuit breaker for CRM API | Eng | 8h | Critical |
| P1 | Add health check endpoint monitoring | SRE | 4h | High |
| P1 | Document runbook for VM failure recovery | SRE | 4h | High |

### 7.2 Short-Term (Month 1)

| Priority | Action | Owner | Effort | Impact |
|----------|--------|-------|--------|--------|
| P1 | Implement Dead Letter Queue for failed submissions | Eng | 16h | High |
| P1 | Deploy PostgreSQL streaming replication | SRE | 16h | Critical |
| P2 | Implement exponential backoff with jitter | Eng | 4h | Medium |
| P2 | Create hot standby VM in different zone | SRE | 16h | High |
| P2 | Automate backup verification testing | SRE | 8h | Medium |
| P2 | Implement credential expiration monitoring | Sec | 8h | Medium |

### 7.3 Medium-Term (Quarter 1)

| Priority | Action | Owner | Effort | Impact |
|----------|--------|-------|--------|--------|
| P2 | Migrate to Cloud Run for auto-scaling | SRE | 40h | High |
| P2 | Implement bulkhead pattern for form isolation | Eng | 16h | Medium |
| P3 | Set up multi-region DR capability | SRE | 80h | Medium |
| P3 | Implement chaos engineering testing | SRE | 24h | Medium |
| P3 | Complete runbook automation | SRE | 40h | Medium |

### 7.4 DR Implementation Roadmap

```
Q1 2026 (Immediate to 3 months):
├── Week 1-2: Backup and Recovery Foundation
│   ├── Daily automated VM snapshots
│   ├── PostgreSQL PITR configuration
│   ├── Backup verification automation
│   └── Recovery runbook documentation
│
├── Week 3-4: Resilience Patterns
│   ├── Circuit breaker implementation
│   ├── Exponential backoff with jitter
│   ├── Docker auto-restart policies
│   └── Health check improvements
│
├── Month 2: High Availability
│   ├── PostgreSQL streaming replication
│   ├── Hot standby VM deployment
│   ├── Automated failover testing
│   └── DNS health check configuration
│
└── Month 3: Advanced DR
    ├── Dead Letter Queue implementation
    ├── Cloud Run migration planning
    ├── Multi-region DR architecture
    └── Chaos engineering introduction

Q2 2026 (3-6 months):
├── Cloud Run production migration
├── Multi-region active-active (if needed)
├── Full runbook automation
└── Quarterly DR drills
```


---

## 8. Failure Runbooks Required

### 8.1 Runbook Inventory

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

### 8.2 Runbook: RB-DR-001 VM Failure Recovery (Template)

```markdown
# Runbook: RB-DR-001 - VM Failure Recovery

**Purpose:** Recover from GCP VM failure or termination  
**Severity:** P0 - Critical  
**Estimated RTO:** 60-120 minutes  
**Prerequisites:** Access to GCP Console, Terraform state, backup location

---

## Detection

### Symptoms
- Health check endpoint unreachable
- GCP monitoring shows VM stopped
- DNS resolution works but connection refused
- Previous alerts: disk full, memory pressure

### Validation
```bash
# Check VM status
gcloud compute instances describe n8n-production \
  --zone=us-central1-a \
  --format='table(status)'

# Check serial port logs
gcloud compute instances get-serial-port-output n8n-production \
  --zone=us-central1-a
```

---

## Recovery Procedures

### Option 1: VM Auto-Restart (If stopped, not terminated)

```bash
# Attempt to start VM
gcloud compute instances start n8n-production \
  --zone=us-central1-a

# Wait and verify
sleep 60
curl -sf https://n8n.zaplit.com/healthz && echo "Recovery successful"
```

### Option 2: Create New VM from Snapshot (Recommended)

```bash
# Find latest snapshot
LATEST_SNAPSHOT=$(gcloud compute snapshots list \
  --filter="name~'n8n-production-snapshot'" \
  --format="value(name)" \
  --sort-by=~creationTimestamp | head -1)

# Create new boot disk from snapshot
gcloud compute disks create n8n-production-disk-recovery \
  --zone=us-central1-b \
  --source-snapshot=$LATEST_SNAPSHOT

# Create new VM with recovered disk
gcloud compute instances create n8n-production-recovery \
  --zone=us-central1-b \
  --disk=name=n8n-production-disk-recovery,boot=yes \
  --machine-type=e2-medium \
  --tags=n8n,http-server,https-server

# Update DNS to new IP
NEW_IP=$(gcloud compute instances describe n8n-production-recovery \
  --zone=us-central1-b \
  --format="value(networkInterfaces[0].accessConfigs[0].natIP)")

# Update Cloud DNS (automated or manual)
```

### Option 3: Rebuild from Infrastructure as Code

```bash
# Clone infrastructure repository
cd /infrastructure/terraform

# Apply with recovery flag
terraform apply -var="recovery_mode=true" \
  -var="backup_timestamp=latest"

# Verify deployment
./scripts/verify-deployment.sh
```

---

## Verification

- [ ] VM status: RUNNING
- [ ] n8n health check: HTTP 200
- [ ] PostgreSQL accepting connections
- [ ] Workflow executions successful
- [ ] CRM connectivity verified
- [ ] Form submission test passed
- [ ] Monitoring data flowing

---

## Post-Recovery

1. Document root cause
2. Update incident timeline
3. Schedule post-mortem
4. Verify backup integrity
5. Review and update runbook
```


---

## 9. Implementation Priorities

### 9.1 Priority Matrix

```
                    IMPACT
            Low        Medium       High       Critical
         ┌────────┬──────────┬──────────┬──────────┐
   Low   │        │          │          │          │
         │        │          │          │          │
         ├────────┼──────────┼──────────┼──────────┤
E   Med  │        │  Exp.    │  Hot     │  Backup  │
F        │        │  Backoff │  Standby │  Verify  │
F        ├────────┼──────────┼──────────┼──────────┤
O   High │        │  Chaos   │  DLQ     │  Circuit │
R        │        │  Eng.    │          │  Breaker │
T        ├────────┼──────────┼──────────┼──────────┤
   Crit  │        │          │  Cloud   │  VM Snap │
         │        │          │  Run     │  Daily   │
         └────────┴──────────┴──────────┴──────────┘

RECOMMENDED EXECUTION ORDER:
1. VM Snapshots Daily (High Effort/Critical Impact)
2. Circuit Breaker (High Effort/High Impact)
3. Backup Verification (Low Effort/Critical Impact)
4. Hot Standby (Medium Effort/High Impact)
5. DLQ Implementation (High Effort/High Impact)
6. Exponential Backoff (Low Effort/Medium Impact)
7. Cloud Run Migration (High Effort/High Impact)
8. Chaos Engineering (Medium Effort/Medium Impact)
```

### 9.2 Cost-Benefit Analysis

| Initiative | Cost (Monthly) | Benefit (Downtime Reduction) | ROI |
|------------|----------------|------------------------------|-----|
| Daily VM Snapshots | $10-20 | 2 hours -> 30 min | High |
| Circuit Breaker | $0 | Prevents cascade failures | Very High |
| Hot Standby | $50-100 | 2 hours -> 10 min | High |
| Cloud Run Migration | Variable | 2 hours -> 0 min | Very High |
| DLQ Implementation | $0 | Prevents data loss | High |
| PostgreSQL HA | $50-100 | 24h RPO -> 0 RPO | Very High |
| Monitoring Enhancement | $20-50 | Faster detection | Medium |

---

## 10. Conclusion and Next Steps

### 10.1 Summary of Findings

| Category | Current State | Target State | Gap |
|----------|---------------|--------------|-----|
| **Infrastructure** | Single VM | HA with redundancy | **CRITICAL** |
| **Database** | Single instance | Streaming replication | **HIGH** |
| **Backup** | Assumed daily | Verified, automated | **MEDIUM** |
| **Recovery Time** | 1-2 hours | <30 minutes | **HIGH** |
| **Resilience** | Basic retry | Circuit breaker + DLQ | **HIGH** |
| **Monitoring** | Partial | Comprehensive | **MEDIUM** |

### 10.2 Recommended Action Plan

**Phase 1: Stabilize (Week 1-2)**
1. Implement daily VM snapshots
2. Verify backup restoration procedures
3. Configure auto-restart policies
4. Document critical runbooks

**Phase 2: Harden (Month 1)**
1. Implement circuit breaker for CRM API
2. Deploy PostgreSQL streaming replication
3. Create hot standby VM
4. Automate backup verification

**Phase 3: Transform (Quarter 1)**
1. Migrate to Cloud Run
2. Implement full DLQ
3. Multi-region capability
4. Chaos engineering program

### 10.3 Success Metrics

| Metric | Current | 30-Day Target | 90-Day Target |
|--------|---------|---------------|---------------|
| System Availability | ~95% | 99% | 99.9% |
| Recovery Time (RTO) | 1-2 hours | 30 minutes | 5 minutes |
| Data Loss Risk (RPO) | 24 hours | 1 hour | Near-zero |
| Automated Recovery | 0% | 50% | 90% |
| Tested DR Procedures | Unknown | Monthly | Weekly |

---

## Appendices

### Appendix A: Glossary

| Term | Definition |
|------|------------|
| **RTO** | Recovery Time Objective - Maximum acceptable downtime |
| **RPO** | Recovery Point Objective - Maximum acceptable data loss |
| **SPOF** | Single Point of Failure - Component that causes total failure |
| **HA** | High Availability - System design for continuous operation |
| **DLQ** | Dead Letter Queue - Storage for failed messages |
| **Circuit Breaker** | Pattern to prevent cascade failures |
| **Bulkhead** | Pattern to isolate failures |

### Appendix B: Reference Documentation

- [ERROR_RECOVERY_AND_DR_GUIDE.md](./ERROR_RECOVERY_AND_DR_GUIDE.md)
- [N8N_PRODUCTION_DEPLOYMENT_GUIDE.md](./N8N_PRODUCTION_DEPLOYMENT_GUIDE.md)
- [MONITORING_AND_OBSERVABILITY_GUIDE.md](./MONITORING_AND_OBSERVABILITY_GUIDE.md)
- [N8N_TWENTY_CRM_SECURITY_REPORT.md](./N8N_TWENTY_CRM_SECURITY_REPORT.md)
- [RB001 Credential Rotation](./runbooks/RB001-credential-rotation.md)
- [RB002 Incident Response](./runbooks/RB002-incident-response.md)
- [RB003 Workflow Rollback](./runbooks/RB003-workflow-rollback.md)

### Appendix C: Audit Methodology

This audit was conducted following SRE best practices:
1. Documentation review of existing runbooks and guides
2. Architecture analysis of current deployment
3. Failure scenario modeling and impact assessment
4. Industry benchmark comparison
5. Risk scoring using standardized methodology

---

## Quick Reference: Critical Actions

### Immediate (This Week)
- [ ] Enable daily VM snapshots
- [ ] Test backup restoration procedure
- [ ] Configure Docker auto-restart
- [ ] Review and update incident response runbook

### This Month
- [ ] Implement circuit breaker for CRM API
- [ ] Deploy PostgreSQL replication
- [ ] Create standby VM in different zone
- [ ] Implement DLQ for failed submissions

### This Quarter
- [ ] Evaluate Cloud Run migration
- [ ] Implement comprehensive monitoring
- [ ] Conduct first DR drill
- [ ] Document all recovery procedures

---

*Document Version: 1.0*  
*Last Updated: March 19, 2026*  
*Next Review Date: June 19, 2026 (Quarterly)*  
*Owner: Site Reliability Engineering Team*
