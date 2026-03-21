# Cloud Run Services for Zaplit Applications
# Terraform Configuration

terraform {
  required_version = ">= 1.5.0"
  
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
  
  backend "gcs" {
    bucket = "zaplit-terraform-state"
    prefix = "cloudrun"
  }
}

variable "project_id" {
  description = "GCP Project ID"
  type        = string
}

variable "region" {
  description = "GCP Region"
  type        = string
  default     = "us-central1"
}

# Service account for Cloud Run
resource "google_service_account" "cloud_run" {
  account_id   = "zaplit-cloudrun"
  display_name = "Cloud Run Service Account"
  description  = "Service account for Zaplit Cloud Run services"
}

# IAM permissions for Secret Manager
resource "google_project_iam_member" "cloud_run_secret_accessor" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.cloud_run.email}"
}

# IAM permissions for Cloud Logging
resource "google_project_iam_member" "cloud_run_log_writer" {
  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.cloud_run.email}"
}

# IAM permissions for Cloud Monitoring
resource "google_project_iam_member" "cloud_run_metric_writer" {
  project = var.project_id
  role    = "roles/monitoring.metricWriter"
  member  = "serviceAccount:${google_service_account.cloud_run.email}"
}

# Artifact Registry repository
resource "google_artifact_registry_repository" "zaplit" {
  location      = var.region
  repository_id = "zaplit"
  description   = "Docker repository for Zaplit applications"
  format        = "DOCKER"

  cleanup_policies {
    id     = "keep-minimum-versions"
    action = "KEEP"
    most_recent_versions {
      keep_count = 10
    }
  }

  cleanup_policies {
    id     = "delete-old-versions"
    action = "DELETE"
    condition {
      older_than = "30d"
    }
  }
}

# zaplit-com service (primary marketing site)
resource "google_cloud_run_service" "zaplit_com" {
  name     = "zaplit-com"
  location = var.region

  template {
    spec {
      container_concurrency = 100
      timeout_seconds       = 300
      service_account_name  = google_service_account.cloud_run.email

      containers {
        image = "${var.region}-docker.pkg.dev/${var.project_id}/zaplit/zaplit-com:latest"

        resources {
          limits = {
            cpu    = "1000m"
            memory = "512Mi"
          }
          cpu_idle = true
        }

        env {
          name  = "NODE_ENV"
          value = "production"
        }

        env {
          name  = "NEXT_TELEMETRY_DISABLED"
          value = "1"
        }

        env {
          name  = "NEXT_PUBLIC_APP_VERSION"
          value = "1.0.0"
        }

        ports {
          container_port = 3000
        }

        startup_probe {
          http_get {
            path = "/api/health"
            port = 3000
          }
          initial_delay_seconds = 0
          period_seconds        = 3
          failure_threshold     = 3
          timeout_seconds       = 3
        }

        liveness_probe {
          http_get {
            path = "/api/health"
            port = 3000
          }
          period_seconds    = 10
          failure_threshold = 3
          timeout_seconds   = 3
        }
      }
    }

    metadata {
      annotations = {
        "autoscaling.knative.dev/minScale"         = "0"
        "autoscaling.knative.dev/maxScale"         = "20"
        "run.googleapis.com/cpu-throttling"        = "true"
        "run.googleapis.com/execution-environment" = "gen2"
      }
    }
  }

  traffic {
    percent         = 100
    latest_revision = true
  }

  depends_on = [google_service_account.cloud_run]
}

# zaplit-org service (organization site)
resource "google_cloud_run_service" "zaplit_org" {
  name     = "zaplit-org"
  location = var.region

  template {
    spec {
      container_concurrency = 100
      timeout_seconds       = 300
      service_account_name  = google_service_account.cloud_run.email

      containers {
        image = "${var.region}-docker.pkg.dev/${var.project_id}/zaplit/zaplit-org:latest"

        resources {
          limits = {
            cpu    = "1000m"
            memory = "256Mi"
          }
          cpu_idle = true
        }

        env {
          name  = "NODE_ENV"
          value = "production"
        }

        env {
          name  = "NEXT_TELEMETRY_DISABLED"
          value = "1"
        }

        env {
          name  = "NEXT_PUBLIC_APP_VERSION"
          value = "1.0.0"
        }

        ports {
          container_port = 3000
        }

        startup_probe {
          http_get {
            path = "/api/health"
            port = 3000
          }
          initial_delay_seconds = 0
          period_seconds        = 3
          failure_threshold     = 3
          timeout_seconds       = 3
        }
      }
    }

    metadata {
      annotations = {
        "autoscaling.knative.dev/minScale"         = "0"
        "autoscaling.knative.dev/maxScale"         = "10"
        "run.googleapis.com/cpu-throttling"        = "true"
        "run.googleapis.com/execution-environment" = "gen2"
      }
    }
  }

  traffic {
    percent         = 100
    latest_revision = true
  }

  depends_on = [google_service_account.cloud_run]
}

# Allow unauthenticated access
resource "google_cloud_run_service_iam_member" "zaplit_com_public" {
  location = google_cloud_run_service.zaplit_com.location
  service  = google_cloud_run_service.zaplit_com.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

resource "google_cloud_run_service_iam_member" "zaplit_org_public" {
  location = google_cloud_run_service.zaplit_org.location
  service  = google_cloud_run_service.zaplit_org.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# Cloud Monitoring alerts
resource "google_monitoring_alert_policy" "cloud_run_error_rate" {
  display_name = "Cloud Run Error Rate High"
  combiner     = "OR"

  conditions {
    display_name = "Error rate > 5%"

    condition_threshold {
      filter          = "resource.type=\"cloud_run_revision\" AND metric.type=\"run.googleapis.com/request_count\" AND metric.labels.response_code_class!=\"2xx\""
      duration        = "300s"
      comparison      = "COMPARISON_GT"
      threshold_value = 0.05

      aggregations {
        alignment_period   = "300s"
        per_series_aligner = "ALIGN_RATE"
      }
    }
  }

  severity = "WARNING"

  documentation {
    content   = "Cloud Run service error rate is above 5%. Check application logs for details."
    mime_type = "text/markdown"
  }

  alert_strategy {
    auto_close = "86400s"
  }
}

resource "google_monitoring_alert_policy" "cloud_run_latency" {
  display_name = "Cloud Run Latency High"
  combiner     = "OR"

  conditions {
    display_name = "P99 latency > 2s"

    condition_threshold {
      filter          = "resource.type=\"cloud_run_revision\" AND metric.type=\"run.googleapis.com/request_latencies\""
      duration        = "300s"
      comparison      = "COMPARISON_GT"
      threshold_value = 2000

      aggregations {
        alignment_period     = "300s"
        per_series_aligner   = "ALIGN_PERCENTILE_99"
      }
    }
  }

  severity = "WARNING"
}

# Outputs
output "zaplit_com_url" {
  description = "URL for zaplit-com Cloud Run service"
  value       = google_cloud_run_service.zaplit_com.status[0].url
}

output "zaplit_org_url" {
  description = "URL for zaplit-org Cloud Run service"
  value       = google_cloud_run_service.zaplit_org.status[0].url
}

output "artifact_registry_repository" {
  description = "Artifact Registry repository ID"
  value       = google_artifact_registry_repository.zaplit.id
}

output "service_account_email" {
  description = "Cloud Run service account email"
  value       = google_service_account.cloud_run.email
}
