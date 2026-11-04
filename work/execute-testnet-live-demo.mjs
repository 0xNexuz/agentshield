// Each stage requires its own explicit --execute-approved-* flag. Never retry a signed
// transaction by creating a new one: inspect the saved intent hash first.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect, keyStores, transactions, utils } from 'near-api-js';
import { KeyPair } from 'near-api-js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const proposal = JSON.parse(fs.readFileSync(path.join(root, 'deployment/testnet-live-demo-proposal.json'), 'utf8'));
const credentialRoot = 'C:\\Users\\USER\\Documents\\Codex\\AgentShield-Secrets';
const restrictedFile = path.join(credentialRoot, 'testnet', `${proposal.agentAccountId}.request-payment.json`);
const rpc = 'https://rpc.testnet.near.org';
const flags = {
  key: '--execute-approved-restricted-key',
  mandate: '--execute-approved-mandate',
  payment: '--execute-approved-payment',
};
function insist(ok, message) { if (!ok) throw new Error(message); }
async function query(method, params) {
  const response = await fetch(rpc, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 'agentshield-live-demo', method, params }),
    signal: AbortSignal.timeout(20000),
  });
  insist(response.ok, `RPC HTTP ${response.status}`);
  const payload = await response.json();
  insist(!payload.error, `RPC ${method}: ${payload.error?.message}`);
  return payload.result;
}
async function account(accountId) {
  return query('query', { request_type: 'view_account', finality: 'final', account_id: accountId });
}
async function keys(accountId) {
  return (await query('query', { request_type: 'view_access_key_list', finality: 'final', account_id: accountId })).keys;
}
async function view(method, args = {}) {
  const result = await query('query', {
    request_type: 'call_function', finality: 'final', account_id: proposal.vaultAccountId,
    method_name: method, args_base64: Buffer.from(JSON.stringify(args)).toString('base64'),
  });
  insist(Array.isArray(result?.result), `Vault view ${method} failed`);
  return JSON.parse(Buffer.from(result.result).toString('utf8'));
}
async function finalized(hash, signer) {
  let last = 'not found';
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      const result = await query('tx', { tx_hash: hash, sender_account_id: signer, wait_until: 'FINAL' });
      if (result?.final_execution_status === 'FINAL') return result;
      last = result?.final_execution_status ?? 'unknown';
    } catch (error) { last = error.message; }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  throw new Error(`Check original transaction ${hash} before any further action: ${last}`);
}
async function checkCommon() {
  insist(process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0', 'TLS verification must be enabled');
  insist(proposal.network === 'testnet' && proposal.status === 'PROPOSED_NOT_SIGNED', 'Proposal mismatch');
  const [vault, vaultKeys, status] = await Promise.all([
    account(proposal.vaultAccountId), keys(proposal.vaultAccountId), view('get_vault_status'),
  ]);
  insist(vault.code_hash === proposal.expectedCodeHash, 'Vault code hash changed');
  insist(vaultKeys.length === 0, 'Vault access-key configuration changed');
  insist(status.owner === proposal.ownerAccountId && status.domain === 'agentshield:testnet:v1', 'Vault identity changed');
  return status;
}
async function fullAccessSigner(accountId) {
  const store = new keyStores.UnencryptedFileSystemKeyStore(credentialRoot);
  const key = await store.getKey('testnet', accountId);
  insist(key, `Lifecycle key missing for ${accountId}`);
  const observed = await keys(accountId);
  insist(observed.some(item => item.public_key === key.getPublicKey().toString() && item.access_key.permission === 'FullAccess'),
    'Lifecycle key does not have verified full access');
  return store;
}
async function restrictedSigner() {
  const record = JSON.parse(fs.readFileSync(restrictedFile, 'utf8'));
  const key = KeyPair.fromString(record.private_key);
  insist(key.getPublicKey().toString() === proposal.restrictedKey.publicKey, 'Restricted key file mismatch');
  const observed = await keys(proposal.agentAccountId);
  const onchain = observed.find(item => item.public_key === proposal.restrictedKey.publicKey);
  const permission = onchain?.access_key?.permission?.FunctionCall;
  insist(permission && permission.receiver_id === proposal.vaultAccountId &&
    permission.method_names?.length === 1 && permission.method_names[0] === 'request_payment' &&
    permission.allowance === proposal.restrictedKey.allowanceYocto, 'Restricted key permission differs from proposal');
  const store = new keyStores.InMemoryKeyStore();
  await store.setKey('testnet', proposal.agentAccountId, key);
  return store;
}
async function sendOnce(stage, signerId, receiverId, actions, before = {}) {
  const intentFile = path.join(root, `outputs/testnet-live-${stage}-intent.json`);
  insist(!fs.existsSync(intentFile), `Intent exists at ${intentFile}; inspect it before any retry`);
  const store = stage === 'payment' ? await restrictedSigner() : await fullAccessSigner(signerId);
  const near = await connect({ networkId: 'testnet', nodeUrl: rpc, keyStore: store });
  const signer = await near.account(signerId);
  const [hashBytes, signed] = await signer.signTransaction(receiverId, actions);
  const hash = utils.serialize.base_encode(hashBytes);
  fs.writeFileSync(intentFile, JSON.stringify({ network: 'testnet', stage, hash, signerId, receiverId,
    proposalFile: 'deployment/testnet-live-demo-proposal.json', before, createdAt: new Date().toISOString() }, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ stage: 'SIGNED_INTENT', action: stage, hash, intentFile }));
  try { await signer.connection.provider.sendTransactionUntil(signed, 'FINAL'); }
  catch (error) { console.error(`Broadcast response uncertain for ${hash}: ${error.message}`); }
  const result = await finalized(hash, signerId);
  insist(result.transaction?.signer_id === signerId && result.transaction?.receiver_id === receiverId,
    `Final transaction ${hash} has unexpected parties`);
  insist(!result.status?.Failure && !result.receipts_outcome?.some(item => item.outcome?.status?.Failure),
    `Final transaction ${hash} or a receipt failed`);
  return { result, hash, intentFile };
}
async function executeKey() {
  const status = await checkCommon();
  insist(status.mandate === null, 'Mandate already exists; sequence changed');
  const agentKeys = await keys(proposal.agentAccountId);
  insist(agentKeys.length === 1 && agentKeys[0].access_key.permission === 'FullAccess', 'Agent keys changed');
  insist(!agentKeys.some(item => item.public_key === proposal.restrictedKey.publicKey), 'Restricted key already exists');
  const restricted = JSON.parse(fs.readFileSync(restrictedFile, 'utf8'));
  insist(KeyPair.fromString(restricted.private_key).getPublicKey().toString() === proposal.restrictedKey.publicKey,
    'Restricted key file mismatch');
  const publicKey = KeyPair.fromString(restricted.private_key).getPublicKey();
  const action = transactions.addKey(publicKey, transactions.functionCallAccessKey(
    proposal.vaultAccountId, ['request_payment'], BigInt(proposal.restrictedKey.allowanceYocto)));
  const sent = await sendOnce('key', proposal.agentAccountId, proposal.agentAccountId, [action]);
  await restrictedSigner();
  saveEvidence('key', sent, { publicKey: proposal.restrictedKey.publicKey,
    receiverId: proposal.vaultAccountId, methods: ['request_payment'], allowanceYocto: proposal.restrictedKey.allowanceYocto });
}
async function executeMandate() {
  const status = await checkCommon();
  insist(status.mandate === null, 'Mandate already exists; inspect before altering');
  await restrictedSigner();
  const m = proposal.mandate;
  const block = await query('block', { finality: 'final' });
  const remaining = BigInt(m.expires_at_ns) - BigInt(block.header.timestamp_nanosec);
  insist(remaining > 86_400_000_000_000n && remaining <= 30n * 86_400_000_000_000n, 'Mandate expiry is stale');
  insist(BigInt(m.total_yocto) < BigInt(status.available_yocto), 'Vault balance insufficient');
  const args = { agent: m.agent, recipients: m.recipients, per_payment_yocto: m.per_payment_yocto,
    daily_yocto: m.daily_yocto, total_yocto: m.total_yocto, expires_at_ns: m.expires_at_ns };
  const action = transactions.functionCall('set_mandate', args, BigInt(m.gas), 0n);
  const sent = await sendOnce('mandate', proposal.ownerAccountId, proposal.vaultAccountId, [action]);
  const observed = await view('get_mandate');
  insist(observed && observed.version === 1 && !observed.paused && !observed.revoked &&
    observed.agent === m.agent && JSON.stringify(observed.recipients) === JSON.stringify(m.recipients) &&
    observed.per_payment_yocto === m.per_payment_yocto && observed.daily_yocto === m.daily_yocto &&
    observed.total_yocto === m.total_yocto && observed.expires_at_ns === m.expires_at_ns,
    'Finalized mandate state differs from proposal');
  saveEvidence('mandate', sent, { observed });
}
async function executePayment() {
  const status = await checkCommon();
  await restrictedSigner();
  const m = status.mandate;
  const p = proposal.firstPayment;
  insist(m && m.version === 1 && !m.paused && !m.revoked && m.agent === proposal.agentAccountId &&
    m.recipients.length === 1 && m.recipients[0] === p.recipient &&
    m.per_payment_yocto === proposal.mandate.per_payment_yocto &&
    m.daily_yocto === proposal.mandate.daily_yocto && m.total_yocto === proposal.mandate.total_yocto &&
    m.expires_at_ns === p.expires_at_ns, 'Active mandate differs from proposal');
  insist(BigInt(status.confirmed_total_yocto) === 0n && BigInt(status.pending_total_yocto) === 0n &&
    BigInt(status.day_confirmed_yocto) === 0n && BigInt(status.day_pending_yocto) === 0n,
    'Vault spending state changed');
  insist(BigInt(status.available_yocto) > BigInt(p.amount_yocto) &&
    BigInt(p.amount_yocto) <= BigInt(m.per_payment_yocto) &&
    BigInt(p.amount_yocto) <= BigInt(m.daily_yocto) && BigInt(p.amount_yocto) <= BigInt(m.total_yocto),
    'Payment exceeds funds or limits');
  const block = await query('block', { finality: 'final' });
  insist(BigInt(p.expires_at_ns) > BigInt(block.header.timestamp_nanosec) + 60_000_000_000n,
    'Payment expiry is too close');
  insist(/^[A-Za-z0-9_]{8,64}$/.test(p.nonce), 'Invalid nonce');
  const recipientBefore = await account(p.recipient);
  const args = { recipient: p.recipient, amount_yocto: p.amount_yocto, nonce: p.nonce,
    expires_at_ns: p.expires_at_ns, expected_version: p.expected_version };
  const action = transactions.functionCall('request_payment', args, BigInt(p.gas), 0n);
  const sent = await sendOnce('payment', proposal.agentAccountId, proposal.vaultAccountId, [action],
    { recipientBalanceYocto: recipientBefore.amount, vaultConfirmedYocto: status.confirmed_total_yocto });
  const logs = sent.result.receipts_outcome.flatMap(item => item.outcome?.logs ?? []);
  const decision = logs.find(line => line.startsWith('AGENTSHIELD_DECISION ') && line.includes('decision=AUTHORIZED'));
  insist(decision, `No genuine AUTHORIZED contract log in ${sent.hash}`);
  const requestId = decision.match(/request_id=([0-9a-f]{64})/)?.[1];
  insist(requestId, 'Missing request ID in contract log');
  const settled = logs.some(line => line === `AGENTSHIELD_SETTLEMENT request_id=${requestId} status=SETTLED`);
  insist(settled, `No SETTLED callback log in ${sent.hash}`);
  const recipientReceipt = sent.result.receipts_outcome.find(item =>
    item.outcome?.executor_id === p.recipient && item.outcome?.status?.SuccessValue !== undefined);
  insist(recipientReceipt, `No successful recipient receipt in ${sent.hash}`);
  const [record, after, recipientAfter] = await Promise.all([
    view('get_request', { request_id: requestId }), view('get_vault_status'), account(p.recipient),
  ]);
  insist(record?.status === 'SETTLED' && record.recipient === p.recipient &&
    record.amount_yocto === p.amount_yocto && record.nonce === p.nonce && record.mandate_version === 1,
    'Request record is not settled as proposed');
  insist(BigInt(after.confirmed_total_yocto) === BigInt(status.confirmed_total_yocto) + BigInt(p.amount_yocto) &&
    BigInt(after.pending_total_yocto) === 0n, 'Vault accounting does not reconcile');
  insist(BigInt(recipientAfter.amount) >= BigInt(recipientBefore.amount) + BigInt(p.amount_yocto),
    'Recipient balance increase was not observed');
  saveEvidence('payment', sent, { requestId, record, recipientReceiptId: recipientReceipt.id,
    recipientBalanceBeforeYocto: recipientBefore.amount, recipientBalanceAfterYocto: recipientAfter.amount,
    confirmedTotalBeforeYocto: status.confirmed_total_yocto, confirmedTotalAfterYocto: after.confirmed_total_yocto,
    callbackSettled: true });
}
function saveEvidence(stage, sent, details) {
  const file = path.join(root, `outputs/testnet-live-${stage}-evidence.json`);
  const result = sent.result;
  fs.writeFileSync(file, JSON.stringify({ network: 'testnet', stage, transactionHash: sent.hash,
    finality: result.final_execution_status, signer: result.transaction.signer_id,
    receiver: result.transaction.receiver_id, receiptOutcomes: result.receipts_outcome.map(item => ({
      id: item.id, executorId: item.outcome?.executor_id, status: item.outcome?.status,
      logs: item.outcome?.logs ?? [],
    })), details, explorerUrl: `https://testnet.nearblocks.io/txns/${sent.hash}` }, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ stage: 'VERIFIED', action: stage, hash: sent.hash, evidenceFile: file }));
}
async function main() {
  const stage = Object.keys(flags).find(item => process.argv.length === 3 && process.argv[2] === flags[item]);
  insist(stage, `Specify one approved action: ${Object.values(flags).join(', ')}`);
  if (stage === 'key') await executeKey();
  else if (stage === 'mandate') await executeMandate();
  else await executePayment();
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
