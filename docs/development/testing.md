# Testing

> **Testing strategy and guides**

## Overview

| Type | Tool | Location |
|------|------|----------|
| Unit | Vitest | Colocated (`*.test.tsx`) |
| E2E | Playwright | `e2e/` |

## Unit Testing

```tsx
// components/button.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from './button';

describe('Button', () => {
  it('renders children', () => {
    render(<Button>Click</Button>);
    expect(screen.getByText('Click')).toBeInTheDocument();
  });
  
  it('handles clicks', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Click</Button>);
    fireEvent.click(screen.getByText('Click'));
    expect(onClick).toHaveBeenCalled();
  });
});
```

## E2E Testing

```typescript
// e2e/contact-form.spec.ts
import { test, expect } from '@playwright/test';

test('submits contact form', async ({ page }) => {
  await page.goto('/contact');
  await page.fill('[name="name"]', 'Test');
  await page.fill('[name="email"]', 'test@example.com');
  await page.fill('[name="message"]', 'Hello');
  await page.click('button[type="submit"]');
  await expect(page.locator('text=Sent')).toBeVisible();
});
```

## Running Tests

```bash
pnpm test              # Unit tests
pnpm test:watch        # Watch mode
pnpm test:e2e          # E2E tests
pnpm test:e2e --ui     # With UI
```

## Coverage

```json
// vitest.config.ts
{
  "test": {
    "coverage": {
      "thresholds": {
        "lines": 80,
        "functions": 80
      }
    }
  }
}
```

---

**Related**: [Development](./README.md)
