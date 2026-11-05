// Independently rechecks the payment made through the MCP server, from the chain rather than the file:
// the finalized transaction (archival node), its arguments, the vault's decision and settlement logs,
// the exact transfer receipt, and the vault's current request record.
//   node --use-system-ca work/verify-testnet-mcp-payment.mjs   (writes outputs/testnet-mcp-payment-independent-proof.json)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { STATE_ENDPOINT, archivalTxStatus, postRpc } from './near-testnet-archival.mjs';
import { VAULT } from './vault-reader.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const evidenceFile = path.join(root, 'outputs/testnet-mcp-payment-evidence.json');
const fail = why => { throw new Error(why); };

// Pure check of a finalized EXPERIMENTAL_tx_status result against the recorded MCP evidence.
export function checkMcpPaymentTx(tx, evidence) {
  const { request, requestId } = evidence;
  if (tx.final_execution_status !== 'FINAL' || tx.status?.Failure) fail('Payment transaction is not finalized and successful');
  if (tx.receipts_outcome.some(item => item.outcome?.status?.Failure)) fail('A payment receipt failed');
  const t = tx.transaction;
  if (t?.signer_id !== VAULT.agentAccountId || t?.receiver_id !== VAULT.vaultAccountId) fail('Signer or receiver differs');
  if (t.public_key !== VAULT.restrictedPublicKey) fail('Not signed with the restricted agent key');
  const call = t.actions?.length === 1 ? t.actions[0].FunctionCall : null;
  if (call?.method_name !== 'request_payment' || call.deposit !== '0') fail('Not a single zero-deposit request_payment call');
  const args = JSON.parse(Buffer.from(call.args, 'base64').toString('utf8'));
  if (args.recipient !== request.recipient || args.amount_yocto !== request.amountYocto || args.nonce !== request.nonce ||
    args.expires_at_ns !== request.expiresAtNs || args.expected_version !== request.expectedVersion) fail('Call arguments differ from the MCP request');
  const logs = tx.receipts_outcome.flatMap(item => item.outcome?.logs ?? []);
  if (!logs.includes(`AGENTSHIELD_DECISION request_id=${requestId} decision=AUTHORIZED version=${request.expectedVersion}`)) fail('Authorization log missing');
  if (!logs.includes(`AGENTSHIELD_SETTLEMENT request_id=${requestId} status=SETTLED`)) fail('Settlement log missing');
  const transfer = tx.receipts.find(item => item.predecessor_id === VAULT.vaultAccountId && item.receiver_id === request.recipient &&
    item.receipt?.Action?.actions?.length === 1 && item.receipt.Action.actions[0].Transfer?.deposit === request.amountYocto);
  if (!transfer) fail('Exact vault-to-recipient transfer receipt missing');
  const transferOutcome = tx.receipts_outcome.find(item => item.id === transfer.receipt_id);
  if (transferOutcome?.outcome?.status?.SuccessValue === undefined) fail('Transfer receipt did not succeed');
  return { transferReceiptId: transfer.receipt_id };
}

export async function verifyMcpPayment() {
  if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') fail('TLS verification must be enabled');
  if (!fs.existsSync(evidenceFile)) fail('No MCP payment evidence yet (outputs/testnet-mcp-payment-evidence.json)');
  const evidence = JSON.parse(fs.readFileSync(evidenceFile, 'utf8'));
  const lookup = await archivalTxStatus(evidence.transactionHash, VAULT.agentAccountId, { id: 'agentshield-mcp-payment-proof' });
  const { transferReceiptId } = checkMcpPaymentTx(lookup.result, evidence);
  const data = await postRpc(STATE_ENDPOINT, 'agentshield-mcp-payment-proof', 'query', { request_type: 'call_function', finality: 'final',
    account_id: VAULT.vaultAccountId, method_name: 'get_request',
    args_base64: Buffer.from(JSON.stringify({ request_id: evidence.requestId })).toString('base64') });
  const record = JSON.parse(Buffer.from(data.result).toString('utf8'));
  if (record?.status !== 'SETTLED' || record.recipient !== evidence.request.recipient || record.amount_yocto !== evidence.request.amountYocto) {
    fail('The vault\'s request record is not the settled MCP payment');
  }
  return { network: 'testnet', verification: 'PASS', via: 'AgentShield MCP server', decision: 'AUTHORIZED', settlement: 'SETTLED',
    transactionHash: evidence.transactionHash, requestId: evidence.requestId, recipientReceiptId: transferReceiptId,
    recipient: record.recipient, amountYocto: record.amount_yocto, mandateVersion: record.mandate_version,
    explorerUrl: `https://testnet.nearblocks.io/txns/${evidence.transactionHash}`, rpc: { transactions: lookup.endpoint },
    checkedAt: new Date().toISOString() };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  verifyMcpPayment().then(proof => {
    fs.writeFileSync(path.join(root, 'outputs/testnet-mcp-payment-independent-proof.json'), JSON.stringify(proof, null, 2) + '\n');
    console.log(JSON.stringify(proof, null, 2));
  })
    .catch(error => { console.error(`VERIFICATION FAILED: ${error.message}`); process.exitCode = 1; });
}
