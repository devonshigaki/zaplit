/**
 * Type definitions for Dead Letter Queue (DLQ) System
 */

// ============================================================================
// Enums
// ============================================================================

export enum DlqStatus {
  PENDING_RETRY = 'PENDING_RETRY',
  IN_PROGRESS = 'IN_PROGRESS',
  RESOLVED = 'RESOLVED',
  PERMANENT_FAILURE = 'PERMANENT_FAILURE',
  MANUAL_REVIEW = 'MANUAL_REVIEW',
  DISCARDED = 'DISCARDED'
}

export enum FailureCategory {
  TRANSIENT = 'TRANSIENT',
  PERMANENT = 'PERMANENT',
  DEPENDENCY = 'DEPENDENCY',
  VALIDATION = 'VALIDATION',
  RATE_LIMIT = 'RATE_LIMIT',
  AUTHENTICATION = 'AUTHENTICATION',
  NETWORK = 'NETWORK',
  UNKNOWN = 'UNKNOWN'
}

export enum HealthStatus {
  HEALTHY = 'healthy',
  WARNING = 'warning',
  CRITICAL = 'critical',
  UNHEALTHY = 'unhealthy'
}

// ============================================================================
// Core Interfaces
// ============================================================================

export interface RetryHistoryEntry {
  attempt_number: number;
  attempted_at: string;
  result: 'success' | 'failed' | 'pending';
  error?: string;
  node?: string;
  processing_time_ms?: number;
  manual?: boolean;
}

export interface DlqEntry {
  id: string;
  execution_id: string;
  original_payload: Record<string, unknown>;
  normalized_payload?: Record<string, unknown> | null;
  error_message: string;
  error_stack?: string | null;
  error_category: FailureCategory;
  failed_node?: string | null;
  http_status_code?: number | null;
  status: DlqStatus;
  retry_count: number;
  max_retries: number;
  first_failure_at: Date;
  last_failure_at: Date;
  next_retry_at?: Date | null;
  resolved_at?: Date | null;
  retry_history: RetryHistoryEntry[];
  source_ip?: string | null;
  user_agent?: string | null;
  form_type: string;
  workflow_version?: string | null;
  environment: string;
  n8n_instance_id?: string | null;
  assigned_to?: string | null;
  review_notes?: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface DlqArchiveEntry extends DlqEntry {
  archived_at: Date;
  archive_reason: string;
  archived_by: string;
}

export interface DlqAuditLogEntry {
  id: string;
  dlq_entry_id?: string | null;
  dlq_archive_id?: string | null;
  action: string;
  performed_by: string;
  details?: Record<string, unknown> | null;
  created_at: Date;
}

// ============================================================================
// Retry Configuration
// ============================================================================

export interface RetryConfig {
  baseDelayMinutes: number;
  maxDelayMinutes: number;
  maxRetries: number;
  jitterFactor: number;
  categoryMultipliers: Record<FailureCategory | 'DEFAULT', number>;
}

export interface NextRetryCalculation {
  delayMinutes: number;
  nextRetryAt: string;
  attemptNumber: number;
}

// ============================================================================
// API Request/Response Types
// ============================================================================

export interface ManualRetryRequest {
  force?: boolean;
  skipValidation?: boolean;
  dryRun?: boolean;
  notes?: string;
}

export interface ManualRetryResponse {
  success: boolean;
  dlqId: string;
  message: string;
  result?: unknown;
  error?: string;
}

export interface DlqStats {
  pendingRetryCount: number;
  inProgressCount: number;
  resolvedCount: number;
  permanentFailureCount: number;
  manualReviewCount: number;
  discardedCount: number;
  avgRetryCount: number | null;
  maxRetryCount: number;
  avgPendingHours: number | null;
  successRate24h: number | null;
  readyForRetryCount: number;
}

export interface DlqStatisticsView {
  status: DlqStatus;
  error_category: FailureCategory;
  form_type: string;
  environment: string;
  count: number;
  avg_retries: number | null;
  oldest_failure: Date | null;
  newest_failure: Date | null;
  ready_for_retry: number;
}

export interface HealthCheckResult {
  checkName: string;
  status: HealthStatus;
  details: Record<string, unknown>;
}

export interface DlqHealthStatus {
  timestamp: string;
  overall: HealthStatus;
  checks: Record<string, {
    status: HealthStatus;
    details?: Record<string, unknown>;
  }>;
}

// ============================================================================
// Query Filters
// ============================================================================

export interface DlqQueryFilters {
  status?: DlqStatus | DlqStatus[];
  errorCategory?: FailureCategory | FailureCategory[];
  formType?: string;
  environment?: string;
  fromDate?: Date;
  toDate?: Date;
  assignedTo?: string;
  searchEmail?: string;
  limit?: number;
  offset?: number;
  orderBy?: string;
  orderDirection?: 'ASC' | 'DESC';
}

// ============================================================================
// Retry Processor Types
// ============================================================================

export interface RetryProcessorConfig {
  databaseUrl: string;
  n8nWebhookUrl: string;
  batchSize: number;
  pollIntervalMs: number;
  maxProcessingTimeMs: number;
  retryWebhookPath: string;
}

export interface RetryResult {
  dlqId: string;
  success: boolean;
  error?: string;
  processingTimeMs: number;
  httpStatusCode?: number;
}

export interface ProcessBatchResult {
  processed: number;
  succeeded: number;
  failed: number;
  permanentFailures: number;
  errors: Array<{ dlqId: string; error: string }>;
}

// ============================================================================
// Poison Message Detection
// ============================================================================

export interface PoisonMessageConfig {
  maxRetries: number;
  poisonPatterns: string[];
  immediatePoisonCategories: FailureCategory[];
}

export interface PoisonMessageResult {
  isPoison: boolean;
  reason: string;
  suggestedAction: 'archive' | 'manual_review' | 'discard' | 'retry';
}

// ============================================================================
// Database Row Types (for query results)
// ============================================================================

export interface DlqDatabaseRow {
  id: string;
  execution_id: string;
  original_payload: Record<string, unknown>;
  normalized_payload?: Record<string, unknown> | null;
  error_message: string;
  error_stack?: string | null;
  error_category: string;
  failed_node?: string | null;
  http_status_code?: number | null;
  status: string;
  retry_count: number;
  max_retries: number;
  first_failure_at: Date;
  last_failure_at: Date;
  next_retry_at?: Date | null;
  resolved_at?: Date | null;
  retry_history: RetryHistoryEntry[] | string;
  source_ip?: string | null;
  user_agent?: string | null;
  form_type: string;
  workflow_version?: string | null;
  environment: string;
  n8n_instance_id?: string | null;
  assigned_to?: string | null;
  review_notes?: string | null;
  created_at: Date;
  updated_at: Date;
}
