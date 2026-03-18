import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  consultationFormSchema,
  contactFormSchema,
  newsletterFormSchema,
  formTypeSchema,
  sanitizeInput,
  type FormType,
} from "@/lib/schemas/forms";

const rateLimit = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

// Twenty CRM configuration
const TWENTY_BASE_URL = process.env.TWENTY_BASE_URL || "http://localhost:3001";
const TWENTY_API_KEY = process.env.TWENTY_API_KEY;

// Audit logging (console for now, should be database in production)
interface AuditEvent {
  id: string;
  timestamp: string;
  action: "FORM_SUBMITTED" | "CRM_COMPANY_CREATED" | "CRM_PERSON_CREATED" | "CRM_NOTE_CREATED" | "CRM_ERROR" | "VALIDATION_ERROR" | "RATE_LIMITED";
  formType: FormType;
  email: string;
  ipHash: string;
  success: boolean;
  details?: Record<string, unknown>;
  error?: string;
}

function logAudit(event: Omit<AuditEvent, "id" | "timestamp">) {
  const auditEntry: AuditEvent = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    ...event,
  };

  // In production, write to database
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

// Retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

async function withRetry<T>(
  fn: () => Promise<T>,
  operationName: string
): Promise<T | null> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt < MAX_RETRIES) {
        const delay = RETRY_DELAY_MS * Math.pow(2, attempt - 1); // Exponential backoff
        console.log(`[RETRY] ${operationName} failed (attempt ${attempt}), retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  console.error(`[RETRY] ${operationName} failed after ${MAX_RETRIES} attempts:`, lastError);
  return null;
}

async function twentyGraphQL(
  query: string,
  variables: Record<string, unknown>,
  operationName: string
) {
  if (!TWENTY_API_KEY) {
    console.error("[CRM] TWENTY_API_KEY not configured");
    return null;
  }

  return withRetry(async () => {
    const response = await fetch(`${TWENTY_BASE_URL}/graphql`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TWENTY_API_KEY}`,
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    if (result.errors) {
      throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
    }

    return result.data;
  }, operationName);
}

async function createCompany(name: string, employees?: number) {
  const query = `
    mutation CreateCompany($data: CompanyCreateInput!) {
      createCompany(data: $data) {
        id
        name
      }
    }
  `;

  const variables = {
    data: {
      name,
      ...(employees && { employees }),
    },
  };

  const result = await twentyGraphQL(query, variables, "createCompany");
  return result?.createCompany;
}

async function createPerson(
  firstName: string,
  lastName: string,
  email: string,
  jobTitle?: string,
  companyId?: string
) {
  const query = `
    mutation CreatePerson($data: PersonCreateInput!) {
      createPerson(data: $data) {
        id
        name { firstName lastName }
        emails { primaryEmail }
        jobTitle
      }
    }
  `;

  const variables: Record<string, unknown> = {
    data: {
      name: { firstName, lastName },
      emails: { primaryEmail: email, additionalEmails: [] },
      ...(jobTitle && { jobTitle }),
      ...(companyId && { companyId }),
    },
  };

  const result = await twentyGraphQL(query, variables, "createPerson");
  return result?.createPerson;
}

async function createNote(title: string, body: string) {
  const query = `
    mutation CreateNote($data: NoteCreateInput!) {
      createNote(data: $data) {
        id
        title
        bodyV2 { markdown }
      }
    }
  `;

  const variables = {
    data: {
      title,
      bodyV2: { markdown: body },
    },
  };

  const result = await twentyGraphQL(query, variables, "createNote");
  return result?.createNote;
}

// Schema selection based on form type
const schemaMap = {
  consultation: consultationFormSchema,
  contact: contactFormSchema,
  newsletter: newsletterFormSchema,
};

export async function POST(request: NextRequest) {
  const ip = request.ip ?? "unknown";
  const ipHash = hashIP(ip);
  const now = Date.now();

  // Rate limiting
  const clientData = rateLimit.get(ip);
  if (clientData && now < clientData.resetTime) {
    if (clientData.count >= RATE_LIMIT_MAX) {
      logAudit({
        action: "RATE_LIMITED",
        formType: "contact",
        email: "",
        ipHash,
        success: false,
        error: "Rate limit exceeded",
      });
      return NextResponse.json(
        { error: "Rate limit exceeded. Please try again later." },
        { status: 429 }
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
        formType: "contact",
        email: data?.email || "",
        ipHash,
        success: false,
        error: "Invalid form type",
        details: { errors: formTypeResult.error.flatten() },
      });
      return NextResponse.json(
        { error: "Invalid form type" },
        { status: 400 }
      );
    }

    // Validate form data with Zod
    const schema = schemaMap[formTypeResult.data];
    const validationResult = schema.safeParse(data);

    if (!validationResult.success) {
      const errors: Record<string, string> = {};
      validationResult.error.issues.forEach((issue) => {
        const path = issue.path.join(".");
        errors[path] = issue.message;
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

    // Honeypot check
    if (validatedData.website && validatedData.website.length > 0) {
      // Bot detected - silently accept but don't process
      return NextResponse.json(
        { success: true, message: "Form submitted successfully" },
        { status: 200 }
      );
    }

    // Log successful form submission
    logAudit({
      action: "FORM_SUBMITTED",
      formType: formTypeResult.data,
      email: validatedData.email,
      ipHash,
      success: true,
      details: {
        name: "name" in validatedData ? validatedData.name : undefined,
        company: "company" in validatedData ? validatedData.company : undefined,
      },
    });

    // Extract name parts (only for forms that have names)
    const nameParts = "name" in validatedData ? validatedData.name.split(" ") : ["", ""];
    const firstName = nameParts[0] || "";
    const lastName = nameParts.slice(1).join(" ") || "";

    // Map team size to employee count
    const teamSizeMap: Record<string, number> = {
      "1-10": 10,
      "11-50": 50,
      "51-200": 200,
      "201-500": 500,
      "501-1000": 1000,
      "1000+": 1000,
    };

    let company = null;
    let person = null;
    let note = null;
    let crmErrors: string[] = [];

    // Create CRM records (only for consultation and contact forms)
    if (formTypeResult.data !== "newsletter") {
      const consultationData =
        formTypeResult.data === "consultation"
          ? (validatedData as z.infer<typeof consultationFormSchema>)
          : null;

      const employees = consultationData?.teamSize
        ? teamSizeMap[consultationData.teamSize]
        : undefined;

      // Create Company
      if ("company" in validatedData && validatedData.company) {
        try {
          company = await createCompany(
            sanitizeInput(validatedData.company),
            employees
          );
          if (company) {
            logAudit({
              action: "CRM_COMPANY_CREATED",
              formType: formTypeResult.data,
              email: validatedData.email,
              ipHash,
              success: true,
              details: { companyId: company.id, companyName: company.name },
            });
          } else {
            crmErrors.push("Failed to create company");
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          crmErrors.push(`Company creation error: ${errorMsg}`);
          logAudit({
            action: "CRM_ERROR",
            formType: formTypeResult.data,
            email: validatedData.email,
            ipHash,
            success: false,
            error: errorMsg,
            details: { operation: "createCompany" },
          });
        }
      }

      // Create Person
      try {
        const jobTitle =
          "role" in validatedData ? validatedData.role : undefined;
        person = await createPerson(
          firstName,
          lastName,
          validatedData.email,
          jobTitle,
          company?.id
        );
        if (person) {
          logAudit({
            action: "CRM_PERSON_CREATED",
            formType: formTypeResult.data,
            email: validatedData.email,
            ipHash,
            success: true,
            details: { personId: person.id },
          });
        } else {
          crmErrors.push("Failed to create person");
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        crmErrors.push(`Person creation error: ${errorMsg}`);
        logAudit({
          action: "CRM_ERROR",
          formType: formTypeResult.data,
          email: validatedData.email,
          ipHash,
          success: false,
          error: errorMsg,
          details: { operation: "createPerson" },
        });
      }

      // Create Note
      try {
        let noteTitle = "";
        let noteBody = "";

        if (formTypeResult.data === "consultation" && consultationData) {
          noteTitle = `Consultation Request - ${consultationData.company}`;
          noteBody = `## Consultation Request

**Name:** ${validatedData.name}
**Email:** ${validatedData.email}
**Company:** ${consultationData.company}
**Role:** ${consultationData.role}
**Team Size:** ${consultationData.teamSize}

### Technical Requirements
**Tech Stack:** ${JSON.stringify(consultationData.techStack)}
**Security Level:** ${consultationData.securityLevel}
**Compliance:** ${JSON.stringify(consultationData.compliance)}

### Message
${consultationData.message || "No message provided"}

---
**Submitted:** ${new Date().toISOString()}
**Source:** zaplit-com
**IP Hash:** ${ipHash}`;
        } else {
          const contactData = validatedData as z.infer<typeof contactFormSchema>;
          noteTitle = `Contact Form - ${contactData.subject}`;
          noteBody = `## Contact Form Submission

**From:** ${validatedData.name} <${validatedData.email}>
**Subject:** ${contactData.subject}

### Message
${contactData.message}

---
**Submitted:** ${new Date().toISOString()}
**Source:** zaplit-com
**IP Hash:** ${ipHash}`;
        }

        note = await createNote(noteTitle, noteBody);
        if (note) {
          logAudit({
            action: "CRM_NOTE_CREATED",
            formType: formTypeResult.data,
            email: validatedData.email,
            ipHash,
            success: true,
            details: { noteId: note.id },
          });
        } else {
          crmErrors.push("Failed to create note");
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        crmErrors.push(`Note creation error: ${errorMsg}`);
        logAudit({
          action: "CRM_ERROR",
          formType: formTypeResult.data,
          email: validatedData.email,
          ipHash,
          success: false,
          error: errorMsg,
          details: { operation: "createNote" },
        });
      }
    }

    // Forward to n8n if configured
    const n8nWebhookUrl = process.env.N8N_WEBHOOK_URL;
    if (n8nWebhookUrl) {
      fetch(n8nWebhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(process.env.N8N_WEBHOOK_SECRET && {
            "X-Webhook-Secret": process.env.N8N_WEBHOOK_SECRET,
          }),
        },
        body: JSON.stringify({
          formType: formTypeResult.data,
          data: validatedData,
          metadata: {
            submittedAt: new Date().toISOString(),
            source: "zaplit-com",
            ipHash,
            userAgent: request.headers.get("user-agent"),
          },
          crmData: {
            companyId: company?.id,
            personId: person?.id,
            noteId: note?.id,
            errors: crmErrors.length > 0 ? crmErrors : undefined,
          },
        }),
      }).catch((err) => console.error("[N8N] Webhook error:", err));
    }

    return NextResponse.json({
      success: true,
      message: "Form submitted successfully",
      id: crypto.randomUUID(),
      crmData: {
        companyCreated: !!company,
        personCreated: !!person,
        noteCreated: !!note,
        errors: crmErrors.length > 0 ? crmErrors : undefined,
      },
    });
  } catch (error) {
    console.error("[FORM] Submission error:", error);
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    
    logAudit({
      action: "CRM_ERROR",
      formType: "contact",
      email: "",
      ipHash,
      success: false,
      error: errorMsg,
      details: { operation: "formSubmission" },
    });

    return NextResponse.json(
      { error: "Failed to process submission. Please try again." },
      { status: 500 }
    );
  }
}
