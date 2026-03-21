/**
 * Sentry Server Configuration
 * 
 * Initializes Sentry for server-side error tracking.
 * Captures API route errors, server component errors, and unhandled exceptions.
 * 
 * @see https://docs.sentry.io/platforms/javascript/guides/nextjs/
 */

import * as Sentry from '@sentry/nextjs';

Sentry.init({
  // DSN is required
  dsn: process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN || '',

  // Environment
  environment: process.env.NODE_ENV || 'development',
  
  // Release tracking
  release: process.env.VERCEL_GIT_COMMIT_SHA || 'development',

  // Performance monitoring - lower sample rate on server
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.05 : 1.0,

  // Debug mode in development
  debug: process.env.NODE_ENV === 'development',

  // Before sending, sanitize sensitive data
  beforeSend(event) {
    // Redact sensitive information from error messages
    if (event.exception?.values) {
      event.exception.values.forEach(value => {
        if (value.stacktrace?.frames) {
          value.stacktrace.frames.forEach(frame => {
            // Remove absolute paths
            if (frame.filename) {
              frame.filename = frame.filename.replace(/^.+\//, '');
            }
          });
        }
      });
    }

    // Remove sensitive request data
    if (event.request) {
      delete event.request.cookies;
      delete event.request.headers?.['authorization'];
      delete event.request.headers?.['x-webhook-secret'];
      delete event.request.headers?.['cookie'];
    }

    return event;
  },

  // Tags for filtering
  initialScope: {
    tags: {
      site: 'zaplit-com',
      runtime: 'nodejs',
    },
  },
});
