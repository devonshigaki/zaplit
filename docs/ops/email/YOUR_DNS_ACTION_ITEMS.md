# Your DNS Action Items for Hestia Email

## What You Need To Do (Checklist)

### Step 1: Add These DNS Records

Log into your DNS provider (Cloudflare, GoDaddy, Namecheap, etc.) and add these records:

| Type | Name | Value | Priority |
|------|------|-------|----------|
| **A** | `mail` | `YOUR_SERVER_IP` | - |
| **A** | `webmail` | `YOUR_SERVER_IP` | - |
| **MX** | `@` (or your domain) | `mail.yourdomain.com` | 10 |
| **TXT** | `@` | `v=spf1 a mx ip4:YOUR_SERVER_IP ~all` | - |
| **TXT** | `_dmarc` | `v=DMARC1; p=none; rua=mailto:admin@yourdomain.com` | - |

**Example if your domain is zaplit.com and server IP is 203.0.113.10:**
```
A     mail.zaplit.com        → 203.0.113.10
A     webmail.zaplit.com     → 203.0.113.10
MX    zaplit.com             → mail.zaplit.com (priority 10)
TXT   zaplit.com             → "v=spf1 a mx ip4:203.0.113.10 ~all"
TXT   _dmarc.zaplit.com      → "v=DMARC1; p=none; rua=mailto:admin@zaplit.com"
```

**⚠️ IMPORTANT if using Cloudflare:**
- Set `mail` and `webmail` records to **DNS Only** (grey cloud ☁️)
- Do NOT proxy them (orange cloud breaks email)

---

### Step 2: Request PTR/Reverse DNS Record

**You MUST email your VPS provider** to set this up. Use this template:

```
Subject: PTR Record Request for [YOUR_SERVER_IP]

Hello,

Please set the PTR (reverse DNS) record for IP [YOUR_SERVER_IP] to:
mail.yourdomain.com

This is required for email deliverability. Thank you.
```

**Where to submit by provider:**
- **Hetzner:** Console → Server → Network → Reverse DNS
- **DigitalOcean:** Networking → PTR Records
- **AWS:** Submit support ticket (can't self-configure)
- **Linode:** Networking → Reverse DNS
- **Vultr:** Manage → Settings → Reverse DNS

---

### Step 3: In Hestia Control Panel

1. **Login:** `https://your-server-ip:8083`
2. Go to **Mail** → **Add Domain**
3. Enter your domain (e.g., `yourdomain.com`)
4. ✅ **Check:** "Enable DKIM support" (important!)
5. Click **Save**

---

### Step 4: Get DKIM Key from Hestia

1. In Hestia, go to **Mail** → Click your domain
2. Look for the DKIM public key (starts with `v=DKIM1; k=rsa; p=`)
3. **OR** SSH to your server and run:
   ```bash
   v-list-mail-domain-dkim admin yourdomain.com
   ```
4. Copy the public key (long string)

---

### Step 5: Add DKIM DNS Record

Back in your DNS provider, add:

| Type | Name | Value |
|------|------|-------|
| **TXT** | `mail._domainkey` | `v=DKIM1; k=rsa; p=[THE_KEY_FROM_STEP_4]` |

---

### Step 6: Create Email Account in Hestia

1. **Mail** → Click your domain
2. Click **Add Account**
3. Enter:
   - **Account:** `noreply` (or `admin`, `hello`, etc.)
   - **Password:** Generate a strong password
   - **Quota:** Leave empty for unlimited
4. Click **Save**
5. **Write down the credentials shown!**

---

### Step 7: Enable SSL for Mail

1. **Mail** → Select your domain → **Edit**
2. ✅ Check "Enable SSL for this domain"
3. ✅ Check "Use Let's Encrypt to obtain SSL certificate"
4. Click **Save**
5. Wait 30-60 seconds

---

### Step 8: Test Everything

**Test DNS propagation:**
```bash
# Check A record
dig mail.yourdomain.com A

# Check MX record
dig yourdomain.com MX

# Check SPF
dig yourdomain.com TXT | grep spf

# Check DKIM
dig mail._domainkey.yourdomain.com TXT
```

**Test email sending:**
1. Go to `https://webmail.yourdomain.com`
2. Login with: `noreply@yourdomain.com` + password
3. Send a test email
4. Check spam score at: https://www.mail-tester.com

---

## Quick Reference Card

### Email Client Settings
| Protocol | Server | Port | Encryption |
|----------|--------|------|------------|
| **IMAP** | mail.yourdomain.com | 993 | SSL/TLS |
| **SMTP** | mail.yourdomain.com | 587 | STARTTLS |
| **SMTP (alt)** | mail.yourdomain.com | 465 | SSL/TLS |

### URLs
| Service | URL |
|---------|-----|
| Hestia CP | `https://your-server-ip:8083` |
| Webmail | `https://webmail.yourdomain.com` |

---

## Troubleshooting Common Issues

### Issue: Emails going to spam
**Fix:** Make sure you have:
- ✅ SPF record
- ✅ DKIM record  
- ✅ DMARC record
- ✅ PTR/Reverse DNS set

### Issue: Can't send emails (port 25 blocked)
**Fix:** Most VPS block port 25. Configure SMTP relay in Hestia:
- Go to **Settings** → **Mail** → **Global SMTP Relay**
- Use Amazon SES (62,000 emails/month free) or SMTP2GO

### Issue: Can't access webmail
**Fix:** 
- Check DNS: `dig webmail.yourdomain.com`
- If using Cloudflare, ensure it's set to DNS Only (grey cloud)

---

## Summary Checklist

- [ ] Add A records for `mail` and `webmail`
- [ ] Add MX record
- [ ] Add SPF TXT record
- [ ] Add DMARC TXT record
- [ ] Request PTR record from VPS provider
- [ ] Create mail domain in Hestia
- [ ] Copy DKIM key and add DNS record
- [ ] Create email account
- [ ] Enable SSL with Let's Encrypt
- [ ] Test with mail-tester.com

**Estimated time:** 15-20 minutes
