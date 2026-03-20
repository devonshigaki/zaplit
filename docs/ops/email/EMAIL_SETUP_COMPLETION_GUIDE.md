# Email Setup Completion - Brevo + Hestia

## Current Status

### ✅ DNS Complete
- mail.zaplit.com → 34.132.198.35
- webmail.zaplit.com → 34.132.198.35
- SPF: v=spf1 a mx ip4:34.132.198.35 ~all
- DMARC: v=DMARC1; p=none; rua=mailto:admin@zaplit.com

### ❌ Still Need to Do
1. Add MX record (if not already there - check screenshot)
2. Configure Hestia mail domain with DKIM
3. Add DKIM DNS record
4. Configure Brevo SMTP relay
5. Create email account
6. Test sending

---

## Step-by-Step Completion

### Step 1: Verify/Add MX Record (if missing)

Your DNS screenshot shows MX record exists, but dig didn't find it. This might be DNS propagation delay.

**If missing, add:**
```
Type: MX
Host: @ (or zaplit.com)
Value: mail.zaplit.com
Priority: 10
```

---

### Step 2: Configure Hestia Control Panel

**Login:** https://34.132.198.35:8083

#### 2A. Create Mail Domain
1. Go to **Mail** section
2. Click **Add Domain**
3. Domain: `zaplit.com`
4. ✅ Check **"Enable DKIM support"**
5. Click **Save**

#### 2B. Get DKIM Key
1. Click on `zaplit.com` in the Mail list
2. Look for **DKIM** section
3. Copy the **Public Key** (starts with `v=DKIM1; k=rsa; p=`)

#### 2C. Add DKIM DNS Record
Back in your DNS provider:
```
Type: TXT
Host: mail._domainkey
Value: [paste the DKIM key from Hestia]
```

---

### Step 3: Configure Brevo SMTP Relay

#### 3A. Get Brevo Credentials
1. Go to https://app.brevo.com
2. Login to your account
3. Go to **Settings** → **SMTP & API** (or https://app.brevo.com/settings/keys/smtp)
4. Click **Generate a new SMTP key**
5. Copy the key (looks like: `xsmtp.xxxxxxxxxxxxxxxx`)
6. Note your SMTP login (your Brevo email address)

#### 3B. Configure in Hestia
1. In Hestia: **Settings** (gear icon) → **Mail Server**
2. Scroll to **Global SMTP Relay**
3. ✅ Check **"Enable SMTP Relay"**
4. Fill in:
   - **Host:** `smtp-relay.brevo.com`
   - **Port:** `587`
   - **Username:** [your Brevo email address]
   - **Password:** [your Brevo SMTP key from step 3A]
5. Click **Save**

#### 3C. Restart Exim
SSH to server and run:
```bash
sudo systemctl restart exim4
```

---

### Step 4: Create Email Account

1. In Hestia: **Mail** → Click `zaplit.com`
2. Click **Add Account**
3. Account: `noreply` (or `admin`, `hello`, etc.)
4. Password: Generate strong password
5. Quota: Leave empty (unlimited)
6. Click **Save**
7. **Write down the credentials!**

---

### Step 5: Enable SSL for Mail

1. **Mail** → `zaplit.com` → **Edit**
2. ✅ Check **"Enable SSL for this domain"**
3. ✅ Check **"Use Let's Encrypt to obtain SSL certificate"**
4. Click **Save**
5. Wait 30-60 seconds for certificate generation

---

### Step 6: Test Email Sending

#### Test 1: Via Roundcube Webmail
1. Go to: https://webmail.zaplit.com
2. Login with: `noreply@zaplit.com` + password
3. Compose email to your Gmail
4. Send and check if it arrives

#### Test 2: Check Brevo Dashboard
1. Go to https://app.brevo.com
2. **Transactional** → **Email Logs**
3. Verify your test email shows as "Delivered"

#### Test 3: Check Email Headers
In Gmail, click **More** → **Show original**:
- Look for: `Received: from smtp-relay.brevo.com`
- Look for: `dkim=pass`
- Look for: `X-Brevo-...` headers

#### Test 4: Mail Tester
1. Go to https://www.mail-tester.com
2. Copy the test email address
3. Send email from Roundcube to that address
4. Check your score (aim for 10/10)

---

## Brevo Configuration Summary

| Setting | Value |
|---------|-------|
| **SMTP Server** | smtp-relay.brevo.com |
| **Port** | 587 |
| **Encryption** | STARTTLS |
| **Authentication** | LOGIN |
| **Username** | Your Brevo email |
| **Password** | Your Brevo SMTP key |
| **Daily Limit (Free)** | 300 emails/day |

---

## DNS Records Summary

| Type | Host | Value | Status |
|------|------|-------|--------|
| A | mail | 34.132.198.35 | ✅ Done |
| A | webmail | 34.132.198.35 | ✅ Done |
| MX | @ | mail.zaplit.com (priority 10) | ✅ Check |
| TXT | @ | v=spf1 a mx ip4:34.132.198.35 ~all | ✅ Done |
| TXT | _dmarc | v=DMARC1; p=none; rua=mailto:admin@zaplit.com | ✅ Done |
| TXT | mail._domainkey | [from Hestia] | ❌ Need to add |

---

## Testing Commands (SSH to Server)

```bash
# Check Exim is using Brevo relay
cat /etc/exim4/smtp_relay.conf

# Check mail logs
sudo tail -f /var/log/exim4/mainlog

# Check if mail queue has messages
sudo exim -bp

# Test SMTP connection to Brevo
telnet smtp-relay.brevo.com 587
```

---

## Troubleshooting

### Emails not sending via Brevo
1. Check `/var/log/exim4/mainlog` for errors
2. Verify SMTP credentials in Hestia
3. Check Brevo account isn't rate-limited (300/day on free plan)

### DKIM not passing
1. Wait 24-48 hours for DNS propagation
2. Verify DKIM record was added correctly
3. Check Hestia generated the DKIM key

### Webmail not accessible
1. Check DNS: `dig webmail.zaplit.com`
2. Verify SSL certificate was generated
3. Check Hestia logs: `/var/log/hestia/system.log`
