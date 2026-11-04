# Judge walkthrough

No wallet or account is needed for the public proof path. Open [AgentShield Lab](https://agentshield-lab.vercel.app/) in a clean browser.

For a guided version, open **Judge mode** (`/#judge`) and press **Watch AgentShield in action**. It is a six-scene illustrated replay of the same records, about 70 seconds long, and every fact is labelled `SIMULATION`, `HISTORICAL ONCHAIN REPLAY`, `LIVE RPC VERIFIED`, or `NOT YET VERIFIED`. **Attack the vault** (`/#attack`) replays the four proven scenarios with a live recheck button, runs custom attacks in the simulator, and walks through a prompt-injection challenge whose model step is simulated.

1. On **The Thesis**, read the contract-held vault summary and open **Instant Demo**. Run its five scenarios. The screen labels these as simulation; they are not five onchain transactions.
2. Open **Evidence**. Wait for **“One payment. Independently verified.”** Open **VIEW LIVE JSON PROOF**. Expect `verification: PASS`, `settlement: SETTLED`, the deployed vault code hash, the restricted signer, transaction `3buDvB…53jm`, and transfer receipt `76hE3j…K2dS`. The initial `AUTHORIZED` decision alone is not the settlement claim.
3. Continue down **Evidence** to the three rejection proofs. Expect `PER_PAYMENT_LIMIT`, `RECIPIENT_NOT_ALLOWED`, and `REPLAY`, each with a finalized Testnet transaction and zero vault transfer receipts. **Revocation** is marked not yet verified on Testnet; it passes in NEAR Sandbox against the deployed WASM.
4. Open **Lab** to inspect public Testnet account and vault state. Further down, **Check a receiver before paying** runs the counterparty check live: try the six redirect targets from the recorded attacks. Expect `ALLOW` for the real recipient and `BLOCK` for each attack, with the reason (for example, an `o` in place of a `0`, or a Cyrillic `і` highlighted). The site has no wallet connection and never asks you to sign anything; owner actions are signed on the owner's own machine. Nothing to approve in this walkthrough.
5. For independent reproduction, run the read-only verifier commands in [README](../README.md) or query the archival node `https://archival-rpc.testnet.near.org` directly for the hashes (the regular `rpc.testnet.near.org` keeps only about 2.5 days of history) in [the evidence table](ARCHITECTURE_AND_EVIDENCE.md). An explorer may block automated requests.

## Expected limits

- The **Mandate** form saves a browser-only draft. It does not set the deployed policy.
- Owner controls are not a browser signing flow: the owner signs on their own machine.
- The counterparty check is an offchain warning layer; the contract's allowlist is what enforces. Account age and past payments are not checked.
- The MCP server's payment tool is tested with the official MCP SDK client and a stand-in signer; it has not yet sent a Testnet transaction.
- The AI agent has strict output validation and mocked injection coverage. On 2026-11-04, 24 real NEAR AI Cloud completions (`z-ai/glm-5.3-flash`) were recorded with signatures that recover to the attested model key; the Intel quote is not verified, and the 180-token limit cut off 22 of 24 replies, which the preflight blocked. On 2026-11-04 a second run (22 completions, 1,024-token limit, `z-ai/glm-5.3-flash`) returned complete answers: the model ignored the injected note, 11 of 19 red-team attacks returned the original payment, 4 returned empty fields, 4 ran out of tokens, none proposed the attacker's account or amount, and 0 escaped. NEAR AI's official verifier passed the Intel TDX and NVIDIA GPU attestation for the signing key. The site's prompt-injection model step stays simulated, with the real result shown under it.
- The owner renewed the mandate on 2026-11-03 as version 2, with the same rules, until **2026-11-30 00:00 UTC**. The payment and rejection evidence is tied to version 1 and stays independently verifiable.
