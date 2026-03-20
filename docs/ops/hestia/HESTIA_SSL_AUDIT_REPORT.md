# Hestia Mail Server SSL/TLS Configuration Audit Report

**Server:** mail.zaplit.com (136.113.99.87)  
**Date:** 2026-03-19  
**Auditor:** Automated SSL Audit  
**Hestia Version:** 1.9.0 (Release 0.07)  
**OS:** Ubuntu 22.04.5 LTS

---

## Executive Summary

| Category | Status | Priority |
|----------|--------|----------|
| Certificate Type | ⚠️ **SELF-SIGNED** - Browser warnings will occur | CRITICAL |
| Let's Encrypt Status | ❌ **FAILED** - Error 15 (ACME validation fails) | CRITICAL |
| TLS Protocols | ✅ **SECURE** - TLS 1.2/1.3 only | GOOD |
| Cipher Suites | ✅ **SECURE** - Strong ciphers enforced | GOOD |
| Mail Service TLS | ✅ **SECURE** - Exim/Dovecot properly configured | GOOD |
| GCP Firewall | ❌ **BLOCKING** - Mail ports not externally accessible | CRITICAL |
| HSTS | ⚠️ **NOT CONFIGURED** | MEDIUM |
| OCSP Stapling | ✅ **ENABLED** (but not working with self-signed) | INFO |

---

## 1. Certificate Status

### Current Certificate Details

| Property | Value |
|----------|-------|
| **Subject CN** | mail.zaplit.com |
| **Issuer** | Hestia Control Panel (SELF-SIGNED) |
| **Type** | Self-signed certificate |
| **Version** | 1 (Legacy X.509) |
| **Serial Number** | 4A:D4:CF:76:30:E0:44:9A:95:61:C4:97:A9:E9:69:53:5E:B0:F0:6A |
| **Signature Algorithm** | SHA256 with RSA |
| **Public Key** | RSA 4096-bit |
| **Valid From** | Mar 20 05:32:07 2026 GMT |
| **Valid Until** | Mar 20 05:32:07 2027 GMT |
| **Days Remaining** | 364 days |
| **Subject Alt Names** | **NONE** - No SAN extension |

### ⚠️ Critical Issues

1. **SELF-SIGNED CERTIFICATE** - Browsers will show security warnings
2. **NO SUBJECT ALTERNATIVE NAMES (SAN)** - Missing webmail.zaplit.com
3. **MISSING LET'S ENCRYPT CERTIFICATE** - Failed provisioning

---

## 2. Let's Encrypt Status

### Current State

| Property | Status |
|----------|--------|
| **Account Email** | admin@zaplit.com |
| **Account Created** | Yes (ID: 3162229621) |
| **Certificate for mail.zaplit.com** | ❌ Not provisioned |
| **Certificate for zaplit.com** | ❌ Not provisioned |

### Error Analysis

**Error Code 15** in logs indicates Let's Encrypt ACME validation failure:

```
v-add-letsencrypt-domain 'zaplitadmin' 'zaplit.com' 'mail.zaplit.com,webmail.zaplit.com' 'yes' [Error 15]
```

**Root Causes:**

1. **DNS Mismatch for zaplit.com**:
   - `mail.zaplit.com` → 136.113.99.87 ✅ (Correct - points to Hestia server)
   - `webmail.zaplit.com` → 136.113.99.87 ✅ (Correct - points to Hestia server)
   - `zaplit.com` → 216.239.x.x (Google Sites/Cloudflare) ❌ (Does NOT point to Hestia)

2. **Let's Encrypt HTTP-01 Challenge Fails**:
   - LE requires the base domain (zaplit.com) to resolve to this server
   - Since zaplit.com points elsewhere, ACME validation cannot complete

3. **GCP Firewall Blocks External Access**:
   - Ports 80/443 not properly forwarded to Hestia for ACME validation
   - Only specific ports are open in GCP firewall rules

### Let's Encrypt Rate Limit Status

| Limit Type | Status |
|------------|--------|
| Rate Limit File | Not present |
| Failed Attempts | 9+ failed attempts (Mar 20, 2026) |
| Current Block Status | Unknown (may be rate-limited) |

---

## 3. TLS Protocol Configuration

### Hestia Panel (Port 8083)

| Protocol | Status | Notes |
|----------|--------|-------|
| **SSLv2** | ✅ Disabled | Not supported |
| **SSLv3** | ✅ Disabled | Not supported |
| **TLS 1.0** | ✅ Disabled | Rejected: `no protocols available` |
| **TLS 1.1** | ✅ Disabled | Rejected: `no protocols available` |
| **TLS 1.2** | ✅ Enabled | Working with strong ciphers |
| **TLS 1.3** | ✅ Enabled | Preferred |

### Exim SMTP (Port 465/587)

| Protocol | Status |
|----------|--------|
| **TLS 1.0** | ✅ Disabled |
| **TLS 1.1** | ✅ Disabled |
| **TLS 1.2** | ✅ Enabled |
| **TLS 1.3** | ✅ Enabled |

**Exim Cipher Configuration:**
```
tls_require_ciphers = PERFORMANCE:-RSA:-VERS-ALL:+VERS-TLS1.2:+VERS-TLS1.3:%SERVER_PRECEDENCE
```

### Dovecot IMAP/POP3 (Port 993/995)

| Protocol | Status |
|----------|--------|
| **TLS 1.0** | ✅ Disabled |
| **TLS 1.1** | ✅ Disabled |
| **TLS 1.2** | ✅ Enabled (Minimum) |
| **TLS 1.3** | ✅ Enabled |

**Dovecot Configuration:**
```
ssl_min_protocol = TLSv1.2
```

---

## 4. Cipher Suite Configuration

### Hestia Panel Nginx SSL Ciphers

```nginx
ssl_ciphers "ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES128-GCM-SHA256:
             ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-CHACHA20-POLY1305:
             ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384:
             ECDHE-ECDSA-AES128-SHA256:ECDHE-RSA-AES128-SHA256:DHE-RSA-AES128-SHA256:
             ECDHE-ECDSA-AES256-SHA384:ECDHE-RSA-AES256-SHA384:DHE-RSA-AES256-SHA256";

ssl_protocols TLSv1.2 TLSv1.3;
ssl_prefer_server_ciphers on;
ssl_dhparam /etc/ssl/dhparam.pem;  # 4096-bit
```

### TLS 1.3 Cipher Suites

```nginx
ssl_conf_command Ciphersuites TLS_AES_128_GCM_SHA256:TLS_CHACHA20_POLY1305_SHA256:TLS_AES_256_GCM_SHA384;
ssl_conf_command Options PrioritizeChaCha;
```

### Apache SSL Configuration

```apache
SSLProtocol all -SSLv2 -SSLv3 -TLSv1 -TLSv1.1
SSLCipherSuite HIGH:!aNULL
SSLSessionTickets off
```

### Weak Cipher Test Results

| Cipher Type | Status | Result |
|-------------|--------|--------|
| NULL | ✅ Blocked | `no cipher match` |
| EXPORT | ✅ Blocked | `no cipher match` |
| RC4 | ✅ Blocked | `no cipher match` |
| DES | ✅ Blocked | `no cipher match` |
| 3DES | ✅ Blocked | Not available |
| MD5 | ✅ Blocked | Not negotiated |

### Current Working Ciphers

| Connection | Protocol | Cipher |
|------------|----------|--------|
| Hestia Panel | TLSv1.3 | TLS_AES_128_GCM_SHA256 |
| SMTP (465) | TLSv1.3 | TLS_AES_128_GCM_SHA256 |
| IMAP (993) | TLSv1.3 | TLS_AES_128_GCM_SHA256 |
| Hestia Panel | TLSv1.2 | ECDHE-RSA-AES128-GCM-SHA256 |

---

## 5. HSTS Configuration

| Property | Status |
|----------|--------|
| **HSTS Header** | ❌ NOT CONFIGURED |
| **includeSubDomains** | N/A |
| **preload** | N/A |
| **max-age** | N/A |

**Current Security Headers (Hestia Panel):**
```nginx
add_header X-Content-Type-Options nosniff;
add_header X-Frame-Options SAMEORIGIN;
add_header X-XSS-Protection "1; mode=block";
```

**Missing:** `Strict-Transport-Security` header

---

## 6. OCSP Stapling

| Property | Status |
|----------|--------|
| **OCSP Stapling Enabled** | ✅ Yes (in config) |
| **OCSP Response Working** | ❌ No (self-signed cert) |

**Configuration:**
```nginx
ssl_stapling on;
ssl_stapling_verify on;
```

**Issue:** OCSP stapling cannot work with self-signed certificates as there is no Certificate Authority to provide OCSP responses.

---

## 7. Mail Service TLS Details

### Exim Configuration

| Property | Value |
|----------|-------|
| **Ports** | 25 (STARTTLS), 465 (SMTPS), 587 (Submission) |
| **TLS on Connect** | Port 465 only |
| **SNI Support** | Yes (`tls_in_sni`) |
| **Per-Domain Certs** | Supported (`/usr/local/hestia/ssl/mail/$tls_in_sni.crt`) |

**Key Exim Settings:**
```
tls_advertise_hosts = *
tls_on_connect_ports = 465
tls_require_ciphers = PERFORMANCE:-RSA:-VERS-ALL:+VERS-TLS1.2:+VERS-TLS1.3:%SERVER_PRECEDENCE
auth_advertise_hosts = localhost : ${if eq{$tls_in_cipher}{}{}{*}}
```

### Dovecot Configuration

| Property | Value |
|----------|-------|
| **Ports** | 993 (IMAPS), 995 (POP3S) |
| **Min Protocol** | TLSv1.2 |
| **Cipher List** | Strong (AEAD ciphers only) |
| **DH Params** | /etc/ssl/dhparam.pem (4096-bit) |

**Key Dovecot Settings:**
```
ssl = yes
ssl_min_protocol = TLSv1.2
ssl_prefer_server_ciphers = yes
ssl_cipher_list = ECDHE-ECDSA-AES128-GCM-SHA256:...
ssl_cert = </usr/local/hestia/ssl/certificate.crt
ssl_key = </usr/local/hestia/ssl/certificate.key
ssl_dh = </etc/ssl/dhparam.pem
```

---

## 8. GCP Firewall Status

### Current Firewall Rules

| Rule Name | Direction | Source | Ports | Target Tags | Status |
|-----------|-----------|--------|-------|-------------|--------|
| allow-http | INGRESS | 0.0.0.0/0 | 80 | - | ✅ Active |
| allow-https | INGRESS | 0.0.0.0/0 | 443 | - | ✅ Active |
| default-allow-ssh | INGRESS | 71.212.223.191/32 | 22 | - | ✅ Active |
| default-allow-internal | INGRESS | 10.128.0.0/9 | All | - | ✅ Active |

### ❌ Missing Rules for Mail Server

| Required Rule | Ports | Status |
|---------------|-------|--------|
| SMTP (Submission) | 587 | ❌ MISSING |
| SMTPS | 465 | ❌ MISSING |
| SMTP | 25 | ❌ MISSING |
| IMAPS | 993 | ❌ MISSING |
| POP3S | 995 | ❌ MISSING |
| Hestia Panel | 8083 | ❌ MISSING |

**Server Tags:** `hestia`, `mail`, `web`

---

## 9. Security Gaps Summary

### 🔴 Critical Issues (Fix Immediately)

| Issue | Impact | Fix Priority |
|-------|--------|--------------|
| Self-signed certificate | Browser warnings, mail client rejections | P0 |
| Missing SAN for webmail.zaplit.com | SSL errors on webmail | P0 |
| GCP firewall blocking mail ports | Mail services inaccessible externally | P0 |
| Let's Encrypt failing | No automated certificate renewal | P0 |

### 🟡 Medium Issues (Fix Soon)

| Issue | Impact | Fix Priority |
|-------|--------|--------------|
| HSTS not configured | Missing HTTPS enforcement | P1 |
| Certificate Version 1 | Legacy format, no extensions | P1 |
| No automated cert renewal | Annual manual renewal required | P1 |

### 🟢 Good Configurations

| Configuration | Status |
|---------------|--------|
| TLS 1.2/1.3 only | ✅ Secure |
| Weak ciphers disabled | ✅ Secure |
| 4096-bit DH params | ✅ Secure |
| Strong cipher suites | ✅ Secure |
| Session tickets off (Apache) | ✅ Secure |
| SSL compression disabled | ✅ Secure |

---

## 10. Fix Commands

### Fix 1: Open GCP Firewall Ports (CRITICAL)

```bash
# Add mail server firewall rule
gcloud compute firewall-rules create allow-hestia-mail \
    --project=zaplit-website-prod \
    --direction=INGRESS \
    --priority=1000 \
    --network=default \
    --action=ALLOW \
    --rules=tcp:25,tcp:465,tcp:587,tcp:993,tcp:995,tcp:8083 \
    --source-ranges=0.0.0.0/0 \
    --target-tags=mail,hestia
```

### Fix 2: Configure Let's Encrypt for mail.zaplit.com Only (Workaround)

Since `zaplit.com` points elsewhere, request LE cert only for subdomains:

```bash
# SSH to server
gcloud compute ssh hestia-mail --zone=us-central1-a --project=zaplit-website-prod

# Remove failed LE attempts
sudo rm -f /usr/local/hestia/data/users/zaplitadmin/ssl/mail.zaplit.com.*

# Request certificate for mail subdomain only (not base domain)
sudo /usr/local/hestia/bin/v-add-letsencrypt-domain zaplitadmin mail.zaplit.com '' 'yes'
```

**Note:** This may fail if Hestia requires the web domain to exist. Alternative:

### Fix 3: Manual Let's Encrypt with DNS Challenge

If HTTP-01 fails, use DNS-01 challenge (requires Cloudflare API access):

```bash
# Install certbot
certbot certonly --manual --preferred-challenges dns \
    -d mail.zaplit.com \
    -d webmail.zaplit.com \
    --agree-tos \
    -m admin@zaplit.com

# Copy certificates to Hestia
sudo cp /etc/letsencrypt/live/mail.zaplit.com/fullchain.pem /usr/local/hestia/ssl/certificate.crt
sudo cp /etc/letsencrypt/live/mail.zaplit.com/privkey.pem /usr/local/hestia/ssl/certificate.key

# Set permissions
sudo chown root:mail /usr/local/hestia/ssl/certificate.*
sudo chmod 640 /usr/local/hestia/ssl/certificate.*

# Restart services
sudo systemctl restart hestia
sudo systemctl restart exim4
sudo systemctl restart dovecot
```

### Fix 4: Add HSTS Configuration

```bash
# Create HSTS config file
sudo tee /usr/local/hestia/data/templates/web/nginx/hsts.stpl << 'EOF'
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
EOF

# Enable for mail.zaplit.com
sudo /usr/local/hestia/bin/v-add-web-domain-ssl-force zaplitadmin mail.zaplit.com
```

### Fix 5: Enable Webmail SSL

```bash
# Add webmail.zaplit.com as domain alias with SSL
sudo /usr/local/hestia/bin/v-add-web-domain-alias zaplitadmin mail.zaplit.com webmail.zaplit.com

# Request LE for both domains
sudo /usr/local/hestia/bin/v-add-letsencrypt-domain zaplitadmin mail.zaplit.com 'webmail.zaplit.com' 'yes'
```

---

## 11. Verification Commands

```bash
# Test TLS versions (should only allow 1.2/1.3)
openssl s_client -connect mail.zaplit.com:993 -tls1_3
openssl s_client -connect mail.zaplit.com:465 -tls1_2

# Test weak ciphers (should fail)
openssl s_client -connect mail.zaplit.com:993 -cipher NULL
openssl s_client -connect mail.zaplit.com:993 -cipher RC4

# Check certificate
openssl s_client -connect mail.zaplit.com:993 -servername mail.zaplit.com </dev/null | openssl x509 -noout -text

# Verify HSTS
curl -I https://mail.zaplit.com:8083 | grep -i strict-transport
```

---

## 12. Recommendations

### Immediate Actions (Today)

1. **Open GCP firewall ports** for mail services (25, 465, 587, 993, 995, 8083)
2. **Obtain valid Let's Encrypt certificate** using DNS-01 challenge
3. **Configure webmail.zaplit.com** with proper SSL

### Short-term Actions (This Week)

1. **Configure HSTS** with includeSubDomains
2. **Set up automated certificate renewal** via cron
3. **Test mail clients** with new certificates
4. **Configure DKIM/DMARC** for email authentication

### Long-term Actions

1. **Consider using Cloudflare Origin Certificates** for simpler management
2. **Implement certificate monitoring** with alerts
3. **Regular SSL/TLS audits** (quarterly)
4. **Document certificate renewal procedures**

---

## Appendix: File Locations

| Config Type | File Path |
|-------------|-----------|
| Hestia SSL Certificate | `/usr/local/hestia/ssl/certificate.crt` |
| Hestia SSL Key | `/usr/local/hestia/ssl/certificate.key` |
| Hestia Nginx Config | `/usr/local/hestia/nginx/conf/nginx.conf` |
| Apache SSL Config | `/etc/apache2/mods-enabled/ssl.conf` |
| Dovecot SSL Config | `/etc/dovecot/conf.d/10-ssl.conf` |
| Exim Config | `/var/lib/exim4/config.autogenerated` |
| DH Parameters | `/etc/ssl/dhparam.pem` |
| Domain Config | `/home/zaplitadmin/conf/web/mail.zaplit.com/` |
| Hestia Logs | `/var/log/hestia/error.log` |
| Let's Encrypt Account | `/usr/local/hestia/data/letsencrypt/` |

---

*Report generated: 2026-03-19*
