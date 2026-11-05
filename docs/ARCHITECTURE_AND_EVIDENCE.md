# AgentShield architecture and evidence

## Trust boundaries

```mermaid
flowchart LR
  Human[Owner, signing on own machine] -->|owner-only set_mandate / pause / revoke| Vault[NEAR Testnet vault]
  Instruction[Untrusted payment instruction] --> Model[NEAR AI Cloud proposal]
  MCP[MCP client: Claude, Codex] -->|tool call| Preflight
  Model -->|strict JSON, unsigned| Preflight[Offchain guard: vault preflight + counterparty check]
  RPC[Finalized public NEAR RPC] --> Preflight
  Preflight -->|ALLOW only; exact future authorization required| Agent[Restricted agent key]
  Preflight -->|WARN| HumanApproval[Human review via MCP elicitation]
  Preflight -->|BLOCK| Stop[No signature]
  Agent -->|zero deposit, request_payment only| Vault
  Vault -->|contract policy permits| Recipient[Allowlisted recipient]
  Recipient -->|transfer outcome| Callback[Vault callback and request record]
  Vault --> Proof[Read-only Vercel proof functions]
  RPC --> Proof
  Proof --> Browser[Evidence view]
```

The site has no wallet connection: owner actions are signed on the owner's own machine, as the 3 Nov renewal was. NEAR AI Cloud (`z-ai/glm-5.3-flash`) ran twice on 2026-11-04, every reply signed by the attested model key. In run 1 a 180-token limit cut off 22 of 24 replies and the preflight blocked them, so the model-to-preflight edge failed closed. Run 2 (22 completions, 1,024-token limit) returned complete answers: the model ignored the injected note, 11 of 19 red-team attacks returned the original payment, 4 returned empty fields, 4 ran out of tokens, none proposed the attacker's account or amount, and 0 escaped. NEAR AI's official verifier passed the Intel TDX and NVIDIA GPU attestation for the signing key; image provenance and TLS binding were not checked. The site's one inference endpoint, the live model box (`api/live/injection.js`), returns only the parsed recipient and amount and never signs. The deployed site only reads public RPC (archival nodes for transactions older than about 2.5 days); no signing credential is on Vercel. The restricted function-call key is limited to the vault's `request_payment` method, has a finite gas allowance, and cannot attach deposit. The vault still checks agent identity, allowlist, caps, budgets, expiry, nonce, and revocation. Its callback records settlement after the transfer outcome. A key restriction is a second boundary, not a substitute for contract checks.

## Evidence ladder

| Claim | Required evidence | Current state |
| --- | --- | --- |
| Simulator decision | Deterministic local run | Seven local simulator tests pass; **simulation only** |
| Offchain AI preflight | Genuine model response plus finalized policy read | Mocked AI tests pass; read-only ALLOW/WARN/BLOCK policy check passed; Run 1: 24 signed replies, 22 cut off and blocked. Run 2: 22 signed complete replies, model resisted the demo injection, 0 of 20 red-team cases escaped |
| Counterparty check | Live finalized account state plus the live mandate allowlist | Read-only API live; `tests/counterparty.test.mjs` blocks every redirect target from the 19 recorded injections; offchain and advisory |
| MCP payment tool | Official MCP client, guarded signing, then a finalized Testnet call | Protocol, refusals, human approval and the exact signed request tested with the official SDK client and a stand-in signer. One finalized, settled Testnet payment through the tool ([`HP3Bfd…uGuRk`](https://testnet.nearblocks.io/txns/HP3BfdWLDaACqKV9fZb4WKmTyKp5vfa5fEs7bncuGuRk), the `ALLOW` path) independently checked |
| Contract rejection | Finalized signed call, contract rejection, zero payout receipts | Eight public Testnet transactions independently checked: three under mandate version 1, four probes under version 2 declared with their expected reasons before signing, and the revocation probe on the lab vault |
| Authorized call | Finalized `request_payment` and decision log | Two public Testnet transactions independently checked |
| Completed settlement | Exact successful recipient transfer receipt, callback log, `SETTLED` request record | Two public Testnet transactions independently checked |
| Live revocation | Separate approved owner revoke and post-revoke agent probe | On Testnet, on the separate lab vault `revocation.agentshield-mag-1d2f78801994.testnet`: deploy [`9tA4jG…w8rYK`](https://testnet.nearblocks.io/txns/9tA4jGgVEJRznKZUNMVEUC37L6Vjaez9MSf59x7w8rYK), key [`AzacRX…6nxf`](https://testnet.nearblocks.io/txns/AzacRXZCRySBy1FrbF9mQtrzMC7uisqwpMay1PRJ6nxf), mandate [`2kgPwV…9s`](https://testnet.nearblocks.io/txns/2kgPwVdrkSUMStnGaPcQNfuJBK9XMfySGdSyB9uULr9s), revoke [`mLpEnE…bJF`](https://testnet.nearblocks.io/txns/mLpEnEMYF5j3dpHNqdNshnaGDNJb44UBLCZjy6QhbJF), refused request [`Gy4b3k…o3gF`](https://testnet.nearblocks.io/txns/Gy4b3k2vwHEM9bqBuWxAX5pfsYRhFsNVJb5e9w8wo3gF) `REVOKED`, all rechecked from archival nodes. Also NEAR Sandbox `revocation prevents new payments after settlement` |

## Public Testnet references

| Event | Transaction / record | What to inspect |
| --- | --- | --- |
| Vault deployment | [`7K4729…y2dJ`](https://testnet.nearblocks.io/txns/7K4729h6zNHjuXJcGRT9e6HHGxCrUnzFAZ3AnQpfy2dJ) | Create, fund, deploy, initialize; code hash `2KHm9Waz7fQfQ2A1MWmHhVSwx7o7sm8p1KXBTVyggCqN` |
| Restricted key | [`3faZ6…5CaP`](https://testnet.nearblocks.io/txns/3faZ6WmFDgbM8KUCRnbDLztbYSysKwNGdoq83jy95CaP) | Receiver vault, sole method `request_payment`, finite allowance |
| Original mandate | [`GLhrrb…xbG7`](https://testnet.nearblocks.io/txns/GLhrrbxzn93YVKhq6JAxogNW27jf19XqfkfqAJdmxbG7) | Version 1, one agent, one recipient, .01/.02/.05 caps |
| Mandate renewal | [`EuUUbL…vJXw`](https://testnet.nearblocks.io/txns/EuUUbLWvPUVVB2q7AiEVGe54giZaarzBy2hikX74vJXw) | Version 2, same agent, recipient and caps, expiry 2026-11-30 00:00 UTC |
| Settled payment | [`3buDvB…53jm`](https://testnet.nearblocks.io/txns/3buDvBXKDHcCe9VBNtLSSp4H7LLjLfGk7K4XT2jh53jm) | .005 test NEAR, version 1, zero deposit, restricted signer |
| Recipient transfer | `76hE3jsBgdCi8BCBZakcwEMri9Ut7JVu2gDWf3rxK2dS` | Successful receipt within payment transaction; callback `SETTLED` |
| Per-payment cap | [`FEfj7K…L8A`](https://testnet.nearblocks.io/txns/FEfj7KyY5Cr7NTrhDZdXt8Hi1rQqqMwznvK1KhL1ZL8A) | `PER_PAYMENT_LIMIT`; zero vault transfer receipts |
| Unauthorized recipient | [`GvMLEq…gDX9`](https://testnet.nearblocks.io/txns/GvMLEqPTLZfnN4cTVVBS6mKghD7LuTpXgH7ZSAQvgDX9) | `RECIPIENT_NOT_ALLOWED`; zero vault transfer receipts |
| Replay | [`8ktDr3…yjY`](https://testnet.nearblocks.io/txns/8ktDr3AFxE8kVQP1KNkvGBY44oMWWvRCY6tXUqWyvyjY) | `REPLAY`; zero vault transfer receipts |
| Payment through the MCP server | [`HP3Bfd…uGuRk`](https://testnet.nearblocks.io/txns/HP3BfdWLDaACqKV9fZb4WKmTyKp5vfa5fEs7bncuGuRk) | .005 test NEAR, version 2, restricted signer; transfer receipt `FjDMy7kQhdhsTKPsUhJrqDFBf4TqW2mx8m8McqMqREUe`; callback `SETTLED` |
| Stale mandate version | [`8Gdi8i…781A`](https://testnet.nearblocks.io/txns/8Gdi8iAgzX84jHhUQRtRQTe958m4pSuDCkTyHefz781A) | `STALE_VERSION` (named version 1 after the renewal); zero vault transfer receipts |
| Expired request | [`EMe28N…2m9d`](https://testnet.nearblocks.io/txns/EMe28NDXmbFCPiSuVevKvfpkShaDL8BUdPahaKT62m9d) | `EXPIRED`; zero vault transfer receipts |
| Look-alike recipient | [`2dBDby…ojgX`](https://testnet.nearblocks.io/txns/2dBDbyg296vJv17SJ2xHP3aymFqDcGCHFCDdzRViojgX) | `RECIPIENT_NOT_ALLOWED` for `…1o77`; zero vault transfer receipts |
| Wrong signer | [`8VzQjR…NXrE`](https://testnet.nearblocks.io/txns/8VzQjR1RhRCDgjaXUZMhUL3zZtHdhk5k6ZZUHuF4NXrE) | `WRONG_AGENT`, signed by the owner's account; zero vault transfer receipts |
| Revocation lab | [`9tA4jG…w8rYK`](https://testnet.nearblocks.io/txns/9tA4jGgVEJRznKZUNMVEUC37L6Vjaez9MSf59x7w8rYK), [`AzacRX…6nxf`](https://testnet.nearblocks.io/txns/AzacRXZCRySBy1FrbF9mQtrzMC7uisqwpMay1PRJ6nxf), [`2kgPwV…9s`](https://testnet.nearblocks.io/txns/2kgPwVdrkSUMStnGaPcQNfuJBK9XMfySGdSyB9uULr9s) | Separate vault `revocation.agentshield-mag-1d2f78801994.testnet`, same code hash, its own restricted key and mandate |
| Revoke and refused request | [`mLpEnE…bJF`](https://testnet.nearblocks.io/txns/mLpEnEMYF5j3dpHNqdNshnaGDNJb44UBLCZjy6QhbJF), [`Gy4b3k…o3gF`](https://testnet.nearblocks.io/txns/Gy4b3k2vwHEM9bqBuWxAX5pfsYRhFsNVJb5e9w8wo3gF) | Version 1 → 2 and `revoked`; then `REVOKED` with zero vault transfer receipts |

The explorer blocked automated HEAD requests with HTTP 403 on 2026-11-02, so its page availability is not claimed. The [production payment proof](https://agentshield-lab.vercel.app/api/testnet/proof) and [rejection gallery](https://agentshield-lab.vercel.app/api/testnet/gallery) returned PASS against public RPC. The local verifier scripts recheck final execution, exact actions, receipts and contract records without relying on explorer rendering. Historical payment proof remains tied to mandate version 1 after any later renewal.

**Source to bytecode:** `work/reproduce-vault-wasm.ps1` rebuilds `contracts/vault` with Rust 1.96.0 on Windows and gets the same 324,708-byte WASM (SHA-256 `138b17e7…be09`) that is deployed. CI runs it on every push.
