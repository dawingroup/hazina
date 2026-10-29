terraform {
  required_version = ">= 1.6"
  required_providers {
    google = { source = "hashicorp/google", version = "~> 6.0" }
  }
  # Create the state bucket once by hand, then uncomment:
  # backend "gcs" { bucket = "hazina-staging-tfstate" prefix = "terraform" }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

variable "project_id" {
  type    = string
  default = "hazina-staging"
}

variable "region" {
  type    = string
  default = "africa-south1" # change after DPPA advice (decision due 4 Nov 2026)
}

module "hazina" {
  source      = "../../modules/hazina"
  project_id  = var.project_id
  environment = "staging"
  region      = var.region
}

output "hazina" { value = module.hazina }
