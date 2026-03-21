/**
 * Structured Logging with Pino
 * 
 * Production-ready logging with JSON output, log levels, and sensitive data redaction.
 * Automatically includes request context when used within the request lifecycle.
 * 
 * @module lib/logger
 * @access public
 * 
 * @example
 * // Basic logging
 * import { logger } from '@/lib/logger';
 * logger.info('Server started');
 * 
 * @example
 * // With context
 * logger.info({ userId: '123' }, 'User logged in');
 * 
 * @example
 * // Component-specific logger
 * const n8nLogger = logger.child({ component: 'n8n-webhook' });
 * n8nLogger.info('Webhook sent successfully');
 */

import pino from 'pino';

/**
 * Determine if we're in development mode
 */
const isDevelopment = process.env.NODE_ENV === 'development';

/**
 * Base logger configuration
 */
const logger = pino({
  level: process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info'),
  
  // Base properties included in every log
  base: {
    service: process.env.SERVICE_NAME || 'zaplit',
    env: process.env.NODE_ENV || 'unknown',
    version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || 'dev',
  },
  
  // Pretty printing in development, JSON in production
  transport: isDevelopment 
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
  
  // Redact sensitive fields
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers["x-webhook-secret"]',
      'req.headers.cookie',
      'password',
      'token',
      'apiKey',
      'secret',
      '*.password',
      '*.token',
      '*.secret',
    ],
    remove: true,
  },
  
  // Error serialization
  serializers: {
    err: pino.stdSerializers.err,
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
  },
});

/**
 * Request-scoped logger context
 * 
 * Use this to create loggers that automatically include request context
 */
let requestContext: { requestId?: string; [key: string]: unknown } = {};

/**
 * Set request context for the current execution
 * 
 * @internal
 */
export function setRequestContext(context: { requestId?: string; [key: string]: unknown }): void {
  requestContext = context;
}

/**
 * Clear request context
 * 
 * @internal
 */
export function clearRequestContext(): void {
  requestContext = {};
}

/**
 * Get logger with request context
 * 
 * Automatically includes requestId and other context from the current request
 * 
 * @param request - Optional NextRequest to extract context from
 * @example
 * const log = getLoggerWithContext(request);
 * log.info('Processing form submission'); // Includes requestId automatically
 */
export function getLoggerWithContext(request?: { headers?: Headers }): pino.Logger {
  const context: Record<string, unknown> = { ...requestContext };
  
  if (request?.headers) {
    context.requestId = request.headers.get('x-request-id') || crypto.randomUUID();
  }
  
  if (context.requestId) {
    return logger.child(context);
  }
  return logger;
}

/**
 * Create a component-specific logger
 * 
 * @param component - Component name (e.g., 'n8n-webhook', 'rate-limiter')
 * @returns Logger with component context
 * 
 * @example
 * const n8nLogger = createComponentLogger('n8n-webhook');
 * n8nLogger.info('Sending webhook');
 */
export function createComponentLogger(component: string): pino.Logger {
  return logger.child({ component, ...requestContext });
}

export { logger };
export default logger;
