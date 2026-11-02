# AgentShield local development

This workspace is a local Git project. The NEAR Testnet vault, one settled restricted-agent payment, and three genuine contract rejections are recorded in `outputs/` and summarized in `README.md`. The **Instant Demo** remains a deterministic simulation, distinct from the live Evidence view. The **Lab** checks public account state; the frontend has no signing endpoint.

## Start the UI

From this directory, run:

```powershell
npm ci
npm run build:wallet
$env:NODE_TLS_REJECT_UNAUTHORIZED='1'
node --use-system-ca work/preview-server.js
```

Open `http://127.0.0.1:4321/`. The preview server binds to localhost. To reproduce the browser bundle after editing `frontend/wallet-entry.mjs`, rerun `npm run build:wallet`.

## Verify locally

```powershell
npm run test:sim
npm run test:key-scope
cmd.exe /c work\run-vault-tests.cmd
$env:CARGO_HOME=(Join-Path (Get-Location) '.cargo-home')
cargo --config work/cargo-offline.toml build --manifest-path contracts/vault/Cargo.toml --target wasm32-unknown-unknown --release --offline
```

The Rust test script uses the installed Visual Studio C++ toolchain and cached crates. The release artifact is `contracts/vault/target/wasm32-unknown-unknown/release/agentshield_vault.wasm`; the exact deployed artifact is also retained at `deployment/agentshield_vault.wasm`. On 2026-11-02, seven simulator tests, two key-scope tests, and eleven Rust unit tests passed. The deployed artifact is 324,708 bytes, SHA256 `138B17E7F1A227B22352E2E638FD69E60E0AD95F7A4DD003D8CBD244F8FFBE09`, with NEAR base58 code hash `2KHm9Waz7fQfQ2A1MWmHhVSwx7o7sm8p1KXBTVyggCqN`.

Ubuntu runs under WSL2. The `sandbox/` integration suite executed real local contract transactions against **NEAR Sandbox 2.13.4** on 2026-11-02: eight tests passed, zero failed, including a restricted function-call key scoped to the vault payment method. It covers owner funding, owner-only authorization, payment settlement and recipient balance, replay, allowlist, payment cap, wrong agent, failed transfer callback, revocation, two concurrent agent-key requests sharing a budget, pause, stale version, expiry, and an owner withdrawal. The first attempt with Sandbox 2.6.2 could not compile this SDK 5.29 WASM (`PrepareError: Deserialization`); use the newer binary. A true pending-withdrawal overlap in Sandbox remains unverified; both success and failure guards have Rust unit coverage.

To reproduce in Ubuntu WSL2, open a shell in the workspace's `/mnt/c/...` directory and run:

```bash
bash work/setup-linux-node.sh
bash work/setup-near-sandbox.sh
export PATH="$PWD/.tools/node-v24.22.2-linux-x64/bin:$PATH"
cd sandbox && npm ci --ignore-scripts --no-audit --no-fund && cd ..
bash work/run-sandbox-tests.sh
```

The setup scripts install no system packages and verify downloaded archive hashes. The 2.13.4 Sandbox binary is local and ignored by Git. Sandbox transaction IDs are confined to this disposable local chain; they are **not** Testnet evidence.

On 2026-11-01, `npm run build:wallet` succeeded with workspace access. The preview returned HTTP 200 and its browser dialog loaded Meteor and HOT. Selecting Meteor without a vault ID showed the expected local validation error. This checks bundling and the pre-sign-in path only; no wallet sign-in or testnet transaction was performed.

## Testnet setup boundary

- Enter `vault.agentshield-mag-1d2f78801994.testnet` in the Lab before connecting a NEAR **testnet** wallet. The wallet connection request is scoped to that vault's owner methods. The wallet selector currently opens Meteor and HOT in the real browser; no wallet sign-in has been performed.
- The agent must use a separate testnet account. The recipient should also be an account under your control for a later small payment test.
- The vault account was created, funded with 5 test NEAR, deployed, and initialized **atomically** with the owner as transaction predecessor. The finalized transaction is `7K4729h6zNHjuXJcGRT9e6HHGxCrUnzFAZ3AnQpfy2dJ`.
- The contract has a 64 accepted-request lifetime cap and reserves 0.2 NEAR, plus storage cost, from spendable balance. These are prototype limits.
- Do not paste seed phrases or private keys into the UI or workspace. The owner credential remains outside the project in `C:\Users\USER\Documents\Codex\AgentShield-Secrets\testnet`.

Use `deployment/testnet.example.json` to prepare `deployment/testnet.local.json` with four public testnet account IDs and proposed yoctoNEAR amounts. The local file is ignored by Git if a repository is later created; still never put secret keys in it. Run `node work/prepare-testnet-deployment.mjs deployment/testnet.local.json` to validate the config and print the expected hash. `--check-live` additionally checks testnet RPC health and that the proposed vault account is unused. These commands do not deploy or spend.

As of 2026-11-02, `deployment/testnet.local.json` contains three faucet-created role accounts and the deployed vault subaccount. The owner, agent, and recipient lifecycle keys and the separate restricted agent key are under `C:\Users\USER\Documents\Codex\AgentShield-Secrets\testnet`, outside this project. The vault received **5 test NEAR**; the active 0.01 per-payment, 0.02 daily, and 0.05 total mandate has settled one 0.005 payment. The deployment `--check-live` command checks for an **unused** account and now rejects this already deployed vault as expected. Use `node --use-system-ca work/verify-testnet-vault-deployment.mjs`, `work/verify-testnet-live-payment.mjs`, and `work/verify-testnet-negative-scenarios.mjs` for read-only verification. Back up keys privately; never copy them into the project or frontend.

The deployed code hash is `2KHm9Waz7fQfQ2A1MWmHhVSwx7o7sm8p1KXBTVyggCqN`; the vault has zero direct access keys and an active mandate. The payment and three rejection transactions provide four genuine live scenarios; revocation remains unverified. The official hackathon announcement was 2026-10-19, and the event site counts code written since announcement; the documented project timeline begins 2026-10-23. Git was initialized only after those initial milestones, so earlier Git provenance is unavailable.

## Restricted demonstration-agent key

The demo agent uses a **separate testnet account** and an `ed25519` function-call key on that account. Its observed onchain permission names only the deployed vault as `receiver_id`, only `request_payment` in `method_names`, and an initial 0.1 test NEAR gas allowance. Calls signed with this key attach **zero NEAR**. The vault separately checks that the transaction predecessor is the mandate's configured agent and enforces its recipient, amount, budget, expiry, nonce, and revocation rules. A key restriction cannot replace the vault's policy checks.

Do not put the owner's full-access key or the agent key in the browser bundle, source tree, or a public endpoint. Keep the agent account's lifecycle full-access key under separate user control; the demo signer must receive only the limited key. The user authorized the restricted-key creation, and the finalized AddKey transaction is `3faZ6WmFDgbM8KUCRnbDLztbYSysKwNGdoq83jy95CaP`. Independently check current finalized testnet permissions with:

```powershell
node --use-system-ca work/verify-agent-key.mjs agentshield-agent-0359da1630bb.testnet ed25519:3mVXz3wwMLhRA1Ppdg56p8K342hTDRAHNVPez7jT5Y6V vault.agentshield-mag-1d2f78801994.testnet
```

The checker is read-only and fails if the key has full access, names a different receiver, permits extra methods, or has a missing, zero, or unlimited gas allowance. It has been unit-tested against permission fixtures; the real key was also verified through finalized RPC and its historical AddKey transaction. NEAR charges the allowance for gas, and an exhausted finite allowance makes the key unusable; adding balance to the account does not refill it. Rotate by adding a replacement limited key and removing the old one with the agent account's separately held full-access key. Also revoke the vault mandate to stop future requests at the contract layer, after an explicit plan because revocation is permanent for this vault. A function-call key cannot transfer NEAR, add keys, or attach a deposit. This vault currently has **zero access keys**, and the deployed contract interface has no upgrade method. These observations show no direct signing or contract-method upgrade route in the current configuration; they are not a formal immutability proof. The owner controls policy through contract methods.

## Evidence states

- **PREFLIGHT_BLOCK / WARN** is an offchain decision. No transaction reached the vault.
- **CONTRACT_REJECTED** requires a signed, finalized `request_payment` transaction and a matching vault decision or failure with no payout receipt.
- **EXECUTED / PENDING** means the request reached the vault but settlement is not independently verified. The vault's initial `AUTHORIZED` result is insufficient.
- **SETTLED** requires finalized transfer and callback receipts plus matching `get_request` and `get_vault_status` accounting. If any evidence is missing or inconsistent, show **INCONCLUSIVE**.

The current interface has the Instant Demo, read-only testnet account checks, and live Evidence view. The Evidence view rechecks one settled payment and three contract rejections against public Testnet RPC; revocation is labeled unverified. No NEAR AI inference has run.

## Later checkpoint: revocation and NEAR AI

An isolated Testnet revocation vault was proposed to preserve the original live demo. Its first deployment transaction `EvLkrsDS7XuYGpZ9knasYVGRMQEnK4sc2jrPi7hzqNdi` finalized **FAILED** at `initialize`, because a custom domain was passed to a contract that only accepts `agentshield:testnet:v1`. Finalized RPC confirmed the account remained absent and the 4 test NEAR funding was not transferred. The user stopped the revocation lab after this failure. Do not run its corrected deployment or later stages without fresh user direction. The offchain key generated for that unused lab has no onchain permission and remains outside this repository.

The local NEAR AI module and CLI prepare unsigned proposals only. `npm run test:ai` passes five tests, including a mocked prompt-injection redirect that the offchain policy blocks. `node --use-system-ca work/prepare-near-ai-payment.mjs --check-policy` checks the actual finalized vault state and produced ALLOW, WARN, and BLOCK. The user added a key to ignored `.env`. The first user-authorized, 180-output-token-capped NEAR AI Cloud request returned HTTP 402 on 2026-11-02; no model completion was received and the second prompt-injection request was not sent. NEAR AI Cloud credits are required before retrying. No attestation verification or AI-signed payment has occurred.

## Vercel deployment

The production site is [agentshield-lab.vercel.app](https://agentshield-lab.vercel.app/), under Vercel project `xreyys-projects/agentshield`. `vercel.json` builds the existing wallet bundle and publishes `outputs/agentshield-ui`; `api/testnet/` contains read-only functions for status, account, payment proof, and negative-proof gallery. The functions include only public proposal and evidence records and recheck finalized public RPC before returning success. The NEAR AI key and testnet signing keys are not deployed. Vercel project linking created ignored `.vercel/` and `.env.local` files; do not commit or print their contents.

The final Vercel production deployment `dpl_9uurMdDz7wEx6pQaBzohkDzZfXb9` returned READY. Public checks of the short domain confirmed the corrected Lab copy and footer, `/api/testnet/proof` PASS with SETTLED and the expected code hash, and `/api/testnet/gallery` 3/3 PASS. The first deployment's authenticated `/api/testnet/status` check returned healthy Testnet state; the public production domain returned HTTP 200 without an authentication bypass. Local Vercel route tests passed 2/2; simulator 7/7, key-scope 2/2, and NEAR AI mocked tests 5/5 were rerun. Wallet choices loaded Meteor and HOT in the local browser, but no sign-in was attempted.

For local NEAR AI inference later, use the ignored `.env` with `NEAR_AI_KEY` and run Node with `--env-file=.env`. Alternatively, save the key at `C:\Users\USER\Documents\Codex\AgentShield-Secrets\near-ai-api-key.txt` outside the repository and set `$env:NEAR_AI_KEY_FILE` to that path. The deployed site does not call NEAR AI and does not need an environment variable. If a server-side inference route is added later, configure `NEAR_AI_KEY` as an encrypted server-side Vercel environment variable; never add a `VITE_`, `NEXT_PUBLIC_`, or other browser-exposed prefix.
