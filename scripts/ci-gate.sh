#!/usr/bin/env bash
# Local CI gate: runs the same steps as .github/workflows/ci.yml, in the same order,
# against the COMMITTED code at HEAD (or a given ref) in a throwaway clone, with fresh
# Postgres and Redis containers. Use it before merging when GitHub Actions is
# unavailable (for example, a billing lock), or to reproduce a CI failure locally.
#
#   pnpm gate                 # gate HEAD
#   pnpm gate -- --ref <ref>  # gate another commit or branch
#   pnpm gate -- --fast       # skip the terraform job
#   pnpm gate -- --keep       # keep the clone and logs for inspection
#
# Needs Docker and pnpm. The terraform job needs `terraform` on PATH; without it the
# job is reported as SKIP, never as a pass. Uncommitted changes are NOT gated.
#
# Exit code: 0 = every step passed, 1 = a step failed, 2 = setup error.
set -uo pipefail

REF=HEAD FAST=0 KEEP=0
while [ $# -gt 0 ]; do
  case $1 in
    --ref) REF=$2; shift 2 ;;
    --fast) FAST=1; shift ;;
    --keep) KEEP=1; shift ;;
    --) shift ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done

ROOT=$(git rev-parse --show-toplevel) || exit 2
SHA=$(git -C "$ROOT" rev-parse --verify "$REF^{commit}") || { echo "no such ref: $REF" >&2; exit 2; }
if [ -n "$(git -C "$ROOT" status --porcelain)" ] && [ "$REF" = HEAD ]; then
  echo "note: uncommitted changes are not gated; gating commit ${SHA:0:7}" >&2
fi
command -v docker >/dev/null && docker info >/dev/null 2>&1 || { echo "Docker is not running" >&2; exit 2; }

WORK=$(mktemp -d "${TMPDIR:-/tmp}/hazina-gate.XXXXXX")
SRC=$WORK/src LOG=$WORK/logs
mkdir -p "$LOG"
git clone -q --no-hardlinks "$ROOT" "$SRC" && git -C "$SRC" checkout -q "$SHA" || { echo "clone failed" >&2; exit 2; }

# Fresh service containers on their own ports, so the gate never touches the dev stack.
ID=$$ PG_PORT=${GATE_PG_PORT:-55432} REDIS_PORT=${GATE_REDIS_PORT:-56379}
PG=hazina-gate-pg-$ID RD=hazina-gate-redis-$ID
cleanup() {
  docker rm -f "$PG" "$RD" >/dev/null 2>&1
  if [ $KEEP = 0 ]; then rm -rf "$WORK"; else echo "kept: $WORK"; fi
}
trap cleanup EXIT
docker run -d --name "$PG" -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=hazina -p "$PG_PORT:5432" postgres:16-alpine >/dev/null || exit 2
docker run -d --name "$RD" -p "$REDIS_PORT:6379" redis:7-alpine >/dev/null || exit 2
ready=0
for _ in $(seq 1 60); do
  docker exec "$PG" psql -U postgres -d hazina -c 'select 1' >/dev/null 2>&1 && { ready=1; break; }
  sleep 1
done
[ $ready = 1 ] || { echo "Postgres did not start" >&2; exit 2; }

export DATABASE_URL=postgres://hazina_owner:hazina_owner@localhost:$PG_PORT/hazina
export DATABASE_URL_APP=postgres://hazina_app:hazina_app@localhost:$PG_PORT/hazina
export REDIS_URL=redis://localhost:$REDIS_PORT
export CI=true

ROWS=() FAIL=0
step() { # step <job> <name> <command...>
  local job=$1 name=$2 log start result
  shift 2
  log="$LOG/$job-${name// /-}.log" start=$SECONDS
  if (cd "$SRC" && "$@") >"$log" 2>&1; then result=pass; else result=FAIL; FAIL=1; fi
  ROWS+=("$(printf '%-12s %-24s %-5s %4ss' "$job" "$name" "$result" $((SECONDS - start)))")
  if [ $result = FAIL ]; then echo "--- $job / $name failed; last lines of its log:" >&2; tail -25 "$log" >&2; fi
}
skip() { ROWS+=("$(printf '%-12s %-24s %-5s %s' "$1" "$2" SKIP "$3")"); }

# ---- job: check (mirrors ci.yml) ----
step check "install" pnpm install --frozen-lockfile
step check "create roles" sh -c "docker exec -i '$PG' psql -v ON_ERROR_STOP=1 -U postgres -d hazina < infra/docker/postgres/init.sql"
step check "lint" pnpm lint
step check "format check" pnpm format:check
step check "build" pnpm build
step check "typecheck" pnpm typecheck
step check "migrate and seed" sh -c 'pnpm db:migrate && pnpm db:seed'
step check "test" pnpm test

# ---- job: terraform (mirrors ci.yml) ----
if [ $FAST = 1 ]; then
  skip terraform "fmt and validate" "(--fast)"
elif ! command -v terraform >/dev/null; then
  skip terraform "fmt and validate" "(terraform not installed)"
else
  step terraform "fmt check" terraform fmt -check -recursive infra/terraform
  step terraform "validate" sh -c 'for e in staging prod; do
      terraform -chdir=infra/terraform/envs/$e init -backend=false -input=false >/dev/null &&
      terraform -chdir=infra/terraform/envs/$e validate -no-color || exit 1; done'
fi

echo
echo "Hazina gate for ${SHA:0:7}"
printf '%-12s %-24s %-5s %s\n' JOB STEP RESULT TIME
printf '%s\n' "${ROWS[@]}"
# Test counts, so a run where the database tests silently skipped is visible.
sed 's/\x1b\[[0-9;]*m//g' "$LOG/check-test.log" 2>/dev/null | grep -E '^@hazina/[a-z]+:test: +Tests ' | sed 's/:test: */: /'
if [ $FAIL = 0 ]; then echo "GATE PASSED ${SHA:0:7}"; else echo "GATE FAILED ${SHA:0:7}"; fi
exit $FAIL
