# Hestia Mail Server Setup - Status Report

**Date:** March 20, 2026  
**Server:** hestia-mail (136.113.99.87)  
**Hestia Version:** 1.9.4

---

## ✅ Completed Tasks

### 1. Server Creation
- [x] Created GCP VM: hestia-mail
- [x] Configuration: e2-medium (2 vCPU, 4 GB RAM)
- [x] Disk: 20 GB SSD
- [x] Zone: us-central1-a
- [x] Static IP: 136.113.99.87

### 2. Hestia Control Panel Installation
- [x] Installed Hestia 1.9.4
- [x] Components installed:
  - Apache Web Server
  - PHP-FPM
  - Exim Mail Server
  - Dovecot POP3/IMAP Server
  - ClamAV Antivirus
  - SpamAssassin
  - iptables Firewall
  - Fail2Ban

### 3. Mail Domain Configuration
- [x] Created mail domain: zaplit.com
- [x] Enabled DKIM support
- [x] Generated DKIM key pair
- [x] Enabled Antivirus (ClamAV)
- [x] Enabled Antispam (SpamAssassin)
- [x] Rate limit: 200 emails/hour

### 4. Email Accounts
- [x] Created: noreply@zaplit.com
- [x] Created: info@zaplit.com

### 5. SMTP Relay Configuration
- [x] Configured Brevo SMTP relay
- [x] Host: smtp-relay.brevo.com
- [x] Port: 587
- [x] Configuration file: /etc/exim4/smtp_relay.conf

---

## ⏳ Pending Tasks

### 1. DNS Updates (MANUAL - Cloudflare)
**Priority: HIGH**

Records to update:

| Record | Type | Name | Value | Action |
|--------|------|------|-------|--------|
| A | `mail` | 136.113.99.87 | UPDATE from 34.132.198.35 |
| A | `webmail` | 136.113.99.87 | UPDATE from 34.132.198.35 |
| TXT | `@` | `v=spf1 a mx ip4:136.113.99.87 ~all` | UPDATE IP |
| TXT | `mail._domainkey` | DKIM public key | ADD NEW |

**DKIM Public Key for DNS:**
```
v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAzhI/KCaRXTjUybe2DUc6pMU0KBaEdflcF0vpmKyJjHhJs5lvcaDgV5/28KMMNtPno/kv4niPViH4rnxE+cNgLedPnB4z32v8FRdOaaksXKC+G3wnYEq1oEp8+xHNAWILROadvcQXsYRWjojja4po10DEu3AhXaGNAObde1us8vaiwcWGctAbpSyq/PBZ0McRFHtqQVKed0pssd0yg6L7W1msvvA74OnD7+CO90wIPz2S/oaqbQLbN5SAs8wtJ+VA3pAsiHqqO3//y0+3lo/3dPV/8nIb0mORyPdzMAFtpE19R38P+0DVfwy17NqjfqAW2iY7E7g/aCjs/63fGzEkXQIDAQAB
```

### 2. SSL Certificate (Manual via Hestia UI)
**Priority: HIGH**

SSL cannot be auto-provisioned until DNS points to the new server.

Steps:
1. Update DNS first (above)
2. Login to Hestia: https://136.113.99.87:8083
3. Go to Mail → zaplit.com → Edit
4. Check "Enable SSL for this domain"
5. Check "Use Let's Encrypt to obtain SSL certificate"
6. Click Save

### 3. PTR/Reverse DNS Request
**Priority: HIGH**

Contact GCP Support to set PTR record:
- IP: 136.113.99.87
- Hostname: mail.zaplit.com

Template:
```
Subject: PTR Record Request for 136.113.99.87

Hello GCP Support,

Please set the PTR (reverse DNS) record for IP 136.113.99.87 to:
mail.zaplit.com

This is required for email deliverability.

Thank you.
```

---

## 🔐 Access Information

### Hestia Control Panel
- **URL:** https://136.113.99.87:8083
- **Username:** zaplitadmin
- **Password:** [set during installation]

### Webmail (Roundcube)
- **URL:** https://webmail.zaplit.com (after DNS update)
- **Alternative:** https://136.113.99.87/roundcube
- **Login:** Full email address (e.g., noreply@zaplit.com)

### Email Accounts
| Account | Purpose | Status |
|---------|---------|--------|
| noreply@zaplit.com | System notifications | Created |
| info@zaplit.com | General inquiries | Created |

---

## 🧪 Testing Checklist

After DNS and SSL are configured:

- [ ] Verify DNS propagation: `dig mail.zaplit.com A`
- [ ] Verify MX record: `dig zaplit.com MX`
- [ ] Verify SPF: `dig zaplit.com TXT | grep spf`
- [ ] Verify DKIM: `dig mail._domainkey.zaplit.com TXT`
- [ ] Verify DMARC: `dig _dmarc.zaplit.com TXT`
- [ ] Login to Hestia CP
- [ ] Enable SSL for mail domain
- [ ] Send test email from noreply@zaplit.com
- [ ] Verify DKIM signature passes
- [ ] Verify SPF passes
- [ ] Check email headers for authentication results

---

## 📋 Files Created

1. `/Users/devonshigaki/Downloads/zaplit/CLOUDFLARE_DNS_UPDATES.md` - DNS update instructions
2. `/Users/devonshigaki/Downloads/zaplit/HESTIA_MAIL_SETUP_STATUS.md` - This status report

---

## 🔧 Useful Commands

```bash
# SSH to mail server
gcloud compute ssh hestia-mail --zone=us-central1-a --project=zaplit-website-prod

# Check mail domain status
sudo /usr/local/hestia/bin/v-list-mail-domain zaplitadmin zaplit.com

# List email accounts
sudo /usr/local/hestia/bin/v-list-mail-accounts zaplitadmin zaplit.com

# View DKIM DNS record
sudo /usr/local/hestia/bin/v-list-mail-domain-dkim-dns zaplitadmin zaplit.com

# Restart Exim
sudo systemctl restart exim4

# Check Exim status
sudo systemctl status exim4

# View Exim logs
sudo tail -f /var/log/exim4/mainlog
```

---

## 📞 Next Actions Required

1. **Update DNS records in Cloudflare** (see CLOUDFLARE_DNS_UPDATES.md)
2. **Request PTR record from GCP Support**
3. **Enable SSL in Hestia CP** (after DNS propagates)
4. **Test email sending and deliverability**

---

**Status:** Installation complete. DNS updates and SSL enablement required before use.
