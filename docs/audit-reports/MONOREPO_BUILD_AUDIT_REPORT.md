# Zaplit Monorepo Build & Configuration Audit Report

**Date:** 2026-03-20  
**Auditor:** DevOps Engineer & Build Specialist  
**Scope:** Dependencies, Configuration, CI/CD, Build Optimization

---

## Executive Summary

| Category | Issues Found | Critical | High | Medium | Low |
|----------|-------------|----------|------|--------|-----|
| Dependencies | 12 | 1 | 4 | 5 | 2 |
| Configuration | 8 | 0 | 3 | 3 | 2 |
| CI/CD | 10 | 2 | 4 | 3 | 1 |
| Build Optimization | 6 | 0 | 2 | 3 | 1 |
| **TOTAL** | **36** | **3** | **13** | **14** | **6** |

---

## 1. DEPENDENCIES ANALYSIS

### 1.1 Version Consistency Issues

#### Critical: ESLint Version Mismatch Across Workspaces

| Package | Root | zaplit-com | zaplit-org | scripts-ts | Issue |
|---------|------|------------|------------|------------|-------|
| eslint | ^9.26.0 | ^10.0.3 | ^10.0.3 | ^9.39.4 | **MAJOR VERSION MISMATCH** |
| @types/node | ^22.0.0 | ^22 | ^22 | ^20.10.0 | Minor mismatch |

**Impact:** Root has ESLint 9.x while apps have 10.x (which doesn't exist - latest is 9.x). This will cause peer dependency resolution failures.

**Fix:**
```json
// Align all to eslint ^9.26.0
```

#### High: @eslint/js Version Inconsistency

| Package | zaplit-com | zaplit-org | Recommended |
|---------|------------|------------|-------------|
| @eslint/js | ^10.0.1 | ^10.0.1 | ^9.26.0 (align with eslint) |

**Impact:** @eslint/js 10.x may not be compatible with ESLint 9.x

#### High: TypeScript Version Consistency

| Package | Version | Issue |
|---------|---------|-------|
| Root | 5.7.3 | ✅ OK |
| zaplit-com | 5.7.3 | ✅ OK |
| zaplit-org | 5.7.3 | ✅ OK |
| scripts-ts | ^5.3.3 | **OUTDATED** |
| @zaplit/* packages | 5.7.3 | ✅ OK |

**Recommendation:** Update scripts-ts to use exact version `5.7.3` for consistency.

#### Medium: @types/react Version Mismatch

| Package | Version |
|---------|---------|
| zaplit-com | 19.2.14 |
| zaplit-org | 19.2.14 |
| @zaplit/ui | ^19.0.0 |
| @zaplit/hooks | ^19.0.0 |

**Issue:** Apps use exact version 19.2.14, packages use caret ^19.0.0

### 1.2 Unused Dependencies

| Dependency | Location | Status | Evidence |
|------------|----------|--------|----------|
| `date-fns` | zaplit-com, zaplit-org | ⚠️ **UNUSED** | No imports found in source code |
| `autoprefixer` | zaplit-com, zaplit-org | ⚠️ **UNUSED** | Using @tailwindcss/postcss instead |
| `react-hook-form` | zaplit-com, zaplit-org | ✅ Used | Imported in form.tsx |
| `@vercel/analytics` | zaplit-com, zaplit-org | ✅ Used | Imported in layout files |
| `tw-animate-css` | zaplit-com, zaplit-org | ✅ Used | CSS animation library |

**Action Items:**
- Remove `date-fns` from both apps (not currently used)
- Remove `autoprefixer` - Tailwind 4 uses @tailwindcss/postcss exclusively

### 1.3 Duplicated Dependencies

| Dependency | zaplit-com | zaplit-org | @zaplit/ui | Issue |
|------------|------------|------------|------------|-------|
| @radix-ui/react-dialog | 1.1.15 | 1.1.15 | 1.1.15 | Duplicated |
| @radix-ui/react-label | 2.1.8 | 2.1.8 | 2.1.8 | Duplicated |
| @radix-ui/react-popover | 1.1.15 | 1.1.15 | 1.1.15 | Duplicated |
| @radix-ui/react-separator | 1.1.8 | 1.1.8 | 1.1.8 | Duplicated |
| @radix-ui/react-slot | 1.2.4 | 1.2.4 | 1.2.4 | Duplicated |
| @radix-ui/react-tabs | 1.1.13 | 1.1.13 | 1.1.13 | Duplicated |
| @radix-ui/react-toast | 1.2.15 | 1.2.15 | 1.2.15 | Duplicated |
| @radix-ui/react-tooltip | 1.2.8 | 1.2.8 | 1.2.8 | Duplicated |
| class-variance-authority | ^0.7.1 | ^0.7.1 | ^0.7.1 | Duplicated |

**Recommendation:** These Radix UI dependencies should be moved to `@zaplit/ui` peer dependencies only, not duplicated in apps.

### 1.4 Peer Dependency Issues

| Package | Peer Dependency | Required By | Issue |
|---------|-----------------|-------------|-------|
| @zaplit/ui | react ^18.0.0 \|\| ^19.0.0 | zaplit-com/org | ✅ OK |
| @zaplit/ui | next ^14.0.0 \|\| ^15.0.0 \|\| ^16.0.0 | zaplit-com/org | ✅ OK |
| @zaplit/ui | tailwindcss ^4.0.0 | zaplit-com/org | ✅ OK |
| @zaplit/ui | lucide-react ^0.500.0 | zaplit-com/org | ⚠️ Apps use ^0.564.0 |
| @zaplit/forms | zod ^3.0.0 | zaplit-com/org | ✅ OK |
| @zaplit/utils | tailwind-merge ^3.0.0 | zaplit-com/org | ✅ OK |

**Issue:** @zaplit/ui requires lucide-react ^0.500.0 but apps use ^0.564.0. Update peer dependency range.

### 1.5 Missing Dependencies Analysis

#### scripts-ts Missing Vitest Coverage Provider

```json
// scripts-ts has @vitest/coverage-v8 in devDependencies
// But no test runner config present
```

#### @zaplit packages Missing ESLint Dependencies

All @zaplit packages reference `eslint` in scripts but don't declare it as devDependency.

---

## 2. CONFIGURATION ANALYSIS

### 2.1 TypeScript Configuration Issues

#### Issue: Root tsconfig.json Path Aliases Misconfigured

```json
// Current root tsconfig.json
"paths": {
  "@/*": ["./*"],
  "@zaplit-com/*": ["./zaplit-com/*"],
  "@zaplit-org/*": ["./zaplit-org/*"]
}
```

**Problem:** Root path aliases point to workspace directories but packages are referenced via `workspace:*` protocol.

**Impact:** Type checking from root may fail to resolve workspace packages.

#### Issue: jsx Setting Inconsistency

| Config | jsx Setting |
|--------|-------------|
| Root tsconfig.json | "preserve" |
| zaplit-com/tsconfig.json | "react-jsx" |
| zaplit-org/tsconfig.json | "react-jsx" |

**Recommendation:** Root should use "react-jsx" or not set jsx (let apps handle it).

#### Issue: Missing strictNullChecks in Root

Root tsconfig has `strict: true` which covers this, but explicit strict flags are clearer.

### 2.2 ESLint Configuration Issues

#### Critical: Root .eslintrc.json vs Apps eslint.config.mjs

| Aspect | Root | Apps |
|--------|------|------|
| Config Format | .eslintrc.json (legacy) | eslint.config.mjs (flat) |
| TypeScript Support | ❌ No | ✅ Yes |
| React Plugin | ❌ No | ❌ No |
| Next.js Plugin | ❌ No | ❌ No |

**Issues:**
1. Root uses legacy eslintrc format while apps use flat config
2. No Next.js or React ESLint plugins configured
3. Root config only has basic eslint:recommended

#### High: Missing ESLint Plugins

Apps should include:
```javascript
// Missing from eslint.config.mjs
import nextPlugin from '@next/eslint-plugin-next';
import reactPlugin from 'eslint-plugin-react';
import hooksPlugin from 'eslint-plugin-react-hooks';
```

#### High: Root ESLint Version Conflict

Root has eslint ^9.26.0 in package.json but .eslintrc.json format is incompatible with ESLint 9 flat config by default.

### 2.3 Next.js Configuration Comparison

| Feature | zaplit-com | zaplit-org | Issue |
|---------|------------|------------|-------|
| output: 'standalone' | ✅ | ✅ | OK |
| Sentry Integration | ✅ | ✅ | OK |
| Bundle Analyzer | ✅ | ✅ | OK |
| Security Headers | ✅ | ✅ | OK |
| CSP Header | Different n8n URL | Different n8n URL | ✅ Intended |
| optimizePackageImports | framer-motion, lucide-react | framer-motion, lucide-react | OK |
| API bodyParser limit | 1MB | 1MB | OK |

**Note:** CSP headers correctly point to different n8n endpoints (n8n.zaplit.com vs n8n.zaplit.org).

### 2.4 Vitest Configuration Differences

| Setting | zaplit-com | zaplit-org | Issue |
|---------|------------|------------|-------|
| globals | true | true | OK |
| environment | jsdom | jsdom | OK |
| setupFiles | ['./vitest.setup.ts'] | ['./vitest.setup.ts'] | OK |
| include | default | explicit | ⚠️ Minor |

**Issue:** zaplit-org has explicit `include` pattern that may miss some test files.

### 2.5 Package Manager Configuration

#### pnpm-workspace.yaml

```yaml
packages:
  - 'zaplit-com'
  - 'zaplit-org'
  - 'scripts-ts'
  - 'packages/@zaplit/*'
```

**Issues:**
1. No `prefer-workspace-packages: true` setting
2. No shared dependency hoisting configuration
3. No catalog dependencies defined for version alignment

**Recommendation:**
```yaml
packages:
  - 'zaplit-com'
  - 'zaplit-org'
  - 'scripts-ts'
  - 'packages/@zaplit/*'

prefer-workspace-packages: true
shared-workspace-lockfile: true
```

---

## 3. CI/CD WORKFLOW ANALYSIS

### 3.1 Critical Issues

#### Issue 1: cloudbuild.yaml Uses npm Instead of pnpm

**Location:** `zaplit-com/cloudbuild.yaml` and `zaplit-org/cloudbuild.yaml`

```yaml
# Current (WRONG)
- name: 'node:20-slim'
  entrypoint: 'bash'
  args:
    - '-c'
    - |
      cd zaplit-com
      npm ci  # ❌ Should use pnpm
```

**Impact:**
- Uses npm instead of pnpm
- Won't respect pnpm-lock.yaml
- Potential dependency version mismatches
- Breaks workspace dependencies

**Fix:**
```yaml
- name: 'node:20-slim'
  entrypoint: 'bash'
  args:
    - '-c'
    - |
      npm install -g pnpm@9
      pnpm install --frozen-lockfile
      pnpm build:com
```

#### Issue 2: Dockerfile Uses pnpm@9.0.0 (Outdated)

```dockerfile
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
```

**Impact:** Using outdated pnpm version. Current workflows use pnpm@9 but no patch version specified.

**Fix:**
```dockerfile
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
```

### 3.2 High Priority Issues

#### Issue 3: GitHub Actions Workflow - Missing scripts-ts Type Check

**Current:** CI only type-checks zaplit-com and zaplit-org

**Missing:**
```yaml
# Add to CI matrix
- name: Type check scripts-ts
  run: pnpm typecheck:scripts
```

#### Issue 4: GitHub Actions - Missing Package Build Step

**Current:** CI builds apps but doesn't verify @zaplit packages build correctly.

**Fix:**
```yaml
- name: Build packages
  run: pnpm build:packages
```

#### Issue 5: Workflow Timeout Settings Inconsistent

| Workflow | Timeout | Issue |
|----------|---------|-------|
| ci.yml - install | 10 min | ✅ OK |
| ci.yml - build | 15 min | ✅ OK |
| ci.yml - e2e | 15 min | ⚠️ May be tight |
| e2e.yml | 30 min | ✅ OK |
| security.yml - container-scan | 20 min | ✅ OK |

#### Issue 6: Missing Workflow Failure Notifications

No Slack/Teams notifications on deployment failures.

### 3.3 Medium Priority Issues

#### Issue 7: CI Cache Key Missing scripts-ts

```yaml
# Current
cache:
  path: |
    node_modules
    zaplit-com/node_modules
    zaplit-org/node_modules
  # ❌ Missing scripts-ts/node_modules and packages
```

#### Issue 8: Deploy Workflows Missing Environment Protection

Both deploy-zaplit-com.yml and deploy-zaplit-org.yml need:
```yaml
environment:
  name: production
  url: ${{ steps.deploy.outputs.url }}
```

zaplit-com has it, zaplit-org is missing it in verify-ci job context.

#### Issue 9: Security Workflow - Dependency Audit Level

```yaml
- name: Audit dependencies
  run: pnpm audit --audit-level=high
  continue-on-error: false
```

**Issue:** `--continue-on-error: false` will fail the build even for non-fixable vulnerabilities.

### 3.4 Low Priority Issues

#### Issue 10: E2E Workflow - GitHub Pages Deployment

E2E workflow has deploy-report job that deploys to GitHub Pages, but no branch protection for gh-pages.

---

## 4. BUILD OPTIMIZATION OPPORTUNITIES

### 4.1 High Priority

#### Opportunity 1: Next.js Build Caching

**Current:** CI caches `.next/cache` but Docker builds don't.

**Fix for Dockerfile:**
```dockerfile
# Add cache mount
RUN --mount=type=cache,target=/app/.next/cache \
    pnpm build
```

#### Opportunity 2: Dependency Installation Optimization

**Current:** Docker installs all dependencies including devDependencies.

**Fix:**
```dockerfile
RUN pnpm install --frozen-lockfile --prod=false  # Build needs dev deps
# Then for production:
RUN pnpm install --frozen-lockfile --prod
```

### 4.2 Medium Priority

#### Opportunity 3: Bundle Analysis Not Automated

**Current:** Bundle analyzer requires manual `ANALYZE=true pnpm build`

**Recommendation:** Add CI job that runs bundle analysis on PRs and posts results as PR comment.

#### Opportunity 4: Unused CSS Purging

Tailwind 4 should handle this, but verify `content` configuration is optimized.

### 4.3 Low Priority

#### Opportunity 5: TypeScript Project References

Consider using TypeScript project references for faster incremental builds across packages.

---

## 5. DETAILED RECOMMENDATIONS

### 5.1 Dependency Cleanup Checklist

- [ ] Remove `date-fns` from zaplit-com and zaplit-org
- [ ] Remove `autoprefixer` from zaplit-com and zaplit-org
- [ ] Fix ESLint version alignment (use ^9.26.0 everywhere)
- [ ] Fix @eslint/js version (^9.26.0)
- [ ] Update scripts-ts TypeScript to 5.7.3
- [ ] Move Radix UI deps from apps to @zaplit/ui peer deps only
- [ ] Add `@types/react-dom` to @zaplit/ui devDependencies

### 5.2 Configuration Cleanup Checklist

- [ ] Migrate root .eslintrc.json to eslint.config.mjs
- [ ] Add @next/eslint-plugin-next to app ESLint configs
- [ ] Add eslint-plugin-react-hooks to app ESLint configs
- [ ] Add prefer-workspace-packages to pnpm-workspace.yaml
- [ ] Fix root tsconfig.json path aliases or remove them
- [ ] Align vitest.config.ts settings between apps

### 5.3 CI/CD Cleanup Checklist

- [ ] Fix cloudbuild.yaml to use pnpm
- [ ] Add scripts-ts to CI typecheck matrix
- [ ] Add packages build step to CI
- [ ] Update Dockerfile pnpm version
- [ ] Add cache for scripts-ts and packages node_modules
- [ ] Add pnpm audit with moderate level and continue-on-error: true
- [ ] Add deployment failure notifications

---

## 6. PRIORITY MATRIX

| Issue | Priority | Effort | Impact | Owner |
|-------|----------|--------|--------|-------|
| Fix cloudbuild.yaml npm→pnpm | **P0** | 1h | Build failures | DevOps |
| Fix ESLint version mismatch | **P0** | 30m | Dependency resolution | Frontend |
| Add @zaplit packages to CI | **P1** | 2h | Build integrity | DevOps |
| Remove unused dependencies | **P1** | 30m | Bundle size | Frontend |
| Fix Dockerfile pnpm version | **P1** | 30m | Build stability | DevOps |
| Add ESLint Next.js plugin | **P1** | 1h | Code quality | Frontend |
| Update CI cache paths | **P2** | 1h | Build speed | DevOps |
| Add bundle analysis CI job | **P2** | 4h | Bundle monitoring | DevOps |
| Migrate root ESLint config | **P2** | 2h | Config consistency | Frontend |
| Add deployment notifications | **P3** | 2h | Observability | DevOps |

---

## 7. APPENDIX: CURRENT DEPENDENCY MATRIX

### Root Package Dependencies

```json
{
  "@faker-js/faker": "^9.0.0",
  "@playwright/test": "^1.54.0",
  "@types/node": "^22.0.0",
  "eslint": "^9.26.0",
  "prettier": "^3.5.3",
  "ts-node": "^10.9.2",
  "typescript": "5.7.3",
  "vitest": "^4.1.0"
}
```

### App Dependencies (zaplit-com === zaplit-org)

**Dependencies:**
- @radix-ui/* (7 packages) - UI primitives
- @sentry/nextjs - Error tracking
- @vercel/analytics - Analytics
- class-variance-authority - Component variants
- clsx + tailwind-merge - CSS utilities
- date-fns - **UNUSED**
- framer-motion - Animations
- ioredis - Redis client
- lucide-react - Icons
- next, react, react-dom - Core framework
- next-themes - Theme management
- pino - Logging
- react-hook-form - Form management
- zod - Validation

**DevDependencies:**
- @next/bundle-analyzer - Bundle analysis
- @tailwindcss/postcss - Tailwind 4
- @testing-library/* - Testing utilities
- @types/* - Type definitions
- @vitejs/plugin-react - Vitest plugin
- eslint + typescript-eslint - Linting
- globals - ESLint globals
- pino-pretty - Log formatting
- tailwindcss + tw-animate-css - Styling
- vitest - Testing

### scripts-ts Dependencies

**Dependencies:**
- @google-cloud/* (3 packages) - GCP SDK
- axios - HTTP client
- chalk - Terminal colors
- commander - CLI framework
- execa - Process execution
- ioredis - Redis client
- neverthrow - Result type
- pg - PostgreSQL
- pino + pino-pretty - Logging
- ssh2 - SSH client
- zod - Validation

**DevDependencies:**
- @types/* - Type definitions
- @typescript-eslint/* - ESLint plugins
- @vitest/coverage-v8 - Coverage
- eslint - Linting
- ts-node - TypeScript execution
- typescript - Language
- vitest - Testing

---

*Report generated by automated monorepo audit tooling*
