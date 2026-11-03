# AgentShield

AgentShield lets an owner give an AI agent money without giving it the keys to everything. The money sits in a NEAR smart contract, the vault. The owner signs a mandate that names the one agent allowed to ask, the accounts it may pay, and limits per payment, per UTC day and in total, with an expiry. The agent holds a function-call key that can call only the vault's `request_payment` method. The vault checks every request itself, pays only when every check passes, and records settlement after the transfer result.

**The problem:** an agent that holds an ordinary wallet key can be tricked by a prompt injection, or simply be wrong, and spend anything. AgentShield puts the spending rules in the contract, so a fooled agent still cannot overspend, pay an account that isn't on the allowlist, or replay a payment.

The vault is deployed on **NEAR Testnet**, not mainnet. Built for NEAR HACKATHON 2026, track AI Security & Defense: spending limits, a contract policy engine and function-call keys.

## Check it in 3 minutes

You don't need a wallet, an account or a key.

| Do | You should see |
| --- | --- |
| Open [agentshield-lab.vercel.app/#judge](https://agentshield-lab.vercel.app/#judge) and press **Watch AgentShield in action** | A six-scene replay, about 75 seconds. Every fact is labelled `SIMULATION`, `HISTORICAL ONCHAIN REPLAY`, `LIVE RPC VERIFIED` or `NOT YET VERIFIED`. The proof scene turns `LIVE RPC VERIFIED` once the site has rechecked public Testnet RPC. |
| Open [/api/testnet/proof](https://agentshield-lab.vercel.app/api/testnet/proof) | JSON with `"verification":"PASS"`, `"settlement":"SETTLED"`, `"codeHash":"2KHm9Waz7fQfQ2A1MWmHhVSwx7o7sm8p1KXBTVyggCqN"` and `"currentKeyStillScoped":true` |
| Open [/api/testnet/gallery](https://agentshield-lab.vercel.app/api/testnet/gallery) | Three results, each `"decision":"REJECTED"` with `"vaultTransferReceiptCount":0`: `PER_PAYMENT_LIMIT`, `RECIPIENT_NOT_ALLOWED` and `REPLAY` |
| `npm ci && npm test` | `# pass 31` and `# fail 0`. Runs offline, with no keys and no chain access. |
| `cargo test --manifest-path contracts/vault/Cargo.toml --locked` | `test result: ok. 12 passed` (the vault's Rust unit tests) |
| `node --use-system-ca work/verify-testnet-live-payment.mjs` | The same `PASS` / `SETTLED` record, rechecked from public RPC on your machine. Needs network access, and rewrites `outputs/testnet-live-payment-independent-proof.json` with a fresh `checkedAt`. |
| `sha256sum deployment/agentshield_vault.wasm` | `138b17e7…be09`. Its base58 form is the code hash the chain reports for the vault, `2KHm9Waz…CqN`. |
| Open the latest run in [GitHub Actions](https://github.com/0xNexuz/agentshield/actions/workflows/ci.yml), job **Rebuild the deployed WASM from source** | Rust 1.96.0 rebuilds `contracts/vault` on Windows and prints `MATCH`: the same 324,708 bytes as the deployed WASM |

The site also has **Attack the vault** (`#attack`): the four recorded scenarios with a live recheck button, custom attacks run in the local simulator, and a prompt-injection challenge.

## What is real and what is simulated

| Part | Status | Evidence |
| --- | --- | --- |
| Vault contract | REAL: NEAR Testnet | Deployment [`7K4729…y2dJ`](https://testnet.nearblocks.io/txns/7K4729h6zNHjuXJcGRT9e6HHGxCrUnzFAZ3AnQpfy2dJ) |
| Agent key limited to `request_payment` | REAL: NEAR Testnet | Key creation [`3faZ6…5CaP`](https://testnet.nearblocks.io/txns/3faZ6WmFDgbM8KUCRnbDLztbYSysKwNGdoq83jy95CaP); `/api/testnet/proof` reports `currentKeyStillScoped` |
| One authorized payment, 0.005 test NEAR | REAL: NEAR Testnet, settled | [`3buDvB…53jm`](https://testnet.nearblocks.io/txns/3buDvBXKDHcCe9VBNtLSSp4H7LLjLfGk7K4XT2jh53jm), recipient receipt `76hE3j…K2dS` |
| Three attacks refused by the contract | REAL: NEAR Testnet, zero payouts | See the [table below](#verified-testnet-deployment) |
| Revocation | NEAR Sandbox only, against the deployed WASM. **Not yet shown on Testnet.** | `sandbox/vault.test.mjs`: "revocation prevents new payments after settlement" |
| Instant Demo and custom attacks on the site | SIMULATED, in the browser | `outputs/agentshield-ui/simulator.mjs`, `tests/simulator.test.mjs` |
| NEAR AI agent with ALLOW / WARN / BLOCK preflight | Implemented; the model is MOCKED in tests. **No real NEAR AI completion yet** (HTTP 402, credits). | `work/near-ai-payment-agent.mjs`, `tests/near-ai-agent.test.mjs` |
| Prompt-injection challenge on the site | Model step SIMULATED. The contract result it points to is the real `RECIPIENT_NOT_ALLOWED` rejection. | `outputs/agentshield-ui/cinematic.mjs` |
| Owner wallet sign-in | UNVERIFIED end to end | — |
| Mainnet | NOT IMPLEMENTED | — |

## Claims and where to check them

Each rule the vault enforces, where it lives in [`contracts/vault/src/lib.rs`](contracts/vault/src/lib.rs), which tests cover it, and any Testnet proof. "Unit" means the Rust tests in `lib.rs`, which use a mocked runtime. "Sandbox" means [`sandbox/vault.test.mjs`](sandbox/vault.test.mjs), which runs the deployed `deployment/agentshield_vault.wasm` in NEAR Sandbox; CI runs both suites on every push.

| Rule | Code | Tests | Testnet proof |
| --- | --- | --- | --- |
| Only the mandated agent can request | [L260](contracts/vault/src/lib.rs#L260) `WRONG_AGENT` | Unit `policy_rejections_leave_budget_untouched`; Sandbox "allowlist, per-payment limit and agent identity" | — |
| The agent's key can call only `request_payment`, with zero deposit | NEAR access-key permission (protocol level, not contract code) | `tests/agent-key-scope.test.mjs`; Sandbox "restricted function-call key settles only the approved vault method" | Key [`3faZ6…5CaP`](https://testnet.nearblocks.io/txns/3faZ6WmFDgbM8KUCRnbDLztbYSysKwNGdoq83jy95CaP); the payment was signed with it |
| A revoked or paused mandate refuses new requests | [L263](contracts/vault/src/lib.rs#L263) `REVOKED`, [L266](contracts/vault/src/lib.rs#L266) `PAUSED`; `revoke` [L242](contracts/vault/src/lib.rs#L242) | Unit `revocation_blocks_new_requests_but_pending_can_settle`; Sandbox "revocation prevents new payments after settlement", "pause, stale version and owner withdrawal" | Not yet |
| The request names the current mandate version | [L272](contracts/vault/src/lib.rs#L272) `STALE_VERSION` | Sandbox "pause, stale version and owner withdrawal" | — |
| The request has not expired and ends inside the mandate | [L279](contracts/vault/src/lib.rs#L279) `EXPIRED` | Sandbox "pause, stale version and owner withdrawal"; `tests/simulator.test.mjs` | — |
| The recipient is on the allowlist | [L285](contracts/vault/src/lib.rs#L285) `RECIPIENT_NOT_ALLOWED` | Unit `policy_rejections_leave_budget_untouched`; Sandbox "allowlist, per-payment limit and agent identity" | [`GvMLEq…gDX9`](https://testnet.nearblocks.io/txns/GvMLEqPTLZfnN4cTVVBS6mKghD7LuTpXgH7ZSAQvgDX9) |
| The amount is above zero and within the per-payment cap | [L289](contracts/vault/src/lib.rs#L289) `PER_PAYMENT_LIMIT` | Unit `policy_rejections_leave_budget_untouched`; Sandbox "allowlist, per-payment limit and agent identity" | [`FEfj7K…L8A`](https://testnet.nearblocks.io/txns/FEfj7KyY5Cr7NTrhDZdXt8Hi1rQqqMwznvK1KhL1ZL8A) |
| A nonce works once per mandate version, even if the transfer fails | [L293](contracts/vault/src/lib.rs#L293) `REPLAY` | Unit `valid_request_reserves_and_replay_does_not_schedule_again`, `failed_transfer_releases_budget_but_keeps_nonce`; Sandbox "funding, owner authorization, settlement and replay" | [`8ktDr3…yjY`](https://testnet.nearblocks.io/txns/8ktDr3AFxE8kVQP1KNkvGBY44oMWWvRCY6tXUqWyvyjY) |
| The daily budget counts pending payments | [L306](contracts/vault/src/lib.rs#L306) `DAILY_LIMIT` | Unit `two_pending_requests_cannot_take_last_daily_budget`; Sandbox "two agent keys cannot exceed a shared budget" | — |
| The total budget counts pending payments | [L314](contracts/vault/src/lib.rs#L314) `TOTAL_LIMIT` | Unit `total_budget_counts_pending_requests` | — |
| No payments while an owner withdrawal is pending | [L269](contracts/vault/src/lib.rs#L269) `WITHDRAWAL_PENDING`; `withdraw_excess` [L428](contracts/vault/src/lib.rs#L428) | Unit `pending_withdrawal_blocks_payment_and_failure_releases_guard`, `…_success_releases_guard`; Sandbox "pause, stale version and owner withdrawal" | — |
| Settlement is recorded only after the transfer result, exactly once | `on_transfer_result` [L381](contracts/vault/src/lib.rs#L381), `#[private]` | Unit `successful_transfer_settles_exactly_once`, `failed_transfer_releases_budget_but_keeps_nonce`; Sandbox "failed recipient transfer releases reservation without settlement" | [`3buDvB…53jm`](https://testnet.nearblocks.io/txns/3buDvBXKDHcCe9VBNtLSSp4H7LLjLfGk7K4XT2jh53jm): receipt `76hE3j…K2dS`, log `status=SETTLED` |
| Only the owner changes policy or funds | `assert_owner` [L489](contracts/vault/src/lib.rs#L489) | Unit `non_owner_cannot_change_policy`, `initializer_must_be_owner`, `only_owner_can_fund_and_attached_amount_is_reported` | Mandate [`GLhrrb…xbG7`](https://testnet.nearblocks.io/txns/GLhrrbxzn93YVKhq6JAxogNW27jf19XqfkfqAJdmxbG7), signed by the owner |
| The deployed code is the WASM in this repo, and that WASM is built from `lib.rs` | `deployment/agentshield_vault.wasm`; [`work/reproduce-vault-wasm.ps1`](work/reproduce-vault-wasm.ps1) | `sha256sum`, then compare with the chain's code hash; CI job "Rebuild the deployed WASM from source" prints `MATCH` | Deployment [`7K4729…y2dJ`](https://testnet.nearblocks.io/txns/7K4729h6zNHjuXJcGRT9e6HHGxCrUnzFAZ3AnQpfy2dJ); `codeHash` in `/api/testnet/proof` |

**The deployed WASM rebuilds byte for byte from this source.** The WASM names its compiler in its `producers` section, `rustc 1.96.0 (ac68faa20 2026-05-25)`, and its panic strings contain the folders of the original Windows build machine. [`work/reproduce-vault-wasm.ps1`](work/reproduce-vault-wasm.ps1) installs Rust 1.96.0, recreates those folders, builds `contracts/vault` and compares SHA-256 hashes. The CI job **Rebuild the deployed WASM from source** runs it on a Windows runner on every push. On 2026-11-03 the rebuilt file was 324,708 bytes with SHA-256 `138b17e7f1a227b22352e2e638fd69e60e0ad95f7a4dd003d8cbd244f8ffbe09`, the same as `deployment/agentshield_vault.wasm` and therefore the code hash on chain. The trust boundaries are drawn in [docs/ARCHITECTURE_AND_EVIDENCE.md](docs/ARCHITECTURE_AND_EVIDENCE.md).

## Where things are

| Path | What it holds |
| --- | --- |
| `contracts/vault/src/lib.rs` | The vault contract (Rust, `near-sdk` 5.29.1) and its unit tests |
| `deployment/agentshield_vault.wasm` | The exact bytecode deployed on Testnet |
| `deployment/*.json` | Proposals: the inputs for the recorded deploy, payment, rejection and renewal runs |
| `sandbox/` | NEAR Sandbox tests that run the deployed WASM |
| `tests/` | Node tests: simulator, key scope, AI preflight, API routes, historical proof regression and site evidence (`npm test`) |
| `api/testnet/` | Read-only Vercel functions `proof`, `gallery`, `status` and `account`. GET only; no signing. |
| `work/` | Scripts: `verify-*.mjs` verifiers, `reproduce-vault-wasm.ps1` (byte-for-byte rebuild), the NEAR AI agent, the execution scripts used for the recorded runs, the preview server and the secret scan |
| `outputs/testnet-*.json` | Committed evidence: intents (written before broadcast), results and independent proofs |
| `outputs/agentshield-ui/` | The website, served as static files by Vercel |
| `frontend/wallet-entry.mjs` | Source of the wallet bundle (`npm run build:wallet`) |
| `docs/` | Judge walkthrough, architecture and evidence, release checklist |
| `outputs/AgentShield-*.md` | Project log and planning notes; the older notes are marked as historical |

## The website

[agentshield-lab.vercel.app](https://agentshield-lab.vercel.app/) serves the frontend and the read-only Testnet proof functions. The Evidence view and Judge Mode recheck public RPC on each visit. There is no signing endpoint, and wallet sign-in has not been verified end to end. The website deployment is separate from the onchain vault and does not change its mandate.

The current production deployment, `dpl_B65KRzdGjq7Udv9NuQqT3tviGxbA` (2026-11-03, from `main` at `96c01f2`), serves Judge Mode, Attack the Vault, the preloader, the live mandate status and the "Verify it yourself" links. Its predecessor `dpl_Fw9krVEZS7rSnt8Uif2JUd2aCvRS` (`17417c3`) first shipped Judge Mode. After it went live, `/api/testnet/proof` returned `PASS / SETTLED` and `/api/testnet/gallery` returned all three rejections with zero vault transfer receipts. The previous deployment, `dpl_Cyu9uYgYiomNDmpCSPXgx6NFfxdm`, added the corrected owner-account label and the renewal-safe historical payment proof. Real owner wallet sign-in remains unverified.

- **Judge Mode** (`#judge`) is a six-scene illustrated film: the owner, the agent, the guardian, the authorized payment, an attack attempt, and proof. Its controls are start, pause/resume, previous, next, replay, skip animation and explore manually. Space and the arrow keys work too, and it respects reduced-motion settings.
- **Attack the Vault** (`#attack`) covers the five Security Lab scenarios, custom attacks in the local simulator, and the prompt-injection challenge.
- The homepage shows the mandate as active, expired or revoked, taken from the live proof API, or from the committed record if the API doesn't answer.

Every on-screen fact carries one of four labels:

- `SIMULATION`: the local model.
- `HISTORICAL ONCHAIN REPLAY`: a finalized transaction from the committed evidence records.
- `LIVE RPC VERIFIED`: shown only after `/api/testnet/proof` or `/api/testnet/gallery` passes on that visit.
- `NOT YET VERIFIED`: used for revocation on Testnet.

`npm run test:cinematic` checks that every hash and value shown on the site matches the committed evidence, and that the browser preflight behaves identically to the server preflight. The art direction, character bible, asset inventory and prompts are in [outputs/AgentShield-Cinematic-Art-Direction.md](outputs/AgentShield-Cinematic-Art-Direction.md).

## Verified Testnet deployment

- Vault: [`vault.agentshield-mag-1d2f78801994.testnet`](https://testnet.nearblocks.io/address/vault.agentshield-mag-1d2f78801994.testnet)
- Deployment: [`7K4729h6zNHjuXJcGRT9e6HHGxCrUnzFAZ3AnQpfy2dJ`](https://testnet.nearblocks.io/txns/7K4729h6zNHjuXJcGRT9e6HHGxCrUnzFAZ3AnQpfy2dJ)
- Code hash: `2KHm9Waz7fQfQ2A1MWmHhVSwx7o7sm8p1KXBTVyggCqN`
- Included WASM: `deployment/agentshield_vault.wasm`, SHA256 `138b17e7f1a227b22352e2e638fd69e60e0ad95f7a4dd003d8cbd244f8ffbe09`
- Restricted key creation: [`3faZ6WmFDgbM8KUCRnbDLztbYSysKwNGdoq83jy95CaP`](https://testnet.nearblocks.io/txns/3faZ6WmFDgbM8KUCRnbDLztbYSysKwNGdoq83jy95CaP)
- Owner mandate: [`GLhrrbxzn93YVKhq6JAxogNW27jf19XqfkfqAJdmxbG7`](https://testnet.nearblocks.io/txns/GLhrrbxzn93YVKhq6JAxogNW27jf19XqfkfqAJdmxbG7)

| Live scenario | Finalized transaction | Verified result |
| --- | --- | --- |
| Authorized payment, 0.005 test NEAR | [`3buDvBXKDHcCe9VBNtLSSp4H7LLjLfGk7K4XT2jh53jm`](https://testnet.nearblocks.io/txns/3buDvBXKDHcCe9VBNtLSSp4H7LLjLfGk7K4XT2jh53jm) | `SETTLED`; exact recipient Transfer receipt `76hE3jsBgdCi8BCBZakcwEMri9Ut7JVu2gDWf3rxK2dS` |
| Per-payment limit | [`FEfj7KyY5Cr7NTrhDZdXt8Hi1rQqqMwznvK1KhL1ZL8A`](https://testnet.nearblocks.io/txns/FEfj7KyY5Cr7NTrhDZdXt8Hi1rQqqMwznvK1KhL1ZL8A) | `REJECTED / PER_PAYMENT_LIMIT`; no vault Transfer receipt |
| Unauthorized recipient | [`GvMLEqPTLZfnN4cTVVBS6mKghD7LuTpXgH7ZSAQvgDX9`](https://testnet.nearblocks.io/txns/GvMLEqPTLZfnN4cTVVBS6mKghD7LuTpXgH7ZSAQvgDX9) | `REJECTED / RECIPIENT_NOT_ALLOWED`; no vault Transfer receipt |
| Replay | [`8ktDr3AFxE8kVQP1KNkvGBY44oMWWvRCY6tXUqWyvyjY`](https://testnet.nearblocks.io/txns/8ktDr3AFxE8kVQP1KNkvGBY44oMWWvRCY6tXUqWyvyjY) | `REJECTED / REPLAY`; no vault Transfer receipt |
| Revocation | — | **Not yet shown on Testnet.** Passes in NEAR Sandbox against the deployed WASM. |

The mandate expires 2026-11-09 09:21:45 UTC. It authorizes only `agentshield-recipient-7bb4a0df1077.testnet`, with limits of 0.01 test NEAR per payment, 0.02 per UTC day, and 0.05 total. The live payment used the restricted public key `ed25519:3mVXz3wwMLhRA1Ppdg56p8K342hTDRAHNVPez7jT5Y6V` and zero attached deposit. The private key is **not** in this repository.

An [unsigned renewal proposal](deployment/testnet-mandate-renewal-proposal.json) extends only the expiry to **2026-11-15 00:00 UTC**. It keeps the same agent, recipient, and limits; a successful `set_mandate` would increment version 1 to 2. The read-only preflight passed against the current vault, but no owner approval or transaction has been given for renewal. The existing payment proof remains tied to its historical version 1 transaction and request record.

## Run locally

```sh
npm ci
npm test
node --use-system-ca work/preview-server.js
```

Open `http://127.0.0.1:4321/`. The Evidence view and Judge Mode call the local read-only proof endpoints and need access to NEAR Testnet RPC; without it they fall back to the committed records and say so. There is no signing endpoint. The wallet UI is present, but a real browser wallet sign-in has not yet been verified end to end.
Keep TLS certificate verification enabled; if your shell sets `NODE_TLS_REJECT_UNAUTHORIZED=0`, set it to `1` before running the server or verifiers.

`npm test` runs every Node suite in `tests/`. The individual suites and the live checks are:

```sh
npm run test:sim
npm run test:key-scope
npm run test:ai
npm run test:cinematic
node --test tests/live-payment-invariants.test.mjs tests/vercel-routes.test.mjs
cargo test --manifest-path contracts/vault/Cargo.toml --locked
npm run build:wallet
node work/scan-tracked-secrets.mjs
node --use-system-ca work/check-mandate-renewal.mjs
node --use-system-ca work/verify-testnet-vault-deployment.mjs
node --use-system-ca work/verify-testnet-live-payment.mjs
node --use-system-ca work/verify-testnet-negative-scenarios.mjs
```

For Rust unit tests on Windows, use `work/run-vault-tests.cmd`. For NEAR Sandbox, use Ubuntu/WSL2 with `work/run-sandbox-tests.sh`; see [LOCAL_DEVELOPMENT.md](LOCAL_DEVELOPMENT.md). On 2026-11-02 the local results were Rust 11/11, Sandbox 8/8, simulator 7/7, key scope 2/2, mocked AI 5/5, Vercel routes 2/2, and historical proof regression 2/2. On 2026-11-03 `npm test` passed 31/31 and the Rust unit tests passed 12/12, including the new total-budget test. The independent live payment verifier and all three negative-scenario verifiers passed against public RPC. The [private GitHub Actions CI run for `cea8871`](https://github.com/0xNexuz/agentshield/actions/runs/41586354770) passed the credential scan, all Node tests, wallet build, Rust units, and Sandbox on 2026-11-03; CI runs the same steps on every push, plus the Windows rebuild of the deployed WASM. Run the scripts again to check current RPC state.

## Security boundaries and limitations

- `outputs/testnet-live-payment-independent-proof.json` and `outputs/testnet-negative-independent-proofs.json` contain public verification records. Execution scripts save transaction hashes before broadcasting and refuse to create a second signed transaction when an intent record already exists.
- The frontend never receives owner or agent private keys. Testnet lifecycle keys and the restricted signing key were kept in a separate local folder outside this repository. Do not copy those files into a checkout or a frontend bundle.
- The current vault has zero direct access keys and no upgrade method was found in its interface. This is **not** a formal immutability or security-audit claim.
- Four of five live Security Lab scenarios are proven on Testnet. Revocation passes in NEAR Sandbox against the deployed WASM, but revoking this vault would permanently stop its new requests, so a Testnet proof needs an isolated or end-of-demo plan. NEAR AI live inference, real owner-wallet sign-in, and a formal independent audit are not complete. A clean unauthenticated desktop/mobile browser check passed for the navigation views, evidence rendering, keyboard skip link, wallet dialog, and overflow; it is not a full accessibility audit.
- An isolated revocation-vault deployment was attempted but finalized **FAILED** because the initializer was given an unsupported custom domain. Its account was not created and its proposed 4 test NEAR funding did not transfer; only gas was charged. The user stopped that lab after the failure. No revocation proof is claimed; see `outputs/testnet-revocation-deploy-failure.json`.
- Testnet tokens have no mainnet value. No mainnet deployment or payment is claimed.

## NEAR AI proposal path

`work/near-ai-payment-agent.mjs` uses the official NEAR AI Cloud chat-completions endpoint from a server-side process. It accepts strict JSON with an exact recipient and NEAR amount, then checks the finalized vault's allowlist, budgets, balance, expiry, and recipient account. Results are `ALLOW`, `WARN` (human approval required), or `BLOCK` (refuse to sign), each with a reason. The runtime never imports owner credentials or a signing key. The prompt-injection test is a **mocked offchain test**; the real unauthorized-recipient contract rejection above is separate onchain evidence.

```powershell
npm run test:ai
$env:NODE_TLS_REJECT_UNAUTHORIZED='1'
node --use-system-ca work/prepare-near-ai-payment.mjs --check-policy
```

Those checks passed locally (5/5 tests and a read-only live ALLOW/WARN/BLOCK policy check). A local `.env` now supplies `NEAR_AI_KEY` without entering Git or Vercel. The first authorized NEAR AI Cloud request returned HTTP 402 on 2026-11-02; a later **non-inference** API key check also returned 402, meaning credits or the configured spend limit must be resolved. No model completion was received, and the prompt-injection inference was not sent. Fresh approval is required before any further billable call. The local CLI can also read a key from `NEAR_AI_KEY_FILE` outside the repository. Do not put the key in the frontend, Git, or a Vercel public environment variable. The deployed site has no NEAR AI inference route and does not need the key. Do not call the proposed agent payment settled without its own authorized transaction and receipt verification. [NEAR AI's quickstart](https://docs.near.ai/cloud/quickstart) documents key and credit setup.

Detailed implementation and current gates are in [LOCAL_DEVELOPMENT.md](LOCAL_DEVELOPMENT.md), [release/submission draft](docs/RELEASE_AND_SUBMISSION.md), and [project context](outputs/AgentShield-Project-Context.md). The GitHub repository and the website are public.

## Licence

[MIT](LICENSE).
