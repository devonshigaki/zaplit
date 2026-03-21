/**
 * Newsletter Signup Component Object Model
 * 
 * Represents newsletter signup forms that appear in various locations.
 */

import { Page, Locator, expect } from '@playwright/test';
import type { NewsletterFormData } from '../fixtures/test-data';

export class NewsletterComponent {
  // Common selectors for newsletter forms
  readonly selectors = {
    // In footer or sidebar
    emailInput: 'input[type="email"]',
    submitButton: 'button[type="submit"], button:has-text("Subscribe"), button:has-text("Sign up")',
    successMessage: /subscribed|success|thank you|check your email/i,
    errorMessage: /invalid|error|failed|already/i,
  };

  constructor(private page: Page) {}

  /**
   * Get newsletter email input (searching common locations)
   */
  getEmailInput(): Locator {
    // Look in footer first, then anywhere on page
    return this.page.locator('footer input[type="email"]').first().or(
      this.page.locator('input[type="email"]').filter({ has: this.page.locator('') })
    ).first();
  }

  /**
   * Get newsletter submit button
   */
  getSubmitButton(): Locator {
    return this.page.getByRole('button', { name: /subscribe|sign up|join/i }).first();
  }

  /**
   * Fill newsletter email
   */
  async fillEmail(email: string): Promise<void> {
    const input = this.getEmailInput();
    await input.fill(email);
  }

  /**
   * Submit newsletter form
   */
  async submit(): Promise<void> {
    await this.getSubmitButton().click();
  }

  /**
   * Fill and submit newsletter form
   */
  async fillAndSubmit(data: NewsletterFormData): Promise<void> {
    await this.fillEmail(data.email);
    await this.submit();
  }

  /**
   * Wait for success message
   */
  async waitForSuccess(): Promise<void> {
    await this.page.waitForSelector(`text=${this.selectors.successMessage.source}`, { timeout: 10000 });
  }

  /**
   * Wait for error message
   */
  async waitForError(): Promise<void> {
    await this.page.waitForSelector(`text=${this.selectors.errorMessage.source}`, { timeout: 5000 });
  }

  /**
   * Check if success message is displayed
   */
  async isSuccessDisplayed(): Promise<boolean> {
    const successText = this.page.getByText(this.selectors.successMessage);
    return await successText.isVisible().catch(() => false);
  }

  /**
   * Check if error message is displayed
   */
  async isErrorDisplayed(): Promise<boolean> {
    const errorText = this.page.getByText(this.selectors.errorMessage);
    return await errorText.isVisible().catch(() => false);
  }
}

/**
 * Footer-specific newsletter component
 */
export class FooterNewsletterComponent extends NewsletterComponent {
  readonly footer = () => this.page.locator('footer').first();

  /**
   * Get email input specifically within footer
   */
  override getEmailInput(): Locator {
    return this.footer().locator('input[type="email"]').first();
  }

  /**
   * Get submit button specifically within footer
   */
  override getSubmitButton(): Locator {
    return this.footer().getByRole('button', { name: /subscribe|sign up/i });
  }
}
