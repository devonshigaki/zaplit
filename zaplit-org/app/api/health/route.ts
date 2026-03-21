import { NextResponse } from "next/server";

/**
 * Health check endpoint for Cloud Run
 * Used by load balancers and monitoring systems
 */
export async function GET() {
  const checks = {
    timestamp: new Date().toISOString(),
    status: "healthy",
    version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || "unknown",
    uptime: process.uptime(),
    checks: {
      memory: checkMemory(),
      environment: checkEnvironment(),
    },
  };

  return NextResponse.json(checks, { status: 200 });
}

/**
 * Liveness probe - basic check that app is running
 */
export async function HEAD() {
  return new NextResponse(null, { status: 200 });
}

function checkMemory() {
  const usage = process.memoryUsage();
  const maxMemory = 1024 * 1024 * 1024; // 1GB (Cloud Run default)
  const usedPercent = (usage.heapUsed / maxMemory) * 100;
  
  return {
    status: usedPercent > 90 ? "warning" : "ok",
    usedPercent: Math.round(usedPercent * 100) / 100,
    heapUsed: Math.round(usage.heapUsed / 1024 / 1024) + "MB",
    heapTotal: Math.round(usage.heapTotal / 1024 / 1024) + "MB",
  };
}

function checkEnvironment() {
  const required = ["NODE_ENV"];
  const optional = ["N8N_WEBHOOK_CONSULTATION", "N8N_WEBHOOK_CONTACT"];
  
  return {
    required: required.reduce((acc, key) => {
      acc[key] = process.env[key] ? "set" : "missing";
      return acc;
    }, {} as Record<string, string>),
    optional: optional.reduce((acc, key) => {
      acc[key] = process.env[key] ? "set" : "missing";
      return acc;
    }, {} as Record<string, string>),
  };
}
