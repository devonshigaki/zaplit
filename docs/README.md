# Documentation

> **Zaplit Website - Production Documentation**

## Stack

- **Next.js 16** + **React 19** - Frontend
- **TypeScript 5.7** (Strict) - Language
- **Google Cloud Run** - Hosting
- **n8n** - Workflow automation
- **Twenty CRM** - Contact management

## Quick Links

| Document | Purpose |
|----------|---------|
| [Architecture](./architecture/) | System design and decisions |
| [Operations](./ops/) | Deployment, monitoring, runbooks |
| [Development](./development/) | Coding standards, testing |
| [Security](./security/) | Security policies and procedures |
| [Integrations](./reference/integrations/) | n8n, Twenty CRM |

## Production Status

✅ **Production Ready**

- Clean architecture
- Security hardened
- Monitoring configured
- Documentation complete

## Deploy

```bash
# Deploy to production
pnpm deploy:com   # zaplit-com
pnpm deploy:org   # zaplit-org
```

## Support

- **Issues**: See [runbooks](./ops/runbooks/)
- **Deployment**: See [production deployment](./ops/production-deployment.md)
- **Monitoring**: See [monitoring guide](./ops/monitoring.md)

---

**© 2026 Zaplit. All Rights Reserved.**
