# 🚨 REGRESSION FIX: Form Data Not Saved to CRM

## Problem

The n8n workflow "Consultation Form to CRM" only has 2 nodes:
- ✅ Webhook (receives data)
- ✅ Success Response (returns 200)

**❌ MISSING: Create Person, Create Company, Create Note nodes**

Result: All form data is received but **NOT SAVED** to Twenty CRM.

---

## Root Cause

The working workflow with CRM nodes was accidentally deleted during consolidation.

---

## Solution Options

### Option A: Note Storage (RECOMMENDED - 5 min fix)

Store all extra fields (teamSize, techStack, securityLevel, compliance) in the Note body. No custom fields needed.

**Pros:**
- Zero setup in Twenty CRM
- All data visible in timeline
- Works immediately

**Cons:**
- Not filterable by custom fields
- Data in text format only

### Option B: Custom Attributes (Full solution - 30 min)

Create custom fields in Twenty CRM:
- Person.securityLevel (Select: standard/high/enterprise)
- Person.techStack (Text)
- Person.compliance (Text)
- Company.teamSize (Select: 1-10/11-50/51-200/200+)

**Pros:**
- Data is structured and filterable
- Professional CRM setup

**Cons:**
- Requires manual setup in Twenty CRM UI
- More complex n8n workflow

---

## Immediate Fix (Option A)

### Step 1: Import New Workflow

1. Open n8n: https://n8n.zaplit.com
2. Go to Workflows
3. Click "Import from File"
4. Select: `n8n-workflow-consultation-to-crm.json`

### Step 2: Configure Credentials

1. In n8n, go to Settings → Credentials
2. Create new "HTTP Header Auth" credential:
   - Name: `twenty-crm-api`
   - Header Name: `Authorization`
   - Header Value: `Bearer YOUR_JWT_TOKEN`

3. Update environment variables in n8n:
   - `TWENTY_BASE_URL`: `https://crm.zaplit.com`

### Step 3: Update Webhook URL

1. In the imported workflow, check the Webhook node
2. Copy the webhook URL (should be: `https://n8n.zaplit.com/webhook/consultation`)
3. Update Cloud Run environment variable:
   ```bash
   gcloud run services update zaplit-com \
     --set-env-vars="N8N_WEBHOOK_CONSULTATION=https://n8n.zaplit.com/webhook/consultation"
   ```

### Step 4: Test

1. Activate the workflow in n8n
2. Submit test form at https://zaplit.com/consultation
3. Check Twenty CRM:
   - New Person created
   - New Company created
   - Note attached with all form data

---

## Field Mapping (Option A - Note Storage)

| Form Field | Twenty CRM Location |
|------------|---------------------|
| name | Person.name |
| email | Person.emails |
| company | Company.name |
| role | Person.jobTitle |
| teamSize | Note.body (text) |
| techStack | Note.body (text) |
| securityLevel | Note.body (text) |
| compliance | Note.body (text) |
| message | Note.body (text) |

**Note Body Format:**
```
[User's message text]

---

Additional Information:

- Name: John Smith
- Role: CTO
- Email: john@testcorp.com
- Company: TestCorp Inc
- Team Size: 200+
- Tech Stack: CRM: Salesforce, Communication: Slack, Finance: Stripe
- Security Level: high
- Compliance: soc2, gdpr

Submitted: 2026-03-19T20:05:22.802Z
```

---

## Full Fix (Option B - Custom Attributes)

### Step 1: Create Custom Fields in Twenty CRM

```bash
# Run these commands or use the UI at https://crm.zaplit.com/settings/data-model

# 1. Person.securityLevel
curl -X POST "https://crm.zaplit.com/rest/metadata/fields" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "object": "person",
    "name": "securityLevel",
    "type": "SELECT",
    "label": "Security Level",
    "options": [
      {"value": "standard", "label": "Standard"},
      {"value": "high", "label": "High"},
      {"value": "enterprise", "label": "Enterprise"}
    ]
  }'

# 2. Person.techStack
curl -X POST "https://crm.zaplit.com/rest/metadata/fields" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "object": "person",
    "name": "techStack",
    "type": "TEXT",
    "label": "Tech Stack"
  }'

# 3. Person.compliance
curl -X POST "https://crm.zaplit.com/rest/metadata/fields" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "object": "person",
    "name": "compliance",
    "type": "TEXT",
    "label": "Compliance Requirements"
  }'

# 4. Company.teamSize
curl -X POST "https://crm.zaplit.com/rest/metadata/fields" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "object": "company",
    "name": "teamSize",
    "type": "SELECT",
    "label": "Team Size",
    "options": [
      {"value": "1-10", "label": "1-10 employees"},
      {"value": "11-50", "label": "11-50 employees"},
      {"value": "51-200", "label": "51-200 employees"},
      {"value": "200+", "label": "200+ employees"}
    ]
  }'
```

### Step 2: Import Modified Workflow

Use the custom-fields version of the workflow (create separate JSON if needed).

---

## Verification Checklist

- [ ] Workflow imported into n8n
- [ ] HTTP Header Auth credential created
- [ ] Webhook URL matches Cloud Run env var
- [ ] Test form submission creates Person in CRM
- [ ] Test form submission creates Company in CRM
- [ ] Test form submission creates Note with all data

---

## Files Created

1. `n8n-workflow-consultation-to-crm.json` - Working workflow with CRM integration
2. `docs/ops/TWENTY_CRM_CUSTOM_FIELDS.md` - Custom fields setup guide
3. `REGRESSION_FIX.md` - This file

---

## Testing

```bash
# Test webhook directly
curl -X POST https://n8n.zaplit.com/webhook/consultation \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "name": "Test User",
      "email": "test@example.com",
      "company": "TestCorp",
      "role": "CTO",
      "teamSize": "11-50",
      "techStack": ["React", "Node.js"],
      "securityLevel": "high",
      "compliance": ["soc2"],
      "message": "Test message"
    },
    "metadata": {
      "submittedAt": "2026-03-19T20:00:00Z"
    }
  }'
```

Check Twenty CRM for:
1. New Person: "Test User"
2. New Company: "TestCorp"
3. New Note attached to both
