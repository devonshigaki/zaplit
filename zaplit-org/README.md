# Zaplit.org

The organization website for Zaplit - showcasing open source contributions, community initiatives, and company information.

## Overview

This Next.js application serves as the community-facing website for Zaplit, featuring:

- **About Section** - Company mission and values
- **Open Source** - GitHub repositories and contributions
- **Community** - Events, meetups, and initiatives
- **Team** - Team members and careers
- **Contact Forms** - Partnership inquiries and newsletter signup

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript 5.7
- **Styling**: Tailwind CSS 4
- **UI Components**: Radix UI primitives + shadcn/ui
- **Forms**: React Hook Form + Zod validation
- **Animation**: Framer Motion
- **Icons**: Lucide React
- **Analytics**: Vercel Analytics

## Getting Started

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Build for production
pnpm build

# Run type checking
pnpm typecheck

# Run linter
pnpm lint

# Run tests
pnpm test
```

## Environment Variables

Copy `.env.example` to `.env.local` and configure:

```bash
# Required for form submissions
N8N_WEBHOOK_URL=https://your-n8n-instance.com/webhook/form-submission
N8N_WEBHOOK_SECRET=your-webhook-secret

# Security
IP_HASH_SALT=your-random-salt

# Optional: Logo.dev token for integration icons
NEXT_PUBLIC_LOGO_TOKEN=your-logo-dev-token
```

## Project Structure

```
zaplit-org/
├── app/                 # Next.js App Router
│   ├── api/            # API routes (health, submit-form)
│   ├── about/          # About page
│   ├── opensource/     # Open source showcase
│   ├── globals.css     # Global styles
│   ├── layout.tsx      # Root layout
│   └── page.tsx        # Home page
├── components/         # React components
│   ├── ui/            # shadcn/ui components
│   └── *.tsx          # Page sections
├── lib/               # Utilities and helpers
│   ├── api/           # API utilities
│   └── utils.ts       # Helper functions
└── public/            # Static assets
```

## Key Features

### Form Handling
- **Zod Validation**: Strict input validation on all forms
- **Rate Limiting**: IP-based rate limiting (5 req/min)
- **XSS Protection**: Input sanitization before processing
- **n8n Integration**: Webhook submission to workflow automation

### Performance
- **Image Optimization**: Next.js Image component with WebP/AVIF
- **Bundle Analysis**: Built-in bundle analyzer (`ANALYZE=true pnpm build`)
- **Standalone Output**: Optimized for Cloud Run deployment

### Security
- **Security Headers**: CSP, HSTS, X-Frame-Options, etc.
- **Input Sanitization**: XSS prevention on all user inputs
- **IP Hashing**: Privacy-compliant IP anonymization
- **Request Size Limit**: 1MB body parser limit

## API Routes

### POST /api/submit-form
Submits form data to n8n webhook with validation and rate limiting.

### GET /api/health
Health check endpoint for monitoring.

### GET /api/health/ready
Readiness probe for Kubernetes/Cloud Run.

## Testing

```bash
# Run unit tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run with coverage
pnpm test:coverage
```

## Deployment

This app is configured for deployment to Google Cloud Run:

```bash
# Build standalone output
pnpm build

# Deploy to Cloud Run
gcloud run deploy zaplit-org --source .
```

## License

Copyright (c) 2026 Zaplit. All rights reserved.
