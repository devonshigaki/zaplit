# Hestia Mail Server Security Audit Report

**Server:** 136.113.99.87 (mail.zaplit.com)  
**Date:** March 20, 2026  
**Auditor:** Automated Security Assessment  
**Scope:** Exim, Dovecot, SpamAssassin, ClamAV, TLS/SSL, Authentication, Network Security

---

## Executive Summary

The Hestia mail server has a **MODERATE security posture** with several areas requiring immediate attention. While basic protections are in place (fail2ban, DNSBL, TLS 1.2+), there are critical security gaps that could expose the server to attacks.

**Overall Risk Rating:** MEDIUM-HIGH

| Severity | Count |
|----------|-------|
| Critical | 2 |
| High | 4 |
| Medium | 6 |
| Low | 4 |

---

## 1. Exim Mail Server Configuration

### Current Status
- **Version:** 4.95 (built Jul 30, 2024)
- **Listening Ports:** 25 (SMTP), 465 (SMTPS), 587 (Submission)
- **Open Relay Status:** ✅ SECURE - Not an open relay
- **Rate Limiting:** 200 emails/hour per account

### Security Gaps

#### 🔴 CRITICAL: Self-Signed SSL Certificate
**Issue:** The server uses a self-signed certificate for TLS connections.
```
Issuer: C = US, ST = California, L = San Francisco, O = Hestia Control Panel, OU = IT, CN = mail.zaplit.com
Subject: C = US, ST = California, L = San Francisco, O = Hestia Control Panel, OU = IT, CN = mail.zaplit.com
```
**Impact:** Clients will see certificate warnings; vulnerable to MITM attacks  
**Recommendation:** Install valid Let's Encrypt or commercial SSL certificate

```bash
# Fix: Request Let's Encrypt certificate via Hestia
v-add-letsencrypt-domain admin zaplit.com
v-add-letsencrypt-mail admin zaplit.com
```

#### 🟠 HIGH: Missing SMTP Relay Password
**Issue:** SMTP relay is configured but password is empty
```
host:smtp-relay.brevo.com
port:587
user:587
pass:
```
**Impact:** Outbound emails may fail; relay authentication incomplete  
**Recommendation:** Configure proper SMTP relay credentials

```bash
# Fix: Set SMTP relay password
v-change-mail-domain-smtp-relay admin zaplit.com smtp-relay.brevo.com 587 587 'YOUR_PASSWORD'
```

#### 🟡 MEDIUM: World-Readable Configuration Files
**Issue:** Several Exim config files are world-readable
```
-rw-r--r-- /etc/exim4/dnsbl.conf
-rw-r--r-- /etc/exim4/limit.conf
-rw-r--r-- /etc/exim4/smtp_relay.conf
```
**Impact:** Information disclosure about mail configuration  
**Recommendation:**
```bash
sudo chmod 640 /etc/exim4/dnsbl.conf /etc/exim4/limit.conf /etc/exim4/smtp_relay.conf
sudo chown root:Debian-exim /etc/exim4/dnsbl.conf /etc/exim4/limit.conf /etc/exim4/smtp_relay.conf
```

---

## 2. Dovecot IMAP/POP3 Security

### Current Status
- **Version:** 2.3.16
- **Listening Ports:** 110 (POP3), 143 (IMAP), 993 (IMAPS), 995 (POP3S)
- **SSL:** Enabled with TLS 1.2 minimum
- **Cipher List:** Modern ciphers configured ✅

### Security Gaps

#### 🔴 CRITICAL: Plaintext Authentication Enabled
**Issue:** `disable_plaintext_auth = no` allows plaintext authentication
```
# /etc/dovecot/conf.d/10-auth.conf
disable_plaintext_auth = no
auth_mechanisms = plain login
```
**Impact:** Passwords can be transmitted in plaintext if client doesn't use TLS  
**Recommendation:** Force plaintext auth only over TLS

```bash
# Fix: Require TLS for plaintext auth
sudo sed -i 's/disable_plaintext_auth = no/disable_plaintext_auth = yes/' /etc/dovecot/conf.d/10-auth.conf
sudo systemctl restart dovecot
```

#### 🟠 HIGH: Weak Password Hashing for Some Accounts
**Issue:** Mixed password hashing schemes detected
- Mail users: BLF-CRYPT (Blowfish) ✅ Good
- System uses: MD5-CRYPT in some places

**Recommendation:** Ensure all passwords use strong hashing (BLF-CRYPT or ARGON2)

#### 🟡 MEDIUM: IMAP/POP3 Cleartext Ports Open
**Issue:** Ports 110 (POP3) and 143 (IMAP) are listening without forced TLS upgrade
**Impact:** Clients can accidentally use unencrypted connections  
**Recommendation:** Disable cleartext ports or force STARTTLS

```bash
# Fix: Disable cleartext IMAP/POP3 in Dovecot
sudo sed -i 's/^#imap_listen = \*, ::/imap_listen = [::]/' /etc/dovecot/dovecot.conf
sudo sed -i 's/^#pop3_listen = \*, ::/pop3_listen = [::]/' /etc/dovecot/dovecot.conf

# Or configure firewall to block ports 110/143 externally
sudo iptables -A INPUT -p tcp --dport 110 -j DROP
sudo iptables -A INPUT -p tcp --dport 143 -j DROP
```

---

## 3. Authentication Security

### Current Status
- **Mechanisms:** PLAIN, LOGIN
- **Password Storage:** BLF-CRYPT (Blowfish) - Secure ✅
- **Backend:** passwd-file

### Security Gaps

#### 🟠 HIGH: No Account Lockout Policy
**Issue:** No account lockout after failed login attempts  
**Impact:** Vulnerable to brute force attacks  
**Recommendation:** Configure fail2ban with stricter mail jail settings

```bash
# Check and enhance fail2ban jail config
sudo cat /etc/fail2ban/jail.d/hestia.conf

# Ensure these settings exist:
[dovecot-iptables]
enabled = true
maxretry = 3
bantime = 3600

[exim-iptables]
enabled = true
maxretry = 3
bantime = 3600
```

---

## 4. TLS/SSL Configuration

### Current Status
- **TLS Version:** TLS 1.2 and 1.3 only ✅
- **Weak Protocols:** TLS 1.0/1.1 disabled ✅
- **Certificate Type:** Self-signed (needs replacement)
- **Cipher Suite:** Modern, PFS-enabled ciphers ✅

### Security Gaps

#### 🟡 MEDIUM: Self-Signed Certificate
**Issue:** Certificate is self-signed, not trusted by clients  
**Impact:** Certificate warnings; potential MITM  
**Recommendation:** Install Let's Encrypt certificate

```bash
# Fix via Hestia CLI
v-add-letsencrypt-host
v-add-letsencrypt-domain admin zaplit.com 'www.zaplit.com,mail.zaplit.com'
```

#### 🟢 LOW: No Certificate Pinning
**Issue:** No DANE/TLSA records configured  
**Impact:** Less protection against fraudulent certificates  
**Recommendation:** Add TLSA DNS records after installing valid certificate

---

## 5. Open Relay Prevention

### Status: ✅ SECURE

The server **IS NOT** an open relay. Testing confirmed:
- External senders are rejected with "Sender verify failed"
- Authentication required for relaying
- DNSBL checks in place

**Evidence:**
```
LOG: H=(test.example.com) [1.2.3.4] F=<test@example.com> rejected RCPT <test@gmail.com>: Sender verify failed
```

---

## 6. Spam Filtering (SpamAssassin)

### Current Status
- **Version:** 3.4.6
- **Status:** Active ✅
- **Required Score:** 5.0 (default)
- **Bayesian Learning:** Enabled ✅
- **Auto-Learn:** Enabled ✅

### Configuration
```
SPAM_SCORE = 50       (Tag as spam)
SPAM_REJECT_SCORE = 100 (Reject spam)
```

### Security Gaps

#### 🟡 MEDIUM: High Spam Score Threshold
**Issue:** Spam score of 50 is very high (SpamAssassin uses 5.0 by default)  
**Impact:** More spam will reach user inboxes  
**Recommendation:** Adjust thresholds

```bash
# Fix: Update Exim spam thresholds
sudo sed -i 's/SPAM_SCORE = 50/SPAM_SCORE = 50/' /etc/exim4/exim4.conf.template
sudo sed -i 's/SPAM_REJECT_SCORE = 100/SPAM_REJECT_SCORE = 80/' /etc/exim4/exim4.conf.template
sudo update-exim4.conf
sudo systemctl restart exim4
```

#### 🟡 MEDIUM: Spam Rejection Not Enabled
**Issue:** `REJECT='no'` in mail domain config  
**Impact:** High-scoring spam is tagged but not rejected  
**Recommendation:** Enable reject_spam for domain

```bash
v-delete-mail-domain-antispam admin zaplit.com
v-add-mail-domain-antispam admin zaplit.com
v-add-mail-domain-reject-spam admin zaplit.com
```

---

## 7. Antivirus (ClamAV)

### Current Status
- **Version:** 1.4.3
- **Virus DB:** Current (27945, updated Mar 19, 2026) ✅
- **Status:** Active ✅
- **Scanning:** Mail, archives, HTML, PDF ✅

### Security Gaps

#### 🔴 CRITICAL: Freshclam Service Inactive
**Issue:** Virus definition updater is not running
```
systemctl is-active clamav-freshclam → inactive
```
**Impact:** Virus definitions will become outdated  
**Recommendation:**

```bash
# Fix: Start and enable freshclam
sudo systemctl start clamav-freshclam
sudo systemctl enable clamav-freshclam
sudo systemctl status clamav-freshclam
```

#### 🟡 MEDIUM: Archive Block Encrypted Disabled
**Issue:** `ArchiveBlockEncrypted false` allows encrypted archives  
**Impact:** Encrypted malware could bypass scanning  
**Recommendation:**

```bash
# Fix: Block encrypted archives
sudo sed -i 's/ArchiveBlockEncrypted false/ArchiveBlockEncrypted true/' /etc/clamav/clamd.conf
sudo systemctl restart clamav-daemon
```

---

## 8. Rate Limiting

### Current Status
- **SMTP Rate Limit:** 200 emails/hour per account
- **PHP Script Rate Limit:** 200 emails/hour per user
- **Status:** Configured ✅

### Configuration
```
acl_c_msg_limit = 200 / 1h / strict
```

### Security Gaps

#### 🟢 LOW: No Burst Protection
**Issue:** Rate limits are per-hour, no per-minute burst protection  
**Impact:** Could allow short bursts of spam  
**Recommendation:** Add burst rate limiting

```bash
# Add to exim4.conf.template acl_check_rcpt:
deny    message       = Too many connections from $sender_host_address
        ratelimit     = 10 / 1m / strict / $sender_host_address
```

---

## 9. User Account Security

### Current Status
- **Hashing:** BLF-CRYPT (Blowfish) ✅
- **Password Policy:** 8 character minimum (Roundcube)
- **2FA:** Not enabled for admin

### Security Gaps

#### 🟠 HIGH: No Two-Factor Authentication
**Issue:** Admin account lacks 2FA (`TWOFA=''` in config)  
**Impact:** Single point of failure if password compromised  
**Recommendation:** Enable 2FA in Hestia panel

```bash
# Via Hestia UI:
# 1. Login to https://mail.zaplit.com:8083
# 2. Go to User Settings
# 3. Enable Two-Factor Authentication
```

#### 🟡 MEDIUM: Weak Password Requirements
**Issue:** Password minimum length 8, non-alpha not required  
**Impact:** Users may choose weak passwords  
**Recommendation:** Strengthen password policy

```bash
# Update Roundcube password config
sudo sed -i 's/\$config\["password_minimum_length"\] = 8;/$config["password_minimum_length"] = 12;/' /etc/roundcube/plugins/password/config.inc.php
sudo sed -i 's/\$config\["password_require_nonalpha"\] = false;/$config["password_require_nonalpha"] = true;/' /etc/roundcube/plugins/password/config.inc.php
```

---

## 10. DNS Security (SPF/DKIM/DMARC)

### Current Status
- **SPF:** ✅ Configured
  ```
  "v=spf1 a mx ip4:34.132.198.35 ~all"
  ```
- **DMARC:** ⚠️ Monitoring mode only
  ```
  "v=DMARC1; p=none; rua=mailto:admin@zaplit.com"
  ```
- **DKIM:** ✅ Key exists but DNS record missing

### Security Gaps

#### 🟡 MEDIUM: DMARC Policy Too Permissive
**Issue:** `p=none` allows spoofed emails through  
**Recommendation:** Gradually enforce DMARC

```dns
# Step 1: Increase to quarantine (25% of failed emails)
_v=DMARC1; p=quarantine; pct=25; rua=mailto:admin@zaplit.com_

# Step 2: After monitoring, increase to full quarantine
_v=DMARC1; p=quarantine; rua=mailto:admin@zaplit.com_

# Step 3: Eventually reject all failures
_v=DMARC1; p=reject; rua=mailto:admin@zaplit.com_
```

#### 🟡 MEDIUM: DKIM DNS Record Missing
**Issue:** DKIM key exists but no DNS TXT record  
**Impact:** Outbound emails not signed properly  
**Recommendation:** Add DKIM DNS record

```bash
# Get DKIM public key
sudo cat /etc/exim4/domains/zaplit.com/dkim.pem | openssl rsa -pubout 2>/dev/null

# Or use Hestia to regenerate
v-delete-mail-domain-dkim admin zaplit.com
v-add-mail-domain-dkim admin zaplit.com 2048
```

---

## 11. Web Application Security (Roundcube)

### Security Gaps

#### 🔴 CRITICAL: Database Password in Cleartext
**Issue:** Roundcube database password stored in cleartext
```php
$config["db_dsnw"] = "mysql://roundcube:8KqT1L45TSuAk3Ak@localhost/roundcube";
```
**Location:** `/etc/roundcube/config.inc.php`  
**Impact:** Password exposure if file is compromised  
**Recommendation:**

```bash
# Verify file permissions
sudo chmod 640 /etc/roundcube/config.inc.php
sudo chown root:www-data /etc/roundcube/config.inc.php

# Consider using environment variables or separate config
```

---

## 12. Network Security

### Current Status
- **Firewall:** iptables with fail2ban integration ✅
- **Fail2ban:** Active with 7 jails ✅
- **SSH:** Configured with chroot for SFTP ✅

### Listening Services
| Port | Service | Security |
|------|---------|----------|
| 22 | SSH | Accept |
| 25 | SMTP | Accept |
| 465 | SMTPS | Accept |
| 587 | Submission | Accept |
| 110 | POP3 | ⚠️ Consider blocking |
| 143 | IMAP | ⚠️ Consider blocking |
| 993 | IMAPS | Accept |
| 995 | POP3S | Accept |
| 21 | FTP | ⚠️ Insecure protocol |
| 8083 | Hestia Panel | Accept |

### Security Gaps

#### 🟡 MEDIUM: FTP Service Enabled
**Issue:** vsftpd is running (port 21)  
**Impact:** FTP transmits credentials in plaintext  
**Recommendation:** Disable FTP, use SFTP only

```bash
# Fix: Disable FTP
sudo systemctl stop vsftpd
sudo systemctl disable vsftpd
sudo ufw deny 21/tcp
```

#### 🟠 HIGH: Hestia API Unrestricted
**Issue:** API enabled with no IP restrictions (`API_ALLOWED_IP=''`)  
**Impact:** API exposed to any source IP  
**Recommendation:** Restrict API access

```bash
# Fix: Restrict API to localhost and specific IPs
sudo sed -i "s/API_ALLOWED_IP=''/API_ALLOWED_IP='127.0.0.1,10.128.0.0\/16'/" /usr/local/hestia/conf/hestia.conf
sudo systemctl restart hestia
```

---

## Summary of Fixes Priority

### Immediate (Critical/High)
1. ✅ Fix ClamAV freshclam service
2. ✅ Install valid SSL certificate (Let's Encrypt)
3. ✅ Disable plaintext authentication in Dovecot
4. ✅ Set SMTP relay password
5. ✅ Enable 2FA for admin account
6. ✅ Restrict Hestia API access
7. ✅ Secure Roundcube database credentials

### Short-term (Medium)
8. Configure DKIM DNS record
9. Strengthen DMARC policy
10. Enable spam rejection
11. Block FTP service
12. Adjust SpamAssassin thresholds

### Long-term (Low)
13. Add DANE/TLSA records
14. Implement burst rate limiting
15. Review password policies
16. Regular security audits

---

## Quick Fix Script

```bash
#!/bin/bash
# Hestia Mail Server Security Hardening Script

# 1. Fix ClamAV freshclam
sudo systemctl start clamav-freshclam
sudo systemctl enable clamav-freshclam

# 2. Fix Dovecot plaintext auth
sudo sed -i 's/disable_plaintext_auth = no/disable_plaintext_auth = yes/' /etc/dovecot/conf.d/10-auth.conf
sudo systemctl restart dovecot

# 3. Secure Exim config files
sudo chmod 640 /etc/exim4/dnsbl.conf /etc/exim4/limit.conf /etc/exim4/smtp_relay.conf
sudo chown root:Debian-exim /etc/exim4/dnsbl.conf /etc/exim4/limit.conf /etc/exim4/smtp_relay.conf

# 4. Secure Roundcube config
sudo chmod 640 /etc/roundcube/config.inc.php
sudo chown root:www-data /etc/roundcube/config.inc.php

# 5. Disable FTP
sudo systemctl stop vsftpd
sudo systemctl disable vsftpd

# 6. Restart services
sudo systemctl restart exim4
sudo systemctl restart dovecot

echo "Basic hardening complete. Manual steps remaining:"
echo "- Install Let's Encrypt certificate"
echo "- Configure SMTP relay password"
echo "- Enable 2FA in Hestia panel"
echo "- Add DKIM DNS record"
echo "- Update DMARC policy"
```

---

## Appendix: Test Commands

```bash
# Test TLS
openssl s_client -connect mail.zaplit.com:465 -tls1_2
openssl s_client -connect mail.zaplit.com:993

# Test open relay
swaks --to test@gmail.com --from test@example.com --server mail.zaplit.com

# Check DNS records
dig TXT zaplit.com
dig TXT _dmarc.zaplit.com
dig TXT mail._domainkey.zaplit.com

# Verify ClamAV
clamscan --version
freshclam --version

# Check fail2ban
fail2ban-client status
```

---

*Report generated on March 20, 2026*
*Next audit recommended: 90 days*
