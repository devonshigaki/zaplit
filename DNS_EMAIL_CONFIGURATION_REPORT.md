# Comprehensive DNS Email Configuration Report

**Research Date:** March 19, 2026  
**Classification:** DNS Infrastructure & Email Deliverability  
**Scope:** Complete DNS configuration requirements for professional email delivery

---

## Executive Summary

Email authentication through DNS records is no longer optional. As of February 2024, Gmail and Yahoo require bulk senders to implement SPF, DKIM, and DMARC. Outlook.com followed in May 2025 with similar enforcement for high-volume senders. This report provides exact record formats, configuration examples, and step-by-step implementation guidance.

---

## 1. DNS Records Required for Email

### 1.1 MX Records (Mail Exchange)

#### Purpose
MX records direct email traffic to the correct mail servers for your domain. They are fundamental to receiving email.

#### Record Format
```
Type: MX
Name: @ (or domain name)
Priority: Numeric value (lower = higher priority)
Value: Mail server hostname
TTL: 3600-86400 seconds
```

#### Priority System
| Priority | Use Case |
|----------|----------|
| 0-10 | Primary mail servers (highest priority) |
| 20-30 | Secondary/backup mail servers |
| 50+ | Tertiary/failover servers |

#### Complete MX Configuration Examples

**Google Workspace (Gmail):**
```dns
@   IN  MX  1   aspmx.l.google.com.
@   IN  MX  5   alt1.aspmx.l.google.com.
@   IN  MX  5   alt2.aspmx.l.google.com.
@   IN  MX  10  alt3.aspmx.l.google.com.
@   IN  MX  10  alt4.aspmx.l.google.com.
```

**Microsoft 365 (Office 365):**
```dns
@   IN  MX  0   yourdomain-com.mail.protection.outlook.com.
```

**Multiple Servers with Failover:**
```dns
@   IN  MX  10  mail-primary.yourdomain.com.
@   IN  MX  20  mail-backup.yourdomain.com.
@   IN  MX  30  mail-tertiary.yourdomain.com.
```

#### Best Practices
- Always configure at least 2 MX records for redundancy
- Use the lowest priority number (0 or 1) for your primary server
- Ensure MX hostnames have corresponding A records (not CNAMEs)
- Test MX failover during maintenance windows

---

### 1.2 SPF Records (Sender Policy Framework)

#### Purpose
SPF authorizes which IP addresses and servers are permitted to send email on behalf of your domain. It prevents spoofing by allowing receiving servers to verify the sender.

#### Record Format
```
Type: TXT
Name: @ (or domain name)
Value: v=spf1 [mechanisms] [qualifier]all
TTL: 300-3600 seconds
```

#### SPF Mechanisms Reference

| Mechanism | Description | Example |
|-----------|-------------|---------|
| `ip4:` | IPv4 address or CIDR range | `ip4:192.168.1.1` or `ip4:192.168.0.0/24` |
| `ip6:` | IPv6 address or range | `ip6:2001:db8::/32` |
| `a:` | Domain's A record | `a:mail.yourdomain.com` |
| `mx:` | Domain's MX records | `mx:yourdomain.com` |
| `include:` | Reference another SPF record | `include:_spf.google.com` |
| `redirect=` | Redirect to another domain's SPF | `redirect=anotherdomain.com` |
| `exists:` | Complex DNS lookups | `exists:%{i}._spf.yourdomain.com` |
| `all` | Default match for all others | `-all`, `~all`, `?all` |

#### Qualifiers (Action on Match)

| Qualifier | Action | Use Case |
|-----------|--------|----------|
| `+` (pass) | Allow email | Default if omitted |
| `-` (fail) | Reject email | Strict enforcement |
| `~` (softfail) | Accept but mark | Recommended for transition |
| `?` (neutral) | No action | Testing only |

#### SPF Record Examples

**Basic Single Server:**
```dns
@   IN  TXT  "v=spf1 ip4:203.0.113.10 ~all"
```

**Google Workspace + Mail Server:**
```dns
@   IN  TXT  "v=spf1 include:_spf.google.com ip4:203.0.113.10 ~all"
```

**Multiple Services (Google + SendGrid + Custom):**
```dns
@   IN  TXT  "v=spf1 include:_spf.google.com include:sendgrid.net ip4:203.0.113.0/24 ~all"
```

**Microsoft 365 + Third-Party:**
```dns
@   IN  TXT  "v=spf1 include:spf.protection.outlook.com include:mailgun.org ~all"
```

**Comprehensive Enterprise Setup:**
```dns
@   IN  TXT  "v=spf1 ip4:203.0.113.0/24 ip6:2001:db8::/32 include:_spf.google.com include:sendgrid.net include:mailgun.org a:mail.yourdomain.com mx ~all"
```

#### Critical Limitation: 10 DNS Lookup Rule

**RFC 7208 mandates maximum 10 DNS lookups per SPF check.** Exceeding this causes SPF failures.

**Mechanisms that count as lookups:**
- `include:` (each = 1 lookup)
- `a:` (if hostname differs from current domain)
- `mx:` (if hostname differs from current domain)
- `ptr:` (strongly discouraged)
- `exists:`

**Optimization Strategies:**
1. Replace `include:` with direct `ip4:`/`ip6:` when possible
2. Use CIDR blocks instead of individual IPs
3. Minimize nested includes
4. Use `redirect=` instead of multiple includes when appropriate

---

### 1.3 DKIM Records (DomainKeys Identified Mail)

#### Purpose
DKIM provides cryptographic authentication of email messages. It ensures emails haven't been altered in transit and verifies the sender's domain.

#### Setup Process

1. **Generate Key Pair**
   - Your email service generates a public/private key pair
   - Private key stays on your mail server
   - Public key is published in DNS

2. **Publish Public Key**
   - Add TXT record at `selector._domainkey.yourdomain.com`
   - Selector can be any alphanumeric string (e.g., `google`, `default`, `2024`)

3. **Enable Signing**
   - Configure your email server to sign outgoing messages
   - Verify with test emails

#### Record Format
```
Type: TXT
Name: [selector]._domainkey
Value: v=DKIM1; k=rsa; p=[base64-public-key]
TTL: 300-3600 seconds
```

#### DKIM Tag Reference

| Tag | Required | Description | Example |
|-----|----------|-------------|---------|
| `v=` | Yes | Version | `v=DKIM1` |
| `k=` | No (defaults to rsa) | Key type | `k=rsa` |
| `p=` | Yes | Base64 public key | `p=MIGfMA0G...` |
| `t=` | No | Flags | `t=s` (strict) or `t=y` (testing) |
| `h=` | No | Hash algorithm | `h=sha256` |

#### DKIM Configuration Examples

**Google Workspace (2048-bit key):**
```dns
google._domainkey  IN  TXT  "v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA[...]"
```

**Generic DKIM Record:**
```dns
default._domainkey  IN  TXT  "v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC1TaNgLlSyQMNWVLNLvyY/neDgaL2oqQE8T5illKqCgDtFHc8eHVAU+nlcaGmrKmDMw9dbgiGk1ocgZ56NR4ycfUHwQhvQPMUZw0cveel/8EAGoi/UyPmqfcPibytH81NFtTMAxUeM4Op8A6iHkvAMj5qLf4YRNsTkKAKW3OkwPQIDAQAB"
```

**Multiple Selectors (for key rotation):**
```dns
2024a._domainkey  IN  TXT  "v=DKIM1; k=rsa; p=[current-key]"
2024b._domainkey  IN  TXT  "v=DKIM1; k=rsa; p=[new-key-for-rotation]"
```

#### Key Rotation Process

1. **Generate new key pair** in your email platform
2. **Publish new DKIM record** with different selector
3. **Wait 24-48 hours** for DNS propagation
4. **Switch signing** to use new selector
5. **Monitor** for any delivery issues
6. **Remove old DKIM record** after 7 days

#### Key Size Recommendations

| Key Size | Security Level | Support |
|----------|---------------|---------|
| 1024-bit | Minimum | Universal |
| 2048-bit | Recommended | Most modern systems |
| 4096-bit | Maximum | Limited support |

**Google recommends 2048-bit keys** when your DNS provider supports long TXT records.

---

### 1.4 DMARC Records (Domain-based Message Authentication)

#### Purpose
DMARC builds on SPF and DKIM, providing:
- Policy enforcement for failed authentication
- Alignment verification between visible From domain and authentication domains
- Reporting on email authentication results

#### Record Format
```
Type: TXT
Name: _dmarc
Value: v=DMARC1; p=[policy]; [optional tags]
TTL: 300-3600 seconds
```

#### DMARC Tag Reference

| Tag | Required | Description | Values |
|-----|----------|-------------|--------|
| `v=` | Yes | Version | `v=DMARC1` |
| `p=` | Yes | Policy | `none`, `quarantine`, `reject` |
| `rua=` | No (recommended) | Aggregate report URI | `rua=mailto:dmarc@yourdomain.com` |
| `ruf=` | No | Forensic report URI | `ruf=mailto:forensic@yourdomain.com` |
| `pct=` | No | Percentage to apply | `pct=100` (default), `pct=25` |
| `sp=` | No | Subdomain policy | `sp=none`, `sp=quarantine`, `sp=reject` |
| `adkim=` | No | DKIM alignment | `r` (relaxed, default), `s` (strict) |
| `aspf=` | No | SPF alignment | `r` (relaxed, default), `s` (strict) |
| `fo=` | No | Forensic report options | `0` (default), `1`, `d`, `s` |
| `rf=` | No | Report format | `afrf` (default) |
| `ri=` | No | Report interval | `ri=86400` (seconds, default=86400) |

#### Policy Levels Explained

| Policy | Action on Failure | Use Case |
|--------|-------------------|----------|
| `p=none` | Monitor only, no action | Initial setup, monitoring phase |
| `p=quarantine` | Send to spam/junk | Intermediate enforcement |
| `p=reject` | Block entirely | Maximum protection |

#### Alignment Modes

**Relaxed (r):** Domain passes if organizational domains match
- `subdomain.yourdomain.com` aligns with `yourdomain.com`

**Strict (s):** Domain must match exactly
- `subdomain.yourdomain.com` does NOT align with `yourdomain.com`

#### DMARC Configuration Examples

**Phase 1: Monitoring (Start Here)**
```dns
_dmarc  IN  TXT  "v=DMARC1; p=none; rua=mailto:dmarc@yourdomain.com"
```

**Phase 2: Partial Enforcement**
```dns
_dmarc  IN  TXT  "v=DMARC1; p=quarantine; pct=25; rua=mailto:dmarc@yourdomain.com; ruf=mailto:forensic@yourdomain.com"
```

**Phase 3: Full Enforcement**
```dns
_dmarc  IN  TXT  "v=DMARC1; p=reject; rua=mailto:dmarc@yourdomain.com; ruf=mailto:forensic@yourdomain.com; adkim=s; aspf=s"
```

**Enterprise Configuration:**
```dns
_dmarc  IN  TXT  "v=DMARC1; p=reject; pct=100; rua=mailto:dmarc@yourdomain.com,mailto:dmarc@thirdpartyservice.com; ruf=mailto:forensic@yourdomain.com; fo=1; adkim=r; aspf=r; sp=quarantine"
```

**With Subdomain Policy:**
```dns
_dmarc  IN  TXT  "v=DMARC1; p=reject; sp=quarantine; rua=mailto:dmarc@yourdomain.com"
```

#### DMARC Rollout Strategy

```
Week 1-4:    p=none (monitor only)
Week 5-8:    p=quarantine; pct=10 (10% to spam)
Week 9-12:   p=quarantine; pct=50 (50% to spam)
Week 13-16:  p=quarantine; pct=100 (all failures to spam)
Week 17+:    p=reject (block all failures)
```

---

### 1.5 PTR / Reverse DNS Records

#### Purpose
PTR records map IP addresses back to hostnames (reverse of A records). They verify that the sending IP has a valid hostname, establishing trust.

**Forward-Confirmed Reverse DNS (FCrDNS):** When PTR record points to a hostname, and that hostname's A record points back to the same IP. This is the gold standard.

#### Why PTR Matters for Email
- Gmail, Yahoo, and Microsoft require valid rDNS for bulk senders
- Missing PTR increases spam filtering probability
- Studies show 20-30% of emails with misconfigured rDNS are rejected/spammed

#### Configuration Format

**Where to Configure:**
- PTR records are configured by the **IP owner** (ISP, hosting provider, or cloud platform)
- You cannot create PTR records in your domain's DNS
- Request PTR configuration through your provider's support

**Request Format:**
```
IP Address: 203.0.113.10
Desired PTR: mail.yourdomain.com
```

**FCrDNS Verification Chain:**
```
1. Forward lookup:  mail.yourdomain.com → 203.0.113.10
2. Reverse lookup:  203.0.113.10 → mail.yourdomain.com
```

#### Provider-Specific Notes

| Provider | PTR Configuration |
|----------|-------------------|
| AWS EC2 | Request through AWS support |
| Google Cloud | Configure in Cloud Console |
| Azure | Limited support on basic IPs |
| DigitalOcean | Automatic based on droplet name |
| Dedicated Server | Usually configurable in control panel |

#### SMTP Banner Alignment

For optimal deliverability, your mail server's SMTP banner should match the PTR hostname:
```
220 mail.yourdomain.com ESMTP Postfix
```

---

## 2. DNS Configuration Examples

### 2.1 Complete DNS Zone File for Email

```dns
; Zone file for yourdomain.com
$TTL 3600
@       IN      SOA     ns1.yourdomain.com. admin.yourdomain.com. (
                        2024031901      ; Serial
                        3600            ; Refresh
                        1800            ; Retry
                        604800          ; Expire
                        86400 )         ; Minimum TTL

; Name Servers
@       IN      NS      ns1.yourdomain.com.
@       IN      NS      ns2.yourdomain.com.

; A Records
@               IN      A       203.0.113.10
mail            IN      A       203.0.113.10
www             IN      A       203.0.113.10

; MX Records - Priority: lower = higher priority
@               IN      MX      10      mail.yourdomain.com.
@               IN      MX      20      backup-mail.yourdomain.com.

; SPF Record
@               IN      TXT     "v=spf1 ip4:203.0.113.10 include:_spf.google.com ~all"

; DKIM Records (selector: default)
default._domainkey  IN  TXT     "v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC1TaNgLlSyQMNWVLNLvyY/neDgaL2oqQE8T5illKqCgDtFHc8eHVAU+nlcaGmrKmDMw9dbgiGk1ocgZ56NR4ycfUHwQhvQPMUZw0cveel/8EAGoi/UyPmqfcPibytH81NFtTMAxUeM4Op8A6iHkvAMj5qLf4YRNsTkKAKW3OkwPQIDAQAB"

; DMARC Record
_dmarc          IN      TXT     "v=DMARC1; p=none; rua=mailto:dmarc@yourdomain.com"

; Optional: CNAME for email services
autodiscover    IN      CNAME   autodiscover.outlook.com.

; TXT Record for domain verification (if needed)
@               IN      TXT     "google-site-verification=xxxxxxxxxxxx"
```

### 2.2 TTL Recommendations

| Record Type | Recommended TTL | Notes |
|-------------|-----------------|-------|
| MX | 3600-86400 | Higher is acceptable; mail routing rarely changes |
| SPF | 300-3600 | Lower allows faster updates when adding services |
| DKIM | 300-3600 | Lower for key rotation periods |
| DMARC | 300-3600 | Lower during policy transitions |
| A/AAAA | 300-3600 | Balance between performance and flexibility |

**TTL Strategy:**
- **Development/Testing:** 300 seconds (5 minutes)
- **Stable Production:** 3600 seconds (1 hour)
- **Rarely Changed:** 86400 seconds (24 hours)

### 2.3 Popular Email Service DNS Templates

#### Google Workspace Complete Setup
```dns
; MX Records
@       IN      MX      1       aspmx.l.google.com.
@       IN      MX      5       alt1.aspmx.l.google.com.
@       IN      MX      5       alt2.aspmx.l.google.com.
@       IN      MX      10      alt3.aspmx.l.google.com.
@       IN      MX      10      alt4.aspmx.l.google.com.

; SPF
@       IN      TXT     "v=spf1 include:_spf.google.com ~all"

; DKIM (selector from Google Admin Console)
google._domainkey   IN  TXT     "v=DKIM1; k=rsa; p=[key-from-google]"

; DMARC
_dmarc  IN      TXT     "v=DMARC1; p=none; rua=mailto:dmarc@yourdomain.com"
```

#### Microsoft 365 Complete Setup
```dns
; MX Record
@       IN      MX      0       yourdomain-com.mail.protection.outlook.com.

; SPF
@       IN      TXT     "v=spf1 include:spf.protection.outlook.com ~all"

; DKIM (two selectors required)
selector1._domainkey    IN  CNAME   selector1-yourdomain-com._domainkey.yourdomain.onmicrosoft.com.
selector2._domainkey    IN  CNAME   selector2-yourdomain-com._domainkey.yourdomain.onmicrosoft.com.

; DMARC
_dmarc  IN      TXT     "v=DMARC1; p=none; rua=mailto:dmarc@yourdomain.com"

; Autodiscover (Outlook)
autodiscover    IN      CNAME   autodiscover.outlook.com.
```

#### Amazon SES Setup
```dns
; SPF
@       IN      TXT     "v=spf1 include:amazonses.com ~all"

; DKIM (3 CNAME records from SES)
[selector1]._domainkey.yourdomain.com   IN  CNAME   [selector1].dkim.amazonses.com.
[selector2]._domainkey.yourdomain.com   IN  CNAME   [selector2].dkim.amazonses.com.
[selector3]._domainkey.yourdomain.com   IN  CNAME   [selector3].dkim.amazonses.com.

; Custom MAIL FROM (if using)
mail    IN      MX      10      feedback-smtp.us-east-1.amazonses.com.
mail    IN      TXT     "v=spf1 include:amazonses.com ~all"

; DMARC
_dmarc  IN      TXT     "v=DMARC1; p=none; rua=mailto:dmarc@yourdomain.com"
```

---

## 3. User Action Items

### 3.1 DNS Records Checklist

Use this checklist to ensure complete email DNS configuration:

```
□ MX Records
  □ Primary MX record configured
  □ At least one backup MX record
  □ Priority values correctly set (lower = higher priority)
  □ MX hostnames have A records (not CNAMEs)

□ SPF Record
  □ Single SPF record (only one TXT record starting with v=spf1)
  □ All sending IPs/services included
  □ 10 DNS lookup limit not exceeded
  □ Proper qualifier (~all or -all)

□ DKIM Records
  □ Key pair generated in email platform
  □ Public key published as TXT record
  □ Correct selector used
  □ Key length appropriate (2048-bit if supported)

□ DMARC Record
  □ Record published at _dmarc.yourdomain.com
  □ Valid policy (p=none to start)
  □ Aggregate reporting address (rua=)
  □ Policy phased rollout planned

□ PTR/Reverse DNS
  □ PTR record requested from IP provider
  □ FCrDNS verified
  □ SMTP banner matches PTR hostname
```

### 3.2 Step-by-Step DNS Setup Process

#### Phase 1: Preparation (Day 1)
1. **Inventory email services**
   - List all services sending email for your domain
   - Examples: Google Workspace, Mailchimp, SendGrid, internal mail server

2. **Gather required information**
   - Your domain's DNS provider login
   - IP addresses of your mail servers
   - SPF include statements from each email service

3. **Plan your configuration**
   - Sketch out all required records
   - Choose DMARC policy starting point (always p=none)
   - Document current state before changes

#### Phase 2: MX Records (Day 1-2)
1. Log into your DNS provider
2. Locate DNS management section
3. Add MX records for your email provider
4. Set appropriate priorities
5. Save and wait 5 minutes

#### Phase 3: SPF Record (Day 2)
1. Create TXT record at root (@)
2. Build SPF value: `v=spf1` + includes + IPs + `~all`
3. **Verify only ONE SPF record exists**
4. Save with TTL of 300-600 seconds

#### Phase 4: DKIM Setup (Day 3-4)
1. Generate DKIM keys in your email platform
2. Note the selector name and public key
3. Create TXT record at `selector._domainkey`
4. Paste key value (may need to split into 255-char strings)
5. Enable DKIM signing in your email platform

#### Phase 5: DMARC (Day 5-7)
1. Create TXT record at `_dmarc`
2. Start with: `v=DMARC1; p=none; rua=mailto:dmarc@yourdomain.com`
3. Set up mailbox to receive reports
4. Save with low TTL (300 seconds)

#### Phase 6: PTR Record (Day 1-14)
1. Identify your email server's IP address
2. Contact your hosting provider/ISP
3. Request PTR record: IP → mail.yourdomain.com
4. Verify FCrDNS after provider confirmation

#### Phase 7: Verification (Day 7-14)
1. Test all records using tools below
2. Send test emails to Gmail, Outlook, Yahoo
3. Check headers for PASS results
4. Monitor DMARC reports

### 3.3 How to Verify DNS Propagation

#### Command Line Tools

**Check MX Records:**
```bash
# Using dig
dig MX yourdomain.com +short

# Using nslookup
nslookup -type=mx yourdomain.com
```

**Check SPF Record:**
```bash
# Using dig
dig TXT yourdomain.com +short | grep spf

# Using nslookup
nslookup -type=txt yourdomain.com
```

**Check DKIM Record:**
```bash
# Replace SELECTOR with your actual selector
dig TXT SELECTOR._domainkey.yourdomain.com +short

# Example for Google selector
dig TXT google._domainkey.yourdomain.com +short
```

**Check DMARC Record:**
```bash
dig TXT _dmarc.yourdomain.com +short
```

**Check PTR/Reverse DNS:**
```bash
# Replace with your IP address
dig -x 203.0.113.10 +short

# Using nslookup
nslookup 203.0.113.10
```

**Verify FCrDNS:**
```bash
# Step 1: Get IP from hostname
dig A mail.yourdomain.com +short

# Step 2: Verify PTR matches
dig -x [IP-FROM-STEP-1] +short

# Both should return mail.yourdomain.com
```

#### Online Propagation Checkers

| Tool | URL | Purpose |
|------|-----|---------|
| WhatsMyDNS | whatsmydns.net | Global DNS propagation |
| DNSChecker | dnschecker.org | Multi-record type checks |
| MXToolbox | mxtoolbox.com | Email-specific diagnostics |
| ViewDNS | viewdns.info | Comprehensive DNS lookup |

### 3.4 Common DNS Misconfigurations to Avoid

| # | Misconfiguration | Impact | Solution |
|---|-------------------|--------|----------|
| 1 | **Multiple SPF records** | Random failures, unpredictable behavior | Merge into single record |
| 2 | **SPF >10 DNS lookups** | SPF permerror, delivery failures | Optimize with IP ranges |
| 3 | **Missing SPF qualifier** | Syntax error | Add `~all` or `-all` |
| 4 | **DKIM key formatting** | Keys wrapped incorrectly | Split at 255 char boundaries |
| 5 | **Wrong DKIM selector** | DKIM fails | Verify selector in email headers |
| 6 | **No DMARC rua address** | No visibility into failures | Add reporting address |
| 7 | **DMARC p=reject too early** | Legitimate email blocked | Start with p=none |
| 8 | **MX pointing to CNAME** | Violates RFC, may fail | Use A record hostnames |
| 9 | **Missing PTR record** | Increased spam filtering | Request from IP provider |
| 10 | **FCrDNS mismatch** | Reputation issues | Align PTR and A records |

---

## 4. Security & Deliverability

### 4.1 How These Records Prevent Spam & Phishing

#### SPF: Authorization Layer
```
Attacker tries to spoof: phishing@yourdomain.com
Receiver checks: Is sender IP authorized in SPF?
Result: SPF FAIL → Message flagged or rejected
```

**Spoofing Prevention:**
- SPF prevents unauthorized servers from sending as your domain
- Even if attacker has your exact email template, SPF blocks them

#### DKIM: Integrity Layer
```
Legitimate email signed with private key
Transit: Email passes through multiple servers
Receiver: Verifies signature with public key from DNS
Result: Tampering detected if signature doesn't match
```

**Phishing Prevention:**
- DKIM signatures prove email content hasn't been modified
- Forwarded emails can still verify if signature intact

#### DMARC: Enforcement Layer
```
SPF passes OR DKIM passes
AND domain alignment verified
→ DMARC PASS

SPF fails AND DKIM fails
→ Apply DMARC policy (none/quarantine/reject)
```

**Domain Protection:**
- Prevents exact-domain spoofing
- Provides visibility into authentication attempts
- Enables gradual enforcement

#### PTR: Trust Layer
```
IP 203.0.113.10 sends email
Receiver checks: What hostname does this IP have?
Valid PTR: mail.yourdomain.com
Result: Legitimate sender signal
```

**Botnet Prevention:**
- Compromised machines typically lack valid PTR
- rDNS check filters many automated spam sources

### 4.2 Email Deliverability Best Practices

#### Authentication Best Practices

1. **Implement All Three (SPF + DKIM + DMARC)**
   - Gmail, Yahoo, Microsoft require all three for bulk senders
   - Missing any one reduces inbox placement

2. **Achieve Alignment**
   - SPF: Envelope From (Return-Path) should match Header From domain
   - DKIM: d= tag should match Header From domain
   - Use relaxed alignment initially, strict when mature

3. **Monitor DMARC Reports**
   - Review aggregate reports weekly
   - Identify legitimate senders missing from SPF
   - Detect unauthorized sending attempts

4. **Maintain Clean Lists**
   - Remove bounced emails promptly
   - Honor unsubscribe requests immediately
   - Keep spam complaint rate under 0.3% (Gmail requirement)

#### IP Reputation Management

| Factor | Best Practice |
|--------|---------------|
| Dedicated IP | Use for high volume (>50k/month) |
| IP Warmup | Gradually increase volume over 4-6 weeks |
| PTR Record | Must be configured and aligned |
| Blacklists | Monitor and delist promptly |
| Volume Consistency | Avoid sudden spikes |

#### Content Best Practices

- **Avoid spam trigger words** in subject lines (FREE!!!, Act Now, etc.)
- **Balance image-to-text ratio** (more text is better)
- **Include physical address** (CAN-SPAM requirement)
- **Clear unsubscribe link** above the fold
- **Use HTTPS links** exclusively

### 4.3 Tools to Test Email Authentication

#### DNS Lookup Tools

| Tool | URL | Best For |
|------|-----|----------|
| MXToolbox | mxtoolbox.com | Complete email diagnostics |
| Google Admin Toolbox | toolbox.googleapps.com | Google-specific checks |
| DNSChecker | dnschecker.org | Global propagation |
| MXTool | mxtool.org | Quick MX verification |

#### Authentication Testing Tools

| Tool | URL | Tests |
|------|-----|-------|
| Mail Tester | mail-tester.com | Spam score, authentication |
| GMass Spam Test | gmass.co/spam-checker | Multi-provider placement |
| Postmark Spam Check | spamcheck.postmarkapp.com | SpamAssassin scoring |
| SendForensics | sendforensics.com | Deliverability analysis |

#### DMARC Analysis Tools

| Tool | URL | Features |
|------|-----|----------|
| DMARCian | dmarcian.com | Free tier, visualization |
| DMARCLY | dmarcly.com | Full platform, free check |
| EasyDMARC | easydmarc.com | Comprehensive suite |
| Google Postmaster | postmaster.google.com | Gmail-specific data |

#### Header Analysis Tools

| Tool | URL | Method |
|------|-----|--------|
| MXToolbox Header Analyzer | mxtoolbox.com/Public/Tools/EmailHeaders.aspx | Paste headers |
| Google Message Header | toolbox.googleapps.com/apps/messageheader/ | Diagnostic tool |
| MailHeader.org | mailheader.org | Detailed parsing |

#### Command Line Testing

**Send Test Email and Check Headers:**
```bash
# Send test to Mail Tester
echo "Test message body" | mail -s "Test Subject" test-xxxxx@mail-tester.com

# Check Gmail headers (after receiving)
# 1. Open email in Gmail
# 2. Click three dots → "Show original"
# 3. Look for: SPF=PASS, DKIM=PASS, DMARC=PASS
```

**Verify DKIM Signature:**
```bash
# Install opendkim-testmsg
opendkim-testmsg -v < email.eml

# Or use Python dkimpy
python -m dkim.verify email.eml
```

### 4.4 Quick Diagnostic Commands

```bash
# Complete email DNS audit script
#!/bin/bash
DOMAIN="yourdomain.com"

echo "=== MX Records ==="
dig MX $DOMAIN +short

echo -e "\n=== SPF Record ==="
dig TXT $DOMAIN +short | grep spf

echo -e "\n=== DMARC Record ==="
dig TXT _dmarc.$DOMAIN +short

echo -e "\n=== Common DKIM Selectors ==="
for selector in google default selector1 selector2 dkim mail; do
    result=$(dig TXT ${selector}._domainkey.$DOMAIN +short)
    if [ ! -z "$result" ]; then
        echo "Found: $selector._domainkey.$DOMAIN"
    fi
done

echo -e "\n=== IP and PTR Check ==="
IP=$(dig A $DOMAIN +short | head -1)
if [ ! -z "$IP" ]; then
    echo "Domain A record: $IP"
    echo "PTR record: $(dig -x $IP +short)"
fi
```

---

## 5. Summary & Quick Reference

### The Golden Path: Recommended Setup

1. **Week 1:** Configure MX and SPF
2. **Week 2:** Implement DKIM
3. **Week 3:** Deploy DMARC with p=none
4. **Week 4+:** Monitor DMARC reports
5. **Month 2-3:** Transition to p=quarantine
6. **Month 4+:** Achieve p=reject
7. **Ongoing:** Monitor and maintain

### DNS Records at a Glance

| Record | Name | Type | Example Value |
|--------|------|------|---------------|
| MX | @ | MX | `10 mail.yourdomain.com` |
| SPF | @ | TXT | `v=spf1 include:_spf.google.com ~all` |
| DKIM | selector._domainkey | TXT | `v=DKIM1; k=rsa; p=MIGf...` |
| DMARC | _dmarc | TXT | `v=DMARC1; p=none; rua=mailto:dmarc@domain.com` |
| PTR | (IP-based) | PTR | `mail.yourdomain.com` |

### Minimum Viable Email DNS

For a domain using Google Workspace:
```dns
; MX
@       IN  MX  1   aspmx.l.google.com.

; SPF
@       IN  TXT "v=spf1 include:_spf.google.com ~all"

; DKIM (get from Google Admin)
google._domainkey  IN  TXT "v=DKIM1; k=rsa; p=[your-key]"

; DMARC (start monitoring)
_dmarc  IN  TXT "v=DMARC1; p=none; rua=mailto:dmarc@yourdomain.com"
```

---

**Report Generated:** March 19, 2026  
**Version:** 1.0  
**Classification:** Technical Reference Guide

*This report provides current best practices for email DNS configuration. Email provider requirements evolve; verify current standards with your email service provider.*
