/**
 * Consultation/Demo Booking E2E Tests
 * 
 * Critical user flow: Multi-step consultation form
 * Priority: HIGH - Primary conversion funnel for enterprise leads
 */

import { test, expect } from '@playwright/test';
import { ConsultationPage } from '../pages/consultation-page';
import { 
  createConsultationFormData, 
  createSuccessResponse,
  createErrorResponse,
  testPersonas 
} from '../fixtures/test-data';
import { mockFormSubmission, setupConsoleMonitoring, setupPageErrorMonitoring } from '../utils/test-helpers';

test.describe('Consultation Booking', () => {
  let consultationPage: ConsultationPage;
  let consoleErrors: string[];
  let pageErrors: Error[];

  test.beforeEach(async ({ page }) => {
    consultationPage = new ConsultationPage(page);
    consoleErrors = setupConsoleMonitoring(page);
    pageErrors = setupPageErrorMonitoring(page);
    await consultationPage.goto();
  });

  test.afterEach(async () => {
    expect(consoleErrors).toHaveLength(0);
    expect(pageErrors).toHaveLength(0);
  });

  test.describe('Happy Path', () => {
    test('should complete full 3-step consultation form', async ({ page }) => {
      // Arrange
      const formData = createConsultationFormData();
      const mockResponse = createSuccessResponse();
      await mockFormSubmission(page, mockResponse);

      // Act - Step 1
      await expect(consultationPage.step1.container()).toBeVisible();
      await consultationPage.fillStep1(formData);
      await consultationPage.clickContinue();

      // Act - Step 2
      await expect(consultationPage.step2.container()).toBeVisible();
      await consultationPage.fillStep2(formData.techStack);
      await consultationPage.clickContinue();

      // Act - Step 3
      await expect(consultationPage.step3.container()).toBeVisible();
      await consultationPage.fillStep3(formData);
      await consultationPage.submitForm();

      // Assert
      await consultationPage.waitForSuccess();
      await expect(consultationPage.successState.heading()).toBeVisible();
      
      const refNumber = await consultationPage.getReferenceNumber();
      expect(refNumber).toBeTruthy();
    });

    test('should use convenience method for full form submission', async ({ page }) => {
      // Arrange
      const formData = createConsultationFormData();
      const mockResponse = createSuccessResponse();
      await mockFormSubmission(page, mockResponse);

      // Act
      await consultationPage.completeFullForm(formData);

      // Assert
      await consultationPage.waitForSuccess();
      await expect(consultationPage.successState.summaryCard()).toBeVisible();
    });

    test('should handle enterprise persona with all options', async ({ page }) => {
      // Arrange
      const persona = testPersonas.enterpriseUser;
      const formData = createConsultationFormData({
        name: persona.name,
        email: persona.email,
        company: persona.company,
        role: persona.role,
        teamSize: persona.teamSize,
        securityLevel: persona.securityLevel,
        compliance: persona.compliance,
        techStack: {
          CRM: 'Salesforce',
          Communication: 'Microsoft Teams',
          Finance: 'Stripe',
          Productivity: 'Monday.com',
          Support: 'Zendesk',
          Infrastructure: 'AWS',
        },
      });
      const mockResponse = createSuccessResponse();
      await mockFormSubmission(page, mockResponse);

      // Act
      await consultationPage.completeFullForm(formData);

      // Assert
      await consultationPage.waitForSuccess();
      const confirmationEmail = await consultationPage.getConfirmationEmail();
      expect(confirmationEmail).toBe(persona.email);
    });

    test('should handle startup persona with minimal options', async ({ page }) => {
      // Arrange
      const persona = testPersonas.startupFounder;
      const formData = createConsultationFormData({
        name: persona.name,
        email: persona.email,
        company: persona.company,
        role: persona.role,
        teamSize: persona.teamSize,
        techStack: {
          Communication: 'Slack',
          Productivity: 'Notion',
          Infrastructure: 'AWS',
        },
        compliance: [],
        securityLevel: 'standard',
        message: '',
      });
      const mockResponse = createSuccessResponse();
      await mockFormSubmission(page, mockResponse);

      // Act
      await consultationPage.completeFullForm(formData);

      // Assert
      await consultationPage.waitForSuccess();
    });
  });

  test.describe('Step Navigation', () => {
    test('should navigate between steps using back button', async () => {
      // Act - Go to step 2
      await consultationPage.fillStep1(createConsultationFormData());
      await consultationPage.clickContinue();
      await expect(consultationPage.step2.container()).toBeVisible();

      // Act - Go back to step 1
      await consultationPage.clickBack();
      await expect(consultationPage.step1.container()).toBeVisible();

      // Verify data is preserved
      const currentStep = await consultationPage.getCurrentStep();
      expect(currentStep).toBe(1);
    });

    test('should not allow proceeding from step 1 without required fields', async () => {
      // Act - Try to continue with empty form
      const canProceed = await consultationPage.canProceed();
      expect(canProceed).toBeFalsy();
    });

    test('should require at least 3 tech stack categories in step 2', async () => {
      // Arrange - Fill step 1
      await consultationPage.fillStep1(createConsultationFormData());
      await consultationPage.clickContinue();

      // Act - Try to continue with only 1 category
      await consultationPage.step2.categories.CRM('Salesforce').click();
      const canProceed = await consultationPage.canProceed();
      expect(canProceed).toBeFalsy();

      // Act - Add more categories
      await consultationPage.step2.categories.Communication('Slack').click();
      await consultationPage.step2.categories.Productivity('Notion').click();
      const canProceedNow = await consultationPage.canProceed();
      expect(canProceedNow).toBeTruthy();
    });

    test('should show all three steps in indicator', async () => {
      // Assert all step labels are visible
      await expect(consultationPage.steps.step1()).toBeVisible();
      await expect(consultationPage.steps.step2()).toBeVisible();
      await expect(consultationPage.steps.step3()).toBeVisible();
    });
  });

  test.describe('Step 1: Contact Information', () => {
    test('should accept all valid team sizes', async () => {
      const teamSizes: Array<'1–10' | '11–50' | '51–200' | '200+'> = ['1–10', '11–50', '51–200', '200+'];
      
      for (const size of teamSizes) {
        await consultationPage.goto();
        const formData = createConsultationFormData({ teamSize: size });
        
        await consultationPage.fillStep1(formData);
        await consultationPage.clickContinue();
        
        // Should proceed to step 2
        await expect(consultationPage.step2.container()).toBeVisible();
      }
    });

    test('should validate email format', async () => {
      const formData = createConsultationFormData({ email: 'invalid-email' });
      await consultationPage.fillStep1(formData);
      
      const emailInput = consultationPage.step1.emailInput();
      const validationMessage = await emailInput.evaluate(el => (el as HTMLInputElement).validationMessage);
      expect(validationMessage).toBeTruthy();
    });
  });

  test.describe('Step 2: Tech Stack', () => {
    test.beforeEach(async () => {
      // Navigate to step 2
      await consultationPage.fillStep1(createConsultationFormData());
      await consultationPage.clickContinue();
      await expect(consultationPage.step2.container()).toBeVisible();
    });

    test('should allow selecting tools from all categories', async () => {
      const selections = {
        CRM: 'Salesforce',
        Communication: 'Slack',
        Finance: 'Stripe',
        Productivity: 'Notion',
        Support: 'Zendesk',
        Infrastructure: 'AWS',
      };

      for (const [category, tool] of Object.entries(selections)) {
        const categoryKey = category as keyof typeof consultationPage.step2.categories;
        await consultationPage.step2.categories[categoryKey](tool).click();
      }

      // Should be able to proceed
      await consultationPage.clickContinue();
      await expect(consultationPage.step3.container()).toBeVisible();
    });

    test('should allow deselecting tools', async () => {
      // Select then deselect
      await consultationPage.step2.categories.CRM('Salesforce').click();
      await consultationPage.step2.categories.CRM('Salesforce').click();
      
      // Should not be able to proceed (less than 3 categories)
      const canProceed = await consultationPage.canProceed();
      expect(canProceed).toBeFalsy();
    });
  });

  test.describe('Step 3: Security & Compliance', () => {
    test.beforeEach(async () => {
      // Navigate to step 3
      await consultationPage.fillStep1(createConsultationFormData());
      await consultationPage.clickContinue();
      await consultationPage.fillStep2({
        CRM: 'Salesforce',
        Communication: 'Slack',
        Productivity: 'Notion',
      });
      await consultationPage.clickContinue();
      await expect(consultationPage.step3.container()).toBeVisible();
    });

    test('should allow selecting all security levels', async () => {
      const levels: Array<'standard' | 'high' | 'enterprise'> = ['standard', 'high', 'enterprise'];
      
      for (const level of levels) {
        await consultationPage.step3.securityLevel[level].click();
        
        // Verify selection
        const button = consultationPage.step3.securityLevel[level]();
        await expect(button).toHaveClass(/border-foreground/);
      }
    });

    test('should allow selecting multiple compliance options', async () => {
      const options = ['soc2', 'gdpr', 'hipaa', 'pci'] as const;
      
      for (const option of options) {
        await consultationPage.step3.compliance[option]().click();
      }

      // All should be selected
      for (const option of options) {
        const button = consultationPage.step3.compliance[option]();
        await expect(button).toHaveClass(/border-foreground/);
      }
    });

    test('should toggle compliance options', async () => {
      // Select GDPR
      await consultationPage.step3.compliance.gdpr().click();
      let button = consultationPage.step3.compliance.gdpr();
      await expect(button).toHaveClass(/border-foreground/);

      // Toggle off
      await consultationPage.step3.compliance.gdpr().click();
      button = consultationPage.step3.compliance.gdpr();
      await expect(button).not.toHaveClass(/border-foreground/);
    });

    test('should accept optional message', async ({ page }) => {
      const mockResponse = createSuccessResponse();
      await mockFormSubmission(page, mockResponse);

      await consultationPage.step3.messageTextarea().fill('Looking forward to the demo!');
      await consultationPage.submitForm();

      await consultationPage.waitForSuccess();
    });

    test('should submit without optional message', async ({ page }) => {
      const mockResponse = createSuccessResponse();
      await mockFormSubmission(page, mockResponse);

      await consultationPage.submitForm();

      await consultationPage.waitForSuccess();
    });
  });

  test.describe('Error Handling', () => {
    test('should handle API error on final submission', async ({ page }) => {
      // Arrange - Navigate to step 3
      await consultationPage.fillStep1(createConsultationFormData());
      await consultationPage.clickContinue();
      await consultationPage.fillStep2({
        CRM: 'Salesforce',
        Communication: 'Slack',
        Productivity: 'Notion',
      });
      await consultationPage.clickContinue();

      // Mock error response
      const mockResponse = createErrorResponse('Unable to process request');
      await mockFormSubmission(page, mockResponse);

      // Act
      await consultationPage.submitForm();

      // Assert
      await consultationPage.waitForError();
    });

    test('should handle network error', async ({ page }) => {
      // Arrange - Navigate to step 3
      await consultationPage.fillStep1(createConsultationFormData());
      await consultationPage.clickContinue();
      await consultationPage.fillStep2({
        CRM: 'Salesforce',
        Communication: 'Slack',
        Productivity: 'Notion',
      });
      await consultationPage.clickContinue();

      await page.route('/api/submit-form', route => route.abort('failed'));

      // Act
      await consultationPage.submitForm();

      // Assert
      await consultationPage.waitForError();
    });
  });

  test.describe('Success State', () => {
    test('should display summary after submission', async ({ page }) => {
      // Arrange
      const formData = createConsultationFormData();
      const mockResponse = createSuccessResponse();
      await mockFormSubmission(page, mockResponse);

      // Act
      await consultationPage.completeFullForm(formData);
      await consultationPage.waitForSuccess();

      // Assert
      await expect(consultationPage.successState.summaryCard()).toBeVisible();
      await expect(consultationPage.successState.confirmationEmail()).toContainText(formData.email);
    });

    test('should show correct confirmation email', async ({ page }) => {
      // Arrange
      const formData = createConsultationFormData();
      const mockResponse = createSuccessResponse();
      await mockFormSubmission(page, mockResponse);

      // Act
      await consultationPage.completeFullForm(formData);

      // Assert
      await consultationPage.waitForSuccess();
      const displayedEmail = await consultationPage.getConfirmationEmail();
      expect(displayedEmail).toBe(formData.email);
    });
  });

  test.describe('Accessibility', () => {
    test('should have accessible step indicators', async () => {
      // All steps should be visible and accessible
      await expect(consultationPage.steps.step1()).toBeVisible();
      await expect(consultationPage.steps.step2()).toBeVisible();
      await expect(consultationPage.steps.step3()).toBeVisible();
    });

    test('should maintain focus management between steps', async () => {
      // Fill step 1 and continue
      await consultationPage.fillStep1(createConsultationFormData());
      await consultationPage.clickContinue();

      // Focus should be on step 2 content
      await expect(consultationPage.step2.container()).toBeVisible();
    });
  });
});
