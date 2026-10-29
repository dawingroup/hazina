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
