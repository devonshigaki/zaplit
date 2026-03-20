# Runbook: RB002 - Incident Response

**Purpose:** Standardized incident response for n8n workflow failures  
**Severity Levels:** P0 (Critical), P1 (High), P2 (Medium), P3 (Low)  
**Owner:** On-Call Engineering Team  
**Last Updated:** March 19, 2026

---

## Incident Severity Matrix

| Severity | Criteria | Response Time | Communication |
|----------|----------|---------------|---------------|
| **P0** | Service down, all submissions failing | 5 min | Page/SMS + Slack #incidents |
| **P1** | Major functionality impaired, >5% failure rate | 15 min | Slack #incidents + Email |
| **P2** | Minor impact, workarounds available | 1 hour | Slack #engineering |
| **P3** | Cosmetic issues, no immediate impact | 4 hours | Daily digest |

---

## Initial Response (First 5 Minutes)

### 1. Acknowledge

```
/incident acknowledge INC-XXXX
```

- Acknowledge in PagerDuty/ops tool
- Post in #incidents: "Investigating [brief description]"

### 2. Assess

Check these dashboards:
- [ ] n8n Executions (failed count)
- [ ] CRM API status
- [ ] Recent form submissions
- [ ] Error logs

### 3. Classify

Determine severity based on impact:
- How many users affected?
- Is there a workaround?
- Is data at risk?

---

## Common Incident Patterns

### Pattern 1: Authentication Failure (401/403)

**Symptoms:**
- All executions failing
- Error: "Unauthorized" or "Invalid token"
- Started suddenly

**Response:**
1. Verify CRM API status page
2. Check credential expiration
3. If expired → Follow [RB001 Credential Rotation](./RB001-credential-rotation.md)
4. If not expired → Escalate to L2

**Time to resolve:** 10-30 minutes

---

### Pattern 2: High Error Rate (>5%)

**Symptoms:**
- Partial failures
- Mixed success/failure
- Increased latency

**Response:**
1. Check execution logs for common error
2. Identify failing node
3. Common causes:
   - CRM API rate limiting → Implement backoff
   - Validation errors → Check form submissions
   - Network issues → Check connectivity
4. If no clear cause → Escalate to L2

**Time to resolve:** 15-60 minutes

---

### Pattern 3: Performance Degradation

**Symptoms:**
- Response time > 10 seconds
- Timeouts increasing
- Queue backing up

**Response:**
1. Check system resources (CPU, memory)
2. Check concurrent executions
3. Check database performance
4. If resource constraint → Scale up
5. If external dependency → Check CRM status

**Time to resolve:** 15-30 minutes

---

### Pattern 4: Data Integrity Issues

**Symptoms:**
- Duplicate records
- Missing fields
- Incorrect linking

**Response:**
1. Pause form submissions (disable on website)
2. Analyze pattern in recent executions
3. Fix workflow logic
4. Clean up affected data
5. Re-enable submissions

**Time to resolve:** 1-4 hours

---

## Escalation Path

```
L1: On-call Engineer (You)
    ↓ (Cannot resolve in 15 min OR P0 incident)
L2: Senior Engineer
    ↓ (Cannot resolve in 30 min OR major customer impact)
L3: Engineering Manager
    ↓ (> 1 hour OR executive attention needed)
L4: CTO
```

---

## Communication Templates

### Initial Alert (Slack #incidents)
```
🚨 INCIDENT - {Severity}
Service: n8n Consultation Form
Impact: {Description}
Started: {Time}
Engineer: {Your name}
Status: Investigating

Updates in thread ↓
```

### Status Update (Every 30 min)
```
📋 Update - {Time elapsed}
Status: {Investigating/Identified/Mitigating/Resolved}
Progress: {What you've found/done}
ETA: {When you expect resolution}
```

### Resolution
```
✅ RESOLVED - {Time}
Duration: {Total time}
Root Cause: {Brief description}
Resolution: {What fixed it}

Post-mortem: {Link to doc} (within 24 hours)
```

---

## Post-Incident Requirements

### Within 24 Hours
- [ ] Post-incident review document created
- [ ] Root cause documented
- [ ] Action items identified with owners
- [ ] Communication sent to stakeholders

### Within 1 Week
- [ ] Action items completed
- [ ] Monitoring improved if needed
- [ ] Runbooks updated if needed

---

## Quick Reference Commands

```bash
# Check recent failed executions
curl "https://n8n.zaplit.com/api/v1/executions?filter=status:failed&limit=10" \
  -H "X-N8N-API-KEY: $N8N_API_KEY"

# Check workflow status
curl "https://n8n.zaplit.com/api/v1/workflows/{workflow-id}" \
  -H "X-N8N-API-KEY: $N8N_API_KEY"

# Deactivate workflow (emergency)
curl -X POST "https://n8n.zaplit.com/api/v1/workflows/{workflow-id}/deactivate" \
  -H "X-N8N-API-KEY: $N8N_API_KEY"
```

---

## Related Runbooks

- [RB001: Credential Rotation](./RB001-credential-rotation.md)
- [RB003: Workflow Rollback](./RB003-workflow-rollback.md)
