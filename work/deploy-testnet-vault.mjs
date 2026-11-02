import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { connect, keyStores, transactions, utils } from 'near-api-js';
import { testnetAccount, testnetStatus } from './near-testnet-rpc.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const configFile = path.join(root, 'deployment/testnet.local.json');
const wasmFile = path.join(root, 'contracts/vault/target/wasm32-unknown-unknown/release/agentshield_vault.wasm');
const credentialRoot = 'C:\\Users\\USER\\Documents\\Codex\\AgentShield-Secrets';
const evidenceFile = path.join(root, 'outputs/testnet-vault-deployment-evidence.json');
const expected = {
  ownerAccountId: 'agentshield-mag-1d2f78801994.testnet',
  vaultAccountId: 'vault.agentshield-mag-1d2f78801994.testnet',
  initialVaultBalanceYocto: '5000000000000000000000000',
  maximumTestPaymentYocto: '10000000000000000000000',
  wasmSha256Hex: '138b17e7f1a227b22352e2e638fd69e60e0ad95f7a4dd003d8cbd244f8ffbe09',
  codeHash: '2KHm9Waz7fQfQ2A1MWmHhVSwx7o7sm8p1KXBTVyggCqN',
};
const rpc = 'https://rpc.testnet.near.org';

async function query(method, params, timeoutMs = 20000) {
  const response = await fetch(rpc, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 'agentshield-deployment-verification', method, params }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`Testnet RPC returned HTTP ${response.status}`);
  return response.json();
}

async function finalizedTransaction(hash) {
  let lastError;
  for (let attempt = 0; attempt < 6; attempt++) {
    const payload = await query('tx', {
      tx_hash: hash, sender_account_id: expected.ownerAccountId, wait_until: 'FINAL',
    }, 20000);
    if (payload.result?.final_execution_status === 'FINAL') return payload.result;
    lastError = payload.error?.message ?? payload.result?.final_execution_status ?? 'unknown status';
    await new Promise(resolve => setTimeout(resolve, 1500));
  }
  throw new Error(`Finalized transaction could not be verified: ${lastError}`);
}

async function main() {
  if (process.argv.length !== 3 || process.argv[2] !== '--execute-approved-deployment') {
    throw new Error('Run only for the explicitly approved 5 test NEAR vault deployment with --execute-approved-deployment.');
  }
  if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') {
    throw new Error('TLS certificate verification must be enabled.');
  }
  const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  for (const [key, value] of Object.entries(expected)) {
    if (key in config && config[key] !== value) throw new Error(`Approved ${key} does not match local config.`);
  }
  if (config.network !== 'testnet') throw new Error('Only Testnet is approved.');
  const wasm = fs.readFileSync(wasmFile);
  const digest = crypto.createHash('sha256').update(wasm).digest('hex');
  if (digest !== expected.wasmSha256Hex) throw new Error('WASM differs from approved artifact.');
  const status = await testnetStatus();
  if (!status.healthy) throw new Error('Testnet RPC is not healthy.');
  const owner = await testnetAccount(expected.ownerAccountId);
  const vault = await testnetAccount(expected.vaultAccountId);
  if (!owner.found || BigInt(owner.balanceYocto) < 6_000_000_000_000_000_000_000_000n) {
    throw new Error('Owner account needs at least 6 test NEAR for transfer plus transaction costs.');
  }
  if (vault.found) throw new Error('Vault account already exists; no deployment was sent.');

  const keyStore = new keyStores.UnencryptedFileSystemKeyStore(credentialRoot);
  const keyPair = await keyStore.getKey('testnet', expected.ownerAccountId);
  if (!keyPair) throw new Error('Owner key is missing from the separate credential folder.');
  const publicKey = keyPair.getPublicKey().toString();
  const access = await query('query', {
    request_type: 'view_access_key', finality: 'final',
    account_id: expected.ownerAccountId, public_key: publicKey,
  });
  if (access.result?.permission !== 'FullAccess') throw new Error('Owner signing key is not a verified full-access key.');

  const near = await connect({ networkId: 'testnet', nodeUrl: rpc, keyStore });
  const signer = await near.account(expected.ownerAccountId);
  const actions = [
    transactions.createAccount(),
    transactions.transfer(BigInt(expected.initialVaultBalanceYocto)),
    transactions.deployContract(wasm),
    transactions.functionCall('initialize', {
      owner: expected.ownerAccountId, domain: 'agentshield:testnet:v1',
    }, 30_000_000_000_000n, 0n),
  ];
  const [hashBytes, signed] = await signer.signTransaction(expected.vaultAccountId, actions);
  const txHash = utils.serialize.base_encode(hashBytes);
  console.log(JSON.stringify({ stage: 'signed', transactionHash: txHash, signer: expected.ownerAccountId,
    receiver: expected.vaultAccountId, actions: ['CreateAccount', 'Transfer', 'DeployContract', 'FunctionCall:initialize'],
    transferYocto: expected.initialVaultBalanceYocto, initializeGas: '30000000000000', initializeDepositYocto: '0' }));

  try {
    await signer.connection.provider.sendTransactionUntil(signed, 'FINAL');
  } catch (error) {
    console.error(`Broadcast did not confirm finality for ${txHash}: ${error.message}`);
  }
  const result = await finalizedTransaction(txHash);
  if (result.transaction?.signer_id !== expected.ownerAccountId ||
      result.transaction?.receiver_id !== expected.vaultAccountId ||
      result.transaction?.actions?.length !== 4 ||
      result.status?.Failure ||
      result.receipts_outcome?.some(receipt => receipt.outcome?.status?.Failure)) {
    throw new Error(`Finalized transaction ${txHash} failed or does not match the approved action set.`);
  }
  const deployed = await testnetAccount(expected.vaultAccountId);
  if (!deployed.found || deployed.codeHash !== expected.codeHash) {
    throw new Error(`Finalized vault account or code hash does not match for ${txHash}.`);
  }
  const view = await query('query', {
    request_type: 'call_function', finality: 'final', account_id: expected.vaultAccountId,
    method_name: 'get_vault_status', args_base64: 'e30=',
  });
  if (!Array.isArray(view.result?.result)) throw new Error('Vault status view failed after deployment.');
  const vaultStatus = JSON.parse(Buffer.from(view.result.result).toString('utf8'));
  if (vaultStatus.owner !== expected.ownerAccountId || vaultStatus.domain !== 'agentshield:testnet:v1') {
    throw new Error('Vault initializer state does not match the approved owner/domain.');
  }
  const evidence = {
    network: 'testnet', finality: result.final_execution_status, transactionHash: txHash,
    signer: expected.ownerAccountId, vaultAccountId: expected.vaultAccountId,
    initialVaultBalanceYocto: expected.initialVaultBalanceYocto,
    expectedCodeHash: expected.codeHash, observedCodeHash: deployed.codeHash,
    vaultBalanceYocto: deployed.balanceYocto, vaultStorageUsageBytes: deployed.storageUsage,
    vaultBlockHeight: deployed.blockHeight, owner: vaultStatus.owner, domain: vaultStatus.domain,
    mandatePresent: vaultStatus.mandate !== null,
    receiptOutcomes: result.receipts_outcome.map(receipt => ({
      id: receipt.id, executorId: receipt.outcome?.executor_id, status: receipt.outcome?.status,
    })),
    explorerUrl: `https://testnet.nearblocks.io/txns/${txHash}`,
  };
  fs.writeFileSync(evidenceFile, JSON.stringify(evidence, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ stage: 'verified', evidenceFile, ...evidence }));
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
