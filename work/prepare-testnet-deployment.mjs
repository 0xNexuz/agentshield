import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { isTestnetAccountId, testnetAccount, testnetStatus, testnetStorageCost } from './near-testnet-rpc.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifact = path.join(root, 'contracts/vault/target/wasm32-unknown-unknown/release/agentshield_vault.wasm');
const configFile = process.argv[2] && path.resolve(process.argv[2]);
const checkLive = process.argv.includes('--check-live');
if (!configFile || !configFile.startsWith(path.join(root, 'deployment') + path.sep)) {
  throw new Error('Pass a JSON config inside deployment/, e.g. deployment/testnet.local.json.');
}
const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
if (Object.keys(config).some(key => /secret|private|seed|mnemonic|password|credential/i.test(key))) {
  throw new Error('Deployment config must contain public IDs and amounts only, never keys or secrets.');
}
if (config.network !== 'testnet') throw new Error('Only NEAR testnet is supported by this milestone.');
const roles = ['ownerAccountId', 'agentAccountId', 'recipientAccountId', 'vaultAccountId'];
for (const role of roles) {
  if (!isTestnetAccountId(config[role])) throw new Error(`${role} must be a valid testnet account ID.`);
}
if (new Set(roles.map(role => config[role])).size !== roles.length) throw new Error('All four role accounts must be distinct.');
if (!config.vaultAccountId.endsWith(`.${config.ownerAccountId}`)) {
  throw new Error('Vault must be a dedicated subaccount of the owner for atomic creation and initialization.');
}
for (const key of ['initialVaultBalanceYocto', 'maximumTestPaymentYocto']) {
  if (!/^[1-9][0-9]*$/.test(config[key])) throw new Error(`${key} must be a positive integer string.`);
}
const initial = BigInt(config.initialVaultBalanceYocto);
const maximum = BigInt(config.maximumTestPaymentYocto);
const reserve = 200_000_000_000_000_000_000_000n;
const setupStorageMargin = 250_000_000_000_000_000_000_000n;
if (initial <= reserve + maximum) throw new Error('Initial balance must exceed the 0.2 NEAR reserve plus the maximum test payment and storage costs.');
if (initial > 2n ** 128n - 1n || maximum > 2n ** 128n - 1n) throw new Error('Amount exceeds u128.');
const wasm = fs.readFileSync(artifact);
const digest = crypto.createHash('sha256').update(wasm).digest();
const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
let value = BigInt(`0x${digest.toString('hex')}`);
let codeHash = '';
while (value > 0n) { codeHash = alphabet[Number(value % 58n)] + codeHash; value /= 58n; }
for (const byte of digest) { if (byte !== 0) break; codeHash = `1${codeHash}`; }
let storageEstimate = null;
let protocolVersion = null;
let fundingHeadroom = null;
if (checkLive) {
  const status = await testnetStatus();
  if (!status.healthy) throw new Error('Testnet RPC is not healthy and synced.');
  const protocol = await testnetStorageCost();
  protocolVersion = protocol.protocolVersion;
  storageEstimate = BigInt(wasm.length) * BigInt(protocol.storageAmountPerByteYocto);
  const minimum = storageEstimate + reserve + maximum + setupStorageMargin;
  if (initial <= minimum) {
    throw new Error(`Initial balance must exceed code storage, 0.2 NEAR operating reserve, maximum payment and 0.25 NEAR setup margin; minimum is ${minimum} yoctoNEAR.`);
  }
  fundingHeadroom = initial - minimum;
  const existing = await testnetAccount(config.vaultAccountId);
  if (existing.found) throw new Error('Vault account already exists; use a fresh isolated subaccount.');
}
console.log(JSON.stringify({
  network: 'testnet',
  ownerAccountId: config.ownerAccountId,
  agentAccountId: config.agentAccountId,
  recipientAccountId: config.recipientAccountId,
  vaultAccountId: config.vaultAccountId,
  artifact,
  wasmBytes: wasm.length,
  wasmSha256Hex: digest.toString('hex'),
  expectedOnchainCodeHash: codeHash,
  initialVaultBalanceYocto: config.initialVaultBalanceYocto,
  maximumTestPaymentYocto: config.maximumTestPaymentYocto,
  protocolVersion: checkLive ? protocolVersion : 'not checked',
  codeStorageEstimateYocto: checkLive ? String(storageEstimate) : 'not checked',
  setupStorageMarginYocto: String(setupStorageMargin),
  fundingHeadroomAfterEstimateYocto: checkLive ? String(fundingHeadroom) : 'not checked',
  vaultAccountAvailable: checkLive ? true : 'not checked',
  deploymentStatus: 'NOT DEPLOYED',
  requirement: 'Create account, fund, deploy WASM, and initialize with owner as predecessor in one owner-signed transaction.'
}, null, 2));
