# Release and submission packet — draft, not submitted

## Public-release gate

- [x] Repository `0xNexuz/agentshield` is public (made public by the owner on 2026-11-03); the production site is public.
- [x] Tracked Git history through the passing private CI checkpoint scanned with `node work/scan-tracked-secrets.mjs`: zero findings. Scan again immediately before changing repository visibility; a pattern scan is not a guarantee that no credential exists.
- [x] `.env`, `.env.*`, local Testnet credentials and `.vercel/` are Git ignored. Public transaction hashes and account IDs are intentional evidence, not secrets.
- [x] Read-only Testnet payment and three rejection proof APIs returned PASS on 2026-11-02.
- [x] Rust 11/11, Sandbox 8/8, simulator 7/7, key scope 2/2, mocked AI 5/5, route 2/2, historical proof regression 2/2 passed locally on 2026-11-02.
- [x] On 2026-11-03, `npm test` passed 31/31 and the Rust unit tests passed 12/12, including a new total-budget test.
- [x] [Private GitHub Actions run `41586354770`](https://github.com/0xNexuz/agentshield/actions/runs/41586354770) passed secret scanning, Node tests, the then-present wallet build, Rust units, and Sandbox for commit `cea8871` on 2026-11-03. Earlier CI runs exposed a missing cross-platform lockfile entry, an ignored local WASM path, and a concurrent signer race in the test harness. All were fixed and the complete suite reran successfully.
- [x] Production dependency advisories triaged on 2026-11-03. The 5 high advisories all came through the Meteor wallet (`@meteorwallet/sdk`, `nanoid`, `query-string`, `decode-uri-component`), so Meteor was removed from the wallet selector. `npm audit --omit=dev` now reports 0 critical, 0 high, 6 moderate (HOT wallet chain; npm only offers a breaking downgrade) and 15 low. The wallet bundle shrank from 3.0 MB to 1.1 MB.
- [x] Wallet connection removed from the site on 2026-11-04 (HOT Wallet, the only remaining option, does not support Testnet). The site is read-only; owner actions are signed on the owner's machine. `npm audit --omit=dev`: 12 low, nothing moderate or higher.
- [x] On 2026-11-04 the live proof APIs failed (HTTP 408) because `rpc.testnet.near.org` had dropped the 1–2 Nov transactions. Transaction lookups now go to public archival nodes; `npm test` passed 46/46.
- [x] 2026-11-04: counterparty check (live route and Lab panel) and MCP server added; `npm test` 67/67.
- [x] 2026-11-04: randomized rule test (24,000 operations against an independent model; two planted bugs caught), daily `Live evidence` workflow, CI pinned to action commits with no install scripts and an advisory gate, and `docs/THREAT_MODEL.md`. `npm test` 69/69, Rust 13/13. The MCP payment tool has not sent a Testnet transaction; running it needs the owner's key and authorization.
- [x] NEAR AI Cloud credits added and a bounded run approved: 24 signed completions recorded on 2026-11-04 (`outputs/near-ai-*.json`), every signature rechecked by `tests/near-ai-evidence.test.mjs`, zero escapes.
- [x] Run 2 on 2026-11-04 with a 1,024-token limit: complete answers, 0 escaped, and the official verifier passed the Intel TDX and NVIDIA GPU attestation (`outputs/near-ai-*-run2.json`).
- [x] The owner renewed the mandate on 2026-11-03: [`EuUUbL…vJXw`](https://testnet.nearblocks.io/txns/EuUUbLWvPUVVB2q7AiEVGe54giZaarzBy2hikX74vJXw) set version 2, same agent, recipient and limits, expiry 2026-11-30 00:00 UTC. Evidence: `outputs/testnet-mandate-renewal-evidence.json`; the production proof API reports version 2.
- [x] 2026-11-04: four more rejections under mandate version 2 (`STALE_VERSION`, `EXPIRED`, a look-alike `RECIPIENT_NOT_ALLOWED`, and `WRONG_AGENT` signed by the owner), each declared with its expected reason in `deployment/testnet-rejection-probes-v2-proposal.json` before signing, and one payment made through the MCP server's payment tool (`SETTLED`). Signed by the owner on the owner's machine.
- [x] 2026-11-05: [Live evidence run 41990228656](https://github.com/0xNexuz/agentshield/actions/runs/41990228656) rechecked all nine transactions from GitHub's runners through public archival nodes: every one PASS. Its output is committed as `outputs/testnet-rejection-probes-v2-independent-proofs.json` and `outputs/testnet-mcp-payment-independent-proof.json`. `npm test` 84/84.
- [x] 2026-11-05: the owner approved the isolated revocation lab again and signed it on their machine. Deploy [`9tA4jG…w8rYK`](https://testnet.nearblocks.io/txns/9tA4jGgVEJRznKZUNMVEUC37L6Vjaez9MSf59x7w8rYK), key [`AzacRX…6nxf`](https://testnet.nearblocks.io/txns/AzacRXZCRySBy1FrbF9mQtrzMC7uisqwpMay1PRJ6nxf), mandate [`2kgPwV…9s`](https://testnet.nearblocks.io/txns/2kgPwVdrkSUMStnGaPcQNfuJBK9XMfySGdSyB9uULr9s), revoke [`mLpEnE…bJF`](https://testnet.nearblocks.io/txns/mLpEnEMYF5j3dpHNqdNshnaGDNJb44UBLCZjy6QhbJF), then the agent's request [`Gy4b3k…o3gF`](https://testnet.nearblocks.io/txns/Gy4b3k2vwHEM9bqBuWxAX5pfsYRhFsNVJb5e9w8wo3gF) was refused `REVOKED` with zero payout. Two earlier probe signatures asked for 70 Tgas, which the 0.02 test NEAR key allowance can't cover at NEAR's pessimistic gas price, so the network refused them before they ran (`outputs/testnet-revocation-probe-not-landed.json`). [Live evidence run 42021427249](https://github.com/0xNexuz/agentshield/actions/runs/42021427249) rechecked every stage from archival nodes. `npm test` 86/86.
- [x] The tracked-history scan returned zero findings on 2026-11-03, and the owner then made the repository public.
- [ ] Publish a genuine video or screenshots on X and submit the two public links only after separate user authorization.

## Reproduce from a clone

```sh
npm ci
node --test tests/*.test.mjs
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

## Isolated revocation proof — done 2026-11-05

The original vault stays active. The stopped attempt's first transaction failed and did not create or fund the isolated account. A new, corrected plan would: (1) owner creates/funds an isolated keyless vault with **4 test NEAR**, deploys the same WASM and initializes required domain `agentshield:testnet:v1`; (2) agent adds one key restricted to that isolated vault's `request_payment` method with **0.02 test NEAR gas allowance**; (3) owner sets a small one-recipient mandate; (4) owner revokes; (5) agent requests **0.005 test NEAR**, expecting `REVOKED` and zero payout receipts. Each stage must finalize and verify before the next. Cost is **4 test NEAR locked in the isolated vault** (mostly storage/reserve, not recoverable with its current keyless/no-withdrawal design) plus transaction gas; the blocked request should transfer **zero** to the recipient. The owner gave fresh approval on 2026-11-05 and the five stages ran; see the checklist above. Lessons: revoke bumps the mandate version (1 → 2), and a function-call key's allowance is checked against prepaid gas at a pessimistic price, so the probe now sends 10 Tgas.

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
