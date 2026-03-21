/**
 * Test Setup
 * 
 * Per-test setup that runs before each test.
 * Can be configured in playwright.config.ts as setupFiles.
 */

import { test as base, expect } from '@playwright/test';

/**
 * Custom test fixture with additional utilities
 */
export const test = base.extend({
  // Add custom fixtures here if needed
  // Example: authenticated page
  // authenticatedPage: async ({ page }, use) => {
  //   await login(page);
  //   await use(page);
  // },
});

/**
 * Custom expect matchers
 */
export { expect };

/**
 * Console error collector
 * Attach to page to collect console errors during tests
 */
export function attachConsoleCollector(page: any) {
  const errors: string[] = [];
  
  page.on('console', (msg: any) => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });
  
  return errors;
}

/**
 * Page error collector
 * Attach to page to collect page errors during tests
 */
export function attachPageErrorCollector(page: any) {
  const errors: Error[] = [];
  
  page.on('pageerror', (error: Error) => {
    errors.push(error);
  });
  
  return errors;
}
