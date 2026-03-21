/**
 * Shared library exports for Zaplit Scripts TypeScript
 */

export { 
  logger, 
  createCheckLogger,
  Logger,
  type LogLevel 
} from './logger.js';

export { 
  execCommand, 
  execCommandSilent, 
  CommandExecutor,
  type ExecResult, 
  type ExecOptions 
} from './exec.js';

export { 
  GCloudClient, 
  createGCloudClient,
  type GCloudConfig,
  type VMInstance,
  type DiskInfo 
} from './gcloud.js';

// Circuit Breaker exports
export {
  CircuitBreaker,
  CircuitBreakerState,
  CircuitBreakerError,
  CircuitBreakerOpenError,
  CircuitBreakerTimeoutError,
  validateCircuitBreakerConfig,
  createCircuitBreakerConfigFromEnv,
  DEFAULT_CONFIG,
  type CircuitBreakerConfig,
  type CircuitCheckResult,
  type CircuitRecordResult,
  type CircuitStateSnapshot,
  type SlidingWindowStats,
  type CircuitExecutionResult,
} from './circuit-breaker.js';

// Redis client exports
export {
  CircuitBreakerRedisClient,
  CircuitBreakerRedisError,
  createRedisConfigFromEnv,
  validateRedisConfig,
  type RedisConfig,
  type RedisClient,
  type RedisResult,
  type RedisClientOptions,
} from './redis.js';
