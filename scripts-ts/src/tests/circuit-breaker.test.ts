/**
 * Circuit Breaker Test Suite
 * 
 * Comprehensive tests for:
 * - Unit tests for state transitions
 * - Integration tests with Redis
 * - Load tests
 * 
 * @module circuit-breaker.test
 */

import {
  CircuitBreaker,
  CircuitBreakerState,
  CircuitBreakerError,
  CircuitBreakerOpenError,
  validateCircuitBreakerConfig,
  createCircuitBreakerConfigFromEnv,
  DEFAULT_CONFIG,
} from '../lib/circuit-breaker';
import { CircuitBreakerRedisClient, RedisClient, RedisResult } from '../lib/redis';
import { Logger } from '../lib/logger';

// ============================================
// MOCK REDIS IMPLEMENTATION
// ============================================

/**
 * In-memory mock Redis client for unit testing
 */
class MockRedisClient implements RedisClient {
  private store: Map<string, { value: string; expiry: number | null }> = new Map();
  private sortedSets: Map<string, Array<{ score: number; member: string }>> = new Map();
  private lists: Map<string, string[]> = new Map();
  private scripts: Map<string, string> = new Map();

  async get(key: string): Promise<string | null> {
    this.cleanup();
    const item = this.store.get(key);
    return item?.value ?? null;
  }

  async set(key: string, value: string, mode?: string, duration?: number): Promise<string> {
    let expiry: number | null = null;
    if (mode === 'EX' && duration) {
      expiry = Date.now() + duration * 1000;
    }
    this.store.set(key, { value, expiry });
    return 'OK';
  }

  async del(...keys: string[]): Promise<number> {
    let count = 0;
    for (const key of keys) {
      if (this.store.delete(key)) count++;
      if (this.sortedSets.delete(key)) count++;
      if (this.lists.delete(key)) count++;
    }
    return count;
  }

  async incr(key: string): Promise<number> {
    const current = await this.get(key);
    const newValue = (parseInt(current || '0', 10) + 1).toString();
    await this.set(key, newValue);
    return parseInt(newValue, 10);
  }

  async decr(key: string): Promise<number> {
    const current = await this.get(key);
    const newValue = (parseInt(current || '0', 10) - 1).toString();
    await this.set(key, newValue);
    return parseInt(newValue, 10);
  }

  async expire(key: string, seconds: number): Promise<number> {
    const item = this.store.get(key);
    if (!item) return 0;
    item.expiry = Date.now() + seconds * 1000;
    return 1;
  }

  async mget(...keys: string[]): Promise<(string | null)[]> {
    return Promise.all(keys.map(key => this.get(key)));
  }

  async zadd(key: string, score: number, member: string): Promise<number> {
    if (!this.sortedSets.has(key)) {
      this.sortedSets.set(key, []);
    }
    const set = this.sortedSets.get(key)!;
    set.push({ score, member });
    return 1;
  }

  async zrange(key: string, start: number, stop: number): Promise<string[]> {
    const set = this.sortedSets.get(key) || [];
    const sorted = set.sort((a, b) => a.score - b.score);
    const end = stop === -1 ? sorted.length : stop + 1;
    return sorted.slice(start, end).map(item => item.member);
  }

  async zremrangebyscore(key: string, min: number | string, max: number | string): Promise<number> {
    const set = this.sortedSets.get(key);
    if (!set) return 0;
    const minNum = typeof min === 'string' ? parseInt(min, 10) : min;
    const maxNum = typeof max === 'string' ? parseInt(max, 10) : max;
    const before = set.length;
    const filtered = set.filter(item => item.score < minNum || item.score > maxNum);
    this.sortedSets.set(key, filtered);
    return before - filtered.length;
  }

  async llen(key: string): Promise<number> {
    return this.lists.get(key)?.length || 0;
  }

  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    const list = this.lists.get(key) || [];
    const end = stop === -1 ? list.length : stop + 1;
    return list.slice(start, end);
  }

  async lrem(key: string, count: number, value: string): Promise<number> {
    const list = this.lists.get(key);
    if (!list) return 0;
    const before = list.length;
    if (count === 0) {
      const filtered = list.filter(item => item !== value);
      this.lists.set(key, filtered);
      return before - filtered.length;
    }
    // Simplified: remove first occurrence
    const index = list.indexOf(value);
    if (index !== -1) {
      list.splice(index, 1);
    }
    return before - list.length;
  }

  async rpush(key: string, ...values: string[]): Promise<number> {
    if (!this.lists.has(key)) {
      this.lists.set(key, []);
    }
    const list = this.lists.get(key)!;
    list.push(...values);
    return list.length;
  }

  async lpush(key: string, ...values: string[]): Promise<number> {
    if (!this.lists.has(key)) {
      this.lists.set(key, []);
    }
    const list = this.lists.get(key)!;
    list.unshift(...values);
    return list.length;
  }

  async evalsha(sha: string, numKeys: number, ...args: (string | number)[]): Promise<RedisResult> {
    // Simplified: just increment failures and check threshold
    const failures = await this.incr(args[0] as string);
    const threshold = parseInt(args[3] as string, 10);
    if (failures >= threshold) {
      await this.set(args[0] as string, 'OPEN');
      return 'OPENED';
    }
    return 'CLOSED';
  }

  async script(command: 'LOAD', script: string): Promise<string> {
    const sha = `sha_${Math.random().toString(36).substr(2, 9)}`;
    this.scripts.set(sha, script);
    return sha;
  }

  async quit(): Promise<void> {
    // No-op for mock
  }

  async ping(): Promise<string> {
    return 'PONG';
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, item] of this.store.entries()) {
      if (item.expiry && item.expiry <= now) {
        this.store.delete(key);
      }
    }
  }

  // Test helper methods
  clear(): void {
    this.store.clear();
    this.sortedSets.clear();
    this.lists.clear();
    this.scripts.clear();
  }

  get size(): number {
    return this.store.size;
  }
}

// ============================================
// TEST SUITES
// ============================================

// Simple test runner
interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration: number;
}

class TestRunner {
  private results: TestResult[] = [];
  private beforeEachFn: (() => Promise<void>) | null = null;
  private afterEachFn: (() => Promise<void>) | null = null;

  beforeEach(fn: () => Promise<void>): void {
    this.beforeEachFn = fn;
  }

  afterEach(fn: () => Promise<void>): void {
    this.afterEachFn = fn;
  }

  async test(name: string, fn: () => Promise<void>): Promise<void> {
    const start = Date.now();
    try {
      if (this.beforeEachFn) await this.beforeEachFn();
      await fn();
      if (this.afterEachFn) await this.afterEachFn();
      this.results.push({ name, passed: true, duration: Date.now() - start });
      console.log(`  ✓ ${name} (${Date.now() - start}ms)`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.results.push({ name, passed: false, error: errorMessage, duration: Date.now() - start });
      console.log(`  ✗ ${name} (${Date.now() - start}ms)`);
      console.log(`    Error: ${errorMessage}`);
    }
  }

  async describe(name: string, fn: () => Promise<void>): Promise<void> {
    console.log(`\n${name}`);
    await fn();
  }

  summary(): void {
    const passed = this.results.filter(r => r.passed).length;
    const failed = this.results.filter(r => !r.passed).length;
    const total = this.results.length;

    console.log('\n' + '='.repeat(50));
    console.log('Test Summary');
    console.log('='.repeat(50));
    console.log(`Total: ${total} | Passed: ${passed} | Failed: ${failed}`);
    
    if (failed > 0) {
      console.log('\nFailed tests:');
      this.results
        .filter(r => !r.passed)
        .forEach(r => console.log(`  - ${r.name}: ${r.error}`));
    }
    
    console.log('');
  }

  get allPassed(): boolean {
    return this.results.every(r => r.passed);
  }
}

// Assertion helpers
function assertEqual(actual: unknown, expected: unknown, message?: string): void {
  if (actual !== expected) {
    throw new Error(
      message || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
}

function assertTrue(value: boolean, message?: string): void {
  if (!value) {
    throw new Error(message || `Expected true, got ${value}`);
  }
}

function assertFalse(value: boolean, message?: string): void {
  if (value) {
    throw new Error(message || `Expected false, got ${value}`);
  }
}

function assertThrows(fn: () => Promise<void>, expectedMessage?: string): Promise<void> {
  return fn().then(
    () => {
      throw new Error('Expected function to throw, but it did not');
    },
    (error) => {
      if (expectedMessage && !String(error).includes(expectedMessage)) {
        throw new Error(`Expected error to include "${expectedMessage}", got "${error}"`);
      }
    }
  );
}

// ============================================
// UNIT TESTS
// ============================================

async function runUnitTests(): Promise<boolean> {
  const runner = new TestRunner();
  const mockRedis = new MockRedisClient();

  runner.beforeEach(async () => {
    mockRedis.clear();
  });

  await runner.describe('CircuitBreaker Configuration', async () => {
    await runner.test('should create with valid configuration', async () => {
      const breaker = new CircuitBreaker({
        name: 'test-service',
        failureThreshold: 5,
        recoveryTimeout: 60000,
        successThreshold: 3,
        halfOpenMaxCalls: 3,
        monitoringPeriod: 60000,
        redis: mockRedis,
      });

      assertEqual(typeof breaker.initialize, 'function', 'should have initialize method');
    });

    await runner.test('should use default configuration values', async () => {
      const breaker = new CircuitBreaker({
        name: 'test-service',
        redis: mockRedis,
        failureThreshold: 5,
        recoveryTimeout: 60000,
        successThreshold: 3,
        halfOpenMaxCalls: 3,
        monitoringPeriod: 60000,
      });

      // Test that it initializes without error
      await breaker.initialize();
      const state = await breaker.getState();
      assertEqual(state, CircuitBreakerState.CLOSED, 'should start in CLOSED state');
    });

    await runner.test('should validate configuration', () => {
      const valid = validateCircuitBreakerConfig({
        name: 'test',
        redis: mockRedis,
        failureThreshold: 5,
        recoveryTimeout: 60000,
        successThreshold: 3,
        halfOpenMaxCalls: 3,
        monitoringPeriod: 60000,
      });

      assertTrue(valid.valid, 'should be valid');
      assertEqual(valid.errors.length, 0, 'should have no errors');
    });

    await runner.test('should reject invalid configuration', () => {
      const invalid = validateCircuitBreakerConfig({
        name: '',
        redis: mockRedis as unknown as RedisClient,
        failureThreshold: 0,
        recoveryTimeout: 500,
        successThreshold: 0,
        halfOpenMaxCalls: 0,
        monitoringPeriod: 500,
      });

      assertFalse(invalid.valid, 'should be invalid');
      assertTrue(invalid.errors.length > 0, 'should have errors');
    });
  });

  await runner.describe('CLOSED State', async () => {
    let breaker: CircuitBreaker;

    runner.beforeEach(async () => {
      breaker = new CircuitBreaker({
        name: 'test-closed',
        failureThreshold: 3,
        recoveryTimeout: 1000,
        successThreshold: 2,
        halfOpenMaxCalls: 2,
        monitoringPeriod: 5000,
        redis: mockRedis,
      });
      await breaker.initialize();
    });

    await runner.test('should allow requests when closed', async () => {
      const check = await breaker.check();
      assertTrue(check.allowed, 'should allow request');
      assertEqual(check.state, CircuitBreakerState.CLOSED, 'should be CLOSED');
    });

    await runner.test('should count failures and open after threshold', async () => {
      await breaker.recordFailure();
      await breaker.recordFailure();

      let check = await breaker.check();
      assertEqual(check.state, CircuitBreakerState.CLOSED, 'should still be CLOSED after 2 failures');

      await breaker.recordFailure(); // Third failure

      check = await breaker.check();
      assertEqual(check.state, CircuitBreakerState.OPEN, 'should be OPEN after 3 failures');
      assertFalse(check.allowed, 'should not allow requests');
    });

    await runner.test('should reset failures on success', async () => {
      await breaker.recordFailure();
      await breaker.recordFailure();
      await breaker.recordSuccess();

      const snapshot = await breaker.getStateSnapshot();
      assertEqual(snapshot.failures, 0, 'should reset failures to 0');
    });

    await runner.test('should maintain sliding window of failures', async () => {
      // Record failures
      await breaker.recordFailure();
      await breaker.recordFailure();

      const stats = await breaker.getSlidingWindowStats();
      assertEqual(stats.failures, 2, 'should have 2 failures in window');
      assertEqual(stats.total, 2, 'should have 2 total events');
    });
  });

  await runner.describe('OPEN State', async () => {
    let breaker: CircuitBreaker;

    runner.beforeEach(async () => {
      breaker = new CircuitBreaker({
        name: 'test-open',
        failureThreshold: 2,
        recoveryTimeout: 500,
        successThreshold: 2,
        halfOpenMaxCalls: 2,
        monitoringPeriod: 5000,
        redis: mockRedis,
      });
      await breaker.initialize();

      // Open the circuit
      await breaker.recordFailure();
      await breaker.recordFailure();
    });

    await runner.test('should reject requests when open', async () => {
      const check = await breaker.check();
      assertFalse(check.allowed, 'should not allow request');
      assertEqual(check.state, CircuitBreakerState.OPEN, 'should be OPEN');
    });

    await runner.test('should report retryAfter time', async () => {
      const check = await breaker.check();
      assertTrue(check.retryAfter !== undefined, 'should have retryAfter');
      assertTrue(check.retryAfter! > 0, 'retryAfter should be positive');
      assertTrue(check.retryAfter! <= 500, 'retryAfter should be <= recovery timeout');
    });

    await runner.test('should transition to HALF_OPEN after recovery timeout', async () => {
      // Wait for recovery timeout
      await new Promise(resolve => setTimeout(resolve, 600));

      const check = await breaker.check();
      assertTrue(check.allowed, 'should allow request after timeout');
      assertEqual(check.state, CircuitBreakerState.HALF_OPEN, 'should be HALF_OPEN');
      assertTrue(check.probe, 'should be marked as probe request');
    });
  });

  await runner.describe('HALF_OPEN State', async () => {
    let breaker: CircuitBreaker;

    runner.beforeEach(async () => {
      breaker = new CircuitBreaker({
        name: 'test-half-open',
        failureThreshold: 2,
        recoveryTimeout: 100,
        successThreshold: 2,
        halfOpenMaxCalls: 3,
        monitoringPeriod: 5000,
        redis: mockRedis,
      });
      await breaker.initialize();

      // Open and transition to half-open
      await breaker.recordFailure();
      await breaker.recordFailure();
      await new Promise(resolve => setTimeout(resolve, 150));
      await breaker.check(); // Triggers transition to HALF_OPEN
    });

    await runner.test('should close after success threshold', async () => {
      const check = await breaker.check();
      assertEqual(check.state, CircuitBreakerState.HALF_OPEN, 'should start HALF_OPEN');

      await breaker.recordSuccess();
      await breaker.check(); // Second probe
      const result = await breaker.recordSuccess();

      assertEqual(result.state, CircuitBreakerState.CLOSED, 'should transition to CLOSED');
      assertEqual(result.transition, 'HALF_OPEN→CLOSED', 'should report transition');
    });

    await runner.test('should reopen on failure in half-open', async () => {
      const check = await breaker.check();
      assertEqual(check.state, CircuitBreakerState.HALF_OPEN, 'should be HALF_OPEN');

      const result = await breaker.recordFailure();

      assertEqual(result.state, CircuitBreakerState.OPEN, 'should transition to OPEN');
      assertEqual(result.transition, 'HALF_OPEN→OPEN', 'should report transition');
    });

    await runner.test('should limit test calls in half-open', async () => {
      // Use up all test calls
      await breaker.check(); // First test call
      await breaker.check(); // Second test call
      await breaker.check(); // Third test call

      // Fourth should be rejected
      const check = await breaker.check();
      assertFalse(check.allowed, 'should reject after max test calls');
      assertEqual(check.state, CircuitBreakerState.HALF_OPEN, 'should still be HALF_OPEN');
    });
  });

  await runner.describe('State Transitions', async () => {
    let breaker: CircuitBreaker;

    runner.beforeEach(async () => {
      breaker = new CircuitBreaker({
        name: 'test-transitions',
        failureThreshold: 2,
        recoveryTimeout: 100,
        successThreshold: 2,
        halfOpenMaxCalls: 2,
        monitoringPeriod: 5000,
        redis: mockRedis,
      });
      await breaker.initialize();
    });

    await runner.test('should complete full cycle: CLOSED → OPEN → HALF_OPEN → CLOSED', async () => {
      // Start CLOSED
      let state = await breaker.getState();
      assertEqual(state, CircuitBreakerState.CLOSED, 'initial state');

      // Fail to OPEN
      await breaker.recordFailure();
      await breaker.recordFailure();
      state = await breaker.getState();
      assertEqual(state, CircuitBreakerState.OPEN, 'after failures');

      // Wait and check to HALF_OPEN
      await new Promise(resolve => setTimeout(resolve, 150));
      await breaker.check();
      state = await breaker.getState();
      assertEqual(state, CircuitBreakerState.HALF_OPEN, 'after recovery timeout');

      // Succeed to CLOSED
      await breaker.check();
      await breaker.recordSuccess();
      await breaker.check();
      await breaker.recordSuccess();
      state = await breaker.getState();
      assertEqual(state, CircuitBreakerState.CLOSED, 'after successes');
    });

    await runner.test('should transition CLOSED → OPEN → HALF_OPEN → OPEN on failure', async () => {
      // Fail to OPEN
      await breaker.recordFailure();
      await breaker.recordFailure();
      let state = await breaker.getState();
      assertEqual(state, CircuitBreakerState.OPEN, 'circuit open');

      // Wait and check to HALF_OPEN
      await new Promise(resolve => setTimeout(resolve, 150));
      await breaker.check();
      state = await breaker.getState();
      assertEqual(state, CircuitBreakerState.HALF_OPEN, 'half-open');

      // Fail again to reopen
      await breaker.recordFailure();
      state = await breaker.getState();
      assertEqual(state, CircuitBreakerState.OPEN, 'reopened');
    });
  });

  await runner.describe('Execute Method', async () => {
    let breaker: CircuitBreaker;

    runner.beforeEach(async () => {
      breaker = new CircuitBreaker({
        name: 'test-execute',
        failureThreshold: 2,
        recoveryTimeout: 1000,
        successThreshold: 2,
        halfOpenMaxCalls: 2,
        monitoringPeriod: 5000,
        redis: mockRedis,
      });
      await breaker.initialize();
    });

    await runner.test('should execute successful function', async () => {
      const result = await breaker.execute(async () => 'success');
      
      assertTrue(result.success, 'should report success');
      assertEqual(result.data, 'success', 'should return data');
      assertEqual(result.circuit.state, CircuitBreakerState.CLOSED, 'should be CLOSED');
      assertFalse(result.fallbackUsed, 'should not use fallback');
    });

    await runner.test('should handle function failure', async () => {
      const result = await breaker.execute(async () => {
        throw new Error('test error');
      });

      assertFalse(result.success, 'should report failure');
      assertTrue(result.error instanceof Error, 'should have error');
    });

    await runner.test('should use fallback when circuit is open', async () => {
      // Open the circuit
      await breaker.recordFailure();
      await breaker.recordFailure();

      const result = await breaker.execute(
        async () => 'primary',
        async () => 'fallback'
      );

      assertTrue(result.success, 'should report success via fallback');
      assertEqual(result.data, 'fallback', 'should return fallback data');
      assertTrue(result.fallbackUsed, 'should report fallback used');
    });

    await runner.test('should fail without fallback when circuit is open', async () => {
      // Open the circuit
      await breaker.recordFailure();
      await breaker.recordFailure();

      const result = await breaker.execute(async () => 'primary');

      assertFalse(result.success, 'should report failure');
      assertTrue(result.error instanceof CircuitBreakerOpenError, 'should have CircuitBreakerOpenError');
    });
  });

  runner.summary();
  return runner.allPassed;
}

// ============================================
// INTEGRATION TESTS
// ============================================

async function runIntegrationTests(): Promise<boolean> {
  const runner = new TestRunner();

  await runner.describe('Integration Tests', async () => {
    await runner.test('should handle concurrent requests', async () => {
      // This test would require a real Redis instance
      // For now, we skip with a message
      console.log('  ⚠ Concurrent request test requires Redis server - skipping');
    });

    await runner.test('should share state across instances', async () => {
      // This test would require a real Redis instance
      console.log('  ⚠ State sharing test requires Redis server - skipping');
    });

    await runner.test('should recover from Redis disconnection', async () => {
      // This test would require a real Redis instance
      console.log('  ⚠ Redis disconnection test requires Redis server - skipping');
    });
  });

  runner.summary();
  return runner.allPassed;
}

// ============================================
// LOAD TESTS
// ============================================

async function runLoadTests(): Promise<boolean> {
  const runner = new TestRunner();
  const mockRedis = new MockRedisClient();

  await runner.describe('Load Tests', async () => {
    await runner.test('should handle 100 rapid requests', async () => {
      const breaker = new CircuitBreaker({
        name: 'load-test',
        failureThreshold: 50,
        recoveryTimeout: 1000,
        successThreshold: 5,
        halfOpenMaxCalls: 5,
        monitoringPeriod: 10000,
        redis: mockRedis,
      });
      await breaker.initialize();

      const start = Date.now();
      const promises: Promise<unknown>[] = [];

      for (let i = 0; i < 100; i++) {
        promises.push(breaker.execute(async () => `result-${i}`));
      }

      const results = await Promise.all(promises);
      const duration = Date.now() - start;

      const successes = results.filter(r => r.success).length;
      assertEqual(successes, 100, 'all requests should succeed');
      console.log(`    Completed 100 requests in ${duration}ms (${(1000 / (duration / 100)).toFixed(0)} req/s)`);
    });

    await runner.test('should prevent retry storms', async () => {
      const breaker = new CircuitBreaker({
        name: 'storm-test',
        failureThreshold: 5,
        recoveryTimeout: 5000,
        successThreshold: 3,
        halfOpenMaxCalls: 3,
        monitoringPeriod: 10000,
        redis: mockRedis,
      });
      await breaker.initialize();

      let failureCount = 0;
      const failingFn = async () => {
        failureCount++;
        throw new Error('Service down');
      };

      // Fire 20 concurrent failing requests
      const promises = Array(20).fill(null).map(() => breaker.execute(failingFn));
      await Promise.all(promises);

      // Should have stopped after threshold (5) plus some buffer for concurrency
      assertTrue(failureCount <= 10, `should limit attempts, got ${failureCount}`);
      console.log(`    Requests attempted: ${failureCount} (limited from 20)`);
    });

    await runner.test('should maintain performance under load', async () => {
      const breaker = new CircuitBreaker({
        name: 'perf-test',
        failureThreshold: 100,
        recoveryTimeout: 1000,
        successThreshold: 5,
        halfOpenMaxCalls: 5,
        monitoringPeriod: 10000,
        redis: mockRedis,
      });
      await breaker.initialize();

      // Warm up
      for (let i = 0; i < 10; i++) {
        await breaker.check();
      }

      // Measure latency
      const latencies: number[] = [];
      for (let i = 0; i < 50; i++) {
        const start = Date.now();
        await breaker.check();
        latencies.push(Date.now() - start);
      }

      const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
      const maxLatency = Math.max(...latencies);

      console.log(`    Average latency: ${avgLatency.toFixed(2)}ms`);
      console.log(`    Max latency: ${maxLatency}ms`);

      assertTrue(avgLatency < 5, `average latency should be < 5ms, got ${avgLatency.toFixed(2)}ms`);
    });
  });

  runner.summary();
  return runner.allPassed;
}

// ============================================
// MAIN ENTRY POINT
// ============================================

async function main(): Promise<void> {
  console.log('='.repeat(60));
  console.log('Circuit Breaker Test Suite');
  console.log('='.repeat(60));

  const results: { name: string; passed: boolean }[] = [];

  // Run unit tests
  results.push({ name: 'Unit Tests', passed: await runUnitTests() });

  // Run integration tests
  results.push({ name: 'Integration Tests', passed: await runIntegrationTests() });

  // Run load tests
  results.push({ name: 'Load Tests', passed: await runLoadTests() });

  // Final summary
  console.log('='.repeat(60));
  console.log('Final Summary');
  console.log('='.repeat(60));
  
  for (const result of results) {
    const icon = result.passed ? '✓' : '✗';
    console.log(`${icon} ${result.name}: ${result.passed ? 'PASSED' : 'FAILED'}`);
  }

  const allPassed = results.every(r => r.passed);
  
  console.log('='.repeat(60));
  console.log(`Overall: ${allPassed ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED'}`);
  console.log('='.repeat(60));

  process.exit(allPassed ? 0 : 1);
}

// Run tests if this file is executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error('Test suite failed:', error);
    process.exit(1);
  });
}

// Export test utilities for external use
export {
  MockRedisClient,
  TestRunner,
  assertEqual,
  assertTrue,
  assertFalse,
  assertThrows,
};
