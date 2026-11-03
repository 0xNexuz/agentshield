# Release and submission packet — draft, not submitted

## Public-release gate

- [x] Repository `0xNexuz/agentshield` is public (made public by the owner on 2026-11-03); the production site is public.
- [x] Tracked Git history through the passing private CI checkpoint scanned with `node work/scan-tracked-secrets.mjs`: zero findings. Scan again immediately before changing repository visibility; a pattern scan is not a guarantee that no credential exists.
- [x] `.env`, `.env.*`, local Testnet credentials and `.vercel/` are Git ignored. Public transaction hashes and account IDs are intentional evidence, not secrets.
- [x] Read-only Testnet payment and three rejection proof APIs returned PASS on 2026-11-02.
- [x] Rust 11/11, Sandbox 8/8, simulator 7/7, key scope 2/2, mocked AI 5/5, route 2/2, historical proof regression 2/2 passed locally on 2026-11-02.
- [x] On 2026-11-03, `npm test` passed 31/31 and the Rust unit tests passed 12/12, including a new total-budget test.
- [x] [Private GitHub Actions run `41586354770`](https://github.com/0xNexuz/agentshield/actions/runs/41586354770) passed secret scanning, Node tests, wallet build, Rust units, and Sandbox for commit `cea8871` on 2026-11-03. Earlier CI runs exposed a missing cross-platform lockfile entry, an ignored local WASM path, and a concurrent signer race in the test harness. All were fixed and the complete suite reran successfully.
- [x] Production dependency advisories triaged on 2026-11-03. The 5 high advisories all came through the Meteor wallet (`@meteorwallet/sdk`, `nanoid`, `query-string`, `decode-uri-component`), so Meteor was removed from the wallet selector. `npm audit --omit=dev` now reports 0 critical, 0 high, 6 moderate (HOT wallet chain; npm only offers a breaking downgrade) and 15 low. The wallet bundle shrank from 3.0 MB to 1.1 MB.
- [ ] Verify a real owner browser wallet sign-in. No transaction approval is needed for this check.
- [ ] Add NEAR AI Cloud credits, obtain a fresh bounded inference approval, then record genuine normal and prompt-injection responses. Until then describe P5 as blocked.
- [x] The owner renewed the mandate on 2026-11-03: [`EuUUbL…vJXw`](https://testnet.nearblocks.io/txns/EuUUbLWvPUVVB2q7AiEVGe54giZaarzBy2hikX74vJXw) set version 2, same agent, recipient and limits, expiry 2026-11-30 00:00 UTC. Evidence: `outputs/testnet-mandate-renewal-evidence.json`; the production proof API reports version 2.
- [ ] Decide whether to fund an isolated revocation vault. The prior attempt failed at initialization and the user stopped that lab. No new transaction is authorized.
- [x] The tracked-history scan returned zero findings on 2026-11-03, and the owner then made the repository public.
- [ ] Publish a genuine video or screenshots on X and submit the two public links only after separate user authorization.

## Reproduce from a clone

```sh
npm ci
node --test tests/*.test.mjs
npm run build:wallet
cargo test --manifest-path contracts/vault/Cargo.toml --locked
bash work/setup-linux-node.sh
bash work/setup-near-sandbox.sh
npm ci --prefix sandbox --ignore-scripts --no-audit --no-fund
bash work/run-sandbox-tests.sh
node work/scan-tracked-secrets.mjs
```

The Sandbox commands require Linux/WSL2. `work/run-sandbox-tests.sh` runs against the included verified WASM and NEAR Sandbox 2.13.4. Network access is needed only for the first Node/Sandbox downloads and dependencies. For live read-only verification, keep TLS validation enabled:

```sh
node --use-system-ca work/verify-testnet-live-payment.mjs
node --use-system-ca work/verify-testnet-negative-scenarios.mjs
```

Both scripts recheck public Testnet evidence. `work/check-mandate-renewal.mjs` was the read-only preflight for the renewal; now that the vault is at version 2 it reports that the current version differs, which is expected. The deployment verifier also needs ignored `deployment/testnet.local.json` and the compiled WASM, so the public judge path should use the proof API or the historical receipt verifiers.

## Mandate renewal — signed 2026-11-03

The owner signed the renewal as [`EuUUbL…vJXw`](https://testnet.nearblocks.io/txns/EuUUbLWvPUVVB2q7AiEVGe54giZaarzBy2hikX74vJXw) after the read-only preflight passed; `work/execute-testnet-mandate-renewal.mjs` wrote its intent record before broadcasting. The plan below is kept as approved. A **single owner-signed Testnet `set_mandate`** call would use 30 TGas, zero attached deposit, and the same vault and owner. Agent `agentshield-agent-0359da1630bb.testnet`, recipient `agentshield-recipient-7bb4a0df1077.testnet`, and limits **0.01 per payment / 0.02 per day / 0.05 total test NEAR** remain unchanged. The only proposed field change is expiry from **2026-11-09 09:21:45 UTC** to **2026-11-30 00:00 UTC**, after judging (16–18 Nov) and within the contract's 30-day limit from any signing date after 31 Oct. A successful call would increment mandate version **1 → 2**; nonce replay protection is version-scoped, so a new-version request must still use a fresh nonce. `set_mandate` unpauses; current mandate is unpaused, and preflight must reject any unexpected pause/revocation before signing. No call is authorized or signed. Request exact owner approval and rerun the preflight immediately before any transaction.

## Optional isolated revocation proof — fresh approval required

The original vault stays active. The stopped attempt's first transaction failed and did not create or fund the isolated account. A new, corrected plan would: (1) owner creates/funds an isolated keyless vault with **4 test NEAR**, deploys the same WASM and initializes required domain `agentshield:testnet:v1`; (2) agent adds one key restricted to that isolated vault's `request_payment` method with **0.02 test NEAR gas allowance**; (3) owner sets a small one-recipient mandate; (4) owner revokes; (5) agent requests **0.005 test NEAR**, expecting `REVOKED` and zero payout receipts. Each stage must finalize and verify before the next. Cost is **4 test NEAR locked in the isolated vault** (mostly storage/reserve, not recoverable with its current keyless/no-withdrawal design) plus transaction gas; the blocked request should transfer **zero** to the recipient. The exact account, key, expiry and policy must be rechecked and shown for fresh user approval. No part of this plan may execute under the previous authorization because the user explicitly stopped that lab.

## Submission requirements

The [official event page](https://nearhackathon.com/) says development closes **14 Nov 2026, 23:59 UTC**, the repository must be public, a public X demo post with video or screenshots must tag **@NEARProtocol** and **#NEARHackathon**, and both links must be submitted. The form requires a team lead, email, team size, track, payout NEAR wallet account, repository link, demo post link, and 20–2,000-character description. One submission per project; no wallet connection is needed to submit. The submission text, X post and video script are kept with the team, not in this repository.

## Prize-payout wallet checklist

- Choose a **user-controlled NEAR account** intended to receive a prize; do not use a Testnet-only demo account or the keyless vault.
- Confirm the exact account ID and network accepted by the organizer's form before submitting. The form's example is `your-team.near`.
- Confirm the team lead can access the account and has backed up recovery material privately. Never paste a seed phrase or private key into the form, repo, or chat.
- Enter the public account ID only. The form does not require connecting a wallet.
- Record the owner/team agreement about prize receipt outside the public repository.

## Presentation comparison, limited to verified public material

The user named PayGuard, Arkhe Guard, Claw Guard and Bylaw as comparison points. Public searches produced name collisions for PayGuard and Claw Guard and did not reliably identify authoritative Arkhe Guard or Bylaw hackathon submissions. We therefore make **no claims about their architecture or results**. A public Claw Guard post describes a short allowed-versus-blocked demo with a mainnet claim; that highlights a presentation gap for AgentShield: the first minute must show its real transaction and zero-payout attack receipts clearly, while stating Testnet and incomplete AI/wallet gates. The [official Track 06 description](https://github.com/nearai/near-hackathon-prompt-examples/blob/main/tracks/06-security.md) emphasizes spending limits, policy enforcement, restricted keys, and an attack demo. Keep the pitch on those verified strengths; no product expansion is required for comparison.
