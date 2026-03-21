# Console.* to Structured Logging Migration Guide

## Summary of Changes

This migration replaces all `console.*` statements with structured logging using Pino across the Zaplit monorepo.

## Files Modified

### zaplit-com

| File | Changes | Console Statements Replaced |
|------|---------|----------------------------|
| `lib/logger.ts` | ✅ Created | New file |
| `lib/logger-middleware.ts` | ✅ Created | New file |
| `middleware.ts` | ✅ Updated | Added request ID handling |
| `app/api/submit-form/route.ts` | ✅ Updated | 9 statements |
| `lib/env.ts` | ✅ Updated | 1 statement |
| `components/error-boundary.tsx` | ✅ Updated | 1 statement |

### zaplit-org

| File | Changes | Console Statements Replaced |
|------|---------|----------------------------|
| `lib/logger.ts` | ✅ Created | New file |
| `lib/logger-middleware.ts` | ✅ Created | New file |
| `middleware.ts` | ✅ Updated | Added request ID handling |
| `app/api/submit-form/route.ts` | ✅ Updated | 9 statements |
| `lib/env.ts` | ✅ Updated | 1 statement |
| `components/error-boundary.tsx` | ✅ Updated | 1 statement |

## Console Statements Replaced

### Before (console.log)
```typescript
// In app/api/submit-form/route.ts
console.log("[AUDIT]", JSON.stringify(auditEntry));
console.log(`[RETRY] ${operationName} failed (attempt ${attempt}), retrying in ${delay}ms...`);
console.log(`[N8N] Sending ${formType} form with fields:`, dataFields);
console.log(`[N8N] Webhook sent successfully for submission ${submissionId}`);

// In lib/env.ts
console.log('✅ Production environment validated');
```

### After (structured logging)
```typescript
// In app/api/submit-form/route.ts
logAuditEvent({ action, formType, emailHash, ipHash, success });
log.warn({ operation, attempt, retryDelayMs }, `Retry attempt ${attempt}`);
webhookLogger.debug({ formType, dataFields }, "Sending form to n8n webhook");
log.info({ submissionId, formType }, "N8N webhook sent successfully");

// In lib/env.ts
logger.info("Production environment validated successfully");
```

### Before (console.error)
```typescript
// In app/api/submit-form/route.ts
console.error(`[RETRY] ${operationName} failed after ${RETRY_CONFIG.MAX_ATTEMPTS} attempts:`, lastError);
console.error(error);
console.error(`[N8N] ${error}`);
console.error(`[N8N] Webhook failed for submission ${submissionId}:`, n8nResult.error);
console.error("[FORM] Submission error:", error);

// In components/error-boundary.tsx
console.error("[ERROR_BOUNDARY] Uncaught error:", error, errorInfo);
```

### After (structured logging)
```typescript
// In app/api/submit-form/route.ts
log.error({ operation, attempts, error: lastError?.message }, `${operationName} failed`);
log.error({ err: error }, "N8N webhook URL not configured");
log.error({ formType, metadata }, error);
log.error({ submissionId, formType, error: n8nResult.error }, "N8N webhook failed");
log.error({ err: error, submissionId }, "Form submission error");

// In components/error-boundary.tsx
logger.error({ err: error, componentStack: errorInfo.componentStack }, "Uncaught error");
```

## Installation

Add pino to both applications:

```bash
# In zaplit-com directory
cd zaplit-com
pnpm add pino
pnpm add -D pino-pretty

# In zaplit-org directory
cd ../zaplit-org
pnpm add pino
pnpm add -D pino-pretty
```

## Environment Variables

Add to `.env.local` and `.env.production`:

```bash
# Log level: trace, debug, info, warn, error, fatal
LOG_LEVEL=info

# Pretty print logs (development only)
LOG_PRETTY=true

# Service name for log identification
SERVICE_NAME=zaplit-com  # or zaplit-org
```

## Quick Reference: Console to Logger Mapping

| Console | Logger | Use Case |
|---------|--------|----------|
| `console.log()` | `logger.info()` | General information |
| `console.info()` | `logger.info()` | Informational messages |
| `console.warn()` | `logger.warn()` | Warnings |
| `console.error()` | `logger.error({ err })` | Errors (pass error object) |
| `console.debug()` | `logger.debug()` | Debug information |

## Best Practices

1. **Always pass errors as `{ err }`**:
   ```typescript
   // Good
   logger.error({ err: error }, "Failed to process");
   
   // Bad
   logger.error("Failed to process:", error);
   ```

2. **Include structured data as first argument**:
   ```typescript
   // Good
   logger.info({ userId, action }, "User action performed");
   
   // Bad
   logger.info(`User ${userId} performed ${action}`);
   ```

3. **Use component loggers for module-specific logging**:
   ```typescript
   const myLogger = createComponentLogger("my-module");
   myLogger.info("Module-specific log");
   ```

4. **Hash PII before logging**:
   ```typescript
   logger.info({ emailHash: hashEmail(email) }, "User action");
   // NOT: logger.info({ email }, "User action");
   ```

## Testing

Verify the migration:

```bash
# Run TypeScript check
pnpm typecheck

# Run tests
pnpm test

# Check logs in development
pnpm dev
# Make a form submission and verify structured logs appear
```

## Rollback

If needed, the original console.* statements are preserved in comments marked with:
```typescript
// [ROLLBACK] Original console statement preserved
```

However, this migration completely replaces the old logging pattern.

## Migration Checklist

- [ ] Install pino and pino-pretty
- [ ] Copy lib/logger.ts to both apps
- [ ] Copy lib/logger-middleware.ts to both apps
- [ ] Update middleware.ts in both apps
- [ ] Update app/api/submit-form/route.ts in both apps
- [ ] Update lib/env.ts in both apps
- [ ] Update components/error-boundary.tsx in both apps
- [ ] Add environment variables
- [ ] Test form submissions
- [ ] Verify logs are structured correctly
- [ ] Deploy to staging
- [ ] Monitor logs in production
