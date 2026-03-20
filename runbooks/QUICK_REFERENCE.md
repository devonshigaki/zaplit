# n8n Production Deployment - Quick Reference Card

**Print this card and keep it handy during deployments**

---

## Emergency Contacts

| Role | Slack | Escalation Time |
|------|-------|-----------------|
| On-call | #incidents | Immediate |
| Senior Eng | @eng-oncall | 15 min |
| Manager | @em-manager | 30 min |

---

## Critical URLs

- **n8n Production:** https://n8n.zaplit.com
- **n8n Staging:** https://n8n-staging.zaplit.com
- **CRM:** https://crm.zaplit.com
- **Monitoring:** https://grafana.zaplit.com

---

## Pre-Deployment (5 min)

```
□ Staging tests passed
□ Production backup created
□ Rollback plan ready
□ Team notified in #deployments
```

---

## Deployment Steps (10 min)

```
1. Import workflow to production
2. Reconnect all 4 credentials
3. Set webhook path: "consultation"
4. Test with single submission
5. Activate workflow
6. Monitor for 30 min
```

---

## Emergency Rollback

```bash
# Deactivate immediately
curl -X POST "https://n8n.zaplit.com/api/v1/workflows/{id}/deactivate" \
  -H "X-N8N-API-KEY: $N8N_API_KEY"

# Then restore from backup via UI
```

---

## Health Check Commands

```bash
# Test webhook
curl -X POST https://n8n.zaplit.com/webhook/consultation \
  -H "Content-Type: application/json" \
  -d '{"data":{"name":"Test","email":"test@example.com","company":"Test Co","message":"Test"}}'

# Check executions
curl "https://n8n.zaplit.com/api/v1/executions?limit=10" \
  -H "X-N8N-API-KEY: $N8N_API_KEY"
```

---

## Common Issues

| Issue | Quick Fix |
|-------|-----------|
| 401 Auth Error | Rotate API key (see RB001) |
| High Error Rate | Check CRM status page |
| Slow Response | Check concurrent executions |
| Duplicates | Verify deduplication logic |

---

## Key Metrics Thresholds

| Metric | Good | Warning | Critical |
|--------|------|---------|----------|
| Success Rate | >99% | 95-99% | <95% |
| Response Time | <5s | 5-10s | >10s |
| Error Rate | <1% | 1-5% | >5% |

---

## Runbook Index

- **RB001:** Credential Rotation
- **RB002:** Incident Response
- **RB003:** Workflow Rollback
- **RB004:** Monitoring Setup

Full guide: [N8N_PRODUCTION_DEPLOYMENT_GUIDE.md](../N8N_PRODUCTION_DEPLOYMENT_GUIDE.md)

---

## One-Page Deployment Checklist

### Before
- [ ] Tests passing
- [ ] Backup created
- [ ] Maintenance window confirmed

### During
- [ ] Workflow imported
- [ ] Credentials connected
- [ ] Webhook configured
- [ ] Test submission OK
- [ ] Workflow activated

### After
- [ ] 30-min monitoring
- [ ] Metrics normal
- [ ] Team notified
- [ ] Documentation updated

---

**Last Updated:** March 19, 2026
