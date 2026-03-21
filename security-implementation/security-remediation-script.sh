#!/bin/bash
# GCP Security Remediation Script for zaplit-website-prod
# Run this script to address critical and high-priority security issues

set -e

PROJECT_ID="zaplit-website-prod"
echo "========================================"
echo "GCP Security Remediation Script"
echo "Project: $PROJECT_ID"
echo "========================================"
echo ""

# Verify gcloud is configured for the correct project
current_project=$(gcloud config get-value project 2>/dev/null)
if [ "$current_project" != "$PROJECT_ID" ]; then
    echo "Error: Current project ($current_project) doesn't match target ($PROJECT_ID)"
    echo "Run: gcloud config set project $PROJECT_ID"
    exit 1
fi

echo "✓ Project verified: $PROJECT_ID"
echo ""

# ============================================
# CRITICAL FIXES
# ============================================

echo "========================================"
echo "CRITICAL FIXES"
echo "========================================"
echo ""

# CR-1: Enable Shielded VM (Secure Boot)
echo "[CR-1] Enabling Shielded VM Secure Boot..."
for vm in n8n-server twenty-crm-vm hestia-mail; do
    zone=$(gcloud compute instances list --filter="name=$vm" --format="value(zone)" 2>/dev/null)
    if [ -n "$zone" ]; then
        echo "  - Processing $vm in $zone..."
        # Note: VM must be stopped to update shielded config
        # Uncomment below to apply (requires downtime):
        # gcloud compute instances stop $vm --zone=$zone --quiet
        # gcloud compute instances update $vm --zone=$zone \
        #     --shielded-secure-boot \
        #     --shielded-vtpm \
        #     --shielded-integrity-monitoring
        # gcloud compute instances start $vm --zone=$zone
        echo "    ⚠️ Manual action required: Stop VM and enable shielded-secure-boot"
    fi
done
echo ""

# CR-2: Fix overly permissive firewall rule
echo "[CR-2] Restricting default-allow-internal firewall rule..."
echo "  Current rule allows ALL ports from 10.128.0.0/9"
echo "  ⚠️ Manual action required: Review and restrict to required ports only"
echo "  Suggested fix:"
echo "    gcloud compute firewall-rules update default-allow-internal \\"
echo "      --allow tcp:22,tcp:443,tcp:80,icmp \\"
echo "      --source-ranges 10.128.0.0/20"
echo ""

# ============================================
# HIGH PRIORITY FIXES
# ============================================

echo "========================================"
echo "HIGH PRIORITY FIXES"
echo "========================================"
echo ""

# HP-1: Enable OS Login
echo "[HP-1] Enabling OS Login project-wide..."
echo "  ⚠️ This will disable project-wide SSH keys"
echo "  Uncomment to apply:"
echo "    # gcloud compute project-info add-metadata \\"
echo "    #   --metadata enable-os-login=TRUE"
echo "    # gcloud compute project-info remove-metadata --keys=ssh-keys"
echo ""

# HP-2: Cloud Run Service Accounts
echo "[HP-2] Updating Cloud Run service accounts..."
for service in zaplit-com zaplit-org; do
    echo "  - Updating $service to use dedicated service account..."
    if [ "$service" == "zaplit-com" ] || [ "$service" == "zaplit-org" ]; then
        sa="nextjs-sa@zaplit-website-prod.iam.gserviceaccount.com"
        # Uncomment to apply:
        # gcloud run services update $service \
        #     --service-account=$sa \
        #     --region=us-central1 \
        #     --quiet
        echo "    Would set service account to: $sa"
    fi
done
echo ""

# HP-3: Cloud Armor WAF Rules
echo "[HP-3] Configuring Cloud Armor WAF rules..."
echo "  Creating SQL injection protection rule..."
# Uncomment to apply:
# gcloud compute security-policies rules create 1000 \
#     --security-policy=zaplit-waf-policy \
#     --expression="evaluatePreconfiguredExpr('sqli-stable')" \
#     --action="deny(403)" \
#     --description="SQL injection protection" \
#     --quiet 2>/dev/null || echo "    Rule may already exist"

echo "  Creating XSS protection rule..."
# Uncomment to apply:
# gcloud compute security-policies rules create 1001 \
#     --security-policy=zaplit-waf-policy \
#     --expression="evaluatePreconfiguredExpr('xss-stable')" \
#     --action="deny(403)" \
#     --description="XSS protection" \
#     --quiet 2>/dev/null || echo "    Rule may already exist"
echo ""

# ============================================
# MEDIUM PRIORITY FIXES
# ============================================

echo "========================================"
echo "MEDIUM PRIORITY FIXES"
echo "========================================"
echo ""

# MP-1: Enable Private Google Access
echo "[MP-1] Enabling Private Google Access on us-central1 subnet..."
# Uncomment to apply:
# gcloud compute networks subnets update default \
#     --region=us-central1 \
#     --enable-private-ip-google-access \
#     --quiet
echo ""

# MP-2: Create Backup Schedule
echo "[MP-2] Creating backup schedule for critical VMs..."
# Uncomment to apply:
# gcloud compute resource-policies create snapshot-schedule daily-backup \
#     --description="Daily backup at 3 AM" \
#     --max-retention-days=30 \
#     --on-source-disk-delete=keep-auto-snapshots \
#     --daily-schedule \
#     --start-time=03:00 \
#     --region=us-central1 \
#     --quiet 2>/dev/null || echo "  Policy may already exist"
echo ""

# ============================================
# VERIFICATION
# ============================================

echo "========================================"
echo "VERIFICATION CHECKS"
echo "========================================"
echo ""

echo "Checking firewall rules..."
gcloud compute firewall-rules list --format="table(name,sourceRanges,allowed)"
echo ""

echo "Checking VM shielded config..."
gcloud compute instances list --format="table(name,shieldedInstanceConfig.enableSecureBoot,shieldedInstanceConfig.enableVtpm)"
echo ""

echo "Checking Cloud Run service accounts..."
gcloud run services list --format="table(metadata.name,spec.template.spec.serviceAccountName)"
echo ""

echo "========================================"
echo "REMEDIATION SCRIPT COMPLETED"
echo "========================================"
echo ""
echo "Note: Many fixes are commented out to prevent accidental changes."
echo "Review the script and uncomment lines to apply fixes."
echo ""
echo "Priority order:"
echo "1. Run CRITICAL fixes (CR-1, CR-2)"
echo "2. Run HIGH priority fixes (HP-1 to HP-5)"
echo "3. Run MEDIUM priority fixes (MP-1 to MP-8)"
echo ""
