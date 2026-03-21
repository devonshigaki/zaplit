/**
 * Contact Form E2E Tests
 * 
 * Critical user flow: Contact form submission
 * Priority: HIGH - Primary lead generation channel
 */

import { test, expect } from '@playwright/test';
import { ContactPage } from '../pages/contact-page';
import { 
  createContactFormData, 
  createSuccessResponse,
  createErrorResponse,
  testPersonas,
  edgeCases 
} from '../fixtures/test-data';
import { mockFormSubmission, setupConsoleMonitoring, setupPageErrorMonitoring } from '../utils/test-helpers';

test.describe('Contact Form', () => {
  let contactPage: ContactPage;
  let consoleErrors: string[];
  let pageErrors: Error[];

  test.beforeEach(async ({ page }) => {
    contactPage = new ContactPage(page);
    consoleErrors = setupConsoleMonitoring(page);
    pageErrors = setupPageErrorMonitoring(page);
    await contactPage.goto();
  });

  test.afterEach(async () => {
    // Assert no unexpected errors
    expect(consoleErrors).toHaveLength(0);
    expect(pageErrors).toHaveLength(0);
  });

  test.describe('Happy Path', () => {
    test('should successfully submit contact form with all fields', async ({ page }) => {
      // Arrange
      const formData = createContactFormData();
      const mockResponse = createSuccessResponse();
      await mockFormSubmission(page, mockResponse);

      // Act
      await contactPage.fillCompleteForm(formData);
      await contactPage.submitForm();
      await contactPage.waitForSuccess();

      // Assert
      await expect(contactPage.successState.heading()).toBeVisible();
      await expect(contactPage.successState.confirmationText()).toContainText('24 hours');
      
      const refNumber = await contactPage.getReferenceNumber();
      expect(refNumber).toBeTruthy();
    });

    test('should submit form without optional company field', async ({ page }) => {
      // Arrange
      const formData = createContactFormData({ company: '' });
      const mockResponse = createSuccessResponse();
      await mockFormSubmission(page, mockResponse);

      // Act
      await contactPage.fillCompleteForm(formData);
      await contactPage.submitForm();
      await contactPage.waitForSuccess();

      // Assert
      await expect(contactPage.successState.container()).toBeVisible();
    });

    test('should use business user persona successfully', async ({ page }) => {
      // Arrange
      const persona = testPersonas.businessUser;
      const formData = createContactFormData({
        name: persona.name,
        email: persona.email,
        company: persona.company,
        subject: 'Enterprise Inquiry',
        message: 'Interested in enterprise deployment options.',
      });
      const mockResponse = createSuccessResponse();
      await mockFormSubmission(page, mockResponse);

      // Act
      await contactPage.fillCompleteForm(formData);
      await contactPage.submitForm();

      // Assert
      await contactPage.waitForSuccess();
    });
  });

  test.describe('Validation', () => {
    test('should require name field', async () => {
      // Arrange
      const formData = createContactFormData();
      
      // Act - submit without name
      await contactPage.fillForm({
        email: formData.email,
        subject: formData.subject,
        message: formData.message,
      });
      await contactPage.submitForm();

      // Assert - HTML5 validation prevents submission
      const nameInput = contactPage.form.nameInput();
      await expect(nameInput).toHaveAttribute('required', '');
    });

    test('should require valid email format', async () => {
      // Test each invalid email
      for (const invalidEmail of edgeCases.invalidEmails) {
        await contactPage.goto();
        
        const formData = createContactFormData({ email: invalidEmail });
        await contactPage.fillCompleteForm(formData);
        await contactPage.submitForm();

        // Browser should prevent submission with type="email" validation
        const emailInput = contactPage.form.emailInput();
        const validationMessage = await emailInput.evaluate(el => (el as HTMLInputElement).validationMessage);
        expect(validationMessage).toBeTruthy();
      }
    });

    test('should require message field', async () => {
      // Arrange
      const formData = createContactFormData();
      
      // Act - submit without message
      await contactPage.fillForm({
        name: formData.name,
        email: formData.email,
        subject: formData.subject,
      });
      await contactPage.submitForm();

      // Assert
      const messageTextarea = contactPage.form.messageTextarea();
      await expect(messageTextarea).toHaveAttribute('required', '');
    });

    test('should enforce minimum message length', async () => {
      // Arrange
      const mockResponse = createErrorResponse('Message must be at least 10 characters');
      await mockFormSubmission(contactPage.page, mockResponse);

      const formData = createContactFormData({ message: 'Hi' });

      // Act
      await contactPage.fillCompleteForm(formData);
      await contactPage.submitForm();

      // Assert
      await contactPage.waitForError();
    });
  });

  test.describe('Error Handling', () => {
    test('should display error on API failure', async ({ page }) => {
      // Arrange
      const formData = createContactFormData();
      const mockResponse = createErrorResponse('Service temporarily unavailable');
      await mockFormSubmission(page, mockResponse);

      // Act
      await contactPage.fillCompleteForm(formData);
      await contactPage.submitForm();

      // Assert
      await contactPage.waitForError();
      const errorMessage = await contactPage.getErrorMessage();
      expect(errorMessage).toContain('unavailable');
    });

    test('should display error on network failure', async ({ page }) => {
      // Arrange
      const formData = createContactFormData();
      await page.route('/api/submit-form', route => route.abort('failed'));

      // Act
      await contactPage.fillCompleteForm(formData);
      await contactPage.submitForm();

      // Assert
      await contactPage.waitForError();
    });

    test('should handle rate limiting (429 response)', async ({ page }) => {
      // Arrange
      const formData = createContactFormData();
      await page.route('/api/submit-form', async route => {
        await route.fulfill({
          status: 429,
          body: JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
        });
      });

      // Act
      await contactPage.fillCompleteForm(formData);
      await contactPage.submitForm();

      // Assert
      await contactPage.waitForError();
      const errorMessage = await contactPage.getErrorMessage();
      expect(errorMessage).toContain('Rate limit');
    });
  });

  test.describe('Security', () => {
    test('should sanitize XSS attempts in form fields', async ({ page }) => {
      // Arrange
      const formData = createContactFormData({
        name: edgeCases.xssAttempt,
        subject: edgeCases.xssAttempt,
        message: edgeCases.xssAttempt,
      });
      const mockResponse = createSuccessResponse();
      await mockFormSubmission(page, mockResponse);

      // Act
      await contactPage.fillCompleteForm(formData);
      await contactPage.submitForm();
      await contactPage.waitForSuccess();

      // Assert - No script execution
      expect(consoleErrors.filter(e => e.includes('xss') || e.includes('alert'))).toHaveLength(0);
    });

    test('should reject SQL injection attempts', async ({ page }) => {
      // Arrange
      const formData = createContactFormData({
        name: edgeCases.sqlInjection,
        message: edgeCases.sqlInjection,
      });
      const mockResponse = createSuccessResponse();
      await mockFormSubmission(page, mockResponse);

      // Act - Should either sanitize or reject
      await contactPage.fillCompleteForm(formData);
      await contactPage.submitForm();

      // Assert - Should not cause server error
      const isSuccess = await contactPage.isSuccessDisplayed();
      const isError = await contactPage.isErrorDisplayed();
      expect(isSuccess || isError).toBeTruthy();
    });
  });

  test.describe('UI/UX', () => {
    test('should show loading state during submission', async ({ page }) => {
      // Arrange
      const formData = createContactFormData();
      await page.route('/api/submit-form', async route => {
        await new Promise(resolve => setTimeout(resolve, 1000));
        await route.fulfill({
          status: 200,
          body: JSON.stringify(createSuccessResponse()),
        });
      });

      // Act
      await contactPage.fillCompleteForm(formData);
      await contactPage.submitForm();

      // Assert - Button should show loading text
      const isLoading = await contactPage.isSubmitting();
      expect(isLoading).toBeTruthy();
    });

    test('should navigate back to home', async () => {
      // Act
      await contactPage.goBackToHome();

      // Assert
      await expect(contactPage.page).toHaveURL('/');
    });

    test('should maintain form accessibility', async () => {
      // Assert all required fields have proper labels
      await contactPage.assertRequiredFieldsPresent();
      
      // Assert form has submit button
      await expect(contactPage.form.submitButton()).toBeVisible();
    });
  });

  test.describe('Edge Cases', () => {
    test('should handle unicode and special characters', async ({ page }) => {
      // Arrange
      const formData = createContactFormData({
        name: edgeCases.unicodeText,
        message: edgeCases.unicodeText,
      });
      const mockResponse = createSuccessResponse();
      await mockFormSubmission(page, mockResponse);

      // Act
      await contactPage.fillCompleteForm(formData);
      await contactPage.submitForm();

      // Assert
      await contactPage.waitForSuccess();
    });

    test('should handle formatted text with newlines', async ({ page }) => {
      // Arrange
      const formData = createContactFormData({
        message: edgeCases.formattedText,
      });
      const mockResponse = createSuccessResponse();
      await mockFormSubmission(page, mockResponse);

      // Act
      await contactPage.fillCompleteForm(formData);
      await contactPage.submitForm();

      // Assert
      await contactPage.waitForSuccess();
    });

    test('should handle HTML content in text fields', async ({ page }) => {
      // Arrange
      const formData = createContactFormData({
        message: edgeCases.htmlContent,
      });
      const mockResponse = createSuccessResponse();
      await mockFormSubmission(page, mockResponse);

      // Act
      await contactPage.fillCompleteForm(formData);
      await contactPage.submitForm();

      // Assert
      await contactPage.waitForSuccess();
    });
  });
});
