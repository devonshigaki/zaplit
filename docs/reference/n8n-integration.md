# n8n Integration Reference

Complete reference for n8n workflow automation integrating forms with Twenty CRM.

## Table of Contents

- [Workflow Architecture](#workflow-architecture)
- [Webhook Configuration](#webhook-configuration)
- [Node Configuration](#node-configuration)
- [Authentication](#authentication)
- [Best Practices](#best-practices)
- [Environment Variables](#environment-variables)

---

## Workflow Architecture

### Recommended Workflow Structure

```
[Webhook Trigger] 
    ↓
[Validation/Transform] (Code Node)
    ↓
[Parallel Processing Branches]
    ↓
[Merge Results] (if needed)
    ↓
[Response Node] / [Error Handler]
```

### Current Implementation

```
Consultation Webhook
        ↓
Validate and Process (Code: validation + parsing)
        ↓
Validation Check (IF: valid?)
   ┌────┴────┐
   ↓         ↓
Invalid    Valid → Create Person (HTTP POST /people)
   ↓              Create Company (HTTP POST /companies)
Error              ↓ (parallel)
Response       Merge Results
                    ↓
               Extract IDs (Code: get personId, companyId)
                    ↓
               Link Person to Company (HTTP PATCH)
                    ↓
               Create Note (HTTP POST /notes)
                    ↓
               Success Response
```

### Response Mode Comparison

| Mode | Use Case | Pros | Cons |
|------|----------|------|------|
| `Immediately` | Fire-and-forget, quick ACK | Fastest response | No processing confirmation |
| `When Last Node Finishes` | Simple workflows | Automatic response | Limited control |
| `Response Node` (Recommended) | Production APIs | Full control over response | Requires explicit node |

---

## Webhook Configuration

### Webhook Node Settings

| Setting | Value | Notes |
|---------|-------|-------|
| HTTP Method | POST | For form submissions |
| Path | `consultation` | Descriptive, not UUID |
| Response Mode | `Using Respond to Webhook Node` | Full control |
| Authentication | None (manual validation) | Use IF node for secret check |

### Webhook URLs

| Form | Production URL | Test URL |
|------|----------------|----------|
| Consultation | `https://n8n.zaplit.com/webhook/consultation` | Only active in "Listen" mode |
| Contact | `https://n8n.zaplit.com/webhook/contact` | Only active in "Listen" mode |
| Newsletter | `https://n8n.zaplit.com/webhook/newsletter` | Only active in "Listen" mode |

**⚠️ Never use Test URL in production integrations**

### Webhook Secret Validation

Add IF node after webhook:
```javascript
// Condition
$headers["x-webhook-secret"] = $env.N8N_WEBHOOK_SECRET

// True → Continue processing
// False → Return Error Response (401)
```

---

## Node Configuration

### HTTP Request Node (Create Person)

| Parameter | Value |
|-----------|-------|
| Method | POST |
| URL | `https://crm.zaplit.com/rest/people` |
| Authentication | Generic Credential Type |
| Generic Auth Type | Header Auth |
| Send Body | Yes |
| Content Type | JSON |

**JSON Body:**
```json
{
  "name": {
    "firstName": "={{ $json.body.data.name.split(' ')[0] }}",
    "lastName": "={{ $json.body.data.name.split(' ').slice(1).join(' ') || '' }}"
  },
  "emails": {
    "primaryEmail": "={{ $json.body.data.email }}"
  },
  "jobTitle": "={{ $json.body.data.role }}"
}
```

### HTTP Request Node (Create Company)

| Parameter | Value |
|-----------|-------|
| Method | POST |
| URL | `https://crm.zaplit.com/rest/companies` |
| Authentication | Generic Credential Type |
| Generic Auth Type | Header Auth |
| Send Body | Yes |
| Content Type | JSON |

**JSON Body:**
```json
{
  "name": "={{ $json.body.data.company }}"
}
```

### HTTP Request Node (Link Person to Company)

| Parameter | Value |
|-----------|-------|
| Method | PATCH |
| URL | `={{ 'https://crm.zaplit.com/rest/people/' + $items('Create Person')[0].json.data.id }}` |
| Authentication | Generic Credential Type |
| Generic Auth Type | Header Auth |

**JSON Body:**
```json
{
  "companyId": "={{ $items('Create Company')[0].json.data.id }}"
}
```

### HTTP Request Node (Create Note)

| Parameter | Value |
|-----------|-------|
| Method | POST |
| URL | `https://crm.zaplit.com/rest/notes` |
| Authentication | Generic Credential Type |
| Generic Auth Type | Header Auth |

**JSON Body:**
```json
{
  "title": "={{ 'Consultation Request - ' + $json.body.data.name }}",
  "body": "={{ $json.noteBody }}",
  "personId": "={{ $items('Create Person')[0].json.data.id }}",
  "companyId": "={{ $items('Create Company')[0].json.data.id }}"
}
```

### Set Node (Build Note Content)

**Assignment:**
- Name: `noteBody`
- Type: String
- Value: Formatted note with all form data

### Response Node

**Success Response:**
```json
{
  "respondWith": "json",
  "responseBody": "{\"success\": true, \"message\": \"Form submitted successfully\"}"
}
```

**Error Response:**
```json
{
  "respondWith": "json",
  "responseBody": "{\"success\": false, \"error\": \"Validation failed\"}",
  "options": {
    "statusCode": 400
  }
}
```

---

## Authentication

### Credential Configuration

1. Go to **Settings → Credentials**
2. Click **Add Credential**
3. Select **HTTP Header Auth**
4. Configure:

| Field | Value |
|-------|-------|
| Name | `Twenty CRM API Key` |
| Header Name | `Authorization` |
| Header Value | `Bearer YOUR_TWENTY_API_KEY` |

### Important Security Rules

- ✅ **Never hardcode credentials** in workflow JSON
- ✅ **Use environment variables** for base URLs
- ✅ **Implement credential rotation** strategy
- ✅ **Use named credentials** for clarity
- ❌ **Never** commit credentials to version control

---

## Best Practices

### JSON Body Construction

**Always wrap string expressions in quotes:**
```json
// ✅ Correct
{"name": "{{ $json.firstName }}"}

// ❌ Incorrect (produces invalid JSON)
{"name": {{ $json.firstName }}}
```

**Use `JSON.stringify()` for complex dynamic objects:**
```javascript
"body": "={{ JSON.stringify({
  title: `Consultation - ${$json.company.name}`,
  body: $json.note.message
}) }}"
```

### Data Flow Between Nodes

| Reference Type | Syntax | Use Case |
|----------------|--------|----------|
| Relative | `$json` | Current node input |
| Absolute | `$node["NodeName"].json` | Access specific node output |
| Items | `$items('NodeName')[0].json` | Get first item from node |

### Error Handling Strategies

| Strategy | When to Use | Implementation |
|----------|-------------|----------------|
| Continue On Fail | Non-critical operations | Node setting toggle |
| Error Trigger Workflow | Centralized error handling | Separate workflow |
| IF Node Error Branching | Granular per-node control | Wire error output to IF |
| Try-Catch in Code Node | Complex custom logic | JavaScript try/catch |

### Node Settings Best Practices

| Node | Setting | Value | Rationale |
|------|---------|-------|-----------|
| Webhook | responseMode | responseNode | Full response control |
| HTTP Request | timeout | 30000 | 30s CRM timeout |
| HTTP Request | retryCount | 3 | Handle transient failures |
| HTTP Request | continueOnFail | true (optional) | Allow partial success |
| Code | mode | runOnceForAllItems | Process full dataset |

---

## Environment Variables

### Required Variables

| Variable | Purpose | Example |
|----------|---------|---------|
| `N8N_WEBHOOK_SECRET` | Webhook validation | `sk_live_...` |
| `TWENTY_BASE_URL` | CRM API base URL | `https://crm.zaplit.com` |
| `N8N_ENCRYPTION_KEY` | Credential encryption | 32-char hex string |

### Security Configuration

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
```

---

## Testing Checklist

- [ ] Valid form submission creates Person
- [ ] Valid form submission creates Company
- [ ] Person is linked to Company
- [ ] Note is created with all form data
- [ ] Note is linked to Person and Company
- [ ] Missing email returns validation error
- [ ] Missing name returns validation error
- [ ] Invalid email format returns error
- [ ] Webhook secret validation works
- [ ] Response time < 10 seconds

## Related Documentation

- [twenty-crm-api.md](twenty-crm-api.md) - CRM API reference
- [data-mappings.md](data-mappings.md) - Field mapping specifications
- [troubleshooting.md](troubleshooting.md) - Common issues and fixes
