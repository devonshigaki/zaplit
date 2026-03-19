import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

// Configuration
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

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
  teamSize: z.enum(["1-10", "11-50", "51-200", "201-500", "501-1000", "1000+"]),
  techStack: z.array(z.string()).optional(),
  securityLevel: z.enum(["standard", "enhanced", "enterprise"]).optional(),
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

// Hash IP for privacy
function hashIP(ip: string): string {
  return ip
    .split("")
    .reduce((acc, char) => acc + char.charCodeAt(0), 0)
    .toString(16)
    .slice(0, 16);
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

// Send to n8n webhook
async function sendToN8N(
  formType: string,
  data: unknown,
  metadata: Record<string, unknown>
): Promise<boolean> {
  const webhookUrl =
    (formType === "consultation" && process.env.N8N_WEBHOOK_CONSULTATION) ||
    (formType === "contact" && process.env.N8N_WEBHOOK_CONTACT) ||
    (formType === "newsletter" && process.env.N8N_WEBHOOK_NEWSLETTER) ||
    process.env.N8N_WEBHOOK_URL;

  if (!webhookUrl) {
    console.error("[N8N] No webhook URL configured");
    return false;
  }

  return withRetry(async () => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (process.env.N8N_WEBHOOK_SECRET) {
      headers["X-Webhook-Secret"] = process.env.N8N_WEBHOOK_SECRET;
    }

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        formType,
        data,
        metadata,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return true;
  }, "n8n webhook") as Promise<boolean>;
}

// Main handler
export async function POST(request: NextRequest) {
  // Get IP from headers (Cloud Run/Cloudflare)
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? 
             request.headers.get("x-real-ip") ?? 
             "unknown";
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

    // Send to n8n (async, don't block response)
    const metadata = {
      submittedAt: new Date().toISOString(),
      source: "zaplit-com",
      submissionId,
      ipHash,
      userAgent: request.headers.get("user-agent"),
    };

    // Fire and forget - don't block user response
    sendToN8N(formTypeResult.data, validatedData, metadata).then((success) => {
      if (success) {
        console.log("[N8N] Webhook sent successfully");
      } else {
        console.error("[N8N] Webhook failed");
      }
    });

    // Return success immediately
    return NextResponse.json({
      success: true,
      message: "Form submitted successfully",
      id: submissionId,
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
