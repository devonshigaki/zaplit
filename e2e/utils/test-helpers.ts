/**
 * E2E Test Utilities
 * 
 * Helper functions for common test operations, navigation, and assertions.
 */

import { Page, Locator, expect } from '@playwright/test';

// ============================================================================
// Navigation Helpers
// ============================================================================

/**
 * Navigate to a page and wait for it to be ready
 */
export async function gotoAndWait(page: Page, url: string, options?: { waitForNetwork?: boolean }) {
  await page.goto(url);
  
  if (options?.waitForNetwork) {
    await page.waitForLoadState('networkidle');
  } else {
    await page.waitForLoadState('domcontentloaded');
  }
}

/**
 * Navigate to a specific section via anchor link
 */
export async function gotoSection(page: Page, sectionId: string) {
  await page.goto(`/#${sectionId}`);
  await page.waitForSelector(`#${sectionId}`, { state: 'visible' });
}

/**
 * Navigate to contact page
 */
export async function gotoContact(page: Page) {
  await gotoAndWait(page, '/contact');
  await expect(page).toHaveTitle(/Contact|Zaplit/i);
}

/**
 * Navigate to book demo section
 */
export async function gotoBookDemo(page: Page) {
  await gotoAndWait(page, '/#book-demo');
  await page.waitForSelector('#book-demo', { state: 'visible' });
}

// ============================================================================
// Mobile Menu Helpers
// ============================================================================

/**
 * Open mobile navigation menu
 */
export async function openMobileMenu(page: Page) {
  const menuButton = page.getByRole('button', { name: /toggle menu/i });
  await menuButton.click();
  await page.waitForSelector('nav a[href="#agents"]', { state: 'visible' });
}

/**
 * Close mobile navigation menu
 */
export async function closeMobileMenu(page: Page) {
  const menuButton = page.getByRole('button', { name: /toggle menu/i });
  await menuButton.click();
}

// ============================================================================
// Form Helpers
// ============================================================================

/**
 * Fill a text input field
 */
export async function fillTextField(page: Page, label: string | RegExp, value: string) {
  const field = page.getByLabel(label, { exact: false });
  await field.fill(value);
  return field;
}

/**
 * Fill a textarea field
 */
export async function fillTextarea(page: Page, label: string | RegExp, value: string) {
  const field = page.locator('textarea').filter({ hasText: new RegExp('') }).or(
    page.getByLabel(label, { exact: false })
  ).first();
  await field.fill(value);
  return field;
}

/**
 * Select a radio or button option by text
 */
export async function selectOptionByText(page: Page, optionText: string) {
  const button = page.getByRole('button', { name: optionText, exact: true });
  await button.click();
  return button;
}

/**
 * Select team size option
 */
export async function selectTeamSize(page: Page, size: '1–10' | '11–50' | '51–200' | '200+') {
  const button = page.locator('#teamsize-label').locator('..').getByRole('button', { name: size });
  await button.click();
}

/**
 * Select tech stack options (minimum 3 categories required)
 */
export async function selectTechStack(
  page: Page, 
  selections: Record<string, string>
) {
  for (const [category, tool] of Object.entries(selections)) {
    const categoryLabel = page.getByText(category, { exact: false }).first();
    const categoryRow = categoryLabel.locator('..');
    const toolButton = categoryRow.getByRole('button', { name: tool, exact: true });
    await toolButton.click();
  }
}

/**
 * Toggle compliance options
 */
export async function toggleCompliance(page: Page, options: string[]) {
  for (const option of options) {
    const button = page.getByRole('button', { name: new RegExp(option, 'i') });
    await button.click();
  }
}

/**
 * Select security level
 */
export async function selectSecurityLevel(
  page: Page, 
  level: 'standard' | 'high' | 'enterprise'
) {
  const button = page.getByRole('button', { name: new RegExp(`^${level}$`, 'i') });
  await button.click();
}

/**
 * Submit a form and wait for response
 */
export async function submitForm(page: Page, options?: { waitForSuccess?: boolean }) {
  const submitButton = page.getByRole('button', { name: /send|submit|book/i }).first();
  await submitButton.click();
  
  if (options?.waitForSuccess) {
    // Wait for either success message or error
    await Promise.race([
      page.waitForSelector('text=/sent|received|success|thank/i', { timeout: 10000 }),
      page.waitForSelector('[role="alert"]', { timeout: 10000 }),
    ]);
  }
}

/**
 * Click a button by text
 */
export async function clickButton(page: Page, text: string | RegExp) {
  const button = page.getByRole('button', { name: text });
  await button.click();
  return button;
}

// ============================================================================
// Theme Helpers
// ============================================================================

/**
 * Toggle between light and dark theme
 */
export async function toggleTheme(page: Page) {
  const themeButton = page.getByRole('button', { name: /toggle theme/i });
  await themeButton.click();
}

/**
 * Get current theme
 */
export async function getCurrentTheme(page: Page): Promise<'dark' | 'light'> {
  const hasDarkClass = await page.locator('html.dark').count() > 0;
  return hasDarkClass ? 'dark' : 'light';
}

/**
 * Set specific theme
 */
export async function setTheme(page: Page, theme: 'dark' | 'light') {
  const currentTheme = await getCurrentTheme(page);
  if (currentTheme !== theme) {
    await toggleTheme(page);
  }
}

// ============================================================================
// Assertion Helpers
// ============================================================================

/**
 * Assert that a success message is displayed
 */
export async function expectSuccessMessage(page: Page, messagePattern?: RegExp) {
  const pattern = messagePattern || /sent|received|success|thank/i;
  const successElement = page.getByText(pattern);
  await expect(successElement).toBeVisible();
}

/**
 * Assert that an error message is displayed
 */
export async function expectErrorMessage(page: Page, messagePattern?: RegExp) {
  const alert = page.locator('[role="alert"]');
  await expect(alert).toBeVisible();
  
  if (messagePattern) {
    await expect(alert).toContainText(messagePattern);
  }
}

/**
 * Assert that form field has validation error
 */
export async function expectFieldValidationError(page: Page, fieldLabel: string | RegExp) {
  const field = page.getByLabel(fieldLabel, { exact: false });
  await expect(field).toHaveAttribute('aria-invalid', 'true');
}

/**
 * Assert page is in specific viewport size
 */
export async function expectViewportSize(page: Page, type: 'mobile' | 'tablet' | 'desktop') {
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  
  switch (type) {
    case 'mobile':
      expect(viewport!.width).toBeLessThan(768);
      break;
    case 'tablet':
      expect(viewport!.width).toBeGreaterThanOrEqual(768);
      expect(viewport!.width).toBeLessThan(1024);
      break;
    case 'desktop':
      expect(viewport!.width).toBeGreaterThanOrEqual(1024);
      break;
  }
}

// ============================================================================
// Wait Helpers
// ============================================================================

/**
 * Wait for form submission to complete
 */
export async function waitForFormSubmission(page: Page, timeout = 10000) {
  // Wait for loading state to finish
  const loadingButton = page.getByRole('button').filter({ hasText: /sending|submitting/i });
  await loadingButton.waitFor({ state: 'hidden', timeout });
}

/**
 * Wait for smooth scroll to complete
 */
export async function waitForScroll(page: Page, timeout = 1000) {
  await page.waitForTimeout(timeout);
}

/**
 * Wait for element to be in viewport
 */
export async function waitForElementInViewport(page: Page, selector: string) {
  await page.evaluate((sel) => {
    return new Promise<void>((resolve) => {
      const observer = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting) {
          observer.disconnect();
          resolve();
        }
      });
      const element = document.querySelector(sel);
      if (element) observer.observe(element);
    });
  }, selector);
}

// ============================================================================
// API Mocking Helpers
// ============================================================================

/**
 * Mock the form submission API
 */
export async function mockFormSubmission(
  page: Page, 
  response: { success: boolean; message: string; id?: string }
) {
  await page.route('/api/submit-form', async (route) => {
    await route.fulfill({
      status: response.success ? 200 : 400,
      contentType: 'application/json',
      body: JSON.stringify(response),
    });
  });
}

/**
 * Mock the form submission API to simulate network error
 */
export async function mockFormSubmissionNetworkError(page: Page) {
  await page.route('/api/submit-form', async (route) => {
    await route.abort('failed');
  });
}

/**
 * Mock the form submission API with delay
 */
export async function mockFormSubmissionWithDelay(
  page: Page, 
  response: { success: boolean; message: string; id?: string },
  delayMs: number
) {
  await page.route('/api/submit-form', async (route) => {
    await new Promise(resolve => setTimeout(resolve, delayMs));
    await route.fulfill({
      status: response.success ? 200 : 400,
      contentType: 'application/json',
      body: JSON.stringify(response),
    });
  });
}

// ============================================================================
// Console and Error Monitoring
// ============================================================================

/**
 * Setup console error monitoring
 */
export function setupConsoleMonitoring(page: Page): string[] {
  const consoleErrors: string[] = [];
  
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });
  
  return consoleErrors;
}

/**
 * Setup page error monitoring
 */
export function setupPageErrorMonitoring(page: Page): Error[] {
  const pageErrors: Error[] = [];
  
  page.on('pageerror', (error) => {
    pageErrors.push(error);
  });
  
  return pageErrors;
}

/**
 * Assert no console errors occurred
 */
export function expectNoConsoleErrors(errors: string[]) {
  expect(errors).toHaveLength(0);
}

/**
 * Assert no page errors occurred
 */
export function expectNoPageErrors(errors: Error[]) {
  expect(errors).toHaveLength(0);
}
