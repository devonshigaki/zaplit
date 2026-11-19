# GCP Infrastructure Gap Analysis
## Project: zaplit-website-prod
## Analysis Date: 2026-03-20
## Conducted By: Principal Engineering Review

---

## Executive Summary

This comprehensive analysis identifies **critical gaps** in Zaplit's GCP infrastructure across security, monitoring, backup/DR, and cost optimization dimensions. While core services are operational, significant production-readiness gaps exist that pose risks to reliability, security, and cost efficiency.

### Risk Classification
| Severity | Count | Description |
|----------|-------|-------------|
| 🔴 **CRITICAL** | 5 | Immediate action required - production risk |
| 🟠 **HIGH** | 8 | Address within 2 weeks - significant risk |
| 🟡 **MEDIUM** | 12 | Address within 1 month - moderate risk |
| 🟢 **LOW** | 6 | Address when convenient - best practice |

---

## 1. MISSING GCP SERVICES

### 1.1 Compute & Networking Gaps

| Service | Status | Impact | Priority |
|---------|--------|--------|----------|
| **Cloud Load Balancing** | ❌ NOT CONFIGURED | No high availability, single point of failure | 🔴 CRITICAL |
| **Cloud CDN** | ❌ NOT CONFIGURED | Higher latency, increased load on origins | 🟠 HIGH |
| **Managed Instance Groups** | ❌ NOT CONFIGURED | No auto-scaling, no fault tolerance | 🟠 HIGH |
| **Instance Templates** | ❌ NOT CONFIGURED | Manual VM creation only | 🟡 MEDIUM |
| **Cloud Armor** | ❌ NOT CONFIGURED | No DDoS protection, no WAF | 🟠 HIGH |
| **Cloud NAT** | ❌ NOT CONFIGURED | VMs have direct external egress | 🟡 MEDIUM |

**Current State:**
- 3 VMs running with ephemeral external IPs (no load balancer in front)
- No auto-scaling capabilities for Cloud Run or Compute Engine
- Single zone deployment (us-central1-a) with no redundancy
- Reserved static IP `34.120.3.24` is **NOT BEING USED** (waste)

### 1.2 Data & Storage Gaps

| Service | Status | Configuration | Gap |
|---------|--------|---------------|-----|
| **Cloud SQL** | ✅ EXISTS | twenty-postgres (POSTGRES_16) | Properly configured with backups |
| **Cloud SQL High Availability** | ⚠️ PARTIAL | REGIONAL availability | No cross-region replication |
| **Memorystore (Redis)** | ✅ EXISTS | twenty-redis (BASIC tier, 5GB) | No HA, no persistence configured |
| **Cloud Storage Buckets** | ✅ EXISTS | 6 buckets | No lifecycle policies, no versioning |
| **Backup GCS Bucket** | ❌ MISSING | n/a | Runbook references `gs://zaplit-n8n-backups/` which doesn't exist |

**Redis Configuration Issues:**
```
Instance: twenty-redis
Tier: BASIC (no HA)
Persistence: NOT CONFIGURED (RDB/AOF disabled)
Memory: 5GB (may be undersized for production)
```

### 1.3 Identity & Security Services

| Service | Status | Gap |
|---------|--------|-----|
| **VPC Service Controls** | ❌ NOT CONFIGURED | No data exfiltration protection |
| **Cloud DLP** | ❌ NOT CONFIGURED | No sensitive data scanning |
| **Binary Authorization** | ⚠️ ENABLED (default) | Not actively used for GKE/Cloud Run |
| **Security Command Center** | ❌ NOT CONFIGURED | No security insights |
| **Cloud IAM Conditions** | ❌ NOT USED | No time-based or resource-based access controls |

---

## 2. IAM AND SECURITY GAPS

### 2.1 Service Account Analysis

| Service Account | Risk Level | Issues |
|-----------------|------------|--------|
| `650809736894-compute@developer.gserviceaccount.com` | 🔴 **CRITICAL** | Default compute SA with `roles/editor` - overly permissive |
| `zaplit-website-prod@appspot.gserviceaccount.com` | 🟡 MEDIUM | App Engine default with broad permissions |
| `nextjs-sa@zaplit-website-prod.iam.gserviceaccount.com` | 🟢 LOW | Properly scoped to run.invoker, logWriter |
| `twenty-app@zaplit-website-prod.iam.gserviceaccount.com` | 🟢 LOW | Properly scoped to required services |
| `n8n-sa@zaplit-website-prod.iam.gserviceaccount.com` | 🟢 LOW | Properly scoped to required services |

### 2.2 Critical IAM Findings

#### 🔴 CRITICAL: Default Compute Service Account Over-Permissioned

```yaml
# Current binding - HIGH RISK
members:
  - serviceAccount:650809736894-compute@developer.gserviceaccount.com
role: roles/editor  # Can modify ANY resource in project
```

**Risk:** Any VM running as this SA can:
- Delete any resource in the project
- Access all storage buckets
- Modify IAM policies
- Access all secrets (if granted)

**Recommendation:** 
1. Create dedicated service accounts for each VM workload
2. Migrate VMs to use workload-specific SAs
3. Remove `roles/editor` from default compute SA

#### 🔴 CRITICAL: User with Owner Role

```yaml
members:
  - user:hello@freshcredit.com
role: roles/owner
```

**Risk:** Individual user has unrestricted access to all project resources

**Recommendation:**
1. Migrate to group-based access control
2. Use `roles/viewer` or `roles/editor` with conditions for daily operations
3. Reserve `roles/owner` for break-glass emergency accounts

### 2.3 Missing Security Controls

| Control | Status | Impact |
|---------|--------|--------|
| **OS Login** | ✅ ENABLED | Good - centralized SSH key management |
| **Shielded VMs** | ⚠️ PARTIAL | Integrity monitoring enabled, Secure Boot disabled |
| **VPC Flow Logs** | ❌ NOT CONFIGURED | No network traffic visibility |
| **Packet Mirroring** | ❌ NOT CONFIGURED | No IDS/IPS capability |
| **Firewall Rules Audit** | ⚠️ NEEDED | Multiple overlapping rules exist |

### 2.4 Firewall Rules Analysis

```
Current Rules (12 total):
- allow-hestia-mail: Mail ports open to internet (25, 587, 465, 993, 995, 8083)
- allow-http: Port 80 open to internet
- allow-https: Port 443 open to internet  
- allow-n8n: Port 5678 open to internet (n8n webhook/UI)
- allow-twenty-crm: Ports 3000, 80, 443 open
- default-allow-ssh: Port 22 open to internet (0.0.0.0/0)
```

**Issues:**
1. 🔴 SSH (port 22) open to entire internet - brute force risk
2. 🔴 n8n port 5678 directly exposed (should be behind LB with OAuth)
3. 🟡 No egress firewall rules defined (full outbound access)

---

## 3. MONITORING AND ALERTING GAPS

### 3.1 Current Monitoring State

| Component | Status | Configuration |
|-----------|--------|---------------|
| **Cloud Monitoring** | ⚠️ PARTIAL | 1 uptime check only |
| **Alerting Policies** | ❌ NONE CONFIGURED | No automated alerts |
| **Custom Dashboards** | ❌ NONE | No operational visibility |
| **Notification Channels** | ✅ EXISTS | 1 email channel (hello@zaplit.com) |

### 3.2 Uptime Check Coverage

| Service | Uptime Check | Status |
|---------|--------------|--------|
| zaplit-com (Cloud Run) | ✅ YES | /api/health endpoint monitored |
| zaplit-org (Cloud Run) | ❌ NO | No monitoring |
| n8n-service (Cloud Run) | ❌ NO | No monitoring |
| n8n-server (VM) | ❌ NO | No monitoring |
| twenty-crm-vm (VM) | ❌ NO | No monitoring |
| hestia-mail (VM) | ❌ NO | No monitoring |
| twenty-postgres (Cloud SQL) | ❌ NO | No monitoring |
| twenty-redis (Memorystore) | ❌ NO | No monitoring |

**Coverage: 12.5% (1 of 8 critical services)**

### 3.3 Critical Missing Alerts

| Alert Type | Priority | Reason |
|------------|----------|--------|
| VM CPU > 80% for 5min | 🔴 CRITICAL | No infrastructure alerting |
| VM Disk > 90% full | 🔴 CRITICAL | Risk of service failure |
| Cloud SQL connections exhausted | 🔴 CRITICAL | Application downtime |
| Redis memory full | 🟠 HIGH | Cache eviction issues |
| Failed login attempts > 10/min | 🟠 HIGH | Security incident indicator |
| Cloud Run error rate > 5% | 🟠 HIGH | Service degradation |
| SSL certificate expiry < 30 days | 🟠 HIGH | Service disruption risk |
| Billing threshold exceeded | 🟡 MEDIUM | Cost control |

### 3.4 Log Management Gaps

| Component | Status | Issue |
|-----------|--------|-------|
| **Log Sinks** | ⚠️ DEFAULT ONLY | Only _Required and _Default buckets |
| **Log Export to BigQuery** | ❌ NOT CONFIGURED | No long-term log analysis |
| **Log-based Metrics** | ❌ NOT CONFIGURED | No custom metric creation |
| **Error Reporting** | ⚠️ DEFAULT | Not actively monitored |

### 3.5 Prometheus/Grafana Status

Configuration exists in `/monitoring/` directory but **NOT DEPLOYED**:
- `alert-rules.yml` - 77 lines of alert definitions
- `prometheus.yml` - Configuration present
- Grafana dashboards documented in runbooks

**Gap:** Local monitoring stack documented but not operational in GCP

---

## 4. BACKUP AND DISASTER RECOVERY GAPS

### 4.1 Backup Status Matrix

| Resource | Automated Backup | Snapshots | RTO Target | RPO Target | Status |
|----------|------------------|-----------|------------|------------|--------|
| **n8n-server VM** | ❌ NONE | ❌ NONE | Runbook: 2hr | Runbook: 24hr | 🔴 CRITICAL |
| **twenty-crm-vm** | ❌ NONE | ❌ NONE | Undefined | Undefined | 🔴 CRITICAL |
| **hestia-mail VM** | ❌ NONE | ❌ NONE | Undefined | Undefined | 🔴 CRITICAL |
| **twenty-postgres** | ✅ YES | N/A | < 1hr | 24hr | 🟢 GOOD |
| **twenty-redis** | ❌ NONE | N/A | Undefined | Undefined | 🟠 HIGH |
| **Cloud Run services** | ❌ NONE | N/A | Manual redeploy | Last deployment | 🟡 MEDIUM |

### 4.2 Cloud SQL Backup Details

```
Instance: twenty-postgres
Automated Backups: ✅ ENABLED
Backup Window: 03:00 UTC
Retention: 7 days (default)
Recent Backups:
  - 2026-03-21: SUCCESSFUL
  - 2026-03-20: SUCCESSFUL
  - 2026-03-19: SUCCESSFUL

High Availability: REGIONAL (same region, different zone)
Cross-region replication: ❌ NOT CONFIGURED
```

### 4.3 Critical DR Findings

#### 🔴 CRITICAL: Zero VM Snapshots

```bash
gcloud compute snapshots list
# Result: Listed 0 items
```

**Impact:** Any VM failure requires complete rebuild from scratch
**Recovery Time:** 2+ hours (if runbook followed) vs 15 minutes (with snapshots)

#### 🔴 CRITICAL: Missing Backup GCS Bucket

Runbook RB-DR-001 references `gs://zaplit-n8n-backups/` but:
```bash
gcloud storage ls | grep n8n-backups
# Result: Not found
```

#### 🟠 HIGH: No Snapshot Resource Policies

```bash
gcloud compute resource-policies list
# Result: Listed 0 items
```

No automated snapshot schedules exist for any VM.

#### 🟠 HIGH: Redis No Persistence

```
twenty-redis:
  Persistence Mode: DISABLED
  RDB Snapshots: DISABLED
  AOF: DISABLED
  
  Impact: Cache loss on restart/reboot
```

### 4.4 Recovery Capability Assessment

| Scenario | Current Capability | Target | Gap |
|----------|-------------------|--------|-----|
| Single VM failure | 🔴 MANUAL REBUILD | Automated failover | HIGH |
| Zone failure | 🔴 NO PROTECTION | Multi-zone deployment | HIGH |
| Database corruption | 🟡 POINT-IN-TIME RECOVERY | 15 min RTO | MEDIUM |
| Complete project loss | 🔴 NO CROSS-REGION DR | Cross-region replication | HIGH |
| n8n data loss | 🔴 NO BACKUPS | Daily backups | CRITICAL |

---

## 5. COST OPTIMIZATION GAPS

### 5.1 Current Resource Inventory

| Resource | Type | Monthly Est. | Optimization Potential |
|----------|------|--------------|------------------------|
| n8n-server | e2-medium (non-preemptible) | ~$25 | Use E2-small or preemptible |
| twenty-crm-vm | e2-standard-4 (non-preemptible) | ~$97 | Right-size based on usage |
| hestia-mail | e2-medium + pd-standard | ~$30 | Consider smaller disk |
| twenty-postgres | db-perf-optimized-N-2 | ~$150 | Monitor for right-sizing |
| twenty-redis | BASIC tier, 5GB | ~$25 | Consider Standard HA for prod |
| Cloud Run (4 services) | Variable | ~$20-50 | Add min-instance limits |
| Reserved Static IP | Unused | ~$7 | **DELETE unused IP** |

**Estimated Monthly Waste: $50-100**

### 5.2 Specific Cost Issues

#### 🔴 UNUSED RESERVED IP
```
Name: zaplit-static-ip
Address: 34.120.3.24
Status: RESERVED (not attached to any resource)
Cost: ~$7/month
Action: DELETE immediately
```

#### 🟠 PREMIUM NETWORK TIER DEFAULT
```
Current: PREMIUM (default for all traffic)
Recommendation: Use STANDARD tier for non-latency-sensitive traffic
Savings: ~20-30% on egress costs
```

#### 🟠 NO COMMITTED USE DISCOUNTS
- No 1-year or 3-year commitments on sustained workloads
- n8n-server and twenty-crm-vm are long-running

#### 🟡 STORAGE CLASS OPTIMIZATION
```
Bucket: gs://zaplit-website-prod
Current Class: Standard (default)
Objects: ~206 files
Recommendation: Implement lifecycle policy for older objects
```

### 5.3 Preemptible Instance Opportunities

| VM | Workload Type | Preemptible Suitable | Savings |
|----|---------------|---------------------|---------|
| n8n-server | Automation platform | ⚠️ PARTIAL (use with managed instance group) | 60-80% |
| twenty-crm-vm | CRM application | ❌ NO (needs high availability) | - |
| hestia-mail | Mail server | ❌ NO (needs constant availability) | - |

---

## 6. ADDITIONAL INFRASTRUCTURE GAPS

### 6.1 Cloud Run Issues

| Service | Status | Issue |
|---------|--------|-------|
| twenty-server | 🔴 **FAILED** | Container fails to start - port 3000 timeout |
| n8n-service | ✅ HEALTHY | Running normally |
| zaplit-com | ✅ HEALTHY | Running normally |
| zaplit-org | ✅ HEALTHY | Running normally |

**Failed Service Details:**
```
twenty-server:
  Status: False (Not Ready)
  Message: Container failed to start and listen on PORT=3000
  Logs: Check Cloud Logging for startup errors
```

### 6.2 SSL Certificate Issues

```
Certificates: 3 total
  ✅ zaplit-cert-v2: ACTIVE (www.zaplit.com, zaplit.com)
  ✅ zaplit-cert-v3: ACTIVE (zaplit.com)
  ⚠️ zaplit-ssl-cert: PROVISIONING FAILED (zaplit.com: FAILED_NOT_VISIBLE)
```

**Issue:** One certificate stuck in provisioning state (zaplit-ssl-cert)

### 6.3 Artifact Registry Cleanup

| Repository | Size (MB) | Last Updated | Action |
|------------|-----------|--------------|--------|
| gae-flexible | 436 | 2026-03-18 | Review if needed |
| twenty-crm | 348 | 2026-03-18 | Active |
| cloud-run-source-deploy | 236 | 2026-03-18 | Review old images |
| zaplit-com | 71 | 2026-03-18 | Active |
| zaplit-repo | 0 | - | Empty - delete? |
| gae-standard | 0 | - | Empty - delete? |

---

## 7. PRIORITIZED RECOMMENDATIONS

### Immediate Actions (This Week)

| Priority | Action | Owner | Effort |
|----------|--------|-------|--------|
| P0 | Delete unused reserved IP (34.120.3.24) | DevOps | 5 min |
| P0 | Remove `zaplit-ssl-cert` (failed provisioning) | DevOps | 5 min |
| P0 | Fix twenty-server Cloud Run deployment | Engineering | 2 hrs |
| P0 | Restrict SSH firewall rule (limit source ranges) | Security | 30 min |
| P0 | Create VM snapshot schedule (daily) | DevOps | 1 hr |

### Short-term (Next 2 Weeks)

| Priority | Action | Owner | Effort |
|----------|--------|-------|--------|
| P1 | Create dedicated service accounts for each VM | Security | 2 hrs |
| P1 | Remove `roles/editor` from default compute SA | Security | 1 hr |
| P1 | Set up Cloud Monitoring alerting policies (CPU, Disk, Memory) | DevOps | 4 hrs |
| P1 | Create uptime checks for all critical services | DevOps | 2 hrs |
| P1 | Enable Redis persistence (RDB) | DevOps | 1 hr |
| P1 | Create backup GCS bucket for n8n | DevOps | 30 min |

### Medium-term (Next Month)

| Priority | Action | Owner | Effort |
|----------|--------|-------|--------|
| P2 | Deploy Cloud Load Balancer with Cloud Armor | DevOps | 8 hrs |
| P2 | Implement VPC Flow Logs | Security | 2 hrs |
| P2 | Set up log export to BigQuery | DevOps | 2 hrs |
| P2 | Create custom monitoring dashboards | DevOps | 4 hrs |
| P2 | Implement storage lifecycle policies | DevOps | 1 hr |
| P2 | Evaluate committed use discounts for sustained workloads | Finance | 2 hrs |

### Long-term (Next Quarter)

| Priority | Action | Owner | Effort |
|----------|--------|-------|--------|
| P3 | Implement multi-zone deployment for HA | Architecture | 2 weeks |
| P3 | Set up cross-region replication for Cloud SQL | DBA | 1 week |
| P3 | Deploy Cloud CDN for static assets | DevOps | 4 hrs |
| P3 | Implement Security Command Center | Security | 1 week |
| P3 | Set up automated cost anomaly alerts | Finance | 4 hrs |

---

## 8. SECURITY ISSUES SUMMARY

### Critical Security Risks

1. **Default Compute SA with Editor Role**
   - CVSS Score: 7.5 (High)
   - Impact: Lateral movement, privilege escalation
   - Fix: Create workload-specific SAs with minimal permissions

2. **SSH Open to Internet (0.0.0.0/0)**
   - CVSS Score: 6.5 (Medium)
   - Impact: Brute force attacks
   - Fix: Restrict to bastion host or corporate IP ranges

3. **n8n Directly Exposed on Port 5678**
   - CVSS Score: 6.0 (Medium)
   - Impact: Potential unauthorized access to workflow engine
   - Fix: Put behind load balancer with IAP or OAuth

4. **No VPC Flow Logs**
   - Impact: No network traffic audit trail
   - Fix: Enable VPC Flow Logs on default subnet

### Compliance Considerations

| Control | Status | Compliance Impact |
|---------|--------|-------------------|
| Data encryption at rest | ✅ ENABLED | Cloud SQL, GCS encrypted by default |
| Data encryption in transit | ⚠️ PARTIAL | Verify all services use TLS 1.2+ |
| Access logging | ⚠️ PARTIAL | Admin activity logged, data access not fully covered |
| Network segmentation | ❌ MISSING | All services in default VPC |

---

## 9. APPENDIX: GATHERED DATA

### Service Account List
```
1. zaplit-website-prod@appspot.gserviceaccount.com (App Engine default)
2. nextjs-sa@zaplit-website-prod.iam.gserviceaccount.com (Next.js App)
3. twenty-app@zaplit-website-prod.iam.gserviceaccount.com (Twenty CRM)
4. 650809736894-compute@developer.gserviceaccount.com (Default Compute)
5. n8n-sa@zaplit-website-prod.iam.gserviceaccount.com (n8n)
```

### VM Inventory
```
NAME           ZONE           MACHINE_TYPE    INTERNAL_IP   EXTERNAL_IP    DISK
hestia-mail    us-central1-a  e2-medium       10.128.0.11   136.113.99.87  pd-standard, 20GB
n8n-server     us-central1-a  e2-medium       10.128.0.9    34.132.198.35  pd-ssd, 50GB
twenty-crm-vm  us-central1-a  e2-standard-4   10.128.0.10   34.122.83.0    pd-ssd, 50GB
```

### Cloud Run Services
```
SERVICE        STATUS  URL
n8n-service    ✔       https://n8n-service-650809736894.us-central1.run.app
twenty-server  ✘       FAILED (container won't start)
zaplit-com     ✔       https://zaplit-com-650809736894.us-central1.run.app
zaplit-org     ✔       https://zaplit-org-650809736894.us-central1.run.app
```

### Storage Buckets
```
gs://run-sources-zaplit-website-prod-us-central1/
gs://staging.zaplit-website-prod.appspot.com/
gs://zaplit-website-prod/
gs://zaplit-website-prod-twenty-files/
gs://zaplit-website-prod.appspot.com/
gs://zaplit-website-prod_cloudbuild/
```

---

## 10. NEXT STEPS

1. **Schedule Review Meeting** - Present findings to stakeholders
2. **Create Action Items** - Convert recommendations to JIRA/GitHub issues
3. **Assign Ownership** - Designate owners for each priority level
4. **Set Timeline** - Establish deadlines for critical fixes
5. **Re-audit Schedule** - Plan follow-up review in 3 months

---

*Report generated: 2026-03-20*
*Project: zaplit-website-prod (650809736894)*
*Analysis scope: Compute, Storage, Networking, IAM, Monitoring, Security, Cost*
