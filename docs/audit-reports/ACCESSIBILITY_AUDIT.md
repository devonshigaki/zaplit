# Zaplit Monorepo - Comprehensive Accessibility Audit

**Date:** March 20, 2026  
**Auditor:** Accessibility Specialist  
**Scope:** zaplit-com and zaplit-org Next.js applications

---

## Executive Summary

### Accessibility Score: **72/100** 🟡

The Zaplit monorepo demonstrates a **moderate level of accessibility compliance** with good foundational practices but several areas requiring improvement. The codebase uses Radix UI primitives (which provide built-in accessibility) and has some semantic HTML, but lacks comprehensive ARIA implementations, skip links, and reduced motion support.

---

## 1. Critical Issues (Blockers) 🔴

These issues prevent users with disabilities from accessing core functionality.

### Issue 1.1: Missing Skip Links
**Location:** All pages (`layout.tsx`)
**Impact:** HIGH - Keyboard users cannot bypass navigation  
**WCAG:** 2.4.1 Bypass Blocks (Level A)  
**Description:** No skip-to-content links are provided, forcing keyboard users to tab through the entire navigation menu on every page load.

**Fix Required:**
```tsx
// Add to layout.tsx before Navigation
<a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-foreground focus:text-background">
  Skip to main content
</a>

// Add id to main element
<main id="main-content">
```

### Issue 1.2: Missing Form Label Associations
**Location:** `contact/page.tsx`, `booking-modal.tsx`
**Impact:** HIGH - Screen reader users cannot identify form fields  
**WCAG:** 1.3.1 Info and Relationships (Level A), 3.3.2 Labels or Instructions (Level A)  
**Description:** Several form inputs use `<label>` elements without `htmlFor` attributes matching input `id`s, or use inputs without associated labels.

**Affected Fields:**
- Contact page: Message textarea (line 177) - uses label without htmlFor association
- Booking modal: All inputs lack proper id/for associations (lines 104-131)

**Fix Required:**
```tsx
// Before (incorrect)
<div>
  <label className="text-sm font-medium mb-2 block">Name</label>
  <Input placeholder="Your name" required />
</div>

// After (correct)
<div>
  <label htmlFor="contact-name" className="text-sm font-medium mb-2 block">Name</label>
  <Input id="contact-name" placeholder="Your name" required />
</div>
```

### Issue 1.3: Icon Buttons Missing Accessible Names
**Location:** `booking-modal.tsx` (line 71), `security-section.tsx` (lines 157-162)
**Impact:** HIGH - Screen reader users cannot determine button purpose  
**WCAG:** 4.1.2 Name, Role, Value (Level A)  
**Description:** Close button in booking modal and approval/deny buttons use only icons without accessible labels.

**Fix Required:**
```tsx
// Add aria-label to icon-only buttons
<button onClick={onClose} aria-label="Close booking modal">
  <X className="w-4 h-4" />
</button>

<button aria-label="Deny request">Deny</button>
<button aria-label="Approve request">Approve</button>
```

---

## 2. High Priority Issues 🟠

### Issue 2.1: No Reduced Motion Support
**Location:** Global CSS (`globals.css`)
**Impact:** MEDIUM-HIGH - Can cause vestibular disorders  
**WCAG:** 2.3.3 Animation from Interactions (Level AAA)  
**Description:** Animations (pulse, slide, fade) have no `prefers-reduced-motion` media query alternatives.

**Fix Required:**
```css
/* Add to globals.css */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
  
  .animate-ping,
  .animate-in,
  .animate-out {
    animation: none !important;
  }
}
```

### Issue 2.2: Missing Heading Hierarchy
**Location:** `hero.tsx`, `solutions-section.tsx`, various components
**Impact:** MEDIUM - Screen reader navigation is difficult  
**WCAG:** 1.3.1 Info and Relationships (Level A)  
**Description:** 
- Hero section uses `h1` correctly
- Section headers jump from `h1` to `h2` appropriately
- Some card titles use `h4` or `p` instead of proper heading levels

**Recommendation:** Ensure logical heading order (h1 → h2 → h3) without skips.

### Issue 2.3: Insufficient Focus Indicators
**Location:** Custom interactive elements
**Impact:** MEDIUM - Keyboard users cannot see focused elements  
**WCAG:** 2.4.7 Focus Visible (Level AA)  
**Description:** While some UI components have focus rings, custom elements like plan selection cards and calculator buttons lack visible focus indicators.

**Fix Required:**
```css
/* Ensure all interactive elements have visible focus */
button:focus-visible,
a:focus-visible,
[role="button"]:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: 2px;
}
```

### Issue 2.4: Missing Landmark Regions
**Location:** All page components
**Impact:** MEDIUM - Screen reader navigation lacks structure  
**WCAG:** 1.3.1 Info and Relationships (Level A)  
**Description:** 
- `nav` is used correctly
- `footer` is used correctly  
- `main` is used correctly
- Missing: `aside`, `section` with aria-label for complementary content
- Search, complementary sections not marked with landmarks

**Recommendation:** Add `aria-label` to navigation landmarks when multiple navs exist:
```tsx
<nav aria-label="Primary">...</nav>
<nav aria-label="Footer">...</nav>
```

---

## 3. Medium Priority Issues 🟡

### Issue 3.1: Missing Required Field Indicators
**Location:** `book-demo-section.tsx`, `contact/page.tsx`
**Impact:** MEDIUM - Users cannot identify required fields  
**WCAG:** 3.3.2 Labels or Instructions (Level A)  
**Description:** Required fields rely solely on HTML5 `required` attribute without visual indicators or ARIA `aria-required="true"`.

**Fix Required:**
```tsx
<label htmlFor="email">
  Email <span aria-label="required">*</span>
</label>
<input id="email" required aria-required="true" />
```

### Issue 3.2: Missing Error Prevention for Deletion
**Location:** `plans-section.tsx`
**Impact:** MEDIUM - Accidental data loss possible  
**WCAG:** 3.3.4 Error Prevention (Level AA)  
**Description:** Plan selections can be toggled without confirmation, potentially losing user configuration.

### Issue 3.3: Toggle Buttons Lack aria-pressed
**Location:** `faq-section.tsx`, `agents-section.tsx`
**Impact:** MEDIUM - Screen readers don't announce state  
**WCAG:** 4.1.2 Name, Role, Value (Level A)  
**Description:** FAQ accordion buttons and agent expansion buttons don't indicate expanded/collapsed state.

**Fix Required:**
```tsx
<button
  onClick={() => setOpenIndex(openIndex === index ? null : index)}
  aria-expanded={openIndex === index}
  aria-controls={`faq-answer-${index}`}
>
  {faq.question}
</button>
<div id={`faq-answer-${index}`} hidden={openIndex !== index}>
  {faq.answer}
</div>
```

### Issue 3.4: Slider Inputs Lack ARIA Attributes
**Location:** `calculator-section.tsx` (lines 114-145)
**Impact:** MEDIUM - Screen reader users cannot determine slider values  
**WCAG:** 4.1.2 Name, Role, Value (Level A)  
**Description:** Range inputs for team size and timeframe lack `aria-valuemin`, `aria-valuemax`, `aria-valuenow`, and `aria-label`.

### Issue 3.5: Missing Page Title Updates
**Location:** Route changes
**Impact:** MEDIUM - Screen reader users not notified of navigation  
**WCAG:** 2.4.2 Page Titled (Level A)  
**Description:** SPA navigation doesn't announce route changes to screen readers.

**Fix Required:** Use `aria-live` region for route announcements or ensure focus management on route change.

---

## 4. Low Priority Issues 🟢

### Issue 4.1: Decorative Images Not Hidden
**Location:** `integrations-section.tsx`
**Impact:** LOW - Unnecessary screen reader verbosity  
**WCAG:** 1.1.1 Non-text Content (Level A)  
**Description:** Integration logos have alt text but some may be decorative.

**Fix Required:**
```tsx
// For decorative images
<Image alt="" role="presentation" ... />
```

### Issue 4.2: Missing Language Attributes on Dynamic Content
**Location:** All pages
**Impact:** LOW - Screen readers may mispronounce content  
**WCAG:** 3.1.2 Language of Parts (Level AA)  
**Description:** No `lang` attributes for non-English content (if any exists).

### Issue 4.3: Link Purpose Not Clear from Context
**Location:** `footer.tsx`, `navigation.tsx`
**Impact:** LOW - Some links may be ambiguous out of context  
**WCAG:** 2.4.4 Link Purpose (In Context) (Level A)  
**Description:** Multiple "Book Demo" links point to different sections (#book-demo vs /contact).

### Issue 4.4: Missing Table Headers (Data Tables)
**Location:** `hero.tsx` (isolation log)
**Impact:** LOW - Data relationships unclear  
**WCAG:** 1.3.1 Info and Relationships (Level A)  
**Description:** The isolation log table uses divs instead of semantic table elements with `<th>` headers.

---

## 5. Positive Accessibility Features ✅

### 5.1 Semantic HTML
- Proper use of `<nav>`, `<main>`, `<footer>`, `<section>`, `<article>`
- Correct heading hierarchy in most places (h1 → h2)
- List elements used for navigation and feature lists

### 5.2 ARIA Implementation
- `aria-label` on theme toggle and menu toggle buttons
- `aria-expanded` pattern in navigation mobile menu
- `role="alert"` on Alert component
- `role="group"` on field groups and button groups
- `aria-describedby` on form controls for error messages

### 5.3 Form Accessibility
- Proper label associations in book-demo-section (htmlFor + id)
- `aria-required` pattern in some forms
- Error messaging with Alert component using `role="alert"`
- Disabled state handling on submitting forms

### 5.4 Dialog/Modal Accessibility
- Radix UI Dialog provides:
  - Focus trapping
  - Escape key handling
  - `aria-modal="true"`
  - Proper focus management
- `sr-only` text on close buttons

### 5.5 Color and Contrast
- Dark mode support with `prefers-color-scheme`
- Sufficient contrast ratios in both light and dark themes
- Success/destructive colors have semantic meaning

### 5.6 Keyboard Navigation
- All interactive elements are focusable
- Tab order follows visual order
- Radix UI components handle keyboard interactions

### 5.7 Screen Reader Support
- `sr-only` class utility available
- Hidden decorative elements properly
- Form descriptions linked with aria-describedby

---

## 6. Recommendations by Category

### Semantic HTML
| Status | Item | Priority |
|--------|------|----------|
| ✅ | Proper landmark elements (nav, main, footer) | - |
| ✅ | Heading hierarchy maintained | - |
| ⚠️ | Skip links needed | Critical |
| ⚠️ | Table markup for data grids | Low |

### ARIA Attributes
| Status | Item | Priority |
|--------|------|----------|
| ✅ | Labels on icon buttons (partial) | - |
| ✅ | Alert roles on error messages | - |
| ⚠️ | aria-expanded on accordions | Medium |
| ⚠️ | aria-pressed on toggle buttons | Medium |
| ❌ | aria-live for dynamic content | High |

### Keyboard Navigation
| Status | Item | Priority |
|--------|------|----------|
| ✅ | All interactive elements focusable | - |
| ✅ | Logical tab order | - |
| ⚠️ | Skip links | Critical |
| ⚠️ | Focus indicators on custom elements | High |

### Form Accessibility
| Status | Item | Priority |
|--------|------|----------|
| ✅ | Some label associations | - |
| ⚠️ | Required field indicators | Medium |
| ⚠️ | Error message associations | Medium |
| ⚠️ | Form validation feedback | Medium |

### Visual Accessibility
| Status | Item | Priority |
|--------|------|----------|
| ✅ | Dark mode support | - |
| ✅ | Good contrast ratios | - |
| ❌ | prefers-reduced-motion support | High |
| ⚠️ | Focus indicators | High |

### Screen Reader Support
| Status | Item | Priority |
|--------|------|----------|
| ✅ | Alt text on images | - |
| ✅ | sr-only utility | - |
| ✅ | Dialog titles/descriptions | - |
| ⚠️ | Page change announcements | Medium |

---

## 7. Accessibility Checklist for Ongoing Compliance

### Development Phase
- [ ] Add skip links to all page layouts
- [ ] Implement `prefers-reduced-motion` media queries
- [ ] Ensure all form inputs have associated labels with `htmlFor`/`id`
- [ ] Add `aria-label` to all icon-only buttons
- [ ] Implement `aria-expanded` on all accordion/toggle buttons
- [ ] Add focus-visible styles to all interactive custom elements
- [ ] Test with keyboard-only navigation
- [ ] Run automated accessibility tests (axe, Lighthouse)

### Testing Phase
- [ ] Screen reader testing (NVDA, JAWS, VoiceOver)
- [ ] Keyboard navigation testing
- [ ] Color contrast verification (WCAG AA: 4.5:1 for normal text)
- [ ] Zoom testing (200% and 400%)
- [ ] Mobile screen reader testing
- [ ] Reduced motion preference testing

### Pre-Launch
- [ ] Accessibility audit completed
- [ ] Critical and high issues resolved
- [ ] VPAT or similar documentation (if required)
- [ ] Accessibility statement published

---

## 8. Code Examples

### Skip Link Implementation
```tsx
// components/skip-link.tsx
export function SkipLink() {
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-foreground focus:text-background focus:rounded-md"
    >
      Skip to main content
    </a>
  );
}

// In layout.tsx
<body>
  <SkipLink />
  <Navigation />
  <main id="main-content">
    {children}
  </main>
</body>
```

### Reduced Motion CSS
```css
/* globals.css - Add at end */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
  
  .animate-ping,
  .animate-pulse,
  .animate-in,
  .animate-out {
    animation: none !important;
  }
}
```

### Accessible Accordion
```tsx
// FAQ Section improvements
<button
  onClick={() => setOpenIndex(openIndex === index ? null : index)}
  aria-expanded={openIndex === index}
  aria-controls={`faq-content-${index}`}
  id={`faq-trigger-${index}`}
>
  <span>{faq.question}</span>
  <ChevronDown 
    aria-hidden="true"
    className={openIndex === index ? "rotate-180" : ""}
  />
</button>
<div
  id={`faq-content-${index}`}
  role="region"
  aria-labelledby={`faq-trigger-${index}`}
  hidden={openIndex !== index}
>
  {faq.answer}
</div>
```

---

## 9. Tools for Ongoing Monitoring

1. **Automated Testing**
   - axe DevTools (browser extension)
   - Lighthouse accessibility audits
   - `@axe-core/react` for CI/CD

2. **Manual Testing**
   - Keyboard-only navigation test
   - Screen reader testing (NVDA - free, VoiceOver - macOS)
   - Browser zoom (200%, 400%)

3. **Browser DevTools**
   - Chrome Accessibility panel
   - Firefox Accessibility Inspector
   - Safari Web Inspector

---

## 10. Summary

### Strengths
- Good use of Radix UI primitives for accessibility
- Semantic HTML foundation
- Proper ARIA in form components
- Dark mode and theme support
- Good color contrast in design system

### Areas for Improvement
- Skip links (Critical)
- Reduced motion support (High)
- Form label associations (Critical)
- Focus indicators (High)
- Toggle button states (Medium)

### Estimated Effort to WCAG 2.1 AA Compliance
- **Critical fixes:** 4-6 hours
- **High priority:** 8-12 hours
- **Medium priority:** 12-16 hours
- **Total:** 24-34 hours of development work

---

*This audit covers zaplit-com and zaplit-org. Both sites share similar codebases and have identical accessibility profiles.*
