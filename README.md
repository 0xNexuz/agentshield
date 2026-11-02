# AgentShield

AgentShield is a NEAR Testnet vault for bounded agent payments. An owner sets an onchain mandate with an authorized agent, recipient allowlist, per-payment cap, daily budget, total budget, and expiry. The agent holds a function-call key limited to the vault's `request_payment` method. The vault, rather than the agent wallet, transfers funds and records settlement after the callback.

The frontend includes a local five-scenario Instant Demo and a walletless Evidence view. The live proof API independently rechecks finalized Testnet transactions and contract state before displaying a settled payment or contract rejection.

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
node --use-system-ca work/verify-testnet-vault-deployment.mjs
node --use-system-ca work/verify-testnet-live-payment.mjs
node --use-system-ca work/verify-testnet-negative-scenarios.mjs
```

For Rust unit tests on Windows, use `work/run-vault-tests.cmd`. For NEAR Sandbox, use Ubuntu/WSL2 with `work/run-sandbox-tests.sh`; see [LOCAL_DEVELOPMENT.md](LOCAL_DEVELOPMENT.md). The latest recorded local results are 11/11 Rust unit tests, 8/8 Sandbox tests, and 7/7 simulator tests. The independent live payment verifier passed, as did all three negative-scenario verifiers. Run the scripts again to check current RPC state.

## Security boundaries and limitations

- `outputs/testnet-live-payment-independent-proof.json` and `outputs/testnet-negative-independent-proofs.json` contain public verification records. Execution scripts save transaction hashes before broadcasting and refuse to create a second signed transaction when an intent record already exists.
- The frontend never receives owner or agent private keys. Testnet lifecycle keys and the restricted signing key were kept in a separate local folder outside this repository. Do not copy those files into a checkout or a frontend bundle.
- The current vault has zero direct access keys and no upgrade method was found in its interface. This is **not** a formal immutability or security-audit claim.
- Four of five live Security Lab scenarios are proven. Revocation would permanently stop this vault's new requests and needs an isolated or end-of-demo plan. NEAR AI integration, real owner-wallet signing, full responsive/accessibility QA, and a formal independent audit are not complete.
- Testnet tokens have no mainnet value. No mainnet deployment or payment is claimed.

Detailed implementation and current gates are in [LOCAL_DEVELOPMENT.md](LOCAL_DEVELOPMENT.md) and [outputs/AgentShield-Project-Context.md](outputs/AgentShield-Project-Context.md).
