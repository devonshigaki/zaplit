# n8n Workflows

Production workflow configurations for form processing.

## Workflows

### 1. Contact Form Workflow
**File**: `contact-form-workflow.json`

**Purpose**: Process contact form submissions

**Trigger**: Webhook POST to `/webhook/contact`

**Flow**:
1. Receive webhook
2. Validate data
3. Send notification email
4. Create/Update contact in Twenty CRM
5. Send Slack notification

**Environment Variables Required**:
- `TWENTY_API_KEY`
- `TWENTY_API_URL`
- `SENDGRID_API_KEY` or `GMAIL_CREDENTIALS`
- `SLACK_WEBHOOK_URL`

### 2. Consultation Form Workflow
**File**: `consultation-form-workflow.json`

**Purpose**: Process consultation/booking form submissions

**Trigger**: Webhook POST to `/webhook/consultation`

**Flow**:
1. Receive webhook
2. Validate and transform data
3. Create company in Twenty CRM
4. Create contact associated with company
5. Create opportunity with deal value
6. Send confirmation email
7. Send Slack notification to sales team
8. Add calendar event (optional)

### 3. Newsletter Workflow
**File**: `newsletter-workflow.json`

**Purpose**: Handle newsletter subscriptions

**Trigger**: Webhook POST to `/webhook/newsletter`

**Flow**:
1. Receive webhook
2. Validate email
3. Add to mailing list (SendGrid/Mailchimp)
4. Send welcome email
5. Log subscription

## Security

All workflows validate the `X-Webhook-Secret` header against the configured secret.

## Error Handling

- Retry 3 times with exponential backoff
- Failed executions logged to error workflow
- Alert on critical failures

## Deployment

1. Import workflow JSON in n8n UI
2. Configure credentials
3. Update environment variables
4. Activate workflow
5. Test with curl:

```bash
curl -X POST https://n8n.yourdomain.com/webhook/contact \
  -H "X-Webhook-Secret: your-secret" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","email":"test@example.com","message":"Hello"}'
```
