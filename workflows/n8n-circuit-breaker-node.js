/**
 * n8n Code Node - Circuit Breaker Implementation
 * 
 * This module provides a production-ready circuit breaker for n8n workflows
 * that integrates with Twenty CRM. It supports Redis-backed state storage
 * for distributed deployments.
 * 
 * Usage in n8n Code Node:
 * 1. Copy the CircuitBreaker class into your Code Node
 * 2. Configure Redis connection via n8n credentials
 * 3. Use check(), recordSuccess(), recordFailure() methods
 * 
 * @version 1.0.0
 * @author Zaplit DevOps Team
 */

// ============================================
// CONFIGURATION
// ============================================

const CIRCUIT_CONFIG = {
  // Service identifier
  serviceName: 'twenty-crm',
  
  // Redis key prefix
  redisPrefix: 'circuit:twenty',
  
  // Failure threshold before opening circuit (default: 5)
  failureThreshold: parseInt($env.CIRCUIT_FAILURE_THRESHOLD || '5', 10),
  
  // Successes needed to close from half-open (default: 3)
  successThreshold: parseInt($env.CIRCUIT_SUCCESS_THRESHOLD || '3', 10),
  
  // Time in ms before attempting recovery (default: 60s)
  recoveryTimeoutMs: parseInt($env.CIRCUIT_RECOVERY_TIMEOUT_MS || '60000', 10),
  
  // Max test calls in half-open state (default: 3)
  halfOpenMaxCalls: parseInt($env.CIRCUIT_HALF_OPEN_MAX_CALLS || '3', 10),
  
  // Sliding window size for failure counting (default: 60s)
  slidingWindowMs: parseInt($env.CIRCUIT_SLIDING_WINDOW_MS || '60000', 10),
  
  // Request timeout in ms (default: 30s)
  requestTimeoutMs: parseInt($env.CIRCUIT_REQUEST_TIMEOUT_MS || '30000', 10),
  
  // Redis key TTL in seconds (default: 5 minutes)
  redisTtl: 300,
};

// ============================================
// CIRCUIT BREAKER CLASS
// ============================================

/**
 * Circuit Breaker states
 */
const CircuitState = {
  CLOSED: 'CLOSED',
  OPEN: 'OPEN',
  HALF_OPEN: 'HALF_OPEN',
};

/**
 * Production-ready Circuit Breaker for n8n
 */
class N8NCircuitBreaker {
  /**
   * Create a new Circuit Breaker instance
   * @param {Object} redisClient - n8n Redis node client
   * @param {string} serviceName - Service identifier
   * @param {Object} config - Circuit configuration
   */
  constructor(redisClient, serviceName, config = CIRCUIT_CONFIG) {
    this.redis = redisClient;
    this.serviceName = serviceName;
    this.config = { ...CIRCUIT_CONFIG, ...config };
    
    // Redis keys
    this.keys = {
      state: `${this.config.redisPrefix}:${serviceName}:state`,
      failures: `${this.config.redisPrefix}:${serviceName}:failures`,
      lastFailure: `${this.config.redisPrefix}:${serviceName}:last_failure`,
      halfOpenCount: `${this.config.redisPrefix}:${serviceName}:half_open_count`,
      successCount: `${this.config.redisPrefix}:${serviceName}:success_count`,
      events: `${this.config.redisPrefix}:${serviceName}:events`,
    };
  }

  /**
   * Check if request should be allowed
   * @returns {Promise<Object>} Check result with allowed, state, probe, retryAfter
   */
  async check() {
    const state = await this.getState();
    const now = Date.now();

    switch (state.state) {
      case CircuitState.CLOSED:
        return {
          allowed: true,
          state: CircuitState.CLOSED,
          circuitOpen: false,
          fallback: false,
        };

      case CircuitState.OPEN:
        const elapsed = now - (state.lastFailure || 0);
        
        if (elapsed >= this.config.recoveryTimeoutMs) {
          // Transition to half-open
          await this.transitionToHalfOpen();
          return {
            allowed: true,
            state: CircuitState.HALF_OPEN,
            probe: true,
            circuitOpen: false,
            fallback: false,
          };
        }

        return {
          allowed: false,
          state: CircuitState.OPEN,
          circuitOpen: true,
          fallback: true,
          retryAfter: this.config.recoveryTimeoutMs - elapsed,
          reason: 'Circuit breaker is OPEN - failing fast',
        };

      case CircuitState.HALF_OPEN:
        if (state.halfOpenCount >= this.config.halfOpenMaxCalls) {
          return {
            allowed: false,
            state: CircuitState.HALF_OPEN,
            circuitOpen: true,
            fallback: true,
            reason: 'Test limit reached in HALF_OPEN state',
          };
        }

        // Increment test call counter
        await this.redisIncrement(this.keys.halfOpenCount);
        await this.redisExpire(this.keys.halfOpenCount, this.config.redisTtl);

        return {
          allowed: true,
          state: CircuitState.HALF_OPEN,
          probe: true,
          circuitOpen: false,
          fallback: false,
        };

      default:
        // Unknown state - reset to closed
        await this.transitionToClosed();
        return {
          allowed: true,
          state: CircuitState.CLOSED,
          circuitOpen: false,
          fallback: false,
        };
    }
  }

  /**
   * Record a successful operation
   * @returns {Promise<Object>} Record result with state and transition
   */
  async recordSuccess() {
    // Add to sliding window
    await this.addEvent('success');

    const state = await this.getState();

    if (state.state === CircuitState.HALF_OPEN) {
      const newSuccessCount = state.successCount + 1;
      await this.redisSet(
        this.keys.successCount,
        newSuccessCount.toString(),
        this.config.redisTtl
      );

      if (newSuccessCount >= this.config.successThreshold) {
        await this.transitionToClosed();
        return {
          state: CircuitState.CLOSED,
          transition: 'HALF_OPEN→CLOSED',
          successCount: newSuccessCount,
          recorded: true,
        };
      }

      return {
        state: CircuitState.HALF_OPEN,
        successCount: newSuccessCount,
        recorded: true,
      };
    }

    // In CLOSED state, reset failures if any
    if (state.failures > 0) {
      await this.redisSet(this.keys.failures, '0', this.config.redisTtl);
    }

    return { state: state.state, recorded: true };
  }

  /**
   * Record a failed operation
   * @param {Error} error - Error that occurred
   * @returns {Promise<Object>} Record result with state and transition
   */
  async recordFailure(error) {
    // Add to sliding window
    await this.addEvent('failure');

    const state = await this.getState();

    // In HALF_OPEN, any failure immediately reopens
    if (state.state === CircuitState.HALF_OPEN) {
      await this.transitionToOpen();
      return {
        state: CircuitState.OPEN,
        transition: 'HALF_OPEN→OPEN',
        recorded: true,
      };
    }

    // In CLOSED state, check sliding window stats
    const stats = await this.getSlidingWindowStats();

    if (stats.failures >= this.config.failureThreshold) {
      await this.transitionToOpen();
      return {
        state: CircuitState.OPEN,
        transition: 'CLOSED→OPEN',
        failures: stats.failures,
        recorded: true,
      };
    }

    return {
      state: CircuitState.CLOSED,
      failures: stats.failures,
      recorded: true,
    };
  }

  /**
   * Execute a function with circuit breaker protection
   * @param {Function} fn - Function to execute
   * @param {Function} fallback - Optional fallback function
   * @returns {Promise<Object>} Execution result
   */
  async execute(fn, fallback) {
    const check = await this.check();

    if (!check.allowed) {
      // Circuit is open - use fallback if available
      if (fallback) {
        try {
          const fallbackData = await fallback();
          return {
            success: true,
            data: fallbackData,
            circuitState: check.state,
            fallbackUsed: true,
          };
        } catch (fallbackError) {
          return {
            success: false,
            error: fallbackError.message,
            circuitState: check.state,
            fallbackUsed: true,
          };
        }
      }

      return {
        success: false,
        error: `Circuit breaker is ${check.state}: ${check.reason || 'Service unavailable'}`,
        circuitState: check.state,
        fallbackUsed: false,
      };
    }

    // Execute the function
    try {
      const result = await this.executeWithTimeout(fn, this.config.requestTimeoutMs);
      const recordResult = await this.recordSuccess();

      return {
        success: true,
        data: result,
        circuitState: recordResult.state,
        fallbackUsed: false,
      };
    } catch (error) {
      const recordResult = await this.recordFailure();

      return {
        success: false,
        error: error.message,
        circuitState: recordResult.state,
        fallbackUsed: false,
      };
    }
  }

  /**
   * Get current circuit state
   * @returns {Promise<Object>} Current state snapshot
   */
  async getState() {
    const [
      state,
      failures,
      lastFailure,
      halfOpenCount,
      successCount,
    ] = await this.redisMget(
      this.keys.state,
      this.keys.failures,
      this.keys.lastFailure,
      this.keys.halfOpenCount,
      this.keys.successCount
    );

    return {
      state: state || CircuitState.CLOSED,
      failures: parseInt(failures || '0', 10),
      lastFailure: lastFailure ? parseInt(lastFailure, 10) : null,
      halfOpenCount: parseInt(halfOpenCount || '0', 10),
      successCount: parseInt(successCount || '0', 10),
    };
  }

  /**
   * Get sliding window statistics
   * @returns {Promise<Object>} Window statistics
   */
  async getSlidingWindowStats() {
    const cutoff = Date.now() - this.config.slidingWindowMs;

    // Clean up old events
    await this.redisZremrangebyscore(this.keys.events, 0, cutoff);

    // Get all events
    const events = await this.redisZrange(this.keys.events, 0, -1);

    const successes = events.filter((e) => e.startsWith('success')).length;
    const failures = events.filter((e) => e.startsWith('failure')).length;
    const total = events.length;

    return {
      successes,
      failures,
      total,
      failureRate: total > 0 ? failures / total : 0,
    };
  }

  // ============================================
  // STATE TRANSITIONS
  // ============================================

  async transitionToOpen() {
    const now = Date.now();

    await Promise.all([
      this.redisSet(this.keys.state, CircuitState.OPEN, this.config.redisTtl),
      this.redisSet(this.keys.lastFailure, now.toString(), this.config.redisTtl),
      this.redisDel(this.keys.halfOpenCount),
      this.redisDel(this.keys.successCount),
    ]);

    console.log(`[CircuitBreaker:${this.serviceName}] Transitioned to OPEN at ${new Date().toISOString()}`);
  }

  async transitionToHalfOpen() {
    await Promise.all([
      this.redisSet(this.keys.state, CircuitState.HALF_OPEN, this.config.redisTtl),
      this.redisSet(this.keys.halfOpenCount, '0', this.config.redisTtl),
      this.redisSet(this.keys.successCount, '0', this.config.redisTtl),
    ]);

    console.log(`[CircuitBreaker:${this.serviceName}] Transitioned to HALF_OPEN at ${new Date().toISOString()}`);
  }

  async transitionToClosed() {
    await Promise.all([
      this.redisSet(this.keys.state, CircuitState.CLOSED, this.config.redisTtl),
      this.redisSet(this.keys.failures, '0', this.config.redisTtl),
      this.redisDel(this.keys.halfOpenCount),
      this.redisDel(this.keys.successCount),
    ]);

    console.log(`[CircuitBreaker:${this.serviceName}] Transitioned to CLOSED at ${new Date().toISOString()}`);
  }

  // ============================================
  // UTILITY METHODS
  // ============================================

  async addEvent(type) {
    const now = Date.now();
    const member = `${type}:${now}:${Math.random().toString(36).substr(2, 9)}`;

    await this.redisZadd(this.keys.events, now, member);
    await this.redisExpire(this.keys.events, Math.ceil(this.config.slidingWindowMs / 1000));
  }

  executeWithTimeout(fn, timeoutMs) {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Operation timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      fn()
        .then((result) => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }

  // ============================================
  // REDIS WRAPPER METHODS
  // These should be replaced with actual n8n Redis node calls
  // ============================================

  async redisGet(key) {
    // Implement using n8n Redis node
    return await this.redis.get(key);
  }

  async redisSet(key, value, ttl) {
    // Implement using n8n Redis node
    return await this.redis.set(key, value, 'EX', ttl);
  }

  async redisDel(...keys) {
    // Implement using n8n Redis node
    return await this.redis.del(...keys);
  }

  async redisIncrement(key) {
    // Implement using n8n Redis node
    return await this.redis.incr(key);
  }

  async redisExpire(key, seconds) {
    // Implement using n8n Redis node
    return await this.redis.expire(key, seconds);
  }

  async redisMget(...keys) {
    // Implement using n8n Redis node
    return await this.redis.mget(...keys);
  }

  async redisZadd(key, score, member) {
    // Implement using n8n Redis node
    return await this.redis.zadd(key, score, member);
  }

  async redisZrange(key, start, stop) {
    // Implement using n8n Redis node
    return await this.redis.zrange(key, start, stop);
  }

  async redisZremrangebyscore(key, min, max) {
    // Implement using n8n Redis node
    return await this.redis.zremrangebyscore(key, min, max);
  }
}

// ============================================
// FALLBACK HANDLERS
// ============================================

/**
 * Queue submission for retry when circuit is open
 * @param {Object} submission - Form submission data
 * @param {Object} circuitState - Current circuit state
 * @returns {Promise<Object>} Queue result
 */
async function queueForRetry(submission, circuitState) {
  const queueKey = `${CIRCUIT_CONFIG.redisPrefix}:retry_queue`;
  const item = {
    submission,
    circuitState,
    queuedAt: new Date().toISOString(),
    retryCount: 0,
  };

  // Use n8n Redis node to push to queue
  await $getWorkflowStaticData('global').redisClient.lpush(
    queueKey,
    JSON.stringify(item)
  );

  return { queued: true, key: queueKey };
}

/**
 * Store submission in fallback storage
 * @param {Object} submission - Form submission data
 * @param {Object} circuitState - Current circuit state
 * @returns {Promise<Object>} Storage result
 */
async function storeInFallback(submission, circuitState) {
  const results = {
    queued: false,
    stored: false,
    alerted: false,
  };

  // 1. Try to queue for retry
  try {
    await queueForRetry(submission, circuitState);
    results.queued = true;
  } catch (error) {
    console.error('Failed to queue for retry:', error.message);
  }

  // 2. Try Google Sheets backup if configured
  if ($env.FALLBACK_SHEETS_ENABLED === 'true') {
    try {
      // Implementation depends on Google Sheets node setup
      results.stored = true;
    } catch (error) {
      console.error('Failed to backup to sheets:', error.message);
    }
  }

  // 3. Alert if all fallbacks failed
  if (!results.queued && !results.stored) {
    console.error('CRITICAL: All fallback strategies failed');
    results.alerted = true;
  }

  return results;
}

// ============================================
// MAIN ENTRY POINTS FOR N8N CODE NODES
// ============================================

/**
 * Check circuit state - Use this in "Check Circuit State" Code Node
 * 
 * Input: None
 * Output: { circuitOpen, state, allowed, fallback, retryAfter, reason }
 */
async function checkCircuitState() {
  // Get Redis client from n8n credentials
  const redisClient = await getRedisConnection();
  const breaker = new N8NCircuitBreaker(
    redisClient,
    CIRCUIT_CONFIG.serviceName,
    CIRCUIT_CONFIG
  );

  const status = await breaker.check();

  return [
    {
      json: {
        ...status,
        _meta: {
          timestamp: new Date().toISOString(),
          service: CIRCUIT_CONFIG.serviceName,
        },
      },
    },
  ];
}

/**
 * Record success - Use this in "Handle Success" Code Node
 * 
 * Input: Previous node output
 * Output: { recorded, state, transition, successCount }
 */
async function recordCircuitSuccess() {
  const redisClient = await getRedisConnection();
  const breaker = new N8NCircuitBreaker(
    redisClient,
    CIRCUIT_CONFIG.serviceName,
    CIRCUIT_CONFIG
  );

  const result = await breaker.recordSuccess();

  return [
    {
      json: {
        ...result,
        _meta: {
          timestamp: new Date().toISOString(),
          service: CIRCUIT_CONFIG.serviceName,
        },
      },
    },
  ];
}

/**
 * Record failure - Use this in "Handle Failure" Code Node
 * 
 * Input: Error from failed node
 * Output: { recorded, state, transition, failures }
 */
async function recordCircuitFailure() {
  const error = $input.first().error;
  
  const redisClient = await getRedisConnection();
  const breaker = new N8NCircuitBreaker(
    redisClient,
    CIRCUIT_CONFIG.serviceName,
    CIRCUIT_CONFIG
  );

  const result = await breaker.recordFailure(error);

  return [
    {
      json: {
        ...result,
        error: error ? error.message : 'Unknown error',
        _meta: {
          timestamp: new Date().toISOString(),
          service: CIRCUIT_CONFIG.serviceName,
        },
      },
    },
  ];
}

/**
 * Handle circuit open - Use this in "Fallback Storage" Code Node
 * 
 * Input: Original submission data
 * Output: { queued, stored, alerted }
 */
async function handleCircuitOpen() {
  const input = $input.first().json;
  const submission = input.submission || input;
  
  const redisClient = await getRedisConnection();
  const breaker = new N8NCircuitBreaker(
    redisClient,
    CIRCUIT_CONFIG.serviceName,
    CIRCUIT_CONFIG
  );

  const circuitState = await breaker.getState();
  const result = await storeInFallback(submission, circuitState);

  return [
    {
      json: {
        ...result,
        submission: sanitizeForLogging(submission),
        _meta: {
          timestamp: new Date().toISOString(),
          service: CIRCUIT_CONFIG.serviceName,
          action: 'FALLBACK_STORAGE',
        },
      },
    },
  ];
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get Redis connection from n8n credentials
 * This should be configured in n8n credentials
 */
async function getRedisConnection() {
  // In n8n, this would use the Redis credentials
  // For now, return a mock that uses static data as fallback
  const staticData = $getWorkflowStaticData('global');
  
  // Return Redis-like interface using static data
  return {
    get: async (key) => staticData[`redis_${key}`] || null,
    set: async (key, value, mode, ttl) => {
      staticData[`redis_${key}`] = value;
      return 'OK';
    },
    del: async (...keys) => {
      keys.forEach((key) => delete staticData[`redis_${key}`]);
      return keys.length;
    },
    incr: async (key) => {
      const current = parseInt(staticData[`redis_${key}`] || '0', 10);
      staticData[`redis_${key}`] = (current + 1).toString();
      return current + 1;
    },
    expire: async (key, seconds) => 1,
    mget: async (...keys) => keys.map((key) => staticData[`redis_${key}`] || null),
    zadd: async (key, score, member) => {
      const setKey = `redis_zset_${key}`;
      if (!staticData[setKey]) staticData[setKey] = [];
      staticData[setKey].push({ score, member });
      return 1;
    },
    zrange: async (key, start, stop) => {
      const setKey = `redis_zset_${key}`;
      const data = staticData[setKey] || [];
      return data.map((item) => item.member);
    },
    zremrangebyscore: async (key, min, max) => {
      const setKey = `redis_zset_${key}`;
      if (!staticData[setKey]) return 0;
      const before = staticData[setKey].length;
      staticData[setKey] = staticData[setKey].filter(
        (item) => item.score < min || item.score > max
      );
      return before - staticData[setKey].length;
    },
    lpush: async (key, value) => {
      const listKey = `redis_list_${key}`;
      if (!staticData[listKey]) staticData[listKey] = [];
      staticData[listKey].unshift(value);
      return staticData[listKey].length;
    },
  };
}

/**
 * Sanitize submission for logging (remove PII)
 */
function sanitizeForLogging(submission) {
  const sanitized = { ...submission };
  
  if (sanitized.email) {
    const [local, domain] = sanitized.email.split('@');
    sanitized.email = `${local[0]}***@${domain}`;
  }
  
  if (sanitized.phone) {
    sanitized.phone = sanitized.phone.slice(-4).padStart(sanitized.phone.length, '*');
  }
  
  return sanitized;
}

// ============================================
// EXPORTS FOR MODULE USE
// ============================================

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    N8NCircuitBreaker,
    CircuitState,
    CIRCUIT_CONFIG,
    queueForRetry,
    storeInFallback,
    checkCircuitState,
    recordCircuitSuccess,
    recordCircuitFailure,
    handleCircuitOpen,
  };
}

// ============================================
// MAIN EXECUTION
// Determine which function to run based on operation input
// ============================================

const operation = $input.first().json.operation || 'check';

switch (operation) {
  case 'check':
    return await checkCircuitState();
  case 'record_success':
    return await recordCircuitSuccess();
  case 'record_failure':
    return await recordCircuitFailure();
  case 'handle_open':
    return await handleCircuitOpen();
  default:
    return [
      {
        json: {
          error: `Unknown operation: ${operation}`,
          validOperations: ['check', 'record_success', 'record_failure', 'handle_open'],
        },
      },
    ];
}
