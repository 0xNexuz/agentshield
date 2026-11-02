# AgentShield mainnet read-only smoke check

**Date:** 2026-10-26. **Scope:** public NEAR mainnet reads only. No wallet, signing, deployment, deposit, or transfer.

## Hackathon network rule

The [official event page](https://nearhackathon.com/) asks for a working prototype built on NEAR and does not specify mainnet-only execution. The [official HACKATHON.md](https://nearhackathon.com/HACKATHON.md), fetched on 2026-10-26, calls for a mainnet NEAR account **for prize payout**, not a mainnet deployment of the project. It contains no testnet prohibition or mainnet-only prototype requirement. The event page says development starts 2026-11-01 00:00 UTC.

This is a reading of the published material on the date above; recheck it before submission. NEAR's [Intents FAQ](https://docs.near.org/chain-abstraction/intents/faq) separately says Intents has no testnet deployment. AgentShield's proposed first vault path is native NEAR, rather than an Intents integration.

## Live checks performed

Ran `work/mainnet-status-check.mjs` with certificate verification enabled (`NODE_TLS_REJECT_UNAUTHORIZED=1` and Node `--use-system-ca`). The script reads `https://rpc.mainnet.near.org/status` and sends a `view_account` JSON-RPC request for the public `wrap.near` account.

| Check | Observed result |
| --- | --- |
| Chain ID | `mainnet` |
| RPC node syncing | `false` |
| Latest block | height `221724327`; time `2026-10-26T18:12:45.887138287Z`; 2 seconds old at check |
| Public account query | `wrap.near` returned at block `221724331` with code hash `DL2f5xmZ44cQRP6vBMt94rvseH5d5KKnAGis2WkTAsh1` |

The checks demonstrate live read-only mainnet reachability and account query behavior. They do **not** test AgentShield's mandate enforcement, because no vault contract or wallet connection exists yet.

## Reproduce

From the workspace root in PowerShell:

```powershell
$env:NODE_TLS_REJECT_UNAUTHORIZED = '1'
node --use-system-ca work/mainnet-status-check.mjs
```

The next product-level milestone is a contract and tests for the owner, agent, amount, recipient, budget, expiry, replay, pause, and revoke boundaries. Any mainnet deployment or value-moving test would need a separate test account, an explicit spending limit, and user approval of the exact transaction.
