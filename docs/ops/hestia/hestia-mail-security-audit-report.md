# Hestia Mail Server - Network Security Audit Report

**Server:** hestia-mail (mail.zaplit.com)  
**Public IP:** 136.113.99.87  
**Private IP:** 10.128.0.11  
**Audit Date:** March 20, 2026  
**Auditor:** Automated Security Audit  

---

## Executive Summary

The Hestia mail server has a **MODERATE security posture** with both strengths and significant areas for improvement. The server utilizes multiple layers of security including GCP firewall rules, host-based nftables/iptables firewall, and Fail2Ban intrusion prevention. However, several critical security gaps exist that should be addressed immediately.

### Security Rating: 6.5/10

---

## 1. Current Security Posture

### 1.1 Network Architecture

| Component | Status | Details |
|-----------|--------|---------|
| GCP VPC Network | Active | us-central1-a, 10.128.0.0/9 |
| Public IP | Assigned | 136.113.99.87 (NAT) |
| Shielded VM | Partial | Integrity monitoring: ON, Secure Boot: OFF, vTPM: ON |
| OS | Ubuntu 22.04.5 LTS | Kernel 6.8.0-1048-gcp |

### 1.2 Security Layers Present

1. **GCP Cloud Firewall** - First line of defense at VPC level
2. **Host Firewall (nftables/iptables)** - DROP policy on INPUT chain with Fail2Ban chains
3. **Fail2Ban** - 7 active jails monitoring various services
4. **AppArmor** - 49 profiles loaded, 43 in enforce mode
5. **ClamAV** - Anti-virus daemon running
6. **Intrusion Detection** - Limited (no active IDS like Snort/Suricata)

---

## 2. Firewall Configuration Analysis

### 2.1 GCP Firewall Rules

| Rule Name | Direction | Source | Allowed | Risk Level |
|-----------|-----------|--------|---------|------------|
| default-allow-ssh | INGRESS | 71.212.223.191/32 | TCP 22 | ✅ LOW (IP restricted) |
| default-allow-icmp | INGRESS | 0.0.0.0/0 | ICMP | ⚠️ MEDIUM |
| default-allow-internal | INGRESS | 10.128.0.0/9 | TCP/UDP 0-65535 | ✅ LOW (internal only) |
| allow-http | INGRESS | 0.0.0.0/0 | TCP 80 | ✅ ACCEPTABLE (redirects to HTTPS) |
| allow-https | INGRESS | 0.0.0.0/0 | TCP 443 | ✅ ACCEPTABLE (required) |
| allow-twenty-cloud-run | INGRESS | 0.0.0.0/0 | TCP 3000 | 🚨 HIGH (world-accessible) |

**Critical Finding:** Port 3000 (Twenty CRM) is exposed to 0.0.0.0/0 in GCP firewall rules. This should be restricted to Cloud Run service accounts or VPC only.

### 2.2 Host-Based Firewall (nftables/iptables)

**Current Configuration:**
- **INPUT Policy:** DROP (Good)
- **FORWARD Policy:** ACCEPT (Risky for a mail server)
- **OUTPUT Policy:** ACCEPT (Standard)

**Active Chains:**
```
Chain INPUT (policy DROP)
├── fail2ban-WEB     (ports 80,443)   - 118 packets, 18KB
├── fail2ban-HESTIA  (port 8083)      - 0 packets
├── fail2ban-MAIL    (ports 25,465,587,110,995,143,993) - 0 packets
├── fail2ban-FTP     (port 21)        - 0 packets
├── fail2ban-SSH     (port 22)        - 1,706 packets, 320KB
├── fail2ban-RECIDIVE (all ports)     - 5,602 packets, 1.8MB
├── RELATED,ESTABLISHED              - 6,668 packets
└── Explicit ACCEPT rules for each service
```

**Notable Traffic Patterns:**
- fail2ban-RECIDIVE has processed 5,602 packets (1.8MB) - indicates active filtering
- SSH has seen 1,706 packets (moderate usage)
- Web traffic (80/443) shows 118 packets

---

## 3. Fail2Ban Configuration Analysis

### 3.1 Active Jails (7 Total)

| Jail | Status | Max Retry | Find Time | Ban Time | Currently Banned |
|------|--------|-----------|-----------|----------|------------------|
| ssh-iptables | ✅ Active | 5 | 600s | 600s | 0 |
| vsftpd-iptables | ✅ Active | 5 | 600s | 600s | 0 |
| exim-iptables | ✅ Active | Default | Default | 600s | 0 |
| dovecot-iptables | ✅ Active | Default | Default | 600s | 0 |
| hestia-iptables | ✅ Active | 5 | 600s | 600s | 0 |
| phpmyadmin-auth | ✅ Active | 5 | 600s | 600s | 0 |
| recidive | ✅ Active | 5 | 86400s | 864000s (10 days) | 0 |

### 3.2 Security Gaps in Fail2Ban

1. **No IP Whitelist Configured** - The `[DEFAULT] ignoreip` is commented out
2. **Short Ban Times** - 600 seconds (10 minutes) is too short for persistent attackers
3. **No Mail Abuse Jail** - Missing jails for mail abuse patterns
4. **No Web Application Firewall Integration** - No protection against SQL injection, XSS

---

## 4. Open Ports and Services Analysis

### 4.1 Listening Services (TCP)

| Port | Service | Bind Address | Process | Risk Assessment |
|------|---------|--------------|---------|-----------------|
| 21 | FTP | 0.0.0.0 | vsftpd | 🚨 HIGH - Plain text protocol |
| 22 | SSH | 0.0.0.0 | sshd | ✅ LOW - Key auth only |
| 25 | SMTP | 0.0.0.0 | exim4 | ⚠️ MEDIUM - Needs TLS enforcement |
| 80 | HTTP | 10.128.0.11 | nginx | ✅ LOW - Internal only |
| 110 | POP3 | 0.0.0.0 | dovecot | 🚨 HIGH - Plain text, use 995 |
| 143 | IMAP | 0.0.0.0 | dovecot | 🚨 HIGH - Plain text, use 993 |
| 443 | HTTPS | 10.128.0.11 | nginx | ✅ LOW |
| 465 | SMTPS | 0.0.0.0 | exim4 | ✅ LOW |
| 587 | Submission | 0.0.0.0 | exim4 | ⚠️ MEDIUM - Should enforce STARTTLS |
| 783 | SpamAssassin | 127.0.0.1 | spamd | ✅ LOW - Localhost only |
| 995 | POP3S | 0.0.0.0 | dovecot | ✅ LOW |
| 993 | IMAPS | 0.0.0.0 | dovecot | ✅ LOW |
| 3306 | MariaDB | 127.0.0.1 | mariadbd | ✅ LOW - Localhost only |
| 8080 | Apache | 10.128.0.11 | apache2 | ⚠️ MEDIUM - Admin interface? |
| 8081 | Apache | 127.0.0.1 | apache2 | ✅ LOW - Localhost only |
| 8083 | Hestia Panel | 0.0.0.0 | hestia-nginx | 🚨 HIGH - Admin exposed to world |
| 8084 | Nginx | 127.0.0.1 | nginx | ✅ LOW - Localhost only |
| 8443 | Apache | 10.128.0.11 | apache2 | ⚠️ MEDIUM - Check usage |

### 4.2 UDP Ports

| Port | Service | Bind Address | Risk |
|------|---------|--------------|------|
| 53 | systemd-resolve | 127.0.0.53 | ✅ LOW |
| 68 | DHCP Client | 10.128.0.11 | ✅ LOW |
| 123 | NTP (chronyd) | 127.0.0.1 | ✅ LOW |

---

## 5. SSH Security Analysis

### 5.1 Current Configuration

**Positive Security Controls:**
- ✅ `PasswordAuthentication no` - Key-based auth enforced
- ✅ `KbdInteractiveAuthentication no` - No keyboard-interactive auth
- ✅ `UseDNS no` - Prevents DNS-based attacks
- ✅ `ClientAliveInterval 120` - Keeps connections alive, prevents timeouts
- ✅ `PrintMotd no` - Reduces information disclosure
- ✅ `DebianBanner no` - Hides OS version
- ✅ SSH access restricted to 71.212.223.191/32 in GCP firewall

**Negative Security Controls:**
- 🚨 `X11Forwarding yes` - Unnecessary, increases attack surface
- 🚨 `PermitRootLogin` not explicitly set (defaults to prohibit-password)
- 🚨 `MaxAuthTries` using default (6)
- 🚨 `MaxStartups` using default (10:30:100) - No DoS protection
- 🚨 `AllowTcpForwarding` not disabled
- 🚨 `PermitTunnel` not disabled

### 5.2 SSH Authentication

- Only one user has authorized keys: `devonshigaki`
- RSA key fingerprint: SHA256:MekiMDD/PCE0JqcQ9516CQJ69EHvV0ac9mmf2LlKNzU
- No root login keys detected

---

## 6. Rate Limiting and DDoS Protection

### 6.1 Current Kernel Settings

| Setting | Value | Status | Recommendation |
|---------|-------|--------|----------------|
| net.ipv4.tcp_syncookies | 1 | ✅ Good | SYN flood protection enabled |
| net.ipv4.tcp_max_syn_backlog | 256 | ⚠️ Low | Increase to 2048 |
| net.netfilter.nf_conntrack_max | 65536 | ⚠️ Low | Increase to 524288 |
| net.ipv4.icmp_echo_ignore_broadcasts | 1 | ✅ Good | Smurf attack protection |
| net.ipv4.conf.all.rp_filter | 1 | ✅ Good | Spoofing protection |
| net.ipv4.conf.all.accept_source_route | 0 | ✅ Good | No source routing |

### 6.2 Missing DDoS Protections

1. **No connection rate limiting per IP**
2. **No SSH connection throttling**
3. **No SMTP connection rate limiting**
4. **No UDP flood protection**
5. **No ICMP rate limiting**

---

## 7. Port Scan Detection

### 7.1 Current Status

- **No active port scan detection** - No tools like psad or portsentry installed
- **Limited log analysis** - Fail2Ban does not detect port scans
- **RECIDIVE jail** - Only catches repeat offenders, not initial scans

### 7.2 Recommendations

Implement automated port scan detection using:
- `psad` (Port Scan Attack Detector)
- Custom Fail2Ban filters for scan detection
- GCP Cloud Armor for network-level protection

---

## 8. Unauthorized Access Attempts Analysis

### 8.1 Log Analysis Summary

| Log File | Status | Suspicious Activity |
|----------|--------|---------------------|
| /var/log/auth.log | ✅ Clean | No failed SSH attempts found |
| /var/log/fail2ban.log | ✅ Clean | No bans executed since restart |
| /var/log/hestia/auth.log | ✅ Clean | Empty |
| /var/log/vsftpd.log | ✅ Clean | Empty |
| /var/log/dovecot.log | ✅ Clean | Normal startup only |
| /var/log/exim4/mainlog | ⚠️ Issues | Delivery problems to admin@zaplit.com |

### 8.2 Mail System Issues

**Found in Exim logs:**
```
SMTP timeout after initial connection: Connection timed out
H=zaplit.com [216.239.34.21]: Connection timed out
admin@zaplit.com: Unrouteable address
```

**Recommendation:** Fix mail routing configuration for admin@zaplit.com

---

## 9. IP Whitelist/Blacklist Status

### 9.1 Current Status

| List Type | Status | Entries |
|-----------|--------|---------|
| Fail2Ban ignoreip | Not configured | 0 |
| hosts.allow | Default (empty) | 0 |
| hosts.deny | Default (commented) | 0 |
| iptables explicit allows | 10.128.0.11, 127.0.0.1 | 2 |
| GCP firewall whitelist | 71.212.223.191/32 | 1 |

### 9.2 Recommendations

1. Configure Fail2Ban `ignoreip` with trusted management IPs
2. Implement geographic blocking for high-risk countries
3. Add known malicious IP ranges to blocklist

---

## 10. Exposed Attack Surfaces

### 10.1 High-Risk Exposures

1. **Port 8083 (Hestia Panel)** - Admin interface exposed to world
   - Risk: Credential stuffing, brute force attacks
   - Mitigation: Restrict to management IP or VPN only

2. **Port 21 (FTP)** - Plain text file transfer
   - Risk: Credential sniffing, data interception
   - Mitigation: Disable FTP, use SFTP only (port 22)

3. **Port 110/143 (POP3/IMAP)** - Plain text email retrieval
   - Risk: Credential and email content interception
   - Mitigation: Disable plain text protocols, enforce SSL/TLS

4. **Port 3000 (Twenty CRM)** - Exposed in GCP firewall to world
   - Risk: Unauthorized API access, data exfiltration
   - Mitigation: Restrict to Cloud Run service account

### 10.2 Medium-Risk Exposures

1. **Port 25 (SMTP)** - Accepting unencrypted mail
2. **X11 Forwarding** - Unnecessary attack surface
3. **ICMP unrestricted** - Can be used for reconnaissance

---

## 11. Missing Security Controls

### 11.1 Critical Missing Controls

| Control | Priority | Impact |
|---------|----------|--------|
| Web Application Firewall (WAF) | HIGH | No protection against web attacks |
| Intrusion Detection System (IDS) | HIGH | No real-time threat detection |
| Port Scan Detection | HIGH | Attackers can map services freely |
| Geographic IP Blocking | MEDIUM | Attacks from high-risk countries |
| TLS 1.3 Enforcement | MEDIUM | Legacy TLS versions allowed |
| SMTP Authentication Logging | MEDIUM | Cannot detect mail abuse |
| File Integrity Monitoring | MEDIUM | Cannot detect unauthorized changes |

### 11.2 Missing Monitoring

- No centralized log aggregation
- No security event alerting
- No failed authentication monitoring dashboard
- No bandwidth anomaly detection

---

## 12. Specific Hardening Recommendations

### 12.1 Immediate Actions (Critical)

1. **Restrict Hestia Panel Access**
   ```bash
   # Add to GCP firewall - restrict to management IP
   gcloud compute firewall-rules create allow-hestia-panel \
     --source-ranges=71.212.223.191/32 \
     --allow=tcp:8083 \
     --target-tags=hestia,mail,web
   
   # Remove world access
   gcloud compute firewall-rules delete allow-twenty-cloud-run
   ```

2. **Disable Plain Text Email Protocols**
   ```bash
   # Edit /etc/dovecot/dovecot.conf
   service imap-login {
     inet_listener imap {
       port = 0  # Disable plain IMAP
     }
   }
   service pop3-login {
     inet_listener pop3 {
       port = 0  # Disable plain POP3
     }
   }
   ```

3. **Disable FTP Service**
   ```bash
   sudo systemctl stop vsftpd
   sudo systemctl disable vsftpd
   ```

### 12.2 SSH Hardening

```bash
# Edit /etc/ssh/sshd_config
PermitRootLogin no
MaxAuthTries 3
MaxStartups 2:30:10
X11Forwarding no
AllowTcpForwarding no
PermitTunnel no
ClientAliveInterval 300
ClientAliveCountMax 2

# Restart SSH
sudo systemctl restart sshd
```

### 12.3 Fail2Ban Improvements

```bash
# Edit /etc/fail2ban/jail.local
[DEFAULT]
ignoreip = 127.0.0.1/8 10.128.0.0/9 71.212.223.191
bantime = 3600
findtime = 600
maxretry = 3

[ssh-iptables]
maxretry = 3
bantime = 7200

[postfix-sasl]
enabled = true
filter = postfix-sasl
action = hestia[name=MAIL]
logpath = /var/log/mail.log
maxretry = 3
bantime = 3600
```

### 12.4 Kernel Hardening

```bash
# Create /etc/sysctl.d/99-security.conf
net.ipv4.tcp_max_syn_backlog = 2048
net.netfilter.nf_conntrack_max = 524288
net.ipv4.tcp_challenge_ack_limit = 1000000
net.netfilter.nf_conntrack_tcp_timeout_established = 3600
net.ipv4.tcp_congestion_control = bbr

# Rate limiting
net.ipv4.icmp_ratelimit = 100
net.ipv4.icmp_ratemask = 88089
net.netfilter.nf_conntrack_icmp_timeout = 10

# Apply settings
sudo sysctl -p /etc/sysctl.d/99-security.conf
```

### 12.5 Install Port Scan Detection

```bash
# Install psad
sudo apt-get update
sudo apt-get install -y psad

# Configure psad
sudo sed -i 's/ENABLE_AUTO_IDS.*/ENABLE_AUTO_IDS Y;/' /etc/psad/psad.conf
sudo sed -i 's/AUTO_IDS_DANGER_LEVEL.*/AUTO_IDS_DANGER_LEVEL 4;/' /etc/psad/psad.conf

sudo systemctl enable psad
sudo systemctl start psad
```

### 12.6 GCP-Specific Improvements

```bash
# Enable Secure Boot
gcloud compute instances update hestia-mail \
  --zone=us-central1-a \
  --shielded-secure-boot

# Add VPC Flow Logs
gcloud compute networks subnets update default \
  --region=us-central1 \
  --enable-flow-logs
```

---

## 13. Compliance and Best Practices

### 13.1 PCI-DSS Compliance (if applicable)

| Requirement | Status | Notes |
|-------------|--------|-------|
| 1.1 Firewall configuration | ⚠️ Partial | Host firewall configured, GCP rules need review |
| 1.2 Default deny | ✅ Compliant | iptables INPUT policy is DROP |
| 2.1 Default passwords | ⚠️ Unknown | Should verify all default passwords changed |
| 4.1 Encryption in transit | ⚠️ Partial | Some services allow plain text |
| 10.1 Audit trails | ⚠️ Partial | Logs exist but no centralized monitoring |

### 13.2 Email Security Best Practices (RFC 5321, DMARC)

- SPF record: Should verify configured correctly
- DKIM signing: Should be enabled for all outbound mail
- DMARC policy: Should be at p=quarantine or p=reject
- TLS enforcement: Should require TLS for all authenticated connections

---

## 14. Monitoring Recommendations

### 14.1 Set Up Security Monitoring

```bash
# Install and configure auditd for file integrity
sudo apt-get install -y auditd
sudo auditctl -w /etc/passwd -p wa -k identity_changes
sudo auditctl -w /etc/shadow -p wa -k identity_changes

# Install AIDE for file integrity monitoring
sudo apt-get install -y aide
sudo aideinit
sudo mv /var/lib/aide/aide.db.new /var/lib/aide/aide.db
```

### 14.2 Log Forwarding

Configure rsyslog to forward security logs to a centralized SIEM:

```bash
# Add to /etc/rsyslog.d/99-security.conf
auth.*,authpriv.* @siem-server:514
kern.* @siem-server:514
fail2ban.* @siem-server:514
```

---

## 15. Appendix: Security Checklist

### Network Security
- [ ] GCP firewall rules reviewed and minimized
- [ ] Host firewall DROP policy verified
- [ ] ICMP restricted (optional)
- [ ] Port 3000 access restricted
- [ ] Port 8083 access restricted to management IP

### Authentication
- [ ] Password authentication disabled for SSH
- [ ] All default passwords changed
- [ ] Two-factor authentication considered for Hestia panel
- [ ] SSH keys rotated regularly

### Services
- [ ] FTP disabled
- [ ] Plain text IMAP/POP3 disabled
- [ ] TLS 1.3 enforced
- [ ] Mail authentication logging enabled

### Monitoring
- [ ] Fail2Ban ban times increased
- [ ] Port scan detection installed
- [ ] File integrity monitoring enabled
- [ ] Centralized logging configured
- [ ] Alerting rules defined

### Updates
- [ ] Automatic security updates enabled
- [ ] ClamAV virus definitions updated
- [ ] Fail2Ban filters updated

---

## Conclusion

The Hestia mail server has a solid foundation with proper firewall configuration, Fail2Ban protection, and key-based SSH authentication. However, several critical security gaps need immediate attention, particularly:

1. **Restricting admin panel access** (port 8083)
2. **Disabling plain text protocols** (FTP, IMAP 143, POP3 110)
3. **Improving SSH security settings**
4. **Implementing port scan detection**
5. **Configuring proper IP whitelisting**

By implementing the recommendations in this report, the security posture can be improved from **6.5/10 to 9/10**.

---

*Report generated: March 20, 2026*  
*Next audit recommended: June 20, 2026 (quarterly)*
