# Operations Documentation Index

This directory contains consolidated operations and execution documentation for the Zaplit n8n + Twenty CRM integration platform.

---

## Quick Navigation

| Document | Purpose | Key Topics |
|----------|---------|------------|
| [ci-cd.md](ci-cd.md) | CI/CD operations and deployment | GitHub Actions, Cloud Run, automation |
| [deployment.md](deployment.md) | Production deployment procedures | Security hardening, backups, rollback, DR |
| [monitoring-setup.md](monitoring-setup.md) | Observability configuration | Prometheus, Grafana, alerting, logs |
| [security-implementation.md](security-implementation.md) | Security hardening guide | Encryption, auth, HMAC, credentials |
| [workflow-management.md](workflow-management.md) | n8n workflow operations | Import, cleanup, validation, data quality |
| [testing-strategy.md](testing-strategy.md) | Testing procedures | E2E, load testing, verification |

---

## Document Consolidation Map

### Source → Target Mapping

| Consolidated Document | Source Files Merged |
|----------------------|---------------------|
| **deployment.md** | N8N_PRODUCTION_DEPLOYMENT_GUIDE.md, EXECUTION_DR_FIXES.md, FINAL_EXECUTION_REPORT.md, MASTER_EXECUTION_SUMMARY.md |
| **monitoring-setup.md** | MONITORING_AND_OBSERVABILITY_GUIDE.md, EXECUTION_MONITORING_FIXES.md, MONITORING_IMPLEMENTATION_CHECKLIST.md, PERFORMANCE_OPTIMIZATION_GUIDE.md |
| **security-implementation.md** | EXECUTION_SECURITY_FIXES.md, SECURITY_REMEDIATION_QUICK_START.md, FRONTEND_HMAC_INTEGRATION.md, N8N_CREDENTIAL_MANAGEMENT_GUIDE.md |
| **workflow-management.md** | WORKFLOW_SETUP_INSTRUCTIONS.md, N8N_WORKFLOW_CLEANUP_PLAN.md, N8N_CLEANUP_QUICK_REFERENCE.md, EXECUTION_DATA_QUALITY_FIXES.md, FINAL_EXECUTION_REPORT.md |
| **testing-strategy.md** | N8N_TESTING_QUICK_START.md, N8N_WEBHOOK_E2E_TESTING_GUIDE.md, FINAL_EXECUTION_REPORT.md, ERROR_RECOVERY_AND_DR_GUIDE.md |

---

## Runbooks Index

Located in [runbooks/](runbooks/) directory:

| Runbook | Purpose |
|---------|---------|
| [RB-DR-001-VM-Recovery.md](runbooks/RB-DR-001-VM-Recovery.md) | VM disaster recovery procedures |
| [RB001-credential-rotation.md](runbooks/RB001-credential-rotation.md) | Credential rotation procedures |
| [RB002-incident-response.md](runbooks/RB002-incident-response.md) | Incident response procedures |
| [RB003-workflow-rollback.md](runbooks/RB003-workflow-rollback.md) | Workflow rollback procedures |
| [RB004-monitoring-setup.md](runbooks/RB004-monitoring-setup.md) | Monitoring setup procedures |
| [QUICK_REFERENCE.md](runbooks/QUICK_REFERENCE.md) | Quick reference commands |

---

## Quick Reference Commands

### Health Checks
```bash
# Check n8n health
curl -I https://n8n.zaplit.com

# Verify webhook endpoint
curl -X POST https://n8n.zaplit.com/webhook/consultation \
  -H "Content-Type: application/json" \
  -d '{"data":{"name":"Test","email":"test@test.com"}}'

# Check CRM API health
curl -s -o /dev/null -w "%{http_code}" \
  https://crm.zaplit.com/rest/people \
  -H "Authorization: Bearer $TWENTY_TOKEN"
```

### Security Verification
```bash
# Check encryption key
docker exec n8n printenv N8N_ENCRYPTION_KEY | wc -c

# Verify basic auth
curl https://n8n.zaplit.com/

# Test webhook HMAC (should fail without signature)
curl -X POST https://n8n.zaplit.com/webhook/consultation \
  -H "Content-Type: application/json" \
  -d '{"data":{"name":"Test"}}'
```

### Backup Operations
```bash
# Run database backup
sudo /opt/n8n/scripts/backup-database.sh

# List GCP snapshots
gcloud compute snapshots list --filter="sourceDisk~n8n-instance"

# Export workflow
curl -X GET "https://n8n.zaplit.com/api/v1/workflows/$WORKFLOW_ID" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" \
  > workflow-backup-$(date +%Y%m%d).json
```

---

## Implementation Status

### Phase 1: Stabilize (Complete)
| Component | Status | Risk Score |
|-----------|--------|------------|
| Security Fixes | ✅ Complete | 6.5 → 4.0 (-38%) |
| Monitoring | ✅ Complete | 7.5 → 3.0 (-60%) |
| Disaster Recovery | ✅ Complete | 8.0 → 5.0 (-38%) |
| Data Quality | ✅ Complete | 7.0 → 4.0 (-43%) |
| **Overall** | **✅ Complete** | **7.2 → 4.2 (-40%)** |

### Phase 2: Harden (In Progress)
- [ ] Circuit breaker for CRM API
- [ ] Dead letter queue for failed submissions
- [ ] Parallel processing optimization
- [ ] Log aggregation with Loki
- [ ] PostgreSQL replication

---

## Key Metrics

### SLA Targets
| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| Uptime | 99% | - |
| Success Rate | >99% | < 95% |
| Response Time (p95) | <5s | > 10s |
| Error Rate | <1% | > 5% |
| Alert Response | <5 min | - |

### Key Files Location

```
/Users/devonshigaki/Downloads/zaplit/
├── docs/ops/                       # This consolidated documentation
│   ├── README.md                   # This file
│   ├── deployment.md               # Deployment procedures
│   ├── monitoring-setup.md         # Monitoring configuration
│   ├── security-implementation.md  # Security hardening
│   ├── workflow-management.md      # Workflow operations
│   ├── testing-strategy.md         # Testing procedures
│   └── runbooks/                   # Operational runbooks
│
├── scripts/                        # Automation scripts
│   ├── security/                   # Security scripts
│   ├── dr/                         # Disaster recovery scripts
│   ├── monitoring/                 # Monitoring deployment
│   └── data-quality/               # Data validation scripts
│
├── monitoring/                     # Prometheus/Grafana configs
│   ├── prometheus.yml
│   ├── alert-rules.yml
│   └── grafana/dashboards/
│
└── runbooks/                       # Original runbooks (referenced)
```

---

## Emergency Contacts

| Issue | Contact | Escalation |
|-------|---------|------------|
| Security breach | Security Team | Immediate key rotation |
| Service down | DevOps On-Call | Emergency rollback |
| Credential leak | Security Team | Revoke and rotate |
| Data loss | DevOps Team | Restore from backup |

---

## Document Maintenance

**Last Updated:** March 19, 2026  
**Update Frequency:** As source documents change  
**Owner:** DevOps Team  
**Review Schedule:** Monthly

### How to Update

When source documents are updated:
1. Identify which consolidated document(s) need updating
2. Apply changes following the existing structure
3. Update the `topics` metadata in the frontmatter
4. Update this index if new documents are added

---

## Additional Resources

### External Documentation
- [n8n Documentation](https://docs.n8n.io/)
- [Twenty CRM API Docs](https://docs.twenty.com/developers/extend/api)
- [GCP Snapshot Documentation](https://cloud.google.com/compute/docs/disks/scheduled-snapshots)
- [Prometheus Documentation](https://prometheus.io/docs/)
- [Grafana Documentation](https://grafana.com/docs/)

### Original Documents (Archive)
All original source documents remain in the repository root for reference. The consolidated versions in this directory are the authoritative operational guides.
