import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const proposal = JSON.parse(fs.readFileSync(path.join(root, 'deployment/testnet-mandate-renewal-proposal.json')));
const original = JSON.parse(fs.readFileSync(path.join(root, 'deployment/testnet-live-demo-proposal.json')));
const fail = (message) => { throw new Error(message); };
const expect = (condition, message) => { if (!condition) fail(message); };

async function query(params) {
  const response = await fetch('https://rpc.testnet.near.org', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 'agentshield-renewal-readonly', method: 'query', params }),
    signal: AbortSignal.timeout(20000),
  });
  expect(response.ok, `RPC HTTP ${response.status}`);
  const data = await response.json();
  expect(!data.error, `RPC error: ${data.error?.message}`);
  return data.result;
}

export async function checkRenewal() {
  expect(process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0', 'TLS verification must be enabled');
  expect(proposal.status === 'PROPOSED_NOT_SIGNED' && proposal.network === 'testnet', 'Proposal status/network differs');
  expect(proposal.vaultAccountId === original.vaultAccountId &&
    proposal.ownerAccountId === original.ownerAccountId &&
    proposal.expectedCodeHash === original.expectedCodeHash, 'Vault identity differs');
  expect(proposal.method === 'set_mandate' && proposal.attachedDepositYocto === '0' &&
    proposal.gas === '30000000000000', 'Call method, deposit or gas differs');
  for (const field of ['agent', 'recipients', 'per_payment_yocto', 'daily_yocto', 'total_yocto']) {
    expect(JSON.stringify(proposal.args[field]) === JSON.stringify(original.mandate[field]), `${field} differs`);
  }
  expect(proposal.args.expires_at_ns === proposal.proposedExpiryNs &&
    BigInt(proposal.proposedExpiryNs) > BigInt(proposal.currentExpiryNs), 'Expiry is not extended');
  const [account, result] = await Promise.all([
    query({ request_type: 'view_account', finality: 'final', account_id: proposal.vaultAccountId }),
    query({ request_type: 'call_function', finality: 'final', account_id: proposal.vaultAccountId,
      method_name: 'get_vault_status', args_base64: 'e30=' }),
  ]);
  expect(account.code_hash === proposal.expectedCodeHash, 'Vault code hash differs');
  const status = JSON.parse(Buffer.from(result.result).toString('utf8'));
  const mandate = status.mandate;
  expect(status.owner === proposal.ownerAccountId && mandate && !mandate.revoked, 'Owner or mandate state differs');
  expect(mandate.version === proposal.expectedCurrentVersion &&
    mandate.expires_at_ns === proposal.currentExpiryNs, 'Current version or expiry differs');
  for (const field of ['agent', 'recipients', 'per_payment_yocto', 'daily_yocto', 'total_yocto']) {
    expect(JSON.stringify(mandate[field]) === JSON.stringify(proposal.args[field]), `Current ${field} differs`);
  }
  expect(BigInt(proposal.proposedExpiryNs) <= BigInt(Date.now() + 30 * 86400000) * 1000000n,
    'Proposed expiry exceeds contract 30-day limit');
  expect(BigInt(proposal.proposedExpiryNs) > BigInt(Date.now()) * 1000000n,
    'Proposed expiry is not in the future');
  expect(BigInt(proposal.args.total_yocto) >=
    BigInt(status.confirmed_total_yocto) + BigInt(status.pending_total_yocto), 'Total below committed spend');
  return {
    verification: 'PASS', action: 'READ_ONLY_PREFLIGHT', signed: false,
    vaultAccountId: proposal.vaultAccountId, currentVersion: mandate.version,
    proposedVersion: mandate.version + 1, currentExpiryNs: mandate.expires_at_ns,
    proposedExpiryNs: proposal.proposedExpiryNs, unchangedPolicy: true,
    currentPaused: mandate.paused, renewalWouldUnpause: Boolean(mandate.paused),
    confirmedTotalYocto: status.confirmed_total_yocto,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  checkRenewal().then(result => console.log(JSON.stringify(result, null, 2)))
    .catch(error => { console.error(`RENEWAL PREFLIGHT FAILED: ${error.message}`); process.exitCode = 1; });
}
