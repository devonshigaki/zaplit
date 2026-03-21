# Immediate Security Fixes - Action Plan

## 🚨 STOP - Fix These Before Any Production Deployment

---

## Fix 1: Rotate Exposed JWT Token (CRITICAL - Do First!)

### Step 1: Revoke the Exposed Token
```bash
# Log into Twenty CRM admin panel
# Navigate to Settings > API Keys
# Find the key starting with: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI1ODgwNDlmMy
# Click "Revoke" and confirm
```

### Step 2: Generate New Token
```bash
# In Twenty CRM admin:
# Settings > API Keys > Generate New Key
# Copy the new JWT token (save securely!)
```

### Step 3: Update Secret in GCP
```bash
# Store new token in Secret Manager
echo -n "NEW_JWT_TOKEN_HERE" | gcloud secrets versions add twenty-api-key --data-file=-

# Verify it was stored
gcloud secrets versions access latest --secret=twenty-api-key
```

### Step 4: Redeploy Applications
```bash
# zaplit-com
gcloud run deploy zaplit-com \
  --region=us-central1 \
  --update-secrets=TWENTY_API_KEY=twenty-api-key:latest

# zaplit-org  
gcloud run deploy zaplit-org \
  --region=us-central1 \
  --update-secrets=TWENTY_API_KEY=twenty-api-key:latest
```

---

## Fix 2: Remove Secret from Git History

```bash
# Navigate to repo
cd /Users/devonshigaki/Developer/zaplit

# Remove file from all git history
git filter-branch --force --index-filter \
  'git rm --cached --ignore-unmatch zaplit-com/.env.production' \
  --prune-empty --tag-name-filter cat -- --all

# Force push to remote (DESTRUCTIVE - notify team first!)
git push origin --force --all

# Clean up backup refs
rm -rf .git/refs/original/
git reflog expire --expire=now --all
git gc --prune=now --aggressive
```

---

## Fix 3: Fix app.yaml Configuration

### Edit `zaplit-com/app.yaml`:

```yaml
runtime: custom
env: flex

service: default

resources:
  cpu: 1
  memory_gb: 1
  disk_size_gb: 10

automatic_scaling:
  min_num_instances: 1
  max_num_instances: 5
  cool_down_period_sec: 60
  cpu_utilization:
    target_utilization: 0.6

# REMOVE ALL env_variables - use Secret Manager instead
# DO NOT put secrets in this file
```

### Deploy with Secrets via gcloud CLI:

```bash
# Generate strong webhook secret
WEBHOOK_SECRET=$(openssl rand -hex 32)
echo -n "$WEBHOOK_SECRET" | gcloud secrets versions add n8n-webhook-secret --data-file=-

# Deploy with secrets from Secret Manager
gcloud app deploy zaplit-com/app.yaml \
  --update-secrets=N8N_WEBHOOK_SECRET=n8n-webhook-secret:latest,\
TWENTY_API_KEY=twenty-api-key:latest
```

---

## Fix 4: Update Cloud Build Configuration

### Verify `zaplit-com/cloudbuild.yaml` secrets:

```yaml
# Step 4: Deploy to Cloud Run
- name: 'gcr.io/cloud-builders/gcloud'
  entrypoint: 'bash'
  args:
    - '-c'
    - |
      gcloud run deploy zaplit-com \
        --image=gcr.io/$PROJECT_ID/zaplit-com:$COMMIT_SHA \
        --region=us-central1 \
        --platform=managed \
        --allow-unauthenticated \
        --set-secrets=TWENTY_API_KEY=twenty-api-key:latest,N8N_WEBHOOK_SECRET=n8n-webhook-secret:latest,APP_SECRET=app-secret:latest \
        --set-env-vars=NODE_ENV=production,NEXT_PUBLIC_SITE_URL=https://zaplit.com \
        --memory=1Gi \
        --cpu=1 \
        --concurrency=1000 \
        --max-instances=10 \
        --min-instances=1
```

---

## Fix 5: Add .env.production to .gitignore

```bash
# Edit .gitignore
echo "" >> zaplit-com/.gitignore
echo "# Production environment files (security)" >> zaplit-com/.gitignore
echo ".env.production" >> zaplit-com/.gitignore
echo ".env.local" >> zaplit-com/.gitignore
echo "*.key" >> zaplit-com/.gitignore
echo "*.pem" >> zaplit-com/.gitignore

git add zaplit-com/.gitignore
git commit -m "security: Add production env files to gitignore"
git push
```

---

## Fix 6: Implement Redis Rate Limiting

### Option A: Redis-based (Recommended)

Install Redis package:
```bash
cd zaplit-com
pnpm add ioredis
```

Create `lib/rate-limit.ts`:
```typescript
import Redis from 'ioredis';

const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
});

export async function checkRateLimit(key: string, max: number, windowMs: number): Promise<boolean> {
  const now = Date.now();
  const windowStart = now - windowMs;
  
  // Use Redis sorted set for sliding window
  const multi = redis.multi();
  
  // Remove old entries
  multi.zremrangebyscore(`ratelimit:${key}`, 0, windowStart);
  
  // Count current entries
  multi.zcard(`ratelimit:${key}`);
  
  // Add current request
  multi.zadd(`ratelimit:${key}`, now, `${now}-${Math.random()}`);
  
  // Set expiry on the key
  multi.pexpire(`ratelimit:${key}`, windowMs);
  
  const results = await multi.exec();
  const currentCount = results?.[1]?.[1] as number || 0;
  
  return currentCount < max;
}
```

### Option B: Cloud Armor (Simpler)

```bash
# Create Cloud Armor security policy
gcloud compute security-policies create zaplit-rate-limit \
  --description="Rate limiting for form submissions"

# Add rate limiting rule
gcloud compute security-policies rules create 1000 \
  --security-policy=zaplit-rate-limit \
  --expression="request.path.matches('/api/submit-form')" \
  --action="rate-based-ban" \
  --rate-limit-threshold-count=5 \
  --rate-limit-threshold-interval-sec=60 \
  --ban-duration-sec=300 \
  --conform-action=allow \
  --exceed-action=deny(429) \
  --enforce-on-key=IP

# Attach to backend service
gcloud compute backend-services update zaplit-com-backend \
  --security-policy=zaplit-rate-limit \
  --global
```

---

## Fix 7: Add CSRF Protection

Create `lib/csrf.ts`:
```typescript
import { cookies } from 'next/headers';
import { createHash, randomBytes } from 'crypto';

const CSRF_COOKIE = 'csrf-token';
const CSRF_HEADER = 'X-CSRF-Token';

export function generateCSRFToken(): string {
  return randomBytes(32).toString('hex');
}

export async function setCSRFCookie(): Promise<string> {
  const token = generateCSRFToken();
  const cookieStore = await cookies();
  
  cookieStore.set(CSRF_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 60 * 60 * 24, // 24 hours
  });
  
  return token;
}

export async function validateCSRFToken(request: Request): Promise<boolean> {
  const cookieStore = await cookies();
  const cookieToken = cookieStore.get(CSRF_COOKIE)?.value;
  const headerToken = request.headers.get(CSRF_HEADER);
  
  if (!cookieToken || !headerToken) {
    return false;
  }
  
  // Constant-time comparison
  const cookieBuffer = Buffer.from(cookieToken);
  const headerBuffer = Buffer.from(headerToken);
  
  if (cookieBuffer.length !== headerBuffer.length) {
    return false;
  }
  
  return crypto.timingSafeEqual(cookieBuffer, headerBuffer);
}
```

Update API route:
```typescript
import { validateCSRFToken } from '@/lib/csrf';

export async function POST(request: NextRequest) {
  // Validate CSRF token
  if (!(await validateCSRFToken(request))) {
    return NextResponse.json(
      { error: 'Invalid CSRF token' },
      { status: 403 }
    );
  }
  
  // ... rest of handler
}
```

---

## Fix 8: Strengthen CSP Headers

Update `next.config.mjs`:
```javascript
async headers() {
  return [
    {
      source: '/:path*',
      headers: [
        {
          key: 'X-Content-Type-Options',
          value: 'nosniff',
        },
        {
          key: 'X-Frame-Options',
          value: 'DENY',
        },
        {
          key: 'X-XSS-Protection',
          value: '1; mode=block',
        },
        {
          key: 'Referrer-Policy',
          value: 'strict-origin-when-cross-origin',
        },
        {
          key: 'Strict-Transport-Security',
          value: 'max-age=31536000; includeSubDomains; preload',
        },
        // Stricter CSP - remove unsafe-inline/unsafe-eval
        {
          key: 'Content-Security-Policy',
          value: [
            "default-src 'self'",
            "script-src 'self' https://analytics.google.com 'nonce-{nonce}'",
            "style-src 'self' 'nonce-{nonce}'",
            "img-src 'self' data: https: https://img.logo.dev",
            "font-src 'self'",
            "connect-src 'self' https://n8n.zaplit.com",
            "frame-ancestors 'none'",
            "base-uri 'self'",
            "form-action 'self'",
          ].join('; '),
        },
        // Add Permissions-Policy
        {
          key: 'Permissions-Policy',
          value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
        },
        {
          key: 'Cross-Origin-Embedder-Policy',
          value: 'require-corp',
        },
        {
          key: 'Cross-Origin-Opener-Policy',
          value: 'same-origin',
        },
      ],
    },
  ];
},
```

---

## Fix 9: Update Body Parser Config

Fix `zaplit-com/app/api/submit-form/route.ts`:
```typescript
export const config = {
  api: {
    bodyParser: {
      sizeLimit: 1024 * 1024, // 1MB in bytes, not string
    },
  },
};
```

---

## Fix 10: Add Schema Validation Limits

Update `zaplit-com/lib/schemas/forms.ts`:
```typescript
export const contactFormSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email().max(254),
  company: z.string().max(100).optional(),
  subject: z.string().max(200).optional(),
  message: z.string().min(10).max(5000),
  website: z.string().max(100).optional(), // Honeypot
});

export const consultationFormSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email().max(254),
  company: z.string().min(2).max(100),
  role: z.string().min(2).max(100),
  teamSize: z.enum(["1–10", "11–50", "51–200", "200+"]),
  techStack: z.array(z.string().max(50)).max(20).optional(),
  securityLevel: z.enum(["standard", "high", "enterprise"]).optional(),
  compliance: z.array(z.string().max(20)).max(10).optional(),
  message: z.string().max(5000).optional(),
  website: z.string().max(100).optional(), // Honeypot
});
```

---

## Verification Checklist

After applying fixes, verify:

- [ ] Old JWT token revoked (test with curl, should return 401)
- [ ] New JWT token working (test form submission)
- [ ] `.env.production` not in git (`git log --all --full-history -- zaplit-com/.env.production` should be empty)
- [ ] `app.yaml` has no env_variables section
- [ ] Rate limiting works across instances (deploy 2 instances, test rapid requests)
- [ ] CSRF token present in cookies (DevTools > Application > Cookies)
- [ ] CSP headers don't have `unsafe-inline` or `unsafe-eval`
- [ ] Permissions-Policy header present
- [ ] Body size limit rejects requests >1MB
- [ ] Form validation rejects inputs > max length

---

## Emergency Contacts

| Role | Contact | When to Contact |
|------|---------|-----------------|
| Security Lead | [security@zaplit.com] | Any security incident |
| CTO | [cto@zaplit.com] | Critical vulnerabilities |
| DevOps | [devops@zaplit.com] | Deployment issues |
| Twenty CRM Support | support@twenty.com | API key issues |

---

*Last Updated: March 20, 2026*
