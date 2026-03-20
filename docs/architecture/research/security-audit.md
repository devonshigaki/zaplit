---
title: Security Audit Deep Dive
source: SECURITY_AUDIT_DEEP_DIVE.md
consolidated: 2026-03-19
---

# Security Audit Deep Dive

> Consolidated from: SECURITY_AUDIT_DEEP_DIVE.md, SYNTHESIS_AND_REMEDIATION_PLAN.md (Security sections)

## Executive Summary

This comprehensive security audit evaluates the production n8n + Twenty CRM integration system. The assessment covers authentication, authorization, data protection, input validation, infrastructure security, and secrets management.

### Overall Security Posture: **MEDIUM RISK**

| Category | Risk Level | Status |
|----------|------------|--------|
| Authentication & Authorization | 🔴 HIGH | Webhook lacks authentication |
| Data Protection | 🟡 MEDIUM | Partial PII logging, HTTPS enabled |
| Input Validation | 🟢 LOW | Good validation on frontend |
| Infrastructure Security | 🟡 MEDIUM | Basic hardening, some gaps |
| Secrets Management | 🟡 MEDIUM | Credentials encrypted, rotation unclear |
| Compliance (GDPR) | 🟡 MEDIUM | Retention configured, gaps exist |

### Critical Findings Summary

| Severity | Count | Description |
|----------|-------|-------------|
| 🔴 Critical | 2 | Unauthenticated webhook, Missing n8n basic auth |
| 🟠 High | 4 | No HMAC verification, PII in logs, No rate limiting on n8n, Missing encryption key verification |
| 🟡 Medium | 6 | Credential rotation not automated, No SIEM integration, Partial PII sanitization, No DDoS protection, Missing security headers, No backup encryption verification |
| 🟢 Low | 3 | Missing CSP headers, No bot detection in n8n, Version disclosure possible |

---

## Authentication & Authorization

### 🔴 CRITICAL: Webhook Authentication Missing

**Finding:** The n8n webhook trigger (`/consultation`) accepts requests WITHOUT authentication.

**Risk:**
- Anyone with the webhook URL can submit fake form data
- Potential for CRM pollution with spam/malicious data
- Could be used for reconnaissance
- Denial of Service through webhook flooding

**Remediation (Priority: P0):**
1. Implement HMAC signature verification (most secure)
2. Add Bearer token authentication as minimum
3. Implement IP whitelisting where possible

### 🔴 CRITICAL: n8n Basic Auth Status Unknown

**Finding:** Cannot verify if n8n basic authentication is enabled for the editor UI.

**Required Configuration:**
```bash
N8N_BASIC_AUTH_ACTIVE=true
N8N_BASIC_AUTH_USER=<admin-username>
N8N_BASIC_AUTH_PASSWORD=<strong-password>
```

### 🟠 HIGH: API Key vs JWT Analysis

| Aspect | API Key (Current) | JWT Token |
|--------|-------------------|-----------|
| Expiration | Configurable (long-lived) | Short-lived (hours/days) |
| Revocation | Immediate via dashboard | Must wait for expiration |
| Rotation Complexity | Simple - single key | Complex - refresh logic needed |
| Server-to-Server | ✅ Designed for this | Less suitable |
| Risk if leaked | 🔴 High (long-lived) | 🟡 Medium (short-lived) |

**Recommendation:** API Keys are appropriate for this use case, BUT implement 90-day rotation schedule.

---

## Data Protection

### PII Handling Analysis

**PII Fields Processed:**
| Field | Type | Location | Risk |
|-------|------|----------|------|
| Email | Direct PII | Form → n8n → CRM | 🔴 High |
| Name | Direct PII | Form → n8n → CRM | 🔴 High |
| Company | Indirect PII | Form → n8n → CRM | 🟡 Medium |
| Role | Professional | Form → n8n → CRM | 🟢 Low |
| IP Address | Direct PII | Form only (hashed) | 🟡 Medium |

**Current PII Protection:**
- ✅ IP hashing with salt (submit-form/route.ts)
- ⚠️ Email logged in plaintext in audit logs
- ❌ No PII redaction in n8n execution logs
- ❌ No data masking in error messages

### GDPR Compliance Gap Analysis

| Requirement | Status | Gap |
|-------------|--------|-----|
| Right to Erasure | 🟡 Partial | No automated deletion workflow |
| Data Retention Policy | ✅ Implemented | 7-day execution retention |
| Consent Tracking | ❌ Missing | No consent timestamp stored |
| Data Processing Records | 🟡 Partial | Not formally documented |
| Breach Notification | ❌ Missing | No 72-hour notification workflow |
| Data Minimization | ✅ Implemented | Only required fields collected |

---

## Infrastructure Security

### GCP VM Security Assessment

**Security Gaps:**

| Component | Status | Risk |
|-----------|--------|------|
| VM OS Hardening | 🟡 Unknown | Need CIS benchmark compliance |
| Firewall Rules | 🟡 Unknown | Need verification |
| SSH Access | 🟡 Unknown | Need key-based auth verification |
| Auto-updates | 🟡 Unknown | Security patch status unclear |
| Container Security | 🟡 Unknown | Image scanning not verified |

### Port Exposure Analysis

| Port | Service | Exposure | Risk |
|------|---------|----------|------|
| 443 | HTTPS (n8n) | Public | Required |
| 5678 | n8n direct | Should be internal only | 🔴 High if exposed |
| 22 | SSH | Should be restricted | 🟡 Medium |
| 5432 | PostgreSQL | Should be internal only | 🔴 High if exposed |

---

## Secrets Management

### Current Secrets Inventory

| Secret | Location | Risk Level |
|--------|----------|------------|
| Twenty CRM API Key | n8n Credential Store | 🟡 Medium (if encryption key set) |
| N8N_ENCRYPTION_KEY | Environment Variable | 🔴 High (if not set or weak) |
| N8N_WEBHOOK_SECRET | Environment Variable | 🟡 Medium |
| IP_HASH_SALT | Environment Variable | 🟡 Medium |
| Database Password | Environment Variable | 🟡 Medium |

### 🟠 HIGH: N8N_ENCRYPTION_KEY Verification Required

**Critical Importance:**
- Without a unique encryption key, n8n uses a default key
- All installations with default key can decrypt credentials
- This is equivalent to NO encryption

**Verification Steps:**
```bash
# Check if custom encryption key is set
docker exec n8n printenv N8N_ENCRYPTION_KEY

# Expected: 32+ character random string
# Dangerous: Empty or "n8n_encryption_key"

# If not set, IMMEDIATE ACTION REQUIRED:
# 1. Generate: openssl rand -hex 32
# 2. Document securely (password manager)
# 3. Set in environment
# 4. Restart n8n
# 5. Re-enter ALL credentials (will be unrecoverable)
```

---

## Risk Severity Matrix

### Risk Scoring Methodology

**Risk Score = Impact × Likelihood**

| Impact | 1 (Low) | 2 (Medium) | 3 (High) | 4 (Critical) |
|--------|---------|------------|----------|--------------|
| **Likelihood** |||||
| 4 (Certain) | 4 | 8 | 12 | 16 |
| 3 (Likely) | 3 | 6 | 9 | 12 |
| 2 (Possible) | 2 | 4 | 6 | 8 |
| 1 (Unlikely) | 1 | 2 | 3 | 4 |

### Prioritized Risk Register

| ID | Finding | Impact | Likelihood | Score | Priority |
|----|---------|--------|------------|-------|----------|
| R1 | Unauthenticated webhook | 4 | 3 | 12 | 🔴 P0 |
| R2 | Missing n8n basic auth | 4 | 2 | 8 | 🔴 P0 |
| R3 | Unverified encryption key | 4 | 2 | 8 | 🟠 P1 |
| R4 | PII in audit logs | 3 | 3 | 9 | 🟠 P1 |
| R5 | No webhook rate limiting | 3 | 3 | 9 | 🟠 P1 |
| R6 | No HMAC verification | 3 | 2 | 6 | 🟠 P1 |
| R7 | No automated credential rotation | 3 | 2 | 6 | 🟡 P2 |
| R8 | Missing SIEM integration | 2 | 3 | 6 | 🟡 P2 |
| R9 | No DDoS protection verification | 3 | 2 | 6 | 🟡 P2 |
| R10 | Missing security headers | 2 | 2 | 4 | 🟢 P3 |

---

## Remediation Roadmap

### Phase 1: Critical (Week 1) - 🔴 P0

| Task | Owner | Effort | Status |
|------|-------|--------|--------|
| Verify N8N_ENCRYPTION_KEY is set | DevOps | 30 min | ⬜ |
| Enable n8n basic authentication | DevOps | 1 hour | ⬜ |
| Implement webhook HMAC authentication | Engineering | 4 hours | ⬜ |
| Verify firewall rules (block 5678) | DevOps | 1 hour | ⬜ |
| Test current security configuration | QA | 2 hours | ⬜ |

### Phase 2: High Priority (Weeks 2-3) - 🟠 P1

| Task | Owner | Effort | Status |
|------|-------|--------|--------|
| Implement PII sanitization in logs | Engineering | 4 hours | ⬜ |
| Add webhook rate limiting | Engineering | 4 hours | ⬜ |
| Set up security monitoring workflow | Engineering | 8 hours | ⬜ |
| Configure Slack security alerts | DevOps | 2 hours | ⬜ |
| Document credential rotation procedure | Security | 4 hours | ⬜ |
| Implement JSON sanitization | Engineering | 2 hours | ⬜ |

### Phase 3: Medium Priority (Month 2) - 🟡 P2

| Task | Owner | Effort | Status |
|------|-------|--------|--------|
| Set up SIEM/log aggregation | DevOps | 16 hours | ⬜ |
| Implement automated credential rotation | Engineering | 16 hours | ⬜ |
| Conduct penetration testing | Security | 40 hours | ⬜ |
| Create GDPR deletion workflow | Engineering | 8 hours | ⬜ |
| Document data processing records | Compliance | 8 hours | ⬜ |
| Set up backup encryption verification | DevOps | 4 hours | ⬜ |

---

## Security Checklist Summary

### Critical (Must Have)
- [ ] N8N_ENCRYPTION_KEY configured (32+ random chars)
- [ ] n8n basic authentication enabled
- [ ] Webhook authentication implemented
- [ ] HTTPS enforced with valid TLS certificate
- [ ] Firewall rules configured (internal ports blocked)

### High Priority (Should Have)
- [ ] PII sanitization in all logs
- [ ] Webhook rate limiting enabled
- [ ] Security monitoring workflow active
- [ ] Failed authentication alerting configured
- [ ] HMAC signature verification implemented

### Medium Priority (Good to Have)
- [ ] SIEM/log aggregation configured
- [ ] Automated credential rotation
- [ ] DDoS protection verified
- [ ] Backup encryption enabled
- [ ] Security headers (CSP, HSTS) configured

---

**Original Document:** [SECURITY_AUDIT_DEEP_DIVE.md](/SECURITY_AUDIT_DEEP_DIVE.md)
