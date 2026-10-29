# 0002. Tenancy enforced by Postgres row-level security

Status: Accepted, 29 October 2026

## Decision

- Every business table has `tenant_id uuid NOT NULL`, RLS enabled, and the policy `tenant_id = app.current_tenant()`.
- `app.current_tenant()` reads `app.tenant_id`, which the API sets with `set_config(..., true)` inside each request's transaction (`withTenant` in `packages/db`). Unset means no rows.
- Two roles. `hazina_owner` owns the schema and runs migrations. `hazina_app` is what the API and worker use: not the owner, `NOBYPASSRLS`, no superuser.
- The single cross-tenant read is `app.resolve_identity(uid)`, a SECURITY DEFINER function that maps a verified Firebase uid to its own person and tenant.
- `audit_event` is append-only for the app role: INSERT and SELECT only.
- No DawinOS staff access to tenants by default. Break-glass access is logged and notified to the owner (sprint 1).

## How it is proven

`packages/db/test/rls.test.ts` connects as `hazina_app` and checks: it cannot bypass RLS, sees only its tenant, sees nothing with no tenant set, cannot write into another tenant, cannot delete audit rows, and cannot commit an unbalanced ledger transaction. Disabling RLS on `asset` makes three of these fail, which shows the test depends on the policy.

## Adding a table

Add `tenant_id`, add the table to the RLS loop (or its own `ENABLE ROW LEVEL SECURITY` + policy), grant only the verbs the app needs, and extend the RLS test.
