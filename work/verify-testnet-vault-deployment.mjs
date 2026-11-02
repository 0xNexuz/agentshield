import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { utils } from 'near-api-js';
import { testnetStorageCost, testnetStatus } from './near-testnet-rpc.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'deployment/testnet.local.json'), 'utf8'));
const deployment = JSON.parse(fs.readFileSync(path.join(root, 'outputs/testnet-vault-deployment-evidence.json'), 'utf8'));
const wasm = fs.readFileSync(path.join(root, 'contracts/vault/target/wasm32-unknown-unknown/release/agentshield_vault.wasm'));
const wasmDigest = crypto.createHash('sha256').update(wasm).digest();
const expectedCodeHash = utils.serialize.base_encode(wasmDigest);
const reserve = 200_000_000_000_000_000_000_000n;
const rpc = 'https://rpc.testnet.near.org';

function check(condition, message) {
  if (!condition) throw new Error(message);
}

async function query(method, params) {
  const response = await fetch(rpc, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 'agentshield-independent-vault-verifier', method, params }),
    signal: AbortSignal.timeout(20000),
  });
  check(response.ok, `RPC HTTP ${response.status}`);
  const payload = await response.json();
  check(!payload.error, `RPC ${method} error: ${payload.error?.message}`);
  return payload.result;
}

async function main() {
  check(process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0', 'TLS certificate verification must be enabled.');
  check(config.network === 'testnet' && deployment.network === 'testnet', 'Wrong network.');
  check(deployment.signer === config.ownerAccountId && deployment.vaultAccountId === config.vaultAccountId,
    'Deployment evidence account mismatch.');
  check(deployment.expectedCodeHash === expectedCodeHash, 'Local artifact hash differs from deployment evidence.');
  const network = await testnetStatus();
  check(network.healthy, 'Testnet RPC is not healthy.');
  const tx = await query('tx', {
    tx_hash: deployment.transactionHash, sender_account_id: config.ownerAccountId, wait_until: 'FINAL',
  });
  check(tx.final_execution_status === 'FINAL' && !tx.status?.Failure, 'Transaction is not finalized successfully.');
  check(tx.transaction?.signer_id === config.ownerAccountId && tx.transaction?.receiver_id === config.vaultAccountId,
    'Transaction signer or receiver differs.');
  const actions = tx.transaction?.actions;
  check(Array.isArray(actions) && actions.length === 4, 'Expected four transaction actions.');
  check(actions[0] === 'CreateAccount', 'First action must create the account.');
  check(actions[1]?.Transfer?.deposit === config.initialVaultBalanceYocto, 'Transfer differs from approved amount.');
  check(actions[2]?.DeployContract?.code === wasmDigest.toString('base64'), 'Deployed code digest differs from artifact.');
  const call = actions[3]?.FunctionCall;
  check(call?.method_name === 'initialize' && call?.deposit === '0' && Number(call?.gas) === 30_000_000_000_000,
    'Initializer call differs from approved method, gas or deposit.');
  const args = JSON.parse(Buffer.from(call.args, 'base64').toString('utf8'));
  check(args.owner === config.ownerAccountId && args.domain === 'agentshield:testnet:v1',
    'Initializer arguments differ.');
  check(tx.receipts_outcome?.length >= 1 && tx.receipts_outcome.every(receipt =>
    receipt.outcome?.status && !receipt.outcome.status.Failure &&
    ('SuccessValue' in receipt.outcome.status || 'SuccessReceiptId' in receipt.outcome.status)),
    'One or more execution receipts failed or are missing.');

  const account = await query('query', {
    request_type: 'view_account', finality: 'final', account_id: config.vaultAccountId,
  });
  check(account.code_hash === expectedCodeHash, 'Finalized vault code hash differs.');
  check(account.amount === config.initialVaultBalanceYocto, 'Vault account balance differs from initial transfer.');
  const keys = await query('query', {
    request_type: 'view_access_key_list', finality: 'final', account_id: config.vaultAccountId,
  });
  check(Array.isArray(keys.keys) && keys.keys.length === 0, 'Vault unexpectedly has an access key.');
  const view = await query('query', {
    request_type: 'call_function', finality: 'final', account_id: config.vaultAccountId,
    method_name: 'get_vault_status', args_base64: 'e30=',
  });
  check(Array.isArray(view.result), 'Vault status view failed.');
  const vaultStatus = JSON.parse(Buffer.from(view.result).toString('utf8'));
  check(vaultStatus.owner === config.ownerAccountId && vaultStatus.domain === 'agentshield:testnet:v1',
    'Vault state owner or domain differs.');
  check(vaultStatus.mandate === null, 'Unexpected mandate already exists.');
  const protocol = await testnetStorageCost();
  const storageCost = BigInt(account.storage_usage) * BigInt(protocol.storageAmountPerByteYocto);
  const calculatedAvailable = BigInt(account.amount) - storageCost - reserve;
  check(vaultStatus.available_yocto === String(calculatedAvailable), 'Contract available-balance accounting differs.');

  const verification = {
    network: 'testnet', transactionHash: deployment.transactionHash, finality: tx.final_execution_status,
    signer: config.ownerAccountId, vaultAccountId: config.vaultAccountId,
    actionOrder: ['CreateAccount', 'Transfer', 'DeployContract', 'FunctionCall:initialize'],
    transferYocto: actions[1].Transfer.deposit, initializeGas: String(call.gas), initializeDepositYocto: call.deposit,
    receiptIds: tx.receipts_outcome.map(receipt => receipt.id),
    wasmSha256Hex: wasmDigest.toString('hex'), codeHash: account.code_hash,
    vaultBalanceYocto: account.amount, vaultStorageUsageBytes: account.storage_usage,
    storageCostYocto: String(storageCost), operatingReserveYocto: String(reserve),
    availableYocto: vaultStatus.available_yocto, owner: vaultStatus.owner, domain: vaultStatus.domain,
    vaultAccessKeyCount: keys.keys.length, mandatePresent: false,
    accountBlockHeight: account.block_height, vaultViewBlockHeight: view.block_height,
    explorerUrl: `https://testnet.nearblocks.io/txns/${deployment.transactionHash}`,
  };
  if (process.argv.includes('--write-evidence')) {
    const output = path.join(root, 'outputs/testnet-vault-independent-verification.json');
    fs.writeFileSync(output, JSON.stringify(verification, null, 2) + '\n');
    console.log(JSON.stringify({ ...verification, evidenceFile: output }));
  } else {
    console.log(JSON.stringify(verification));
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
