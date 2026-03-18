# Local n8n Development Environment

This directory contains everything needed to run n8n locally for testing form submissions from the Zaplit websites.

## Quick Start

```bash
cd local-dev

# Start n8n
docker-compose up -d

# View logs
docker-compose logs -f n8n

# Stop n8n
docker-compose down
```

## Access n8n

- **URL:** http://localhost:5678
- **Username:** `admin`
- **Password:** `zaplit-local-dev`

## Webhook URLs for Local Testing

When creating webhooks in n8n for local testing, use these URLs:

| Form Type | Webhook URL (local) |
|-----------|---------------------|
| Consultation | `http://localhost:5678/webhook/consultation` |
| Contact | `http://localhost:5678/webhook/contact` |
| Newsletter | `http://localhost:5678/webhook/newsletter` |

## Testing Forms Locally

1. **Start n8n:**
   ```bash
   cd local-dev && docker-compose up -d
   ```

2. **Start the Next.js dev server:**
   ```bash
   cd zaplit-com && pnpm dev
   ```

3. **Create a test workflow in n8n:**
   - Go to http://localhost:5678
   - Create new workflow
   - Add Webhook node
   - Set Method to POST
   - Set Path to `consultation`
   - Copy the webhook URL
   - Save workflow

4. **Set environment variables:**
   ```bash
   # In zaplit-com/.env.local
   N8N_WEBHOOK_CONSULTATION=http://localhost:5678/webhook/consultation
   N8N_WEBHOOK_CONTACT=http://localhost:5678/webhook/contact
   N8N_WEBHOOK_NEWSLETTER=http://localhost:5678/webhook/newsletter
   ```

5. **Test the form:**
   - Go to http://localhost:3000/#book-demo
   - Fill out and submit the form
   - Check n8n executions for the webhook trigger

## Switching to Production

When ready to deploy, simply update the environment variables:

```bash
# Production n8n instance
N8N_WEBHOOK_CONSULTATION=https://your-n8n-instance.com/webhook/consultation
N8N_WEBHOOK_CONTACT=https://your-n8n-instance.com/webhook/contact
N8N_WEBHOOK_NEWSLETTER=https://your-n8n-instance.com/webhook/newsletter
N8N_WEBHOOK_SECRET=your-production-secret
```

## Useful Commands

```bash
# View n8n logs
docker-compose logs -f n8n

# Reset n8n data (start fresh)
docker-compose down -v && docker-compose up -d

# Update n8n to latest version
docker-compose pull && docker-compose up -d

# Backup n8n data
docker run --rm -v zaplit_n8n_data:/source -v $(pwd):/backup alpine tar czf /backup/n8n-backup.tar.gz -C /source .
```

## Troubleshooting

**n8n not starting:**
```bash
docker-compose down
docker-compose up -d
docker-compose logs n8n
```

**Webhook not receiving data:**
- Check webhook is set to POST method
- Verify webhook path matches environment variable
- Check n8n workflow is active
- Look at execution logs in n8n

**Forms can't reach n8n:**
- Ensure both are on same network (localhost)
- Check firewall isn't blocking port 5678
- Verify `.env.local` has correct URLs
