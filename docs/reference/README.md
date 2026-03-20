# Reference Documentation

Consolidated technical reference for Zaplit integrations and APIs.

## Quick Reference

| Document | Purpose |
|----------|---------|
| [n8n-integration.md](n8n-integration.md) | Workflow automation, webhook configuration, node setup |
| [twenty-crm-api.md](twenty-crm-api.md) | REST API endpoints, authentication, entity schemas |
| [data-mappings.md](data-mappings.md) | Form-to-CRM field mappings, transformations |
| [troubleshooting.md](troubleshooting.md) | Common issues, error handling, fixes |

## System Architecture

```
┌─────────────┐     Webhook      ┌─────────┐     REST API     ┌─────────────┐
│  zaplit-com │ ───────────────► │   n8n   │ ───────────────► │ Twenty CRM  │
│   (Forms)   │                  │(Workflow)│                  │  (CRM DB)   │
└─────────────┘                  └─────────┘                  └─────────────┘
```

## Integration URLs

| System | URL | Access |
|--------|-----|--------|
| n8n | https://n8n.zaplit.com | Admin only |
| Twenty CRM | https://crm.zaplit.com | Team access |
| Consultation Webhook | `https://n8n.zaplit.com/webhook/consultation` | Public (validated) |
| Contact Webhook | `https://n8n.zaplit.com/webhook/contact` | Public (validated) |

## Core Entities

| Entity | Description | Key Fields |
|--------|-------------|------------|
| **Person** | Contact individual | name, email, jobTitle, companyId |
| **Company** | Organization | name, domainName, employees |
| **Note** | Activity/communication | title, body, personId, companyId |

## Configuration Snapshots

See [snapshots/](snapshots/) for archived configurations:
- `n8n-credential-snapshot.md` - Credential configuration
- `n8n-http-config-snapshot.md` - HTTP node settings
- `create-person-config.md` - Person creation workflow
- `crm-login-snapshot.md` - CRM interface reference

## Security

For detailed security practices, see [Security Best Practices](#) (linked from main security docs).

Key points:
- API keys stored in n8n credentials (not hardcoded)
- Webhook secret validation required
- HTTPS enforced for all communications
- Execution data pruning enabled

## Change Log

| Date | Change |
|------|--------|
| 2026-03-19 | Consolidated reference docs created |
| 2026-03-19 | Fixed workflow with validation & error handling |
