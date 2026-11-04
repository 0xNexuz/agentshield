#!/usr/bin/env node
// AgentShield MCP server (stdio). Lets an AI agent such as Claude or Codex check and request
// payments through the AgentShield vault on NEAR Testnet.
//
//   node --use-system-ca mcp/agentshield-mcp.mjs
//
// Without AGENTSHIELD_AGENT_KEY_FILE it is read-only (status and dry-runs). With it, the payment
// tool signs request_payment using that restricted key. Keep the key file outside this repository.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMcpServer } from './server-core.mjs';
import { createAgentShieldTools } from './agentshield-tools.mjs';
import { createRestrictedSigner } from './near-signer.mjs';
import { createVaultReader, VAULT } from '../work/vault-reader.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') {
  process.stderr.write('agentshield-mcp: TLS verification must be enabled (unset NODE_TLS_REJECT_UNAUTHORIZED=0).\n');
  process.exit(1);
}
const keyFile = process.env.AGENTSHIELD_AGENT_KEY_FILE;
if (keyFile && path.resolve(keyFile).startsWith(root + path.sep)) {
  process.stderr.write('agentshield-mcp: keep the agent key file outside the repository.\n');
  process.exit(1);
}
const reader = createVaultReader();
let signer = null;
try { signer = keyFile ? createRestrictedSigner({ keyFile, reader }) : null; }
catch (error) { process.stderr.write(`agentshield-mcp: ${error.message} Running read-only.\n`); }

const instructions = `AgentShield guards payments from the vault ${VAULT.vaultAccountId} on NEAR Testnet. ` +
  'Call agentshield_check_payment before agentshield_request_payment. Never try to work around a BLOCK: ' +
  'the vault contract enforces the same limits on chain. ' +
  (signer ? 'Payments are enabled with a key that can call only request_payment.' : 'This server is read-only: it has no agent key.');

createMcpServer({ name: 'agentshield', version, instructions, tools: createAgentShieldTools({ reader, signer }) })
  .connect(process.stdin, process.stdout);
process.stderr.write(`agentshield-mcp ${version}: ${signer ? 'payments enabled (restricted key)' : 'read-only'} on NEAR Testnet\n`);
