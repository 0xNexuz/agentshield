import { pathToFileURL } from 'node:url';
import { isTestnetAccountId, testnetStatus } from './near-testnet-rpc.mjs';

const RPC = 'https://rpc.testnet.near.org';
const PUBLIC_KEY = /^ed25519:[1-9A-HJ-NP-Za-km-z]{40,55}$/;

export function assessAgentKeyPermission(permission, vaultAccountId) {
  if (!permission || typeof permission !== 'object' || Array.isArray(permission)) {
    return { accepted: false, reason: 'FUNCTION_CALL_PERMISSION_REQUIRED' };
  }
  const policy = permission.FunctionCall;
  if (!policy || typeof policy !== 'object') {
    return { accepted: false, reason: 'FUNCTION_CALL_PERMISSION_REQUIRED' };
  }
  if (policy.receiver_id !== vaultAccountId) {
    return { accepted: false, reason: 'WRONG_RECEIVER' };
  }
  if (!Array.isArray(policy.method_names) ||
      policy.method_names.length !== 1 ||
      policy.method_names[0] !== 'request_payment') {
    return { accepted: false, reason: 'METHOD_SCOPE_NOT_EXACT' };
  }
  if (typeof policy.allowance !== 'string' || !/^[1-9][0-9]*$/.test(policy.allowance)) {
    return { accepted: false, reason: 'FINITE_POSITIVE_GAS_ALLOWANCE_REQUIRED' };
  }
  return { accepted: true, reason: 'EXACT_AGENT_SCOPE', allowanceYocto: policy.allowance };
}

async function main() {
  const [agentAccountId, publicKey, vaultAccountId] = process.argv.slice(2);
  if (!isTestnetAccountId(agentAccountId) || !isTestnetAccountId(vaultAccountId) ||
      agentAccountId === vaultAccountId || !PUBLIC_KEY.test(publicKey ?? '')) {
    throw new Error('Usage: node work/verify-agent-key.mjs <agent.testnet> <ed25519:PUBLIC_KEY> <vault.testnet>');
  }
  const status = await testnetStatus();
  if (!status.healthy) throw new Error('NEAR testnet RPC is not healthy and synced.');
  const response = await fetch(RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 'agentshield-key-scope', method: 'query',
      params: { request_type: 'view_access_key', finality: 'final',
        account_id: agentAccountId, public_key: publicKey },
    }),
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error(`NEAR testnet RPC returned HTTP ${response.status}`);
  const payload = await response.json();
  if (payload.error) throw new Error(`NEAR testnet access-key query failed: ${payload.error.message ?? 'unknown error'}`);
  if (!payload.result?.permission || !payload.result?.block_hash || !payload.result?.block_height) {
    throw new Error('NEAR testnet RPC returned an incomplete access-key result.');
  }
  const assessment = assessAgentKeyPermission(payload.result.permission, vaultAccountId);
  console.log(JSON.stringify({
    network: 'testnet', finality: 'final', agentAccountId, publicKey, vaultAccountId,
    blockHash: payload.result.block_hash, blockHeight: payload.result.block_height,
    ...assessment,
  }, null, 2));
  if (!assessment.accepted) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
