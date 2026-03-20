# Cloud Monitoring Configuration for Hestia CP
# Adds critical alerts for disk, memory, CPU, and backup failures

# Disk usage alert
resource "google_monitoring_alert_policy" "disk_usage" {
  display_name = "Hestia Disk Usage High"
  combiner     = "OR"

  conditions {
    display_name = "Disk usage > 85%"
    
    condition_threshold {
      filter          = "metric.type=\"agent.googleapis.com/disk/percent_used\" AND resource.type=\"gce_instance\" AND metadata.user_labels.service=\"hestia-cp\""
      duration        = "300s"
      comparison      = "COMPARISON_GT"
      threshold_value = 85
      
      aggregations {
        alignment_period   = "300s"
        per_series_aligner = "ALIGN_MEAN"
      }
    }
  }
  
  notification_channels = var.alert_notification_channels
  severity              = "WARNING"
  
  documentation {
    content   = "Disk usage on Hestia VM is above 85%. Consider cleaning up old backups or increasing disk size."
    mime_type = "text/markdown"
  }
  
  alert_strategy {
    auto_close = "86400s"
  }
}

# Memory usage alert
resource "google_monitoring_alert_policy" "memory_usage" {
  display_name = "Hestia Memory Usage High"
  combiner     = "OR"

  conditions {
    display_name = "Memory usage > 90%"
    
    condition_threshold {
      filter          = "metric.type=\"agent.googleapis.com/memory/percent_used\" AND resource.type=\"gce_instance\" AND metadata.user_labels.service=\"hestia-cp\""
      duration        = "300s"
      comparison      = "COMPARISON_GT"
      threshold_value = 90
      
      aggregations {
        alignment_period   = "300s"
        per_series_aligner = "ALIGN_MEAN"
      }
    }
  }
  
  notification_channels = var.alert_notification_channels
  severity              = "CRITICAL"
  
  documentation {
    content   = "Memory usage on Hestia VM is above 90%. Consider upgrading machine type or optimizing services."
    mime_type = "text/markdown"
  }
}

# CPU usage alert
resource "google_monitoring_alert_policy" "cpu_usage" {
  display_name = "Hestia CPU Usage High"
  combiner     = "OR"

  conditions {
    display_name = "CPU usage > 80% for 10 minutes"
    
    condition_threshold {
      filter          = "metric.type=\"compute.googleapis.com/instance/cpu/utilization\" AND resource.type=\"gce_instance\" AND metadata.user_labels.service=\"hestia-cp\""
      duration        = "600s"
      comparison      = "COMPARISON_GT"
      threshold_value = 0.8
      
      aggregations {
        alignment_period   = "300s"
        per_series_aligner = "ALIGN_MEAN"
      }
    }
  }
  
  notification_channels = var.alert_notification_channels
  severity              = "WARNING"
}

# Backup failure alert (based on log-based metric)
resource "google_logging_metric" "backup_failure" {
  name   = "hestia-backup-failure"
  filter = "resource.type=\"gce_instance\" AND jsonPayload.message=\"Backup failed\""
  
  metric_descriptor {
    metric_kind  = "DELTA"
    value_type   = "INT64"
    unit         = "1"
    description  = "Count of failed Hestia backups"
    display_name = "Hestia Backup Failures"
  }
}

resource "google_monitoring_alert_policy" "backup_failure" {
  display_name = "Hestia Backup Failed"
  combiner     = "OR"

  conditions {
    display_name = "Backup failure detected"
    
    condition_threshold {
      filter          = "metric.type=\"logging.googleapis.com/user/hestia-backup-failure\""
      duration        = "0s"
      comparison      = "COMPARISON_GT"
      threshold_value = 0
      
      aggregations {
        alignment_period   = "600s"
        per_series_aligner = "ALIGN_COUNT"
      }
    }
  }
  
  notification_channels = var.alert_notification_channels
  severity              = "ERROR"
  
  documentation {
    content   = "Hestia backup has failed. Check /var/log/hestia-backup.log on the VM for details."
    mime_type = "text/markdown"
  }
}

# SSL certificate expiration alert (30 days warning)
resource "google_monitoring_alert_policy" "ssl_expiration" {
  display_name = "SSL Certificate Expiring Soon"
  combiner     = "OR"
  
  conditions {
    display_name = "SSL expires in < 30 days"
    
    condition_threshold {
      filter          = "metric.type=\"monitoring.googleapis.com/uptime_check/time_until_ssl_cert_expires\" AND resource.type=\"uptime_url\""
      duration        = "86400s"
      comparison      = "COMPARISON_LT"
      threshold_value = 30
      
      aggregations {
        alignment_period   = "3600s"
        per_series_aligner = "ALIGN_NEXT_OLDER"
      }
    }
  }
  
  notification_channels = var.alert_notification_channels
  severity              = "WARNING"
  
  documentation {
    content   = "SSL certificate for Hestia services is expiring soon. Renew via Hestia CP or automate Let's Encrypt renewal."
    mime_type = "text/markdown"
  }
}

# Dashboard
resource "google_monitoring_dashboard" "hestia" {
  dashboard_json = jsonencode({
    displayName = "Hestia CP Monitoring"
    gridLayout = {
      columns = "2"
      widgets = [
        {
          title = "CPU Utilization"
          xyChart = {
            dataSets = [{
              timeSeriesQuery = {
                timeSeriesFilter = {
                  filter = "metric.type=\"compute.googleapis.com/instance/cpu/utilization\" resource.type=\"gce_instance\" metadata.user_labels.service=\"hestia-cp\""
                  aggregation = {
                    alignmentPeriod    = "60s"
                    perSeriesAligner   = "ALIGN_MEAN"
                  }
                }
              }
            }]
          }
        },
        {
          title = "Memory Utilization"
          xyChart = {
            dataSets = [{
              timeSeriesQuery = {
                timeSeriesFilter = {
                  filter = "metric.type=\"agent.googleapis.com/memory/percent_used\" resource.type=\"gce_instance\" metadata.user_labels.service=\"hestia-cp\""
                  aggregation = {
                    alignmentPeriod    = "60s"
                    perSeriesAligner   = "ALIGN_MEAN"
                  }
                }
              }
            }]
          }
        },
        {
          title = "Disk Usage"
          xyChart = {
            dataSets = [{
              timeSeriesQuery = {
                timeSeriesFilter = {
                  filter = "metric.type=\"agent.googleapis.com/disk/percent_used\" resource.type=\"gce_instance\" metadata.user_labels.service=\"hestia-cp\""
                  aggregation = {
                    alignmentPeriod    = "60s"
                    perSeriesAligner   = "ALIGN_MEAN"
                  }
                }
              }
            }]
          }
        },
        {
          title = "Uptime Check"
          xyChart = {
            dataSets = [{
              timeSeriesQuery = {
                timeSeriesFilter = {
                  filter = "metric.type=\"monitoring.googleapis.com/uptime_check/check_passed\" resource.type=\"uptime_url\""
                  aggregation = {
                    alignmentPeriod    = "60s"
                    perSeriesAligner   = "ALIGN_NEXT_OLDER"
                  }
                }
              }
            }]
          }
        }
      ]
    }
  })
}

output "dashboard_id" {
  description = "ID of the monitoring dashboard"
  value       = google_monitoring_dashboard.hestia.id
}

output "alert_policies" {
  description = "Names of created alert policies"
  value = {
    disk_usage    = google_monitoring_alert_policy.disk_usage.name
    memory_usage  = google_monitoring_alert_policy.memory_usage.name
    cpu_usage     = google_monitoring_alert_policy.cpu_usage.name
    backup_failed = google_monitoring_alert_policy.backup_failure.name
    ssl_expiring  = google_monitoring_alert_policy.ssl_expiration.name
  }
}
