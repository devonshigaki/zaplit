/**
 * Sentry Edge Configuration
 * 
 * Initializes Sentry for Edge runtime (middleware, edge API routes).
 * Required for Next.js middleware and edge runtime support.
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

  // Lower sample rate for edge runtime
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.05 : 1.0,

  // Tags for filtering
  initialScope: {
    tags: {
      site: 'zaplit-org',
      runtime: 'edge',
    },
  },
});
