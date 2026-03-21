# DNS Configuration - Final Status

**Date:** March 21, 2026  
**Domain:** zaplit.com

---

## ✅ Completed Updates

| Record | Host | Status | IP/Value |
|--------|------|--------|----------|
| A | mail.zaplit.com | ✅ Updated | 35.188.131.226 |
| A | webmail.zaplit.com | ✅ Updated | 35.188.131.226 |

## ⚠️ Still Pending

| Record | Host | Current Value | Required Value |
|--------|------|---------------|----------------|
| A | hcp.zaplit.com | 136.113.99.87 (OLD) | 35.188.131.226 |
| TXT | @ (SPF) | ip4:136.113.99.87 | ip4:35.188.131.226 |
| MX | @ | Not resolving | mail.zaplit.com (priority 10) |

---

## Mail Server Status

**VM:** hestia-mail  
**IP:** 35.188.131.226  
**Status:** RUNNING

**Services:**
- Exim (SMTP): Running on ports 25, 587
- Dovecot (IMAP/POP3): Running on ports 993, 995
- Hestia CP: Running on port 8083

**Firewall:** ✅ Configured (allow-hestia-mail rule active)

---

## Summary

- ✅ mail.zaplit.com updated
- ✅ webmail.zaplit.com updated
- ⚠️ hcp.zaplit.com needs IP update
- ⚠️ SPF record needs IP update
- ⚠️ MX record needs configuration fix

**Next Steps:**
1. Update hcp.zaplit.com A record in Namecheap
2. Update SPF TXT record IP address
3. Fix MX record in Namecheap MAIL SETTINGS
