# n8n Workflow Cleanup Plan: Consultation Form to CRM

**Date:** 2026-03-19  
**Status:** Analysis Complete - Ready for Cleanup  
**Estimated Time:** 15-20 minutes  
**Risk Level:** Medium (requires careful node identification)

---

## Executive Summary

The "Consultation Form to CRM" workflow has duplicate nodes from the import process. This plan provides a safe, step-by-step procedure to clean up the workflow while preserving all functionality.

### Current State Analysis

**Target Workflow Architecture (v2 - NEW):**
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

**Nodes to DELETE (Old/Duplicate):**
| # | Node Name | Reason | Position Clue |
|---|-----------|--------|---------------|
| 1 | `Consultation Webhook` (old) | Duplicated by `Consultation Webhook1` | Top-left, disconnected |
| 2 | `Success Response` (old) | Duplicated by `Success Response1` | Top area, disconnected |
| 3 | `HTTP Request` | Old Create Person | Top-left area |
| 4 | `HTTP Request1` | Old Create Company | Near old webhook |

**Nodes to KEEP (New/Active):**
| # | Node Name | Purpose |
|---|-----------|---------|
| 1 | `Consultation Webhook1` | New webhook trigger |
| 2 | `Validate and Process` | Validation + data parsing |
| 3 | `Validation Check` | IF node for validation branching |
| 4 | `Create Person` | HTTP POST to /rest/people |
| 5 | `Create Company` | HTTP POST to /rest/companies |
| 6 | `Merge Results` | Combines parallel branches |
| 7 | `Extract IDs` | Code node to parse CRM responses |
| 8 | `Link Person to Company` | HTTP PATCH to link entities |
| 9 | `Create Note` | HTTP POST to /rest/notes |
| 10 | `Success Response1` | Final webhook response |
| 11 | `Validation Error` | Error response for validation failures |

---

## Phase 1: Pre-Cleanup Safety Measures

### Step 1.1: Export Workflow Backup (CRITICAL)

**Before ANY changes, create a backup:**

1. In n8n, open the "Consultation Form to CRM" workflow
2. Click **Workflow menu** (☰) → **Download** (or **Export**)
3. Save as: `consultation-form-backup-[timestamp].json`
4. Store in: `/Users/devonshigaki/Downloads/zaplit/workflow-backups/`

**Alternative Backup Method:**
```bash
# Export via n8n API (if API access is configured)
curl -X GET "https://n8n.zaplit.com/api/v1/workflows/[WORKFLOW_ID]" \
  -H "X-N8N-API-KEY: [YOUR_API_KEY]" \
  -o consultation-form-backup-$(date +%Y%m%d-%H%M%S).json
```

### Step 1.2: Document Current State

**Take screenshots:**
1. Full workflow view (zoomed out to see all nodes)
2. Close-up of the NEW connected flow (right side)
3. Close-up of OLD disconnected nodes (left/top side)

**Verify workflow can execute:**
1. Check the NEW workflow path is complete (follow the arrows from Webhook1)
2. Note any error indicators on nodes

### Step 1.3: Identify Dead Nodes

**Visual indicators of dead/unconnected nodes:**
- ❌ No connection lines leading to/from the node
- ❌ Node appears faded or grayed out
- ❌ Node has no output connections to the main flow
- ❌ Node is positioned far from the active workflow

**In the current screenshot:**
- **Top-left area**: Old `Consultation Webhook`, `HTTP Request`, `HTTP Request1`
- **Top area**: Old `Success Response`

---

## Phase 2: Node Cleanup Procedure

### ⚠️ CRITICAL RULE: Delete in This Exact Order

**Order matters!** Deleting nodes in the wrong order can break connections to dependent nodes.

### Step 2.1: Delete Old Success Response

**Why first?** This is a terminal node (no outputs), safest to delete.

1. **Locate**: Find `Success Response` (old one, NOT `Success Response1`)
   - Look at the node ID: `2747FDC4-C12A-4E52-AAB7-22848D30BFF7` = KEEP
   - Old one will have a different ID
2. **Verify**: Check it has NO connections leading OUT
3. **Delete**: Click node → Press `Delete` key (or right-click → Delete)
4. **Confirm**: Node disappears, no error messages

### Step 2.2: Delete Old HTTP Request Nodes

**Delete in order: HTTP Request1 → HTTP Request**

1. **Locate `HTTP Request1`** (old Create Company)
   - Position: Usually top-left area
   - Has NO incoming connections from active flow
2. **Verify**: Check it's NOT connected to `Create Company` in the new flow
3. **Delete**: Click → Delete key
4. **Repeat** for `HTTP Request` (old Create Person)

### Step 2.3: Delete Old Consultation Webhook

**Why last?** This is the trigger node, most likely to have connections.

1. **Locate**: Find `Consultation Webhook` (old one)
   - NOT `Consultation Webhook1`
2. **Verify**: 
   - Check node ID in details panel
   - Confirm it has NO outgoing connections
   - Confirm `Consultation Webhook1` has the connection to `Validate and Process`
3. **Delete**: Click → Delete key

### Step 2.4: Verify Cleanup

**Checklist after deletion:**
- [ ] Only ONE `Consultation Webhook1` remains
- [ ] Only ONE `Success Response1` remains
- [ ] Only ONE `Create Person` HTTP node remains
- [ ] Only ONE `Create Company` HTTP node remains
- [ ] Connection lines are intact on remaining nodes
- [ ] No orphaned connection lines visible

---

## Phase 3: Workflow Optimization

### Analysis: Current Flow Efficiency

**Current Implementation:**
```
Merge Results → Extract IDs → Link Person to Company → Create Note
```

**Optimization Opportunities:**

| Opportunity | Current | Optimized | Impact |
|-------------|---------|-----------|--------|
| Merge + Extract IDs | Two nodes | One Code node | Simpler, fewer steps |
| Validation placement | After webhook | First node | Correct placement ✓ |
| Parallel execution | Person + Company parallel | ✓ Already optimal | Good |

### Recommended: Combine Merge + Extract IDs

**Current (2 nodes):**
```javascript
// Merge Results node - just combines data
// Extract IDs node - parses the responses
const input = $input.first().json;
const personId = input[0]?.data?.id;
const companyId = input[1]?.data?.id;
```

**Optimized (1 node - Replace Merge Results with Extract & Merge):**
```javascript
// Combined node: Merge + Extract IDs + Prepare Note Data
const allInput = $input.all();

// Person response from first branch
const personResponse = allInput[0]?.json;
const personId = personResponse?.data?.id;

// Company response from second branch  
const companyResponse = allInput[1]?.json;
const companyId = companyResponse?.data?.id;

// Get original form data from first item's source
const formData = allInput[0]?.json?.$input?.first()?.json || {};

return [{
  json: {
    personId,
    companyId,
    person: formData.person,
    company: formData.company,
    note: formData.note,
    // Include full responses for debugging
    personResponse,
    companyResponse
  }
}];
```

**Decision:** The current 2-node approach is clearer for debugging. **Recommendation: Keep as-is** unless workflow complexity increases.

### Validation Node Placement Analysis

**Current placement:**
```
Webhook → Validate and Process → Validation Check
```

**Assessment:** ✓ **OPTIMAL**
- Validation happens immediately after receiving data
- Fails fast before any CRM operations
- Proper error response path exists

**No changes needed.**

---

## Phase 4: Connection Verification

### Verification Checklist

**Visual Connection Check:**

| From Node | To Node | Connection Type | Status |
|-----------|---------|-----------------|--------|
| Consultation Webhook1 | Validate and Process | Main ✓ | Required |
| Validate and Process | Validation Check | Main ✓ | Required |
| Validation Check | Create Person | True branch ✓ | Required |
| Validation Check | Create Company | True branch ✓ | Required |
| Validation Check | Validation Error | False branch ✓ | Required |
| Create Person | Merge Results | Input 0 ✓ | Required |
| Create Company | Merge Results | Input 1 ✓ | Required |
| Merge Results | Extract IDs | Main ✓ | Required |
| Extract IDs | Link Person to Company | Main ✓ | Required |
| Link Person to Company | Create Note | Main ✓ | Required |
| Create Note | Success Response1 | Main ✓ | Required |

### How to Verify Connections in n8n

**Method 1: Visual Inspection**
1. Follow the connection lines from Webhook to Response
2. Ensure no lines are "dangling" (connected to nothing)
3. Check that parallel branches both connect to Merge

**Method 2: Node Detail Panel**
1. Click on any node
2. Look at the left panel for "Connections" section
3. Verify:
   - "Parent nodes" shows correct input source
   - "Child nodes" shows correct output destinations

**Method 3: Execution Testing**
1. Save the workflow
2. Click "Execute Workflow" (test run)
3. Check that all nodes execute in expected order

### Common Connection Mistakes to Check

| Mistake | Visual Indicator | Fix |
|---------|------------------|-----|
| Swapped merge inputs | Wrong data in Person/Company | Check Create Person → Input 0, Create Company → Input 1 |
| Missing connection | Gap in workflow line | Drag new connection from output to input |
| Wrong branch connected | Error path goes to success | Check Validation Check outputs |
| Disconnected terminal node | No line to Response node | Connect last processing node to Response |

---

## Phase 5: Post-Cleanup Validation

### Step 5.1: Credential Reconnection

**After cleanup, verify credentials on these nodes:**

1. **Create Person**
   - Click node → Authentication section
   - Verify: "Header Auth account" is selected
   - If red/error: Re-select credential

2. **Create Company**
   - Same check as above

3. **Link Person to Company**
   - Same check as above

4. **Create Note**
   - Same check as above

### Step 5.2: Webhook Configuration Check

1. Click **Consultation Webhook1**
2. Verify settings:
   - **HTTP Method:** POST
   - **Path:** `consultation`
   - **Response Mode:** `Using Respond to Webhook node`

### Step 5.3: Test Execution

**Save before testing!** (Ctrl+S or Cmd+S)

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

**Test 2: Invalid Submission (Validation Check)**
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

### Step 5.4: Verify CRM Data

**In Twenty CRM (crm.zaplit.com):**
1. Check People: New person "Test Cleanup" created
2. Check Companies: New company "Cleanup Test Co" created
3. Check Notes: Note linked to both with full form data
4. Verify Person is linked to Company

---

## Phase 6: Troubleshooting Guide

### Issue: Deleted Wrong Node

**Symptoms:**
- Workflow won't save
- Error: "Node not found" or "Invalid connection"
- Missing nodes in the flow

**Recovery:**
1. **DON'T SAVE** the broken workflow
2. Refresh the page (discard changes)
3. Re-import from backup if needed
4. Start cleanup again, more carefully

### Issue: Connections Broken After Deletion

**Symptoms:**
- Red error lines between nodes
- Execution fails with "Cannot read property"

**Fix:**
1. Identify the broken connection
2. Delete the dangling connection line
3. Create new connection by dragging from output to input

### Issue: Workflow Executes But No CRM Data

**Check:**
1. Credentials expired? Re-authenticate in n8n settings
2. Wrong webhook URL? Check path is `/consultation`
3. Check execution logs in n8n for error details

### Issue: Merge Node Receives Wrong Data

**Symptoms:**
- Person data in Company field
- Missing IDs in Extract IDs node

**Fix:**
- Check Create Person connects to Merge "Input 0"
- Check Create Company connects to Merge "Input 1"
- The order matters for position-based merging

---

## Summary Checklist

### Pre-Cleanup (Safety)
- [ ] Export workflow backup
- [ ] Take screenshots of current state
- [ ] Identify all nodes to delete vs keep

### Cleanup Execution
- [ ] Delete old Success Response
- [ ] Delete old HTTP Request nodes
- [ ] Delete old Consultation Webhook
- [ ] Verify no orphaned connections

### Post-Cleanup Verification
- [ ] Reconnect credentials (if needed)
- [ ] Verify webhook settings
- [ ] Save workflow
- [ ] Test valid submission
- [ ] Test invalid submission
- [ ] Verify CRM records created

### Final Steps
- [ ] Activate workflow (if not already)
- [ ] Monitor first few executions
- [ ] Document any issues

---

## Appendix A: Node Reference Sheet

### Node ID Reference

| Node Name | Expected ID Pattern | Notes |
|-----------|---------------------|-------|
| Consultation Webhook1 | `ED6E0A75-011D-4066-8BC9-2C6569A3C8E0` | KEEP - New webhook |
| Validate and Process | `a1b2c3d4-e5f6-7890-abcd-ef1234567890` | KEEP |
| Validation Check | `b2c3d4e5-f6a7-8901-bcde-f23456789012` | KEEP |
| Create Person | `e38c4ac7-51ca-4951-9559-058240c3c8c6` | KEEP |
| Create Company | `708ba8c3-8715-4afc-97a6-c05bd2957da8` | KEEP |
| Merge Results | `c3d4e5f6-a7b8-9012-cdef-345678901234` | KEEP |
| Extract IDs | `d4e5f6a7-b8c9-0123-defa-456789012345` | KEEP |
| Link Person to Company | `e5f6a7b8-c9d0-1234-efab-567890123456` | KEEP |
| Create Note | `f6a7b8c9-d0e1-2345-fabc-678901234567` | KEEP |
| Success Response1 | `2747FDC4-C12A-4E52-AAB7-22848D30BFF7` | KEEP |
| Validation Error | `a7b8c9d0-e1f2-3456-abcd-789012345678` | KEEP |

### Connection Map (Visual)

```
                    ┌─────────────────────────────────────────────┐
                    │                                             │
[Webhook1]──→[Validate & Process]──→[Validation Check]            │
                                              │                   │
                    ┌─────────────────────────┴──────────┐        │
                    │ True                               │ False  │
                    ↓                                    ↓        │
            [Create Person]                      [Validation Error]
                    │                                             │
                    ├──────────────────────────┐                  │
                    ↓                          ↓                  │
            [Merge Results]←──────────[Create Company]            │
                    │                                             │
                    ↓                                             │
            [Extract IDs]                                         │
                    │                                             │
                    ↓                                             │
            [Link Person to Company]                              │
                    │                                             │
                    ↓                                             │
            [Create Note]                                         │
                    │                                             │
                    ↓                                             │
            [Success Response1]                                   │
                    │                                             │
                    └─────────────────────────────────────────────┘
```

---

## Appendix B: Quick Reference Commands

### Test Commands

```bash
# Valid submission test
curl -X POST https://n8n.zaplit.com/webhook/consultation \
  -H "Content-Type: application/json" \
  -d '{"data":{"name":"Test","email":"test@test.com","company":"TestCo","role":"Dev","teamSize":"1-10","techStack":["n8n"],"securityLevel":"high","compliance":["soc2"],"message":"Test"}}'

# Invalid submission test (missing email)
curl -X POST https://n8n.zaplit.com/webhook/consultation \
  -H "Content-Type: application/json" \
  -d '{"data":{"name":"Test","email":""}}'

# Invalid email format test
curl -X POST https://n8n.zaplit.com/webhook/consultation \
  -H "Content-Type: application/json" \
  -d '{"data":{"name":"Test","email":"not-an-email"}}'
```

---

*Document Version: 1.0*  
*Created: 2026-03-19*  
*Next Review: After cleanup completion*
