# AgentShield — Track 06 alignment checkpoint

> **Historical note, written 2026-10-31.** Kept for the record; it describes plans or checks from before the vault was deployed. Current, verified state: the vault is live on NEAR Testnet with two settled payments (one made through the MCP server), eight contract rejections and a revocation, all independently verified. See [README.md](../README.md) and [docs/ARCHITECTURE_AND_EVIDENCE.md](../docs/ARCHITECTURE_AND_EVIDENCE.md).

**Recorded:** 2026-10-31 (Africa/Lagos). **Scope:** existing Balanced AgentShield architecture, local work only. Official example: https://github.com/nearai/near-hackathon-prompt-examples/blob/main/tracks/06-security.md .

Track 06 names spending limits, policy engines, function-call keys, and an allow/warn/block counterparty example. AgentShield keeps its contract-held vault as the final spending authority. The example's account-history scoring, shared blocklist, and TEE verification are deferred.

| Area | Existing | Verified in this checkpoint | Incomplete | Required action |
| --- | --- | --- | --- | --- |
| Vault policy and accounting | Owner policy, agent identity, recipient allowlist, per-payment/day/total caps, expiry, nonce, pending reservation, callback, revocation, withdrawal guard | 10 mocked Rust unit tests passed; six NEAR Sandbox scenario subtests plus parent passed against actual WASM; local deployed code hash matched | Pending-withdrawal overlap not deterministically exercised; no public contract | Finish local overlap test, then seek specific authorization before deployment |
| Instant Demo | Five local scenarios, seven simulator tests | Seven simulator tests passed | Simulated only | Keep clearly labeled; do not treat as chain proof |
| Agent function-call key | Separate agent account planned | New read-only scope checker: two fixture tests passed | No agent account/public key or live permission query | User authorizes key creation on agent account; check finalized `view_access_key` for exact vault receiver, only `request_payment`, finite gas allowance |
| Blockchain evidence | Read-only testnet account/RPC check | Existing UI uses simulation/readiness labels; evidence-state requirements documented | No transaction or receipt verifier, onchain rejection, settlement, or code hash | Deploy only with authorization; verify signed tx, transfer and callback receipts, account/code state, and accounting |
| Security Lab | Existing branded UI and five Instant Demo scenarios | Preserved without redesign | Five live scenarios absent | Build live runner only after contract and evidence path are verified |
| NEAR AI and preflight | No genuine AI agent | None claimed | No inference, signed request, allow/warn/block preflight, or prompt-injection execution | Follow the approved phase order: implement after live payment and evidence verification; use allowlist/policy as primary signals, WARN human approval, BLOCK no signing |

## Exact local checks

- `npm run test:sim` — 7 passed, 0 failed.
- `cmd.exe /c work\run-vault-tests.cmd` — 10 passed, 0 failed; mocked runtime.
- `cargo fmt --manifest-path contracts/vault/Cargo.toml --check` — passed.
- Offline release WASM build — passed. SHA256 `138B17E7F1A227B22352E2E638FD69E60E0AD95F7A4DD003D8CBD244F8FFBE09`; expected NEAR base58 code hash `2KHm9Waz7fQfQ2A1MWmHhVSwx7o7sm8p1KXBTVyggCqN`. No deployed code hash exists.
- `npm run test:key-scope` — 2 passed, 0 failed; permission fixtures only.
- `node --check work/verify-agent-key.mjs` — passed.
- `bash work/run-sandbox-tests.sh` in Ubuntu WSL2 with NEAR Sandbox 2.13.4 — 7 tests passed, 0 failed (six scenario subtests and parent); local deployed code hash `2KHm9Waz7fQfQ2A1MWmHhVSwx7o7sm8p1KXBTVyggCqN` matched the release artifact. The first attempt with Sandbox 2.6.2 failed to compile SDK 5.29.1 WASM; no contract scenario ran in that older runtime.
- Live access-key query, wallet sign-in, Testnet deployment, Testnet payment/receipts, and NEAR AI inference — **not run**.

## Boundaries

- Function-call keys cannot transfer NEAR or attach a deposit; the agent request must attach zero. The key's receiver/method restriction narrows signer authority but the contract must still reject disallowed payments.
- A finite gas allowance can run out. The agent account's lifecycle full-access key stays outside the app/server; it can rotate/remove the limited key. The owner can revoke the vault mandate. The owner-controlled vault account's full-access key can upgrade code and is a disclosed trust assumption.
- `PREFLIGHT_BLOCK/WARN` is offchain; `CONTRACT_REJECTED` needs a signed finalized vault execution; `EXECUTED/PENDING` is not settlement; `SETTLED` needs finalized transfer/callback receipts and matching contract accounting. Missing evidence is `INCONCLUSIVE`.
- The official event page now says code written since the announcement counts. The announcement date is not established here. Existing core file creation dates are 2026-10-26/27; this checkpoint's verifier was created 2026-10-31. No Git repository exists to prove commit provenance. Do not claim eligibility from timestamps alone.
- No testnet deployment, key addition, spending, GitHub push, or publication has been authorized in this checkpoint.
