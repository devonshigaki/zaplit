# Deployment Documentation Index

> Deployment procedures, checklists, and guides for the Zaplit platform infrastructure and applications.

---

## Overview

This directory contains deployment-related documentation covering infrastructure setup, application deployment procedures, pre-flight checklists, and post-deployment verification steps for the Zaplit n8n + Twenty CRM integration platform.

---

## Quick Navigation

| Document | Type | Purpose | Status |
|----------|------|---------|--------|
| [Deployment Phase 1 Guide](#deployment-phase-1-guide) | Guide | Initial production deployment | ✅ Stable |
| [Deployment Checklist](#deployment-checklist) | Checklist | Pre/post-deployment verification | ✅ Active |

---

## Deployment Documents

### DEPLOYMENT_PHASE1_GUIDE.md
**Type:** Implementation Guide  
**Status:** ✅ Stable  
**Scope:** Initial production deployment (Phase 1)

Comprehensive guide for deploying the Zaplit platform to production for the first time.

#### Contents

**1. Infrastructure Prerequisites**
- GCP project setup
- VM instance requirements
- Network configuration
- DNS setup
- SSL certificate requirements

**2. n8n Deployment**
- Docker Compose configuration
- Environment variables
- Volume mounts
- Database setup (PostgreSQL)
- Initial admin configuration

**3. Twenty CRM Deployment**
- CRM installation
- Database configuration
- Initial setup and seeding
- Admin user creation

**4. Integration Configuration**
- Webhook endpoint setup
- Credential configuration
- Initial workflow import
- Testing procedures

**5. Security Hardening**
- Basic authentication
- Firewall rules
- Encryption key setup
- SSL/TLS configuration

**6. Monitoring Setup**
- Prometheus deployment
- Grafana dashboards
- Alert rules
- Log aggregation

#### Target Environment
```yaml
Infrastructure:
  Provider: Google Cloud Platform (GCP)
  Compute: e2-medium VM instance
  OS: Ubuntu 22.04 LTS
  
Applications:
  n8n: v1.x (Docker)
  Twenty CRM: v0.x (Docker)
  PostgreSQL: 15 (Docker)
  
Monitoring:
  Prometheus: v2.x
  Grafana: v10.x
```

#### Deployment Timeline
| Phase | Duration | Activities |
|-------|----------|------------|
| Setup | 1 hour | Infrastructure, DNS, SSL |
| Deploy | 2 hours | n8n, CRM, Database |
| Configure | 1 hour | Credentials, webhooks |
| Verify | 1 hour | Testing, monitoring |
| **Total** | **5 hours** | **Initial deployment** |

---

### DEPLOYMENT_CHECKLIST.md
**Type:** Operational Checklist  
**Status:** ✅ Active  
**Scope:** All deployments

Pre-flight and post-deployment verification checklist to ensure consistent, reliable deployments.

#### Pre-Deployment Checklist

**Infrastructure**
- [ ] VM instance running and accessible
- [ ] DNS records configured and propagated
- [ ] SSL certificates valid and not expiring
- [ ] Firewall rules allowing required ports
- [ ] Sufficient disk space (>20% free)
- [ ] Backup system operational

**Security**
- [ ] N8N_ENCRYPTION_KEY set and valid
- [ ] Basic authentication enabled for n8n
- [ ] Webhook endpoints secured (HMAC)
- [ ] Credentials encrypted and accessible
- [ ] No sensitive data in environment variables

**Configuration**
- [ ] Environment variables verified
- [ ] Database connection strings tested
- [ ] API keys valid and not expiring
- [ ] Webhook URLs correctly configured
- [ ] Workflow IDs match between environments

**Monitoring**
- [ ] Prometheus targets healthy
- [ ] Grafana dashboards accessible
- [ ] Alert rules configured
- [ ] Notification channels working
- [ ] Log aggregation functional

#### Post-Deployment Checklist

**Verification**
- [ ] n8n web interface accessible
- [ ] CRM web interface accessible
- [ ] Health check endpoints return 200
- [ ] Webhook endpoints respond correctly
- [ ] Database connections successful

**Testing**
- [ ] End-to-end form submission test
- [ ] CRM record creation verified
- [ ] Error handling tested
- [ ] Retry logic validated
- [ ] Alert notifications received

**Documentation**
- [ ] Deployment logged in change log
- [ ] Configuration changes documented
- [ ] Rollback procedure verified
- [ ] Handoff notes updated

---

## Deployment Environments

```
┌─────────────────────────────────────────────────────────────┐
│                     DEPLOYMENT PIPELINE                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   Development ──▶ Staging ──▶ Production                    │
│      │              │            │                          │
│      │              │            │                          │
│   Local VM      GCP VM      GCP VM (HA)                     │
│   Docker        Docker      Docker + Monitoring             │
│                                                             │
│   Branch:       Branch:     Branch:                         │
│   feature/*     develop     main                            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Environment Details

| Environment | URL | Purpose | Update Frequency |
|-------------|-----|---------|------------------|
| Development | localhost | Local development | On change |
| Staging | staging.zaplit.com | Integration testing | On PR merge |
| Production | zaplit.com | Live production | Scheduled releases |

---

## Release Process

### Standard Release
1. **Planning** - Define release scope
2. **Preparation** - Update checklists, prepare scripts
3. **Staging Deployment** - Deploy to staging, run tests
4. **Approval** - Stakeholder sign-off
5. **Production Deployment** - Execute deployment checklist
6. **Verification** - Post-deployment checks
7. **Monitoring** - Watch metrics for 24-48 hours

### Hotfix Release
1. **Emergency Assessment** - Evaluate severity
2. **Staging Validation** - Quick smoke tests
3. **Production Deploy** - Expedited checklist
4. **Immediate Verification** - Critical path only
5. **Retroactive Documentation** - Update docs post-fix

---

## Rollback Procedures

### Automatic Rollback Triggers
- Health check failures > 5 minutes
- Error rate > 10%
- P95 latency > 10s
- Critical alert threshold exceeded

### Manual Rollback Steps
1. Stop current deployment
2. Restore previous Docker images
3. Revert database migrations (if any)
4. Restore configuration from backup
5. Verify services healthy
6. Notify stakeholders

---

## Related Documentation

| Document | Location | Purpose |
|----------|----------|---------|
| Main Deployment Guide | [../deployment.md](../deployment.md) | Primary deployment procedures |
| Security Implementation | [../security-implementation.md](../security-implementation.md) | Security hardening |
| Monitoring Setup | [../monitoring-setup.md](../monitoring-setup.md) | Observability configuration |
| Workflow Management | [../workflow-management.md](../workflow-management.md) | n8n workflow operations |
| Testing Strategy | [../testing-strategy.md](../testing-strategy.md) | Testing procedures |
| Runbooks | [../runbooks/](../runbooks/) | Operational procedures |

---

## Tools & Scripts

### Deployment Scripts
```bash
# Located in repository root:
./deploy-n8n-gcp-vm.sh          # GCP VM deployment
./setup-ssl-caddy.sh            # SSL certificate setup
./upgrade-to-queue-mode.sh      # Queue mode upgrade
./complete-production-setup.sh  # Full setup automation
```

### Verification Scripts
```bash
# Health checks
curl -f https://n8n.zaplit.com/healthz
curl -f https://crm.zaplit.com/api/health

# Webhook test
curl -X POST https://n8n.zaplit.com/webhook/test \
  -H "Content-Type: application/json" \
  -d '{"test": true}'
```

---

## Change Log

| Date | Version | Changes | Deployed By |
|------|---------|---------|-------------|
| 2026-03-19 | 1.0.0 | Initial production deployment | DevOps Team |
| 2026-03-15 | 0.9.0 | Staging environment setup | DevOps Team |

---

## Emergency Contacts

| Role | Contact | Responsibility |
|------|---------|----------------|
| DevOps Lead | devops@zaplit.com | Deployment execution |
| Platform Engineer | platform@zaplit.com | Infrastructure issues |
| Security Team | security@zaplit.com | Security incidents |
| On-Call Engineer | oncall@zaplit.com | 24/7 emergency response |

---

## Document Maintenance

**Last Updated:** March 19, 2026  
**Update Frequency:** Per release  
**Owner:** DevOps Team  
**Review Schedule:** Monthly

---

**Note:** Always follow the deployment checklist for production changes. When in doubt, consult the runbooks or escalate to the DevOps team.
