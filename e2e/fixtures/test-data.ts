/**
 * E2E Test Data Fixtures
 * 
 * Provides test data factories for form submissions and mock responses.
 * All email addresses use the @example.com domain for test isolation.
 */

import { faker } from '@faker-js/faker';

// ============================================================================
// Types
// ============================================================================

export interface ContactFormData {
  name: string;
  email: string;
  company: string;
  subject: string;
  message: string;
}

export interface ConsultationFormData {
  name: string;
  email: string;
  company: string;
  role: string;
  teamSize: '1–10' | '11–50' | '51–200' | '200+';
  techStack: Record<string, string>;
  securityLevel: 'standard' | 'high' | 'enterprise';
  compliance: string[];
  message: string;
}

export interface NewsletterFormData {
  email: string;
}

export interface MockN8NResponse {
  success: boolean;
  message: string;
  id?: string;
  n8nStatus?: 'delivered' | 'queued';
}

// ============================================================================
// Test Data Factories
// ============================================================================

/**
 * Generate a unique test email address
 * Format: test-{timestamp}-{random}@example.com
 */
export function generateTestEmail(prefix?: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  const cleanPrefix = prefix ? `${prefix}-` : '';
  return `test-${cleanPrefix}${timestamp}-${random}@example.com`.toLowerCase();
}

/**
 * Create valid contact form data
 */
export function createContactFormData(overrides?: Partial<ContactFormData>): ContactFormData {
  return {
    name: faker.person.fullName(),
    email: generateTestEmail('contact'),
    company: faker.company.name(),
    subject: faker.lorem.sentence(3),
    message: faker.lorem.paragraph(2),
    ...overrides,
  };
}

/**
 * Create valid consultation form data
 */
export function createConsultationFormData(overrides?: Partial<ConsultationFormData>): ConsultationFormData {
  return {
    name: faker.person.fullName(),
    email: generateTestEmail('consultation'),
    company: faker.company.name(),
    role: faker.person.jobTitle(),
    teamSize: '11–50',
    techStack: {
      CRM: 'Salesforce',
      Communication: 'Slack',
      Productivity: 'Notion',
    },
    securityLevel: 'standard',
    compliance: ['gdpr'],
    message: faker.lorem.paragraph(1),
    ...overrides,
  };
}

/**
 * Create valid newsletter form data
 */
export function createNewsletterFormData(overrides?: Partial<NewsletterFormData>): NewsletterFormData {
  return {
    email: generateTestEmail('newsletter'),
    ...overrides,
  };
}

// ============================================================================
// Mock Response Factories
// ============================================================================

/**
 * Create a successful n8n webhook response
 */
export function createSuccessResponse(overrides?: Partial<MockN8NResponse>): MockN8NResponse {
  return {
    success: true,
    message: 'Form submitted successfully',
    id: `sub-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
    n8nStatus: 'delivered',
    ...overrides,
  };
}

/**
 * Create an error n8n webhook response
 */
export function createErrorResponse(errorMessage?: string): MockN8NResponse {
  return {
    success: false,
    message: errorMessage || 'Failed to process submission. Please try again.',
  };
}

// ============================================================================
// Edge Case Test Data
// ============================================================================

export const edgeCases = {
  /** XSS attempt in form fields */
  xssAttempt: '<script>alert("xss")</script>',
  
  /** SQL injection attempt */
  sqlInjection: "'; DROP TABLE users; --",
  
  /** Very long input (5000 chars) */
  get longInput(): string {
    return faker.lorem.paragraphs(50);
  },
  
  /** Unicode and special characters */
  unicodeText: '日本語 🎉 émojis & special chars: <>&"\'',
  
  /** HTML in text */
  htmlContent: '<p>Test <strong>bold</strong> text</p>',
  
  /** Newlines and tabs */
  formattedText: 'Line 1\nLine 2\n\tIndented\n\nLine 4',
  
  /** Invalid email formats */
  invalidEmails: [
    'not-an-email',
    '@example.com',
    'user@',
    'user@.com',
    'user name@example.com',
    '',
  ],
  
  /** Honeypot field value (should be empty normally) */
  honeypotValue: 'bot-fill-value',
};

// ============================================================================
// Test User Personas
// ============================================================================

export const testPersonas = {
  /** Standard business user */
  businessUser: {
    name: 'Sarah Johnson',
    email: generateTestEmail('sarah'),
    company: 'TechCorp Inc.',
    role: 'VP of Engineering',
  },
  
  /** Startup founder */
  startupFounder: {
    name: 'Alex Chen',
    email: generateTestEmail('alex'),
    company: 'StartupXYZ',
    role: 'Founder & CEO',
    teamSize: '1–10' as const,
  },
  
  /** Enterprise decision maker */
  enterpriseUser: {
    name: 'Michael Roberts',
    email: generateTestEmail('michael'),
    company: 'Enterprise Solutions Ltd.',
    role: 'Chief Technology Officer',
    teamSize: '200+' as const,
    securityLevel: 'enterprise' as const,
    compliance: ['soc2', 'gdpr', 'hipaa'],
  },
};
