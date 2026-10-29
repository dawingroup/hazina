# 0004. DawinOS integration contract v1

Status: Proposed, 29 October 2026. Needs the DawinOS team's agreement by 18 November 2026 to deliver by 18 January 2027.

- DawinOS stays the record for company data; Hazina for personal wealth. Personal transactions, obligations and documents never leave Hazina.
- **Pull:** Hazina's worker calls read-only DawinOS endpoints with a scoped service account (`docs/api/dawinos-integration-v1.yaml`).
- **Push:** DawinOS sends events signed with HMAC-SHA256 of the raw body in `x-dawinos-signature`. Hazina verifies, stores the raw event (`inbound_event`, unique per event id), replies 202 at once and queues the work. A repeat event id returns 200 `duplicate`.
- **Review, not auto-post:** an inbound event lands as `needs_review`. It becomes expected income or an obligation only after the owner approves it.
- **Outbound (phase 1.1):** aggregate, owner-approved summaries only.
- Versioned under `/v1`. A breaking change needs `/v2`.
