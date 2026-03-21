# DNS Configuration Required for Zaplit

**Date:** March 21, 2026
**DNS Provider:** Namecheap (registrar-servers.com)
**Action Required:** Manual DNS record addition via Namecheap dashboard

## Critical DNS Records to Add

### 1. MX Record (CRITICAL - Missing)

| Type | Host | Value | Priority |
|------|------|-------|----------|
| MX | @ | mail.zaplit.com | 10 |

**Purpose:** Routes email to your mail server.

### 2. DKIM Record (CRITICAL - Missing)

| Type | Host | Value |
|------|------|-------|
| TXT | mail._domainkey | v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAzhI/KCaRXTjUybe2DUc6pMU0KBaEdflcF0vpmKyJjHhJs5lvcaDgV5/28KMMNtPno/kv4niPViH4rnxE+cNgLedPnB4z32v8FRdOaaksXKC+G3wnYEq1oEp8+xHNAWILROadvcQXsYRWjojja4po10DEu3AhXaGNAObde1us8vaiwcWGctAbpSyq/PBZ0McRFHtqQVKed0pssd0yg6L7W1msvvA74OnD7+CO90wIPz2S/oaqbQLbN5SAs8wtJ+VA3pAsiHqqO3//y0+3lo/3dPV/8nIb0mORyPdzMAFtpE19R38P+0DVfwy17NqjfqAW2iY7E7g/aCjs/63fGzEkXQIDAQAB |

**Purpose:** Email authentication to prevent spoofing.

### 3. Updated SPF Record (HIGH PRIORITY)

**Current Issue:** Two separate SPF records exist. They need to be merged.

**Current Records:**
```
"v=spf1 include:emailsrvr.com ~all"
"v=spf1 a mx ip4:34.132.198.35 ~all"
```

**Replace with (single record):**
```
v=spf1 a mx ip4:136.113.99.87 include:spf.brevo.com ~all
```

**Purpose:** Authorizes mail servers to send email for your domain.

## How to Add Records in Namecheap

1. Log into Namecheap dashboard
2. Go to Domain List → Manage for zaplit.com
3. Click "Advanced DNS" tab
4. Add records as specified above
5. Save changes

## Verification

After adding records, verify with:

```bash
# Check MX record
nslookup -type=MX zaplit.com

# Check DKIM record
nslookup -type=TXT mail._domainkey.zaplit.com

# Check SPF record
nslookup -type=TXT zaplit.com
```

## GCP PTR Record Request

Send email to GCP Support:

```
To: gcp-support@google.com
Subject: PTR Record Request for 136.113.99.87

Please set the PTR (reverse DNS) record for IP address 136.113.99.87
to: mail.zaplit.com

This is required for proper email deliverability.

Project ID: zaplit-website-prod
VM Name: hestia-mail
Zone: us-central1-a
```

## Current DNS Status

| Record | Status |
|--------|--------|
| A mail.zaplit.com | ✅ Exists (136.113.99.87) |
| A webmail.zaplit.com | ✅ Exists (136.113.99.87) |
| MX | ❌ MISSING |
| SPF | ⚠️ Needs merge |
| DMARC | ✅ Exists |
| DKIM | ❌ MISSING |
| PTR | ⚠️ Incorrect (needs GCP request) |
