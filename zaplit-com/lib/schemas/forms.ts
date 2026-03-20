import { z } from "zod";

// Form type enum
export const formTypeSchema = z.enum(["consultation", "contact", "newsletter"]);
export type FormType = z.infer<typeof formTypeSchema>;

// Contact form schema
export const contactFormSchema = z.object({
  name: z.string().min(2, "Name is required"),
  email: z.string().email("Valid email required"),
  company: z.string().optional(),
  subject: z.string().optional(),
  message: z.string().min(10, "Message must be at least 10 characters"),
  website: z.string().optional(), // Honeypot field
});

export type ContactFormData = z.infer<typeof contactFormSchema>;

// Consultation form schema
export const consultationFormSchema = z.object({
  name: z.string().min(2, "Name is required"),
  email: z.string().email("Valid email required"),
  company: z.string().min(2, "Company is required"),
  role: z.string().min(2, "Role is required"),
  teamSize: z.enum(["1–10", "11–50", "51–200", "200+"]),
  techStack: z.array(z.string()).optional(),
  securityLevel: z.enum(["standard", "high", "enterprise"]).optional(),
  compliance: z.array(z.string()).optional(),
  message: z.string().optional(),
  website: z.string().optional(), // Honeypot field
});

export type ConsultationFormData = z.infer<typeof consultationFormSchema>;

// Newsletter form schema
export const newsletterFormSchema = z.object({
  email: z.string().email("Valid email required"),
  website: z.string().optional(), // Honeypot field
});

export type NewsletterFormData = z.infer<typeof newsletterFormSchema>;

// Input sanitization
export function sanitizeInput(input: string): string {
  return input
    .trim()
    .replace(/[<>]/g, "") // Basic XSS prevention
    .slice(0, 1000); // Limit length
}

// Email validation helper
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Disposable email domains (common list)
const disposableDomains = new Set([
  "tempmail.com",
  "throwaway.com",
  "mailinator.com",
  "guerrillamail.com",
  // Add more as needed
]);

export function isDisposableEmail(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase();
  return domain ? disposableDomains.has(domain) : false;
}
