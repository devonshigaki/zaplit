# Documentation

> Consolidated documentation for Zaplit platform (AI agent teams deployment)

---

## Quick Navigation

| Section | Purpose | Key Documents |
|---------|---------|---------------|
| [Architecture](./architecture/) | System design, research, decisions | [Research Index](./architecture/research/CONSOLIDATED_RESEARCH_INDEX.md), [Security Audit](./architecture/research/security-audit.md) |
| [Operations](./ops/) | Deployment, monitoring, runbooks | [Deployment Guide](./ops/deployment.md), [Monitoring Setup](./ops/monitoring-setup.md), [Security Implementation](./ops/security-implementation.md) |
| [Executions](./ops/executions/) | Execution reports & fix documentation | [Security Fixes](./ops/executions/README.md#execution-security-fixes), [Monitoring Fixes](./ops/executions/README.md#execution-monitoring-fixes) |
| [Guides](./ops/guides/) | Implementation guides | [Circuit Breaker](./ops/guides/README.md#circuit-breaker-implementation), [HMAC Integration](./ops/guides/README.md#frontend-hmac-integration) |
| [Deployment](./ops/deployment/) | Deployment procedures | [Phase 1 Guide](./ops/deployment/README.md#deployment-phase-1-guide), [Checklist](./ops/deployment/README.md#deployment-checklist) |
| [Development](./development/) | Contributing, testing, environment | [Testing Strategy](./development/N8N_TESTING_IMPLEMENTATION_GUIDE.md) |
| [Security](./security/) | Policy and reporting | [Security Overview](./security/) |
| [Reference](./reference/) | API docs, integrations, troubleshooting | [n8n Integration](./reference/n8n-integration.md), [Twenty CRM API](./reference/twenty-crm-api.md), [Troubleshooting](./reference/troubleshooting.md) |
| [Meta](./meta/) | Documentation metadata | [Consolidation Report](./meta/README.md#consolidation-report), [Synthesis Plans](./meta/README.md) |

---

## Documentation Structure

```
docs/
├── README.md                          # This file - master navigation
├── architecture/                      # System architecture & research
│   ├── README.md
│   └── research/                      # Consolidated research documents
│       ├── CONSOLIDATED_RESEARCH_INDEX.md  # Master research index
│       ├── security-audit.md          # Security findings & risks
│       ├── performance-analysis.md    # Performance benchmarks
│       ├── monitoring-strategy.md     # Observability design
│       ├── disaster-recovery.md       # DR & resilience
│       ├── data-quality.md            # Data integrity analysis
│       ├── synthesis-plan.md          # Consolidated remediation plan
│       └── phase2/                    # Phase 2 research documents
├── ops/                               # Operations & deployment
│   ├── README.md                      # Ops master index
│   ├── deployment.md                  # Deployment procedures
│   ├── monitoring-setup.md            # Monitoring configuration
│   ├── security-implementation.md     # Security hardening
│   ├── workflow-management.md         # n8n workflow operations
│   ├── testing-strategy.md            # Testing procedures
│   ├── executions/                    # Execution reports index
│   │   └── README.md                  # Fix documentation index
│   ├── guides/                        # Implementation guides index
│   │   └── README.md                  # Step-by-step guides
│   ├── deployment/                    # Deployment docs index
│   │   └── README.md                  # Deployment procedures
│   └── runbooks/                      # Incident response
│       ├── QUICK_REFERENCE.md
│       ├── RB-DR-001-VM-Recovery.md
│       ├── RB001-credential-rotation.md
│       ├── RB002-incident-response.md
│       ├── RB003-workflow-rollback.md
│       └── RB004-monitoring-setup.md
├── development/                       # Development guides
│   ├── README.md
│   ├── N8N_TESTING_IMPLEMENTATION_GUIDE.md
│   └── N8N_TWENTY_CRM_TESTING_STRATEGY.md
├── security/                          # Security documentation
│   └── README.md
├── reference/                         # Reference materials
│   ├── README.md                      # Reference index
│   ├── n8n-integration.md             # n8n configuration
│   ├── twenty-crm-api.md              # CRM API reference
│   ├── data-mappings.md               # Field mappings
│   ├── troubleshooting.md             # Common issues
│   ├── snapshots/                     # Configuration snapshots
│   └── integrations/                  # Integration guides
└── meta/                              # Documentation metadata
    └── README.md                      # Consolidation docs index
```

---

## By Topic

### Getting Started

| For | Start Here |
|-----|-----------|
| **New Developer** | [Development README](./development/README.md) |
| **DevOps Engineer** | [Ops README](./ops/README.md), [Deployment Index](./ops/deployment/) |
| **Security Review** | [Security Audit](./architecture/research/security-audit.md) |
| **Architecture Review** | [Research Index](./architecture/research/CONSOLIDATED_RESEARCH_INDEX.md) |

### Security

| Document | Purpose |
|----------|---------|
| [Security Audit](./architecture/research/security-audit.md) | Comprehensive security findings |
| [Security Implementation](./ops/security-implementation.md) | Current security configuration |
| [Security Remediation Quick Start](./ops/guides/README.md#security-remediation-quick-start) | Rapid hardening guide |
| [Frontend HMAC Integration](./ops/guides/README.md#frontend-hmac-integration) | Webhook signature verification |
| [Credential Management](./ops/guides/README.md#credential-management) | n8n secrets management |
| [Security Fixes Executed](./ops/executions/README.md#execution-security-fixes) | Completed security work |

### Monitoring & Observability

| Document | Purpose |
|----------|---------|
| [Monitoring Strategy](./architecture/research/monitoring-strategy.md) | Observability design |
| [Monitoring Setup](./ops/monitoring-setup.md) | Current monitoring configuration |
| [Monitoring & Observability Guide](./ops/guides/README.md#monitoring-and-observability) | Implementation guide |
| [Monitoring Fixes Executed](./ops/executions/README.md#execution-monitoring-fixes) | Completed monitoring work |
| [Alert Runbook](./ops/runbooks/RB004-monitoring-setup.md) | Alert response procedures |

### Deployment

| Document | Purpose |
|----------|---------|
| [Deployment Guide](./ops/deployment.md) | Primary deployment procedures |
| [Deployment Index](./ops/deployment/) | All deployment documentation |
| [Deployment Phase 1 Guide](./ops/deployment/README.md#deployment-phase-1-guide) | Initial production setup |
| [Deployment Checklist](./ops/deployment/README.md#deployment-checklist) | Pre/post-deployment verification |
| [Production Deployment Guide](./ops/guides/README.md#production-deployment) | Full production setup |

### Disaster Recovery

| Document | Purpose |
|----------|---------|
| [Disaster Recovery](./architecture/research/disaster-recovery.md) | DR analysis & design |
| [DR Fixes Executed](./ops/executions/README.md#execution-dr-fixes) | Completed DR work |
| [VM Recovery Runbook](./ops/runbooks/RB-DR-001-VM-Recovery.md) | VM disaster recovery |
| [Error Recovery & DR Guide](./ops/guides/README.md#error-recovery-and-dr) | Recovery procedures |

### Performance

| Document | Purpose |
|----------|---------|
| [Performance Analysis](./architecture/research/performance-analysis.md) | Performance findings |
| [Performance Optimization Guide](./ops/guides/README.md#performance-optimization) | Tuning guide |
| [Circuit Breaker Implementation](./ops/guides/README.md#circuit-breaker-implementation) | API resilience |
| [Parallel Workflow Implementation](./ops/guides/README.md#parallel-workflow-implementation) | Performance optimization |

### Workflows

| Document | Purpose |
|----------|---------|
| [Workflow Management](./ops/workflow-management.md) | n8n operations |
| [Workflow Setup Instructions](./ops/guides/README.md#workflow-setup-instructions) | Initial configuration |
| [Workflow Cleanup Plan](./ops/guides/README.md#workflow-cleanup-plan) | Organization best practices |
| [Workflow Rollback Runbook](./ops/runbooks/RB003-workflow-rollback.md) | Rollback procedures |

### Testing

| Document | Purpose |
|----------|---------|
| [Testing Strategy](./ops/testing-strategy.md) | Testing procedures |
| [Testing Quick Start](./ops/guides/README.md#testing-quick-start) | Basic testing |
| [E2E Testing Guide](./ops/guides/README.md#e2e-testing-guide) | End-to-end testing |
| [Testing Implementation Guide](./development/N8N_TESTING_IMPLEMENTATION_GUIDE.md) | Test automation |

---

## TypeScript Scripts

Shell scripts have been ported to TypeScript in `scripts-ts/`:

```bash
cd scripts-ts
npm install

# Security
npm run security:verify-encryption
npm run security:enable-basic-auth

# Disaster Recovery
npm run dr:backup-db
npm run dr:setup-snapshots

# Monitoring
npm run monitoring:deploy

# Testing
npm run test:health
npm run test:integration
npm run test:load
```

See [scripts-ts/README.md](../scripts-ts/README.md) for full documentation.

---

## Execution Status

### Phase 1: Stabilize (Complete)

| Domain | Initial Risk | Final Risk | Status |
|--------|--------------|------------|--------|
| Security | 6.5/10 | 4.0/10 | ✅ [Complete](./ops/executions/README.md#execution-security-fixes) |
| Monitoring | 7.5/10 | 3.0/10 | ✅ [Complete](./ops/executions/README.md#execution-monitoring-fixes) |
| Disaster Recovery | 8.0/10 | 5.0/10 | ✅ [Complete](./ops/executions/README.md#execution-dr-fixes) |
| Data Quality | 7.0/10 | 4.0/10 | ✅ [Complete](./ops/executions/README.md#execution-data-quality-fixes) |
| **Overall** | **7.2/10** | **4.2/10** | **✅ Complete (-40%)** |

See [Execution Reports Index](./ops/executions/) for detailed fix documentation.

### Phase 2: Harden (In Progress)

- [ ] Circuit breaker for CRM API
- [ ] Dead letter queue for failed submissions
- [ ] Parallel processing optimization
- [ ] Log aggregation with Loki
- [ ] PostgreSQL replication

See [Phase 2 Research](./architecture/research/phase2/) for research documents.

---

## Root Document Migration

Root-level markdown files are being consolidated into this structure per [CONSOLIDATION_PLAN.md](../CONSOLIDATION_PLAN.md):

| Category | Root Files | Destination | Status |
|----------|-----------|-------------|--------|
| Research | 12 files | docs/architecture/research/ | 🔲 Planned |
| Execution Reports | 7 files | docs/ops/executions/ | 🔲 Planned |
| Implementation Guides | 14 files | docs/ops/guides/ | 🔲 Planned |
| Deployment | 2 files | docs/ops/deployment/ | 🔲 Planned |
| Consolidation | 6 files | docs/meta/ | 🔲 Planned |
| Snapshots | 7 files | Delete (duplicates exist) | 🔲 Planned |

---

## Contributing

- Follow the [testing strategy](./ops/testing-strategy.md) for all changes
- Update relevant documentation with PRs
- Reference [architecture decisions](./architecture/research/synthesis-plan.md) for context
- Add new guides to the appropriate index (executions, guides, deployment, meta)

---

## Document Maintenance

**Last Updated:** March 19, 2026  
**Update Frequency:** As documentation structure changes  
**Owner:** Documentation Team  
**Review Schedule:** Monthly

---

**Note:** Original root-level documents remain in the repository root for reference during the consolidation process. The consolidated versions in this directory are the authoritative documentation.
