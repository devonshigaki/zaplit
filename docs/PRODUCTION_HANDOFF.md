# Production Handoff Document

> **Zaplit Website - Ready for Production**

**Date**: March 19, 2026  
**Version**: 1.0.0  
**Status**: ✅ PRODUCTION READY

---

## Executive Summary

The Zaplit website codebase has been consolidated, cleaned, and prepared for production deployment. All documentation, scripts, and configurations are production-ready.

### What's Been Done

1. ✅ **Complete codebase cleanup** - Removed 86 markdown files, 49 shell scripts
2. ✅ **Google Sheets removed** - Simplified to n8n-only workflow
3. ✅ **Production documentation** - Comprehensive guides created
4. ✅ **Security hardened** - Rate limiting, validation, secrets management
5. ✅ **Monitoring configured** - Cloud Monitoring, alerting, runbooks

---

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────────────────────┐
│   Cloudflare│────▶│   Cloud CDN │────▶│       Cloud Run             │
│     DNS     │     │   (optional)│     │  ┌─────────┐  ┌─────────┐   │
└─────────────┘     └─────────────┘     │  │zaplit   │  │zaplit   │   │
                                        │  │  -com   │  │  -org   │   │
                                        │  └────┬────┘  └────┬────┘   │
                                        └───────┼───────────┼──────────┘
                                                │           │
                      ┌─────────────────────────┴───────────┴──────────┐
                      │                                                │
                      ▼                                                ▼
              ┌──────────────┐                                ┌──────────────┐
              │     n8n      │                                │  Secret      │
              │  (Compute    │◀───────────────────────────────│  Manager     │
              │   Engine)    │                                └──────────────┘
              └──────┬───────┘
                     │
         ┌───────────┼───────────┐
         ▼           ▼           ▼
   ┌──────────┐ ┌────────┐ ┌──────────┐
   │  SendGrid│ │ Twenty │ │  Slack   │
   │  (Email) │ │  CRM   │ │(Alerts)  │
   └──────────┘ └────────┘ └──────────┘
```

---

## Quick Start

### Deploy Everything

```bash
# 1. Set up secrets
gcloud secrets create n8n-webhook-secret --data-file=-
gcloud secrets create n8n-webhook-contact --data-file=-
gcloud secrets create n8n-webhook-consultation --data-file=-

# 2. Deploy n8n (see docs/ops/production-deployment.md)

# 3. Deploy websites
pnpm deploy:com
pnpm deploy:org

# 4. Map domains
gcloud beta run domain-mappings create --service=zaplit-com --domain=zaplit.com
```

---

## Documentation Index

| Document | Location | Purpose |
|----------|----------|---------|
| Architecture | `docs/architecture/README.md` | System design |
| Production Deployment | `docs/ops/production-deployment.md` | Step-by-step deploy |
| Monitoring | `docs/ops/monitoring.md` | Observability |
| Production Checklist | `docs/ops/production-readiness-checklist.md` | Final verification |
| n8n Integration | `docs/reference/integrations/n8n.md` | Workflow setup |
| Twenty CRM | `docs/reference/integrations/twenty-crm.md` | CRM integration |
| Form Failure Runbook | `docs/ops/runbooks/form-submission-failure.md` | Troubleshooting |
| Deployment Runbook | `docs/ops/runbooks/deployment-failure.md` | Rollback procedures |

---

## Environment Variables

### Required Secrets (Secret Manager)

```
n8n-webhook-secret
n8n-webhook-contact
n8n-webhook-consultation
n8n-webhook-newsletter (optional)
```

### Cloud Run Environment Variables

```env
NODE_ENV=production
NEXT_TELEMETRY_DISABLED=1
N8N_WEBHOOK_SECRET=projects/*/secrets/n8n-webhook-secret/versions/latest
N8N_WEBHOOK_CONTACT=projects/*/secrets/n8n-webhook-contact/versions/latest
N8N_WEBHOOK_CONSULTATION=projects/*/secrets/n8n-webhook-consultation/versions/latest
```

---

## Testing

### Local Development

```bash
cd zaplit-com && pnpm install && pnpm dev
```

### Test Form Submission

```bash
curl -X POST http://localhost:3000/api/submit-form \
  -H "Content-Type: application/json" \
  -d '{
    "formType": "contact",
    "data": {
      "name": "Test User",
      "email": "test@example.com",
      "message": "Hello"
    }
  }'
```

### Production Test

```bash
pnpm test:forms contact
pnpm test:forms consultation
```

---

## Security Highlights

- **Rate Limiting**: 5 requests/minute per IP
- **Honeypot Fields**: Bot detection
- **Input Validation**: Zod schemas
- **Webhook Secrets**: HMAC verification
- **Secrets Management**: Google Secret Manager
- **HTTPS**: Enforced everywhere

---

## Monitoring & Alerts

### Key Metrics

| Metric | Warning | Critical |
|--------|---------|----------|
| Latency (p99) | >500ms | >1000ms |
| Error Rate | >1% | >5% |
| CPU | >60% | >80% |

### Alert Channels

- Email: alerts@zaplit.com
- Slack: #alerts

---

## Support Contacts

| Role | Contact |
|------|---------|
| Engineering Lead | eng@zaplit.com |
| On-Call | oncall@zaplit.com |
| Product | product@zaplit.com |

---

## Known Limitations

1. Rate limiting uses in-memory store (use Redis for multi-instance)
2. Form submissions are fire-and-forget to n8n (async)
3. No real-time CRM sync status in UI

---

## Post-Handoff Checklist

- [ ] Smoke tests passed
- [ ] Monitoring dashboards reviewed
- [ ] Alerts tested
- [ ] Team trained on runbooks
- [ ] Documentation bookmarked
- [ ] Escalation procedures known

---

**© 2026 Zaplit. All Rights Reserved.**

**This document is confidential and proprietary.**
