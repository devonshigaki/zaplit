# Zaplit Monorepo - Configuration & Environment Variable Audit Report

**Date:** 2026-03-20  
**Auditor:** DevOps Engineer  
**Scope:** All environment variables, configuration files, and secret management across the Zaplit monorepo

---

## Executive Summary

This audit examines environment variables, configuration files, secret management practices, and deployment configurations across the Zaplit monorepo. Critical security issues have been identified, including exposed secrets in version control, inconsistent environment variable documentation, and missing validation patterns.

### Risk Rating: 🔴 HIGH
- **3 Critical** security issues
- **8 High** priority gaps
- **12 Medium** priority improvements needed

---

## 1. Environment Variable Gaps

### 1.1 Missing from .env.example Files

#### Root `.env.example` (zaplit/)
| Variable | Used In | Status |
|----------|---------|--------|
| `NEXT_PUBLIC_LOGO_TOKEN` | zaplit-com, zaplit-org | ❌ Missing |
| `NEXT_PUBLIC_SENTRY_DSN` | error-boundary.tsx | ❌ Missing |
| `IP_HASH_SALT` | submit-form/route.ts | ❌ Missing |
| `VERCEL_GIT_COMMIT_SHA` | health/route.ts | ❌ Missing |
| `TWENTY_API_KEY` | cloudbuild.yaml | ❌ Missing |
| `APP_SECRET` | cloudbuild.yaml | ❌ Missing |
| `REDIS_*` | scripts-ts/redis.ts | ❌ Missing |
| `TWENTY_TOKEN` | scripts-ts/tests/ | ❌ Missing |
| `TWENTY_CRM_URL` | scripts-ts/tests/ | ❌ Missing |
| `GRAFANA_*` | monitoring/ | ❌ Missing |

#### zaplit-com/.env.example
| Variable | Used In | Status |
|----------|---------|--------|
| `NEXT_PUBLIC_LOGO_TOKEN` | integrations/page.tsx | ❌ Missing |
| `NEXT_PUBLIC_SENTRY_DSN` | error-boundary.tsx | ❌ Missing |
| `VERCEL_GIT_COMMIT_SHA` | health/route.ts | ❌ Missing |
| `MOCK_N8N` | Comment only | ⚠️ Documented but unused |

#### zaplit-org/.env.example
| Variable | Used In | Status |
|----------|---------|--------|
| `NEXT_PUBLIC_SENTRY_DSN` | error-boundary.tsx | ❌ Missing |
| `VERCEL_GIT_COMMIT_SHA` | health/route.ts | ❌ Missing |
| `N8N_WEBHOOK_URL` | Only in zaplit-com | ⚠️ Inconsistent (org uses specific URLs) |

### 1.2 Variables in Examples but Not Used in Code

| Variable | Location | Issue |
|----------|----------|-------|
| `MOCK_N8N` | zaplit-com/.env.example | Commented out, no code implementation |
| `TWENTY_BASE_URL` | .env.production | Referenced but no active code usage |

### 1.3 Inconsistent Variable Naming

| Variable | zaplit-com | zaplit-org | Issue |
|----------|------------|------------|-------|
| Webhook URL fallback | `N8N_WEBHOOK_URL` | Not used | Inconsistent fallback behavior |
| Logo token | `NEXT_PUBLIC_LOGO_TOKEN` | `NEXT_PUBLIC_LOGO_TOKEN` | ✅ Consistent |
| IP Hash Salt | `IP_HASH_SALT` | `IP_HASH_SALT` | ✅ Consistent |

---

## 2. Hardcoded Secrets (Critical Security Issues)

### 🔴 CRITICAL: Exposed JWT Token in Version Control

**Location:** `zaplit-com/.env.production` (line 8)  
**Location:** `zaplit-com/.next/standalone/zaplit-com/.env.production`

```bash
TWENTY_API_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI1ODgwNDlmMy0zNDhhLTQwYWYtOGIyMC0zYzc1NDllOTI1NzIiLCJ0eXBlIjoiQVBJX0tFWSIsIndvcmtzcGFjZUlkIjoiNTg4MDQ5ZjMtMzQ4YS00MGFmLThiMjAtM2M3NTQ5ZTkyNTcyIiwiaWF0IjoxNzczODc3MTY1LCJleHAiOjQ5Mjc0ODA3NjQsImp0aSI6IjE3NTFjOTcxLTA4MjctNGU2MS1hMDAyLWVkMzQ4OGMxYzdiMyJ9.P7UOeTAhK_1DhBx3b3OX1U6CRJ8jLmUcSYUchyolyeQ
```

**Risk:** Production API key committed to version control  
**Action:** Immediately revoke this token in Twenty CRM and rotate

### 🔴 CRITICAL: Hardcoded Webhook Secrets

**Location:** `zaplit-com/app.yaml` (line 22)
```yaml
N8N_WEBHOOK_SECRET: "local-dev-secret-key"
```

**Location:** `zaplit-com/.env.production` (line 4)  
**Location:** `zaplit-com/.next/standalone/zaplit-com/.env.production` (line 4)
```bash
N8N_WEBHOOK_SECRET=local-dev-secret-key
```

**Risk:** Weak secret in production configuration  
**Action:** Use GCP Secret Manager, never commit secrets

### 🔴 CRITICAL: Cloudflare Tunnel URLs in Config

**Location:** `zaplit-com/app.yaml` (lines 20-21)
**Location:** `zaplit-com/.env.production` (lines 2-3)

```yaml
N8N_WEBHOOK_CONSULTATION: "https://dam-boolean-virginia-advertiser.trycloudflare.com/webhook/consultation"
N8N_WEBHOOK_CONTACT: "https://dam-boolean-virginia-advertiser.trycloudflare.com/webhook/contact"
```

**Risk:** Temporary tunnel URLs in production config  
**Action:** Use permanent n8n.zaplit.com URLs

### 🟠 HIGH: Weak Secret Placeholders

**Location:** `.env.security.example`
```bash
N8N_ENCRYPTION_KEY=your-32-character-encryption-key-here-minimum-length
WEBHOOK_BEARER_TOKEN=your-webhook-bearer-token-here
WEBHOOK_API_KEY=your-webhook-api-key-here
WEBHOOK_HMAC_SECRET=your-hmac-secret-here-very-long-string
```

**Risk:** Placeholders may be used as actual values  
**Action:** Add validation to prevent weak/placeholder values

---

## 3. Configuration Inconsistencies

### 3.1 Next.js Configuration (next.config.mjs)

| Aspect | zaplit-com | zaplit-org | examples/optimized | Issue |
|--------|------------|------------|-------------------|-------|
| `swcMinify` | ❌ Missing | ❌ Missing | ✅ Enabled | Inconsistent |
| `removeConsole` | ❌ Missing | ❌ Missing | ✅ Production | Inconsistent |
| `X-DNS-Prefetch-Control` | ❌ Missing | ❌ Missing | ✅ Enabled | Inconsistent |
| Cache headers | ❌ Missing | ❌ Missing | ✅ Static assets | Inconsistent |
| Bundle analyzer | ✅ require() | ✅ require() | ✅ ES import | Mixed styles |

**Recommendation:** Sync all next.config.mjs files to use the optimized version as baseline.

### 3.2 TypeScript Configuration (tsconfig.json)

| Setting | Root | zaplit-com | zaplit-org | scripts-ts | Issue |
|---------|------|------------|------------|------------|-------|
| `jsx` | preserve | react-jsx | react-jsx | N/A | ⚠️ Inconsistent |
| `module` | esnext | esnext | esnext | NodeNext | ⚠️ scripts-ts different |
| `moduleResolution` | bundler | bundler | bundler | NodeNext | ⚠️ scripts-ts different |
| `target` | ES2022 | ES2022 | ES2022 | ES2022 | ✅ Consistent |
| `strict` | true | true | true | true | ✅ Consistent |

**Recommendation:** scripts-ts uses NodeNext for valid reasons (Node.js execution), but document this difference.

### 3.3 ESLint Configuration

| Location | Format | Rules |
|----------|--------|-------|
| Root | `.eslintrc.json` | Basic |
| zaplit-com | `eslint.config.mjs` (flat) | TypeScript |
| zaplit-org | `eslint.config.mjs` (flat) | TypeScript |
| scripts-ts | ❌ Missing | N/A |

**Issue:** scripts-ts lacks ESLint configuration  
**Issue:** Root still uses legacy `.eslintrc.json`

### 3.4 PostCSS Configuration

| Location | Tailwind Plugin | Status |
|----------|-----------------|--------|
| zaplit-com | `@tailwindcss/postcss` | ✅ |
| zaplit-org | `@tailwindcss/postcss` | ✅ |

**Status:** ✅ Consistent

### 3.5 Docker Configuration

| Aspect | zaplit-com | zaplit-org | examples/optimized | Issue |
|--------|------------|------------|-------------------|-------|
| Node version | 20-alpine | 20-alpine | 20-alpine | ✅ Consistent |
| pnpm version | 9.0.0 | 9.0.0 | 9.0.0 | ✅ Consistent |
| Health check | ✅ | ✅ | ✅ | ✅ Consistent |
| Non-root user | ✅ | ✅ | ✅ | ✅ Consistent |
| `apk del` cleanup | ❌ Missing | ❌ Missing | ✅ Present | Inconsistent |

**Recommendation:** Add `apk del --purge` cleanup to all Dockerfiles.

### 3.6 Cloud Build Configuration

| Aspect | zaplit-com | zaplit-org | hestia | Issue |
|--------|------------|------------|--------|-------|
| Machine type | E2_HIGHCPU_8 | E2_HIGHCPU_8 | E2_HIGHCPU_8 | ✅ Consistent |
| Secrets | ✅ | ✅ | ✅ | ✅ Consistent |
| Environment vars | ✅ | ✅ | ✅ | ✅ Consistent |
| Timeout | 900s | 900s | 1800s | ⚠️ Hestia longer (expected) |

**Status:** ✅ Consistent

### 3.7 App Engine Configuration (app.yaml)

| Aspect | zaplit-com | zaplit-org | Issue |
|--------|------------|------------|-------|
| Hardcoded secrets | ✅ Present | ❌ None | ⚠️ zaplit-com only |
| Environment vars | 4 variables | 2 variables | ⚠️ Inconsistent |
| Scaling config | ✅ | ✅ | ✅ Similar |

---

## 4. Missing Configuration Files

### 4.1 Missing Environment Examples

| Directory | Missing File | Purpose |
|-----------|--------------|---------|
| `scripts-ts/` | `.env.example` | Test tokens, Redis config |
| `monitoring/` | `.env.example` | Prometheus, Grafana config |
| `workflows/` | `.env.example` | n8n webhook URLs |

### 4.2 Missing CI/CD Configurations

| Configuration | Status | Location |
|---------------|--------|----------|
| Docker Compose for local dev | ❌ Missing | Should be at root |
| Kubernetes manifests | ❌ Missing | Optional but recommended |
| Dependabot config | ❌ Missing | `.github/dependabot.yml` |
| CodeQL analysis | ❌ Missing | `.github/workflows/codeql.yml` |

### 4.3 Missing Validation Files

| File | Purpose | Status |
|------|---------|--------|
| `zaplit-com/src/lib/env.ts` | Runtime env validation | ❌ Missing |
| `zaplit-org/src/lib/env.ts` | Runtime env validation | ❌ Missing |
| `scripts-ts/src/lib/env.ts` | Runtime env validation | ❌ Missing |

---

## 5. NEXT_PUBLIC_ Usage Analysis (Client-Side Exposure)

### Variables Exposed to Browser

| Variable | Usage | Risk Level | Notes |
|----------|-------|------------|-------|
| `NEXT_PUBLIC_LOGO_TOKEN` | Logo.dev integration | 🟡 Low | Public token by design |
| `NEXT_PUBLIC_SENTRY_DSN` | Error tracking | 🟡 Low | Standard practice |
| `NEXT_PUBLIC_SITE_URL` | Cloud Build | 🟢 None | Build-time only |

### Assessment
- ✅ No sensitive secrets exposed via NEXT_PUBLIC_
- ✅ Logo token is designed to be public
- ⚠️ Sentry DSN should use separate DSN for client vs server

---

## 6. Configuration Validation Status

### 6.1 Startup Validation

| Application | Env Validation | Health Check | Graceful Degradation |
|-------------|----------------|--------------|---------------------|
| zaplit-com | ❌ None | ✅ /api/health | ✅ Partial |
| zaplit-org | ❌ None | ✅ /api/health | ✅ Partial |
| scripts-ts | ❌ None | ❌ None | ❌ None |

### 6.2 Required vs Optional Variables

| Variable | zaplit-com | zaplit-org | Required? |
|----------|------------|------------|-----------|
| `N8N_WEBHOOK_CONSULTATION` | ✅ Used | ✅ Used | Yes |
| `N8N_WEBHOOK_CONTACT` | ✅ Used | ✅ Used | Yes |
| `N8N_WEBHOOK_NEWSLETTER` | ✅ Used | ✅ Used | Yes (optional feature) |
| `N8N_WEBHOOK_SECRET` | ✅ Used | ✅ Used | No (conditional) |
| `IP_HASH_SALT` | ✅ Used | ✅ Used | No (has fallback) |
| `NEXT_PUBLIC_LOGO_TOKEN` | ✅ Used | ✅ Used | No (empty fallback) |
| `NEXT_PUBLIC_SENTRY_DSN` | ✅ Used | ✅ Used | No (conditional) |

---

## 7. Secret Management Analysis

### 7.1 GCP Secret Manager Usage

**Cloud Build (cloudbuild.yaml):**
```yaml
--set-secrets=TWENTY_API_KEY=twenty-api-key:latest,N8N_WEBHOOK_SECRET=n8n-webhook-secret:latest,APP_SECRET=app-secret:latest
```

✅ **Correctly configured** - Secrets referenced from Secret Manager

### 7.2 GitHub Actions Secrets

**Required Secrets (not in repo):**
- `GCP_WORKLOAD_IDENTITY_PROVIDER`
- `GCP_SERVICE_ACCOUNT`
- `GCP_PROJECT_ID`

**Status:** ✅ Correctly using Workload Identity (not service account keys)

### 7.3 Environment Variable Sources

| Source | Development | Staging | Production |
|--------|-------------|---------|------------|
| `.env.local` | ✅ | ❌ | ❌ |
| GCP Secret Manager | ❌ | ✅ | ✅ |
| GitHub Secrets | ❌ | ✅ | ✅ |
| Cloud Build Secrets | ❌ | ✅ | ✅ |
| Hardcoded | ⚠️ Some | ❌ | 🔴 Yes (app.yaml) |

---

## 8. Configuration Checklist for Production

### Immediate Actions Required

- [ ] **CRITICAL:** Remove and rotate `TWENTY_API_KEY` from `.env.production`
- [ ] **CRITICAL:** Remove hardcoded secrets from `zaplit-com/app.yaml`
- [ ] **CRITICAL:** Update `.gitignore` to prevent `.env.production` commits
- [ ] **HIGH:** Update Cloudflare tunnel URLs to permanent n8n.zaplit.com URLs
- [ ] **HIGH:** Create runtime environment validation for all apps
- [ ] **HIGH:** Add `scripts-ts/.env.example` with all required variables

### Short-Term Improvements

- [ ] Sync `next.config.mjs` across all apps using optimized version
- [ ] Add `apk del --purge` cleanup to all Dockerfiles
- [ ] Create root `docker-compose.yml` for local development
- [ ] Add ESLint config to `scripts-ts/`
- [ ] Upgrade root `.eslintrc.json` to flat config format
- [ ] Add Dependabot configuration

### Long-Term Enhancements

- [ ] Implement centralized configuration management (e.g., Consul, Vault)
- [ ] Add configuration drift detection
- [ ] Implement automated secret rotation
- [ ] Add configuration validation tests to CI
- [ ] Create environment-specific config validation pipelines

---

## 9. Appendices

### Appendix A: Complete Environment Variable Inventory

#### zaplit-com Environment Variables
```bash
# Webhook Configuration (Required)
N8N_WEBHOOK_CONSULTATION
N8N_WEBHOOK_CONTACT
N8N_WEBHOOK_NEWSLETTER
N8N_WEBHOOK_URL

# Security (Required)
N8N_WEBHOOK_SECRET
IP_HASH_SALT

# Third-party Integrations (Optional)
NEXT_PUBLIC_LOGO_TOKEN
NEXT_PUBLIC_SENTRY_DSN

# Build/Runtime (Auto-set)
NODE_ENV
NEXT_TELEMETRY_DISABLED
VERCEL_GIT_COMMIT_SHA
PORT
HOSTNAME
```

#### zaplit-org Environment Variables
```bash
# Webhook Configuration (Required)
N8N_WEBHOOK_CONSULTATION
N8N_WEBHOOK_CONTACT
N8N_WEBHOOK_NEWSLETTER

# Security (Required)
N8N_WEBHOOK_SECRET
IP_HASH_SALT

# Third-party Integrations (Optional)
NEXT_PUBLIC_LOGO_TOKEN
NEXT_PUBLIC_SENTRY_DSN

# Build/Runtime (Auto-set)
NODE_ENV
NEXT_TELEMETRY_DISABLED
```

#### scripts-ts Environment Variables
```bash
# Testing
TWENTY_TOKEN
TWENTY_CRM_URL

# Redis
REDIS_HOST
REDIS_PORT
REDIS_PASSWORD
REDIS_DB
REDIS_TLS
REDIS_CONNECT_TIMEOUT
REDIS_COMMAND_TIMEOUT
REDIS_MAX_RETRIES
REDIS_KEY_PREFIX

# GCP
GCP_PROJECT_ID

# Monitoring
GRAFANA_ADMIN_PASSWORD
```

### Appendix B: File Locations Summary

| Config Type | zaplit-com | zaplit-org | scripts-ts | Root |
|-------------|------------|------------|------------|------|
| .env.example | ✅ | ✅ | ❌ | ✅ |
| next.config.mjs | ✅ | ✅ | N/A | N/A |
| tsconfig.json | ✅ | ✅ | ✅ | ✅ |
| postcss.config.mjs | ✅ | ✅ | N/A | N/A |
| eslint.config.mjs | ✅ | ✅ | ❌ | ❌ |
| Dockerfile | ✅ | ✅ | N/A | N/A |
| cloudbuild.yaml | ✅ | ✅ | N/A | N/A |
| app.yaml | ✅ | ✅ | N/A | N/A |

---

## 10. Conclusion

This audit reveals significant security concerns requiring immediate attention, particularly around hardcoded secrets in version control. The configuration inconsistencies, while not immediately critical, create maintenance overhead and potential deployment issues.

### Priority Matrix

| Priority | Issue | Effort | Impact |
|----------|-------|--------|--------|
| P0 | Rotate exposed TWENTY_API_KEY | 30 min | Critical |
| P0 | Remove hardcoded secrets from app.yaml | 30 min | Critical |
| P1 | Add env validation to all apps | 4 hours | High |
| P1 | Update .env.example files | 2 hours | High |
| P2 | Sync next.config.mjs files | 2 hours | Medium |
| P2 | Add missing ESLint configs | 2 hours | Medium |
| P3 | Implement centralized config | 2 days | Low |

---

*Report generated by automated configuration audit tool*  
*For questions, contact the DevOps team*
