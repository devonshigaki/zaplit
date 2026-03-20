#!/bin/bash
# =============================================================================
# GCP VM Snapshot Schedule Setup Script
# =============================================================================
# Purpose: Create and attach snapshot schedule for n8n VM daily backups
# Usage:   sudo ./setup-snapshot-schedule.sh
# Owner:   DevOps/SRE Team
# Date:    March 19, 2026
# =============================================================================

set -euo pipefail

# Configuration Variables
VM_NAME="n8n-instance"
ZONE="us-central1-a"
SCHEDULE_NAME="snapshot-schedule-n8n"
RETENTION_DAYS=30
START_TIME="02:00"  # 2:00 AM UTC (low traffic period)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# =============================================================================
# Pre-flight Checks
# =============================================================================

check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check if gcloud is installed
    if ! command -v gcloud &> /dev/null; then
        log_error "gcloud CLI is not installed. Please install Google Cloud SDK."
        exit 1
    fi
    
    # Check if authenticated
    if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q "@"; then
        log_error "Not authenticated with gcloud. Run: gcloud auth login"
        exit 1
    fi
    
    # Check if VM exists
    if ! gcloud compute instances describe "$VM_NAME" --zone="$ZONE" &> /dev/null; then
        log_error "VM '$VM_NAME' not found in zone '$ZONE'"
        exit 1
    fi
    
    log_info "Prerequisites check passed"
}

# =============================================================================
# Create Snapshot Schedule
# =============================================================================

create_snapshot_schedule() {
    log_info "Creating snapshot schedule: $SCHEDULE_NAME"
    
    # Check if schedule already exists
    if gcloud compute resource-policies describe "$SCHEDULE_NAME" --region="${ZONE%-*}" &> /dev/null 2>&1; then
        log_warn "Snapshot schedule '$SCHEDULE_NAME' already exists"
        read -p "Do you want to recreate it? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            log_info "Deleting existing snapshot schedule..."
            gcloud compute resource-policies delete "$SCHEDULE_NAME" --region="${ZONE%-*}" --quiet
        else
            log_info "Using existing snapshot schedule"
            return 0
        fi
    fi
    
    # Create the snapshot schedule
    gcloud compute resource-policies create snapshot-schedule "$SCHEDULE_NAME" \
        --description="Daily backup for n8n VM - automated by SRE" \
        --max-retention-days="$RETENTION_DAYS" \
        --on-source-disk-delete=keep-auto-snapshots \
        --daily-schedule \
        --start-time="$START_TIME" \
        --region="${ZONE%-*}"
    
    log_info "Snapshot schedule created successfully"
    
    # Display schedule details
    log_info "Schedule details:"
    gcloud compute resource-policies describe "$SCHEDULE_NAME" --region="${ZONE%-*}" --format="table(
        name,
        description,
        snapshotSchedulePolicy.schedule.dailySchedule.startTime,
        snapshotSchedulePolicy.retentionPolicy.maxRetentionDays
    )"
}

# =============================================================================
# Attach Schedule to VM Disks
# =============================================================================

attach_schedule_to_vm() {
    log_info "Attaching snapshot schedule to VM: $VM_NAME"
    
    # Get the boot disk name
    BOOT_DISK=$(gcloud compute instances describe "$VM_NAME" --zone="$ZONE" \
        --format="value(disks[0].deviceName)")
    
    log_info "Found boot disk: $BOOT_DISK"
    
    # Check if policy is already attached
    EXISTING_POLICIES=$(gcloud compute disks describe "$BOOT_DISK" --zone="$ZONE" \
        --format="value(resourcePolicies)" 2>/dev/null || echo "")
    
    if [[ "$EXISTING_POLICIES" == *"$SCHEDULE_NAME"* ]]; then
        log_warn "Snapshot schedule already attached to disk '$BOOT_DISK'"
        return 0
    fi
    
    # Attach the schedule to the boot disk
    gcloud compute disks add-resource-policies "$BOOT_DISK" \
        --resource-policies="$SCHEDULE_NAME" \
        --zone="$ZONE"
    
    log_info "Snapshot schedule attached successfully to disk: $BOOT_DISK"
    
    # Verify attachment
    log_info "Verifying attachment..."
    gcloud compute disks describe "$BOOT_DISK" --zone="$ZONE" \
        --format="table(name, resourcePolicies)"
}

# =============================================================================
# Create GCS Backup Bucket
# =============================================================================

create_backup_bucket() {
    local bucket_name="zaplit-n8n-backups"
    local project_id=$(gcloud config get-value project 2>/dev/null)
    
    log_info "Checking GCS backup bucket: gs://$bucket_name"
    
    if gsutil ls -b "gs://$bucket_name" &> /dev/null; then
        log_info "Backup bucket already exists: gs://$bucket_name"
    else
        log_info "Creating GCS backup bucket: gs://$bucket_name"
        gsutil mb -l "us-central1" "gs://$bucket_name/"
        
        # Set lifecycle policy to delete old backups after 90 days
        cat > /tmp/lifecycle-policy.json << 'EOF'
{
  "lifecycle": {
    "rule": [
      {
        "action": {"type": "Delete"},
        "condition": {
          "age": 90,
          "matchesPrefix": ["n8n-db-"]
        }
      }
    ]
  }
}
EOF
        gsutil lifecycle set /tmp/lifecycle-policy.json "gs://$bucket_name/"
        rm /tmp/lifecycle-policy.json
        
        log_info "Backup bucket created with 90-day lifecycle policy"
    fi
    
    # Display bucket info
    gsutil ls -Lb "gs://$bucket_name/" | grep -E "(Location|Storage class|Lifecycle)"
}

# =============================================================================
# Create Backup Directories on VM
# =============================================================================

setup_backup_directories() {
    log_info "Setting up backup directories on VM..."
    
    # SSH to VM and create directories
    gcloud compute ssh "$VM_NAME" --zone="$ZONE" --command="
        sudo mkdir -p /opt/n8n/backups
        sudo mkdir -p /opt/n8n/scripts
        sudo chown -R \\$(whoami):\\$(whoami) /opt/n8n
        echo 'Backup directories created successfully'
    "
    
    log_info "Backup directories configured"
}

# =============================================================================
# Setup Cron Job for Database Backups
# =============================================================================

setup_cron_job() {
    log_info "Setting up cron job for database backups..."
    
    # Copy backup script to VM
    local script_path="/Users/devonshigaki/Downloads/zaplit/scripts/dr/backup-database.sh"
    
    if [[ -f "$script_path" ]]; then
        gcloud compute scp "$script_path" "$VM_NAME:/opt/n8n/scripts/" --zone="$ZONE"
        
        # Make script executable and setup cron
        gcloud compute ssh "$VM_NAME" --zone="$ZONE" --command="
            chmod +x /opt/n8n/scripts/backup-database.sh
            
            # Add cron job (runs at 3:00 AM daily, 1 hour after snapshot)
            (crontab -l 2>/dev/null | grep -v backup-database; echo '0 3 * * * /opt/n8n/scripts/backup-database.sh >> /var/log/n8n-backup.log 2>&1') | crontab -
            
            echo 'Cron job configured for daily backups at 03:00 UTC'
        "
        
        log_info "Database backup cron job configured"
    else
        log_warn "Backup script not found at $script_path"
        log_warn "Please run this script after backup-database.sh is created"
    fi
}

# =============================================================================
# Main Execution
# =============================================================================

main() {
    echo "=========================================="
    echo "  GCP VM Snapshot Schedule Setup"
    echo "  VM: $VM_NAME"
    echo "  Zone: $ZONE"
    echo "=========================================="
    echo ""
    
    check_prerequisites
    echo ""
    
    create_snapshot_schedule
    echo ""
    
    attach_schedule_to_vm
    echo ""
    
    create_backup_bucket
    echo ""
    
    setup_backup_directories
    echo ""
    
    setup_cron_job
    echo ""
    
    log_info "Snapshot schedule setup complete!"
    echo ""
    echo "=========================================="
    echo "  Summary"
    echo "=========================================="
    echo "  ✓ Snapshot Schedule: $SCHEDULE_NAME"
    echo "  ✓ Daily Backup Time: $START_TIME UTC"
    echo "  ✓ Retention Period: $RETENTION_DAYS days"
    echo "  ✓ Attached to VM: $VM_NAME"
    echo "  ✓ GCS Bucket: gs://zaplit-n8n-backups"
    echo "=========================================="
    echo ""
    echo "Next Steps:"
    echo "  1. Verify first snapshot is created tomorrow at $START_TIME UTC"
    echo "  2. Test restore procedure using runbook RB-DR-001"
    echo "  3. Monitor backup logs: /var/log/n8n-backup.log"
    echo ""
}

# Run main function
main "$@"
