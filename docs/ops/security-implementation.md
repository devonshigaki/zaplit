---
title: Security Implementation Guide
topics:
  - EXECUTION_SECURITY_FIXES.md
  - SECURITY_REMEDIATION_QUICK_START.md
  - FRONTEND_HMAC_INTEGRATION.md
  - N8N_CREDENTIAL_MANAGEMENT_GUIDE.md
---

# Security Implementation Guide

## Quick Reference

### Immediate Actions (Do Today)

#### 1. Verify N8N_ENCRYPTION_KEY (15 minutes)
```bash
# SSH into your n8n VM
ssh your-vm-user@n8n.zaplit.com

# Check if encryption key is set
docker exec n8n printenv N8N_ENCRYPTION_KEY

# Generate new key if needed
openssl rand -hex 32

# Set in docker-compose.yml
export N8N_ENCRYPTION_KEY="your-new-key-here"
docker-compose restart n8n
```

#### 2. Enable Basic Authentication (30 minutes)
```bash
# Add to environment
cat >> /path/to/n8n/.env << 'EOF'
N8N_BASIC_AUTH_ACTIVE=true
N8N_BASIC_AUTH_USER=zaplit_admin
N8N_BASIC_AUTH_PASSWORD=$(openssl rand -base64 32)
EOF

docker-compose restart n8n
```

#### 3. Test Security Configuration
```bash
# Test webhook without signature (should fail)
curl -X POST https://n8n.zaplit.com/webhook/consultation \
  -H "Content-Type: application/json" \
  -d '{"data":{"name":"Test"}}'
# Expected: 401 Unauthorized

# Verify n8n basic auth
curl https://n8n.zaplit.com/
# Expected: Login prompt

# Check encryption key
docker exec n8n printenv N8N_ENCRYPTION_KEY | wc -c
# Expected: 65+ characters
```

---

## Detailed Procedures

### 1. Encryption Key Management

#### Critical Security Issue
**Without `N8N_ENCRYPTION_KEY` set, n8n uses a default key (same across all installations) = NO security**

#### Key Generation
```bash
# 32 character base64
openssl rand -base64 32

# Or 32 character hex
openssl rand -hex 32
```

#### Docker Compose Configuration
```yaml
services:
  n8n:
    environment:
      - N8N_ENCRYPTION_KEY=${N8N_ENCRYPTION_KEY}
```

#### ⚠️ CRITICAL WARNING
**ALL EXISTING CREDENTIALS MUST BE RE-ENTERED** when encryption key changes:
- All saved credentials become unreadable
- API keys, passwords, tokens must be re-entered in n8n UI
- Workflow executions may fail until credentials are restored

### 2. Basic Authentication

#### Configuration
```yaml
environment:
  - N8N_BASIC_AUTH_ACTIVE=true
  - N8N_BASIC_AUTH_USER=zaplit-admin
  - N8N_BASIC_AUTH_PASSWORD=${N8N_ADMIN_PASSWORD}
```

#### Password Storage
- Store in GCP Secret Manager: `n8n-admin-password`
- Reference via environment variable
- NOT stored in plaintext in version control

### 3. Webhook HMAC Authentication

#### Generate Secret
```bash
WEBHOOK_SECRET=$(openssl rand -hex 64)
echo "Your webhook secret: $WEBHOOK_SECRET"
```

#### n8n Security Validation Node
```javascript
// Add as FIRST node after webhook
const crypto = require('crypto');
const headers = $input.headers;
const body = $input.body;

// Validate HMAC Signature
const signature = headers['x-signature'] || headers['X-Signature'];
const expectedSecret = process.env.WEBHOOK_HMAC_SECRET;

if (!signature || !expectedSecret) {
  return [{
    json: {
      status: 'error',
      message: 'Unauthorized: Missing signature',
      code: 'AUTH_FAILED'
    },
    statusCode: 401
  }];
}

const payload = JSON.stringify(body);
const expectedSignature = crypto
  .createHmac('sha256', expectedSecret)
  .update(payload)
  .digest('hex');

if (signature !== expectedSignature) {
  return [{
    json: {
      status: 'error',
      message: 'Unauthorized: Invalid signature',
      code: 'AUTH_FAILED'
    },
    statusCode: 401
  }];
}

return [{ json: { status: 'validated', data: body.data } }];
```

#### Frontend Integration (Next.js API Route)
```typescript
// app/api/submit-form/route.ts
import crypto from 'crypto';

async function sendToN8N(formType: string, data: unknown) {
  const webhookUrl = process.env.N8N_WEBHOOK_CONSULTATION;
  const payload = JSON.stringify({ formType, data });

  // Generate HMAC signature
  const signature = crypto
    .createHmac('sha256', process.env.WEBHOOK_HMAC_SECRET!)
    .update(payload)
    .digest('hex');

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Signature': signature,
    },
    body: payload,
  });

  return response.json();
}
```

### 4. PII Sanitization

#### Log Sanitization Function
```typescript
function sanitizeForLog(data: Record<string, unknown>): Record<string, unknown> {
  const sensitiveFields = ['email', 'name', 'company', 'message'];
  const sanitized = { ...data };
  
  sensitiveFields.forEach(field => {
    if (field in sanitized) {
      const value = String(sanitized[field]);
      if (value.length > 6) {
        sanitized[field] = value.substring(0, 3) + '***' + value.substring(value.length - 3);
      } else {
        sanitized[field] = '[REDACTED]';
      }
    }
  });
  
  return sanitized;
}

function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return '[NO EMAIL]';
  const [local, domain] = email.split('@');
  const maskedLocal = local.substring(0, 2) + '***';
  return `${maskedLocal}@${domain}`;
}
```

### 5. Rate Limiting

```javascript
// Add to Security Validation node
const rateLimitStore = $global;
const windowMs = 5 * 60 * 1000; // 5 minutes
const maxRequests = 50;

const clientIp = headers['x-forwarded-for'] || 'unknown';
const now = Date.now();

if (!rateLimitStore.rateLimits) {
  rateLimitStore.rateLimits = {};
}

const clientData = rateLimitStore.rateLimits[clientIp];

if (clientData) {
  if (now > clientData.resetTime) {
    // Reset window
    rateLimitStore.rateLimits[clientIp] = { count: 1, resetTime: now + windowMs };
  } else if (clientData.count >= maxRequests) {
    return [{
      json: {
        status: 'error',
        message: 'Rate limit exceeded. Please try again later.',
        code: 'RATE_LIMITED'
      },
      statusCode: 429
    }];
  } else {
    clientData.count++;
  }
} else {
  rateLimitStore.rateLimits[clientIp] = { count: 1, resetTime: now + windowMs };
}
```

### 6. Credential Management

#### Encryption at Rest
| Component | Security Measure |
|-----------|------------------|
| Storage | AES-256-GCM encrypted in database |
| Memory | Only decrypted during execution |
| Transmission | Never exposed in UI, logs, or exports |
| Backup | Credentials remain encrypted |

#### Rotation Schedule
| Credential Type | Rotation Frequency |
|----------------|-------------------|
| API Keys | Quarterly (90 days) |
| OAuth Tokens | Automatic (handled by n8n) |
| JWT Tokens | Per provider policy |
| Encryption Key | Annually |

#### Rotation Procedure
1. Document all workflows using the credential
2. Generate new API key/token in the service
3. Update n8n credential with new value
4. Test all workflows execute successfully
5. Revoke old credential after 24-48 hours
6. Update credential registry with new rotation date

### 7. Firewall Configuration

#### Required GCP Firewall Rules

| Port | Source | Action | Purpose |
|------|--------|--------|---------|
| 443 | 0.0.0.0/0 | ALLOW | HTTPS access via Caddy |
| 80 | 0.0.0.0/0 | ALLOW | HTTP redirect to HTTPS |
| 5678 | 10.0.0.0/8 | DENY | Block direct n8n port |

```bash
# Delete port 5678 external access
gcloud compute firewall-rules delete n8n-port-5678 --quiet || true

# Verify HTTPS only
gcloud compute firewall-rules list --filter="name~'n8n'"
```

### 8. Security Verification Checklist

- [ ] `N8N_ENCRYPTION_KEY` set (32+ character random string)
- [ ] HTTPS enabled with valid TLS certificate
- [ ] n8n behind VPN or IP whitelist
- [ ] PostgreSQL database (not SQLite) for production
- [ ] Database encrypted at rest
- [ ] Regular backups with encrypted credential storage
- [ ] Service account credentials (not personal API keys)
- [ ] Least-privilege permissions on all credentials
- [ ] Audit logs enabled for credential access
- [ ] Network segmentation (isolate n8n from other services)

### 9. Complete Docker Compose Security Configuration

```yaml
version: '3'
services:
  n8n:
    image: n8nio/n8n:latest
    restart: always
    environment:
      - N8N_ENCRYPTION_KEY=${N8N_ENCRYPTION_KEY}
      - N8N_BASIC_AUTH_ACTIVE=true
      - N8N_BASIC_AUTH_USER=${N8N_BASIC_AUTH_USER}
      - N8N_BASIC_AUTH_PASSWORD=${N8N_BASIC_AUTH_PASSWORD}
      - DB_TYPE=postgresdb
      - N8N_PROTOCOL=https
      - N8N_HOST=n8n.zaplit.com
      - EXECUTIONS_DATA_PRUNE=true
      - EXECUTIONS_DATA_MAX_AGE=168
      - N8N_DIAGNOSTICS_ENABLED=false
      - WEBHOOK_HMAC_SECRET=${WEBHOOK_HMAC_SECRET}
    ports:
      - "127.0.0.1:5678:5678"  # Only bind to localhost

  postgres:
    image: postgres:15-alpine
    restart: always
    environment:
      - POSTGRES_USER=n8n
      - POSTGRES_PASSWORD=${DB_PASSWORD}
    ports:
      - "127.0.0.1:5432:5432"

  caddy:
    image: caddy:2-alpine
    restart: always
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
```

---

## Troubleshooting

### "Credentials could not be decrypted"
| Symptom | Cause | Solution |
|---------|-------|----------|
| All credentials show decryption error | Wrong `N8N_ENCRYPTION_KEY` | Set correct key from backup |
| After container restart | Key not persisted | Set key via environment variable |
| After migration | Different key on new instance | Retrieve key from source instance |

### "Node does not have access to credential"
| Symptom | Cause | Solution |
|---------|-------|----------|
| Permission error on execution | Workflow/user credential mismatch | Check credential sharing settings |
| After credential rename | Node references old name | Update node to use new credential name |

---

## Emergency Contacts

| Issue | Action | Contact |
|-------|--------|---------|
| Security breach | Immediate key rotation | Security Team |
| Service down | Emergency rollback | DevOps On-Call |
| Credential leak | Revoke and rotate | Security Team |
| Data loss | Restore from backup | DevOps Team |

---

## Related Documents

- **Security Fixes Log:** [EXECUTION_SECURITY_FIXES.md](../../EXECUTION_SECURITY_FIXES.md)
- **Security Quick Start:** [SECURITY_REMEDIATION_QUICK_START.md](../../SECURITY_REMEDIATION_QUICK_START.md)
- **HMAC Integration:** [FRONTEND_HMAC_INTEGRATION.md](../../FRONTEND_HMAC_INTEGRATION.md)
- **Credential Management:** [N8N_CREDENTIAL_MANAGEMENT_GUIDE.md](../../N8N_CREDENTIAL_MANAGEMENT_GUIDE.md)
- **n8n Security Best Practices:** https://docs.n8n.io/hosting/securing/
