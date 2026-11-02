import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertHistoricalPaymentState } from './live-payment-invariants.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const proposal = JSON.parse(fs.readFileSync(path.join(root, 'deployment/testnet-live-demo-proposal.json'), 'utf8'));
const evidence = JSON.parse(fs.readFileSync(path.join(root, 'outputs/testnet-live-payment-evidence.json'), 'utf8'));
const keyEvidence = JSON.parse(fs.readFileSync(path.join(root, 'outputs/testnet-live-key-evidence.json'), 'utf8'));
const mandateEvidence = JSON.parse(fs.readFileSync(path.join(root, 'outputs/testnet-live-mandate-evidence.json'), 'utf8'));
const endpoint = 'https://rpc.testnet.near.org';
const check = (yes, why) => { if (!yes) throw new Error(why); };

async function rpc(method, params) {
  const response = await fetch(endpoint, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 'agentshield-independent-payment-proof', method, params }),
    signal: AbortSignal.timeout(20000),
  });
  check(response.ok, `RPC HTTP ${response.status}`);
  const result = await response.json();
  check(!result.error, `RPC ${method}: ${result.error?.message}`);
  return result.result;
}
async function view(method, args = {}) {
  const data = await rpc('query', { request_type: 'call_function', finality: 'final',
    account_id: proposal.vaultAccountId, method_name: method,
    args_base64: Buffer.from(JSON.stringify(args)).toString('base64') });
  check(Array.isArray(data?.result), `View ${method} failed`);
  return JSON.parse(Buffer.from(data.result).toString('utf8'));
}

export async function verifyLivePayment() {
  check(process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0', 'TLS verification must be enabled');
  const [tx, keyTx, mandateTx] = await Promise.all([
    rpc('EXPERIMENTAL_tx_status', { tx_hash: evidence.transactionHash,
      sender_account_id: proposal.agentAccountId, wait_until: 'FINAL' }),
    rpc('EXPERIMENTAL_tx_status', { tx_hash: keyEvidence.transactionHash,
      sender_account_id: proposal.agentAccountId, wait_until: 'FINAL' }),
    rpc('EXPERIMENTAL_tx_status', { tx_hash: mandateEvidence.transactionHash,
      sender_account_id: proposal.ownerAccountId, wait_until: 'FINAL' }),
  ]);
  check(keyTx.final_execution_status === 'FINAL' && !keyTx.status?.Failure &&
    keyTx.transaction?.signer_id === proposal.agentAccountId &&
    keyTx.transaction?.receiver_id === proposal.agentAccountId && keyTx.transaction?.actions?.length === 1,
    'Restricted key creation transaction is not finalized');
  const createdKey = keyTx.transaction.actions[0].AddKey;
  const createdPermission = createdKey?.access_key?.permission?.FunctionCall;
  check(createdKey?.public_key === proposal.restrictedKey.publicKey &&
    createdPermission?.receiver_id === proposal.vaultAccountId &&
    createdPermission?.allowance === proposal.restrictedKey.allowanceYocto &&
    createdPermission?.method_names?.length === 1 && createdPermission.method_names[0] === 'request_payment',
    'Historical restricted key permission differs');
  check(mandateTx.final_execution_status === 'FINAL' && !mandateTx.status?.Failure &&
    mandateTx.transaction?.signer_id === proposal.ownerAccountId &&
    mandateTx.transaction?.receiver_id === proposal.vaultAccountId &&
    mandateTx.transaction?.actions?.length === 1, 'Mandate transaction is not finalized');
  const mandateCall = mandateTx.transaction.actions[0].FunctionCall;
  check(mandateCall?.method_name === 'set_mandate' && mandateCall.deposit === '0',
    'Historical mandate call differs');
  const historicalMandate = JSON.parse(Buffer.from(mandateCall.args, 'base64').toString('utf8'));
  check(historicalMandate.agent === proposal.mandate.agent &&
    JSON.stringify(historicalMandate.recipients) === JSON.stringify(proposal.mandate.recipients) &&
    historicalMandate.per_payment_yocto === proposal.mandate.per_payment_yocto &&
    historicalMandate.daily_yocto === proposal.mandate.daily_yocto &&
    historicalMandate.total_yocto === proposal.mandate.total_yocto &&
    historicalMandate.expires_at_ns === proposal.mandate.expires_at_ns, 'Historical mandate differs');
  check(tx.final_execution_status === 'FINAL' && !tx.status?.Failure, 'Payment transaction is not finalized and successful');
  check(tx.transaction?.signer_id === proposal.agentAccountId && tx.transaction?.receiver_id === proposal.vaultAccountId,
    'Payment signer or receiver differs');
  check(tx.transaction?.public_key === proposal.restrictedKey.publicKey, 'Payment was not signed with the restricted key');
  check(tx.transaction.actions?.length === 1 && tx.transaction.actions[0].FunctionCall?.method_name === 'request_payment',
    'Payment was not a single vault request');
  const args = JSON.parse(Buffer.from(tx.transaction.actions[0].FunctionCall.args, 'base64').toString('utf8'));
  check(args.recipient === proposal.firstPayment.recipient && args.amount_yocto === proposal.firstPayment.amount_yocto &&
    args.nonce === proposal.firstPayment.nonce && args.expected_version === 1 &&
    tx.transaction.actions[0].FunctionCall.deposit === '0', 'Payment call arguments differ');
  check(!tx.receipts_outcome.some(item => item.outcome?.status?.Failure), 'A payment receipt failed');
  const recipientReceipt = tx.receipts.find(item =>
    item.predecessor_id === proposal.vaultAccountId && item.receiver_id === proposal.recipientAccountId &&
    item.receipt?.Action?.actions?.length === 1 &&
    item.receipt.Action.actions[0].Transfer?.deposit === proposal.firstPayment.amount_yocto);
  check(recipientReceipt, 'Exact vault-to-recipient transfer receipt is missing');
  const transferOutcome = tx.receipts_outcome.find(item => item.id === recipientReceipt.receipt_id);
  check(transferOutcome?.outcome?.status?.SuccessValue !== undefined, 'Recipient transfer receipt did not succeed');
  const requestId = evidence.details.requestId;
  const logs = tx.receipts_outcome.flatMap(item => item.outcome?.logs ?? []);
  check(logs.includes(`AGENTSHIELD_DECISION request_id=${requestId} decision=AUTHORIZED version=1`),
    'Genuine authorization log missing');
  check(logs.includes(`AGENTSHIELD_SETTLEMENT request_id=${requestId} status=SETTLED`),
    'Genuine settlement callback log missing');
  const [record, status, recipient, vault, keyList] = await Promise.all([
    view('get_request', { request_id: requestId }), view('get_vault_status'),
    rpc('query', { request_type: 'view_account', finality: 'final', account_id: proposal.recipientAccountId }),
    rpc('query', { request_type: 'view_account', finality: 'final', account_id: proposal.vaultAccountId }),
    rpc('query', { request_type: 'view_access_key_list', finality: 'final', account_id: proposal.agentAccountId }),
  ]);
  check(vault.code_hash === proposal.expectedCodeHash, 'Vault code hash changed');
  assertHistoricalPaymentState(record, status, {
    recipient: proposal.recipientAccountId, amountYocto: proposal.firstPayment.amount_yocto,
    nonce: proposal.firstPayment.nonce, mandateVersion: 1,
  });
  const key = keyList.keys.find(item => item.public_key === proposal.restrictedKey.publicKey);
  const permission = key?.access_key?.permission?.FunctionCall;
  const currentKeyStillScoped = permission?.receiver_id === proposal.vaultAccountId &&
    permission?.method_names?.length === 1 && permission.method_names[0] === 'request_payment' &&
    BigInt(permission.allowance) > 0n;
  return {
    network: 'testnet', verification: 'PASS', finality: 'FINAL', decision: 'AUTHORIZED', settlement: 'SETTLED',
    transactionHash: evidence.transactionHash, requestId, recipientReceiptId: recipientReceipt.receipt_id,
    recipient: record.recipient, amountYocto: record.amount_yocto, amountNear: '0.005',
    vaultAccountId: proposal.vaultAccountId, codeHash: vault.code_hash, agent: proposal.agentAccountId,
    restrictedPublicKey: proposal.restrictedKey.publicKey,
    currentKeyStillScoped: Boolean(currentKeyStillScoped), observedKeyAllowanceYocto: permission?.allowance ?? null,
    mandateVersion: record.mandate_version, currentMandateVersion: status.mandate?.version,
    mandateRevoked: status.mandate?.revoked,
    mandatePerPaymentYocto: status.mandate?.per_payment_yocto,
    mandateDailyYocto: status.mandate?.daily_yocto,
    mandateTotalYocto: status.mandate?.total_yocto,
    mandateExpiryNs: status.mandate?.expires_at_ns,
    confirmedTotalYocto: status.confirmed_total_yocto, pendingTotalYocto: status.pending_total_yocto,
    currentRecipientBalanceYocto: recipient.amount,
    explorerUrl: `https://testnet.nearblocks.io/txns/${evidence.transactionHash}`,
    checkedAt: new Date().toISOString(),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  verifyLivePayment().then(proof => {
    const file = path.join(root, 'outputs/testnet-live-payment-independent-proof.json');
    fs.writeFileSync(file, JSON.stringify(proof, null, 2) + '\n');
    console.log(JSON.stringify({ ...proof, evidenceFile: file }, null, 2));
  }).catch(error => { console.error(`VERIFICATION FAILED: ${error.message}`); process.exitCode = 1; });
}
