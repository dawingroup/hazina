# 0003. Money as integer minor units plus currency

Status: Accepted, 29 October 2026

- Stored as `bigint` minor units plus a `char(3)` ISO code. UGX exponent 0; USD, GBP, KES exponent 2.
- Never floats in storage. The engine uses JavaScript numbers in minor units, exact below 9e15.
- FX: `fx_rate.rate_to_ugx` per currency per day. Every converted ledger line stores the rate it used.
- A ledger transaction must balance per currency at commit (deferred constraint trigger).
