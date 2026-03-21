# Structured Logging Implementation for Zaplit Monorepo

## Overview

This document describes the structured logging implementation for the Zaplit monorepo using Pino logger with Next.js App Router support.

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Next.js App    │────▶│  Request ID     │────▶│  Pino Logger    │
│  (Route Handler)│     │  Middleware     │     │  (Structured)   │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                        │
                                                        ▼
                                               ┌─────────────────┐
                                               │  JSON Output    │
                                               │  (Production)   │
                                               │  Pretty (Dev)   │
                                               └─────────────────┘
```

## Log Levels

| Level | Usage | Example |
|-------|-------|---------|
| `trace` | Very detailed debugging | Function entry/exit points |
| `debug` | Development details | Request payload inspection |
| `info` | General operations | Form submitted, webhook sent |
| `warn` | Warnings | Rate limit approaching |
| `error` | Errors with context | Webhook failed after retries |
| `fatal` | Critical failures | Database connection lost |

## Structured Log Format

```json
{
  "level": "info",
  "time": 1710931200000,
  "pid": 1234,
  "hostname": "api-server-01",
  "service": "zaplit-com",
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "environment": "production",
  "msg": "Form submitted successfully",
  "formType": "contact",
  "emailHash": "a1b2c3d4e5f67890",
  "ipHash": "f9e8d7c6b5a43210",
  "durationMs": 245,
  "context": {
    "route": "/api/submit-form",
    "method": "POST"
  }
}
```

## Sensitive Data Redaction

The following fields are automatically redacted:

- `password`
- `token`
- `email` (original value)
- `authorization`
- `cookie`
- `apiKey`
- `secret`
- `creditCard`
- `ssn`

Redacted values appear as `[Redacted]` in logs.

## Migration from console.*

### Before
```typescript
console.log("[AUDIT] Form submitted:", { formType, email });
console.error("[N8N] Webhook failed:", error);
```

### After
```typescript
import { logger } from "@/lib/logger";

logger.info({ formType, emailHash: hashEmail(email) }, "Form submitted");
logger.error({ err: error, formType }, "Webhook failed");
```

## Usage Examples

### Basic Logging
```typescript
import { logger } from "@/lib/logger";

logger.info("Server started");
logger.debug({ payload }, "Request received");
logger.error({ err: error }, "Operation failed");
```

### With Request Context
```typescript
import { getLoggerWithContext } from "@/lib/logger";

export async function POST(request: NextRequest) {
  const log = getLoggerWithContext(request);
  
  log.info({ formType }, "Processing form submission");
  // Logs include requestId automatically
}
```

### Child Loggers
```typescript
const webhookLogger = logger.child({ component: "n8n-webhook" });

webhookLogger.info({ formType }, "Sending to n8n");
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `LOG_LEVEL` | Minimum log level | `info` |
| `LOG_PRETTY` | Enable pretty printing | `true` in dev |
| `SERVICE_NAME` | Service identifier | `zaplit-app` |

### Log Level by Environment

- **Development**: `debug` with pretty printing
- **Staging**: `info` with JSON output
- **Production**: `info` with JSON output (or `warn` for high-traffic)

## Files Changed

| File | Changes |
|------|---------|
| `lib/logger.ts` | New - Pino logger configuration |
| `lib/logger-middleware.ts` | New - Request ID middleware |
| `middleware.ts` | Updated - Added request ID propagation |
| `app/api/submit-form/route.ts` | Updated - Replaced console with logger |
| `lib/env.ts` | Updated - Using logger instead of console |
| `components/error-boundary.tsx` | Updated - Error reporting with logger |

## Testing

```bash
# Run tests
pnpm test

# Check logs in development
pnpm dev
# Logs appear in terminal with colors

# Check logs in production mode
LOG_LEVEL=info NODE_ENV=production pnpm start
# Logs appear as JSON lines
```

## Best Practices

1. **Always use structured logging**: Pass objects as first argument, message as second
2. **Hash PII**: Use `hashEmail()` and `hashIP()` before logging
3. **Include context**: Add relevant metadata (formType, submissionId, etc.)
4. **Use appropriate levels**: Don't use `error` for expected conditions
5. **Avoid logging in loops**: Use sampling or log once outside loops

## Troubleshooting

### Logs not appearing
- Check `LOG_LEVEL` environment variable
- Verify logger import path

### Too verbose in production
- Set `LOG_LEVEL=warn` or `LOG_LEVEL=error`
- Use sampling for high-frequency logs

### Missing requestId
- Ensure middleware is configured for the route
- Check that `getLoggerWithContext()` is used
