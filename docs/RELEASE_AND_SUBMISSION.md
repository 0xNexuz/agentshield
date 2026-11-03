# Release and submission packet — draft, not submitted

## Public-release gate

- [x] Private repository exists at `0xNexuz/agentshield`; production site is public.
- [x] Tracked Git history through the passing private CI checkpoint scanned with `node work/scan-tracked-secrets.mjs`: zero findings. Scan again immediately before changing repository visibility; a pattern scan is not a guarantee that no credential exists.
- [x] `.env`, `.env.*`, local Testnet credentials and `.vercel/` are Git ignored. Public transaction hashes and account IDs are intentional evidence, not secrets.
- [x] Read-only Testnet payment and three rejection proof APIs returned PASS on 2026-11-02.
- [x] Rust 11/11, Sandbox 8/8, simulator 7/7, key scope 2/2, mocked AI 5/5, route 2/2, historical proof regression 2/2 passed locally on 2026-11-02.
- [x] [Private GitHub Actions run `41530355326`](https://github.com/0xNexuz/agentshield/actions/runs/41530355326) passed secret scanning, Node tests, wallet build, Rust units, and Sandbox for commit `213969f` on 2026-11-03. The first two CI runs exposed a missing cross-platform lockfile entry and an ignored local WASM path; both were fixed before this passing run.
- [ ] Triage production dependency advisories before public release. `npm audit --omit=dev --json` on 2026-11-03 reported **0 critical, 5 high, 6 moderate, 15 low**. The high findings are in the Meteor wallet dependency chain (`@meteorwallet/sdk`, `decode-uri-component`, `nanoid`, `query-string`, and the direct Meteor selector module); npm reported no automatic fix. The wallet is browser-side and sign-in is not yet verified, so do not claim this path is security-audited.
- [ ] Verify a real owner browser wallet sign-in. No transaction approval is needed for this check.
- [ ] Add NEAR AI Cloud credits, obtain a fresh bounded inference approval, then record genuine normal and prompt-injection responses. Until then describe P5 as blocked.
- [ ] Decide whether to renew the mandate before its 2026-11-09 expiry. Review [the unsigned proposal](../deployment/testnet-mandate-renewal-proposal.json); owner approval and signature are still required.
- [ ] Decide whether to fund an isolated revocation vault. The prior attempt failed at initialization and the user stopped that lab. No new transaction is authorized.
- [ ] Repeat the tracked-history scan and manual review, then obtain explicit permission before changing GitHub visibility to public.
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
node --use-system-ca work/check-mandate-renewal.mjs
```

The first two scripts recheck public Testnet evidence. The third checks the proposed renewal against the current vault; it **does not sign**. The deployment verifier also needs ignored `deployment/testnet.local.json` and the compiled WASM, so the public judge path should use the proof API or the historical receipt verifiers.

## Exact unsigned mandate renewal

The read-only preflight passed against finalized public state on 2026-11-02. A proposed **single owner-signed Testnet `set_mandate`** call would use 30 TGas, zero attached deposit, and the same vault and owner. Agent `agentshield-agent-0359da1630bb.testnet`, recipient `agentshield-recipient-7bb4a0df1077.testnet`, and limits **0.01 per payment / 0.02 per day / 0.05 total test NEAR** remain unchanged. The only proposed field change is expiry from **2026-11-09 09:21:45 UTC** to **2026-11-15 00:00 UTC**. A successful call would increment mandate version **1 → 2**; nonce replay protection is version-scoped, so a new-version request must still use a fresh nonce. `set_mandate` unpauses; current mandate is unpaused, and preflight must reject any unexpected pause/revocation before signing. No call is authorized or signed. Request exact owner approval and rerun the preflight immediately before any transaction.

## Optional isolated revocation proof — fresh approval required

The original vault stays active. The stopped attempt's first transaction failed and did not create or fund the isolated account. A new, corrected plan would: (1) owner creates/funds an isolated keyless vault with **4 test NEAR**, deploys the same WASM and initializes required domain `agentshield:testnet:v1`; (2) agent adds one key restricted to that isolated vault's `request_payment` method with **0.02 test NEAR gas allowance**; (3) owner sets a small one-recipient mandate; (4) owner revokes; (5) agent requests **0.005 test NEAR**, expecting `REVOKED` and zero payout receipts. Each stage must finalize and verify before the next. Cost is **4 test NEAR locked in the isolated vault** (mostly storage/reserve, not recoverable with its current keyless/no-withdrawal design) plus transaction gas; the blocked request should transfer **zero** to the recipient. The exact account, key, expiry and policy must be rechecked and shown for fresh user approval. No part of this plan may execute under the previous authorization because the user explicitly stopped that lab.

## Submission form draft

- **Project:** AgentShield
- **Track:** AI Security & Defense
- **Website:** https://agentshield-lab.vercel.app/
- **Repository:** https://github.com/0xNexuz/agentshield — **currently private**; must be made public with approval before submission.
- **Demo post:** pending; no post is claimed.
- **What we built:** AgentShield is a NEAR Testnet vault that lets an owner bound an AI agent's payment authority. An onchain mandate names one agent and an allowlisted recipient and enforces per-payment, daily, total, expiry, nonce, and revocation rules. The agent uses a function-call key restricted to the vault's `request_payment` method. A real 0.005 test NEAR payment has a finalized recipient transfer and SETTLED callback; three signed attacks were rejected with zero payout receipts. The site offers a separate five-scenario simulator and a walletless Evidence view that rechecks public RPC. NEAR AI proposal parsing and ALLOW/WARN/BLOCK preflight are implemented locally, with mocked tests, but genuine model inference is currently blocked by HTTP 402. Browser owner sign-in and live revocation remain unverified.

The [official event page](https://nearhackathon.com/) says development closes **14 Nov 2026, 23:59 UTC**, the repository must be public, a public X demo post with video or screenshots must tag **@NEARProtocol** and **#NEARHackathon**, and both links must be submitted. The form requires a team lead, email, team size, track, payout NEAR wallet account, repository link, demo post link, and 20–2,000-character description. One submission per project; no wallet connection is needed to submit.

## Public X post draft — do not post yet

Built AgentShield at NEAR HACKATHON: a NEAR Testnet vault that limits what an AI payment agent can request. One settled restricted-key payment, three onchain rejection proofs, and a public RPC-backed evidence lab. Live AI inference is still gated by credits; we label that honestly. Demo: https://agentshield-lab.vercel.app/ Code: https://github.com/0xNexuz/agentshield @NEARProtocol #NEARHackathon

Attach the actual demo video or genuine screenshots before posting. Recheck the AI sentence if that milestone changes.

## Prize-payout wallet checklist

- Choose a **user-controlled NEAR account** intended to receive a prize; do not use a Testnet-only demo account or the keyless vault.
- Confirm the exact account ID and network accepted by the organizer's form before submitting. The form's example is `your-team.near`.
- Confirm the team lead can access the account and has backed up recovery material privately. Never paste a seed phrase or private key into the form, repo, or chat.
- Enter the public account ID only. The form does not require connecting a wallet.
- Record the owner/team agreement about prize receipt outside the public repository.

## Presentation comparison, limited to verified public material

The user named PayGuard, Arkhe Guard, Claw Guard and Bylaw as comparison points. Public searches produced name collisions for PayGuard and Claw Guard and did not reliably identify authoritative Arkhe Guard or Bylaw hackathon submissions. We therefore make **no claims about their architecture or results**. A public Claw Guard post describes a short allowed-versus-blocked demo with a mainnet claim; that highlights a presentation gap for AgentShield: the first minute must show its real transaction and zero-payout attack receipts clearly, while stating Testnet and incomplete AI/wallet gates. The [official Track 06 description](https://github.com/nearai/near-hackathon-prompt-examples/blob/main/tracks/06-security.md) emphasizes spending limits, policy enforcement, restricted keys, and an attack demo. Keep the pitch on those verified strengths; no product expansion is required for comparison.
