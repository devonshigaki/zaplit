# CI/CD Workflow Plan for Zaplit Monorepo

## Overview

This document outlines the CI/CD strategy for the Zaplit Next.js monorepo, which uses:
- **Package Manager**: pnpm with workspaces
- **Apps**: `zaplit-com/` and `zaplit-org/` (Next.js 16)
- **Testing**: Vitest (unit), Playwright (E2E)
- **Deployment**: Google Cloud Run

## Current State Analysis

### Root package.json Scripts
```json
{
  "typecheck": "pnpm typecheck:com && pnpm typecheck:org",
  "lint": "pnpm lint:com && pnpm lint:org",
  "test": "pnpm test:com && pnpm test:org",
  "test:e2e": "playwright test",
  "build": "pnpm build:com && pnpm build:org",
  "ci": "pnpm typecheck && pnpm lint && pnpm test && pnpm build"
}
```

### App Structure
- `zaplit-com/`: Full-featured app with Vitest, Testing Library, coverage
- `zaplit-org/`: Simpler app (no test scripts defined yet)

## CI Workflow Design

### Workflow: `ci.yml`

**Triggers:**
- Push to `main`, `develop` branches
- Pull requests to `main`

**Jobs:**

#### 1. `changes` - Detect Changed Apps
Uses `dorny/paths-filter` to detect which apps changed:
- `zaplit-com`: `zaplit-com/**`
- `zaplit-org`: `zaplit-org/**`
- `shared`: Root config files, packages

#### 2. `typecheck` - TypeScript Validation
- Runs on all PRs
- Type-checks both apps in parallel
- Fails fast on type errors

#### 3. `lint` - Code Quality
- Runs ESLint on both apps
- Uses parallel jobs for speed
- Fails on lint errors

#### 4. `unit-tests` - Vitest Tests
- Runs Vitest for zaplit-com (has tests)
- Coverage reporting with v8
- Test results uploaded as artifacts

#### 5. `build` - Production Build
- Builds both Next.js apps
- Verifies build succeeds
- Uploads build artifacts

#### 6. `e2e-tests` - Playwright (Conditional)
- Runs only on PRs to main or push to main
- Depends on successful build
- Matrix strategy for parallel browser testing
- Uploads screenshots/videos on failure

### Workflow Optimization

**Caching Strategy:**
1. **pnpm store**: `~/.local/share/pnpm/store`
2. **Next.js build cache**: `.next/cache`
3. **TypeScript incremental**: `*.tsbuildinfo`

**Job Dependencies:**
```
changes
  ├── typecheck ──┐
  ├── lint ───────┼── build ── e2e-tests (conditional)
  └── unit-tests ─┘
```

## Deployment Strategy

### Option 1: Separate Deploy Workflows (Recommended)

Create separate workflows for each app:
- `.github/workflows/deploy-zaplit-com.yml`
- `.github/workflows/deploy-zaplit-org.yml`

**Benefits:**
- Independent deployments
- Separate secrets per app
- Different deployment triggers possible
- Clearer deployment history

### Option 2: Unified Deploy Workflow

Single workflow deploying both apps:
- Simpler configuration
- Atomic deployments
- Harder to rollback individual apps

### Recommended Approach: Option 1

Each deploy workflow:
- Trigger: Push to `main` with path filter
- Requires: CI workflow success
- Steps:
  1. Build Docker image
  2. Push to Artifact Registry
  3. Deploy to Cloud Run
  4. Verify deployment health

## Implementation Checklist

### Phase 1: CI Workflow
- [x] Create `.github/workflows/ci.yml`
- [x] Configure pnpm setup
- [x] Add type checking job
- [x] Add linting job
- [x] Add unit test job
- [x] Add build job
- [x] Add conditional E2E job

### Phase 2: Deploy Workflows (Future)
- [ ] Create `deploy-zaplit-com.yml`
- [ ] Create `deploy-zaplit-org.yml`
- [ ] Configure GCP authentication
- [ ] Set up Artifact Registry
- [ ] Add Cloud Run deployment steps
- [ ] Add health check verification

### Phase 3: Documentation
- [x] Create `docs/ops/ci-cd.md`
- [x] Document workflow triggers
- [x] Document deployment strategy
- [x] Add troubleshooting section

## Secrets Required

### For CI (if needed)
- None required for basic CI

### For Deployment (Future)
- `GCP_SA_KEY`: Service account JSON for GCP
- `GCP_PROJECT_ID`: Google Cloud project ID
- `GCP_REGION`: Cloud Run region (e.g., us-central1)

## Workflow Triggers Summary

| Workflow | Trigger | Paths |
|----------|---------|-------|
| ci.yml | PR to main, push to main/develop | all |
| deploy-zaplit-com.yml | push to main | zaplit-com/** |
| deploy-zaplit-org.yml | push to main | zaplit-org/** |

## Performance Targets

| Job | Target Duration | Parallel Jobs |
|-----|-----------------|---------------|
| Install | < 30s | 1 |
| Type Check | < 60s | 2 (per app) |
| Lint | < 60s | 2 (per app) |
| Unit Tests | < 120s | 2 (per app) |
| Build | < 180s | 2 (per app) |
| E2E Tests | < 300s | 3 (browsers) |

## Troubleshooting

### Common Issues

1. **pnpm install fails**
   - Check Node.js version (>=18)
   - Clear pnpm store cache

2. **Type check fails intermittently**
   - Ensure `*.tsbuildinfo` is cached
   - Check for race conditions in parallel builds

3. **E2E tests timeout**
   - Increase Playwright timeout
   - Check if build artifacts are properly downloaded

4. **Build cache not working**
   - Verify `.next/cache` path
   - Check cache key includes lockfile hash

## Maintenance

### Monthly Review
- Check workflow durations
- Review cache hit rates
- Update action versions

### Quarterly Review
- Evaluate new GitHub Actions features
- Review deployment metrics
- Assess security best practices
