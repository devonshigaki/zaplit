# n8n Integration

## Webhook URLs

| Form | Webhook URL |
|------|-------------|
| Consultation | `https://n8n.zaplit.com/webhook/consultation` |
| Contact | `https://n8n.zaplit.com/webhook/contact` |
| Newsletter | `https://n8n.zaplit.com/webhook/newsletter` |

## Workflow

1. Receive webhook from zaplit-com
2. Create Person in Twenty CRM
3. Create Company (if new)
4. Create Note with message
5. Return success

## Environment

```bash
N8N_WEBHOOK_SECRET=<random-string>
TWENTY_BASE_URL=https://crm.zaplit.com
TWENTY_API_KEY=<jwt>
```
