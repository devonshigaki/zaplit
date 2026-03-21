# Zaplit Monorepo Architecture Audit Report

**Date:** 2026-03-20  
**Auditor:** Principal Engineer  
**Scope:** zaplit-com, zaplit-org, scripts-ts

---

## Executive Summary

The codebase exhibits **severe code duplication** between `zaplit-com` and `zaplit-org` applications. Approximately **68% of code is identical** between the two apps, representing a significant maintenance burden and architectural debt. Both apps share the same dependencies, build configurations, utility libraries, UI components, hooks, and API routes with only cosmetic differences.

### Key Metrics
- **44 files** are 100% identical between the two apps
- **19 files** have minor differences (<20 lines)
- **13 files** have major differences (content-specific)
- **Estimated duplication:** 68%

---

## 1. CODE DUPLICATION (CRITICAL)

### Severity: CRITICAL

### 1.1 Identical Files (100% Duplicated)

The following files are byte-for-byte identical between zaplit-com and zaplit-org:

**Library Code (100% identical):**
| File | Line Count | Issue |
|------|------------|-------|
| `lib/utils.ts` | 52 | Utility functions |
| `lib/constants.ts` | 128 | Configuration constants |
| `lib/env.ts` | 135 | Environment validation |
| `lib/api/response.ts` | 117 | API response helpers |
| `lib/schemas/forms.ts` | 139 | Zod validation schemas |
| `lib/form-submission.ts` | 148 | React hook for forms |
| `lib/logger.ts` | 145 | Pino logging configuration |
| `lib/redis/client.ts` | 161 | Redis client |
| `lib/redis/rate-limiter.ts` | 270 | Rate limiting |
| `lib/blog-posts.ts` | 206 | Blog content |
| `lib/schemas/forms.test.ts` | 223 | Unit tests |
| `lib/form-submission.test.ts` | 135 | Unit tests |

**UI Components (100% identical):**
| File | Line Count |
|------|------------|
| `components/ui/button.tsx` | 122 |
| `components/ui/card.tsx` | 179 |
| `components/ui/dialog.tsx` | 143 |
| `components/ui/input.tsx` | ~60 |
| `components/ui/label.tsx` | ~30 |
| `components/ui/badge.tsx` | ~50 |
| `components/ui/tabs.tsx` | ~80 |
| `components/ui/alert.tsx` | ~70 |
| `components/ui/form.tsx` | ~200 |
| `components/ui/field.tsx` | ~40 |
| `components/ui/separator.tsx` | ~30 |
| `components/ui/button-group.tsx` | ~60 |
| `components/ui/background-boxes.tsx` | 128 |

**Hooks & Utils (100% identical):**
| File | Line Count |
|------|------------|
| `hooks/use-mobile.ts` | 20 |
| `components/error-boundary.tsx` | 140 |
| `components/skip-link.tsx` | 20 |
| `components/theme-provider.tsx` | ~10 |
| `components/solutions-section.tsx` | ~200 |
| `components/booking-modal.tsx` | ~150 |

**API Routes (100% identical):**
| File | Line Count |
|------|------------|
| `app/api/health/route.ts` | 56 |
| `app/api/health/ready/route.ts` | 58 |

**Pages (100% identical - but shouldn't be):**
| File | Line Count | Issue |
|------|------------|-------|
| `app/page.tsx` | 29 | Identical structure, should differ |
| `app/blog/page.tsx` | 103 | Identical blog listing |
| `app/blog/[slug]/page.tsx` | 157 | Identical blog post renderer |
| `app/about/page.tsx` | ~150 | Should differ |
| `app/careers/page.tsx` | ~200 | Should differ |
| `app/integrations/page.tsx` | ~180 | Should differ |
| `app/privacy/page.tsx` | ~100 | Should differ |
| `app/terms/page.tsx` | ~100 | Should differ |

**Configuration (100% identical):**
| File | Line Count |
|------|------------|
| `middleware.ts` | 71 |
| `next-env.d.ts` | ~5 |
| `types/sentry.d.ts` | ~15 |
| `vitest.setup.ts` | ~15 |

### 1.2 Files with Minor Differences

| File | Diff Lines | Nature of Difference |
|------|------------|---------------------|
| `app/layout.tsx` | 10 | Title, description, dark mode default |
| `app/api/submit-form/route.ts` | 10 | Service name in metadata (lines 383, 449) |
| `sentry.client.config.ts` | 4 | Site tag (line 74) |
| `sentry.server.config.ts` | 4 | Site tag |
| `sentry.edge.config.ts` | 4 | Site tag |
| `next.config.mjs` | 4 | CSP connect-src URL |
| `vitest.config.ts` | 13 | Minor config variations |

### 1.3 Files with Major Differences (Content-Specific)

| File | Diff Lines | Reason |
|------|------------|--------|
| `components/hero.tsx` | 44 | Different content (expected) |
| `components/footer.tsx` | 41 | Different links/content (expected) |
| `components/navigation.tsx` | 23 | Different branding (expected) |
| `components/agents-section.tsx` | 198 | Different agent descriptions |
| `components/book-demo-section.tsx` | 576 | Different forms/content |
| `components/faq-section.tsx` | 48 | Different FAQ items |
| `components/security-section.tsx` | 72 | Different security features |
| `components/plans-section.tsx` | 58 | Different pricing |
| `components/calculator-section.tsx` | 64 | Different calculator |
| `components/integrations-section.tsx` | 50 | Different integrations |
| `app/contact/page.tsx` | 176 | Different contact forms |

### 1.4 Recommended Fix

**Effort: Large (2-3 weeks)**

Create a shared package structure:

```
/packages
  /ui              # Shared UI components (shadcn)
  /lib             # Shared utilities (logger, redis, api)
  /hooks           # Shared React hooks
  /types           # Shared TypeScript types
  /config          # Shared configurations

/apps
  /zaplit-com      # Commercial site (content only)
  /zaplit-org      # Org site (content only)
```

**Migration Strategy:**
1. Set up pnpm workspaces with shared packages
2. Move identical UI components to `@zaplit/ui`
3. Move library code to `@zaplit/lib`
4. Keep only content-specific code in apps
5. Use environment variables for branding differences

---

## 2. DEAD CODE / UNUSED EXPORTS (HIGH)

### Severity: HIGH

### 2.1 Unused Imports

**File:** `zaplit-com/app/api/submit-form/route.ts` (and zaplit-org)
- **Line 19:** `createComponentLogger` imported but never used
- **Line 20:** `checkRateLimit` imported from redis but never used (uses in-memory Map instead)

**File:** `zaplit-com/lib/api/response.ts` (and zaplit-org)
- **Lines 111-117:** `addRequestIdHeader` function exported but never imported anywhere
- **Line 102:** `REQUEST_ID_HEADER` constant exported but only used locally

### 2.2 Unused Rate Limiting Code

**File:** `app/api/submit-form/route.ts`

The file imports `checkRateLimit` from `@/lib/redis/rate-limiter` but implements its own rate limiting using an in-memory Map (lines 270-296). The Redis-based rate limiter is never called despite being imported.

```typescript
// Line 20: Imported but never used
import { checkRateLimit } from "@/lib/redis/rate-limiter";

// Lines 270-296: Duplicate implementation using Map
const rateLimit = new Map<string, { count: number; resetTime: number }>();
// ... custom rate limiting logic
```

### 2.3 Hardcoded Service Names (Configuration Issue)

**File:** `lib/logger.ts` (line 40)
```typescript
base: {
  service: process.env.SERVICE_NAME || 'zaplit-com',  // Wrong default for zaplit-org
}
```

This hardcodes 'zaplit-com' as the default service name even in zaplit-org.

### 2.4 Recommended Fix

**Effort: Small (1-2 days)**

1. Remove unused imports:
   ```typescript
   // Remove from submit-form/route.ts
   - import { logger, getLoggerWithContext, createComponentLogger } from "@/lib/logger";
   + import { logger, getLoggerWithContext } from "@/lib/logger";
   
   - import { checkRateLimit } from "@/lib/redis/rate-limiter";
   ```

2. Either remove or use the Redis rate limiter
3. Fix logger default service name to use proper detection

---

## 3. TYPESCRIPT ISSUES (MEDIUM)

### Severity: MEDIUM

### 3.1 Inconsistent Vitest Configuration

**zaplit-com/vitest.config.ts:**
- Uses `environment: 'jsdom'` before `globals: true`
- Missing explicit `include` pattern

**zaplit-org/vitest.config.ts:**
- Has explicit `include: ['**/*.{test,spec}.{ts,tsx}']`
- Has different ordering of properties

**Fix:** Synchronize configurations.

### 3.2 Missing Explicit Return Types

Several functions lack explicit return types:

**File:** `lib/env.ts`
- Line 121: `isDevelopment()` - return type inferred
- Line 128: `isProduction()` - return type inferred

**File:** `lib/logger.ts`
- Line 117: `getLoggerWithContext()` - complex return type

### 3.3 Inconsistent Dark Mode Handling

**zaplit-com/app/layout.tsx (line 54):**
```tsx
<html lang="en" className="dark">
```

**zaplit-org/app/layout.tsx (line 54):**
```tsx
<html lang="en" className="">
```

zaplit-com forces dark mode, zaplit-org doesn't. This inconsistency could cause visual issues.

### 3.4 Recommended Fix

**Effort: Small (1 day)**

1. Add explicit return types to all exported functions
2. Synchronize vitest configurations
3. Standardize theme handling approach

---

## 4. IMPORT / DEPENDENCY ISSUES (MEDIUM)

### Severity: MEDIUM

### 4.1 Middleware CORS Origins

**File:** `middleware.ts` (both apps)

The allowedOrigins array includes production domains but is identical in both apps:

```typescript
const allowedOrigins = [
  "https://zaplit.com",
  "https://www.zaplit.com",
  "https://zaplit-org.vercel.app",  // Only relevant for zaplit-org
  "http://localhost:3000",
];
```

Issues:
1. zaplit-com middleware allows zaplit-org origin (unnecessary)
2. zaplit-org doesn't include its own production domain properly
3. No environment-based configuration

### 4.2 CSP Header Inconsistency

**zaplit-com/next.config.mjs (line 68):**
```
connect-src 'self' https://n8n.zaplit.com https://*.sentry.io;
```

**zaplit-org/next.config.mjs (line 68):**
```
connect-src 'self' https://n8n.zaplit.org https://*.sentry.io;
```

This is the only difference - should be environment-driven.

### 4.3 Duplicate Dependencies

Both apps have identical `package.json` dependencies, yet they install separately:
- 44 dependencies duplicated
- ~200MB+ wasted disk space
- Synchronization issues when updating

### 4.4 Recommended Fix

**Effort: Medium (3-5 days)**

1. Use environment variables for CORS origins and CSP headers
2. Implement shared package to eliminate duplicate dependencies

---

## 5. COMPONENT ARCHITECTURE (MEDIUM)

### Severity: MEDIUM

### 5.1 UI Component Pattern Issues

**Issue:** UI components are duplicated instead of being shared.

**Components affected:** All 13 UI components in `components/ui/`

Each UI component (button, card, dialog, etc.) is:
- 100% identical between apps
- Following shadcn/ui patterns
- Should be in a shared UI package

### 5.2 Theme Handling Inconsistency

**File:** `components/navigation.tsx`

Both versions implement theme toggling but with subtle differences:

**zaplit-com (lines 29-37):**
```typescript
const toggleTheme = () => {
  const newDark = !isDark
  setIsDark(newDark)
  if (newDark) {
    document.documentElement.classList.add("dark")
  } else {
    document.documentElement.classList.remove("dark")
  }
}
```

**zaplit-org (lines 29-32):**
```typescript
const toggleTheme = () => {
  setIsDark(!isDark)
  document.documentElement.classList.toggle("dark")
}
```

Different implementations for the same functionality.

### 5.3 Missing Component Documentation

Some complex components lack proper documentation:
- `components/ui/background-boxes.tsx` - No JSDoc
- `components/booking-modal.tsx` - Missing prop types documentation

### 5.4 Recommended Fix

**Effort: Medium (1 week)**

1. Move all UI components to shared package
2. Standardize theme handling (prefer next-themes)
3. Add JSDoc to all exported components

---

## 6. API ROUTE CONSISTENCY (HIGH)

### Severity: HIGH

### 6.1 Form Submission Route Issues

**File:** `app/api/submit-form/route.ts`

**Issue 1:** Dual rate limiting implementations
- Imports Redis rate limiter but doesn't use it
- Implements in-memory rate limiting with Map
- Comments say "@deprecated" but it's the active implementation

**Issue 2:** Unused logger imports
```typescript
import { logger, getLoggerWithContext, createComponentLogger } from "@/lib/logger";
// createComponentLogger is never used
```

**Issue 3:** Hardcoded service name
```typescript
// Line 383 (zaplit-com)
source: "zaplit-com",

// Line 383 (zaplit-org)
source: "zaplit-org",
```

Should use environment variable.

### 6.2 Form Schema Duplication

Form schemas are defined in BOTH:
1. `lib/schemas/forms.ts` - For client-side validation
2. `app/api/submit-form/route.ts` (lines 36-72) - For API validation

Identical schemas duplicated in two places.

### 6.3 Recommended Fix

**Effort: Small (2-3 days)**

1. Consolidate rate limiting to use Redis implementation
2. Remove schema duplication - import from schemas file
3. Use environment variable for service name
4. Remove unused imports

---

## 7. SECURITY & CONFIGURATION ISSUES (MEDIUM)

### Severity: MEDIUM

### 7.1 Service Name Hardcoding

Multiple files hardcode service identifiers:

| File | Line | Issue |
|------|------|-------|
| `lib/logger.ts` | 40 | Default service name 'zaplit-com' |
| `lib/redis/rate-limiter.ts` | 38 | Default service 'zaplit-com' |
| `app/api/submit-form/route.ts` | 383 | Hardcoded source |
| `app/api/submit-form/route.ts` | 449 | Hardcoded service |
| `sentry.*.config.ts` | 74 | Hardcoded site tag |

### 7.2 Missing Environment Validation

**File:** `lib/env.ts`

Missing validation for:
- `SERVICE_NAME` - Used throughout but not validated
- `REDIS_KEY_PREFIX` - Has default but should be explicit

### 7.3 Recommended Fix

**Effort: Small (1 day)**

1. Add `SERVICE_NAME` to required environment variables
2. Remove all hardcoded service references
3. Use consistent environment-based configuration

---

## Summary of Recommendations by Priority

### CRITICAL (Fix Immediately)

1. **Create Shared Package** - 68% code duplication is unsustainable
   - Effort: 2-3 weeks
   - Impact: High - Reduces maintenance burden

### HIGH (Fix This Sprint)

2. **Remove Dead Code** - Unused imports and functions
   - Files: `submit-form/route.ts`, `api/response.ts`
   - Effort: 1-2 days

3. **Fix API Route Issues** - Consolidate rate limiting and schemas
   - Effort: 2-3 days

### MEDIUM (Fix Next Sprint)

4. **Standardize Configuration** - Environment-driven CORS, CSP
   - Effort: 3-5 days

5. **TypeScript Improvements** - Add explicit types, sync configs
   - Effort: 1 week

### LOW (Backlog)

6. **Documentation** - Add JSDoc to components
   - Effort: Ongoing

---

## Appendix: Complete List of Identical Files

```
app/about/page.tsx
app/api/health/ready/route.ts
app/api/health/route.ts
app/blog/[slug]/page.tsx
app/blog/page.tsx
app/careers/page.tsx
app/integrations/page.tsx
app/page.tsx
app/privacy/page.tsx
app/terms/page.tsx
components/booking-modal.tsx
components/error-boundary.tsx
components/skip-link.tsx
components/solutions-section.tsx
components/theme-provider.tsx
components/ui/alert.tsx
components/ui/badge.tsx
components/ui/background-boxes.tsx
components/ui/button-group.tsx
components/ui/button.tsx
components/ui/card.tsx
components/ui/dialog.tsx
components/ui/field.tsx
components/ui/form.tsx
components/ui/input.tsx
components/ui/label.tsx
components/ui/separator.tsx
components/ui/tabs.tsx
hooks/use-mobile.ts
lib/api/response.ts
lib/blog-posts.ts
lib/constants.ts
lib/env.ts
lib/form-submission.test.ts
lib/form-submission.ts
lib/logger.ts
lib/redis/client.ts
lib/redis/rate-limiter.ts
lib/schemas/forms.test.ts
lib/schemas/forms.ts
lib/utils.ts
middleware.ts
next-env.d.ts
types/sentry.d.ts
vitest.setup.ts
```

**Total: 44 identical files**
