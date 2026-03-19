# Architecture

> **System architecture for the Zaplit dual-website deployment**

## Overview

Two Next.js applications on Google Cloud Run with n8n workflow automation and Twenty CRM.

| Site | Domain | Purpose |
|------|--------|---------|
| **zaplit-com** | zaplit.com | Business-facing site |
| **zaplit-org** | zaplit.org | Nonprofit foundation |

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16.1.6 |
| Runtime | React 19.2.4 |
| Language | TypeScript 5.7.3 (Strict) |
| Styling | Tailwind CSS 4.2.0 |
| UI | shadcn/ui |
| Deployment | Google Cloud Run |
| Workflows | n8n |
| CRM | Twenty CRM |

## System Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   User      │────▶│  Cloudflare │────▶│  Cloud Run  │
│             │     │    DNS      │     │             │
└─────────────┘     └─────────────┘     │ ┌─────────┐ │
                                        │ │zaplit   │ │
                                        │ │  -com   │ │
                                        │ └─────────┘ │
                                        │ ┌─────────┐ │
                                        │ │zaplit   │ │
                                        │ │  -org   │ │
                                        │ └────┬────┘ │
                                        └──────┼──────┘
                                               │
                                        ┌──────┴──────┐
                                        │             │
                                        ▼             ▼
                                 ┌──────────┐  ┌──────────┐
                                 │    n8n   │  │  Twenty  │
                                 │Workflows │  │   CRM    │
                                 └──────────┘  └──────────┘
```

## Data Flow

### Form Submission

1. User submits form (React Hook Form + Zod)
2. Client validation
3. POST to `/api/submit-form`
4. Server validation + rate limiting
5. Forward to n8n webhook
6. n8n processes:
   - Email notifications (SendGrid/Gmail)
   - CRM integration (Twenty)
   - Slack notifications

## Component Architecture

```
app/
├── layout.tsx              # Root layout
├── page.tsx                # Homepage
├── globals.css             # Tailwind styles
├── api/
│   └── submit-form/
│       └── route.ts        # Form handler
├── contact/
│   └── page.tsx            # Contact form
└── ...                     # Other routes

components/
├── ui/                     # shadcn primitives
├── hero.tsx                # Hero section
└── book-demo-section.tsx   # Consultation form
```

## Security

- Rate limiting: 5 req/min per IP
- Input validation: Zod schemas
- Webhook secrets: HMAC verification
- HTTPS enforced
- Secrets: Google Secret Manager

## GCP Resources

| Resource | Purpose |
|----------|---------|
| Cloud Run | Container hosting |
| Cloud Build | CI/CD |
| Secret Manager | Secrets |
| Cloud Monitoring | Logs, metrics |

---

**Related**: [Operations](../ops/), [Integrations](../reference/integrations/)
