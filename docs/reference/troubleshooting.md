# Troubleshooting Reference

Common issues, error scenarios, and resolution steps for the n8n-Twenty CRM integration.

## Table of Contents

- [Quick Diagnostics](#quick-diagnostics)
- [Common Issues](#common-issues)
- [Error Handling Matrix](#error-handling-matrix)
- [Testing Procedures](#testing-procedures)
- [Regression Fixes](#regression-fixes)

---

## Quick Diagnostics

### Health Check Commands

```bash
# Test webhook connectivity
curl -X POST https://n8n.zaplit.com/webhook/consultation \
  -H "Content-Type: application/json" \
  -d '{"data":{"name":"Test User","email":"test@example.com","company":"TestCorp","role":"CTO","teamSize":"11-50"}}'

# Check CRM API health
curl -X GET https://crm.zaplit.com/rest/people \
  -H "Authorization: Bearer ${TWENTY_API_KEY}"

# Run integration test
./scripts/tests/run-integration-test.sh

# Verify CRM records
./scripts/tests/verify-crm-records.sh TEST_<timestamp>
```

### Log Locations

| System | Log Location | Access |
|--------|--------------|--------|
| n8n | Execution logs in UI | Admin → Executions |
| n8n | `/var/log/n8n/n8n.log` | Server access |
| Twenty CRM | Application logs | Server admin |
| Cloud Run | Cloud Logging | GCP Console |

---

## Common Issues

### Issue: Form Data Not Saved to CRM

**Symptoms:**
- Webhook receives 200 OK
- No records appear in Twenty CRM
- n8n execution shows only 2 nodes (Webhook → Response)

**Root Cause:**
CRM integration nodes are missing from workflow.

**Resolution:**
1. Import fixed workflow: `n8n-workflow-consultation-to-crm.json`
2. Configure Twenty CRM credential
3. Update webhook URL in Cloud Run
4. Test and activate

See [REGRESSION_FIX.md](../../REGRESSION_FIX.md) for detailed steps.

---

### Issue: Person Creation Fails

**Symptoms:**
- Error in "Create Person" node
- Response: 400 Bad Request

**Common Causes:**

| Error | Cause | Fix |
|-------|-------|-----|
| `"name.firstName should not be empty"` | Name field missing | Add validation before API call |
| `"Email already exists"` | Duplicate email | Update existing person instead |
| `"Invalid email format"` | Malformed email | Add email regex validation |
| `401 Unauthorized` | API key expired | Generate new API key in Twenty CRM |
| `429 Too Many Requests` | Rate limit hit | Implement retry with backoff |

**n8n Fix:**
```javascript
// Add continueOnFail to HTTP node
{
  "name": "Create Person",
  "type": "n8n-nodes-base.httpRequest",
  "continueOnFail": true
}

// Check for errors in next node
const hadError = $input.first().error !== undefined;
if (hadError) {
  return [{ json: { error: $input.first().error.message } }];
}
```

---

### Issue: Company Already Exists

**Symptoms:**
- Error: `duplicate key value violates unique constraint`
- Company creation fails

**Resolution:**

```javascript
// Strategy: Search first, create only if not found
async function findOrCreateCompany(companyName) {
  const search = await api.get(`/companies?filter=name eq '${companyName}'`);
  
  if (search.data && search.data.length > 0) {
    return { id: search.data[0].id, action: 'existing' };
  }
  
  const response = await api.post('/companies', { name: companyName });
  return { id: response.data.id, action: 'created' };
}
```

---

### Issue: Person Not Linked to Company

**Symptoms:**
- Person created
- Company created
- No company shown on person record

**Common Causes:**
1. Missing `companyId` in PATCH request
2. Invalid company UUID format
3. Company creation failed before linking

**Verification:**
```javascript
// Check if companyId exists before linking
const companyId = $items('Create Company')[0]?.json?.data?.id;
if (!companyId) {
  return [{ json: { error: 'Company ID not available' } }];
}
```

---

### Issue: Note Not Appearing

**Symptoms:**
- Person and Company created
- No note visible in timeline

**Common Causes:**
1. Invalid personId or companyId UUIDs
2. Note creation API error
3. Missing required `body` field

**Checklist:**
- [ ] Verify personId is valid UUID format
- [ ] Verify companyId is valid UUID format
- [ ] Check note body is not empty
- [ ] Check Twenty CRM API response for errors

---

### Issue: Webhook Timeout

**Symptoms:**
- Form submission times out (>30 seconds)
- Browser shows timeout error

**Common Causes:**
1. CRM operations taking too long
2. n8n webhook timeout (~60-64 seconds)
3. Cloud Run timeout (default 300s)

**Resolution:**

Use async processing pattern:
```
[Webhook] 
    ↓
[Validation] 
    ↓
[Respond Immediately with Acknowledgment]
    ↓
[Continue Processing in Background]
    ↓
[CRM Operations]
```

**Response Node Configuration:**
```json
{
  "respondWith": "json",
  "responseBody": "{\n  \"success\": true,\n  \"message\": \"Thank you! We'll be in touch soon!\"\n}",
  "options": {
    "statusCode": 200
  }
}
```

---

### Issue: Invalid Webhook Secret

**Symptoms:**
- 401 Unauthorized response
- Error: "Invalid webhook secret"

**Resolution:**
1. Verify `N8N_WEBHOOK_SECRET` environment variable is set
2. Check form is sending correct header: `X-Webhook-Secret`
3. Ensure values match exactly

---

### Issue: Duplicate Records

**Symptoms:**
- Multiple people with same email
- Multiple companies with same name

**Prevention:**

```javascript
// Check before creating
async function createOrUpdatePerson(personData) {
  try {
    return await api.post('/people', personData);
  } catch (error) {
    if (error.status === 409 || error.message.includes('already exists')) {
      const existing = await api.get(`/people?filter=email eq '${personData.email}'`);
      const personId = existing.data[0].id;
      await api.patch(`/people/${personId}`, { jobTitle: personData.jobTitle });
      return { id: personId, action: 'updated' };
    }
    throw error;
  }
}
```

---

## Error Handling Matrix

### CRM API Error Responses

| Step | Error Type | Response Code | Action |
|------|-----------|---------------|--------|
| Create Person | Duplicate email | 409 | Update existing, continue |
| Create Person | Invalid email | 400 | Log error, return 400 |
| Create Person | Rate limit | 429 | Retry with backoff |
| Create Company | Duplicate domain | 409 | Use existing, continue |
| Create Company | Invalid name | 400 | Log error, skip company |
| Link Person | Invalid IDs | 404 | Log error, entities unlinked |
| Create Note | Invalid relations | 400 | Create note without relations |

### HTTP Status Code Actions

| Status | Error Type | Action |
|--------|------------|--------|
| 429 Too Many Requests | Rate limit | Exponential backoff retry |
| 500-504 Server Error | Transient | Wait and retry (max 3) |
| 401 Unauthorized | Auth failure | Alert admin immediately |
| 404 Not Found | Resource missing | Log and alert human |
| 400 Bad Request | Data validation | Log problematic data |

---

## Testing Procedures

### Integration Test

```bash
# Run full integration test
./scripts/tests/run-integration-test.sh

# Expected output:
# ✓ Webhook accepts valid payload
# ✓ Person created in CRM
# ✓ Company created in CRM
# ✓ Person linked to Company
# ✓ Note created with all data
```

### Manual Test Payload

```bash
curl -X POST https://n8n.zaplit.com/webhook/consultation \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: $N8N_WEBHOOK_SECRET" \
  -d '{
    "data": {
      "name": "Test User",
      "email": "test@example.com",
      "company": "TestCorp",
      "role": "CTO",
      "teamSize": "11-50",
      "techStack": ["CRM: Salesforce", "Communication: Slack"],
      "securityLevel": "high",
      "compliance": ["soc2", "gdpr"],
      "message": "Testing the integration"
    }
  }'
```

### Verification Checklist

- [ ] Webhook receives form data from zaplit-com
- [ ] Person created in Twenty CRM with correct name/email
- [ ] Company created in Twenty CRM with correct name
- [ ] Person linked to Company (visible in person detail)
- [ ] Note created with all form fields formatted
- [ ] Note attached to both Person and Company
- [ ] Success response returned to zaplit-com within 10 seconds
- [ ] Error responses include meaningful messages
- [ ] Duplicate email handling works correctly
- [ ] Rate limiting (100 req/min) not exceeded

---

## Regression Fixes

### Fix: Form Data Not Saved to CRM

**Date:** 2026-03-19
**Issue:** Workflow only had Webhook and Response nodes
**Solution:** Import new workflow with CRM integration nodes

**Files:**
- `n8n-workflow-consultation-to-crm.json` - Working workflow
- `REGRESSION_FIX.md` - Detailed fix instructions

**Steps:**
1. Import workflow from file
2. Configure HTTP Header Auth credential
3. Update webhook URL in Cloud Run
4. Test and activate

### Fix: JWT Token Expiration

**Date:** 2026-03-19
**Issue:** JWT tokens expired causing 401 errors
**Solution:** Switched to long-lived API keys

**Configuration:**
```bash
# In Twenty CRM: Settings → APIs & Webhooks
# Create API key with no expiration
# Update n8n credential with: Bearer {API_KEY}
```

### Fix: Missing Error Handling

**Date:** 2026-03-19
**Issue:** Workflow stopped on any CRM API failure
**Solution:** Added validation node with error branching

**Changes:**
- Added "Validate and Process" code node
- Added "Validation Check" IF node
- Added error response path
- Set `continueOnFail: true` on HTTP nodes

---

## Data Quality Scorecard

| Metric | Target | Measurement |
|--------|--------|-------------|
| Email validity rate | >99% | Valid format + non-disposable |
| Required field completion | 100% | Form validation enforces |
| Name split accuracy | >95% | Manual spot-checks |
| Duplicate person rate | <5% | Same email submissions |
| Duplicate company rate | <20% | Same company name, different formatting |
| Data sanitization coverage | 100% | All text fields processed |

---

## Related Documentation

- [n8n-integration.md](n8n-integration.md) - Workflow configuration
- [twenty-crm-api.md](twenty-crm-api.md) - API reference
- [data-mappings.md](data-mappings.md) - Field mappings
- [../../REGRESSION_FIX.md](../../REGRESSION_FIX.md) - Original fix documentation
