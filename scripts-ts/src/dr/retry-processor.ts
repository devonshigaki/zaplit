/**
 * Dead Letter Queue (DLQ) Retry Processor
 * 
 * Scheduled service that processes failed form submissions and attempts retry
 * with exponential backoff and jitter to prevent thundering herd.
 * 
 * Usage:
 *   ts-node src/dr/retry-processor.ts [--dry-run] [--once]
 * 
 * Environment Variables:
 *   DLQ_DATABASE_URL - PostgreSQL connection string (required)
 *   N8N_WEBHOOK_URL - Base URL for n8n webhooks (required)
 *   DLQ_RETRY_PATH - Webhook path for retry submissions (default: /webhook/retry-submission)
 *   DLQ_BATCH_SIZE - Number of items to process per run (default: 50)
 *   DLQ_LOG_LEVEL - Logging level: debug|info|warn|error (default: info)
 */

import { Pool, PoolClient, QueryResult } from 'pg';
import { Logger } from '../lib/logger';
import {
  DlqEntry,
  DlqStatus,
  FailureCategory,
  RetryConfig,
  NextRetryCalculation,
  ProcessBatchResult,
  RetryResult,
  RetryHistoryEntry,
  PoisonMessageConfig,
  PoisonMessageResult
} from '../dlq/types';

// ============================================================================
// Configuration
// ============================================================================

const RETRY_CONFIG: RetryConfig = {
  baseDelayMinutes: 5,
  maxDelayMinutes: 120,
  maxRetries: 5,
  jitterFactor: 0.1,
  categoryMultipliers: {
    [FailureCategory.TRANSIENT]: 1.0,
    [FailureCategory.RATE_LIMIT]: 2.0,
    [FailureCategory.DEPENDENCY]: 1.5,
    [FailureCategory.NETWORK]: 1.0,
    [FailureCategory.PERMANENT]: 0,
    [FailureCategory.VALIDATION]: 0,
    [FailureCategory.AUTHENTICATION]: 0.5,
    [FailureCategory.UNKNOWN]: 1.0,
    DEFAULT: 1.0
  }
};

const POISON_MESSAGE_CONFIG: PoisonMessageConfig = {
  maxRetries: 5,
  poisonPatterns: [
    'invalid json',
    'schema validation failed',
    'required field missing',
    'malformed payload',
    'cannot parse',
    'invalid format',
    'validation error'
  ],
  immediatePoisonCategories: [
    FailureCategory.VALIDATION,
    FailureCategory.PERMANENT
  ]
};

// ============================================================================
// Logger Setup
// ============================================================================

const logger = new Logger({ prefix: 'DLQ-RETRY' });

// ============================================================================
// Database Connection
// ============================================================================

class DatabaseConnection {
  private pool: Pool | null = null;

  async connect(): Promise<Pool> {
    if (this.pool) return this.pool;

    const databaseUrl = process.env.DLQ_DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DLQ_DATABASE_URL environment variable is required');
    }

    this.pool = new Pool({
      connectionString: databaseUrl,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    // Handle pool errors
    this.pool.on('error', (err) => {
      logger.error(`Unexpected database pool error: ${err.message}`);
    });

    logger.info('Database connection pool initialized');
    return this.pool;
  }

  async end(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      logger.info('Database connection pool closed');
    }
  }

  async query<T = unknown>(sql: string, params?: unknown[]): Promise<QueryResult<T>> {
    const pool = await this.connect();
    return pool.query(sql, params);
  }

  async getClient(): Promise<PoolClient> {
    const pool = await this.connect();
    return pool.connect();
  }
}

const db = new DatabaseConnection();

// ============================================================================
// Retry Logic
// ============================================================================

/**
 * Calculate next retry timestamp with exponential backoff and jitter
 */
export function calculateNextRetry(
  retryCount: number,
  errorCategory: FailureCategory = FailureCategory.UNKNOWN
): NextRetryCalculation {
  const multiplier = RETRY_CONFIG.categoryMultipliers[errorCategory] ?? 
                     RETRY_CONFIG.categoryMultipliers.DEFAULT;
  
  // Calculate base delay with exponential backoff
  const baseDelay = RETRY_CONFIG.baseDelayMinutes * multiplier;
  const exponentialDelay = baseDelay * Math.pow(2, retryCount);
  
  // Apply max cap
  const cappedDelay = Math.min(exponentialDelay, RETRY_CONFIG.maxDelayMinutes);
  
  // Add jitter (±10%) to prevent thundering herd
  const jitter = cappedDelay * RETRY_CONFIG.jitterFactor * (Math.random() * 2 - 1);
  const finalDelay = cappedDelay + jitter;
  
  // Calculate next retry timestamp
  const nextRetryAt = new Date(Date.now() + finalDelay * 60000);
  
  return {
    delayMinutes: Math.round(finalDelay),
    nextRetryAt: nextRetryAt.toISOString(),
    attemptNumber: retryCount + 1
  };
}

/**
 * Check if a message is a poison message (should not be retried)
 */
export function detectPoisonMessage(
  errorMessage: string,
  retryCount: number,
  category: FailureCategory
): PoisonMessageResult {
  const errorMsg = (errorMessage || '').toLowerCase();
  
  // Check if max retries exceeded
  if (retryCount >= POISON_MESSAGE_CONFIG.maxRetries) {
    return {
      isPoison: true,
      reason: 'Max retries exceeded',
      suggestedAction: 'manual_review'
    };
  }
  
  // Check for immediate poison categories
  if (POISON_MESSAGE_CONFIG.immediatePoisonCategories.includes(category)) {
    return {
      isPoison: true,
      reason: `Immediate poison category: ${category}`,
      suggestedAction: category === FailureCategory.VALIDATION ? 'discard' : 'manual_review'
    };
  }
  
  // Check error message against poison patterns
  const matchesPoisonPattern = POISON_MESSAGE_CONFIG.poisonPatterns.some(pattern =>
    errorMsg.includes(pattern.toLowerCase())
  );
  
  if (matchesPoisonPattern) {
    return {
      isPoison: true,
      reason: 'Error matches poison pattern',
      suggestedAction: 'manual_review'
    };
  }
  
  return {
    isPoison: false,
    reason: 'Message appears retryable',
    suggestedAction: 'retry'
  };
}

// ============================================================================
// Database Operations
// ============================================================================

/**
 * Query DLQ entries ready for retry
 */
async function getPendingRetries(limit: number = 50): Promise<DlqEntry[]> {
  const result = await db.query<DlqEntry>(`
    SELECT 
      id, execution_id, original_payload, normalized_payload,
      error_message, error_stack, error_category, failed_node, http_status_code,
      status, retry_count, max_retries,
      first_failure_at, last_failure_at, next_retry_at, resolved_at,
      retry_history, source_ip, user_agent, form_type,
      workflow_version, environment, n8n_instance_id,
      assigned_to, review_notes, created_at, updated_at
    FROM form_submission_dlq
    WHERE status = 'PENDING_RETRY'
      AND next_retry_at <= NOW()
    ORDER BY next_retry_at ASC, created_at ASC
    LIMIT $1
    FOR UPDATE SKIP LOCKED
  `, [limit]);

  return result.rows.map(row => ({
    ...row,
    retry_history: typeof row.retry_history === 'string' 
      ? JSON.parse(row.retry_history) 
      : row.retry_history || []
  }));
}

/**
 * Update DLQ entry status to IN_PROGRESS
 */
async function markInProgress(id: string): Promise<void> {
  await db.query(`
    UPDATE form_submission_dlq 
    SET status = 'IN_PROGRESS', updated_at = NOW()
    WHERE id = $1
  `, [id]);
}

/**
 * Mark DLQ entry as resolved after successful retry
 */
async function markResolved(
  id: string, 
  retryCount: number,
  processingTimeMs: number
): Promise<void> {
  const historyEntry: RetryHistoryEntry = {
    attempt_number: retryCount + 1,
    attempted_at: new Date().toISOString(),
    result: 'success',
    processing_time_ms: processingTimeMs
  };

  await db.query(`
    UPDATE form_submission_dlq 
    SET 
      status = 'RESOLVED',
      resolved_at = NOW(),
      retry_count = $2,
      retry_history = retry_history || $3::jsonb,
      updated_at = NOW()
    WHERE id = $1
  `, [id, retryCount + 1, JSON.stringify([historyEntry])]);

  logger.success(`DLQ entry ${id} resolved after ${retryCount + 1} attempts`);
}

/**
 * Update DLQ entry for next retry attempt
 */
async function scheduleNextRetry(
  id: string,
  currentRetryCount: number,
  error: string,
  nextRetryAt: string
): Promise<void> {
  const historyEntry: RetryHistoryEntry = {
    attempt_number: currentRetryCount + 1,
    attempted_at: new Date().toISOString(),
    result: 'failed',
    error: error.substring(0, 500)
  };

  await db.query(`
    UPDATE form_submission_dlq 
    SET 
      status = 'PENDING_RETRY',
      retry_count = $2,
      next_retry_at = $3,
      last_failure_at = NOW(),
      retry_history = retry_history || $4::jsonb,
      updated_at = NOW()
    WHERE id = $1
  `, [id, currentRetryCount + 1, nextRetryAt, JSON.stringify([historyEntry])]);

  logger.info(`DLQ entry ${id} scheduled for retry ${currentRetryCount + 2} at ${nextRetryAt}`);
}

/**
 * Mark DLQ entry as permanent failure
 */
async function markPermanentFailure(
  id: string,
  currentRetryCount: number,
  error: string,
  reason: string
): Promise<void> {
  const historyEntry: RetryHistoryEntry = {
    attempt_number: currentRetryCount + 1,
    attempted_at: new Date().toISOString(),
    result: 'failed',
    error: error.substring(0, 500)
  };

  await db.query(`
    UPDATE form_submission_dlq 
    SET 
      status = 'PERMANENT_FAILURE',
      retry_count = $2,
      last_failure_at = NOW(),
      retry_history = retry_history || $3::jsonb,
      review_notes = COALESCE(review_notes, '') || $4,
      updated_at = NOW()
    WHERE id = $1
  `, [
    id, 
    currentRetryCount + 1, 
    JSON.stringify([historyEntry]),
    `\n[${new Date().toISOString()}] Marked permanent: ${reason}`
  ]);

  logger.error(`DLQ entry ${id} marked as permanent failure: ${reason}`);
}

/**
 * Archive old resolved entries
 */
async function archiveOldEntries(olderThanDays: number = 30): Promise<number> {
  const result = await db.query<{ archived_count: number }>(`
    SELECT archived_count FROM archive_resolved_items($1)
  `, [olderThanDays]);

  return result.rows[0]?.archived_count || 0;
}

// ============================================================================
// Retry Execution
// ============================================================================

/**
 * Attempt to retry a failed submission by calling the n8n webhook
 */
async function attemptRetry(entry: DlqEntry): Promise<RetryResult> {
  const startTime = Date.now();
  const n8nBaseUrl = process.env.N8N_WEBHOOK_URL;
  
  if (!n8nBaseUrl) {
    return {
      dlqId: entry.id,
      success: false,
      error: 'N8N_WEBHOOK_URL not configured',
      processingTimeMs: Date.now() - startTime
    };
  }

  const retryPath = process.env.DLQ_RETRY_PATH || '/webhook/retry-submission';
  const webhookUrl = `${n8nBaseUrl.replace(/\/$/, '')}${retryPath}`;

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-DLQ-Retry': 'true',
        'X-DLQ-Entry-ID': entry.id,
        'X-DLQ-Attempt': String(entry.retry_count + 1)
      },
      body: JSON.stringify(entry.original_payload),
      signal: AbortSignal.timeout(30000) // 30 second timeout
    });

    const processingTimeMs = Date.now() - startTime;

    if (response.ok) {
      return {
        dlqId: entry.id,
        success: true,
        processingTimeMs,
        httpStatusCode: response.status
      };
    } else {
      const errorText = await response.text().catch(() => 'Unknown error');
      return {
        dlqId: entry.id,
        success: false,
        error: `HTTP ${response.status}: ${errorText.substring(0, 200)}`,
        processingTimeMs,
        httpStatusCode: response.status
      };
    }
  } catch (error) {
    const processingTimeMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    return {
      dlqId: entry.id,
      success: false,
      error: errorMessage,
      processingTimeMs
    };
  }
}

// ============================================================================
// Main Processing Logic
// ============================================================================

/**
 * Process a single DLQ entry
 */
async function processEntry(entry: DlqEntry, dryRun: boolean = false): Promise<RetryResult> {
  logger.info(`Processing DLQ entry ${entry.id} (attempt ${entry.retry_count + 1}/${entry.max_retries})`);

  // Check for poison message
  const poisonCheck = detectPoisonMessage(
    entry.error_message,
    entry.retry_count,
    entry.error_category
  );

  if (poisonCheck.isPoison) {
    if (!dryRun) {
      await markPermanentFailure(entry.id, entry.retry_count, entry.error_message, poisonCheck.reason);
    } else {
      logger.info(`[DRY RUN] Would mark ${entry.id} as permanent: ${poisonCheck.reason}`);
    }
    return {
      dlqId: entry.id,
      success: false,
      error: `Poison message: ${poisonCheck.reason}`,
      processingTimeMs: 0
    };
  }

  // Mark as in progress
  if (!dryRun) {
    await markInProgress(entry.id);
  }

  // Attempt retry
  const result = await attemptRetry(entry);

  if (result.success) {
    if (!dryRun) {
      await markResolved(entry.id, entry.retry_count, result.processingTimeMs);
    } else {
      logger.info(`[DRY RUN] Would mark ${entry.id} as resolved`);
    }
  } else {
    // Check if should schedule another retry or mark as permanent
    const newRetryCount = entry.retry_count + 1;
    
    if (newRetryCount >= entry.max_retries) {
      if (!dryRun) {
        await markPermanentFailure(entry.id, entry.retry_count, result.error || 'Unknown error', 'Max retries exceeded');
      } else {
        logger.info(`[DRY RUN] Would mark ${entry.id} as permanent (max retries)`);
      }
    } else {
      // Schedule next retry
      const nextRetry = calculateNextRetry(newRetryCount, entry.error_category);
      if (!dryRun) {
        await scheduleNextRetry(entry.id, entry.retry_count, result.error || 'Unknown error', nextRetry.nextRetryAt);
      } else {
        logger.info(`[DRY RUN] Would schedule ${entry.id} for retry at ${nextRetry.nextRetryAt}`);
      }
    }
  }

  return result;
}

/**
 * Process a batch of pending retries
 */
async function processBatch(dryRun: boolean = false): Promise<ProcessBatchResult> {
  const batchSize = parseInt(process.env.DLQ_BATCH_SIZE || '50', 10);
  
  logger.header('DLQ Retry Processor', {
    'Batch Size': String(batchSize),
    'Dry Run': dryRun ? 'Yes' : 'No',
    'Timestamp': new Date().toISOString()
  });

  // Get pending entries
  const pendingEntries = await getPendingRetries(batchSize);
  
  if (pendingEntries.length === 0) {
    logger.info('No pending retries found');
    return {
      processed: 0,
      succeeded: 0,
      failed: 0,
      permanentFailures: 0,
      errors: []
    };
  }

  logger.info(`Found ${pendingEntries.length} entries ready for retry`);

  const result: ProcessBatchResult = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    permanentFailures: 0,
    errors: []
  };

  // Process each entry
  for (const entry of pendingEntries) {
    try {
      const retryResult = await processEntry(entry, dryRun);
      result.processed++;

      if (retryResult.success) {
        result.succeeded++;
      } else if (retryResult.error?.includes('Poison message') || 
                 retryResult.error?.includes('max retries')) {
        result.permanentFailures++;
        result.failed++;
      } else {
        result.failed++;
        result.errors.push({ dlqId: entry.id, error: retryResult.error || 'Unknown error' });
      }
    } catch (error) {
      result.processed++;
      result.failed++;
      const errorMsg = error instanceof Error ? error.message : String(error);
      result.errors.push({ dlqId: entry.id, error: errorMsg });
      logger.error(`Unexpected error processing ${entry.id}: ${errorMsg}`);
    }
  }

  // Print summary
  logger.summary('DLQ Batch Processing Complete', [
    { label: 'Processed', status: 'info', message: String(result.processed) },
    { label: 'Succeeded', status: 'success', message: String(result.succeeded) },
    { label: 'Failed', status: result.failed > 0 ? 'error' : 'success', message: String(result.failed) },
    { label: 'Permanent Failures', status: result.permanentFailures > 0 ? 'warn' : 'success', message: String(result.permanentFailures) }
  ]);

  return result;
}

// ============================================================================
// Main Entry Point
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const runOnce = args.includes('--once');
  const shouldArchive = args.includes('--archive');

  try {
    // Validate environment
    if (!process.env.DLQ_DATABASE_URL) {
      throw new Error('DLQ_DATABASE_URL environment variable is required');
    }

    if (!dryRun && !process.env.N8N_WEBHOOK_URL) {
      throw new Error('N8N_WEBHOOK_URL environment variable is required (or use --dry-run)');
    }

    // Archive old entries if requested
    if (shouldArchive) {
      const archivedCount = await archiveOldEntries(30);
      logger.info(`Archived ${archivedCount} old resolved entries`);
    }

    // Run processing
    await processBatch(dryRun);

    // Single run mode
    if (runOnce) {
      logger.info('Single run complete, exiting');
      await db.end();
      process.exit(0);
    }

    // Continuous mode - run every 5 minutes
    const intervalMs = 5 * 60 * 1000;
    logger.info(`Entering continuous mode (interval: ${intervalMs}ms)`);

    setInterval(async () => {
      try {
        await processBatch(dryRun);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.error(`Error in processing interval: ${errorMsg}`);
      }
    }, intervalMs);

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error(`Fatal error: ${errorMsg}`);
    await db.end();
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down gracefully...');
  await db.end();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down gracefully...');
  await db.end();
  process.exit(0);
});

// Run if called directly
if (require.main === module) {
  main();
}

// Export for testing
export {
  db,
  getPendingRetries,
  processEntry,
  processBatch,
  markResolved,
  markPermanentFailure,
  scheduleNextRetry,
  archiveOldEntries
};
