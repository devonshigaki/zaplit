/**
 * Home Page Object Model
 * 
 * Represents the landing page with all its sections and interactions.
 */

import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './base-page';

export class HomePage extends BasePage {
  readonly url = '/';

  // Navigation
  readonly navLinks = {
    agents: () => this.page.getByRole('link', { name: 'Agents' }),
    solutions: () => this.page.getByRole('link', { name: 'Solutions' }),
    security: () => this.page.getByRole('link', { name: 'Security' }),
    plans: () => this.page.getByRole('link', { name: 'Plans' }),
    calculator: () => this.page.getByRole('link', { name: 'Calculator' }),
    faq: () => this.page.getByRole('link', { name: 'FAQ' }),
    bookDemo: () => this.page.getByRole('button', { name: /book demo/i }).first(),
  };

  // Hero Section
  readonly heroSection = {
    container: () => this.page.locator('#main-content').first(),
    headline: () => this.page.getByRole('heading', { level: 1 }),
    ctaButton: () => this.page.locator('#main-content').getByRole('link', { name: /book demo|get started/i }).first(),
  };

  // Sections
  readonly sections = {
    security: () => this.page.locator('#security'),
    agents: () => this.page.locator('#agents'),
    solutions: () => this.page.locator('#solutions'),
    plans: () => this.page.locator('#plans'),
    calculator: () => this.page.locator('#calculator'),
    faq: () => this.page.locator('#faq'),
    bookDemo: () => this.page.locator('#book-demo'),
  };

  // Theme Toggle
  readonly themeToggle = () => this.page.getByRole('button', { name: /toggle theme/i });

  // Mobile Menu
  readonly mobileMenuButton = () => this.page.getByRole('button', { name: /toggle menu/i });

  constructor(page: Page) {
    super(page);
  }

  async goto(): Promise<void> {
    await this.page.goto(this.url);
    await this.waitForReady();
  }

  async waitForReady(): Promise<void> {
    await this.page.waitForLoadState('domcontentloaded');
    await expect(this.heroSection.headline()).toBeVisible();
  }

  /**
   * Navigate to a section via anchor link
   */
  async navigateToSection(sectionName: keyof typeof this.sections): Promise<void> {
    const section = this.sections[sectionName]();
    await section.scrollIntoViewIfNeeded();
    await expect(section).toBeVisible();
  }

  /**
   * Click the main CTA in hero
   */
  async clickHeroCTA(): Promise<void> {
    await this.heroSection.ctaButton().click();
  }

  /**
   * Click Book Demo button in navigation
   */
  async clickBookDemoNav(): Promise<void> {
    await this.navLinks.bookDemo().click();
  }

  /**
   * Toggle between light and dark theme
   */
  async toggleTheme(): Promise<void> {
    await this.themeToggle().click();
  }

  /**
   * Get current theme
   */
  async getTheme(): Promise<'dark' | 'light'> {
    const html = this.page.locator('html');
    const hasDarkClass = await html.evaluate(el => el.classList.contains('dark'));
    return hasDarkClass ? 'dark' : 'light';
  }

  /**
   * Set specific theme
   */
  async setTheme(theme: 'dark' | 'light'): Promise<void> {
    const current = await this.getTheme();
    if (current !== theme) {
      await this.toggleTheme();
    }
  }

  /**
   * Open mobile navigation menu
   */
  async openMobileMenu(): Promise<void> {
    await this.mobileMenuButton().click();
    // Wait for mobile menu to be visible
    await expect(this.page.getByRole('link', { name: 'Agents' })).toBeVisible();
  }

  /**
   * Close mobile navigation menu
   */
  async closeMobileMenu(): Promise<void> {
    await this.mobileMenuButton().click();
  }

  /**
   * Check if all main sections are visible
   */
  async assertAllSectionsVisible(): Promise<void> {
    for (const [name, locator] of Object.entries(this.sections)) {
      await expect(locator(), `Section ${name} should be visible`).toBeVisible();
    }
  }

  /**
   * Scroll through all sections and verify they exist
   */
  async scrollThroughSections(): Promise<void> {
    for (const [name, locator] of Object.entries(this.sections)) {
      await locator().scrollIntoViewIfNeeded();
      await expect(locator(), `Section ${name} should be visible when scrolled`).toBeVisible();
    }
  }

  /**
   * Get the page headline text
   */
  async getHeadlineText(): Promise<string> {
    return this.heroSection.headline().textContent();
  }

  /**
   * Verify page metadata
   */
  async assertMetadata(): Promise<void> {
    // Check title
    await expect(this.page).toHaveTitle(/Zaplit/i);
    
    // Check meta description exists
    const metaDescription = this.page.locator('meta[name="description"]');
    expect(await metaDescription.count()).toBeGreaterThan(0);
  }
}
