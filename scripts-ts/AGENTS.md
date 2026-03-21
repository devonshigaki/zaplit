# scripts-ts - Agent Context

TypeScript deployment and maintenance scripts for Zaplit infrastructure.

## Quick Reference

```bash
# Building
pnpm build            # Compile TypeScript to dist/
pnpm typecheck        # Check types only

# Security
pnpm security:verify-encryption     # Verify encryption keys
pnpm security:enable-auth           # Enable basic auth

# Database
pnpm dr:backup-db                   # Backup database
pnpm dr:setup-snapshots             # Setup snapshot schedules

# DLQ Processing
pnpm dlq:process-retries            # Process DLQ retries (once)
pnpm dlq:process-continuous         # Process continuously
pnpm dlq:archive                    # Archive old entries

# Deployment
pnpm deploy:phase1                  # Deploy Phase 1
pnpm deploy:phase1:dry-run          # Dry run deployment
pnpm deploy:circuit-breaker         # Deploy circuit breaker
pnpm deploy:dlq                     # Deploy DLQ infrastructure
pnpm deploy:postgres-replication    # Setup Postgres replication

# Verification
pnpm verify:deployment              # Verify deployment
pnpm verify:predeploy               # Pre-deployment checks
pnpm rollback:phase1                # Rollback Phase 1

# Testing
pnpm test:health                    # Health check
pnpm test:integration               # Integration tests
pnpm test:circuit-breaker           # Circuit breaker tests
pnpm test:dlq                       # DLQ tests
```

## Project Structure

```
scripts-ts/
├── src/
│   ├── deploy/         # Deployment scripts
│   ├── dr/             # Disaster recovery
│   ├── lib/            # Shared utilities
│   ├── monitoring/     # Monitoring setup
│   ├── security/       # Security scripts
│   ├── tests/          # Test scripts
│   └── types/          # Type definitions
├── dist/               # Compiled output (gitignored)
├── package.json
└── tsconfig.json
```

## Module System

**Important:** This package uses ESM (`"type": "module"` in package.json).

### Import Rules
- Use `.js` extension for all imports: `from './logger.js'`
- Use named exports preferentially
- No CommonJS `require()` statements

### Example
```typescript
// ✅ Correct
import { logger } from './logger.js';
import type { LogLevel } from './logger.js';

// ❌ Incorrect
import { logger } from './logger';
const logger = require('./logger');
```

## Library Exports

### Logger (`lib/logger.ts`)
```typescript
export { logger, createCheckLogger, Logger, type LogLevel } from './logger.js';
```
- `logger` - Pino logger instance
- `createCheckLogger(name)` - Child logger with check context
- `Logger` class - Wrapper for compatibility

### Exec (`lib/exec.ts`)
```typescript
export { execCommand, execCommandSilent, CommandExecutor, type ExecResult, type ExecOptions } from './exec.js';
```
- `execCommand(cmd, args, options)` - Execute with error handling
- `execCommandSilent(cmd, args)` - Execute, return boolean success
- `CommandExecutor` class - Class wrapper for compatibility

### GCloud (`lib/gcloud.ts`)
```typescript
export { GCloudClient, createGCloudClient, type GCloudConfig, type VMInstance, type DiskInfo } from './gcloud.js';
```
- `GCloudClient` - GCP operations (VMs, disks, secrets)
- `createGCloudClient(config?)` - Factory function

### Circuit Breaker (`lib/circuit-breaker.ts`)
Full circuit breaker implementation with Redis backing.

### Redis (`lib/redis.ts`)
Redis client wrapper with error handling.

## Environment Variables

```bash
# GCP
GCP_PROJECT_ID=zaplit-production
GCP_ZONE=us-central1-a
GCP_REGION=us-central1

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Logging
LOG_LEVEL=info
DEPLOYMENT_ENV=production
```

## Type Issues (Known)

This package has known TypeScript issues that are **non-blocking** for dev-only usage:

1. **ESM/CJS conflicts** - Some imports need `.js` extensions
2. **Type mismatches** - Some function signatures need alignment
3. **Unused variables** - Scripts often have intentional unused params

**Status:** Scripts execute correctly despite type warnings.

## Script Development Guidelines

### New Script Template
```typescript
#!/usr/bin/env node
/**
 * Script description
 */
import { logger } from '../lib/logger.js';
import { execCommand } from '../lib/exec.js';

const log = createCheckLogger('script-name');

async function main(): Promise<void> {
  try {
    log.info('Starting script');
    // Script logic here
    log.info('Script completed');
  } catch (error) {
    log.error('Script failed', error as Error);
    process.exit(1);
  }
}

main();
```

### Error Handling
- Always wrap in try-catch
- Use `logger` for structured logging
- Exit with code 1 on failure
- Return structured results

### Async Patterns
- Use async/await exclusively
- No callbacks
- Proper error propagation

## Testing Scripts

```bash
# Run a script directly
ts-node src/deploy/deploy-phase1.ts

# Run with dry-run
pnpm deploy:phase1:dry-run

# Debug with Node
node --inspect-brk node_modules/.bin/ts-node src/script.ts
```

## Common Tasks

### Adding a New Script
1. Create file in appropriate directory
2. Add script entry to package.json
3. Export any shared types from `types/`
4. Add tests if complex

### Fixing Type Errors
1. Ensure `.js` extension on imports
2. Check for proper type annotations
3. Use `type` keyword for type-only imports
4. Add `@ts-expect-error` with explanation if needed

### Updating Dependencies
```bash
pnpm update
pnpm build          # Verify build still works
pnpm typecheck      # Check for new type errors
```

## Security Notes

- Never log secrets or credentials
- Use GCP Secret Manager for sensitive data
- Validate all inputs
- Use parameterized commands (no shell injection)

## Troubleshooting

### "Cannot find module"
- Add `.js` extension to import
- Check that file exists
- Run `pnpm build` to verify

### Type errors in node_modules
- Add to tsconfig.json `exclude`
- Or add `@ts-expect-error` comment

### ESM import errors
- Ensure `"type": "module"` in package.json
- Use `.js` extensions
- No `require()` statements
