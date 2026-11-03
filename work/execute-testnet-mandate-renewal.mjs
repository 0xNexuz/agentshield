// One approved Testnet renewal only. An existing intent file forbids another signature.
// If broadcast or finality is uncertain, inspect the recorded hash; never sign again.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect, keyStores, transactions, utils } from 'near-api-js';
import { checkRenewal } from './check-mandate-renewal.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const proposalFile = path.join(root, 'deployment/testnet-mandate-renewal-proposal.json');
const proposal = JSON.parse(fs.readFileSync(proposalFile, 'utf8'));
const credentialRoot = 'C:\\Users\\USER\\Documents\\Codex\\AgentShield-Secrets';
const intentFile = path.join(root, 'outputs/testnet-mandate-renewal-intent.json');
const evidenceFile = path.join(root, 'outputs/testnet-mandate-renewal-evidence.json');
const rpc = 'https://rpc.testnet.near.org';
const required = (condition, message) => { if (!condition) throw new Error(message); };

async function query(method, params) {
  const response = await fetch(rpc, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 'agentshield-renewal-once', method, params }),
    signal: AbortSignal.timeout(20000),
  });
  required(response.ok, `RPC HTTP ${response.status}`);
  const body = await response.json();
  required(!body.error, `RPC ${method}: ${body.error?.message}`);
  return body.result;
}

async function finalized(hash, signer) {
  let last = 'not found';
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      const result = await query('EXPERIMENTAL_tx_status',
        { tx_hash: hash, sender_account_id: signer, wait_until: 'FINAL' });
      if (result?.final_execution_status === 'FINAL') return result;
      last = result?.final_execution_status ?? 'unknown';
    } catch (error) { last = error.message; }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  throw new Error(`Finality uncertain for ${hash}; inspect that hash before any further action: ${last}`);
}

async function main() {
  required(process.argv.length === 3 && process.argv[2] === '--execute-approved-renewal',
    'Specify --execute-approved-renewal for the one approved transaction');
  required(process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0', 'TLS verification must be enabled');
  required(!fs.existsSync(intentFile), `Intent already exists at ${intentFile}; refusing to sign again`);
  required(!fs.existsSync(evidenceFile), `Evidence already exists at ${evidenceFile}; refusing to sign again`);
  required(proposal.network === 'testnet' && proposal.method === 'set_mandate' &&
    proposal.ownerAccountId === 'agentshield-mag-1d2f78801994.testnet' &&
    proposal.vaultAccountId === 'vault.agentshield-mag-1d2f78801994.testnet' &&
    proposal.proposedExpiryNs === '1795996800000000000' &&
    proposal.args.expires_at_ns === proposal.proposedExpiryNs &&
    proposal.gas === '30000000000000' && proposal.attachedDepositYocto === '0',
    'Proposal differs from the exact owner authorization');

  const store = new keyStores.UnencryptedFileSystemKeyStore(credentialRoot);
  const key = await store.getKey('testnet', proposal.ownerAccountId);
  required(key, `Owner credential missing outside the repository for ${proposal.ownerAccountId}`);
  const observedKeys = await query('query', {
    request_type: 'view_access_key_list', finality: 'final', account_id: proposal.ownerAccountId,
  });
  required(observedKeys.keys?.some(item => item.public_key === key.getPublicKey().toString() &&
    item.access_key.permission === 'FullAccess'), 'Owner credential does not match a current full-access key');

  const near = await connect({ networkId: 'testnet', nodeUrl: rpc, keyStore: store });
  const signer = await near.account(proposal.ownerAccountId);
  // This is the final chain-state check immediately before creating the signature.
  const preflight = await checkRenewal();
  required(preflight.verification === 'PASS' && preflight.currentVersion === 1 &&
    preflight.proposedVersion === 2 && preflight.proposedExpiryNs === '1795996800000000000' &&
    preflight.unchangedPolicy === true && preflight.currentPaused === false,
    'Renewal preflight differs from the approved version, expiry, or policy');

  const args = { ...proposal.args, recipients: [...proposal.args.recipients] };
  const action = transactions.functionCall(proposal.method, args, BigInt(proposal.gas),
    BigInt(proposal.attachedDepositYocto));
  // Claim the intent path before signing. A crash leaves this guard in place.
  const intentFd = fs.openSync(intentFile, 'wx', 0o600);
  let hash;
  let signed;
  try {
    const [hashBytes, signedTransaction] = await signer.signTransaction(proposal.vaultAccountId, [action]);
    hash = utils.serialize.base_encode(hashBytes);
    signed = signedTransaction;
    const intent = {
      network: 'testnet', transactionHash: hash, signer: proposal.ownerAccountId,
      receiver: proposal.vaultAccountId, method: proposal.method, args,
      gas: proposal.gas, deposit: proposal.attachedDepositYocto,
      createdAt: new Date().toISOString(),
    };
    fs.writeFileSync(intentFd, JSON.stringify(intent, null, 2) + '\n');
    fs.fsyncSync(intentFd);
  } finally { fs.closeSync(intentFd); }
  console.log(JSON.stringify({ stage: 'SIGNED_INTENT', transactionHash: hash, intentFile }));

  try { await signer.connection.provider.sendTransactionUntil(signed, 'FINAL'); }
  catch (error) { console.error(`Broadcast response uncertain for ${hash}: ${error.message}`); }
  const result = await finalized(hash, proposal.ownerAccountId);
  const call = result.transaction?.actions?.[0]?.FunctionCall;
  const recordedArgs = call?.args && JSON.parse(Buffer.from(call.args, 'base64').toString('utf8'));
  const transactionMatches = result.transaction?.signer_id === proposal.ownerAccountId &&
    result.transaction?.receiver_id === proposal.vaultAccountId &&
    result.transaction?.actions?.length === 1 && call?.method_name === proposal.method &&
    BigInt(call.gas) === BigInt(proposal.gas) &&
    BigInt(call.deposit) === BigInt(proposal.attachedDepositYocto) &&
    JSON.stringify(recordedArgs) === JSON.stringify(args);
  const receiptOutcomes = (result.receipts_outcome ?? []).map(item => ({
    id: item.id, executorId: item.outcome?.executor_id,
    status: item.outcome?.status, logs: item.outcome?.logs ?? [],
  }));
  const evidence = {
    network: 'testnet', transactionHash: hash,
    finalExecutionStatus: result.final_execution_status, status: result.status,
    transactionMatches, signer: result.transaction?.signer_id,
    receiver: result.transaction?.receiver_id, receipts: result.receipts ?? [],
    receiptOutcomes, logs: receiptOutcomes.flatMap(item => item.logs),
    explorerUrl: `https://testnet.nearblocks.io/txns/${hash}`,
    checkedAt: new Date().toISOString(),
  };
  fs.writeFileSync(evidenceFile, JSON.stringify(evidence, null, 2) + '\n', { flag: 'wx' });
  required(transactionMatches, `Final transaction ${hash} differs from the signed proposal`);
  required(!result.status?.Failure && !receiptOutcomes.some(item => item.status?.Failure),
    `Final transaction ${hash} or a receipt failed`);
  console.log(JSON.stringify({ stage: 'FINALIZED', transactionHash: hash,
    status: result.status, evidenceFile }));
}

main().catch(error => { console.error(`RENEWAL STOPPED: ${error.message}`); process.exitCode = 1; });
