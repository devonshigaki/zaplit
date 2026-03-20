# Architecture

## Overview

Zaplit is an AI agent teams deployment platform built with:

- **Next.js 16** + **React 19** - Frontend framework
- **TypeScript 5.7** (Strict) - Type safety
- **Tailwind CSS 4** - Styling
- **Google Cloud Run** - Serverless hosting
- **n8n** - Workflow automation (self-hosted on GCP VM)
- **Twenty CRM** - Contact management (self-hosted)

## Directory Structure

```
zaplit-com/          # Main marketing site (zaplit.com)
zaplit-org/          # Org site (zaplit.org)
docs/                # Documentation
├── architecture/    # System design
├── ops/            # Deployment & runbooks
├── development/    # Coding standards
├── security/       # Security policies
└── reference/      # FAQ & integrations
```

## Data Flow

```
User Form → zaplit-com API → n8n Webhook → Twenty CRM
```

Forms: Contact, Consultation, Newsletter

## Key Decisions

### ADR-001: Two Separate Apps
- **Context**: zaplit-com (marketing) and zaplit-org (content) have different purposes
- **Decision**: Keep as separate Next.js apps with shared components
- **Consequences**: Independent deployment, no shared state issues

### ADR-002: n8n for Workflow Automation
- **Context**: Need to connect forms to CRM without custom backend
- **Decision**: Use self-hosted n8n on GCP VM
- **Consequences**: Visual workflow editing, easy to modify, vendor-independent

## Infrastructure

| Component | Platform | Status |
|-----------|----------|--------|
| zaplit-com | Cloud Run | ✅ Live |
| zaplit-org | Cloud Run | ✅ Live |
| n8n | GCP VM | ✅ Live |
| Twenty CRM | Cloud Run | ✅ Live |
| Hestia CP | GCP VM | ✅ Ready |

## Environment

- **Node**: 20.x
- **Package Manager**: pnpm
- **Strict TypeScript**: Enabled
