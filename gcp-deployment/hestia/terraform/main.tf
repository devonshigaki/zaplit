# Hestia Control Panel Infrastructure
# Deploys to GCP Compute Engine for WordPress + Roundcube hosting
# FIXED VERSION: Uses Secret Manager, improved security, better monitoring

terraform {
  required_version = ">= 1.5.0, < 2.0.0"
  
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }
  
  # GCS backend with implicit locking via object versioning
  backend "gcs" {
    bucket = "zaplit-terraform-state"
    prefix = "hestia"
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

# Generate random passwords (stored in Secret Manager)
resource "random_password" "hestia_admin" {
  length           = 24
  special          = true
  override_special = "!@#$%^&*"
  min_upper        = 2
  min_lower        = 2
  min_numeric      = 2
  min_special      = 2
}

resource "random_password" "wordpress_db" {
  length           = 24
  special          = true
  override_special = "!@#$%^&*"
  min_upper        = 2
  min_lower        = 2
  min_numeric      = 2
  min_special      = 2
}

resource "random_password" "mysql_root" {
  length           = 24
  special          = true
  override_special = "!@#$%^&*"
  min_upper        = 2
  min_lower        = 2
  min_numeric      = 2
  min_special      = 2
}

# Store passwords in Secret Manager
resource "google_secret_manager_secret_version" "hestia_password" {
  secret      = google_secret_manager_secret.hestia_password.id
  secret_data = random_password.hestia_admin.result
}

resource "google_secret_manager_secret_version" "wordpress_db_password" {
  secret      = google_secret_manager_secret.wordpress_db_password.id
  secret_data = random_password.wordpress_db.result
}

resource "google_secret_manager_secret_version" "mysql_root_password" {
  secret      = google_secret_manager_secret.mysql_root_password.id
  secret_data = random_password.mysql_root.result
}

# Static IP for Hestia server (required for DNS)
resource "google_compute_address" "hestia" {
  name         = "hestia-cp-ip"
  region       = var.region
  address_type = "EXTERNAL"
  network_tier = "PREMIUM"
  
  labels = {
    environment = var.environment
    service     = "hestia-cp"
    managed_by  = "terraform"
  }
}

# Compute Engine instance for Hestia CP
resource "google_compute_instance" "hestia" {
  name         = "hestia-cp"
  machine_type = var.machine_type
  zone         = var.zone
  tags         = ["hestia-cp", "web-server", "mail-server"]
  
  allow_stopping_for_update = true

  boot_disk {
    initialize_params {
      image = "ubuntu-2404-lts-amd64"
      size  = var.disk_size
      type  = "pd-balanced"  # Changed from pd-ssd for cost optimization
    }
    
    auto_delete = false  # Keep disk on instance deletion for safety
  }

  network_interface {
    network = "default"
    access_config {
      nat_ip       = google_compute_address.hestia.address
      network_tier = "PREMIUM"
    }
  }

  metadata = {
    enable-oslogin = "TRUE"
  }

  # FIXED: No secrets in metadata - they are retrieved from Secret Manager at runtime
  metadata_startup_script = templatefile("${path.module}/startup-fixed.sh", {
    domain       = var.domain
    admin_email  = var.admin_email
    project_id   = var.project_id
  })

  labels = {
    environment = var.environment
    service     = "hestia-cp"
    managed_by  = "terraform"
  }
  
  # Service account with minimal permissions
  service_account {
    email  = google_service_account.hestia.email
    scopes = [
      "https://www.googleapis.com/auth/cloud-identity",
      "https://www.googleapis.com/auth/devstorage.read_write",
      "https://www.googleapis.com/auth/logging.write",
      "https://www.googleapis.com/auth/monitoring.write",
      "https://www.googleapis.com/auth/secretmanager"
    ]
  }

  lifecycle {
    prevent_destroy = true
    ignore_changes = [
      metadata_startup_script  # Ignore changes to startup script after initial boot
    ]
  }
}

# Service account for Hestia VM
resource "google_service_account" "hestia" {
  account_id   = "hestia-cp-sa"
  display_name = "Hestia CP Service Account"
  description  = "Service account for Hestia CP VM"
}

# FIXED: Least-privilege bucket permissions instead of project-level
resource "google_storage_bucket_iam_member" "hestia_backup_writer" {
  bucket = google_storage_bucket.hestia_backups.name
  role   = "roles/storage.objectCreator"
  member = "serviceAccount:${google_service_account.hestia.email}"
}

resource "google_storage_bucket_iam_member" "hestia_backup_reader" {
  bucket = google_storage_bucket.hestia_backups.name
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:${google_service_account.hestia.email}"
}

# Firewall rules for Hestia services
resource "google_compute_firewall" "hestia_web" {
  name    = "hestia-web-ports"
  network = "default"

  allow {
    protocol = "tcp"
    ports = [
      "80",    # HTTP
      "443",   # HTTPS
    ]
  }

  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["hestia-cp"]
}

resource "google_compute_firewall" "hestia_mail" {
  name    = "hestia-mail-ports"
  network = "default"

  allow {
    protocol = "tcp"
    ports = [
      "25",    # SMTP
      "587",   # SMTP Submission
      "465",   # SMTPS
      "143",   # IMAP
      "993",   # IMAPS
      "110",   # POP3
      "995",   # POP3S
    ]
  }

  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["hestia-cp"]
}

resource "google_compute_firewall" "hestia_admin" {
  name    = "hestia-admin-port"
  network = "default"

  allow {
    protocol = "tcp"
    ports    = [var.hestia_port]
  }

  # FIXED: Require explicit IP addresses
  source_ranges = length(var.allowed_admin_ips) > 0 ? var.allowed_admin_ips : ["127.0.0.1/32"]
  target_tags   = ["hestia-cp"]
}

resource "google_compute_firewall" "hestia_ssh" {
  name    = "hestia-ssh"
  network = "default"

  allow {
    protocol = "tcp"
    ports    = ["22"]
  }

  # FIXED: Require explicit IP addresses
  source_ranges = length(var.allowed_ssh_ips) > 0 ? var.allowed_ssh_ips : ["127.0.0.1/32"]
  target_tags   = ["hestia-cp"]
}

# GCS bucket for backups with encryption and lifecycle
resource "google_storage_bucket" "hestia_backups" {
  name          = "${var.project_id}-hestia-backups"
  location      = var.region
  storage_class = "COLDLINE"
  
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  
  versioning {
    enabled = true
  }
  
  lifecycle_rule {
    action {
      type = "Delete"
    }
    condition {
      age = 90  # Delete old versions after 90 days
    }
  }
  
  lifecycle_rule {
    action {
      type          = "SetStorageClass"
      storage_class = "ARCHIVE"
    }
    condition {
      age = 30  # Move to archive after 30 days
    }
  }
  
  labels = {
    environment = var.environment
    service     = "hestia-cp"
    purpose     = "backup"
  }
}

# Cross-region backup bucket for DR (optional)
resource "google_storage_bucket" "hestia_backups_dr" {
  count         = var.enable_cross_region_backup ? 1 : 0
  name          = "${var.project_id}-hestia-backups-dr"
  location      = var.dr_region
  storage_class = "COLDLINE"
  
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  
  versioning {
    enabled = true
  }
  
  labels = {
    environment = var.environment
    service     = "hestia-cp"
    purpose     = "disaster-recovery"
  }
}

# Scheduled disk snapshots for faster recovery
resource "google_compute_resource_policy" "daily_snapshot" {
  name   = "hestia-daily-snapshot"
  region = var.region
  
  snapshot_schedule_policy {
    schedule {
      daily_schedule {
        days_in_cycle = 1
        start_time    = "03:00"
      }
    }
    retention_policy {
      max_retention_days    = 30
      on_source_disk_delete = "KEEP_AUTO_SNAPSHOTS"
    }
    snapshot_properties {
      labels = {
        environment = var.environment
        service     = "hestia-cp"
      }
      storage_locations = [var.region]
    }
  }
}

# DNS records (if Cloud DNS zone is provided)
resource "google_dns_record_set" "sign" {
  count        = var.dns_zone_name != "" ? 1 : 0
  name         = "sign.${var.domain}."
  type         = "A"
  ttl          = 300
  managed_zone = var.dns_zone_name
  rrdatas      = [google_compute_address.hestia.address]
}

resource "google_dns_record_set" "webmail" {
  count        = var.dns_zone_name != "" ? 1 : 0
  name         = "webmail.${var.domain}."
  type         = "A"
  ttl          = 300
  managed_zone = var.dns_zone_name
  rrdatas      = [google_compute_address.hestia.address]
}

resource "google_dns_record_set" "cp" {
  count        = var.dns_zone_name != "" ? 1 : 0
  name         = "cp.${var.domain}."
  type         = "A"
  ttl          = 300
  managed_zone = var.dns_zone_name
  rrdatas      = [google_compute_address.hestia.address]
}

# MX record for mail
resource "google_dns_record_set" "mx" {
  count        = var.dns_zone_name != "" ? 1 : 0
  name         = "${var.domain}."
  type         = "MX"
  ttl          = 3600
  managed_zone = var.dns_zone_name
  rrdatas      = ["10 mail.${var.domain}."]
}

# SPF record
resource "google_dns_record_set" "spf" {
  count        = var.dns_zone_name != "" ? 1 : 0
  name         = "${var.domain}."
  type         = "TXT"
  ttl          = 3600
  managed_zone = var.dns_zone_name
  rrdatas      = ["v=spf1 mx a:mail.${var.domain} ~all"]
}

# DMARC record
resource "google_dns_record_set" "dmarc" {
  count        = var.dns_zone_name != "" ? 1 : 0
  name         = "_dmarc.${var.domain}."
  type         = "TXT"
  ttl          = 3600
  managed_zone = var.dns_zone_name
  rrdatas      = ["v=DMARC1; p=quarantine; rua=mailto:admin@${var.domain}"]
}

# Cloud Monitoring Uptime Check
resource "google_monitoring_uptime_check_config" "sign_https" {
  display_name = "sign.${var.domain} HTTPS"
  timeout      = "10s"
  period       = "60s"

  http_check {
    path         = "/"
    port         = "443"
    use_ssl      = true
    validate_ssl = true
  }

  monitored_resource {
    type = "uptime_url"
    labels = {
      project_id = var.project_id
      host       = "sign.${var.domain}"
    }
  }
}

# Outputs
output "hestia_ip" {
  description = "External IP address of the Hestia VM"
  value       = google_compute_address.hestia.address
}

output "hestia_admin_url" {
  description = "URL for Hestia Control Panel"
  value       = "https://${google_compute_address.hestia.address}:${var.hestia_port}"
}

output "sign_url" {
  description = "URL for WordPress sign site"
  value       = "https://sign.${var.domain}"
}

output "webmail_url" {
  description = "URL for Roundcube webmail"
  value       = "https://webmail.${var.domain}"
}

output "ssh_command" {
  description = "Command to SSH into the VM"
  value       = "gcloud compute ssh hestia-cp --zone=${var.zone}"
}

output "backup_bucket" {
  description = "GCS bucket for backups"
  value       = google_storage_bucket.hestia_backups.name
}

output "password_secrets" {
  description = "Secret Manager names for passwords"
  value = {
    hestia     = google_secret_manager_secret.hestia_password.name
    wordpress  = google_secret_manager_secret.wordpress_db_password.name
    mysql      = google_secret_manager_secret.mysql_root_password.name
  }
  sensitive = false
}

output "security_notes" {
  description = "Post-deployment security checklist"
  value       = <<-EOT
    SECURITY CHECKLIST:
    1. Change Hestia admin password after first login
    2. Restrict firewall rules to specific IPs (currently limited by default)
    3. Enable 2FA for admin accounts
    4. Review fail2ban logs regularly
    5. Test backup restoration quarterly
    6. Monitor Cloud Security Command Center
  EOT
}
