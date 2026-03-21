# Dead Code Removal Report - Zaplit Monorepo

**Date:** 2026-03-20  
**Scope:** zaplit-com, zaplit-org  
**Status:** Ready for Implementation

---

## Executive Summary

This report identifies confirmed dead code in the Zaplit monorepo that can be safely removed. All code listed below has been verified to have **zero imports** outside of its own definition file or test files.

---

## 1. Confirmed Dead Code

### 1.1 UI Components (Unused)

| Component | File Path (zaplit-com) | File Path (zaplit-org) | Status |
|-----------|------------------------|------------------------|--------|
| **Skeleton** | `components/ui/skeleton.tsx` | `components/ui/skeleton.tsx` | ✅ Safe to remove |
| **Popover** | `components/ui/popover.tsx` | `components/ui/popover.tsx` | ✅ Safe to remove |
| **Tooltip** | `components/ui/tooltip.tsx` | `components/ui/tooltip.tsx` | ✅ Safe to remove |
| **Sheet** | `components/ui/sheet.tsx` | `components/ui/sheet.tsx` | ✅ Safe to remove |
| **Toast** | `components/ui/toast.tsx` | `components/ui/toast.tsx` | ✅ Safe to remove |
| **Toaster** | Missing (not implemented) | Missing (not implemented) | N/A |

**Note:** Textarea is used by `input-group.tsx`, so it should be kept OR removed together with input-group.

### 1.2 Custom Hooks (Unused)

| Hook | File Path (zaplit-com) | File Path (zaplit-org) | Status |
|------|------------------------|------------------------|--------|
| **useToast** | `hooks/use-toast.ts` | `hooks/use-toast.ts` | ✅ Safe to remove |

**Note:** The project uses `sonner` library for toasts but doesn't use the custom `useToast` hook.

### 1.3 Library Functions (Unused - Exported but Never Imported)

| Function | Location | Used In Tests? | Status |
|----------|----------|----------------|--------|
| `sanitizeInput()` | `lib/schemas/forms.ts` | ✅ Yes | ⚠️ Remove or Implement |
| `isValidEmail()` | `lib/schemas/forms.ts` | ❌ No | ✅ Safe to remove |
| `isDisposableEmail()` | `lib/schemas/forms.ts` | ❌ No | ✅ Safe to remove |
| `formTypeSchema` | `lib/schemas/forms.ts` | ❌ No | ✅ Safe to remove* |

*Note: `formTypeSchema` is defined locally in `app/api/submit-form/route.ts` - the exported version is unused.

### 1.4 Type Exports (Unused)

| Type | Location | Status |
|------|----------|--------|
| `ContactFormData` | `lib/schemas/forms.ts` | ✅ Safe to remove |
| `ConsultationFormData` | `lib/schemas/forms.ts` | ✅ Safe to remove |
| `NewsletterFormData` | `lib/schemas/forms.ts` | ✅ Safe to remove |

### 1.5 Unused Constants

| Constant | Location | Used | Status |
|----------|----------|------|--------|
| `CONTENT` | `lib/constants.ts` | ❌ No | ✅ Safe to remove |
| `UI.MAX_TOASTS` | `lib/constants.ts` | ❌ No | ✅ Safe to remove |
| `UI.ANIMATION_DURATION_MS` | `lib/constants.ts` | ❌ No | ✅ Safe to remove |

### 1.6 Composite Components (Chain of Unused)

| Component | File Path | Imports | Used By | Status |
|-----------|-----------|---------|---------|--------|
| **InputGroup** | `components/ui/input-group.tsx` | Textarea, Button, Input | ❌ Nothing | ✅ Safe to remove |
| **InputGroupTextarea** | `components/ui/input-group.tsx` | Textarea | ❌ Nothing | ✅ Safe to remove |
| **Textarea** | `components/ui/textarea.tsx` | - | InputGroup only | Chain removal |

---

## 2. Safe Removal Order

### Phase 1: Leaf Dependencies (Safest)
```
1. isValidEmail()           - lib/schemas/forms.ts
2. isDisposableEmail()      - lib/schemas/forms.ts
3. disposableDomains const  - lib/schemas/forms.ts (internal)
4. formTypeSchema export    - lib/schemas/forms.ts
5. ContactFormData type     - lib/schemas/forms.ts
6. ConsultationFormData type - lib/schemas/forms.ts
7. NewsletterFormData type  - lib/schemas/forms.ts
```

### Phase 2: Unused Constants
```
8. CONTENT constant         - lib/constants.ts
9. UI.MAX_TOASTS            - lib/constants.ts
10. UI.ANIMATION_DURATION_MS - lib/constants.ts
```

### Phase 3: UI Components (No Dependencies)
```
11. Skeleton                - components/ui/skeleton.tsx
12. Popover                 - components/ui/popover.tsx
13. Tooltip                 - components/ui/tooltip.tsx
14. Sheet                   - components/ui/sheet.tsx
```

### Phase 4: Toast System
```
15. useToast hook           - hooks/use-toast.ts
16. Toast component         - components/ui/toast.tsx
```

### Phase 5: Composite Components (Chain)
```
17. input-group.tsx         - components/ui/input-group.tsx
18. textarea.tsx            - components/ui/textarea.tsx (only used by input-group)
```

### Phase 6: sanitizeInput (Decision Required)
```
19. sanitizeInput()         - lib/schemas/forms.ts
    ⚠️ DECISION: Either implement in API routes OR remove with tests
```

---

## 3. Code Changes Required

### 3.1 Remove from `lib/schemas/forms.ts` (Both Apps)

**Remove these exports:**
```typescript
// Remove: formTypeSchema (line 14)
// Remove: ContactFormData (line 40)
// Remove: ConsultationFormData (line 72)
// Remove: NewsletterFormData (line 87)

// Remove functions (lines 95-139):
export function sanitizeInput(input: string): string { ... }
export function isValidEmail(email: string): boolean { ... }
export function isDisposableEmail(email: string): boolean { ... }

// Remove internal constant:
const disposableDomains = new Set([...]);
```

### 3.2 Update `lib/schemas/forms.test.ts` (Both Apps)

**Remove test for sanitizeInput:**
```typescript
// Remove entire describe block:
describe('sanitizeInput', () => { ... })

// Update imports:
import {
  contactFormSchema,
  consultationFormSchema,
  newsletterFormSchema,
  // REMOVE: sanitizeInput,
} from './forms'
```

### 3.3 Update `lib/constants.ts` (Both Apps)

**Remove CONTENT constant:**
```typescript
// Remove entire block (lines 98-108):
export const CONTENT = { ... }
```

**Remove unused UI constants:**
```typescript
export const UI = {
  MOBILE_BREAKPOINT_PX: 768,
  TOAST_DURATION_MS: 5000,
  // REMOVE: MAX_TOASTS: 1,
  // REMOVE: ANIMATION_DURATION_MS: 200,
} as const;
```

### 3.4 Delete Files (Both Apps)

```bash
# Phase 3 UI Components
rm zaplit-com/components/ui/skeleton.tsx
rm zaplit-org/components/ui/skeleton.tsx
rm zaplit-com/components/ui/popover.tsx
rm zaplit-org/components/ui/popover.tsx
rm zaplit-com/components/ui/tooltip.tsx
rm zaplit-org/components/ui/tooltip.tsx
rm zaplit-com/components/ui/sheet.tsx
rm zaplit-org/components/ui/sheet.tsx

# Phase 4 Toast System
rm zaplit-com/hooks/use-toast.ts
rm zaplit-org/hooks/use-toast.ts
rm zaplit-com/components/ui/toast.tsx
rm zaplit-org/components/ui/toast.tsx

# Phase 5 Composite Components
rm zaplit-com/components/ui/input-group.tsx
rm zaplit-org/components/ui/input-group.tsx
rm zaplit-com/components/ui/textarea.tsx
rm zaplit-org/components/ui/textarea.tsx
```

---

## 4. Impact Assessment

| Area | Impact Level | Notes |
|------|--------------|-------|
| **Runtime** | None | No production code uses these exports |
| **Tests** | Low | Only sanitizeInput tests need removal |
| **Build** | Positive | Smaller bundle size |
| **Future Dev** | Medium | May need to re-add if features change |

---

## 5. Rollback Plan

1. **Pre-deletion:** All files are tracked in git - can be restored via `git checkout`
2. **Branch strategy:** Create feature branch `cleanup/dead-code-removal`
3. **Testing:** Run full test suite after each phase
4. **Staging:** Deploy to staging environment before production

---

## 6. Implementation Commands

```bash
# Create branch
git checkout -b cleanup/dead-code-removal

# Phase 1-2: Update schema and constants files
# (Edit files manually per section 3.1, 3.2, 3.3)

# Phase 3-5: Delete dead code files
rm zaplit-com/components/ui/{skeleton,popover,tooltip,sheet}.tsx
rm zaplit-org/components/ui/{skeleton,popover,tooltip,sheet}.tsx
rm zaplit-com/{hooks/use-toast.ts,components/ui/toast.tsx}
rm zaplit-org/{hooks/use-toast.ts,components/ui/toast.tsx}
rm zaplit-com/components/ui/{input-group,textarea}.tsx
rm zaplit-org/components/ui/{input-group,textarea}.tsx

# Verify build
pnpm build

# Run tests
pnpm test

# Commit and push
git add .
git commit -m "cleanup: remove dead code across monorepo

- Remove unused UI components (Skeleton, Popover, Tooltip, Sheet)
- Remove unused Toast system (toast.tsx, use-toast.ts)
- Remove unused form utility functions (isValidEmail, isDisposableEmail)
- Remove unused form type exports (ContactFormData, etc.)
- Remove unused constants (CONTENT, MAX_TOASTS, ANIMATION_DURATION_MS)
- Remove unused composite components (InputGroup, Textarea)"
```

---

## 7. Files Modified/Created

### Files to Modify:
- `zaplit-com/lib/schemas/forms.ts`
- `zaplit-com/lib/schemas/forms.test.ts`
- `zaplit-com/lib/constants.ts`
- `zaplit-org/lib/schemas/forms.ts`
- `zaplit-org/lib/schemas/forms.test.ts`
- `zaplit-org/lib/constants.ts`

### Files to Delete (10 files × 2 apps = 20 files):
- `components/ui/skeleton.tsx` (×2)
- `components/ui/popover.tsx` (×2)
- `components/ui/tooltip.tsx` (×2)
- `components/ui/sheet.tsx` (×2)
- `components/ui/toast.tsx` (×2)
- `components/ui/input-group.tsx` (×2)
- `components/ui/textarea.tsx` (×2)
- `hooks/use-toast.ts` (×2)

**Total:** 6 files modified, 16 files deleted

---

## Appendix: Verification Commands

```bash
# Verify no remaining imports of deleted files
grep -r "from.*skeleton\|import.*Skeleton" zaplit-com zaplit-org --include="*.tsx" | grep -v node_modules
grep -r "from.*popover\|import.*Popover" zaplit-com zaplit-org --include="*.tsx" | grep -v node_modules
grep -r "from.*tooltip\|import.*Tooltip" zaplit-com zaplit-org --include="*.tsx" | grep -v node_modules
grep -r "from.*sheet\|import.*Sheet" zaplit-com zaplit-org --include="*.tsx" | grep -v node_modules
grep -r "from.*toast\|import.*useToast" zaplit-com zaplit-org --include="*.tsx" | grep -v node_modules
grep -r "sanitizeInput\|isValidEmail\|isDisposableEmail" zaplit-com zaplit-org --include="*.ts" | grep -v node_modules | grep -v "forms.ts"
```

---

*Report generated by static analysis of the Zaplit monorepo codebase.*
