# AgentShield — implementation plan and evidence gates

> **Historical note, written 2026-10-23.** Kept for the record; it describes plans or checks from before the vault was deployed. Current, verified state: the vault is live on NEAR Testnet with two settled payments (one made through the MCP server) and seven contract rejections. See [README.md](../README.md) and [docs/ARCHITECTURE_AND_EVIDENCE.md](../docs/ARCHITECTURE_AND_EVIDENCE.md).

**Prepared 2026-10-23. Status: PLANNED.** Start submission-specific code no earlier than 2026-11-01 00:00 UTC unless the organizer expressly permits earlier work. Repository creation under `0xNexuz` needs the user's explicit approval.

## Critical path

| Priority | Milestone | Exit evidence |
|---|---|---|
| P0 | Confirm eligibility, create approved repository, pin Rust/NEAR SDK and test toolchain | Official rule citation, recorded repository URL, reproducible local commands |
| P0 | Implement vault identity, ownership, funding, mandate and revocation | Contract unit/sandbox tests for owner checks, funding isolation, expiration and revoke |
| P0 | Implement exact NEAR payout, nonce, hash, budgets, reservation and callback | Positive, over-limit, replay, tamper, race, transfer-failure tests; invariants documented |
| P0 | NEAR testnet end-to-end execution and reconciliation | Actual contract ID, chain/network, tx hash, receipt result and recipient balance delta verified independently |
| P1 | Minimal wallet UI and evidence explorer | Real wallet actions, all states, empty/error/loading, keyboard/mobile checks |
| P1 | Adversarial review and independent reproduction | Fresh account runs instructions and observes same positive and negative outcomes |
| P2 | Intents or Chain Signatures feasibility checkpoint | Explicit trust-boundary design and mainnet approval before funded integration |
| P3 | Visual refinement, reusable SDK and optional features | Only after P0/P1 proof |

## Suggested event sequence

- **Before 1 Nov:** research, requirements, architecture, threat model, UX direction and tool readiness only. Recheck official rules.
- **1–3 Nov:** repo setup, contract skeleton, ownership and policy tests.
- **4–7 Nov:** payout and adversarial contract tests, sandbox evidence.
- **8–10 Nov:** testnet path, independent reconciliation, UI.
- **11–12 Nov:** hardening, regression and external reproduction.
- **13–14 Nov:** README, demo, evidence, submission checks; publish/submit only with authorization and before 14 Nov 23:59 UTC.

## Required test matrix

`VALID_SMALL_PAYMENT`, `OVER_PER_TX`, `OVER_CUMULATIVE`, `OVER_UTC_DAY`, `UNKNOWN_RECIPIENT`, `WRONG_AGENT`, `EXPIRED`, `REPLAY_NONCE`, `ALTERED_AUTHORIZATION_REUSE`, `REVOKED`, `CONCURRENT_LAST_BUDGET`, `FAILED_PROMISE_RELEASE`, `CALLBACK_IDEMPOTENCY`, `ZERO_AMOUNT`, `OVERFLOW`, `OWNER_WITHDRAW_RESERVE`, `RPC_UNAVAILABLE_STATUS`.

For each case record command, environment, expected result, actual result and evidence link. **No tests have run yet.** A testnet transaction requires account setup and a funded testnet balance; neither is present in this workspace.

## Internal 100-point diagnostic

Problem/differentiation 10; architecture/mechanism 15; NEAR integration 10; security/failure handling 20; correctness/tests/independent evidence 20; UX/narrative 10; docs/adoption 10; demo/submission 5. Current readiness score is **UNVERIFIED**, because no product exists. A target of 95 is aspirational and cannot override failed security gates.

## Repository handoff

At repository creation, add its own `AGENTS.md` and `docs/PROJECT_CONTEXT.md` from this package, preserving accurate Git state. Maintain `docs/PRODUCT.md`, `ARCHITECTURE.md`, `THREAT_MODEL.md`, `ROADMAP.md`, `DECISIONS.md`, `TEST_MATRIX.md`, `HACKATHON.md`, `SUBMISSION_EVIDENCE.md`, and `DEVELOPMENT_STATUS.md` as work materializes; do not generate empty documents or copy an unverified official file. Record implementation, exact files, actual test commands, remaining risk and next action at each milestone.
