# DNS Email Configuration Quick Start Checklist

**One-page actionable checklist for implementing email DNS records**

---

## Pre-Flight Checklist

- [ ] Identify your email provider (Google Workspace, Microsoft 365, etc.)
- [ ] Access your DNS management panel (Cloudflare, GoDaddy, Route53, etc.)
- [ ] List ALL services that send email on your behalf
- [ ] Create dmarc@yourdomain.com mailbox for reports

---

## Required DNS Records

### 1. MX Records (For Receiving Email)

| Priority | Value |
|----------|-------|
| 1 | `aspmx.l.google.com.` (Google) |
| 5 | `alt1.aspmx.l.google.com.` |
| 5 | `alt2.aspmx.l.google.com.` |

**Or for Microsoft 365:**
| Priority | Value |
|----------|-------|
| 0 | `yourdomain-com.mail.protection.outlook.com.` |

---

### 2. SPF Record (Authorization)

**Record Details:**
- **Type:** TXT
- **Name:** `@` (or your domain)
- **TTL:** 600 seconds

**Template:**
```
v=spf1 [SERVICES] ~all
```

**Common Service Includes:**
| Service | Include Statement |
|---------|-------------------|
| Google Workspace | `include:_spf.google.com` |
| Microsoft 365 | `include:spf.protection.outlook.com` |
| SendGrid | `include:sendgrid.net` |
| Mailgun | `include:mailgun.org` |
| Mailchimp | `include:servers.mcsv.net` |
| Amazon SES | `include:amazonses.com` |
| Custom IP | `ip4:203.0.113.10` or `ip4:203.0.113.0/24` |

**Complete Examples:**
```
# Google Workspace only
v=spf1 include:_spf.google.com ~all

# Google + SendGrid
v=spf1 include:_spf.google.com include:sendgrid.net ~all

# Multiple services + custom IP
v=spf1 include:_spf.google.com include:sendgrid.net ip4:203.0.113.0/24 ~all
```

⚠️ **CRITICAL:** Only ONE SPF record allowed. Merge multiple into one.

---

### 3. DKIM Record (Cryptographic Signature)

**Record Details:**
- **Type:** TXT
- **Name:** `[selector]._domainkey`
- **TTL:** 600 seconds

**Where to get the value:**
1. Log into your email platform
2. Find "Email Authentication" or "DKIM" settings
3. Generate keys (choose 2048-bit if available)
4. Copy the TXT record value

**Example (Google Workspace):**
- **Name:** `google._domainkey`
- **Value:** (Long string from Google Admin Console)

**Example (Generic):**
- **Name:** `default._domainkey`
- **Value:** `v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQ...`

---

### 4. DMARC Record (Policy & Reporting)

**Record Details:**
- **Type:** TXT
- **Name:** `_dmarc`
- **TTL:** 600 seconds

**Phase 1: Monitor Only (Start Here)**
```
v=DMARC1; p=none; rua=mailto:dmarc@yourdomain.com
```

**Phase 2: Partial Enforcement**
```
v=DMARC1; p=quarantine; pct=25; rua=mailto:dmarc@yourdomain.com
```

**Phase 3: Full Enforcement**
```
v=DMARC1; p=reject; rua=mailto:dmarc@yourdomain.com
```

**Advanced (with forensic reports):**
```
v=DMARC1; p=none; rua=mailto:dmarc@yourdomain.com; ruf=mailto:forensic@yourdomain.com; fo=1
```

---

### 5. PTR Record (Reverse DNS)

**Action Required:**
- Contact your hosting provider/ISP
- Request: "Please set PTR record for IP [YOUR-IP] to mail.yourdomain.com"
- Verify with: `dig -x YOUR-IP +short`

---

## Complete Example: Google Workspace Setup

| Type | Name | Value | Priority |
|------|------|-------|----------|
| MX | @ | `aspmx.l.google.com` | 1 |
| MX | @ | `alt1.aspmx.l.google.com` | 5 |
| MX | @ | `alt2.aspmx.l.google.com` | 5 |
| TXT | @ | `v=spf1 include:_spf.google.com ~all` | - |
| TXT | google._domainkey | `v=DKIM1; k=rsa; p=[KEY-FROM-GOOGLE]` | - |
| TXT | _dmarc | `v=DMARC1; p=none; rua=mailto:dmarc@yourdomain.com` | - |

---

## Complete Example: Microsoft 365 Setup

| Type | Name | Value | Priority |
|------|------|-------|----------|
| MX | @ | `yourdomain-com.mail.protection.outlook.com` | 0 |
| TXT | @ | `v=spf1 include:spf.protection.outlook.com ~all` | - |
| CNAME | selector1._domainkey | `selector1-yourdomain-com._domainkey.yourdomain.onmicrosoft.com` | - |
| CNAME | selector2._domainkey | `selector2-yourdomain-com._domainkey.yourdomain.onmicrosoft.com` | - |
| TXT | _dmarc | `v=DMARC1; p=none; rua=mailto:dmarc@yourdomain.com` | - |
| CNAME | autodiscover | `autodiscover.outlook.com` | - |

---

## Verification Commands

```bash
# Check MX
dig MX yourdomain.com +short

# Check SPF
dig TXT yourdomain.com +short | grep spf

# Check DKIM (replace SELECTOR)
dig TXT SELECTOR._domainkey.yourdomain.com +short

# Check DMARC
dig TXT _dmarc.yourdomain.com +short

# Check PTR (replace IP)
dig -x 203.0.113.10 +short
```

---

## Testing Checklist

After DNS changes:

- [ ] Wait 1 hour for propagation
- [ ] Run all verification commands above
- [ ] Send test email to Gmail account
  - [ ] Open email → "Show original"
  - [ ] Verify: `SPF=PASS`
  - [ ] Verify: `DKIM=PASS`
  - [ ] Verify: `DMARC=PASS`
- [ ] Send test email to Outlook account
  - [ ] Check headers for authentication results
- [ ] Test with https://www.mail-tester.com
  - [ ] Score should be 8/10 or higher
- [ ] Check https://mxtoolbox.com/SuperTool.aspx
  - [ ] No critical errors

---

## Common Mistakes to Avoid

| ❌ Don't | ✅ Do |
|----------|-------|
| Create multiple SPF records | Merge all into one record |
| Use `?all` in SPF | Use `~all` (softfail) or `-all` (hardfail) |
| Start DMARC with `p=reject` | Start with `p=none`, then escalate |
| Forget PTR record | Request from your IP provider |
| Ignore DMARC reports | Check dmarc@ mailbox weekly |
| Use `+all` in SPF | Never use +all (allows anyone) |
| Skip DKIM | Always implement DKIM with SPF |

---

## DMARC Rollout Timeline

| Week | Policy | Action |
|------|--------|--------|
| 1-2 | `p=none` | Monitor only, no enforcement |
| 3-4 | `p=quarantine; pct=10` | 10% of failures to spam |
| 5-6 | `p=quarantine; pct=50` | 50% of failures to spam |
| 7-8 | `p=quarantine; pct=100` | All failures to spam |
| 9+ | `p=reject` | Block all failures |

---

## Quick Troubleshooting

**SPF Failures:**
- Check: Only one SPF record exists
- Check: 10 DNS lookup limit not exceeded
- Check: All sending IPs/services included

**DKIM Failures:**
- Check: Selector name matches exactly
- Check: Key not truncated in DNS
- Check: Email service has DKIM signing enabled

**DMARC Failures:**
- Check: SPF or DKIM passes AND aligns with From domain
- Check: Return-Path domain matches From domain

**Email Going to Spam:**
- Check: PTR record configured
- Check: IP not on blacklists (mxtoolbox.com/blacklists.aspx)
- Check: Content not spammy
- Check: Sending volume consistent (not sudden spikes)

---

## Resources

| Resource | URL |
|----------|-----|
| Mail Tester | https://www.mail-tester.com |
| MXToolbox | https://mxtoolbox.com |
| Google Postmaster | https://postmaster.google.com |
| DMARC Inspector | https://dmarcian.com/dmarc-inspector/ |
| SPF Record Checker | https://www.kitterman.com/spf/validate.html |
| DNSChecker | https://dnschecker.org |

---

**Print this page and check off items as you complete them.**
