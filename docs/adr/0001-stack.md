# 0001. Stack: GCP, Postgres, TypeScript on Cloud Run

Status: Accepted, 29 October 2026

## Context

DawinOS runs on Firebase: Firestore, Cloud Functions in CommonJS JavaScript, Firebase Auth without MFA, and a Vite/React/shadcn web app. Hazina must be ring-fenced from DawinOS and sellable without it. It holds a double-entry ledger and one family's full balance sheet per tenant.

## Decision

- **Cloud:** GCP, a separate project per environment (`hazina-staging`, `hazina-prod`), billed to HazinaCo. Not inside the `dawinos` project.
- **Database:** Cloud SQL for PostgreSQL 16. The ledger needs multi-row transactions and a balance check at commit. Tenant isolation is enforced by row-level security, not by client rules.
- **Backend:** Node 22 and TypeScript strict. Fastify REST with a generated OpenAPI spec, on Cloud Run. BullMQ on Memorystore Redis for background work.
- **Auth:** Identity Platform (Firebase Auth) with TOTP MFA required in production. Same SDKs the team already uses.
- **Web:** Vite, React 18, shadcn/ui on Tailwind 3, recharts, react-query, matching DawinOS. MUI is not used.
- **Infrastructure:** Terraform, region as a variable (default `africa-south1` pending DPPA advice).
- **Migrations:** plain SQL files applied in order by a small runner (`packages/db`). The schema leans on RLS policies, triggers and SECURITY DEFINER functions that ORMs model poorly. A typed query builder such as Drizzle can be added on top later without changing the migrations.

## Consequences

- The team learns Cloud SQL and Cloud Run but keeps its React and Firebase Auth skills.
- Hazina cannot read DawinOS data directly; it goes through the integration contract (0004).
- Patterns carried over from DawinOS: the receive-store-queue webhook, provider-agnostic adapters, the MCP tool registry with annotations, separation of duties on approvals.
- Patterns not carried over: committed build artifacts, mixed UI kits, mismatched Node versions.
