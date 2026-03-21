# Zaplit Monorepo Security Audit Report

**Date:** 2026-03-20  
**Scope:** `/Users/devonshigaki/Developer/zaplit` (zaplit-com, zaplit-org, scripts-ts)  
**Auditor:** AI Security Analysis  

---

## Executive Summary

This security audit covers the Zaplit monorepo containing two Next.js applications (zaplit-com, zaplit-org) and a TypeScript scripts package (scripts-ts). The codebase demonstrates **generally good security practices** with proper input validation, environment variable externalization, and parameterized SQL queries. However, several areas require attention, particularly around dependency vulnerabilities, CSP headers, and rate limiting implementation.

### Risk Summary
| Severity | Count | Categories |
|----------|-------|------------|
| 🔴 Critical | 0 | - |
| 🟠 High | 4 | Dependencies, Information Disclosure |
| 🟡 Medium | 6 | CSP, CORS, Rate Limiting, CSRF |
| 🟢 Low | 4 | Headers, Logging, Validation |

---

## 1. API Route Security

### 1.1 Input Validation ✅ GOOD

**Location:** `zaplit-com/app/api/submit-form/route.ts` (lines 20-53), `zaplit-org/app/api/submit-form/route.ts` (lines 16-50)

Both applications use Zod schemas for comprehensive input validation:

```typescript
const contactFormSchema = z.object({
  name: z.string().min(2, "Name is required"),
  email: z.string().email("Valid email required"),
  company: z.string().optional(),
  message: z.string().min(10, "Message must be at least 10 characters"),
  website: z.string().optional(), // Honeypot
});
```

**Strengths:**
- Strong type validation with Zod
- Honeypot field for bot detection (line 275-277)
- Email format validation
- Minimum length requirements

### 1.2 Rate Limiting ⚠️ MEDIUM

**Location:** `zaplit-com/app/api/submit-form/route.ts` (lines 17, 201-221), `zaplit-org/app/api/submit-form/route.ts` (lines 6, 101-116)

**Issue:** In-memory rate limiting using Map - not suitable for production multi-instance deployments

```typescript
// In-memory rate limit store (use Redis in production for multi-instance)
const rateLimit = new Map<string, { count: number; resetTime: number }>();
```

**Vulnerability:** Rate limits can be bypassed by:
- Distributing requests across multiple instances (Cloud Run auto-scaling)
- Restarting the container (Map clears)

**Recommendation:**
```typescript
// Use Redis or Cloud MemoryStore for distributed rate limiting
import { Redis } from 'ioredis';
const redis = new Redis(process.env.REDIS_URL);
```

**OWASP Reference:** [OWASP Rate Limiting Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Denial_of_Service_Cheat_Sheet.html)

---

## 2. Environment Variable Handling

### 2.1 Secret Management ✅ GOOD

**Location:** `zaplit-com/lib/env.ts` (lines 1-71), `zaplit-org/lib/env.ts`

Strong validation for production secrets:

```typescript
const REQUIRED_PRODUCTION_SECRETS = [
  'N8N_WEBHOOK_SECRET',
  'IP_HASH_SALT',
  'SENTRY_DSN',
] as const;

export function validateProductionEnv(): void {
  if (process.env.NODE_ENV !== 'production') return;
  
  for (const key of REQUIRED_PRODUCTION_SECRETS) {
    const value = process.env[key];
    if (!value || value.startsWith('__SECRET')) {
      missing.push(key);
    }
  }
  // Throws error if secrets missing
}
```

### 2.2 Hardcoded Fallback Salt 🟠 HIGH

**Location:** `zaplit-org/app/api/submit-form/route.ts` (lines 92-99)

**Issue:** Hardcoded fallback salt in hashEmail function:

```typescript
function hashEmail(email: string): string {
  const salt = process.env.IP_HASH_SALT || 'default-salt'; // ⚠️ Hardcoded fallback
  return createHash('sha256')
    .update(email.toLowerCase().trim() + salt)
    .digest('hex')
    .substring(0, 16);
}
```

**Impact:** If `IP_HASH_SALT` is not set, all email hashes become predictable and reversible.

**Fix:**
```typescript
function hashEmail(email: string): string {
  const salt = process.env.IP_HASH_SALT;
  if (!salt) {
    throw new Error('IP_HASH_SALT environment variable is required');
  }
  // ... hash with salt
}
```

---

## 3. CSP Headers and Security Headers

### 3.1 Current Configuration ⚠️ MEDIUM

**Location:** `zaplit-com/next.config.mjs` (lines 37-68), `zaplit-org/next.config.mjs`

```javascript
{
  key: 'Content-Security-Policy',
  value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; ...",
}
```

**Issues:**
1. `'unsafe-inline'` allows inline scripts/styles (XSS risk)
2. `'unsafe-eval'` allows eval() (code injection risk)
3. Missing `Permissions-Policy` header
4. Missing `Cross-Origin-Embedder-Policy`

**Recommended Fix:**
```javascript
{
  key: 'Content-Security-Policy',
  value: "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: https:; font-src 'self'; connect-src 'self' https://n8n.zaplit.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self';",
},
{
  key: 'Permissions-Policy',
  value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
},
{
  key: 'Cross-Origin-Embedder-Policy',
  value: 'require-corp',
}
```

**OWASP Reference:** [OWASP CSP Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html)

---

## 4. CORS Configuration

### 4.1 Current Implementation ⚠️ MEDIUM

**Location:** `zaplit-com/middleware.ts` (lines 1-43), `zaplit-org/middleware.ts`

```typescript
const allowedOrigins = [
  "https://zaplit.com",
  "https://www.zaplit.com",
  "http://localhost:3000", // Development
];

if (origin && allowedOrigins.includes(origin)) {
  response.headers.set("Access-Control-Allow-Origin", origin);
  response.headers.set("Access-Control-Allow-Credentials", "true");
}
```

**Issues:**
1. `Access-Control-Allow-Credentials: true` without strict origin validation can lead to CSRF
2. No CSRF tokens for form submissions
3. Localhost allowed in production middleware

**Recommendation:** Remove credentials header or implement CSRF tokens:
```typescript
// Option 1: Remove credentials if not needed
// Option 2: Implement CSRF token validation
const csrfToken = request.headers.get('X-CSRF-Token');
if (!verifyCsrfToken(csrfToken)) {
  return new NextResponse('Invalid CSRF token', { status: 403 });
}
```

---

## 5. Form Submission Security

### 5.1 XSS Sanitization ✅ GOOD (Basic)

**Location:** `zaplit-com/app/api/submit-form/route.ts` (lines 267-272), `zaplit-org/lib/schemas/forms.ts` (lines 44-48)

```typescript
const sanitizedData = Object.entries(validatedData).reduce((acc, [key, value]) => {
  acc[key] = typeof value === 'string' 
    ? value.trim().replace(/[<>]/g, '').slice(0, 1000)
    : value;
  return acc;
}, {});
```

**Strength:** Basic XSS prevention by stripping `<` and `>`

**Limitation:** Simple regex may not catch all XSS vectors (e.g., JavaScript event handlers, encoded characters)

**Recommendation:** Use DOMPurify for server-side sanitization:
```typescript
import DOMPurify from 'isomorphic-dompurify';

const sanitized = DOMPurify.sanitize(input, {
  ALLOWED_TAGS: [],
  ALLOWED_ATTR: []
});
```

### 5.2 Missing CSRF Protection 🟠 HIGH

**Issue:** No CSRF tokens implemented for form submissions

**Impact:** Cross-Site Request Forgery attacks possible

**Fix:** Implement CSRF protection:
```typescript
// middleware.ts - add CSRF token generation
import { generateCsrfToken } from '@/lib/csrf';

export function middleware(request: NextRequest) {
  // Generate and validate CSRF tokens
  if (request.method === 'POST') {
    const token = request.headers.get('X-CSRF-Token');
    if (!validateCsrfToken(token)) {
      return new NextResponse('CSRF validation failed', { status: 403 });
    }
  }
}
```

---

## 6. JWT/Token Handling

### 6.1 Webhook Authentication ✅ GOOD

**Location:** `zaplit-com/app/api/submit-form/route.ts` (lines 147-153)

```typescript
const headers: Record<string, string> = {
  "Content-Type": "application/json",
};

if (process.env.N8N_WEBHOOK_SECRET) {
  headers["X-Webhook-Secret"] = process.env.N8N_WEBHOOK_SECRET;
}
```

**Strength:** Webhook requests include secret header for authentication

### 6.2 API Tokens in Scripts ⚠️ MEDIUM

**Location:** Multiple files in `scripts-ts/src/tests/`

Scripts use Bearer tokens from environment variables - proper externalization

**Issue:** No token rotation mechanism or expiration handling

---

## 7. SQL Injection Risks

### 7.1 Parameterized Queries ✅ GOOD

**Location:** `scripts-ts/src/dr/dlq-api.ts`, `scripts-ts/src/dr/retry-processor.ts`

All database queries use parameterized queries:

```typescript
// GOOD - Parameterized query
await this.pool.query(`
  UPDATE form_submission_dlq 
  SET status = $2, updated_at = NOW()
  WHERE id = $1
`, [id, status]);
```

**No SQL injection vulnerabilities found** in the audited codebase.

### 7.2 Dynamic Query Building ⚠️ LOW

**Location:** `scripts-ts/src/dr/dlq-api.ts` (lines 78-159)

Dynamic WHERE clause building with proper parameterization:

```typescript
if (filters.searchEmail) {
  conditions.push(`original_payload->'body'->'data'->>'email' ILIKE $${paramIndex}`);
  params.push(`%${filters.searchEmail}%`);
}
```

**Note:** While parameterized, the `orderBy` and `orderDirection` are concatenated directly (line 153). Ensure these come from an allowlist:

```typescript
const ALLOWED_COLUMNS = ['created_at', 'updated_at', 'status', 'form_type'];
const orderBy = ALLOWED_COLUMNS.includes(filters.orderBy) ? filters.orderBy : 'created_at';
```

---

## 8. XSS Vulnerabilities

### 8.1 dangerouslySetInnerHTML ✅ GOOD

**Finding:** No usage of `dangerouslySetInnerHTML` found in the codebase.

### 8.2 eval() and Function() ✅ GOOD

**Finding:** No usage of `eval()` or `Function()` constructors found.

### 8.3 Error Boundary Information Disclosure 🟡 MEDIUM

**Location:** `zaplit-com/components/error-boundary.tsx` (lines 82-90)

```typescript
{process.env.NODE_ENV === "development" && this.state.error && (
  <div className="mt-6 p-4 bg-muted rounded-lg text-left">
    <pre className="text-xs text-muted-foreground overflow-auto">
      {this.state.error.message}
      {this.state.error.stack}
    </pre>
  </div>
)}
```

**Issue:** Error stack traces shown in development mode only - acceptable but ensure `NODE_ENV` cannot be spoofed.

---

## 9. Dependency Vulnerabilities 🟠 HIGH

### 9.1 minimatch - ReDoS (3 vulnerabilities)

**Command:** `pnpm audit --audit-level=moderate`

| Severity | Package | Vulnerable | Patched | Advisory |
|----------|---------|------------|---------|----------|
| High | minimatch | >=9.0.0 <9.0.6 | >=9.0.6 | GHSA-3ppc-4f35-3m26 |
| High | minimatch | >=9.0.0 <9.0.7 | >=9.0.7 | GHSA-7r86-cg39-jmmj |
| High | minimatch | >=9.0.0 <9.0.7 | >=9.0.7 | GHSA-23c5-xmqv-rm74 |

**Path:** `scripts-ts>@typescript-eslint/eslint-plugin>...>minimatch`

**Fix:**
```bash
pnpm update minimatch
# or
pnpm audit --fix
```

### 9.2 Next.js - Multiple Vulnerabilities 🟠 HIGH

| Severity | Package | Vulnerable | Patched | Advisory | Issue |
|----------|---------|------------|---------|----------|-------|
| Moderate | next | >=16.0.0-beta.0 <16.1.7 | >=16.1.7 | GHSA-ggv3-7p47-pfv8 | HTTP request smuggling |
| Moderate | next | >=16.0.0-beta.0 <16.1.7 | >=16.1.7 | GHSA-3x4c-7xq6-9pq8 | Unbounded disk cache growth |
| Moderate | next | >=16.0.1 <16.1.7 | >=16.1.7 | GHSA-h27x-g6w4-24gq | DoS via postponed buffering |
| Moderate | next | >=16.0.1 <16.1.7 | >=16.1.7 | GHSA-f82v-jwr5-3hjf | CSRF bypass via null origin |

**Current Version:** 16.1.6  
**Required Version:** >=16.1.7

**Fix:**
```bash
# Update both applications
cd zaplit-com && pnpm update next@latest
cd ../zaplit-org && pnpm update next@latest
```

**OWASP Reference:** [OWASP Dependency Check](https://owasp.org/www-project-dependency-check/)

---

## 10. Authentication/Authorization Gaps

### 10.1 No Authentication Required ✅ ACCEPTABLE

**Finding:** Both zaplit-com and zaplit-org are public-facing marketing sites with no authenticated areas. This is acceptable for the use case.

### 10.2 N8N Basic Auth ✅ GOOD

**Location:** `scripts-ts/src/security/enable-basic-auth.ts`

Proper implementation of basic authentication for n8n instance with password stored in GCP Secret Manager.

---

## 11. Additional Findings

### 11.1 Health Endpoint Information Disclosure 🟡 MEDIUM

**Location:** `zaplit-com/app/api/health/route.ts` (lines 42-55)

```typescript
function checkEnvironment() {
  const required = ["NODE_ENV"];
  const optional = ["N8N_WEBHOOK_CONSULTATION", "N8N_WEBHOOK_CONTACT"];
  
  return {
    required: required.reduce((acc, key) => {
      acc[key] = process.env[key] ? "set" : "missing";
      return acc;
    }, {} as Record<string, string>),
  };
}
```

**Issue:** Exposes which environment variables are configured

**Recommendation:** Remove environment variable status from public health endpoint:
```typescript
// Only return basic status without env details
return NextResponse.json({ 
  status: "healthy",
  timestamp: new Date().toISOString() 
});
```

### 11.2 Missing Security Headers 🟢 LOW

The following headers are not configured:
- `Permissions-Policy`
- `Cross-Origin-Embedder-Policy`
- `Cross-Origin-Opener-Policy`
- `Cross-Origin-Resource-Policy`

**Add to next.config.mjs:**
```javascript
{
  key: 'Permissions-Policy',
  value: 'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()',
},
{
  key: 'Cross-Origin-Embedder-Policy',
  value: 'require-corp',
},
{
  key: 'Cross-Origin-Opener-Policy',
  value: 'same-origin',
},
{
  key: 'Cross-Origin-Resource-Policy',
  value: 'same-origin',
}
```

---

## Recommendations Summary

### Immediate Actions (High Priority)

1. **Update Dependencies**
   ```bash
   pnpm update next@latest minimatch
   pnpm audit --fix
   ```

2. **Fix Hardcoded Salt**
   - Remove `'default-salt'` fallback in `zaplit-org/app/api/submit-form/route.ts`

3. **Implement CSRF Protection**
   - Add CSRF token generation and validation for form submissions

### Short-term Actions (Medium Priority)

4. **Improve CSP Headers**
   - Remove `'unsafe-inline'` and `'unsafe-eval'`
   - Add nonce-based script execution

5. **Implement Distributed Rate Limiting**
   - Use Redis or Cloud MemoryStore for multi-instance rate limiting

6. **Restrict Health Endpoint**
   - Remove environment variable exposure from public health checks

### Long-term Actions (Low Priority)

7. **Add Security Headers**
   - Implement Permissions-Policy and Cross-Origin headers

8. **Implement Content Security Reporting**
   - Add `report-uri` or `report-to` directive to CSP

---

## OWASP Top 10 Mapping

| OWASP Category | Status | Notes |
|----------------|--------|-------|
| A01: Broken Access Control | ✅ Low Risk | No authenticated areas |
| A02: Cryptographic Failures | ⚠️ Medium | Hardcoded salt fallback |
| A03: Injection | ✅ Low Risk | Parameterized queries used |
| A04: Insecure Design | ⚠️ Medium | No CSRF protection |
| A05: Security Misconfiguration | ⚠️ Medium | Permissive CSP |
| A06: Vulnerable Components | 🟠 High | Outdated dependencies |
| A07: Auth Failures | ✅ Low Risk | No authentication required |
| A08: Software Integrity | ✅ Low Risk | Proper secret management |
| A09: Logging Failures | ✅ Low Risk | Audit logging implemented |
| A10: SSRF | ✅ Low Risk | No server-side requests to user URLs |

---

## Compliance Notes

### GDPR Compliance ✅ GOOD

- IP addresses are hashed before logging (lines 84-101 in submit-form routes)
- Emails are hashed for audit correlation
- PII is not stored in logs

### Security Headers Checklist

| Header | Status |
|--------|--------|
| X-Content-Type-Options | ✅ Configured |
| X-Frame-Options | ✅ Configured |
| X-XSS-Protection | ✅ Configured |
| Strict-Transport-Security | ✅ Configured |
| Referrer-Policy | ✅ Configured |
| Content-Security-Policy | ⚠️ Too permissive |
| Permissions-Policy | ❌ Missing |

---

*End of Security Audit Report*
