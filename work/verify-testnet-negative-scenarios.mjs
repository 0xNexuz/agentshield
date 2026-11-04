import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { archivalTxStatus } from './near-testnet-archival.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const proposal = JSON.parse(fs.readFileSync(path.join(root, 'deployment/testnet-negative-scenarios-proposal.json'), 'utf8'));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
export async function verifyNegativeScenario(name) {
  assert(process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0', 'TLS verification must be enabled');
  const scenario = proposal.scenarios[name];
  assert(scenario, 'Unknown negative scenario');
  const evidence = JSON.parse(fs.readFileSync(path.join(root, `outputs/testnet-negative-${name}-evidence.json`), 'utf8'));
  // These transactions are older than the regular RPC keeps, so they come from an archival node.
  const lookup = await archivalTxStatus(evidence.transactionHash, proposal.agentAccountId,
    { id: 'agentshield-negative-independent-proof' });
  const tx = lookup.result;
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
    rpc: lookup.endpoint, transactionFetchedAt: lookup.fetchedAt,
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
