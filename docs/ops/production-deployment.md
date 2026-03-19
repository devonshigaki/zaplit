# Production Deployment Guide

> **Complete production deployment for Zaplit stack**

## Prerequisites

- GCP Project with billing enabled
- Domain registered (zaplit.com, zaplit.org)
- DNS managed by Cloudflare or Google Cloud DNS
- gcloud CLI installed and authenticated

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────────────────────┐
│   Cloudflare│────▶│   Cloud CDN │────▶│       Cloud Run             │
│     DNS     │     │   (optional)│     │  ┌─────────┐  ┌─────────┐   │
└─────────────┘     └─────────────┘     │  │zaplit   │  │zaplit   │   │
                                        │  │  -com   │  │  -org   │   │
                                        │  └────┬────┘  └────┬────┘   │
                                        └───────┼───────────┼──────────┘
                                                │           │
                      ┌─────────────────────────┴───────────┴──────────┐
                      │                                                │
                      ▼                                                ▼
              ┌──────────────┐                                ┌──────────────┐
              │     n8n      │                                │  Secret      │
              │  (Compute    │◀───────────────────────────────│  Manager     │
              │   Engine)    │                                └──────────────┘
              └──────┬───────┘
                     │
         ┌───────────┼───────────┐
         ▼           ▼           ▼
   ┌──────────┐ ┌────────┐ ┌──────────┐
   │  SendGrid│ │ Twenty │ │  Slack   │
   │  (Email) │ │  CRM   │ │(Alerts)  │
   └──────────┘ └────────┘ └──────────┘
```

## Deployment Order

1. **Secrets** → Secret Manager
2. **n8n** → Compute Engine (VM)
3. **Twenty CRM** → Cloud Run
4. **zaplit-com/org** → Cloud Run
5. **DNS** → Domain mapping

---

## 1. Secret Manager Setup

```bash
# Set project
gcloud config set project zaplit-website-prod

# Create secrets
echo -n "your-webhook-secret" | gcloud secrets create n8n-webhook-secret --data-file=-
echo -n "https://n8n.yourdomain.com/webhook/contact" | gcloud secrets create n8n-webhook-contact --data-file=-
echo -n "https://n8n.yourdomain.com/webhook/consultation" | gcloud secrets create n8n-webhook-consultation --data-file=-
echo -n "your-sendgrid-key" | gcloud secrets create sendgrid-api-key --data-file=-

# Verify
gcloud secrets list
```

---

## 2. n8n Deployment (Compute Engine VM)

**Why Compute Engine?**
- Cloud Run doesn't support queue mode needed for high-volume processing
- n8n needs persistent storage for SQLite/Postgres
- Better control over scaling and resources

### 2.1 Create VM

```bash
# Create VM with container
gcloud compute instances create-with-container n8n-server \
  --zone=us-central1-a \
  --machine-type=e2-medium \
  --boot-disk-size=20GB \
  --container-image=n8nio/n8n:latest \
  --container-env=N8N_BASIC_AUTH_ACTIVE=true \
  --container-env=N8N_BASIC_AUTH_USER=admin \
  --container-env=N8N_BASIC_AUTH_PASSWORD=your-secure-password \
  --container-env=WEBHOOK_URL=https://n8n.yourdomain.com \
  --container-env=GENERIC_TIMEZONE=America/Los_Angeles \
  --tags=n8n-server \
  --scopes=cloud-platform

# Reserve static IP
gcloud compute addresses create n8n-ip --region=us-central1

# Get IP and update DNS
gcloud compute addresses describe n8n-ip --region=us-central1 --format='value(address)'
```

### 2.2 Configure Firewall

```bash
# Allow HTTPS
gcloud compute firewall-rules create allow-n8n-https \
  --allow=tcp:443 \
  --source-ranges=0.0.0.0/0 \
  --target-tags=n8n-server
```

### 2.3 Set Up HTTPS with Caddy

Create `Caddyfile`:
```
n8n.yourdomain.com {
  reverse_proxy localhost:5678
  
  # Security headers
  header {
    Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
    X-Content-Type-Options "nosniff"
    X-Frame-Options "DENY"
    X-XSS-Protection "1; mode=block"
  }
  
  # Rate limiting
  rate_limit {
    zone ip_limit {
      key {remote_host}
      events 100
      window 1m
    }
  }
}
```

Deploy Caddy:
```bash
# SSH to VM
gcloud compute ssh n8n-server --zone=us-central1-a

# Install Caddy
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install caddy

# Configure Caddy
sudo nano /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

---

## 3. Twenty CRM Deployment

```bash
# Deploy Twenty CRM
gcloud run deploy twenty-crm \
  --image=twentycrm/twenty:latest \
  --region=us-central1 \
  --platform=managed \
  --allow-unauthenticated \
  --memory=1Gi \
  --cpu=1 \
  --concurrency=80 \
  --max-instances=10 \
  --set-env-vars="NODE_ENV=production" \
  --set-env-vars="FRONTEND_URL=https://crm.zaplit.com" \
  --service-account=twenty-crm@zaplit-website-prod.iam.gserviceaccount.com
```

---

## 4. Zaplit Websites Deployment

### 4.1 Service Account

```bash
# Create dedicated service account
gcloud iam service-accounts create zaplit-web \
  --display-name="Zaplit Web Services"

# Grant minimal permissions
gcloud projects add-iam-policy-binding zaplit-website-prod \
  --member="serviceAccount:zaplit-web@zaplit-website-prod.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

gcloud projects add-iam-policy-binding zaplit-website-prod \
  --member="serviceAccount:zaplit-web@zaplit-website-prod.iam.gserviceaccount.com" \
  --role="roles/logging.logWriter"
```

### 4.2 Deploy zaplit-com

```bash
cd zaplit-com

# Build container
gcloud builds submit --tag gcr.io/zaplit-website-prod/zaplit-com

# Deploy with production settings
gcloud run deploy zaplit-com \
  --image gcr.io/zaplit-website-prod/zaplit-com \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --memory=512Mi \
  --cpu=1 \
  --concurrency=100 \
  --max-instances=50 \
  --min-instances=1 \
  --service-account=zaplit-web@zaplit-website-prod.iam.gserviceaccount.com \
  --set-env-vars="NODE_ENV=production" \
  --set-secrets="N8N_WEBHOOK_CONSULTATION=n8n-webhook-consultation:latest,N8N_WEBHOOK_CONTACT=n8n-webhook-contact:latest,N8N_WEBHOOK_SECRET=n8n-webhook-secret:latest"
```

### 4.3 Deploy zaplit-org

```bash
cd zaplit-org
gcloud builds submit --tag gcr.io/zaplit-website-prod/zaplit-org

gcloud run deploy zaplit-org \
  --image gcr.io/zaplit-website-prod/zaplit-org \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --memory=512Mi \
  --cpu=1 \
  --concurrency=100 \
  --max-instances=50 \
  --min-instances=1 \
  --service-account=zaplit-web@zaplit-website-prod.iam.gserviceaccount.com
```

### 4.4 Domain Mapping

```bash
# Map domains
gcloud beta run domain-mappings create \
  --service=zaplit-com \
  --domain=zaplit.com \
  --region=us-central1

gcloud beta run domain-mappings create \
  --service=zaplit-com \
  --domain=www.zaplit.com \
  --region=us-central1

gcloud beta run domain-mappings create \
  --service=zaplit-org \
  --domain=zaplit.org \
  --region=us-central1

# Check status (SSL provisioning takes 2-5 min)
gcloud beta run domain-mappings list --region=us-central1
```

---

## 5. DNS Configuration

In Cloudflare (or your DNS provider):

| Type | Name | Value | TTL |
|------|------|-------|-----|
| A | zaplit.com | Cloud Run IPs | Auto |
| AAAA | zaplit.com | Cloud Run IPs | Auto |
| CNAME | www | zaplit.com | Auto |
| A | zaplit.org | Cloud Run IPs | Auto |
| AAAA | zaplit.org | Cloud Run IPs | Auto |
| CNAME | www.zaplit | zaplit.org | Auto |
| A | n8n | VM static IP | Auto |

---

## Production Checklist

Before going live:

- [ ] All secrets created in Secret Manager
- [ ] n8n accessible and workflows imported
- [ ] Twenty CRM accessible and configured
- [ ] zaplit-com deployed and responding
- [ ] zaplit-org deployed and responding
- [ ] Domain SSL certificates active
- [ ] Form submissions working end-to-end
- [ ] Error handling tested
- [ ] Monitoring dashboards created
- [ ] Backup schedules configured
- [ ] Documentation handed off

---

**Next**: [Monitoring & Alerts](./monitoring.md)
