# Runbook: RB003 - Workflow Rollback

**Purpose:** Roll back to previous workflow version in case of failure  
**Severity:** Emergency procedure (use when current version causing issues)  
**Owner:** DevOps Team  
**Last Updated:** March 19, 2026

---

## When to Use This Runbook

- New workflow version causing failures
- Critical bug discovered post-deployment
- Performance degradation after update
- Data integrity issues

---

## Rollback Options

### Option 1: Emergency Rollback (< 5 min) - **PREFERRED**

Use when: Immediate customer impact, need fastest recovery

```bash
#!/bin/bash
# emergency-rollback.sh

WORKFLOW_ID="consultation-form-to-crm"
BACKUP_DIR="/backups/n8n"
N8N_URL="https://n8n.zaplit.com"

# 1. DEACTIVATE immediately
echo "🚨 Deactivating workflow..."
curl -X POST \
  "${N8N_URL}/api/v1/workflows/${WORKFLOW_ID}/deactivate" \
  -H "X-N8N-API-KEY: ${N8N_API_KEY}"

echo "⚠️  Form submissions will fail until rollback complete"

# 2. Find latest backup
LATEST_BACKUP=$(ls -t ${BACKUP_DIR}/workflow-${WORKFLOW_ID}-*.json 2>/dev/null | head -1)

if [ -z "$LATEST_BACKUP" ]; then
  echo "❌ No backup found! Looking for any backup..."
  LATEST_BACKUP=$(ls -t ${BACKUP_DIR}/*.json 2>/dev/null | head -1)
fi

if [ -z "$LATEST_BACKUP" ]; then
  echo "❌ No backups available! Manual intervention required."
  exit 1
fi

echo "📁 Using backup: $LATEST_BACKUP"

# 3. Restore workflow
echo "🔄 Restoring workflow..."
curl -X PUT \
  "${N8N_URL}/api/v1/workflows/${WORKFLOW_ID}" \
  -H "X-N8N-API-KEY: ${N8N_API_KEY}" \
  -H "Content-Type: application/json" \
  -d @$LATEST_BACKUP

echo "✅ Workflow restored"
echo ""
echo "⚠️  MANUAL STEPS REQUIRED:"
echo "   1. Verify credentials are connected in n8n UI"
echo "   2. Test with single submission"
echo "   3. Activate workflow"
echo "   4. Monitor for 15 minutes"
```

---

### Option 2: Controlled Rollback (10-15 min)

Use when: No immediate emergency, can afford careful rollback

#### Step 1: Prepare
- [ ] Notify team in #engineering
- [ ] Identify last known good version
- [ ] Prepare backup of current (failing) version

#### Step 2: Disable Submissions
```javascript
// Temporary disable on website
// Add to form submission handler:
const FORM_ENABLED = false;
if (!FORM_ENABLED) {
  return { error: 'Form temporarily unavailable' };
}
```

#### Step 3: Wait for In-Flight Executions
- Check n8n → Executions → Running
- Wait until count = 0

#### Step 4: Export Current State
```bash
# Backup current (failing) version
curl -X GET \
  "https://n8n.zaplit.com/api/v1/workflows/${WORKFLOW_ID}" \
  -H "X-N8N-API-KEY: ${N8N_API_KEY}" \
  > workflow-current-failing-$(date +%Y%m%d-%H%M).json
```

#### Step 5: Import Previous Version
1. In n8n UI: Settings → Import from File
2. Select backup JSON
3. Review node connections

#### Step 6: Verify Credentials
- [ ] Create Person credential connected
- [ ] Create Company credential connected
- [ ] Link Person credential connected
- [ ] Create Note credential connected

#### Step 7: Test
```bash
# Test submission
curl -X POST https://n8n.zaplit.com/webhook/consultation \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "name": "Rollback Test",
      "email": "rollback-test@zaplit.com",
      "company": "Test Company",
      "message": "Testing rollback"
    }
  }'
```

#### Step 8: Activate and Monitor
- [ ] Activate workflow
- [ ] Re-enable form submissions
- [ ] Monitor for 30 minutes

---

## Verification Checklist

### After Emergency Rollback
- [ ] Workflow deactivated
- [ ] Backup restored
- [ ] Credentials verified
- [ ] Test submission successful
- [ ] Workflow activated
- [ ] Monitoring shows normal operation

### After Controlled Rollback
- [ ] Form submissions disabled
- [ ] In-flight executions completed
- [ ] Current version backed up
- [ ] Previous version imported
- [ ] Credentials verified
- [ ] Test submission successful
- [ ] Form submissions re-enabled
- [ ] 30-minute monitoring complete

---

## Post-Rollback Actions

### Immediate (Within 1 Hour)
- [ ] Document incident
- [ ] Notify stakeholders
- [ ] Create bug ticket for failed version

### Short-term (Within 24 Hours)
- [ ] Root cause analysis
- [ ] Fix identified issues
- [ ] Test fixed version in staging

### Long-term
- [ ] Improve testing process
- [ ] Update deployment checklist
- [ ] Consider canary deployment

---

## Rollback Testing

Test rollback procedure monthly:
1. Use staging environment
2. Deploy test change
3. Execute rollback
4. Verify functionality
5. Document any issues

---

## Related Runbooks

- [RB002: Incident Response](./RB002-incident-response.md)
- [Production Deployment Guide](../N8N_PRODUCTION_DEPLOYMENT_GUIDE.md)
