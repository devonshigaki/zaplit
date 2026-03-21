/** @type {import('next').NextConfig} */
import withBundleAnalyzer from '@next/bundle-analyzer'

const nextConfig = {
  output: 'standalone',
  
  // Enable SWC minification for smaller bundles
  swcMinify: true,
  
  // Experimental optimizations
  experimental: {
    // Optimize package imports for common heavy libraries
    optimizePackageImports: [
      'framer-motion',
      'recharts',
      '@radix-ui/react-icons',
      'lucide-react',
      'date-fns',
    ],
  },
  
  // Compiler optimizations
  compiler: {
    // Remove console in production
    removeConsole: process.env.NODE_ENV === 'production',
  },
  
  // Image optimization
  images: {
    unoptimized: false,
    formats: ['image/webp', 'image/avif'],
  },
  
  // Headers for security and performance
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
            value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://analytics.google.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self' https://n8n.zaplit.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self';",
          },
          // Performance headers
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on',
          },
        ],
      },
      // Cache static assets
      {
        source: '/_next/static/(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ]
  },
}

// Wrap with bundle analyzer (only enabled when ANALYZE=true)
export default withBundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
})(nextConfig)
