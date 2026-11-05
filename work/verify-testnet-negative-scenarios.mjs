import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { archivalTxStatus } from './near-testnet-archival.mjs';
import { RESTRICTED_KEY_INITIAL_NONCE, STAGE_CHECKS, succeeded } from './verify-testnet-revocation-lab.mjs';

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
    rpc: lookup.endpoint,
    checkedAt: new Date().toISOString() };
}
// Mandate version 2 probes (deployment/testnet-rejection-probes-v2-proposal.json). A probe is listed
// only once its evidence is committed; each listed probe is rechecked from the chain, not the file.
const probes = JSON.parse(fs.readFileSync(path.join(root, 'deployment/testnet-rejection-probes-v2-proposal.json'), 'utf8'));
const probeEvidence = name => path.join(root, `outputs/testnet-rejection-${name}-evidence.json`);
export const executedProbes = () => Object.keys(probes.scenarios).filter(name => fs.existsSync(probeEvidence(name)));

export async function verifyRejectionProbe(name) {
  assert(process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0', 'TLS verification must be enabled');
  const scenario = probes.scenarios[name];
  assert(scenario, 'Unknown rejection probe');
  const evidence = JSON.parse(fs.readFileSync(probeEvidence(name), 'utf8'));
  const signer = scenario.signer === 'owner' ? probes.ownerAccountId : probes.agentAccountId;
  const lookup = await archivalTxStatus(evidence.transactionHash, signer, { id: 'agentshield-probe-independent-proof' });
  const tx = lookup.result;
  assert(!tx.status?.Failure && !tx.receipts_outcome.some(item => item.outcome?.status?.Failure), `${name}: transaction or receipt failed`);
  assert(tx.transaction?.signer_id === signer && tx.transaction?.receiver_id === probes.vaultAccountId &&
    tx.transaction?.actions?.length === 1, `${name}: signer or receiver differs`);
  if (scenario.signer === 'agent') assert(tx.transaction.public_key === probes.restrictedPublicKey, `${name}: not signed with the restricted agent key`);
  const call = tx.transaction.actions[0].FunctionCall;
  assert(call?.method_name === 'request_payment' && call.deposit === '0' && BigInt(call.gas) === BigInt(probes.gas),
    `${name}: call method, deposit, or gas differs`);
  const args = JSON.parse(Buffer.from(call.args, 'base64').toString('utf8'));
  assert(args.recipient === scenario.recipient && args.amount_yocto === probes.amountYocto && args.nonce === scenario.nonce &&
    args.expected_version === scenario.expectedVersion && /^[0-9]+$/.test(args.expires_at_ns), `${name}: call arguments differ from the declared probe`);
  const rejected = tx.receipts_outcome.find(item => item.outcome?.executor_id === probes.vaultAccountId &&
    item.outcome?.logs?.includes(`AGENTSHIELD_DECISION decision=REJECTED reason=${scenario.expectedReason}`));
  assert(rejected?.outcome?.status?.SuccessValue !== undefined, `${name}: contract rejection log missing`);
  const decision = JSON.parse(Buffer.from(rejected.outcome.status.SuccessValue, 'base64').toString('utf8'));
  assert(decision.decision === 'REJECTED' && decision.reason === scenario.expectedReason, `${name}: contract returned a different decision`);
  const vaultTransfers = tx.receipts.filter(item => item.predecessor_id === probes.vaultAccountId &&
    item.receipt?.Action?.actions?.some(action => action.Transfer));
  assert(vaultTransfers.length === 0, `${name}: vault payout receipt exists`);
  return { network: 'testnet', verification: 'PASS', scenario: name, decision: 'REJECTED', reason: decision.reason,
    transactionHash: evidence.transactionHash, finality: 'FINAL', signer, restrictedPublicKey: scenario.signer === 'agent' ? probes.restrictedPublicKey : null,
    recipient: scenario.recipient, amountYocto: probes.amountYocto, nonce: scenario.nonce, mandateVersion: probes.mandate.version,
    vaultTransferReceiptCount: 0, explorerUrl: `https://testnet.nearblocks.io/txns/${evidence.transactionHash}`,
    rpc: lookup.endpoint, checkedAt: new Date().toISOString() };
}

// The revoked request on the separate lab vault: the revoke and the refused request, both from archival nodes.
// The full lab (deploy, key, mandate, superseded attempts) is rechecked by work/verify-testnet-revocation-lab.mjs.
const revocationEvidence = path.join(root, 'outputs/testnet-revocation-probe-evidence.json');
export async function verifyRevocationProbe() {
  assert(process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0', 'TLS verification must be enabled');
  const lab = JSON.parse(fs.readFileSync(path.join(root, 'deployment/testnet-revocation-lab-proposal.json'), 'utf8'));
  const evidence = JSON.parse(fs.readFileSync(revocationEvidence, 'utf8'));
  const revokeIntent = JSON.parse(fs.readFileSync(path.join(root, 'outputs/testnet-revocation-revoke-intent.json'), 'utf8'));
  const [revoke, probe] = await Promise.all([
    archivalTxStatus(revokeIntent.hash, revokeIntent.signer, { id: 'agentshield-revocation-proof' }),
    archivalTxStatus(evidence.transactionHash, evidence.signer, { id: 'agentshield-revocation-proof' })]);
  for (const [tx, signer] of [[revoke.result, lab.owner], [probe.result, lab.agent]]) {
    assert(succeeded(tx) && tx.transaction.signer_id === signer && tx.transaction.receiver_id === lab.isolatedVault, 'revoked: transaction failed or has different parties');
  }
  STAGE_CHECKS.revoke(revoke.result, lab);
  const decision = STAGE_CHECKS.probe(probe.result, lab);
  assert(BigInt(probe.result.transaction.nonce) === RESTRICTED_KEY_INITIAL_NONCE + 1n, 'revoked: not the lab key\'s first landed transaction');
  return { network: 'testnet', verification: 'PASS', scenario: 'revoked', decision: 'REJECTED', reason: decision.reason,
    transactionHash: evidence.transactionHash, revokeTransactionHash: revokeIntent.hash, finality: 'FINAL', vaultAccountId: lab.isolatedVault,
    signer: lab.agent, restrictedPublicKey: lab.restrictedPublicKey, recipient: lab.rejectedRequest.recipient,
    amountYocto: lab.rejectedRequest.amount_yocto, nonce: lab.rejectedRequest.nonce, mandateVersion: decision.expectedVersion,
    vaultTransferReceiptCount: 0, explorerUrl: `https://testnet.nearblocks.io/txns/${evidence.transactionHash}`,
    rpc: probe.endpoint, checkedAt: new Date().toISOString() };
}

export async function verifyNegativeScenarios() {
  return Promise.all([...Object.keys(proposal.scenarios).map(name => verifyNegativeScenario(name)),
    ...executedProbes().map(name => verifyRejectionProbe(name)),
    ...(fs.existsSync(revocationEvidence) ? [verifyRevocationProbe()] : [])]);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  verifyNegativeScenarios().then(proofs => {
    // Version 1 rejections and the version 2 probes keep separate records, so each file keeps one shape.
    const files = { 'outputs/testnet-negative-independent-proofs.json': proofs.filter(p => p.scenario in proposal.scenarios),
      'outputs/testnet-rejection-probes-v2-independent-proofs.json': proofs.filter(p => p.scenario in probes.scenarios) };
    for (const [file, list] of Object.entries(files)) if (list.length) fs.writeFileSync(path.join(root, file), JSON.stringify(list, null, 2) + '\n');
    console.log(JSON.stringify({ proofs, evidenceFiles: Object.keys(files) }, null, 2));
  }).catch(error => { console.error(`VERIFICATION FAILED: ${error.message}`); process.exitCode = 1; });
}
