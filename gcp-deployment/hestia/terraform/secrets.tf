# Secret Manager Configuration for Hestia CP
# Manages all sensitive credentials securely

# Hestia Admin Password
resource "google_secret_manager_secret" "hestia_password" {
  secret_id = "hestia-admin-password"
  
  replication {
    auto {}
  }
  
  labels = {
    environment = var.environment
    service     = "hestia-cp"
    managed_by  = "terraform"
  }
}

# WordPress Database Password
resource "google_secret_manager_secret" "wordpress_db_password" {
  secret_id = "wordpress-db-password"
  
  replication {
    auto {}
  }
  
  labels = {
    environment = var.environment
    service     = "hestia-cp"
    managed_by  = "terraform"
  }
}

# MySQL Root Password
resource "google_secret_manager_secret" "mysql_root_password" {
  secret_id = "mysql-root-password"
  
  replication {
    auto {}
  }
  
  labels = {
    environment = var.environment
    service     = "hestia-cp"
    managed_by  = "terraform"
  }
}

# Grant VM service account access to secrets
resource "google_secret_manager_secret_iam_member" "hestia_password_access" {
  secret_id = google_secret_manager_secret.hestia_password.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.hestia.email}"
}

resource "google_secret_manager_secret_iam_member" "wordpress_db_access" {
  secret_id = google_secret_manager_secret.wordpress_db_password.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.hestia.email}"
}

resource "google_secret_manager_secret_iam_member" "mysql_root_access" {
  secret_id = google_secret_manager_secret.mysql_root_password.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.hestia.email}"
}

# Outputs (non-sensitive)
output "secret_names" {
  description = "Names of created secrets"
  value = {
    hestia_password     = google_secret_manager_secret.hestia_password.name
    wordpress_db        = google_secret_manager_secret.wordpress_db_password.name
    mysql_root          = google_secret_manager_secret.mysql_root_password.name
  }
  sensitive = false
}
