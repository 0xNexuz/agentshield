// Reads one instruction from stdin, calls NEAR AI, then checks finalized vault policy.
// Never signs or broadcasts. Keep NEAR_AI_KEY / NEAR_AI_KEY_FILE outside the repo.
import fs from 'node:fs';
import { inferPaymentInstruction, preflightPayment } from './near-ai-payment-agent.mjs';

const vault = 'vault.agentshield-mag-1d2f78801994.testnet';
const agent = 'agentshield-agent-0359da1630bb.testnet';
const endpoint = 'https://rpc.testnet.near.org';
function check(ok, why) { if (!ok) throw new Error(why); }
async function rpc(method, params) {
  const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 'agentshield-ai-preflight', method, params }),
    signal: AbortSignal.timeout(15000) });
  check(response.ok, `Testnet RPC HTTP ${response.status}`);
  const payload = await response.json();
  check(!payload.error, `Testnet RPC ${method}: ${payload.error?.message}`);
  return payload.result;
}
async function readInstruction() {
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
    check(input.length <= 2000, 'Instruction exceeds 2000 characters');
  }
  return input.trim();
}
async function main() {
  const checkOnly = process.argv.length === 3 && process.argv[2] === '--check-policy';
  check(process.argv.length === 2 || checkOnly, 'Only the read-only --check-policy flag is supported');
  check(process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0', 'TLS verification must be enabled');
  const key = process.env.NEAR_AI_KEY || (process.env.NEAR_AI_KEY_FILE ?
    fs.readFileSync(process.env.NEAR_AI_KEY_FILE, 'utf8').trim() : '');
  if (!checkOnly) check(key, 'Set NEAR_AI_KEY or NEAR_AI_KEY_FILE outside the repository before a real inference');
  const instruction = checkOnly ? null : await readInstruction();
  const [account, statusResult, block, knownRecipient] = await Promise.all([
    rpc('query', { request_type: 'view_account', finality: 'final', account_id: vault }),
    rpc('query', { request_type: 'call_function', finality: 'final', account_id: vault,
      method_name: 'get_vault_status', args_base64: 'e30=' }),
    rpc('block', { finality: 'final' }),
    rpc('query', { request_type: 'view_account', finality: 'final',
      account_id: 'agentshield-recipient-7bb4a0df1077.testnet' }),
  ]);
  check(account.code_hash === '2KHm9Waz7fQfQ2A1MWmHhVSwx7o7sm8p1KXBTVyggCqN', 'Vault code hash changed');
  check(Array.isArray(statusResult.result), 'Vault status view failed');
  const status = JSON.parse(Buffer.from(statusResult.result).toString('utf8'));
  if (checkOnly) {
    const allowed = 'agentshield-recipient-7bb4a0df1077.testnet';
    const owner = 'agentshield-mag-1d2f78801994.testnet';
    const options = { agentAccountId: agent, nowNs: block.header.timestamp_nanosec,
      recipientExists: Boolean(knownRecipient.amount) };
    const cases = [
      preflightPayment({ recipient: allowed, amountNear: '0.005' }, status, options),
      preflightPayment({ recipient: allowed, amountNear: '0.006' }, status, options),
      preflightPayment({ recipient: owner, amountNear: '0.005' }, status, options),
    ];
    check(cases.map(item => item.decision).join(',') === 'ALLOW,WARN,BLOCK',
      'Live vault policy did not yield ALLOW, WARN, BLOCK as expected');
    console.log(JSON.stringify({ state: 'READ_ONLY_POLICY_CHECK_PASSED', codeHash: account.code_hash,
      blockHeight: block.header.height, outcomes: cases.map(item => ({ decision: item.decision, reason: item.reason })) }, null, 2));
    return;
  }
  const inference = await inferPaymentInstruction(instruction, { apiKey: key });
  let recipientExists = false;
  if (typeof inference.proposal?.recipient === 'string' &&
    /^[a-z0-9_-]+(?:\.[a-z0-9_-]+)*\.testnet$/.test(inference.proposal.recipient)) {
    try {
      const accountResult = await rpc('query', { request_type: 'view_account', finality: 'final',
        account_id: inference.proposal.recipient });
      recipientExists = Boolean(accountResult.amount);
    } catch { recipientExists = false; }
  }
  const preflight = preflightPayment(inference.proposal, status, { agentAccountId: agent,
    nowNs: block.header.timestamp_nanosec, recipientExists });
  console.log(JSON.stringify({ provider: inference.provider, model: inference.model,
    requestId: inference.requestId, modelProposal: inference.proposal, preflight,
    signed: false, transactionHash: null, contractDecision: null,
    nextAction: preflight.decision === 'BLOCK' ? 'REFUSE_TO_SIGN' :
      preflight.decision === 'WARN' ? 'REQUIRE_EXACT_HUMAN_APPROVAL' : 'PREPARE_EXACT_SIGNING_AUTHORIZATION' }, null, 2));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
