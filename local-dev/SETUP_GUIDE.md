# Local n8n Setup Guide for Zaplit Forms

This guide walks you through setting up a complete local development environment for testing form submissions with n8n.

## Overview

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Next.js App   │────▶│  /api/submit-form │────▶│   Local n8n    │
│  (localhost:3000)│    │  (localhost:3000)│    │ (localhost:5678)│
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

## Prerequisites

- Docker & Docker Compose installed
- Node.js 18+ and pnpm
- Git

## Step-by-Step Setup

### 1. Start n8n (Local Automation Platform)

```bash
cd local-dev

# Start n8n container
docker-compose up -d

# Wait for n8n to be ready (check with)
docker-compose logs -f n8n
```

Once ready, access n8n at: **http://localhost:5678**
- Username: `admin`
- Password: `zaplit-local-dev`

### 2. Import Test Workflows

1. Open n8n at http://localhost:5678
2. Go to **Workflows** → **Import from File**
3. Import these workflow files:
   - `n8n-workflows/consultation-form-workflow.json`
   - `n8n-workflows/contact-form-workflow.json`

4. **Activate** each workflow by clicking the "Active" toggle

### 3. Start the Next.js Development Server

```bash
# In a new terminal, from project root
cd zaplit-com

# Install dependencies (if not done)
pnpm install

# Start dev server
pnpm dev
```

Your site is now running at: **http://localhost:3000**

### 4. Test the Forms

#### Option A: Use the Browser
1. Go to http://localhost:3000/#book-demo
2. Fill out the consultation form
3. Submit and watch n8n executions

#### Option B: Use the Test Script
```bash
cd local-dev

# Test all forms
./test-forms.sh all

# Test specific form
./test-forms.sh consultation
./test-forms.sh contact
./test-forms.sh validation
```

### 5. View Results in n8n

1. Go to http://localhost:5678
2. Click on **Executions** (left sidebar)
3. You should see your form submissions listed
4. Click on any execution to see the full data flow

## Environment Configuration

### Local Development (.env.local)

The `.env.local` files are already configured to point to your local n8n:

```env
N8N_WEBHOOK_CONSULTATION=http://localhost:5678/webhook/consultation
N8N_WEBHOOK_CONTACT=http://localhost:5678/webhook/contact
N8N_WEBHOOK_NEWSLETTER=http://localhost:5678/webhook/newsletter
N8N_WEBHOOK_SECRET=local-dev-secret
```

### Production Environment Variables

When deploying to production, update these environment variables in Cloud Run:

```bash
gcloud run services update zaplit-com \
  --set-env-vars="N8N_WEBHOOK_CONSULTATION=https://your-n8n-instance.com/webhook/consultation,N8N_WEBHOOK_CONTACT=https://your-n8n-instance.com/webhook/contact,N8N_WEBHOOK_SECRET=your-production-secret" \
  --region us-central1 \
  --project zaplit-website-prod
```

## Customizing the Workflows

### Adding Email Notifications

1. In n8n, open the workflow
2. Find the "Send Confirmation Email" node
3. Click on it and configure SMTP credentials:
   - Host: your SMTP server (e.g., smtp.gmail.com)
   - Port: 587
   - User: your email
   - Password: app-specific password

### Adding Slack Notifications

1. Find the "Notify Slack" node
2. Configure Slack credentials:
   - Create a Slack app at https://api.slack.com/apps
   - Add a bot token
   - Invite bot to your channel
   - Add credentials to n8n

### Saving to Google Sheets

1. Find the "Save to Google Sheets" node
2. Configure Google credentials:
   - Go to https://console.cloud.google.com/
   - Create OAuth 2.0 credentials
   - Enable Google Sheets API
   - Add credentials to n8n

## Troubleshooting

### n8n won't start
```bash
# Check Docker is running
docker info

# Reset n8n
docker-compose down -v
docker-compose up -d
```

### Forms can't reach n8n
```bash
# Check n8n is accessible
curl http://localhost:5678/healthz

# Check .env.local has correct URLs
cat ../zaplit-com/.env.local
```

### Test script fails
```bash
# Make sure Next.js is running
curl http://localhost:3000/api/submit-form

# Should return: {"status":"ok",...}
```

### Webhook not receiving data
1. Check webhook path matches environment variable
2. Ensure workflow is "Active"
3. Check n8n execution logs

## Useful Commands

```bash
# Start everything
cd local-dev && ./start-local-dev.sh

# View n8n logs
docker-compose logs -f n8n

# Stop n8n
docker-compose down

# Reset n8n (delete all data)
docker-compose down -v

# Update n8n to latest
docker-compose pull && docker-compose up -d

# Test forms
./test-forms.sh all
```

## Next Steps

1. ✅ Test forms locally
2. ✅ Customize n8n workflows
3. ✅ Set up production n8n instance
4. ✅ Deploy to production with real webhook URLs
5. ✅ Monitor form submissions

## Architecture Notes

### Why This Architecture?

- **Next.js API Route**: Provides rate limiting, validation, and security
- **n8n Webhooks**: Flexible automation without code changes
- **Local Setup**: Test everything before deploying

### Security Features

- Rate limiting (5 req/min per IP)
- Email validation
- Webhook secret verification (optional)
- HTTPS in production
- No sensitive data in client-side code

## Support

For issues:
1. Check n8n logs: `docker-compose logs n8n`
2. Check Next.js console for API errors
3. Verify all environment variables are set
4. Test with: `./test-forms.sh health`
