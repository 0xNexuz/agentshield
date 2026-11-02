# AgentShield — NEAR testnet setup check

**Date:** 2026-10-26. **Status:** read-only testnet check implemented and RPC paths verified. No AgentShield vault, wallet session, testnet transaction, or deployment exists.

## Try it

1. Open `http://127.0.0.1:4321/` and refresh the page.
2. Choose **Lab 05**.
3. Enter public owner, agent, and recipient `.testnet` account IDs. Add a vault account ID only when one has been created. Never enter a seed phrase or private key.
4. Select **Run live check**. The panel reports the testnet chain, recent block, whether each account exists, its reported native balance, and whether the optional vault account has deployed code.

The form does not store these account IDs, connect a wallet, sign anything, fund an account, or create a mandate. If owner and agent match, the result warns that they must be separate for the actual vault test. A missing account is different from an RPC error.

The Lab now explains where these IDs come from. The owner, agent, and recipient are separate testnet accounts created in a [testnet wallet](https://wallet.testnet.near.org/) or through the [NEAR CLI account flow](https://docs.near.org/tools/cli). The CLI documents faucet-sponsored account creation on testnet. The vault ID is optional until a contract account is deployed. Placeholder IDs in the form are examples, not accounts created by AgentShield.

## What was verified

- `node --check` passed for the browser script, testnet RPC module, and preview server.
- Live `https://rpc.testnet.near.org/status` returned `chain_id: testnet`, `syncing: false`, and a current block.
- A finalized `view_account` query for `wrap.testnet` returned an existing account and deployed code hash.
- A finalized query for `agentshield-nonexistent-294781.testnet` returned `found: false`.
- The local preview API returned the same live status and account results. Invalid IDs returned HTTP 400. The page returned HTTP 200 and retained the original footer content plus `built by @magnum inc.`.
- A visual browser pass was attempted, but automatic approval review rejected capturing the user's Edge window because it could expose unrelated browsing content. The new panel's rendered layout and click path are therefore **not browser-verified** in this turn.

The preview server binds only to `127.0.0.1`. Its testnet API accepts only public status and finalized account queries against the fixed testnet RPC endpoint. It holds no keys.

## Next proof, before any mainnet deployment

Build the vault contract, run local sandbox tests, deploy it to a user-controlled `.testnet` account, and test a small native NEAR payment plus rejected over-limit, replay, and revoked requests. Record the contract account ID, transaction hashes, receipt outcomes, and recipient balance change. None of these contract claims is proven by the read-only setup check.

The [official event page](https://nearhackathon.com/) says to build during the 1–14 November 2026 hackathon. Pre-existing-code eligibility is still unclear; this test panel remains a separate pre-event exploration until the organizer clarifies reuse.
