/**
 * Dead Letter Queue (DLQ) System Tests
 * 
 * Comprehensive test suite covering:
 * - Database integration tests
 * - Retry logic and exponential backoff
 * - API endpoint functionality
 * - Poison message detection
 * 
 * Usage:
 *   npm test -- src/tests/dlq.test.ts
 *   # or
 *   ts-node src/tests/dlq.test.ts
 */

import { Pool } from 'pg';
import { Logger } from '../lib/logger';
import { DlqManager } from '../dr/dlq-api';
import * as RetryProcessor from '../dr/retry-processor';
import {
  DlqStatus,
  FailureCategory,
  DlqEntry,
  RetryHistoryEntry
} from '../dlq/types';

// ============================================================================
// Test Configuration
// ============================================================================

const TEST_DATABASE_URL = process.env.TEST_DLQ_DATABASE_URL || process.env.DLQ_DATABASE_URL;
const TEST_TIMEOUT = 30000; // 30 seconds

if (!TEST_DATABASE_URL) {
  console.error('ERROR: TEST_DLQ_DATABASE_URL or DLQ_DATABASE_URL environment variable required');
  process.exit(1);
}

// ============================================================================
// Test Utilities
// ============================================================================

const logger = new Logger({ prefix: 'DLQ-TEST' });

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration: number;
}

class TestRunner {
  private results: TestResult[] = [];
  private pool: Pool;
  private dlqManager: DlqManager;

  constructor() {
    this.pool = new Pool({
      connectionString: TEST_DATABASE_URL,
      max: 5,
    });
    this.dlqManager = new DlqManager(TEST_DATABASE_URL);
  }

  async setup(): Promise<void> {
    logger.info('Setting up test environment...');
    
    // Clean up any existing test data
    await this.pool.query("DELETE FROM dlq_audit_log WHERE dlq_entry_id IN (SELECT id FROM form_submission_dlq WHERE execution_id LIKE 'test-%')");
    await this.pool.query("DELETE FROM form_submission_dlq WHERE execution_id LIKE 'test-%'");
    await this.pool.query("DELETE FROM form_submission_dlq_archive WHERE execution_id LIKE 'test-%'");
    
    logger.success('Test environment ready');
  }

  async teardown(): Promise<void> {
    logger.info('Cleaning up test environment...');
    
    // Clean up test data
    await this.pool.query("DELETE FROM dlq_audit_log WHERE dlq_entry_id IN (SELECT id FROM form_submission_dlq WHERE execution_id LIKE 'test-%')");
    await this.pool.query("DELETE FROM form_submission_dlq WHERE execution_id LIKE 'test-%'");
    await this.pool.query("DELETE FROM form_submission_dlq_archive WHERE execution_id LIKE 'test-%'");
    
    await this.dlqManager.close();
    await this.pool.end();
    
    logger.success('Test environment cleaned up');
  }

  async test(name: string, fn: () => Promise<void>): Promise<void> {
    const startTime = Date.now();
    
    try {
      await fn();
      this.results.push({
        name,
        passed: true,
        duration: Date.now() - startTime
      });
      logger.success(`✓ ${name}`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.results.push({
        name,
        passed: false,
        error: errorMsg,
        duration: Date.now() - startTime
      });
      logger.error(`✗ ${name}: ${errorMsg}`);
    }
  }

  async runAllTests(): Promise<void> {
    await this.setup();

    logger.header('Running DLQ Database Integration Tests');
    await this.testDatabaseIntegration();

    logger.header('Running DLQ Retry Logic Tests');
    await this.testRetryLogic();

    logger.header('Running DLQ API Tests');
    await this.testApiMethods();

    logger.header('Running DLQ Poison Message Tests');
    await this.testPoisonMessageDetection();

    await this.teardown();
    this.printSummary();
  }

  // ============================================================================
  // Test Suites
  // ============================================================================

  private async testDatabaseIntegration(): Promise<void> {
    // Test 1: Create DLQ entry
    await this.test('should create a new DLQ entry', async () => {
      const result = await this.pool.query(`
        INSERT INTO form_submission_dlq (
          execution_id, original_payload, error_message, error_category, status
        ) VALUES ($1, $2, $3, $4, $5)
        RETURNING id
      `, [
        'test-create-001',
        JSON.stringify({ body: { data: { email: 'test@example.com' } } }),
        'Test error message',
        FailureCategory.TRANSIENT,
        DlqStatus.PENDING_RETRY
      ]);

      if (!result.rows[0].id) {
        throw new Error('Failed to create DLQ entry');
      }
    });

    // Test 2: Query by status
    await this.test('should query entries by status', async () => {
      const result = await this.pool.query(`
        SELECT * FROM form_submission_dlq 
        WHERE execution_id = 'test-create-001'
      `);

      if (result.rows.length !== 1) {
        throw new Error(`Expected 1 row, got ${result.rows.length}`);
      }

      if (result.rows[0].status !== DlqStatus.PENDING_RETRY) {
        throw new Error(`Expected status PENDING_RETRY, got ${result.rows[0].status}`);
      }
    });

    // Test 3: Update status
    await this.test('should update entry status', async () => {
      const updateResult = await this.pool.query(`
        UPDATE form_submission_dlq 
        SET status = 'RESOLVED', resolved_at = NOW()
        WHERE execution_id = 'test-create-001'
        RETURNING status
      `);

      if (updateResult.rows[0].status !== DlqStatus.RESOLVED) {
        throw new Error('Failed to update status');
      }
    });

    // Test 4: JSONB payload storage
    await this.test('should store and retrieve JSONB payload', async () => {
      const testPayload = {
        body: {
          data: {
            email: 'jsonb@example.com',
            name: 'Test User',
            nested: { key: 'value', array: [1, 2, 3] }
          }
        }
      };

      await this.pool.query(`
        INSERT INTO form_submission_dlq (
          execution_id, original_payload, error_message, error_category
        ) VALUES ($1, $2, $3, $4)
      `, [
        'test-jsonb-001',
        JSON.stringify(testPayload),
        'JSONB test error',
        FailureCategory.TRANSIENT
      ]);

      const result = await this.pool.query(`
        SELECT original_payload FROM form_submission_dlq 
        WHERE execution_id = 'test-jsonb-001'
      `);

      const retrievedPayload = result.rows[0].original_payload;
      if (retrievedPayload.body.data.email !== 'jsonb@example.com') {
        throw new Error('JSONB payload not stored/retrieved correctly');
      }
    });

    // Test 5: Retry history
    await this.test('should append to retry history', async () => {
      const historyEntry: RetryHistoryEntry = {
        attempt_number: 1,
        attempted_at: new Date().toISOString(),
        result: 'failed',
        error: 'Test retry error'
      };

      await this.pool.query(`
        UPDATE form_submission_dlq 
        SET retry_history = retry_history || $1::jsonb,
            retry_count = 1
        WHERE execution_id = 'test-create-001'
      `, [JSON.stringify([historyEntry])]);

      const result = await this.pool.query(`
        SELECT retry_history FROM form_submission_dlq 
        WHERE execution_id = 'test-create-001'
      `);

      const history = result.rows[0].retry_history;
      if (!Array.isArray(history) || history.length === 0) {
        throw new Error('Retry history not updated correctly');
      }
    });

    // Test 6: Archive function
    await this.test('should archive old entries', async () => {
      // Insert old resolved entry
      await this.pool.query(`
        INSERT INTO form_submission_dlq (
          execution_id, original_payload, error_message, error_category,
          status, resolved_at, created_at, updated_at
        ) VALUES (
          'test-archive-001',
          '{}',
          'Old error',
          'TRANSIENT',
          'RESOLVED',
          NOW() - INTERVAL '40 days',
          NOW() - INTERVAL '40 days',
          NOW() - INTERVAL '40 days'
        )
      `);

      const result = await this.pool.query(`
        SELECT archived_count FROM archive_resolved_items(30)
      `);

      const archivedCount = parseInt(result.rows[0].archived_count, 10);
      if (archivedCount < 1) {
        throw new Error(`Expected at least 1 archived entry, got ${archivedCount}`);
      }

      // Verify entry moved to archive
      const archiveResult = await this.pool.query(`
        SELECT * FROM form_submission_dlq_archive 
        WHERE execution_id = 'test-archive-001'
      `);

      if (archiveResult.rows.length !== 1) {
        throw new Error('Entry not found in archive table');
      }
    });

    // Test 7: Statistics view
    await this.test('should return statistics from view', async () => {
      const result = await this.pool.query(`
        SELECT * FROM dlq_statistics LIMIT 1
      `);

      if (result.rows.length === 0) {
        throw new Error('Statistics view returned no results');
      }
    });
  }

  private async testRetryLogic(): Promise<void> {
    // Test 1: Exponential backoff calculation
    await this.test('should calculate exponential backoff', async () => {
      const retry1 = RetryProcessor.calculateNextRetry(0, FailureCategory.TRANSIENT);
      const retry2 = RetryProcessor.calculateNextRetry(1, FailureCategory.TRANSIENT);
      const retry3 = RetryProcessor.calculateNextRetry(2, FailureCategory.TRANSIENT);

      // Each retry should be roughly double the previous (with jitter)
      // Allow for 30% variance due to jitter
      if (retry1.delayMinutes < 4 || retry1.delayMinutes > 7) {
        throw new Error(`First retry delay ${retry1.delayMinutes}m out of expected range (4-7m)`);
      }

      if (retry2.delayMinutes < 8 || retry2.delayMinutes > 13) {
        throw new Error(`Second retry delay ${retry2.delayMinutes}m out of expected range (8-13m)`);
      }

      if (retry3.delayMinutes < 16 || retry3.delayMinutes > 24) {
        throw new Error(`Third retry delay ${retry3.delayMinutes}m out of expected range (16-24m)`);
      }
    });

    // Test 2: Category-specific multipliers
    await this.test('should apply category-specific backoff multipliers', async () => {
      const transientRetry = RetryProcessor.calculateNextRetry(0, FailureCategory.TRANSIENT);
      const rateLimitRetry = RetryProcessor.calculateNextRetry(0, FailureCategory.RATE_LIMIT);

      // RATE_LIMIT should have 2x multiplier
      if (rateLimitRetry.delayMinutes < transientRetry.delayMinutes * 1.5) {
        throw new Error('RATE_LIMIT multiplier not applied correctly');
      }
    });

    // Test 3: Max delay cap
    await this.test('should cap maximum delay at 120 minutes', async () => {
      // At retry count 4 with TRANSIENT category: 5 * 2^4 = 80 minutes (under cap)
      // At retry count 5 with TRANSIENT category: 5 * 2^5 = 160 minutes (should be capped at 120)
      const retryHigh = RetryProcessor.calculateNextRetry(5, FailureCategory.TRANSIENT);

      if (retryHigh.delayMinutes > 125) { // Allow small jitter
        throw new Error(`Delay ${retryHigh.delayMinutes}m exceeds max cap of 120m`);
      }
    });

    // Test 4: Next retry timestamp calculation
    await this.test('should calculate valid next retry timestamp', async () => {
      const retry = RetryProcessor.calculateNextRetry(0, FailureCategory.TRANSIENT);
      const nextRetryDate = new Date(retry.nextRetryAt);
      const now = new Date();

      if (isNaN(nextRetryDate.getTime())) {
        throw new Error('Invalid next retry timestamp');
      }

      if (nextRetryDate <= now) {
        throw new Error('Next retry timestamp should be in the future');
      }
    });
  }

  private async testApiMethods(): Promise<void> {
    let testEntryId: string;

    // Setup: Create a test entry
    await this.test('API: should create test entry', async () => {
      const result = await this.pool.query(`
        INSERT INTO form_submission_dlq (
          execution_id, original_payload, error_message, error_category, status
        ) VALUES ($1, $2, $3, $4, $5)
        RETURNING id
      `, [
        'test-api-001',
        JSON.stringify({ body: { data: { email: 'api@test.com' } } }),
        'API test error',
        FailureCategory.NETWORK,
        DlqStatus.PENDING_RETRY
      ]);

      testEntryId = result.rows[0].id;
    });

    // Test 1: Get entry by ID
    await this.test('API: should get entry by ID', async () => {
      const entry = await this.dlqManager.getEntryById(testEntryId);

      if (!entry) {
        throw new Error('Entry not found');
      }

      if (entry.execution_id !== 'test-api-001') {
        throw new Error('Wrong entry returned');
      }
    });

    // Test 2: Query with filters
    await this.test('API: should query entries with filters', async () => {
      const entries = await this.dlqManager.getEntries({
        status: DlqStatus.PENDING_RETRY,
        errorCategory: FailureCategory.NETWORK,
        limit: 10
      });

      if (entries.length === 0) {
        throw new Error('No entries returned from filtered query');
      }
    });

    // Test 3: Search by email
    await this.test('API: should search by email', async () => {
      const entries = await this.dlqManager.searchByEmail('api@test.com');

      if (entries.length === 0) {
        throw new Error('No entries found for email');
      }
    });

    // Test 4: Update status
    await this.test('API: should update entry status', async () => {
      const success = await this.dlqManager.updateStatus(
        testEntryId,
        DlqStatus.MANUAL_REVIEW,
        'Testing status update'
      );

      if (!success) {
        throw new Error('Failed to update status');
      }

      // Verify update
      const entry = await this.dlqManager.getEntryById(testEntryId);
      if (entry?.status !== DlqStatus.MANUAL_REVIEW) {
        throw new Error('Status not updated correctly');
      }
    });

    // Test 5: Assign to user
    await this.test('API: should assign entry to user', async () => {
      const success = await this.dlqManager.assignTo(
        testEntryId,
        'test-engineer',
        'Assigned for investigation'
      );

      if (!success) {
        throw new Error('Failed to assign entry');
      }

      const entry = await this.dlqManager.getEntryById(testEntryId);
      if (entry?.assigned_to !== 'test-engineer') {
        throw new Error('Assignment not saved correctly');
      }
    });

    // Test 6: Add notes
    await this.test('API: should add review notes', async () => {
      const success = await this.dlqManager.addNotes(
        testEntryId,
        'Additional investigation notes',
        'test-user'
      );

      if (!success) {
        throw new Error('Failed to add notes');
      }

      const entry = await this.dlqManager.getEntryById(testEntryId);
      if (!entry?.review_notes?.includes('Additional investigation notes')) {
        throw new Error('Notes not saved correctly');
      }
    });

    // Test 7: Get statistics
    await this.test('API: should get DLQ statistics', async () => {
      const stats = await this.dlqManager.getStatistics();

      if (typeof stats.pendingRetryCount !== 'number') {
        throw new Error('Statistics not returned correctly');
      }
    });

    // Test 8: Manual retry (dry run)
    await this.test('API: should validate manual retry (dry run)', async () => {
      const response = await this.dlqManager.manualRetry(testEntryId, {
        dryRun: true,
        notes: 'Test dry run'
      });

      if (!response.success) {
        throw new Error(`Dry run validation failed: ${response.error}`);
      }

      if (!response.result || typeof response.result !== 'object') {
        throw new Error('Dry run result not returned');
      }
    });

    // Test 9: Health check
    await this.test('API: should perform health check', async () => {
      const health = await this.dlqManager.healthCheck();

      if (!health.timestamp) {
        throw new Error('Health check missing timestamp');
      }

      if (!health.checks.database) {
        throw new Error('Health check missing database check');
      }
    });
  }

  private async testPoisonMessageDetection(): Promise<void> {
    // Test 1: Max retries exceeded
    await this.test('Poison: should detect max retries exceeded', async () => {
      const result = RetryProcessor.detectPoisonMessage(
        'Some error',
        5,
        FailureCategory.TRANSIENT
      );

      if (!result.isPoison) {
        throw new Error('Should detect as poison when max retries exceeded');
      }

      if (result.reason !== 'Max retries exceeded') {
        throw new Error(`Wrong reason: ${result.reason}`);
      }
    });

    // Test 2: Validation category is poison
    await this.test('Poison: should detect validation errors as poison', async () => {
      const result = RetryProcessor.detectPoisonMessage(
        'Invalid input',
        0,
        FailureCategory.VALIDATION
      );

      if (!result.isPoison) {
        throw new Error('Should detect VALIDATION as poison');
      }

      if (result.suggestedAction !== 'discard') {
        throw new Error('Should suggest discard for validation errors');
      }
    });

    // Test 3: Permanent category is poison
    await this.test('Poison: should detect permanent errors as poison', async () => {
      const result = RetryProcessor.detectPoisonMessage(
        'Not found',
        0,
        FailureCategory.PERMANENT
      );

      if (!result.isPoison) {
        throw new Error('Should detect PERMANENT as poison');
      }

      if (result.suggestedAction !== 'manual_review') {
        throw new Error('Should suggest manual_review for permanent errors');
      }
    });

    // Test 4: Poison pattern matching
    await this.test('Poison: should detect poison patterns in message', async () => {
      const poisonMessages = [
        'invalid json format',
        'schema validation failed',
        'required field missing: email',
        'malformed payload received',
        'cannot parse the request'
      ];

      for (const msg of poisonMessages) {
        const result = RetryProcessor.detectPoisonMessage(
          msg,
          1,
          FailureCategory.UNKNOWN
        );

        if (!result.isPoison) {
          throw new Error(`Should detect as poison: "${msg}"`);
        }
      }
    });

    // Test 5: Retryable message
    await this.test('Poison: should allow retryable messages', async () => {
      const result = RetryProcessor.detectPoisonMessage(
        'Connection timeout to CRM API',
        1,
        FailureCategory.NETWORK
      );

      if (result.isPoison) {
        throw new Error('Should not detect network timeout as poison');
      }

      if (result.suggestedAction !== 'retry') {
        throw new Error('Should suggest retry for network errors');
      }
    });
  }

  // ============================================================================
  // Summary
  // ============================================================================

  private printSummary(): void {
    const total = this.results.length;
    const passed = this.results.filter(r => r.passed).length;
    const failed = total - passed;

    logger.summary('Test Summary', [
      { label: 'Total Tests', status: 'info', message: String(total) },
      { label: 'Passed', status: 'success', message: String(passed) },
      { label: 'Failed', status: failed > 0 ? 'error' : 'success', message: String(failed) }
    ]);

    if (failed > 0) {
      console.log('\nFailed Tests:');
      this.results
        .filter(r => !r.passed)
        .forEach(r => {
          console.log(`  - ${r.name}`);
          console.log(`    Error: ${r.error}`);
        });
      process.exit(1);
    }
  }
}

// ============================================================================
// Main Entry Point
// ============================================================================

async function main(): Promise<void> {
  const runner = new TestRunner();
  
  try {
    await runner.runAllTests();
    logger.success('All tests completed successfully');
    process.exit(0);
  } catch (error) {
    logger.error(`Test runner failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

// Run tests if called directly
if (require.main === module) {
  main();
}

export { TestRunner };
