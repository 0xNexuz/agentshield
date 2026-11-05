# AgentShield project context

Current state, for anyone continuing the work. [README.md](../README.md) has the full evidence and [ARCHITECTURE_AND_EVIDENCE.md](ARCHITECTURE_AND_EVIDENCE.md) every Testnet reference.

- **Main vault:** `vault.agentshield-mag-1d2f78801994.testnet`, mandate version 2, active until 2026-11-30 00:00 UTC. Two settled payments (one made through the MCP server) and seven contract rejections are recorded against it.
- **Revocation lab:** `revocation.agentshield-mag-1d2f78801994.testnet`, revoked on 2026-11-05. Its refused request is the eighth rejection. It stays revoked; on this contract a revoked mandate cannot be replaced.
- **NEAR AI:** two recorded runs on 2026-11-04 (`outputs/near-ai-*.json`); run 2 has complete signed answers and 0 of 20 red-team cases escaped. The live model box on the site runs while the prepaid credit lasts.
- **Checks:** CI runs the Node, Rust and NEAR Sandbox tests and rebuilds the deployed WASM (`MATCH`); the `Live evidence` workflow rechecks every Testnet proof daily.
- **Not on Testnet:** the daily and total budget limits, an owner withdrawal in flight, pause on its own, and the MCP server's `WARN` and `BLOCK` paths. All are covered by tests.
- **Rules:** no deployment, funding, signing, NEAR AI credit spend or submission without the owner's specific approval. Keys stay outside the repository.
