/**
 * Base Page Object Model
 * 
 * Abstract base class for all page objects with common functionality.
 */

import { Page, Locator, expect } from '@playwright/test';

export abstract class BasePage {
  constructor(protected page: Page) {}

  /**
   * Navigate to the page URL
   */
  abstract goto(): Promise<void>;

  /**
   * Wait for page to be fully loaded
   */
  abstract waitForReady(): Promise<void>;

  /**
   * Get the page title
   */
  async getTitle(): Promise<string> {
    return this.page.title();
  }

  /**
   * Get the current URL
   */
  async getUrl(): Promise<string> {
    return this.page.url();
  }

  /**
   * Scroll to an element
   */
  async scrollTo(selector: string): Promise<void> {
    await this.page.locator(selector).scrollIntoViewIfNeeded();
  }

  /**
   * Take a screenshot
   */
  async screenshot(options?: { name?: string; fullPage?: boolean }): Promise<Buffer> {
    const filename = options?.name || `screenshot-${Date.now()}.png`;
    return this.page.screenshot({ 
      path: `test-results/screenshots/${filename}`,
      fullPage: options?.fullPage 
    });
  }

  /**
   * Check if element exists
   */
  async hasElement(selector: string): Promise<boolean> {
    return (await this.page.locator(selector).count()) > 0;
  }

  /**
   * Get page header/navigation
   */
  getHeader(): Locator {
    return this.page.locator('nav').first();
  }

  /**
   * Get page footer
   */
  getFooter(): Locator {
    return this.page.locator('footer').first();
  }

  /**
   * Get main content area
   */
  getMainContent(): Locator {
    return this.page.locator('main, [role="main"]').first();
  }

  /**
   * Toggle mobile menu
   */
  async toggleMobileMenu(): Promise<void> {
    const menuButton = this.page.getByRole('button', { name: /toggle menu/i });
    await menuButton.click();
  }

  /**
   * Check if mobile menu is open
   */
  async isMobileMenuOpen(): Promise<boolean> {
    const mobileMenu = this.page.locator('nav').filter({ has: this.page.getByRole('button', { name: /book demo/i }) });
    return await mobileMenu.isVisible();
  }

  /**
   * Click navigation link
   */
  async clickNavLink(label: string | RegExp): Promise<void> {
    const link = this.page.getByRole('link', { name: label });
    await link.click();
  }

  /**
   * Assert page has no accessibility violations (basic check)
   */
  async assertBasicA11y(): Promise<void> {
    // Check for required landmarks
    await expect(this.page.locator('main, [role="main"]')).toBeVisible();
    
    // Check for skip link
    const skipLink = this.page.getByRole('link', { name: /skip/i });
    await expect(skipLink).toBeVisible();
    
    // Check that images have alt text
    const imagesWithoutAlt = this.page.locator('img:not([alt])');
    expect(await imagesWithoutAlt.count()).toBe(0);
  }
}
