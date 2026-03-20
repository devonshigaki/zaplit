# Phase 2: Dead Letter Queue (DLQ) Research & Implementation Guide

**Project:** Zaplit - Form Submission Reliability Enhancement  
**Research Date:** March 19, 2026  
**Classification:** Production Architecture Design  
**Author:** Principal Engineering Research  

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current State Analysis](#2-current-state-analysis)
3. [Architecture Pattern Comparison](#3-architecture-pattern-comparison)
4. [Implementation Recommendation](#4-implementation-recommendation)
5. [Database Schema Design](#5-database-schema-design)
6. [n8n Workflow Design](#6-n8n-workflow-design)
7. [Retry Logic Implementation](#7-retry-logic-implementation)
8. [Monitoring Strategy](#8-monitoring-strategy)
9. [Production Deployment Guide](#9-production-deployment-guide)

---

## 1. Executive Summary

### Problem Statement

Current form submission workflows lack robust failure persistence, resulting in:
- **Data Loss Risk:** Failed webhook processing results in lost customer submissions
- **No Visibility:** Failures require manual log review to detect
- **No Recovery Path:** Failed submissions cannot be automatically retried
- **Operational Burden:** Engineers must manually intervene for each failure

### Recommended Solution

**Hybrid PostgreSQL + Google Sheets DLQ Architecture**

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    RECOMMENDED DLQ ARCHITECTURE                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   Form Submission                                                       │
│        │                                                                │
│        ▼                                                                │
│   ┌─────────────┐     Failure      ┌─────────────────────────────┐     │
│   │ n8n Webhook │─────────────────▶│    PostgreSQL DLQ Table     │     │
│   └─────────────┘                  │  • Primary failure storage  │     │
│        │                           │  • Structured query support │     │
│        │ Success                   │  • Retry scheduling         │     │
│        ▼                           └─────────────────────────────┘     │
│   ┌─────────────┐                              │                        │
│   │  Process    │                              │ Async Replication      │
│   │   to CRM    │                              ▼                        │
│   └─────────────┘                  ┌─────────────────────────────┐     │
│        │                           │   Google Sheets (Backup)    │     │
│        │ Failure                   │  • Human-readable backup    │     │
│        ▼                           │  • Manual review interface  │     │
│   ┌─────────────┐                  │  • Audit trail              │     │
│   │  Update DLQ │                  └─────────────────────────────┘     │
│   │   Status    │                                                       │
│   └─────────────┘                                                       │
│                                                                         │
│   ┌─────────────────────────────────────────────────────────────────┐  │
│   │                     Retry Processor (Scheduled)                  │  │
│   │  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────┐  │  │
│   │  │ Query Ready │───▶│   Attempt   │───▶│   Update Status     │  │  │
│   │  │   Items     │    │    Retry    │    │ (Success/Fail)      │  │  │
│   │  └─────────────┘    └─────────────┘    └─────────────────────┘  │  │
│   │         ▲                                    │                   │  │
│   │         └────────────────────────────────────┘                   │  │
│   │                         (Loop every 5 min)                       │  │
│   └─────────────────────────────────────────────────────────────────┘  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Primary DLQ Storage | PostgreSQL | ACID guarantees, complex queries, existing infrastructure |
| Backup Storage | Google Sheets | Human visibility, manual intervention, non-technical access |
| Retry Strategy | Exponential backoff (5, 10, 20, 40 min) | Balances quick recovery with system protection |
| Max Retries | 5 attempts | ~75 min total retry window covers most transient issues |
| Poison Message Handling | Move to separate table after max retries | Prevents infinite loops, preserves data |
| Retry Processor | Scheduled n8n workflow | Leverages existing infrastructure, easy to modify |

### Expected Outcomes

- **Zero Data Loss:** All failed submissions persisted with full context
- **Automatic Recovery:** 85-90% of transient failures self-heal
- **5-Minute Detection:** Failures visible in Google Sheets within minutes
- **15-Minute Recovery:** Manual intervention possible within 15 minutes
- **Operational Visibility:** Real-time dashboard of DLQ status

---

## 2. Current State Analysis

### 2.1 Existing Workflow Architecture

```
Current Form Processing Flow:
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Website   │───▶│n8n Webhook  │───▶│   Process   │───▶│  Twenty CRM │
│    Form     │    │  (Webhook)  │    │  Workflow   │    │             │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
                                              │
                                              ▼ Failure
                                       ┌─────────────┐
                                       │   Lost or   │
                                       │   Manual    │
                                       │ Intervention│
                                       └─────────────┘
```

### 2.2 Failure Scenarios

| Scenario | Current Behavior | Impact |
|----------|-----------------|--------|
| CRM API Timeout | Execution fails, data lost | High - Customer submission lost |
| CRM Rate Limit (429) | Execution fails, data lost | Medium - Temporary, recoverable |
| Invalid CRM Response | Execution fails, partial data | High - Inconsistent state |
| Network Partition | Execution fails, data lost | High - Infrastructure issue |
| CRM Authentication Failure | Execution fails, all retries fail | Critical - System outage |
| Validation Error | Execution fails, logged | Low - Bad input caught |

### 2.3 Current Error Handling

From `n8n-workflow-v3-enhanced.json`:
```json
{
  "id": "link-person-011",
  "name": "Link Person to Company",
  "type": "n8n-nodes-base.httpRequest",
  "continueOnFail": true  // ← Only node with failure handling
}
```

**Gaps Identified:**
- No centralized error handling
- No persistence of failed payloads
- No retry mechanism
- No alerting on failures
- Limited visibility into failure patterns

---

## 3. Architecture Pattern Comparison

### 3.1 Option A: n8n Queue Mode with Redis

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   n8n Main  │────▶│Redis (Bull) │────▶│n8n Workers  │────▶│   Success   │
│  Instance   │     │   Queue     │     │             │     │             │
└─────────────┘     └─────────────┘     └──────┬──────┘     └─────────────┘
                                               │
                                               ▼ Failure
                                        ┌─────────────┐
                                        │  Bull DLQ   │
                                        │  (Built-in) │
                                        └─────────────┘
```

**Pros:**
- Native n8n integration
- Built-in retry with exponential backoff
- Horizontal scalability
- Workers can be autoscaled

**Cons:**
- Complex infrastructure (Redis, multiple workers)
- DLQ visibility limited (Redis CLI only)
- No structured querying of failed items
- Requires migration from current setup
- Bull DLQ is opaque - hard to inspect

**Best For:** High-volume scenarios (>1000 submissions/day) with existing Redis infrastructure.

### 3.2 Option B: PostgreSQL DLQ Table (Recommended)

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│n8n Webhook  │────▶│   Process   │────▶│ Twenty CRM  │────▶│   Success   │
│             │     │  Workflow   │     │             │     │             │
└─────────────┘     └──────┬──────┘     └─────────────┘     └─────────────┘
                           │
                           ▼ Failure
                    ┌─────────────┐
                    │PostgreSQL   │
                    │  DLQ Table  │◀──── Query/Retry
                    └─────────────┘
```

**Pros:**
- ACID guarantees
- Rich querying capabilities
- Existing PostgreSQL for n8n
- Easy to integrate with current workflow
- Structured schema for analysis
- Can store full payload + metadata

**Cons:**
- Requires custom retry processor
- Additional table maintenance
- No built-in retry scheduling

**Best For:** Medium volume (100-1000 submissions/day), need for structured failure analysis.

### 3.3 Option C: Google Sheets + Retry Workflow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│n8n Webhook  │────▶│   Process   │────▶│ Twenty CRM  │────▶│   Success   │
│             │     │  Workflow   │     │             │     │             │
└─────────────┘     └──────┬──────┘     └─────────────┘     └─────────────┘
                           │
                           ▼ Failure
                    ┌─────────────┐
                    │Google Sheets│◀──── Manual Review
                    │   DLQ Row   │
                    └─────────────┘
```

**Pros:**
- Human-readable format
- No additional infrastructure
- Easy manual intervention
- Natural audit trail

**Cons:**
- Limited querying capabilities
- No ACID guarantees
- Row limits (5M per sheet)
- Slower than database
- No structured retry scheduling

**Best For:** Low volume (<100 submissions/day), heavy manual review requirements.

### 3.4 Option D: Hybrid Approach (PostgreSQL + Google Sheets)

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Failure   │────▶│ PostgreSQL  │────▶│   Google    │
│   Detected  │     │  DLQ Table  │     │   Sheets    │
└─────────────┘     └──────┬──────┘     │  (Backup)   │
                           │            └─────────────┘
                           ▼
                    ┌─────────────┐
                    │   Retry     │
                    │  Processor  │
                    └─────────────┘
```

**Pros:**
- Best of both worlds (structure + visibility)
- PostgreSQL for processing, Sheets for humans
- Redundancy prevents data loss
- Flexible retry scheduling
- Scalable to high volumes

**Cons:**
- More complex implementation
- Dual write requires consistency handling
- Higher maintenance overhead

**Best For:** Production environments requiring both automation and human oversight.

### 3.5 Comparison Matrix

| Criteria | Option A (Redis) | Option B (PostgreSQL) | Option C (Sheets) | Option D (Hybrid) |
|----------|-----------------|----------------------|-------------------|-------------------|
| **Infrastructure** | Complex | Simple | Simple | Moderate |
| **Query Capability** | Limited | Excellent | Poor | Excellent |
| **Human Visibility** | Poor | Moderate | Excellent | Excellent |
| **Retry Control** | Built-in | Custom | Manual | Custom |
| **Scalability** | High | Medium | Low | Medium |
| **Implementation Time** | 2-3 days | 1 day | 4 hours | 1-2 days |
| **Operational Cost** | High | Low | Very Low | Low |
| **Data Integrity** | Good | Excellent | Fair | Excellent |
| **Recommended For** | High volume | Structured needs | Simple needs | Production |

---

## 4. Implementation Recommendation

### 4.1 Recommended Architecture: Hybrid (Option D)

**Rationale:**
1. **Production-Ready:** Combines reliability of PostgreSQL with visibility of Google Sheets
2. **Existing Infrastructure:** Leverages current PostgreSQL (n8n database)
3. **Operational Flexibility:** Engineers can query; non-technical staff can review in Sheets
4. **Incremental Adoption:** Can start with PostgreSQL only, add Sheets later

### 4.2 Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        COMPLETE DLQ ARCHITECTURE                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────────────┐                                                       │
│   │  Website Form   │                                                       │
│   └────────┬────────┘                                                       │
│            │ POST /api/submit-form                                          │
│            ▼                                                                │
│   ┌─────────────────┐                                                       │
│   │  n8n Webhook    │                                                       │
│   │  (Consultation) │                                                       │
│   └────────┬────────┘                                                       │
│            │                                                                │
│            ▼                                                                │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │                    MAIN PROCESSING WORKFLOW                          │  │
│   │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌────────────┐ │  │
│   │  │   Validate  │─▶│   Create    │─▶│   Create    │─▶│   Create   │ │  │
│   │  │    Input    │  │   Person    │  │   Company   │  │    Note    │ │  │
│   │  └─────────────┘  └──────┬──────┘  └──────┬──────┘  └─────┬──────┘ │  │
│   │                          │                │               │        │  │
│   │                          └────────────────┴───────────────┘        │  │
│   │                                          │                         │  │
│   │                                          ▼                         │  │
│   │                              ┌───────────────────┐                 │  │
│   │                              │   Link Person     │                 │  │
│   │                              │   to Company      │                 │  │
│   │                              └───────────────────┘                 │  │
│   └─────────────────────────────────────────────────────────────────────┘  │
│                                  │                                          │
│                    ┌─────────────┼─────────────┐                          │
│                    │             │             │                          │
│                    ▼             ▼             ▼                          │
│            ┌───────────┐ ┌───────────┐ ┌───────────┐                     │
│            │  Success  │ │   Error   │ │   Error   │                     │
│            │           │ │  Handler  │ │  Handler  │                     │
│            └───────────┘ └─────┬─────┘ └─────┬─────┘                     │
│                                │             │                           │
│                                └──────┬──────┘                           │
│                                       │                                   │
│                                       ▼                                   │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │                         DLQ CAPTURE WORKFLOW                         │  │
│   │  ┌─────────────┐  ┌───────────────────┐  ┌───────────────────────┐  │  │
│   │  │   Extract   │─▶│   Enrich Payload  │─▶│   Categorize Error    │  │  │
│   │  │   Error     │  │   (metadata)      │  │   (transient/permanent)│  │  │
│   │  │   Context   │  │                   │  │                       │  │  │
│   │  └─────────────┘  └───────────────────┘  └───────────────────────┘  │  │
│   │                          │                                          │  │
│   │                          ▼                                          │  │
│   │              ┌─────────────────────┐                                │  │
│   │              │  Write to DLQ Table │                                │  │
│   │              │   (PostgreSQL)      │                                │  │
│   │              └──────────┬──────────┘                                │  │
│   │                         │                                           │  │
│   │                         ▼                                           │  │
│   │              ┌─────────────────────┐                                │  │
│   │              │  Replicate to       │                                │  │
│   │              │  Google Sheets      │                                │  │
│   │              └─────────────────────┘                                │  │
│   └─────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │                     RETRY PROCESSOR (Scheduled)                      │  │
│   │                                                                      │  │
│   │   Trigger: Every 5 minutes                                           │  │
│   │                                                                      │  │
│   │   ┌─────────────────┐                                               │  │
│   │   │ Query DLQ Table │                                               │  │
│   │   │ WHERE status =  │                                               │  │
│   │   │ 'PENDING_RETRY' │                                               │  │
│   │   │ AND next_retry  │                                               │  │
│   │   │ <= NOW()        │                                               │  │
│   │   └────────┬────────┘                                               │  │
│   │            │                                                        │  │
│   │            ▼                                                        │  │
│   │   ┌─────────────────┐                                               │  │
│   │   │ For Each Item:  │                                               │  │
│   │   │ 1. Attempt Retry│                                               │  │
│   │   │ 2. If Success:  │                                               │  │
│   │   │    - Update to  │                                               │  │
│   │   │      RESOLVED   │                                               │  │
│   │   │ 3. If Fail:     │                                               │  │
│   │   │    - Increment  │                                               │  │
│   │   │      retry_count│                                               │  │
│   │   │    - Schedule   │                                               │  │
│   │   │      next retry │                                               │  │
│   │   │    - If max     │                                               │  │
│   │   │      retries:   │                                               │  │
│   │   │      Move to    │                                               │  │
│   │   │      PERMANENT  │                                               │  │
│   │   │      FAILURE    │                                               │  │
│   │   └─────────────────┘                                               │  │
│   │                                                                      │  │
│   └─────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.3 Implementation Phases

| Phase | Duration | Deliverables |
|-------|----------|--------------|
| **Phase 1: Core DLQ** | 4 hours | PostgreSQL table, error capture workflow |
| **Phase 2: Retry Processor** | 4 hours | Scheduled retry workflow, backoff logic |
| **Phase 3: Google Sheets Backup** | 2 hours | Sheets integration, human-readable format |
| **Phase 4: Monitoring** | 2 hours | Dashboard, alerts, runbooks |
| **Phase 5: Testing** | 4 hours | Test scenarios, load testing, documentation |

---

## 5. Database Schema Design

### 5.1 Primary DLQ Table

```sql
-- ============================================
-- DLQ Table Schema
-- ============================================

CREATE TYPE dlq_status AS ENUM (
    'PENDING_RETRY',      -- Waiting for next retry attempt
    'IN_PROGRESS',        -- Currently being retried
    'RESOLVED',           -- Successfully processed
    'PERMANENT_FAILURE',  -- Max retries exceeded
    'MANUAL_REVIEW',      -- Flagged for human review
    'DISCARDED'           -- Intentionally discarded
);

CREATE TYPE failure_category AS ENUM (
    'TRANSIENT',          -- Temporary, retryable (timeout, 503)
    'PERMANENT',          -- Permanent, don't retry (400, 404)
    'DEPENDENCY',         -- External service failure (CRM down)
    'VALIDATION',         -- Data validation error
    'RATE_LIMIT',         -- Rate limited (429)
    'AUTHENTICATION',     -- Auth failure (401, 403)
    'NETWORK',            -- Network connectivity
    'UNKNOWN'             -- Unclassified
);

CREATE TABLE form_submission_dlq (
    -- Primary Identity
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    execution_id VARCHAR(255) NOT NULL,
    
    -- Payload Storage (JSONB for flexibility)
    original_payload JSONB NOT NULL,
    normalized_payload JSONB,  -- After validation/transform
    
    -- Error Details
    error_message TEXT NOT NULL,
    error_stack TEXT,
    error_category failure_category NOT NULL DEFAULT 'UNKNOWN',
    failed_node VARCHAR(255),  -- Which n8n node failed
    
    -- Processing Status
    status dlq_status NOT NULL DEFAULT 'PENDING_RETRY',
    retry_count INTEGER NOT NULL DEFAULT 0,
    max_retries INTEGER NOT NULL DEFAULT 5,
    
    -- Timing
    first_failure_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    last_failure_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    next_retry_at TIMESTAMP WITH TIME ZONE,
    resolved_at TIMESTAMP WITH TIME ZONE,
    
    -- Retry History (append-only log)
    retry_history JSONB DEFAULT '[]'::jsonb,
    
    -- Source Tracking
    source_ip INET,
    user_agent TEXT,
    form_type VARCHAR(100) DEFAULT 'consultation',
    
    -- Metadata
    workflow_version VARCHAR(50),
    environment VARCHAR(50) DEFAULT 'production',
    
    -- Manual Review
    assigned_to VARCHAR(255),
    review_notes TEXT,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for Common Queries
CREATE INDEX idx_dlq_status ON form_submission_dlq(status);
CREATE INDEX idx_dlq_next_retry ON form_submission_dlq(next_retry_at) WHERE status = 'PENDING_RETRY';
CREATE INDEX idx_dlq_created_at ON form_submission_dlq(created_at);
CREATE INDEX idx_dlq_error_category ON form_submission_dlq(error_category);
CREATE INDEX idx_dlq_form_type ON form_submission_dlq(form_type);

-- GIN index for JSONB queries (e.g., search by email in payload)
CREATE INDEX idx_dlq_payload_email ON form_submission_dlq USING GIN ((original_payload->'data'->'email'));

-- Partial index for active failures (excludes resolved/discarded)
CREATE INDEX idx_dlq_active ON form_submission_dlq(created_at) 
    WHERE status IN ('PENDING_RETRY', 'IN_PROGRESS', 'MANUAL_REVIEW');

-- ============================================
-- Permanent Failures Archive Table
-- ============================================

CREATE TABLE form_submission_dlq_archive (
    LIKE form_submission_dlq INCLUDING ALL,
    archived_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    archive_reason VARCHAR(255)
);

-- ============================================
-- Audit Log Table
-- ============================================

CREATE TABLE dlq_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dlq_entry_id UUID REFERENCES form_submission_dlq(id) ON DELETE CASCADE,
    action VARCHAR(100) NOT NULL,  -- 'created', 'retry_attempted', 'resolved', etc.
    performed_by VARCHAR(255) DEFAULT 'system',
    details JSONB,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_dlq_entry ON dlq_audit_log(dlq_entry_id);
CREATE INDEX idx_audit_created_at ON dlq_audit_log(created_at);

-- ============================================
-- Statistics View
-- ============================================

CREATE VIEW dlq_statistics AS
SELECT 
    status,
    error_category,
    form_type,
    COUNT(*) as count,
    AVG(retry_count) as avg_retries,
    MIN(first_failure_at) as oldest_failure,
    MAX(last_failure_at) as newest_failure
FROM form_submission_dlq
GROUP BY status, error_category, form_type;

-- ============================================
-- Update Trigger for updated_at
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_dlq_updated_at 
    BEFORE UPDATE ON form_submission_dlq 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();
```

### 5.2 Retry History JSON Schema

```json
{
  "retry_history": [
    {
      "attempt_number": 1,
      "attempted_at": "2026-03-19T10:30:00Z",
      "result": "failed",
      "error": "Connection timeout",
      "next_retry_at": "2026-03-19T10:35:00Z"
    },
    {
      "attempt_number": 2,
      "attempted_at": "2026-03-19T10:35:00Z",
      "result": "success",
      "processing_time_ms": 1250
    }
  ]
}
```

### 5.3 Sample Queries

```sql
-- Get items ready for retry
SELECT * FROM form_submission_dlq 
WHERE status = 'PENDING_RETRY' 
  AND next_retry_at <= NOW()
ORDER BY next_retry_at ASC
LIMIT 100;

-- Get failures by category for analysis
SELECT 
    error_category,
    COUNT(*) as count,
    AVG(EXTRACT(EPOCH FROM (NOW() - first_failure_at))/3600) as avg_age_hours
FROM form_submission_dlq 
WHERE status != 'RESOLVED'
GROUP BY error_category
ORDER BY count DESC;

-- Search for specific submission by email
SELECT * FROM form_submission_dlq 
WHERE original_payload->'data'->>'email' = 'john@example.com';

-- Get retry success rate
SELECT 
    COUNT(*) FILTER (WHERE status = 'RESOLVED') as resolved_count,
    COUNT(*) FILTER (WHERE status = 'PERMANENT_FAILURE') as permanent_failures,
    ROUND(
        100.0 * COUNT(*) FILTER (WHERE status = 'RESOLVED') / 
        NULLIF(COUNT(*), 0), 2
    ) as success_rate_pct
FROM form_submission_dlq
WHERE created_at >= NOW() - INTERVAL '24 hours';

-- Move old resolved items to archive
INSERT INTO form_submission_dlq_archive 
SELECT *, NOW(), 'auto_cleanup_30_days' 
FROM form_submission_dlq 
WHERE status = 'RESOLVED' 
  AND resolved_at < NOW() - INTERVAL '30 days';

DELETE FROM form_submission_dlq 
WHERE status = 'RESOLVED' 
  AND resolved_at < NOW() - INTERVAL '30 days';
```

---

## 6. n8n Workflow Design

### 6.1 DLQ Capture Workflow

**Trigger:** Error Trigger or explicit call from main workflow

```json
{
  "name": "DLQ Capture - Form Submission Failures",
  "nodes": [
    {
      "name": "Error Trigger",
      "type": "n8n-nodes-base.errorTrigger",
      "parameters": {
        "errorWorkflow": "DLQ Capture - Form Submission Failures"
      }
    },
    {
      "name": "Extract Error Context",
      "type": "n8n-nodes-base.code",
      "parameters": {
        "jsCode": "// Extract comprehensive error context\nconst errorInput = $input.first().json;\n\n// Determine error category based on error message\nfunction categorizeError(error) {\n  const msg = (error.message || '').toLowerCase();\n  const code = error.code || error.statusCode;\n  \n  if (code === 429 || msg.includes('rate limit')) return 'RATE_LIMIT';\n  if (code === 401 || code === 403 || msg.includes('unauthorized') || msg.includes('forbidden')) return 'AUTHENTICATION';\n  if (code === 400 || msg.includes('validation') || msg.includes('invalid')) return 'VALIDATION';\n  if (code === 404 || msg.includes('not found')) return 'PERMANENT';\n  if (code === 503 || code === 502 || code === 504 || msg.includes('unavailable')) return 'DEPENDENCY';\n  if (msg.includes('timeout') || msg.includes('econnreset') || msg.includes('etimedout')) return 'NETWORK';\n  if (msg.includes('temporary') || msg.includes('retry')) return 'TRANSIENT';\n  \n  return 'UNKNOWN';\n}\n\n// Calculate next retry time with exponential backoff\nfunction calculateNextRetry(retryCount, category) {\n  const now = new Date();\n  const baseDelay = category === 'RATE_LIMIT' ? 60000 : 300000; // 1 min or 5 min\n  const multiplier = Math.pow(2, retryCount);\n  const jitter = Math.random() * 30000; // 0-30s jitter\n  \n  return new Date(now.getTime() + (baseDelay * multiplier) + jitter).toISOString();\n}\n\nconst category = categorizeError(errorInput.error);\nconst retryCount = errorInput.retryCount || 0;\n\n// Build DLQ entry\nconst dlqEntry = {\n  execution_id: $execution.id,\n  original_payload: errorInput.originalPayload || errorInput,\n  error_message: errorInput.error?.message || 'Unknown error',\n  error_stack: errorInput.error?.stack,\n  error_category: category,\n  failed_node: errorInput.error?.node?.name || 'Unknown',\n  status: retryCount >= 5 ? 'PERMANENT_FAILURE' : 'PENDING_RETRY',\n  retry_count: retryCount,\n  max_retries: 5,\n  first_failure_at: errorInput.firstFailureAt || new Date().toISOString(),\n  last_failure_at: new Date().toISOString(),\n  next_retry_at: retryCount >= 5 ? null : calculateNextRetry(retryCount, category),\n  retry_history: errorInput.retryHistory || [],\n  source_ip: errorInput.originalPayload?.headers?.['x-forwarded-for'],\n  user_agent: errorInput.originalPayload?.headers?.['user-agent'],\n  form_type: errorInput.originalPayload?.body?.formType || 'consultation',\n  workflow_version: 'v3.0.0',\n  environment: $env.NODE_ENV || 'production'\n};\n\nreturn [{ json: dlqEntry }];"
      }
    },
    {
      "name": "Insert to PostgreSQL DLQ",
      "type": "n8n-nodes-base.postgres",
      "parameters": {
        "operation": "insert",
        "table": "form_submission_dlq",
        "columns": {
          "mapping": [
            { "column": "execution_id", "value": "={{ $json.execution_id }}" },
            { "column": "original_payload", "value": "={{ JSON.stringify($json.original_payload) }}" },
            { "column": "error_message", "value": "={{ $json.error_message }}" },
            { "column": "error_stack", "value": "={{ $json.error_stack }}" },
            { "column": "error_category", "value": "={{ $json.error_category }}" },
            { "column": "failed_node", "value": "={{ $json.failed_node }}" },
            { "column": "status", "value": "={{ $json.status }}" },
            { "column": "retry_count", "value": "={{ $json.retry_count }}" },
            { "column": "next_retry_at", "value": "={{ $json.next_retry_at }}" },
            { "column": "source_ip", "value": "={{ $json.source_ip }}" },
            { "column": "user_agent", "value": "={{ $json.user_agent }}" },
            { "column": "form_type", "value": "={{ $json.form_type }}" }
          ]
        }
      },
      "credentials": {
        "postgres": { "id": "postgres-dlq", "name": "PostgreSQL DLQ" }
      }
    },
    {
      "name": "Format for Google Sheets",
      "type": "n8n-nodes-base.code",
      "parameters": {
        "jsCode": "const dlq = $input.first().json;\nconst payload = dlq.original_payload.body || {};\n\nreturn [{\n  json: {\n    Timestamp: new Date().toISOString(),\n    Execution_ID: dlq.execution_id.substring(0, 20),\n    Email: payload.data?.email || 'N/A',\n    Company: payload.data?.company || 'N/A',\n    Name: payload.data?.name || 'N/A',\n    Error_Category: dlq.error_category,\n    Error_Message: dlq.error_message.substring(0, 200),\n    Retry_Count: dlq.retry_count,\n    Status: dlq.status,\n    Next_Retry: dlq.next_retry_at || 'N/A'\n  }\n}];"
      }
    },
    {
      "name": "Append to Google Sheets",
      "type": "n8n-nodes-base.googleSheets",
      "parameters": {
        "operation": "append",
        "documentId": "={{ $env.DLQ_SHEET_ID }}",
        "sheetName": "Failed Submissions",
        "columns": {
          "mapping": [
            { "column": "Timestamp", "value": "={{ $json.Timestamp }}" },
            { "column": "Execution_ID", "value": "={{ $json.Execution_ID }}" },
            { "column": "Email", "value": "={{ $json.Email }}" },
            { "column": "Company", "value": "={{ $json.Company }}" },
            { "column": "Name", "value": "={{ $json.Name }}" },
            { "column": "Error_Category", "value": "={{ $json.Error_Category }}" },
            { "column": "Error_Message", "value": "={{ $json.Error_Message }}" },
            { "column": "Retry_Count", "value": "={{ $json.Retry_Count }}" },
            { "column": "Status", "value": "={{ $json.Status }}" },
            { "column": "Next_Retry", "value": "={{ $json.Next_Retry }}" }
          ]
        }
      },
      "credentials": {
        "googleSheetsOAuth2Api": { "id": "gsheets-dlq", "name": "Google Sheets DLQ" }
      },
      "continueOnFail": true
    },
    {
      "name": "Send Alert",
      "type": "n8n-nodes-base.slack",
      "parameters": {
        "channel": "=#form-submission-alerts",
        "text": "=:warning: Form Submission Failed\\n\\n*Execution:* {{ $json.execution_id }}\\n*Category:* {{ $json.error_category }}\\n*Error:* {{ $json.error_message.substring(0, 100) }}\\n*Retry:* {{ $json.retry_count }}/{{ $json.max_retries }}\\n*Next Retry:* {{ $json.next_retry_at || 'Manual intervention required' }}"
      },
      "credentials": {
        "slackApi": { "id": "slack-alerts", "name": "Slack Alerts" }
      },
      "continueOnFail": true
    }
  ]
}
```

### 6.2 Retry Processor Workflow

```json
{
  "name": "DLQ Retry Processor",
  "nodes": [
    {
      "name": "Schedule Trigger",
      "type": "n8n-nodes-base.scheduleTrigger",
      "parameters": {
        "rule": {
          "interval": [{ "field": "minutes", "minutesInterval": 5 }]
        }
      }
    },
    {
      "name": "Query Ready Items",
      "type": "n8n-nodes-base.postgres",
      "parameters": {
        "operation": "executeQuery",
        "query": "SELECT * FROM form_submission_dlq WHERE status = 'PENDING_RETRY' AND next_retry_at <= NOW() ORDER BY next_retry_at ASC LIMIT 50"
      }
    },
    {
      "name": "Items to Process?",
      "type": "n8n-nodes-base.if",
      "parameters": {
        "conditions": {
          "conditions": [{ "leftValue": "={{ $input.all().length }}", "operator": { "type": "number", "operation": "gt" }, "rightValue": "0" }]
        }
      }
    },
    {
      "name": "Split to Items",
      "type": "n8n-nodes-base.splitInBatches",
      "parameters": { "batchSize": 1 }
    },
    {
      "name": "Update Status to In Progress",
      "type": "n8n-nodes-base.postgres",
      "parameters": {
        "operation": "executeQuery",
        "query": "UPDATE form_submission_dlq SET status = 'IN_PROGRESS', updated_at = NOW() WHERE id = '{{ $json.id }}'"
      }
    },
    {
      "name": "Attempt Retry",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "method": "POST",
        "url": "={{ $env.N8N_WEBHOOK_URL }}/retry-submission",
        "body": "={{ JSON.stringify($json.original_payload) }}",
        "options": { "timeout": 30000 }
      },
      "continueOnFail": true
    },
    {
      "name": "Retry Success?",
      "type": "n8n-nodes-base.if",
      "parameters": {
        "conditions": {
          "conditions": [{ "leftValue": "={{ $input.first().json.statusCode }}", "operator": { "type": "number", "operation": "equals" }, "rightValue": "200" }]
        }
      }
    },
    {
      "name": "Mark as Resolved",
      "type": "n8n-nodes-base.postgres",
      "parameters": {
        "operation": "executeQuery",
        "query": "UPDATE form_submission_dlq SET status = 'RESOLVED', resolved_at = NOW(), retry_history = retry_history || '[{\"attempt_number\": {{ $json.retry_count + 1 }}, \"attempted_at\": \"' || NOW() || '\", \"result\": \"success\"}]'::jsonb WHERE id = '{{ $json.id }}'"
      }
    },
    {
      "name": "Schedule Next Retry",
      "type": "n8n-nodes-base.code",
      "parameters": {
        "jsCode": "const item = $input.first().json;\nconst newRetryCount = item.retry_count + 1;\nconst maxRetries = item.max_retries;\n\nif (newRetryCount >= maxRetries) {\n  return [{\n    json: {\n      ...item,\n      new_status: 'PERMANENT_FAILURE',\n      new_retry_count: newRetryCount,\n      next_retry_at: null\n    }\n  }];\n}\n\n// Calculate next retry with exponential backoff\nconst backoffMinutes = [5, 10, 20, 40, 80][newRetryCount - 1] || 120;\nconst nextRetry = new Date(Date.now() + backoffMinutes * 60000).toISOString();\n\nreturn [{\n  json: {\n    ...item,\n    new_status: 'PENDING_RETRY',\n    new_retry_count: newRetryCount,\n    next_retry_at: nextRetry,\n    retry_history_entry: {\n      attempt_number: newRetryCount,\n      attempted_at: new Date().toISOString(),\n      result: 'failed',\n      error: $input.first().json.error?.message || 'Unknown error'\n    }\n  }\n}];"
      }
    },
    {
      "name": "Update Retry Status",
      "type": "n8n-nodes-base.postgres",
      "parameters": {
        "operation": "executeQuery",
        "query": "UPDATE form_submission_dlq SET status = '{{ $json.new_status }}', retry_count = {{ $json.new_retry_count }}, next_retry_at = {{ $json.next_retry_at ? \"'\" + $json.next_retry_at + \"'\" : 'NULL' }}, last_failure_at = NOW(), retry_history = retry_history || '{{ JSON.stringify([$json.retry_history_entry]) }}'::jsonb WHERE id = '{{ $json.id }}'"
      }
    },
    {
      "name": "Send Permanent Failure Alert",
      "type": "n8n-nodes-base.slack",
      "parameters": {
        "channel": "=#form-submission-alerts",
        "text": "=:x: PERMANENT FAILURE - Manual Intervention Required\\n\\n*Execution:* {{ $json.execution_id }}\\n*Email:* {{ $json.original_payload.body?.data?.email || 'N/A' }}\\n*Failed after {{ $json.max_retries }} retries*\\n\\nPlease check the DLQ for details."
      },
      "continueOnFail": true
    },
    {
      "name": "Aggregate Results",
      "type": "n8n-nodes-base.code",
      "parameters": {
        "jsCode": "const items = $input.all();\nreturn [{\n  json: {\n    processed: items.length,\n    succeeded: items.filter(i => i.json.status === 'RESOLVED').length,\n    failed: items.filter(i => i.json.new_status === 'PERMANENT_FAILURE').length,\n    retried: items.filter(i => i.json.new_status === 'PENDING_RETRY').length\n  }\n}];"
      }
    }
  ]
}
```

---

## 7. Retry Logic Implementation

### 7.1 Exponential Backoff Strategy

```javascript
// Exponential Backoff Configuration
const RETRY_CONFIG = {
  // Base delay in minutes
  baseDelayMinutes: 5,
  
  // Maximum delay cap (in minutes)
  maxDelayMinutes: 120,
  
  // Maximum retry attempts
  maxRetries: 5,
  
  // Jitter range (0-1) - adds randomness to prevent thundering herd
  jitterFactor: 0.1,
  
  // Category-specific multipliers
  categoryMultipliers: {
    'TRANSIENT': 1,      // 5, 10, 20, 40, 80 min
    'RATE_LIMIT': 2,     // 10, 20, 40, 80, 160 min
    'DEPENDENCY': 1.5,   // 7.5, 15, 30, 60, 120 min
    'NETWORK': 1,        // Same as TRANSIENT
    'DEFAULT': 1
  }
};

function calculateNextRetry(retryCount, errorCategory = 'DEFAULT') {
  const multiplier = RETRY_CONFIG.categoryMultipliers[errorCategory] || 
                     RETRY_CONFIG.categoryMultipliers.DEFAULT;
  
  // Calculate base delay with exponential backoff
  const baseDelay = RETRY_CONFIG.baseDelayMinutes * multiplier;
  const exponentialDelay = baseDelay * Math.pow(2, retryCount);
  
  // Apply max cap
  const cappedDelay = Math.min(exponentialDelay, RETRY_CONFIG.maxDelayMinutes);
  
  // Add jitter (±10%)
  const jitter = cappedDelay * RETRY_CONFIG.jitterFactor * (Math.random() * 2 - 1);
  const finalDelay = cappedDelay + jitter;
  
  // Calculate next retry timestamp
  const nextRetryAt = new Date(Date.now() + finalDelay * 60000);
  
  return {
    delayMinutes: Math.round(finalDelay),
    nextRetryAt: nextRetryAt.toISOString(),
    attemptNumber: retryCount + 1
  };
}

// Example usage:
// First retry (count=0): ~5 minutes
// Second retry (count=1): ~10 minutes
// Third retry (count=2): ~20 minutes
// Fourth retry (count=3): ~40 minutes
// Fifth retry (count=4): ~80 minutes (capped)
```

### 7.2 Retry Schedule Reference

| Attempt | TRANSIENT | RATE_LIMIT | DEPENDENCY | Cumulative Time |
|---------|-----------|------------|------------|-----------------|
| 1 | 5 min | 10 min | 7.5 min | 5-10 min |
| 2 | 10 min | 20 min | 15 min | 15-30 min |
| 3 | 20 min | 40 min | 30 min | 35-70 min |
| 4 | 40 min | 80 min | 60 min | 75-150 min |
| 5 | 80 min | 120 min (cap) | 120 min (cap) | 155-270 min |

### 7.3 Poison Message Handling

```javascript
// Poison Message Detection and Handling
const POISON_MESSAGE_CONFIG = {
  // Max retries before considering poison
  maxRetries: 5,
  
  // Error patterns indicating poison messages
  poisonPatterns: [
    'invalid json',
    'schema validation failed',
    'required field missing',
    'malformed payload',
    'cannot parse'
  ],
  
  // Immediate poison classification errors
  immediatePoisonCategories: ['VALIDATION', 'PERMANENT']
};

function isPoisonMessage(error, retryCount, category) {
  // Check if max retries exceeded
  if (retryCount >= POISON_MESSAGE_CONFIG.maxRetries) {
    return true;
  }
  
  // Check for immediate poison categories
  if (POISON_MESSAGE_CONFIG.immediatePoisonCategories.includes(category)) {
    return true;
  }
  
  // Check error message against poison patterns
  const errorMsg = (error.message || '').toLowerCase();
  return POISON_MESSAGE_CONFIG.poisonPatterns.some(pattern => 
    errorMsg.includes(pattern.toLowerCase())
  );
}

// Handler for poison messages
function handlePoisonMessage(dlqEntry) {
  return {
    status: 'PERMANENT_FAILURE',
    reason: 'Poison message detected',
    action: 'requires_manual_review',
    alertSeverity: 'high',
    notificationChannels: ['slack', 'email'],
    suggestedActions: [
      'Review payload structure',
      'Check form validation',
      'Verify data transformation'
    ]
  };
}
```

### 7.4 Manual Retry API

```javascript
// Manual Retry Function for One-Off Reprocessing
async function manualRetry(dlqEntryId, options = {}) {
  const {
    force = false,           // Retry even if max retries exceeded
    skipValidation = false,  // Skip validation checks
    dryRun = false          // Don't actually process, just validate
  } = options;
  
  // Fetch DLQ entry
  const entry = await db.query(
    'SELECT * FROM form_submission_dlq WHERE id = $1',
    [dlqEntryId]
  );
  
  if (!entry) {
    throw new Error(`DLQ entry ${dlqEntryId} not found`);
  }
  
  // Validate entry is retryable
  if (entry.status === 'RESOLVED' && !force) {
    throw new Error('Entry already resolved. Use force=true to reprocess.');
  }
  
  if (dryRun) {
    return {
      wouldRetry: true,
      entry: entry,
      estimatedSuccess: assessRetryProbability(entry)
    };
  }
  
  // Attempt processing
  try {
    const result = await processSubmission(entry.original_payload);
    
    // Update DLQ entry
    await db.query(`
      UPDATE form_submission_dlq 
      SET status = 'RESOLVED', 
          resolved_at = NOW(),
          retry_history = retry_history || $1::jsonb,
          review_notes = COALESCE(review_notes, '') || $2
      WHERE id = $3
    `, [
      JSON.stringify([{
        attempt_number: entry.retry_count + 1,
        attempted_at: new Date().toISOString(),
        result: 'success',
        manual: true
      }]),
      `\n[Manual Retry ${new Date().toISOString()}]: Successfully processed`,
      dlqEntryId
    ]);
    
    return { success: true, result };
    
  } catch (error) {
    // Update with failure
    await db.query(`
      UPDATE form_submission_dlq 
      SET retry_history = retry_history || $1::jsonb,
          review_notes = COALESCE(review_notes, '') || $2
      WHERE id = $3
    `, [
      JSON.stringify([{
        attempt_number: entry.retry_count + 1,
        attempted_at: new Date().toISOString(),
        result: 'failed',
        error: error.message,
        manual: true
      }]),
      `\n[Manual Retry ${new Date().toISOString()}]: Failed - ${error.message}`,
      dlqEntryId
    ]);
    
    throw error;
  }
}
```

---

## 8. Monitoring Strategy

### 8.1 Key Metrics Dashboard

```yaml
# Grafana Dashboard Configuration
dashboard:
  title: "Form Submission DLQ Monitoring"
  panels:
    
    # Row 1: Overview
    - title: "DLQ Status Overview"
      type: "stat"
      queries:
        - name: "Pending Retry"
          query: |
            SELECT COUNT(*) FROM form_submission_dlq 
            WHERE status = 'PENDING_RETRY'
          
        - name: "In Progress"
          query: |
            SELECT COUNT(*) FROM form_submission_dlq 
            WHERE status = 'IN_PROGRESS'
            
        - name: "Permanent Failures (24h)"
          query: |
            SELECT COUNT(*) FROM form_submission_dlq 
            WHERE status = 'PERMANENT_FAILURE' 
            AND last_failure_at > NOW() - INTERVAL '24 hours'
            
        - name: "Success Rate (24h)"
          query: |
            SELECT 
              ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'RESOLVED') / 
              NULLIF(COUNT(*), 0), 2) as rate
            FROM form_submission_dlq
            WHERE created_at > NOW() - INTERVAL '24 hours'
    
    # Row 2: Trends
    - title: "Failure Trends (24h)"
      type: "graph"
      queries:
        - name: "New Failures"
          query: |
            SELECT 
              DATE_TRUNC('hour', created_at) as time,
              COUNT(*) as count
            FROM form_submission_dlq
            WHERE created_at > NOW() - INTERVAL '24 hours'
            GROUP BY 1
            ORDER BY 1
            
    # Row 3: Error Categories
    - title: "Failures by Category"
      type: "piechart"
      query: |
        SELECT 
          error_category,
          COUNT(*) as count
        FROM form_submission_dlq
        WHERE status != 'RESOLVED'
        GROUP BY error_category
        
    # Row 4: Age Analysis
    - title: "Oldest Unresolved Failures"
      type: "table"
      query: |
        SELECT 
          execution_id,
          form_type,
          error_category,
          retry_count,
          EXTRACT(EPOCH FROM (NOW() - first_failure_at))/3600 as age_hours
        FROM form_submission_dlq
        WHERE status IN ('PENDING_RETRY', 'IN_PROGRESS', 'PERMANENT_FAILURE')
        ORDER BY first_failure_at ASC
        LIMIT 20
```

### 8.2 Alerting Rules

```yaml
# AlertManager Configuration
alerts:
  # Critical: High number of pending retries
  - name: DLQ_Backlog_Critical
    condition: |
      SELECT COUNT(*) FROM form_submission_dlq 
      WHERE status = 'PENDING_RETRY' > 50
    severity: critical
    channels: [pagerduty, slack]
    message: |
      DLQ backlog exceeded 50 items. 
      Retry processor may be failing or CRM is down.
      
  # Warning: Growing DLQ
  - name: DLQ_Growth_Warning
    condition: |
      SELECT COUNT(*) FROM form_submission_dlq 
      WHERE created_at > NOW() - INTERVAL '15 minutes' > 10
    severity: warning
    channels: [slack]
    message: |
      More than 10 new failures in last 15 minutes.
      
  # Critical: Permanent failures
  - name: DLQ_Permanent_Failures
    condition: |
      SELECT COUNT(*) FROM form_submission_dlq 
      WHERE status = 'PERMANENT_FAILURE' 
      AND last_failure_at > NOW() - INTERVAL '1 hour' > 5
    severity: critical
    channels: [pagerduty, slack, email]
    message: |
      5+ permanent failures in last hour. 
      Manual intervention required.
      
  # Warning: Low success rate
  - name: DLQ_Low_Success_Rate
    condition: |
      SELECT 
        100.0 * COUNT(*) FILTER (WHERE status = 'RESOLVED') / 
        NULLIF(COUNT(*), 0) < 70
      FROM form_submission_dlq
      WHERE created_at > NOW() - INTERVAL '24 hours'
    severity: warning
    channels: [slack]
    message: |
      DLQ retry success rate below 70% in last 24 hours.
```

### 8.3 Health Check Endpoint

```javascript
// Health Check for DLQ System
app.get('/health/dlq', async (req, res) => {
  const checks = {
    timestamp: new Date().toISOString(),
    overall: 'healthy',
    checks: {}
  };
  
  // Check 1: Database connectivity
  try {
    await db.query('SELECT 1');
    checks.checks.database = { status: 'healthy' };
  } catch (error) {
    checks.checks.database = { 
      status: 'unhealthy', 
      error: error.message 
    };
    checks.overall = 'unhealthy';
  }
  
  // Check 2: DLQ backlog
  const pendingCount = await db.query(`
    SELECT COUNT(*) FROM form_submission_dlq 
    WHERE status = 'PENDING_RETRY'
  `);
  checks.checks.backlog = {
    status: pendingCount > 100 ? 'warning' : 'healthy',
    pending_items: pendingCount
  };
  if (pendingCount > 1000) checks.overall = 'degraded';
  
  // Check 3: Stale items (not being processed)
  const staleItems = await db.query(`
    SELECT COUNT(*) FROM form_submission_dlq 
    WHERE status = 'IN_PROGRESS' 
    AND updated_at < NOW() - INTERVAL '30 minutes'
  `);
  checks.checks.stale_items = {
    status: staleItems > 0 ? 'warning' : 'healthy',
    count: staleItems
  };
  
  // Check 4: Retry processor last run
  const lastRun = await getLastRetryProcessorRun();
  const minutesSinceRun = (Date.now() - lastRun) / 60000;
  checks.checks.retry_processor = {
    status: minutesSinceRun > 10 ? 'unhealthy' : 'healthy',
    last_run_minutes_ago: Math.round(minutesSinceRun)
  };
  if (minutesSinceRun > 10) checks.overall = 'unhealthy';
  
  const statusCode = checks.overall === 'healthy' ? 200 : 
                     checks.overall === 'degraded' ? 200 : 503;
  
  res.status(statusCode).json(checks);
});
```

---

## 9. Production Deployment Guide

### 9.1 Prerequisites Checklist

- [ ] PostgreSQL 13+ with JSONB support
- [ ] Google Sheets API credentials
- [ ] Slack webhook for alerts
- [ ] n8n instance with PostgreSQL (not SQLite)
- [ ] Sufficient disk space for DLQ tables

### 9.2 Migration Steps

```bash
#!/bin/bash
# deploy-dlq.sh - Deploy DLQ infrastructure

set -e

echo "🚀 Deploying DLQ Infrastructure"
echo "================================"

# 1. Create DLQ tables
echo "[1/5] Creating DLQ tables..."
psql $DATABASE_URL -f schema/001_create_dlq_tables.sql

# 2. Verify tables created
echo "[2/5] Verifying tables..."
psql $DATABASE_URL -c "\dt form_submission_dlq*"

# 3. Import n8n workflows
echo "[3/5] Importing n8n workflows..."
n8n import:workflow --input=workflows/dlq-capture.json
n8n import:workflow --input=workflows/dlq-retry-processor.json

# 4. Set up environment variables
echo "[4/5] Configuring environment..."
cat >> .env << EOF
# DLQ Configuration
DLQ_DATABASE_URL=$DATABASE_URL
DLQ_SHEET_ID=your-google-sheet-id
DLQ_ALERT_SLACK_WEBHOOK=https://hooks.slack.com/services/...
DLQ_MAX_RETRIES=5
DLQ_RETRY_INTERVAL_MINUTES=5
EOF

# 5. Activate workflows
echo "[5/5] Activating workflows..."
n8n update:workflow --id=dlq-capture --active=true
n8n update:workflow --id=dlq-retry-processor --active=true

echo ""
echo "✅ DLQ deployment complete!"
echo ""
echo "Next steps:"
echo "  1. Verify workflows are active in n8n UI"
echo "  2. Configure Google Sheets credentials"
echo "  3. Test with a failing submission"
echo "  4. Set up monitoring dashboard"
```

### 9.3 Rollback Procedure

```bash
#!/bin/bash
# rollback-dlq.sh - Emergency DLQ rollback

# Deactivate DLQ workflows
n8n update:workflow --id=dlq-capture --active=false
n8n update:workflow --id=dlq-retry-processor --active=false

# Note: DLQ table data is preserved for forensics
# To completely remove:
# psql $DATABASE_URL -c "DROP TABLE form_submission_dlq CASCADE;"

echo "DLQ workflows deactivated. Main workflow continues without DLQ."
```

---

## Appendices

### A. DLQ Entry Example

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "execution_id": "exec_1234567890",
  "original_payload": {
    "body": {
      "data": {
        "name": "John Doe",
        "email": "john@example.com",
        "company": "Acme Corp",
        "message": "Interested in AI agents"
      }
    },
    "headers": {
      "user-agent": "Mozilla/5.0...",
      "x-forwarded-for": "192.168.1.1"
    }
  },
  "error_message": "Connection timeout to CRM API",
  "error_category": "NETWORK",
  "failed_node": "Create Person",
  "status": "PENDING_RETRY",
  "retry_count": 2,
  "next_retry_at": "2026-03-19T11:20:00Z",
  "retry_history": [
    {
      "attempt_number": 1,
      "attempted_at": "2026-03-19T10:30:00Z",
      "result": "failed",
      "error": "Connection timeout"
    },
    {
      "attempt_number": 2,
      "attempted_at": "2026-03-19T10:40:00Z",
      "result": "failed",
      "error": "Connection timeout"
    }
  ],
  "created_at": "2026-03-19T10:30:00Z"
}
```

### B. API Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/dlq/stats` | GET | Get DLQ statistics |
| `/api/dlq/items` | GET | List DLQ items (with filters) |
| `/api/dlq/items/:id/retry` | POST | Manual retry |
| `/api/dlq/items/:id/resolve` | POST | Mark as resolved |
| `/health/dlq` | GET | Health check |

### C. Decision Log

| Date | Decision | Rationale | Alternatives Considered |
|------|----------|-----------|------------------------|
| 2026-03-19 | PostgreSQL as primary DLQ | ACID, existing infra, query capability | Redis (limited visibility), SQS (vendor lock-in) |
| 2026-03-19 | Google Sheets backup | Human visibility, easy access | None (essential for ops) |
| 2026-03-19 | 5 max retries | ~2.5h total window | 3 (too short), 10 (too long) |
| 2026-03-19 | 5-min retry processor | Balance responsiveness with resource use | 1 min (too frequent), 15 min (too slow) |

---

*Document Version: 1.0*  
*Next Review: 2026-04-19*
