# Operations

> **Deployment, infrastructure, and operational procedures**

## Quick Links

| Document | Purpose |
|----------|---------|
| [Production Deployment](./production-deployment.md) | Complete production deployment guide |
| [Monitoring & Alerts](./monitoring.md) | Observability and alerting |
| [Local Development](./local-development.md) | Local dev environment setup |

## Stack

| Component | Technology | Deployment |
|-----------|------------|------------|
| Websites | Next.js 16 | Cloud Run |
| Workflows | n8n | Compute Engine VM |
| CRM | Twenty | Cloud Run |
| Secrets | Secret Manager | GCP |
| Monitoring | Cloud Monitoring | GCP |

## Production Architecture

```
Cloudflare DNS → Cloud Run (zaplit-com, zaplit-org)
                        │
                        └──► n8n VM (workflow automation)
                                    │
                                    ├──► Twenty CRM
                                    ├──► SendGrid (email)
                                    └──► Slack (alerts)
```

## Environment Setup

### Required Secrets

Create in Secret Manager:

```bash
gcloud secrets create n8n-webhook-secret --data-file=-
gcloud secrets create n8n-webhook-contact --data-file=-
gcloud secrets create n8n-webhook-consultation --data-file=-
gcloud secrets create sendgrid-api-key --data-file=-
```

### Environment Variables

```env
# Next.js
NODE_ENV=production
NEXT_TELEMETRY_DISABLED=1

# n8n Webhooks (references to Secret Manager)
N8N_WEBHOOK_CONSULTATION=projects/*/secrets/n8n-webhook-consultation/versions/latest
N8N_WEBHOOK_CONTACT=projects/*/secrets/n8n-webhook-contact/versions/latest
N8N_WEBHOOK_SECRET=projects/*/secrets/n8n-webhook-secret/versions/latest
```

## Commands

### Deploy

```bash
# Deploy everything
pnpm deploy:com
pnpm deploy:org

# Deploy single service
gcloud run deploy zaplit-com --image gcr.io/.../zaplit-com
```

### Monitor

```bash
# View logs
gcloud logging read "resource.type=cloud_run_revision" --limit=50

# Check metrics
gcloud monitoring metrics list | grep cloud_run
```

## Support

- **Production issues**: Follow [runbooks](./runbooks/)
- **Deployment help**: See [production-deployment.md](./production-deployment.md)
- **Monitoring**: See [monitoring.md](./monitoring.md)

---

**© 2026 Zaplit. All Rights Reserved.**
