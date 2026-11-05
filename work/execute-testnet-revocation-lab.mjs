// Five explicitly approved stages. Each stage writes its signed hash before broadcast;
// an existing intent stops a repeat. Check the original hash if any response is uncertain.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { connect, keyStores, transactions, utils } from 'near-api-js';
import { KeyPair } from 'near-api-js';
import { testnetAccount, testnetStatus } from './near-testnet-rpc.mjs';
import { archivalTxStatus } from './near-testnet-archival.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const p = JSON.parse(fs.readFileSync(path.join(root, 'deployment/testnet-revocation-lab-proposal.json'), 'utf8'));
const wasm = fs.readFileSync(path.join(root, 'deployment/agentshield_vault.wasm'));
const secrets = 'C:\\Users\\USER\\Documents\\Codex\\AgentShield-Secrets';
const restrictedFile = path.join(secrets, 'testnet', `${p.agent}.revocation-request-payment.json`);
const rpcUrl = 'https://rpc.testnet.near.org';
const flags = { deploy: '--execute-approved-deploy', deployCorrected: '--execute-approved-deploy-corrected', key: '--execute-approved-key',
  mandate: '--execute-approved-mandate', revoke: '--execute-approved-revoke', probe: '--execute-approved-probe',
  recordRevoke: '--record-approved-revoke', probeRetry: '--execute-approved-probe-retry',
  probeLowGas: '--execute-approved-probe-low-gas' };
function check(ok, why) { if (!ok) throw new Error(why); }
async function rpc(method, params) {
  const response = await fetch(rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 'agentshield-revocation-lab', method, params }),
    signal: AbortSignal.timeout(20000) });
  check(response.ok, `RPC HTTP ${response.status}`);
  const payload = await response.json();
  check(!payload.error, `RPC ${method}: ${payload.error?.message}`);
  return payload.result;
}
async function view(method, args = {}) {
  const data = await rpc('query', { request_type: 'call_function', finality: 'final',
    account_id: p.isolatedVault, method_name: method,
    args_base64: Buffer.from(JSON.stringify(args)).toString('base64') });
  check(Array.isArray(data?.result), `View ${method} failed`);
  return JSON.parse(Buffer.from(data.result).toString('utf8'));
}
async function keyList(accountId) {
  return (await rpc('query', { request_type: 'view_access_key_list', finality: 'final', account_id: accountId })).keys;
}
async function fullAccessStore(accountId) {
  const store = new keyStores.UnencryptedFileSystemKeyStore(secrets);
  const key = await store.getKey('testnet', accountId);
  check(key, `Missing lifecycle key for ${accountId}`);
  const list = await keyList(accountId);
  check(list.some(item => item.public_key === key.getPublicKey().toString() &&
    item.access_key.permission === 'FullAccess'), 'Lifecycle key is not verified full access');
  return store;
}
async function restrictedStore() {
  const data = JSON.parse(fs.readFileSync(restrictedFile, 'utf8'));
  const key = KeyPair.fromString(data.private_key);
  check(key.getPublicKey().toString() === p.restrictedPublicKey, 'Restricted key file differs');
  const list = await keyList(p.agent);
  const onchain = list.find(item => item.public_key === p.restrictedPublicKey);
  const permission = onchain?.access_key?.permission?.FunctionCall;
  check(permission?.receiver_id === p.isolatedVault && permission.allowance === p.gasAllowanceYocto &&
    permission.method_names?.length === 1 && permission.method_names[0] === 'request_payment',
    'Restricted onchain permission differs');
  const store = new keyStores.InMemoryKeyStore();
  await store.setKey('testnet', p.agent, key);
  return store;
}
async function finalized(hash, signer) {
  let last = 'not found';
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      const tx = await rpc('EXPERIMENTAL_tx_status', { tx_hash: hash,
        sender_account_id: signer, wait_until: 'FINAL' });
      if (tx.final_execution_status === 'FINAL') return tx;
      last = tx.final_execution_status;
    } catch (error) { last = error.message; }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  throw new Error(`Check original transaction ${hash} before any retry: ${last}`);
}
async function sendOnce(stage, signerId, receiverId, actions, restricted = false) {
  const intentFile = path.join(root, `outputs/testnet-revocation-${stage}-intent.json`);
  check(!fs.existsSync(intentFile), `Intent already exists at ${intentFile}; inspect its hash first`);
  const store = restricted ? await restrictedStore() : await fullAccessStore(signerId);
  const near = await connect({ networkId: 'testnet', nodeUrl: rpcUrl, keyStore: store });
  const signer = await near.account(signerId);
  const [hashBytes, signed] = await signer.signTransaction(receiverId, actions);
  const hash = utils.serialize.base_encode(hashBytes);
  fs.writeFileSync(intentFile, JSON.stringify({ network: 'testnet', stage, hash,
    signer: signerId, receiver: receiverId, createdAt: new Date().toISOString() }, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ stage: 'SIGNED_INTENT', action: stage, hash, intentFile }));
  try { await signer.connection.provider.sendTransactionUntil(signed, 'FINAL'); }
  catch (error) { console.error(`Broadcast response uncertain for ${hash}: ${error.message}`); }
  const tx = await finalized(hash, signerId);
  check(tx.transaction?.signer_id === signerId && tx.transaction?.receiver_id === receiverId &&
    !tx.status?.Failure && !tx.receipts_outcome?.some(item => item.outcome?.status?.Failure),
    `Final transaction ${hash} failed or has different parties`);
  return { hash, tx };
}
function save(stage, sent, details) {
  const file = path.join(root, `outputs/testnet-revocation-${stage}-evidence.json`);
  fs.writeFileSync(file, JSON.stringify({ network: 'testnet', stage, transactionHash: sent.hash,
    finality: sent.tx.final_execution_status, signer: sent.tx.transaction.signer_id,
    receiver: sent.tx.transaction.receiver_id, details,
    explorerUrl: `https://testnet.nearblocks.io/txns/${sent.hash}` }, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ stage: 'VERIFIED', action: stage, hash: sent.hash, evidenceFile: file }));
}
function previous(stage) {
  const file = path.join(root, `outputs/testnet-revocation-${stage}-evidence.json`);
  check(fs.existsSync(file), `Previous stage ${stage} is not verified`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
async function common() {
  check(process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0', 'TLS verification must be enabled');
  check(p.network === 'testnet' && p.status === 'PROPOSED_NOT_SIGNED', 'Proposal state changed');
  check(p.domain === 'agentshield:testnet:v1', 'Initializer domain must match compiled contract');
  check(crypto.createHash('sha256').update(wasm).digest('hex') === p.wasmSha256Hex,
    'WASM differs from proposal');
  const health = await testnetStatus();
  check(health.healthy, 'Testnet RPC is stale or syncing');
}
async function executeDeploy(corrected = false) {
  await common();
  if (corrected) {
    const firstIntent = JSON.parse(fs.readFileSync(path.join(root, 'outputs/testnet-revocation-deploy-intent.json'), 'utf8'));
    // The failed attempt is from 2 Nov, older than rpc.testnet.near.org keeps, so ask the archival nodes.
    // Its reply carries the whole WASM (about 430 KB), so allow a slow connection 90 seconds.
    const first = await archivalTxStatus(firstIntent.hash, p.owner, { id: 'agentshield-revocation-lab', timeoutMs: 90000 })
      .then(r => r.result, error => { console.error(`Archival lookup from this machine failed: ${error.message}`); return null; });
    if (first) {
      check(first.status?.Failure?.ActionError?.index === 3 &&
        first.transaction?.receiver_id === p.isolatedVault && first.transaction?.actions?.length === 4,
        'Original atomic deployment is not a finalized initializer failure');
    } else {
      // Fallback: GitHub's runners confirmed the failure from both archival nodes (committed record), and the
      // check below confirms the isolated account still does not exist, so the first attempt created nothing.
      const recheck = JSON.parse(fs.readFileSync(path.join(root, 'outputs/testnet-revocation-deploy-failure-independent-proof.json'), 'utf8'));
      check(recheck.verification === 'PASS' && recheck.status === 'FAILED' && recheck.transactionHash === firstIntent.hash &&
        recheck.failedActionIndex === 3 && recheck.isolatedVaultExistsNow === false,
        'No archival answer here and no committed independent recheck of the failed deployment');
      console.log(`Using the committed independent recheck of ${firstIntent.hash} (checked ${recheck.checkedAt}); the isolated account is checked again below.`);
    }
  }
  const [owner, existing] = await Promise.all([testnetAccount(p.owner), testnetAccount(p.isolatedVault)]);
  check(!existing.found && BigInt(owner.balanceYocto) > BigInt(p.fundingYocto) + 500000000000000000000000n,
    'Isolated account exists or owner lacks setup headroom');
  const actions = [transactions.createAccount(), transactions.transfer(BigInt(p.fundingYocto)),
    transactions.deployContract(wasm), transactions.functionCall('initialize',
      { owner: p.owner, domain: p.domain }, 30000000000000n, 0n)];
  const stage = corrected ? 'deploy-corrected' : 'deploy';
  const sent = await sendOnce(stage, p.owner, p.isolatedVault, actions);
  check(sent.tx.transaction.actions?.length === 4, 'Atomic deployment actions differ');
  const [account, status, keys] = await Promise.all([testnetAccount(p.isolatedVault),
    view('get_vault_status'), keyList(p.isolatedVault)]);
  check(account.codeHash === p.codeHash && status.owner === p.owner && status.domain === p.domain &&
    status.mandate === null && keys.length === 0, 'Isolated deployment state differs');
  save(stage, sent, { codeHash: account.codeHash, owner: status.owner, domain: status.domain,
    fundingYocto: p.fundingYocto, accessKeyCount: keys.length });
}
async function executeKey() {
  await common(); previous('deploy-corrected');
  const status = await view('get_vault_status');
  check(status.mandate === null, 'Isolated mandate already exists');
  const list = await keyList(p.agent);
  check(!list.some(item => item.public_key === p.restrictedPublicKey), 'Restricted key already exists');
  const data = JSON.parse(fs.readFileSync(restrictedFile, 'utf8'));
  const publicKey = KeyPair.fromString(data.private_key).getPublicKey();
  check(publicKey.toString() === p.restrictedPublicKey, 'Restricted key file differs');
  const action = transactions.addKey(publicKey, transactions.functionCallAccessKey(
    p.isolatedVault, ['request_payment'], BigInt(p.gasAllowanceYocto)));
  const sent = await sendOnce('key', p.agent, p.agent, [action]);
  await restrictedStore();
  save('key', sent, { publicKey: p.restrictedPublicKey, receiver: p.isolatedVault,
    methods: ['request_payment'], allowanceYocto: p.gasAllowanceYocto });
}
async function executeMandate() {
  await common(); previous('key'); await restrictedStore();
  const status = await view('get_vault_status');
  check(status.mandate === null && BigInt(status.available_yocto) > BigInt(p.mandate.total_yocto),
    'Isolated vault already governed or underfunded');
  const block = await rpc('block', { finality: 'final' });
  check(BigInt(p.mandate.expires_at_ns) > BigInt(block.header.timestamp_nanosec) + 86400000000000n,
    'Mandate expiry is stale');
  const args = { agent: p.agent, recipients: [p.recipient], ...p.mandate };
  const sent = await sendOnce('mandate', p.owner, p.isolatedVault,
    [transactions.functionCall('set_mandate', args, 30000000000000n, 0n)]);
  const observed = await view('get_mandate');
  check(observed?.version === 1 && observed.agent === p.agent &&
    observed.recipients?.length === 1 && observed.recipients[0] === p.recipient &&
    observed.per_payment_yocto === p.mandate.per_payment_yocto &&
    observed.daily_yocto === p.mandate.daily_yocto &&
    observed.total_yocto === p.mandate.total_yocto &&
    observed.expires_at_ns === p.mandate.expires_at_ns && !observed.revoked,
    'Isolated mandate state differs');
  save('mandate', sent, { observed });
}
async function executeRevoke() {
  await common(); previous('mandate');
  const status = await view('get_vault_status');
  check(status.mandate?.version === 1 && !status.mandate.revoked && !status.mandate.paused &&
    status.confirmed_total_yocto === '0' && status.pending_total_yocto === '0',
    'Isolated mandate is not active and unused');
  const sent = await sendOnce('revoke', p.owner, p.isolatedVault,
    [transactions.functionCall('revoke', {}, 30000000000000n, 0n)]);
  const observed = await view('get_mandate');
  // revoke bumps the version, like pause and resume: version 1 becomes 2.
  check(observed?.version === 2 && observed.revoked && observed.paused, 'Isolated mandate was not revoked');
  save('revoke', sent, { observed });
}
// Records a revoke that already finalized but stopped before its evidence was written. Signs nothing.
async function recordRevoke() {
  await common(); previous('mandate');
  const intentFile = path.join(root, 'outputs/testnet-revocation-revoke-intent.json');
  check(fs.existsSync(intentFile), 'No revoke intent: nothing to record');
  check(!fs.existsSync(path.join(root, 'outputs/testnet-revocation-revoke-evidence.json')), 'Revoke evidence already exists');
  const intent = JSON.parse(fs.readFileSync(intentFile, 'utf8'));
  check(intent.stage === 'revoke' && intent.signer === p.owner && intent.receiver === p.isolatedVault, 'Revoke intent parties differ');
  const tx = await finalized(intent.hash, p.owner)
    .catch(() => archivalTxStatus(intent.hash, p.owner, { id: 'agentshield-revocation-lab', timeoutMs: 90000 }).then(r => r.result));
  const call = tx.transaction?.actions?.length === 1 ? tx.transaction.actions[0].FunctionCall : null;
  check(tx.transaction?.signer_id === p.owner && tx.transaction?.receiver_id === p.isolatedVault && call?.method_name === 'revoke' &&
    !tx.status?.Failure && !tx.receipts_outcome?.some(item => item.outcome?.status?.Failure), `Revoke ${intent.hash} did not succeed`);
  check(tx.receipts_outcome.some(item => item.outcome?.logs?.includes('AGENTSHIELD_POLICY version=2 action=REVOKE')), 'Revoke log missing');
  const observed = await view('get_mandate');
  check(observed?.version === 2 && observed.revoked && observed.paused, 'Isolated mandate is not revoked at version 2');
  save('revoke', { hash: intent.hash, tx }, { observed, recordedAfterStop: true });
}
// The restricted key's nonce when it was added (Live evidence run 42009968306 read it from the chain). It moves only
// when the key signs a transaction that lands, so while it is unchanged no probe has reached the chain.
const RESTRICTED_KEY_INITIAL_NONCE = 276321226000000n;
// NEAR checks a function-call key's allowance against the prepaid gas at a pessimistic gas price (about 10x the
// current price), not against the gas actually burnt. 70 Tgas needed about 0.071 test NEAR, more than the key's 0.02,
// so the network refused both earlier probes before they ran. A rejected request_payment burns about 2.15 Tgas
// (1.61 Tgas in the vault receipt), measured from three rejections in Live evidence run 42017158880.
const PROBE_GAS = 10000000000000n;
const PESSIMISTIC_PRICE_FACTOR = 11n;
async function executeProbe() { await runProbe('probe', {}, 70000000000000n); }
// Third attempt, with gas the allowance can cover. Allowed only while neither earlier probe has landed.
async function executeProbeLowGas() {
  await common(); previous('revoke');
  check(!fs.existsSync(path.join(root, 'outputs/testnet-revocation-probe-evidence.json')), 'Probe evidence already exists');
  const earlier = ['probe', 'probe-retry'].map(name => JSON.parse(fs.readFileSync(path.join(root, `outputs/testnet-revocation-${name}-intent.json`), 'utf8')));
  check(earlier.every(i => i.signer === p.agent && i.receiver === p.isolatedVault), 'Earlier probe intents differ');
  const onchain = (await keyList(p.agent)).find(item => item.public_key === p.restrictedPublicKey);
  check(onchain && BigInt(onchain.access_key.nonce) === RESTRICTED_KEY_INITIAL_NONCE &&
    onchain.access_key.permission?.FunctionCall?.allowance === p.gasAllowanceYocto,
    'The restricted key has signed a transaction that landed since it was added; check the earlier probes instead');
  for (const intent of earlier) {
    const found = await archivalTxStatus(intent.hash, p.agent, { id: 'agentshield-revocation-lab', timeoutMs: 60000 }).then(() => true, () => false);
    check(!found, `Earlier probe ${intent.hash} is on chain; record it instead of sending another`);
  }
  const { gas_price: price } = await rpc('gas_price', [null]);
  const needed = (PROBE_GAS + 3000000000000n) * BigInt(price) * PESSIMISTIC_PRICE_FACTOR;
  check(needed < BigInt(onchain.access_key.permission.FunctionCall.allowance),
    `Allowance ${onchain.access_key.permission.FunctionCall.allowance} cannot cover ${PROBE_GAS} gas at gas price ${price}`);
  console.log(JSON.stringify({ stage: 'LOW_GAS_PROBE_ALLOWED', earlier: earlier.map(i => i.hash), gas: String(PROBE_GAS),
    gasPrice: price, allowanceNeededYocto: String(needed), restrictedKeyNonce: String(onchain.access_key.nonce) }));
  await runProbe('probe-low-gas', { supersedes: earlier.map(i => i.hash),
    supersededBecause: 'both asked for 70 Tgas, which the 0.02 test NEAR key allowance cannot cover, so the network refused them before they ran' }, PROBE_GAS);
}
// The first probe (outputs/testnet-revocation-probe-intent.json) was signed during a network drop and never reached
// the chain. A retry is allowed only while that is provably still true: the restricted key's nonce and allowance are
// unchanged since it was added, and no archival node knows the original hash. The retry takes the key nonce the lost
// transaction held, so the lost one can never land afterwards. The vault is revoked, so neither could ever pay.
async function executeProbeRetry() {
  await common(); previous('revoke');
  const original = JSON.parse(fs.readFileSync(path.join(root, 'outputs/testnet-revocation-probe-intent.json'), 'utf8'));
  check(original.stage === 'probe' && original.signer === p.agent && original.receiver === p.isolatedVault, 'Original probe intent differs');
  check(!fs.existsSync(path.join(root, 'outputs/testnet-revocation-probe-evidence.json')), 'Probe evidence already exists');
  const onchain = (await keyList(p.agent)).find(item => item.public_key === p.restrictedPublicKey);
  check(onchain && BigInt(onchain.access_key.nonce) === RESTRICTED_KEY_INITIAL_NONCE &&
    onchain.access_key.permission?.FunctionCall?.allowance === p.gasAllowanceYocto,
    'The restricted key has signed a transaction that landed since it was added; check the original probe instead of retrying');
  const found = await archivalTxStatus(original.hash, p.agent, { id: 'agentshield-revocation-lab', timeoutMs: 60000 }).then(() => true, () => false);
  check(!found, `The original probe ${original.hash} is on chain; record it instead of retrying`);
  console.log(JSON.stringify({ stage: 'RETRY_ALLOWED', original: original.hash, restrictedKeyNonce: String(onchain.access_key.nonce) }));
  await runProbe('probe-retry', { supersedes: original.hash, supersededBecause: 'never reached the chain' }, 70000000000000n);
}
async function runProbe(stage, extra = {}, gas = PROBE_GAS) {
  await common(); previous('revoke'); await restrictedStore();
  const status = await view('get_vault_status');
  check(status.mandate?.version === p.rejectedRequest.expected_version && status.mandate.revoked &&
    status.confirmed_total_yocto === '0' && status.pending_total_yocto === '0',
    'Isolated revocation state changed');
  const block = await rpc('block', { finality: 'final' });
  check(BigInt(p.rejectedRequest.expires_at_ns) > BigInt(block.header.timestamp_nanosec) + 60000000000n,
    'Probe expiry too close');
  const args = { recipient: p.rejectedRequest.recipient, amount_yocto: p.rejectedRequest.amount_yocto,
    nonce: p.rejectedRequest.nonce, expires_at_ns: p.rejectedRequest.expires_at_ns, expected_version: p.rejectedRequest.expected_version };
  const sent = await sendOnce(stage, p.agent, p.isolatedVault,
    [transactions.functionCall('request_payment', args, gas, 0n)], true);
  const tx = sent.tx;
  check(tx.transaction.public_key === p.restrictedPublicKey, 'Probe used another key');
  if (stage !== 'probe') check(BigInt(tx.transaction.nonce) === RESTRICTED_KEY_INITIAL_NONCE + 1n, 'Retry is not the key\'s first landed transaction');
  const rejected = tx.receipts_outcome.find(item => item.outcome?.executor_id === p.isolatedVault &&
    item.outcome?.logs?.includes('AGENTSHIELD_DECISION decision=REJECTED reason=REVOKED'));
  check(rejected?.outcome?.status?.SuccessValue !== undefined, 'No genuine REVOKED contract decision');
  const decision = JSON.parse(Buffer.from(rejected.outcome.status.SuccessValue, 'base64').toString('utf8'));
  check(decision.decision === 'REJECTED' && decision.reason === 'REVOKED', 'Decision differs');
  check(!tx.receipts.some(item => item.predecessor_id === p.isolatedVault &&
    item.receipt?.Action?.actions?.some(action => action.Transfer)), 'Revoked vault issued payout');
  const after = await view('get_vault_status');
  check(after.confirmed_total_yocto === '0' && after.pending_total_yocto === '0',
    'Revoked vault accounting changed');
  save('probe', sent, { decision, request: args, vaultTransferReceipts: 0,
    confirmedTotalYocto: after.confirmed_total_yocto, pendingTotalYocto: after.pending_total_yocto, ...extra });
}
async function main() {
  const stage = Object.keys(flags).find(name => process.argv.length === 3 && process.argv[2] === flags[name]);
  check(stage, `Use one separately approved stage flag: ${Object.values(flags).join(', ')}`);
  if (stage === 'deploy') await executeDeploy();
  else if (stage === 'deployCorrected') await executeDeploy(true);
  else if (stage === 'key') await executeKey();
  else if (stage === 'mandate') await executeMandate();
  else if (stage === 'revoke') await executeRevoke();
  else if (stage === 'recordRevoke') await recordRevoke();
  else if (stage === 'probeRetry') await executeProbeRetry();
  else if (stage === 'probeLowGas') await executeProbeLowGas();
  else await executeProbe();
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
