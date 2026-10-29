variable "project_id" {
  type        = string
  description = "GCP project for this environment, e.g. hazina-staging."
}

variable "environment" {
  type        = string
  description = "staging or prod."
  validation {
    condition     = contains(["staging", "prod"], var.environment)
    error_message = "environment must be staging or prod."
  }
}

variable "region" {
  type        = string
  description = "Hosting region. Pending DPPA advice; africa-south1 is the proposed default."
  default     = "africa-south1"
}

variable "db_tier" {
  type    = string
  default = "db-custom-1-3840"
}

variable "api_image" {
  type        = string
  description = "Artifact Registry image for the API. Placeholder until CI pushes the first build."
  default     = "us-docker.pkg.dev/cloudrun/container/hello"
}

variable "worker_image" {
  type    = string
  default = "us-docker.pkg.dev/cloudrun/container/hello"
}

variable "web_image" {
  type    = string
  default = "us-docker.pkg.dev/cloudrun/container/hello"
}

variable "github_repository" {
  type        = string
  description = "owner/repo allowed to deploy through Workload Identity Federation."
  default     = "dawingroup/hazina"
}
