import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { KeyPair } from '@near-js/crypto';
import { testnetAccount, testnetStatus } from './near-testnet-rpc.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const proposal = JSON.parse(fs.readFileSync(path.join(root, 'deployment/testnet-live-demo-proposal.json'), 'utf8'));
const deployment = JSON.parse(fs.readFileSync(path.join(root, 'outputs/testnet-vault-independent-verification.json'), 'utf8'));
const keyFile = 'C:\\Users\\USER\\Documents\\Codex\\AgentShield-Secrets\\testnet\\agentshield-agent-0359da1630bb.testnet.request-payment.json';
const rpc = 'https://rpc.testnet.near.org';
const DAY_NS = 86_400_000_000_000n;

function check(condition, message) { if (!condition) throw new Error(message); }

async function query(method, params) {
  const response = await fetch(rpc, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 'agentshield-live-demo-preflight', method, params }),
    signal: AbortSignal.timeout(15000),
  });
  check(response.ok, `Testnet RPC HTTP ${response.status}`);
  const payload = await response.json();
  check(!payload.error, `Testnet RPC error: ${payload.error?.message}`);
  return payload.result;
}

async function view(vaultAccountId, methodName) {
  const result = await query('query', {
    request_type: 'call_function', finality: 'final', account_id: vaultAccountId,
    method_name: methodName, args_base64: 'e30=',
  });
  check(Array.isArray(result?.result), `Contract ${methodName} view failed.`);
  return JSON.parse(Buffer.from(result.result).toString('utf8'));
}

async function main() {
  check(process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0', 'TLS certificate verification must be enabled.');
  check(proposal.network === 'testnet' && proposal.status === 'PROPOSED_NOT_SIGNED', 'Proposal state is invalid.');
  check(proposal.vaultAccountId === deployment.vaultAccountId && proposal.expectedCodeHash === deployment.codeHash,
    'Proposal does not match verified deployment.');
  check(proposal.ownerAccountId === deployment.owner, 'Owner differs from verified deployment.');
  check(proposal.agentAccountId !== proposal.ownerAccountId &&
    proposal.recipientAccountId !== proposal.agentAccountId &&
    proposal.recipientAccountId !== proposal.ownerAccountId, 'Role accounts must be separate.');
  const network = await testnetStatus();
  check(network.healthy, 'Testnet is not healthy.');
  const [vault, agent, recipient] = await Promise.all([
    testnetAccount(proposal.vaultAccountId),
    testnetAccount(proposal.agentAccountId),
    testnetAccount(proposal.recipientAccountId),
  ]);
  check(vault.found && agent.found && recipient.found, 'A role account is missing.');
  check(vault.codeHash === proposal.expectedCodeHash, 'Vault code hash changed.');
  const status = await view(proposal.vaultAccountId, 'get_vault_status');
  check(status.owner === proposal.ownerAccountId && status.mandate === null, 'Vault owner or mandate state changed.');
  const keys = await query('query', {
    request_type: 'view_access_key_list', finality: 'final', account_id: proposal.agentAccountId,
  });
  check(Array.isArray(keys?.keys) && keys.keys.length === 1 &&
    keys.keys[0].access_key?.permission === 'FullAccess', 'Agent lifecycle key state changed.');
  const limitedKey = KeyPair.fromString(JSON.parse(fs.readFileSync(keyFile, 'utf8')).private_key);
  check(limitedKey.getPublicKey().toString() === proposal.restrictedKey.publicKey, 'Stored limited key does not match proposal.');
  check(!keys.keys.some(key => key.public_key === proposal.restrictedKey.publicKey), 'Limited key is already onchain.');
  check(proposal.restrictedKey.signer === proposal.agentAccountId &&
    proposal.restrictedKey.receiverId === proposal.vaultAccountId &&
    proposal.restrictedKey.methodNames.length === 1 &&
    proposal.restrictedKey.methodNames[0] === 'request_payment' &&
    proposal.restrictedKey.allowanceYocto === '100000000000000000000000', 'Limited key scope changed.');
  const m = proposal.mandate;
  check(m.signer === proposal.ownerAccountId && m.method === 'set_mandate' &&
    m.attachedDepositYocto === '0' && m.gas === '30000000000000' &&
    m.agent === proposal.agentAccountId &&
    m.recipients.length === 1 && m.recipients[0] === proposal.recipientAccountId &&
    m.per_payment_yocto === '10000000000000000000000' &&
    m.daily_yocto === '20000000000000000000000' &&
    m.total_yocto === '50000000000000000000000' && m.expectedVersion === 1,
    'Owner mandate parameters changed.');
  const p = proposal.firstPayment;
  check(p.signer === proposal.agentAccountId && p.method === 'request_payment' &&
    p.attachedDepositYocto === '0' && p.gas === '70000000000000' &&
    p.recipient === proposal.recipientAccountId &&
    p.amount_yocto === '5000000000000000000000' &&
    /^[a-zA-Z0-9_]{8,64}$/.test(p.nonce) &&
    p.expires_at_ns === m.expires_at_ns && p.expected_version === 1,
    'First payment parameters changed.');
  check(BigInt(p.amount_yocto) <= BigInt(m.per_payment_yocto) &&
    BigInt(m.per_payment_yocto) <= BigInt(m.daily_yocto) &&
    BigInt(m.daily_yocto) <= BigInt(m.total_yocto) &&
    BigInt(m.total_yocto) < BigInt(status.available_yocto), 'Limits exceed mandate or available funds.');
  const block = await query('block', { finality: 'final' });
  const now = BigInt(block.header.timestamp_nanosec);
  const expiry = BigInt(m.expires_at_ns);
  check(expiry > now + DAY_NS && expiry <= now + 30n * DAY_NS, 'Proposed expiry is stale or beyond contract maximum.');
  const gasPrice = await query('gas_price', { finality: 'final' });
  const maxCallCost = BigInt(p.gas) * BigInt(gasPrice.gas_price);
  check(BigInt(proposal.restrictedKey.allowanceYocto) > maxCallCost * 6n,
    'Finite allowance cannot fund six maximum-gas demonstration calls at the current price.');
  console.log(JSON.stringify({
    state: 'READY_FOR_SEPARATE_AUTHORIZATION', vaultAccountId: proposal.vaultAccountId,
    codeHash: vault.codeHash, owner: status.owner, mandatePresent: false,
    agent: proposal.agentAccountId, agentKeyCount: keys.keys.length,
    limitedPublicKey: proposal.restrictedKey.publicKey, limitedKeyOnchain: false,
    limitedAllowanceYocto: proposal.restrictedKey.allowanceYocto,
    perPaymentYocto: m.per_payment_yocto, dailyYocto: m.daily_yocto,
    totalYocto: m.total_yocto, mandateExpiryNs: m.expires_at_ns,
    firstPaymentYocto: p.amount_yocto, firstPaymentRecipient: p.recipient,
    firstPaymentNonce: p.nonce, firstPaymentGas: p.gas,
    gasPriceYocto: gasPrice.gas_price, maxCallCostYoctoAtCurrentPrice: String(maxCallCost),
    vaultAvailableYocto: status.available_yocto, blockHeight: block.header.height,
  }, null, 2));
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
