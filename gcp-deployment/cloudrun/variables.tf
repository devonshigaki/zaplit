# Variables for Cloud Run Terraform configuration

variable "project_id" {
  description = "GCP Project ID"
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{4,28}[a-z0-9]$", var.project_id))
    error_message = "Invalid GCP project ID format."
  }
}

variable "region" {
  description = "GCP Region for Cloud Run services"
  type        = string
  default     = "us-central1"
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

variable "alert_notification_channels" {
  description = "List of notification channel IDs for alerts"
  type        = list(string)
  default     = []
}

variable "zaplit_com_config" {
  description = "Configuration for zaplit-com service"
  type = object({
    memory           = string
    cpu              = string
    min_instances    = number
    max_instances    = number
    concurrency      = number
    timeout_seconds  = number
  })
  default = {
    memory          = "512Mi"
    cpu             = "1000m"
    min_instances   = 0
    max_instances   = 20
    concurrency     = 100
    timeout_seconds = 300
  }
}

variable "zaplit_org_config" {
  description = "Configuration for zaplit-org service"
  type = object({
    memory           = string
    cpu              = string
    min_instances    = number
    max_instances    = number
    concurrency      = number
    timeout_seconds  = number
  })
  default = {
    memory          = "256Mi"
    cpu             = "1000m"
    min_instances   = 0
    max_instances   = 10
    concurrency     = 100
    timeout_seconds = 300
  }
}
