# GCP Deployment

Google Cloud Platform deployment configurations for Zaplit applications.

## Overview

This directory contains Terraform configurations and deployment scripts for provisioning infrastructure on Google Cloud Platform.

## Directory Structure

```
gcp-deployment/
├── cloudrun/         # Cloud Run service configurations
├── hestia/           # Hestia deployment configs
├── terraform/        # Terraform modules (legacy)
└── README.md
```

## Cloud Run

The `cloudrun/` directory contains optimized configurations for deploying Next.js applications to Cloud Run.

### Configuration

- **Memory**: 512Mi (zaplit-com), 256Mi (zaplit-org)
- **CPU**: 1 vCPU
- **Concurrency**: 80 requests per instance
- **Scaling**: 0-100 instances (scale-to-zero enabled)

### Deployment

```bash
# Deploy zaplit-com
gcloud run deploy zaplit-com \
  --source ./zaplit-com \
  --region us-central1 \
  --platform managed

# Deploy zaplit-org
gcloud run deploy zaplit-org \
  --source ./zaplit-org \
  --region us-central1 \
  --platform managed
```

## Environment Variables

Required environment variables for deployment:

```bash
# n8n Integration
N8N_WEBHOOK_CONSULTATION
N8N_WEBHOOK_CONTACT
N8N_WEBHOOK_NEWSLETTER
N8N_WEBHOOK_SECRET

# Security
IP_HASH_SALT

# Monitoring (optional)
SENTRY_DSN
```

## Secrets Management

Sensitive values should be stored in GCP Secret Manager:

```bash
# Create secret
gcloud secrets create n8n-webhook-secret \
  --data-file=- <<< "your-secret-value"

# Grant access
gcloud secrets add-iam-policy-binding n8n-webhook-secret \
  --member="serviceAccount:zaplit@project.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

## CI/CD Integration

Deployment is automated via GitHub Actions:

- `.github/workflows/deploy-zaplit-com.yml`
- `.github/workflows/deploy-zaplit-org.yml`

See workflow files for detailed deployment steps.

## Monitoring

Cloud Run services are monitored via:
- Cloud Monitoring (metrics and alerts)
- Cloud Logging (application logs)
- Health check endpoints (`/api/health`, `/api/health/ready`)

## Troubleshooting

### Common Issues

1. **Build failures**: Check `gcloud builds log [BUILD_ID]`
2. **Memory limits**: Increase memory allocation if OOM errors
3. **Cold starts**: Consider minimum instances for critical services

### Useful Commands

```bash
# View logs
gcloud logging tail "resource.type=cloud_run_revision" \
  --format="value(textPayload)"

# List revisions
gcloud run revisions list --service=zaplit-com

# Rollback
gcloud run services update-traffic zaplit-com \
  --to-revisions=[REVISION]=100
```
