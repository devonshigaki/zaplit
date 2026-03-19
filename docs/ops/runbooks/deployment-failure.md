# Runbook: Deployment Failure

> **When deployments go wrong**

## Quick Rollback

```bash
# List revisions
gcloud run revisions list --service=zaplit-com --region=us-central1

# Rollback
gcloud run services update-traffic zaplit-com \
  --to-revisions=PREVIOUS_REVISION=100 \
  --region=us-central1
```

## Diagnosis

1. Check build logs: `gcloud builds log [BUILD_ID]`
2. Check service status: `gcloud run services describe zaplit-com`
3. Check logs: `gcloud logging read "resource.type=cloud_run_revision"`

## Common Issues

| Issue | Fix |
|-------|-----|
| Build fails | Fix local build first |
| Container won't start | Check port 8080 |
| Health check fails | Test /api/health endpoint |

---

**Last Updated**: 2026-03-19
