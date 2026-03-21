import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Allowed origins
const allowedOrigins = [
  "https://zaplit.com",
  "https://www.zaplit.com",
  "https://zaplit-org.vercel.app", // Production domain for zaplit-org
  "http://localhost:3000", // Development
];

// Request ID header name
const REQUEST_ID_HEADER = "x-request-id";

/**
 * Add request ID to request/response for request tracking
 */
function addRequestId(request: NextRequest): NextResponse {
  const requestId = request.headers.get(REQUEST_ID_HEADER) || crypto.randomUUID();
  const response = NextResponse.next();
  response.headers.set(REQUEST_ID_HEADER, requestId);
  return response;
}

/**
 * Next.js Middleware
 * 
 * Handles:
 * - CORS headers for API routes
 * - Request ID generation and propagation
 * - Preflight request handling
 */
export function middleware(request: NextRequest) {
  const origin = request.headers.get("origin");
  
  // Add request ID to the request/response
  const response = addRequestId(request);
  
  // Handle preflight requests
  if (request.method === "OPTIONS") {
    const preflightResponse = new NextResponse(null, { status: 204 });
    
    // Copy request ID to preflight response
    const requestId = response.headers.get(REQUEST_ID_HEADER);
    if (requestId) {
      preflightResponse.headers.set(REQUEST_ID_HEADER, requestId);
    }
    
    if (origin && allowedOrigins.includes(origin)) {
      preflightResponse.headers.set("Access-Control-Allow-Origin", origin);
      preflightResponse.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      preflightResponse.headers.set("Access-Control-Allow-Headers", "Content-Type, X-Webhook-Secret");
      preflightResponse.headers.set("Access-Control-Max-Age", "86400");
    }
    
    return preflightResponse;
  }
  
  // For actual requests, copy CORS headers to the response
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
