# n8n Integration

> **Workflow automation for form processing**

## Overview

n8n handles all form submissions with:
- Email notifications (SendGrid)
- CRM integration (Twenty)
- Slack alerts
- Error handling and retries

## Architecture

```
Form Submit → Next.js API → n8n Webhook
                                      │
                    ┌─────────────────┼─────────────────┐
                    │                 │                 │
                    ▼                 ▼                 ▼
              ┌──────────┐     ┌──────────┐     ┌──────────┐
              │ SendGrid │     │  Twenty  │     │  Slack   │
              │  (Email) │     │   CRM    │     │ (Alerts) │
              └──────────┘     └──────────┘     └──────────┘
```

## Production Deployment

n8n runs on **Compute Engine VM** (not Cloud Run) for:
- Queue mode support (high volume)
- Persistent storage
- Full workflow execution control

See [Production Deployment](../../ops/production-deployment.md) for setup.

## Webhook Configuration

### Next.js API Route

```typescript
// app/api/submit-form/route.ts
export async function POST(request: Request) {
  const body = await request.json();
  
  const webhookUrl = process.env[`N8N_WEBHOOK_${body.formType.toUpperCase()}`];
  
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Webhook-Secret': process.env.N8N_WEBHOOK_SECRET
    },
    body: JSON.stringify(body)
  });
  
  return Response.json({ success: response.ok });
}
```

### Security

All webhooks validate `X-Webhook-Secret` header.

```typescript
// In n8n Function node
const secret = $env.WEBHOOK_SECRET;
const header = $input.headers['x-webhook-secret'];

if (header !== secret) {
  return [{ json: { error: 'Unauthorized' } }];
}
```

## Form Data Structure

```json
{
  "formType": "consultation|contact|newsletter",
  "data": {
    "name": "John Doe",
    "email": "john@example.com",
    "company": "Acme Inc"
  },
  "metadata": {
    "submittedAt": "2026-03-19T12:00:00Z",
    "source": "zaplit-com",
    "url": "https://zaplit.com/contact",
    "ip": "xxx.xxx.xxx.xxx"
  }
}
```

## Workflows

### Contact Form Workflow

**Trigger**: `POST /webhook/contact`

**Nodes**:
1. Webhook (validates secret)
2. SendGrid (notification email)
3. Twenty CRM (create contact)
4. Slack (team alert)

### Consultation Form Workflow

**Trigger**: `POST /webhook/consultation`

**Nodes**:
1. Webhook
2. Data transformation
3. Twenty CRM (create company + contact + opportunity)
4. SendGrid (confirmation email)
5. Slack (sales alert)

## Error Handling

### Retry Logic

Configure in n8n workflow settings:
- **Mode**: Exponential Backoff
- **Retries**: 3
- **Initial Delay**: 1s
- **Max Delay**: 30s

### Error Workflow

Create `Error Handler` workflow:
- Trigger: Error
- Actions: Log to Slack, send email alert

## Testing

```bash
# Test webhook
curl -X POST https://n8n.yourdomain.com/webhook/contact \
  -H "X-Webhook-Secret: your-secret" \
  -H "Content-Type: application/json" \
  -d '{
    "formType": "contact",
    "data": {"name":"Test","email":"test@example.com","message":"Hello"}
  }'
```

## Monitoring

- **Executions**: Check n8n Executions tab
- **Metrics**: Prometheus endpoint at `/metrics`
- **Health**: `GET /healthz` → `{"status":"ok"}`

## Backup

n8n workflows are stored in:
- SQLite (default): `/home/node/.n8n/database.sqlite`
- Postgres (production): Configured DB

**Backup strategy**: Export workflows to JSON weekly.

---

**Related**: [Production Deployment](../../ops/production-deployment.md), [Twenty CRM](./twenty-crm.md)
