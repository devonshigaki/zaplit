/**
 * Form validation schemas using Zod
 * 
 * Provides runtime type validation for all form submissions
 * with comprehensive error messages and input sanitization.
 */

import { z } from "zod";
import { VALIDATION, SECURITY } from "@zaplit/utils";

/**
 * Valid form types for submission routing
 */
export const formTypeSchema = z.enum(["consultation", "contact", "newsletter"]);
export type FormType = z.infer<typeof formTypeSchema>;

/**
 * Contact form schema
 * 
 * Used for general contact/inquiries page.
 * Includes honeypot field for bot detection.
 */
export const contactFormSchema = z.object({
  name: z.string()
    .min(VALIDATION.MIN_NAME_LENGTH, "Name is required"),
  email: z.string()
    .email("Valid email required")
    .max(VALIDATION.MAX_EMAIL_LENGTH, "Email too long"),
  company: z.string()
    .optional(),
  subject: z.string()
    .optional(),
  message: z.string()
    .min(VALIDATION.MIN_MESSAGE_LENGTH, "Message must be at least 10 characters")
    .max(VALIDATION.MAX_INPUT_LENGTH, "Message too long"),
  website: z.string()
    .optional(), // Honeypot field - should always be empty
});

export type ContactFormData = z.infer<typeof contactFormSchema>;

/**
 * Consultation/demo booking form schema
 * 
 * Used for booking demo/consultation calls.
 * Collects company information and requirements.
 */
export const consultationFormSchema = z.object({
  name: z.string()
    .min(VALIDATION.MIN_NAME_LENGTH, "Name is required"),
  email: z.string()
    .email("Valid email required")
    .max(VALIDATION.MAX_EMAIL_LENGTH, "Email too long"),
  company: z.string()
    .min(VALIDATION.MIN_NAME_LENGTH, "Company is required"),
  role: z.string()
    .min(VALIDATION.MIN_NAME_LENGTH, "Role is required"),
  teamSize: z.enum(["1–10", "11–50", "51–200", "200+"]),
  techStack: z.array(z.string())
    .optional(),
  securityLevel: z.enum(["standard", "high", "enterprise"])
    .optional(),
  compliance: z.array(z.string())
    .optional(),
  message: z.string()
    .max(VALIDATION.MAX_INPUT_LENGTH, "Message too long")
    .optional(),
  website: z.string()
    .optional(), // Honeypot field - should always be empty
});

export type ConsultationFormData = z.infer<typeof consultationFormSchema>;

/**
 * Newsletter subscription form schema
 * 
 * Minimal schema for email subscriptions.
 */
export const newsletterFormSchema = z.object({
  email: z.string()
    .email("Valid email required")
    .max(VALIDATION.MAX_EMAIL_LENGTH, "Email too long"),
  website: z.string()
    .optional(), // Honeypot field - should always be empty
});

export type NewsletterFormData = z.infer<typeof newsletterFormSchema>;

/**
 * Sanitize user input to prevent XSS attacks
 * 
 * @param input - Raw user input string
 * @returns Sanitized string with dangerous characters removed
 */
export function sanitizeInput(input: string): string {
  return input
    .trim()
    .replace(SECURITY.XSS_STRIP_PATTERN, "") // Remove < and > characters
    .slice(0, VALIDATION.MAX_INPUT_LENGTH); // Enforce max length
}

/**
 * Validate email format
 * 
 * @param email - Email address to validate
 * @returns True if valid email format
 */
export function isValidEmail(email: string): boolean {
  return VALIDATION.EMAIL_PATTERN.test(email);
}

/**
 * Common disposable email domains
 * 
 * Used to detect and potentially block temporary email addresses.
 */
const disposableDomains = new Set([
  "tempmail.com",
  "throwaway.com",
  "mailinator.com",
  "guerrillamail.com",
  "temp-mail.org",
  "fakeinbox.com",
  "sharklasers.com",
  "getairmail.com",
  "10minutemail.com",
  "burnermail.io",
]);

/**
 * Check if email uses a disposable/temporary domain
 * 
 * @param email - Email address to check
 * @returns True if disposable domain detected
 */
export function isDisposableEmail(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase();
  return domain ? disposableDomains.has(domain) : false;
}
