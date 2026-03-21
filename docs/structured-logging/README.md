# Structured Logging for Zaplit

This directory contains documentation and implementation details for the structured logging system using Pino.

## Files

| File | Description |
|------|-------------|
| `IMPLEMENTATION.md` | Complete implementation guide and architecture |
| `MIGRATION_GUIDE.md` | Step-by-step migration from console.* to structured logging |
| `CONSOLE_AUDIT.md` | Audit report of all console statements that were migrated |

## Quick Start

### 1. Install Dependencies

```bash
cd zaplit-com
pnpm add pino
pnpm add -D pino-pretty

cd ../zaplit-org
pnpm add pino
pnpm add -D pino-pretty
```

### 2. Add Environment Variables

```bash
# .env.local
LOG_LEVEL=debug
LOG_PRETTY=true
SERVICE_NAME=zaplit-com
```

### 3. Usage

```typescript
import { logger, getLoggerWithContext, createComponentLogger } from "@/lib/logger";

// Basic logging
logger.info("Server started");

// With context (in API routes)
export async function POST(request: NextRequest) {
  const log = getLoggerWithContext(request);
  log.info({ formType }, "Processing form");
}

// Component logger
const myLogger = createComponentLogger("my-module");
myLogger.warn({ threshold }, "Rate limit approaching");
```

## Log Output Examples

### Development (Pretty)

```
[09:45:12.345] INFO (zaplit-com): Form submitted successfully
    formType: "contact"
    emailHash: "a1b2c3d4e5f67890"
    requestId: "550e8400-e29b-41d4-a716-446655440000"
```

### Production (JSON)

```json
{
  "level": "info",
  "time": 1710931200000,
  "pid": 1234,
  "service": "zaplit-com",
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "environment": "production",
  "msg": "Form submitted successfully",
  "formType": "contact",
  "emailHash": "a1b2c3d4e5f67890"
}
```

## Log Levels

| Level | Numeric | Usage |
|-------|---------|-------|
| trace | 10 | Detailed tracing |
| debug | 20 | Development debugging |
| info | 30 | General operations |
| warn | 40 | Warnings |
| error | 50 | Errors |
| fatal | 60 | Critical failures |

## Sensitive Data Redaction

The following fields are automatically redacted:
- `password`, `token`, `email`
- `authorization`, `cookie`
- `apiKey`, `secret`
- `creditCard`, `ssn`

## Request ID Propagation

Request IDs are automatically:
1. Generated or extracted from incoming requests
2. Added to response headers (`x-request-id`)
3. Included in all log entries for correlation
4. Available via `getLoggerWithContext(request)`

## Architecture

```
Request → Middleware (addRequestId) → Route Handler (withLogging)
                                           ↓
                                    AsyncLocalStorage Context
                                           ↓
                                    getLoggerWithContext()
                                           ↓
                                    Pino Logger (JSON/Pretty)
```

## Best Practices

1. Use `getLoggerWithContext(request)` in API routes
2. Pass errors as `{ err: error }` not as string interpolation
3. Hash PII (email, IP) before logging
4. Use appropriate log levels
5. Include relevant metadata as object properties

## Troubleshooting

**Logs not appearing?**
- Check `LOG_LEVEL` environment variable
- Verify logger import path

**Missing requestId?**
- Ensure middleware is configured
- Use `getLoggerWithContext()` in API routes

**Too verbose?**
- Set `LOG_LEVEL=warn` in production
- Use component loggers with specific contexts
