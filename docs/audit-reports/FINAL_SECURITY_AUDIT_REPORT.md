# FINAL COMPREHENSIVE SECURITY AUDIT REPORT
## Zaplit Monorepo - Pre-Production Security Assessment

**Audit Date:** March 20, 2026  
**Auditor:** Security Engineer  
**Scope:** zaplit-com, zaplit-org, scripts-ts, infrastructure configurations  
**Status:** ⚠️ **NOT CLEARED FOR PRODUCTION** - Critical Issues Must Be Resolved

---

## EXECUTIVE SUMMARY

This security audit identified **4 Critical**, **8 High**, **11 Medium**, and **6 Low** severity security issues. **The repository is NOT ready for production deployment** until critical issues are resolved.

### Overall Security Score: 58/100 (D Grade) - UNSATISFACTORY

| Category | Score | Weight | Weighted |
|----------|-------|--------|----------|
| Secrets Management | 25/100 | 20% | 5.0 |
| Input Validation | 85/100 | 15% | 12.75 |
| Authentication | 60/100 | 15% | 9.0 |
| Authorization | 70/100 | 10% | 7.0 |
| Logging & Monitoring | 75/100 | 10% | 7.5 |
| Infrastructure Security | 65/100 | 15% | 9.75 |
| Dependency Security | 55/100 | 10% | 5.5 |
| Compliance | 50/100 | 5% | 2.5 |
| **Total** | | | **58.0** |

---

## 1. SECURITY ISSUES FOUND

### 🔴 CRITICAL (4 Issues) - BLOCK PRODUCTION

#### CRITICAL-1: Exposed JWT API Token in Production Environment File ⭐ IMMEDIATE ACTION REQUIRED
- **File:** `zaplit-com/.env.production`
- **Line:** 8
- **Issue:** Active Twenty CRM JWT API token is hardcoded in the production environment file
  ```
  TWENTY_API_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI1ODgwNDlmMy0zNDhhLTQwYWYtOGIyMC0zYzc1NDllOTI1NzIiLCJ0eXBlIjoiQVBJX0tFWSIsIndvcmtzcGFjZUlkIjoiNTg4MDQ5ZjMtMzQ4YS00MGFmLThiMjAtM2M3NTQ5ZTkyNTcyIiwiaWF0IjoxNzczODc3MTY1LCJleHAiOjQ5Mjc0ODA3NjQsImp0aSI6IjE3NTFjOTcxLTA4MjctNGU2MS1hMDAyLWVkMzQ4OGMxYzdiMyJ9.P7UOeTAhK_1DhBx3b3OX1U6CRJ8jLmUcSYUchyolyeQ
  ```
- **Risk:** Full API access to CRM data; attackers could read/modify customer data, delete records, access PII
- **Evidence:** Token is valid JWT with HS256 signature, expiration in 2095
- **Status:** ⚠️ **STILL EXPOSED** - Requires immediate rotation
- **Fix:** 
  1. Immediately rotate the token in Twenty CRM admin panel
  2. Remove file from git history: `git filter-branch --force --index-filter 'git rm --cached --ignore-unmatch zaplit-com/.env.production' HEAD`
  3. Store in GCP Secret Manager only
  4. Add `.env.production` to `.gitignore` (already done ✅)

#### CRITICAL-2: Weak Webhook Secret in Production Configuration
- **File:** `zaplit-com/app.yaml`
- **Line:** 22
- **Issue:** N8N_WEBHOOK_SECRET uses placeholder value `local-dev-secret-key`
- **Risk:** Attackers can bypass webhook authentication by using known secret
- **Fix:** 
  1. Generate cryptographically secure secret: `openssl rand -hex 32`
  2. Store in GCP Secret Manager
  3. Remove from app.yaml (use `--set-secrets` flag only)

#### CRITICAL-3: Cloudflare Tunnel URL in Production Config
- **File:** `zaplit-com/app.yaml`, `zaplit-com/.env.production`
- **Issue:** n8n webhook URLs point to temporary Cloudflare tunnel (`dam-boolean-virginia-advertiser.trycloudflare.com`)
- **Risk:** 
  - Tunnel URLs are temporary and publicly discoverable
  - If tunnel is still active, attackers could directly invoke webhooks
  - Form submissions may be intercepted or lost
- **Fix:** 
  1. Verify tunnel is closed: `cloudflared tunnel list`
  2. Use permanent n8n URL: `https://n8n.zaplit.com/webhook/...`
  3. Rotate all webhook secrets

#### CRITICAL-4: Hardcoded Secrets in Version Control (Git History)
- **File:** `zaplit-com/.env.production` (committed to git)
- **Issue:** Production secrets exist in git history even if file is now in .gitignore
- **Risk:** Attackers can retrieve secrets from git history
- **Fix:** 
  1. Use git filter-branch or BFG Repo-Cleaner to purge history
  2. Force push to remote (coordinate with team)
  3. Rotate ALL exposed secrets

---

### 🟠 HIGH (8 Issues)

#### HIGH-1: In-Memory Rate Limiting Not Production-Ready
- **File:** `zaplit-com/app/api/submit-form/route.ts` (line 17), `zaplit-org/app/api/submit-form/route.ts` (line 6)
- **Issue:** Rate limiting uses in-memory Map which doesn't work across Cloud Run instances
  ```typescript
  const rateLimit = new Map<string, { count: number; resetTime: number }>();
  ```
- **Risk:** Attackers can bypass rate limits by hitting different instances
- **Fix:** Implement Redis-based rate limiting or use Cloud Armor

#### HIGH-2: Missing Input Length Validation on Form Fields
- **File:** `zaplit-com/lib/schemas/forms.ts`
- **Issue:** String fields don't have maximum length constraints
- **Risk:** Potential DoS via extremely long inputs, database bloat
- **Fix:** Add `.max(500)` to all string schema fields

#### HIGH-3: Missing CSRF Protection on Form Submissions
- **File:** `zaplit-com/lib/form-submission.ts`
- **Issue:** No CSRF tokens for form submissions
- **Risk:** Cross-site request forgery attacks
- **Fix:** Implement CSRF tokens or use SameSite=Strict cookies

#### HIGH-4: Weak IP Hashing Without Salt Warning
- **File:** `zaplit-com/app/api/submit-form/route.ts` (lines 74-90)
- **Issue:** Falls back to weak hashing if IP_HASH_SALT not set
- **Risk:** Predictable IP hashes could allow tracking/re-identification
- **Fix:** Require IP_HASH_SALT to be set; fail hard if missing in production

#### HIGH-5: Outdated Next.js Version with Known Vulnerabilities
- **File:** `zaplit-com/package.json`, `zaplit-org/package.json`
- **Issue:** Using Next.js 16.1.6 which has 4 known security vulnerabilities
- **Risk:** 
  - HTTP request smuggling (GHSA-ggv3-7p47-pfv8)
  - Unbounded disk cache growth (GHSA-3x4c-7xq6-9pq8)
  - DoS via postponed resume buffering (GHSA-h27x-g6w4-24gq)
  - CSRF bypass via null origin (GHSA-mq59-m269-xvcx)
- **Fix:** Update to Next.js >= 16.1.7

#### HIGH-6: Missing Security Headers on Static Assets
- **File:** `zaplit-com/next.config.mjs`, `zaplit-org/next.config.mjs`
- **Issue:** Security headers only apply to `/:path*`, may miss static files
- **Risk:** Static assets served without CSP, X-Frame-Options
- **Fix:** Add specific matcher for static assets or use `*:*` pattern

#### HIGH-7: PII in Audit Logs
- **File:** `zaplit-com/app/api/submit-form/route.ts` (lines 269-275)
- **Issue:** Email addresses logged in plaintext
- **Risk:** GDPR/CCPA compliance violation
- **Fix:** Hash or redact email in logs

#### HIGH-8: No Health Endpoint Rate Limiting
- **File:** `zaplit-com/app/api/health/route.ts`
- **Issue:** Health endpoint has no rate limiting
- **Risk:** Could be used for DoS attacks
- **Fix:** Add rate limiting middleware

---

### 🟡 MEDIUM (11 Issues)

#### MEDIUM-1: Content Security Policy Allows unsafe-inline and unsafe-eval
- **File:** `zaplit-com/next.config.mjs` (line 64), `zaplit-org/next.config.mjs` (line 64)
- **Issue:** 
  ```
  script-src 'self' 'unsafe-inline' 'unsafe-eval' ...
  style-src 'self' 'unsafe-inline'
  ```
- **Risk:** XSS attacks via inline scripts/styles
- **Fix:** Use nonce-based CSP or remove unsafe directives

#### MEDIUM-2: Missing Permissions-Policy Header
- **File:** `zaplit-com/next.config.mjs`, `zaplit-org/next.config.mjs`
- **Issue:** No Permissions-Policy (Feature-Policy) header
- **Risk:** Unintended browser feature access (camera, microphone, geolocation)
- **Fix:** Add: `Permissions-Policy: camera=(), microphone=(), geolocation=()`

#### MEDIUM-3: Public API Token Pattern in Code
- **File:** `zaplit-com/app/integrations/page.tsx` (line 12)
- **Issue:** Pattern for public token could confuse developers
- **Risk:** Developers may add actual secrets as NEXT_PUBLIC_ vars
- **Fix:** Add ESLint rule to warn on NEXT_PUBLIC_ with "TOKEN", "SECRET", "KEY"

#### MEDIUM-4: CORS Allows Credentials with Wildcard Origins in Dev
- **File:** `zaplit-com/middleware.ts` (line 9), `zaplit-org/middleware.ts` (line 8)
- **Issue:** `http://localhost:3000` allowed in CORS
- **Risk:** Credentials could be exposed during development
- **Fix:** Remove localhost from production middleware

#### MEDIUM-5: Missing Cross-Origin Headers
- **File:** `zaplit-com/next.config.mjs`, `zaplit-org/next.config.mjs`
- **Issue:** Missing COEP, COOP, CORP headers
- **Risk:** Cross-origin attacks, Spectre vulnerabilities
- **Fix:** Add Cross-Origin-Embedder-Policy, Cross-Origin-Opener-Policy headers

#### MEDIUM-6: Missing X-Request-ID Header for Tracing
- **File:** `zaplit-com/app/api/submit-form/route.ts`
- **Issue:** No correlation ID for request tracing across services
- **Risk:** Difficult to debug issues across distributed systems
- **Fix:** Generate and propagate X-Request-ID header

#### MEDIUM-7: No HMAC Verification on Incoming Webhooks
- **File:** `zaplit-com/app/api/submit-form/route.ts`
- **Issue:** Outbound webhooks use secret header, but no verification of incoming
- **Risk:** Cannot verify webhook payload integrity
- **Fix:** Implement HMAC-SHA256 signature verification if receiving webhooks

#### MEDIUM-8: minimatch ReDoS Vulnerabilities
- **File:** `pnpm-lock.yaml` (via scripts-ts)
- **Issue:** minimatch versions < 9.0.7 have ReDoS vulnerabilities
- **Risk:** Regular Expression Denial of Service
- **Fix:** Update dependencies to use minimatch >= 9.0.7

#### MEDIUM-9: Missing Cache-Control Headers for Health Endpoints
- **File:** `zaplit-com/app/api/health/route.ts`
- **Issue:** Health checks may be cached by intermediaries
- **Fix:** Add `Cache-Control: no-store` header

#### MEDIUM-10: Outdated Comment in Integrations Page
- **File:** `zaplit-com/app/integrations/page.tsx` (lines 10-11)
- **Issue:** Comment mentions token should be moved to env var (already done)
- **Fix:** Remove outdated comment

#### MEDIUM-11: No Subresource Integrity (SRI) Check
- **File:** Various
- **Issue:** External resources loaded without integrity checks
- **Risk:** Compromised CDN could inject malicious code
- **Fix:** Use `next/font` (already done ✅) and verify no external scripts

---

### 🟢 LOW (6 Issues)

#### LOW-1: Missing Strict-Transport-Security Preload
- **File:** `zaplit-com/next.config.mjs`
- **Issue:** HSTS header includes `preload` but site not submitted to preload list
- **Fix:** Submit to https://hstspreload.org/ after verifying HTTPS works

#### LOW-2: Theme Toggle Accessible Without JavaScript
- **File:** `zaplit-com/components/navigation.tsx`
- **Issue:** Theme toggle doesn't work without JS, but is still rendered
- **Fix:** Use progressive enhancement pattern

#### LOW-3: Unused Variables in Code
- **File:** Various
- **Issue:** Minor code quality issues don't affect security
- **Fix:** Enable stricter ESLint rules

#### LOW-4: GitHub Actions Missing Security Hardening
- **File:** `.github/workflows/*.yml`
- **Issue:** No explicit permissions set, no dependency pinning
- **Fix:** Add `permissions:` blocks and pin action versions with SHA

#### LOW-5: Missing Resource Hints for Critical Assets
- **File:** `zaplit-com/app/layout.tsx`
- **Issue:** No preconnect for n8n.zaplit.com API calls
- **Fix:** Add `<link rel="preconnect" href="https://n8n.zaplit.com">`

#### LOW-6: Cloud Build Uses Latest Tag
- **File:** `zaplit-com/cloudbuild.yaml`, `zaplit-org/cloudbuild.yaml`
- **Issue:** Images tagged with `latest` can lead to cache issues
- **Fix:** Use immutable tags (commit SHA only)

---

## 2. SECRETS DETECTED

### ⚠️ EXPOSED SECRETS (Require Immediate Rotation)

| Secret | Location | Status | Risk |
|--------|----------|--------|------|
| TWENTY_API_KEY (JWT) | `zaplit-com/.env.production` | 🔴 EXPOSED | Full CRM access |
| N8N_WEBHOOK_SECRET | `zaplit-com/app.yaml` | 🔴 WEAK | Webhook bypass |
| N8N_WEBHOOK_SECRET | `zaplit-com/.env.production` | 🔴 WEAK | Webhook bypass |

### 🔍 SECRET PATTERNS FOUND (Require Verification)

| Pattern | Location | Status | Notes |
|---------|----------|--------|-------|
| NEXT_PUBLIC_LOGO_TOKEN | `zaplit-com/.env.example` | ✅ Placeholder | Safe - placeholder value |
| NEXT_PUBLIC_LOGO_TOKEN | `zaplit-org/.env.example` | ✅ Placeholder | Safe - placeholder value |
| N8N_ENCRYPTION_KEY | `security-implementation/.env.security.example` | ✅ Placeholder | Safe - example file |
| WEBHOOK_HMAC_SECRET | `security-implementation/.env.security.example` | ✅ Placeholder | Safe - example file |
| WEBHOOK_BEARER_TOKEN | `security-implementation/.env.security.example` | ✅ Placeholder | Safe - example file |

### 🔐 SECRETS MANAGEMENT ASSESSMENT

| Aspect | Status | Notes |
|--------|--------|-------|
| GCP Secret Manager Usage | ✅ Good | CloudBuild configs use Secret Manager |
| Local .env files | ⚠️ Risk | Some .env files in repo (should be templates only) |
| Git History | 🔴 Critical | Exposed secrets in git history |
| .gitignore | ⚠️ Partial | `.env.production` added but too late |
| Environment Variable Validation | ⚠️ Missing | No validation that required secrets are set |

---

## 3. VULNERABILITY REPORT

### Dependency Vulnerabilities (pnpm audit)

```
9 vulnerabilities found
Severity: 2 low | 4 moderate | 3 high
```

| Package | Severity | CVE | Issue | Fix |
|---------|----------|-----|-------|-----|
| next | Moderate | GHSA-ggv3-7p47-pfv8 | HTTP request smuggling | Update to >= 16.1.7 |
| next | Moderate | GHSA-3x4c-7xq6-9pq8 | Unbounded disk cache | Update to >= 16.1.7 |
| next | Moderate | GHSA-h27x-g6w4-24gq | DoS via buffering | Update to >= 16.1.7 |
| next | Moderate | GHSA-mq59-m269-xvcx | CSRF bypass | Update to >= 16.1.7 |
| minimatch | High | GHSA-3ppc-4f35-3m26 | ReDoS | Update to >= 9.0.7 |
| minimatch | High | GHSA-7r86-cg39-jmmj | ReDoS backtracking | Update to >= 9.0.7 |
| minimatch | High | GHSA-23c5-xmqv-rm74 | ReDoS nested | Update to >= 9.0.7 |

### Container Security (Dockerfile Analysis)

| Check | Status | Notes |
|-------|--------|-------|
| Non-root user | ✅ Pass | `USER nextjs` configured |
| Multi-stage build | ✅ Pass | Reduces attack surface |
| Health check | ✅ Pass | Configured with appropriate timeouts |
| Minimal base image | ✅ Pass | `node:20-alpine` used |
| No secrets in image | ⚠️ Verify | Need to verify .env.production not copied |
| Distroless option | ❌ Missing | Consider distroless for production |

### Infrastructure Security (Cloud/GCP)

| Check | Status | Notes |
|-------|--------|-------|
| Workload Identity | ✅ Pass | GitHub Actions use Workload Identity |
| Secret Manager | ✅ Pass | Secrets referenced from Secret Manager |
| Cloud Run permissions | ⚠️ Review | `--allow-unauthenticated` set (acceptable for public site) |
| Cloud Armor | ❌ Missing | No WAF rules configured |
| VPC Connector | ❌ Missing | No private VPC for database connections |
| Binary Authorization | ❌ Missing | No container signing enforced |

---

## 4. SECURITY HARDENING RECOMMENDATIONS

### Immediate Actions (Before Production)

1. **Rotate ALL Exposed Secrets**
   ```bash
   # Twenty CRM API Key
   # 1. Log into Twenty CRM admin
   # 2. Revoke old API key
   # 3. Generate new key
   # 4. Update in GCP Secret Manager
   echo -n "NEW_TOKEN" | gcloud secrets versions add twenty-api-key --data-file=-
   
   # Webhook Secret
   openssl rand -hex 32 | gcloud secrets versions add n8n-webhook-secret --data-file=-
   ```

2. **Purge Git History**
   ```bash
   # Install BFG Repo-Cleaner
   wget https://repo1.maven.org/maven2/com/madgag/bfg/1.14.0/bfg-1.14.0.jar
   
   # Remove sensitive files from history
   java -jar bfg-1.14.0.jar --delete-files .env.production
   java -jar bfg-1.14.0.jar --replace-text passwords.txt
   
   # Clean up
   git reflog expire --expire=now --all
   git gc --prune=now --aggressive
   
   # Force push (coordinate with team!)
   git push --force
   ```

3. **Update Dependencies**
   ```bash
   cd zaplit-com
   pnpm update next@latest
   cd ../scripts-ts
   pnpm update minimatch@latest
   ```

4. **Remove Secrets from app.yaml**
   ```yaml
   # BEFORE (INSECURE)
   env_variables:
     N8N_WEBHOOK_SECRET: "local-dev-secret-key"
   
   # AFTER (SECURE)
   # No env_variables section - use --set-secrets flag only
   ```

### Short-Term Hardening (Within 2 Weeks)

5. **Implement Redis Rate Limiting**
   ```typescript
   // lib/rate-limit.ts
   import Redis from 'ioredis';
   
   const redis = new Redis({
     host: process.env.REDIS_HOST,
     password: process.env.REDIS_PASSWORD,
   });
   
   export async function checkRateLimit(key: string, max: number, windowMs: number): Promise<boolean> {
     const now = Date.now();
     const multi = redis.multi();
     multi.zremrangebyscore(`ratelimit:${key}`, 0, now - windowMs);
     multi.zcard(`ratelimit:${key}`);
     multi.zadd(`ratelimit:${key}`, now, `${now}-${Math.random()}`);
     multi.pexpire(`ratelimit:${key}`, windowMs);
     const results = await multi.exec();
     return (results?.[1]?.[1] as number) < max;
   }
   ```

6. **Add CSRF Protection**
   ```typescript
   // lib/csrf.ts
   import { cookies } from 'next/headers';
   import { randomBytes } from 'crypto';
   
   export function generateCSRFToken(): string {
     return randomBytes(32).toString('hex');
   }
   
   export async function validateCSRFToken(request: Request): Promise<boolean> {
     const cookieStore = await cookies();
     const cookieToken = cookieStore.get('csrf-token')?.value;
     const headerToken = request.headers.get('X-CSRF-Token');
     return cookieToken === headerToken;
   }
   ```

7. **Strengthen CSP Headers**
   ```javascript
   // next.config.mjs
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
   }
   ```

8. **Add Input Length Validation**
   ```typescript
   // lib/schemas/forms.ts
   export const contactFormSchema = z.object({
     name: z.string().min(2).max(100),
     email: z.string().email().max(254),
     message: z.string().min(10).max(5000),
     // ...
   });
   ```

### Long-Term Security Improvements (Roadmap)

9. **Implement WAF Rules**
   - Deploy Cloud Armor with OWASP Core Rule Set
   - Custom rules for form submission abuse
   - Geo-blocking if applicable

10. **Secret Management Hardening**
    - Rotate all secrets every 90 days (automated)
    - Implement secret versioning strategy
    - Audit secret access logs

11. **Security Monitoring**
    - Implement SIEM for security events
    - Automated threat detection
    - Incident response automation

12. **Zero Trust Architecture**
    - Mutual TLS between services
    - Service-to-service authentication
    - Network segmentation

---

## 5. PRE-DEPLOYMENT SECURITY CHECKLIST

### 🔴 BLOCKING ITEMS (Must be completed)

- [ ] **CRITICAL-1:** JWT Token rotated and removed from git history
- [ ] **CRITICAL-2:** app.yaml secrets removed (use Secret Manager only)
- [ ] **CRITICAL-3:** Cloudflare tunnel URLs replaced with production n8n URL
- [ ] **CRITICAL-4:** Git history purged of all secrets (verified with `git log --all --full-history`)
- [ ] **HIGH-5:** Next.js updated to >= 16.1.7
- [ ] **HIGH-1:** Redis rate limiting implemented OR Cloud Armor configured
- [ ] **HIGH-2:** Input length validation added to all form schemas

### 🟡 HIGH PRIORITY (Should be completed)

- [ ] **HIGH-3:** CSRF protection implemented
- [ ] **HIGH-4:** IP_HASH_SALT required in production
- [ ] **HIGH-6:** Security headers applied to static assets
- [ ] **HIGH-7:** PII redacted from logs
- [ ] **HIGH-8:** Health endpoint rate limiting added
- [ ] **MEDIUM-1:** CSP headers hardened (remove unsafe-inline/eval)

### 🟢 MEDIUM PRIORITY (Complete before full launch)

- [ ] **MEDIUM-2:** Permissions-Policy header added
- [ ] **MEDIUM-3:** ESLint rule for NEXT_PUBLIC_ secrets
- [ ] **MEDIUM-4:** CORS localhost removed from production
- [ ] **MEDIUM-5:** Cross-Origin headers added
- [ ] **MEDIUM-8:** minimatch vulnerabilities patched
- [ ] All other Medium and Low priority items

### ✅ VERIFICATION STEPS

- [ ] Run `pnpm audit` - should show 0 high/critical vulnerabilities
- [ ] Run secret scanner (e.g., GitLeaks, TruffleHog) - should find 0 secrets
- [ ] Verify no `.env.production` in git: `git log --all --full-history -- zaplit-com/.env.production`
- [ ] Verify app.yaml has no `env_variables` section with secrets
- [ ] Test rate limiting works across multiple instances
- [ ] Test CSRF protection blocks requests without token
- [ ] Verify CSP headers in browser DevTools
- [ ] Verify security headers on static assets
- [ ] Run penetration test on form submission endpoints

---

## 6. COMPLIANCE CHECKLIST

| Requirement | Status | Notes |
|-------------|--------|-------|
| GDPR Data Minimization | ⚠️ Partial | IP hashing implemented, email logging needs review |
| GDPR Right to Deletion | ❌ Not Implemented | No deletion endpoint |
| GDPR Consent Tracking | ⚠️ Partial | Form submissions logged but consent not explicit |
| SOC 2 Access Controls | ⚠️ Partial | Basic auth on n8n, no SSO |
| SOC 2 Audit Logging | ✅ Pass | Structured audit logs implemented |
| SOC 2 Encryption at Rest | ✅ Pass | GCP handles this |
| SOC 2 Encryption in Transit | ✅ Pass | TLS 1.3 enforced |
| CCPA Data Inventory | ❌ Missing | No data classification |

---

## 7. SECURITY CONTACTS & ESCALATION

| Role | Contact | When to Contact |
|------|---------|-----------------|
| Security Lead | security@zaplit.com | Any security incident |
| CTO | cto@zaplit.com | Critical vulnerabilities |
| DevOps | devops@zaplit.com | Deployment issues |
| Twenty CRM Support | support@twenty.com | API key issues |

---

## 8. SIGN-OFF

**Report Prepared By:** Security Engineer  
**Review Required By:** CTO, Security Lead  
**Next Audit Date:** June 20, 2026  

### Approval Status

- [ ] Security Lead Review
- [ ] CTO Approval
- [ ] DevOps Verification

---

*This document contains sensitive security information. Handle according to company data classification policy.*

**DO NOT DEPLOY TO PRODUCTION UNTIL ALL CRITICAL ISSUES ARE RESOLVED**
