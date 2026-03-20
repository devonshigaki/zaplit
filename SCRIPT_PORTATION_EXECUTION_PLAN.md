# Legacy Script Portation: Synthesis & Execution Plan

**Date:** March 19, 2026  
**Status:** CI Pipeline Passing ✅ | Ready for Script Portation

---

## CI Pipeline Status

| Check | Status | Notes |
|-------|--------|-------|
| `pnpm install` | ✅ PASS | Dependencies installed |
| `pnpm typecheck` | ✅ PASS | No TypeScript errors |
| `pnpm lint` | ✅ PASS | ESLint configured with flat config |
| `pnpm test` | ✅ PASS | No tests to run (both apps) |
| `pnpm build` | ✅ PASS | Both zaplit-com and zaplit-org built successfully |

---

## Research Synthesis: Script Analysis

### Legacy Scripts Inventory (8 files)

| Script | Lines | Functions | Port Recommendation | Priority | Difficulty | Reasoning |
|--------|-------|-----------|---------------------|----------|------------|-----------|
| `verify-predeploy.sh` | 258 | 10 | **PORT** | HIGH | Easy | Simple checks, high testability value |
| `verify-deployment.sh` | 596 | 15 | **PORT** | HIGH | Medium | Complex result tracking benefits from TS |
| `rollback-phase1.sh` | 415 | 12 | **PORT** | MEDIUM | Medium | Better error handling in TS; keep bash fallback |
| `deploy-phase1.sh` | 601 | 14 | **PORT** | HIGH | Hard | Orchestration benefits from async/await |
| `deploy-circuit-breaker.sh` | 476 | 14 | **HYBRID** | LOW | Medium | Keep OS install in bash, port config/testing |
| `deploy-dlq.sh` | 470 | 13 | **MAYBE** | LOW | Hard | Complex SQL/n8n interactions |
| `migrate-to-parallel.sh` | 674 | 14 | **NO** | N/A | Hard | Production migration too risky |
| `deploy-postgres-replication.sh` | 891 | 14 | **NO** | N/A | Extreme | Infrastructure provisioning, keep as bash |

### Portation Strategy

```
Phase 1: Quick Wins (Week 1)
├── verify-predeploy.sh → TypeScript
│   └── Dependencies: GCP SDK, SSH client
│   └── Value: Type-safe check results, better CI integration
│
└── verify-deployment.sh → TypeScript
    └── Dependencies: GCP SDK, HTTP client
    └── Value: Structured JSON output, categorized results

Phase 2: Core Orchestration (Week 2-3)
├── deploy-phase1.sh → TypeScript
│   └── Dependencies: GCP SDK, all verification modules
│   └── Value: Async orchestration, state machine, progress reporting
│
└── rollback-phase1.sh → TypeScript (with bash fallback)
    └── Dependencies: Same as deploy
    └── Value: Better error messages, confirmation UX

Phase 3: Hybrid Components (Week 4)
└── deploy-circuit-breaker.sh → Partial port
    ├── Keep: OS-specific Redis installation (bash wrapper)
    └── Port: Configuration generation, testing logic

Phase 4: Do Not Port
├── deploy-postgres-replication.sh (891 lines)
│   └── Reason: Infrastructure provisioning, SSH complexity
│   └── Risk: Too high for database operations
│
├── migrate-to-parallel.sh (674 lines)
│   └── Reason: Production workflow migration
│   └── Risk: Live traffic switching too critical
│
└── deploy-dlq.sh (470 lines)
    └── Reason: Complex SQL + n8n API interactions
    └── Alternative: Use proper migration tool
```

---

## TypeScript Technology Stack

### Recommended Dependencies

```json
{
  "dependencies": {
    "commander": "^12.0.0",
    "pino": "^9.0.0",
    "execa": "^9.0.0",
    "neverthrow": "^7.0.0",
    "zod": "^3.23.0",
    "@google-cloud/compute": "^4.0.0",
    "axios": "^1.7.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "typescript": "^5.7.0",
    "vitest": "^2.0.0",
    "@vitest/coverage-v8": "^2.0.0"
  }
}
```

### Architecture Pattern

```
scripts-ts/src/
├── commands/              # CLI commands
│   ├── verify/
│   │   ├── predeploy.ts   # Port of verify-predeploy.sh
│   │   └── deployment.ts  # Port of verify-deployment.sh
│   ├── deploy/
│   │   └── phase1.ts      # Port of deploy-phase1.sh
│   └── rollback/
│       └── phase1.ts      # Port of rollback-phase1.sh
├── lib/                   # Shared libraries
│   ├── gcp.ts            # GCP SDK wrapper
│   ├── ssh.ts            # SSH connection manager
│   ├── logger.ts         # Structured logging (Pino)
│   ├── exec.ts           # Process execution (execa)
│   └── errors.ts         # Error types (neverthrow)
├── types/                # TypeScript interfaces
│   ├── deployment.ts
│   ├── verification.ts
│   └── config.ts
└── utils/                # Utilities
    ├── validators.ts
    └── formatters.ts
```

---

## Execution Plan

### Pre-Requisites (DONE ✅)
- [x] pnpm-workspace.yaml created
- [x] ESLint flat config migrated
- [x] TypeScript compilation passing
- [x] Build pipeline working

### Phase 1: Setup TypeScript Script Infrastructure

1. **Install Dependencies**
   ```bash
   cd scripts-ts
   pnpm add commander pino execa neverthrow zod @google-cloud/compute axios
   pnpm add -D @types/node vitest @vitest/coverage-v8
   ```

2. **Create Library Foundation**
   - `lib/logger.ts` - Pino configuration
   - `lib/errors.ts` - Error types with neverthrow
   - `lib/exec.ts` - Process execution wrapper
   - `lib/gcp.ts` - GCP client

3. **Create Type Definitions**
   - `types/verification.ts` - Check result types
   - `types/deployment.ts` - Deployment state types
   - `types/config.ts` - Configuration schema

### Phase 2: Port verify-predeploy.sh

**Source:** 258 lines, 10 functions  
**Target:** TypeScript with structured output

**Key Transformations:**
- Bash functions → TypeScript async functions
- Echo output → Structured JSON logging
- Exit codes → Result types (neverthrow)
- Environment variables → Zod-validated config

**Functions to Port:**
- `check_gcloud()` → `verifyGcloud()`
- `check_gcp_auth()` → `verifyGcpAuth()`
- `check_ssh_access()` → `verifySshAccess()`
- `check_instance()` → `verifyInstance()`
- `check_docker()` → `verifyDocker()`
- `check_n8n()` → `verifyN8n()`
- `check_disk_space()` → `verifyDiskSpace()`
- `check_backup_dirs()` → `verifyBackupDirs()`
- `check_gcs()` → `verifyGcs()`
- `print_summary()` → `generateReport()`

### Phase 3: Port verify-deployment.sh

**Source:** 596 lines, 15 functions  
**Target:** TypeScript with comprehensive reporting

**Key Transformations:**
- Associative arrays → Maps/Objects
- JSON output mode → Structured JSON API
- Pass/Fail counting → Result aggregation
- Category-based checks → Class-based verifier

### Phase 4: Port deploy-phase1.sh

**Source:** 601 lines, 14 functions  
**Target:** TypeScript orchestrator with state machine

**Key Transformations:**
- Phase-based execution → Async/await with error boundaries
- Subprocess calls → Imported module functions
- Status tracking → Class-based state manager
- Skip flags → Configuration object

### Phase 5: Port rollback-phase1.sh

**Source:** 415 lines, 12 functions  
**Target:** TypeScript with bash fallback

**Key Transformations:**
- Interactive prompts → Inquirer.js
- Confirmation logic → Type-safe confirmation
- Rollback operations → Reversible operation pattern

---

## Testing Strategy

### Unit Testing
```typescript
// verify/gcp.test.ts
import { describe, it, expect, vi } from 'vitest';
import { verifyGcloud } from './gcp';
import { execa } from 'execa';

vi.mock('execa');

describe('verifyGcloud', () => {
  it('should pass when gcloud is installed', async () => {
    vi.mocked(execa).mockResolvedValue({ stdout: 'Google Cloud SDK 450.0.0' } as any);
    
    const result = await verifyGcloud();
    
    expect(result.isOk()).toBe(true);
  });
  
  it('should fail when gcloud is not installed', async () => {
    vi.mocked(execa).mockRejectedValue(new Error('command not found'));
    
    const result = await verifyGcloud();
    
    expect(result.isErr()).toBe(true);
  });
});
```

### Integration Testing
- Mock GCP API responses
- Test SSH connectivity with test containers
- Verify configuration parsing

### E2E Testing
- Dry-run mode for all operations
- Compare TypeScript output with bash output

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| **Emergency script failure** | Keep bash versions as `*.sh.bak` for 90 days |
| **Feature parity gaps** | Extensive dry-run testing before production use |
| **Team adoption** | Document usage patterns, provide migration guide |
| **Performance regression** | Benchmark TypeScript vs bash execution times |
| **Dependency updates** | Pin major versions, automated Dependabot PRs |

---

## Success Criteria

- [ ] All ported scripts have feature parity with bash versions
- [ ] Test coverage > 80% for new TypeScript code
- [ ] CI pipeline passes with new scripts
- [ ] Documentation updated with TypeScript usage
- [ ] Team trained on new script locations
- [ ] Bash versions archived with `.bak` suffix
- [ ] Rollback plan tested and documented

---

## Timeline

| Phase | Duration | Deliverables |
|-------|----------|--------------|
| Infrastructure | 2 days | Dependencies, libraries, types |
| verify-predeploy | 2 days | Ported + tested |
| verify-deployment | 3 days | Ported + tested |
| deploy-phase1 | 5 days | Ported + tested |
| rollback-phase1 | 3 days | Ported + tested |
| Testing & Docs | 3 days | Full test coverage, documentation |
| **Total** | **18 days** | **4 scripts ported** |

---

## Files to Create

```
scripts-ts/
├── src/
│   ├── commands/
│   │   ├── verify-predeploy.ts
│   │   ├── verify-deployment.ts
│   │   ├── deploy-phase1.ts
│   │   └── rollback-phase1.ts
│   ├── lib/
│   │   ├── logger.ts
│   │   ├── errors.ts
│   │   ├── exec.ts
│   │   ├── gcp.ts
│   │   ├── ssh.ts
│   │   └── config.ts
│   ├── types/
│   │   ├── verification.ts
│   │   ├── deployment.ts
│   │   └── index.ts
│   └── index.ts
├── tests/
│   ├── unit/
│   │   ├── verify-predeploy.test.ts
│   │   ├── verify-deployment.test.ts
│   │   └── lib/
│   │       ├── gcp.test.ts
│   │       └── exec.test.ts
│   └── integration/
│       └── deployment.test.ts
└── package.json
```

---

## Next Steps

1. ✅ **COMPLETED:** CI pipeline passing
2. 🔄 **NEXT:** Install TypeScript dependencies in scripts-ts
3. ⏳ **PENDING:** Create library foundation (logger, errors, exec)
4. ⏳ **PENDING:** Port verify-predeploy.sh
5. ⏳ **PENDING:** Port verify-deployment.sh
6. ⏳ **PENDING:** Port deploy-phase1.sh
7. ⏳ **PENDING:** Port rollback-phase1.sh

---

## Decision: Proceed with Portation?

**RECOMMENDATION: YES** ✅

**Rationale:**
- CI pipeline is stable and passing
- Research shows clear value for 4 out of 8 scripts
- TypeScript portation improves maintainability
- Risk mitigated by keeping bash fallbacks

**Scope:** Port 4 high-value scripts, keep 4 complex/risky scripts as bash

**Estimated Effort:** 18 days (4 scripts × ~4 days each + infrastructure)
