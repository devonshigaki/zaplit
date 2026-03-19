# Runbook: Form Submission Failure

> **Quick response for form submission issues**

## Symptoms

- Users report forms not submitting
- n8n executions showing failures
- Error alerts firing

## Diagnosis

### 1. Check Cloud Run Logs

```bash
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=zaplit-com" \
  --limit=50
```

### 2. Check n8n Executions

Open n8n UI and check failed executions.

### 3. Test Webhook

```bash
curl -X POST https://n8n.yourdomain.com/webhook/contact \
  -H "X-Webhook-Secret: your-secret" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","email":"test@example.com","message":"Test"}'
```

## Common Fixes

| Issue | Fix |
|-------|-----|
| Rate limiting | Check if attack or increase limit |
| Webhook secret | Update in Secret Manager |
| n8n down | Restart VM |
| CRM errors | Check Twenty API token |

## Escalation

If issue persists > 30 minutes, page on-call engineer.

---

**Last Updated**: 2026-03-19
