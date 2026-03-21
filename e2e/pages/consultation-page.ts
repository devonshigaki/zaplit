/**
 * Consultation/Demo Booking Page Object Model
 * 
 * Represents the multi-step consultation form in the book-demo section.
 */

import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './base-page';
import type { ConsultationFormData } from '../fixtures/test-data';

export class ConsultationPage extends BasePage {
  readonly url = '/#book-demo';

  // Step indicators
  readonly steps = {
    indicator: () => this.page.locator('.flex-1.h-px').first().locator('..'),
    step1: () => this.page.getByText('Contact', { exact: false }),
    step2: () => this.page.getByText('Tech stack', { exact: false }),
    step3: () => this.page.getByText('Security', { exact: false }),
  };

  // Step 1: Contact Information
  readonly step1 = {
    container: () => this.page.getByText('Contact information', { exact: false }),
    nameInput: () => this.page.locator('input#name'),
    roleInput: () => this.page.locator('input#role'),
    companyInput: () => this.page.locator('input#company'),
    emailInput: () => this.page.locator('input#email'),
    teamSizeButtons: {
      '1–10': () => this.page.getByRole('button', { name: '1–10', exact: true }),
      '11–50': () => this.page.getByRole('button', { name: '11–50', exact: true }),
      '51–200': () => this.page.getByRole('button', { name: '51–200', exact: true }),
      '200+': () => this.page.getByRole('button', { name: '200+', exact: true }),
    },
  };

  // Step 2: Tech Stack
  readonly step2 = {
    container: () => this.page.getByText('Current tech stack', { exact: false }),
    categories: {
      CRM: (tool: string) => this.page.locator('.grid', { hasText: 'CRM' }).getByRole('button', { name: tool }),
      Communication: (tool: string) => this.page.locator('.grid', { hasText: 'Communication' }).getByRole('button', { name: tool }),
      Finance: (tool: string) => this.page.locator('.grid', { hasText: 'Finance' }).getByRole('button', { name: tool }),
      Productivity: (tool: string) => this.page.locator('.grid', { hasText: 'Productivity' }).getByRole('button', { name: tool }),
      Support: (tool: string) => this.page.locator('.grid', { hasText: 'Support' }).getByRole('button', { name: tool }),
      Infrastructure: (tool: string) => this.page.locator('.grid', { hasText: 'Infrastructure' }).getByRole('button', { name: tool }),
    },
  };

  // Step 3: Security & Compliance
  readonly step3 = {
    container: () => this.page.getByText('Security & compliance', { exact: false }),
    securityLevel: {
      standard: () => this.page.getByRole('button', { name: /standard/i }).filter({ hasText: 'Isolation' }),
      high: () => this.page.getByRole('button', { name: /high/i }).filter({ hasText: 'logged' }),
      enterprise: () => this.page.getByRole('button', { name: /enterprise/i }).filter({ hasText: 'Custom' }),
    },
    compliance: {
      soc2: () => this.page.getByRole('button', { name: /SOC 2/i }),
      gdpr: () => this.page.getByRole('button', { name: /GDPR/i }),
      hipaa: () => this.page.getByRole('button', { name: /HIPAA/i }),
      pci: () => this.page.getByRole('button', { name: /PCI-DSS/i }),
    },
    messageTextarea: () => this.page.locator('textarea').first(),
  };

  // Navigation buttons
  readonly navigation = {
    backButton: () => this.page.getByRole('button', { name: /back/i }),
    continueButton: () => this.page.getByRole('button', { name: /continue/i }),
    submitButton: () => this.page.getByRole('button', { name: /submit request/i }),
  };

  // Success state
  readonly successState = {
    container: () => this.page.getByText('Request received', { exact: false }),
    heading: () => this.page.getByRole('heading', { name: /request received/i }),
    confirmationEmail: () => this.page.locator('span.font-mono').first(),
    summaryCard: () => this.page.getByText('Summary', { exact: false }),
    referenceNumber: () => this.page.getByText(/reference:/i),
  };

  // Error state
  readonly errorState = {
    alert: () => this.page.locator('[role="alert"]'),
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
    await expect(this.step1.container()).toBeVisible();
  }

  /**
   * Get current step number
   */
  async getCurrentStep(): Promise<number> {
    // Check which step container is visible
    if (await this.step1.container().isVisible().catch(() => false)) return 1;
    if (await this.step2.container().isVisible().catch(() => false)) return 2;
    if (await this.step3.container().isVisible().catch(() => false)) return 3;
    return 0;
  }

  /**
   * Fill Step 1: Contact Information
   */
  async fillStep1(data: Partial<ConsultationFormData>): Promise<void> {
    if (data.name) {
      await this.step1.nameInput().fill(data.name);
    }
    if (data.role) {
      await this.step1.roleInput().fill(data.role);
    }
    if (data.company) {
      await this.step1.companyInput().fill(data.company);
    }
    if (data.email) {
      await this.step1.emailInput().fill(data.email);
    }
    if (data.teamSize) {
      await this.step1.teamSizeButtons[data.teamSize].click();
    }
  }

  /**
   * Fill Step 2: Tech Stack (select at least 3 categories)
   */
  async fillStep2(techStack: Record<string, string>): Promise<void> {
    for (const [category, tool] of Object.entries(techStack)) {
      const categoryKey = category as keyof typeof this.step2.categories;
      if (this.step2.categories[categoryKey]) {
        await this.step2.categories[categoryKey](tool).click();
      }
    }
  }

  /**
   * Fill Step 3: Security & Compliance
   */
  async fillStep3(data: Partial<ConsultationFormData>): Promise<void> {
    if (data.securityLevel) {
      await this.step3.securityLevel[data.securityLevel].click();
    }
    if (data.compliance) {
      for (const compliance of data.compliance) {
        const key = compliance.toLowerCase() as keyof typeof this.step3.compliance;
        if (this.step3.compliance[key]) {
          await this.step3.compliance[key]().click();
        }
      }
    }
    if (data.message) {
      await this.step3.messageTextarea().fill(data.message);
    }
  }

  /**
   * Click Continue button to proceed to next step
   */
  async clickContinue(): Promise<void> {
    await this.navigation.continueButton().click();
  }

  /**
   * Click Back button to return to previous step
   */
  async clickBack(): Promise<void> {
    await this.navigation.backButton().click();
  }

  /**
   * Submit the consultation request
   */
  async submitForm(): Promise<void> {
    await this.navigation.submitButton().click();
  }

  /**
   * Complete the entire multi-step form
   */
  async completeFullForm(data: ConsultationFormData): Promise<void> {
    // Step 1
    await this.fillStep1(data);
    await this.clickContinue();
    
    // Step 2
    await this.fillStep2(data.techStack);
    await this.clickContinue();
    
    // Step 3
    await this.fillStep3(data);
    await this.submitForm();
  }

  /**
   * Check if can proceed to next step
   */
  async canProceed(): Promise<boolean> {
    const continueButton = this.navigation.continueButton();
    return await continueButton.isEnabled();
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
   * Get confirmation email shown in success message
   */
  async getConfirmationEmail(): Promise<string | null> {
    return this.successState.confirmationEmail().textContent();
  }

  /**
   * Get reference number from success message
   */
  async getReferenceNumber(): Promise<string | null> {
    const refText = await this.successState.referenceNumber().textContent();
    if (refText) {
      const match = refText.match(/reference:\s*(\w+)/i);
      return match?.[1] ?? null;
    }
    return null;
  }

  /**
   * Assert all steps are accessible
   */
  async assertStepsAccessible(): Promise<void> {
    // Complete step 1 with valid data
    await this.step1.nameInput().fill('Test User');
    await this.step1.roleInput().fill('Developer');
    await this.step1.companyInput().fill('Test Company');
    await this.step1.emailInput().fill('test@example.com');
    await this.step1.teamSizeButtons['11–50']().click();
    
    // Navigate through all steps
    await this.clickContinue();
    await expect(this.step2.container()).toBeVisible();
    
    // Fill step 2
    await this.step2.categories.CRM('Salesforce').click();
    await this.step2.categories.Communication('Slack').click();
    await this.step2.categories.Productivity('Notion').click();
    
    await this.clickContinue();
    await expect(this.step3.container()).toBeVisible();
    
    // Can go back
    await this.clickBack();
    await expect(this.step2.container()).toBeVisible();
    
    await this.clickBack();
    await expect(this.step1.container()).toBeVisible();
  }
}
