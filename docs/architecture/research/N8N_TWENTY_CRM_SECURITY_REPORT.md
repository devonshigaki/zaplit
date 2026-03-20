# n8n - Twenty CRM Integration: Security Best Practices Report

**Research Date:** March 19, 2026  
**Author:** Principal Engineer Security Research  
**Scope:** JWT Token Management, n8n Credential Security, Webhook Security, Data Privacy & Compliance, Security Monitoring

---

## Executive Summary

This report provides comprehensive security recommendations for integrating n8n with Twenty CRM. It covers JWT token lifecycle management, credential security, webhook hardening, data privacy compliance (GDPR), and security monitoring strategies.

---

## 1. JWT Token Management Strategy

### 1.1 Twenty CRM Token Architecture

Based on Twenty CRM documentation, the platform uses **API Keys** (not traditional JWTs) for authentication:

```
Authorization: Bearer YOUR_API_KEY
```

**Key Characteristics:**
- API keys are generated in Settings → APIs & Webhooks
- Keys have configurable **expiration dates**
- Keys are displayed **only once** at creation (no retrieval possible)
- Role-based access control (RBAC) can be assigned to API keys
- Rate limit: 100 calls per minute per key

### 1.2 Token Lifecycle Management Strategy

Since Twenty CRM uses long-lived API keys rather than short-lived JWTs, implement the following:

#### API Key Rotation Schedule
| Environment | Rotation Frequency | Rationale |
|-------------|-------------------|-----------|
| Production | Every 90 days | Security best practice |
| Staging | Every 30 days | Test rotation procedures |
| Development | On demand | Minimize disruption |

#### Token Storage Hierarchy (Most to Least Secure)

1. **External Secrets Manager** (Recommended for Enterprise)
   - AWS Secrets Manager
   - HashiCorp Vault
   - GCP Secret Manager
   - Azure Key Vault

2. **n8n Built-in Credential Storage** (Recommended for most users)
   - AES-256 encryption at rest
   - Credentials not exposed in workflow JSON
   - Access control via n8n RBAC

3. **Environment Variables** (Acceptable for basic setups)
   - Never commit to version control
   - Use .env files with restricted permissions

4. **Hardcoded in Workflows** (NEVER ACCEPTABLE)
   - Violates security policies
   - Exposed in workflow exports

### 1.3 Token Refresh Automation in n8n

Since Twenty CRM API keys don't auto-refresh like JWTs, implement this monitoring workflow:

```
[Schedule Trigger: Daily] 
    ↓
[HTTP Request: Check API Key Validity]
    ↓
[If: Expires within 30 days]
    ↓
[Send Notification: Key Expiration Warning]
    ↓
[Create Task: Rotate API Key]
```

**Configuration Steps:**
1. Track API key creation date and expiration date in a secure database
2. Set up alerts 30, 14, and 7 days before expiration
3. Document rotation procedures in runbooks
4. Maintain "break-glass" procedures for emergency access

---

## 2. n8n Credential Security Configuration

### 2.1 Critical Environment Variables

```bash
# Encryption Key (REQUIRED - generate once, preserve forever)
N8N_ENCRYPTION_KEY=<32-character-random-hex-string>

# Generate with: openssl rand -hex 16
# Or: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Execution Data Retention (GDPR compliance)
EXECUTIONS_DATA_PRUNE=true
EXECUTIONS_DATA_MAX_AGE=336  # 14 days default
EXECUTIONS_DATA_PRUNE_MAX_COUNT=10000

# Disable telemetry for privacy
N8N_DIAGNOSTICS_ENABLED=false
N8N_VERSION_NOTIFICATIONS_ENABLED=false

# Security headers
N8N_HSTS_MAX_AGE=31536000
```

### 2.2 Database Security

| Setting | Recommendation | Reason |
|---------|---------------|--------|
| Database | PostgreSQL (not SQLite) | Production reliability, audit logging |
| Encryption at Rest | Enable | Defense in depth |
| TLS Connections | Required | Data in transit protection |
| Backup Encryption | Required | Protect sensitive execution data |
| Access Logging | Enable | HIPAA/GDPR compliance support |

### 2.3 Credential Sharing Best Practices

1. **Create Dedicated Credentials Per Workflow**
   - Don't share credentials across unrelated workflows
   - Use descriptive naming: `TwentyCRM-Production-ContactForm`

2. **Role-Based Access Control (RBAC)**
   - n8n Enterprise: Use built-in RBAC
   - Self-hosted: Implement workflow ownership
   - Never share credential viewing permissions broadly

3. **Least Privilege Principle**
   - Create Twenty CRM API keys with minimal required permissions
   - Use read-only keys where possible
   - Separate keys for different data operations (create vs read)

### 2.4 Credential Rotation Checklist

```
□ Generate new API key in Twenty CRM
□ Update n8n credential with new key
□ Test workflow execution
□ Update documentation with new key ID
□ Schedule old key deletion (7-day grace period)
□ Delete old API key in Twenty CRM
□ Verify no workflow failures
```

---

## 3. API Security Headers & CORS

### 3.1 Required Headers for Twenty CRM API

```
Authorization: Bearer <API_KEY>
Content-Type: application/json
X-Request-ID: <unique-uuid>  # For tracing
```

### 3.2 CORS Configuration for n8n Webhooks

If exposing n8n webhooks to browser clients:

```javascript
// n8n webhook response headers configuration
const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://your-domain.com',  // NEVER use *
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
  'Access-Control-Allow-Credentials': 'false',  // Only 'true' with specific origins
  'Access-Control-Max-Age': '86400',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin'
};
```

### 3.3 IP Whitelisting Options

| Layer | Implementation | Use Case |
|-------|---------------|----------|
| Reverse Proxy (Nginx/Caddy) | `allow 203.0.113.0/24; deny all;` | Primary defense |
| Cloud Firewall (GCP/AWS) | Security group rules | Infrastructure level |
| n8n Webhook Settings | IP filter in webhook node | Application level |

---

## 4. Webhook Security Hardening

### 4.1 Webhook Authentication Options (Ranked)

#### Option 1: HMAC Signature Verification (Most Secure)

```javascript
// In n8n Function node for HMAC validation
const crypto = require('crypto');

const secret = process.env.WEBHOOK_SECRET;
const signature = $input.headers['x-signature'];
const payload = JSON.stringify($input.body);

const expectedSignature = crypto
  .createHmac('sha256', secret)
  .update(payload)
  .digest('hex');

if (signature !== expectedSignature) {
  return [{ json: { error: 'Invalid signature' }, statusCode: 401 }];
}
```

#### Option 2: Bearer Token Authentication

```javascript
// Header validation in n8n
const authHeader = $input.headers['authorization'];
const expectedToken = process.env.WEBHOOK_BEARER_TOKEN;

if (authHeader !== `Bearer ${expectedToken}`) {
  return [{ json: { error: 'Unauthorized' }, statusCode: 401 }];
}
```

#### Option 3: API Key in Header

```javascript
const apiKey = $input.headers['x-api-key'];
const expectedKey = process.env.WEBHOOK_API_KEY;

if (apiKey !== expectedKey) {
  return [{ json: { error: 'Invalid API key' }, statusCode: 401 }];
}
```

### 4.2 Webhook Security Checklist

```
□ Enable authentication (HMAC preferred, Bearer token minimum)
□ Use HTTPS only (TLS 1.2+)
□ Implement IP whitelisting where possible
□ Add rate limiting (max 100 requests/minute)
□ Validate request payload structure
□ Log all webhook requests (without sensitive data)
□ Set up alerts for failed authentication attempts
□ Implement replay protection (timestamp + nonce)
```

### 4.3 n8n Webhook Node Configuration

**Production URL vs Test URL:**
- Test URL: Only active when workflow is in "Listen" mode
- Production URL: Active when workflow is "Active"
- **Never use Test URL in production integrations**

**Response Mode Selection:**
| Mode | Use Case | Security Note |
|------|----------|---------------|
| Immediately | Fire-and-forget webhooks | Returns 200 immediately |
| When Last Node Finishes | Synchronous processing | May timeout with long workflows |
| Respond to Webhook | Custom response control | Most flexible, implement timeouts |

---

## 5. Data Privacy & Compliance

### 5.1 PII Handling in n8n

#### Data Minimization Strategy

```javascript
// Example: Strip PII before logging
const sanitizeForLog = (data) => {
  const sensitive = ['email', 'phone', 'ssn', 'credit_card'];
  const sanitized = { ...data };
  
  sensitive.forEach(field => {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }
  });
  
  return sanitized;
};

// Log only sanitized data
console.log('Processing:', sanitizeForLog($input.body));
```

#### GDPR Compliance Checklist

| Requirement | Implementation |
|-------------|---------------|
| Right to Erasure | Implement data deletion workflows |
| Data Retention | Configure `EXECUTIONS_DATA_MAX_AGE` |
| Consent Tracking | Store consent timestamps in Twenty CRM |
| Data Processing Records | Document all workflows processing PII |
| Breach Notification | 72-hour incident response workflow |

### 5.2 Execution Log Data Retention

```bash
# Recommended settings for GDPR compliance
EXECUTIONS_DATA_PRUNE=true
EXECUTIONS_DATA_MAX_AGE=168        # 7 days for production
EXECUTIONS_DATA_SAVE_ON_ERROR=all  # Keep error logs for debugging
EXECUTIONS_DATA_SAVE_ON_SUCCESS=none  # Don't keep successful execution data
EXECUTIONS_DATA_SAVE_MANUAL_EXECUTIONS=false
```

### 5.3 PII Data Flow Diagram

```
[Form Submission]
    ↓
[n8n Webhook] → [Validate/ Sanitize]
    ↓
[Process Data] → [Log: Non-PII metadata only]
    ↓
[Twenty CRM API] → [Store: Full data with consent tracking]
    ↓
[Acknowledgment] → [Response: No PII returned]
```

---

## 6. Security Monitoring Setup

### 6.1 Failed Authentication Detection

**n8n Workflow for Security Monitoring:**

```
[Webhook: Security Events]
    ↓
[Normalize Event Data]
    ↓
[Detect Multiple Failures]
    ↓ (if > 5 failures in 5 min from same IP)
[Create Jira Security Ticket]
    ↓
[Send Slack Alert]
    ↓
[Log to Security Database]
```

**Implementation Details:**

```javascript
// Failed attempt tracking
const windowMinutes = 5;
const threshold = 5;

// Check recent failures from same IP
const recentFailures = await $http.request({
  method: 'POST',
  url: process.env.SECURITY_DB_ENDPOINT,
  body: {
    ip: $input.headers['x-forwarded-for'],
    timestamp: new Date(Date.now() - windowMinutes * 60000).toISOString()
  }
});

if (recentFailures.json.count >= threshold) {
  // Trigger alert
  return [{ json: { alert: true, severity: 'high' } }];
}
```

### 6.2 Security Event Logging

**Events to Monitor:**

| Event | Severity | Response |
|-------|----------|----------|
| Failed webhook authentication | Medium | Log, alert after 5 attempts |
| Twenty CRM API 401/403 errors | High | Immediate alert |
| Workflow execution failures | Low | Daily digest |
| Credential access | Medium | Log all access |
| Unusual execution times | Medium | Investigation |

### 6.3 Alerting Configuration

**Slack Alert Format:**
```json
{
  "text": "🚨 Security Alert: Multiple Failed Authentication Attempts",
  "blocks": [
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*Source IP:* {{ $json.ip }}\n*Attempts:* {{ $json.count }}\n*Time Window:* 5 minutes\n*Action:* IP temporarily blocked"
      }
    }
  ]
}
```

### 6.4 SIEM Integration

**Log Forwarding Configuration:**

```bash
# n8n environment variables for logging
N8N_LOG_LEVEL=info
N8N_LOG_FILE=/var/log/n8n/n8n.log

# Use Filebeat/Fluentd to forward to SIEM
# Example Filebeat configuration:
filebeat.inputs:
- type: log
  paths:
    - /var/log/n8n/*.log
  fields:
    service: n8n
    environment: production
  fields_under_root: true
```

---

## 7. Implementation Roadmap

### Phase 1: Immediate (Week 1)
- [ ] Configure `N8N_ENCRYPTION_KEY`
- [ ] Migrate Twenty CRM credentials to n8n credential storage
- [ ] Enable execution data pruning
- [ ] Implement webhook authentication

### Phase 2: Short-term (Weeks 2-4)
- [ ] Set up security monitoring workflow
- [ ] Configure SIEM/log forwarding
- [ ] Implement PII sanitization in workflows
- [ ] Document credential rotation procedures

### Phase 3: Long-term (Months 2-3)
- [ ] Implement external secrets manager (AWS/GCP/Vault)
- [ ] Set up automated API key rotation
- [ ] Complete GDPR compliance documentation
- [ ] Conduct security audit

---

## 8. Security Checklist Summary

```
□ N8N_ENCRYPTION_KEY configured (32+ chars, backed up securely)
□ Twenty CRM API keys stored in n8n credentials (not hardcoded)
□ Webhook authentication enabled (HMAC or Bearer token)
□ HTTPS enforced for all communications
□ Execution data pruning enabled (max 14 days for GDPR)
□ PII sanitized from logs
□ Security monitoring workflow active
□ Failed authentication alerting configured
□ Database encrypted at rest
□ Backup encryption enabled
□ Access controls documented
□ Incident response procedures documented
```

---

## 9. References

1. n8n Security Documentation: https://docs.n8n.io/privacy-security/
2. Twenty CRM API Documentation: https://docs.twenty.com/developers/extend/api
3. JWT Security Best Practices: Authgear Research
4. n8n Credential Management: Logic Workflow Blog
5. GDPR Compliance for Self-Hosted n8n: Lumadock Tutorial

---

**Report Status:** Complete  
**Next Review Date:** June 19, 2026 (Quarterly)
