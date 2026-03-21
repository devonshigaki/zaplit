/**
 * Redis Client
 * 
 * Singleton Redis client with connection pooling, error handling,
 * and graceful fallback when Redis is unavailable.
 * 
 * @module lib/redis/client
 * @access public
 */

import Redis from 'ioredis';
import { logger } from '@/lib/logger';

// Global singleton for hot reload in development
declare global {
  
  var __redisClient: Redis | undefined;
}

/**
 * Redis connection configuration
 */
interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db: number;
  tls: boolean;
  connectTimeout: number;
  commandTimeout: number;
  maxRetriesPerRequest: number;
}

/**
 * Get Redis configuration from environment variables
 */
function getRedisConfig(): RedisConfig | null {
  const host = process.env.REDIS_HOST;
  
  // If REDIS_HOST is not set, return null to indicate Redis is not configured
  if (!host) {
    return null;
  }

  return {
    host,
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0', 10),
    tls: process.env.REDIS_TLS === 'true',
    connectTimeout: parseInt(process.env.REDIS_CONNECT_TIMEOUT || '5000', 10),
    commandTimeout: parseInt(process.env.REDIS_COMMAND_TIMEOUT || '5000', 10),
    maxRetriesPerRequest: parseInt(process.env.REDIS_MAX_RETRIES || '3', 10),
  };
}

/**
 * Create a new Redis client instance
 */
function createRedisClient(config: RedisConfig): Redis {
  const client = new Redis({
    host: config.host,
    port: config.port,
    password: config.password,
    db: config.db,
    tls: config.tls ? {} : undefined,
    connectTimeout: config.connectTimeout,
    commandTimeout: config.commandTimeout,
    maxRetriesPerRequest: config.maxRetriesPerRequest,
    retryStrategy: (times) => {
      // Exponential backoff with max 2s delay
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
    reconnectOnError: (err) => {
      // Reconnect on specific error types
      const targetErrors = ['READONLY', 'ECONNREFUSED', 'ETIMEDOUT', 'ECONNRESET'];
      return targetErrors.some(e => err.message.includes(e));
    },
    lazyConnect: true, // Don't connect until first use
    enableOfflineQueue: false, // Fail fast when disconnected
  });

  // Event handlers for monitoring
  client.on('connect', () => {
    logger.info({ component: 'redis' }, 'Connected successfully');
  });

  client.on('ready', () => {
    logger.info({ component: 'redis' }, 'Client ready');
  });

  client.on('error', (err) => {
    logger.error({ component: 'redis', error: err }, 'Connection error');
  });

  client.on('close', () => {
    logger.info({ component: 'redis' }, 'Connection closed');
  });

  client.on('reconnecting', () => {
    logger.info({ component: 'redis' }, 'Reconnecting...');
  });

  return client;
}

/**
 * Get or create the Redis client singleton
 * 
 * Returns null if Redis is not configured (REDIS_HOST not set)
 * This allows graceful fallback to in-memory rate limiting
 * 
 * @returns Redis client instance or null if not configured
 */
export function getRedisClient(): Redis | null {
  const config = getRedisConfig();
  
  if (!config) {
    return null;
  }

  // Use global singleton for hot reload in development
  if (!global.__redisClient) {
    global.__redisClient = createRedisClient(config);
  }

  return global.__redisClient;
}

/**
 * Check if Redis is available and connected
 * 
 * @returns true if Redis is connected, false otherwise
 */
export async function isRedisAvailable(): Promise<boolean> {
  const client = getRedisClient();
  
  if (!client) {
    return false;
  }

  try {
    await client.ping();
    return true;
  } catch {
    return false;
  }
}

/**
 * Close Redis connection gracefully
 * 
 * Call this during application shutdown
 */
export async function closeRedisConnection(): Promise<void> {
  if (global.__redisClient) {
    await global.__redisClient.quit();
    global.__redisClient = undefined;
    console.log('[REDIS] Connection closed gracefully');
  }
}
