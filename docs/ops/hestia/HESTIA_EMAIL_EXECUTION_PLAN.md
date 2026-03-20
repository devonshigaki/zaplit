# Hestia Email + WordPress E-Signature: Complete Execution Plan

**Date:** March 19, 2026  
**Status:** Ready for Execution  
**Prerequisites:** Hestia CP installed, domain registered, VPS/server access

---

## Phase 0: Pre-Flight Checklist

Before starting, confirm you have:

- [ ] Hestia Control Panel installed and accessible
- [ ] Domain name registered and DNS access (Cloudflare/registrar)
- [ ] VPS/server IP address
- [ ] WordPress site ready for e-signature plugin installation
- [ ] 30-60 minutes of uninterrupted time

---

## Phase 1: DNS Configuration (Your Action Required)

### 1.1 Create Essential DNS Records

Add these records at your DNS provider (Cloudflare recommended):

| Type | Name | Value | Priority | TTL |
|------|------|-------|----------|-----|
| **A** | `mail` | `YOUR_SERVER_IP` | - | Auto |
| **A** | `webmail` | `YOUR_SERVER_IP` | - | Auto |
| **MX** | `@` | `mail.yourdomain.com` | 10 | Auto |
| **TXT** | `@` | `v=spf1 a mx ip4:YOUR_SERVER_IP ~all` | - | Auto |
| **TXT** | `_dmarc` | `v=DMARC1; p=none; rua=mailto:admin@yourdomain.com` | - | Auto |

**⚠️ IMPORTANT Cloudflare Settings:**
- Set `mail.yourdomain.com` to **DNS Only** (grey cloud ☁️)
- Set `webmail.yourdomain.com` to **DNS Only** (grey cloud ☁️)
- Do NOT proxy these records (orange cloud breaks email)

### 1.2 Request PTR/Reverse DNS (Critical for Deliverability)

**Action Required:** Contact your VPS provider support

**Email Template:**
```
Subject: PTR Record Request for [YOUR_SERVER_IP]

Hello,

Please set the PTR (reverse DNS) record for IP [YOUR_SERVER_IP] to:
mail.yourdomain.com

This is required for email deliverability. Thank you.
```

**Provider-Specific Instructions:**
- **Hetzner:** Hetzner Console → Projects → Server → Network → Reverse DNS
- **DigitalOcean:** Networking → PTR Records
- **AWS EC2:** Contact AWS support (cannot self-configure)
- **Linode:** Networking → Reverse DNS
- **Vultr:** Manage → Settings → Reverse DNS

### 1.3 Verify DNS Propagation

Wait 5-15 minutes, then verify:

```bash
# Check A record
dig mail.yourdomain.com A

# Check MX record
dig yourdomain.com MX

# Check SPF record
dig yourdomain.com TXT | grep spf
```

Or use online tools:
- https://mxtoolbox.com/SuperTool.aspx
- https://dnschecker.org

---

## Phase 2: Hestia Control Panel Configuration

### 2.1 Login to Hestia CP

Navigate to: `https://your-server:8083`

### 2.2 Create Mail Domain

1. Go to **Mail** tab
2. Click **Add Domain**
3. Enter your domain: `yourdomain.com`
4. ✅ **CHECK:** Enable DKIM support (critical!)
5. Click **Save**

### 2.3 Get DKIM Public Key

After creating mail domain:

1. Go to **Mail** → Select your domain
2. Look for DKIM information or run SSH command:

```bash
# SSH into your server and run:
v-list-mail-domain-dkim your-hestia-username yourdomain.com
```

3. Copy the public key (starts with `v=DKIM1; k=rsa; p=`)

### 2.4 Add DKIM DNS Record

Back at your DNS provider, add:

| Type | Name | Value | TTL |
|------|------|-------|-----|
| **TXT** | `mail._domainkey` | `v=DKIM1; k=rsa; p=YOUR_PUBLIC_KEY_HERE` | Auto |

**Note:** The public key is long (~300+ characters). DNS providers handle this differently:
- Cloudflare: Paste full string, it auto-splits
- Some providers: Need to split into multiple quoted strings

### 2.5 Enable SSL for Mail Domain

1. **Mail** → Select your domain → **Edit**
2. ✅ Check **"Enable SSL for this domain"**
3. ✅ Check **"Use Let's Encrypt to obtain SSL certificate"**
4. Click **Save**
5. Wait 30-60 seconds for certificate generation

### 2.6 Create Email Account

1. **Mail** → Click on your domain
2. Click **Add Account**
3. Configure:
   - **Account:** `noreply` (or `admin`, `hello`, etc.)
   - **Password:** Generate strong password (save in password manager!)
   - **Quota:** Leave empty for unlimited (or set limit)
4. Click **Save**

### 2.7 Note SMTP Credentials

Hestia will display connection settings. Write these down:

| Setting | Value |
|---------|-------|
| **Email Address** | `noreply@yourdomain.com` |
| **Username** | `noreply@yourdomain.com` (full email) |
| **Password** | [your password] |
| **SMTP Server** | `mail.yourdomain.com` |
| **SMTP Port** | `587` (STARTTLS) |
| **Encryption** | `STARTTLS` or `TLS` |

---

## Phase 3: Email Deliverability Setup

### 3.1 Test Port 25 Status

SSH into your server:

```bash
telnet ASPMX.L.GOOGLE.COM 25
```

**If connection times out:** Port 25 is blocked → Use SMTP Relay (Section 3.2)

**If connected:** Type `quit` and press Enter → Port 25 is open

### 3.2 Configure SMTP Relay (If Port 25 Blocked)

Most cloud providers (AWS, Azure, Hetzner, DigitalOcean) block port 25.

**Recommended: Amazon SES (Free Tier: 62,000 emails/month)**

1. Sign up at https://aws.amazon.com/ses/
2. Verify your domain in SES console
3. Create SMTP credentials
4. In HestiaCP: **Settings** → **Mail** → **Global SMTP Relay**
   - Host: `email-smtp.us-east-1.amazonaws.com`
   - Port: `587`
   - Username: [SES SMTP username]
   - Password: [SES SMTP password]

**Alternative Free Options:**
- **SMTP2GO:** 1,000 emails/month free
- **Brevo:** 300 emails/day free
- **Mailgun:** 5,000 emails/month (3 months free trial)

### 3.3 Verify Email Authentication

Use online tools to verify your setup:

1. **Mail Tester:** https://www.mail-tester.com
   - Send email to generated address
   - Check score (aim for 10/10)

2. **MXToolbox:** https://mxtoolbox.com
   - Check: MX, SPF, DKIM, DMARC, Blacklists

3. **Google Admin Toolbox:** https://toolbox.googleapps.com/apps/checkmx/
   - Enter your domain
   - Verify all checks pass

### 3.4 Expected Test Results

| Check | Expected Result |
|-------|-----------------|
| **MX Record** | ✅ Found: mail.yourdomain.com |
| **SPF** | ✅ Valid SPF record found |
| **DKIM** | ✅ Valid signature |
| **DMARC** | ✅ Policy found |
| **Reverse DNS** | ✅ PTR matches mail.yourdomain.com |
| **SpamAssassin Score** | < 3.0 (ideally < 1.0) |

---

## Phase 4: WordPress SMTP Configuration

### 4.1 Install SMTP Plugin

**Recommended: FluentSMTP (Free, Best Features)**

1. WordPress Admin → Plugins → Add New
2. Search: "FluentSMTP"
3. Install and Activate

**Alternative: WP Mail SMTP (Postmark, SendGrid integration)**

### 4.2 Configure FluentSMTP with Hestia

1. Go to **Settings** → **FluentSMTP**
2. Click **Add New Connection**
3. Select **Other SMTP**
4. Configure:

| Setting | Value |
|---------|-------|
| **From Email** | `noreply@yourdomain.com` |
| **From Name** | `Your Company Name` |
| **SMTP Host** | `mail.yourdomain.com` |
| **SMTP Port** | `587` |
| **Encryption** | `TLS` |
| **Auto TLS** | ✅ Enabled |
| **Authentication** | ✅ Enabled |
| **Username** | `noreply@yourdomain.com` |
| **Password** | [Your email password] |

5. Click **Save Connection**
6. Click **Test Email** to verify

### 4.3 Test WordPress Email

Send test email from WordPress:

1. FluentSMTP → **Email Test**
2. Enter your personal email
3. Click **Send Test Email**
4. Check inbox and spam folder

---

## Phase 5: WordPress E-Signature Setup

### 5.1 Choose E-Signature Solution

**For Budget-Conscious (Recommended):**
- **WP E-Signature** by ApproveMe ($249/year or $699 lifetime)
- Unlimited users, unlimited documents
- Self-hosted (data stays on your server)

**For International/EU Compliance:**
- **Legal Signing** + Gravity Forms ($199 + $59/year)
- eIDAS compliant (EU regulation)

**For Enterprise:**
- **DocuSign** ($25/user/month)
- Gold standard, highest legal validity

### 5.2 Recommended Stack (Budget + Performance)

| Component | Solution | Cost |
|-----------|----------|------|
| **E-Signature** | WP E-Signature Elite | $699 lifetime |
| **Forms** | Built-in (WP E-Sig) or Gravity Forms | $0-59/year |
| **Email Delivery** | Amazon SES | Free tier |
| **Storage** | Local + S3 backup | ~$5/month |

### 5.3 Install WP E-Signature

1. Purchase from: https://aprv.me/wpesignature
2. Download plugin files
3. WordPress → Plugins → Add New → Upload
4. Activate plugin
5. Enter license key

### 5.4 Configure WP E-Signature

1. **WP E-Signature** → **Settings**
2. General Settings:
   - **Company Name:** Your Business Name
   - **Admin Email:** your-email@yourdomain.com
   - **Time Zone:** Your timezone
   - **Date Format:** Choose preference

3. Email Settings:
   - **From Email:** `noreply@yourdomain.com`
   - **From Name:** Your Company Name
   - **Email Logo:** Upload company logo

4. Security Settings:
   - ✅ Enable document password protection
   - ✅ Enable audit trail
   - Set document retention policy

### 5.5 Create Your First Document

1. **WP E-Signature** → **Add New**
2. Choose template or start blank
3. Add form fields:
   - **Signature Field** (required)
   - **Text Fields** (name, date, etc.)
   - **Checkbox Fields** (terms agreement)
4. Configure signer settings:
   - Add signer email addresses
   - Set signing order (if multiple signers)
5. Click **Publish**

### 5.6 Send for Signature

1. Open published document
2. Click **Send** or copy signing link
3. Enter signer email addresses
4. Customize email message
5. Click **Send Document**

---

## Phase 6: Security Hardening

### 6.1 Enable Additional Hestia Security

1. **Mail** → Select domain → **Edit**
2. ✅ Enable **Anti-Spam Protection** (SpamAssassin)
3. ✅ Enable **Anti-Virus Protection** (ClamAV)
4. Set **Spam Score Threshold:** 5
5. Save

### 6.2 Configure Fail2ban

SSH into server:

```bash
# Check fail2ban status
fail2ban-client status

# Should show: exim, dovecot jails active
# If not, restart:
systemctl restart fail2ban
```

### 6.3 Set Strong Password Policy

1. HestiaCP → **Users** → Edit your user
2. Set strong password
3. Enable 2FA if available

### 6.4 Regular Maintenance Tasks

| Task | Frequency | Command/Action |
|------|-----------|----------------|
| Check mail queue | Weekly | `exim -bp` |
| Review spam logs | Weekly | Check Hestia Mail logs |
| Update HestiaCP | Monthly | `v-update-sys-hestia-all` |
| Backup email data | Daily | Hestia backup or custom script |
| Monitor blacklist | Monthly | https://mxtoolbox.com/blacklists.aspx |

---

## Troubleshooting Guide

### Issue: Emails Going to Spam

**Diagnosis:**
```bash
# Check mail score
curl -s https://www.mail-tester.com/ | grep -o 'score=[0-9]*' || echo "Use web interface"
```

**Solutions:**
1. Verify SPF, DKIM, DMARC records (MXToolbox)
2. Check reverse DNS is set correctly
3. Warm up IP: Send 10-50 emails/day initially
4. Use SMTP relay if IP is blacklisted

### Issue: Cannot Connect to SMTP

**Diagnosis:**
```bash
# Test SMTP connection from server
telnet mail.yourdomain.com 587

# Test from external
openssl s_client -connect mail.yourdomain.com:587 -starttls smtp
```

**Solutions:**
1. Check firewall: `v-list-firewall`
2. Verify SSL certificate: Check Hestia mail domain settings
3. Check Exim is running: `systemctl status exim4`

### Issue: WordPress Emails Not Sending

**Solutions:**
1. Check FluentSMTP connection test
2. Verify credentials in HestiaCP
3. Check WordPress error log: `wp-content/debug.log`
4. Try alternative port: 465 (SSL) instead of 587

### Issue: Cannot Access Webmail

**Solutions:**
1. Verify DNS: `dig webmail.yourdomain.com`
2. Check Cloudflare proxy status (should be grey ☁️)
3. Try direct IP: `https://your-server-ip/roundcube`
4. Check Roundcube service: `systemctl status dovecot`

---

## Quick Reference Card

### HestiaCP Mail URLs
| Service | URL |
|---------|-----|
| Control Panel | `https://your-server:8083` |
| Webmail | `https://webmail.yourdomain.com` |

### Email Client Settings
| Protocol | Server | Port | Encryption |
|----------|--------|------|------------|
| IMAP | mail.yourdomain.com | 993 | SSL/TLS |
| SMTP | mail.yourdomain.com | 587 | STARTTLS |
| SMTP Alt | mail.yourdomain.com | 465 | SSL/TLS |

### DNS Records Summary
```
A     mail.yourdomain.com     YOUR_SERVER_IP
A     webmail.yourdomain.com  YOUR_SERVER_IP
MX    yourdomain.com          mail.yourdomain.com (priority 10)
TXT   yourdomain.com          "v=spf1 a mx ip4:YOUR_IP ~all"
TXT   _dmarc.yourdomain.com   "v=DMARC1; p=none; rua=mailto:admin@yourdomain.com"
TXT   mail._domainkey         "v=DKIM1; k=rsa; p=DKIM_KEY_FROM_HESTIA"
```

---

## Execution Timeline

| Phase | Task | Time Required | Your Action |
|-------|------|---------------|-------------|
| 1 | DNS Records | 10 min | Add A, MX, SPF, DMARC records |
| 1 | PTR Record Request | 5 min | Email VPS provider |
| 2 | Hestia Mail Setup | 15 min | Create domain, email, SSL |
| 2 | DKIM DNS Record | 5 min | Add DKIM TXT record |
| 3 | Deliverability Test | 10 min | Use mail-tester.com |
| 4 | WordPress SMTP | 10 min | Install FluentSMTP, configure |
| 5 | E-Signature Setup | 30 min | Install plugin, create document |
| 6 | Security Hardening | 10 min | Enable anti-spam, configure |
| **Total** | | **~95 minutes** | |

---

## Next Steps After Completion

1. **Test Complete Workflow:**
   - Create test document in WP E-Signature
   - Send to your personal email
   - Sign document
   - Verify email notifications work

2. **Document Your Setup:**
   - Save SMTP credentials in password manager
   - Document any custom configurations
   - Set calendar reminders for maintenance

3. **Monitor Performance:**
   - Check mail delivery rates
   - Monitor spam scores monthly
   - Review document completion rates

---

**Questions or Issues?**

- HestiaCP Forums: https://forum.hestiacp.com
- WordPress Support: https://wordpress.org/support
- Email Testing: https://www.mail-tester.com
- DNS Checking: https://mxtoolbox.com
