import { NextResponse } from "next/server";

/**
 * Readiness probe - checks if app is ready to receive traffic
 * Includes dependency checks (n8n connectivity)
 */
export async function GET() {
  const checks: {
    timestamp: string;
    status: "ready" | "not_ready";
    checks: {
      application: { status: string };
      n8n?: { status: string; error?: string };
    };
  } = {
    timestamp: new Date().toISOString(),
    status: "ready",
    checks: {
      application: { status: "ok" },
    },
  };

  // Check n8n connectivity if configured
  if (process.env.N8N_WEBHOOK_CONSULTATION) {
    try {
      const n8nUrl = process.env.N8N_WEBHOOK_CONSULTATION.replace("/webhook/consultation", "");
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(`${n8nUrl}/healthz`, {
        method: "GET",
        signal: controller.signal,
      });
      
      clearTimeout(timeout);
      
      if (response.ok) {
        checks.checks.n8n = { status: "connected" };
      } else {
        checks.checks.n8n = { 
          status: "degraded", 
          error: `HTTP ${response.status}` 
        };
        // Don't mark as not_ready, just degraded
      }
    } catch (error) {
      checks.checks.n8n = { 
        status: "unavailable", 
        error: error instanceof Error ? error.message : "Unknown error"
      };
      // Don't fail readiness - app can still serve forms
    }
  }

  return NextResponse.json(checks, { 
    status: checks.status === "ready" ? 200 : 503 
  });
}
