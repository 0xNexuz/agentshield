// Four rejection probes against the live vault under mandate version 2, declared in
// deployment/testnet-rejection-probes-v2-proposal.json before any was signed.
//
//   node --use-system-ca work/execute-testnet-rejection-probes.mjs --check
//   node --use-system-ca work/execute-testnet-rejection-probes.mjs --execute-approved-<staleVersion|expired|lookalikeRecipient|wrongAgent>
//
// --check is read-only. Each execute flag signs exactly one transaction, writes its hash to an intent
// file before broadcasting, and is never retried: if an intent exists, inspect that hash instead.
// A rejection changes no vault state, and the script fails unless the vault refused with the expected
// reason, issued no transfer, and left its accounting unchanged.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect, keyStores, transactions, utils, KeyPair } from 'near-api-js';
import { STATE_ENDPOINT, postRpc } from './near-testnet-archival.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const proposal = JSON.parse(fs.readFileSync(path.join(root, 'deployment/testnet-rejection-probes-v2-proposal.json'), 'utf8'));
const secrets = process.env.AGENTSHIELD_SECRETS_DIR || 'C:\\Users\\USER\\Documents\\Codex\\AgentShield-Secrets';
const restrictedFile = path.join(secrets, 'testnet', `${proposal.agentAccountId}.request-payment.json`);
const TEN_MINUTES_NS = 600_000_000_000n;
const SIXTY_SECONDS_NS = 60_000_000_000n;
const MIN_ALLOWANCE = 7_000_000_000_000_000_000_000n; // 0.007 NEAR of gas allowance per probe

function check(ok, why) { if (!ok) throw new Error(why); }
const rpc = (method, params) => postRpc(STATE_ENDPOINT, 'agentshield-rejection-probe', method, params);
async function view(method, args = {}) {
  const data = await rpc('query', { request_type: 'call_function', finality: 'final', account_id: proposal.vaultAccountId,
    method_name: method, args_base64: Buffer.from(JSON.stringify(args)).toString('base64') });
  check(Array.isArray(data?.result), `Vault view ${method} failed`);
  return JSON.parse(Buffer.from(data.result).toString('utf8'));
}
async function accountOrMissing(accountId) {
  try { return await rpc('query', { request_type: 'view_account', finality: 'final', account_id: accountId }); }
  catch (error) { if (/UNKNOWN_ACCOUNT/.test(error.message)) return null; throw error; }
}
async function finalized(hash, signerId) {
  let last = 'not found';
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      const tx = await rpc('EXPERIMENTAL_tx_status', { tx_hash: hash, sender_account_id: signerId, wait_until: 'FINAL' });
      if (tx.final_execution_status === 'FINAL') return tx;
      last = tx.final_execution_status;
    } catch (error) { last = error.message; }
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  throw new Error(`Inspect transaction ${hash} before any retry: ${last}`);
}

export function probeArgs(name, blockTimeNs) {
  const scenario = proposal.scenarios[name];
  check(scenario, `Unknown probe ${name}`);
  const now = BigInt(blockTimeNs);
  const expiry = scenario.expiry === 'past' ? now - SIXTY_SECONDS_NS : now + TEN_MINUTES_NS;
  return { recipient: scenario.recipient, amount_yocto: proposal.amountYocto, nonce: scenario.nonce,
    expires_at_ns: String(expiry), expected_version: scenario.expectedVersion };
}

// The state every probe assumes. Anything else means the vault changed since the probes were declared.
async function preflight() {
  check(process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0', 'TLS verification must be enabled');
  check(proposal.network === 'testnet' && proposal.status === 'PROPOSED_NOT_SIGNED', 'Proposal status changed');
  const [vault, status, keys, block] = await Promise.all([
    rpc('query', { request_type: 'view_account', finality: 'final', account_id: proposal.vaultAccountId }),
    view('get_vault_status'),
    rpc('query', { request_type: 'view_access_key_list', finality: 'final', account_id: proposal.agentAccountId }),
    rpc('block', { finality: 'final' }),
  ]);
  check(vault.code_hash === proposal.codeHash, 'Vault code hash changed');
  const m = status.mandate;
  const want = proposal.mandate;
  check(m && m.version === want.version && !m.paused && !m.revoked && m.agent === proposal.agentAccountId &&
    JSON.stringify(m.recipients) === JSON.stringify(want.recipients) && m.per_payment_yocto === want.perPaymentYocto &&
    m.daily_yocto === want.dailyYocto && m.total_yocto === want.totalYocto && m.expires_at_ns === want.expiresAtNs,
    'Mandate differs from the declared version 2');
  check(status.pending_total_yocto === '0' && status.pending_withdrawal_yocto === '0', 'Vault has pending activity; wait and recheck');
  const blockTimeNs = String(block.header.timestamp_nanosec);
  check(BigInt(blockTimeNs) + TEN_MINUTES_NS < BigInt(want.expiresAtNs), 'Mandate expires too soon for the probes');
  const scoped = keys.keys.find(k => k.public_key === proposal.restrictedPublicKey)?.access_key?.permission?.FunctionCall;
  check(scoped?.receiver_id === proposal.vaultAccountId && scoped.method_names?.length === 1 &&
    scoped.method_names[0] === proposal.method && BigInt(scoped.allowance) >= MIN_ALLOWANCE,
    'Restricted agent key missing, widened, or low on allowance');
  return { status, blockTimeNs, allowance: scoped.allowance };
}

async function signerFor(role) {
  if (role === 'agent') {
    let record;
    try { record = JSON.parse(fs.readFileSync(restrictedFile, 'utf8')); } catch { throw new Error(`Cannot read the restricted key file ${restrictedFile}`); }
    const key = KeyPair.fromString(record.private_key);
    check(key.getPublicKey().toString() === proposal.restrictedPublicKey, 'Restricted key file does not match the declared key');
    const store = new keyStores.InMemoryKeyStore();
    await store.setKey('testnet', proposal.agentAccountId, key);
    return { accountId: proposal.agentAccountId, store, publicKey: proposal.restrictedPublicKey };
  }
  check(role === 'owner', `Unknown signer role ${role}`);
  const store = new keyStores.UnencryptedFileSystemKeyStore(secrets);
  const key = await store.getKey('testnet', proposal.ownerAccountId);
  check(key, `Owner key missing for ${proposal.ownerAccountId}`);
  const publicKey = key.getPublicKey().toString();
  const keys = await rpc('query', { request_type: 'view_access_key_list', finality: 'final', account_id: proposal.ownerAccountId });
  check(keys.keys.some(k => k.public_key === publicKey && k.access_key.permission === 'FullAccess'), 'Owner key is not a verified full-access key');
  return { accountId: proposal.ownerAccountId, store, publicKey };
}

async function execute(name) {
  const scenario = proposal.scenarios[name];
  const intentFile = path.join(root, `outputs/testnet-rejection-${name}-intent.json`);
  const evidenceFile = path.join(root, `outputs/testnet-rejection-${name}-evidence.json`);
  check(!fs.existsSync(intentFile), `Intent exists at ${intentFile}; inspect its hash before any retry`);
  const { status, blockTimeNs } = await preflight();
  const signer = await signerFor(scenario.signer);
  const recipientBefore = await accountOrMissing(scenario.recipient);
  const args = probeArgs(name, blockTimeNs);
  const near = await connect({ networkId: 'testnet', nodeUrl: STATE_ENDPOINT, keyStore: signer.store });
  const account = await near.account(signer.accountId);
  const action = transactions.functionCall(proposal.method, args, BigInt(proposal.gas), 0n);
  const [bytes, signed] = await account.signTransaction(proposal.vaultAccountId, [action]);
  const hash = utils.serialize.base_encode(bytes);
  fs.writeFileSync(intentFile, JSON.stringify({ network: 'testnet', scenario: name, hash, signer: signer.accountId,
    signerPublicKey: signer.publicKey, receiver: proposal.vaultAccountId, args, blockTimeNs,
    confirmedBeforeYocto: status.confirmed_total_yocto, recipientBalanceBeforeYocto: recipientBefore?.amount ?? null,
    createdAt: new Date().toISOString() }, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ stage: 'SIGNED_INTENT', scenario: name, hash, intentFile }));
  try { await account.connection.provider.sendTransactionUntil(signed, 'FINAL'); }
  catch (error) { console.error(`Broadcast response uncertain for ${hash}: ${error.message}`); }

  const tx = await finalized(hash, signer.accountId);
  check(tx.transaction?.signer_id === signer.accountId && tx.transaction?.receiver_id === proposal.vaultAccountId &&
    tx.transaction?.public_key === signer.publicKey && tx.transaction?.actions?.length === 1, 'Finalized probe parties differ');
  const call = tx.transaction.actions[0].FunctionCall;
  check(call?.method_name === proposal.method && call.deposit === '0' &&
    JSON.stringify(JSON.parse(Buffer.from(call.args, 'base64').toString('utf8'))) === JSON.stringify(args), 'Finalized probe arguments differ');
  check(!tx.status?.Failure && !tx.receipts_outcome?.some(item => item.outcome?.status?.Failure), 'Probe failed before a contract decision');
  const outcome = tx.receipts_outcome.find(item => item.outcome?.executor_id === proposal.vaultAccountId &&
    item.outcome?.logs?.includes(`AGENTSHIELD_DECISION decision=REJECTED reason=${scenario.expectedReason}`));
  check(outcome?.outcome?.status?.SuccessValue !== undefined, `Expected contract rejection ${scenario.expectedReason} not found`);
  const decision = JSON.parse(Buffer.from(outcome.outcome.status.SuccessValue, 'base64').toString('utf8'));
  check(decision.decision === 'REJECTED' && decision.reason === scenario.expectedReason, 'Returned decision differs');
  const transfers = tx.receipts.filter(item => item.predecessor_id === proposal.vaultAccountId &&
    item.receipt?.Action?.actions?.some(a => a.Transfer));
  check(transfers.length === 0, 'Vault issued a transfer during a rejected probe');
  const [after, recipientAfter] = await Promise.all([view('get_vault_status'), accountOrMissing(scenario.recipient)]);
  check(after.confirmed_total_yocto === status.confirmed_total_yocto && after.pending_total_yocto === status.pending_total_yocto &&
    after.mandate.version === status.mandate.version, 'Vault state changed during a rejection');
  check((recipientAfter?.amount ?? null) === (recipientBefore?.amount ?? null), 'Recipient balance changed during a rejection');
  fs.writeFileSync(evidenceFile, JSON.stringify({ network: 'testnet', verification: 'PASS', scenario: name,
    attack: scenario.attack, transactionHash: hash, finality: tx.final_execution_status, signer: signer.accountId,
    signerPublicKey: signer.publicKey, args, decision, vaultTransferReceipts: 0, mandateVersion: status.mandate.version,
    confirmedTotalBeforeYocto: status.confirmed_total_yocto, confirmedTotalAfterYocto: after.confirmed_total_yocto,
    recipientExists: recipientBefore !== null, recipientBalanceBeforeYocto: recipientBefore?.amount ?? null,
    recipientBalanceAfterYocto: recipientAfter?.amount ?? null,
    explorerUrl: `https://testnet.nearblocks.io/txns/${hash}`, recordedAt: new Date().toISOString() }, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ stage: 'VERIFIED', scenario: name, hash, reason: decision.reason, evidenceFile }));
}

async function main() {
  const arg = process.argv[2];
  check(process.argv.length === 3 && arg, 'Use --check or --execute-approved-<name>');
  if (arg === '--check') {
    const { status, blockTimeNs, allowance } = await preflight();
    const ready = Object.keys(proposal.scenarios).map(name => ({ name, expectedReason: proposal.scenarios[name].expectedReason,
      signer: proposal.scenarios[name].signer, alreadyRun: fs.existsSync(path.join(root, `outputs/testnet-rejection-${name}-intent.json`)),
      args: probeArgs(name, blockTimeNs) }));
    console.log(JSON.stringify({ state: 'READY', mandateVersion: status.mandate.version, confirmedTotalYocto: status.confirmed_total_yocto,
      agentKeyAllowanceYocto: allowance, probes: ready }, null, 2));
    return;
  }
  const name = Object.keys(proposal.scenarios).find(key => arg === `--execute-approved-${key}`);
  check(name, `Unknown flag ${arg}. Probes: ${Object.keys(proposal.scenarios).join(', ')}`);
  await execute(name);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
