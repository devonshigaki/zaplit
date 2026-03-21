# DNS Configuration Verification Status

**Date:** March 21, 2026  
**Domain:** zaplit.com  
**DNS Provider:** Namecheap

---

## Current DNS Status

### ✅ Records Propagated Successfully

| Record Type | Host | Status | Notes |
|-------------|------|--------|-------|
| **SPF** | @ | ✅ Active | `v=spf1 a mx ip4:136.113.99.87 include:spf.brevo.com ~all` |
| **DMARC** | _dmarc | ✅ Active | `v=DMARC1; p=none; rua=mailto:admin@zaplit.com` |
| **DKIM** | mail._domainkey | ✅ Active | `v=DKIM1; k=rsa; p=MIIBIjAN...` |
| **A** | mail | ✅ Active | 136.113.99.87 |
| **A** | webmail | ✅ Active | 136.113.99.87 |
| **A** | n8n | ✅ Active | 34.132.198.35 |
| **A** | crm | ✅ Active | 34.122.83.0 |

### ⚠️ Records With Issues

| Record Type | Host | Status | Issue |
|-------------|------|--------|-------|
| **MX** | @ | ❌ NOT PROPAGATING | Record configured but not resolving |

---

## MX Record Issue Analysis

### Problem
The MX record is configured in Namecheap Advanced DNS but is not resolving in DNS queries.

### Possible Causes

1. **MAIL SETTINGS Conflict**
   - In Namecheap, the "MAIL SETTINGS" section has "Custom MX" selected
   - This may conflict with manually created MX records in Advanced DNS
   - **Solution:** Either:
     a) Use the MAIL SETTINGS "Custom MX" option (recommended), OR
     b) Set MAIL SETTINGS to "None" and use manual DNS MX records

2. **Old SPF Records Still Present**
   - Google DNS cache shows old SPF records:
     - `v=spf1 include:emailsrvr.com ~all` (Rackspace legacy)
     - `v=spf1 a mx ip4:34.132.198.35 ~all` (old IP)
   - These should be removed to avoid conflicts

### Recommended Actions

#### Option 1: Use Namecheap MAIL SETTINGS (Recommended)

1. Go to Domain List → Manage → MAIL SETTINGS
2. Select "Custom MX" from dropdown (already done)
3. Add MX record:
   - Host: `@`
   - Value: `mail.zaplit.com`
   - Priority: `10`
4. Save changes
5. This may override Advanced DNS MX records - that's OK

#### Option 2: Use Advanced DNS Only

1. Go to Domain List → Manage → MAIL SETTINGS
2. Select "None" (not "Custom MX")
3. Keep the MX record in Advanced DNS:
   - Type: MX
   - Host: `@`
   - Value: `mail.zaplit.com`
   - Priority: `10`
4. Save changes

#### Clean Up Old SPF Records

1. In Advanced DNS, look for TXT records:
   - `v=spf1 include:emailsrvr.com ~all` → **DELETE**
   - `v=spf1 a mx ip4:34.132.198.35 ~all` → **DELETE** (old IP)
2. Keep only:
   - `v=spf1 a mx ip4:136.113.99.87 include:spf.brevo.com ~all`

---

## Verification Commands

```bash
# Check MX record
nslookup -type=MX zaplit.com

# Check SPF
nslookup -type=TXT zaplit.com | grep spf

# Check DMARC
nslookup -type=TXT _dmarc.zaplit.com

# Check DKIM
nslookup -type=TXT mail._domainkey.zaplit.com

# Check all from authoritative DNS
dig @dns1.registrar-servers.com zaplit.com MX
```

---

## Firewall Status

The GCP firewall rule for mail ports is created and the `hestia-mail` tag has been added to the VM:

```bash
gcloud compute firewall-rules describe allow-hestia-mail
# Shows: tcp:25,587,465,993,995,8083 allowed from 0.0.0.0/0
```

However, ports are not responding yet. This is likely because:
1. The VM needs to reboot to apply firewall changes (recommended)
2. The services may need to be restarted

**Recommendation:** Schedule a maintenance window to restart the hestia-mail VM.

---

## Mail Server Connectivity Test Results

| Port | Service | Status |
|------|---------|--------|
| 25 | SMTP | ❌ Blocked (ISP/gateway block common) |
| 587 | Submission | ❌ Not responding |
| 465 | SMTPS | ❌ Not responding |
| 993 | IMAPS | ❌ Not responding |
| 995 | POP3S | ❌ Not responding |
| 8083 | Hestia CP | ❌ Not responding |

**Note:** Port 25 is commonly blocked by ISPs to prevent spam. Port 587 should work once the VM is properly configured with the firewall tag.

---

## Summary

| Component | Status |
|-----------|--------|
| DNS Records (SPF, DMARC, DKIM) | ✅ Working |
| DNS Records (MX) | ⚠️ Needs fix in Namecheap |
| Firewall Rules | ✅ Created |
| VM Firewall Tag | ✅ Added |
| Mail Services | ⚠️ VM restart recommended |

**Next Steps:**
1. Fix MX record in Namecheap (use MAIL SETTINGS or set to None)
2. Remove old conflicting SPF records
3. Restart hestia-mail VM to apply firewall changes
4. Verify mail services are listening on ports 587, 993
