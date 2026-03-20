# Variables for Hestia CP Terraform configuration
# FIXED VERSION: Better validation, improved security defaults

variable "project_id" {
  description = "GCP Project ID"
  type        = string
  
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{4,28}[a-z0-9]$", var.project_id))
    error_message = "Invalid GCP project ID format."
  }
}

variable "region" {
  description = "GCP Region"
  type        = string
  default     = "us-central1"
}

variable "zone" {
  description = "GCP Zone"
  type        = string
  default     = "us-central1-a"
}

variable "dr_region" {
  description = "GCP Region for disaster recovery (cross-region backup)"
  type        = string
  default     = "us-east1"
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "production"
  
  validation {
    condition     = contains(["production", "staging", "development"], var.environment)
    error_message = "Environment must be production, staging, or development."
  }
}

variable "domain" {
  description = "Primary domain for Hestia (e.g., zaplit.com)"
  type        = string
  
  validation {
    condition     = can(regex("^[a-z0-9]+([\\-\\.]{1}[a-z0-9]+)*\\.[a-z]{2,}$", var.domain))
    error_message = "Invalid domain format. Must be a valid domain like 'example.com'."
  }
}

variable "admin_email" {
  description = "Admin email for notifications and SSL certificates"
  type        = string
  
  validation {
    condition     = can(regex("^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$", var.admin_email))
    error_message = "Invalid email format. Must be a valid email address."
  }
}

variable "machine_type" {
  description = "GCP machine type for Hestia VM"
  type        = string
  default     = "e2-standard-2"
  
  validation {
    condition     = can(regex("^(e2|n2|n2d|n1)-", var.machine_type))
    error_message = "Invalid machine type. Must be a valid GCP machine type (e.g., e2-standard-2)."
  }
}

variable "disk_size" {
  description = "Boot disk size in GB"
  type        = number
  default     = 100
  
  validation {
    condition     = var.disk_size >= 50 && var.disk_size <= 2000
    error_message = "Disk size must be between 50 and 2000 GB."
  }
}

variable "hestia_port" {
  description = "Port for Hestia Control Panel web interface"
  type        = string
  default     = "8083"
  
  validation {
    condition     = can(regex("^(102[4-9]|10[3-9][0-9]|1[1-9][0-9]{2}|[2-9][0-9]{3}|[1-5][0-9]{4}|6[0-4][0-9]{3}|65[0-4][0-9]{2}|655[0-2][0-9]|6553[0-5])$", var.hestia_port))
    error_message = "Port must be a valid unprivileged port (1024-65535)."
  }
}

# FIXED: Require explicit IP addresses for SSH access
variable "allowed_ssh_ips" {
  description = "List of IP addresses allowed to SSH (CIDR notation). REQUIRED for security."
  type        = list(string)
  default     = []
  
  validation {
    condition     = length(var.allowed_ssh_ips) > 0
    error_message = "At least one IP address must be specified for SSH access. Use your current IP (curl ifconfig.me)."
  }
}

# FIXED: Require explicit IP addresses for admin access
variable "allowed_admin_ips" {
  description = "List of IP addresses allowed to access Hestia CP (CIDR notation). REQUIRED for security."
  type        = list(string)
  default     = []
  
  validation {
    condition     = length(var.allowed_admin_ips) > 0
    error_message = "At least one IP address must be specified for Hestia admin access. Use your current IP (curl ifconfig.me)."
  }
}

variable "dns_zone_name" {
  description = "Cloud DNS zone name (leave empty to skip DNS creation)"
  type        = string
  default     = ""
}

variable "alert_notification_channels" {
  description = "List of notification channel IDs for alerts"
  type        = list(string)
  default     = []
}

variable "enable_cross_region_backup" {
  description = "Enable cross-region backup bucket for disaster recovery"
  type        = bool
  default     = false
}

# Deprecated: Passwords are now generated and stored in Secret Manager
# These variables are kept for backward compatibility but are not used
variable "hestia_admin_password" {
  description = "DEPRECATED: Passwords are now auto-generated and stored in Secret Manager"
  type        = string
  default     = ""
  sensitive   = true
}

variable "wordpress_db_password" {
  description = "DEPRECATED: Passwords are now auto-generated and stored in Secret Manager"
  type        = string
  default     = ""
  sensitive   = true
}

variable "mysql_root_password" {
  description = "DEPRECATED: Passwords are now auto-generated and stored in Secret Manager"
  type        = string
  default     = ""
  sensitive   = true
}
