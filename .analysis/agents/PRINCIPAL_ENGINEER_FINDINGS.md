# Principal Engineer Architecture Review - Zaplit Monorepo

**Date:** March 20, 2026  
**Reviewer:** Principal Engineer  
**Scope:** Full monorepo architecture assessment  
**Apps Reviewed:** zaplit-com, zaplit-org, scripts-ts  

---

## Executive Summary

| Category | Assessment | Score |
|----------|------------|-------|
| **Overall Architecture** | Good separation, but massive code duplication | 6/10 |
| **Component Design** | Well-isolated UI components, shared via copy-paste | 5/10 |
| **API Organization** | Inconsistent patterns between apps | 5/10 |
| **State Management** | Clean local state, no external state lib | 7/10 |
| **Technical Debt** | Significant duplication (~7,500 lines) | 4/10 |
| **Scalability** | Cloud-native, but shared code issues | 6/10 |
| **OVERALL** | **Needs Refactoring Before Scale** | **5.5/10** |

---

## 1. Architecture Assessment

### 1.1 Monorepo Structure

```
zaplit/
├── zaplit-com/          # Marketing site (zaplit.com)
│   ├── app/            # Next.js App Router
│   ├── components/     # React components
│   │   ├── ui/        # 20 shadcn/ui components
│   │   └── *.tsx      # 12 section components
│   ├── lib/           # Utilities, schemas, API helpers
│   └── hooks/         # Custom React hooks
├── zaplit-org/         # Nonprofit site (zaplit.org)
│   └── [IDENTICAL STRUCTURE]
├── scripts-ts/         # Infrastructure & deployment scripts
└── docs/              # Documentation
```

**Pattern Used:** Two separate Next.js apps with copy-paste sharing

**Assessment:** 
- ✅ Independent deployment pipelines
- ✅ No shared state complexity
- ❌ Massive code duplication (~7,500 lines identical)
- ❌ No shared package for common code

### 1.2 Component Architecture

#### UI Components (shadcn/ui based)
- **20 UI components** in `components/ui/`
- **42 files are IDENTICAL** between zaplit-com and zaplit-org
- Components properly isolated with single responsibility
- Props-based composition pattern

```typescript
// Good: Clean component interface
export interface ButtonProps 
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}
```

#### Section Components
- **12 section components** per app (hero, footer, navigation, etc.)
- Most have slight content/marketing differences
- Good separation of concerns

### 1.3 API Route Organization

| Route | zaplit-com | zaplit-org | Status |
|-------|------------|------------|--------|
| `/api/health` | Advanced (memory, env checks) | Basic (status only) | ❌ Inconsistent |
| `/api/health/ready` | With n8n connectivity check | Basic | ❌ Inconsistent |
| `/api/submit-form` | 337 lines | 372 lines | ❌ Diverged |

**Issues Found:**
1. Health checks have different capabilities
2. submit-form routes have divergent implementations
3. zaplit-org missing advanced monitoring features
4. No shared API utility package

### 1.4 State Management Patterns

**Pattern Used:** Local React state only

```typescript
// Form state
const [submitted, setSubmitted] = useState(false)
const [formData, setFormData] = useState({...})

// UI state  
const [activeIndustry, setActiveIndustry] = useState<IndustryId>("auto")
const [openIndex, setOpenIndex] = useState<number | null>(0)
```

**Assessment:**
- ✅ No external state management complexity
- ✅ Easy to reason about
- ✅ No state synchronization issues
- ⚠️ State duplication between similar components

---

## 2. Technical Debt Inventory

### 2.1 Critical Debt (Fix Immediately)

| Issue | Location | Impact | Effort |
|-------|----------|--------|--------|
| 42 identical files | zaplit-com ↔ zaplit-org | HIGH | 16-24h |
| Diverged API routes | app/api/submit-form/ | HIGH | 4-6h |
| Missing shared package | N/A | HIGH | 8-12h |

### 2.2 High Priority Debt

| Issue | Location | Impact | Effort |
|-------|----------|--------|--------|
| Health check inconsistency | app/api/health/ | MEDIUM | 2-4h |
| Test file duplication | lib/*.test.ts | LOW | 1-2h |
| Console warnings in prod | app/api/submit-form/route.ts | MEDIUM | 1h |

### 2.3 Medium Priority Debt

| Issue | Location | Impact | Effort |
|-------|----------|--------|--------|
| Code style inconsistencies | Various | LOW | 2-3h |
| Unused imports | Various | LOW | 1h |
| Missing JSDoc | Various | LOW | 4h |

---

## 3. Structural Issues

### 3.1 Dependency Analysis

**Circular Dependencies:** None detected ✅

**Tight Coupling Issues:**
1. Form submission logic duplicated but similar
2. Rate limiting logic in route files (should be middleware)
3. Validation schemas coupled to route handlers

### 3.2 Import Patterns

**Good Patterns:**
```typescript
import { Button } from "@/components/ui/button"
import { createSuccessResponse } from "@/lib/api/response"
```

**Issues:**
- Some relative imports (`../../components`) that could use path aliases
- Mixed import styles (single quotes vs double quotes)

---

## 4. Scalability Concerns

### 4.1 Current Limitations

| Concern | Current State | Risk Level |
|---------|---------------|------------|
| **Rate Limiting** | In-memory Map | 🔴 HIGH |
| **State Sharing** | None (good for isolation) | 🟢 LOW |
| **Bundle Size** | Large (no code splitting) | 🟡 MEDIUM |
| **API Consistency** | Diverged implementations | 🔴 HIGH |

### 4.2 Scaling Blockers

**SB-1: In-Memory Rate Limiting**
- Current: `Map<string, { count, resetTime }>`
- Problem: Won't work across multiple Cloud Run instances
- Solution: Implement Redis-based rate limiting

**SB-2: Audit Logging**
- Current: Console.log in production
- Problem: Hard to aggregate and search
- Solution: Structured logging (Pino/Winston)

**SB-3: Bundle Size**
- Current: ~894KB total JS
- Problem: Large initial load
- Solution: Code splitting with dynamic imports

**SB-4: Shared Code Management**
- Current: Copy-paste between apps
- Problem: Bug fixes must be applied twice
- Solution: Create shared packages

---

## 5. Refactoring Recommendations

### 5.1 Phase 1: Create Shared Packages (Weeks 1-2)

**Goal:** Eliminate 42 duplicate files

```
packages/
├── ui/              # 20 shadcn/ui components
│   ├── button.tsx
│   ├── card.tsx
│   └── ...
├── lib/             # Shared utilities
│   ├── schemas/
│   ├── validation/
│   └── api/
└── api/             # Shared route handlers
    ├── rate-limiter.ts
    └── response-helpers.ts
```

**Effort:** 16-24 hours
**Impact:** Eliminates double maintenance

### 5.2 Phase 2: API Standardization (Weeks 3-4)

**Tasks:**
1. Standardize health check endpoints
2. Merge diverged submit-form implementations
3. Extract shared route handlers to packages/api
4. Update CI for package builds

**Effort:** 8-12 hours
**Impact:** Consistent behavior across apps

### 5.3 Phase 3: Polish (Weeks 5-6)

**Tasks:**
1. Standardize code style
2. Add missing documentation
3. Complete test coverage
4. Performance optimization

**Effort:** 6-10 hours
**Impact:** Production-ready codebase

---

## 6. Architecture Patterns Inventory

### 6.1 Patterns Used

| Pattern | Usage | Assessment |
|---------|-------|------------|
| **Component Composition** | UI components | ✅ Good |
| **Server Components** | Next.js App Router | ✅ Good |
| **API Routes** | Form submission | ⚠️ Needs consolidation |
| **Environment Config** | Secrets management | 🔴 Needs improvement |
| **Error Boundaries** | React error handling | ✅ Good |

### 6.2 Missing Patterns

| Pattern | Need | Priority |
|---------|------|----------|
| **Shared Packages** | Code consolidation | CRITICAL |
| **Structured Logging** | Observability | HIGH |
| **Redis Rate Limiting** | Scalability | HIGH |
| **CDN Caching** | Performance | MEDIUM |

---

## 7. Technology Stack Assessment

### 7.1 Current Stack

| Layer | Technology | Assessment |
|-------|------------|------------|
| Framework | Next.js 14 | ✅ Good |
| Language | TypeScript 5 | ✅ Good |
| Styling | Tailwind CSS | ✅ Good |
| UI Library | shadcn/ui | ✅ Good |
| Icons | Lucide React | ✅ Good |
| Animation | Framer Motion | ⚠️ Large bundle |
| Deployment | Google Cloud Run | ✅ Good |

### 7.2 Recommendations

- **Keep:** Next.js, TypeScript, Tailwind, shadcn/ui
- **Optimize:** Framer Motion (lazy load)
- **Add:** Redis (rate limiting), Sentry (error tracking)

---

## 8. Conclusion

The Zaplit monorepo has a solid foundation with good separation between apps, but suffers from significant code duplication. The priority is to:

1. **Create shared packages** to eliminate 42 duplicate files
2. **Standardize API routes** between zaplit-com and zaplit-org
3. **Implement Redis rate limiting** for horizontal scaling
4. **Add comprehensive testing** (currently 2.5% coverage)

**Estimated Total Effort:** 30-46 hours over 6 weeks

---

*Report generated by Principal Engineer Agent - March 20, 2026*
