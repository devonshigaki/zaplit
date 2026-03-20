# SSL/TLS Fix Quick Reference - Hestia Mail Server

## 🔴 CRITICAL - Fix Immediately

### 1. Open GCP Firewall for Mail Ports

```bash
gcloud compute firewall-rules create allow-hestia-mail \
    --project=zaplit-website-prod \
    --direction=INGRESS \
    --priority=1000 \
    --network=default \
    --action=ALLOW \
    --rules=tcp:25,tcp:465,tcp:587,tcp:993,tcp:995,tcp:8083 \
    --source-ranges=0.0.0.0/0 \
    --target-tags=mail,hestia
```

### 2. Get Valid Let's Encrypt Certificate (DNS Challenge Method)

Since `zaplit.com` points to Google Sites, use DNS-01 challenge:

```bash
# SSH to server
gcloud compute ssh hestia-mail --zone=us-central1-a --project=zaplit-website-prod

# Install certbot (if not present)
sudo apt-get update && sudo apt-get install -y certbot

# Request certificate using DNS challenge
sudo certbot certonly --manual --preferred-challenges dns \
    -d mail.zaplit.com \
    -d webmail.zaplit.com \
    --agree-tos -m admin@zaplit.com

# During the process, you'll need to add DNS TXT records:
# _acme-challenge.mail.zaplit.com      TXT  "<value from certbot>"
# _acme-challenge.webmail.zaplit.com   TXT  "<value from certbot>"

# Copy certificates to Hestia
sudo cp /etc/letsencrypt/live/mail.zaplit.com/fullchain.pem /usr/local/hestia/ssl/certificate.crt
sudo cp /etc/letsencrypt/live/mail.zaplit.com/privkey.pem /usr/local/hestia/ssl/certificate.key

# Set permissions
sudo chown root:mail /usr/local/hestia/ssl/certificate.*
sudo chmod 640 /usr/local/hestia/ssl/certificate.*

# Restart services
sudo systemctl restart hestia exim4 dovecot nginx apache2
```

### 3. Set Up Auto-Renewal

```bash
# Create renewal hook script
sudo tee /etc/letsencrypt/renewal-hooks/deploy/hestia.sh << 'EOF'
#!/bin/bash
# Deploy renewed certificates to Hestia

DOMAIN=mail.zaplit.com
HESTIA_SSL=/usr/local/hestia/ssl

cp /etc/letsencrypt/live/$DOMAIN/fullchain.pem $HESTIA_SSL/certificate.crt
cp /etc/letsencrypt/live/$DOMAIN/privkey.pem $HESTIA_SSL/certificate.key

chown root:mail $HESTIA_SSL/certificate.*
chmod 640 $HESTIA_SSL/certificate.*

# Restart services
systemctl restart hestia exim4 dovecot nginx apache2
EOF

sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/hestia.sh

# Test renewal
certbot renew --dry-run

# Add to cron (runs twice daily)
echo "0 3,15 * * * root certbot renew --quiet --deploy-hook '/etc/letsencrypt/renewal-hooks/deploy/hestia.sh'" | sudo tee -a /etc/crontab
```

---

## 🟡 MEDIUM PRIORITY - Fix This Week

### 4. Add HSTS Header

```bash
# Enable SSL force for domain
sudo /usr/local/hestia/bin/v-add-web-domain-ssl-force zaplitadmin mail.zaplit.com

# Add HSTS config to nginx template (create custom template)
sudo mkdir -p /usr/local/hestia/data/templates/web/nginx/custom
sudo tee /usr/local/hestia/data/templates/web/nginx/custom/mail.stpl << 'EOF'
# Custom template with HSTS
server {
    listen      %ip%:%proxy_ssl_port% ssl;
    server_name %domain_idn% %alias_idn%;
    
    ssl_certificate     %ssl_pem%;
    ssl_certificate_key %ssl_key%;
    ssl_stapling        on;
    ssl_stapling_verify on;
    
    # HSTS Header
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
    
    # Security headers
    add_header X-Content-Type-Options nosniff;
    add_header X-Frame-Options SAMEORIGIN;
    add_header X-XSS-Protection "1; mode=block";
    
    include %home%/%user%/conf/web/%domain%/nginx.hsts.conf*;
    
    location ~ /\. { deny all; return 404; }
    location / { proxy_pass http://%ip%:%web_port%; }
}
EOF

# Apply template (rebuild domain)
sudo /usr/local/hestia/bin/v-change-web-domain-tpl zaplitadmin mail.zaplit.com custom/mail
```

### 5. Fix webmail.zaplit.com SSL

```bash
# Add webmail as alias
sudo /usr/local/hestia/bin/v-add-web-domain-alias zaplitadmin mail.zaplit.com webmail.zaplit.com

# Rebuild SSL configuration
sudo /usr/local/hestia/bin/v-rebuild-web-domains zaplitadmin
```

---

## ✅ VERIFICATION

```bash
# Test from local machine (after firewall fix)

# Check certificate
openssl s_client -connect mail.zaplit.com:993 -servername mail.zaplit.com </dev/null | openssl x509 -noout -text | grep -E "Issuer:|Subject:|Not After"

# Test TLS versions
openssl s_client -connect mail.zaplit.com:993 -tls1_3 </dev/null 2>&1 | grep "Protocol"
openssl s_client -connect mail.zaplit.com:465 -tls1_2 </dev/null 2>&1 | grep "Protocol"

# Test weak protocols (should fail)
openssl s_client -connect mail.zaplit.com:993 -tls1 </dev/null 2>&1 | grep "error"
openssl s_client -connect mail.zaplit.com:993 -tls1_1 </dev/null 2>&1 | grep "error"

# Check HSTS
curl -sI https://mail.zaplit.com:8083 | grep -i strict-transport

# Check certificate expiry
echo | openssl s_client -servername mail.zaplit.com -connect mail.zaplit.com:993 2>/dev/null | openssl x509 -noout -dates
```

---

## 🔍 TROUBLESHOOTING

### Issue: Let's Encrypt HTTP-01 fails

**Cause:** zaplit.com doesn't point to this server

**Fix:** Use DNS-01 challenge (see Fix #2 above)

### Issue: Certificate not loading

```bash
# Check certificate validity
sudo openssl x509 -in /usr/local/hestia/ssl/certificate.crt -noout -text

# Check permissions
sudo ls -la /usr/local/hestia/ssl/

# Verify key matches certificate
CERT_MOD=$(sudo openssl x509 -noout -modulus -in /usr/local/hestia/ssl/certificate.crt | openssl md5)
KEY_MOD=$(sudo openssl rsa -noout -modulus -in /usr/local/hestia/ssl/certificate.key | openssl md5)
echo "Certificate: $CERT_MOD"
echo "Key:         $KEY_MOD"
```

### Issue: Ports not accessible externally

```bash
# Check GCP firewall rules
gcloud compute firewall-rules list --project=zaplit-website-prod --filter="name:allow-hestia-mail"

# Check if services are listening
sudo netstat -tlnp | grep -E ':(25|465|587|993|995|8083)'

# Check iptables rules
sudo iptables -L -n | grep -E '25|465|587|993|995|8083'
```

---

## 📋 SUMMARY CHECKLIST

- [ ] GCP firewall rule created for mail ports
- [ ] Let's Encrypt certificate obtained
- [ ] Certificate deployed to Hestia SSL directory
- [ ] Services restarted (hestia, exim4, dovecot)
- [ ] Auto-renewal configured
- [ ] webmail.zaplit.com configured with SSL
- [ ] HSTS enabled
- [ ] Certificate tested externally
- [ ] Mail clients tested with new certificate

---

*Quick reference for Hestia SSL fixes*
