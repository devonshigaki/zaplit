-- ============================================
-- Dead Letter Queue (DLQ) Database Schema
-- For Form Submission Failure Management
-- ============================================
-- Deploy with: psql $DATABASE_URL -f dlq-schema.sql

-- ============================================
-- Custom Types
-- ============================================

CREATE TYPE dlq_status AS ENUM (
    'PENDING_RETRY',      -- Waiting for next retry attempt
    'IN_PROGRESS',        -- Currently being retried
    'RESOLVED',           -- Successfully processed
    'PERMANENT_FAILURE',  -- Max retries exceeded
    'MANUAL_REVIEW',      -- Flagged for human review
    'DISCARDED'           -- Intentionally discarded
);

CREATE TYPE failure_category AS ENUM (
    'TRANSIENT',          -- Temporary, retryable (timeout, 503)
    'PERMANENT',          -- Permanent, don't retry (400, 404)
    'DEPENDENCY',         -- External service failure (CRM down)
    'VALIDATION',         -- Data validation error
    'RATE_LIMIT',         -- Rate limited (429)
    'AUTHENTICATION',     -- Auth failure (401, 403)
    'NETWORK',            -- Network connectivity
    'UNKNOWN'             -- Unclassified
);

-- ============================================
-- Primary DLQ Table
-- ============================================

CREATE TABLE IF NOT EXISTS form_submission_dlq (
    -- Primary Identity
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    execution_id VARCHAR(255) NOT NULL,
    
    -- Payload Storage (JSONB for flexibility)
    original_payload JSONB NOT NULL,
    normalized_payload JSONB,  -- After validation/transform
    
    -- Error Details
    error_message TEXT NOT NULL,
    error_stack TEXT,
    error_category failure_category NOT NULL DEFAULT 'UNKNOWN',
    failed_node VARCHAR(255),  -- Which n8n node failed
    http_status_code INTEGER,  -- HTTP status if applicable
    
    -- Processing Status
    status dlq_status NOT NULL DEFAULT 'PENDING_RETRY',
    retry_count INTEGER NOT NULL DEFAULT 0,
    max_retries INTEGER NOT NULL DEFAULT 5,
    
    -- Timing
    first_failure_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    last_failure_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    next_retry_at TIMESTAMP WITH TIME ZONE,
    resolved_at TIMESTAMP WITH TIME ZONE,
    
    -- Retry History (append-only log)
    retry_history JSONB DEFAULT '[]'::jsonb,
    
    -- Source Tracking
    source_ip INET,
    user_agent TEXT,
    form_type VARCHAR(100) DEFAULT 'consultation',
    
    -- Metadata
    workflow_version VARCHAR(50),
    environment VARCHAR(50) DEFAULT 'production',
    n8n_instance_id VARCHAR(255),
    
    -- Manual Review
    assigned_to VARCHAR(255),
    review_notes TEXT,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- ============================================
-- Indexes for Performance
-- ============================================

-- Primary lookup indexes
CREATE INDEX idx_dlq_status ON form_submission_dlq(status);
CREATE INDEX idx_dlq_error_category ON form_submission_dlq(error_category);
CREATE INDEX idx_dlq_form_type ON form_submission_dlq(form_type);
CREATE INDEX idx_dlq_created_at ON form_submission_dlq(created_at);
CREATE INDEX idx_dlq_execution_id ON form_submission_dlq(execution_id);

-- Retry scheduling index (most important for retry processor)
CREATE INDEX idx_dlq_next_retry ON form_submission_dlq(next_retry_at) 
    WHERE status = 'PENDING_RETRY';

-- Partial index for active failures (excludes resolved/discarded)
CREATE INDEX idx_dlq_active ON form_submission_dlq(created_at) 
    WHERE status IN ('PENDING_RETRY', 'IN_PROGRESS', 'MANUAL_REVIEW');

-- GIN index for JSONB queries (e.g., search by email in payload)
CREATE INDEX idx_dlq_payload_gin ON form_submission_dlq USING GIN (original_payload jsonb_path_ops);

-- Index for specific payload fields commonly queried
CREATE INDEX idx_dlq_payload_email ON form_submission_dlq 
    USING BTREE ((original_payload->'body'->'data'->>'email'));

CREATE INDEX idx_dlq_payload_company ON form_submission_dlq 
    USING BTREE ((original_payload->'body'->'data'->>'company'));

-- Composite index for common query patterns
CREATE INDEX idx_dlq_status_category ON form_submission_dlq(status, error_category);
CREATE INDEX idx_dlq_status_created ON form_submission_dlq(status, created_at);

-- ============================================
-- Permanent Failures Archive Table
-- ============================================

CREATE TABLE IF NOT EXISTS form_submission_dlq_archive (
    -- Same columns as main table
    id UUID PRIMARY KEY,
    execution_id VARCHAR(255) NOT NULL,
    original_payload JSONB NOT NULL,
    normalized_payload JSONB,
    error_message TEXT NOT NULL,
    error_stack TEXT,
    error_category failure_category NOT NULL DEFAULT 'UNKNOWN',
    failed_node VARCHAR(255),
    http_status_code INTEGER,
    status dlq_status NOT NULL,
    retry_count INTEGER NOT NULL DEFAULT 0,
    max_retries INTEGER NOT NULL DEFAULT 5,
    first_failure_at TIMESTAMP WITH TIME ZONE NOT NULL,
    last_failure_at TIMESTAMP WITH TIME ZONE NOT NULL,
    next_retry_at TIMESTAMP WITH TIME ZONE,
    resolved_at TIMESTAMP WITH TIME ZONE,
    retry_history JSONB DEFAULT '[]'::jsonb,
    source_ip INET,
    user_agent TEXT,
    form_type VARCHAR(100) DEFAULT 'consultation',
    workflow_version VARCHAR(50),
    environment VARCHAR(50) DEFAULT 'production',
    n8n_instance_id VARCHAR(255),
    assigned_to VARCHAR(255),
    review_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    
    -- Archive-specific fields
    archived_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    archive_reason VARCHAR(255),
    archived_by VARCHAR(255) DEFAULT 'system'
);

-- Archive table indexes
CREATE INDEX idx_dlq_archive_archived_at ON form_submission_dlq_archive(archived_at);
CREATE INDEX idx_dlq_archive_error_category ON form_submission_dlq_archive(error_category);
CREATE INDEX idx_dlq_archive_created_at ON form_submission_dlq_archive(created_at);

-- ============================================
-- Audit Log Table
-- ============================================

CREATE TABLE IF NOT EXISTS dlq_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dlq_entry_id UUID REFERENCES form_submission_dlq(id) ON DELETE CASCADE,
    dlq_archive_id UUID REFERENCES form_submission_dlq_archive(id) ON DELETE CASCADE,
    action VARCHAR(100) NOT NULL,  -- 'created', 'retry_attempted', 'resolved', 'archived', etc.
    performed_by VARCHAR(255) DEFAULT 'system',
    details JSONB,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Audit log indexes
CREATE INDEX idx_audit_dlq_entry ON dlq_audit_log(dlq_entry_id) WHERE dlq_entry_id IS NOT NULL;
CREATE INDEX idx_audit_dlq_archive ON dlq_audit_log(dlq_archive_id) WHERE dlq_archive_id IS NOT NULL;
CREATE INDEX idx_audit_created_at ON dlq_audit_log(created_at);
CREATE INDEX idx_audit_action ON dlq_audit_log(action);

-- ============================================
-- Statistics View
-- ============================================

CREATE OR REPLACE VIEW dlq_statistics AS
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
GROUP BY status, error_category, form_type, environment;

-- ============================================
-- Detailed Statistics View
-- ============================================

CREATE OR REPLACE VIEW dlq_detailed_stats AS
SELECT 
    -- Overall counts
    COUNT(*) FILTER (WHERE status = 'PENDING_RETRY') as pending_retry_count,
    COUNT(*) FILTER (WHERE status = 'IN_PROGRESS') as in_progress_count,
    COUNT(*) FILTER (WHERE status = 'RESOLVED') as resolved_count,
    COUNT(*) FILTER (WHERE status = 'PERMANENT_FAILURE') as permanent_failure_count,
    COUNT(*) FILTER (WHERE status = 'MANUAL_REVIEW') as manual_review_count,
    COUNT(*) FILTER (WHERE status = 'DISCARDED') as discarded_count,
    
    -- Retry statistics
    AVG(retry_count) FILTER (WHERE status IN ('PENDING_RETRY', 'PERMANENT_FAILURE')) as avg_retry_count,
    MAX(retry_count) as max_retry_count,
    
    -- Time-based metrics
    AVG(EXTRACT(EPOCH FROM (NOW() - first_failure_at))/3600) 
        FILTER (WHERE status = 'PENDING_RETRY') as avg_pending_hours,
    
    -- Success rate calculation (last 24 hours)
    ROUND(
        100.0 * COUNT(*) FILTER (WHERE status = 'RESOLVED' AND resolved_at > NOW() - INTERVAL '24 hours') / 
        NULLIF(COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours'), 0), 
        2
    ) as success_rate_24h,
    
    -- Items ready for retry
    COUNT(*) FILTER (WHERE status = 'PENDING_RETRY' AND next_retry_at <= NOW()) as ready_for_retry_count
FROM form_submission_dlq;

-- ============================================
-- Update Trigger Function
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to main DLQ table
DROP TRIGGER IF EXISTS update_dlq_updated_at ON form_submission_dlq;
CREATE TRIGGER update_dlq_updated_at 
    BEFORE UPDATE ON form_submission_dlq 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Audit Log Trigger Function
-- ============================================

CREATE OR REPLACE FUNCTION log_dlq_change()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO dlq_audit_log (dlq_entry_id, action, details, performed_by)
        VALUES (
            NEW.id, 
            'created', 
            jsonb_build_object(
                'error_category', NEW.error_category,
                'error_message', NEW.error_message,
                'status', NEW.status
            ),
            'system'
        );
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        -- Only log significant status changes
        IF NEW.status IS DISTINCT FROM OLD.status THEN
            INSERT INTO dlq_audit_log (dlq_entry_id, action, details, performed_by)
            VALUES (
                NEW.id, 
                'status_changed', 
                jsonb_build_object(
                    'old_status', OLD.status,
                    'new_status', NEW.status,
                    'retry_count', NEW.retry_count
                ),
                'system'
            );
        END IF;
        
        -- Log retry attempts
        IF NEW.retry_count > OLD.retry_count THEN
            INSERT INTO dlq_audit_log (dlq_entry_id, action, details, performed_by)
            VALUES (
                NEW.id, 
                'retry_attempted', 
                jsonb_build_object(
                    'attempt_number', NEW.retry_count,
                    'next_retry_at', NEW.next_retry_at
                ),
                'system'
            );
        END IF;
        
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Apply audit trigger
DROP TRIGGER IF EXISTS audit_dlq_changes ON form_submission_dlq;
CREATE TRIGGER audit_dlq_changes
    AFTER INSERT OR UPDATE ON form_submission_dlq
    FOR EACH ROW
    EXECUTE FUNCTION log_dlq_change();

-- ============================================
-- Retry Scheduling Function
-- ============================================

CREATE OR REPLACE FUNCTION calculate_next_retry(
    p_retry_count INTEGER,
    p_error_category failure_category DEFAULT 'UNKNOWN',
    p_base_delay_minutes INTEGER DEFAULT 5
)
RETURNS TIMESTAMP WITH TIME ZONE AS $$
DECLARE
    v_multiplier NUMERIC;
    v_delay_minutes NUMERIC;
    v_max_delay_minutes INTEGER := 120;
    v_jitter_seconds INTEGER;
BEGIN
    -- Category-specific multipliers
    v_multiplier := CASE p_error_category
        WHEN 'TRANSIENT' THEN 1.0
        WHEN 'RATE_LIMIT' THEN 2.0
        WHEN 'DEPENDENCY' THEN 1.5
        WHEN 'NETWORK' THEN 1.0
        ELSE 1.0
    END;
    
    -- Calculate exponential backoff: base * 2^retry_count * multiplier
    v_delay_minutes := LEAST(
        p_base_delay_minutes * POWER(2, p_retry_count) * v_multiplier,
        v_max_delay_minutes
    );
    
    -- Add jitter (±10% random variation) to prevent thundering herd
    v_jitter_seconds := FLOOR((v_delay_minutes * 6) * (random() * 0.2 - 0.1));
    
    RETURN NOW() + (v_delay_minutes || ' minutes')::INTERVAL + (v_jitter_seconds || ' seconds')::INTERVAL;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Archive Old Resolved Items Function
-- ============================================

CREATE OR REPLACE FUNCTION archive_resolved_items(
    p_older_than_days INTEGER DEFAULT 30
)
RETURNS TABLE (archived_count INTEGER) AS $$
DECLARE
    v_count INTEGER;
BEGIN
    -- Move old resolved items to archive
    INSERT INTO form_submission_dlq_archive (
        id, execution_id, original_payload, normalized_payload,
        error_message, error_stack, error_category, failed_node, http_status_code,
        status, retry_count, max_retries,
        first_failure_at, last_failure_at, next_retry_at, resolved_at,
        retry_history, source_ip, user_agent, form_type,
        workflow_version, environment, n8n_instance_id,
        assigned_to, review_notes, created_at, updated_at,
        archive_reason
    )
    SELECT 
        id, execution_id, original_payload, normalized_payload,
        error_message, error_stack, error_category, failed_node, http_status_code,
        status, retry_count, max_retries,
        first_failure_at, last_failure_at, next_retry_at, resolved_at,
        retry_history, source_ip, user_agent, form_type,
        workflow_version, environment, n8n_instance_id,
        assigned_to, review_notes, created_at, updated_at,
        'auto_cleanup_' || p_older_than_days || '_days'
    FROM form_submission_dlq 
    WHERE status = 'RESOLVED' 
      AND resolved_at < NOW() - (p_older_than_days || ' days')::INTERVAL;
    
    GET DIAGNOSTICS v_count = ROW_COUNT;
    
    -- Delete from main table
    DELETE FROM form_submission_dlq 
    WHERE status = 'RESOLVED' 
      AND resolved_at < NOW() - (p_older_than_days || ' days')::INTERVAL;
    
    -- Log the archive action
    IF v_count > 0 THEN
        INSERT INTO dlq_audit_log (action, details, performed_by)
        VALUES (
            'bulk_archive',
            jsonb_build_object(
                'archived_count', v_count,
                'older_than_days', p_older_than_days,
                'reason', 'auto_cleanup'
            ),
            'system'
        );
    END IF;
    
    archived_count := v_count;
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Manual Retry Function
-- ============================================

CREATE OR REPLACE FUNCTION reset_for_manual_retry(
    p_dlq_id UUID,
    p_reset_count BOOLEAN DEFAULT false,
    p_notes TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    v_retry_count INTEGER;
BEGIN
    -- Get current retry count if not resetting
    IF NOT p_reset_count THEN
        SELECT retry_count INTO v_retry_count FROM form_submission_dlq WHERE id = p_dlq_id;
    ELSE
        v_retry_count := 0;
    END IF;
    
    UPDATE form_submission_dlq 
    SET 
        status = 'PENDING_RETRY',
        retry_count = v_retry_count,
        next_retry_at = NOW(),
        review_notes = COALESCE(review_notes || E'\n', '') || 
            '[Manual Retry ' || NOW() || ']: ' || COALESCE(p_notes, 'Reset for manual retry'),
        assigned_to = NULL
    WHERE id = p_dlq_id;
    
    -- Log the action
    INSERT INTO dlq_audit_log (dlq_entry_id, action, details, performed_by)
    VALUES (
        p_dlq_id,
        'manual_retry_scheduled',
        jsonb_build_object(
            'reset_count', p_reset_count,
            'notes', p_notes
        ),
        'manual'
    );
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Health Check Function
-- ============================================

CREATE OR REPLACE FUNCTION dlq_health_check()
RETURNS TABLE (
    check_name VARCHAR,
    status VARCHAR,
    details JSONB
) AS $$
BEGIN
    -- Database connectivity check
    check_name := 'database_connection';
    status := 'healthy';
    details := jsonb_build_object('connected', true);
    RETURN NEXT;
    
    -- Pending retry count check
    check_name := 'pending_backlog';
    SELECT 
        CASE 
            WHEN COUNT(*) > 100 THEN 'warning'
            WHEN COUNT(*) > 1000 THEN 'critical'
            ELSE 'healthy'
        END,
        jsonb_build_object('pending_count', COUNT(*))
    INTO status, details
    FROM form_submission_dlq 
    WHERE status = 'PENDING_RETRY';
    RETURN NEXT;
    
    -- Stale items check (in progress for too long)
    check_name := 'stale_items';
    SELECT 
        CASE 
            WHEN COUNT(*) > 0 THEN 'warning'
            ELSE 'healthy'
        END,
        jsonb_build_object('stale_count', COUNT(*))
    INTO status, details
    FROM form_submission_dlq 
    WHERE status = 'IN_PROGRESS' 
    AND updated_at < NOW() - INTERVAL '30 minutes';
    RETURN NEXT;
    
    -- Recent permanent failures check
    check_name := 'recent_permanent_failures';
    SELECT 
        CASE 
            WHEN COUNT(*) > 5 THEN 'critical'
            WHEN COUNT(*) > 0 THEN 'warning'
            ELSE 'healthy'
        END,
        jsonb_build_object('count_1h', COUNT(*))
    INTO status, details
    FROM form_submission_dlq 
    WHERE status = 'PERMANENT_FAILURE' 
    AND last_failure_at > NOW() - INTERVAL '1 hour';
    RETURN NEXT;
    
    -- Success rate check (24h)
    check_name := 'success_rate_24h';
    SELECT 
        CASE 
            WHEN success_rate < 50 THEN 'critical'
            WHEN success_rate < 70 THEN 'warning'
            ELSE 'healthy'
        END,
        jsonb_build_object('success_rate_pct', success_rate)
    INTO status, details
    FROM (
        SELECT ROUND(
            100.0 * COUNT(*) FILTER (WHERE status = 'RESOLVED') / 
            NULLIF(COUNT(*), 0), 2
        ) as success_rate
        FROM form_submission_dlq
        WHERE created_at > NOW() - INTERVAL '24 hours'
    ) rates;
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Sample Queries Documentation
-- ============================================

COMMENT ON TABLE form_submission_dlq IS 'Primary Dead Letter Queue table for form submission failures';
COMMENT ON TABLE form_submission_dlq_archive IS 'Archive table for old or permanently failed submissions';
COMMENT ON TABLE dlq_audit_log IS 'Audit trail of all DLQ operations';
COMMENT ON VIEW dlq_statistics IS 'Aggregated DLQ statistics by status, category, and form type';
COMMENT ON VIEW dlq_detailed_stats IS 'Comprehensive DLQ health and performance metrics';

COMMENT ON FUNCTION calculate_next_retry IS 'Calculates next retry timestamp with exponential backoff and jitter';
COMMENT ON FUNCTION archive_resolved_items IS 'Archives resolved DLQ entries older than specified days';
COMMENT ON FUNCTION reset_for_manual_retry IS 'Resets a DLQ entry for manual retry processing';
COMMENT ON FUNCTION dlq_health_check IS 'Performs comprehensive health checks on the DLQ system';
