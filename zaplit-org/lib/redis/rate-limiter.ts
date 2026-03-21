/**
 * Redis Rate Limiter
 * 
 * Distributed rate limiting using Redis with sliding window algorithm.
 * Falls back to in-memory rate limiting when Redis is unavailable.
 * 
 * @module lib/redis/rate-limiter
 * @access public
 */

import { getRedisClient } from './client';
import { RATE_LIMITS } from '@/lib/constants';
import { logger } from '@/lib/logger';

/**
 * Rate limit check result
 */
export interface RateLimitResult {
  /** Whether the request is allowed */
  allowed: boolean;
  /** Number of requests remaining in window */
  remaining: number;
  /** Timestamp when the rate limit resets */
  resetTime: number;
  /** Seconds until rate limit resets (only set when not allowed) */
  retryAfter?: number;
}

/**
 * In-memory fallback store for when Redis is unavailable
 */
const memoryStore = new Map<string, { count: number; resetTime: number }>();

/**
 * Generate rate limit key for an IP address
 */
function getRateLimitKey(ip: string): string {
  const prefix = process.env.REDIS_KEY_PREFIX || 'zaplit:dev';
  const service = process.env.SERVICE_NAME || 'zaplit-com';
  return `${prefix}:ratelimit:${service}:ip:${ip}`;
}

/**
 * Check rate limit using in-memory fallback
 */
async function checkMemoryLimit(ip: string): Promise<RateLimitResult> {
  const key = ip;
  const now = Date.now();
  const windowMs = RATE_LIMITS.WINDOW_MS;
  const maxRequests = RATE_LIMITS.MAX_REQUESTS_PER_WINDOW;

  const clientData = memoryStore.get(key);

  if (clientData && now < clientData.resetTime) {
    if (clientData.count >= maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetTime: clientData.resetTime,
        retryAfter: Math.ceil((clientData.resetTime - now) / 1000),
      };
    }
    clientData.count++;
    return {
      allowed: true,
      remaining: maxRequests - clientData.count,
      resetTime: clientData.resetTime,
    };
  }

  // New window
  memoryStore.set(key, { count: 1, resetTime: now + windowMs });
  return {
    allowed: true,
    remaining: maxRequests - 1,
    resetTime: now + windowMs,
  };
}

/**
 * Lua script for atomic sliding window rate limiting
 * 
 * This script ensures atomic operations across multiple instances:
 * 1. Remove entries outside the window
 * 2. Count remaining entries
 * 3. If under limit, add new entry
 * 4. Set expiration
 */
const slidingWindowScript = `
  local key = KEYS[1]
  local now = tonumber(ARGV[1])
  local windowStart = tonumber(ARGV[2])
  local maxRequests = tonumber(ARGV[3])
  local windowMs = tonumber(ARGV[4])
  
  -- Remove old entries outside the window
  redis.call('ZREMRANGEBYSCORE', key, 0, windowStart)
  
  -- Count current entries
  local count = redis.call('ZCARD', key)
  
  if count >= maxRequests then
    -- Get oldest entry for retry-after calculation
    local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
    return {0, oldest[2], count}
  end
  
  -- Add new entry with unique member (timestamp + counter)
  local member = now .. ':' .. redis.call('INCR', key .. ':seq')
  redis.call('ZADD', key, now, member)
  
  -- Set expiration on the key (window duration)
  redis.call('PEXPIRE', key, windowMs)
  
  return {1, now + windowMs, count + 1}
`;

/**
 * Check rate limit using Redis
 */
async function checkRedisLimit(ip: string): Promise<RateLimitResult> {
  const redis = getRedisClient();
  
  if (!redis) {
    throw new Error('Redis not configured');
  }

  const key = getRateLimitKey(ip);
  const now = Date.now();
  const windowMs = RATE_LIMITS.WINDOW_MS;
  const maxRequests = RATE_LIMITS.MAX_REQUESTS_PER_WINDOW;
  const windowStart = now - windowMs;

  try {
    // Execute Lua script atomically
    const result = await redis.eval(
      slidingWindowScript,
      1, // Number of keys
      key,
      now,
      windowStart,
      maxRequests,
      windowMs
    ) as [number, number, number];

    const [allowed, resetTime, currentCount] = result;

    if (!allowed) {
      return {
        allowed: false,
        remaining: 0,
        resetTime,
        retryAfter: Math.ceil((resetTime - now) / 1000),
      };
    }

    return {
      allowed: true,
      remaining: maxRequests - currentCount,
      resetTime,
    };
  } catch (error) {
    logger.error({ component: 'rate-limiter', error }, 'Redis error');
    throw error;
  }
}

/**
 * Check rate limit for an IP address
 * 
 * Uses Redis if available, otherwise falls back to in-memory store.
 * This ensures rate limiting works even if Redis is down or not configured.
 * 
 * @param ip - Client IP address
 * @returns Rate limit check result
 * 
 * @example
 * const result = await checkRateLimit('192.168.1.1');
 * if (!result.allowed) {
 *   return new Response('Rate limit exceeded', { 
 *     status: 429,
 *     headers: { 'Retry-After': String(result.retryAfter) }
 *   });
 * }
 */
export async function checkRateLimit(ip: string): Promise<RateLimitResult> {
  // Try Redis first
  try {
    const redis = getRedisClient();
    if (redis) {
      return await checkRedisLimit(ip);
    }
  } catch (error) {
    logger.warn({ component: 'rate-limiter', error }, 'Redis unavailable, falling back to memory');
  }

  // Fallback to in-memory
  return checkMemoryLimit(ip);
}

/**
 * Reset rate limit for an IP address
 * 
 * Useful for testing or manual intervention
 * 
 * @param ip - Client IP address
 */
export async function resetRateLimit(ip: string): Promise<void> {
  // Reset Redis
  const redis = getRedisClient();
  if (redis) {
    try {
      await redis.del(getRateLimitKey(ip));
    } catch (error) {
      logger.error({ component: 'rate-limiter', error }, 'Failed to reset Redis rate limit');
    }
  }

  // Reset memory
  memoryStore.delete(ip);
}

/**
 * Get current rate limit status without incrementing
 * 
 * @param ip - Client IP address
 * @returns Current rate limit status
 */
export async function getRateLimitStatus(ip: string): Promise<RateLimitResult> {
  const redis = getRedisClient();
  
  if (redis) {
    try {
      const key = getRateLimitKey(ip);
      const now = Date.now();
      const windowMs = RATE_LIMITS.WINDOW_MS;
      const maxRequests = RATE_LIMITS.MAX_REQUESTS_PER_WINDOW;
      const windowStart = now - windowMs;

      // Remove old entries and count
      await redis.zremrangebyscore(key, 0, windowStart);
      const count = await redis.zcard(key);

      // Get oldest entry for reset time
      const oldest = await redis.zrange(key, 0, 0, 'WITHSCORES');
      const resetTime = oldest.length > 0 
        ? parseInt(oldest[1], 10) + windowMs 
        : now + windowMs;

      return {
        allowed: count < maxRequests,
        remaining: Math.max(0, maxRequests - count),
        resetTime,
        retryAfter: count >= maxRequests 
          ? Math.ceil((resetTime - now) / 1000) 
          : undefined,
      };
    } catch (error) {
      console.error('[RATE_LIMIT] Redis error:', error);
    }
  }

  // Fallback to memory
  const memoryResult = await checkMemoryLimit(ip);
  // Don't increment on status check
  if (memoryResult.allowed && memoryStore.has(ip)) {
    const data = memoryStore.get(ip)!;
    data.count--;
  }
  return memoryResult;
}
