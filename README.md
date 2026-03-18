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

---

## Project Structure

```
zaplit/
├── zaplit-com/          # Business website (zaplit.com)
│   ├── app/             # Next.js App Router pages
│   ├── components/      # React components
│   │   └── ui/          # shadcn/ui components
│   ├── public/          # Static assets
│   ├── dist/            # Build output (static export)
│   ├── Dockerfile       # Container config for Cloud Run
│   ├── nginx.conf       # Nginx configuration
│   └── package.json
│
├── zaplit-org/          # Nonprofit website (zaplit.org)
│   └── (same structure)
│
└── README.md            # This file
```

---

## Quick Start

### Prerequisites

- Node.js 18+
- pnpm (`npm install -g pnpm`)
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

## Deployment Guide

### Architecture

Both sites are deployed as **containerized static sites** on **Google Cloud Run**:

1. Next.js builds to static HTML (`dist/`)
2. Nginx serves the static files
3. Docker container is built and pushed to Cloud Run
4. Cloud Run provides HTTPS + auto-scaling

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

---

## Environment Variables

Create `.env.local` in each project root if needed:

```env
# Example - add actual secrets as needed
NEXT_PUBLIC_ANALYTICS_ID=your_id
```

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
