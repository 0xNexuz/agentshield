import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { KeyPair } from 'near-api-js';
import { testnetAccount, testnetStatus, testnetStorageCost } from './near-testnet-rpc.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const proposal = JSON.parse(fs.readFileSync(path.join(root, 'deployment/testnet-revocation-lab-proposal.json'), 'utf8'));
const wasm = fs.readFileSync(path.join(root, 'deployment/agentshield_vault.wasm'));
const secretFile = 'C:\\Users\\USER\\Documents\\Codex\\AgentShield-Secrets\\testnet\\agentshield-agent-0359da1630bb.testnet.revocation-request-payment.json';
const rpcUrl = 'https://rpc.testnet.near.org';
function check(ok, why) { if (!ok) throw new Error(why); }
async function rpc(method, params) {
  const response = await fetch(rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 'agentshield-revocation-preflight', method, params }),
    signal: AbortSignal.timeout(15000) });
  check(response.ok, `RPC HTTP ${response.status}`);
  const payload = await response.json();
  check(!payload.error, `RPC ${method}: ${payload.error?.message}`);
  return payload.result;
}
async function main() {
  check(process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0', 'TLS verification must be enabled');
  check(proposal.network === 'testnet' && proposal.status === 'PROPOSED_NOT_SIGNED', 'Proposal status changed');
  check(proposal.isolatedVault === 'revocation.agentshield-mag-1d2f78801994.testnet' &&
    proposal.isolatedVault.endsWith(`.${proposal.owner}`), 'Isolated vault must be owner subaccount');
  check(proposal.domain === 'agentshield:testnet:v1', 'Domain must match the deployed contract initializer');
  check(proposal.agent !== proposal.owner && proposal.recipient !== proposal.owner &&
    proposal.recipient !== proposal.agent, 'Role separation changed');
  const digest = crypto.createHash('sha256').update(wasm).digest('hex');
  check(digest === proposal.wasmSha256Hex, 'WASM SHA256 differs');
  const restricted = JSON.parse(fs.readFileSync(secretFile, 'utf8'));
  check(KeyPair.fromString(restricted.private_key).getPublicKey().toString() === proposal.restrictedPublicKey,
    'Restricted key file differs from public proposal');
  check(proposal.restrictedReceiver === proposal.isolatedVault &&
    proposal.restrictedMethods.length === 1 && proposal.restrictedMethods[0] === 'request_payment' &&
    proposal.gasAllowanceYocto === '20000000000000000000000', 'Restricted permission changed');
  check(proposal.fundingYocto === '4000000000000000000000000' &&
    proposal.mandate.per_payment_yocto === '10000000000000000000000' &&
    proposal.mandate.daily_yocto === '20000000000000000000000' &&
    proposal.mandate.total_yocto === '20000000000000000000000', 'Funding or policy changed');
  check(proposal.rejectedRequest.recipient === proposal.recipient &&
    proposal.rejectedRequest.amount_yocto === '5000000000000000000000' &&
    proposal.rejectedRequest.expectedReason === 'REVOKED' &&
    proposal.rejectedRequest.expected_version === 2 &&
    proposal.rejectedRequest.expires_at_ns === proposal.mandate.expires_at_ns, 'Probe changed');
  const [network, owner, agent, recipient, isolated, existing, storage, block, gas] = await Promise.all([
    testnetStatus(), testnetAccount(proposal.owner), testnetAccount(proposal.agent),
    testnetAccount(proposal.recipient), testnetAccount(proposal.isolatedVault),
    testnetAccount('vault.agentshield-mag-1d2f78801994.testnet'), testnetStorageCost(),
    rpc('block', { finality: 'final' }), rpc('gas_price', { finality: 'final' }),
  ]);
  check(network.healthy && owner.found && agent.found && recipient.found && !isolated.found,
    'Network unhealthy, role account missing, or isolated account already exists');
  check(existing.codeHash === proposal.codeHash, 'Original vault code hash changed');
  const minimum = (BigInt(wasm.length) + 400n) * BigInt(storage.storageAmountPerByteYocto) +
    200000000000000000000000n + 10000000000000000000000n + 250000000000000000000000n;
  check(BigInt(proposal.fundingYocto) > minimum, 'Funding is insufficient for code storage and reserve');
  check(BigInt(owner.balanceYocto) > BigInt(proposal.fundingYocto) + 500000000000000000000000n,
    'Owner lacks 0.5 test NEAR setup/gas headroom');
  // The network checks a key's allowance against prepaid gas at a pessimistic price, about 10x the current one.
  check(BigInt(proposal.gasAllowanceYocto) > 13000000000000n * BigInt(gas.gas_price) * 11n,
    'Gas allowance cannot cover one 10 Tgas probe at the pessimistic gas price');
  const remaining = BigInt(proposal.mandate.expires_at_ns) - BigInt(block.header.timestamp_nanosec);
  check(remaining > 86400000000000n && remaining <= 30n * 86400000000000n,
    'Mandate expiry is stale or too distant');
  console.log(JSON.stringify({ state: 'READY_FOR_SEPARATE_AUTHORIZATION', isolatedVault: proposal.isolatedVault,
    isolatedAccountExists: false, fundingYocto: proposal.fundingYocto, codeHash: proposal.codeHash,
    ownerBalanceYocto: owner.balanceYocto, estimatedMinimumFundingYocto: String(minimum),
    restrictedPublicKey: proposal.restrictedPublicKey, gasAllowanceYocto: proposal.gasAllowanceYocto,
    mandate: proposal.mandate, rejectedRequest: proposal.rejectedRequest, blockHeight: block.header.height }, null, 2));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
