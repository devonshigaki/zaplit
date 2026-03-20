# Hestia Mail Server - Monitoring, Logging & Alerting Audit Report

**Audit Date:** March 20, 2026  
**Server:** hestia-mail (us-central1-a, zaplit-website-prod)  
**Hostname:** mail.zaplit.com  
**OS:** Ubuntu 22.04 LTS (6.8.0-1048-gcp)  
**Hestia Version:** 1.9.4

---

## Executive Summary

The Hestia mail server has **basic monitoring and logging** in place through standard Ubuntu components and Hestia's built-in features, but has **significant gaps** in proactive alerting, centralized log aggregation, and comprehensive health monitoring. The server is newly deployed (March 20, 2026) with minimal mail traffic, making this an ideal time to implement proper monitoring before production load increases.

**Overall Assessment:** ⚠️ **NEEDS IMPROVEMENT**
- Core logging: ✅ Functional
- Log rotation: ✅ Configured
- Basic security: ✅ Fail2ban active
- Proactive monitoring: ❌ Missing
- Alerting: ❌ Not configured
- Backup monitoring: ❌ No backups configured
- Centralized logging: ❌ Not implemented

---

## 1. Current Monitoring Coverage

### 1.1 Log Rotation Configuration ✅

| Log Type | Rotation Policy | Status |
|----------|----------------|--------|
| Exim mainlog/rejectlog | Daily, 10 rotations, compressed | ✅ |
| Exim paniclog | Size-based (10M), 10 rotations | ✅ |
| Dovecot logs | Weekly, 4 rotations, compressed | ✅ |
| System logs (rsyslog) | Weekly, 4 rotations | ✅ |
| Hestia logs | Configured | ✅ |
| ClamAV logs | Built-in rotation | ✅ |

**Key Findings:**
- Logrotate runs daily via systemd timer (logrotate.timer)
- Compression is enabled but `delaycompress` may delay immediate space savings
- No log shipping to external systems configured

### 1.2 Disk Space Monitoring ⚠️

**Current State:**
```
Filesystem      Size  Used Avail Use% Mounted on
/dev/root        20G  4.1G   16G  21%
```

**What Exists:**
- Basic disk usage tracking via Hestia's `disk.pipe` queue
- `sysstat` (sar) installed and collecting data every 10 minutes
- Hestia updates user disk usage via cron

**What's Missing:**
- No proactive disk space alerts
- No monitoring of `/var/spool/exim4` queue directory growth
- No inode usage monitoring
- No threshold-based alerting

### 1.3 Service Health Monitoring ⚠️

**Running Services (32 total):**
| Service | Status | Monitored By |
|---------|--------|--------------|
| exim4 | ✅ Running | systemd |
| dovecot | ✅ Running | systemd |
| spamassassin | ✅ Running | systemd |
| clamav-daemon | ✅ Running | systemd |
| fail2ban | ✅ Running | systemd |
| nginx | ✅ Running | systemd |
| apache2 | ✅ Running | systemd |
| mariadb | ✅ Running | systemd |
| hestia | ✅ Running | systemd |

**Monit Configuration:**
- Monit is **partially installed** but **NOT running**
- Only has fail2ban monitoring config in `/etc/monit/monitrc.d/`
- Monit service not enabled/started

**What's Missing:**
- No service restart on failure
- No health check endpoints
- No HTTP endpoint monitoring for webmail/control panel

### 1.4 Mail Queue Monitoring ❌

**Current Queue Status:**
```
1 frozen message in queue
ID: 1w3Swh-000FBI-AP
From: noreply@mail.zaplit.com
Age: 16 minutes
Status: Frozen (bounce with no valid recipient)
```

**What's Missing:**
- No automated queue size alerts
- No frozen message alerts
- No deferred message rate monitoring
- No retry queue monitoring

### 1.5 Failed Login Attempt Monitoring ✅

**Fail2ban Jails (7 active):**
| Jail | Log File | Banned IPs |
|------|----------|------------|
| ssh-iptables | /var/log/auth.log | 0 |
| exim-iptables | /var/log/exim4/mainlog | 0 |
| dovecot-iptables | /var/log/dovecot.log | 0 |
| hestia-iptables | /var/log/hestia/auth.log | 0 |
| vsftpd-iptables | /var/log/vsftpd.log | 0 |
| phpmyadmin-auth | /var/log/auth.log | 0 |
| recidive | /var/log/fail2ban.log | 0 |

**Security Status:**
- All fail2ban jails are operational but have **not yet triggered** (new server)
- No suspicious auth attempts detected in logs
- SSH only accepting key-based authentication

### 1.6 Log Aggregation ❌

**Current State:**
- rsyslog running locally
- No remote log shipping configured
- No centralized logging (no ELK, Loki, or similar)
- No Cloud Logging integration

**Log Locations:**
```
/var/log/exim4/mainlog      - Exim main log
/var/log/dovecot.log        - Dovecot IMAP/POP3 log
/var/log/mail.log           - General mail log
/var/log/mail.err           - Mail errors
/var/log/hestia/            - Hestia control panel logs
/var/log/fail2ban.log       - Fail2ban activity
/var/log/clamav/            - Antivirus logs
```

### 1.7 Mail Statistics ❌

**Current State:**
- Exim logs are written but not processed
- eximstats tool is installed but NOT configured for daily reports
- No dashboard or metrics collection

**Exim Daily Report Config:**
```bash
# In /etc/cron.daily/exim4-base
E4BCD_DAILY_REPORT_TO=""  # <-- NOT CONFIGURED
E4BCD_WATCH_PANICLOG="yes"  # Panic log monitoring enabled
```

**What's Missing:**
- No delivery success/failure rate tracking
- No spam/ham ratio monitoring
- No queue latency metrics
- No TLS connection statistics

### 1.8 Backup Status ❌

**Current State:**
- Hestia backup system configured for local storage
- **NO BACKUPS HAVE BEEN RUN** (new server)
- Backup directory `/backup/` exists but is empty
- User `zaplitadmin` has 0 backups

**Configuration:**
```
BACKUP_SYSTEM='local'
BACKUP_MODE='zstd'
BACKUP_GZIP='4'
BACKUP_INCREMENTAL='no'
```

**Critical Finding:**
- No offsite backup configured
- No backup success/failure monitoring
- No backup schedule configured in user's backup.conf

### 1.9 Resource Utilization Monitoring ⚠️

**Current Tools:**
- sysstat (sar) - Collects CPU, memory, I/O every 10 minutes
- iostat - Available for disk I/O
- vmstat - Available

**Resource Status:**
```
CPU: 2 cores, load average: 0.18
Memory: 3.8GB total, 1.4GB used (37%), 2.1GB available
Disk: 20GB total, 4.1GB used (21%)
Swap: 0B (not configured)
```

**What's Missing:**
- No real-time alerting on high CPU/memory
- No swap monitoring (swap is disabled)
- No network bandwidth monitoring
- No disk I/O latency alerting

### 1.10 Alert Mechanisms ❌

**Current State:**
- Email aliases configured but NOT delivered (root -> root)
- Exim paniclog will email root if non-zero
- No Slack, PagerDuty, or external alerting
- `FROM_EMAIL` and `FROM_NAME` not set in Hestia config

**Alert Destination:**
```
E4BCD_PANICLOG_REPORT_TO=root  # Only panic log alerts
root: root  # Mail loops back to system
```

---

## 2. Blind Spots - What's NOT Being Monitored

### Critical Blind Spots 🚨

| # | Blind Spot | Risk Level | Impact |
|---|------------|------------|--------|
| 1 | **Backup failures** | HIGH | Data loss without notification |
| 2 | **Mail queue growth** | HIGH | Undelivered mail accumulation |
| 3 | **SSL certificate expiry** | HIGH | Mail services will fail |
| 4 | **DNSBL/RBL listing** | HIGH | Outbound mail blocked |
| 5 | **Disk space alerts** | HIGH | Services crash when full |
| 6 | **Service crash/restart** | MEDIUM | Downtime without notification |
| 7 | **ClamAV database age** | MEDIUM | Missed virus detection |
| 8 | **SpamAssassin rule updates** | MEDIUM | Reduced spam detection |
| 9 | **Mail delivery latency** | MEDIUM | Poor user experience |
| 10 | **Authentication anomaly** | MEDIUM | Potential security breach |
| 11 | **SMTP TLS failures** | LOW | Security degradation |
| 12 | **Greylisting effectiveness** | LOW | Delivery delays |

### Log Analysis Gaps

| Log Type | Current | Needed |
|----------|---------|--------|
| Exim mainlog | Raw logs only | Parsing for trends |
| Dovecot logs | Raw logs only | Auth failure analysis |
| Hestia auth | Empty (new server) | Brute force detection |
| Spam/virus ratio | Not calculated | Daily/weekly reports |
| Bounce analysis | Manual only | Automated categorization |

---

## 3. Log Management Issues

### 3.1 Identified Issues

| Issue | Severity | Description |
|-------|----------|-------------|
| Journal size limit | ⚠️ Medium | 24MB current, no retention limits set |
| No log shipping | ⚠️ Medium | Logs stay local only |
| Exim frozen message | 🔴 High | Message stuck in queue for 16+ minutes |
| No log analysis | ⚠️ Medium | Logs written but not analyzed |
| Mail delivery failure | 🔴 High | Cannot deliver to admin@zaplit.com |

### 3.2 Log Storage Summary

```
Total journal size:    24.0M
/var/log/syslog:       524K
/var/log/auth.log:     252K
/var/log/exim4:        4.0K (new server)
/var/log/dovecot.log:  4.0K (new server)
/var/log/hestia:       76K
```

### 3.3 Frozen Message Analysis

```
Problem: Bounce message has no valid return path
Cause: SMTP configuration issue with unauthenticated relay
Impact: Mail queue growing, disk usage increasing
Action: Fix SMTP relay configuration
```

---

## 4. Missing Alerts - What Should Be Implemented

### 4.1 Critical Alerts (Immediate)

```yaml
alerts:
  - name: disk_space_critical
    condition: disk_usage > 85%
    action: email+slack
    
  - name: mail_queue_backlog
    condition: queue_size > 100 OR frozen_messages > 10
    action: email
    
  - name: exim_paniclog
    condition: paniclog_size > 0
    action: email (already configured but destination needs fixing)
    
  - name: service_down
    condition: exim4 or dovecot not running
    action: email+restart_attempt
    
  - name: backup_failure
    condition: backup_exit_code != 0
    action: email
    
  - name: ssl_expiry
    condition: cert_expires_in < 14_days
    action: email (weekly until resolved)
```

### 4.2 Warning Alerts (Important)

```yaml
alerts:
  - name: disk_space_warning
    condition: disk_usage > 70%
    action: email
    
  - name: high_load
    condition: load_avg_5m > 4.0 (for 2-core system)
    action: email
    
  - name: memory_pressure
    condition: available_memory < 500MB
    action: email
    
  - name: clamav_stale
    condition: virus_db_age > 24h
    action: email
    
  - name: fail2ban_ban_rate
    condition: bans_per_hour > 10
    action: email (potential attack)
```

### 4.3 Informational Alerts (Nice to Have)

```yaml
alerts:
  - name: daily_mail_summary
    condition: daily at 06:00
    action: email with delivery stats
    
  - name: weekly_security_report
    condition: weekly on Monday
    action: email with auth attempts/fail2ban summary
```

---

## 5. Recommended Monitoring Setup

### 5.1 Immediate Actions (Week 1)

1. **Fix Alert Routing**
   ```bash
   # Configure proper email destination
   sudo sed -i 's/^root:.*$/root: admin@yourdomain.com/' /etc/aliases
   sudo newaliases
   
   # Set Hestia notification email
   sudo sed -i "s/FROM_EMAIL=''/FROM_EMAIL='alerts@mail.zaplit.com'/" /usr/local/hestia/conf/hestia.conf
   ```

2. **Enable Monit for Service Monitoring**
   ```bash
   sudo apt install -y monit
   # Configure monit for exim, dovecot, mysql, nginx
   sudo systemctl enable --now monit
   ```

3. **Create Mail Queue Monitor Script**
   ```bash
   #!/bin/bash
   # /usr/local/bin/check-mail-queue.sh
   QUEUE_SIZE=$(exim -bpc)
   if [ "$QUEUE_SIZE" -gt 100 ]; then
     echo "Mail queue backlog: $QUEUE_SIZE messages" | mail -s "Mail Queue Alert" root
   fi
   ```

4. **Fix Frozen Message**
   ```bash
   # Investigate and clear frozen message
   sudo exim -Mvl 1w3Swh-000FBI-AP  # View log
   sudo exim -Mrm 1w3Swh-000FBI-AP  # Remove if needed
   ```

### 5.2 Short-term Improvements (Weeks 2-4)

1. **Install Cloud Monitoring Agent**
   ```bash
   curl -sSO https://dl.google.com/cloudagents/add-google-cloud-ops-agent-repo.sh
   sudo bash add-google-cloud-ops-agent-repo.sh --also-install
   ```

2. **Configure Log Shipping to Cloud Logging**
   ```yaml
   # /etc/google-cloud-ops-agent/config.yaml
   logging:
     receivers:
       exim:
         type: files
         include_paths:
           - /var/log/exim4/mainlog
           - /var/log/exim4/rejectlog
     service:
       pipelines:
         default_pipeline:
           receivers: [exim, syslog]
   ```

3. **Set Up Backup Monitoring**
   ```bash
   # Add to Hestia's backup pipe
   echo "/usr/local/hestia/bin/v-backup-user zaplitadmin && echo 'Backup completed' | mail -s 'Backup Status' root" | sudo tee -a /usr/local/hestia/data/queue/backup.pipe
   ```

4. **Create Disk Space Alert Script**
   ```bash
   #!/bin/bash
   # /usr/local/bin/disk-alert.sh
   USAGE=$(df / | awk 'NR==2 {print $5}' | sed 's/%//')
   if [ "$USAGE" -gt 85 ]; then
     echo "Disk usage critical: ${USAGE}%" | mail -s "DISK ALERT" root
   elif [ "$USAGE" -gt 70 ]; then
     echo "Disk usage warning: ${USAGE}%" | mail -s "DISK WARNING" root
   fi
   ```

### 5.3 Long-term Architecture (Month 2+)

1. **Deploy Prometheus + Grafana**
   - Node exporter for system metrics
   - Custom exporter for Exim stats
   - Dovecot metrics
   - Dashboard for mail flow visualization

2. **Implement Centralized Logging**
   - Loki or ELK stack
   - Log aggregation from all mail components
   - Alerting based on log patterns

3. **External Monitoring**
   - SMTP monitoring from external location
   - Blacklist monitoring (MxToolbox API)
   - SSL certificate expiry monitoring
   - Mail delivery testing (send/receive probes)

4. **Backup Strategy**
   - Automated daily backups to GCS
   - Offsite backup verification
   - Recovery testing schedule

---

## 6. Configuration Files Summary

### Key Configuration Files

| File | Purpose | Status |
|------|---------|--------|
| `/etc/logrotate.conf` | Main log rotation config | ✅ Default Ubuntu |
| `/etc/logrotate.d/exim4-base` | Exim log rotation | ✅ Daily, compressed |
| `/etc/logrotate.d/dovecot` | Dovecot log rotation | ✅ Weekly, compressed |
| `/etc/fail2ban/jail.local` | Fail2ban jails | ✅ 7 jails active |
| `/etc/default/exim4` | Exim daemon config | ✅ Combined mode |
| `/usr/local/hestia/conf/hestia.conf` | Hestia settings | ⚠️ Missing FROM_EMAIL |
| `/etc/monit/monitrc.d/fail2ban` | Monit config | ⚠️ Monit not running |
| `/etc/systemd/journald.conf` | Journal settings | ⚠️ No size limits |

### Cron Jobs Summary

| Schedule | Command | Purpose |
|----------|---------|---------|
| Every 10 min | `debian-sa1` | System stats collection |
| Hourly | `run-parts /etc/cron.hourly` | Hourly tasks |
| Daily 06:25 | `run-parts /etc/cron.daily` | Daily tasks including logrotate |
| Daily | `exim4-base` | Exim panic log check |
| Daily | `spamassassin` | Rule updates (disabled - CRON=0) |
| Weekly 06:47 | `run-parts /etc/cron.weekly` | Weekly tasks |
| Monthly 06:52 | `run-parts /etc/cron.monthly` | Monthly tasks |

---

## 7. Risk Assessment

| Risk | Likelihood | Impact | Mitigation Priority |
|------|------------|--------|---------------------|
| Disk full (no alerts) | Medium | HIGH | 🔴 P0 - Immediate |
| Backup failure unnoticed | Medium | HIGH | 🔴 P0 - Immediate |
| SSL cert expiry | Low | HIGH | 🟡 P1 - Week 1 |
| Queue backlog | Medium | MEDIUM | 🟡 P1 - Week 1 |
| Service crash unnoticed | Low | MEDIUM | 🟡 P1 - Week 1 |
| Security breach unnoticed | Low | HIGH | 🟡 P1 - Week 1 |
| Mail delivery issues | Medium | MEDIUM | 🟡 P1 - Week 1 |
| ClamAV rules stale | Medium | MEDIUM | 🟢 P2 - Month 1 |
| No log analysis | High | LOW | 🟢 P2 - Month 1 |

---

## 8. Action Items Checklist

### Week 1 - Critical
- [ ] Configure root email alias to external address
- [ ] Set Hestia FROM_EMAIL config
- [ ] Enable and configure Monit
- [ ] Create disk space alert script
- [ ] Create mail queue monitor script
- [ ] Fix frozen message in queue
- [ ] Test alert delivery

### Week 2-4 - Important
- [ ] Install Google Cloud Ops Agent
- [ ] Configure backup schedule
- [ ] Create backup monitoring script
- [ ] Set up ClamAV update monitoring
- [ ] Implement log shipping to Cloud Logging
- [ ] Create SSL expiry monitoring

### Month 2+ - Enhancements
- [ ] Deploy Prometheus + Grafana
- [ ] Set up external SMTP monitoring
- [ ] Implement blacklist monitoring
- [ ] Create comprehensive dashboards
- [ ] Document runbooks for alerts

---

## 9. Monitoring Script Templates

### Template 1: Comprehensive Health Check
```bash
#!/bin/bash
# /usr/local/bin/hestia-health-check.sh

ALERT_EMAIL="admin@zaplit.com"
HOSTNAME=$(hostname)
ALERTS=()

# Check disk space
DISK_USAGE=$(df / | awk 'NR==2 {print $5}' | sed 's/%//')
if [ "$DISK_USAGE" -gt 85 ]; then
  ALERTS+=("DISK CRITICAL: ${DISK_USAGE}% used")
fi

# Check mail queue
QUEUE_SIZE=$(exim -bpc)
if [ "$QUEUE_SIZE" -gt 100 ]; then
  ALERTS+=("MAIL QUEUE: $QUEUE_SIZE messages")
fi

# Check services
for service in exim4 dovecot fail2ban mariadb nginx; do
  if ! systemctl is-active --quiet "$service"; then
    ALERTS+=("SERVICE DOWN: $service")
  fi
done

# Send consolidated alert
if [ ${#ALERTS[@]} -gt 0 ]; then
  printf "%s\n" "${ALERTS[@]}" | mail -s "[$HOSTNAME] Health Check Alert" "$ALERT_EMAIL"
fi
```

### Template 2: Daily Mail Report
```bash
#!/bin/bash
# /usr/local/bin/daily-mail-report.sh

EMAIL="admin@zaplit.com"
HOSTNAME=$(hostname)
DATE=$(date +%Y-%m-%d)

# Gather stats
QUEUE_SIZE=$(exim -bpc)
FROZEN_COUNT=$(exim -bp | grep -c frozen || echo 0)
MAIL_VOLUME=$(grep -c "<= " /var/log/exim4/mainlog || echo 0)
AUTH_FAILURES=$(grep -c "authentication failed" /var/log/dovecot.log || echo 0)
BANS=$(grep -c "Ban" /var/log/fail2ban.log || echo 0)

cat <<EOF | mail -s "[$HOSTNAME] Daily Mail Report - $DATE" "$EMAIL"
Mail Server Daily Summary
=========================
Host: $HOSTNAME
Date: $DATE

Queue Status:
  - Total messages: $QUEUE_SIZE
  - Frozen messages: $FROZEN_COUNT

Activity:
  - Messages received: $MAIL_VOLUME
  - Auth failures: $AUTH_FAILURES
  - IPs banned: $BANS

Disk Usage:
$(df -h /)
EOF
```

---

## Appendix A: Commands Reference

```bash
# Check mail queue
sudo exim -bpc                    # Queue count
sudo exim -bp                     # Queue contents
sudo mailq                        # Alternative view

# Check logs
sudo tail -f /var/log/exim4/mainlog
sudo tail -f /var/log/dovecot.log
sudo tail -f /var/log/fail2ban.log

# Check services
sudo systemctl status exim4 dovecot fail2ban

# Check resources
sudo df -h
free -h
sar -u 1 5

# Check fail2ban
sudo fail2ban-client status
sudo fail2ban-client status ssh-iptables

# Force logrotate
sudo logrotate -f /etc/logrotate.conf
```

---

## Appendix B: Log File Locations

```
/var/log/exim4/mainlog          - Exim transactions
/var/log/exim4/rejectlog        - Rejected messages
/var/log/exim4/paniclog         - Exim errors
/var/log/dovecot.log            - IMAP/POP3 activity
/var/log/mail.log               - General mail
/var/log/mail.err               - Mail errors
/var/log/hestia/activity.log    - Hestia actions
/var/log/hestia/auth.log        - Hestia logins
/var/log/hestia/error.log       - Hestia errors
/var/log/fail2ban.log           - Fail2ban actions
/var/log/clamav/clamav.log      - Antivirus
/var/log/clamav/freshclam.log   - AV updates
```

---

**Report Generated:** March 20, 2026  
**Next Audit Recommended:** April 20, 2026 (after monitoring improvements)
