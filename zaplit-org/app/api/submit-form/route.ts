import { NextRequest, NextResponse } from "next/server";

// Rate limiting map (in production, use Redis)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_REQUESTS = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute

interface FormSubmission {
  formType: "consultation" | "contact" | "newsletter";
  data: Record<string, unknown>;
  metadata: {
    submittedAt: string;
    source: string;
    url: string;
    userAgent?: string;
  };
}

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(ip);

  if (!record || now > record.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  if (record.count >= RATE_LIMIT_REQUESTS) {
    return false;
  }

  record.count++;
  return true;
}

function validateSubmission(body: FormSubmission): string | null {
  if (!body.formType || !["consultation", "contact", "newsletter"].includes(body.formType)) {
    return "Invalid form type";
  }

  if (!body.data || typeof body.data !== "object") {
    return "Invalid form data";
  }

  // Email validation for all forms
  const email = body.data.email as string;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return "Valid email is required";
  }

  // Form-specific validation
  if (body.formType === "consultation") {
    if (!body.data.name || !body.data.company || !body.data.role) {
      return "Name, company, and role are required for consultation";
    }
  }

  if (body.formType === "contact") {
    if (!body.data.name || !body.data.message) {
      return "Name and message are required";
    }
  }

  return null;
}

function getN8nWebhookUrl(formType: string): string | null {
  const urls: Record<string, string | undefined> = {
    consultation: process.env.N8N_WEBHOOK_CONSULTATION,
    contact: process.env.N8N_WEBHOOK_CONTACT,
    newsletter: process.env.N8N_WEBHOOK_NEWSLETTER,
  };
  return urls[formType] || null;
}

export async function POST(request: NextRequest) {
  try {
    // Get client IP for rate limiting
    const ip = request.headers.get("x-forwarded-for") || "unknown";

    // Check rate limit
    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please try again later." },
        { status: 429 }
      );
    }

    // Parse request body
    let body: FormSubmission;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    // Validate submission
    const validationError = validateSubmission(body);
    if (validationError) {
      return NextResponse.json(
        { error: validationError },
        { status: 400 }
      );
    }

    // Get webhook URL
    const webhookUrl = getN8nWebhookUrl(body.formType);
    if (!webhookUrl) {
      console.error(`Webhook URL not configured for form type: ${body.formType}`);
      return NextResponse.json(
        { error: "Form submission temporarily unavailable" },
        { status: 503 }
      );
    }

    // Enrich metadata
    const enrichedPayload = {
      ...body,
      metadata: {
        ...body.metadata,
        submittedAt: new Date().toISOString(),
        source: "zaplit-org",
        ip: ip.split(",")[0].trim(), // First IP in chain
        userAgent: request.headers.get("user-agent") || undefined,
      },
    };

    // Send to n8n
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Form-Source": "zaplit-org",
        ...(process.env.N8N_WEBHOOK_SECRET && {
          "X-Webhook-Secret": process.env.N8N_WEBHOOK_SECRET,
        }),
      },
      body: JSON.stringify(enrichedPayload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("n8n webhook error:", response.status, errorText);
      return NextResponse.json(
        { error: "Failed to process submission. Please try again." },
        { status: 502 }
      );
    }

    // Return success
    return NextResponse.json(
      { 
        success: true, 
        message: "Form submitted successfully",
        id: crypto.randomUUID(),
      },
      { status: 200 }
    );

  } catch (error) {
    console.error("Form submission error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// Health check endpoint
export async function GET() {
  return NextResponse.json({ status: "ok", timestamp: new Date().toISOString() });
}
