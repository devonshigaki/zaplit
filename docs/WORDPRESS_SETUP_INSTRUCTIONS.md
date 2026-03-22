# WordPress Setup Instructions for sign.freshcredit.com

**Date:** March 21, 2026

---

## ✅ Hestia CP Access (Working)

| | |
|---|---|
| **URL** | https://hcp.zaplit.com:8083 |
| **Username** | zaplitadmin |
| **Password** | ZaplitHestia2025! |

---

## Step 1: Update DNS (REQUIRED FIRST)

**Current:** sign.freshcredit.com → 136.117.71.179  
**Required:** sign.freshcredit.com → 35.188.131.226

### In Namecheap:
1. Go to Domain List → Manage (freshcredit.com)
2. Click **Advanced DNS**
3. Add/Update A record:
   - **Host:** `sign`
   - **Value:** `35.188.131.226`
   - **TTL:** Automatic
4. Save

**Wait 5-10 minutes for propagation**

---

## Step 2: Add Domain in Hestia CP

1. Login to https://hcp.zaplit.com:8083
2. Click **Web** in top menu
3. Click **Add Web Domain**
4. Fill in:
   - **Domain:** `sign.freshcredit.com`
   - **IP Address:** Select `35.188.131.226`
   - ✅ Enable **SSL** (Let's Encrypt)
   - ✅ Enable **PHP-FPM 8.2**
   - ✅ Enable **Web Statistics**
5. Click **Save**

---

## Step 3: Install WordPress (Quick Install)

1. In Hestia CP, click on **sign.freshcredit.com**
2. Click **Quick Install App**
3. Select **WordPress**
4. Fill in:
   - **Database Name:** `signfreshcredit_wp`
   - **Database User:** `signfreshcredit_user`
   - **Database Password:** (generate strong password)
   - **Site Title:** `FreshCredit Signatures`
   - **Admin Username:** `fcadmin` (NOT 'admin')
   - **Admin Password:** (generate strong password)
   - **Admin Email:** admin@freshcredit.com
5. Click **Install**

**WordPress will be installed at:** https://sign.freshcredit.com

---

## Step 4: Install Available Plugins

Plugins found on external drive:
- ✅ gravityforms.zip
- ✅ gravitysmtp.zip
- ✅ gravityflow.zip
- ✅ wp-rocket.zip
- ❌ **WP E-Signature - NOT FOUND (you need to provide this)**

### Upload Plugins:

1. Login to WordPress admin: https://sign.freshcredit.com/wp-admin
2. Go to **Plugins → Add New → Upload Plugin**
3. Upload each plugin one by one:
   - `/Volumes/Devon's G-Drive/plugins/gravityforms.zip`
   - `/Volumes/Devon's G-Drive/plugins/gravitysmtp.zip`
   - `/Volumes/Devon's G-Drive/plugins/gravityflow.zip`
   - `/Volumes/Devon's G-Drive/plugins/wp-rocket.zip`
4. Activate each plugin after upload

---

## Step 5: WP E-Signature (Pending)

**Status:** Plugin not found on external drive

**Options:**
1. **Purchase from ApproveMe:** https://aprv.me
   - Pro License: $249/year
   - Lifetime: $349 one-time

2. **Provide the plugin file:**
   - Upload to: `/Volumes/Devon's G-Drive/plugins/wp-esignature.zip`
   - Then install via WordPress

3. **Alternative eSignature plugins:**
   - DocuSign for WordPress
   - WP E-Signature alternatives

---

## Step 6: Security Configuration

### Essential Security Plugins to Install:
1. **Wordfence Security** (Free/Premium)
2. **Two Factor Authentication**
3. **WP Security Audit Log**

### Hardening Steps:
1. In wp-config.php add:
   ```php
   define('FORCE_SSL_ADMIN', true);
   define('DISALLOW_FILE_EDIT', true);
   ```

2. Change default WordPress table prefix from `wp_` to `fc_`

3. Enable automatic updates

4. Set up backups (UpdraftPlus)

---

## Step 7: Email Configuration

1. In Hestia CP, create email:
   - **Email:** noreply@sign.freshcredit.com
   - **Password:** (generate)

2. In WordPress, configure Gravity SMTP:
   - Use SMTP relay
   - Host: smtp-relay.brevo.com
   - Port: 587
   - Authentication: Brevo credentials

---

## Summary

| Step | Status | Action |
|------|--------|--------|
| 1. DNS Update | ⏳ Required | Update A record in Namecheap |
| 2. Hestia Domain | ⏳ Required | Add via Hestia CP |
| 3. WordPress Install | ⏳ Required | Use Quick Install |
| 4. Available Plugins | ⏳ Ready | Upload from external drive |
| 5. WP E-Signature | ❌ Missing | Provide or purchase plugin |
| 6. Security | ⏳ Required | Install security plugins |
| 7. Email | ⏳ Required | Create and configure |

---

## Next Actions

1. **Update DNS** for sign.freshcredit.com
2. **Add domain** in Hestia CP
3. **Install WordPress**
4. **Upload plugins** from external drive
5. **Provide WP E-Signature plugin** for installation

---

**Support:** If you need help with any step, provide the WP E-Signature plugin and I can complete the full installation.
