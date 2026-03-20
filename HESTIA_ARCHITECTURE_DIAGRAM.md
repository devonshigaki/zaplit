# Hestia Email + WordPress E-Signature: Architecture & Dependencies

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           DNS LAYER (Cloudflare/Registrar)                       │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│   A       mail.yourdomain.com ──────┐                                           │
│   A       webmail.yourdomain.com ───┼──► YOUR_SERVER_IP                         │
│                                     │                                           │
│   MX      @ ────────────────────────┘ (priority 10)                             │
│                                     │                                           │
│   TXT     @ ───► v=spf1 a mx ip4:YOUR_IP ~all                                   │
│   TXT     _dmarc ► v=DMARC1; p=none; rua=...                                    │
│   TXT     mail._domainkey ► v=DKIM1; k=rsa; p=...                               │
│                                     │                                           │
│   PTR     YOUR_IP ► mail.yourdomain.com  [Request from VPS provider]           │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                      HESTIA CONTROL PANEL (Port 8083)                            │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │
│  │   Exim       │  │   Dovecot    │  │  Roundcube   │  │  SpamAssassin│        │
│  │   (SMTP)     │  │ (IMAP/POP3)  │  │  (Webmail)   │  │  + ClamAV    │        │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────────────┘        │
│         │                 │                  │                                  │
│         └─────────────────┴──────────────────┘                                  │
│                           │                                                      │
│              ┌────────────┴────────────┐                                        │
│              │   SSL Certificate         │                                        │
│              │   (Let's Encrypt)         │                                        │
│              └───────────────────────────┘                                        │
│                           │                                                      │
│         ┌─────────────────┼─────────────────┐                                    │
│         ▼                 ▼                 ▼                                    │
│      Port 25           Port 587           Port 993                               │
│   (Server-Server)   (Client SMTP)      (Client IMAP)                            │
│         │                 │                 │                                    │
│         └─────────────────┴─────────────────┘                                    │
│                           │                                                      │
└───────────────────────────┼─────────────────────────────────────────────────────┘
                            │
              ┌─────────────┴─────────────┐
              ▼                           ▼
┌──────────────────────────┐  ┌──────────────────────────┐
│   SMTP Relay (Optional)  │  │   WordPress Site         │
│   ┌──────────────────┐   │  │   ┌──────────────────┐   │
│   │  Amazon SES      │   │  │   │  FluentSMTP      │   │
│   │  SMTP2GO         │◄──┘  │   │  Plugin          │   │
│   │  Brevo           │      │   └────────┬─────────┘   │
│   └──────────────────┘      │            │              │
│                             │            ▼              │
└─────────────────────────────┘   ┌──────────────────┐   │
                                  │  WP E-Signature  │   │
                                  │  Plugin          │   │
                                  └────────┬─────────┘   │
                                           │              │
                                           ▼              │
                                  ┌──────────────────┐   │
                                  │  Document        │   │
                                  │  Signing Flow    │   │
                                  │  - Signature     │   │
                                  │  - Audit Trail   │   │
                                  │  - PDF Export    │   │
                                  └──────────────────┘   │
                                  └──────────────────────┘
```

---

## Dependency Graph

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        CRITICAL PATH DEPENDENCIES                            │
└─────────────────────────────────────────────────────────────────────────────┘

Phase 1: DNS Foundation
┌─────────────────────────────────────────────────────────────┐
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │ A Records    │───►│ MX Record    │───│ PTR Request  │  │
│  │ (mail/webmail│    │ (routing)    │    │ (deliverability│
│  └──────────────┘    └──────────────┘    └──────────────┘  │
│         │                   │                   │           │
│         └───────────────────┴───────────────────┘           │
│                           │                                  │
│                           ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  SPF + DMARC + DKIM Records (authentication)            ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
Phase 2: Hestia Configuration
┌─────────────────────────────────────────────────────────────┐
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │ Create Mail  │───►│ Enable SSL   │───►│ Create Email │  │
│  │ Domain       │    │ (Let's Encrypt│   │ Account      │  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
│         │                   │                   │           │
│         └───────────────────┴───────────────────┘           │
│                           │                                  │
│                           ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  Get DKIM Key ──► Add DKIM DNS Record                   ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
Phase 3: Testing & Verification
┌─────────────────────────────────────────────────────────────┐
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │ Port 25 Test │───►│ Mail-Tester  │───►│ MXToolbox    │  │
│  │ (blocked?)   │    │ (score check)│    │ (full verify)│  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
│         │                                                      │
│         ▼ (if blocked)                                         │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  Configure SMTP Relay (Amazon SES/SMTP2GO/Brevo)        ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
Phase 4: WordPress Integration
┌─────────────────────────────────────────────────────────────┐
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │ Install      │───►│ Configure    │───►│ Test Email   │  │
│  │ FluentSMTP   │    │ SMTP Settings│    │ Delivery     │  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
│         │                                                      │
│         ▼                                                      │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  Install WP E-Signature ──► Configure ──► Test Document ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

---

## Risk Analysis Matrix

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| **Port 25 blocked** | High | High | Pre-configure SMTP relay |
| **DNS propagation delay** | Medium | Medium | Use low TTL initially |
| **PTR record rejection** | Medium | High | Request immediately, follow up |
| **DKIM key too long** | Low | Medium | Split DNS record if needed |
| **Cloudflare proxy issues** | Medium | High | Set mail records to DNS-only |
| **SSL cert generation fails** | Low | Medium | Check DNS propagation first |
| **WordPress plugin conflict** | Low | Low | Test on staging first |
| **Email blacklisting** | Low | High | Use SMTP relay, warm up IP |

---

## Data Flow: E-Signature Process

```
┌──────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────┐
│  Sender  │────►│  WordPress   │────►│  WP E-Sig    │────►│  Database│
│ (Admin)  │     │  Dashboard   │     │  Plugin      │     │  Storage │
└──────────┘     └──────────────┘     └──────┬───────┘     └──────────┘
                                              │
                                              ▼
                                       ┌──────────────┐
                                       │  Document    │
                                       │  Generated   │
                                       │  (PDF + Form)│
                                       └──────┬───────┘
                                              │
                                              ▼
┌──────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────┐
│  Signer  │◄────│  Email       │◄────│  FluentSMTP  │◄────│  Hestia  │
│  (Client)│     │  Notification│     │  Plugin      │     │  Exim    │
└────┬─────┘     └──────────────┘     └──────────────┘     └──────────┘
     │
     │  Clicks Link
     ▼
┌──────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────┐
│  Signer  │────►│  Signing     │────►│  Signature   │────►│  WP E-Sig│
│  Signs   │     │  Page        │     │  Captured    │     │  Storage │
└──────────┘     └──────────────┘     └──────────────┘     └────┬─────┘
                                                                │
                                                                ▼
                                                         ┌──────────────┐
                                                         │  Signed PDF  │
                                                         │  Generated   │
                                                         └──────┬───────┘
                                                                │
                    ┌───────────────────────────────────────────┘
                    │
                    ▼
┌──────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────┐
│  Sender  │◄────│  Completion  │◄────│  FluentSMTP  │◄────│  Hestia  │
│  (Admin) │     │  Email       │     │  Plugin      │     │  Exim    │
└──────────┘     └──────────────┘     └──────────────┘     └──────────┘
```

---

## Security Layers

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              SECURITY STACK                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Layer 1: DNS Security                                                       │
│  ├─ SPF: Prevents domain spoofing                                           │
│  ├─ DKIM: Cryptographic signature verification                              │
│  ├─ DMARC: Policy enforcement and reporting                                 │
│  └─ PTR: Reverse DNS validation                                             │
│                                                                              │
│  Layer 2: Transport Security                                                 │
│  ├─ TLS 1.2/1.3 for SMTP/IMAP                                               │
│  ├─ Let's Encrypt SSL certificates                                          │
│  ├─ STARTTLS on port 587 (forced)                                           │
│  └─ Certificate validation (no self-signed)                                 │
│                                                                              │
│  Layer 3: Application Security                                               │
│  ├─ SMTP authentication (AUTH PLAIN/LOGIN)                                  │
│  ├─ Strong password policy                                                  │
│  ├─ Fail2ban (brute force protection)                                       │
│  └─ SPF/DKIM/DMARC verification on incoming                                 │
│                                                                              │
│  Layer 4: Content Security                                                   │
│  ├─ SpamAssassin filtering                                                  │
│  ├─ ClamAV antivirus scanning                                               │
│  ├─ Attachment size/type limits                                             │
│  └─ Rate limiting per account                                               │
│                                                                              │
│  Layer 5: WordPress Security                                                 │
│  ├─ FluentSMTP secure credential storage                                    │
│  ├─ WP E-Signature audit trail                                              │
│  ├─ Document access controls                                                │
│  └─ Signed document tamper-proofing                                         │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Configuration Decision Tree

```
START
  │
  ▼
┌──────────────────────────┐
│ Is port 25 open on your  │
│ VPS/server?              │
└────────────┬─────────────┘
             │
     ┌───────┴───────┐
     ▼               ▼
   YES              NO
     │               │
     ▼               ▼
┌──────────┐   ┌──────────────────────────┐
│ Use      │   │ Configure SMTP Relay     │
│ Direct   │   │ ├─ Amazon SES (free)     │
│ SMTP     │   │ ├─ SMTP2GO (1k/mo free)  │
└────┬─────┘   │ └─ Brevo (300/day free)  │
     │         └────────────┬─────────────┘
     │                      │
     └──────────┬───────────┘
                ▼
     ┌──────────────────────────┐
     │ Is reverse DNS (PTR)     │
     │ configured?              │
     └────────────┬─────────────┘
                  │
          ┌───────┴───────┐
          ▼               ▼
        YES              NO
          │               │
          ▼               ▼
   ┌──────────┐    ┌──────────────────────────┐
   │ Continue │    │ Request PTR from provider│
   │ Setup    │    │ (Critical for deliverability)
   └────┬─────┘    └────────────┬─────────────┘
        │                       │
        └──────────┬────────────┘
                   ▼
        ┌──────────────────────────┐
        │ Are you using Cloudflare?│
        └────────────┬─────────────┘
                     │
             ┌───────┴───────┐
             ▼               ▼
           YES              NO
             │               │
             ▼               ▼
    ┌─────────────────┐  ┌─────────────────┐
    │ Set mail and    │  │ Standard DNS    │
    │ webmail records │  │ setup complete  │
    │ to DNS-Only     │  │                 │
    │ (grey cloud)    │  │                 │
    └────────┬────────┘  └────────┬────────┘
             │                    │
             └──────────┬─────────┘
                        ▼
             ┌──────────────────────────┐
             │ Setup Complete!          │
             │ Test with mail-tester.com│
             └──────────────────────────┘
```

---

## Performance Considerations

| Component | Bottleneck | Mitigation |
|-----------|-----------|------------|
| **DNS Resolution** | Slow TTL propagation | Use 300s TTL during setup, increase later |
| **SSL Handshake** | Certificate validation | Use OCSP stapling, keep certs updated |
| **SMTP Throughput** | Rate limiting | Implement queue system for bulk sends |
| **PDF Generation** | CPU intensive | Enable caching, use WP E-Signature async mode |
| **Storage** | Large PDF files | Implement S3 offload, set retention policy |
| **Database** | Signature metadata | Index signer_email, document_status columns |

---

## Monitoring Checkpoints

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         MONITORING CHECKLIST                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Daily:                                                                      │
│  ├─ [ ] Check mail queue: exim -bp                                          │
│  ├─ [ ] Review WordPress email logs                                         │
│  └─ [ ] Monitor disk space (mail + PDFs)                                    │
│                                                                              │
│  Weekly:                                                                     │
│  ├─ [ ] Test mail score: mail-tester.com                                    │
│  ├─ [ ] Check blacklist status: mxtoolbox.com                               │
│  ├─ [ ] Review fail2ban logs                                                │
│  └─ [ ] Check SSL certificate expiry                                        │
│                                                                              │
│  Monthly:                                                                    │
│  ├─ [ ] Update HestiaCP: v-update-sys-hestia-all                            │
│  ├─ [ ] Review DMARC reports                                                │
│  ├─ [ ] Audit e-signature document access                                   │
│  └─ [ ] Backup verification                                                 │
│                                                                              │
│  Quarterly:                                                                  │
│  ├─ [ ] Rotate DKIM keys                                                    │
│  ├─ [ ] Review and update SPF records                                       │
│  ├─ [ ] Security audit of email accounts                                    │
│  └─ [ ] Performance review of WordPress e-sig                               │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Cost Analysis

| Component | Option | Monthly Cost | Notes |
|-----------|--------|--------------|-------|
| **VPS/Server** | Hetzner CX21 | €5.35 | Sufficient for small-medium |
| **DNS** | Cloudflare | Free | Essential features free |
| **Email** | Self-hosted Hestia | Free | Unlimited accounts |
| **SMTP Relay** | Amazon SES | Free (62k/mo) | Only if port 25 blocked |
| **Alternative Relay** | SMTP2GO | Free (1k/mo) | Good for testing |
| **E-Signature** | WP E-Signature | $58 ($699/yr) | One-time lifetime option |
| **Alternative** | Legal Signing + GF | $22/mo | Gravity Forms integration |
| **Storage** | Local | Free | Limited by VPS disk |
| **Backup Storage** | AWS S3 | ~$5 | 100GB standard |
| **SSL** | Let's Encrypt | Free | Auto-renewal |

**Total Minimum:** €5.35/month (VPS only, self-hosted everything)
**Total Recommended:** ~$25-35/month (with SMTP relay, S3 backup, premium plugins)
