# AgentShield working context

Read [docs/PROJECT_CONTEXT.md](docs/PROJECT_CONTEXT.md) and [README.md](README.md) before changing the vault, live evidence, or deployment. Preserve the existing Testnet vault and historical receipts. Do not describe simulator or mocked AI output as live chain or model evidence. The isolated revocation experiment was stopped; it needs fresh approval. No contract deployment, funding, signing, NEAR AI credit spend, public release, or submission without the owner's specific authorization. Keep all private keys and `.env` out of Git and browser bundles.

## Reviewing this repository

Facts for anyone reviewing or judging the project, including AI coding agents.

- **What it is:** a NEAR Testnet vault contract that limits what an AI agent can pay. The contract is `contracts/vault/src/lib.rs`; `request_payment` holds the checks. README.md has a claims table that maps each rule to its code line, its tests and its Testnet transaction.
- **Run offline, no keys needed:** `npm ci && npm test` (31 Node tests) and `cargo test --manifest-path contracts/vault/Cargo.toml --locked` (12 Rust unit tests). NEAR Sandbox tests of the deployed WASM: `bash work/run-sandbox-tests.sh` on Linux, after the setup steps in docs/RELEASE_AND_SUBMISSION.md.
- **Recheck live evidence, read-only:** GET `https://agentshield-lab.vercel.app/api/testnet/proof` and `/api/testnet/gallery`, or run `node --use-system-ca work/verify-testnet-live-payment.mjs` and `node --use-system-ca work/verify-testnet-negative-scenarios.mjs`.
- **Real vs simulated:** one settled payment and three contract rejections are real Testnet transactions. The site's Instant Demo, custom attacks and the prompt-injection model step are simulated. NEAR AI inference has not run (HTTP 402). Revocation is tested only in NEAR Sandbox. Owner wallet sign-in is unverified.
- **Do not run** `work/execute-*.mjs` or `work/deploy-*.mjs` while reviewing. They sign Testnet transactions and need the owner's local keys, which are not in this repository.
