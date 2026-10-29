# Hazina — guide for Claude Code sessions

Personal wealth data for real families. Treat every change as touching money and privacy.

## Commands

- `pnpm stack:up` then `set -a && . ./.env && set +a` (local Postgres + Redis)
- `pnpm db:migrate && pnpm db:seed` (synthetic data only)
- `pnpm lint && pnpm build && pnpm typecheck && pnpm test` before every push; CI runs the same, once
- `pnpm gate` runs every CI step on the committed HEAD in a throwaway clone with fresh Postgres and Redis. Use it before merging whenever GitHub Actions is unavailable; never merge on a failed gate. Keep it in step with `.github/workflows/ci.yml`.
- `pnpm db:reset` refuses any non-local host. Never point local tooling at staging or production.

## Rules that are not negotiable

- **Tenancy is the database's job.** Every business table has `tenant_id`, RLS enabled and the `tenant_isolation` policy (docs/adr/0002). Queries run inside `withTenant()`. The API and worker connect as `hazina_app`, which can never bypass RLS. A new table without RLS is a bug, and `packages/db/test/rls.test.ts` must cover it.
- **The only cross-tenant read is `app.resolve_identity()`.** Do not add another SECURITY DEFINER function without an ADR.
- **Money is integer minor units plus currency** (docs/adr/0003). No floats in storage. Ledger transactions must balance per currency; the trigger enforces it.
- **AI and DawinOS propose; people approve.** Extraction output, assistant output and inbound DawinOS events land in a review state (`needs_review`). Nothing posts to the ledger automatically.
- **Audit sensitive reads and every write** with an `audit_event` row. The app role cannot update or delete audit rows.
- **The projection engine stays pure.** `packages/domain` has no I/O. Change it test-first against hand-worked numbers; the finance data lead's spreadsheet is the reference.
- **The MCP server calls the API, never the database**, so Claude sees exactly what the signed-in person may see.
- **No real client data** in seeds, fixtures, tests, logs, screenshots or staging.
- **No dev auth bypass.** Use the Auth emulator (`docker compose --profile full up`) or fake verifiers in tests. DawinOS had two production incidents from a dev bypass.

## Conventions

- Node 22 everywhere (`.nvmrc`, `engines`, CI). TypeScript strict with `noUncheckedIndexedAccess`.
- Built output is never committed.
- One UI kit: shadcn/ui on Tailwind. No MUI.
- Branch per change, never reuse a branch name, squash-merge. Fill in the PR checklist.
- Every CI job has `timeout-minutes`. Never add a second run of the test suite.
