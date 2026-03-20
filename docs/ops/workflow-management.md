---
title: n8n Workflow Management Guide
topics:
  - WORKFLOW_SETUP_INSTRUCTIONS.md
  - N8N_WORKFLOW_CLEANUP_PLAN.md
  - N8N_CLEANUP_QUICK_REFERENCE.md
  - EXECUTION_DATA_QUALITY_FIXES.md
  - FINAL_EXECUTION_REPORT.md
---

# n8n Workflow Management Guide

## Quick Reference

### Workflow Architecture
```
Consultation Webhook1
        ↓
Validate and Process (Code) → Validation Error
        ↓
Validation Check (IF)
   ┌────┴────┐
   ↓         ↓
Create    Create
Person    Company
   └────┬────┘
    Merge Results
        ↓
   Extract IDs (Code)
        ↓
 Link Person to Company
        ↓
    Create Note
        ↓
  Success Response1
```

### Cleanup Commands
```bash
# Delete old nodes in this order:
# 1. Success Response (old)
# 2. HTTP Request1 (old Create Company)
# 3. HTTP Request (old Create Person)
# 4. Consultation Webhook (old)

# Keep these nodes:
# ⭐ Consultation Webhook1, Validate and Process, Validation Check
# ⭐ Create Person, Create Company, Merge Results
# ⭐ Extract IDs, Link Person to Company, Create Note
# ⭐ Success Response1, Validation Error
```

### Test Commands
```bash
# Valid submission test
curl -X POST https://n8n.zaplit.com/webhook/consultation \
  -H "Content-Type: application/json" \
  -d '{"data":{"name":"Test","email":"test@test.com","company":"TestCo","role":"Dev","teamSize":"1-10","techStack":["n8n"],"securityLevel":"high","compliance":["soc2"],"message":"Test"}}'

# Invalid submission test (should return 400)
curl -X POST https://n8n.zaplit.com/webhook/consultation \
  -H "Content-Type: application/json" \
  -d '{"data":{"name":"","email":""}}'
```

---

## Detailed Procedures

### 1. Workflow Import and Setup

#### Import Complete Workflow
1. Go to n8n: https://n8n.zaplit.com
2. Navigate to **Workflows** → **Import from File**
3. Upload: `n8n-workflow-consultation-to-crm-complete.json`
4. **Important**: Reconnect credentials for HTTP Request nodes

#### HTTP Request Node Configuration

**Create Person:**
```json
{
  "method": "POST",
  "url": "https://crm.zaplit.com/rest/people",
  "body": {
    "name": {
      "firstName": "{{ $json.person.firstName }}",
      "lastName": "{{ $json.person.lastName }}"
    },
    "emails": [{
      "email": "{{ $json.person.email }}",
      "isPrimary": true
    }],
    "jobTitle": "{{ $json.person.jobTitle }}"
  }
}
```

**Create Company:**
```json
{
  "method": "POST",
  "url": "https://crm.zaplit.com/rest/companies",
  "body": {
    "name": "{{ $json.company.name }}"
  }
}
```

**Create Note:**
```json
{
  "method": "POST",
  "url": "https://crm.zaplit.com/rest/notes",
  "body": {
    "title": "Consultation Request",
    "body": "Message: {{ $json.note.message }}\n\nTechnical Details:\n- Team Size: {{ $json.note.teamSize }}\n- Tech Stack: {{ $json.note.techStack }}\n- Security Level: {{ $json.note.securityLevel }}\n- Compliance: {{ $json.note.compliance }}"
  }
}
```

### 2. Workflow Cleanup Procedure

#### Pre-Cleanup Safety Measures
1. **Export Backup**: Workflow menu → Download
2. **Screenshot**: Current state for reference
3. **Identify Nodes**: Review which to delete vs keep

#### Nodes to DELETE (In Order)

| Order | Node | How to Identify |
|-------|------|-----------------|
| 1️⃣ | `Success Response` (old) | NOT "Success Response1" - top area |
| 2️⃣ | `HTTP Request1` | Old Create Company - top-left |
| 3️⃣ | `HTTP Request` | Old Create Person - top-left |
| 4️⃣ | `Consultation Webhook` (old) | NOT "Consultation Webhook1" - top-left |

#### Visual Indicators of Dead Nodes
- ❌ No connection lines leading to/from the node
- ❌ Node appears faded or grayed out
- ❌ Node has no output connections to main flow
- ❌ Node positioned far from active workflow

#### Connection Verification

| From Node | To Node | Connection Type |
|-----------|---------|-----------------|
| Consultation Webhook1 | Validate and Process | Main ✓ |
| Validate and Process | Validation Check | Main ✓ |
| Validation Check | Create Person | True branch ✓ |
| Validation Check | Create Company | True branch ✓ |
| Validation Check | Validation Error | False branch ✓ |
| Create Person | Merge Results | Input 0 ✓ |
| Create Company | Merge Results | Input 1 ✓ |
| Merge Results | Extract IDs | Main ✓ |
| Extract IDs | Link Person to Company | Main ✓ |
| Link Person to Company | Create Note | Main ✓ |
| Create Note | Success Response1 | Main ✓ |

**CRITICAL:** Create Person → Merge Input 0, Create Company → Merge Input 1

### 3. Data Quality Validation

#### Validation Functions (v3 Enhanced)

| Function | Description | Edge Cases Handled |
|----------|-------------|-------------------|
| `validateEmail(email)` | RFC 5322 compliant validation | null, empty, length limits, TLD |
| `parseFullName(fullName)` | Name parsing with prefix/suffix | prefixes (Dr., Mr., Prof.), suffixes (Jr., PhD, III) |
| `sanitizeInput(input)` | XSS and injection protection | HTML tags, control chars, SQL patterns |
| `validateCompanyName(name)` | Company validation | Length checks, forbidden chars |
| `validatePhone(phone)` | E.164 normalization | null, digit counting |
| `validateFormData(formData)` | Main orchestrator | Comprehensive error aggregation |

#### Email Validation
- RFC 5322/5321 compliant regex
- Local part: max 64 chars
- Domain: max 255 chars

#### Name Parsing
Handles 20+ prefixes and 15+ suffixes:
- Prefixes: Dr., Mr., Mrs., Ms., Prof., etc.
- Suffixes: Jr., Sr., PhD, MD, III, IV, etc.

#### XSS Protection
- HTML tag removal
- Control character removal
- Basic SQL injection pattern filtering

### 4. Duplicate Detection

#### Functions

| Function | Description |
|----------|-------------|
| `checkDuplicatePerson(email)` | Search CRM by email |
| `checkDuplicateCompany(name)` | Search by name with fuzzy matching |
| `fuzzyMatchCompany(name1, name2)` | Levenshtein distance algorithm |
| `detectDuplicates(formData)` | Main orchestrator |

#### Fuzzy Matching Algorithm
```
Combined Score = max(
  (normalized_sim × 0.5) + (original_sim × 0.3) + (substring_score × 0.2),
  substring_score × 0.9
)
```

#### Confidence Levels
| Level | Threshold | Action |
|-------|-----------|--------|
| Exact | 100% | Use existing record |
| Very High | ≥95% | Suggest merge |
| High | ≥90% | Flag for review |
| Medium | ≥85% | Low priority review |
| Low | <85% | Create new record |

### 5. Post-Cleanup Verification

#### Credential Reconnection
For each HTTP Request node (Create Person, Create Company, Link Person to Company, Create Note):
1. Click node → Authentication section
2. Select "Generic Credential Type"
3. Choose "Header Auth"
4. Select "Header Auth account" credential

#### Webhook Configuration Check
1. Click **Consultation Webhook1**
2. Verify settings:
   - **HTTP Method:** POST
   - **Path:** `consultation`
   - **Response Mode:** `Using Respond to Webhook node`

#### Test Execution

**Test 1: Valid Submission**
```bash
curl -X POST https://n8n.zaplit.com/webhook/consultation \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "name": "Test Cleanup",
      "email": "cleanup@test.com",
      "company": "Cleanup Test Co",
      "role": "Tester",
      "teamSize": "1-10",
      "techStack": ["n8n"],
      "securityLevel": "high",
      "compliance": ["soc2"],
      "message": "Testing after workflow cleanup"
    }
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Thank you for your submission! We'll be in touch soon."
}
```

**Test 2: Invalid Submission**
```bash
curl -X POST https://n8n.zaplit.com/webhook/consultation \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "name": "",
      "email": "invalid-email"
    }
  }'
```

**Expected Response:**
```json
{
  "success": false,
  "message": "Validation failed",
  "errors": ["Email is required", "Invalid email format"]
}
```

### 6. Troubleshooting

#### Issue: Deleted Wrong Node
**Recovery:**
1. **DON'T SAVE** the broken workflow
2. Refresh the page (F5)
3. Changes will be discarded
4. Start cleanup again

#### Issue: Connections Broken After Deletion
**Fix:**
1. Identify the broken connection
2. Delete the dangling connection line
3. Create new connection by dragging from output to input

#### Issue: Workflow Executes But No CRM Data
**Check:**
1. Credentials expired? Re-authenticate in n8n settings
2. Wrong webhook URL? Check path is `/consultation`
3. Check execution logs in n8n for error details

#### Issue: Merge Node Receives Wrong Data
**Fix:**
- Check Create Person connects to Merge "Input 0"
- Check Create Company connects to Merge "Input 1"
- The order matters for position-based merging

---

## File References

| File | Purpose |
|------|---------|
| `n8n-workflow-v3-enhanced.json` | Enhanced workflow with validation + duplicates |
| `n8n-workflow-consultation-to-crm-complete.json` | Complete workflow for import |
| `scripts/data-quality/validators.js` | Validation functions |
| `scripts/data-quality/duplicate-detection.js` | Duplicate detection functions |

---

## Related Documents

- **Workflow Setup:** [WORKFLOW_SETUP_INSTRUCTIONS.md](../../WORKFLOW_SETUP_INSTRUCTIONS.md)
- **Cleanup Plan:** [N8N_WORKFLOW_CLEANUP_PLAN.md](../../N8N_WORKFLOW_CLEANUP_PLAN.md)
- **Quick Reference:** [N8N_CLEANUP_QUICK_REFERENCE.md](../../N8N_CLEANUP_QUICK_REFERENCE.md)
- **Data Quality:** [EXECUTION_DATA_QUALITY_FIXES.md](../../EXECUTION_DATA_QUALITY_FIXES.md)
- **Execution Report:** [FINAL_EXECUTION_REPORT.md](../../FINAL_EXECUTION_REPORT.md)
- **Credential Rotation Runbook:** [runbooks/RB001-credential-rotation.md](runbooks/RB001-credential-rotation.md)
