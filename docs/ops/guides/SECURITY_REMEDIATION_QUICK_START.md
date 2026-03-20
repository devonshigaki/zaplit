# Security Remediation Quick Start Guide

**For:** n8n + Twenty CRM Integration  
**Priority:** 🔴 CRITICAL - Immediate Action Required  
**Time to Complete:** 2-4 hours

---

## Immediate Actions (Do Today)

### 1. Verify N8N_ENCRYPTION_KEY (15 minutes)

```bash
# SSH into your n8n VM
ssh your-vm-user@n8n.zaplit.com

# Check if encryption key is set
docker exec n8n printenv N8N_ENCRYPTION_KEY

# If empty or looks like default, EMERGENCY PROCEDURE:
# WARNING: This will require re-entering ALL credentials

# Generate new key
openssl rand -hex 32
# Example output: a1b2c3d4e5f6789... (64 characters)

# Set in docker-compose.yml or environment
export N8N_ENCRYPTION_KEY="your-new-key-here"

# Restart n8n
docker-compose restart n8n

# Re-enter all credentials in n8n UI
# Settings → Credentials → Update each one
```

### 2. Enable n8n Basic Authentication (30 minutes)

```bash
# Add to your n8n environment variables
cat >> /path/to/n8n/.env << 'EOF'
# Basic Authentication
N8N_BASIC_AUTH_ACTIVE=true
N8N_BASIC_AUTH_USER=zaplit_admin
N8N_BASIC_AUTH_PASSWORD=$(openssl rand -base64 32)
EOF

# Restart n8n
docker-compose restart n8n

# Test - you should now see login prompt at https://n8n.zaplit.com
```

**Save these credentials securely in your password manager!**

---

## This Week (Priority: HIGH)

### 3. Implement Webhook HMAC Authentication

#### Step 1: Generate Secret

```bash
# Generate a strong HMAC secret
WEBHOOK_SECRET=$(openssl rand -hex 64)
echo "Your webhook secret: $WEBHOOK_SECRET"
# Save this securely!
```

#### Step 2: Update n8n Workflow

Add a "Security Validation" code node as the FIRST node after webhook:

```javascript
// Security Validation Node
const crypto = require('crypto');

const headers = $input.headers;
const body = $input.body;

// 1. Validate HMAC Signature
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

// Calculate expected signature
const payload = JSON.stringify(body);
const expectedSignature = crypto
  .createHmac('sha256', expectedSecret)
  .update(payload)
  .digest('hex');

if (signature !== expectedSignature) {
  // Log failed attempt (sanitized)
  console.log('Auth failed:', {
    timestamp: new Date().toISOString(),
    ip: headers['x-forwarded-for'] || 'unknown'
  });
  
  return [{
    json: {
      status: 'error',
      message: 'Unauthorized: Invalid signature',
      code: 'AUTH_FAILED'
    },
    statusCode: 401
  }];
}

// 2. Validate required fields
const requiredFields = ['data', 'formType'];
const missingFields = requiredFields.filter(field => !body[field]);

if (missingFields.length > 0) {
  return [{
    json: {
      status: 'error',
      message: `Missing required fields: ${missingFields.join(', ')}`,
      code: 'VALIDATION_FAILED'
    },
    statusCode: 400
  }];
}

// 3. Return validated data
return [{
  json: {
    status: 'validated',
    data: body.data,
    formType: body.formType,
    metadata: {
      receivedAt: new Date().toISOString(),
      sourceIp: headers['x-forwarded-for'] || 'unknown'
    }
  }
}];
```

#### Step 3: Update Next.js API Route

Update `/app/api/submit-form/route.ts`:

```typescript
// Add to sendToN8N function
async function sendToN8N(
  formType: string,
  data: unknown,
  metadata: Record<string, unknown>
): Promise<{ success: boolean; error?: string }> {
  const webhookUrl = process.env.N8N_WEBHOOK_CONSULTATION;
  
  if (!webhookUrl) {
    return { success: false, error: "No webhook URL configured" };
  }

  const result = await withRetry(async () => {
    const payload = JSON.stringify({
      formType,
      data,
      metadata,
    });

    // Generate HMAC signature
    const signature = crypto
      .createHmac('sha256', process.env.WEBHOOK_HMAC_SECRET!)
      .update(payload)
      .digest('hex');

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Signature": signature,
      },
      body: payload,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return true;
  }, "n8n webhook");

  return { success: result !== null };
}
```

#### Step 4: Add Environment Variable

```bash
# Add to .env.production
WEBHOOK_HMAC_SECRET=your-generated-secret-here

# Add to .env.local for testing
WEBHOOK_HMAC_SECRET=dev-secret-for-local-testing
```

---

### 4. Add PII Sanitization to Logs

Update the audit logging function in `submit-form/route.ts`:

```typescript
// Sanitize PII before logging
function sanitizeForLog(data: Record<string, unknown>): Record<string, unknown> {
  const sensitiveFields = ['email', 'name', 'company', 'message'];
  const sanitized = { ...data };
  
  sensitiveFields.forEach(field => {
    if (field in sanitized) {
      const value = String(sanitized[field]);
      // Keep first 3 and last 3 characters, mask the rest
      if (value.length > 6) {
        sanitized[field] = value.substring(0, 3) + '***' + value.substring(value.length - 3);
      } else {
        sanitized[field] = '[REDACTED]';
      }
    }
  });
  
  return sanitized;
}

// Update logAudit function
function logAudit(event: {
  action: string;
  formType: string;
  email: string;
  ipHash: string;
  success: boolean;
  error?: string;
  details?: Record<string, unknown>;
}) {
  const sanitizedEvent = {
    ...event,
    email: maskEmail(event.email),
    details: event.details ? sanitizeForLog(event.details) : undefined,
  };
  
  const auditEntry = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    ...sanitizedEvent,
  };
  
  console.log("[AUDIT]", JSON.stringify(auditEntry));
}

// Helper to mask email
function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return '[NO EMAIL]';
  const [local, domain] = email.split('@');
  const maskedLocal = local.substring(0, 2) + '***';
  return `${maskedLocal}@${domain}`;
}
```

---

### 5. Configure Webhook Rate Limiting in n8n

```javascript
// Add to Security Validation node
const rateLimitStore = $global;
const windowMs = 5 * 60 * 1000; // 5 minutes
const maxRequests = 50; // Max 50 requests per 5 minutes

const clientIp = headers['x-forwarded-for'] || 'unknown';
const now = Date.now();

// Initialize or get rate limit data
if (!rateLimitStore.rateLimits) {
  rateLimitStore.rateLimits = {};
}

const clientData = rateLimitStore.rateLimits[clientIp];

if (clientData) {
  // Check if window has expired
  if (now > clientData.resetTime) {
    // Reset window
    rateLimitStore.rateLimits[clientIp] = {
      count: 1,
      resetTime: now + windowMs
    };
  } else if (clientData.count >= maxRequests) {
    // Rate limit exceeded
    return [{
      json: {
        status: 'error',
        message: 'Rate limit exceeded. Please try again later.',
        code: 'RATE_LIMITED'
      },
      statusCode: 429
    }];
  } else {
    // Increment count
    clientData.count++;
  }
} else {
  // First request from this IP
  rateLimitStore.rateLimits[clientIp] = {
    count: 1,
    resetTime: now + windowMs
  };
}
```

---

## Security Verification Checklist

After implementing the above, verify:

```bash
# 1. Test webhook authentication
curl -X POST https://n8n.zaplit.com/webhook/consultation \
  -H "Content-Type: application/json" \
  -d '{"data":{"name":"Test"}}'
# Should return 401 Unauthorized

# 2. Test with valid signature
# (Generate signature and test - should return 200)

# 3. Verify n8n basic auth
curl https://n8n.zaplit.com/
# Should prompt for authentication

# 4. Check encryption key
docker exec n8n printenv N8N_ENCRYPTION_KEY | wc -c
# Should be 65+ characters (64 hex + newline)

# 5. Verify logs don't contain PII
docker logs n8n | grep -i "email"
# Should only show masked emails (ab***@domain.com)
```

---

## Docker Compose Security Configuration

Complete `docker-compose.yml` with security settings:

```yaml
version: '3'
services:
  n8n:
    image: n8nio/n8n:latest
    restart: always
    environment:
      # Critical: Encryption key
      - N8N_ENCRYPTION_KEY=${N8N_ENCRYPTION_KEY}
      
      # Basic Auth
      - N8N_BASIC_AUTH_ACTIVE=true
      - N8N_BASIC_AUTH_USER=${N8N_BASIC_AUTH_USER}
      - N8N_BASIC_AUTH_PASSWORD=${N8N_BASIC_AUTH_PASSWORD}
      
      # Database
      - DB_TYPE=postgresdb
      - DB_POSTGRESDB_HOST=postgres
      - DB_POSTGRESDB_DATABASE=n8n
      - DB_POSTGRESDB_USER=n8n
      - DB_POSTGRESDB_PASSWORD=${DB_PASSWORD}
      
      # Security
      - N8N_PROTOCOL=https
      - N8N_HOST=n8n.zaplit.com
      - N8N_PORT=5678
      
      # Webhook
      - WEBHOOK_URL=https://n8n.zaplit.com/
      
      # Data Retention (GDPR)
      - EXECUTIONS_DATA_PRUNE=true
      - EXECUTIONS_DATA_MAX_AGE=168
      - EXECUTIONS_DATA_SAVE_ON_SUCCESS=none
      
      # Privacy
      - N8N_DIAGNOSTICS_ENABLED=false
      - N8N_VERSION_NOTIFICATIONS_ENABLED=false
      
      # Logging
      - N8N_LOG_LEVEL=info
      
      # Webhook HMAC Secret
      - WEBHOOK_HMAC_SECRET=${WEBHOOK_HMAC_SECRET}
      
    volumes:
      - ~/.n8n:/home/node/.n8n
      - /var/run/docker.sock:/var/run/docker.sock
    ports:
      - "127.0.0.1:5678:5678"  # Only bind to localhost
    depends_on:
      - postgres

  postgres:
    image: postgres:15-alpine
    restart: always
    environment:
      - POSTGRES_USER=n8n
      - POSTGRES_PASSWORD=${DB_PASSWORD}
      - POSTGRES_DB=n8n
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "127.0.0.1:5432:5432"  # Only bind to localhost

  # Reverse proxy for HTTPS
  caddy:
    image: caddy:2-alpine
    restart: always
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      - n8n

volumes:
  postgres_data:
  caddy_data:
  caddy_config:
```

---

## Emergency Contacts

| Issue | Action | Contact |
|-------|--------|---------|
| Security breach | Immediate key rotation | Security Team |
| Service down | Emergency rollback | DevOps On-Call |
| Credential leak | Revoke and rotate | Security Team |
| Data loss | Restore from backup | DevOps Team |

---

## Resources

- [n8n Security Best Practices](https://docs.n8n.io/hosting/securing/)
- [OWASP Cheat Sheets](https://cheatsheetseries.owasp.org/)
- [Docker Security](https://docs.docker.com/engine/security/)

---

**Last Updated:** March 19, 2026  
**Version:** 1.0  
**Owner:** Security Team
