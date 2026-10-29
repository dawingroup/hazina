locals {
  name = "hazina-${var.environment}"
  services = ["run.googleapis.com", "sqladmin.googleapis.com", "redis.googleapis.com", "secretmanager.googleapis.com",
    "artifactregistry.googleapis.com", "cloudkms.googleapis.com", "identitytoolkit.googleapis.com",
  "vpcaccess.googleapis.com", "servicenetworking.googleapis.com", "iamcredentials.googleapis.com", "sts.googleapis.com"]
}

resource "google_project_service" "apis" {
  for_each           = toset(local.services)
  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}

# ---- Network: private IP for Cloud SQL and Redis --------------------------------
resource "google_compute_network" "vpc" {
  project                 = var.project_id
  name                    = local.name
  auto_create_subnetworks = false
}

resource "google_compute_subnetwork" "main" {
  project       = var.project_id
  name          = "${local.name}-main"
  region        = var.region
  network       = google_compute_network.vpc.id
  ip_cidr_range = "10.10.0.0/24"
}

resource "google_compute_global_address" "private_services" {
  project       = var.project_id
  name          = "${local.name}-private-services"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 20
  network       = google_compute_network.vpc.id
}

resource "google_service_networking_connection" "private" {
  network                 = google_compute_network.vpc.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_services.name]
}

# ---- Keys: customer-managed encryption for documents ---------------------------
resource "google_kms_key_ring" "main" {
  project  = var.project_id
  name     = local.name
  location = var.region
}

resource "google_kms_crypto_key" "documents" {
  name            = "documents"
  key_ring        = google_kms_key_ring.main.id
  rotation_period = "7776000s" # 90 days
  lifecycle { prevent_destroy = true }
}

# ---- Postgres ------------------------------------------------------------------
resource "google_sql_database_instance" "main" {
  project             = var.project_id
  name                = local.name
  region              = var.region
  database_version    = "POSTGRES_16"
  deletion_protection = true
  depends_on          = [google_service_networking_connection.private]

  settings {
    tier              = var.db_tier
    availability_type = var.environment == "prod" ? "REGIONAL" : "ZONAL"
    ip_configuration {
      ipv4_enabled    = false
      private_network = google_compute_network.vpc.id
      ssl_mode        = "ENCRYPTED_ONLY"
    }
    backup_configuration {
      enabled                        = true
      point_in_time_recovery_enabled = true
      start_time                     = "01:00"
      backup_retention_settings { retained_backups = 30 }
    }
    database_flags {
      name  = "cloudsql.iam_authentication"
      value = "on"
    }
  }
}

resource "google_sql_database" "hazina" {
  project  = var.project_id
  name     = "hazina"
  instance = google_sql_database_instance.main.name
}

# The owner and app roles are created by the first migration job with IAM auth;
# hazina_app must never be granted BYPASSRLS (see docs/adr/0002).

# ---- Redis ---------------------------------------------------------------------
resource "google_redis_instance" "queue" {
  project                 = var.project_id
  name                    = local.name
  region                  = var.region
  tier                    = var.environment == "prod" ? "STANDARD_HA" : "BASIC"
  memory_size_gb          = 1
  authorized_network      = google_compute_network.vpc.id
  connect_mode            = "PRIVATE_SERVICE_ACCESS"
  transit_encryption_mode = "SERVER_AUTHENTICATION"
  depends_on              = [google_service_networking_connection.private]
}

# ---- Documents bucket ------------------------------------------------------------
data "google_project" "this" {
  project_id = var.project_id
}

resource "google_kms_crypto_key_iam_member" "gcs_uses_key" {
  crypto_key_id = google_kms_crypto_key.documents.id
  role          = "roles/cloudkms.cryptoKeyEncrypterDecrypter"
  member        = "serviceAccount:service-${data.google_project.this.number}@gs-project-accounts.iam.gserviceaccount.com"
}

resource "google_storage_bucket" "documents" {
  project                     = var.project_id
  name                        = "${var.project_id}-documents"
  location                    = var.region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  versioning { enabled = true }
  encryption { default_kms_key_name = google_kms_crypto_key.documents.id }
  depends_on = [google_kms_crypto_key_iam_member.gcs_uses_key]
}

# ---- Images ----------------------------------------------------------------------
resource "google_artifact_registry_repository" "images" {
  project       = var.project_id
  location      = var.region
  repository_id = "hazina"
  format        = "DOCKER"
}

# ---- Runtime identity and secrets ---------------------------------------------------
resource "google_service_account" "runtime" {
  project      = var.project_id
  account_id   = "hazina-runtime"
  display_name = "Hazina API and worker"
}

resource "google_secret_manager_secret" "secrets" {
  for_each  = toset(["database-url-app", "redis-url", "dawinos-webhook-secret", "claude-api-key"])
  project   = var.project_id
  secret_id = each.value
  replication {
    user_managed {
      replicas { location = var.region }
    }
  }
}

resource "google_secret_manager_secret_iam_member" "runtime_reads" {
  for_each  = google_secret_manager_secret.secrets
  project   = var.project_id
  secret_id = each.value.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.runtime.email}"
}

resource "google_storage_bucket_iam_member" "runtime_documents" {
  bucket = google_storage_bucket.documents.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.runtime.email}"
}

resource "google_project_iam_member" "runtime_sql" {
  for_each = toset(["roles/cloudsql.client", "roles/cloudsql.instanceUser"])
  project  = var.project_id
  role     = each.value
  member   = "serviceAccount:${google_service_account.runtime.email}"
}

# ---- Cloud Run -------------------------------------------------------------------
locals {
  secret_env = {
    DATABASE_URL_APP       = "database-url-app"
    REDIS_URL              = "redis-url"
    DAWINOS_WEBHOOK_SECRET = "dawinos-webhook-secret"
  }
}

resource "google_cloud_run_v2_service" "api" {
  project  = var.project_id
  name     = "hazina-api"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"
  template {
    service_account = google_service_account.runtime.email
    scaling {
      min_instance_count = var.environment == "prod" ? 1 : 0
      max_instance_count = 4
    }
    vpc_access {
      network_interfaces {
        network    = google_compute_network.vpc.id
        subnetwork = google_compute_subnetwork.main.id
      }
      egress = "PRIVATE_RANGES_ONLY"
    }
    containers {
      image = var.api_image
      env {
        name  = "FIREBASE_PROJECT_ID"
        value = var.project_id
      }
      env {
        name  = "NODE_ENV"
        value = "production"
      }
      dynamic "env" {
        for_each = local.secret_env
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.secrets[env.value].secret_id
              version = "latest"
            }
          }
        }
      }
    }
  }
  lifecycle { ignore_changes = [template[0].containers[0].image] }
}

resource "google_cloud_run_v2_service" "worker" {
  project  = var.project_id
  name     = "hazina-worker"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_INTERNAL_ONLY"
  template {
    service_account = google_service_account.runtime.email
    scaling {
      min_instance_count = 1
      max_instance_count = 2
    }
    vpc_access {
      network_interfaces {
        network    = google_compute_network.vpc.id
        subnetwork = google_compute_subnetwork.main.id
      }
      egress = "PRIVATE_RANGES_ONLY"
    }
    containers {
      image = var.worker_image
      resources {
        cpu_idle = false
      }
      dynamic "env" {
        for_each = { for k, v in local.secret_env : k => v if k != "DAWINOS_WEBHOOK_SECRET" }
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.secrets[env.value].secret_id
              version = "latest"
            }
          }
        }
      }
    }
  }
  lifecycle { ignore_changes = [template[0].containers[0].image] }
}

resource "google_cloud_run_v2_service" "web" {
  project  = var.project_id
  name     = "hazina-web"
  location = var.region
  template {
    containers {
      image = var.web_image
    }
  }
  lifecycle { ignore_changes = [template[0].containers[0].image] }
}

resource "google_cloud_run_v2_service_iam_member" "public" {
  for_each = { api = google_cloud_run_v2_service.api.name, web = google_cloud_run_v2_service.web.name }
  project  = var.project_id
  location = var.region
  name     = each.value
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# ---- GitHub Actions deploys without a key (Workload Identity Federation) -------------
resource "google_iam_workload_identity_pool" "github" {
  project                   = var.project_id
  workload_identity_pool_id = "github"
}

resource "google_iam_workload_identity_pool_provider" "github" {
  project                            = var.project_id
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github"
  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.repository" = "assertion.repository"
    "attribute.ref"        = "assertion.ref"
  }
  attribute_condition = "assertion.repository == '${var.github_repository}'"
  oidc { issuer_uri = "https://token.actions.githubusercontent.com" }
}

resource "google_service_account" "deployer" {
  project    = var.project_id
  account_id = "hazina-deployer"
}

resource "google_service_account_iam_member" "github_impersonates_deployer" {
  service_account_id = google_service_account.deployer.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${var.github_repository}"
}

resource "google_project_iam_member" "deployer_roles" {
  for_each = toset(["roles/run.developer", "roles/artifactregistry.writer", "roles/iam.serviceAccountUser"])
  project  = var.project_id
  role     = each.value
  member   = "serviceAccount:${google_service_account.deployer.email}"
}
