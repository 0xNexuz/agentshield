import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const proposal = JSON.parse(fs.readFileSync(path.join(root, 'deployment/testnet-negative-scenarios-proposal.json'), 'utf8'));
const endpoint = 'https://rpc.testnet.near.org';
const assert = (condition, message) => { if (!condition) throw new Error(message); };
async function rpc(method, params) {
  const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 'agentshield-negative-independent-proof', method, params }),
    signal: AbortSignal.timeout(20000) });
  assert(response.ok, `RPC HTTP ${response.status}`);
  const data = await response.json();
  assert(!data.error, `RPC ${method}: ${data.error?.message}`);
  return data.result;
}
export async function verifyNegativeScenario(name) {
  assert(process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0', 'TLS verification must be enabled');
  const scenario = proposal.scenarios[name];
  assert(scenario, 'Unknown negative scenario');
  const evidence = JSON.parse(fs.readFileSync(path.join(root, `outputs/testnet-negative-${name}-evidence.json`), 'utf8'));
  const tx = await rpc('EXPERIMENTAL_tx_status', { tx_hash: evidence.transactionHash,
    sender_account_id: proposal.agentAccountId, wait_until: 'FINAL' });
  assert(tx.final_execution_status === 'FINAL' && !tx.status?.Failure &&
    !tx.receipts_outcome.some(item => item.outcome?.status?.Failure), `${name}: transaction or receipt not finalized`);
  assert(tx.transaction?.signer_id === proposal.agentAccountId &&
    tx.transaction?.receiver_id === proposal.vaultAccountId &&
    tx.transaction?.public_key === proposal.restrictedPublicKey &&
    tx.transaction?.actions?.length === 1, `${name}: signer or receiver differs`);
  const call = tx.transaction.actions[0].FunctionCall;
  assert(call?.method_name === 'request_payment' && call.deposit === '0' &&
    BigInt(call.gas) === BigInt(proposal.gas), `${name}: call method, deposit, or gas differs`);
  const args = JSON.parse(Buffer.from(call.args, 'base64').toString('utf8'));
  assert(args.recipient === scenario.recipient && args.amount_yocto === scenario.amountYocto &&
    args.nonce === scenario.nonce && args.expected_version === proposal.expectedVersion &&
    args.expires_at_ns === proposal.expiryNs, `${name}: call arguments differ`);
  const rejected = tx.receipts_outcome.find(item =>
    item.outcome?.executor_id === proposal.vaultAccountId &&
    item.outcome?.logs?.includes(`AGENTSHIELD_DECISION decision=REJECTED reason=${scenario.expectedReason}`));
  assert(rejected?.outcome?.status?.SuccessValue !== undefined, `${name}: contract rejection log missing`);
  const decision = JSON.parse(Buffer.from(rejected.outcome.status.SuccessValue, 'base64').toString('utf8'));
  assert(decision.decision === 'REJECTED' && decision.reason === scenario.expectedReason,
    `${name}: contract returned a different decision`);
  const vaultTransfers = tx.receipts.filter(item => item.predecessor_id === proposal.vaultAccountId &&
    item.receipt?.Action?.actions?.some(action => action.Transfer));
  assert(vaultTransfers.length === 0, `${name}: vault payout receipt exists`);
  assert(evidence.confirmedTotalBeforeYocto === evidence.confirmedTotalAfterYocto &&
    evidence.recipientBalanceBeforeYocto === evidence.recipientBalanceAfterYocto,
    `${name}: saved accounting or recipient balance changed`);
  return { network: 'testnet', verification: 'PASS', scenario: name, decision: 'REJECTED',
    reason: decision.reason, transactionHash: evidence.transactionHash, finality: 'FINAL',
    signer: proposal.agentAccountId, restrictedPublicKey: proposal.restrictedPublicKey,
    recipient: scenario.recipient, amountYocto: scenario.amountYocto, nonce: scenario.nonce,
    vaultTransferReceiptCount: 0, explorerUrl: evidence.explorerUrl,
    checkedAt: new Date().toISOString() };
}
export async function verifyNegativeScenarios() {
  return Promise.all(Object.keys(proposal.scenarios).map(name => verifyNegativeScenario(name)));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  verifyNegativeScenarios().then(proofs => {
    const file = path.join(root, 'outputs/testnet-negative-independent-proofs.json');
    fs.writeFileSync(file, JSON.stringify(proofs, null, 2) + '\n');
    console.log(JSON.stringify({ proofs, evidenceFile: file }, null, 2));
  }).catch(error => { console.error(`VERIFICATION FAILED: ${error.message}`); process.exitCode = 1; });
}
