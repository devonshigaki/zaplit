# Circuit Breaker Implementation

Production-ready Circuit Breaker pattern implementation for n8n + Twenty CRM integration.

## Overview

This implementation provides a Redis-backed circuit breaker that prevents cascade failures when the Twenty CRM API becomes unavailable. It supports distributed deployments across multiple n8n instances.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     CIRCUIT BREAKER ARCHITECTURE                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   n8n Workflows                                                 │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐        │
│   │ Instance 1  │    │ Instance 2  │    │ Instance N  │        │
│   └──────┬──────┘    └──────┬──────┘    └──────┬──────┘        │
│          │                  │                  │                │
│          └──────────────────┼──────────────────┘                │
│                             │                                   │
│                             ▼                                   │
│                  ┌─────────────────┐                           │
│                  │  Redis Cluster  │  (Shared State)           │
│                  │                 │                           │
│                  │ • circuit:state │  CLOSED | OPEN | HALF_OPEN│
│                  │ • failures      │  Failure counter          │
│                  │ • last_failure  │  Timestamp                │
│                  │ • events        │  Sliding window           │
│                  └────────┬────────┘                           │
│                           │                                     │
│                           ▼                                     │
│                  ┌─────────────────┐                           │
│                  │  Twenty CRM API │                           │
│                  └─────────────────┘                           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## File Structure

```
├── scripts-ts/src/lib/
│   ├── circuit-breaker.ts    # Main CircuitBreaker class
│   └── redis.ts              # Redis client wrapper
├── scripts-ts/src/tests/
│   └── circuit-breaker.test.ts  # Test suite
├── scripts/
│   └── deploy-circuit-breaker.sh # Deployment script
├── n8n-circuit-breaker-node.js   # n8n Code Node implementation
└── CIRCUIT_BREAKER_IMPLEMENTATION.md  # This file
```

## States

| State | Description | Behavior |
|-------|-------------|----------|
| **CLOSED** | Normal operation | Requests pass through to service |
| **OPEN** | Failing fast | Requests rejected immediately |
| **HALF_OPEN** | Testing recovery | Limited test requests allowed |

## State Transitions

```
CLOSED ──(failures ≥ threshold)──► OPEN
  ▲                                │
  │                                │
  │(successes ≥ threshold)         │(recovery timeout)
  │                                │
  └─── HALF_OPEN ◄─────────────────┘
```

## Configuration

### Environment Variables

```bash
# Circuit Breaker Configuration
CIRCUIT_FAILURE_THRESHOLD=5        # Failures before opening
CIRCUIT_SUCCESS_THRESHOLD=3        # Successes to close from half-open
CIRCUIT_RECOVERY_TIMEOUT_MS=60000  # Time before recovery attempt
CIRCUIT_HALF_OPEN_MAX_CALLS=3      # Max test calls in half-open
CIRCUIT_SLIDING_WINDOW_MS=60000    # Monitoring window size
CIRCUIT_REQUEST_TIMEOUT_MS=30000   # Request timeout
CIRCUIT_DEBUG=false                # Enable debug logging

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_DB=0
REDIS_KEY_PREFIX=circuit:twenty
```

### Default Values

| Parameter | Default | Description |
|-----------|---------|-------------|
| `failureThreshold` | 5 | Number of failures before opening circuit |
| `successThreshold` | 3 | Successes needed to close from half-open |
| `recoveryTimeout` | 60s | Time before attempting recovery |
| `halfOpenMaxCalls` | 3 | Maximum test calls in half-open state |
| `monitoringPeriod` | 60s | Sliding window for failure counting |
| `requestTimeout` | 30s | Maximum request duration |

## Usage

### TypeScript/JavaScript

```typescript
import { CircuitBreaker, CircuitBreakerState } from './lib/circuit-breaker';
import { CircuitBreakerRedisClient } from './lib/redis';

// Create Redis client
const redisClient = new CircuitBreakerRedisClient(redis, {
  keyPrefix: 'circuit:twenty'
});

// Create circuit breaker
const breaker = new CircuitBreaker({
  name: 'twenty-crm',
  failureThreshold: 5,
  recoveryTimeout: 60000,
  successThreshold: 3,
  halfOpenMaxCalls: 3,
  monitoringPeriod: 60000,
  redis: redisClient,
});

// Initialize
await breaker.initialize();

// Execute with circuit breaker protection
const result = await breaker.execute(
  async () => {
    // Your CRM call here
    return await crmClient.createPerson(data);
  },
  async () => {
    // Optional fallback
    return await queueForRetry(data);
  }
);

if (result.success) {
  console.log('Success:', result.data);
} else if (result.fallbackUsed) {
  console.log('Fallback used:', result.data);
} else {
  console.error('Failed:', result.error);
}
```

### n8n Code Node

Copy the contents of `n8n-circuit-breaker-node.js` into an n8n Code Node.

**Check Circuit State:**
```javascript
const operation = 'check';
// Returns: { allowed, state, circuitOpen, fallback }
```

**Record Success:**
```javascript
const operation = 'record_success';
// Returns: { recorded, state, transition }
```

**Record Failure:**
```javascript
const operation = 'record_failure';
// Returns: { recorded, state, transition, failures }
```

## Deployment

### Quick Start

```bash
# Deploy circuit breaker
./scripts/deploy-circuit-breaker.sh local

# Deploy to staging
./scripts/deploy-circuit-breaker.sh staging

# Deploy to production
./scripts/deploy-circuit-breaker.sh production
```

### Manual Deployment

1. **Install Redis** (if not already installed):
   ```bash
   # Ubuntu/Debian
   sudo apt-get install redis-server
   
   # macOS
   brew install redis
   brew services start redis
   ```

2. **Configure n8n**:
   - Add Redis credentials in n8n
   - Copy circuit breaker code to Code nodes
   - Configure workflow routing based on circuit state

3. **Run Tests**:
   ```bash
   cd scripts-ts
   npm run test:circuit-breaker
   ```

## Testing

### Unit Tests

```bash
cd scripts-ts
npm run test:circuit-breaker
```

Tests cover:
- State transitions (CLOSED → OPEN → HALF_OPEN → CLOSED)
- Failure threshold counting
- Success threshold for closing
- Recovery timeout behavior
- Sliding window accuracy
- Concurrent request handling

### Load Tests

The test suite includes:
- 100+ concurrent requests
- Retry storm prevention
- Performance benchmarks

### Manual Testing

```bash
# Check circuit status
./scripts/monitor-circuit-breaker.sh

# Trigger failures (to test opening)
for i in {1..5}; do
  curl -X POST "$N8N_WEBHOOK_URL/webhook/test" -d '{}'
done

# Check circuit opened
./scripts/monitor-circuit-breaker.sh
```

## Monitoring

### Key Metrics

| Metric | Description | Alert Threshold |
|--------|-------------|-----------------|
| `circuit_state` | Current state (0=closed, 1=half-open, 2=open) | > 0 for > 5 min |
| `circuit_failures` | Failures in current window | > 3 in 1 min |
| `circuit_opens` | Number of times circuit opened | > 5 in 1 hour |
| `queue_depth` | Items waiting for retry | > 100 |

### Monitoring Script

```bash
./scripts/monitor-circuit-breaker.sh
```

Output:
```
Circuit Breaker Status - 2026-03-19T11:51:12Z
================================

Current State:
CLOSED

Failure Count:
0

Last Failure:
Never

Half-Open Count:
0

Success Count (Half-Open):
0

Retry Queue Length:
0
```

## Integration with n8n Workflows

### Recommended Workflow Structure

```
Webhook Trigger
     │
     ▼
Validate Input
     │
     ▼
Check Circuit State (Code Node)
     │
     ├──► Circuit Open ──► Fallback Storage
     │
     └──► Circuit Closed ──► Create Person (HTTP Request)
                                │
                                ├──► Success ──► Record Success ──► Done
                                │
                                └──► Error ──► Record Failure ──► Retry Logic
```

### Error Handling

| HTTP Code | Circuit Action | Retry Strategy |
|-----------|---------------|----------------|
| 429 | Count toward threshold | Exponential backoff |
| 500-504 | Count toward threshold | 3 retries with backoff |
| 401/403 | Open circuit immediately | No retry, alert admin |
| 400/404 | Don't count | No retry, log error |

## Troubleshooting

### Circuit Not Opening

- Check `failureThreshold` configuration
- Verify Redis connection
- Check sliding window stats

### Circuit Not Closing

- Verify `successThreshold` is being reached
- Check recovery timeout hasn't expired
- Ensure `recordSuccess()` is called after successful requests

### Redis Connection Issues

```bash
# Test Redis connection
redis-cli ping

# Check circuit breaker keys
redis-cli KEYS "circuit:twenty:*"

# Monitor Redis commands
redis-cli MONITOR
```

## Security Considerations

1. **Redis Security**:
   - Use Redis AUTH password in production
   - Enable TLS for Redis connections
   - Restrict Redis network access

2. **n8n Credentials**:
   - Store Redis credentials in n8n, not in code
   - Use environment variables for configuration

3. **Data Privacy**:
   - Circuit breaker state doesn't contain PII
   - Fallback queues should sanitize data before logging

## References

- [Circuit Breaker Pattern - Martin Fowler](https://martinfowler.com/bliki/CircuitBreaker.html)
- [Microsoft Cloud Design Patterns](https://docs.microsoft.com/en-us/azure/architecture/patterns/circuit-breaker)
- [PHASE2_CIRCUIT_BREAKER_RESEARCH.md](./PHASE2_CIRCUIT_BREAKER_RESEARCH.md)

## License

MIT - See LICENSE file for details
