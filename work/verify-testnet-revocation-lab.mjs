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
    restrictedKey: key ? { publicKey: key.public_key, permission: key.access_key.permission } : null };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  verifyRevocationLab().then(async proof => console.log(JSON.stringify({ ...proof, labStateNow: await revocationLabState() }, null, 2)))
    .catch(error => { console.error(`VERIFICATION FAILED: ${error.message}`); process.exitCode = 1; });
}
