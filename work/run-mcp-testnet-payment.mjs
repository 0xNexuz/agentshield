// One real NEAR Testnet payment made through the AgentShield MCP server, driven by the official MCP
// SDK client exactly as Claude or Codex would drive it.
//
//   node --use-system-ca work/run-mcp-testnet-payment.mjs --check                     (read-only)
//   node --use-system-ca work/run-mcp-testnet-payment.mjs --execute-approved-payment  (signs once)
//
// The server is started with the agent's restricted key (AGENTSHIELD_AGENT_KEY_FILE, kept outside the
// repository). An intent file is written before the payment tool is called, so a second run refuses.
// Afterwards the script waits for the vault's settlement callback and records the evidence.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { STATE_ENDPOINT, postRpc } from './near-testnet-archival.mjs';
import { VAULT } from './vault-reader.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const secrets = process.env.AGENTSHIELD_SECRETS_DIR || 'C:\\Users\\USER\\Documents\\Codex\\AgentShield-Secrets';
const keyFile = process.env.AGENTSHIELD_AGENT_KEY_FILE || path.join(secrets, 'testnet', `${VAULT.agentAccountId}.request-payment.json`);
const RECIPIENT = 'agentshield-recipient-7bb4a0df1077.testnet';
const AMOUNT_NEAR = '0.005';
const intentFile = path.join(root, 'outputs/testnet-mcp-payment-intent.json');
const evidenceFile = path.join(root, 'outputs/testnet-mcp-payment-evidence.json');

function check(ok, why) { if (!ok) throw new Error(why); }
const rpc = (method, params) => postRpc(STATE_ENDPOINT, 'agentshield-mcp-payment', method, params);
async function getRequest(requestId) {
  const data = await rpc('query', { request_type: 'call_function', finality: 'final', account_id: VAULT.vaultAccountId,
    method_name: 'get_request', args_base64: Buffer.from(JSON.stringify({ request_id: requestId })).toString('base64') });
  return JSON.parse(Buffer.from(data.result).toString('utf8'));
}

async function connectServer() {
  check(process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0', 'TLS verification must be enabled');
  check(fs.existsSync(keyFile), `Agent key file not found: ${keyFile}`);
  check(!path.resolve(keyFile).startsWith(root + path.sep), 'The agent key file must be outside the repository');
  const transport = new StdioClientTransport({ command: process.execPath,
    args: [...process.execArgv, path.join(root, 'mcp/agentshield-mcp.mjs')],
    env: { ...process.env, AGENTSHIELD_AGENT_KEY_FILE: keyFile }, stderr: 'inherit' });
  const client = new Client({ name: 'agentshield-testnet-payment-run', version: '1.0.0' });
  await client.connect(transport);
  check(/Payments are enabled/.test(client.getInstructions() ?? ''), 'The MCP server did not load the agent key; check the key file');
  const call = async (name, args) => {
    const result = await client.callTool({ name, arguments: args });
    check(!result.isError, result.content?.[0]?.text ?? `${name} failed`);
    return result.structuredContent;
  };
  return { client, call };
}

async function main() {
  const flag = process.argv[2];
  check(process.argv.length === 3 && ['--check', '--execute-approved-payment'].includes(flag),
    'Use --check or --execute-approved-payment');
  if (flag === '--execute-approved-payment') check(!fs.existsSync(intentFile), `Intent exists at ${intentFile}; inspect it before any retry`);
  const { client, call } = await connectServer();
  try {
    const status = await call('agentshield_vault_status', {});
    const dryRun = await call('agentshield_check_payment', { recipient: RECIPIENT, amountNear: AMOUNT_NEAR });
    check(dryRun.decision === 'ALLOW', `The dry-run is ${dryRun.decision}, not ALLOW: ${dryRun.reasons.join(' ')}`);
    if (flag === '--check') {
      console.log(JSON.stringify({ state: 'READY', mandate: status.mandate, remainingTodayNear: status.remainingTodayNear,
        remainingTotalNear: status.remainingTotalNear, dryRun: { decision: dryRun.decision, reasons: dryRun.reasons } }, null, 2));
      return;
    }
    fs.writeFileSync(intentFile, JSON.stringify({ network: 'testnet', via: 'AgentShield MCP server (mcp/agentshield-mcp.mjs)',
      client: '@modelcontextprotocol/sdk Client', tool: 'agentshield_request_payment', recipient: RECIPIENT, amountNear: AMOUNT_NEAR,
      mandateVersion: status.mandate.version, dryRun: { decision: dryRun.decision, reasons: dryRun.reasons },
      createdAt: new Date().toISOString() }, null, 2) + '\n', { flag: 'wx' });
    const result = await call('agentshield_request_payment', { recipient: RECIPIENT, amountNear: AMOUNT_NEAR });
    fs.writeFileSync(intentFile, JSON.stringify({ ...JSON.parse(fs.readFileSync(intentFile, 'utf8')),
      transactionHash: result.transactionHash ?? null, outcome: result.outcome }, null, 2) + '\n');
    console.log(JSON.stringify({ stage: 'TOOL_RESULT', outcome: result.outcome, transactionHash: result.transactionHash }));
    check(result.outcome === 'AUTHORIZED' && result.signed === true, `The payment was not authorized: ${result.outcome}`);

    const requestId = result.contractDecision.request_id;
    let record;
    for (let attempt = 0; attempt < 20; attempt++) {
      record = await getRequest(requestId);
      if (record?.status !== 'PENDING') break;
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
    check(record?.status === 'SETTLED', `Settlement not recorded yet (status ${record?.status}); rerun the verifier later`);
    fs.writeFileSync(evidenceFile, JSON.stringify({ network: 'testnet', verification: 'PASS', via: 'AgentShield MCP server',
      tool: 'agentshield_request_payment', transactionHash: result.transactionHash, requestId, request: result.request,
      dryRun: { decision: dryRun.decision, reasons: dryRun.reasons }, contractDecision: result.contractDecision,
      settlement: record.status, recordMandateVersion: record.mandate_version,
      explorerUrl: result.explorerUrl, recordedAt: new Date().toISOString() }, null, 2) + '\n', { flag: 'wx' });
    console.log(JSON.stringify({ stage: 'SETTLED', transactionHash: result.transactionHash, requestId, evidenceFile }));
  } finally {
    await client.close();
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
