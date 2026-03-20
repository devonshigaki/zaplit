# n8n Workflow Cleanup - Quick Reference

## 🚨 BEFORE YOU START

1. **EXPORT BACKUP** → Workflow menu → Download
2. **SCREENSHOT** current state
3. **REVIEW** this guide completely

---

## 📋 DELETE THESE NODES (In Order)

| Order | Node to Delete | How to Identify | Position |
|-------|----------------|-----------------|----------|
| 1️⃣ | `Success Response` (old) | NOT "Success Response1" | Top area |
| 2️⃣ | `HTTP Request1` | Old Create Company | Top-left |
| 3️⃣ | `HTTP Request` | Old Create Person | Top-left |
| 4️⃣ | `Consultation Webhook` (old) | NOT "Consultation Webhook1" | Top-left |

---

## ✅ KEEP THESE NODES

```
⭐ Consultation Webhook1       ← Entry point (keep)
⭐ Validate and Process        ← Validation + parsing
⭐ Validation Check            ← IF node
⭐ Create Person               ← HTTP POST /people
⭐ Create Company              ← HTTP POST /companies  
⭐ Merge Results               ← Combines branches
⭐ Extract IDs                 ← Code node
⭐ Link Person to Company      ← HTTP PATCH
⭐ Create Note                 ← HTTP POST /notes
⭐ Success Response1           ← Final response
⭐ Validation Error            ← Error response
```

---

## 🔗 CONNECTION VERIFICATION

Follow the flow - all these must be connected:

```
Webhook1 → Validate & Process → Validation Check
                                      ↓
                    ┌─────────────────┴───────────────┐
                    ↓ True                            ↓ False
            Create Person & Company          Validation Error
                    ↓
              Merge Results
                    ↓
               Extract IDs
                    ↓
         Link Person to Company
                    ↓
               Create Note
                    ↓
            Success Response1
```

**CRITICAL:** Create Person → Merge Input 0, Create Company → Merge Input 1

---

## ⚡ POST-CLEANUP CHECKLIST

- [ ] Save workflow (Ctrl+S)
- [ ] Reconnect credentials if showing errors
- [ ] Webhook path = `consultation`
- [ ] Response mode = `Using Respond to Webhook node`
- [ ] Test valid submission
- [ ] Test invalid submission  
- [ ] Verify CRM records created
- [ ] Activate workflow

---

## 🧪 TEST COMMANDS

```bash
# Valid test
curl -X POST https://n8n.zaplit.com/webhook/consultation \
  -H "Content-Type: application/json" \
  -d '{"data":{"name":"Test","email":"test@test.com","company":"TestCo","role":"Dev","teamSize":"1-10","techStack":["n8n"],"securityLevel":"high","compliance":["soc2"],"message":"Test"}}'

# Invalid test (should return 400)
curl -X POST https://n8n.zaplit.com/webhook/consultation \
  -H "Content-Type: application/json" \
  -d '{"data":{"name":"","email":""}}'
```

---

## 🆘 RECOVERY

**If you delete wrong node:**
1. DON'T SAVE
2. Refresh page (F5)
3. Changes will be discarded
4. Start over

**If workflow breaks:**
1. Import from backup
2. Check FINAL_EXECUTION_REPORT.md for details

---

## 📞 Reference Files

| File | Purpose |
|------|---------|
| `N8N_WORKFLOW_CLEANUP_PLAN.md` | Full detailed plan |
| `n8n-workflow-v2-fixed.json` | Clean workflow JSON |
| `FINAL_EXECUTION_REPORT.md` | Context & background |
