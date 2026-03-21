# P0 Security Fixes - Implementation Guide

**Priority:** CRITICAL - Fix before production  
**Estimated Time:** 8-10 hours  
**Risk Level:** High (exposed credentials)

---

## P0-001: Exposed JWT API Token in .env.production ✅ FIXED

### Problem
Active Twenty CRM JWT token was hardcoded in `zaplit-com/.env.production`.

### Fix Applied
- Deleted `zaplit-com/.env.production`
- Created `.env.production.example` template with placeholder values
- Added `.env.production` to `.gitignore`

### Remaining Action Required

#### Step 1: Revoke Token in Twenty CRM
1. Log into Twenty CRM admin panel
2. Navigate to Settings → API Keys
3. Find and revoke the exposed key (ID: 1751c971-0827-4e61-a002-ed3488c1c7b3)
4. Generate new API key

#### Step 2: Store in GCP Secret Manager
```bash
# Create secret
echo -n "NEW_TOKEN_HERE" | gcloud secrets versions add twenty-api-key --data-file=-

# Verify
gcloud secrets versions access latest --secret=twenty-api-key
```

#### Step 3: Update Cloud Build
Ensure Cloud Build has access to the secret:
```yaml
# cloudbuild.yaml
availableSecrets:
  secretManager:
    - versionName: projects/$PROJECT_ID/secrets/twenty-api-key/versions/latest
      env: TWENTY_API_KEY
```

---

## P0-002: Weak Webhook Secret ✅ FIXED

### Problem
`N8N_WEBHOOK_SECRET=local-dev-secret-key` in production config

### Fix Applied
- Removed hardcoded secrets from `zaplit-com/app.yaml`
- Added environment validation in `lib/env.ts`

### Remaining Action Required

#### Step 1: Generate Secure Secret
```bash
openssl rand -hex 32
# Output: a3f8b2c1d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6
```

#### Step 2: Store in Secret Manager
```bash
echo -n "a3f8b2c1d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6" | \
  gcloud secrets versions add n8n-webhook-secret --data-file=-
```

---

## P0-003: Temporary Cloudflare Tunnel URL ✅ FIXED

### Problem
Production using ephemeral Cloudflare tunnel URLs

### Fix Applied
- Removed hardcoded URLs from `zaplit-com/app.yaml`

### Remaining Action Required

#### Step 1: Set Up Permanent n8n Domain
Option A: Use n8n.cloud managed instance
Option B: Deploy n8n to Cloud Run with custom domain

#### Step 2: Update Secret Manager
```bash
# Update secret
echo -n "https://n8n.zaplit.com/webhook/consultation" | \
  gcloud secrets versions add n8n-webhook-url --data-file=-
```

---

## P0-004: Missing Error Tracking Integration ✅ PARTIALLY FIXED

### Problem
Error boundaries had TODO comments but no Sentry implementation

### Fix Applied
- Updated error boundaries to check for `window.Sentry`
- Added `types/sentry.d.ts` for type declarations

### Remaining Action Required

#### Step 1: Install Sentry
```bash
cd zaplit-com && npm install @sentry/nextjs
cd ../zaplit-org && npm install @sentry/nextjs
```

#### Step 2: Configure Sentry
Create in both apps:
```typescript
// sentry.client.config.ts
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,
});
```

---

## P0-005: IP Hash Salt Fallback ✅ FIXED

### Problem
`IP_HASH_SALT` fell back to generated salt, violating GDPR

### Fix Applied
- Modified to throw error in production if salt not set
- Added `hashEmail()` function for GDPR-compliant logging
- Updated audit logging in both apps to hash emails

### Remaining Action Required

#### Step 1: Generate Salt
```bash
openssl rand -hex 32
```

#### Step 2: Store in Secret Manager
```bash
echo -n "GENERATED_SALT" | \
  gcloud secrets versions add ip-hash-salt --data-file=-
```

---

## Summary of Security Fixes Applied

| Fix | zaplit-com | zaplit-org | Status |
|-----|------------|------------|--------|
| Removed .env.production | ✅ | N/A | Done |
| Created .env.production.example | ✅ | ✅ | Done |
| Updated .gitignore | ✅ | ✅ | Done |
| GDPR audit logging | ✅ | ✅ | Done |
| Error boundary updates | ✅ | ✅ | Done |
| Environment validation | ✅ | ✅ | Done |
| app.yaml cleanup | ✅ | N/A | Done |

---

## Remaining Post-Cleanup Actions

1. **Revoke JWT token** in Twenty CRM admin panel
2. **Set up GCP Secret Manager** with production secrets
3. **Configure Cloud Build** to inject secrets from Secret Manager
4. **Install Sentry SDK** and configure DSN
5. **Set up permanent n8n domain** (replace Cloudflare tunnel URLs)
