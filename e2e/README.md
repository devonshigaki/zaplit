# E2E Testing with Playwright

This directory contains end-to-end tests for the Zaplit monorepo using Playwright.

## Directory Structure

```
e2e/
├── fixtures/           # Test data factories and mock responses
│   └── test-data.ts
├── pages/             # Page Object Models
│   ├── base-page.ts
│   ├── home-page.ts
│   ├── contact-page.ts
│   ├── consultation-page.ts
│   └── newsletter-component.ts
├── specs/             # Test specifications
│   ├── contact-form.spec.ts
│   ├── consultation-booking.spec.ts
│   ├── navigation.spec.ts
│   └── newsletter.spec.ts
├── utils/             # Test utilities and helpers
│   └── test-helpers.ts
└── README.md          # This file
```

## Getting Started

### Prerequisites

- Node.js >= 18.0.0
- pnpm >= 8.0.0
- Playwright browsers installed

### Installation

```bash
# Install dependencies (includes Playwright)
pnpm install

# Install Playwright browsers
pnpm exec playwright install
```

### Running Tests

```bash
# Run all tests
pnpm test:e2e

# Run tests with UI mode
pnpm test:e2e:ui

# Run specific test file
pnpm exec playwright test e2e/specs/contact-form.spec.ts

# Run tests in headed mode (see browser)
pnpm exec playwright test --headed

# Run tests with specific project (browser)
pnpm exec playwright test --project="Mobile Chrome"
```

### Running Tests Against Different Environments

```bash
# Run against local development server
pnpm test:e2e

# Run against staging
PLAYWRIGHT_BASE_URL=https://staging.zaplit.com pnpm test:e2e

# Run against production
PLAYWRIGHT_BASE_URL=https://zaplit.com pnpm test:e2e
```

## Test Coverage

### Critical User Flows

1. **Contact Form** (`contact-form.spec.ts`)
   - Form validation
   - Successful submission
   - Error handling
   - Security (XSS, SQL injection)
   - Edge cases

2. **Consultation/Demo Booking** (`consultation-booking.spec.ts`)
   - Multi-step form navigation
   - Step validation
   - Tech stack selection
   - Security level selection
   - Compliance options
   - Success state

3. **Navigation** (`navigation.spec.ts`)
   - Desktop navigation
   - Mobile navigation (hamburger menu)
   - Theme toggle (dark/light)
   - Responsive design
   - SEO and metadata
   - Accessibility

4. **Newsletter** (`newsletter.spec.ts`)
   - Email validation
   - Successful subscription
   - Error handling
   - Duplicate prevention

## Page Object Models

We use the Page Object Model (POM) pattern for maintainable tests:

- **BasePage**: Common functionality for all pages
- **HomePage**: Landing page interactions
- **ContactPage**: Contact form interactions
- **ConsultationPage**: Multi-step consultation form
- **NewsletterComponent**: Newsletter signup (reusable component)

## Test Data

Test data is generated using factories in `fixtures/test-data.ts`:

```typescript
import { createContactFormData, createConsultationFormData } from './fixtures/test-data';

const contactData = createContactFormData({
  name: 'John Doe',
  email: 'john@example.com'
});
```

## Mocking API Responses

Use the test helpers to mock form submissions:

```typescript
import { mockFormSubmission, createSuccessResponse } from './utils/test-helpers';

await mockFormSubmission(page, createSuccessResponse());
```

## Best Practices

1. **Use Page Objects**: Interact with pages through POM methods
2. **Generate Test Data**: Use factories for consistent test data
3. **Mock External APIs**: Don't depend on external services in tests
4. **Clean State**: Each test should be independent
5. **Descriptive Names**: Use clear test names describing the behavior
6. **Error Monitoring**: Check for console errors after each test

## CI/CD Integration

Tests run automatically in GitHub Actions on:
- Pull requests to `main`
- Pushes to `main`
- When `[e2e]` tag is in commit message

Artifacts (screenshots, videos, traces) are collected on failure.

## Debugging

```bash
# Run with UI mode for debugging
pnpm test:e2e:ui

# Run with Playwright inspector
PWDEBUG=1 pnpm exec playwright test

# Show browser during test
pnpm exec playwright test --headed

# Generate trace for debugging
pnpm exec playwright test --trace on
```

## Adding New Tests

1. Create test file in `e2e/specs/`
2. Use existing page objects or create new ones
3. Follow the test structure pattern
4. Add test data to fixtures if needed
5. Run tests locally before pushing

## Configuration

See `playwright.config.ts` for:
- Browser configurations
- Viewport sizes
- Timeout settings
- Reporter options
- Web server configuration

## Troubleshooting

### Tests failing in CI but passing locally
- Check viewport differences
- Verify API mocking
- Add waits for async operations
- Check for race conditions

### Flaky tests
- Add proper waits
- Use retry configuration
- Check for animation timing
- Verify element stability

### Browser installation issues
```bash
# Remove existing browsers
pnpm exec playwright uninstall

# Reinstall browsers
pnpm exec playwright install
```
