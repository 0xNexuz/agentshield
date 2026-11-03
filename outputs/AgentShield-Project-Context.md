# AgentShield portable project context

**Updated:** 2026-11-02. **Status:** TESTNET VAULT, SETTLED RESTRICTED-AGENT PAYMENT, AND THREE CONTRACT REJECTIONS INDEPENDENTLY VERIFIED. **Current stage:** Live Lab revocation plan, NEAR AI integration, and QA.

## Identity and Git

- Repository: private `https://github.com/0xNexuz/agentshield`, explicitly selected by the user. Local `main` and remote `main` both point to initial commit `e3187a9a41936848484151396b4b380d14c3f375`, independently checked through GitHub API. The signing key folder is outside this workspace and ignored patterns cover accidental local key files. Earlier work predates Git initialization, so Git history cannot prove its original creation dates.
- The user approved the initial vault deployment, the restricted key, owner mandate, one 0.005 payment, and three exact negative Testnet probes. A later isolated revocation plan was approved, but its first deployment failed and the user explicitly stopped that lab; no further revocation action is authorized. Mainnet actions, submission, and further spending remain outside the authorized scope.
- The user also authorized a private GitHub push and selected `0xNexuz/agentshield`; the initial verified checkpoint was pushed on 2026-11-02. The staged-file scan found no secret key material or credential files. Later work needs its own commit and push to reach GitHub.

## Competition

- NEAR HACKATHON; 1 Nov 2026 00:00 UTC to 14 Nov 2026 23:59 UTC; AI Security & Defense primary; Agent Economy and Autonomous Business secondary.
- Official sources: https://nearhackathon.com/ and https://nearhackathon.com/HACKATHON.md . Neither source states a mainnet-only prototype requirement. Its mainnet-account requirement concerns prize payout. The official announcement is dated 2026-10-19, and the event page says code written since announcement counts; the documented AgentShield timeline begins 2026-10-23. There is no immutable Git provenance yet.

## Decisions

### 2026-10-23 — First executable security boundary

- **Decision:** PROPOSED NEAR testnet contract-controlled native NEAR vault, one agent and one payment type first.
- **Reason:** The same onchain component can enforce policy and control funds. No general-purpose signing path or Intents-mainnet dependency is needed for the first proof.
- **Alternatives:** Chain Signatures, Shade Agents, Intents, backend signer; deferred because arbitrary signing, TEE trust, mainnet-only Intents or backend-key custody would expand risk.
- **Evidence:** NEAR function-call key, Shade Agents and Intents documentation cited in the research file.
- **Impact:** Narrower MVP; precise testable authorization claims.

### 2026-10-23 — Eligibility boundary

- **Decision:** Do not begin submission-specific implementation before 1 Nov or organizer clarification.
- **Reason:** Official site says build during the hackathon; pre-existing-code details are unknown.
- **Impact:** This package is preparation, not a hackathon build claim.

### 2026-10-26 — Frontend exploration

- **Decision:** IMPLEMENTED a standalone, pre-event interface preview in `outputs/agentshield-ui/` without wallet or contract integration.
- **Reason:** User explicitly requested UI and frontend work; prototype stays separate from any future submission repository while pre-existing-code rules remain unknown.
- **Impact:** Brand direction and four product surfaces can be reviewed now. Reuse in a submission is not assumed eligible.

### 2026-10-26 — Reference-led visual revision

- **Decision:** REVISED the standalone frontend to use a newly generated single artwork merging the user's crowned guardian, winged statue, and robotic hand references. The first three-panel treatment was rejected by the user and replaced.
- **Reason:** The user clarified that the references should become one new artwork and one cohesive visual language.
- **Impact:** The hero, navigation, mechanism, mandate form, evidence view, and owner controls share the same Gothic monochrome direction. The underlying local-only product boundaries remain explicit.

### 2026-10-26 — NEAR mark and read-only mainnet validation

- **Decision:** REPLACED the hero globe with a NEAR Protocol mark, refined against the NEAR organization's logo. BEGAN mainnet validation with read-only RPC health and public account queries.
- **Reason:** The user asked for the visual change and for mainnet testing after checking hackathon network rules.
- **Evidence:** `outputs/AgentShield-Mainnet-Smoke.md` records a synced mainnet RPC response and `wrap.near` account query. No account was created, wallet connected, transaction signed, or funds moved.
- **Impact:** Mainnet connectivity is verified. AgentShield's contract behavior remains untested until there is a contract and a funded, user-controlled test account.

### 2026-10-26 — Footer correction and read-only testnet setup check

- **Decision:** RESTORED all three original footer lines and added `built by @magnum inc.` as a fourth item. IMPLEMENTED a fifth UI view that checks public NEAR testnet health and finalized owner, agent, recipient, and optional vault accounts through a fixed local read-only RPC proxy.
- **Reason:** The user corrected the footer replacement and asked to test on NEAR testnet before full deployment.
- **Evidence:** `outputs/AgentShield-Testnet-Check.md` records live status, known and absent account checks, local API responses, and limits. No account was created and no transaction was signed or sent.
- **Impact:** Account and network readiness can be tested in the preview. Vault enforcement, payments, revocation, wallet signing, and deployment remain unimplemented and unverified.

### 2026-10-26 — Lab naming and account onboarding

- **Decision:** RENAMED the fifth navigation item to `Lab` and the section headline to `The test lab.` Added role-by-role instructions and links to NEAR's testnet wallet and CLI account guide.
- **Reason:** The user asked where the example account IDs come from and requested `Lab` or `Test environment` instead of `Testnet 05` as the header.
- **Impact:** The UI now says that owner, agent, and recipient IDs are separately created public accounts; the vault field can stay blank until deployment. No wallet integration or account creation was added.

### 2026-10-27 — Verifiable Security Lab expansion and eligibility gate

- **Decision:** PLANNED the contract-backed Instant Demo and Live NEAR Testnet Security Lab in `outputs/AgentShield-Security-Lab-Implementation-Plan.md`; no implementation or deployment was performed.
- **Reason:** The user's pasted Security Lab directive requests a full verifiable build but explicitly requires an architecture and detailed plan without potentially ineligible development when pre-event eligibility is unresolved. The official site says “Build your project during the hackathon”; the live `HACKATHON.md` has no explicit pre-existing-code rule.
- **Architecture:** Proposed owner-controlled vault per owner, separate restricted agent, contract reserve/callback, wallet-approved setup and small testnet funding, finality-aware independent evidence verification, five live adversarial tests, and a plainly labeled local simulation.
- **Impact:** The current UI remains a read-only preview. The plan is ready for implementation after organizer clarification or the 2026-11-01 00:00 UTC start, with repository creation and external actions separately authorization-gated.

### 2026-10-27 — User-authorized local build

- **Decision:** The user explicitly authorized doing all implementation and tests locally before any GitHub push. This supersedes the earlier implementation pause for the local workspace, while pre-existing-code eligibility remains unresolved for submission reuse.
- **Implemented:** Added the Instant Demo simulator, five interactive scenarios, and a NEAR native-token vault contract with owner policy, caps, expiry, nonce replay protection, pending spend accounting, callback settlement, pause, revoke, and guarded withdrawal. Added a Wallet Selector testnet adapter and connection UI; wallet sign-in and transaction signing are not yet browser verified.
- **Evidence:** Seven Node simulator tests pass. Eight Rust contract unit tests pass. Release WASM build succeeds; artifact `contracts/vault/target/wasm32-unknown-unknown/release/agentshield_vault.wasm` is 324,708 bytes with SHA256 `B82BBDF9F75A6085D61D0EB3EC2A0DD553935AC6FE43679E094462185F267386`. `npm run build:wallet` succeeds, producing a local browser bundle. Browser checks before the latest wallet edit verified the five Instant Demo results and responsive layouts. The preview currently serves HTTP 200, but the in-app browser failed to attach to a refreshed localhost tab, so the new wallet dialog has not been browser tested.
- **Limits:** Contract unit tests use a mocked runtime, not a local NEAR Sandbox. No testnet accounts or vault were created, no contract deployed, no wallet connected, and no live signed payment or finalized receipt verified. The UI must not label the simulator as onchain proof. The vault accepts at most 64 requests for its lifetime and requires a 0.2 NEAR operating reserve. Deployment must create the vault and initialize it atomically with the owner as predecessor.

### 2026-10-28 — Live testnet verification preparation

- **Decision:** Kept the existing design and simulator. Fixed the browser wallet bundle's missing `global` shim, then required a valid testnet vault ID and scoped the owner wallet sign-in request to that vault's owner methods. No wallet sign-in was attempted.
- **Evidence:** Real in-app browser initially displayed `Wallet setup failed: global is not defined`; after rebuilding, Meteor and HOT appeared without browser errors. Selecting Meteor with no vault ID displayed the expected validation error and did not start a sign-in. `npm run test:sim`: 7 passed. `cmd.exe /c work\run-vault-tests.cmd`: 10 passed, 0 failed; new tests cover funding and one-time successful settlement accounting. `cargo fmt --check` and release WASM build passed. WASM size 324,708 bytes; SHA256 `138B17E7F1A227B22352E2E638FD69E60E0AD95F7A4DD003D8CBD244F8FFBE09`; expected NEAR base58 code hash `2KHm9Waz7fQfQ2A1MWmHhVSwx7o7sm8p1KXBTVyggCqN`, independently recomputed with `bs58`.
- **Deployment preparation:** Added public-ID-only `deployment/testnet.example.json` and `work/prepare-testnet-deployment.mjs` to validate distinct owner, agent, recipient and fresh owner subaccount vault IDs, positive amounts, reserve, artifact and expected code hash. A dummy validation file was tested offline and removed. No actual account IDs have been entered; no account availability check, deployment or payment has occurred.
- **Blockers:** NEAR Sandbox could not run on this Windows host: Windows is unsupported by the Sandbox binary, with no WSL distribution or Docker runtime available. Mocked unit tests do not establish Sandbox or live chain behavior. The official event page still says to build during the hackathon; reuse of pre-event code for submission remains unresolved. No deployed code hash, signed transaction, finalized receipt, settlement or five live security scenario result exists.

### 2026-10-31 — Approved Linux runtime setup attempt

- **Authorization:** The user approved proceeding with Linux runtime setup and NEAR Sandbox tests. This does not authorize testnet deployment, spending, publishing, or pushing.
- **Attempt and result:** `wsl.exe --version` succeeded and reported WSL 3.0.3. `wsl.exe --list --verbose` failed with `Wsl/EnumerateDistros/Service/E_ACCESSDENIED` in the sandbox. Automatic approval review rejected an unsandboxed WSL check because escalated shell commands are disabled for this session. A direct `wsl.exe --install --distribution Ubuntu --web-download --no-launch` attempt in the sandbox exited 1 with `Wsl/E_ACCESSDENIED`. No Linux distro installation or Sandbox test is verified.
- **Next boundary:** An elevated PowerShell session outside this restricted environment must install or expose a WSL2 Ubuntu distribution, or a supported Linux/macOS runtime must be supplied. Recheck `wsl --list --verbose` and run the Sandbox integration matrix before treating contract behavior as runtime verified.
- **User-provided setup evidence:** An elevated PowerShell screenshot shows Ubuntu download began, but distro registration failed with `HCS_E_HYPERV_NOT_INSTALLED` because WSL2 virtualization was unavailable. `wsl.exe --install --no-distribution` then reported success, while `wsl --list --verbose` reported no installed distributions. Restart Windows to activate the feature, verify firmware virtualization, and retry Ubuntu installation before running Sandbox. The restricted executor could not query CPU virtualization or Windows feature state because those reads require elevation.

### 2026-10-31 — Official Track 06 alignment

- **Decision:** Preserve the contract-first Balanced AgentShield. The official Track 06 example supports spending limits, policy engines and function-call keys; its standalone reputation service is not adopted. Account-history scoring, shared blocklists and TEE verification remain deferred.
- **Verification:** Re-ran seven simulator tests and ten mocked Rust vault tests: all passed. Formatting and offline release WASM build passed; SHA256 remains `138B17E7F1A227B22352E2E638FD69E60E0AD95F7A4DD003D8CBD244F8FFBE09`. Added a read-only public-key permission checker for an agent key restricted to the vault and `request_payment` with finite gas allowance. Two fixture tests passed. No real agent key was queried, created or used.
- **Evidence and gates:** Documented distinct preflight, contract rejection, pending execution, and settled evidence states in `LOCAL_DEVELOPMENT.md`; current UI still has only simulation and public account checks. NEAR Sandbox remains blocked by disabled firmware virtualization in the user's screenshot. No live contract, receipt, payment, five-scenario live runner, or NEAR AI agent exists. The user-supplied phase order defers NEAR AI and prompt-injection demonstration until live payment and independent evidence verification work.
- **Eligibility correction:** The current official event page says code written since the announcement counts; its announcement date is not established in this workspace. Pre-event file timestamps alone do not settle eligibility. See `outputs/AgentShield-Track-06-Alignment.md` for the implementation matrix and exact checkpoint.

### 2026-10-31 — WSL2 and local NEAR Sandbox verification

- **Runtime:** The user enabled virtualization. An approved WSL check confirmed Ubuntu 26.04.1 running under WSL2. Locally installed Node 24.22.2 and NEAR Sandbox 2.13.4 under ignored `.tools/`; no system packages or credentials were needed. The first Sandbox 2.6.2 run failed with `PrepareError: Deserialization`, consistent with its older protocol and the NEAR SDK 5.29.1 contract. Sandbox 2.13.4 reports protocol 86 and executes the artifact.
- **Executable evidence:** `sandbox/vault.test.mjs` against the actual release WASM: six scenario subtests plus parent passed, zero failed. Checks cover owner funding and owner-only authorization; settled transfer with recipient balance and vault accounting; wrong agent, disallowed recipient, per-payment cap and replay rejection; failed transfer receipt and callback with reservation released; revocation; two concurrently submitted agent-key requests sharing a daily budget; pause, stale version, expired request, and settled owner withdrawal. The test asserts the local deployed account's code hash equals `2KHm9Waz7fQfQ2A1MWmHhVSwx7o7sm8p1KXBTVyggCqN`. Sandbox transaction IDs are local only and not Testnet evidence.
- **Remaining local gap:** No deterministic test yet exercises a withdrawal while a payment callback is still pending. No public Testnet vault, function-call key, signed payment, or receipt verification exists. The user has not authorized deployment or spending.

### 2026-11-01 — Wallet browser preflight

- **Build:** `npm run build:wallet` succeeded when run with workspace access. The first restricted-executor attempt failed because esbuild could not read its entry files; this was an executor access issue, not a source build failure.
- **Browser:** Local preview returned HTTP 200. In the in-app browser, the Connect Wallet dialog loaded both Meteor and HOT. Selecting Meteor with no vault ID displayed `Connection failed: Enter a valid testnet vault account in the Lab first.` No wallet authorization page opened, account connected, or transaction submitted. Browser console-log inspection could not be completed because automatic permission review timed out; this does not change the observed dialog result.

### 2026-11-01 — Dedicated Testnet owner account

- **Authorization:** The user explicitly asked us to create a Testnet account and store its key. This did not authorize vault deployment, payments, or Git publishing.
- **Account:** The official NEAR Testnet faucet returned HTTP 200 for `agentshield-mag-1d2f78801994.testnet`. A separate finalized Testnet RPC query confirmed the account exists at block 275788295 with 10 test NEAR, and its `ed25519:A5dmTvsTjpkVEWgeQGbFKfxP6XKgJW1Vkgq8W6LTMNzS` access key has `FullAccess` permission. This is an owner key, not an agent key.
- **Credential location:** The owner credential is in a private sibling `AgentShield-Secrets/testnet` folder outside the project. Its local access is restricted. The key was never printed, placed in the frontend, or written to project files. The file uses NEAR JSON credential format and must be backed up privately by the user.
- **Limits:** No vault, agent, or recipient account was created. No deployment, payment, or signed agent transaction was performed. The faucet response was truncated during logging, so its creation transaction hash was not recorded; the finalized account and key checks provide the independent account evidence.

### 2026-11-01 — Separate role accounts and deployment preflight

- **Authorization:** The user asked us to run the next action after owner account creation. This covered preparing the Testnet roles and local deployment configuration, not vault deployment or payment.
- **Accounts:** Created `agentshield-agent-0359da1630bb.testnet` and `agentshield-recipient-7bb4a0df1077.testnet` through the Testnet faucet. The faucet returned HTTP 200 and transaction references `7QcTADrPApEjVn39e3S6wPanJcgdEQQLEysrgNzy7f7E` and `AmyQVu454cAv6pHiy6wsZi4xdYTaJoSP95aKdU7zf7qN`. Independent finalized Testnet RPC queries confirmed both accounts and their matching full-access public keys. These are lifecycle keys, not a restricted demonstration-agent key. Each private key is in a separate file in the private sibling `AgentShield-Secrets/testnet` folder outside the project.
- **Local configuration:** `deployment/testnet.local.json` now contains only the public role IDs, an unused owner subaccount `vault.agentshield-mag-1d2f78801994.testnet`, and proposed limits of **5 test NEAR** initial vault balance and **0.01 test NEAR** maximum test payment. The file is ignored by `.gitignore`. These amounts are proposals; no owner funds have moved.
- **Preflight evidence:** `node --check` passed for the RPC and deployment scripts. Offline and `--check-live` deployment preflight both passed. Live RPC protocol version 88 reports storage cost `10000000000000000000` yoctoNEAR per byte. The 324,708-byte WASM has estimated code storage cost **3.24708 test NEAR**. After that, the 0.2 NEAR operating reserve, 0.01 NEAR payment maximum, and 0.25 NEAR setup margin, the proposed 5 NEAR leaves **1.29292 test NEAR** headroom. RPC confirmed the proposed vault subaccount does not exist. The expected deployed code hash is `2KHm9Waz7fQfQ2A1MWmHhVSwx7o7sm8p1KXBTVyggCqN` (WASM SHA256 `138b17e7f1a227b22352e2e638fd69e60e0ad95f7a4dd003d8cbd244f8ffbe09`).
- **Negative check:** A temporary 0.5 NEAR funding configuration failed `--check-live` with a calculated minimum of 3.70708 NEAR; the temporary file was removed. This confirms the new code-storage guard catches an underfunded proposal.
- **Eligibility source check:** The official NEAR announcement is dated **2026-10-19** (`https://www.near.org/blog/near-hackathon-build-beyond-boundaries`), and the official event page says code written since the announcement counts (`https://nearhackathon.com/`). AgentShield work documented in this workspace began 2026-10-23, so the pre-November work is not disqualified by the published timing rule. This is an inference from the documented project timeline, not an immutable Git provenance check; there is still no Git repository.
- **Limit:** The storage figure is an estimate from current protocol settings; actual storage, gas, and final balance require receipt/account verification after deployment. No vault, restricted key, payment, or live Lab scenario exists yet. No Git push was made.

### 2026-11-02 — Approved Testnet vault deployment and independent verification

- **Authorization:** The user approved the specific owner-signed atomic deployment described in the previous checkpoint: create `vault.agentshield-mag-1d2f78801994.testnet`, transfer 5 test NEAR, deploy the approved WASM, and initialize the owner/domain. This did not authorize a restricted agent-key transaction or a payment.
- **Transaction:** `7K4729h6zNHjuXJcGRT9e6HHGxCrUnzFAZ3AnQpfy2dJ` on NEAR Testnet, signer `agentshield-mag-1d2f78801994.testnet`. An independent RPC `tx` query with `wait_until: FINAL` confirmed `FINAL`, the exact four actions and amounts, initializer arguments, and two successful execution receipts. Explorer: `https://testnet.nearblocks.io/txns/7K4729h6zNHjuXJcGRT9e6HHGxCrUnzFAZ3AnQpfy2dJ`.
- **State:** Finalized RPC account query reports code hash `2KHm9Waz7fQfQ2A1MWmHhVSwx7o7sm8p1KXBTVyggCqN`, matching the SHA256 of the local 324,708-byte WASM. Vault balance is 5 test NEAR, storage usage 324,984 bytes, storage cost 3.24984 test NEAR, and `get_vault_status` reports 1.55016 test NEAR available after the 0.2 NEAR reserve. It reports owner `agentshield-mag-1d2f78801994.testnet`, domain `agentshield:testnet:v1`, and no mandate. The vault currently has **zero access keys**, and no contract upgrade method was found. This shows no direct upgrade route in the observed configuration, but is not a formal immutability proof. The owner can use the contract's owner methods but does not hold a vault full-access key.
- **Reproducible evidence:** `node --check` passed for deployment and independent verifier scripts. `node --use-system-ca work/prepare-testnet-deployment.mjs deployment/testnet.local.json --check-live` passed before signing; it now correctly reports the account exists if rerun after deployment. `node --use-system-ca work/verify-testnet-vault-deployment.mjs --write-evidence` passed after deployment. Public records are `outputs/testnet-vault-deployment-evidence.json` and `outputs/testnet-vault-independent-verification.json`. The owner key stayed in the separate credential folder and was never printed or bundled.
- **Limits:** No restricted function-call key, mandate, payment, settlement receipt, or five-scenario live Security Lab proof exists yet. No Git push or publication was performed.

## Progress and evidence

### 2026-11-02 — Restricted-key payment and live Evidence view

- **Authorization:** The user approved three exact Testnet transactions in sequence: add one restricted agent key, set the owner mandate, and request one 0.005 test NEAR payment. No other live scenario, revocation, deployment, mainnet action, or Git push was authorized.
- **Key:** `3faZ6WmFDgbM8KUCRnbDLztbYSysKwNGdoq83jy95CaP` finalized. Public key `ed25519:3mVXz3wwMLhRA1Ppdg56p8K342hTDRAHNVPez7jT5Y6V` was verified as a function-call key restricted to `vault.agentshield-mag-1d2f78801994.testnet` and `request_payment`, with initial 0.1 test NEAR gas allowance. The signing material remains in the private sibling `AgentShield-Secrets/testnet` folder outside this workspace.
- **Mandate:** `GLhrrbxzn93YVKhq6JAxogNW27jf19XqfkfqAJdmxbG7` finalized. Owner `agentshield-mag-1d2f78801994.testnet` set version 1 active policy: one agent, one recipient, per-payment 0.01 test NEAR, UTC-day 0.02, total 0.05, expiry `1794216105339870776` ns (2026-11-09 09:21:45 UTC). The onchain view matched every proposed field.
- **Payment:** `3buDvBXKDHcCe9VBNtLSSp4H7LLjLfGk7K4XT2jh53jm` finalized. The restricted key signed `request_payment` with zero attached deposit for 0.005 test NEAR, recipient `agentshield-recipient-7bb4a0df1077.testnet`, nonce `demo4e84dc53cee7c4d226acb4fa`. The exact vault-to-recipient Transfer receipt is `76hE3jsBgdCi8BCBZakcwEMri9Ut7JVu2gDWf3rxK2dS`. Contract decision was AUTHORIZED, settlement callback was SETTLED, request record is SETTLED, confirmed total increased to 0.005, pending is zero, and recipient balance increased by exactly 0.005 test NEAR. No retry was sent.
- **Independent check:** `node --use-system-ca work/verify-testnet-live-payment.mjs` passed against public `EXPERIMENTAL_tx_status` and finalized state, including historical AddKey and mandate actions, exact payment args, transfer action and amount, receipt outcome, logs, current request and accounting. Public proof is `outputs/testnet-live-payment-independent-proof.json`; submitting scripts saved transaction intents and evidence separately. The live `/api/testnet/proof` endpoint re-runs verification, and the existing Evidence view displays the result or VERIFICATION UNAVAILABLE on failure. Local HTTP returned 200 and the browser showed the proof and links. This is one authorized payment, not five completed live attack scenarios.
- **Tests:** Baseline NEAR Sandbox 7/7 and the added restricted-key Sandbox scenario 8/8 passed; Rust vault unit tests 11/11 passed. `node --check` passed for the proposal, execution, independent verifier, preview server, and frontend scripts. An underfunded deployment guard was previously checked as recorded above. The pending-withdrawal success guard is covered by a Rust unit test; a true concurrent Sandbox overlap remains unproven.
- **Remaining:** Live overspend, unauthorized recipient, replay and revocation proofs, real wallet sign-in, NEAR AI agent, and full QA are not complete. Revocation on this vault would permanently stop new requests, so it needs a separate explicitly approved plan. No Git repository, push, or publication exists.

### 2026-11-02 — Three live contract rejections

- **Authorization:** The user separately approved three exact restricted-key Testnet probes: 0.011 test NEAR to the allowlisted recipient, 0.005 to the unlisted owner, and replay of the original settled 0.005 nonce. This did not authorize revocation or another deployment.
- **Finalized results:** Overspend `FEfj7KyY5Cr7NTrhDZdXt8Hi1rQqqMwznvK1KhL1ZL8A` returned `PER_PAYMENT_LIMIT`; unauthorized recipient `GvMLEqPTLZfnN4cTVVBS6mKghD7LuTpXgH7ZSAQvgDX9` returned `RECIPIENT_NOT_ALLOWED`; replay `8ktDr3AFxE8kVQP1KNkvGBY44oMWWvRCY6tXUqWyvyjY` returned `REPLAY`. Each is a finalized signed `request_payment` call from the restricted public key with zero deposit. `EXPERIMENTAL_tx_status` independently confirmed the returned rejection and exact arguments. All three transactions had **zero vault Transfer receipts**; submitting checks observed unchanged confirmed vault accounting and recipient balances. Independent read-only checks passed 3/3 and wrote `outputs/testnet-negative-independent-proofs.json`.
- **Gallery:** `/api/testnet/gallery` re-verifies the three negative proofs on public RPC. The existing Evidence view now shows those and the settled payment without a wallet, and labels revocation `NOT VERIFIED / LIVE`. The local HTTP endpoint returned 3/3 PASS; a browser check showed all four proof cards and the unverified revocation card. No simulated record is presented as onchain.
- **Gate:** The five-scenario Live Security Lab is **4/5**. Revoking the current vault mandate would permanently disable new requests, so an isolated deployment or an approved end-of-demo revocation plan is needed. Real owner-wallet sign-in and NEAR AI are still unverified.

### 2026-11-02 — Isolated revocation attempt stopped

- The user approved a five-transaction isolated revocation demonstration, but its first atomic deployment `EvLkrsDS7XuYGpZ9knasYVGRMQEnK4sc2jrPi7hzqNdi` finalized **FAILED** at action index 3 (`initialize`). The script supplied a custom domain; the compiled contract accepts only `agentshield:testnet:v1`. Public RPC confirmed the isolated vault account does not exist and the 4 test NEAR funding did not transfer. The owner paid only failed-transaction gas. See `outputs/testnet-revocation-deploy-failure.json`.
- The proposal and preflight were corrected locally to require the contract's exact domain, and the corrected script refuses to sign unless it verifies the original failed hash and absent account. The user then explicitly said **stop the revocation lab**. No corrected deployment, agent AddKey, isolated mandate, revoke, or probe transaction was sent. The separately generated offchain key remains in `AgentShield-Secrets/testnet` with restricted ACL and has **never been granted onchain permission**.
- The original demo vault and its mandate remain active. The Live Security Lab is still **4/5**, not complete. Do not resume the isolated lab without fresh user direction.

### 2026-11-02 — Vercel production deployment

- **Authorization:** The user requested a Vercel deployment with a short, memorable URL and asked where to keep the NEAR AI key. No new testnet transaction or inference was authorized or sent.
- **Deployment:** Created Vercel project `xreyys-projects/agentshield`. `vercel.json` builds the existing wallet bundle and serves `outputs/agentshield-ui`; four Node functions under `api/testnet/` expose only read-only status, account, payment-proof, and rejection-gallery checks. The stable public production domain is `https://agentshield-lab.vercel.app/`. Final deployment `dpl_9uurMdDz7wEx6pQaBzohkDzZfXb9` reported READY, target production, and no deployment protection on that domain. Public HTTP checks verified corrected frontend copy and footer, settled payment proof PASS with code hash `2KHm9Waz7fQfQ2A1MWmHhVSwx7o7sm8p1KXBTVyggCqN`, and gallery 3/3 PASS. The first deployment's protected preview route checks also passed; it was replaced by the final production deployment.
- **Local verification:** `node --test tests/vercel-routes.test.mjs` 2/2, `npm run test:sim` 7/7, `npm run test:key-scope` 2/2, `npm run test:ai` 5/5. Browser wallet dialog loaded Meteor and HOT; no wallet sign-in occurred. The prior Rust 11/11 and Sandbox 8/8 remain the latest contract runtime results because contract code did not change.
- **Credential location at that checkpoint:** NEAR AI key was absent. A private sibling `AgentShield-Secrets` folder and `NEAR_AI_KEY_FILE` were suggested. No NEAR AI inference route or key was deployed to Vercel. `.vercel/` and CLI-generated `.env.local` are Git ignored, and `.vercelignore` excludes them from source uploads.
- **Current limits:** Live Security Lab is 4/5; user stopped isolated revocation. Real owner wallet sign-in and NEAR AI inference remain unverified. This production deployment is a frontend/read-only evidence milestone, not a claim of complete live security lab or AI payment agent.

### 2026-11-02 — NEAR AI key and first live call

- The user added a NEAR AI Cloud API key to ignored local `.env`; a non-disclosing presence check and `git check-ignore` passed. The key was not printed, committed, or uploaded to Vercel.
- The user explicitly approved two short inference calls, each capped at 180 output tokens, with no transaction signing. The first normal payment instruction was sent through `work/prepare-near-ai-payment.mjs` and returned **HTTP 402**. No model completion or preflight result was produced from that call. The second prompt-injection call was not sent. NEAR AI's official quickstart requires credits as well as an API key; adding credits is the next external prerequisite. No AI-generated payment, signed transaction, or settlement is claimed.

- Completed: event-page review, primary NEAR technical source review, focused competitor review, proposed architecture/threat model, MVP, milestone and test plan, portable handoff. Brand and UX direction in `outputs/agentshield-ui/BRAND.md`.
- Implemented: standalone HTML/CSS/JavaScript preview with overview, policy draft, live first-payment evidence, owner controls, five-scenario local Instant Demo, Wallet Selector connection UI, and read-only testnet setup check. The policy draft uses browser local storage only. The active hero uses `assets/agentshield-near-composite-v2.png`; source artwork is retained in `assets/`. The public proof is genuine Testnet evidence; the frontend is still a local preview.
- Verified 2026-10-26: `node --check` passed for `app.js` and preview server; local HTTP returned 200 for preview and specification. In the revised interface, browser checks showed the merged artwork and fonts loading, desktop and narrower layouts, navigation among all four views, draft save and clear, empty evidence, and disabled owner controls. No automated visual regression or accessibility audit was run.
- Read-only mainnet RPC status and public account query: passed with certificate verification. The real AgentShield Testnet deployment and payment receipts are recorded above; no mainnet deployment or AgentShield mainnet payment exists. Local simulator and contract unit tests pass as listed above.
- Read-only testnet status and finalized account query: passed for an existing contract account and a missing account. The local API returned live testnet results and rejected malformed IDs. Browser rendering of the new panel was not verified because automatic approval review rejected inspecting an Edge window containing unrelated tabs.
- Remaining gates: test pending-withdrawal overlap in Sandbox; connect a wallet to the actual vault; implement and independently verify the remaining live Lab scenarios; integrate the scoped NEAR AI agent; complete QA and provenance. Keep evidence of code provenance for the eventual submission because this local project is not a Git repository. Mainnet activity requires an exact user-approved scope and spending limit.

## 2026-11-02 final hardening checkpoint

- **Live AI gate:** The existing local `.env` key was checked through NEAR AI's non-inference `/v1/check_api_key` endpoint without disclosing it. HTTP 402 means credits are insufficient or the spend limit blocks requests. The earlier authorized inference also returned 402. No model response exists and no further billable call was made.
- **Current onchain state:** The public production proof and negative gallery returned PASS, code hash `2KHm9Waz7fQfQ2A1MWmHhVSwx7o7sm8p1KXBTVyggCqN`, mandate version 1, expiry 2026-11-09 09:21:45 UTC. The isolated revocation attempt remains stopped and failed; no corrected transaction was sent.
- **Local verification rerun:** Rust 11/11, Sandbox 8/8, simulator 7/7, key-scope 2/2, mocked AI 5/5, Vercel route 2/2, and new historical-proof regression 2/2. `npm run build:wallet`, `node --check` for the touched frontend/verifier, and live payment verification passed. The historical proof now checks original mandate version 1 and finalized receipts without requiring today's pending balance to be zero or today's recipient balance to retain the funds.
- **Browser QA:** In fresh unauthenticated Chrome contexts at 1365×768 and 390×844, the public site loaded without a login. Six navigation headings, live Evidence, the Meteor/HOT wallet dialog, Escape close, keyboard skip link, and no horizontal overflow or page errors passed. No real wallet extension/owner approval was used; sign-in remains unverified.
- **Renewal:** A read-only preflight passed for an **unsigned** `set_mandate` proposal that only extends expiry to 2026-11-15 00:00 UTC. Same owner, agent, recipient and .01/.02/.05 caps; version would become 2. Owner approval/signature and post-transaction verification remain pending.
- **CI and release prep:** A tracked-history secret scanner found zero candidates across the current tracked tree and 3 commits. A GitHub Actions workflow and P7 judge/release materials were prepared locally. CI has not run on GitHub, repository visibility remains private, and no submission or X post has been made. Automated HEAD checks to Nearblocks transaction URLs returned 403; public RPC and Vercel proof APIs supplied the independently verified transaction data.

## Next action

Keep the private repo and public site as-is until reviewed. Confirm NEAR AI Cloud credits/spend limit and obtain fresh bounded inference approval before live model tests. Ask the user to verify owner wallet sign-in without a transaction. Review the exact renewal proposal before 2026-11-09; sign only with specific owner approval. Do not resume isolated revocation without fresh approval. Re-scan all tracked history and review documentation before any separately approved public release or submission.
