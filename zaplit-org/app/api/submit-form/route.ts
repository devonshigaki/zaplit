/**
 * Form Submission API Route
 * 
 * Handles form submissions from the Zaplit website with:
 * - Rate limiting (IP-based)
 * - Input validation (Zod schemas)
 * - XSS sanitization
 * - Audit logging (GDPR compliant)
 * - Retry logic for n8n webhooks
 * 
 * @module api/submit-form
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createHash } from "crypto";
import { createSuccessResponse, createErrorResponse } from "@/lib/api/response";
import { RATE_LIMITS, RETRY_CONFIG, API_TIMEOUTS, SECURITY, VALIDATION } from "@/lib/constants";
import { logger, getLoggerWithContext } from "@/lib/logger";
import { checkRateLimit } from "@/lib/redis/rate-limiter";


// Note: In Next.js App Router, body size limits are configured in next.config.mjs
// See: api.bodyParser.sizeLimit (in bytes, e.g., 1024 * 1024 for 1MB)

/**
 * Valid form types for submission routing
 */
const formTypeSchema = z.enum(["consultation", "contact", "newsletter"]);

/**
 * Contact form schema
 */
const contactFormSchema = z.object({
  name: z.string().min(VALIDATION.MIN_NAME_LENGTH, "Name is required"),
  email: z.string().email("Valid email required"),
  company: z.string().optional(),
  subject: z.string().optional(),
  message: z.string().min(VALIDATION.MIN_MESSAGE_LENGTH, "Message must be at least 10 characters"),
  website: z.string().optional(), // Honeypot
});

/**
 * Consultation form schema
 */
const consultationFormSchema = z.object({
  name: z.string().min(VALIDATION.MIN_NAME_LENGTH, "Name is required"),
  email: z.string().email("Valid email required"),
  company: z.string().min(VALIDATION.MIN_NAME_LENGTH, "Company is required"),
  role: z.string().min(VALIDATION.MIN_NAME_LENGTH, "Role is required"),
  teamSize: z.enum(["1–10", "11–50", "51–200", "200+"]),
  techStack: z.array(z.string()).optional(),
  securityLevel: z.enum(["standard", "high", "enterprise"]).optional(),
  compliance: z.array(z.string()).optional(),
  message: z.string().optional(),
  website: z.string().optional(), // Honeypot
});

/**
 * Newsletter form schema
 */
const newsletterFormSchema = z.object({
  email: z.string().email("Valid email required"),
  website: z.string().optional(), // Honeypot
});

/**
 * Map of form types to their validation schemas
 */
const schemaMap = {
  consultation: consultationFormSchema,
  contact: contactFormSchema,
  newsletter: newsletterFormSchema,
};

/**
 * Hash email for audit logs (GDPR compliance)
 * 
 * Creates a deterministic hash that can be used for correlation
 * without storing the actual email address.
 * 
 * @param email - Email address to hash
 * @returns Truncated SHA-256 hash (first 16 chars)
 */
function hashEmail(email: string): string {
  if (!email) return "";
  const salt = process.env.IP_HASH_SALT;
  if (!salt) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("[SECURITY] IP_HASH_SALT is required in production for GDPR compliance");
    }
  }
  const effectiveSalt = salt || "development-salt";
  return createHash(SECURITY.HASH_ALGORITHM)
    .update(email.toLowerCase().trim() + effectiveSalt)
    .digest("hex")
    .substring(0, 16);
}

/**
 * Hash IP address for privacy
 * 
 * @param ip - IP address to hash
 * @returns Truncated SHA-256 hash (first 16 chars)
 */
function hashIP(ip: string): string {
  const salt = process.env.IP_HASH_SALT;
  if (!salt) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("[SECURITY] IP_HASH_SALT is required in production for GDPR compliance");
    }
    // Use daily rotation salt for development
    const dailySalt = new Date().toISOString().split("T")[0];
    return createHash(SECURITY.HASH_ALGORITHM)
      .update(ip + dailySalt)
      .digest("hex")
      .substring(0, 16);
  }
  return createHash(SECURITY.HASH_ALGORITHM)
    .update(ip + salt)
    .digest("hex")
    .substring(0, 16);
}

/**
 * Retry wrapper with exponential backoff
 * 
 * @param fn - Async function to retry
 * @param operationName - Name of operation for logging
 * @returns Result of fn, or null if all retries failed
 */
async function withRetry<T>(fn: () => Promise<T>, operationName: string): Promise<T | null> {
  const log = getLoggerWithContext();
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= RETRY_CONFIG.MAX_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < RETRY_CONFIG.MAX_ATTEMPTS) {
        const delay = RETRY_CONFIG.BASE_DELAY_MS * Math.pow(RETRY_CONFIG.BACKOFF_MULTIPLIER, attempt - 1);
        log.warn({
          operation: operationName,
          attempt,
          maxAttempts: RETRY_CONFIG.MAX_ATTEMPTS,
          retryDelayMs: delay,
          error: lastError.message,
        }, `Retry attempt ${attempt} for ${operationName}`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  log.error({
    operation: operationName,
    attempts: RETRY_CONFIG.MAX_ATTEMPTS,
    error: lastError?.message,
    stack: lastError?.stack,
  }, `${operationName} failed after ${RETRY_CONFIG.MAX_ATTEMPTS} attempts`);

  return null;
}

/**
 * Send form data to n8n webhook
 * 
 * @param formType - Type of form submitted
 * @param data - Sanitized form data
 * @param metadata - Submission metadata (timestamps, source, etc.)
 * @returns Success status and optional error message
 */
async function sendToN8N(
  formType: string,
  data: unknown,
  metadata: Record<string, unknown>
): Promise<{ success: boolean; error?: string }> {
  const log = logger;

  const webhookUrl =
    (formType === "consultation" && process.env.N8N_WEBHOOK_CONSULTATION) ||
    (formType === "contact" && process.env.N8N_WEBHOOK_CONTACT) ||
    (formType === "newsletter" && process.env.N8N_WEBHOOK_NEWSLETTER) ||
    process.env.N8N_WEBHOOK_URL;

  if (!webhookUrl) {
    const error = "No webhook URL configured";
    log.error({ formType, error }, "N8N webhook URL not configured");
    return { success: false, error };
  }

  const dataFields = data && typeof data === "object" ? Object.keys(data) : [];
  log.debug({ formType, dataFields }, "Sending form to n8n webhook");

  const result = await withRetry(async () => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (process.env.N8N_WEBHOOK_SECRET) {
      headers["X-Webhook-Secret"] = process.env.N8N_WEBHOOK_SECRET;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUTS.N8N_WEBHOOK_MS);

    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({
          formType,
          data,
          metadata,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return true;
    } finally {
      clearTimeout(timeoutId);
    }
  }, "n8n webhook");

  if (!result) {
    const error = "Failed to send to n8n after retries";
    log.error({ formType, metadata }, error);
    return { success: false, error };
  }

  log.info({ formType }, "Successfully sent to n8n webhook");
  return { success: true };
}

/**
 * POST handler for form submissions
 * 
 * Main entry point for form submissions with validation,
 * rate limiting, and n8n integration.
 * 
 * @param request - Next.js request object
 * @returns JSON response with submission status
 */
async function handlePost(request: NextRequest): Promise<NextResponse> {
  const log = getLoggerWithContext(request);
  
  // Get IP from headers (Cloud Run/Cloudflare)
  const forwardedFor = request.headers.get("x-forwarded-for");
  const ip = forwardedFor
    ? forwardedFor.split(",").pop()?.trim() || "unknown"
    : request.headers.get("x-real-ip") || "unknown";
  const ipHash = hashIP(ip);
  const submissionId = crypto.randomUUID();

  log.debug({ ipHash, submissionId }, "Processing form submission");

  // Rate limiting with Redis (falls back to memory if Redis unavailable)
  const rateLimitResult = await checkRateLimit(ipHash);

  if (!rateLimitResult.allowed) {
    logger.warn({
      ipHash,
      remaining: rateLimitResult.remaining,
      retryAfter: rateLimitResult.retryAfter,
    }, "Rate limit exceeded");

    logger.info({
      action: "RATE_LIMITED",
      formType: "unknown",
      emailHash: "",
      ipHash,
      success: false,
      error: "Rate limit exceeded",
    });

    return NextResponse.json(
      { error: "Rate limit exceeded. Please try again later." },
      { 
        status: 429, 
        headers: { 
          "Retry-After": String(rateLimitResult.retryAfter || RATE_LIMITS.RETRY_AFTER_SECONDS),
          "X-RateLimit-Remaining": String(rateLimitResult.remaining),
        } 
      }
    );
  }

  try {
    const body = await request.json();
    const { formType, data } = body;

    // Validate form type
    const formTypeResult = formTypeSchema.safeParse(formType);
    if (!formTypeResult.success) {
      log.warn({ formType: formType || "undefined" }, "Invalid form type received");

      logger.info({
        action: "VALIDATION_ERROR",
        formType: "unknown",
        emailHash: data?.email ? hashEmail(data.email) : "",
        ipHash,
        success: false,
        error: "Invalid form type",
      });

      return createErrorResponse("Invalid form type", 400, "INVALID_FORM_TYPE");
    }

    // Validate form data
    const schema = schemaMap[formTypeResult.data];
    const validationResult = schema.safeParse(data);

    if (!validationResult.success) {
      const errors: Record<string, string> = {};
      validationResult.error.issues.forEach((issue) => {
        errors[issue.path.join(".")] = issue.message;
      });

      logger.warn({
        formType: formTypeResult.data,
        validationErrors: errors,
      }, "Form validation failed");

      logger.info({
        action: "VALIDATION_ERROR",
        formType: formTypeResult.data,
        emailHash: data?.email ? hashEmail(data.email) : "",
        ipHash,
        success: false,
        error: "Validation failed",
        details: { errors },
      });

      return createErrorResponse("Validation failed", 400, "VALIDATION_ERROR", { errors });
    }

    const validatedData = validationResult.data;

    // Sanitize string inputs
    const sanitizedData = Object.entries(validatedData).reduce((acc, [key, value]) => {
      acc[key as keyof typeof validatedData] = typeof value === "string"
        ? value.trim().replace(SECURITY.XSS_STRIP_PATTERN, "").slice(0, VALIDATION.MAX_INPUT_LENGTH)
        : value;
      return acc;
    }, {} as typeof validatedData);

    // Honeypot check (bot detection)
    if (validatedData.website && validatedData.website.length > 0) {
      log.debug({ ipHash }, "Honeypot field filled - likely bot submission");
      // Silently accept but don't process
      return createSuccessResponse({ message: "Form submitted successfully" });
    }

    // Log successful validation
    logger.info({
      formType: formTypeResult.data,
      submissionId,
      emailHash: hashEmail(validatedData.email),
    }, "Form validated successfully");

    // Log successful submission
    logger.info({
      action: "FORM_SUBMITTED",
      formType: formTypeResult.data,
      emailHash: hashEmail(validatedData.email),
      ipHash,
      success: true,
    });

    // Send to n8n
    const metadata = {
      submittedAt: new Date().toISOString(),
      source: process.env.SERVICE_NAME || "zaplit-org",
      submissionId,
      ipHash,
      userAgent: request.headers.get("user-agent"),
    };

    const n8nResult = await sendToN8N(formTypeResult.data, sanitizedData, metadata);

    if (!n8nResult.success) {
      logger.info({
        action: "N8N_WEBHOOK_FAILED",
        formType: formTypeResult.data,
        emailHash: hashEmail(validatedData.email),
        ipHash,
        success: false,
        error: n8nResult.error,
        details: { submissionId },
      });

      log.error({
        submissionId,
        formType: formTypeResult.data,
        error: n8nResult.error,
      }, "N8N webhook failed");
    } else {
      log.info({ submissionId, formType: formTypeResult.data }, "N8N webhook sent successfully");
    }

    return createSuccessResponse({
      message: "Form submitted successfully",
      id: submissionId,
      n8nStatus: n8nResult.success ? "delivered" : "queued",
    });

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    log.error({
      err: error instanceof Error ? error : new Error(String(error)),
      submissionId,
    }, "Form submission error");

    logger.info({
      action: "FORM_ERROR",
      formType: "unknown",
      emailHash: "",
      ipHash,
      success: false,
      error: errorMsg,
    });

    return createErrorResponse("Failed to process submission. Please try again.", 500, "INTERNAL_ERROR");
  }
}

/**
 * GET handler for health checks
 * 
 * Returns current API status and timestamp.
 * Used by load balancers and monitoring systems.
 * 
 * @returns JSON response with status
 */
function handleGet(): NextResponse {
  return NextResponse.json({ 
    status: "ok", 
    timestamp: new Date().toISOString(),
    service: "zaplit-org",
    version: process.env.npm_package_version || "unknown",
  });
}

// Export handlers
export { handlePost as POST, handleGet as GET };
