# n8n Workflows

This directory contains n8n workflow JSON files for automation and integrations.

## Directory Structure

```
workflows/
├── v3/           # Version 3 workflows (legacy)
├── v4/           # Version 4 workflows (current)
│   ├── backup/           # Backup and restore workflows
│   ├── circuit-breaker/  # Circuit breaker implementation
│   ├── data-quality/     # Data quality checks
│   ├── dlq/              # Dead Letter Queue handling
│   ├── parallel/         # Parallel execution workflows
│   └── security/         # Security-focused workflows
└── README.md
```

## Workflow Versions

### v3 Workflows (Legacy)
Legacy sequential workflows. These are maintained for reference but new implementations should use v4.

### v4 Workflows (Current)
Modern parallel workflows with improved performance:
- **Parallel execution** - Multiple operations run concurrently
- **Circuit breaker** - Fault tolerance patterns
- **Dead Letter Queue** - Failed operation handling
- **Data quality checks** - Validation and cleansing

## Importing Workflows

1. Open n8n editor
2. Click "Workflows" → "Import from File"
3. Select the JSON file from this directory
4. Configure credentials and environment variables
5. Activate the workflow

## Available Workflows

| Workflow | Purpose | Location |
|----------|---------|----------|
| Consultation Form | Process consultation submissions | `v4/consultation-form.json` |
| Contact Form | Handle contact form submissions | `v4/contact-form.json` |
| Newsletter Signup | Process newsletter subscriptions | `v4/newsletter-signup.json` |
| DLQ Processor | Retry failed submissions | `v4/dlq/processor.json` |
| Circuit Breaker | Monitor and fail fast | `v4/circuit-breaker/monitor.json` |

## Environment Variables

These workflows expect certain environment variables:

- `N8N_WEBHOOK_SECRET` - For webhook authentication
- `TWENTY_API_KEY` - For CRM integration
- `REDIS_URL` - For rate limiting and caching

## Security Notes

- All webhooks should use the `N8N_WEBHOOK_SECRET` header
- Sensitive credentials should be stored in n8n's credential vault
- Workflow files should not contain hardcoded secrets

## Documentation

For detailed workflow documentation, see:
- `docs/ops/workflow-management.md` - Workflow management guide
- `runbooks/RB003-workflow-rollback.md` - Rollback procedures
