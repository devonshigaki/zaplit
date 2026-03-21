/**
 * Sentry Client Configuration
 * 
 * Initializes Sentry for client-side error tracking and performance monitoring.
 * Captures React component errors, unhandled promise rejections, and Web Vitals.
 * 
 * @see https://docs.sentry.io/platforms/javascript/guides/nextjs/
 */

import * as Sentry from '@sentry/nextjs';

Sentry.init({
  // DSN is required - falls back to empty string if not set (Sentry will be disabled)
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN || '',

  // Environment
  environment: process.env.NODE_ENV || 'development',
  
  // Release tracking for source maps
  release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || 'development',

  // Performance monitoring
  // Sample rate: 10% of transactions in production
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // Session replay for debugging user interactions
  // Sample 10% of sessions, 100% of error sessions
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,

  // Debug mode in development
  debug: process.env.NODE_ENV === 'development',

  // Before sending, sanitize any potentially sensitive data
  beforeSend(event) {
    // Remove sensitive headers
    if (event.request?.headers) {
      delete event.request.headers['authorization'];
      delete event.request.headers['cookie'];
      delete event.request.headers['x-webhook-secret'];
    }

    // Remove sensitive URL parameters
    if (event.request?.url) {
      try {
        const url = new URL(event.request.url);
        // Remove query parameters that might contain sensitive data
        ['token', 'password', 'secret', 'key'].forEach(param => {
          url.searchParams.delete(param);
        });
        event.request.url = url.toString();
      } catch {
        // If URL parsing fails, keep original
      }
    }

    return event;
  },

  // Ignore certain errors that are not actionable
  ignoreErrors: [
    // Browser extensions
    /^.*(chrome|moz)-extension:\/\/.*$/i,
    // Network errors that are typically transient
    'Network Error',
    'Failed to fetch',
    // Known third-party script errors
    'ResizeObserver loop limit exceeded',
  ],

  // Tags for filtering and grouping
  initialScope: {
    tags: {
      site: 'zaplit-com',
    },
  },
});
