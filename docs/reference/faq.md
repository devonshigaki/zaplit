# FAQ

## Deployment

**Q: Build fails with "dist folder not found"**
```bash
pnpm build  # Run build before deployment
```

**Q: Styles not updating**
- Clear browser cache
- Update `CACHE_BUST` in Dockerfile
- Redeploy

**Q: Domain shows old version**
```bash
gcloud beta run domain-mappings list --platform managed
gcloud run services update-traffic zaplit-com --to-latest
```

## Forms

**Q: Form submissions failing**
- Check `N8N_WEBHOOK_*` env vars
- Verify webhook URLs are accessible
- Check Cloud Run logs

## Local Dev

**Q: Port already in use**
```bash
lsof -ti:3000 | xargs kill -9
# Or: pnpm dev -- --port 3002
```

---

**© 2026 Zaplit. All Rights Reserved.**
