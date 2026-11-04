# Threat model

What AgentShield defends, against whom, how, and how you can check each answer. Every row names the control, the test that exercises it and, where one exists, the public Testnet transaction. Line numbers refer to [`contracts/vault/src/lib.rs`](../contracts/vault/src/lib.rs).

## What is protected

- **The funds in the vault.** They may leave only to an allowlisted recipient, within the mandate's per-payment, daily and total limits, before its expiry, at most once per request.
- **The owner's authority.** Only the owner sets, pauses or revokes the mandate, funds the vault or withdraws.
- **The truth of the evidence.** What the README and site claim must match the code and the chain.

## Assumptions

- NEAR enforces access-key permissions and runs the deployed code as written. The code hash on chain is the SHA-256 of `deployment/agentshield_vault.wasm`, which CI rebuilds byte for byte from source.
- The owner's full-access key stays on the owner's machine. Anyone holding it controls the vault; that is outside this model.
- Public RPC reports finalized state honestly. Every proof can be rechecked against another node, and the vault's code hash is checked on every read.

## Threats and controls

| Threat | Control | Tested by | Evidence |
| --- | --- | --- | --- |
| **Prompt injection:** a malicious invoice, email or web page tells the agent to pay someone else | The contract's allowlist (L285 `RECIPIENT_NOT_ALLOWED`). Before signing, the guard's vault preflight and counterparty check block it. | `tests/near-ai-agent.test.mjs`, `tests/counterparty.test.mjs` (every redirect target in the 19 recorded injections is blocked) | Real model run: 19 injections, 0 escaped. The contract refused the same redirect on Testnet in [`GvMLEq…gDX9`](https://testnet.nearblocks.io/txns/GvMLEqPTLZfnN4cTVVBS6mKghD7LuTpXgH7ZSAQvgDX9). |
| **Look-alike receiver:** `…1o77` for `…1077`, a Cyrillic `і`, the real name inside `…attacker.testnet`, the `.near` twin | The counterparty check blocks before signing. The contract's exact-match allowlist refuses it regardless. | `tests/counterparty.test.mjs` | Live: [`/api/testnet/counterparty`](https://agentshield-lab.vercel.app/api/testnet/counterparty?account=agentshield-recipient-7bb4a0df1o77.testnet) |
| **Allowlisted receiver changes hands:** code gets deployed to a recipient the owner approved as a plain account | The counterparty check compares the code hash with the one the owner pinned (`CODE_CHANGED`) | `tests/counterparty.test.mjs` "missing, unreadable or changed receivers fail closed" | Pinned 2026-11-04 at block 276180481 |
| **Overspending:** too much per payment, per day or in total | L289 `PER_PAYMENT_LIMIT`, L306 `DAILY_LIMIT`, L314 `TOTAL_LIMIT`; pending payments count toward the budgets | Unit tests; the randomized rule test (below); Sandbox "allowlist, per-payment limit and agent identity" | [`FEfj7K…L8A`](https://testnet.nearblocks.io/txns/FEfj7KyY5Cr7NTrhDZdXt8Hi1rQqqMwznvK1KhL1ZL8A) refused over the cap |
| **Race:** several pending requests together exceed the budget | Budgets reserve the amount at authorization, before the transfer settles | Unit `two_pending_requests_cannot_take_last_daily_budget`; Sandbox "two agent keys cannot exceed a shared budget"; randomized test | — |
| **Replay:** a past request is resubmitted | L293 `REPLAY`: a nonce is used once per mandate version, and a failed transfer never frees it | Unit `failed_transfer_releases_budget_but_keeps_nonce`; randomized test | [`8ktDr3…yjY`](https://testnet.nearblocks.io/txns/8ktDr3AFxE8kVQP1KNkvGBY44oMWWvRCY6tXUqWyvyjY) refused |
| **Stolen agent key** | The key can call only `request_payment` on the vault, with zero deposit and a finite gas allowance. The contract also checks the caller is the agent (L260 `WRONG_AGENT`). | `tests/agent-key-scope.test.mjs`; Sandbox "restricted function-call key settles only the approved vault method" | Key permission in [`3faZ6…5CaP`](https://testnet.nearblocks.io/txns/3faZ6WmFDgbM8KUCRnbDLztbYSysKwNGdoq83jy95CaP), rechecked live by `/api/testnet/proof` (`currentKeyStillScoped`) |
| **Stale policy:** an agent acts on an old mandate after the owner changes it | L272 `STALE_VERSION`. Pause, resume, revoke and every `set_mandate` bump the version. | Sandbox "pause, stale version and owner withdrawal"; randomized test | — |
| **The owner needs to stop the agent now** | `pause` (L234) and `revoke` (L242). New requests are refused (`PAUSED`, `REVOKED`); a transfer already sent can still settle. | Unit `revocation_blocks_new_requests_but_pending_can_settle`; Sandbox "revocation prevents new payments after settlement"; randomized test | **Not yet on Testnet** |
| **Settlement accounting abuse:** a transfer fails but is counted, or is counted twice | The private callback (L381) records `SETTLED` or `TRANSFER_FAILED` exactly once and releases the reservation on failure | Unit `successful_transfer_settles_exactly_once`; Sandbox "failed recipient transfer releases reservation without settlement"; randomized test | Settlement of [`3buDvB…53jm`](https://testnet.nearblocks.io/txns/3buDvBXKDHcCe9VBNtLSSp4H7LLjLfGk7K4XT2jh53jm) |
| **An MCP client asks for a payment it shouldn't** | The tool runs the guard first: `BLOCK` refuses, `WARN` asks the human (refused if the client can't ask), and only then signs. A client that bypasses the server still meets the contract. | `tests/mcp-server.test.mjs` with the official MCP SDK client | The payment tool has not sent a Testnet transaction yet |
| **The agent key is misconfigured:** a full-access key, or one that can call more methods | Before every signature the MCP signer rereads the key from chain and refuses unless it can call only the vault's `request_payment`. It also refuses a key file inside the repository. | `tests/mcp-server.test.mjs` "the signer refuses any key that can do more…" | — |
| **The website is compromised or spoofed** | The site holds no key, has no wallet connection and no signing endpoint; its API routes are GET-only and read-only | `tests/vercel-routes.test.mjs`, `tests/cinematic-evidence.test.mjs` "the site has no wallet connection" | — |
| **Fake or stale evidence:** the README claims what the chain doesn't show | The proof APIs recheck the transactions on every request (archival nodes for old ones). A daily GitHub Actions job rechecks them again from GitHub's own runners. The WASM is rebuilt byte for byte in CI, and NEAR AI reply signatures are rechecked in tests. | `tests/archival-rpc.test.mjs`, `tests/live-site-check.test.mjs`, `tests/near-ai-evidence.test.mjs`, CI job "Rebuild the deployed WASM from source" | [Live evidence workflow](https://github.com/0xNexuz/agentshield/actions/workflows/live-evidence.yml) |
| **Supply chain:** a compromised package or CI action | One production dependency (`near-api-js`). The MCP server and counterparty check use no third-party packages. CI pins every action to a commit, installs without install scripts, fails on moderate or worse advisories, and scans tracked history for credentials. | CI `verify` job; `tests/imports-resolve.test.mjs` | — |

## The randomized rule test

[`contracts/vault/src/invariant_tests.rs`](../contracts/vault/src/invariant_tests.rs) drives the real contract code through 48 seeded random sequences of 500 steps each, 24,000 operations in total. The steps mix agent and non-agent requests, transfer successes and failures, time passing, pause, resume, mandate changes and revocation.

After every step:
- the contract's decision, down to the exact rejection reason, must equal that of an independent model that tracks budgets, nonces and versions on its own;
- a rejected request must leave the state unchanged;
- totals recomputed from the contract's own records must stay within the limits.

The test also fails unless every reachable rejection reason occurs. A recent run gave 2,546 authorizations, 2,011 settlements and 485 failed transfers.

To check that the test actually catches bugs, two were planted in the contract and the test was run against each:

- **Daily limit ignores pending payments:** caught at seed 3, step 47.
- **A failed transfer frees its nonce:** caught at seed 1, step 46.

The test adds no crates and sits after every line of contract code, so the deployed WASM still rebuilds byte for byte.

## Not defended, and why

- **A compromised owner key.** The owner is the authority by design; use a hardware wallet or multisig as the owner on mainnet.
- **A malicious allowlisted recipient.** The owner chose it. A thief holding the agent key can only request payments to allowlisted recipients, within the limits.
- **Offchain checks are advisory.** The counterparty check's look-alike, blocklist and code-change rules run before signing, not on chain. Account age and past payments are not checked; they need an indexer. The blocklist is local, not shared.
- **Availability.** If RPC is down, the guard and the proof APIs fail closed and say so. They never report success without evidence.
- **Mainnet and audit.** This is a Testnet deployment and has not been audited. No upgrade method was found in the vault's interface, and the vault account has no access keys. That is not a formal immutability proof.
