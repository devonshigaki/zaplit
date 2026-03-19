# Production Readiness Checklist

> **Final verification before handoff**

## Pre-Deployment

### Infrastructure

- [ ] GCP Project created with billing enabled
- [ ] Domain registered (zaplit.com, zaplit.org)
- [ ] DNS configured in Cloudflare or Cloud DNS
- [ ] gcloud CLI authenticated

### Secrets (Secret Manager)

```bash
gcloud secrets list
```

Required secrets:
- [ ] `n8n-webhook-secret`
- [ ] `n8n-webhook-contact`
- [ ] `n8n-webhook-consultation`
- [ ] `n8n-webhook-newsletter` (if needed)

### Service Accounts

- [ ] `zaplit-web@zaplit-website-prod.iam.gserviceaccount.com` created
- [ ] Granted `secretmanager.secretAccessor` role
- [ ] Granted `logging.logWriter` role

## Deployment

### n8n (Compute Engine)

- [ ] VM created (`n8n-server`)
- [ ] Static IP reserved and assigned
- [ ] Firewall rules configured (443)
- [ ] Caddy reverse proxy installed
- [ ] HTTPS working
- [ ] Workflows imported
  - [ ] Contact form workflow
  - [ ] Consultation form workflow
  - [ ] Newsletter workflow
- [ ] Credentials configured
  - [ ] SendGrid (or Gmail)
  - [ ] Twenty CRM
  - [ ] Slack
- [ ] Workflows activated

### Twenty CRM (Cloud Run)

- [ ] Service deployed
- [ ] Database initialized
- [ ] Admin user created
- [ ] API accessible

### Zaplit Websites (Cloud Run)

- [ ] zaplit-com deployed
- [ ] zaplit-org deployed
- [ ] Domain mappings created
- [ ] SSL certificates active

## Integration Testing

### Form Submission Flow

```bash
# Test contact form
curl -X POST https://zaplit.com/api/submit-form \
  -H "Content-Type: application/json" \
  -d '{
    "formType": "contact",
    "data": {
      "name": "Test User",
      "email": "test@zaplit.com",
      "message": "Testing form submission"
    }
  }'
```

- [ ] Contact form submission works
- [ ] Consultation form submission works
- [ ] Rate limiting enforced (5/min)
- [ ] Honeypot catches bots
- [ ] Validation rejects bad data

### n8n Workflow Execution

- [ ] Webhook receives data
- [ ] Email sent via SendGrid
- [ ] Contact created in Twenty CRM
- [ ] Slack notification sent
- [ ] Error handling works

### Error Scenarios

- [ ] Invalid form type rejected (400)
- [ ] Missing fields rejected (400)
- [ ] Rate limit enforced (429)
- [ ] Server errors handled (500)

## Security

- [ ] Rate limiting enabled
- [ ] Honeypot fields active
- [ ] Webhook secrets configured
- [ ] HTTPS enforced everywhere
- [ ] Service accounts use least privilege
- [ ] Secrets in Secret Manager (not env vars)
- [ ] CSP headers configured

## Monitoring

- [ ] Cloud Monitoring dashboards created
- [ ] Alerting policies configured
  - [ ] High latency (>500ms p99)
  - [ ] High error rate (>1%)
  - [ ] Low instance count (0 for too long)
- [ ] Log-based alerts for form failures
- [ ] n8n health check working

## Documentation

- [ ] README.md updated
- [ ] Architecture documented
- [ ] Deployment procedures documented
- [ ] Environment variables documented
- [ ] Runbooks created

## Backup & Recovery

- [ ] n8n workflow export schedule
- [ ] Twenty CRM backup strategy
- [ ] Recovery procedures documented

## Performance

- [ ] Cold start < 2s (zaplit-com/org)
- [ ] API response < 500ms (p95)
- [ ] Form submission < 1s total

## Cost Optimization

- [ ] Production: min-instances=1 (avoid cold starts)
- [ ] Development: min-instances=0 (scale to zero)
- [ ] Concurrency tuned (start at 80)
- [ ] Memory right-sized (start at 512Mi)

## Final Sign-Off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Engineering Lead | | | |
| DevOps/SRE | | | |
| Security Review | | | |
| Product Owner | | | |

## Post-Deployment

- [ ] Smoke tests passed
- [ ] Monitoring active
- [ ] Alerts tested
- [ ] Documentation handed off
- [ ] Team trained on procedures

---

**Project**: Zaplit Website  
**Version**: 1.0.0  
**Date**: 2026-03-19  
**Status**: PRODUCTION READY
