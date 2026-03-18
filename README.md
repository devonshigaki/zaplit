# Zaplit Website

> **Proprietary and Confidential** - All rights reserved.

A monorepo containing the official websites for Zaplit - a boutique AI agent agency specializing in white-glove deployment of pre-built agent teams.

## Overview

| Site | Domain | Description |
|------|--------|-------------|
| **zaplit-com** | zaplit.com, www.zaplit.com | Business-facing site for AI agent teams and consulting |
| **zaplit-org** | zaplit.org, www.zaplit.org | Nonprofit/open-source foundation site |

---

## Tech Stack

- **Framework**: [Next.js 14](https://nextjs.org/) with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS + shadcn/ui components
- **Animation**: Framer Motion
- **Icons**: Lucide React
- **Package Manager**: pnpm
- **Deployment**: Google Cloud Run (containerized)
- **Form Backend**: n8n Webhooks

---

## Project Structure

```
zaplit/
├── zaplit-com/          # Business website (zaplit.com)
│   ├── app/
│   │   ├── api/submit-form/   # Form submission API route
│   │   ├── contact/page.tsx   # Contact form
│   │   └── ...
│   ├── components/
│   │   ├── book-demo-section.tsx  # Multi-step consultation form
│   │   └── ui/                    # shadcn/ui components
│   ├── lib/
│   │   ├── form-submission.ts     # Form submission hook
│   │   └── utils.ts
│   ├── public/          # Static assets
│   ├── dist/            # Build output (static export)
│   ├── Dockerfile       # Container config for Cloud Run
│   ├── nginx.conf       # Nginx configuration
│   └── package.json
│
├── zaplit-org/          # Nonprofit website (zaplit.org)
│   └── (same structure)
│
├── .env.example         # Environment variables template
├── LICENSE              # Proprietary license
└── README.md            # This file
```

---

## Quick Start

### Prerequisites

- Node.js 18+
- pnpm (`npm install -g pnpm`)
- Docker & Docker Compose (for local n8n)
- Google Cloud SDK (for deployment)

### Local Development

```bash
# Navigate to either project
cd zaplit-com    # or zaplit-org

# Install dependencies
pnpm install

# Start development server
pnpm dev
```

The dev server runs at `http://localhost:3000`

### Build

```bash
# Static export (creates `dist/` folder)
pnpm build
```

---

## Local Development with n8n

For local testing of form submissions, you can run n8n locally:

```bash
# Start local n8n
cd local-dev
docker-compose up -d

# n8n will be available at http://localhost:5678
# Username: admin
# Password: zaplit-local-dev
```

### Setting Up Local Form Testing

1. **Start n8n:**
   ```bash
   cd local-dev && docker-compose up -d
   ```

2. **Import test workflows:**
   - Open http://localhost:5678
   - Workflows → Import from File
   - Import `n8n-workflows/consultation-form-workflow.json`
   - Import `n8n-workflows/contact-form-workflow.json`
   - Activate each workflow

3. **Start Next.js dev server:**
   ```bash
   cd zaplit-com && pnpm dev
   ```

4. **Test forms:**
   - Go to http://localhost:3000/#book-demo
   - Submit a test consultation form
   - Check n8n Executions to see the data

### Testing with Scripts

```bash
cd local-dev

# Test all forms
./test-forms.sh all

# Test specific form
./test-forms.sh consultation
```

See `local-dev/SETUP_GUIDE.md` for detailed instructions.

---

## Deployment Guide

### Architecture

Both sites are deployed as **containerized Next.js apps** on **Google Cloud Run**:

1. Next.js builds the application
2. Docker container runs Next.js production server on port 8080
3. Cloud Run provides HTTPS + auto-scaling
4. API routes (like `/api/submit-form`) work for form submissions

### GCP Project

- **Project ID**: `zaplit-website-prod`
- **Region**: `us-central1`

### Deploying zaplit-com (zaplit.com)

```bash
cd zaplit-com

# Build static export
pnpm build

# Build and deploy to Cloud Run
gcloud builds submit --tag gcr.io/zaplit-website-prod/zaplit-com

gcloud run deploy zaplit-com \
  --image gcr.io/zaplit-website-prod/zaplit-com \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --project zaplit-website-prod
```

### Deploying zaplit-org (zaplit.org)

```bash
cd zaplit-org

# Build static export
pnpm build

# Build and deploy to Cloud Run
gcloud builds submit --tag gcr.io/zaplit-website-prod/zaplit-org

gcloud run deploy zaplit-org \
  --image gcr.io/zaplit-website-prod/zaplit-org \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --project zaplit-website-prod
```

### Domain Mapping

Domains are mapped to Cloud Run services via domain mappings:

```bash
# View current mappings
gcloud beta run domain-mappings list \
  --project zaplit-website-prod \
  --platform managed

# Example: Map zaplit.com to zaplit-com service
gcloud beta run domain-mappings create \
  --service=zaplit-com \
  --domain=zaplit.com \
  --project zaplit-website-prod \
  --platform managed \
  --region us-central1
```

**Current Domain Mappings:**

| Domain | Service | Status |
|--------|---------|--------|
| zaplit.com | zaplit-com | Active |
| www.zaplit.com | zaplit-com | Active |
| zaplit.org | zaplit-org | Active |
| www.zaplit.org | zaplit-org | Active |

### Cache Busting

If you need to force a fresh deployment (bypass caching), update the `CACHE_BUST` timestamp in the Dockerfile:

```dockerfile
# In Dockerfile
ENV CACHE_BUST=2026-03-18T20:30:00Z
```

Or modify the `Cache-Control` headers in `nginx.conf`.

---

## Form Integration (n8n)

All forms submit to n8n workflows via webhooks for processing, notifications, and CRM integration.

### How It Works

1. User fills out a form (consultation, contact, or newsletter)
2. Form data is sent to `/api/submit-form` (Next.js API route)
3. API route validates data, applies rate limiting
4. Data is forwarded to n8n webhook URL
5. n8n processes the submission (notifications, CRM, etc.)

### Environment Variables

Create `.env.local` in each project root:

```env
# N8N Webhook URLs - Get these from your n8n instance
N8N_WEBHOOK_CONSULTATION=https://your-n8n-instance.com/webhook/consultation
N8N_WEBHOOK_CONTACT=https://your-n8n-instance.com/webhook/contact
N8N_WEBHOOK_NEWSLETTER=https://your-n8n-instance.com/webhook/newsletter

# Optional: Webhook secret for additional security
N8N_WEBHOOK_SECRET=your-secret-key-here
```

### Setting Up n8n Webhooks

1. **Create a Webhook node** in n8n
2. **Set HTTP Method**: POST
3. **Set Response Mode**: `Last Node` or `Response Node`
4. **Copy the Webhook URL** and add it to your `.env.local`
5. **Optional: Add Authentication**
   - Set header name: `X-Webhook-Secret`
   - Set secret value in both n8n and `.env.local`

### Form Data Structure

All forms submit with this JSON structure:

```json
{
  "formType": "consultation|contact|newsletter",
  "data": {
    // Form-specific fields
    "name": "...",
    "email": "...",
    "company": "...",
    // etc.
  },
  "metadata": {
    "submittedAt": "2026-03-18T20:30:00.000Z",
    "source": "zaplit-com|zaplit-org",
    "url": "https://zaplit.com/book-demo",
    "ip": "xxx.xxx.xxx.xxx",
    "userAgent": "Mozilla/5.0..."
  }
}
```

### Forms Available

| Form | Location | Form Type | Fields |
|------|----------|-----------|--------|
| **Consultation** | `/#book-demo` | `consultation` | Name, company, email, role, team size, tech stack, security level, compliance, message |
| **Contact** | `/contact` | `contact` | Name, email, company, message |
| **Newsletter** | `/blog` | `newsletter` | Email only |

### Security Features

- **Rate limiting**: 5 submissions per IP per minute
- **Email validation**: Required for all forms
- **Field validation**: Required fields enforced server-side
- **Optional webhook secret**: HMAC header verification
- **HTTPS only**: All webhook URLs must use HTTPS

### Testing Forms Locally

```bash
# Start dev server
cd zaplit-com && pnpm dev

# Test API health
curl http://localhost:3000/api/submit-form

# Test form submission
curl -X POST http://localhost:3000/api/submit-form \
  -H "Content-Type: application/json" \
  -d '{
    "formType": "contact",
    "data": {
      "name": "Test User",
      "email": "test@example.com",
      "message": "Hello from test"
    },
    "metadata": {"url": "http://localhost:3000/contact"}
  }'
```

---

## Key Components

### Background Boxes (Animated Grid)

The `book-demo` section features an animated isometric tile background:

- Component: `components/ui/background-boxes.tsx`
- 150x100 grid of tiles with hover effects
- Isometric transform: `skewX(-48deg) skewY(14deg) scale(0.675)`

### Multi-step Form

The consultation booking form (`components/book-demo-section.tsx`):
- Step 1: Contact information
- Step 2: Tech stack selection
- Step 3: Security requirements
- Submits to n8n webhook for processing

---

## Development Notes

### Adding shadcn/ui Components

```bash
npx shadcn add button card input
```

### Build Output

Both projects use **static export** (`output: 'export'` in `next.config.mjs`):
- Build creates `dist/` folder
- No server-side rendering at runtime
- All pages pre-rendered to HTML

### Troubleshooting

**Build fails with "dist folder not found":**
- Run `pnpm build` before deployment

**Styles not updating on deploy:**
- Clear browser cache
- Update `CACHE_BUST` in Dockerfile
- Redeploy

**Domain shows old version:**
- Check domain mapping points to correct service
- SSL certificate provisioning may take 2-5 minutes

**Form submissions failing:**
- Check `N8N_WEBHOOK_*` environment variables are set
- Verify webhook URLs are accessible
- Check Cloud Run logs for errors

---

## License & Ownership

**© 2026 Zaplit. All Rights Reserved.**

This software is proprietary and confidential. Unauthorized copying, distribution, or use of this software, via any medium, is strictly prohibited without express written permission from Zaplit.

The code, designs, and assets in this repository are the exclusive property of Zaplit.

---

## Contact

For deployment issues or technical questions:
- Zaplit Team
- hi@zaplit.com
