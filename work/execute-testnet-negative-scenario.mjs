// A signed probe is never retried. If an intent exists, inspect its hash onchain.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect, keyStores, transactions, utils } from 'near-api-js';
import { KeyPair } from 'near-api-js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const proposal = JSON.parse(fs.readFileSync(path.join(root, 'deployment/testnet-negative-scenarios-proposal.json'), 'utf8'));
const payment = JSON.parse(fs.readFileSync(path.join(root, 'outputs/testnet-live-payment-evidence.json'), 'utf8'));
const secretFile = 'C:\\Users\\USER\\Documents\\Codex\\AgentShield-Secrets\\testnet\\agentshield-agent-0359da1630bb.testnet.request-payment.json';
const rpcUrl = 'https://rpc.testnet.near.org';
const names = { overspend: '--execute-approved-overspend', unauthorizedRecipient: '--execute-approved-unauthorized-recipient', replay: '--execute-approved-replay' };
function check(ok, why) { if (!ok) throw new Error(why); }
async function rpc(method, params) {
  const response = await fetch(rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 'agentshield-negative-probe', method, params }),
    signal: AbortSignal.timeout(20000) });
  check(response.ok, `RPC HTTP ${response.status}`);
  const payload = await response.json();
  check(!payload.error, `RPC ${method}: ${payload.error?.message}`);
  return payload.result;
}
async function view(method, args = {}) {
  const data = await rpc('query', { request_type: 'call_function', finality: 'final',
    account_id: proposal.vaultAccountId, method_name: method,
    args_base64: Buffer.from(JSON.stringify(args)).toString('base64') });
  check(Array.isArray(data?.result), `View ${method} failed`);
  return JSON.parse(Buffer.from(data.result).toString('utf8'));
}
async function finalized(hash) {
  let last = 'not found';
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      const tx = await rpc('EXPERIMENTAL_tx_status', { tx_hash: hash,
        sender_account_id: proposal.agentAccountId, wait_until: 'FINAL' });
      if (tx.final_execution_status === 'FINAL') return tx;
      last = tx.final_execution_status;
    } catch (error) { last = error.message; }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  throw new Error(`Check original transaction ${hash} before any retry: ${last}`);
}
async function main() {
  const checkOnly = process.argv.length === 3 && process.argv[2]?.startsWith('--check-live-');
  const name = Object.keys(names).find(key => process.argv.length === 3 &&
    process.argv[2] === (checkOnly ? `--check-live-${key}` : names[key]));
  check(name, `Use an approved scenario flag or --check-live-{overspend,unauthorizedRecipient,replay}: ${Object.values(names).join(', ')}`);
  check(process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0', 'TLS verification must be enabled');
  check(proposal.network === 'testnet' && proposal.status === 'PROPOSED_NOT_SIGNED', 'Proposal status changed');
  const intentFile = path.join(root, `outputs/testnet-negative-${name}-intent.json`);
  check(!fs.existsSync(intentFile), `Intent exists: ${intentFile}; inspect before any retry`);
  const scenario = proposal.scenarios[name];
  const [vaultAccount, status, keyList, priorRequest, block, recipientBefore] = await Promise.all([
    rpc('query', { request_type: 'view_account', finality: 'final', account_id: proposal.vaultAccountId }),
    view('get_vault_status'),
    rpc('query', { request_type: 'view_access_key_list', finality: 'final', account_id: proposal.agentAccountId }),
    view('get_request', { request_id: payment.details.requestId }),
    rpc('block', { finality: 'final' }),
    rpc('query', { request_type: 'view_account', finality: 'final', account_id: scenario.recipient }),
  ]);
  check(vaultAccount.code_hash === proposal.codeHash, 'Vault code hash changed');
  const m = status.mandate;
  check(m && m.version === 1 && !m.paused && !m.revoked && m.agent === proposal.agentAccountId &&
    m.recipients.length === 1 && m.recipients[0] === 'agentshield-recipient-7bb4a0df1077.testnet' &&
    m.per_payment_yocto === '10000000000000000000000' &&
    m.daily_yocto === '20000000000000000000000' && m.total_yocto === '50000000000000000000000' &&
    m.expires_at_ns === proposal.expiryNs, 'Mandate differs from approved baseline');
  check(BigInt(proposal.expiryNs) > BigInt(block.header.timestamp_nanosec) + 60_000_000_000n,
    'Probe expiry is too close');
  check(status.confirmed_total_yocto === payment.details.confirmedTotalAfterYocto &&
    status.pending_total_yocto === '0', 'Vault spending state changed');
  check(priorRequest?.status === 'SETTLED' && priorRequest?.nonce === payment.details.record.nonce,
    'Original settled request is missing');
  check(scenario.amountYocto === (name === 'overspend' ? '11000000000000000000000' : '5000000000000000000000'),
    'Probe amount changed');
  check(scenario.expectedReason === ({ overspend: 'PER_PAYMENT_LIMIT', unauthorizedRecipient: 'RECIPIENT_NOT_ALLOWED', replay: 'REPLAY' })[name],
    'Expected reason changed');
  check(name === 'unauthorizedRecipient' ? scenario.recipient === 'agentshield-mag-1d2f78801994.testnet' :
    scenario.recipient === m.recipients[0], 'Probe recipient changed');
  check(name === 'replay' ? scenario.nonce === priorRequest.nonce :
    scenario.nonce !== priorRequest.nonce && /^[A-Za-z0-9_-]{8,64}$/.test(scenario.nonce), 'Probe nonce changed');
  const keyEntry = keyList.keys.find(item => item.public_key === proposal.restrictedPublicKey);
  const permission = keyEntry?.access_key?.permission?.FunctionCall;
  check(permission?.receiver_id === proposal.vaultAccountId &&
    permission?.method_names?.length === 1 && permission.method_names[0] === proposal.method &&
    BigInt(permission.allowance) > BigInt(proposal.gas) * 100000000n,
    'Restricted key missing or insufficient allowance');
  if (checkOnly) {
    console.log(JSON.stringify({ state: 'READY_FOR_SEPARATE_AUTHORIZATION', scenario: name,
      expectedReason: scenario.expectedReason, recipient: scenario.recipient,
      amountYocto: scenario.amountYocto, nonce: scenario.nonce, restrictedPublicKey: proposal.restrictedPublicKey,
      observedAllowanceYocto: permission.allowance, vaultConfirmedYocto: status.confirmed_total_yocto }));
    return;
  }
  const secret = JSON.parse(fs.readFileSync(secretFile, 'utf8'));
  const key = KeyPair.fromString(secret.private_key);
  check(key.getPublicKey().toString() === proposal.restrictedPublicKey, 'Restricted key file mismatch');
  const store = new keyStores.InMemoryKeyStore();
  await store.setKey('testnet', proposal.agentAccountId, key);
  const near = await connect({ networkId: 'testnet', nodeUrl: rpcUrl, keyStore: store });
  const signer = await near.account(proposal.agentAccountId);
  const args = { recipient: scenario.recipient, amount_yocto: scenario.amountYocto,
    nonce: scenario.nonce, expires_at_ns: proposal.expiryNs, expected_version: 1 };
  const action = transactions.functionCall('request_payment', args, BigInt(proposal.gas), 0n);
  const [bytes, signed] = await signer.signTransaction(proposal.vaultAccountId, [action]);
  const hash = utils.serialize.base_encode(bytes);
  fs.writeFileSync(intentFile, JSON.stringify({ network: 'testnet', scenario: name, hash,
    signer: proposal.agentAccountId, receiver: proposal.vaultAccountId, args,
    recipientBalanceBeforeYocto: recipientBefore.amount, confirmedBeforeYocto: status.confirmed_total_yocto,
    createdAt: new Date().toISOString() }, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ stage: 'SIGNED_INTENT', scenario: name, hash, intentFile }));
  try { await signer.connection.provider.sendTransactionUntil(signed, 'FINAL'); }
  catch (error) { console.error(`Broadcast response uncertain for ${hash}: ${error.message}`); }
  const tx = await finalized(hash);
  check(tx.transaction?.signer_id === proposal.agentAccountId &&
    tx.transaction?.receiver_id === proposal.vaultAccountId &&
    tx.transaction?.public_key === proposal.restrictedPublicKey &&
    tx.transaction?.actions?.length === 1, 'Finalized probe parties or signer differ');
  const actualCall = tx.transaction.actions[0].FunctionCall;
  check(actualCall?.method_name === 'request_payment' && actualCall.deposit === '0' &&
    JSON.stringify(JSON.parse(Buffer.from(actualCall.args, 'base64').toString('utf8'))) === JSON.stringify(args),
    'Finalized probe arguments differ');
  check(!tx.status?.Failure && !tx.receipts_outcome?.some(item => item.outcome?.status?.Failure),
    'Probe transaction failed before a contract decision');
  const outcome = tx.receipts_outcome.find(item => item.outcome?.executor_id === proposal.vaultAccountId &&
    item.outcome?.logs?.includes(`AGENTSHIELD_DECISION decision=REJECTED reason=${scenario.expectedReason}`));
  check(outcome && outcome.outcome.status?.SuccessValue !== undefined, 'Expected genuine contract rejection not found');
  const decision = JSON.parse(Buffer.from(outcome.outcome.status.SuccessValue, 'base64').toString('utf8'));
  check(decision.decision === 'REJECTED' && decision.reason === scenario.expectedReason,
    'Returned decision differs from expected rejection');
  check(!tx.receipts.some(item => item.predecessor_id === proposal.vaultAccountId &&
    item.receipt?.Action?.actions?.some(action => action.Transfer)),
    'Vault issued a transfer during a rejected probe');
  const [after, recipientAfter] = await Promise.all([
    view('get_vault_status'),
    rpc('query', { request_type: 'view_account', finality: 'final', account_id: scenario.recipient }),
  ]);
  check(after.confirmed_total_yocto === status.confirmed_total_yocto &&
    after.pending_total_yocto === status.pending_total_yocto, 'Vault accounting changed during rejection');
  check(recipientAfter.amount === recipientBefore.amount, 'Recipient balance changed during rejection');
  const file = path.join(root, `outputs/testnet-negative-${name}-evidence.json`);
  fs.writeFileSync(file, JSON.stringify({ network: 'testnet', verification: 'PASS', scenario: name,
    transactionHash: hash, finality: tx.final_execution_status, decision, recipient: scenario.recipient,
    amountYocto: scenario.amountYocto, nonce: scenario.nonce, vaultTransferReceipts: 0,
    confirmedTotalBeforeYocto: status.confirmed_total_yocto,
    confirmedTotalAfterYocto: after.confirmed_total_yocto,
    recipientBalanceBeforeYocto: recipientBefore.amount, recipientBalanceAfterYocto: recipientAfter.amount,
    explorerUrl: `https://testnet.nearblocks.io/txns/${hash}` }, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ stage: 'VERIFIED', scenario: name, hash, reason: decision.reason, evidenceFile: file }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
