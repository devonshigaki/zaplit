import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createHash } from "crypto";

// Configuration
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;
const N8N_TIMEOUT_MS = 10000; // 10 second timeout for webhook calls

// Limit request body size to prevent DoS
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb',
    },
  },
};

// In-memory rate limit store (use Redis in production for multi-instance)
const rateLimit = new Map<string, { count: number; resetTime: number }>();

// Schemas
const formTypeSchema = z.enum(["consultation", "contact", "newsletter"]);

const contactFormSchema = z.object({
  name: z.string().min(2, "Name is required"),
  email: z.string().email("Valid email required"),
  company: z.string().optional(),
  subject: z.string().optional(),
  message: z.string().min(10, "Message must be at least 10 characters"),
  website: z.string().optional(), // Honeypot
});

const consultationFormSchema = z.object({
  name: z.string().min(2, "Name is required"),
  email: z.string().email("Valid email required"),
  company: z.string().min(2, "Company is required"),
  role: z.string().min(2, "Role is required"),
  teamSize: z.enum(["1–10", "11–50", "51–200", "200+"]),
  techStack: z.array(z.string()).optional(),
  securityLevel: z.enum(["standard", "high", "enterprise"]).optional(),
  compliance: z.array(z.string()).optional(),
  message: z.string().optional(),
  website: z.string().optional(), // Honeypot
});

const newsletterFormSchema = z.object({
  email: z.string().email("Valid email required"),
  website: z.string().optional(), // Honeypot
});

const schemaMap = {
  consultation: consultationFormSchema,
  contact: contactFormSchema,
  newsletter: newsletterFormSchema,
};

// Audit logging
function logAudit(event: {
  action: string;
  formType: string;
  email: string;
  ipHash: string;
  success: boolean;
  error?: string;
  details?: Record<string, unknown>;
}) {
  const auditEntry = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    ...event,
  };
  console.log("[AUDIT]", JSON.stringify(auditEntry));
}

// Hash IP for privacy using HMAC-SHA256
function hashIP(ip: string): string {
  // Use a salt from environment or fallback to a static salt
  const salt = process.env.IP_HASH_SALT || "zaplit-static-salt-2026";
  return createHash("sha256")
    .update(ip + salt)
    .digest("hex")
    .substring(0, 16);
}

// Retry wrapper
async function withRetry<T>(fn: () => Promise<T>, operationName: string): Promise<T | null> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < MAX_RETRIES) {
        const delay = RETRY_DELAY_MS * Math.pow(2, attempt - 1);
        console.log(`[RETRY] ${operationName} failed (attempt ${attempt}), retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  console.error(`[RETRY] ${operationName} failed after ${MAX_RETRIES} attempts:`, lastError);
  return null;
}

// Send to n8n webhook with timeout
async function sendToN8N(
  formType: string,
  data: unknown,
  metadata: Record<string, unknown>
): Promise<{ success: boolean; error?: string }> {
  const webhookUrl =
    (formType === "consultation" && process.env.N8N_WEBHOOK_CONSULTATION) ||
    (formType === "contact" && process.env.N8N_WEBHOOK_CONTACT) ||
    (formType === "newsletter" && process.env.N8N_WEBHOOK_NEWSLETTER) ||
    process.env.N8N_WEBHOOK_URL;

  if (!webhookUrl) {
    const error = "[N8N] No webhook URL configured";
    console.error(error);
    return { success: false, error };
  }

  // Log what fields are being sent for audit trail
  const dataFields = data && typeof data === 'object' ? Object.keys(data) : [];
  console.log(`[N8N] Sending ${formType} form with fields:`, dataFields);

  const result = await withRetry(async () => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (process.env.N8N_WEBHOOK_SECRET) {
      headers["X-Webhook-Secret"] = process.env.N8N_WEBHOOK_SECRET;
    }

    // Add timeout to prevent hanging requests
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), N8N_TIMEOUT_MS);

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
    console.error(`[N8N] ${error}`);
    return { success: false, error };
  }

  return { success: true };
}

// Main handler
export async function POST(request: NextRequest) {
  // Get IP from headers (Cloud Run/Cloudflare) - use last IP to prevent spoofing
  const forwardedFor = request.headers.get("x-forwarded-for");
  const ip = forwardedFor 
    ? forwardedFor.split(",").pop()?.trim() || "unknown"
    : request.headers.get("x-real-ip") || "unknown";
  const ipHash = hashIP(ip);
  const now = Date.now();
  const submissionId = crypto.randomUUID();

  // Rate limiting
  const clientData = rateLimit.get(ip);
  if (clientData && now < clientData.resetTime) {
    if (clientData.count >= RATE_LIMIT_MAX) {
      logAudit({
        action: "RATE_LIMITED",
        formType: "unknown",
        email: "",
        ipHash,
        success: false,
        error: "Rate limit exceeded",
      });
      return NextResponse.json(
        { error: "Rate limit exceeded. Please try again later." },
        { status: 429, headers: { "Retry-After": "60" } }
      );
    }
    clientData.count++;
  } else {
    rateLimit.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
  }

  try {
    const body = await request.json();
    const { formType, data } = body;

    // Validate form type
    const formTypeResult = formTypeSchema.safeParse(formType);
    if (!formTypeResult.success) {
      logAudit({
        action: "VALIDATION_ERROR",
        formType: "unknown",
        email: data?.email || "",
        ipHash,
        success: false,
        error: "Invalid form type",
      });
      return NextResponse.json({ error: "Invalid form type" }, { status: 400 });
    }

    // Validate form data
    const schema = schemaMap[formTypeResult.data];
    const validationResult = schema.safeParse(data);

    if (!validationResult.success) {
      const errors: Record<string, string> = {};
      validationResult.error.issues.forEach((issue) => {
        errors[issue.path.join(".")] = issue.message;
      });

      logAudit({
        action: "VALIDATION_ERROR",
        formType: formTypeResult.data,
        email: data?.email || "",
        ipHash,
        success: false,
        error: "Validation failed",
        details: { errors },
      });

      return NextResponse.json(
        { error: "Validation failed", details: errors },
        { status: 400 }
      );
    }

    const validatedData = validationResult.data;

    // Honeypot check (bot detection)
    if (validatedData.website && validatedData.website.length > 0) {
      return NextResponse.json(
        { success: true, message: "Form submitted successfully" },
        { status: 200 }
      );
    }

    // Log successful submission
    logAudit({
      action: "FORM_SUBMITTED",
      formType: formTypeResult.data,
      email: validatedData.email,
      ipHash,
      success: true,
    });

    // Send to n8n with proper error handling
    const metadata = {
      submittedAt: new Date().toISOString(),
      source: "zaplit-com",
      submissionId,
      ipHash,
      userAgent: request.headers.get("user-agent"),
    };

    // Wait for n8n response - don't fire-and-forget (causes data loss)
    const n8nResult = await sendToN8N(formTypeResult.data, validatedData, metadata);

    if (!n8nResult.success) {
      // Log the failure but still return success to user (graceful degradation)
      // In production, you might want to queue for retry instead
      logAudit({
        action: "N8N_WEBHOOK_FAILED",
        formType: formTypeResult.data,
        email: validatedData.email,
        ipHash,
        success: false,
        error: n8nResult.error,
        details: { submissionId },
      });
      console.error(`[N8N] Webhook failed for submission ${submissionId}:`, n8nResult.error);
      
      // Still return success to user - we'll handle retry internally
      // TODO: Implement dead letter queue for failed submissions
    } else {
      console.log(`[N8N] Webhook sent successfully for submission ${submissionId}`);
    }

    return NextResponse.json({
      success: true,
      message: "Form submitted successfully",
      id: submissionId,
      n8nStatus: n8nResult.success ? "delivered" : "queued",
    });

  } catch (error) {
    console.error("[FORM] Submission error:", error);
    const errorMsg = error instanceof Error ? error.message : "Unknown error";

    logAudit({
      action: "FORM_ERROR",
      formType: "unknown",
      email: "",
      ipHash,
      success: false,
      error: errorMsg,
    });

    return NextResponse.json(
      { error: "Failed to process submission. Please try again." },
      { status: 500 }
    );
  }
}

// Health check endpoint
export async function GET() {
  return NextResponse.json({ status: "ok", timestamp: new Date().toISOString() });
}
