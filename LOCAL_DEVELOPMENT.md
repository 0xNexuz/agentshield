# AgentShield local development

Setup notes for working on AgentShield. [README.md](README.md) has the evidence, the claims table and the quick checks.

## Start the site

The site has no build step and no wallet code. The preview server binds to localhost and serves the same read-only API routes as Vercel.

```sh
npm ci
node --use-system-ca work/preview-server.js   # http://127.0.0.1:4321
```

On Windows PowerShell, set `$env:NODE_TLS_REJECT_UNAUTHORIZED='1'` first if your shell has turned TLS checks off.

## Tests

```sh
npm test                                                         # every Node test, offline
npm run test:sim                                                 # the browser simulator only
npm run test:key-scope                                           # the agent-key permission checker only
npm run test:ai                                                  # the NEAR AI preflight, with a mocked model
cargo test --manifest-path contracts/vault/Cargo.toml --locked   # Rust unit tests and the randomized rule test
```

On Windows, `cmd.exe /c work\run-vault-tests.cmd` runs the Rust tests with the Visual Studio C++ toolchain and cached crates (`work/cargo-offline.toml`).

**NEAR Sandbox** tests run the deployed WASM on a disposable local chain. They need Linux or WSL2. The setup scripts install Node and NEAR Sandbox 2.13.4 into the ignored `.tools/` folder, check the download hashes and install no system packages:

```sh
bash work/setup-linux-node.sh
bash work/setup-near-sandbox.sh
npm ci --prefix sandbox --ignore-scripts --no-audit --no-fund
bash work/run-sandbox-tests.sh
```

Sandbox transaction IDs exist only on that local chain. They are not Testnet evidence.

**The WASM rebuild** (`pwsh work/reproduce-vault-wasm.ps1`) installs Rust 1.96.0 on Windows, recreates the original build folders under `C:\Users\USER\`, builds `contracts/vault` and compares SHA-256 with `deployment/agentshield_vault.wasm`. Use a throwaway machine, or let the CI job do it.

## Check the agent key

The agent's key is a function-call key on a separate Testnet account. This read-only checker fails if the key has full access, names another receiver, allows other methods, or has a missing, zero or unlimited gas allowance:

```sh
node --use-system-ca work/verify-agent-key.mjs agentshield-agent-0359da1630bb.testnet ed25519:3mVXz3wwMLhRA1Ppdg56p8K342hTDRAHNVPez7jT5Y6V vault.agentshield-mag-1d2f78801994.testnet
```

NEAR charges gas against the key's allowance, and adding balance to the account does not refill it. To rotate, add a new limited key and delete the old one with the agent account's full-access key.

## Keys and signing

- Private keys never enter this repository, the site or Vercel. The owner and agent keys live in a folder outside the project.
- The scripts that signed the recorded runs (`work/execute-*.mjs`, `work/deploy-testnet-vault.mjs`, `work/run-mcp-testnet-payment.mjs`) each take an explicit approval flag. They write an intent record with the transaction hash before broadcasting and refuse to send a second transaction for the same stage.
- `deployment/testnet.example.json` shows the shape of `deployment/testnet.local.json`, which is ignored by Git and holds only public account IDs and amounts. `node work/prepare-testnet-deployment.mjs deployment/testnet.local.json` validates it without deploying or spending.
- The MCP server stays read-only unless `AGENTSHIELD_AGENT_KEY_FILE` points to the agent's restricted key file outside the repository.

## Evidence states

The site and the verifiers use these words strictly:

- **ALLOW / WARN / BLOCK** is an offchain guard decision. Nothing reached the vault.
- **REJECTED** needs a signed, finalized `request_payment` transaction, the vault's rejection log and result, and no payout receipt.
- **AUTHORIZED** means the vault accepted the request. On its own it is not proof of payment.
- **SETTLED** needs the finalized transfer receipt, the callback's settlement log and the matching `get_request` record. Anything missing or inconsistent is shown as inconclusive, never as settled.

## NEAR AI

For local runs, put `NEAR_AI_KEY` in the ignored `.env` and start Node with `--env-file=.env`. `work/prepare-near-ai-payment.mjs` also accepts `NEAR_AI_KEY_FILE`, a path to a key file outside the repository. `work/run-near-ai-evidence.mjs` produced the recorded runs in `outputs/near-ai-*.json`; `tests/near-ai-evidence.test.mjs` rechecks every recorded signature offline.

The live model box on the site calls NEAR AI only from the server function `api/live/injection.js`, and only when `NEAR_AI_KEY` is set as a server-side Vercel environment variable. Without it, the box says it is off. `LIVE_INJECTION_DAILY_CAP` (default 150 per server instance) limits attempts per UTC day, and each visitor gets five tries every ten minutes.

## Vercel

`vercel.json` publishes `outputs/agentshield-ui` as static files and deploys `api/` as functions. Each function bundles only the public plan and evidence records it reads (`includeFiles`, at most 256 characters per entry). The proof functions recheck finalized public RPC before they return a pass: current state from `rpc.testnet.near.org`, transactions from the public archival nodes.
