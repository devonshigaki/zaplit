# Security & Secrets Management Guide

## 🔐 Current Passwords (Local Development)

| Service | URL | Username/Email | Password |
|---------|-----|----------------|----------|
| **Twenty CRM** | http://localhost:3001 | devonshigaki@gmail.com | ZaplitTwenty123! |
| **n8n** | http://localhost:5678 | admin | zaplit-local-dev |
| **n8n (owner)** | http://localhost:5678 | devonshigaki@gmail.com | ZaplitLocal123! |

## 🚨 Security Gaps (Fix Before Production)

### CRITICAL (Fix Immediately)

1. **Secrets in Plaintext**
   - API keys in `.env.local` files
   - Hardcoded in repository
   - **Fix:** Use secrets manager (see below)

2. **No Database Backups**
   - Twenty CRM has no backup strategy
   - **Fix:** Implement automated backups (see `twenty-crm/backup.sh`)

3. **No Audit Logging**
   - Only console logs
   - **Fix:** Database audit log table (schema below)

4. **No Bot Protection**
   - Only basic honeypot
   - **Fix:** Add Cloudflare Turnstile (implementation below)

### HIGH (Fix Before Launch)

5. **In-Memory Rate Limiting**
   - Resets on server restart
   - **Fix:** Redis-based rate limiting

6. **No HTTPS**
   - HTTP only in local dev
   - **Fix:** Traefik/Caddy reverse proxy with Let's Encrypt

## 🔧 Implementation Guides

### 1. Secrets Management Options

#### Option A: Doppler (Recommended for Multi-Cloud)

```bash
# Install Doppler CLI
brew install doppler

# Login
doppler login

# Setup project
doppler projects create zaplit
doppler configs create dev
doppler configs create prod

# Add secrets
doppler secrets set TWENTY_API_KEY="..." --config dev
doppler secrets set N8N_WEBHOOK_SECRET="..." --config dev

# Inject in development
doppler run -- npm run dev
```

#### Option B: 1Password Service Accounts (If using 1Password)

```bash
# Install 1Password CLI
brew install 1password-cli

# Create service account in 1Password web UI
# Download token, then:
export OP_SERVICE_ACCOUNT_TOKEN="ops_..."

# Load secrets
op run --env-file=.env.op -- npm run dev
```

#### Option C: HashiCorp Vault (Enterprise)

```bash
# For enterprise deployments
vault kv put secret/zaplit/dev \
  TWENTY_API_KEY="..." \
  N8N_WEBHOOK_SECRET="..."
```

### 2. Database Audit Logging

Create an audit log table in PostgreSQL:

```sql
-- Run in your database
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  action VARCHAR(50) NOT NULL,
  form_type VARCHAR(20),
  email VARCHAR(255),
  ip_hash VARCHAR(64),
  success BOOLEAN DEFAULT true,
  details JSONB,
  error TEXT,
  INDEX idx_timestamp (timestamp),
  INDEX idx_action (action),
  INDEX idx_email (email)
);
```

### 3. Cloudflare Turnstile Integration

```typescript
// Install: npm install @marsidev/react-turnstile

// app/components/SecureForm.tsx
'use client';

import { Turnstile } from '@marsidev/react-turnstile';

export function SecureForm() {
  const [token, setToken] = useState('');
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    
    const response = await fetch('/api/submit-form', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        formType: 'consultation',
        data: formData,
        turnstileToken: token 
      }),
    });
    // ...
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* Form fields */}
      
      <Turnstile
        siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY!}
        onSuccess={setToken}
      />
      
      <button type="submit" disabled={!token}>
        Submit
      </button>
    </form>
  );
}
```

### 4. Redis-Based Rate Limiting

```typescript
// lib/rate-limit.ts
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export const rateLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, '1 m'),
  analytics: true,
});
```

### 5. Automated Backups (Cron Setup)

```bash
# Make scripts executable
chmod +x local-dev/twenty-crm/backup.sh
chmod +x local-dev/twenty-crm/restore.sh

# Add to crontab
crontab -e

# Daily backup at 2 AM
0 2 * * * cd /path/to/zaplit && ./local-dev/twenty-crm/backup.sh daily >> /var/log/twenty-backup.log 2>&1

# Weekly backup on Sundays at 3 AM
0 3 * * 0 cd /path/to/zaplit && ./local-dev/twenty-crm/backup.sh weekly >> /var/log/twenty-backup.log 2>&1
```

## 📋 Pre-Production Checklist

### Security
- [ ] Move all secrets to secrets manager
- [ ] Rotate all exposed API keys
- [ ] Enable database audit logging
- [ ] Add bot protection (Turnstile)
- [ ] Implement Redis rate limiting
- [ ] Set up HTTPS/TLS certificates
- [ ] Configure CORS properly
- [ ] Add security headers (CSP, HSTS)

### Reliability
- [ ] Set up automated database backups
- [ ] Test restore procedure
- [ ] Implement retry logic for CRM calls ✓
- [ ] Add circuit breaker for external APIs
- [ ] Set up health checks
- [ ] Configure log aggregation

### Compliance
- [ ] GDPR compliance review
- [ ] Privacy policy updates
- [ ] Cookie consent banner
- [ ] Data retention policies
- [ ] Right to deletion implementation

## 🔐 Production Secrets Template

Create this file and add to `.gitignore`:

```bash
# .env.local (NEVER COMMIT THIS FILE)

# Twenty CRM
TWENTY_BASE_URL=https://your-tw-instance.com
TWENTY_API_KEY=sk_live_...

# n8n
N8N_WEBHOOK_URL=https://your-n8n.com/webhook/form-submission
N8N_WEBHOOK_SECRET=whsec_...

# Rate Limiting (Redis)
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...

# Turnstile
NEXT_PUBLIC_TURNSTILE_SITE_KEY=0x4AAAA...
TURNSTILE_SECRET_KEY=0x4AAAA...

# Database (if using external)
DATABASE_URL=postgresql://...

# Monitoring
SENTRY_DSN=https://...
```

## 📞 Emergency Contacts

| Issue | Contact |
|-------|---------|
| Security breach | security@yourcompany.com |
| Data loss | ops@yourcompany.com |
| Service outage | oncall@yourcompany.com |

---

**Remember:** Local development passwords should NEVER be used in production!
