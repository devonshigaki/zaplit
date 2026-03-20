# Security

## Policies

### Secrets
- Never commit secrets to git
- Use Google Secret Manager in production
- Rotate secrets every 90 days

### Forms
- Rate limiting: 10 requests/minute per IP
- Input validation with Zod
- IP hashing for privacy

### API
- Webhook signature validation
- CORS restricted to known origins
- HTTPS only

## Reporting

Report security issues to: security@zaplit.com

Include:
- Description
- Steps to reproduce
- Impact assessment
- Suggested fix (optional)

## Compliance

- GDPR: Data retention 2 years
- Form data encrypted in transit and at rest
- Right to deletion supported

## Infrastructure

- Cloud Run: Private services, IAM-controlled
- VMs: Firewall restricted to specific IPs
- Secrets: Secret Manager with versioning
- Backups: Encrypted GCS buckets
