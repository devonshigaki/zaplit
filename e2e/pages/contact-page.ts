/**
 * Contact Page Object Model
 * 
 * Represents the contact page with form interactions.
 */

import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './base-page';
import type { ContactFormData } from '../fixtures/test-data';

export class ContactPage extends BasePage {
  readonly url = '/contact';

  // Form fields
  readonly form = {
    container: () => this.page.locator('form').first(),
    nameInput: () => this.page.locator('input[type="text"]').first(),
    emailInput: () => this.page.locator('input[type="email"]').first(),
    companyInput: () => this.page.locator('input[type="text"]').nth(1),
    subjectInput: () => this.page.locator('input[type="text"]').nth(2),
    messageTextarea: () => this.page.locator('textarea').first(),
    submitButton: () => this.page.getByRole('button', { name: /send message/i }),
    backButton: () => this.page.getByRole('link', { name: /back to home/i }),
  };

  // Success state
  readonly successState = {
    container: () => this.page.getByText(/message sent/i).first(),
    heading: () => this.page.getByRole('heading', { name: /message sent/i }),
    confirmationText: () => this.page.getByText(/we'll get back to you/i),
    referenceNumber: () => this.page.getByText(/ref:/i),
  };

  // Error state
  readonly errorState = {
    alert: () => this.page.locator('[role="alert"]'),
    errorMessage: () => this.page.locator('[role="alert"] [role="alertdescription"]'),
  };

  // Contact info
  readonly contactInfo = {
    email: () => this.page.getByText('hi@zaplit.com').first(),
    salesEmail: () => this.page.getByText('hi@zaplit.com').nth(1),
  };

  constructor(page: Page) {
    super(page);
  }

  async goto(): Promise<void> {
    await this.page.goto(this.url);
    await this.waitForReady();
  }

  async waitForReady(): Promise<void> {
    await this.page.waitForLoadState('domcontentloaded');
    await expect(this.form.container()).toBeVisible();
  }

  /**
   * Fill the contact form with provided data
   */
  async fillForm(data: Partial<ContactFormData>): Promise<void> {
    if (data.name) {
      await this.form.nameInput().fill(data.name);
    }
    if (data.email) {
      await this.form.emailInput().fill(data.email);
    }
    if (data.company) {
      await this.form.companyInput().fill(data.company);
    }
    if (data.subject) {
      await this.form.subjectInput().fill(data.subject);
    }
    if (data.message) {
      await this.form.messageTextarea().fill(data.message);
    }
  }

  /**
   * Fill form with complete data
   */
  async fillCompleteForm(data: ContactFormData): Promise<void> {
    await this.form.nameInput().fill(data.name);
    await this.form.emailInput().fill(data.email);
    await this.form.companyInput().fill(data.company);
    await this.form.subjectInput().fill(data.subject);
    await this.form.messageTextarea().fill(data.message);
  }

  /**
   * Submit the form
   */
  async submitForm(): Promise<void> {
    await this.form.submitButton().click();
  }

  /**
   * Fill and submit the form in one action
   */
  async fillAndSubmit(data: ContactFormData): Promise<void> {
    await this.fillCompleteForm(data);
    await this.submitForm();
  }

  /**
   * Check if form is in submitting state
   */
  async isSubmitting(): Promise<boolean> {
    const buttonText = await this.form.submitButton().textContent();
    return buttonText?.toLowerCase().includes('sending') ?? false;
  }

  /**
   * Wait for success state
   */
  async waitForSuccess(): Promise<void> {
    await expect(this.successState.container()).toBeVisible({ timeout: 10000 });
  }

  /**
   * Wait for error state
   */
  async waitForError(): Promise<void> {
    await expect(this.errorState.alert()).toBeVisible({ timeout: 5000 });
  }

  /**
   * Check if success message is displayed
   */
  async isSuccessDisplayed(): Promise<boolean> {
    return await this.successState.container().isVisible().catch(() => false);
  }

  /**
   * Check if error is displayed
   */
  async isErrorDisplayed(): Promise<boolean> {
    return await this.errorState.alert().isVisible().catch(() => false);
  }

  /**
   * Get error message text
   */
  async getErrorMessage(): Promise<string | null> {
    return this.errorState.errorMessage().textContent();
  }

  /**
   * Get reference number from success message
   */
  async getReferenceNumber(): Promise<string | null> {
    const refText = await this.successState.referenceNumber().textContent();
    if (refText) {
      // Extract the reference number from "Ref: XXXXXXXX"
      const match = refText.match(/ref:\s*(\w+)/i);
      return match?.[1] ?? null;
    }
    return null;
  }

  /**
   * Navigate back to home
   */
  async goBackToHome(): Promise<void> {
    await this.form.backButton().click();
  }

  /**
   * Clear all form fields
   */
  async clearForm(): Promise<void> {
    await this.form.nameInput().clear();
    await this.form.emailInput().clear();
    await this.form.companyInput().clear();
    await this.form.subjectInput().clear();
    await this.form.messageTextarea().clear();
  }

  /**
   * Get current form values
   */
  async getFormValues(): Promise<Partial<ContactFormData>> {
    return {
      name: await this.form.nameInput().inputValue(),
      email: await this.form.emailInput().inputValue(),
      company: await this.form.companyInput().inputValue(),
      subject: await this.form.subjectInput().inputValue(),
      message: await this.form.messageTextarea().inputValue(),
    };
  }

  /**
   * Assert all required fields are present
   */
  async assertRequiredFieldsPresent(): Promise<void> {
    await expect(this.form.nameInput()).toHaveAttribute('required', '');
    await expect(this.form.emailInput()).toHaveAttribute('required', '');
    await expect(this.form.subjectInput()).toHaveAttribute('required', '');
    await expect(this.form.messageTextarea()).toHaveAttribute('required', '');
    // Company is optional
    await expect(this.form.companyInput()).not.toHaveAttribute('required', '');
  }
}
