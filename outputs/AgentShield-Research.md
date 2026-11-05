# AgentShield — pre-event research and eligibility

> **Historical note, written 2026-10-23.** Kept for the record; it describes plans or checks from before the vault was deployed. Current, verified state: the vault is live on NEAR Testnet with two settled payments (one made through the MCP server), eight contract rejections and a revocation, all independently verified. See [README.md](../README.md) and [docs/ARCHITECTURE_AND_EVIDENCE.md](../docs/ARCHITECTURE_AND_EVIDENCE.md).

**Date:** 2026-10-23. **Status:** research verified where linked; implementation not started.

## Official event facts

- [NEAR HACKATHON](https://nearhackathon.com/) states development runs **2026-11-01 00:00 UTC to 2026-11-14 23:59 UTC**. Submissions open at the start. The public repository and public X demo post (video or screenshots, identifying the hackathon) are both required; the form takes both links. One submission per team; multiple tracks may be selected. AI Security & Defense expressly names spending limits, policy engines and sandboxed wallets. Agent Economy and Autonomous Business are relevant secondary tracks.
- The site asks entrants to **build during the hackathon**. It gives prior NEAR criteria (technical implementation, design, impact, originality, sustainability) as a guide, not published weights for this event. Track-specific technical minimums and prize compatibility were not found on the page.
- The linked official [HACKATHON.md](https://nearhackathon.com/HACKATHON.md) was subsequently fetched on 2026-10-26 and checked against the live copy on 2026-10-27; `work/HACKATHON-official.md` is the saved copy. It confirms the event dates and submission requirements but does **not** specify whether pre-event source or artwork may be reused. **Pre-existing code rules remain UNKNOWN.** Until clarified by the organizer or the event begins, keep submission-specific work to research, specs, design direction and environment preparation. Do not claim a pre-event implementation was built during the event. Request written clarification before copying any pre-event prototype or reusable module into the submission.
- Public repository and X posting are consequential external actions and require the user's explicit authorization.

## Technical feasibility

- NEAR's [function-call access keys](https://near.github.io/nearcore/DataStructures/AccessKey.html) can restrict a key to selected methods of one receiver and spend an allowance on gas. They cannot transfer NEAR directly. This is helpful for a request-only agent key, but the vault contract must enforce the financial rules.
- NEAR's [Rust SDK](https://github.com/near/near-sdk-rs), [cargo-near](https://github.com/near/cargo-near) and [sandbox testing](https://docs.near.org/tutorials/auction/sandbox-testing) provide a feasible local contract/test path. Exact versions should be pinned when implementation starts.
- [Shade Agents guidance](https://docs.near.org/ai/shade-agents/key-components) warns that a successful MPC signature does not prove broadcast or settlement; arbitrary payload signing needs constraints in the contract. AgentShield will defer Shade Agents and Chain Signatures until a safe transaction builder, nonce control, and independent destination-chain reconciliation exist.
- [NEAR Intents documentation](https://docs.near.org/chain-abstraction/intents/faq) says no testnet deployment is available. A real Intents demonstration would require mainnet and therefore a separate explicit approval for funding and transactions. A quote, signature or solver response alone is not settlement proof.

## Competitive position

| Product | Observed capability | AgentShield differentiation to prove |
|---|---|---|
| [NEAR Shade Agents](https://docs.near.org/ai/shade-agents/key-components) | TEE worker registration and MPC signing pattern | AgentShield's first path uses a directly inspectable NEAR vault policy and payout, with no arbitrary signing endpoint. |
| [OutLayer](https://app.outlayer.ai/docs/agent-custody) | Agent custody, spending limits, allowlists, approval and freeze inside a TEE | Focus on an independently replayable onchain policy state machine and evidence per decision. This is a proposed distinction, not a claim of superior security. |
| [MetaMask Agent Wallet](https://docs.metamask.io/agent-wallet/approve-requests/) | Guard policies and human approval for flagged or out-of-policy requests | NEAR-native escrowed delegation, exact NEAR transaction lifecycle, and reproducible negative tests. |

The supplied names “Xorr Finance” and “CRESCO” could not be reliably matched to relevant primary product documentation. No competitive claim about them is made. Spending limits and guarded wallets are **not novel by themselves**. The defensible claim would be the precise contract-enforced mandate, reproducible bypass tests, and human-readable evidence, if actually built and verified.

## Open questions and checks

1. Obtain official pre-existing-code and reuse rules, preferably from `HACKATHON.md` or organizer response.
2. Recheck event page near 1 November for changed deadlines, form requirements and track details.
3. Verify latest SDK/CLI versions and testnet RPC before pinning dependencies.
4. Treat all competitive marketing claims as unverified until independently tested.
