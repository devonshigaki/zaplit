# Zaplit Integration Setup Guide

**Last Updated:** March 20, 2026  
**Version:** v2.13.0

## Overview

This guide walks through setting up the complete integration chain:

```
Forms (Next.js) → n8n → Twenty CRM + Brevo Email
```

## Prerequisites

- Access to GCP Console
- Access to n8n instance (n8n.zaplit.com)
- Access to Twenty CRM (crm.zaplit.com)
- Access to Brevo Dashboard
- Access to Cloudflare DNS

## Step 1: Configure n8n Webhooks

### 1.1 Create Consultation Form Workflow

1. Log into n8n at `https://n8n.zaplit.com`
2. Create new workflow
3. Add **Webhook** node:
   - Method: POST
   - Path: `consultation-form-v4`
   - Response Mode: Last Node
   - Save the webhook URL (e.g., `https://n8n.zaplit.com/webhook/consultation-form-v4`)
4. Import workflow from `workflows/n8n-workflow-v4-parallel.json`
5. Set webhook secret in n8n (Settings → Webhook)
6. Activate workflow

### 1.2 Create Contact Form Workflow

1. Create new workflow
2. Add Webhook node:
   - Method: POST
   - Path: `contact-form`
3. Configure similar to consultation workflow
4. Save webhook URL

### 1.3 Create Newsletter Workflow

1. Create new workflow
2. Add Webhook node:
   - Method: POST
   - Path: `newsletter-signup`
3. Configure for newsletter subscriptions
4. Save webhook URL

## Step 2: Configure Twenty CRM

### 2.1 Get API Key

1. Log into Twenty CRM at `https://crm.zaplit.com`
2. Go to Settings → API Keys
3. Generate new API key
4. Save the key securely

### 2.2 Verify CRM Endpoints

Test the connection:

```bash
curl -X GET \
  https://crm.zaplit.com/rest/people \
  -H "Authorization: Bearer YOUR_API_KEY"
```

## Step 3: Configure Brevo Email

### 3.1 Get API Credentials

1. Log into Brevo Dashboard
2. Go to Settings → SMTP & API → API Keys
3. Create new API v3 key → Save as `BREVO_API_KEY`
4. Copy SMTP key → Save as `BREVO_SMTP_KEY`

### 3.2 Complete DNS Setup

Add DKIM record to Cloudflare:

```
Type: TXT
Name: mail._domainkey
Value: [Get from Hestia CP → Mail → Domain → DKIM]
```

Request PTR record from GCP Support:

```
Subject: PTR Record Request for 136.113.99.87
Body: Please set PTR for 136.113.99.87 to mail.zaplit.com
```

### 3.3 Configure Hestia SMTP Relay

Run on Hestia server:

```bash
# Set environment variables
export BREVO_EMAIL=your-email@brevo.com
export BREVO_SMTP_KEY=your-smtp-key

# Run setup script
./setup-brevo-relay.sh
```

## Step 4: GCP Secret Manager Setup

### 4.1 Create Secrets

```bash
# Set project
gcloud config set project zaplit-production

# Create secrets
gcloud secrets create n8n-webhook-secret --data-file=<(echo -n "$(openssl rand -hex 32)")
gcloud secrets create ip-hash-salt --data-file=<(echo -n "$(openssl rand -hex 32)")
gcloud secrets create twenty-api-key --data-file=<(echo -n "YOUR_TWENTY_API_KEY")
gcloud secrets create brevo-api-key --data-file=<(echo -n "YOUR_BREVO_API_KEY")
gcloud secrets create brevo-smtp-key --data-file=<(echo -n "YOUR_BREVO_SMTP_KEY")
gcloud secrets create sentry-dsn --data-file=<(echo -n "YOUR_SENTRY_DSN")
```

### 4.2 Grant Access

```bash
# Grant Cloud Run service account access
gcloud secrets add-iam-policy-binding n8n-webhook-secret \
  --member="serviceAccount:zaplit-com@zaplit-production.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

# Repeat for all secrets
```

## Step 5: Deploy Application

### 5.1 Update Environment Variables

```bash
# In zaplit-com directory
cp .env.production.example .env.production

# Edit .env.production with real values
# Use __SECRET_FROM_GCP_SECRET_MANAGER__ for secrets
```

### 5.2 Deploy to Cloud Run

```bash
gcloud run deploy zaplit-com \
  --source . \
  --set-secrets=N8N_WEBHOOK_SECRET=n8n-webhook-secret:latest,IP_HASH_SALT=ip-hash-salt:latest,TWENTY_API_KEY=twenty-api-key:latest,BREVO_API_KEY=brevo-api-key:latest \
  --set-env-vars="N8N_WEBHOOK_CONSULTATION=https://n8n.zaplit.com/webhook/consultation-form-v4,N8N_WEBHOOK_CONTACT=https://n8n.zaplit.com/webhook/contact-form"
```

## Step 6: End-to-End Testing

### 6.1 Test Form Submission

1. Visit deployed website
2. Submit consultation form
3. Verify:
   - Form shows success message
   - n8n workflow executed
   - CRM has new person/company
   - Audit log created

### 6.2 Test Error Handling

1. Temporarily break n8n webhook URL
2. Submit form
3. Verify graceful error handling
4. Check logs for proper error messages

### 6.3 Test Rate Limiting

1. Submit form rapidly (>5 times/minute)
2. Verify rate limit kicks in
3. Check 429 response with Retry-After header

## Troubleshooting

### Forms Not Reaching n8n

```bash
# Check n8n webhook logs
curl -X POST https://n8n.zaplit.com/webhook/consultation-form-v4 \
  -H "Content-Type: application/json" \
  -d '{"test": true}'
```

### CRM Not Creating Records

```bash
# Test CRM API directly
curl -X POST https://crm.zaplit.com/rest/people \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": {"firstName": "Test", "lastName": "User"}, "emails": [{"email": "test@example.com"}]}'
```

### Email Not Sending

```bash
# Test Brevo SMTP
telnet smtp-relay.brevo.com 587
# Should connect successfully

# Check Hestia mail logs
tail -f /var/log/exim4/mainlog
```

## Environment Variable Reference

| Variable | Source | Required |
|----------|--------|----------|
| N8N_WEBHOOK_CONSULTATION | n8n webhook URL | Yes |
| N8N_WEBHOOK_CONTACT | n8n webhook URL | Yes |
| N8N_WEBHOOK_NEWSLETTER | n8n webhook URL | Yes |
| N8N_WEBHOOK_SECRET | `openssl rand -hex 32` | Yes |
| IP_HASH_SALT | `openssl rand -hex 32` | Yes |
| TWENTY_API_KEY | Twenty CRM Settings | Yes |
| BREVO_API_KEY | Brevo Dashboard | For email |
| BREVO_SMTP_KEY | Brevo Dashboard | For email |
| SENTRY_DSN | Sentry Project | Recommended |

## Integration Verification Checklist

- [ ] n8n webhooks responding to test requests
- [ ] Twenty CRM API responding with valid auth
- [ ] Brevo SMTP relay working from Hestia
- [ ] All DNS records propagated (DKIM, PTR)
- [ ] Form submissions create CRM records
- [ ] Rate limiting functional
- [ ] Error handling graceful
- [ ] Audit logs recording submissions
- [ ] Email confirmations sending (if configured)
