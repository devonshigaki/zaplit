# Zaplit E2E Testing Strategy

## Executive Summary

This document outlines the comprehensive End-to-End (E2E) testing strategy for the Zaplit monorepo using Playwright. The strategy covers both `zaplit-com` and `zaplit-org` applications with focus on critical user flows, responsive design, and CI/CD integration.

---

## 1. Current State Assessment

### Findings

| Aspect | Status | Notes |
|--------|--------|-------|
| Playwright Version | ✅ Installed | v1.58.2 (latest) |
| playwright.config.ts | ✅ Exists | Basic configuration present |
| e2e/ Directory | ❌ Missing | Created as part of this strategy |
| Test Scripts | ✅ Available | `test:e2e`, `test:e2e:ui` in package.json |
| CI Integration | ✅ Partial | E2E job exists but needs e2e/ dir |

### Key Applications

- **zaplit-com**: Main marketing site with forms (contact, consultation, newsletter)
- **zaplit-org**: Organization site (similar structure)

### Form Types Identified

1. **Contact Form** (`/contact`) - 5 fields, single-step
2. **Consultation/Demo Booking** (`/#book-demo`) - 3-step wizard
3. **Newsletter Signup** - Email-only, embedded in various sections

---

## 2. Critical User Flows (Priority)

### P0 - Must Test

| Flow | Location | Impact | Test File |
|------|----------|--------|-----------|
| Contact Form Submission | `/contact` | Primary lead gen | `contact-form.spec.ts` |
| Consultation Booking | `/#book-demo` | Enterprise leads | `consultation-booking.spec.ts` |
| Navigation & Theme | All pages | Core UX | `navigation.spec.ts` |

### P1 - Should Test

| Flow | Location | Impact | Test File |
|------|----------|--------|-----------|
| Newsletter Signup | Footer/Sections | Lead nurturing | `newsletter.spec.ts` |
| Mobile Navigation | All pages | Mobile UX | Part of navigation.spec.ts |
| Cross-page Navigation | All pages | Site structure | Part of navigation.spec.ts |

### P2 - Nice to Have

| Flow | Location | Impact | Status |
|------|----------|--------|--------|
| Blog navigation | `/blog` | Content marketing | Future |
| Calculator interactions | `/#calculator` | User engagement | Future |
| FAQ accordion | `/#faq` | Support | Future |

---

## 3. Test Structure

```
e2e/
├── fixtures/              # Test data factories
│   └── test-data.ts       # Contact, consultation, newsletter data
├── pages/                 # Page Object Models
│   ├── base-page.ts       # Common page functionality
│   ├── home-page.ts       # Landing page
│   ├── contact-page.ts    # Contact form page
│   ├── consultation-page.ts # Multi-step form
│   ├── newsletter-component.ts # Newsletter signup
│   └── index.ts           # Exports
├── specs/                 # Test specifications
│   ├── contact-form.spec.ts
│   ├── consultation-booking.spec.ts
│   ├── navigation.spec.ts
│   └── newsletter.spec.ts
├── utils/                 # Test utilities
│   ├── test-helpers.ts    # Navigation, form helpers, mocking
│   └── index.ts           # Exports
├── setup/                 # Global setup/teardown
│   ├── global-setup.ts
│   ├── global-teardown.ts
│   └── test-setup.ts
├── README.md              # Testing documentation
└── .eslintrc.json         # E2E-specific lint rules
```

---

## 4. Page Object Models

### BasePage
- Common navigation methods
- Screenshot utilities
- Accessibility checks

### HomePage
- Navigation links
- Hero section
- All content sections
- Theme toggle
- Mobile menu

### ContactPage
- Form field interactions
- Submit and validation
- Success/error states

### ConsultationPage
- Multi-step navigation
- Tech stack selection
- Security level selection
- Compliance options

### NewsletterComponent
- Email input
- Submit handling
- Success/error states

---

## 5. Test Data Strategy

### Factories (using @faker-js/faker)

```typescript
// Generate test data
createContactFormData({
  name: 'John Doe',
  email: 'test-contact-12345@example.com'
});

createConsultationFormData({
  teamSize: '11–50',
  securityLevel: 'enterprise'
});

createNewsletterFormData();
```

### Test Personas

- **Business User**: Sarah Johnson, VP of Engineering
- **Startup Founder**: Alex Chen, CEO of StartupXYZ
- **Enterprise User**: Michael Roberts, CTO with compliance needs

### Edge Cases Covered

- XSS attempts (`<script>alert("xss")</script>`)
- SQL injection attempts
- Unicode and special characters
- HTML content in text fields
- Very long inputs (5000+ chars)
- Invalid email formats

### Mock n8n Responses

```typescript
mockFormSubmission(page, createSuccessResponse());
mockFormSubmission(page, createErrorResponse('Service unavailable'));
mockFormSubmissionNetworkError(page);
```

---

## 6. Browser/Device Coverage

| Device | Viewport | Priority |
|--------|----------|----------|
| Desktop Chrome | 1280x720 | P0 |
| Mobile Chrome (Pixel 5) | 393x851 | P0 |
| Mobile Safari (iPhone 12) | 390x844 | P0 |
| Tablet (iPad) | 768x1024 | P1 |
| Desktop Firefox | 1280x720 | P2 |
| Desktop Safari | 1280x720 | P2 |

---

## 7. CI/CD Integration

### GitHub Actions Workflow (`.github/workflows/e2e.yml`)

**Triggers:**
- Push to `main`, `develop`
- Pull requests to `main`
- Manual workflow dispatch
- `[e2e]` in commit message

**Jobs:**
1. **changes**: Detect relevant file changes
2. **install**: Install dependencies and cache
3. **build**: Build Next.js application
4. **smoke-tests**: Fast navigation tests (10 min timeout)
5. **e2e-tests**: Full test suite per browser project
6. **e2e-summary**: Aggregate results
7. **deploy-report**: Deploy HTML reports to GitHub Pages

**Artifacts:**
- Screenshots (on failure)
- Videos (on failure)
- Traces (on first retry)
- HTML reports
- JSON reports

**Retention:** 7 days

### Integration with Main CI

The existing `.github/workflows/ci.yml` already includes an `e2e-tests` job that:
- Downloads build artifacts
- Installs Playwright browsers
- Runs tests against pre-built app
- Uploads test results

---

## 8. NPM Scripts

```json
{
  "test:e2e": "playwright test",
  "test:e2e:ui": "playwright test --ui",
  "test:e2e:debug": "playwright test --debug",
  "test:e2e:headed": "playwright test --headed",
  "test:e2e:chromium": "playwright test --project=chromium",
  "test:e2e:mobile": "playwright test --project='Mobile Chrome' --project='Mobile Safari'"
}
```

---

## 9. Configuration Updates

### playwright.config.ts Changes

```typescript
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html', { open: 'never' }],
    ['list'],
    ['json', { outputFile: 'playwright-report.json' }],
  ],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
    viewport: { width: 1280, height: 720 },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'Mobile Chrome', use: { ...devices['Pixel 5'] } },
    { name: 'Mobile Safari', use: { ...devices['iPhone 12'] } },
    { name: 'Tablet', use: { viewport: { width: 768, height: 1024 } } },
  ],
  webServer: {
    command: 'pnpm dev:com',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
});
```

---

## 10. Security Testing

### XSS Prevention
- Tests inject `<script>` tags into form fields
- Verifies no script execution occurs
- Checks console for XSS errors

### SQL Injection
- Tests SQL injection patterns in inputs
- Verifies no server errors
- Confirms sanitization

### Rate Limiting
- Tests 429 responses
- Verifies retry-after headers
- Confirms error messaging

---

## 11. Accessibility Testing

### Automated Checks
- Skip link presence
- Landmark regions (nav, main, footer)
- Image alt text
- Heading hierarchy
- Focusable elements

### Manual Checks
- Color contrast (via theme toggle)
- Keyboard navigation
- Screen reader compatibility

---

## 12. Best Practices

### Test Organization
- Group by feature in describe blocks
- Use beforeEach/afterEach for setup
- Isolate tests (no dependencies)
- Descriptive test names

### Page Objects
- Encapsulate page-specific logic
- Reusable across tests
- Single source of truth for selectors

### Data Management
- Use factories for test data
- Unique emails per test (timestamp-based)
- Personas for realistic scenarios

### Error Handling
- Monitor console errors
- Capture page errors
- Screenshot on failure
- Video recording for debugging

---

## 13. Running Tests Locally

```bash
# Install dependencies
pnpm install

# Install Playwright browsers
pnpm exec playwright install

# Run all tests
pnpm test:e2e

# Run with UI mode (debugging)
pnpm test:e2e:ui

# Run specific test file
pnpm exec playwright test e2e/specs/contact-form.spec.ts

# Run in headed mode
pnpm test:e2e:headed

# Run mobile tests only
pnpm test:e2e:mobile

# Run against staging
PLAYWRIGHT_BASE_URL=https://staging.zaplit.com pnpm test:e2e
```

---

## 14. Debugging

```bash
# Open Playwright inspector
PWDEBUG=1 pnpm exec playwright test

# Show browser
pnpm exec playwright test --headed

# Generate trace
pnpm exec playwright test --trace on

# View trace
pnpm exec playwright show-trace test-results/trace.zip
```

---

## 15. Future Enhancements

### Short Term
- [ ] Add visual regression testing
- [ ] Implement test tagging (smoke, regression)
- [ ] Add performance benchmarks

### Medium Term
- [ ] Cross-browser testing (Firefox, Safari)
- [ ] API integration tests
- [ ] Accessibility automated audits (axe-core)

### Long Term
- [ ] Test parallelization improvements
- [ ] Docker-based test environment
- [ ] Integration with monitoring tools

---

## Summary of Deliverables

| File | Purpose |
|------|---------|
| `e2e/fixtures/test-data.ts` | Test data factories & personas |
| `e2e/pages/*.ts` | Page Object Models |
| `e2e/specs/*.spec.ts` | Test specifications |
| `e2e/utils/test-helpers.ts` | Test utilities |
| `e2e/setup/*.ts` | Global setup/teardown |
| `e2e/README.md` | Testing documentation |
| `playwright.config.ts` | Updated configuration |
| `.github/workflows/e2e.yml` | CI workflow |
| `package.json` | Updated scripts & dependencies |

---

## Metrics & KPIs

| Metric | Target |
|--------|--------|
| Test Coverage (Critical Flows) | 100% |
| CI Pass Rate | >95% |
| Test Execution Time | <15 min |
| Flaky Tests | <1% |
| Console Error Free | Yes |

---

*This strategy was designed to ensure robust, maintainable, and scalable E2E testing for the Zaplit monorepo.*
