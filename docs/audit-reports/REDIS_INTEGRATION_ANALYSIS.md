# Redis Integration Analysis for Zaplit Monorepo

## Executive Summary

This document provides a comprehensive analysis of Redis integration requirements for the Zaplit monorepo, focusing on replacing the current in-memory rate limiting implementation with a distributed Redis-based solution suitable for multi-instance deployments.

---

## 1. Current Rate Limiting Analysis

### 1.1 Implementation Location
**File:** `zaplit-com/app/api/submit-form/route.ts` (lines 24-29, 273-293)

```typescript
/**
 * In-memory rate limit store
 * 
 * @deprecated Use Redis in production for multi-instance deployments
 * This Map-based implementation works for single-instance deployments only.
 */
const rateLimit = new Map<string, { count: number; resetTime: number }>();
```

### 1.2 Current Rate Limit Configuration
**File:** `zaplit-com/lib/constants.ts` (lines 31-40)

```typescript
export const RATE_LIMITS = {
  /** Maximum requests allowed per window */
  MAX_REQUESTS_PER_WINDOW: 5,
  
  /** Time window in milliseconds (1 minute) */
  WINDOW_MS: 60 * 1000,
  
  /** Retry-After header value in seconds */
  RETRY_AFTER_SECONDS: 60,
} as const;
```

### 1.3 Current Rate Limiting Logic
```typescript
// Rate limiting
const clientData = rateLimit.get(ip);
if (clientData && now < clientData.resetTime) {
  if (clientData.count >= RATE_LIMITS.MAX_REQUESTS_PER_WINDOW) {
    logAudit({
      action: "RATE_LIMITED",
      formType: "unknown",
      emailHash: "",
      ipHash,
      success: false,
      error: "Rate limit exceeded",
    });
    return NextResponse.json(
      { error: "Rate limit exceeded. Please try again later." },
      { status: 429, headers: { "Retry-After": String(RATE_LIMITS.RETRY_AFTER_SECONDS) } }
    );
  }
  clientData.count++;
} else {
  rateLimit.set(ip, { count: 1, resetTime: now + RATE_LIMITS.WINDOW_MS });
}
```

### 1.4 Issues with Current Implementation

| Issue | Impact | Severity |
|-------|--------|----------|
| **Single-instance limitation** | Rate limits don't work across multiple Cloud Run instances | High |
| **Memory leak potential** | Map grows unbounded as new IPs are added | Medium |
| **No persistence** | Rate limit state lost on instance restart | Medium |
| **Fixed window algorithm** | Allows burst attacks at window boundaries | Medium |
| **No distributed coordination** | Users can exceed limits by hitting different instances | High |

### 1.5 Affected Files
Both `zaplit-com` and `zaplit-org` have identical rate limiting implementations:
- `zaplit-com/app/api/submit-form/route.ts`
- `zaplit-org/app/api/submit-form/route.ts`

---

## 2. Redis Architecture Design

### 2.1 Architecture Overview

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Cloud Run     │     │   Cloud Run     │     │   Cloud Run     │
│   Instance 1    │     │   Instance 2    │     │   Instance N    │
│                 │     │                 │     │                 │
│ ┌─────────────┐ │     │ ┌─────────────┐ │     │ ┌─────────────┐ │
│ │   Next.js   │ │     │ │   Next.js   │ │     │ │   Next.js   │
│ │   API Route │ │     │ │   API Route │ │     │ │   API Route │ │
│ └──────┬──────┘ │     │ └──────┬──────┘ │     │ └──────┬──────┘ │
│        │        │     │        │        │     │        │        │
│ ┌──────▼──────┐ │     │ ┌──────▼──────┐ │     │ ┌──────▼──────┐ │
│ │ Redis Client│ │     │ │ Redis Client│ │     │ │ Redis Client│ │
│ │  (Singleton)│ │     │ │  (Singleton)│ │     │ │  (Singleton)│ │
│ └──────┬──────┘ │     │ └──────┬──────┘ │     │ └──────┬──────┘ │
└────────┼───────┘     └────────┼───────┘     └────────┼───────┘
         │                      │                      │
         └──────────────────────┼──────────────────────┘
                                │
                    ┌───────────▼───────────┐
                    │    Memorystore Redis  │
                    │    (GCP Managed)      │
                    │                       │
                    │  ┌─────────────────┐  │
                    │  │  rate:zaplit:   │  │
                    │  │  com:submit:    │  │
                    │  │  ip:<hash>      │  │
                    │  └─────────────────┘  │
                    │  ┌─────────────────┐  │
                    │  │  rate:zaplit:   │  │
                    │  │  org:submit:    │  │
                    │  │  ip:<hash>      │  │
                    │  └─────────────────┘  │
                    └───────────────────────┘
```

### 2.2 Key Naming Convention

Format: `{environment}:{service}:{type}:{identifier}`

| Component | Description | Example |
|-----------|-------------|---------|
| `environment` | Deployment environment | `prod`, `staging`, `dev` |
| `service` | Application service | `zaplit-com`, `zaplit-org` |
| `type` | Rate limit type | `submit` (form submission) |
| `identifier` | Unique client identifier | `ip:<hash>`, `user:<id>` |

**Examples:**
- `prod:zaplit-com:submit:ip:a1b2c3d4e5f6`
- `prod:zaplit-org:submit:ip:a1b2c3d4e5f6`
- `staging:zaplit-com:submit:ip:a1b2c3d4e5f6`

### 2.3 Sliding Window Algorithm with Lua Script

The sliding window algorithm provides better protection against burst attacks compared to fixed window:

```lua
-- sliding_window_ratelimit.lua
-- KEYS[1]: The rate limit key
-- ARGV[1]: Current timestamp in milliseconds
-- ARGV[2]: Window size in milliseconds
-- ARGV[3]: Maximum requests allowed in window

local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local maxRequests = tonumber(ARGV[3])
local windowStart = now - window

-- Remove entries outside the current window
redis.call('ZREMRANGEBYSCORE', key, 0, windowStart)

-- Count entries in current window
local currentCount = redis.call('ZCARD', key)

-- Check if limit exceeded
if currentCount >= maxRequests then
    -- Get oldest entry for retry-after calculation
    local oldestEntry = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
    local retryAfter = math.ceil((tonumber(oldestEntry[2]) + window - now) / 1000)
    return {0, retryAfter, currentCount}
end

-- Add current request
redis.call('ZADD', key, now, now .. ':' .. redis.call('INCR', key .. ':seq'))

-- Set expiration on key
redis.call('EXPIRE', key, math.ceil(window / 1000) + 1)

return {1, 0, currentCount + 1}
```

### 2.4 TTL and Expiration Strategy

| Aspect | Configuration | Rationale |
|--------|--------------|-----------|
| **Key TTL** | `window_ms / 1000 + 1` seconds | Ensure keys expire after window + buffer |
| **Passive expiration** | Redis handles automatically | No manual cleanup needed |
| **Active expiration** | Not required | Sliding window naturally cleans old entries |
| **Memory optimization** | Redis LRU eviction | Configure maxmemory-policy |

---

## 3. Implementation Plan

### 3.1 File Structure

```
zaplit-com/
├── lib/
│   ├── redis/
│   │   ├── client.ts          # Redis client singleton
│   │   ├── rate-limiter.ts    # Rate limiting logic
│   │   └── rate-limiter.test.ts  # Unit tests
│   └── constants.ts           # Updated with Redis config

zaplit-org/
├── lib/
│   ├── redis/
│   │   ├── client.ts          # Redis client singleton
│   │   ├── rate-limiter.ts    # Rate limiting logic
│   │   └── rate-limiter.test.ts  # Unit tests
│   └── constants.ts           # Updated with Redis config
```

### 3.2 Implementation Files

#### 3.2.1 Redis Client (`lib/redis/client.ts`)

```typescript
/**
 * Redis Client Module
 * 
 * Provides a singleton Redis client with connection pooling,
 * error handling, and graceful fallback to in-memory store.
 */

import { Redis } from 'ioredis';

// Singleton instance
let redisClient: Redis | null = null;
let isRedisAvailable = false;

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
  tls?: boolean;
  connectTimeout?: number;
  maxRetriesPerRequest?: number;
}

/**
 * Get Redis configuration from environment
 */
function getRedisConfig(): RedisConfig | null {
  const host = process.env.REDIS_HOST;
  
  if (!host) {
    console.log('[Redis] REDIS_HOST not set, using in-memory fallback');
    return null;
  }

  return {
    host,
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0', 10),
    tls: process.env.REDIS_TLS === 'true',
    connectTimeout: 5000,
    maxRetriesPerRequest: 3,
  };
}

/**
 * Create a new Redis client
 */
function createRedisClient(config: RedisConfig): Redis {
  const client = new Redis({
    host: config.host,
    port: config.port,
    password: config.password,
    db: config.db,
    tls: config.tls ? {} : undefined,
    connectTimeout: config.connectTimeout,
    maxRetriesPerRequest: config.maxRetriesPerRequest,
    retryStrategy(times) {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
    enableReadyCheck: true,
    lazyConnect: true,
  });

  client.on('connect', () => {
    console.log('[Redis] Connected to Redis');
    isRedisAvailable = true;
  });

  client.on('error', (err) => {
    console.error('[Redis] Connection error:', err.message);
    isRedisAvailable = false;
  });

  client.on('close', () => {
    console.log('[Redis] Connection closed');
    isRedisAvailable = false;
  });

  return client;
}

/**
 * Get or create the singleton Redis client
 */
export async function getRedisClient(): Promise<Redis | null> {
  if (redisClient) {
    return isRedisAvailable ? redisClient : null;
  }

  const config = getRedisConfig();
  if (!config) {
    return null;
  }

  try {
    redisClient = createRedisClient(config);
    await redisClient.connect();
    return redisClient;
  } catch (error) {
    console.error('[Redis] Failed to connect:', error);
    isRedisAvailable = false;
    return null;
  }
}

/**
 * Check if Redis is available
 */
export function redisAvailable(): boolean {
  return isRedisAvailable && redisClient !== null;
}

/**
 * Close Redis connection (for cleanup in tests)
 */
export async function closeRedisConnection(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    isRedisAvailable = false;
  }
}

/**
 * Get Redis health status for health checks
 */
export async function getRedisHealth(): Promise<{
  status: 'healthy' | 'unhealthy' | 'disabled';
  latencyMs?: number;
  error?: string;
}> {
  const config = getRedisConfig();
  
  if (!config) {
    return { status: 'disabled' };
  }

  const client = await getRedisClient();
  if (!client) {
    return { status: 'unhealthy', error: 'Not connected' };
  }

  try {
    const start = Date.now();
    await client.ping();
    const latency = Date.now() - start;
    return { status: 'healthy', latencyMs: latency };
  } catch (error) {
    return { 
      status: 'unhealthy', 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}
```

#### 3.2.2 Rate Limiter (`lib/redis/rate-limiter.ts`)

```typescript
/**
 * Redis-based Rate Limiter
 * 
 * Provides distributed rate limiting with sliding window algorithm.
 * Falls back to in-memory store if Redis is unavailable.
 */

import { getRedisClient, redisAvailable, getRedisHealth } from './client';
import { RATE_LIMITS } from '@/lib/constants';

// In-memory fallback store
interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const memoryStore = new Map<string, RateLimitEntry>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  retryAfter?: number;
  limit: number;
  window: number;
  source: 'redis' | 'memory';
}

export interface RateLimitOptions {
  keyPrefix: string;
  identifier: string;
  maxRequests?: number;
  windowMs?: number;
}

// Lua script for atomic sliding window rate limiting
const SLIDING_WINDOW_SCRIPT = `
  local key = KEYS[1]
  local now = tonumber(ARGV[1])
  local window = tonumber(ARGV[2])
  local maxRequests = tonumber(ARGV[3])
  local windowStart = now - window
  
  redis.call('ZREMRANGEBYSCORE', key, 0, windowStart)
  local currentCount = redis.call('ZCARD', key)
  
  if currentCount >= maxRequests then
    local oldestEntry = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
    local retryAfter = math.ceil((tonumber(oldestEntry[2]) + window - now) / 1000)
    return {0, retryAfter, currentCount}
  end
  
  redis.call('ZADD', key, now, now .. ':' .. redis.call('INCR', key .. ':seq'))
  redis.call('EXPIRE', key, math.ceil(window / 1000) + 1)
  
  return {1, 0, currentCount + 1}
`;

let luaScriptSha: string | null = null;

/**
 * Load the Lua script into Redis
 */
async function loadLuaScript(): Promise<string | null> {
  const client = await getRedisClient();
  if (!client) return null;

  try {
    if (!luaScriptSha) {
      luaScriptSha = await client.script('LOAD', SLIDING_WINDOW_SCRIPT);
    }
    return luaScriptSha;
  } catch (error) {
    console.error('[RateLimiter] Failed to load Lua script:', error);
    return null;
  }
}

/**
 * Build the rate limit key
 */
function buildKey(prefix: string, identifier: string): string {
  const env = process.env.NODE_ENV === 'production' ? 'prod' : 'dev';
  const service = process.env.SERVICE_NAME || 'zaplit';
  return `rate:${env}:${service}:${prefix}:${identifier}`;
}

/**
 * Check rate limit using Redis (sliding window)
 */
async function checkRedisLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): Promise<RateLimitResult | null> {
  const client = await getRedisClient();
  if (!client) return null;

  try {
    const scriptSha = await loadLuaScript();
    const now = Date.now();

    let result: [number, number, number];

    if (scriptSha) {
      result = await client.evalsha(
        scriptSha,
        1,
        key,
        now,
        windowMs,
        maxRequests
      ) as [number, number, number];
    } else {
      // Fallback to direct EVAL
      result = await client.eval(
        SLIDING_WINDOW_SCRIPT,
        1,
        key,
        now,
        windowMs,
        maxRequests
      ) as [number, number, number];
    }

    const [allowed, retryAfter, currentCount] = result;
    const resetTime = now + windowMs;

    return {
      allowed: allowed === 1,
      remaining: Math.max(0, maxRequests - currentCount),
      resetTime,
      retryAfter: retryAfter > 0 ? retryAfter : undefined,
      limit: maxRequests,
      window: windowMs,
      source: 'redis',
    };
  } catch (error) {
    console.error('[RateLimiter] Redis error:', error);
    return null;
  }
}

/**
 * Check rate limit using in-memory store (fixed window fallback)
 */
function checkMemoryLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  const entry = memoryStore.get(key);

  if (entry && now < entry.resetTime) {
    if (entry.count >= maxRequests) {
      const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
      return {
        allowed: false,
        remaining: 0,
        resetTime: entry.resetTime,
        retryAfter,
        limit: maxRequests,
        window: windowMs,
        source: 'memory',
      };
    }
    entry.count++;
    return {
      allowed: true,
      remaining: maxRequests - entry.count,
      resetTime: entry.resetTime,
      limit: maxRequests,
      window: windowMs,
      source: 'memory',
    };
  }

  // New window
  const resetTime = now + windowMs;
  memoryStore.set(key, { count: 1, resetTime });
  return {
    allowed: true,
    remaining: maxRequests - 1,
    resetTime,
    limit: maxRequests,
    window: windowMs,
    source: 'memory',
  };
}

/**
 * Check if a request should be rate limited
 * 
 * @param options - Rate limit options
 * @returns Rate limit check result
 */
export async function checkLimit(options: RateLimitOptions): Promise<RateLimitResult> {
  const {
    keyPrefix,
    identifier,
    maxRequests = RATE_LIMITS.MAX_REQUESTS_PER_WINDOW,
    windowMs = RATE_LIMITS.WINDOW_MS,
  } = options;

  const key = buildKey(keyPrefix, identifier);

  // Try Redis first
  if (redisAvailable()) {
    const redisResult = await checkRedisLimit(key, maxRequests, windowMs);
    if (redisResult) {
      return redisResult;
    }
  }

  // Fallback to memory
  console.log('[RateLimiter] Using in-memory fallback for', key);
  return checkMemoryLimit(key, maxRequests, windowMs);
}

/**
 * Reset rate limit for an identifier (useful for testing)
 */
export async function resetLimit(
  keyPrefix: string,
  identifier: string
): Promise<void> {
  const key = buildKey(keyPrefix, identifier);

  // Clear Redis
  const client = await getRedisClient();
  if (client) {
    await client.del(key, `${key}:seq`);
  }

  // Clear memory
  memoryStore.delete(key);
}

/**
 * Get rate limiter health status
 */
export async function getRateLimiterHealth(): Promise<{
  redis: Awaited<ReturnType<typeof getRedisHealth>>;
  memoryStoreSize: number;
}> {
  return {
    redis: await getRedisHealth(),
    memoryStoreSize: memoryStore.size,
  };
}

// Cleanup old memory entries periodically (every 5 minutes)
if (typeof global !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of memoryStore.entries()) {
      if (now >= entry.resetTime) {
        memoryStore.delete(key);
      }
    }
  }, 5 * 60 * 1000);
}
```

#### 3.2.3 Updated Constants (`lib/constants.ts` additions)

```typescript
/**
 * Redis configuration
 */
export const REDIS_CONFIG = {
  /** Default connection timeout in milliseconds */
  CONNECT_TIMEOUT_MS: 5000,
  
  /** Maximum retries per request */
  MAX_RETRIES: 3,
  
  /** Retry delay base in milliseconds */
  RETRY_DELAY_MS: 50,
  
  /** Maximum retry delay in milliseconds */
  MAX_RETRY_DELAY_MS: 2000,
} as const;

/**
 * Rate limiting configuration (enhanced)
 */
export const RATE_LIMITS = {
  /** Maximum requests allowed per window */
  MAX_REQUESTS_PER_WINDOW: 5,
  
  /** Time window in milliseconds (1 minute) */
  WINDOW_MS: 60 * 1000,
  
  /** Retry-After header value in seconds */
  RETRY_AFTER_SECONDS: 60,
  
  /** Key prefix for form submissions */
  SUBMIT_FORM_KEY_PREFIX: 'submit',
} as const;
```

#### 3.2.4 Updated Submit Form Route (`app/api/submit-form/route.ts`)

Key changes to integrate rate limiter:

```typescript
// Add import at top
import { checkLimit } from '@/lib/redis/rate-limiter';

// Replace rate limiting section (lines 273-293)
export async function POST(request: NextRequest): Promise<NextResponse> {
  // Get IP from headers (Cloud Run/Cloudflare)
  const forwardedFor = request.headers.get("x-forwarded-for");
  const ip = forwardedFor
    ? forwardedFor.split(",").pop()?.trim() || "unknown"
    : request.headers.get("x-real-ip") || "unknown";
  const ipHash = hashIP(ip);
  const now = Date.now();
  const submissionId = crypto.randomUUID();

  // Rate limiting with Redis (falls back to memory)
  const rateLimitResult = await checkLimit({
    keyPrefix: RATE_LIMITS.SUBMIT_FORM_KEY_PREFIX,
    identifier: `ip:${ipHash}`,
    maxRequests: RATE_LIMITS.MAX_REQUESTS_PER_WINDOW,
    windowMs: RATE_LIMITS.WINDOW_MS,
  });

  if (!rateLimitResult.allowed) {
    logAudit({
      action: "RATE_LIMITED",
      formType: "unknown",
      emailHash: "",
      ipHash,
      success: false,
      error: "Rate limit exceeded",
      details: { 
        source: rateLimitResult.source,
        retryAfter: rateLimitResult.retryAfter 
      },
    });
    
    return NextResponse.json(
      { error: "Rate limit exceeded. Please try again later." },
      { 
        status: 429, 
        headers: { 
          "Retry-After": String(rateLimitResult.retryAfter || RATE_LIMITS.RETRY_AFTER_SECONDS),
          "X-RateLimit-Limit": String(rateLimitResult.limit),
          "X-RateLimit-Remaining": String(rateLimitResult.remaining),
          "X-RateLimit-Reset": String(Math.ceil(rateLimitResult.resetTime / 1000)),
          "X-RateLimit-Source": rateLimitResult.source,
        } 
      }
    );
  }

  // Continue with rest of handler...
  try {
    // ... rest of the existing code
```

#### 3.2.5 Updated Health Check (`app/api/health/route.ts`)

```typescript
import { NextResponse } from "next/server";
import { getRateLimiterHealth } from "@/lib/redis/rate-limiter";

/**
 * Health check endpoint for Cloud Run
 * Used by load balancers and monitoring systems
 */
export async function GET() {
  const rateLimiterHealth = await getRateLimiterHealth();
  
  const checks = {
    timestamp: new Date().toISOString(),
    status: "healthy",
    version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || "unknown",
    uptime: process.uptime(),
    checks: {
      memory: checkMemory(),
      environment: checkEnvironment(),
      rateLimiter: rateLimiterHealth,
    },
  };

  // Overall status is unhealthy if Redis is configured but unavailable
  const redisStatus = rateLimiterHealth.redis.status;
  if (redisStatus === 'unhealthy') {
    checks.status = 'degraded';
  }

  const statusCode = checks.status === 'healthy' ? 200 : 503;
  return NextResponse.json(checks, { status: statusCode });
}

// ... rest of existing code
```

---

## 4. Environment Configuration

### 4.1 Required Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `REDIS_HOST` | No | - | Redis server hostname |
| `REDIS_PORT` | No | 6379 | Redis server port |
| `REDIS_PASSWORD` | No | - | Redis authentication password |
| `REDIS_DB` | No | 0 | Redis database number |
| `REDIS_TLS` | No | false | Enable TLS connection |
| `SERVICE_NAME` | No | zaplit | Service identifier for key naming |

### 4.2 Updated `.env.example` Files

#### `zaplit-com/.env.example` and `zaplit-org/.env.example`:

```bash
# N8N Webhook Configuration
N8N_WEBHOOK_CONSULTATION=https://n8n.zaplit.com/webhook/consultation
N8N_WEBHOOK_CONTACT=https://n8n.zaplit.com/webhook/contact
N8N_WEBHOOK_NEWSLETTER=https://n8n.zaplit.com/webhook/newsletter
N8N_WEBHOOK_URL=https://n8n.zaplit.com/webhook/zaplit-form-submission
N8N_WEBHOOK_SECRET=your-webhook-secret-here

# IP Hashing Salt (generate a random string)
IP_HASH_SALT=your-random-salt-here

# Sentry Error Tracking
SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
NEXT_PUBLIC_SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
SENTRY_ORG=your-org
SENTRY_PROJECT=zaplit-com  # or zaplit-org

# Service Identifier (for Redis key naming)
SERVICE_NAME=zaplit-com  # or zaplit-org

# Optional: Redis for distributed rate limiting (production)
# When not set, falls back to in-memory rate limiting
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your-redis-password
REDIS_DB=0
REDIS_TLS=false

# Optional: Enable n8n mocking for local development
MOCK_N8N=true
```

### 4.3 Cloud Build Configuration Updates

Example `cloudbuild.yaml` additions for Redis secrets:

```yaml
# Add to secretEnv section
availableSecrets:
  secretManager:
    - versionName: projects/$PROJECT_ID/secrets/redis-host/versions/latest
      env: 'REDIS_HOST'
    - versionName: projects/$PROJECT_ID/secrets/redis-password/versions/latest
      env: 'REDIS_PASSWORD'

# Add to build args in deploy step
args:
  - '--set-env-vars'
  - 'REDIS_HOST=$$REDIS_HOST,REDIS_PORT=6379,REDIS_PASSWORD=$$REDIS_PASSWORD,REDIS_DB=0,SERVICE_NAME=zaplit-com'
```

### 4.4 Package.json Dependencies

Add to both `zaplit-com/package.json` and `zaplit-org/package.json`:

```json
{
  "dependencies": {
    "ioredis": "^5.3.2"
  },
  "devDependencies": {
    "@types/ioredis-mock": "^8.2.5",
    "ioredis-mock": "^8.9.0"
  }
}
```

---

## 5. Testing Strategy

### 5.1 Unit Tests (`lib/redis/rate-limiter.test.ts`)

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { 
  checkLimit, 
  resetLimit, 
  getRateLimiterHealth,
  type RateLimitResult 
} from './rate-limiter';
import { closeRedisConnection } from './client';

describe('Rate Limiter', () => {
  const TEST_PREFIX = 'test';
  const TEST_ID = 'test-client';

  beforeEach(async () => {
    await resetLimit(TEST_PREFIX, TEST_ID);
  });

  afterEach(async () => {
    await resetLimit(TEST_PREFIX, TEST_ID);
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await closeRedisConnection();
  });

  describe('checkLimit', () => {
    it('should allow requests within limit', async () => {
      const result = await checkLimit({
        keyPrefix: TEST_PREFIX,
        identifier: TEST_ID,
        maxRequests: 5,
        windowMs: 60000,
      });

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4);
      expect(result.limit).toBe(5);
    });

    it('should block requests exceeding limit', async () => {
      // Exhaust the limit
      for (let i = 0; i < 5; i++) {
        await checkLimit({
          keyPrefix: TEST_PREFIX,
          identifier: TEST_ID,
          maxRequests: 5,
          windowMs: 60000,
        });
      }

      const result = await checkLimit({
        keyPrefix: TEST_PREFIX,
        identifier: TEST_ID,
        maxRequests: 5,
        windowMs: 60000,
      });

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.retryAfter).toBeGreaterThan(0);
    });

    it('should use correct source in result', async () => {
      const result = await checkLimit({
        keyPrefix: TEST_PREFIX,
        identifier: TEST_ID,
      });

      expect(['redis', 'memory']).toContain(result.source);
    });

    it('should track remaining count correctly', async () => {
      const results: RateLimitResult[] = [];
      
      for (let i = 0; i < 3; i++) {
        const result = await checkLimit({
          keyPrefix: TEST_PREFIX,
          identifier: TEST_ID,
          maxRequests: 5,
          windowMs: 60000,
        });
        results.push(result);
      }

      expect(results[0].remaining).toBe(4);
      expect(results[1].remaining).toBe(3);
      expect(results[2].remaining).toBe(2);
    });

    it('should handle multiple identifiers independently', async () => {
      const id1 = 'client-1';
      const id2 = 'client-2';

      // Exhaust limit for client 1
      for (let i = 0; i < 5; i++) {
        await checkLimit({
          keyPrefix: TEST_PREFIX,
          identifier: id1,
          maxRequests: 5,
          windowMs: 60000,
        });
      }

      const result1 = await checkLimit({
        keyPrefix: TEST_PREFIX,
        identifier: id1,
        maxRequests: 5,
        windowMs: 60000,
      });

      const result2 = await checkLimit({
        keyPrefix: TEST_PREFIX,
        identifier: id2,
        maxRequests: 5,
        windowMs: 60000,
      });

      expect(result1.allowed).toBe(false);
      expect(result2.allowed).toBe(true);
    });
  });

  describe('resetLimit', () => {
    it('should reset rate limit counter', async () => {
      // Exhaust limit
      for (let i = 0; i < 5; i++) {
        await checkLimit({
          keyPrefix: TEST_PREFIX,
          identifier: TEST_ID,
          maxRequests: 5,
          windowMs: 60000,
        });
      }

      // Should be blocked
      const beforeReset = await checkLimit({
        keyPrefix: TEST_PREFIX,
        identifier: TEST_ID,
        maxRequests: 5,
        windowMs: 60000,
      });
      expect(beforeReset.allowed).toBe(false);

      // Reset
      await resetLimit(TEST_PREFIX, TEST_ID);

      // Should be allowed again
      const afterReset = await checkLimit({
        keyPrefix: TEST_PREFIX,
        identifier: TEST_ID,
        maxRequests: 5,
        windowMs: 60000,
      });
      expect(afterReset.allowed).toBe(true);
    });
  });

  describe('getRateLimiterHealth', () => {
    it('should return health status', async () => {
      const health = await getRateLimiterHealth();

      expect(health).toHaveProperty('redis');
      expect(health).toHaveProperty('memoryStoreSize');
      expect(typeof health.memoryStoreSize).toBe('number');
    });

    it('should report redis status correctly', async () => {
      const health = await getRateLimiterHealth();

      expect(['healthy', 'unhealthy', 'disabled']).toContain(health.redis.status);
    });
  });

  describe('fallback behavior', () => {
    it('should work without Redis configured', async () => {
      // Temporarily clear Redis env vars
      const originalHost = process.env.REDIS_HOST;
      delete process.env.REDIS_HOST;

      const result = await checkLimit({
        keyPrefix: TEST_PREFIX,
        identifier: TEST_ID,
        maxRequests: 5,
        windowMs: 60000,
      });

      expect(result.allowed).toBe(true);
      expect(result.source).toBe('memory');

      // Restore
      process.env.REDIS_HOST = originalHost;
    });
  });
});
```

### 5.2 Integration Tests

```typescript
// tests/integration/redis-rate-limit.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { checkLimit, resetLimit } from '@/lib/redis/rate-limiter';
import { getRedisClient, closeRedisConnection } from '@/lib/redis/client';

describe('Redis Rate Limit Integration', () => {
  const TEST_PREFIX = 'integration-test';

  beforeAll(async () => {
    // Verify Redis is available
    const client = await getRedisClient();
    if (!client) {
      console.warn('Redis not available, skipping integration tests');
      return;
    }
  });

  afterAll(async () => {
    await closeRedisConnection();
  });

  it('should maintain state across multiple checkLimit calls', async () => {
    const client = await getRedisClient();
    if (!client) return;

    const id = `integration-${Date.now()}`;

    // Make requests up to limit
    for (let i = 0; i < 5; i++) {
      const result = await checkLimit({
        keyPrefix: TEST_PREFIX,
        identifier: id,
        maxRequests: 5,
        windowMs: 60000,
      });
      expect(result.allowed).toBe(true);
      expect(result.source).toBe('redis');
    }

    // Next request should be blocked
    const blocked = await checkLimit({
      keyPrefix: TEST_PREFIX,
      identifier: id,
      maxRequests: 5,
      windowMs: 60000,
    });
    expect(blocked.allowed).toBe(false);
    expect(blocked.source).toBe('redis');

    // Cleanup
    await resetLimit(TEST_PREFIX, id);
  });

  it('should use sliding window (not fixed window)', async () => {
    const client = await getRedisClient();
    if (!client) return;

    const id = `sliding-${Date.now()}`;
    const windowMs = 2000; // 2 second window for testing

    // Exhaust limit quickly
    for (let i = 0; i < 5; i++) {
      await checkLimit({
        keyPrefix: TEST_PREFIX,
        identifier: id,
        maxRequests: 5,
        windowMs,
      });
    }

    // Should be blocked
    const blocked = await checkLimit({
      keyPrefix: TEST_PREFIX,
      identifier: id,
      maxRequests: 5,
      windowMs,
    });
    expect(blocked.allowed).toBe(false);

    // Wait for window to slide
    await new Promise(resolve => setTimeout(resolve, windowMs + 100));

    // Should be allowed again (old entries expired from sliding window)
    const afterWait = await checkLimit({
      keyPrefix: TEST_PREFIX,
      identifier: id,
      maxRequests: 5,
      windowMs,
    });
    expect(afterWait.allowed).toBe(true);

    // Cleanup
    await resetLimit(TEST_PREFIX, id);
  });
});
```

### 5.3 E2E Tests

```typescript
// tests/e2e/rate-limit.e2e.test.ts
import { test, expect } from '@playwright/test';

test.describe('Rate Limiting E2E', () => {
  test('should return 429 after exceeding rate limit', async ({ request }) => {
    // Submit form multiple times quickly
    const promises = [];
    for (let i = 0; i < 10; i++) {
      promises.push(
        request.post('/api/submit-form', {
          data: {
            formType: 'contact',
            data: {
              name: `Test User ${i}`,
              email: `test${i}@example.com`,
              message: 'Test message',
            },
          },
        })
      );
    }

    const responses = await Promise.all(promises);
    
    // Count rate limited responses
    const rateLimited = responses.filter(r => r.status() === 429);
    const accepted = responses.filter(r => r.status() === 200);

    // Should have some rate limited and some accepted
    expect(rateLimited.length).toBeGreaterThan(0);
    expect(accepted.length).toBeLessThanOrEqual(5);

    // Check rate limit headers
    if (rateLimited.length > 0) {
      const limitedResponse = rateLimited[0];
      expect(limitedResponse.headers()['retry-after']).toBeDefined();
      expect(limitedResponse.headers()['x-ratelimit-limit']).toBeDefined();
    }
  });

  test('should include rate limit headers in successful responses', async ({ request }) => {
    const response = await request.post('/api/submit-form', {
      data: {
        formType: 'contact',
        data: {
          name: 'Test User',
          email: 'test@example.com',
          message: 'Test message',
        },
      },
    });

    expect(response.status()).toBe(200);
    expect(response.headers()['x-ratelimit-limit']).toBe('5');
    expect(response.headers()['x-ratelimit-remaining']).toBeDefined();
    expect(response.headers()['x-ratelimit-reset']).toBeDefined();
  });
});
```

---

## 6. Deployment Considerations

### 6.1 GCP Memorystore Redis

For production deployment on GCP:

```bash
# Create Redis instance
gcloud redis instances create zaplit-redis \
  --tier=standard \
  --size=5 \
  --region=us-central1 \
  --redis-version=redis_7_0 \
  --network=default

# Get connection details
gcloud redis instances describe zaplit-redis --region=us-central1

# Create secret in Secret Manager
echo -n "10.0.0.3" | gcloud secrets create redis-host --data-file=-
echo -n "your-password" | gcloud secrets create redis-password --data-file=-
```

### 6.2 Cloud Run Configuration

```yaml
# cloudbuild.yaml additions
steps:
  # Deploy with Redis configuration
  - name: 'gcr.io/google.com/cloudsdktool/cloud-sdk'
    entrypoint: gcloud
    args:
      - 'run'
      - 'deploy'
      - 'zaplit-com'
      - '--image'
      - 'gcr.io/$PROJECT_ID/zaplit-com:$COMMIT_SHA'
      - '--region'
      - 'us-central1'
      - '--set-env-vars'
      - 'NODE_ENV=production,SERVICE_NAME=zaplit-com,REDIS_HOST=$$REDIS_HOST,REDIS_PORT=6379,REDIS_DB=0,REDIS_TLS=true'
      - '--set-secrets'
      - 'REDIS_PASSWORD=redis-password:latest'
    secretEnv: ['REDIS_HOST']
```

### 6.3 Monitoring and Alerting

```yaml
# monitoring/redis-alerts.yaml
alerting:
  policies:
    - name: redis-connection-failures
      condition: |
        metric.type="logging.googleapis.com/user/redis_connection_failures"
        resource.type="cloud_run_revision"
      threshold: 5
      duration: 300s
      severity: warning
      
    - name: rate-limiter-fallback-usage
      condition: |
        metric.type="logging.googleapis.com/user/rate_limiter_fallback"
        resource.type="cloud_run_revision"
      threshold: 10
      duration: 60s
      severity: critical
```

---

## 7. Migration Checklist

- [ ] Install `ioredis` dependency in both apps
- [ ] Create `lib/redis/client.ts` with singleton pattern
- [ ] Create `lib/redis/rate-limiter.ts` with sliding window
- [ ] Update `lib/constants.ts` with Redis configuration
- [ ] Update `app/api/submit-form/route.ts` to use new rate limiter
- [ ] Update `app/api/health/route.ts` with Redis health check
- [ ] Update `.env.example` files with Redis variables
- [ ] Add unit tests for rate limiter
- [ ] Add integration tests with Redis
- [ ] Update cloudbuild.yaml for Redis secrets
- [ ] Create GCP Memorystore Redis instance
- [ ] Configure Secret Manager with Redis credentials
- [ ] Deploy to staging and test
- [ ] Deploy to production
- [ ] Monitor fallback usage and Redis health

---

## 8. Summary

This Redis integration provides:

1. **Distributed Rate Limiting**: Consistent rate limits across all Cloud Run instances
2. **Sliding Window Algorithm**: Better protection against burst attacks
3. **Graceful Fallback**: Automatic fallback to in-memory store if Redis is unavailable
4. **Atomic Operations**: Lua scripts ensure race-condition-free rate limiting
5. **Health Monitoring**: Built-in health checks for Redis connectivity
6. **Backward Compatibility**: Works without Redis for local development

The implementation follows the existing codebase patterns and maintains compatibility with the current in-memory solution while enabling horizontal scaling.
