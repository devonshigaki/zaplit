# Security

> **Security policies and procedures**

## Overview

Defense in depth:

```
DNS/Edge (Cloudflare) → Network (GCP VPC) → Application (Next.js) → Container → Secrets
```

## Form Security

| Measure | Implementation |
|---------|---------------|
| Rate Limiting | 5 req/min per IP |
| Input Validation | Zod schemas |
| Webhook Security | HMAC signature |
| HTTPS | Enforced |

## Rate Limiting

```typescript
const RATE_LIMIT = new Map<string, number[]>();
const WINDOW = 60 * 1000; // 1 min
const MAX = 5;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const requests = RATE_LIMIT.get(ip) || [];
  const valid = requests.filter(t => now - t < WINDOW);
  
  if (valid.length >= MAX) return false;
  
  valid.push(now);
  RATE_LIMIT.set(ip, valid);
  return true;
}
```

## Secrets

Production secrets in Google Secret Manager:

| Secret | Used By |
|--------|---------|
| `n8n-webhook-secret` | zaplit-com |
| `n8n-webhook-consultation` | zaplit-com |
| `n8n-webhook-contact` | zaplit-com |

## Reporting

Report security issues to: **security@zaplit.com**

Include:
- Detailed description
- Steps to reproduce
- Potential impact

---

**© 2026 Zaplit. All Rights Reserved.**
