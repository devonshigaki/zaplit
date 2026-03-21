import { NextResponse } from "next/server";

/**
 * Standardized API Response Helpers
 * 
 * Provides consistent response format across all API routes
 * with proper timestamp, error codes, and type safety.
 */

interface SuccessResponse<T> {
  success: true;
  timestamp: string;
  data: T;
}

interface ErrorResponse {
  success: false;
  timestamp: string;
  error: string;
  code?: string;
  details?: Record<string, unknown>;
}

/**
 * Creates a standardized success response
 * 
 * @param data - The response data
 * @param status - HTTP status code (default: 200)
 * @returns NextResponse with standardized format
 * 
 * @example
 * return createSuccessResponse({ id: "123", message: "Created" }, 201);
 */
export function createSuccessResponse<T>(data: T, status = 200): NextResponse {
  const body: SuccessResponse<T> = {
    success: true,
    timestamp: new Date().toISOString(),
    data,
  };

  return NextResponse.json(body, { status });
}

/**
 * Creates a standardized error response
 * 
 * @param error - Human-readable error message
 * @param status - HTTP status code
 * @param code - Machine-readable error code
 * @param details - Additional error details
 * @returns NextResponse with standardized error format
 * 
 * @example
 * return createErrorResponse("Validation failed", 400, "VALIDATION_ERROR", { field: "email" });
 */
export function createErrorResponse(
  error: string,
  status: number,
  code?: string,
  details?: Record<string, unknown>
): NextResponse {
  const body: ErrorResponse = {
    success: false,
    timestamp: new Date().toISOString(),
    error,
    ...(code && { code }),
    ...(details && { details }),
  };

  return NextResponse.json(body, { status });
}

/**
 * Common HTTP Status Codes with error codes
 */
export const HttpErrors = {
  BAD_REQUEST: (message = "Bad request", details?: Record<string, unknown>) =>
    createErrorResponse(message, 400, "BAD_REQUEST", details),
  
  UNAUTHORIZED: (message = "Unauthorized") =>
    createErrorResponse(message, 401, "UNAUTHORIZED"),
  
  FORBIDDEN: (message = "Forbidden") =>
    createErrorResponse(message, 403, "FORBIDDEN"),
  
  NOT_FOUND: (message = "Not found") =>
    createErrorResponse(message, 404, "NOT_FOUND"),
  
  RATE_LIMITED: (message = "Rate limit exceeded") =>
    createErrorResponse(message, 429, "RATE_LIMITED", { retryAfter: 60 }),
  
  INTERNAL_ERROR: (message = "Internal server error") =>
    createErrorResponse(message, 500, "INTERNAL_ERROR"),
  
  SERVICE_UNAVAILABLE: (message = "Service temporarily unavailable") =>
    createErrorResponse(message, 503, "SERVICE_UNAVAILABLE"),
} as const;

/**
 * Request ID header name for tracing
 */
export const REQUEST_ID_HEADER = "X-Request-ID";

/**
 * Adds request ID header to response for tracing
 * 
 * @param response - NextResponse to modify
 * @param requestId - The request ID to add
 * @returns Modified response
 */
export function addRequestIdHeader(
  response: NextResponse,
  requestId: string
): NextResponse {
  response.headers.set(REQUEST_ID_HEADER, requestId);
  return response;
}
