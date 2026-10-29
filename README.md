# Hazina

Family wealth platform by Dawin Capital: one true net worth across private company equity, land, government paper, cash and liabilities, with a 36-month liability-driven cash-flow projection.

Live plan: https://claude.ai/artifact/Gx9qkEqNP9VnV8ivsYnyjH

## Quick start

Needs Node 22, pnpm 10 (`corepack enable`) and Docker.

```bash
cp .env.example .env
pnpm install
pnpm stack:up                 # Postgres 16 + Redis 7 (add --profile full for MinIO, Mailpit, Auth emulator)
set -a && . ./.env && set +a
pnpm db:migrate && pnpm db:seed
pnpm test                     # domain golden tests, RLS isolation, API against the real database
pnpm dev                      # API :8080 (docs at /docs), worker, web :5173
```

## Local CI gate

`pnpm gate` runs the same steps as `.github/workflows/ci.yml`, in order, on the committed `HEAD`. It uses a throwaway clone and fresh Postgres and Redis containers, so it never touches your dev stack or uncommitted work. Use it before merging when GitHub Actions is unavailable.

```bash
pnpm gate                  # gate HEAD
pnpm gate -- --ref <ref>   # gate another commit or branch
pnpm gate -- --fast        # skip the terraform job
pnpm gate -- --keep        # keep the clone and logs
```

It needs Docker and pnpm; the terraform job also needs `terraform` on PATH and is reported as SKIP without it. When you change the workflow, change the gate with it.

## Layout

| Path              | What                                                                                    |
| ----------------- | --------------------------------------------------------------------------------------- |
| `apps/api`        | Fastify REST API, OpenAPI at `/openapi.json`, Swagger UI at `/docs`                     |
| `apps/worker`     | BullMQ workers: projection runs, DawinOS inbound events                                 |
| `apps/web`        | Web admin (Vite, React 18, shadcn/ui, recharts)                                         |
| `apps/mcp`        | Hazina MCP server for Claude; calls the API with the user's token                       |
| `packages/domain` | Pure projection engine: loans, recurrence, FX, net needs, buckets, funded ratio, runway |
| `packages/db`     | SQL migrations with row-level security, migration runner, seed, tenant-scoped client    |
| `infra/terraform` | GCP staging and production (not applied yet)                                            |
| `infra/docker`    | Dockerfiles and local Postgres roles                                                    |
| `docs`            | ADRs, DawinOS integration contract v1, data inventory templates                         |

The iOS app lives in `hazina-ios`.
