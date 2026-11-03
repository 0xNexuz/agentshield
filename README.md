# AgentShield

AgentShield is a NEAR Testnet vault for bounded agent payments. An owner sets an onchain mandate with an authorized agent, recipient allowlist, per-payment cap, daily budget, total budget, and expiry. The agent holds a function-call key limited to the vault's `request_payment` method. The vault, rather than the agent wallet, transfers funds and records settlement after the callback.

The frontend includes a five-scenario Instant Demo and a walletless Evidence view. The live proof API independently rechecks finalized Testnet transactions and contract state before displaying a settled payment or contract rejection. The Instant Demo is a simulation. Start with the [judge walkthrough](docs/JUDGE_WALKTHROUGH.md) and [architecture/evidence table](docs/ARCHITECTURE_AND_EVIDENCE.md).

## Live site

[agentshield-lab.vercel.app](https://agentshield-lab.vercel.app/) serves the existing frontend and read-only Testnet proof functions. Its Evidence view rechecks the public RPC on each visit. It has no signing endpoint; wallet sign-in has not been verified end to end. The deployment is separate from the onchain vault and does not change its mandate.

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
| Revocation | — | **Not verified live** |

The mandate expires 2026-11-09 09:21:45 UTC. It authorizes only `agentshield-recipient-7bb4a0df1077.testnet`, with limits of 0.01 test NEAR per payment, 0.02 per UTC day, and 0.05 total. The live payment used the restricted public key `ed25519:3mVXz3wwMLhRA1Ppdg56p8K342hTDRAHNVPez7jT5Y6V` and zero attached deposit. The private key is **not** in this repository.

An [unsigned renewal proposal](deployment/testnet-mandate-renewal-proposal.json) extends only the expiry to **2026-11-15 00:00 UTC**. It keeps the same agent, recipient, and limits; a successful `set_mandate` would increment version 1 to 2. The read-only preflight passed against the current vault, but no owner approval or transaction has been given for renewal. The existing payment proof remains tied to its historical version 1 transaction and request record.

## Run locally

```sh
npm ci
node --use-system-ca work/preview-server.js
```

Open `http://127.0.0.1:4321/`. The Evidence view calls the local read-only proof endpoints and needs access to NEAR Testnet RPC. It has no signing endpoint. The wallet UI is present, but a real browser wallet sign-in has not yet been verified end to end.
Keep TLS certificate verification enabled; if your shell sets `NODE_TLS_REJECT_UNAUTHORIZED=0`, set it to `1` before running the server or verifiers.

```sh
npm run test:sim
npm run test:key-scope
npm run test:ai
node --test tests/live-payment-invariants.test.mjs tests/vercel-routes.test.mjs
npm run build:wallet
node work/scan-tracked-secrets.mjs
node --use-system-ca work/check-mandate-renewal.mjs
node --use-system-ca work/verify-testnet-vault-deployment.mjs
node --use-system-ca work/verify-testnet-live-payment.mjs
node --use-system-ca work/verify-testnet-negative-scenarios.mjs
```

For Rust unit tests on Windows, use `work/run-vault-tests.cmd`. For NEAR Sandbox, use Ubuntu/WSL2 with `work/run-sandbox-tests.sh`; see [LOCAL_DEVELOPMENT.md](LOCAL_DEVELOPMENT.md). On 2026-11-02 the local results were Rust 11/11, Sandbox 8/8, simulator 7/7, key scope 2/2, mocked AI 5/5, Vercel routes 2/2, and historical proof regression 2/2. The independent live payment verifier and all three negative-scenario verifiers passed against public RPC. The [private GitHub Actions CI run for `cea8871`](https://github.com/0xNexuz/agentshield/actions/runs/41586354770) passed the credential scan, all Node tests, wallet build, Rust units, and Sandbox on 2026-11-03. Run the scripts again to check current RPC state.

## Security boundaries and limitations

- `outputs/testnet-live-payment-independent-proof.json` and `outputs/testnet-negative-independent-proofs.json` contain public verification records. Execution scripts save transaction hashes before broadcasting and refuse to create a second signed transaction when an intent record already exists.
- The frontend never receives owner or agent private keys. Testnet lifecycle keys and the restricted signing key were kept in a separate local folder outside this repository. Do not copy those files into a checkout or a frontend bundle.
- The current vault has zero direct access keys and no upgrade method was found in its interface. This is **not** a formal immutability or security-audit claim.
- Four of five live Security Lab scenarios are proven. Revocation would permanently stop this vault's new requests and needs an isolated or end-of-demo plan. NEAR AI live inference, real owner-wallet sign-in, and a formal independent audit are not complete. A clean unauthenticated desktop/mobile browser check passed for six navigation views, evidence rendering, keyboard skip link, wallet dialog, and overflow; it is not a full accessibility audit.
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

Detailed implementation and current gates are in [LOCAL_DEVELOPMENT.md](LOCAL_DEVELOPMENT.md), [release/submission draft](docs/RELEASE_AND_SUBMISSION.md), and [project context](outputs/AgentShield-Project-Context.md). The GitHub repository is private until the owner approves public release; the website is public.
