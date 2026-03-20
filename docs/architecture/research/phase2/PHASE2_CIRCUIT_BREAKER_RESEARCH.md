# Circuit Breaker Pattern Implementation for n8n + Twenty CRM Integration

**Research Phase:** Phase 2 - Resilience Architecture  
**Date:** March 19, 2026  
**Author:** Principal Engineer  
**Status:** Research Complete - Implementation Ready  

---

## Executive Summary

This document provides comprehensive research and implementation guidance for adding Circuit Breaker pattern protection to the n8n-Twenty CRM integration. The current implementation lacks graceful degradation when the CRM API fails, leading to cascade failures, retry storms, and potential data loss.

### Key Findings

| Metric | Current State | Target State |
|--------|---------------|--------------|
| API Failure Recovery | Manual intervention | Automatic failover |
| Retry Storm Risk | High (unlimited) | Controlled (circuit opens) |
| Partial Failure Handling | None | Compensating transactions |
| Recovery Time | Hours | < 60 seconds |
| Data Loss Risk | Medium | Near-zero (fallback storage) |

### Recommended Approach

**Hybrid Implementation:** Redis-backed circuit breaker with n8n Code node integration, providing distributed state management across multiple n8n instances with sub-second failover detection.

---

## 1. Circuit Breaker Pattern Analysis

### 1.1 Core Concept

The Circuit Breaker pattern is a resilience design pattern that prevents cascade failures in distributed systems by monitoring service health and temporarily blocking requests to failing services.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    CIRCUIT BREAKER STATE MACHINE                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│    ┌──────────────┐         Failure Threshold         ┌──────────┐     │
│    │              │ ────────────────────────────────▶ │          │     │
│    │    CLOSED    │                                   │   OPEN   │     │
│    │  (Normal)    │ ◀──────────────────────────────── │          │     │
│    │              │         Success Threshold         └────┬─────┘     │
│    └──────┬───────┘                                      │            │
│           │                                              │            │
│           │ Success                                   Timeout          │
│           │                                              │            │
│           │         ┌──────────────┐                     ▼            │
│           └──────── │  HALF-OPEN   │ ◀────────────────────┘            │
│                     │   (Testing)  │                                   │
│                     └──────────────┘                                   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1.2 State Definitions

#### CLOSED State (Normal Operation)
- **Behavior:** All requests pass through to the service
- **Monitoring:** Tracks failures and response times
- **Transition to OPEN:** When failure threshold is exceeded

```javascript
// State: CLOSED
function handleClosedState(request) {
  try {
    const response = executeRequest(request);
    recordSuccess();
    return response;
  } catch (error) {
    recordFailure();
    if (failureCount >= FAILURE_THRESHOLD) {
      transitionToOpen();
      throw new CircuitBreakerOpenError();
    }
    throw error;
  }
}
```

#### OPEN State (Failing Fast)
- **Behavior:** Requests fail immediately without calling service
- **Purpose:** Prevent resource exhaustion and give service time to recover
- **Transition to HALF-OPEN:** After recovery timeout expires

```javascript
// State: OPEN
function handleOpenState(request) {
  const timeSinceLastFailure = Date.now() - lastFailureTime;
  
  if (timeSinceLastFailure < RECOVERY_TIMEOUT) {
    // Fail fast - don't even try
    throw new ServiceUnavailableError('Circuit breaker is OPEN');
  }
  
  // Timeout expired - transition to HALF-OPEN
  transitionToHalfOpen();
  return handleHalfOpenState(request);
}
```

#### HALF-OPEN State (Probing Recovery)
- **Behavior:** Allows limited test requests through
- **Purpose:** Test if service has recovered without overwhelming it
- **Transition to CLOSED:** If test requests succeed
- **Transition to OPEN:** If test requests fail

```javascript
// State: HALF-OPEN
function handleHalfOpenState(request) {
  if (testRequestCount >= MAX_TEST_REQUESTS) {
    throw new ServiceUnavailableError('Circuit breaker is OPEN');
  }
  
  testRequestCount++;
  
  try {
    const response = executeRequest(request);
    recordSuccess();
    
    // Check if enough successes to close
    if (successCount >= SUCCESS_THRESHOLD_TO_CLOSE) {
      transitionToClosed();
    }
    return response;
  } catch (error) {
    recordFailure();
    transitionToOpen();
    throw error;
  }
}
```

### 1.3 Configuration Parameters

| Parameter | Description | Recommended Value | Rationale |
|-----------|-------------|-------------------|-----------|
| `failureThreshold` | Failures before opening | 5 | Balances sensitivity vs. noise |
| `successThreshold` | Successes to close from half-open | 3 | Confirms recovery is stable |
| `recoveryTimeout` | Time before attempting recovery | 60 seconds | Allows service to recover |
| `halfOpenMaxCalls` | Max test requests in half-open | 3 | Limits exposure during recovery |
| `slidingWindowSize` | Time window for failure count | 60 seconds | Rolling window prevents stale counts |
| `requestTimeout` | Max wait for service response | 30 seconds | Matches Twenty CRM SLA |

### 1.4 State Transition Triggers

```
┌────────────────────────────────────────────────────────────────────────┐
│                     STATE TRANSITION LOGIC                             │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  CLOSED → OPEN                                                         │
│  ├── Failure count >= threshold (default: 5)                           │
│  └── OR Error rate > 50% in sliding window                             │
│                                                                        │
│  OPEN → HALF-OPEN                                                      │
│  └── Time since last failure >= recovery timeout (default: 60s)        │
│                                                                        │
│  HALF-OPEN → CLOSED                                                    │
│  └── Consecutive successes >= success threshold (default: 3)           │
│                                                                        │
│  HALF-OPEN → OPEN                                                      │
│  └── Any failure during test period                                    │
│                                                                        │
│  CLOSED → CLOSED (maintenance)                                         │
│  └── Manual override for planned downtime                              │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Implementation Options Comparison

### 2.1 Option A: Custom Code Node Implementation

**Approach:** Implement circuit breaker logic directly in n8n Code nodes

```javascript
// Circuit Breaker Code Node for n8n
const CIRCUIT_STATE_KEY = 'twenty_crm_circuit_state';
const FAILURE_COUNT_KEY = 'twenty_crm_failure_count';
const LAST_FAILURE_KEY = 'twenty_crm_last_failure';

// Configuration
const CONFIG = {
  failureThreshold: 5,
  recoveryTimeoutMs: 60000,
  halfOpenMaxCalls: 3,
  successThreshold: 3
};

// Get static data (persists across executions in same workflow)
const staticData = $getWorkflowStaticData('global');

class CircuitBreaker {
  constructor() {
    this.state = staticData[CIRCUIT_STATE_KEY] || 'CLOSED';
    this.failures = staticData[FAILURE_COUNT_KEY] || 0;
    this.lastFailure = staticData[LAST_FAILURE_KEY] || 0;
    this.testCalls = 0;
  }

  async execute(operation) {
    switch (this.state) {
      case 'CLOSED':
        return await this.executeClosed(operation);
      case 'OPEN':
        return await this.executeOpen(operation);
      case 'HALF_OPEN':
        return await this.executeHalfOpen(operation);
      default:
        throw new Error(`Unknown circuit state: ${this.state}`);
    }
  }

  async executeClosed(operation) {
    try {
      const result = await operation();
      this.recordSuccess();
      return { success: true, data: result, state: 'CLOSED' };
    } catch (error) {
      this.recordFailure();
      if (this.failures >= CONFIG.failureThreshold) {
        this.transitionToOpen();
        throw new CircuitBreakerError('Circuit opened due to failures', error);
      }
      throw error;
    }
  }

  async executeOpen(operation) {
    const now = Date.now();
    if (now - this.lastFailure < CONFIG.recoveryTimeoutMs) {
      throw new CircuitBreakerError('Circuit is OPEN - failing fast');
    }
    this.transitionToHalfOpen();
    return this.executeHalfOpen(operation);
  }

  async executeHalfOpen(operation) {
    if (this.testCalls >= CONFIG.halfOpenMaxCalls) {
      throw new CircuitBreakerError('Circuit is OPEN - test limit reached');
    }
    
    this.testCalls++;
    
    try {
      const result = await operation();
      this.recordSuccess();
      if (this.testCalls >= CONFIG.successThreshold) {
        this.transitionToClosed();
      }
      return { success: true, data: result, state: 'HALF_OPEN' };
    } catch (error) {
      this.recordFailure();
      this.transitionToOpen();
      throw error;
    }
  }

  recordSuccess() {
    this.failures = 0;
    this.saveState();
  }

  recordFailure() {
    this.failures++;
    this.lastFailure = Date.now();
    this.saveState();
  }

  transitionToOpen() {
    this.state = 'OPEN';
    this.testCalls = 0;
    this.saveState();
    console.log(`[CircuitBreaker] Transitioned to OPEN at ${new Date().toISOString()}`);
  }

  transitionToHalfOpen() {
    this.state = 'HALF_OPEN';
    this.testCalls = 0;
    this.saveState();
    console.log(`[CircuitBreaker] Transitioned to HALF_OPEN at ${new Date().toISOString()}`);
  }

  transitionToClosed() {
    this.state = 'CLOSED';
    this.failures = 0;
    this.testCalls = 0;
    this.saveState();
    console.log(`[CircuitBreaker] Transitioned to CLOSED at ${new Date().toISOString()}`);
  }

  saveState() {
    staticData[CIRCUIT_STATE_KEY] = this.state;
    staticData[FAILURE_COUNT_KEY] = this.failures;
    staticData[LAST_FAILURE_KEY] = this.lastFailure;
  }
}

// Export for use in workflow
return [{
  json: {
    circuitBreaker: {
      state: staticData[CIRCUIT_STATE_KEY] || 'CLOSED',
      failures: staticData[FAILURE_COUNT_KEY] || 0,
      lastFailure: staticData[LAST_FAILURE_KEY] || null
    }
  }
}];
```

| Aspect | Rating | Notes |
|--------|--------|-------|
| **Complexity** | ⭐⭐ Medium | Requires JavaScript knowledge |
| **State Persistence** | ⭐⭐ Limited | Per-workflow static data only |
| **Multi-Instance** | ⭐ No | State not shared across n8n instances |
| **Performance** | ⭐⭐⭐ Fast | In-memory, no external calls |
| **Maintainability** | ⭐⭐ Medium | Code duplication across workflows |
| **Flexibility** | ⭐⭐⭐ High | Full control over logic |

**Best For:** Single n8n instance deployments, simple use cases

---

### 2.2 Option B: Workflow-Level Circuit Breaker

**Approach:** Dedicated circuit breaker workflow with sub-workflow calls

```
┌─────────────────────────────────────────────────────────────────────────┐
│              WORKFLOW-LEVEL CIRCUIT BREAKER PATTERN                     │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────────────┐     ┌──────────────────────┐     ┌───────────┐   │
│  │ Main Workflow    │────▶│ Circuit Breaker      │────▶│ Execute   │   │
│  │ (Form Handler)   │     │ Sub-Workflow         │     │ CRM Call  │   │
│  └──────────────────┘     └──────────────────────┘     └───────────┘   │
│                                     │                                   │
│                                     ▼                                   │
│                           ┌─────────────────┐                          │
│                           │ IF: Circuit OK? │                          │
│                           └────────┬────────┘                          │
│                                    │                                   │
│                    ┌───────────────┼───────────────┐                    │
│                    ▼               ▼               ▼                    │
│            ┌───────────┐   ┌───────────┐   ┌───────────┐               │
│            │ Execute   │   │ Queue for │   │ Fallback  │               │
│            │ Request   │   │ Retry     │   │ Storage   │               │
│            │           │   │           │   │           │               │
│            └───────────┘   └───────────┘   └───────────┘               │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

**Circuit Breaker Workflow (reusable):**

```javascript
// Circuit Breaker Sub-Workflow
// Input: { serviceName, operation, fallbackAction }

const serviceName = $input.first().json.serviceName || 'twenty-crm';
const operation = $input.first().json.operation;
const fallbackAction = $input.first().json.fallbackAction;

// State storage (using n8n static data with key per service)
const staticData = $getWorkflowStaticData('global');
const stateKey = `circuit_${serviceName}_state`;
const failuresKey = `circuit_${serviceName}_failures`;
const lastFailureKey = `circuit_${serviceName}_lastFailure`;

const CONFIG = {
  failureThreshold: 5,
  recoveryTimeoutMs: 60000,
  halfOpenMaxCalls: 3
};

const state = {
  current: staticData[stateKey] || 'CLOSED',
  failures: staticData[failuresKey] || 0,
  lastFailure: staticData[lastFailureKey] || 0
};

function saveState() {
  staticData[stateKey] = state.current;
  staticData[failuresKey] = state.failures;
  staticData[lastFailureKey] = state.lastFailure;
}

function shouldAllowRequest() {
  if (state.current === 'CLOSED') return true;
  
  if (state.current === 'OPEN') {
    const elapsed = Date.now() - state.lastFailure;
    if (elapsed >= CONFIG.recoveryTimeoutMs) {
      state.current = 'HALF_OPEN';
      saveState();
      return true;
    }
    return false;
  }
  
  return state.current === 'HALF_OPEN';
}

function recordSuccess() {
  state.failures = 0;
  if (state.current === 'HALF_OPEN') {
    state.current = 'CLOSED';
  }
  saveState();
}

function recordFailure() {
  state.failures++;
  state.lastFailure = Date.now();
  
  if (state.failures >= CONFIG.failureThreshold || state.current === 'HALF_OPEN') {
    state.current = 'OPEN';
  }
  saveState();
}

// Main logic
const allowRequest = shouldAllowRequest();

return [{
  json: {
    serviceName,
    circuitState: state.current,
    allowRequest,
    failures: state.failures,
    lastFailure: state.lastFailure ? new Date(state.lastFailure).toISOString() : null,
    _meta: {
      recordSuccess,
      recordFailure
    }
  }
}];
```

| Aspect | Rating | Notes |
|--------|--------|-------|
| **Complexity** | ⭐⭐⭐ High | Multiple workflows to maintain |
| **State Persistence** | ⭐⭐ Limited | Still per-workflow static data |
| **Multi-Instance** | ⭐ No | Same limitation as Option A |
| **Performance** | ⭐⭐ Medium | Sub-workflow call overhead |
| **Maintainability** | ⭐⭐⭐ High | Reusable across workflows |
| **Flexibility** | ⭐⭐ Medium | Limited by sub-workflow interface |

**Best For:** Organizations with multiple workflows calling same services

---

### 2.3 Option C: HTTP Request Node Configuration

**Approach:** Leverage n8n native retry and timeout settings

```json
{
  "name": "Create Person with Native Retry",
  "type": "n8n-nodes-base.httpRequest",
  "parameters": {
    "method": "POST",
    "url": "={{ $env.TWENTY_CRM_BASE_URL }}/rest/people",
    "authentication": "genericCredentialType",
    "genericAuthType": "httpHeaderAuth",
    "sendBody": true,
    "contentType": "application/json",
    "jsonBody": "={{$json.payload}}",
    "options": {
      "timeout": 30000
    }
  },
  "retryOnFail": true,
  "maxTries": 3,
  "waitBetweenTries": 2000,
  "continueOnFail": true
}
```

**Limitations:**
- No circuit breaker state machine
- No failure threshold tracking
- No half-open probing
- Linear retry only (no exponential backoff)

| Aspect | Rating | Notes |
|--------|--------|-------|
| **Complexity** | ⭐ Low | Native configuration only |
| **State Persistence** | ⭐ None | No state tracking |
| **Multi-Instance** | ⭐⭐⭐ Yes | Built-in to n8n |
| **Performance** | ⭐⭐⭐ Fast | Native implementation |
| **Maintainability** | ⭐⭐⭐ High | Standard n8n features |
| **Flexibility** | ⭐ Low | Limited customization |

**Verdict:** Insufficient for production circuit breaker needs

---

### 2.4 Option D: Redis-Based External Service

**Approach:** Use Redis for distributed circuit breaker state management

```
┌─────────────────────────────────────────────────────────────────────────┐
│              REDIS-BACKED CIRCUIT BREAKER ARCHITECTURE                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   ┌─────────────┐     ┌─────────────┐     ┌─────────────┐              │
│   │  n8n        │     │  n8n        │     │  n8n        │              │
│   │  Instance 1 │     │  Instance 2 │     │  Instance N │              │
│   └──────┬──────┘     └──────┬──────┘     └──────┬──────┘              │
│          │                   │                   │                      │
│          └───────────────────┼───────────────────┘                      │
│                              │                                          │
│                              ▼                                          │
│                    ┌─────────────────┐                                 │
│                    │   Redis Cluster │                                 │
│                    │                 │                                 │
│                    │ ┌─────────────┐ │                                 │
│                    │ │ State Key   │ │  circuit:twenty:state          │
│                    │ ├─────────────┤ │                                 │
│                    │ │ Failures    │ │  circuit:twenty:failures       │
│                    │ ├─────────────┤ │                                 │
│                    │ │ Last Fail   │ │  circuit:twenty:last_failure   │
│                    │ ├─────────────┤ │                                 │
│                    │ │ Half-Open   │ │  circuit:twenty:half_open_cnt  │
│                    │ └─────────────┘ │                                 │
│                    └────────┬────────┘                                 │
│                             │                                          │
│                             ▼                                          │
│                    ┌─────────────────┐                                 │
│                    │  Twenty CRM API │                                 │
│                    └─────────────────┘                                 │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

**Redis Circuit Breaker Implementation:**

```javascript
// Redis-backed Circuit Breaker for n8n
// Requires: Redis connection credentials configured in n8n

const REDIS_KEYS = {
  state: 'circuit:twenty:state',
  failures: 'circuit:twenty:failures',
  lastFailure: 'circuit:twenty:last_failure',
  halfOpenCount: 'circuit:twenty:half_open_count',
  successCount: 'circuit:twenty:success_count'
};

const CONFIG = {
  failureThreshold: 5,
  successThreshold: 3,
  recoveryTimeoutMs: 60000,
  halfOpenMaxCalls: 3,
  redisTtl: 300 // 5 minutes TTL for state keys
};

// Lua script for atomic state operations
const ATOMIC_UPDATE_SCRIPT = `
  local state_key = KEYS[1]
  local failures_key = KEYS[2]
  local last_failure_key = KEYS[3]
  local ttl = tonumber(ARGV[4])
  
  local current_state = redis.call('GET', state_key) or 'CLOSED'
  local failures = tonumber(redis.call('GET', failures_key) or 0)
  
  if current_state == 'CLOSED' then
    failures = failures + 1
    redis.call('SET', failures_key, failures, 'EX', ttl)
    
    if failures >= tonumber(ARGV[1]) then
      redis.call('SET', state_key, 'OPEN', 'EX', ttl)
      redis.call('SET', last_failure_key, ARGV[3], 'EX', ttl)
      return 'OPENED'
    end
    return 'CLOSED'
  end
  
  return current_state
`;

class RedisCircuitBreaker {
  constructor(redisClient) {
    this.redis = redisClient;
    this.scriptSha = null;
  }

  async initialize() {
    // Register Lua script for atomic operations
    this.scriptSha = await this.redis.script('LOAD', ATOMIC_UPDATE_SCRIPT);
  }

  async getState() {
    const [state, failures, lastFailure, halfOpenCount, successCount] = 
      await this.redis.mget(
        REDIS_KEYS.state,
        REDIS_KEYS.failures,
        REDIS_KEYS.lastFailure,
        REDIS_KEYS.halfOpenCount,
        REDIS_KEYS.successCount
      );
    
    return {
      state: state || 'CLOSED',
      failures: parseInt(failures || '0'),
      lastFailure: lastFailure ? parseInt(lastFailure) : null,
      halfOpenCount: parseInt(halfOpenCount || '0'),
      successCount: parseInt(successCount || '0')
    };
  }

  async canExecute() {
    const state = await this.getState();
    const now = Date.now();

    switch (state.state) {
      case 'CLOSED':
        return { allowed: true, state: 'CLOSED' };
      
      case 'OPEN':
        if (state.lastFailure && (now - state.lastFailure) >= CONFIG.recoveryTimeoutMs) {
          // Transition to HALF_OPEN
          await this.redis.set(REDIS_KEYS.state, 'HALF_OPEN', 'EX', CONFIG.redisTtl);
          await this.redis.set(REDIS_KEYS.halfOpenCount, '0', 'EX', CONFIG.redisTtl);
          await this.redis.set(REDIS_KEYS.successCount, '0', 'EX', CONFIG.redisTtl);
          return { allowed: true, state: 'HALF_OPEN', probe: true };
        }
        return { allowed: false, state: 'OPEN', retryAfter: CONFIG.recoveryTimeoutMs - (now - state.lastFailure) };
      
      case 'HALF_OPEN':
        if (state.halfOpenCount >= CONFIG.halfOpenMaxCalls) {
          return { allowed: false, state: 'HALF_OPEN', reason: 'Test limit reached' };
        }
        return { allowed: true, state: 'HALF_OPEN', probe: true };
      
      default:
        return { allowed: false, state: 'UNKNOWN' };
    }
  }

  async recordSuccess() {
    const state = await this.getState();
    
    if (state.state === 'HALF_OPEN') {
      const newSuccessCount = state.successCount + 1;
      await this.redis.set(REDIS_KEYS.successCount, newSuccessCount.toString(), 'EX', CONFIG.redisTtl);
      
      if (newSuccessCount >= CONFIG.successThreshold) {
        // Close the circuit
        await this.redis.set(REDIS_KEYS.state, 'CLOSED', 'EX', CONFIG.redisTtl);
        await this.redis.set(REDIS_KEYS.failures, '0', 'EX', CONFIG.redisTtl);
        await this.redis.del(REDIS_KEYS.halfOpenCount);
        await this.redis.del(REDIS_KEYS.successCount);
        return { state: 'CLOSED', transition: 'HALF_OPEN→CLOSED' };
      }
      return { state: 'HALF_OPEN', successCount: newSuccessCount };
    } else {
      // Reset failures in CLOSED state
      await this.redis.set(REDIS_KEYS.failures, '0', 'EX', CONFIG.redisTtl);
      return { state: 'CLOSED' };
    }
  }

  async recordFailure() {
    const state = await this.getState();
    const now = Date.now();

    if (state.state === 'HALF_OPEN') {
      // Any failure in HALF_OPEN reopens circuit
      await this.redis.set(REDIS_KEYS.state, 'OPEN', 'EX', CONFIG.redisTtl);
      await this.redis.set(REDIS_KEYS.lastFailure, now.toString(), 'EX', CONFIG.redisTtl);
      return { state: 'OPEN', transition: 'HALF_OPEN→OPEN' };
    }

    // Use Lua script for atomic update in CLOSED state
    const result = await this.redis.evalsha(
      this.scriptSha,
      3, // number of keys
      REDIS_KEYS.state,
      REDIS_KEYS.failures,
      REDIS_KEYS.lastFailure,
      CONFIG.failureThreshold,
      CONFIG.recoveryTimeoutMs,
      now,
      CONFIG.redisTtl
    );

    return { state: result === 'OPENED' ? 'OPEN' : 'CLOSED' };
  }
}

// Usage in n8n workflow
async function executeWithCircuitBreaker(redisConfig, operation) {
  const redis = new Redis(redisConfig);
  const breaker = new RedisCircuitBreaker(redis);
  await breaker.initialize();

  const canExecute = await breaker.canExecute();
  
  if (!canExecute.allowed) {
    throw new Error(`Circuit breaker is ${canExecute.state}: ${canExecute.reason || 'Service unavailable'}`);
  }

  try {
    const result = await operation();
    const stateUpdate = await breaker.recordSuccess();
    return { success: true, data: result, circuitState: stateUpdate };
  } catch (error) {
    const stateUpdate = await breaker.recordFailure();
    return { success: false, error: error.message, circuitState: stateUpdate };
  }
}

module.exports = { RedisCircuitBreaker, executeWithCircuitBreaker };
```

| Aspect | Rating | Notes |
|--------|--------|-------|
| **Complexity** | ⭐⭐⭐ High | Redis infrastructure required |
| **State Persistence** | ⭐⭐⭐ Excellent | Persistent, shared state |
| **Multi-Instance** | ⭐⭐⭐ Yes | Shared across all n8n instances |
| **Performance** | ⭐⭐ Good | Redis latency (~1-5ms) |
| **Maintainability** | ⭐⭐ Medium | External dependency to manage |
| **Flexibility** | ⭐⭐⭐ High | Full implementation control |

**Best For:** Multi-instance n8n deployments, high-availability requirements

---

### 2.5 Implementation Options Summary

| Criteria | Option A<br>Code Node | Option B<br>Sub-Workflow | Option C<br>Native HTTP | Option D<br>Redis |
|----------|:-------------------:|:------------------------:|:-----------------------:|:----------------:|
| **Implementation Effort** | Medium | High | Low | High |
| **Operational Complexity** | Low | Medium | Low | High |
| **State Sharing** | ❌ Single instance | ❌ Single instance | ❌ None | ✅ Distributed |
| **Production Ready** | ⚠️ Limited | ⚠️ Limited | ❌ No | ✅ Yes |
| **Failure Detection** | ✅ Yes | ✅ Yes | ⚠️ Basic | ✅ Advanced |
| **Auto-Recovery** | ✅ Yes | ✅ Yes | ❌ No | ✅ Yes |
| **Monitoring Support** | ⚠️ Limited | ⚠️ Limited | ❌ No | ✅ Full |
| **Cost** | Free | Free | Free | Redis hosting |

### Recommendation

**Primary:** Option D (Redis-backed) for production environments with multiple n8n instances

**Secondary:** Option A (Code Node) for single-instance deployments or proof-of-concept

---

## 3. Twenty CRM Specific Considerations

### 3.1 API Rate Limits and Failure Modes

**Twenty CRM Rate Limiting:**
- 100 requests per minute per API key
- 60 records per batch operation
- Rate limit resets on a rolling window

```javascript
// Rate limit aware circuit breaker
const TWENTY_CRM_LIMITS = {
  requestsPerMinute: 100,
  recordsPerBatch: 60,
  burstAllowance: 10 // Allow small bursts
};

function isRateLimitError(error) {
  return error.statusCode === 429 || 
         (error.message && error.message.includes('Rate limit'));
}

function calculateRetryDelay(error, attempt) {
  if (isRateLimitError(error)) {
    // Use Retry-After header if available
    const retryAfter = error.headers?.['retry-after'];
    if (retryAfter) {
      return parseInt(retryAfter) * 1000;
    }
    // Default: exponential backoff with jitter
    const baseDelay = 1000 * Math.pow(2, attempt);
    const jitter = Math.random() * 1000;
    return Math.min(baseDelay + jitter, 60000); // Max 60s
  }
  
  // For 5xx errors, shorter backoff
  return 1000 * Math.pow(2, attempt);
}
```

### 3.2 Common Failure Modes

| HTTP Code | Error Type | Circuit Action | Retry Strategy |
|-----------|------------|----------------|----------------|
| 429 | Rate Limited | Count toward threshold | Exponential backoff (respect Retry-After) |
| 500 | Internal Server Error | Count toward threshold | 3 retries with 2s delay |
| 502 | Bad Gateway | Count toward threshold | Immediate retry |
| 503 | Service Unavailable | Count toward threshold | Exponential backoff |
| 504 | Gateway Timeout | Count toward threshold | 3 retries with backoff |
| 401 | Unauthorized | **Open circuit immediately** | No retry - alert admin |
| 403 | Forbidden | **Open circuit immediately** | No retry - alert admin |
| 400 | Bad Request | Don't count | No retry - log validation error |
| 404 | Not Found | Don't count | No retry - log resource missing |

### 3.3 Recovery Patterns

```javascript
// Twenty CRM specific recovery patterns
const RECOVERY_PATTERNS = {
  // 503 Service Unavailable - Usually temporary, longer recovery
  503: {
    circuitOpenDuration: 60000,      // 60 seconds
    testRequestsNeeded: 3,
    backoffMultiplier: 2
  },
  
  // 429 Rate Limited - Follow Retry-After header
  429: {
    circuitOpenDuration: 30000,      // 30 seconds
    testRequestsNeeded: 2,
    backoffMultiplier: 1.5
  },
  
  // 500/502/504 - Standard recovery
  500: {
    circuitOpenDuration: 30000,
    testRequestsNeeded: 2,
    backoffMultiplier: 2
  }
};
```

### 3.4 Fallback Strategies

When circuit breaker is OPEN, implement graceful degradation:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    FALLBACK STRATEGY HIERARCHY                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Priority 1: Queue for Retry                                            │
│  ├── Store in Redis queue                                               │
│  └── Process when circuit closes                                        │
│                                                                         │
│  Priority 2: Google Sheets Backup                                       │
│  ├── Append to fallback spreadsheet                                     │
│  └── Schedule reconciliation job                                        │
│                                                                         │
│  Priority 3: PostgreSQL Dead Letter Queue                               │
│  ├── Store with full context                                            │
│  └── Manual review workflow                                             │
│                                                                         │
│  Priority 4: Alert Operations                                           │
│  ├── Slack/Email notification                                           │
│  └── PagerDuty for critical issues                                      │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

**Fallback Implementation:**

```javascript
// Fallback handler for open circuit
async function handleCircuitOpen(submission, circuitState) {
  const fallbackResults = {
    queued: false,
    sheetBackup: false,
    dlqStored: false,
    alerted: false
  };

  // 1. Queue in Redis for retry
  try {
    await queueForRetry(submission);
    fallbackResults.queued = true;
  } catch (error) {
    console.error('Failed to queue for retry:', error);
  }

  // 2. Backup to Google Sheets
  try {
    await backupToSheets(submission, circuitState);
    fallbackResults.sheetBackup = true;
  } catch (error) {
    console.error('Failed to backup to sheets:', error);
  }

  // 3. Store in Dead Letter Queue
  try {
    await storeInDLQ(submission, {
      reason: 'CIRCUIT_OPEN',
      circuitState,
      timestamp: new Date().toISOString()
    });
    fallbackResults.dlqStored = true;
  } catch (error) {
    console.error('Failed to store in DLQ:', error);
  }

  // 4. Alert if critical
  if (!fallbackResults.queued && !fallbackResults.sheetBackup) {
    await sendCriticalAlert({
      severity: 'CRITICAL',
      message: 'Circuit open and fallback storage failed',
      submission,
      circuitState
    });
    fallbackResults.alerted = true;
  }

  return fallbackResults;
}
```

---

## 4. Implementation Design

### 4.1 Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│               CIRCUIT BREAKER ARCHITECTURE FOR N8N + TWENTY CRM         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   INGRESS                    CIRCUIT BREAKER LAYER                      │
│   ┌──────────┐              ┌───────────────────────────────────┐      │
│   │ Webhook  │─────────────▶│ 1. Check Circuit State            │      │
│   │ Trigger  │              │    ┌─────────────────────────┐    │      │
│   └──────────┘              │    │ State: CLOSED?          │    │      │
│                             │    │   ├─▶ Execute Request   │    │      │
│   PROCESSING                │    │ State: OPEN?            │    │      │
│   ┌──────────┐              │    │   ├─▶ Route to Fallback │    │      │
│   │ Process  │◀─────────────│    │ State: HALF-OPEN?       │    │      │
│   │ Form     │              │    │   ├─▶ Limited Test      │    │      │
│   └──────────┘              │    └─────────────────────────┘    │      │
│                             │                                   │      │
│   CRM INTEGRATION           │ 2. Monitor & Update State         │      │
│   ┌──────────┐              │    ┌─────────────────────────┐    │      │
│   │ Create   │◀─────────────│    │ Success: Reset Failures │    │      │
│   │ Person   │              │    │ Failure: Increment +    │    │      │
│   └──────────┘              │    │          Check Threshold│    │      │
│        │                    │    └─────────────────────────┘    │      │
│        ▼                    └───────────────────────────────────┘      │
│   ┌──────────┐                                                         │
│   │ Create   │              STATE STORAGE (Redis)                      │
│   │ Company  │              ┌───────────────────────────────────┐      │
│   └──────────┘              │ • circuit:twenty:state            │      │
│        │                    │ • circuit:twenty:failures         │      │
│        ▼                    │ • circuit:twenty:last_failure     │      │
│   ┌──────────┐              │ • circuit:twenty:half_open_count  │      │
│   │ Create   │              │ • circuit:twenty:success_count    │      │
│   │ Note     │              └───────────────────────────────────┘      │
│   └──────────┘                                                         │
│                                                                         │
│   FALLBACK LAYER                                                        │
│   ┌──────────┬──────────┬──────────┐                                   │
│   │  Redis   │  Google  │   DLQ    │                                   │
│   │  Queue   │  Sheets  │ (DB)     │                                   │
│   └──────────┴──────────┴──────────┘                                   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 4.2 State Storage Design

**Redis Key Schema:**

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      REDIS KEY SCHEMA                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Global State                                                           │
│  ├── circuit:twenty:state              "CLOSED" | "OPEN" | "HALF_OPEN" │
│  ├── circuit:twenty:failures           "3" (counter)                   │
│  ├── circuit:twenty:last_failure       "1647700000000" (timestamp)     │
│  ├── circuit:twenty:half_open_count    "1" (test calls in progress)    │
│  └── circuit:twenty:success_count      "2" (successes in half-open)    │
│                                                                         │
│  Per-Workflow State (optional)                                          │
│  ├── circuit:{workflow_id}:state                                       │
│  ├── circuit:{workflow_id}:failures                                    │
│  └── ...                                                               │
│                                                                         │
│  Statistics (for monitoring)                                            │
│  ├── circuit:twenty:stats:total_calls                                  │
│  ├── circuit:twenty:stats:failures                                     │
│  ├── circuit:twenty:stats:opens                                        │
│  ├── circuit:twenty:stats:last_opened                                  │
│  └── circuit:twenty:stats:avg_response_time                            │
│                                                                         │
│  Queue for Retry (when circuit open)                                    │
│  └── circuit:twenty:retry_queue (Redis List)                           │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

**State Transition Sequence Diagram:**

```
┌─────────┐     ┌──────────────┐     ┌─────────────┐     ┌──────────┐
│  n8n    │     │   Circuit    │     │    Redis    │     │  Twenty  │
│ Workflow│     │   Breaker    │     │             │     │   CRM    │
└────┬────┘     └──────┬───────┘     └──────┬──────┘     └────┬─────┘
     │                 │                    │                 │
     │ 1. Request CRM  │                    │                 │
     │────────────────▶│                    │                 │
     │                 │ 2. GET state       │                 │
     │                 │───────────────────▶│                 │
     │                 │◀─"CLOSED"          │                 │
     │                 │                    │                 │
     │                 │ 3. Call CRM        │                 │
     │                 │─────────────────────────────────────▶│
     │                 │◀─Error 503                            │
     │                 │                    │                 │
     │                 │ 4. INCR failures   │                 │
     │                 │───────────────────▶│                 │
     │                 │                    │                 │
     │                 │ (failures < 5)     │                 │
     │                 │                    │                 │
     │ 5. Return error │                    │                 │
     │◀────────────────│                    │                 │
     │                 │                    │                 │
     │ [More failures] │                    │                 │
     │                 │                    │                 │
     │ 6. Request CRM  │                    │                 │
     │────────────────▶│                    │                 │
     │                 │ 7. GET state       │                 │
     │                 │───────────────────▶│                 │
     │                 │◀─"CLOSED"          │                 │
     │                 │                    │                 │
     │                 │ 8. Call CRM        │                 │
     │                 │─────────────────────────────────────▶│
     │                 │◀─Error 503                            │
     │                 │                    │                 │
     │                 │ 9. INCR failures (now = 5)             │
     │                 │───────────────────▶│                 │
     │                 │ 10. SET state=OPEN │                 │
     │                 │───────────────────▶│                 │
     │                 │                    │                 │
     │ 11. CircuitOpen │                    │                 │
     │◀────────────────│                    │                 │
     │                 │                    │                 │
     │ [60 seconds]    │                    │                 │
     │                 │                    │                 │
     │ 12. Request CRM │                    │                 │
     │────────────────▶│                    │                 │
     │                 │ 13. GET state      │                 │
     │                 │───────────────────▶│                 │
     │                 │◀─"OPEN"            │                 │
     │                 │                    │                 │
     │                 │ 14. Check timeout  │                 │
     │                 │ (expired)          │                 │
     │                 │                    │                 │
     │                 │ 15. SET state=HALF_OPEN                │
     │                 │───────────────────▶│                 │
     │                 │                    │                 │
     │                 │ 16. Test call      │                 │
     │                 │─────────────────────────────────────▶│
     │                 │◀─Success                            │
     │                 │                    │                 │
     │                 │ 17. SET state=CLOSED                   │
     │                 │───────────────────▶│                 │
     │                 │                    │                 │
     │ 18. Success     │                    │                 │
     │◀────────────────│                    │                 │
     │                 │                    │                 │
```

### 4.3 Failure Detection Logic

```javascript
// Comprehensive failure detection for Twenty CRM
class FailureDetector {
  constructor() {
    this.retryableErrors = [
      'ECONNRESET',
      'ETIMEDOUT',
      'ECONNREFUSED',
      'ENOTFOUND',
      'EAI_AGAIN',
      'ENOTFOUND'
    ];
    
    this.retryableStatusCodes = [429, 500, 502, 503, 504];
    this.nonRetryableStatusCodes = [400, 401, 403, 404, 422];
  }

  analyze(error, response) {
    const analysis = {
      shouldCountTowardsThreshold: false,
      shouldOpenCircuit: false,
      shouldRetry: false,
      retryDelay: 0,
      severity: 'info',
      action: 'continue'
    };

    // Network/connection errors
    if (error.code && this.retryableErrors.includes(error.code)) {
      analysis.shouldCountTowardsThreshold = true;
      analysis.shouldRetry = true;
      analysis.retryDelay = this.calculateBackoff(1);
      analysis.severity = 'warning';
      return analysis;
    }

    // HTTP status code analysis
    const statusCode = response?.statusCode || error.statusCode;
    
    if (statusCode) {
      if (this.retryableStatusCodes.includes(statusCode)) {
        analysis.shouldCountTowardsThreshold = true;
        analysis.shouldRetry = true;
        analysis.retryDelay = this.calculateBackoff(1, statusCode);
        analysis.severity = statusCode === 429 ? 'warning' : 'error';
        
        // 429 rate limit - special handling
        if (statusCode === 429) {
          const retryAfter = response?.headers?.['retry-after'];
          if (retryAfter) {
            analysis.retryDelay = parseInt(retryAfter) * 1000;
          }
        }
      }
      
      if (this.nonRetryableStatusCodes.includes(statusCode)) {
        // Authentication failures - open circuit immediately
        if (statusCode === 401 || statusCode === 403) {
          analysis.shouldOpenCircuit = true;
          analysis.severity = 'critical';
          analysis.action = 'alert_immediately';
        }
        analysis.shouldRetry = false;
      }
    }

    // Timeout detection
    if (error.message?.includes('timeout') || error.code === 'ETIMEDOUT') {
      analysis.shouldCountTowardsThreshold = true;
      analysis.shouldRetry = true;
      analysis.retryDelay = 5000;
      analysis.severity = 'warning';
    }

    return analysis;
  }

  calculateBackoff(attempt, statusCode) {
    const baseDelay = 1000;
    const maxDelay = 60000;
    
    // Different strategies for different errors
    if (statusCode === 429) {
      // Rate limit - more aggressive backoff
      return Math.min(baseDelay * Math.pow(1.5, attempt), maxDelay);
    }
    
    // Standard exponential backoff
    return Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
  }
}
```

### 4.4 Success/Failure Counting

```javascript
// Sliding window failure counter for accurate threshold detection
class SlidingWindowCounter {
  constructor(windowSizeMs = 60000) {
    this.windowSize = windowSizeMs;
    this.events = [];
  }

  recordSuccess() {
    this.cleanup();
    this.events.push({ type: 'success', timestamp: Date.now() });
  }

  recordFailure() {
    this.cleanup();
    this.events.push({ type: 'failure', timestamp: Date.now() });
  }

  cleanup() {
    const cutoff = Date.now() - this.windowSize;
    this.events = this.events.filter(e => e.timestamp > cutoff);
  }

  getStats() {
    this.cleanup();
    const successes = this.events.filter(e => e.type === 'success').length;
    const failures = this.events.filter(e => e.type === 'failure').length;
    const total = this.events.length;
    
    return {
      successes,
      failures,
      total,
      failureRate: total > 0 ? failures / total : 0,
      windowSizeMs: this.windowSize
    };
  }

  shouldOpenCircuit(threshold) {
    const stats = this.getStats();
    return stats.failures >= threshold;
  }
}

// Redis-backed implementation
class RedisSlidingWindowCounter {
  constructor(redis, keyPrefix, windowSizeMs = 60000) {
    this.redis = redis;
    this.keyPrefix = keyPrefix;
    this.windowSize = windowSizeMs;
  }

  async recordSuccess() {
    const key = `${this.keyPrefix}:events`;
    const now = Date.now();
    await this.redis.zadd(key, now, `success:${now}:${Math.random()}`);
    await this.redis.expire(key, Math.ceil(this.windowSize / 1000));
    await this.cleanup(key);
  }

  async recordFailure() {
    const key = `${this.keyPrefix}:events`;
    const now = Date.now();
    await this.redis.zadd(key, now, `failure:${now}:${Math.random()}`);
    await this.redis.expire(key, Math.ceil(this.windowSize / 1000));
    await this.cleanup(key);
  }

  async cleanup(key) {
    const cutoff = Date.now() - this.windowSize;
    await this.redis.zremrangebyscore(key, 0, cutoff);
  }

  async getStats() {
    const key = `${this.keyPrefix}:events`;
    await this.cleanup(key);
    
    const events = await this.redis.zrange(key, 0, -1);
    const successes = events.filter(e => e.startsWith('success')).length;
    const failures = events.filter(e => e.startsWith('failure')).length;
    
    return {
      successes,
      failures,
      total: events.length,
      failureRate: events.length > 0 ? failures / events.length : 0
    };
  }
}
```

### 4.5 State Transition Triggers

```javascript
// State machine with configurable triggers
const STATE_MACHINE_CONFIG = {
  states: {
    CLOSED: {
      transitions: {
        TO_OPEN: {
          condition: (ctx) => ctx.failures >= ctx.failureThreshold,
          action: 'openCircuit'
        },
        TO_CLOSED: {
          condition: () => false, // No self-transition
          action: null
        }
      }
    },
    OPEN: {
      transitions: {
        TO_HALF_OPEN: {
          condition: (ctx) => {
            const elapsed = Date.now() - ctx.lastFailure;
            return elapsed >= ctx.recoveryTimeoutMs;
          },
          action: 'startProbing'
        }
      }
    },
    HALF_OPEN: {
      transitions: {
        TO_CLOSED: {
          condition: (ctx) => ctx.successCount >= ctx.successThreshold,
          action: 'closeCircuit'
        },
        TO_OPEN: {
          condition: (ctx) => ctx.lastResult === 'failure',
          action: 'reopenCircuit'
        }
      }
    }
  }
};

class StateMachine {
  constructor(config, context) {
    this.config = config;
    this.context = context;
    this.state = 'CLOSED';
  }

  async transition(event) {
    const currentStateConfig = this.config.states[this.state];
    const transition = currentStateConfig.transitions[event];
    
    if (!transition) {
      throw new Error(`Invalid transition ${event} from state ${this.state}`);
    }

    if (transition.condition(this.context)) {
      const previousState = this.state;
      
      // Execute transition action
      if (transition.action) {
        await this.executeAction(transition.action);
      }
      
      // Update state
      this.state = event.replace('TO_', '');
      
      // Log transition
      console.log(`[StateMachine] ${previousState} → ${this.state} (${event})`);
      
      return {
        success: true,
        from: previousState,
        to: this.state,
        action: transition.action
      };
    }

    return { success: false, reason: 'Condition not met' };
  }

  async executeAction(actionName) {
    const actions = {
      openCircuit: async () => {
        await this.context.redis.set('circuit:state', 'OPEN');
        await this.context.redis.set('circuit:last_failure', Date.now().toString());
        await this.sendAlert('Circuit opened');
      },
      startProbing: async () => {
        await this.context.redis.set('circuit:state', 'HALF_OPEN');
        await this.context.redis.set('circuit:success_count', '0');
      },
      closeCircuit: async () => {
        await this.context.redis.set('circuit:state', 'CLOSED');
        await this.context.redis.set('circuit:failures', '0');
        await this.sendAlert('Circuit closed - service recovered');
      },
      reopenCircuit: async () => {
        await this.context.redis.set('circuit:state', 'OPEN');
        await this.context.redis.set('circuit:last_failure', Date.now().toString());
      }
    };

    if (actions[actionName]) {
      await actions[actionName]();
    }
  }
}
```

### 4.6 Fallback Behavior

```javascript
// Comprehensive fallback system
class FallbackSystem {
  constructor(config) {
    this.config = config;
    this.strategies = [
      new QueueFallbackStrategy(),
      new SheetsFallbackStrategy(),
      new DLQFallbackStrategy()
    ];
  }

  async execute(submission, circuitState) {
    const results = [];
    
    for (const strategy of this.strategies) {
      try {
        const result = await strategy.execute(submission, circuitState);
        results.push({ strategy: strategy.name, success: true, result });
        
        // If critical strategy succeeds, we can continue
        if (strategy.isCritical) {
          break;
        }
      } catch (error) {
        results.push({ strategy: strategy.name, success: false, error: error.message });
      }
    }

    // If all strategies failed, escalate
    const allFailed = results.every(r => !r.success);
    if (allFailed) {
      await this.escalate(submission, circuitState, results);
    }

    return results;
  }

  async escalate(submission, circuitState, failureResults) {
    await sendAlert({
      severity: 'CRITICAL',
      title: 'All Fallback Strategies Failed',
      message: 'Circuit breaker open and unable to store submission',
      submission: this.sanitize(submission),
      circuitState,
      failures: failureResults
    });
  }

  sanitize(submission) {
    // Remove sensitive data before logging
    const sanitized = { ...submission };
    if (sanitized.email) sanitized.email = this.maskEmail(sanitized.email);
    if (sanitized.phone) sanitized.phone = this.maskPhone(sanitized.phone);
    return sanitized;
  }

  maskEmail(email) {
    const [local, domain] = email.split('@');
    return `${local[0]}***@${domain}`;
  }

  maskPhone(phone) {
    return phone.slice(-4).padStart(phone.length, '*');
  }
}

// Individual fallback strategies
class QueueFallbackStrategy {
  constructor() {
    this.name = 'RedisQueue';
    this.isCritical = true;
  }

  async execute(submission, circuitState) {
    const queueKey = 'circuit:twenty:retry_queue';
    const item = {
      submission,
      circuitState,
      queuedAt: new Date().toISOString(),
      retryCount: 0
    };
    
    await redis.lpush(queueKey, JSON.stringify(item));
    return { queued: true, key: queueKey };
  }
}

class SheetsFallbackStrategy {
  constructor() {
    this.name = 'GoogleSheets';
    this.isCritical = false;
  }

  async execute(submission, circuitState) {
    // Append to Google Sheets backup
    const row = [
      new Date().toISOString(),
      submission.email,
      submission.company,
      'CIRCUIT_OPEN',
      JSON.stringify(circuitState)
    ];
    
    await appendToSheet(this.config.sheetId, row);
    return { backedUp: true, destination: 'sheets' };
  }
}

class DLQFallbackStrategy {
  constructor() {
    this.name = 'DeadLetterQueue';
    this.isCritical = false;
  }

  async execute(submission, circuitState) {
    const dlqEntry = {
      id: generateUUID(),
      timestamp: new Date().toISOString(),
      submission,
      circuitState,
      status: 'PENDING_MANUAL_REVIEW'
    };
    
    await saveToDatabase('failed_submissions', dlqEntry);
    return { stored: true, id: dlqEntry.id };
  }
}
```

---

## 5. Integration Points

### 5.1 Circuit Breaker Placement in Workflow

```
┌─────────────────────────────────────────────────────────────────────────┐
│              CIRCUIT BREAKER INTEGRATION POINTS                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Option 1: Global Circuit Breaker (Recommended)                         │
│  ┌──────────┐   ┌──────────────┐   ┌─────────────┐   ┌─────────────┐   │
│  │ Webhook  │──▶│ Validate     │──▶│ Check       │──▶│ Process     │   │
│  │          │   │ Input        │   │ Circuit     │   │ Request     │   │
│  └──────────┘   └──────────────┘   └──────┬──────┘   └─────────────┘   │
│                                           │                             │
│                              ┌────────────┴────────────┐               │
│                              ▼                         ▼               │
│                        ┌──────────┐              ┌──────────┐          │
│                        │ Continue │              │ Fallback │          │
│                        │ to CRM   │              │ Storage  │          │
│                        └──────────┘              └──────────┘          │
│                                                                         │
│  Option 2: Per-Operation Circuit Breaker                                │
│  ┌──────────┐   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐    │
│  │ Process  │──▶│ Check       │──▶│ Create      │──▶│ Check       │    │
│  │ Form     │   │ Circuit 1   │   │ Person      │   │ Circuit 2   │    │
│  └──────────┘   └──────┬──────┘   └─────────────┘   └──────┬──────┘    │
│                        │                                   │            │
│                   ┌────┴────┐                         ┌────┴────┐       │
│                   ▼         ▼                         ▼         ▼       │
│              ┌────────┐ ┌────────┐               ┌────────┐ ┌────────┐  │
│              │ Create │ │ Create │               │ Create │ │ Create │  │
│              │ Person │ │ Company│               │ Company│ │ Note   │  │
│              └────────┘ └────────┘               └────────┘ └────────┘  │
│                                                                         │
│  Option 3: Granular Endpoint-Level                                      │
│  ├── Circuit: twenty-people    (POST /rest/people)                      │
│  ├── Circuit: twenty-companies (POST /rest/companies)                   │
│  └── Circuit: twenty-notes     (POST /rest/notes)                       │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

**Recommendation:** Option 1 (Global Circuit Breaker) for simplicity, with Option 3 (Endpoint-Level) for high-volume scenarios requiring fine-grained control.

### 5.2 Partial Failure Handling

When Person creation succeeds but Company creation fails:

```javascript
// Saga pattern for partial failure compensation
class CRMSaga {
  constructor() {
    this.steps = [];
    this.compensations = [];
    this.results = [];
  }

  step(name, operation, compensation) {
    this.steps.push({ name, operation });
    this.compensations.push(compensation);
    return this;
  }

  async execute(context) {
    for (let i = 0; i < this.steps.length; i++) {
      const { name, operation } = this.steps[i];
      
      try {
        const result = await operation(context);
        this.results.push({ step: i, name, result, success: true });
      } catch (error) {
        this.results.push({ step: i, name, error, success: false });
        
        // Execute compensations in reverse order
        await this.compensate(i - 1);
        
        throw new SagaError(`Step ${name} failed`, { step: i, error, results: this.results });
      }
    }
    
    return this.results;
  }

  async compensate(lastSuccessfulStep) {
    for (let i = lastSuccessfulStep; i >= 0; i--) {
      const compensation = this.compensations[i];
      if (compensation) {
        try {
          await compensation(this.results[i].result);
        } catch (error) {
          // Log for manual intervention
          console.error(`Compensation failed for step ${i}:`, error);
          await alertCompensationFailure(i, error);
        }
      }
    }
  }
}

// Usage in n8n workflow
const saga = new CRMSaga();

saga
  .step('createPerson',
    async (ctx) => await createPerson(ctx.personData),
    async (personId) => await deletePerson(personId)
  )
  .step('createCompany',
    async (ctx) => await createCompany(ctx.companyData),
    async (companyId) => await deleteCompany(companyId)
  )
  .step('linkPersonToCompany',
    async (ctx) => await linkPersonToCompany(ctx.personId, ctx.companyId),
    null // No compensation needed - can be retried idempotently
  )
  .step('createNote',
    async (ctx) => await createNote(ctx.noteData),
    null
  );

try {
  const results = await saga.execute({
    personData,
    companyData,
    noteData
  });
  return { success: true, results };
} catch (error) {
  return { success: false, error: error.message, partialResults: error.details.results };
}
```

### 5.3 Recovery Workflow Design

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    RECOVERY WORKFLOW ARCHITECTURE                       │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                     RECOVERY ORCHESTRATOR                       │   │
│  │                    (Runs every 5 minutes)                       │   │
│  └─────────────┬───────────────────────────────────────────────────┘   │
│                │                                                        │
│    ┌───────────┼───────────┐                                            │
│    ▼           ▼           ▼                                            │
│ ┌────────┐ ┌────────┐ ┌────────┐                                       │
│ │ Check  │ │ Process│ │ Cleanup│                                       │
│ │ Circuit│ │ Queue  │ │ Stale  │                                       │
│ │ State  │ │ Items  │ │ Items  │                                       │
│ └───┬────┘ └────┬───┘ └───┬────┘                                       │
│     │           │         │                                             │
│     ▼           ▼         ▼                                             │
│ ┌────────┐ ┌────────┐ ┌────────┐                                       │
│ │ If     │ │ Retry  │ │ Archive│                                       │
│ │ HALF_  │ │ Failed │ │ Old    │                                       │
│ │ OPEN   │ │ Items  │ │ Records│                                       │
│ │ probe  │ │        │ │        │                                       │
│ └────────┘ └────────┘ └────────┘                                       │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

**Recovery Workflow Implementation:**

```javascript
// Recovery workflow - triggered by schedule or manual
async function recoveryWorkflow() {
  const results = {
    circuitChecked: false,
    queueProcessed: 0,
    queueSucceeded: 0,
    queueFailed: 0,
    staleCleaned: 0
  };

  // 1. Check circuit state and probe if HALF_OPEN
  const circuitState = await getCircuitState();
  results.circuitChecked = true;

  if (circuitState.state === 'HALF_OPEN') {
    // Probing is handled automatically by regular requests
    console.log('Circuit is HALF_OPEN - probes in progress');
  }

  // 2. Process retry queue
  const queueKey = 'circuit:twenty:retry_queue';
  const queueLength = await redis.llen(queueKey);
  
  if (queueLength > 0 && circuitState.state === 'CLOSED') {
    const batchSize = 10; // Process in batches
    const items = await redis.lrange(queueKey, 0, batchSize - 1);
    
    for (const itemJson of items) {
      const item = JSON.parse(itemJson);
      results.queueProcessed++;
      
      try {
        await reprocessSubmission(item.submission);
        await redis.lrem(queueKey, 0, itemJson);
        results.queueSucceeded++;
      } catch (error) {
        item.retryCount++;
        item.lastError = error.message;
        
        if (item.retryCount >= 5) {
          // Move to DLQ
          await moveToDLQ(item);
          await redis.lrem(queueKey, 0, itemJson);
        } else {
          // Update in queue
          await redis.lrem(queueKey, 0, itemJson);
          await redis.rpush(queueKey, JSON.stringify(item));
        }
        results.queueFailed++;
      }
    }
  }

  // 3. Cleanup stale records
  const staleCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days
  results.staleCleaned = await cleanupStaleRecords(staleCutoff);

  // 4. Send summary
  await sendRecoveryReport(results);

  return results;
}
```

---

## 6. Code Examples

### 6.1 Complete n8n-Compatible Circuit Breaker Node

```javascript
// circuit-breaker-node.js
// Complete production-ready circuit breaker for n8n

const CIRCUIT_CONFIG = {
  redisPrefix: 'circuit:twenty',
  failureThreshold: 5,
  successThreshold: 3,
  recoveryTimeoutMs: 60000,
  halfOpenMaxCalls: 3,
  slidingWindowMs: 60000
};

// Main execution function for n8n Code node
async function circuitBreakerNode() {
  const operation = $input.first().json.operation; // 'check', 'record_success', 'record_failure'
  const serviceName = $input.first().json.serviceName || 'twenty-crm';
  
  // Initialize Redis connection (configure in n8n credentials)
  const redis = await getRedisConnection();
  const breaker = new ProductionCircuitBreaker(redis, serviceName, CIRCUIT_CONFIG);
  
  switch (operation) {
    case 'check':
      return await handleCheck(breaker);
    case 'record_success':
      return await handleRecordSuccess(breaker);
    case 'record_failure':
      return await handleRecordFailure(breaker, $input.first().json.error);
    default:
      throw new Error(`Unknown operation: ${operation}`);
  }
}

async function handleCheck(breaker) {
  const status = await breaker.check();
  
  if (!status.allowed) {
    // Circuit is open - route to fallback
    return [{
      json: {
        circuitOpen: true,
        state: status.state,
        retryAfter: status.retryAfter,
        fallback: true,
        _meta: {
          timestamp: new Date().toISOString(),
          action: 'ROUTE_TO_FALLBACK'
        }
      }
    }];
  }
  
  return [{
    json: {
      circuitOpen: false,
      state: status.state,
      probe: status.probe || false,
      fallback: false,
      _meta: {
        timestamp: new Date().toISOString(),
        action: 'PROCEED'
      }
    }
  }];
}

async function handleRecordSuccess(breaker) {
  const result = await breaker.recordSuccess();
  return [{
    json: {
      recorded: true,
      circuitState: result.state,
      transition: result.transition || null
    }
  }];
}

async function handleRecordFailure(breaker, error) {
  const result = await breaker.recordFailure(error);
  return [{
    json: {
      recorded: true,
      circuitState: result.state,
      transition: result.transition || null,
      failures: result.failures
    }
  }];
}

class ProductionCircuitBreaker {
  constructor(redis, serviceName, config) {
    this.redis = redis;
    this.serviceName = serviceName;
    this.config = config;
    this.keys = {
      state: `${config.redisPrefix}:${serviceName}:state`,
      failures: `${config.redisPrefix}:${serviceName}:failures`,
      lastFailure: `${config.redisPrefix}:${serviceName}:last_failure`,
      halfOpenCount: `${config.redisPrefix}:${serviceName}:half_open_count`,
      successCount: `${config.redisPrefix}:${serviceName}:success_count`,
      events: `${config.redisPrefix}:${serviceName}:events`
    };
  }

  async check() {
    const state = await this.getState();
    const now = Date.now();

    switch (state.state) {
      case 'CLOSED':
        return { allowed: true, state: 'CLOSED' };
      
      case 'OPEN':
        const elapsed = now - state.lastFailure;
        if (elapsed >= this.config.recoveryTimeoutMs) {
          await this.transitionToHalfOpen();
          return { allowed: true, state: 'HALF_OPEN', probe: true };
        }
        return { 
          allowed: false, 
          state: 'OPEN', 
          retryAfter: this.config.recoveryTimeoutMs - elapsed 
        };
      
      case 'HALF_OPEN':
        if (state.halfOpenCount >= this.config.halfOpenMaxCalls) {
          return { allowed: false, state: 'HALF_OPEN', reason: 'Test limit reached' };
        }
        await this.redis.incr(this.keys.halfOpenCount);
        await this.redis.expire(this.keys.halfOpenCount, 300);
        return { allowed: true, state: 'HALF_OPEN', probe: true };
      
      default:
        // Unknown state - reset to closed
        await this.transitionToClosed();
        return { allowed: true, state: 'CLOSED' };
    }
  }

  async recordSuccess() {
    const state = await this.getState();
    
    // Add success event to sliding window
    await this.addEvent('success');
    
    if (state.state === 'HALF_OPEN') {
      const newSuccessCount = state.successCount + 1;
      await this.redis.set(this.keys.successCount, newSuccessCount.toString(), 'EX', 300);
      
      if (newSuccessCount >= this.config.successThreshold) {
        await this.transitionToClosed();
        return { state: 'CLOSED', transition: 'HALF_OPEN→CLOSED' };
      }
      return { state: 'HALF_OPEN', successCount: newSuccessCount };
    }
    
    // Reset failures in CLOSED state
    if (state.failures > 0) {
      await this.redis.set(this.keys.failures, '0', 'EX', 300);
    }
    
    return { state: state.state };
  }

  async recordFailure(error) {
    const state = await this.getState();
    
    // Add failure event to sliding window
    await this.addEvent('failure');
    
    if (state.state === 'HALF_OPEN') {
      await this.transitionToOpen();
      return { state: 'OPEN', transition: 'HALF_OPEN→OPEN' };
    }

    // Get failures from sliding window for more accuracy
    const stats = await this.getSlidingWindowStats();
    
    if (stats.failures >= this.config.failureThreshold) {
      await this.transitionToOpen();
      return { state: 'OPEN', transition: 'CLOSED→OPEN', failures: stats.failures };
    }
    
    return { state: 'CLOSED', failures: stats.failures };
  }

  async getState() {
    const [state, failures, lastFailure, halfOpenCount, successCount] = 
      await this.redis.mget(
        this.keys.state,
        this.keys.failures,
        this.keys.lastFailure,
        this.keys.halfOpenCount,
        this.keys.successCount
      );
    
    return {
      state: state || 'CLOSED',
      failures: parseInt(failures || '0'),
      lastFailure: lastFailure ? parseInt(lastFailure) : null,
      halfOpenCount: parseInt(halfOpenCount || '0'),
      successCount: parseInt(successCount || '0')
    };
  }

  async transitionToOpen() {
    const now = Date.now();
    await Promise.all([
      this.redis.set(this.keys.state, 'OPEN', 'EX', 300),
      this.redis.set(this.keys.lastFailure, now.toString(), 'EX', 300),
      this.redis.del(this.keys.halfOpenCount),
      this.redis.del(this.keys.successCount)
    ]);
    await this.logTransition('OPEN');
  }

  async transitionToHalfOpen() {
    await Promise.all([
      this.redis.set(this.keys.state, 'HALF_OPEN', 'EX', 300),
      this.redis.set(this.keys.halfOpenCount, '0', 'EX', 300),
      this.redis.set(this.keys.successCount, '0', 'EX', 300)
    ]);
    await this.logTransition('HALF_OPEN');
  }

  async transitionToClosed() {
    await Promise.all([
      this.redis.set(this.keys.state, 'CLOSED', 'EX', 300),
      this.redis.set(this.keys.failures, '0', 'EX', 300),
      this.redis.del(this.keys.halfOpenCount),
      this.redis.del(this.keys.successCount)
    ]);
    await this.logTransition('CLOSED');
  }

  async addEvent(type) {
    const now = Date.now();
    const member = `${type}:${now}:${Math.random().toString(36).substr(2, 9)}`;
    await this.redis.zadd(this.keys.events, now, member);
    await this.redis.expire(this.keys.events, Math.ceil(this.config.slidingWindowMs / 1000));
    
    // Cleanup old events
    const cutoff = now - this.config.slidingWindowMs;
    await this.redis.zremrangebyscore(this.keys.events, 0, cutoff);
  }

  async getSlidingWindowStats() {
    const cutoff = Date.now() - this.config.slidingWindowMs;
    await this.redis.zremrangebyscore(this.keys.events, 0, cutoff);
    
    const events = await this.redis.zrange(this.keys.events, 0, -1);
    const successes = events.filter(e => e.startsWith('success')).length;
    const failures = events.filter(e => e.startsWith('failure')).length;
    
    return { successes, failures, total: events.length };
  }

  async logTransition(newState) {
    console.log(`[CircuitBreaker:${this.serviceName}] Transitioned to ${newState} at ${new Date().toISOString()}`);
    // Could also write to monitoring system
  }
}

// Execute and return result
return await circuitBreakerNode();
```

### 6.2 Workflow Integration Example

```javascript
// workflow-with-circuit-breaker.json (excerpt)
{
  "nodes": [
    {
      "name": "Check Circuit State",
      "type": "n8n-nodes-base.code",
      "parameters": {
        "jsCode": "// Load circuit breaker module\nconst { ProductionCircuitBreaker } = require('./circuit-breaker-module');\n\nconst breaker = new ProductionCircuitBreaker(\n  await getRedisConnection(),\n  'twenty-crm',\n  { failureThreshold: 5, recoveryTimeoutMs: 60000 }\n);\n\nconst status = await breaker.check();\nreturn [{ json: status }];"
      }
    },
    {
      "name": "Route Decision",
      "type": "n8n-nodes-base.if",
      "parameters": {
        "conditions": {
          "options": {
            "caseSensitive": true,
            "leftValue": "={{ $json.allowed }}",
            "operator": {
              "type": "boolean",
              "operation": "equals"
            },
            "rightValue": true
          }
        }
      }
    },
    {
      "name": "Create Person",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "method": "POST",
        "url": "={{ $env.TWENTY_CRM_URL }}/rest/people",
        "options": {
          "timeout": 30000
        }
      },
      "continueOnFail": true
    },
    {
      "name": "Handle Success",
      "type": "n8n-nodes-base.code",
      "parameters": {
        "jsCode": "// Record success\nawait breaker.recordSuccess();\nreturn [{ json: { success: true, data: $input.first().json } }];"
      }
    },
    {
      "name": "Handle Failure",
      "type": "n8n-nodes-base.code",
      "parameters": {
        "jsCode": "// Record failure\nconst error = $input.first().error;\nawait breaker.recordFailure(error);\nreturn [{ json: { success: false, error: error.message } }];"
      }
    },
    {
      "name": "Fallback Storage",
      "type": "n8n-nodes-base.code",
      "parameters": {
        "jsCode": "// Store in fallback queue\nconst submission = $input.first().json;\nawait queueForRetry(submission);\nreturn [{ json: { queued: true } }];"
      }
    }
  ],
  "connections": {
    "Check Circuit State": {
      "main": [
        [{ "node": "Route Decision", "type": "main" }]
      ]
    },
    "Route Decision": {
      "main": [
        [{ "node": "Create Person", "type": "main" }],
        [{ "node": "Fallback Storage", "type": "main" }]
      ]
    },
    "Create Person": {
      "main": [
        [{ "node": "Handle Success", "type": "main" }]
      ],
      "error": [
        [{ "node": "Handle Failure", "type": "main" }]
      ]
    }
  }
}
```

### 6.3 Configuration Snippets

**Environment Variables:**
```bash
# Circuit Breaker Configuration
CIRCUIT_FAILURE_THRESHOLD=5
CIRCUIT_SUCCESS_THRESHOLD=3
CIRCUIT_RECOVERY_TIMEOUT_MS=60000
CIRCUIT_HALF_OPEN_MAX_CALLS=3
CIRCUIT_SLIDING_WINDOW_MS=60000

# Redis Configuration
REDIS_HOST=redis.example.com
REDIS_PORT=6379
REDIS_PASSWORD=secret
REDIS_DB=0
REDIS_TLS=true

# Twenty CRM Configuration
TWENTY_CRM_BASE_URL=https://crm.zaplit.com
TWENTY_CRM_API_KEY=sk_...
TWENTY_CRM_TIMEOUT_MS=30000
TWENTY_CRM_RATE_LIMIT=100

# Fallback Configuration
FALLBACK_QUEUE_ENABLED=true
FALLBACK_SHEETS_ENABLED=true
FALLBACK_DLQ_ENABLED=true
SHEETS_FALLBACK_ID=1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms
```

**n8n Credentials Setup:**
```javascript
// credentials/circuitBreakerRedis.json
{
  "name": "Circuit Breaker Redis",
  "type": "redis",
  "data": {
    "host": "={{ $env.REDIS_HOST }}",
    "port": "={{ $env.REDIS_PORT }}",
    "password": "={{ $env.REDIS_PASSWORD }}",
    "db": 0
  }
}
```

---

## 7. Testing Strategy

### 7.1 Unit Testing

```javascript
// circuit-breaker.test.js
const { describe, it, expect, beforeEach } = require('@jest/globals');
const { ProductionCircuitBreaker } = require('./circuit-breaker');
const Redis = require('ioredis-mock');

describe('CircuitBreaker', () => {
  let redis;
  let breaker;
  
  beforeEach(() => {
    redis = new Redis();
    breaker = new ProductionCircuitBreaker(redis, 'test-service', {
      failureThreshold: 3,
      successThreshold: 2,
      recoveryTimeoutMs: 1000,
      slidingWindowMs: 5000
    });
  });

  describe('CLOSED state', () => {
    it('should allow requests when closed', async () => {
      const status = await breaker.check();
      expect(status.allowed).toBe(true);
      expect(status.state).toBe('CLOSED');
    });

    it('should count failures and open after threshold', async () => {
      await breaker.recordFailure();
      await breaker.recordFailure();
      
      let status = await breaker.check();
      expect(status.state).toBe('CLOSED');
      
      await breaker.recordFailure(); // Third failure
      
      status = await breaker.check();
      expect(status.state).toBe('OPEN');
      expect(status.allowed).toBe(false);
    });

    it('should reset failures on success', async () => {
      await breaker.recordFailure();
      await breaker.recordFailure();
      await breaker.recordSuccess();
      
      const state = await breaker.getState();
      expect(state.failures).toBe(0);
    });
  });

  describe('OPEN state', () => {
    beforeEach(async () => {
      // Open the circuit
      await breaker.recordFailure();
      await breaker.recordFailure();
      await breaker.recordFailure();
    });

    it('should reject requests when open', async () => {
      const status = await breaker.check();
      expect(status.allowed).toBe(false);
      expect(status.state).toBe('OPEN');
    });

    it('should transition to HALF_OPEN after timeout', async () => {
      // Wait for recovery timeout
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      const status = await breaker.check();
      expect(status.state).toBe('HALF_OPEN');
      expect(status.allowed).toBe(true);
      expect(status.probe).toBe(true);
    });
  });

  describe('HALF_OPEN state', () => {
    beforeEach(async () => {
      await breaker.recordFailure();
      await breaker.recordFailure();
      await breaker.recordFailure();
      await new Promise(resolve => setTimeout(resolve, 1100));
    });

    it('should close after success threshold', async () => {
      await breaker.recordSuccess();
      await breaker.recordSuccess();
      
      const state = await breaker.getState();
      expect(state.state).toBe('CLOSED');
    });

    it('should reopen on failure', async () => {
      await breaker.recordFailure();
      
      const status = await breaker.check();
      expect(status.state).toBe('OPEN');
      expect(status.allowed).toBe(false);
    });
  });
});
```

### 7.2 Integration Testing

```javascript
// integration.test.js
describe('Circuit Breaker Integration', () => {
  it('should protect against retry storms during outage', async () => {
    // Simulate failing service
    let requestCount = 0;
    const failingService = () => {
      requestCount++;
      return Promise.reject(new Error('Service unavailable'));
    };

    // Fire multiple concurrent requests
    const requests = Array(20).fill(null).map(() => 
      breaker.execute(failingService).catch(() => null)
    );

    await Promise.all(requests);

    // Should have stopped after threshold
    expect(requestCount).toBeLessThanOrEqual(5); // threshold + small buffer
  });

  it('should recover automatically when service heals', async () => {
    let shouldFail = true;
    const flakyService = () => {
      if (shouldFail) {
        return Promise.reject(new Error('Still down'));
      }
      return Promise.resolve({ success: true });
    };

    // Open the circuit
    for (let i = 0; i < 5; i++) {
      await breaker.execute(flakyService).catch(() => {});
    }

    // Verify circuit is open
    let status = await breaker.check();
    expect(status.state).toBe('OPEN');

    // Wait for recovery timeout
    await sleep(1100);
    
    // Service heals
    shouldFail = false;

    // Circuit should probe and close
    await breaker.execute(flakyService);
    await breaker.execute(flakyService);
    await breaker.execute(flakyService);

    status = await breaker.check();
    expect(status.state).toBe('CLOSED');
  });
});
```

### 7.3 Load Testing

```javascript
// load-test.js
const autocannon = require('autocannon');

async function runLoadTest() {
  const result = await autocannon({
    url: 'https://n8n.zaplit.com/webhook/consultation',
    connections: 100,
    duration: 60,
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      data: {
        name: 'Load Test User',
        email: 'loadtest@example.com',
        company: 'Load Test Corp'
      }
    })
  });

  console.log('Load Test Results:');
  console.log(`- Total Requests: ${result.requests.total}`);
  console.log(`- Average Latency: ${result.latency.average}ms`);
  console.log(`- Error Rate: ${(result.errors / result.requests.total * 100).toFixed(2)}%`);
  console.log(`- 2xx Responses: ${result['2xx']}`);
  console.log(`- 5xx Responses: ${result['5xx']}`);
  console.log(`- Timeouts: ${result.timeouts}`);
}
```

### 7.4 Chaos Testing

```javascript
// chaos-test.js
class ChaosMonkey {
  constructor(circuitBreaker) {
    this.breaker = circuitBreaker;
    this.scenarios = [
      { name: 'Random Failures', failureRate: 0.5 },
      { name: 'Complete Outage', failureRate: 1.0 },
      { name: 'Intermittent', failureRate: 0.3 },
      { name: 'Recovery', failureRate: 0, healing: true }
    ];
  }

  async runScenario(scenario, durationMs) {
    console.log(`Running scenario: ${scenario.name}`);
    const startTime = Date.now();
    let requests = 0;
    let successes = 0;
    let failures = 0;
    let circuitOpens = 0;

    while (Date.now() - startTime < durationMs) {
      const shouldFail = Math.random() < scenario.failureRate;
      
      try {
        await this.breaker.execute(async () => {
          if (shouldFail) {
            throw new Error('Chaos injected failure');
          }
          return { success: true };
        });
        successes++;
      } catch (error) {
        if (error.message.includes('Circuit')) {
          circuitOpens++;
        }
        failures++;
      }
      
      requests++;
      await sleep(100);
    }

    return {
      scenario: scenario.name,
      requests,
      successes,
      failures,
      circuitOpens,
      successRate: (successes / requests * 100).toFixed(2) + '%'
    };
  }

  async runAllScenarios() {
    const results = [];
    
    for (const scenario of this.scenarios) {
      const result = await this.runScenario(scenario, 30000);
      results.push(result);
      console.log(result);
      
      // Cool down between scenarios
      await sleep(5000);
    }

    return results;
  }
}
```

### 7.5 Testing Checklist

- [ ] **Unit Tests**
  - [ ] State transitions (CLOSED → OPEN → HALF_OPEN → CLOSED)
  - [ ] Failure threshold counting
  - [ ] Success threshold for closing
  - [ ] Recovery timeout behavior
  - [ ] Sliding window accuracy

- [ ] **Integration Tests**
  - [ ] End-to-end workflow with circuit breaker
  - [ ] Redis connectivity and failover
  - [ ] Fallback storage activation
  - [ ] Recovery workflow processing

- [ ] **Load Tests**
  - [ ] 100+ concurrent requests
  - [ ] Circuit opens under load
  - [ ] No retry storms observed
  - [ ] Recovery under sustained load

- [ ] **Chaos Tests**
  - [ ] Random failures
  - [ ] Complete outage
  - [ ] Intermittent failures
  - [ ] Slow responses
  - [ ] Recovery scenarios

---

## 8. Monitoring and Alerting

### 8.1 Key Metrics

| Metric | Description | Alert Threshold |
|--------|-------------|-----------------|
| `circuit_state` | Current state (0=closed, 1=half-open, 2=open) | > 0 for > 5 min |
| `circuit_failures` | Failures in current window | > 3 in 1 min |
| `circuit_opens` | Number of times circuit opened | > 5 in 1 hour |
| `circuit_recovery_time` | Time from open to closed | > 10 min |
| `fallback_invocations` | Times fallback was used | Any increase |
| `queue_depth` | Items waiting for retry | > 100 |
| `retry_success_rate` | % of retries that succeed | < 50% |

### 8.2 Grafana Dashboard

```json
{
  "dashboard": {
    "title": "Circuit Breaker - Twenty CRM",
    "panels": [
      {
        "title": "Circuit State",
        "type": "stat",
        "targets": [{
          "expr": "circuit_state{service=\"twenty-crm\"}"
        }],
        "fieldConfig": {
          "mappings": [
            { "value": 0, "text": "CLOSED" },
            { "value": 1, "text": "HALF-OPEN" },
            { "value": 2, "text": "OPEN" }
          ],
          "thresholds": {
            "steps": [
              { "color": "green", "value": 0 },
              { "color": "yellow", "value": 1 },
              { "color": "red", "value": 2 }
            ]
          }
        }
      },
      {
        "title": "Failure Rate",
        "type": "graph",
        "targets": [{
          "expr": "rate(circuit_failures_total{service=\"twenty-crm\"}[5m])"
        }]
      },
      {
        "title": "Queue Depth",
        "type": "graph",
        "targets": [{
          "expr": "circuit_queue_depth{service=\"twenty-crm\"}"
        }]
      }
    ]
  }
}
```

### 8.3 Alerting Rules

```yaml
# prometheus-alerts.yaml
groups:
  - name: circuit-breaker
    rules:
      - alert: CircuitBreakerOpen
        expr: circuit_state{service="twenty-crm"} == 2
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Circuit breaker is open for Twenty CRM"
          description: "Circuit has been open for more than 5 minutes"

      - alert: CircuitBreakerFrequentOpens
        expr: increase(circuit_opens_total{service="twenty-crm"}[1h]) > 5
        labels:
          severity: critical
        annotations:
          summary: "Frequent circuit breaker trips"
          description: "Circuit has opened {{ $value }} times in the last hour"

      - alert: HighRetryQueueDepth
        expr: circuit_queue_depth{service="twenty-crm"} > 100
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "High retry queue depth"
          description: "{{ $value }} items waiting in retry queue"

      - alert: LowRetrySuccessRate
        expr: |
          (
            rate(circuit_retry_success_total[5m])
            /
            rate(circuit_retry_total[5m])
          ) < 0.5
        for: 15m
        labels:
          severity: warning
        annotations:
          summary: "Low retry success rate"
          description: "Less than 50% of retries are succeeding"
```

---

## 9. Deployment Guide

### 9.1 Prerequisites

- Redis 6.0+ (cluster mode recommended for production)
- n8n 1.0+ with Code node enabled
- Twenty CRM API credentials configured

### 9.2 Deployment Steps

1. **Deploy Redis** (if not already available)
   ```bash
   docker run -d --name redis-circuit-breaker \
     -p 6379:6379 \
     redis:7-alpine \
     redis-server --appendonly yes
   ```

2. **Configure n8n Environment**
   ```bash
   # Add to .env or docker-compose.yml
   CIRCUIT_REDIS_HOST=redis.example.com
   CIRCUIT_REDIS_PORT=6379
   CIRCUIT_REDIS_PASSWORD=your-password
   ```

3. **Import Circuit Breaker Module**
   - Upload `circuit-breaker-module.js` to n8n
   - Configure as Custom Node or use in Code nodes

4. **Update Workflows**
   - Add "Check Circuit State" node before CRM calls
   - Add error handling nodes for fallback
   - Test in non-production environment

5. **Enable Monitoring**
   - Import Grafana dashboard
   - Configure Prometheus alerts
   - Set up notification channels

### 9.3 Rollback Procedure

```bash
#!/bin/bash
# rollback-circuit-breaker.sh

echo "Rolling back circuit breaker..."

# 1. Disable circuit breaker in workflows
# 2. Clear Redis circuit state
redis-cli DEL circuit:twenty:state
redis-cli DEL circuit:twenty:failures
redis-cli DEL circuit:twenty:last_failure

# 3. Process any queued items manually
node process-queue.js

echo "Rollback complete"
```

---

## 10. Conclusion

### Summary of Recommendations

1. **Use Redis-backed Circuit Breaker** for production environments requiring high availability and distributed state

2. **Configure Conservative Thresholds** initially:
   - Failure threshold: 5
   - Recovery timeout: 60 seconds
   - Success threshold: 3

3. **Implement Multiple Fallback Layers**:
   - Queue for automatic retry
   - Google Sheets for visibility
   - DLQ for manual recovery

4. **Monitor Key Metrics**:
   - Circuit state changes
   - Queue depth
   - Retry success rate

5. **Test Thoroughly**:
   - Unit tests for state machine
   - Integration tests for fallback
   - Load tests for retry storm prevention
   - Chaos tests for recovery

### Next Steps

1. Review and approve implementation approach
2. Set up Redis infrastructure
3. Implement circuit breaker module
4. Create workflow integration
5. Deploy to staging and test
6. Production rollout with monitoring

---

**Document Version:** 1.0  
**Last Updated:** March 19, 2026  
**Author:** Principal Engineer  
**Review Status:** Ready for Implementation
