/**
 * Newsletter Signup E2E Tests
 * 
 * Critical user flow: Newsletter subscription
 * Priority: MEDIUM - Lead nurturing channel
 */

import { test, expect } from '@playwright/test';
import { HomePage } from '../pages/home-page';
import { NewsletterComponent } from '../pages/newsletter-component';
import { 
  createNewsletterFormData, 
  createSuccessResponse,
  edgeCases 
} from '../fixtures/test-data';
import { mockFormSubmission, setupConsoleMonitoring } from '../utils/test-helpers';

test.describe('Newsletter Signup', () => {
  let homePage: HomePage;
  let newsletter: NewsletterComponent;
  let consoleErrors: string[];

  test.beforeEach(async ({ page }) => {
    homePage = new HomePage(page);
    newsletter = new NewsletterComponent(page);
    consoleErrors = setupConsoleMonitoring(page);
    await homePage.goto();
  });

  test.afterEach(async () => {
    expect(consoleErrors).toHaveLength(0);
  });

  test.describe('Happy Path', () => {
    test('should subscribe to newsletter successfully', async ({ page }) => {
      // Arrange
      const formData = createNewsletterFormData();
      const mockResponse = createSuccessResponse();
      await mockFormSubmission(page, mockResponse);

      // Act
      await newsletter.fillAndSubmit(formData);

      // Assert
      await newsletter.waitForSuccess();
    });

    test('should handle valid business email', async ({ page }) => {
      // Arrange
      const formData = createNewsletterFormData({ 
        email: 'developer@techcompany.com' 
      });
      const mockResponse = createSuccessResponse();
      await mockFormSubmission(page, mockResponse);

      // Act
      await newsletter.fillAndSubmit(formData);

      // Assert
      await newsletter.waitForSuccess();
    });
  });

  test.describe('Validation', () => {
    test('should reject invalid email formats', async () => {
      for (const invalidEmail of edgeCases.invalidEmails) {
        if (!invalidEmail) continue; // Skip empty string
        
        await homePage.goto();
        
        // Act
        await newsletter.fillEmail(invalidEmail);
        await newsletter.submit();

        // Assert - Browser validation should prevent submission
        const emailInput = newsletter.getEmailInput();
        const validationMessage = await emailInput.evaluate(el => 
          (el as HTMLInputElement).validationMessage
        );
        expect(validationMessage).toBeTruthy();
      }
    });

    test('should reject empty email', async () => {
      await newsletter.submit();
      
      const emailInput = newsletter.getEmailInput();
      const validationMessage = await emailInput.evaluate(el => 
        (el as HTMLInputElement).validationMessage
      );
      expect(validationMessage).toBeTruthy();
    });
  });

  test.describe('Error Handling', () => {
    test('should handle API error gracefully', async ({ page }) => {
      // Arrange
      const formData = createNewsletterFormData();
      await page.route('/api/submit-form', async route => {
        await route.fulfill({
          status: 400,
          body: JSON.stringify({ 
            success: false, 
            error: 'Subscription failed' 
          }),
        });
      });

      // Act
      await newsletter.fillAndSubmit(formData);

      // Assert
      await newsletter.waitForError();
    });

    test('should handle network error', async ({ page }) => {
      // Arrange
      const formData = createNewsletterFormData();
      await page.route('/api/submit-form', route => route.abort('failed'));

      // Act
      await newsletter.fillAndSubmit(formData);

      // Assert
      await newsletter.waitForError();
    });

    test('should handle duplicate subscription', async ({ page }) => {
      // Arrange
      const formData = createNewsletterFormData();
      await page.route('/api/submit-form', async route => {
        await route.fulfill({
          status: 409,
          body: JSON.stringify({ 
            success: false, 
            error: 'Email already subscribed' 
          }),
        });
      });

      // Act
      await newsletter.fillAndSubmit(formData);

      // Assert
      await newsletter.waitForError();
    });
  });

  test.describe('Security', () => {
    test('should sanitize XSS in email field', async ({ page }) => {
      // Arrange
      const formData = { email: `test+${edgeCases.xssAttempt}@example.com` };
      const mockResponse = createSuccessResponse();
      await mockFormSubmission(page, mockResponse);

      // Act
      await newsletter.fillEmail(formData.email);
      await newsletter.submit();

      // Assert
      expect(consoleErrors.filter(e => e.includes('xss'))).toHaveLength(0);
    });
  });

  test.describe('UI/UX', () => {
    test('should show loading state during submission', async ({ page }) => {
      // Arrange
      const formData = createNewsletterFormData();
      await page.route('/api/submit-form', async route => {
        await new Promise(resolve => setTimeout(resolve, 1000));
        await route.fulfill({
          status: 200,
          body: JSON.stringify(createSuccessResponse()),
        });
      });

      // Act
      await newsletter.fillEmail(formData.email);
      await newsletter.submit();

      // Assert - Button should be in loading state
      const submitButton = newsletter.getSubmitButton();
      await expect(submitButton).toBeDisabled();
    });

    test('should have accessible form elements', async () => {
      const emailInput = newsletter.getEmailInput();
      const submitButton = newsletter.getSubmitButton();

      await expect(emailInput).toHaveAttribute('type', 'email');
      await expect(submitButton).toBeVisible();
    });
  });
});
