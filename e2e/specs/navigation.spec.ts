/**
 * Navigation and Theme E2E Tests
 * 
 * Critical user flow: Navigation between pages and mobile responsive design
 * Priority: HIGH - Core user experience
 */

import { test, expect } from '@playwright/test';
import { HomePage } from '../pages/home-page';
import { ContactPage } from '../pages/contact-page';
import { setupConsoleMonitoring, setupPageErrorMonitoring } from '../utils/test-helpers';

test.describe('Navigation', () => {
  let homePage: HomePage;
  let consoleErrors: string[];
  let pageErrors: Error[];

  test.beforeEach(async ({ page }) => {
    homePage = new HomePage(page);
    consoleErrors = setupConsoleMonitoring(page);
    pageErrors = setupPageErrorMonitoring(page);
    await homePage.goto();
  });

  test.afterEach(async () => {
    expect(consoleErrors).toHaveLength(0);
    expect(pageErrors).toHaveLength(0);
  });

  test.describe('Desktop Navigation', () => {
    test('should display all navigation links', async () => {
      // Assert
      await expect(homePage.navLinks.agents()).toBeVisible();
      await expect(homePage.navLinks.solutions()).toBeVisible();
      await expect(homePage.navLinks.security()).toBeVisible();
      await expect(homePage.navLinks.plans()).toBeVisible();
      await expect(homePage.navLinks.calculator()).toBeVisible();
      await expect(homePage.navLinks.faq()).toBeVisible();
    });

    test('should navigate to sections via anchor links', async () => {
      const sections = ['agents', 'solutions', 'security', 'plans', 'calculator', 'faq'] as const;

      for (const section of sections) {
        await homePage.navigateToSection(section);
        
        // Verify section is in viewport
        const sectionElement = homePage.sections[section]();
        await expect(sectionElement).toBeVisible();
        
        // Verify URL contains hash
        await expect(homePage.page).toHaveURL(new RegExp(`#${section}`));
      }
    });

    test('should navigate to book demo section', async () => {
      await homePage.clickBookDemoNav();
      
      await expect(homePage.sections.bookDemo()).toBeVisible();
      await expect(homePage.page).toHaveURL(/#book-demo/);
    });

    test('should navigate to contact page', async () => {
      await homePage.clickNavLink(/contact/i);
      
      await expect(homePage.page).toHaveURL(/contact/);
      await expect(homePage.page).toHaveTitle(/Contact/i);
    });

    test('should navigate to other pages', async () => {
      const pages = [
        { link: /about/i, url: /about/, title: /about/i },
        { link: /blog/i, url: /blog/, title: /blog|zaplit/i },
        { link: /careers/i, url: /careers/, title: /careers|zaplit/i },
      ];

      for (const page of pages) {
        await homePage.goto();
        await homePage.clickNavLink(page.link);
        await expect(homePage.page).toHaveURL(page.url);
      }
    });

    test('should have working footer links', async () => {
      // Check footer navigation
      const footer = homePage.getFooter();
      await expect(footer).toBeVisible();
      
      // Privacy link
      const privacyLink = footer.getByRole('link', { name: /privacy/i });
      await expect(privacyLink).toBeVisible();
      
      // Terms link
      const termsLink = footer.getByRole('link', { name: /terms/i });
      await expect(termsLink).toBeVisible();
    });
  });

  test.describe('Mobile Navigation', () => {
    test.use({ viewport: { width: 375, height: 667 } });

    test('should show hamburger menu on mobile', async () => {
      await expect(homePage.mobileMenuButton()).toBeVisible();
      
      // Desktop nav links should be hidden
      await expect(homePage.navLinks.agents()).not.toBeVisible();
    });

    test('should open mobile menu', async () => {
      await homePage.openMobileMenu();
      
      // Nav links should be visible in mobile menu
      await expect(homePage.page.getByRole('link', { name: 'Agents' })).toBeVisible();
      await expect(homePage.page.getByRole('link', { name: 'Solutions' })).toBeVisible();
      await expect(homePage.page.getByRole('button', { name: /book demo/i })).toBeVisible();
    });

    test('should navigate via mobile menu', async () => {
      await homePage.openMobileMenu();
      
      const agentsLink = homePage.page.getByRole('link', { name: 'Agents' });
      await agentsLink.click();
      
      await expect(homePage.sections.agents()).toBeVisible();
    });

    test('should close mobile menu when navigating', async () => {
      await homePage.openMobileMenu();
      
      // Click a link
      await homePage.page.getByRole('link', { name: 'Agents' }).click();
      
      // Menu should close (hamburger button should still be visible)
      await expect(homePage.mobileMenuButton()).toBeVisible();
    });

    test('should close mobile menu manually', async () => {
      await homePage.openMobileMenu();
      await homePage.closeMobileMenu();
      
      // Menu items should no longer be visible
      await expect(homePage.page.getByRole('link', { name: 'Agents' })).not.toBeVisible();
    });
  });

  test.describe('Theme Toggle', () => {
    test('should toggle between light and dark theme', async () => {
      // Check initial theme (should be dark based on layout.tsx)
      const initialTheme = await homePage.getTheme();
      expect(initialTheme).toBe('dark');

      // Toggle to light
      await homePage.toggleTheme();
      const lightTheme = await homePage.getTheme();
      expect(lightTheme).toBe('light');

      // Toggle back to dark
      await homePage.toggleTheme();
      const darkTheme = await homePage.getTheme();
      expect(darkTheme).toBe('dark');
    });

    test('should set specific theme', async () => {
      await homePage.setTheme('light');
      expect(await homePage.getTheme()).toBe('light');

      await homePage.setTheme('dark');
      expect(await homePage.getTheme()).toBe('dark');
    });

    test('should persist theme across page navigation', async () => {
      // Set light theme
      await homePage.setTheme('light');
      
      // Navigate to contact page
      const contactPage = new ContactPage(homePage.page);
      await contactPage.goto();
      
      // Theme should still be light
      const theme = await homePage.getTheme();
      expect(theme).toBe('light');
    });

    test('should have accessible theme toggle button', async () => {
      const themeButton = homePage.themeToggle();
      await expect(themeButton).toHaveAttribute('aria-label', /toggle theme/i);
    });
  });

  test.describe('Responsive Design', () => {
    test('should render correctly on desktop', async () => {
      // All sections should be visible
      await homePage.assertAllSectionsVisible();
      
      // Desktop navigation should be visible
      await expect(homePage.navLinks.agents()).toBeVisible();
    });

    test('should render correctly on tablet', async ({ page }) => {
      await page.setViewportSize({ width: 768, height: 1024 });
      
      // Page should still be functional
      await homePage.assertAllSectionsVisible();
    });

    test('should render correctly on mobile', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      
      // Sections should be visible
      await homePage.assertAllSectionsVisible();
      
      // Mobile menu button should be visible
      await expect(homePage.mobileMenuButton()).toBeVisible();
    });

    test('should handle orientation change', async ({ page }) => {
      // Start in portrait
      await page.setViewportSize({ width: 375, height: 667 });
      await expect(homePage.heroSection.headline()).toBeVisible();

      // Change to landscape
      await page.setViewportSize({ width: 667, height: 375 });
      await expect(homePage.heroSection.headline()).toBeVisible();
    });
  });

  test.describe('Page Sections', () => {
    test('should have all main sections', async () => {
      const sections = [
        'security',
        'agents',
        'solutions',
        'plans',
        'calculator',
        'faq',
        'bookDemo',
      ] as const;

      for (const section of sections) {
        const element = homePage.sections[section]();
        await expect(element, `Section ${section} should exist`).toBeVisible();
      }
    });

    test('should scroll smoothly to sections', async () => {
      await homePage.scrollThroughSections();
    });

    test('should have hero section with CTA', async () => {
      await expect(homePage.heroSection.headline()).toBeVisible();
      await expect(homePage.heroSection.ctaButton()).toBeVisible();
    });
  });

  test.describe('SEO and Metadata', () => {
    test('should have correct page title', async () => {
      await homePage.assertMetadata();
    });

    test('should have proper heading structure', async () => {
      // Should have exactly one h1
      const h1s = await homePage.page.locator('h1').count();
      expect(h1s).toBe(1);

      // Headings should be in order (no skipped levels)
      const headings = await homePage.page.locator('h1, h2, h3, h4, h5, h6').all();
      let lastLevel = 0;
      for (const heading of headings) {
        const level = parseInt(await heading.evaluate(el => el.tagName[1]));
        expect(level).toBeGreaterThanOrEqual(lastLevel);
        expect(level).toBeLessThanOrEqual(lastLevel + 1);
        lastLevel = level;
      }
    });

    test('should have meta description', async () => {
      const metaDescription = homePage.page.locator('meta[name="description"]');
      expect(await metaDescription.count()).toBeGreaterThan(0);
    });
  });

  test.describe('Accessibility', () => {
    test('should have skip link', async () => {
      const skipLink = homePage.page.getByRole('link', { name: /skip/i });
      await expect(skipLink).toBeVisible();
    });

    test('should have proper landmark regions', async () => {
      // Main content
      await expect(homePage.getMainContent()).toBeVisible();
      
      // Navigation
      await expect(homePage.getHeader()).toBeVisible();
      
      // Footer
      await expect(homePage.getFooter()).toBeVisible();
    });

    test('should have proper link text', async () => {
      // Check that nav links have descriptive text
      const navLinks = await homePage.page.locator('nav a').all();
      for (const link of navLinks) {
        const text = await link.textContent();
        expect(text?.trim().length).toBeGreaterThan(0);
      }
    });

    test('images should have alt text', async () => {
      const imagesWithoutAlt = homePage.page.locator('img:not([alt])');
      const count = await imagesWithoutAlt.count();
      expect(count).toBe(0);
    });

    test('should have focusable interactive elements', async () => {
      // All buttons should be focusable
      const buttons = await homePage.page.locator('button').all();
      for (const button of buttons) {
        await button.focus();
        const isFocused = await button.evaluate(el => el === document.activeElement);
        expect(isFocused).toBeTruthy();
      }
    });
  });

  test.describe('Performance', () => {
    test('should load main content quickly', async ({ page }) => {
      const startTime = Date.now();
      await page.goto('/');
      await page.waitForLoadState('domcontentloaded');
      const loadTime = Date.now() - startTime;
      
      // DOM should load within 3 seconds
      expect(loadTime).toBeLessThan(3000);
    });

    test('should not have console errors on load', async () => {
      // Already captured in beforeEach/afterEach
      expect(consoleErrors).toHaveLength(0);
    });
  });
});
