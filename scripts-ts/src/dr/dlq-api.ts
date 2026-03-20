/**
 * Dead Letter Queue (DLQ) Management API
 * 
 * Provides programmatic access to DLQ operations:
 * - Manual retry of failed submissions
 * - Statistics and health monitoring
 * - Status updates and review management
 * - Archive operations
 * 
 * Usage:
 *   import { DlqManager } from './dlq-api';
 *   const dlq = new DlqManager(databaseUrl);
 *   const stats = await dlq.getStatistics();
 */

import { Pool, QueryResult } from 'pg';
import { Logger } from '../lib/logger';
import {
  DlqEntry,
  DlqStatus,
  FailureCategory,
  DlqStats,
  DlqStatisticsView,
  ManualRetryRequest,
  ManualRetryResponse,
  DlqHealthStatus,
  HealthStatus,
  HealthCheckResult,
  DlqQueryFilters,
  RetryHistoryEntry
} from '../dlq/types';

// ============================================================================
// Logger Setup
// ============================================================================

const logger = new Logger({ prefix: 'DLQ-API' });

// ============================================================================
// DLQ Manager Class
// ============================================================================

export class DlqManager {
  private pool: Pool;
  private n8nWebhookUrl?: string;

  constructor(databaseUrl: string, n8nWebhookUrl?: string) {
    this.pool = new Pool({
      connectionString: databaseUrl,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    this.n8nWebhookUrl = n8nWebhookUrl;

    // Handle pool errors
    this.pool.on('error', (err) => {
      logger.error(`Unexpected database pool error: ${err.message}`);
    });
  }

  /**
   * Close database connections
   */
  async close(): Promise<void> {
    await this.pool.end();
    logger.info('DLQ Manager connections closed');
  }

  // ============================================================================
  // Query Methods
  // ============================================================================

  /**
   * Get DLQ entries with optional filters
   */
  async getEntries(filters: DlqQueryFilters = {}): Promise<DlqEntry[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    // Build filter conditions
    if (filters.status) {
      const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
      conditions.push(`status = ANY($${paramIndex}::dlq_status[])`);
      params.push(statuses);
      paramIndex++;
    }

    if (filters.errorCategory) {
      const categories = Array.isArray(filters.errorCategory) 
        ? filters.errorCategory 
        : [filters.errorCategory];
      conditions.push(`error_category = ANY($${paramIndex}::failure_category[])`);
      params.push(categories);
      paramIndex++;
    }

    if (filters.formType) {
      conditions.push(`form_type = $${paramIndex}`);
      params.push(filters.formType);
      paramIndex++;
    }

    if (filters.environment) {
      conditions.push(`environment = $${paramIndex}`);
      params.push(filters.environment);
      paramIndex++;
    }

    if (filters.assignedTo) {
      conditions.push(`assigned_to = $${paramIndex}`);
      params.push(filters.assignedTo);
      paramIndex++;
    }

    if (filters.fromDate) {
      conditions.push(`created_at >= $${paramIndex}`);
      params.push(filters.fromDate);
      paramIndex++;
    }

    if (filters.toDate) {
      conditions.push(`created_at <= $${paramIndex}`);
      params.push(filters.toDate);
      paramIndex++;
    }

    if (filters.searchEmail) {
      conditions.push(`original_payload->'body'->'data'->>'email' ILIKE $${paramIndex}`);
      params.push(`%${filters.searchEmail}%`);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const orderBy = filters.orderBy || 'created_at';
    const orderDirection = filters.orderDirection || 'DESC';
    const limit = filters.limit || 100;
    const offset = filters.offset || 0;

    const query = `
      SELECT 
        id, execution_id, original_payload, normalized_payload,
        error_message, error_stack, error_category, failed_node, http_status_code,
        status, retry_count, max_retries,
        first_failure_at, last_failure_at, next_retry_at, resolved_at,
        retry_history, source_ip, user_agent, form_type,
        workflow_version, environment, n8n_instance_id,
        assigned_to, review_notes, created_at, updated_at
      FROM form_submission_dlq
      ${whereClause}
      ORDER BY ${orderBy} ${orderDirection}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    params.push(limit, offset);

    const result = await this.pool.query<DlqEntry>(query, params);
    
    return result.rows.map(row => this.parseDlqEntry(row));
  }

  /**
   * Get a single DLQ entry by ID
   */
  async getEntryById(id: string): Promise<DlqEntry | null> {
    const result = await this.pool.query<DlqEntry>(`
      SELECT 
        id, execution_id, original_payload, normalized_payload,
        error_message, error_stack, error_category, failed_node, http_status_code,
        status, retry_count, max_retries,
        first_failure_at, last_failure_at, next_retry_at, resolved_at,
        retry_history, source_ip, user_agent, form_type,
        workflow_version, environment, n8n_instance_id,
        assigned_to, review_notes, created_at, updated_at
      FROM form_submission_dlq
      WHERE id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.parseDlqEntry(result.rows[0]);
  }

  /**
   * Search DLQ entries by email
   */
  async searchByEmail(email: string): Promise<DlqEntry[]> {
    return this.getEntries({ searchEmail: email, limit: 100 });
  }

  // ============================================================================
  // Statistics Methods
  // ============================================================================

  /**
   * Get comprehensive DLQ statistics
   */
  async getStatistics(): Promise<DlqStats> {
    const result = await this.pool.query<DlqStats>(`
      SELECT 
        COUNT(*) FILTER (WHERE status = 'PENDING_RETRY') as pending_retry_count,
        COUNT(*) FILTER (WHERE status = 'IN_PROGRESS') as in_progress_count,
        COUNT(*) FILTER (WHERE status = 'RESOLVED') as resolved_count,
        COUNT(*) FILTER (WHERE status = 'PERMANENT_FAILURE') as permanent_failure_count,
        COUNT(*) FILTER (WHERE status = 'MANUAL_REVIEW') as manual_review_count,
        COUNT(*) FILTER (WHERE status = 'DISCARDED') as discarded_count,
        AVG(retry_count) FILTER (WHERE status IN ('PENDING_RETRY', 'PERMANENT_FAILURE')) as avg_retry_count,
        MAX(retry_count) as max_retry_count,
        AVG(EXTRACT(EPOCH FROM (NOW() - first_failure_at))/3600) 
          FILTER (WHERE status = 'PENDING_RETRY') as avg_pending_hours,
        ROUND(
          100.0 * COUNT(*) FILTER (WHERE status = 'RESOLVED' AND resolved_at > NOW() - INTERVAL '24 hours') / 
          NULLIF(COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours'), 0), 
          2
        ) as success_rate_24h,
        COUNT(*) FILTER (WHERE status = 'PENDING_RETRY' AND next_retry_at <= NOW()) as ready_for_retry_count
      FROM form_submission_dlq
    `);

    return result.rows[0];
  }

  /**
   * Get statistics grouped by status, category, and form type
   */
  async getDetailedStatistics(): Promise<DlqStatisticsView[]> {
    const result = await this.pool.query<DlqStatisticsView>(`
      SELECT 
        status,
        error_category,
        form_type,
        environment,
        COUNT(*) as count,
        AVG(retry_count) as avg_retries,
        MIN(first_failure_at) as oldest_failure,
        MAX(last_failure_at) as newest_failure,
        COUNT(*) FILTER (WHERE next_retry_at <= NOW() AND status = 'PENDING_RETRY') as ready_for_retry
      FROM form_submission_dlq
      GROUP BY status, error_category, form_type, environment
      ORDER BY count DESC
    `);

    return result.rows;
  }

  /**
   * Get failure trends over time
   */
  async getFailureTrends(hours: number = 24): Promise<Array<{
    hour: Date;
    new_failures: number;
    resolved: number;
    permanent: number;
  }>> {
    const result = await this.pool.query(`
      SELECT 
        DATE_TRUNC('hour', created_at) as hour,
        COUNT(*) FILTER (WHERE status != 'RESOLVED') as new_failures,
        COUNT(*) FILTER (WHERE status = 'RESOLVED') as resolved,
        COUNT(*) FILTER (WHERE status = 'PERMANENT_FAILURE') as permanent
      FROM form_submission_dlq
      WHERE created_at > NOW() - INTERVAL '${hours} hours'
      GROUP BY DATE_TRUNC('hour', created_at)
      ORDER BY hour DESC
    `);

    return result.rows;
  }

  // ============================================================================
  // Update Methods
  // ============================================================================

  /**
   * Update DLQ entry status
   */
  async updateStatus(
    id: string, 
    status: DlqStatus, 
    notes?: string,
    performedBy: string = 'api'
  ): Promise<boolean> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      const result = await client.query(`
        UPDATE form_submission_dlq 
        SET 
          status = $2,
          review_notes = COALESCE(review_notes, '') || $3,
          ${status === DlqStatus.RESOLVED ? 'resolved_at = NOW(),' : ''}
          updated_at = NOW()
        WHERE id = $1
        RETURNING id
      `, [
        id, 
        status, 
        notes ? `\n[${new Date().toISOString()} by ${performedBy}]: ${notes}` : ''
      ]);

      if (result.rows.length === 0) {
        await client.query('ROLLBACK');
        return false;
      }

      // Log to audit
      await client.query(`
        INSERT INTO dlq_audit_log (dlq_entry_id, action, details, performed_by)
        VALUES ($1, 'status_updated', $2, $3)
      `, [
        id,
        JSON.stringify({ new_status: status, notes }),
        performedBy
      ]);

      await client.query('COMMIT');
      
      logger.info(`Updated DLQ entry ${id} status to ${status}`);
      return true;

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Assign DLQ entry to a user for review
   */
  async assignTo(id: string, assignee: string, notes?: string): Promise<boolean> {
    const result = await this.pool.query(`
      UPDATE form_submission_dlq 
      SET 
        assigned_to = $2,
        status = 'MANUAL_REVIEW',
        review_notes = COALESCE(review_notes, '') || $3,
        updated_at = NOW()
      WHERE id = $1
      RETURNING id
    `, [
      id,
      assignee,
      notes ? `\n[${new Date().toISOString()}]: Assigned to ${assignee} - ${notes}` : `\n[${new Date().toISOString()}]: Assigned to ${assignee}`
    ]);

    if (result.rows.length > 0) {
      logger.info(`Assigned DLQ entry ${id} to ${assignee}`);
      return true;
    }
    return false;
  }

  /**
   * Add review notes to a DLQ entry
   */
  async addNotes(id: string, notes: string, author: string = 'api'): Promise<boolean> {
    const result = await this.pool.query(`
      UPDATE form_submission_dlq 
      SET 
        review_notes = COALESCE(review_notes, '') || $2,
        updated_at = NOW()
      WHERE id = $1
      RETURNING id
    `, [id, `\n[${new Date().toISOString()} by ${author}]: ${notes}`]);

    return result.rows.length > 0;
  }

  // ============================================================================
  // Manual Retry Methods
  // ============================================================================

  /**
   * Trigger manual retry for a DLQ entry
   */
  async manualRetry(id: string, options: ManualRetryRequest = {}): Promise<ManualRetryResponse> {
    const { force = false, skipValidation = false, dryRun = false, notes } = options;

    // Fetch entry
    const entry = await this.getEntryById(id);
    if (!entry) {
      return {
        success: false,
        dlqId: id,
        message: 'DLQ entry not found',
        error: 'NOT_FOUND'
      };
    }

    // Validate entry is retryable
    if (entry.status === DlqStatus.RESOLVED && !force) {
      return {
        success: false,
        dlqId: id,
        message: 'Entry already resolved. Use force=true to reprocess.',
        error: 'ALREADY_RESOLVED'
      };
    }

    if (entry.status === DlqStatus.DISCARDED && !force) {
      return {
        success: false,
        dlqId: id,
        message: 'Entry has been discarded. Use force=true to reprocess.',
        error: 'DISCARDED'
      };
    }

    // Dry run - just validate
    if (dryRun) {
      return {
        success: true,
        dlqId: id,
        message: 'Entry is valid for retry',
        result: {
          wouldRetry: true,
          currentStatus: entry.status,
          retryCount: entry.retry_count,
          errorCategory: entry.error_category
        }
      };
    }

    try {
      // Reset for retry
      await this.pool.query(`
        SELECT reset_for_manual_retry($1, $2, $3)
      `, [id, true, notes || 'Manual retry via API']);

      // If webhook URL is configured, trigger immediate retry
      if (this.n8nWebhookUrl) {
        const retryResult = await this.triggerRetryWebhook(entry);
        
        if (retryResult.success) {
          await this.markResolved(id, entry.retry_count, retryResult.processingTimeMs || 0);
          return {
            success: true,
            dlqId: id,
            message: 'Manual retry succeeded',
            result: retryResult
          };
        } else {
          return {
            success: false,
            dlqId: id,
            message: 'Manual retry failed',
            error: retryResult.error,
            result: retryResult
          };
        }
      }

      return {
        success: true,
        dlqId: id,
        message: 'Entry reset for retry processing'
      };

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`Manual retry failed for ${id}: ${errorMsg}`);
      
      return {
        success: false,
        dlqId: id,
        message: 'Manual retry failed',
        error: errorMsg
      };
    }
  }

  /**
   * Trigger immediate retry via webhook
   */
  private async triggerRetryWebhook(entry: DlqEntry): Promise<{
    success: boolean;
    processingTimeMs?: number;
    error?: string;
    httpStatusCode?: number;
  }> {
    const startTime = Date.now();
    
    if (!this.n8nWebhookUrl) {
      return { success: false, error: 'N8N_WEBHOOK_URL not configured' };
    }

    const retryPath = process.env.DLQ_RETRY_PATH || '/webhook/retry-submission';
    const webhookUrl = `${this.n8nWebhookUrl.replace(/\/$/, '')}${retryPath}`;

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-DLQ-Retry': 'true',
          'X-DLQ-Entry-ID': entry.id,
          'X-DLQ-Attempt': String(entry.retry_count + 1),
          'X-DLQ-Manual': 'true'
        },
        body: JSON.stringify(entry.original_payload),
        signal: AbortSignal.timeout(30000)
      });

      const processingTimeMs = Date.now() - startTime;

      if (response.ok) {
        return { success: true, processingTimeMs, httpStatusCode: response.status };
      } else {
        const errorText = await response.text().catch(() => 'Unknown error');
        return {
          success: false,
          error: `HTTP ${response.status}: ${errorText.substring(0, 200)}`,
          processingTimeMs,
          httpStatusCode: response.status
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        processingTimeMs: Date.now() - startTime
      };
    }
  }

  /**
   * Mark entry as resolved
   */
  private async markResolved(id: string, currentRetryCount: number, processingTimeMs: number): Promise<void> {
    const historyEntry: RetryHistoryEntry = {
      attempt_number: currentRetryCount + 1,
      attempted_at: new Date().toISOString(),
      result: 'success',
      processing_time_ms: processingTimeMs,
      manual: true
    };

    await this.pool.query(`
      UPDATE form_submission_dlq 
      SET 
        status = 'RESOLVED',
        resolved_at = NOW(),
        retry_count = $2,
        retry_history = retry_history || $3::jsonb,
        updated_at = NOW()
      WHERE id = $1
    `, [id, currentRetryCount + 1, JSON.stringify([historyEntry])]);
  }

  // ============================================================================
  // Archive Methods
  // ============================================================================

  /**
   * Archive old resolved entries
   */
  async archiveOldEntries(olderThanDays: number = 30): Promise<number> {
    const result = await this.pool.query<{ archived_count: number }>(`
      SELECT archived_count FROM archive_resolved_items($1)
    `, [olderThanDays]);

    const count = result.rows[0]?.archived_count || 0;
    logger.info(`Archived ${count} entries older than ${olderThanDays} days`);
    return count;
  }

  /**
   * Archive a specific entry by ID
   */
  async archiveEntry(id: string, reason: string, archivedBy: string = 'api'): Promise<boolean> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      // Move to archive
      await client.query(`
        INSERT INTO form_submission_dlq_archive (
          id, execution_id, original_payload, normalized_payload,
          error_message, error_stack, error_category, failed_node, http_status_code,
          status, retry_count, max_retries,
          first_failure_at, last_failure_at, next_retry_at, resolved_at,
          retry_history, source_ip, user_agent, form_type,
          workflow_version, environment, n8n_instance_id,
          assigned_to, review_notes, created_at, updated_at,
          archive_reason, archived_by
        )
        SELECT 
          id, execution_id, original_payload, normalized_payload,
          error_message, error_stack, error_category, failed_node, http_status_code,
          status, retry_count, max_retries,
          first_failure_at, last_failure_at, next_retry_at, resolved_at,
          retry_history, source_ip, user_agent, form_type,
          workflow_version, environment, n8n_instance_id,
          assigned_to, review_notes, created_at, updated_at,
          $2, $3
        FROM form_submission_dlq
        WHERE id = $1
      `, [id, reason, archivedBy]);

      // Delete from main table
      await client.query(`
        DELETE FROM form_submission_dlq WHERE id = $1
      `, [id]);

      // Log to audit
      await client.query(`
        INSERT INTO dlq_audit_log (dlq_archive_id, action, details, performed_by)
        VALUES ($1, 'archived', $2, $3)
      `, [
        id,
        JSON.stringify({ reason, archived_by: archivedBy }),
        archivedBy
      ]);

      await client.query('COMMIT');
      
      logger.info(`Archived DLQ entry ${id}`);
      return true;

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // ============================================================================
  // Health Check Methods
  // ============================================================================

  /**
   * Perform comprehensive health checks
   */
  async healthCheck(): Promise<DlqHealthStatus> {
    const checks: Record<string, { status: HealthStatus; details?: Record<string, unknown> }> = {};
    let overallStatus: HealthStatus = HealthStatus.HEALTHY;

    // Check 1: Database connectivity
    try {
      await this.pool.query('SELECT 1');
      checks.database = { status: HealthStatus.HEALTHY, details: { connected: true } };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      checks.database = { status: HealthStatus.UNHEALTHY, details: { error: errorMsg } };
      overallStatus = HealthStatus.UNHEALTHY;
    }

    // Check 2: Pending backlog
    const pendingResult = await this.pool.query(`
      SELECT COUNT(*) as count FROM form_submission_dlq WHERE status = 'PENDING_RETRY'
    `);
    const pendingCount = parseInt(pendingResult.rows[0].count, 10);
    
    checks.backlog = {
      status: pendingCount > 1000 ? HealthStatus.CRITICAL : 
              pendingCount > 100 ? HealthStatus.WARNING : HealthStatus.HEALTHY,
      details: { pending_count: pendingCount }
    };
    
    if (pendingCount > 1000 && overallStatus === HealthStatus.HEALTHY) {
      overallStatus = HealthStatus.WARNING;
    }

    // Check 3: Stale items
    const staleResult = await this.pool.query(`
      SELECT COUNT(*) as count FROM form_submission_dlq 
      WHERE status = 'IN_PROGRESS' AND updated_at < NOW() - INTERVAL '30 minutes'
    `);
    const staleCount = parseInt(staleResult.rows[0].count, 10);
    
    checks.stale_items = {
      status: staleCount > 0 ? HealthStatus.WARNING : HealthStatus.HEALTHY,
      details: { stale_count: staleCount }
    };

    // Check 4: Recent permanent failures
    const permanentResult = await this.pool.query(`
      SELECT COUNT(*) as count FROM form_submission_dlq 
      WHERE status = 'PERMANENT_FAILURE' AND last_failure_at > NOW() - INTERVAL '1 hour'
    `);
    const permanentCount = parseInt(permanentResult.rows[0].count, 10);
    
    checks.recent_permanent_failures = {
      status: permanentCount > 5 ? HealthStatus.CRITICAL :
              permanentCount > 0 ? HealthStatus.WARNING : HealthStatus.HEALTHY,
      details: { count_1h: permanentCount }
    };

    // Check 5: Success rate
    const successRateResult = await this.pool.query(`
      SELECT ROUND(
        100.0 * COUNT(*) FILTER (WHERE status = 'RESOLVED') / 
        NULLIF(COUNT(*), 0), 2
      ) as rate
      FROM form_submission_dlq
      WHERE created_at > NOW() - INTERVAL '24 hours'
    `);
    const successRate = parseFloat(successRateResult.rows[0]?.rate) || 0;
    
    checks.success_rate = {
      status: successRate < 50 ? HealthStatus.CRITICAL :
              successRate < 70 ? HealthStatus.WARNING : HealthStatus.HEALTHY,
      details: { success_rate_pct: successRate }
    };

    // Determine overall status
    if (Object.values(checks).some(c => c.status === HealthStatus.CRITICAL)) {
      overallStatus = HealthStatus.CRITICAL;
    } else if (Object.values(checks).some(c => c.status === HealthStatus.UNHEALTHY)) {
      overallStatus = HealthStatus.UNHEALTHY;
    } else if (Object.values(checks).some(c => c.status === HealthStatus.WARNING)) {
      overallStatus = HealthStatus.WARNING;
    }

    return {
      timestamp: new Date().toISOString(),
      overall: overallStatus,
      checks
    };
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Parse database row into DlqEntry
   */
  private parseDlqEntry(row: DlqEntry): DlqEntry {
    return {
      ...row,
      retry_history: typeof row.retry_history === 'string'
        ? JSON.parse(row.retry_history)
        : row.retry_history || []
    };
  }
}

// ============================================================================
// Export factory function
// ============================================================================

export function createDlqManager(n8nWebhookUrl?: string): DlqManager {
  const databaseUrl = process.env.DLQ_DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DLQ_DATABASE_URL environment variable is required');
  }
  
  return new DlqManager(databaseUrl, n8nWebhookUrl || process.env.N8N_WEBHOOK_URL);
}

// Export types
export * from '../dlq/types';
