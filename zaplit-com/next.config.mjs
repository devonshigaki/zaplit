/** @type {import('next').NextConfig} */

import bundleAnalyzer from '@next/bundle-analyzer';
import { withSentryConfig } from '@sentry/nextjs';

// Bundle analyzer - run with ANALYZE=true pnpm build
const withBundleAnalyzer = process.env.ANALYZE === 'true'
  ? bundleAnalyzer({ enabled: true })
  : (config) => config;

const nextConfig = {
  output: 'standalone',
  images: {
    unoptimized: false,
    formats: ['image/webp', 'image/avif'],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'img.logo.dev',
        pathname: '/**',
      },
    ],
  },
  
  // API configuration
  api: {
    bodyParser: {
      sizeLimit: 1024 * 1024, // 1MB in bytes
    },
  },
  
  // Optimize bundle size for heavy dependencies
  experimental: {
    optimizePackageImports: [
      'framer-motion',
      'lucide-react',
    ],
  },
  
  // Security headers
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains; preload',
          },
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://img.logo.dev; font-src 'self'; connect-src 'self' https://n8n.zaplit.com https://*.sentry.io;",
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
          },
        ],
      },
    ];
  },
}

// Sentry configuration
const sentryWebpackPluginOptions = {
  // Sentry organization and project
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Transpiles SDK to be compatible with IE11 (increases bundle size)
  transpileClientSDK: false,

  // Hides source maps from generated client bundles
  hideSourceMaps: true,

  // Automatically tree-shake Sentry logger statements to reduce bundle size
  disableLogger: true,

  // Enables automatic instrumentation of Vercel Cron Monitors
  automaticVercelMonitors: true,
};

// Compose the configuration - apply Sentry, then bundle analyzer
const config = withSentryConfig(nextConfig, sentryWebpackPluginOptions);
export default withBundleAnalyzer(config);
