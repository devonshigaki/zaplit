---
title: Performance Analysis
source: PERFORMANCE_DEEP_DIVE.md
consolidated: 2026-03-19
---

# Performance Analysis

> Consolidated from: PERFORMANCE_DEEP_DIVE.md, THIRD_RESEARCH_SYNTHESIS.md (Performance sections)

## Executive Summary

### Current Performance State

| Metric | Current | Target | Status |
|--------|---------|--------|--------|
| **End-to-End Latency (p50)** | 3.3s | <3s | ⚠️ Near target |
| **End-to-End Latency (p95)** | 6.0s | <5s | 🔴 Above target |
| **n8n Processing Time** | 17ms | <100ms | ✅ Excellent |
| **Success Rate** | 99.0% | 99.5% | ⚠️ Near target |
| **CRM API Calls/Submission** | 4 sequential | 2-3 optimized | 🔴 Needs optimization |

### Key Findings

1. **n8n is NOT the bottleneck** - 17ms processing time vs 3-6s total latency
2. **CRM API latency dominates** - 800-1500ms per call, 4 calls in sequence
3. **Sequential execution wastes time** - Parallel Person+Company creation could save 30-40%
4. **Rate limits constrain throughput** - 100 req/min from Twenty CRM
5. **No caching layer** - Repeated company lookups incur full latency

---

## Current Performance Baseline

### End-to-End Latency Breakdown

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CURRENT LATENCY TIMELINE (Sequential)                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Client → Webhook:    50-100ms    (Network RTT)                             │
│         ↓                                                                   │
│  n8n Webhook Receive:  5-10ms     (n8n overhead)                            │
│         ↓                                                                   │
│  Process Form Data:   20-50ms     (Code node transformation)                │
│         ↓                                                                   │
│  Create Person:      600-1200ms   (CRM API call #1)                         │
│         ↓                                                                   │
│  Create Company:     700-1500ms   (CRM API call #2)                         │
│         ↓                                                                   │
│  Create Note:        800-1400ms   (CRM API call #3)                         │
│         ↓                                                                   │
│  Success Response:     5-10ms     (Respond to Webhook)                      │
│         ↓                                                                   │
│  Webhook → Client:    50-100ms    (Network RTT)                             │
│                                                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│  TOTAL P50: ~3300ms    TOTAL P95: ~6000ms                                   │
│  n8n Overhead: ~60-155ms (2-5% of total)                                    │
│  CRM API Time: ~2600-5100ms (78-85% of total)                               │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Detailed Latency Components

| Component | P50 (ms) | P95 (ms) | P99 (ms) | Contribution |
|-----------|----------|----------|----------|--------------|
| **Network RTT (inbound)** | 50 | 100 | 200 | 1.5% |
| **n8n Webhook Processing** | 10 | 25 | 50 | 0.5% |
| **Form Data Processing** | 35 | 80 | 150 | 1.5% |
| **POST /rest/people** | 800 | 1500 | 2500 | 24% |
| **POST /rest/companies** | 900 | 1600 | 2800 | 27% |
| **POST /rest/notes** | 850 | 1550 | 2600 | 26% |
| **Network RTT (outbound)** | 50 | 100 | 200 | 1.5% |
| **Overhead/Buffer** | 100 | 200 | 400 | 3% |
| **TOTAL** | **~3300** | **~6000** | **~9500** | **100%** |

### Twenty CRM API Response Time Analysis

| Endpoint | P50 | P95 | P99 | Error Rate | Notes |
|----------|-----|-----|-----|------------|-------|
| `POST /rest/people` | 600ms | 1200ms | 2000ms | 0.5% | Name validation, email uniqueness |
| `POST /rest/companies` | 700ms | 1500ms | 2500ms | 1.0% | Domain uniqueness check |
| `POST /rest/notes` | 800ms | 1400ms | 2200ms | 0.3% | Rich text processing |
| `GET /rest/companies` | 400ms | 800ms | 1500ms | 0.1% | For duplicate checking |

---

## Scalability Analysis

### Twenty CRM Rate Limits

| Limit | Value | Impact |
|-------|-------|--------|
| Requests per minute | 100 | Hard ceiling on throughput |
| Records per batch | 60 | Batch optimization opportunity |
| Concurrent connections | Not specified | Assume 10 for safety |

**Throughput Ceiling Calculation:**
```
Current Architecture:
- 4 API calls per submission
- 100 calls/minute ÷ 4 calls/submission = 25 submissions/minute max

Optimized Architecture (Parallel):
- 3 API calls per submission (Person+Company parallel)
- 100 calls/minute ÷ 3 calls/submission = 33 submissions/minute max

GraphQL Batch Architecture:
- 2 API calls per submission (batch create + link/note)
- 100 calls/minute ÷ 2 calls/submission = 50 submissions/minute max
```

### Concurrent Webhook Handling Capacity

| Concurrent Requests | Expected Behavior | Recommendation |
|---------------------|-------------------|----------------|
| 1-5 | Normal operation | Green zone |
| 6-10 | Slight queueing | Yellow zone |
| 11-20 | Queue buildup, increased latency | Orange zone |
| 21+ | Rate limit errors, failures | Red zone |

---

## Bottleneck Identification

### Sequential vs Parallel Processing Analysis

#### Current Sequential Flow

```
Time →

Person:   ████████████████████████████████████  800ms
Company:           ████████████████████████████████████  900ms
Note:                       ████████████████████████████████████  850ms
                         └────────────────────────────────────────────┘
                                    Total: ~2550ms (CRM calls only)
```

#### Optimized Parallel Flow

```
Time →

Person:   ████████████████████████████████████  800ms ──┐
Company:  ███████████████████████████████████████  900ms  ├→ Merge
                                                         │
Note:                            ████████████████████████████████████  850ms
                               └──────────────────────────────────────────┘
                                          Total: ~1750ms (CRM calls only)
                                           Savings: ~800ms (31%)
```

### Performance Impact Matrix

| Optimization | Latency Reduction | Implementation Effort | Risk Level |
|--------------|-------------------|----------------------|------------|
| Parallel Person+Company | 30-40% | Low | Low |
| GraphQL Batch Operations | 40-50% | Medium | Medium |
| Company Caching | 20-30% | Medium | Low |
| Connection Keep-Alive | 10-15% | Low | Low |
| Async Response Pattern | Sub-100ms perceived | Medium | Medium |

---

## Data Science Perspective

### Statistical Analysis of Response Times

#### Distribution Analysis

```
Typical Response Time Distribution:

<1s    |██ 5%        (Fast - cache hits or light load)
1-2s   |███████ 15%  (Normal)
2-3s   |████████████████ 30% (Typical)
3-5s   |██████████████████████ 40% (SLO boundary)
5-10s  |█████ 8%     (Slow - high load)
>10s   |█ 2%         (Problem - rate limits/errors)
```

#### SLO Definitions

| Percentile | Target | Error Budget | Alert Threshold |
|------------|--------|--------------|-----------------|
| **P50** | <2s | 10% | >3s |
| **P95** | <5s | 5% | >8s |
| **P99** | <8s | 1% | >12s |
| **P99.9** | <15s | 0.1% | >20s |

### Latency Variance Sources

```
Latency Variance Sources:

CRM API Variance:     ████████████████████  ~60% of total variance
Network Variance:     ████████  ~25% of total variance
n8n Processing:       ██  ~5% of total variance
Other (GC, etc):      ███  ~10% of total variance
```

---

## Optimization Roadmap

### Priority Matrix

| Priority | Optimization | Effort | Impact | Timeline |
|----------|--------------|--------|--------|----------|
| **P0** | Parallel Person/Company Creation | Low | -30% latency | Week 1 |
| **P0** | HTTP Keep-Alive | Low | -15% latency | Week 1 |
| **P1** | GraphQL Batch Operations | Medium | -40% latency | Weeks 2-3 |
| **P1** | Company Caching | Medium | -25% latency (hits) | Weeks 3-4 |
| **P2** | Queue Mode Deployment | High | 10x burst capacity | Month 2 |
| **P2** | Circuit Breaker | Medium | Better failure handling | Month 2 |
| **P3** | Async Response Pattern | Medium | <100ms perceived | Month 3 |
| **P3** | Redis Distributed Caching | Medium | -30% latency | Month 3 |

### Projected Performance Improvements

```
Current State (Sequential REST):
┌────────────────────────────────────────────────────────────┐
│██████████████ Webhook (50ms)                               │
│██████████████████████████████ Create Person (800ms)        │
│████████████████████████████████ Create Company (1000ms)    │
│██████████████████████████████ Create Note (800ms)          │
│██████████████ Response (50ms)                              │
└────────────────────────────────────────────────────────────┘
Total: ~3300ms (p50), ~6000ms (p95)

Phase 1 - Parallel REST (Week 1):
┌────────────────────────────────────────────────────────────┐
│██████████████ Webhook (50ms)                               │
│████████████████████████████████████ [Person+Company] (1000ms)
│██████████████████████████████ Create Note (800ms)          │
│██████████████ Response (50ms)                              │
└────────────────────────────────────────────────────────────┘
Total: ~1900ms (p50), ~3500ms (p95)  [-42% improvement]

Phase 2 - GraphQL Batch (Weeks 2-3):
┌────────────────────────────────────────────────────────────┐
│██████████████ Webhook (50ms)                               │
│████████████████████████████ Batch Create (800ms)           │
│███████████████████ Link + Note (400ms)                     │
│██████████████ Response (50ms)                              │
└────────────────────────────────────────────────────────────┘
Total: ~1300ms (p50), ~2400ms (p95)  [-61% improvement]

Phase 3 - With Caching (Weeks 3-4):
┌────────────────────────────────────────────────────────────┐
│██████████████ Webhook (50ms)                               │
│███████████████ [Cached Company] (300ms)                    │
│███████████████████ Create Person + Note (500ms)            │
│██████████████ Response (50ms)                              │
└────────────────────────────────────────────────────────────┘
Total: ~900ms (p50), ~1800ms (p95)  [-73% improvement]
```

---

## Implementation Checklist

### Week 1: Quick Wins

- [ ] Configure HTTP Keep-Alive on all HTTP Request nodes
- [ ] Implement parallel Person/Company creation with Merge node
- [ ] Add timeout configuration (15s)
- [ ] Deploy and measure improvement

### Weeks 2-3: GraphQL Optimization

- [ ] Research Twenty CRM GraphQL schema
- [ ] Implement batch mutation for Person+Company
- [ ] Implement combined Link+Note mutation
- [ ] Test error handling for batch operations
- [ ] Deploy and measure improvement

### Weeks 3-4: Caching Layer

- [ ] Design cache key strategy (company domain/name hash)
- [ ] Implement Redis cache read
- [ ] Implement cache write on miss
- [ ] Configure TTL (1 hour for companies)
- [ ] Deploy and measure hit rate

---

**Original Document:** [PERFORMANCE_DEEP_DIVE.md](/PERFORMANCE_DEEP_DIVE.md)
