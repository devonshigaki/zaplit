/**
 * Circuit Breaker Pattern Implementation
 * 
 * Production-ready circuit breaker with Redis-backed state storage,
 * sliding window failure counting, and comprehensive state management.
 * 
 * @module circuit-breaker
 * @see https://martinfowler.com/bliki/CircuitBreaker.html
 */

import { CircuitBreakerRedisClient, RedisClient } from './redis.js';
import { Logger } from './logger.js';

/**
 * Circuit breaker states
 */
export enum CircuitBreakerState {
  /** Normal operation - requests pass through */
  CLOSED = 'CLOSED',
  /** Failing fast - requests are rejected immediately */
  OPEN = 'OPEN',
  /** Testing recovery - limited requests allowed */
  HALF_OPEN = 'HALF_OPEN',
}

/**
 * Circuit breaker configuration options
 */
export interface CircuitBreakerConfig {
  /** Unique name for this circuit breaker instance */
  name: string;
  /** Number of failures before opening circuit (default: 5) */
  failureThreshold: number;
  /** Time in ms before attempting recovery (default: 60000) */
  recoveryTimeout: number;
  /** Number of successes required to close from half-open (default: 3) */
  successThreshold: number;
  /** Maximum test calls allowed in half-open state (default: 3) */
  halfOpenMaxCalls: number;
  /** Sliding window size in ms for failure counting (default: 60000) */
  monitoringPeriod: number;
  /** Redis key prefix (default: 'circuit:{name}') */
  keyPrefix?: string;
  /** Redis client for state storage */
  redis: RedisClient;
  /** Enable debug logging */
  debug?: boolean;
  /** Custom logger instance */
  logger?: Logger;
  /** Request timeout in ms (default: 30000) */
  requestTimeout?: number;
}

/**
 * Result of checking circuit state
 */
export interface CircuitCheckResult {
  /** Whether the request is allowed to proceed */
  allowed: boolean;
  /** Current circuit state */
  state: CircuitBreakerState;
  /** Whether this is a probe request in half-open state */
  probe?: boolean;
  /** Time in ms until circuit may allow requests again */
  retryAfter?: number;
  /** Reason for rejection if not allowed */
  reason?: string;
}

/**
 * Result of recording success/failure
 */
export interface CircuitRecordResult {
  /** Current circuit state after recording */
  state: CircuitBreakerState;
  /** State transition that occurred, if any */
  transition?: string;
  /** Current failure count */
  failures?: number;
  /** Current success count in half-open state */
  successCount?: number;
}

/**
 * Circuit state snapshot
 */
export interface CircuitStateSnapshot {
  /** Current state */
  state: CircuitBreakerState;
  /** Current failure count */
  failures: number;
  /** Timestamp of last failure (ms since epoch) */
  lastFailure: number | null;
  /** Number of test calls in half-open state */
  halfOpenCount: number;
  /** Number of successes in half-open state */
  successCount: number;
  /** Statistics from sliding window */
  windowStats: SlidingWindowStats;
}

/**
 * Statistics from sliding window
 */
export interface SlidingWindowStats {
  /** Number of successes in window */
  successes: number;
  /** Number of failures in window */
  failures: number;
  /** Total events in window */
  total: number;
  /** Failure rate (0-1) */
  failureRate: number;
  /** Window size in ms */
  windowSizeMs: number;
}

/**
 * Execution result wrapper
 */
export interface CircuitExecutionResult<T> {
  /** Whether execution succeeded */
  success: boolean;
  /** Result data if successful */
  data?: T;
  /** Error if execution failed */
  error?: Error;
  /** Circuit state information */
  circuit: CircuitRecordResult;
  /** Whether fallback was used */
  fallbackUsed?: boolean;
}

/**
 * Default circuit breaker configuration
 */
export const DEFAULT_CONFIG: Partial<CircuitBreakerConfig> = {
  failureThreshold: 5,
  recoveryTimeout: 60000,
  successThreshold: 3,
  halfOpenMaxCalls: 3,
  monitoringPeriod: 60000,
  requestTimeout: 30000,
};

/**
 * Redis key names for circuit breaker state
 */
interface CircuitKeys {
  state: string;
  failures: string;
  lastFailure: string;
  halfOpenCount: string;
  successCount: string;
  events: string;
}

/**
 * Circuit Breaker implementation with Redis-backed state storage
 */
export class CircuitBreaker {
  private config: Required<CircuitBreakerConfig>;
  private redis: CircuitBreakerRedisClient;
  private logger: Logger;
  private keys: CircuitKeys;
  // Note: Redis script caching can be implemented here for optimization
  private initialized = false;

  /**
   * Create a new Circuit Breaker instance
   * 
   * @param config - Circuit breaker configuration
   * @example
   * ```typescript
   * const breaker = new CircuitBreaker({
   *   name: 'twenty-crm',
   *   failureThreshold: 5,
   *   recoveryTimeout: 60000,
   *   successThreshold: 3,
   *   halfOpenMaxCalls: 3,
   *   monitoringPeriod: 60000,
   *   redis: redisClient
   * });
   * ```
   */
  constructor(config: CircuitBreakerConfig) {
    // Merge with defaults
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    } as Required<CircuitBreakerConfig>;

    // Setup logger
    this.logger = config.logger || new Logger('circuit-breaker');

    // Setup Redis client with key prefixing
    const prefix = config.keyPrefix || `circuit:${config.name}`;
    this.redis = new CircuitBreakerRedisClient(config.redis, {
      debug: config.debug,
      logger: this.logger,
    });
    this.redis.setKeyPrefix(prefix);

    // Define keys
    this.keys = {
      state: 'state',
      failures: 'failures',
      lastFailure: 'last_failure',
      halfOpenCount: 'half_open_count',
      successCount: 'success_count',
      events: 'events',
    };
  }

  /**
   * Initialize the circuit breaker
   * Loads Lua scripts and validates connection
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Load Lua script for atomic operations (optional optimization)
    await this.redis.scriptLoad(ATOMIC_FAILURE_SCRIPT);
    
    // Verify connection
    const healthy = await this.redis.healthCheck();
    if (!healthy) {
      throw new CircuitBreakerError('Redis connection health check failed');
    }

    this.initialized = true;
    this.log('info', `Circuit breaker '${this.config.name}' initialized`);
  }

  /**
   * Execute a function with circuit breaker protection
   * 
   * @param fn - Function to execute
   * @param fallback - Optional fallback function if circuit is open
   * @returns Execution result
   * @example
   * ```typescript
   * const result = await breaker.execute(
   *   async () => await crmClient.createPerson(data),
   *   async () => await queueForRetry(data)
   * );
   * ```
   */
  async execute<T>(
    fn: () => Promise<T>,
    fallback?: () => Promise<T>
  ): Promise<CircuitExecutionResult<T>> {
    await this.ensureInitialized();

    // Check circuit state
    const check = await this.check();

    if (!check.allowed) {
      // Circuit is open - use fallback if available
      if (fallback) {
        try {
          const fallbackData = await fallback();
          return {
            success: true,
            data: fallbackData,
            circuit: { state: check.state },
            fallbackUsed: true,
          };
        } catch (fallbackError) {
          return {
            success: false,
            error: fallbackError instanceof Error ? fallbackError : new Error(String(fallbackError)),
            circuit: { state: check.state },
            fallbackUsed: true,
          };
        }
      }

      // No fallback - return error
      return {
        success: false,
        error: new CircuitBreakerOpenError(
          `Circuit breaker is ${check.state}: ${check.reason || 'Service unavailable'}`
        ),
        circuit: { state: check.state },
      };
    }

    // Execute the function
    try {
      const result = await this.executeWithTimeout(fn, this.config.requestTimeout);
      const recordResult = await this.recordSuccess();

      return {
        success: true,
        data: result,
        circuit: recordResult,
        fallbackUsed: false,
      };
    } catch (error) {
      const recordResult = await this.recordFailure();

      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        circuit: recordResult,
        fallbackUsed: false,
      };
    }
  }

  /**
   * Check current circuit state without executing
   * 
   * @returns Circuit check result
   */
  async check(): Promise<CircuitCheckResult> {
    await this.ensureInitialized();

    const state = await this.getStateSnapshot();
    const now = Date.now();

    switch (state.state) {
      case CircuitBreakerState.CLOSED:
        return {
          allowed: true,
          state: CircuitBreakerState.CLOSED,
        };

      case CircuitBreakerState.OPEN:
        const elapsed = now - (state.lastFailure || 0);
        
        if (elapsed >= this.config.recoveryTimeout) {
          // Transition to half-open
          await this.transitionToHalfOpen();
          return {
            allowed: true,
            state: CircuitBreakerState.HALF_OPEN,
            probe: true,
          };
        }

        return {
          allowed: false,
          state: CircuitBreakerState.OPEN,
          retryAfter: this.config.recoveryTimeout - elapsed,
          reason: 'Circuit breaker is OPEN - failing fast',
        };

      case CircuitBreakerState.HALF_OPEN:
        if (state.halfOpenCount >= this.config.halfOpenMaxCalls) {
          return {
            allowed: false,
            state: CircuitBreakerState.HALF_OPEN,
            reason: 'Test limit reached in HALF_OPEN state',
          };
        }

        // Increment test call counter
        await this.redis.incr(this.keys.halfOpenCount);
        await this.redis.expire(this.keys.halfOpenCount, this.getKeyTtl());

        return {
          allowed: true,
          state: CircuitBreakerState.HALF_OPEN,
          probe: true,
        };

      default:
        // Unknown state - reset to closed
        this.log('warn', `Unknown circuit state: ${state.state}, resetting to CLOSED`);
        await this.transitionToClosed();
        return {
          allowed: true,
          state: CircuitBreakerState.CLOSED,
        };
    }
  }

  /**
   * Record a successful operation
   * 
   * @returns Circuit state after recording
   */
  async recordSuccess(): Promise<CircuitRecordResult> {
    await this.ensureInitialized();

    // Add to sliding window
    await this.addEvent('success');

    const state = await this.getStateSnapshot();

    if (state.state === CircuitBreakerState.HALF_OPEN) {
      const newSuccessCount = state.successCount + 1;
      await this.redis.set(this.keys.successCount, newSuccessCount.toString());
      await this.redis.expire(this.keys.successCount, this.getKeyTtl());

      if (newSuccessCount >= this.config.successThreshold) {
        await this.transitionToClosed();
        return {
          state: CircuitBreakerState.CLOSED,
          transition: 'HALF_OPEN→CLOSED',
          successCount: newSuccessCount,
        };
      }

      return {
        state: CircuitBreakerState.HALF_OPEN,
        successCount: newSuccessCount,
      };
    }

    // In CLOSED state, reset failures if any
    if (state.failures > 0) {
      await this.redis.set(this.keys.failures, '0');
      await this.redis.expire(this.keys.failures, this.getKeyTtl());
    }

    return { state: state.state };
  }

  /**
   * Record a failed operation
   * 
   * @param error - Optional error details
   * @returns Circuit state after recording
   */
  async recordFailure(_error?: Error): Promise<CircuitRecordResult> {
    await this.ensureInitialized();

    // Add to sliding window
    await this.addEvent('failure');

    const state = await this.getStateSnapshot();

    // In HALF_OPEN, any failure immediately reopens
    if (state.state === CircuitBreakerState.HALF_OPEN) {
      await this.transitionToOpen();
      return {
        state: CircuitBreakerState.OPEN,
        transition: 'HALF_OPEN→OPEN',
      };
    }

    // In CLOSED state, use sliding window stats for threshold check
    const stats = await this.getSlidingWindowStats();

    if (stats.failures >= this.config.failureThreshold) {
      await this.transitionToOpen();
      return {
        state: CircuitBreakerState.OPEN,
        transition: 'CLOSED→OPEN',
        failures: stats.failures,
      };
    }

    return {
      state: CircuitBreakerState.CLOSED,
      failures: stats.failures,
    };
  }

  /**
   * Get current circuit state snapshot
   * 
   * @returns Complete state snapshot
   */
  async getStateSnapshot(): Promise<CircuitStateSnapshot> {
    await this.ensureInitialized();

    const [state, failures, lastFailure, halfOpenCount, successCount] = 
      await this.redis.mget(
        this.keys.state,
        this.keys.failures,
        this.keys.lastFailure,
        this.keys.halfOpenCount,
        this.keys.successCount
      );

    const windowStats = await this.getSlidingWindowStats();

    return {
      state: (state as CircuitBreakerState) || CircuitBreakerState.CLOSED,
      failures: parseInt(failures || '0', 10),
      lastFailure: lastFailure ? parseInt(lastFailure, 10) : null,
      halfOpenCount: parseInt(halfOpenCount || '0', 10),
      successCount: parseInt(successCount || '0', 10),
      windowStats,
    };
  }

  /**
   * Get current circuit state (simplified)
   * 
   * @returns Current state
   */
  async getState(): Promise<CircuitBreakerState> {
    const snapshot = await this.getStateSnapshot();
    return snapshot.state;
  }

  /**
   * Force circuit to OPEN state (for maintenance)
   */
  async forceOpen(): Promise<void> {
    await this.ensureInitialized();
    await this.transitionToOpen();
    this.log('warn', 'Circuit manually forced to OPEN state');
  }

  /**
   * Force circuit to CLOSED state (recovery)
   */
  async forceClose(): Promise<void> {
    await this.ensureInitialized();
    await this.transitionToClosed();
    this.log('warn', 'Circuit manually forced to CLOSED state');
  }

  /**
   * Reset all circuit state
   */
  async reset(): Promise<void> {
    await this.ensureInitialized();
    await this.redis.del(
      this.keys.state,
      this.keys.failures,
      this.keys.lastFailure,
      this.keys.halfOpenCount,
      this.keys.successCount,
      this.keys.events
    );
    this.log('info', 'Circuit breaker state reset');
  }

  /**
   * Get sliding window statistics
   */
  async getSlidingWindowStats(): Promise<SlidingWindowStats> {
    const cutoff = Date.now() - this.config.monitoringPeriod;
    
    // Clean up old events
    await this.redis.zremrangebyscore(this.keys.events, 0, cutoff);

    // Get all events
    const events = await this.redis.zrange(this.keys.events, 0, -1);
    
    const successes = events.filter(e => e.startsWith('success')).length;
    const failures = events.filter(e => e.startsWith('failure')).length;
    const total = events.length;

    return {
      successes,
      failures,
      total,
      failureRate: total > 0 ? failures / total : 0,
      windowSizeMs: this.config.monitoringPeriod,
    };
  }

  /**
   * Ensure circuit breaker is initialized
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  /**
   * Transition to OPEN state
   */
  private async transitionToOpen(): Promise<void> {
    const now = Date.now();
    const ttl = this.getKeyTtl();

    await Promise.all([
      this.redis.set(this.keys.state, CircuitBreakerState.OPEN, ttl),
      this.redis.set(this.keys.lastFailure, now.toString(), ttl),
      this.redis.del(this.keys.halfOpenCount),
      this.redis.del(this.keys.successCount),
    ]);

    this.logTransition(CircuitBreakerState.OPEN);
  }

  /**
   * Transition to HALF_OPEN state
   */
  private async transitionToHalfOpen(): Promise<void> {
    const ttl = this.getKeyTtl();

    await Promise.all([
      this.redis.set(this.keys.state, CircuitBreakerState.HALF_OPEN, ttl),
      this.redis.set(this.keys.halfOpenCount, '0', ttl),
      this.redis.set(this.keys.successCount, '0', ttl),
    ]);

    this.logTransition(CircuitBreakerState.HALF_OPEN);
  }

  /**
   * Transition to CLOSED state
   */
  private async transitionToClosed(): Promise<void> {
    const ttl = this.getKeyTtl();

    await Promise.all([
      this.redis.set(this.keys.state, CircuitBreakerState.CLOSED, ttl),
      this.redis.set(this.keys.failures, '0', ttl),
      this.redis.del(this.keys.halfOpenCount),
      this.redis.del(this.keys.successCount),
    ]);

    this.logTransition(CircuitBreakerState.CLOSED);
  }

  /**
   * Add event to sliding window
   */
  private async addEvent(type: 'success' | 'failure'): Promise<void> {
    const now = Date.now();
    const member = `${type}:${now}:${Math.random().toString(36).substr(2, 9)}`;
    
    await this.redis.zadd(this.keys.events, now, member);
    await this.redis.expire(this.keys.events, Math.ceil(this.config.monitoringPeriod / 1000));
  }

  /**
   * Execute function with timeout
   */
  private async executeWithTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new CircuitBreakerTimeoutError(`Operation timed out after ${timeoutMs}ms`));
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

  /**
   * Get TTL for Redis keys (in seconds)
   */
  private getKeyTtl(): number {
    // Use 5x the monitoring period or recovery timeout, whichever is larger
    return Math.ceil(Math.max(
      this.config.monitoringPeriod * 5,
      this.config.recoveryTimeout * 2
    ) / 1000);
  }

  /**
   * Log state transition
   */
  private logTransition(toState: CircuitBreakerState): void {
    this.log('info', `State transition → ${toState}`);
  }

  /**
   * Log message with prefix
   */
  private log(level: 'info' | 'warn' | 'error', message: string): void {
    const prefix = `[CircuitBreaker:${this.config.name}]`;
    switch (level) {
      case 'info':
        this.logger.info(`${prefix} ${message}`);
        break;
      case 'warn':
        this.logger.warn(`${prefix} ${message}`);
        break;
      case 'error':
        this.logger.error(`${prefix} ${message}`);
        break;
    }
  }
}

/**
 * Lua script for atomic failure counting
 * Atomically increments failure count and opens circuit if threshold reached
 */
const ATOMIC_FAILURE_SCRIPT = `
  local state_key = KEYS[1]
  local failures_key = KEYS[2]
  local last_failure_key = KEYS[3]
  
  local failure_threshold = tonumber(ARGV[1])
  local now = ARGV[2]
  local ttl = tonumber(ARGV[3])
  
  local current_state = redis.call('GET', state_key) or 'CLOSED'
  
  if current_state == 'CLOSED' then
    local failures = redis.call('INCR', failures_key)
    redis.call('EXPIRE', failures_key, ttl)
    
    if failures >= failure_threshold then
      redis.call('SET', state_key, 'OPEN', 'EX', ttl)
      redis.call('SET', last_failure_key, now, 'EX', ttl)
      return 'OPENED'
    end
    return 'CLOSED'
  end
  
  return current_state
`;

/**
 * Base error class for circuit breaker errors
 */
export class CircuitBreakerError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = 'CircuitBreakerError';
    if (options?.cause) {
      this.cause = options.cause;
    }
  }
}

/**
 * Error thrown when circuit breaker is OPEN
 */
export class CircuitBreakerOpenError extends CircuitBreakerError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'CircuitBreakerOpenError';
  }
}

/**
 * Error thrown when operation times out
 */
export class CircuitBreakerTimeoutError extends CircuitBreakerError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'CircuitBreakerTimeoutError';
  }
}

/**
 * Create circuit breaker configuration from environment variables
 * 
 * @param name - Circuit breaker name
 * @param redis - Redis client
 * @returns Circuit breaker configuration
 */
export function createCircuitBreakerConfigFromEnv(
  name: string,
  redis: RedisClient
): CircuitBreakerConfig {
  return {
    name,
    redis,
    failureThreshold: parseInt(process.env.CIRCUIT_FAILURE_THRESHOLD || '5', 10),
    successThreshold: parseInt(process.env.CIRCUIT_SUCCESS_THRESHOLD || '3', 10),
    recoveryTimeout: parseInt(process.env.CIRCUIT_RECOVERY_TIMEOUT_MS || '60000', 10),
    halfOpenMaxCalls: parseInt(process.env.CIRCUIT_HALF_OPEN_MAX_CALLS || '3', 10),
    monitoringPeriod: parseInt(process.env.CIRCUIT_SLIDING_WINDOW_MS || '60000', 10),
    requestTimeout: parseInt(process.env.CIRCUIT_REQUEST_TIMEOUT_MS || '30000', 10),
    keyPrefix: process.env.CIRCUIT_KEY_PREFIX,
    debug: process.env.CIRCUIT_DEBUG === 'true',
  };
}

/**
 * Validate circuit breaker configuration
 * 
 * @param config - Configuration to validate
 * @returns Validation result
 */
export function validateCircuitBreakerConfig(
  config: CircuitBreakerConfig
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!config.name || config.name.trim().length === 0) {
    errors.push('Circuit breaker name is required');
  }

  if (!config.redis) {
    errors.push('Redis client is required');
  }

  if (config.failureThreshold < 1) {
    errors.push('Failure threshold must be at least 1');
  }

  if (config.successThreshold < 1) {
    errors.push('Success threshold must be at least 1');
  }

  if (config.recoveryTimeout < 1000) {
    errors.push('Recovery timeout must be at least 1000ms');
  }

  if (config.halfOpenMaxCalls < 1) {
    errors.push('Half-open max calls must be at least 1');
  }

  if (config.monitoringPeriod < 1000) {
    errors.push('Monitoring period must be at least 1000ms');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
