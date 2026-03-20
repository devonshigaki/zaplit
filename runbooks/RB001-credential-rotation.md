# Runbook: RB001 - Credential Rotation

**Purpose:** Rotate Twenty CRM API credentials securely  
**Frequency:** Every 90 days (production), 30 days (staging)  
**Owner:** DevOps Team  
**Last Updated:** March 19, 2026

---

## Prerequisites

- [ ] Access to Twenty CRM admin panel
- [ ] Access to n8n production
- [ ] Maintenance window scheduled (if production)
- [ ] Rollback plan prepared

---

## Procedure

### Step 1: Generate New API Key (Twenty CRM)

1. Log in to Twenty CRM: https://crm.zaplit.com
2. Navigate to **Settings → APIs & Webhooks**
3. Click **Create New Key**
4. Configure:
   - **Name:** `n8n-production-{date}` (e.g., `n8n-production-20260319`)
   - **Expiration:** 90 days from today
   - **Permissions:** Read/Write People, Companies, Notes
5. **Copy the key immediately** (shown only once)
6. Store temporarily in password manager

### Step 2: Create New Credential in n8n

1. Log in to n8n: https://n8n.zaplit.com
2. Navigate to **Settings → Credentials**
3. Click **Add Credential**
4. Configure:
   - **Credential Type:** HTTP Header Auth
   - **Name:** `TwentyCRM-Production-{date}`
   - **Header Name:** `Authorization`
   - **Header Value:** `Bearer {new-api-key}`
5. Click **Save**

### Step 3: Test New Credential

1. Create a test workflow:
```
[Manual Trigger]
    ↓
[HTTP Request]
    URL: https://crm.zaplit.com/rest/people
    Method: GET
    Authentication: Select new credential
```
2. Execute workflow
3. Verify successful response (200 OK)

### Step 4: Update Production Workflow

1. Open **Consultation Form to CRM** workflow
2. Update each HTTP Request node:
   - **Create Person** → Select new credential
   - **Create Company** → Select new credential
   - **Link Person to Company** → Select new credential
   - **Create Note** → Select new credential
3. Save workflow
4. Test with single submission

### Step 5: Monitor

1. Monitor for 1 hour
2. Verify:
   - Successful form submissions
   - Records created in CRM
   - No authentication errors

### Step 6: Cleanup

1. If successful for 24 hours:
   - Delete old API key in Twenty CRM
   - Delete old credential in n8n
2. Update credential rotation log

---

## Rollback Procedure

If issues detected:

1. Revert workflow to use old credential
2. Debug new credential issue
3. Retry rotation when resolved

---

## Verification Checklist

- [ ] New API key generated in Twenty CRM
- [ ] New credential created in n8n
- [ ] Test workflow executed successfully
- [ ] Production workflow updated
- [ ] Form submission tested
- [ ] 1-hour monitoring complete
- [ ] Old credentials deleted (after 24 hours)

---

## Related Documentation

- [Production Deployment Guide](../N8N_PRODUCTION_DEPLOYMENT_GUIDE.md)
- [Security Report](../N8N_TWENTY_CRM_SECURITY_REPORT.md)
