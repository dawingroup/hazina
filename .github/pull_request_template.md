## What changed

## Why

## Checklist

- [ ] New tables carry `tenant_id`, have row-level security enabled, and a policy (see docs/adr/0002)
- [ ] New money fields are integer minor units plus a currency (docs/adr/0003)
- [ ] Writes to sensitive data emit an `audit_event`
- [ ] AI or DawinOS input lands in a review state, never straight in the ledger
- [ ] Tests added or updated; `pnpm lint && pnpm build && pnpm typecheck && pnpm test` pass locally
- [ ] No real client data in fixtures, seeds or screenshots
