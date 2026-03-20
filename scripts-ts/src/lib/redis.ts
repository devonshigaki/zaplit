/**
 * Redis Client Setup for Circuit Breaker
 * 
 * Provides Redis connection management with error handling,
 * key prefixing, and connection pooling support.
 * 
 * @module redis
 */

import { Logger } from './logger';

/**
 * Redis connection configuration
 */
export interface RedisConfig {
  /** Redis server host */
  host: string;
  /** Redis server port */
  port: number;
  /** Redis password (optional) */
  password?: string;
  /** Redis database number */
  db?: number;
  /** Enable TLS connection */
  tls?: boolean;
  /** Connection timeout in milliseconds */
  connectTimeout?: number;
  /** Command timeout in milliseconds */
  commandTimeout?: number;
  /** Maximum number of retries */
  maxRetries?: number;
  /** Key prefix for namespacing */
  keyPrefix?: string;
}

/**
 * Redis command result type
 */
export type RedisResult = string | number | null | string[];

/**
 * Redis client interface abstracting Redis operations
 */
export interface RedisClient {
  /** Get value by key */
  get(key: string): Promise<string | null>;
  /** Set value with optional expiration */
  set(key: string, value: string, mode?: string, duration?: number): Promise<string>;
  /** Delete keys */
  del(...keys: string[]): Promise<number>;
  /** Increment value */
  incr(key: string): Promise<number>;
  /** Decrement value */
  decr(key: string): Promise<number>;
  /** Set expiration on key */
  expire(key: string, seconds: number): Promise<number>;
  /** Get multiple values */
  mget(...keys: string[]): Promise<(string | null)[]>;
  /** Add member to sorted set */
  zadd(key: string, score: number, member: string): Promise<number>;
  /** Get range from sorted set */
  zrange(key: string, start: number, stop: number): Promise<string[]>;
  /** Remove members by score range */
  zremrangebyscore(key: string, min: number | string, max: number | string): Promise<number>;
  /** Set expiration on key */
  expire(key: string, seconds: number): Promise<number>;
  /** Get list length */
  llen(key: string): Promise<number>;
  /** Get range from list */
  lrange(key: string, start: number, stop: number): Promise<string[]>;
  /** Remove elements from list */
  lrem(key: string, count: number, value: string): Promise<number>;
  /** Push to right of list */
  rpush(key: string, ...values: string[]): Promise<number>;
  /** Push to left of list */
  lpush(key: string, ...values: string[]): Promise<number>;
  /** Execute Lua script by SHA */
  evalsha(sha: string, numKeys: number, ...args: (string | number)[]): Promise<RedisResult>;
  /** Load Lua script */
  script(command: 'LOAD', script: string): Promise<string>;
  /** Close connection */
  quit(): Promise<void>;
  /** Check connection health */
  ping(): Promise<string>;
}

/**
 * Configuration options for Redis client
 */
export interface RedisClientOptions {
  /** Enable debug logging */
  debug?: boolean;
  /** Custom logger instance */
  logger?: Logger;
}

/**
 * Circuit breaker specific Redis client wrapper
 * Provides key prefixing and error handling
 */
export class CircuitBreakerRedisClient {
  private client: RedisClient;
  private keyPrefix: string;
  private logger: Logger;
  private debug: boolean;

  /**
   * Create a new CircuitBreakerRedisClient
   * 
   * @param client - Underlying Redis client implementation
   * @param options - Configuration options
   */
  constructor(client: RedisClient, options: RedisClientOptions = {}) {
    this.client = client;
    this.keyPrefix = '';
    this.logger = options.logger || new Logger();
    this.debug = options.debug || false;
  }

  /**
   * Set the key prefix for all operations
   * 
   * @param prefix - Prefix to prepend to all keys
   */
  setKeyPrefix(prefix: string): void {
    this.keyPrefix = prefix.endsWith(':') ? prefix : `${prefix}:`;
  }

  /**
   * Prefix a key with the configured prefix
   * 
   * @param key - Original key
   * @returns Prefixed key
   */
  private prefixKey(key: string): string {
    return `${this.keyPrefix}${key}`;
  }

  /**
   * Log debug message if debug mode is enabled
   * 
   * @param message - Message to log
   * @param meta - Additional metadata
   */
  private logDebug(message: string, meta?: Record<string, unknown>): void {
    if (this.debug) {
      this.logger.info(`[Redis] ${message}`);
      if (meta) {
        console.log('  Metadata:', meta);
      }
    }
  }

  /**
   * Handle Redis errors with logging
   * 
   * @param operation - Operation being performed
   * @param error - Error that occurred
   */
  private handleError(operation: string, error: unknown): never {
    const errorMessage = error instanceof Error ? error.message : String(error);
    this.logger.error(`Redis ${operation} failed: ${errorMessage}`);
    throw new CircuitBreakerRedisError(`Redis ${operation} failed: ${errorMessage}`, { cause: error });
  }

  /**
   * Get value by key
   * 
   * @param key - Redis key
   * @returns Value or null if not found
   */
  async get(key: string): Promise<string | null> {
    try {
      const prefixedKey = this.prefixKey(key);
      this.logDebug('GET', { key: prefixedKey });
      return await this.client.get(prefixedKey);
    } catch (error) {
      this.handleError('GET', error);
    }
  }

  /**
   * Set value with optional expiration
   * 
   * @param key - Redis key
   * @param value - Value to set
   * @param ttlSeconds - Optional TTL in seconds
   * @returns 'OK' on success
   */
  async set(key: string, value: string, ttlSeconds?: number): Promise<string> {
    try {
      const prefixedKey = this.prefixKey(key);
      this.logDebug('SET', { key: prefixedKey, ttl: ttlSeconds });
      
      if (ttlSeconds) {
        return await this.client.set(prefixedKey, value, 'EX', ttlSeconds);
      }
      return await this.client.set(prefixedKey, value);
    } catch (error) {
      this.handleError('SET', error);
    }
  }

  /**
   * Delete one or more keys
   * 
   * @param keys - Keys to delete
   * @returns Number of keys deleted
   */
  async del(...keys: string[]): Promise<number> {
    try {
      const prefixedKeys = keys.map(k => this.prefixKey(k));
      this.logDebug('DEL', { keys: prefixedKeys });
      return await this.client.del(...prefixedKeys);
    } catch (error) {
      this.handleError('DEL', error);
    }
  }

  /**
   * Increment a key's value
   * 
   * @param key - Key to increment
   * @returns New value after increment
   */
  async incr(key: string): Promise<number> {
    try {
      const prefixedKey = this.prefixKey(key);
      this.logDebug('INCR', { key: prefixedKey });
      return await this.client.incr(prefixedKey);
    } catch (error) {
      this.handleError('INCR', error);
    }
  }

  /**
   * Decrement a key's value
   * 
   * @param key - Key to decrement
   * @returns New value after decrement
   */
  async decr(key: string): Promise<number> {
    try {
      const prefixedKey = this.prefixKey(key);
      this.logDebug('DECR', { key: prefixedKey });
      return await this.client.decr(prefixedKey);
    } catch (error) {
      this.handleError('DECR', error);
    }
  }

  /**
   * Set expiration on a key
   * 
   * @param key - Key to set expiration on
   * @param seconds - TTL in seconds
   * @returns 1 if set, 0 if key doesn't exist
   */
  async expire(key: string, seconds: number): Promise<number> {
    try {
      const prefixedKey = this.prefixKey(key);
      this.logDebug('EXPIRE', { key: prefixedKey, seconds });
      return await this.client.expire(prefixedKey, seconds);
    } catch (error) {
      this.handleError('EXPIRE', error);
    }
  }

  /**
   * Get multiple values
   * 
   * @param keys - Keys to get
   * @returns Array of values (null for missing keys)
   */
  async mget(...keys: string[]): Promise<(string | null)[]> {
    try {
      const prefixedKeys = keys.map(k => this.prefixKey(k));
      this.logDebug('MGET', { keys: prefixedKeys });
      return await this.client.mget(...prefixedKeys);
    } catch (error) {
      this.handleError('MGET', error);
    }
  }

  /**
   * Add member to sorted set
   * 
   * @param key - Sorted set key
   * @param score - Score for sorting
   * @param member - Member to add
   * @returns Number of elements added
   */
  async zadd(key: string, score: number, member: string): Promise<number> {
    try {
      const prefixedKey = this.prefixKey(key);
      this.logDebug('ZADD', { key: prefixedKey, score, member });
      return await this.client.zadd(prefixedKey, score, member);
    } catch (error) {
      this.handleError('ZADD', error);
    }
  }

  /**
   * Get range from sorted set
   * 
   * @param key - Sorted set key
   * @param start - Start index
   * @param stop - Stop index (-1 for all)
   * @returns Array of members
   */
  async zrange(key: string, start: number, stop: number): Promise<string[]> {
    try {
      const prefixedKey = this.prefixKey(key);
      this.logDebug('ZRANGE', { key: prefixedKey, start, stop });
      return await this.client.zrange(prefixedKey, start, stop);
    } catch (error) {
      this.handleError('ZRANGE', error);
    }
  }

  /**
   * Remove members from sorted set by score range
   * 
   * @param key - Sorted set key
   * @param min - Minimum score
   * @param max - Maximum score
   * @returns Number of members removed
   */
  async zremrangebyscore(key: string, min: number, max: number): Promise<number> {
    try {
      const prefixedKey = this.prefixKey(key);
      this.logDebug('ZREMRANGEBYSCORE', { key: prefixedKey, min, max });
      return await this.client.zremrangebyscore(prefixedKey, min, max);
    } catch (error) {
      this.handleError('ZREMRANGEBYSCORE', error);
    }
  }

  /**
   * Get list length
   * 
   * @param key - List key
   * @returns Length of list
   */
  async llen(key: string): Promise<number> {
    try {
      const prefixedKey = this.prefixKey(key);
      this.logDebug('LLEN', { key: prefixedKey });
      return await this.client.llen(prefixedKey);
    } catch (error) {
      this.handleError('LLEN', error);
    }
  }

  /**
   * Get range from list
   * 
   * @param key - List key
   * @param start - Start index
   * @param stop - Stop index
   * @returns Array of elements
   */
  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    try {
      const prefixedKey = this.prefixKey(key);
      this.logDebug('LRANGE', { key: prefixedKey, start, stop });
      return await this.client.lrange(prefixedKey, start, stop);
    } catch (error) {
      this.handleError('LRANGE', error);
    }
  }

  /**
   * Remove elements from list
   * 
   * @param key - List key
   * @param count - Number to remove (0 for all)
   * @param value - Value to remove
   * @returns Number of elements removed
   */
  async lrem(key: string, count: number, value: string): Promise<number> {
    try {
      const prefixedKey = this.prefixKey(key);
      this.logDebug('LREM', { key: prefixedKey, count });
      return await this.client.lrem(prefixedKey, count, value);
    } catch (error) {
      this.handleError('LREM', error);
    }
  }

  /**
   * Push values to right of list
   * 
   * @param key - List key
   * @param values - Values to push
   * @returns Length of list after push
   */
  async rpush(key: string, ...values: string[]): Promise<number> {
    try {
      const prefixedKey = this.prefixKey(key);
      this.logDebug('RPUSH', { key: prefixedKey, values: values.length });
      return await this.client.rpush(prefixedKey, ...values);
    } catch (error) {
      this.handleError('RPUSH', error);
    }
  }

  /**
   * Push values to left of list
   * 
   * @param key - List key
   * @param values - Values to push
   * @returns Length of list after push
   */
  async lpush(key: string, ...values: string[]): Promise<number> {
    try {
      const prefixedKey = this.prefixKey(key);
      this.logDebug('LPUSH', { key: prefixedKey, values: values.length });
      return await this.client.lpush(prefixedKey, ...values);
    } catch (error) {
      this.handleError('LPUSH', error);
    }
  }

  /**
   * Execute Lua script by SHA
   * 
   * @param sha - Script SHA
   * @param numKeys - Number of keys
   * @param args - Script arguments
   * @returns Script result
   */
  async evalsha(sha: string, numKeys: number, ...args: (string | number)[]): Promise<RedisResult> {
    try {
      this.logDebug('EVALSHA', { sha, numKeys, args: args.length });
      return await this.client.evalsha(sha, numKeys, ...args);
    } catch (error) {
      this.handleError('EVALSHA', error);
    }
  }

  /**
   * Load Lua script
   * 
   * @param script - Lua script
   * @returns Script SHA
   */
  async scriptLoad(script: string): Promise<string> {
    try {
      this.logDebug('SCRIPT LOAD', { scriptLength: script.length });
      return await this.client.script('LOAD', script);
    } catch (error) {
      this.handleError('SCRIPT LOAD', error);
    }
  }

  /**
   * Check connection health
   * 
   * @returns true if connected and responding
   */
  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.client.ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }

  /**
   * Get the underlying Redis client
   * 
   * @returns Raw Redis client
   */
  getClient(): RedisClient {
    return this.client;
  }
}

/**
 * Error class for Redis operations
 */
export class CircuitBreakerRedisError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = 'CircuitBreakerRedisError';
    if (options?.cause) {
      this.cause = options.cause;
    }
  }
}

/**
 * Create a Redis configuration from environment variables
 * 
 * @returns Redis configuration object
 */
export function createRedisConfigFromEnv(): RedisConfig {
  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0', 10),
    tls: process.env.REDIS_TLS === 'true',
    connectTimeout: parseInt(process.env.REDIS_CONNECT_TIMEOUT || '5000', 10),
    commandTimeout: parseInt(process.env.REDIS_COMMAND_TIMEOUT || '5000', 10),
    maxRetries: parseInt(process.env.REDIS_MAX_RETRIES || '3', 10),
    keyPrefix: process.env.REDIS_KEY_PREFIX || 'circuit:',
  };
}

/**
 * Validate Redis configuration
 * 
 * @param config - Configuration to validate
 * @returns Validation result
 */
export function validateRedisConfig(config: RedisConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!config.host) {
    errors.push('Redis host is required');
  }

  if (!config.port || config.port < 1 || config.port > 65535) {
    errors.push('Redis port must be between 1 and 65535');
  }

  if (config.db !== undefined && (config.db < 0 || config.db > 15)) {
    errors.push('Redis database must be between 0 and 15');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
