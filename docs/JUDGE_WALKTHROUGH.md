# Judge walkthrough

No wallet or account is needed for the public proof path. Open [AgentShield Lab](https://agentshield-lab.vercel.app/) in a clean browser.

For a guided version, open **Judge mode** (`/#judge`) and press **Watch AgentShield in action**. It is a six-scene illustrated replay of the same records, about 70 seconds long, and every fact is labelled `SIMULATION`, `HISTORICAL ONCHAIN REPLAY`, `LIVE RPC VERIFIED`, or `NOT YET VERIFIED`. **Attack the vault** (`/#attack`) replays the four proven scenarios with a live recheck button, runs custom attacks in the simulator, and walks through a prompt-injection challenge whose model step is simulated.

1. On **The Thesis**, read the contract-held vault summary and open **Instant Demo**. Run its five scenarios. The screen labels these as simulation; they are not five onchain transactions.
2. Open **Evidence**. Wait for **“One payment. Independently verified.”** Open **VIEW LIVE JSON PROOF**. Expect `verification: PASS`, `settlement: SETTLED`, the deployed vault code hash, the restricted signer, transaction `3buDvB…53jm`, and transfer receipt `76hE3j…K2dS`. The initial `AUTHORIZED` decision alone is not the settlement claim.
3. Continue down **Evidence** to the three rejection proofs. Expect `PER_PAYMENT_LIMIT`, `RECIPIENT_NOT_ALLOWED`, and `REPLAY`, each with a finalized Testnet transaction and zero vault transfer receipts. **Revocation** is marked not yet verified on Testnet; it passes in NEAR Sandbox against the deployed WASM.
4. Open **Lab** to inspect public Testnet account and vault state. A wallet connection is optional; real owner sign-in has not yet been verified. Do not approve a transaction as part of this walkthrough.
5. For independent reproduction, run the read-only verifier commands in [README](../README.md) or query `https://rpc.testnet.near.org` directly for the hashes in [the evidence table](ARCHITECTURE_AND_EVIDENCE.md). An explorer may block automated requests.

## Expected limits

- The **Mandate** form saves a browser-only draft. It does not set the deployed policy.
- Owner controls are not a proven browser signing flow.
- The local AI agent has strict output validation and mocked injection coverage, but genuine NEAR AI inference has not completed: the key check and first inference returned HTTP 402. Do not present the mock as a live model outcome.
- The mandate version 1 expires **2026-11-09 09:21:45 UTC** unless the owner approves and signs a renewal. The historical payment and rejection evidence remain independently verifiable after expiry.
