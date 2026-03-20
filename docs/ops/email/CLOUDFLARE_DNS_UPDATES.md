# Cloudflare DNS Update Instructions

**Date:** March 20, 2026  
**Action Required:** Update DNS records in Cloudflare for new mail server

---

## Summary

Hestia Control Panel has been installed and configured on the new mail server:
- **Server:** hestia-mail (136.113.99.87)
- **Hestia Access:** https://mail.zaplit.com:8083 or https://136.113.99.87:8083
- **Username:** zaplitadmin

---

## DNS Records to Update

### 1. UPDATE EXISTING A RECORDS

| Type | Name | Old Value | New Value | Proxy Status |
|------|------|-----------|-----------|--------------|
| **A** | `mail` | 34.132.198.35 | **136.113.99.87** | 🚫 DNS Only (grey cloud) |
| **A** | `webmail` | 34.132.198.35 | **136.113.99.87** | 🚫 DNS Only (grey cloud) |

### 2. UPDATE MX RECORD

| Type | Name | Value | Priority | TTL |
|------|------|-------|----------|-----|
| **MX** | `@` | `mail.zaplit.com` | 10 | Auto |

### 3. UPDATE SPF RECORD

| Type | Name | Value | TTL |
|------|------|-------|-----|
| **TXT** | `@` | `v=spf1 a mx ip4:136.113.99.87 ~all` | Auto |

### 4. ADD DKIM RECORD (NEW)

| Type | Name | Value | TTL |
|------|------|-------|-----|
| **TXT** | `mail._domainkey` | `v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAzhI/KCaRXTjUybe2DUc6pMU0KBaEdflcF0vpmKyJjHhJs5lvcaDgV5/28KMMNtPno/kv4niPViH4rnxE+cNgLedPnB4z32v8FRdOaaksXKC+G3wnYEq1oEp8+xHNAWILROadvcQXsYRWjojja4po10DEu3AhXaGNAObde1us8vaiwcWGctAbpSyq/PBZ0McRFHtqQVKed0pssd0yg6L7W1msvvA74OnD7+CO90wIPz2S/oaqbQLbN5SAs8wtJ+VA3pAsiHqqO3//y0+3lo/3dPV/8nIb0mORyPdzMAFtpE19R38P+0DVfwy17NqjfqAW2iY7E7g/aCjs/63fGzEkXQIDAQAB` | Auto |

### 5. VERIFY DMARC RECORD EXISTS

| Type | Name | Value | TTL |
|------|------|-------|-----|
| **TXT** | `_dmarc` | `v=DMARC1; p=none; rua=mailto:admin@zaplit.com` | Auto |

---

## Step-by-Step Cloudflare Instructions

### Step 1: Login to Cloudflare
1. Go to https://dash.cloudflare.com
2. Select the `zaplit.com` domain
3. Go to **DNS** → **Records**

### Step 2: Update A Records
1. Find `mail` A record
2. Change IP from `34.132.198.35` to `136.113.99.87`
3. Click the orange cloud to make it grey (DNS Only)
4. Click Save
5. Repeat for `webmail` A record

### Step 3: Update SPF Record
1. Find TXT record with `@` name containing `v=spf1`
2. Change value to: `v=spf1 a mx ip4:136.113.99.87 ~all`
3. Click Save

### Step 4: Add DKIM Record
1. Click **Add Record**
2. Type: **TXT**
3. Name: `mail._domainkey`
4. Value: Paste the complete DKIM value from above
5. TTL: Auto
6. Click Save

---

## Verification Commands

After DNS updates (wait 5-15 minutes for propagation):

```bash
# Check A record
dig mail.zaplit.com A

# Check MX record
dig zaplit.com MX

# Check SPF record
dig zaplit.com TXT | grep spf

# Check DKIM record
dig mail._domainkey.zaplit.com TXT

# Check DMARC record
dig _dmarc.zaplit.com TXT
```

Or use online tools:
- https://mxtoolbox.com/SuperTool.aspx
- https://dnschecker.org

---

## Next Steps After DNS Update

1. **Request PTR/Reverse DNS** from GCP support:
   - Email: Set PTR for 136.113.99.87 → mail.zaplit.com
   
2. **Enable SSL in Hestia**:
   - Login: https://136.113.99.87:8083
   - Go to Mail → zaplit.com → Edit
   - Enable SSL + Let's Encrypt

3. **Test Email**:
   - Send test email from noreply@zaplit.com
   - Verify DKIM/SPF/DMARC pass

---

## Current Hestia Configuration

| Setting | Value |
|---------|-------|
| **Domain** | zaplit.com |
| **DKIM** | Enabled ✓ |
| **Accounts** | noreply@zaplit.com, info@zaplit.com |
| **SMTP Relay** | smtp-relay.brevo.com:587 ✓ |
| **Antivirus** | ClamAV ✓ |
| **Antispam** | SpamAssassin ✓ |
| **Webmail** | webmail.zaplit.com (Roundcube) |

---

## Brevo SMTP Relay Configuration

Already configured in Hestia:
- Host: `smtp-relay.brevo.com`
- Port: `587`
- No authentication required (IP-based)

---

## Support

- Hestia Admin: https://136.113.99.87:8083
- Credentials: zaplitadmin / [password from installation]
