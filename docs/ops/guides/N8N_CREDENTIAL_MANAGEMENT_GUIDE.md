# n8n Credential Management Best Practices - Actionable Guide

## Executive Summary

This guide provides comprehensive instructions for managing n8n credentials securely, specifically for workflows with HTTP Request nodes using Header Auth credentials (Twenty CRM JWT token). It covers credential reconnection after import, security best practices, environment-based credential strategies, and troubleshooting.

---

## 1. Credential Reconnection Process

### Step-by-Step: Reconnect Credentials to Existing Nodes

When workflows are imported, credential references often get disconnected because credential IDs differ between environments. Here's how to reconnect them:

#### Step 1: Access the Workflow
1. Open n8n Editor UI
2. Navigate to the imported workflow
3. Look for warning indicators (⚠️) on HTTP Request nodes indicating missing credentials

#### Step 2: Reconnect Each HTTP Request Node
For each HTTP Request node with disconnected credentials:

1. **Open the Node**: Double-click the HTTP Request node
2. **Navigate to Authentication Section**: Scroll to the "Authentication" section
3. **Select Authentication Type**: Choose "Generic Credential Type"
4. **Choose Credential Type**: Select "Header Auth" from the dropdown
5. **Select Existing Credential**: From the "Credential for Header Auth" dropdown:
   - Select the previously created "Header Auth account" credential
   - OR click "Create New" if the credential doesn't exist

#### Step 3: Save the Workflow
1. Click "Save" after updating all nodes
2. **Important**: If you see warnings persist after saving, close and reopen the workflow

#### Step 4: Verify Reconnection
Check that all HTTP Request nodes show:
- No warning indicators
- Correct credential name displayed in the node
- Green checkmarks (if visible)

### Testing Credentials Without Full Workflow Execution

#### Method 1: Single Node Test
1. Click the HTTP Request node to open it
2. Click "Test Step" button (appears as "Execute Node" in some versions)
3. This tests ONLY this node without running the entire workflow
4. Verify response shows successful authentication (HTTP 200)

#### Method 2: Use a Test Endpoint
1. Create a simple HTTP Request node that calls a safe test endpoint:
   - URL: `https://api.twenty.com/rest/openapi#/meta/get_meta` (or Twenty's health endpoint)
   - Method: GET
2. Connect your credential
3. Execute the node to verify authentication works

#### Method 3: Execute Workflow with Limited Data
1. Use "Execute Workflow" button (not "Activate")
2. If the first few nodes succeed, credentials are working
3. Stop execution after credential verification

### Testing Credential Connectivity

#### Verify Header Auth is Working
For Twenty CRM JWT token authentication:

1. **Test API Call**:
   ```
   URL: https://api.twenty.com/rest/companies
   Method: GET
   Headers: Authorization: Bearer YOUR_JWT_TOKEN
   ```

2. **Expected Response**: HTTP 200 with company list JSON
3. **Authentication Failure Signs**:
   - HTTP 401 Unauthorized → Token expired or invalid
   - HTTP 403 Forbidden → Token valid but insufficient permissions
   - HTTP 400 Bad Request → Malformed request or token

---

## 2. Credential Security Best Practices

### Storage Security

#### Encryption at Rest
n8n encrypts credentials using **AES-256-GCM** (industry-standard encryption):

| Component | Security Measure |
|-----------|------------------|
| Storage | Encrypted in database at rest |
| Memory | Only decrypted during workflow execution |
| Transmission | Never exposed in plaintext in UI, logs, or exports |
| Backup | Credentials remain encrypted in backups |

**Critical**: Set `N8N_ENCRYPTION_KEY` environment variable!
- Without it, n8n uses a default key (same across all installations) = NO security
- Generate with: `openssl rand -base64 32`
- Store securely in secrets manager (NOT in version control)

#### Access Control Matrix

| n8n Edition | Credential Sharing | Access Control |
|-------------|-------------------|----------------|
| Self-hosted (Open Source) | All credentials visible to all users | Infrastructure-level controls only |
| Cloud Starter | Personal credentials only | User isolation |
| Cloud Pro | Share with team members | Role-based sharing |
| Enterprise | Full RBAC | Granular permissions per credential |

**Best Practices**:
- Create dedicated service accounts for n8n (don't reuse personal API keys)
- Use least-privilege credentials (read-only where possible)
- Document credential ownership and rotation schedule

### Rotation Strategies

#### Rotation Schedule
| Credential Type | Rotation Frequency | Notes |
|----------------|-------------------|-------|
| API Keys | Quarterly (90 days) | High-risk services: monthly |
| OAuth Tokens | Automatic | n8n handles refresh automatically |
| JWT Tokens | Per provider policy | Twenty CRM: check expiration |
| Encryption Key | Annually | Requires careful migration |

#### Rotation Procedure
1. **Prepare**: Document all workflows using the credential
2. **Create New**: Generate new API key/token in the service
3. **Update n8n**: Edit credential in n8n with new value
4. **Test**: Verify all workflows execute successfully
5. **Revoke Old**: Remove old credential in the service after 24-48 hours
6. **Document**: Update credential registry with new rotation date

### Security Checklist

- [ ] `N8N_ENCRYPTION_KEY` set (32+ character random string)
- [ ] HTTPS enabled with valid TLS certificate
- [ ] n8n behind VPN or IP whitelist (if webhooks not public)
- [ ] PostgreSQL database (not SQLite) for production
- [ ] Database encrypted at rest
- [ ] Regular backups with encrypted credential storage
- [ ] Service account credentials (not personal API keys)
- [ ] Least-privilege permissions on all credentials
- [ ] Audit logs enabled for credential access
- [ ] Network segmentation (isolate n8n from other services)

---

## 3. Environment-Based Credentials

### Environment Variables vs Stored Credentials

| Approach | Best For | Security Level | Ease of Use |
|----------|----------|----------------|-------------|
| **Stored Credentials** | Most use cases | High (AES-256 encrypted) | Easy - UI managed |
| **Environment Variables** | Containerized deployments | Medium (plain text in env) | Harder - requires restart |
| **External Secrets** | Enterprise/compliance | Very High | Complex - requires setup |

#### When to Use Each Approach

**Use Stored Credentials When:**
- Multiple workflows share the same API key
- Non-technical users need to update credentials
- You need credential versioning/rollback
- Using n8n Cloud

**Use Environment Variables When:**
- Container orchestration (Kubernetes, Docker Swarm)
- CI/CD pipelines with secret injection
- Multi-tenant deployments
- Need credential rotation without UI access

**Use External Secrets When:**
- Enterprise compliance requirements (SOC2, HIPAA)
- Centralized secrets management across tools
- Audit logging requirements
- Integrating with HashiCorp Vault, AWS Secrets Manager, Azure Key Vault

### Multi-Environment Setup

#### Pattern: Environment-Specific Credential Naming

Create separate credentials for each environment:

| Environment | Credential Name | Value Source |
|-------------|----------------|--------------|
| Development | `Twenty CRM - Dev` | Staging API key |
| Staging | `Twenty CRM - Staging` | Staging API key |
| Production | `Twenty CRM - Prod` | Production API key (restricted) |

#### Implementation

**Option 1: Credential Selection via Environment Variable**
```javascript
// In a Set node or Code node before HTTP Request
const env = $env.N8N_ENVIRONMENT || 'development';
const credentialName = `Twenty CRM - ${env.charAt(0).toUpperCase() + env.slice(1)}`;
return [{ json: { credentialName }}];
```

**Option 2: URL Mapping by Environment**
```javascript
const urls = {
  development: 'https://api-staging.twenty.com',
  staging: 'https://api-staging.twenty.com',
  production: 'https://api.twenty.com'
};
const baseUrl = urls[$env.N8N_ENVIRONMENT] || urls.development;
```

**Option 3: n8n External Secrets (Enterprise)**
Configure external secret providers:
```bash
# Enable external secrets
N8N_EXTERNAL_SECRETS_ENABLED=true
N8N_EXTERNAL_SECRETS_VAULT_ENDPOINT=https://vault.example.com
N8N_EXTERNAL_SECRETS_VAULT_TOKEN=your-token
```

### Docker Compose Example

```yaml
version: '3'
services:
  n8n:
    image: n8nio/n8n
    environment:
      # Critical: Set encryption key
      - N8N_ENCRYPTION_KEY=${N8N_ENCRYPTION_KEY}
      
      # Environment identifier
      - N8N_ENVIRONMENT=production
      
      # Database (for credential storage)
      - DB_TYPE=postgresdb
      - DB_POSTGRESDB_HOST=postgres
      - DB_POSTGRESDB_DATABASE=n8n
      
      # Optional: External secrets
      - N8N_EXTERNAL_SECRETS_ENABLED=true
      
    volumes:
      - n8n_data:/home/node/.n8n
      
  postgres:
    image: postgres:15
    environment:
      - POSTGRES_PASSWORD=${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
```

---

## 4. Troubleshooting Credential Issues

### Common Credential Errors and Solutions

#### Error: "Credential not found"
| Symptom | Cause | Solution |
|---------|-------|----------|
| Workflow shows credential warning | Credential ID mismatch after import | Reconnect credential to node (see Section 1) |
| Execution fails with "credential not found" | User lacks permission | Check credential sharing settings |
| After upgrade | Encryption key mismatch | Verify `N8N_ENCRYPTION_KEY` is set correctly |

**Resolution Steps:**
1. Open workflow in editor
2. For each affected node:
   - Deselect the credential
   - Save node
   - Reselect the credential
   - Save workflow
3. If persists, check user has access to credential

#### Error: "Credentials could not be decrypted"
| Symptom | Cause | Solution |
|---------|-------|----------|
| All credentials show decryption error | Wrong `N8N_ENCRYPTION_KEY` | Set correct key from backup |
| After container restart | Key not persisted | Set key via environment variable |
| After migration | Different key on new instance | Retrieve key from source instance |

**Resolution Steps:**
1. Check current encryption key:
   ```bash
   docker exec n8n cat /home/node/.n8n/config
   ```
2. Set `N8N_ENCRYPTION_KEY` environment variable
3. If key is lost: credentials must be recreated (cannot recover)

#### Error: "Node does not have access to credential"
| Symptom | Cause | Solution |
|---------|-------|----------|
| Permission error on execution | Workflow/user credential mismatch | Check credential sharing settings |
| After credential rename | Node references old name | Update node to use new credential name |
| In shared workflows | Owner changed | Recreate credential under new owner |

**Resolution Steps:**
1. Verify credential exists and is accessible
2. Check node references correct credential
3. In Settings → Credentials, verify sharing permissions
4. Try duplicating the workflow

#### Error: "Your Slack credential is missing required OAuth Scopes"
| Symptom | Cause | Solution |
|---------|-------|----------|
| OAuth scope errors | Insufficient permissions granted | Re-authenticate with additional scopes |
| After API update | Scopes changed in service | Update OAuth app settings |
| New feature doesn't work | Missing scope for that feature | Add required scope in OAuth app |

**Resolution Steps:**
1. Check service documentation for required scopes
2. Delete and recreate OAuth connection
3. Grant all required scopes during authentication

### Debugging "Credential Not Found" Errors

#### Step 1: Verify Credential Exists
1. Go to Settings → Credentials in n8n UI
2. Confirm credential is listed
3. Click to verify it opens without decryption errors

#### Step 2: Check Credential ID Mismatch
When importing workflows, credential IDs may not match:
```javascript
// In workflow JSON, credentials are referenced by ID
"credentials": {
  "httpHeaderAuth": {
    "id": "abc123",  // This ID may not exist in target instance
    "name": "Header Auth account"
  }
}
```

**Solution**: Open each node and reselect the credential by name

#### Step 3: Check User Permissions
```sql
-- If using PostgreSQL, check credential ownership
SELECT name, "userId" FROM credentials_entity;
```

**Solution**: Share credential with appropriate users or transfer ownership

#### Step 4: Verify Encryption Key
```bash
# Check if N8N_ENCRYPTION_KEY is set
docker exec n8n printenv N8N_ENCRYPTION_KEY

# If empty, set it in docker-compose.yml
```

### Checking Credential Permissions and Scopes

#### For HTTP Request Node (Header Auth)
1. Open the credential: Settings → Credentials → "Header Auth account"
2. Verify header configuration:
   - Header Name: `Authorization` (or as required by API)
   - Value: `Bearer YOUR_TOKEN`
3. Test the credential by making a simple API call

#### For OAuth Credentials
1. Check granted scopes in the OAuth provider console
2. Verify redirect URL matches n8n instance
3. Check token expiration and refresh settings

#### For API Keys
1. Verify API key is active in the service console
2. Check IP whitelisting (if enabled)
3. Verify rate limit hasn't been exceeded
4. Confirm API key has required permissions/scopes

### Troubleshooting Flowchart

```
Start
  │
  ▼
┌─────────────────────────┐
│ Is credential visible   │
│ in Settings → Cred?     │
└─────────────────────────┘
     │            │
    No           Yes
     │            │
     ▼            ▼
┌──────────┐  ┌─────────────────────────┐
│Check     │  │ Can you open the        │
│database  │  │ credential without      │
│connection│  │ errors?                 │
└──────────┘  └─────────────────────────┘
                   │            │
                  No           Yes
                   │            │
                   ▼            ▼
            ┌──────────┐  ┌─────────────────────────┐
            │Encryption│  │ Reconnect credential    │
            │key issue │  │ to workflow nodes       │
            │          │  │ (Section 1)             │
            └──────────┘  └─────────────────────────┘
```

---

## 5. Twenty CRM Specific

### API Key vs JWT Token: Which for Server-to-Server?

| Factor | API Key | JWT Token |
|--------|---------|-----------|
| **Recommended for** | Server-to-server | User session simulation |
| **Longevity** | Long-lived (configurable expiration) | Short-lived (hours/days) |
| **Revocation** | Immediate via dashboard | Must wait for expiration or blacklist |
| **Scope/Permissions** | Role-based assignment | User permissions |
| **Rotation** | Manual regeneration | Requires re-authentication |
| **Complexity** | Simple | More complex |

**Recommendation for n8n Workflows: Use API Keys**

Reasons:
1. **Designed for server-to-server**: Twenty CRM API keys are created specifically for integrations
2. **No expiration surprises**: You control when they expire
3. **Role assignment**: Can assign specific roles with limited permissions
4. **Easier rotation**: Single key to rotate, no refresh logic needed

### Creating a Twenty CRM API Key

1. Navigate to **Settings → APIs & Webhooks** in Twenty CRM
2. Click **+ Create key**
3. Configure:
   - **Name**: "n8n Integration" (descriptive)
   - **Expiration Date**: Set based on your rotation policy (or no expiration)
4. Click **Save**
5. **Copy immediately** - key is shown only once
6. **Assign Role**:
   - Go to Settings → Roles
   - Select role (e.g., "API Access")
   - Under API Keys, assign the new key

### Token Expiration Handling

#### For API Keys
```javascript
// No expiration handling needed - API keys are long-lived
// Just ensure rotation before expiration date
```

#### For JWT Tokens (if using instead of API keys)
```javascript
// Check if JWT is expired before making request
const token = $credentials.twentyCrmJwt;
const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
const isExpired = payload.exp * 1000 < Date.now();

if (isExpired) {
  // Implement token refresh or error handling
  throw new Error('JWT token expired');
}
```

### Rate Limiting with Shared Credentials

#### Twenty CRM Rate Limits
Twenty CRM may apply rate limits per API key. When multiple workflows share credentials:

| Risk | Impact | Mitigation |
|------|--------|------------|
| Shared quota exhaustion | All workflows fail | Use separate API keys per workflow |
| Concurrent request limits | 429 errors | Implement retry with backoff |
| No visibility per workflow | Can't identify heavy usage | Use descriptive API key names |

#### Best Practices
1. **Create separate API keys for different workflows**:
   - "n8n - Contact Sync"
   - "n8n - Lead Import"
   - "n8n - Reporting"

2. **Implement retry logic in HTTP Request nodes**:
   - Go to Options → Add Option → Retry on Fail
   - Set: 3 retries, 1000ms wait

3. **Add error handling**:
   ```javascript
   // After HTTP Request node, check for rate limiting
   if ($input.first().json.statusCode === 429) {
     // Implement wait and retry
     return [{ json: { retry: true, wait: 60 }}];
   }
   ```

### Twenty CRM Credential Setup in n8n

#### Step 1: Create Header Auth Credential
1. Settings → Credentials → Add Credential
2. Select **Header Auth**
3. Configure:
   - **Name**: "Twenty CRM - Production"
   - **Header Name**: `Authorization`
   - **Value**: `Bearer YOUR_API_KEY`

#### Step 2: Use in HTTP Request Node
1. Add HTTP Request node
2. Set URL: `https://api.twenty.com/rest/companies`
3. Authentication: Generic Credential Type → Header Auth
4. Select: "Twenty CRM - Production"

#### Step 3: Test
1. Execute node
2. Verify HTTP 200 response
3. Check returned data structure matches expectations

---

## Quick Reference Commands

### Docker - Check Encryption Key
```bash
docker exec n8n printenv N8N_ENCRYPTION_KEY
docker exec n8n cat /home/node/.n8n/config
```

### Docker - Set Encryption Key
```bash
# Edit docker-compose.yml
environment:
  - N8N_ENCRYPTION_KEY=your-32-char-key-here

# Restart
docker-compose restart n8n
```

### Database - List Credentials
```sql
-- PostgreSQL
SELECT id, name, type FROM credentials_entity;

-- Check credential ownership
SELECT c.name, u.email 
FROM credentials_entity c
JOIN user u ON c."userId" = u.id;
```

### Generate Strong Encryption Key
```bash
# 32 character base64
openssl rand -base64 32

# Or 32 character hex
openssl rand -hex 32
```

---

## Summary Action Items

### Immediate Actions
1. [ ] Verify `N8N_ENCRYPTION_KEY` is set
2. [ ] Reconnect credentials to imported workflow nodes
3. [ ] Test each HTTP Request node individually
4. [ ] Verify Twenty CRM API key has appropriate role

### Security Hardening
1. [ ] Enable HTTPS with valid certificate
2. [ ] Move to PostgreSQL database
3. [ ] Set up automated backups
4. [ ] Document credential rotation schedule
5. [ ] Review and minimize credential permissions

### Monitoring Setup
1. [ ] Enable execution logging
2. [ ] Set up alerts for credential errors
3. [ ] Monitor API rate limits
4. [ ] Schedule quarterly credential audit

---

## Additional Resources

- [n8n Credentials Documentation](https://docs.n8n.io/credentials/)
- [HTTP Request Node Documentation](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.httprequest/)
- [Twenty CRM API Documentation](https://docs.twenty.com/developers/extend/api)
- [n8n Security Best Practices](https://docs.n8n.io/hosting/securing/)

---

*Document Version: 1.0*
*Last Updated: 2026-03-19*
