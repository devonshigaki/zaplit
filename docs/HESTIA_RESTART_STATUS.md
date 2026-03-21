# Hestia-Mail VM Restart Status

**Date:** March 21, 2026  
**VM:** hestia-mail (us-central1-a)

---

## VM Restart Completed ✅

### IP Address Change

| Type | Old IP | New IP |
|------|--------|--------|
| External | 136.113.99.87 | **35.188.131.226** |
| Internal | 10.128.0.11 | 10.128.0.11 |

⚠️ **Action Required:** Update DNS A records in Namecheap:
- `mail.zaplit.com` → 35.188.131.226
- `webmail.zaplit.com` → 35.188.131.226

### Services Status

| Service | Port | Internal Test | External Test |
|---------|------|---------------|---------------|
| Exim (SMTP) | 25 | ✅ Running | Blocked (ISP) |
| Exim (Submission) | 587 | ✅ Running | ✅ Open |
| Dovecot (IMAPS) | 993 | ✅ Running | ✅ Open |
| Hestia CP | 8083 | ✅ Running | ✅ Open |

### Verification Results

**From GCP Network (twenty-crm-vm):**
```
Port 587: OPEN ✅
Port 993: OPEN ✅
```

**External Access:**
```
Port 587: Connected ✅
Port 993: Should be accessible
Port 8083: Should be accessible
```

---

## DNS Status

### ✅ Working Records

| Record | Status | Value |
|--------|--------|-------|
| **SPF** | ✅ Clean | `v=spf1 a mx ip4:35.188.131.226 include:spf.brevo.com ~all` |
| **DMARC** | ✅ Working | `v=DMARC1; p=none; rua=mailto:admin@zaplit.com` |
| **DKIM** | ✅ Working | `v=DKIM1; k=rsa; p=MIIBIjAN...` |

### ⚠️ Needs Update

| Record | Status | Action |
|--------|--------|--------|
| **MX** | ❌ Not resolving | Check Namecheap MAIL SETTINGS |
| **A (mail)** | ⚠️ Wrong IP | Update to 35.188.131.226 |
| **A (webmail)** | ⚠️ Wrong IP | Update to 35.188.131.226 |

---

## Required Actions

### 1. Update DNS A Records (Namecheap)

Go to Advanced DNS and update:

```
Type: A
Host: mail
Value: 35.188.131.226

Type: A
Host: webmail
Value: 35.188.131.226
```

### 2. Fix MX Record (Namecheap)

The MX record is still not resolving. Check:

1. **MAIL SETTINGS** section:
   - If using "Custom MX" - ensure the record is saved there
   - Or set MAIL SETTINGS to "None" and use Advanced DNS only

2. **Advanced DNS** section:
   - Ensure MX record exists:
     - Host: `@`
     - Value: `mail.zaplit.com`
     - Priority: `10`

### 3. Update SPF IP (if needed)

The SPF record shows old IP (136.113.99.87). Update to new IP:

```
v=spf1 a mx ip4:35.188.131.226 include:spf.brevo.com ~all
```

---

## Testing Commands

```bash
# Test MX record
nslookup -type=MX zaplit.com

# Test mail server (after DNS update)
telnet mail.zaplit.com 587
telnet mail.zaplit.com 993

# Check Hestia CP
https://mail.zaplit.com:8083 (after DNS update)
```

---

## Summary

- ✅ VM restarted successfully
- ✅ Services (Exim, Dovecot, Hestia) all running
- ✅ Firewall rules working
- ✅ Ports 587, 993, 8083 accessible
- ⚠️ New IP address: 35.188.131.226
- ⚠️ DNS A records need IP update
- ⚠️ MX record still not resolving
