import { z } from "zod";

// Team size options for consultation form
export const teamSizeOptions = [
  "1-10",
  "11-50",
  "51-200",
  "201-500",
  "501-1000",
  "1000+",
] as const;

// Security level options
export const securityLevelOptions = [
  "basic",
  "standard",
  "advanced",
  "enterprise",
] as const;

// Compliance options
export const complianceOptions = [
  "GDPR",
  "HIPAA",
  "SOC2",
  "ISO27001",
  "PCI-DSS",
] as const;

// Tech stack categories
export const techStackCategories = [
  "CRM",
  "ERP",
  "Data Warehouse",
  "Analytics",
  "AI/ML",
  "Other",
] as const;

// Consultation form schema with comprehensive validation
export const consultationFormSchema = z
  .object({
    // Step 1: Contact Information
    name: z
      .string()
      .min(2, "Name must be at least 2 characters")
      .max(100, "Name is too long")
      .regex(
        /^[a-zA-Z\s'-]+$/,
        "Name can only contain letters, spaces, hyphens, and apostrophes"
      )
      .transform((val) => val.trim()),

    email: z
      .string()
      .email("Please enter a valid email address")
      .toLowerCase()
      .transform((val) => val.trim()),

    company: z
      .string()
      .min(1, "Company name is required")
      .max(200, "Company name is too long")
      .transform((val) => val.trim()),

    role: z
      .string()
      .min(1, "Role is required")
      .max(100, "Role is too long")
      .transform((val) => val.trim()),

    teamSize: z.enum(teamSizeOptions, {
      required_error: "Please select a team size",
      invalid_type_error: "Invalid team size selection",
    }),

    // Step 2: Tech Stack (at least one selection required)
    techStack: z
      .record(z.string().optional())
      .refine(
        (val) => Object.keys(val).length >= 1,
        "Please select at least one technology"
      )
      .refine(
        (val) => Object.keys(val).length <= 10,
        "Too many technologies selected"
      ),

    // Step 3: Security & Additional Info
    securityLevel: z.enum(securityLevelOptions, {
      required_error: "Please select a security level",
      invalid_type_error: "Invalid security level selection",
    }),

    compliance: z.array(z.string()).optional().default([]),

    message: z
      .string()
      .max(2000, "Message is too long (max 2000 characters)")
      .optional()
      .transform((val) => val?.trim() || ""),

    // Honeypot field - must be empty (bot detection)
    website: z.string().max(0).optional(),
  })
  .strict();

// Contact form schema
export const contactFormSchema = z
  .object({
    name: z
      .string()
      .min(2, "Name must be at least 2 characters")
      .max(100, "Name is too long")
      .transform((val) => val.trim()),

    email: z
      .string()
      .email("Please enter a valid email address")
      .toLowerCase()
      .transform((val) => val.trim()),

    subject: z
      .string()
      .min(5, "Subject must be at least 5 characters")
      .max(200, "Subject is too long")
      .transform((val) => val.trim()),

    message: z
      .string()
      .min(10, "Message must be at least 10 characters")
      .max(5000, "Message is too long (max 5000 characters)")
      .transform((val) => val.trim()),

    // Honeypot field
    website: z.string().max(0).optional(),
  })
  .strict();

// Newsletter form schema
export const newsletterFormSchema = z
  .object({
    email: z
      .string()
      .email("Please enter a valid email address")
      .toLowerCase()
      .transform((val) => val.trim()),

    // Honeypot field
    website: z.string().max(0).optional(),
  })
  .strict();

// Type exports
export type ConsultationFormData = z.infer<typeof consultationFormSchema>;
export type ContactFormData = z.infer<typeof contactFormSchema>;
export type NewsletterFormData = z.infer<typeof newsletterFormSchema>;

// Form type discriminator
export const formTypeSchema = z.enum([
  "consultation",
  "contact",
  "newsletter",
]);

export type FormType = z.infer<typeof formTypeSchema>;

// API request schema
export const formSubmissionSchema = z.discriminatedUnion("formType", [
  z.object({
    formType: z.literal("consultation"),
    data: consultationFormSchema,
  }),
  z.object({
    formType: z.literal("contact"),
    data: contactFormSchema,
  }),
  z.object({
    formType: z.literal("newsletter"),
    data: newsletterFormSchema,
  }),
]);

export type FormSubmission = z.infer<typeof formSubmissionSchema>;

// Sanitization helper
export function sanitizeInput(input: string): string {
  return input
    .trim()
    .replace(/[<>]/g, "") // Remove < and > to prevent HTML injection
    .slice(0, 10000); // Max length limit
}

// Safe parse helper with detailed errors
export function validateFormData<T>(
  schema: z.ZodSchema<T>,
  data: unknown
):
  | { success: true; data: T }
  | { success: false; errors: Record<string, string> } {
  const result = schema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  }

  // Flatten errors for form display
  const errors: Record<string, string> = {};
  result.error.issues.forEach((issue) => {
    const path = issue.path.join(".");
    errors[path] = issue.message;
  });

  return { success: false, errors };
}
