// Rechecks the isolated revocation lab from the chain (read-only). Today that is the first attempt,
// which finalized FAILED on 2 Nov (outputs/testnet-revocation-deploy-failure.json): the transaction must
// be FINAL, fail at action 3 (initialize), and the isolated vault account must not exist because of it.
//   node --use-system-ca work/verify-testnet-revocation-lab.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ARCHIVAL_ENDPOINTS, archivalTxStatus, postRpc } from './near-testnet-archival.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const fail = why => { throw new Error(why); };

// Pure check of the finalized first attempt against its intent and the committed failure record.
export function checkFailedDeploy(tx, intent, failure) {
  if (tx.final_execution_status !== 'FINAL') fail('The first deployment is not FINAL');
  const t = tx.transaction;
  if (t?.hash !== intent.hash || t.signer_id !== intent.signer || t.receiver_id !== intent.receiver) fail('Transaction parties differ from the intent');
  if (t.actions?.length !== 4) fail('Not the four-action atomic deployment');
  const index = tx.status?.Failure?.ActionError?.index;
  if (index !== failure.failureActionIndex) fail(`Expected failure at action ${failure.failureActionIndex}, got ${index}`);
  return { failedActionIndex: index, kind: Object.keys(tx.status.Failure.ActionError.kind ?? {})[0] ?? null };
}

export async function verifyRevocationLab() {
  if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') fail('TLS verification must be enabled');
  const intent = read('outputs/testnet-revocation-deploy-intent.json');
  const failure = read('outputs/testnet-revocation-deploy-failure.json');
  // Ask each archival node separately so a failure names the node and its exact answer.
  const answers = await Promise.all(ARCHIVAL_ENDPOINTS.map(endpoint =>
    archivalTxStatus(intent.hash, intent.signer, { id: 'agentshield-revocation-proof', endpoints: [endpoint], timeoutMs: 45000 })
      .then(r => ({ endpoint: r.endpoint, ok: true, ...checkFailedDeploy(r.result, intent, failure) }))
      .catch(error => ({ endpoint: new URL(endpoint).host, ok: false, error: error.message }))));
  const passed = answers.filter(a => a.ok);
  if (!passed.length) fail(`No archival node confirmed the failed deployment: ${JSON.stringify(answers)}`);
  const account = await postRpc('https://rpc.testnet.near.org', 'agentshield-revocation-proof', 'query',
    { request_type: 'view_account', finality: 'final', account_id: intent.receiver }).then(() => true, error => {
      if (/UNKNOWN_ACCOUNT|does not exist/i.test(error.message)) return false;
      throw error;
    });
  return { network: 'testnet', verification: 'PASS', stage: 'deploy', status: 'FAILED', transactionHash: intent.hash,
    failedActionIndex: passed[0].failedActionIndex, failureKind: passed[0].kind, isolatedVaultExistsNow: account,
    archivalAnswers: answers, checkedAt: new Date().toISOString() };
}

const decode = b64 => JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
const logsOf = tx => tx.receipts_outcome.flatMap(item => item.outcome?.logs ?? []);
const succeeded = tx => tx.final_execution_status === 'FINAL' && !tx.status?.Failure && !tx.receipts_outcome.some(item => item.outcome?.status?.Failure);
const onlyCall = (tx, method) => {
  const call = tx.transaction.actions?.length === 1 ? tx.transaction.actions[0].FunctionCall : null;
  if (call?.method_name !== method || call.deposit !== '0') fail(`Not a single zero-deposit ${method} call`);
  return decode(call.args);
};

// Pure checks of each finalized lab transaction against the committed proposal.
export const STAGE_CHECKS = Object.freeze({
  'deploy-corrected': (tx, lab) => {
    const a = tx.transaction.actions;
    const init = a?.[3]?.FunctionCall;
    if (a?.length !== 4 || a[0] !== 'CreateAccount' || a[1]?.Transfer?.deposit !== lab.fundingYocto || !a[2]?.DeployContract ||
      init?.method_name !== 'initialize') fail('Not the atomic create, fund, deploy and initialize');
    const args = decode(init.args);
    if (args.owner !== lab.owner || args.domain !== lab.domain) fail('Initialized with a different owner or domain');
    return { fundingYocto: a[1].Transfer.deposit, domain: args.domain };
  },
  key: (tx, lab) => {
    const add = tx.transaction.actions?.length === 1 ? tx.transaction.actions[0].AddKey : null;
    const fc = add?.access_key?.permission?.FunctionCall;
    if (add?.public_key !== lab.restrictedPublicKey || fc?.receiver_id !== lab.isolatedVault || fc.allowance !== lab.gasAllowanceYocto ||
      fc.method_names?.length !== 1 || fc.method_names[0] !== 'request_payment') fail('The added key is not limited to the lab vault\'s request_payment');
    return { publicKey: add.public_key, receiver: fc.receiver_id, methods: fc.method_names };
  },
  mandate: (tx, lab) => {
    const args = onlyCall(tx, 'set_mandate');
    for (const [k, v] of Object.entries(lab.mandate)) if (args[k] !== v) fail(`Mandate ${k} differs from the proposal`);
    if (args.agent !== lab.agent || args.recipients?.length !== 1 || args.recipients[0] !== lab.recipient) fail('Mandate agent or recipient differs');
    if (!logsOf(tx).includes('AGENTSHIELD_POLICY version=1 action=SET')) fail('Version 1 SET log missing');
    return { version: 1 };
  },
  revoke: tx => {
    onlyCall(tx, 'revoke');
    if (!logsOf(tx).includes('AGENTSHIELD_POLICY version=2 action=REVOKE')) fail('REVOKE log missing');
    return { version: 2 };
  },
  probe: (tx, lab) => {
    if (tx.transaction.public_key !== lab.restrictedPublicKey) fail('Probe not signed with the lab\'s restricted agent key');
    const args = onlyCall(tx, 'request_payment');
    const r = lab.rejectedRequest;
    if (args.recipient !== r.recipient || args.amount_yocto !== r.amount_yocto || args.nonce !== r.nonce ||
      args.expires_at_ns !== r.expires_at_ns || args.expected_version !== r.expected_version) fail('Probe arguments differ from the proposal');
    const rejected = tx.receipts_outcome.find(item => item.outcome?.executor_id === lab.isolatedVault &&
      item.outcome?.logs?.includes(`AGENTSHIELD_DECISION decision=REJECTED reason=${r.expectedReason}`));
    if (rejected?.outcome?.status?.SuccessValue === undefined) fail('No REVOKED contract decision');
    const decision = decode(rejected.outcome.status.SuccessValue);
    if (decision.decision !== 'REJECTED' || decision.reason !== r.expectedReason) fail(`Contract decided ${JSON.stringify(decision)}`);
    const transfers = tx.receipts.filter(item => item.predecessor_id === lab.isolatedVault && item.receipt?.Action?.actions?.some(x => x.Transfer));
    if (transfers.length) fail('The revoked vault issued a transfer');
    return { decision: decision.decision, reason: decision.reason, expectedVersion: args.expected_version, vaultTransferReceiptCount: 0 };
  },
});
export const LAB_STAGES = Object.freeze(Object.keys(STAGE_CHECKS));

// Rechecks every lab stage that has a committed intent, from the chain, in order.
export async function verifyRevocationLabStages() {
  const lab = read('deployment/testnet-revocation-lab-proposal.json');
  const results = [];
  for (const stage of LAB_STAGES) {
    const file = `outputs/testnet-revocation-${stage}-intent.json`;
    if (!fs.existsSync(path.join(root, file))) break;
    const intent = read(file);
    try {
      const { result: tx, endpoint } = await archivalTxStatus(intent.hash, intent.signer, { id: 'agentshield-revocation-proof', timeoutMs: 45000 });
      if (!succeeded(tx)) fail(`${stage} ${intent.hash} did not succeed`);
      if (tx.transaction.signer_id !== intent.signer || tx.transaction.receiver_id !== intent.receiver) fail(`${stage}: parties differ from the intent`);
      results.push({ stage, ok: true, transactionHash: intent.hash, signer: intent.signer, rpc: endpoint, ...STAGE_CHECKS[stage](tx, lab) });
    } catch (error) {
      results.push({ stage, ok: false, transactionHash: intent.hash, error: error.message });
    }
  }
  return results;
}

// Current state of the isolated lab vault, read-only: code, mandate, revocation, accounting, and the agent's
// restricted key for it. Reports what exists; it does not decide what should.
export async function revocationLabState() {
  const lab = read('deployment/testnet-revocation-lab-proposal.json');
  const state = (method, params) => postRpc('https://rpc.testnet.near.org', 'agentshield-revocation-state', method, params);
  const view = (method, args = {}) => state('query', { request_type: 'call_function', finality: 'final', account_id: lab.isolatedVault,
    method_name: method, args_base64: Buffer.from(JSON.stringify(args)).toString('base64') })
    .then(r => JSON.parse(Buffer.from(r.result).toString('utf8')));
  const account = await state('query', { request_type: 'view_account', finality: 'final', account_id: lab.isolatedVault }).catch(() => null);
  if (!account) return { isolatedVault: lab.isolatedVault, exists: false };
  const [status, keys, agentKeys] = await Promise.all([view('get_vault_status'),
    state('query', { request_type: 'view_access_key_list', finality: 'final', account_id: lab.isolatedVault }),
    state('query', { request_type: 'view_access_key_list', finality: 'final', account_id: lab.agent })]);
  const key = agentKeys.keys.find(k => k.public_key === lab.restrictedPublicKey);
  return { isolatedVault: lab.isolatedVault, exists: true, codeHash: account.code_hash, codeMatches: account.code_hash === lab.codeHash,
    vaultAccessKeys: keys.keys.length, owner: status.owner, domain: status.domain, mandate: status.mandate,
    confirmedTotalYocto: status.confirmed_total_yocto, pendingTotalYocto: status.pending_total_yocto,
    restrictedKey: key ? { publicKey: key.public_key, nonce: key.access_key.nonce, permission: key.access_key.permission } : null };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  verifyRevocationLab().then(async proof => {
    const stages = await verifyRevocationLabStages();
    console.log(JSON.stringify({ ...proof, stages, labStateNow: await revocationLabState() }, null, 2));
    if (stages.some(s => !s.ok)) { console.error(`VERIFICATION FAILED: ${stages.filter(s => !s.ok).map(s => `${s.stage}: ${s.error}`).join('; ')}`); process.exitCode = 1; }
  })
    .catch(error => { console.error(`VERIFICATION FAILED: ${error.message}`); process.exitCode = 1; });
}
