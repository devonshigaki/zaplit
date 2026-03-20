# Shell Script to TypeScript Portation Plan

## Overview

This document outlines the plan for porting remaining shell scripts in the `scripts/` directory to TypeScript in `scripts-ts/` as part of Phase 3 cleanup.

**Project**: Zaplit
**Date**: March 19, 2026
**Phase**: 3 (Cleanup)

---

## Current Status

### Already Ported ✅

| Shell Script | TypeScript Target | Status |
|--------------|-------------------|--------|
| `scripts/security/verify-encryption-key.sh` | `scripts-ts/src/security/verify-encryption-key.ts` | ✅ Complete |
| `scripts/security/enable-basic-auth.sh` | `scripts-ts/src/security/enable-basic-auth.ts` | ✅ Complete |
| `scripts/dr/backup-database.sh` | `scripts-ts/src/dr/backup-database.ts` | ✅ Complete |
| `scripts/dr/setup-snapshot-schedule.sh` | `scripts-ts/src/dr/setup-snapshots.ts` | ✅ Complete |
| `scripts/monitoring/deploy-monitoring.sh` | `scripts-ts/src/monitoring/deploy-monitoring.ts` | ✅ Complete |
| `scripts/tests/health-check.sh` | `scripts-ts/src/tests/health-check.ts` | ✅ Complete |
| `scripts/tests/run-integration-test.sh` | `scripts-ts/src/tests/run-integration-test.ts` | ✅ Complete |
| `scripts/tests/verify-crm-records.sh` | `scripts-ts/src/tests/verify-crm-records.ts` | ✅ Complete |
| `scripts/tests/cleanup-test-data.sh` | `scripts-ts/src/tests/cleanup-test-data.ts` | ✅ Complete |
| `scripts/tests/load-test.sh` | `scripts-ts/src/tests/load-test.ts` | ✅ Complete |

### Shared Libraries (Already Implemented) ✅

- `scripts-ts/src/lib/logger.ts` - Color-coded logging with structured output
- `scripts-ts/src/lib/exec.ts` - Command execution utilities (gcloud, docker, ssh)
- `scripts-ts/src/lib/gcloud.ts` - GCP client wrapper with VM operations
- `scripts-ts/src/lib/index.ts` - Library exports

---

## Scripts Requiring Portation

### Deployment Scripts (Priority: HIGH)

#### 1. `deploy-phase1.sh` → `scripts-ts/src/deploy/deploy-phase1.ts`

**Complexity**: **Complex** (~600 lines)

**Description**: Master deployment orchestration script for Phase 1 stabilization

**Key Features**:
- Argument parsing (`--dry-run`, `--skip-security`, `--skip-dr`, `--skip-monitoring`)
- Multi-phase deployment (Security, DR, Monitoring, Data Quality)
- Deployment status tracking with associative arrays
- Sub-script invocation and coordination
- Post-deployment verification
- JSON output option

**Dependencies**:
- `GCloudClient` (existing)
- `Logger` (existing)
- `CommandExecutor` (existing)
- GCP SDK for VM operations
- External script calls (challenging - needs refactoring)

**Porting Notes**:
- Replace associative arrays with Maps
- Convert bash argument parsing to `process.argv` or `commander` library
- Replace sub-script calls with direct TypeScript function calls
- Create a `DeploymentOrchestrator` class

**Estimated Effort**: 2-3 days

---

#### 2. `deploy-circuit-breaker.sh` → `scripts-ts/src/deploy/deploy-circuit-breaker.ts`

**Complexity**: **Medium** (~476 lines)

**Description**: Deploys Redis and configures circuit breaker for n8n workflows

**Key Features**:
- Multi-OS Redis installation (apt, yum, dnf, brew)
- Redis configuration for circuit breaker state
- n8n configuration file generation
- TypeScript test execution
- Monitoring script generation
- Environment file creation

**Dependencies**:
- OS detection utilities
- Redis client for Node.js (`ioredis` or `redis`)
- File system operations
- `CommandExecutor` for Redis CLI

**Porting Notes**:
- Use `ioredis` library for Redis operations
- Replace OS-specific package managers with Docker-based Redis option
- Create `CircuitBreakerDeployer` class
- Generate JSON config instead of shell sourcing

**New Dependencies**:
```json
"ioredis": "^5.3.2"
```

**Estimated Effort**: 1-2 days

---

#### 3. `deploy-dlq.sh` → `scripts-ts/src/deploy/deploy-dlq.ts`

**Complexity**: **Medium** (~470 lines)

**Description**: Deploys Dead Letter Queue infrastructure for form submissions

**Key Features**:
- Database schema deployment via psql
- n8n workflow import via CLI and API
- Cron job setup
- Environment configuration
- Deployment verification

**Dependencies**:
- `pg` library for PostgreSQL
- n8n API client
- File system operations
- `node-cron` or similar for cron management

**Porting Notes**:
- Use existing `pg` dependency
- Create `DLQDeployer` class
- Implement n8n API client wrapper
- Consider using node-schedule instead of system cron

**Estimated Effort**: 1-2 days

---

#### 4. `deploy-postgres-replication.sh` → `scripts-ts/src/deploy/deploy-postgres-replication.ts`

**Complexity**: **Complex** (~891 lines)

**Description**: Deploys PostgreSQL primary-standby streaming replication

**Key Features**:
- Standby VM provisioning via gcloud
- Primary server configuration (postgresql.conf, pg_hba.conf)
- pg_basebackup execution
- PgBouncer configuration
- Replication testing
- Monitoring setup with postgres_exporter

**Dependencies**:
- `GCloudClient` (existing)
- SSH client for remote operations
- PostgreSQL client libraries
- Template engine for config files

**Porting Notes**:
- Create `PostgresReplicationDeployer` class
- Break into phases as methods
- Use template strings for config generation
- Consider using `ssh2` library for remote operations

**New Dependencies**:
```json
"ssh2": "^1.15.0",
"@types/ssh2": "^1.11.18"
```

**Estimated Effort**: 3-4 days

---

#### 5. `migrate-to-parallel.sh` → `scripts-ts/src/deploy/migrate-to-parallel.ts`

**Complexity**: **Medium** (~674 lines)

**Description**: Migrates n8n workflow from v3 sequential to v4 parallel processing

**Key Features**:
- Pre-flight checks
- Workflow backup
- n8n workflow import via API
- HTTP Keep-Alive configuration
- Validation tests with timing
- Traffic switching coordination
- Post-migration checklist generation

**Dependencies**:
- n8n API client
- HTTP client for webhook testing
- File system operations
- Performance measurement utilities

**Porting Notes**:
- Create `WorkflowMigrator` class
- Implement n8n API client
- Use `axios` or native `fetch` for HTTP requests
- Generate markdown checklist files

**New Dependencies**:
```json
"axios": "^1.6.2"
```

**Estimated Effort**: 2 days

---

#### 6. `rollback-phase1.sh` → `scripts-ts/src/deploy/rollback-phase1.ts`

**Complexity**: **Medium** (~415 lines)

**Description**: Emergency rollback script for Phase 1 changes

**Key Features**:
- Component-specific rollback (security, dr, monitoring)
- Multi-level confirmation prompts
- Backup restoration
- Docker compose rollback
- Snapshot schedule removal
- Post-rollback verification

**Dependencies**:
- `GCloudClient` (existing)
- `Logger` (existing)
- Docker compose operations

**Porting Notes**:
- Create `Phase1Rollback` class
- Use readline for interactive prompts
- Implement backup file discovery logic

**Estimated Effort**: 1-2 days

---

#### 7. `verify-deployment.sh` → `scripts-ts/src/deploy/verify-deployment.ts`

**Complexity**: **Medium** (~596 lines)

**Description**: Post-deployment verification with comprehensive health checks

**Key Features**:
- Connectivity verification (SSH, Docker, n8n)
- Infrastructure checks (disk, memory, containers)
- Security verification (encryption, auth, HMAC)
- DR verification (snapshots, backups, cron)
- Monitoring verification (Prometheus, Grafana)
- Data quality verification
- JSON output option

**Dependencies**:
- `GCloudClient` (existing)
- `Logger` (existing)
- HTTP client for health checks
- Result aggregation

**Porting Notes**:
- Create `DeploymentVerifier` class
- Define verification result interfaces
- Implement category-based checks
- Support JSON output format

**Estimated Effort**: 1-2 days

---

#### 8. `verify-predeploy.sh` → `scripts-ts/src/deploy/verify-predeploy.ts`

**Complexity**: **Simple** (~258 lines)

**Description**: Pre-deployment prerequisite verification

**Key Features**:
- gcloud CLI check
- GCP authentication check
- SSH access verification
- Instance status check
- Docker/n8n checks
- Disk space check
- GCS bucket check

**Dependencies**:
- `GCloudClient` (existing)
- `Logger` (existing)

**Porting Notes**:
- Create `PreDeployVerifier` class
- Reuse existing library functions
- Simple pass/fail check structure

**Estimated Effort**: 0.5-1 day

---

## New Directory Structure

```
scripts-ts/
├── src/
│   ├── lib/                    # Existing shared libraries
│   │   ├── logger.ts
│   │   ├── exec.ts
│   │   ├── gcloud.ts
│   │   └── index.ts
│   ├── security/               # Existing ✅
│   │   ├── verify-encryption-key.ts
│   │   └── enable-basic-auth.ts
│   ├── dr/                     # Existing ✅
│   │   ├── backup-database.ts
│   │   ├── setup-snapshots.ts
│   │   ├── retry-processor.ts
│   │   └── dlq-api.ts
│   ├── monitoring/             # Existing ✅
│   │   └── deploy-monitoring.ts
│   ├── tests/                  # Existing ✅
│   │   ├── health-check.ts
│   │   ├── run-integration-test.ts
│   │   ├── verify-crm-records.ts
│   │   ├── cleanup-test-data.ts
│   │   ├── load-test.ts
│   │   ├── circuit-breaker.test.ts
│   │   └── dlq.test.ts
│   ├── deploy/                 # NEW - Deployment scripts
│   │   ├── deploy-phase1.ts
│   │   ├── deploy-circuit-breaker.ts
│   │   ├── deploy-dlq.ts
│   │   ├── deploy-postgres-replication.ts
│   │   ├── migrate-to-parallel.ts
│   │   ├── rollback-phase1.ts
│   │   ├── verify-deployment.ts
│   │   └── verify-predeploy.ts
│   └── dlq/                    # Existing ✅
│       └── types.ts
├── package.json                # To be updated
├── tsconfig.json
└── README.md                   # To be updated
```

---

## Package.json Scripts to Add

```json
{
  "scripts": {
    "build": "tsc",
    
    // Security (existing)
    "security:verify-encryption": "ts-node src/security/verify-encryption-key.ts",
    "security:enable-auth": "ts-node src/security/enable-basic-auth.ts",
    
    // DR (existing)
    "dr:backup-db": "ts-node src/dr/backup-database.ts",
    "dr:setup-snapshots": "ts-node src/dr/setup-snapshots.ts",
    "dlq:process-retries": "ts-node src/dr/retry-processor.ts --once",
    "dlq:process-continuous": "ts-node src/dr/retry-processor.ts",
    "dlq:archive": "ts-node src/dr/retry-processor.ts --archive --once",
    
    // Monitoring (existing)
    "monitoring:deploy": "ts-node src/monitoring/deploy-monitoring.ts",
    
    // Deployment (NEW)
    "deploy:phase1": "ts-node src/deploy/deploy-phase1.ts",
    "deploy:phase1:dry-run": "ts-node src/deploy/deploy-phase1.ts --dry-run",
    "deploy:circuit-breaker": "ts-node src/deploy/deploy-circuit-breaker.ts",
    "deploy:dlq": "ts-node src/deploy/deploy-dlq.ts",
    "deploy:postgres-replication": "ts-node src/deploy/deploy-postgres-replication.ts",
    "deploy:migrate-parallel": "ts-node src/deploy/migrate-to-parallel.ts",
    
    // Rollback (NEW)
    "rollback:phase1": "ts-node src/deploy/rollback-phase1.ts",
    "rollback:phase1:all": "ts-node src/deploy/rollback-phase1.ts --component all",
    
    // Verification (NEW)
    "verify:deployment": "ts-node src/deploy/verify-deployment.ts",
    "verify:deployment:json": "ts-node src/deploy/verify-deployment.ts --json",
    "verify:predeploy": "ts-node src/deploy/verify-predeploy.ts",
    
    // Testing (existing)
    "test:health": "ts-node src/tests/health-check.ts",
    "test:integration": "ts-node src/tests/run-integration-test.ts",
    "test:verify-crm": "ts-node src/tests/verify-crm-records.ts",
    "test:cleanup": "ts-node src/tests/cleanup-test-data.ts",
    "test:load": "ts-node src/tests/load-test.ts",
    "test:circuit-breaker": "ts-node src/tests/circuit-breaker.test.ts",
    "test:dlq": "ts-node src/tests/dlq.test.ts",
    
    // Utility
    "lint": "eslint src/**/*.ts",
    "lint:fix": "eslint src/**/*.ts --fix"
  }
}
```

---

## New Dependencies Required

```json
{
  "dependencies": {
    "@google-cloud/compute": "^4.0.1",
    "@google-cloud/secret-manager": "^5.0.1",
    "@google-cloud/storage": "^7.7.0",
    "pg": "^8.11.3",
    
    // NEW DEPENDENCIES
    "axios": "^1.6.2",
    "commander": "^11.1.0",
    "ioredis": "^5.3.2",
    "ssh2": "^1.15.0"
  },
  "devDependencies": {
    "@types/node": "^20.10.0",
    "@types/pg": "^8.10.9",
    "@types/ssh2": "^1.11.18",
    "@typescript-eslint/eslint-plugin": "^6.14.0",
    "@typescript-eslint/parser": "^6.14.0",
    "eslint": "^8.55.0",
    "ts-node": "^10.9.2",
    "typescript": "^5.3.3"
  }
}
```

---

## Porting Priority Order

### Phase 3A - Essential Verification (Week 1)
1. `verify-predeploy.ts` - Simple, needed for all deployments
2. `verify-deployment.ts` - Medium complexity, critical for validation
3. `rollback-phase1.ts` - Medium complexity, safety requirement

### Phase 3B - Core Deployment (Week 2)
4. `deploy-dlq.ts` - Medium complexity, isolated component
5. `deploy-circuit-breaker.ts` - Medium complexity, isolated component
6. `migrate-to-parallel.ts` - Medium complexity, workflow management

### Phase 3C - Complex Deployment (Week 3)
7. `deploy-phase1.ts` - Complex, orchestrates multiple components
8. `deploy-postgres-replication.ts` - Complex, infrastructure heavy

---

## Documentation Updates Required

### 1. Create `docs/ops/automation.md`

New documentation file covering:
- Overview of TypeScript automation scripts
- Migration from shell to TypeScript
- Script categories (security, dr, monitoring, deployment, testing)
- Usage examples for each script
- Environment variable reference
- Exit codes reference
- Troubleshooting common issues

### 2. Update `scripts-ts/README.md`

- Add new deployment scripts to project structure
- Document new npm scripts
- Add usage examples for new scripts

### 3. Update `scripts-ts/package.json`

- Add new scripts entries
- Add new dependencies

---

## Implementation Patterns

### Class-Based Architecture

All new scripts should follow the existing pattern:

```typescript
#!/usr/bin/env ts-node
import { Logger } from '../lib/logger';
import { GCloudClient, createGCloudClient } from '../lib/gcloud';

interface Config {
  // Script-specific configuration
}

class ScriptName {
  private logger: Logger;
  private gcloud: GCloudClient;
  private config: Config;

  constructor(config: Config) {
    this.config = config;
    this.logger = new Logger();
    this.gcloud = createGCloudClient({
      projectId: config.projectId,
      zone: config.zone,
    });
  }

  async run(): Promise<number> {
    this.printHeader();
    
    // Implementation
    
    return 0; // exit code
  }

  private printHeader(): void {
    this.logger.header('Script Title', {
      Instance: this.config.instanceName,
      Zone: this.config.zone,
    });
  }
}

// Main execution
const main = async (): Promise<void> => {
  const script = new ScriptName({ /* config */ });
  const exitCode = await script.run();
  process.exit(exitCode);
};

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
```

### Error Handling

```typescript
try {
  const result = await someAsyncOperation();
  this.logger.success('Operation completed');
} catch (error) {
  this.logger.error(`Operation failed: ${error.message}`);
  return 1;
}
```

### Command Line Arguments

Use the `commander` library for argument parsing:

```typescript
import { Command } from 'commander';

const program = new Command()
  .option('-d, --dry-run', 'Simulate without making changes')
  .option('--skip-security', 'Skip security deployment')
  .parse(process.argv);

const options = program.opts();
```

---

## Testing Strategy

### Unit Tests
- Test individual class methods
- Mock GCP and external services

### Integration Tests
- Test against staging environment
- Validate end-to-end workflows

### Migration Testing
1. Run shell script
2. Run equivalent TypeScript script
3. Compare outputs and behavior
4. Verify exit codes match

---

## Risk Assessment

| Script | Risk Level | Mitigation |
|--------|-----------|------------|
| verify-predeploy.ts | Low | Read-only operations |
| verify-deployment.ts | Low | Read-only operations |
| rollback-phase1.ts | High | Multi-confirmation prompts, backups |
| deploy-dlq.ts | Medium | Dry-run mode, schema versioning |
| deploy-circuit-breaker.ts | Medium | Non-destructive Redis operations |
| migrate-to-parallel.ts | High | Backup workflow, dry-run mode |
| deploy-phase1.ts | High | Orchestrates multiple components |
| deploy-postgres-replication.ts | High | Infrastructure changes, VM creation |

---

## Estimated Timeline

| Phase | Scripts | Estimated Days |
|-------|---------|----------------|
| 3A (Verification) | 3 | 3-5 days |
| 3B (Core Deployment) | 3 | 4-6 days |
| 3C (Complex Deployment) | 2 | 5-7 days |
| Documentation | - | 1-2 days |
| Testing & Validation | - | 2-3 days |
| **Total** | **8** | **15-23 days** |

---

## Success Criteria

- All 8 scripts ported to TypeScript
- All existing npm scripts continue to work
- New npm scripts added and documented
- Documentation created at `docs/ops/automation.md`
- All scripts pass linting
- Integration tests pass in staging environment
- Original shell scripts preserved (for rollback if needed)

---

## Notes

1. **Preserve Shell Scripts**: Keep original shell scripts until TypeScript versions are fully validated in production
2. **Exit Code Compatibility**: Ensure TypeScript scripts return same exit codes as shell versions
3. **Logging Compatibility**: Maintain similar log output format for easier comparison
4. **Feature Parity**: Ensure all shell script features are implemented in TypeScript
5. **Documentation**: Update documentation as scripts are ported
