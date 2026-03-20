import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Allowed origins
const allowedOrigins = [
  "https://zaplit.com",
  "https://www.zaplit.com",
  "https://zaplit-org.vercel.app", // Production domain for zaplit-org
  "http://localhost:3000", // Development
];

export function middleware(request: NextRequest) {
  const origin = request.headers.get("origin");
  
  // Handle preflight requests
  if (request.method === "OPTIONS") {
    const response = new NextResponse(null, { status: 204 });
    
    if (origin && allowedOrigins.includes(origin)) {
      response.headers.set("Access-Control-Allow-Origin", origin);
      response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      response.headers.set("Access-Control-Allow-Headers", "Content-Type, X-Webhook-Secret");
      response.headers.set("Access-Control-Max-Age", "86400");
    }
    
    return response;
  }
  
  // For actual requests
  const response = NextResponse.next();
  
  if (origin && allowedOrigins.includes(origin)) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Access-Control-Allow-Credentials", "true");
  }
  
  return response;
}

// Apply middleware to API routes only
export const config = {
  matcher: "/api/:path*",
};
