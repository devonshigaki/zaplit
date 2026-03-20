# Hestia Email + WordPress E-Signature: Quick Start

## ⚡ IMMEDIATE ACTION ITEMS (Do These First)

### Step 1: DNS Records (10 minutes)
Add these at your DNS provider (Cloudflare recommended):

```
Type    Name                    Value                               Priority
A       mail                    YOUR_SERVER_IP                      -
A       webmail                 YOUR_SERVER_IP                      -
MX      @                       mail.yourdomain.com                 10
TXT     @                       "v=spf1 a mx ip4:YOUR_SERVER_IP ~all"  -
TXT     _dmarc                  "v=DMARC1; p=none; rua=mailto:admin@yourdomain.com"  -
```

**⚠️ Cloudflare Users:** Set `mail` and `webmail` records to **DNS Only** (grey cloud ☁️)

---

### Step 2: Request PTR Record (5 minutes)

Email your VPS provider:
```
Subject: PTR Record Request for [YOUR_SERVER_IP]

Please set PTR for IP [YOUR_SERVER_IP] to: mail.yourdomain.com
```

| Provider | Where to Set |
|----------|--------------|
| Hetzner | Console → Server → Network → Reverse DNS |
| DigitalOcean | Networking → PTR Records |
| AWS | Submit support ticket |
| Linode | Networking → Reverse DNS |

---

### Step 3: Hestia Mail Setup (15 minutes)

1. Login: `https://your-server:8083`
2. **Mail** → **Add Domain** → Enter your domain
3. ✅ Check "Enable DKIM support"
4. **Edit** domain → ✅ Enable SSL + Let's Encrypt
5. **Add Account** → Create `noreply@yourdomain.com`
6. Save credentials displayed

---

### Step 4: Get & Add DKIM Key (5 minutes)

SSH to server:
```bash
v-list-mail-domain-dkim your-username yourdomain.com
```

Copy the public key and add DNS record:
```
Type: TXT
Name: mail._domainkey
Value: v=DKIM1; k=rsa; p=[KEY_FROM_ABOVE]
```

---

### Step 5: WordPress SMTP (10 minutes)

1. Install **FluentSMTP** plugin
2. Settings:
   - **From Email:** `noreply@yourdomain.com`
   - **SMTP Host:** `mail.yourdomain.com`
   - **Port:** `587`
   - **Encryption:** `TLS`
   - **Username:** `noreply@yourdomain.com`
   - **Password:** [from Hestia]

---

### Step 6: Test Everything (10 minutes)

1. **Test Email:** FluentSMTP → Send Test Email
2. **Test Score:** https://www.mail-tester.com
3. **Test DNS:** https://mxtoolbox.com (check MX, SPF, DKIM)

---

## 🛒 E-SIGNATURE PLUGIN RECOMMENDATION

**Best Value: WP E-Signature by ApproveMe**
- Cost: $699 lifetime (unlimited users) or $249/year
- URL: https://aprv.me/wpesignature
- Why: Self-hosted, unlimited docs, legal compliance

**Alternative for EU: Legal Signing + Gravity Forms**
- Cost: ~$258/year
- Why: eIDAS compliant for European regulations

---

## 🔥 CRITICAL ISSUES TO WATCH

| Issue | How to Check | Fix |
|-------|--------------|-----|
| Port 25 blocked | `telnet ASPMX.L.GOOGLE.COM 25` | Use Amazon SES relay (free tier) |
| No PTR record | `dig -x YOUR_IP` | Contact VPS provider |
| DKIM too long | DNS validation fails | Split into multiple strings |
| Cloudflare proxy | Email bounces | Set mail records to DNS-only |

---

## 📞 Support Resources

- **HestiaCP Forum:** https://forum.hestiacp.com
- **Email Testing:** https://www.mail-tester.com
- **DNS Checking:** https://mxtoolbox.com
- **Blacklist Check:** https://mxtoolbox.com/blacklists.aspx

---

**Total Setup Time: ~55 minutes**

📄 **Full Details:** See `HESTIA_EMAIL_EXECUTION_PLAN.md`
📊 **Architecture:** See `HESTIA_ARCHITECTURE_DIAGRAM.md`
