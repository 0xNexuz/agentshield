// Signs request_payment with the agent's restricted key, and nothing else.
// Before every signature it rereads the key from chain and refuses unless the key can call only
// the vault's request_payment method. The key file stays on the owner's machine; it is never
// logged, echoed or included in an error message.
import fs from 'node:fs';
import { connect, keyStores, KeyPair } from 'near-api-js';
import { STATE_ENDPOINT } from '../work/near-testnet-archival.mjs';
import { VAULT } from '../work/vault-reader.mjs';

export function assertRestrictedKey(accessKey) {
  const permission = accessKey?.permission;
  if (permission === 'FullAccess') {
    throw new Error('Refusing to sign: this is a full-access key. Give the agent a key that can only call request_payment on the vault.');
  }
  const scoped = permission?.FunctionCall;
  if (!scoped) throw new Error('Refusing to sign: this key is not an access key of the agent account.');
  if (scoped.receiver_id !== VAULT.vaultAccountId || scoped.method_names?.length !== 1 || scoped.method_names[0] !== 'request_payment') {
    throw new Error('Refusing to sign: this key can call more than the vault\'s request_payment method.');
  }
  return scoped;
}

function loadKeyPair(keyFile) {
  let record;
  try { record = JSON.parse(fs.readFileSync(keyFile, 'utf8')); }
  catch { throw new Error('The agent key file could not be read as JSON.'); } // the parser's message can quote file contents
  if (record.account_id && record.account_id !== VAULT.agentAccountId) {
    throw new Error('The agent key file belongs to a different account than the vault mandate\'s agent.');
  }
  try { return KeyPair.fromString(record.private_key); }
  catch { throw new Error('The agent key file has no usable private_key.'); }
}

export function decodeDecision(outcome) {
  if (outcome?.status?.Failure) throw new Error(`The transaction failed: ${JSON.stringify(outcome.status.Failure).slice(0, 300)}`);
  const value = outcome?.status?.SuccessValue;
  if (typeof value !== 'string' || !value) return null;
  try { return JSON.parse(Buffer.from(value, 'base64').toString('utf8')); } catch { return null; }
}

export function createRestrictedSigner({ keyFile, reader }) {
  const keyPair = loadKeyPair(keyFile);
  const publicKey = keyPair.getPublicKey().toString();
  return {
    publicKey,
    async requestPayment({ recipient, amountYocto, nonce, expiresAtNs, expectedVersion }) {
      assertRestrictedKey(await reader.accessKey(VAULT.agentAccountId, publicKey));
      const keyStore = new keyStores.InMemoryKeyStore();
      await keyStore.setKey('testnet', VAULT.agentAccountId, keyPair);
      const near = await connect({ networkId: 'testnet', nodeUrl: STATE_ENDPOINT, keyStore });
      const account = await near.account(VAULT.agentAccountId);
      const outcome = await account.functionCall({
        contractId: VAULT.vaultAccountId, methodName: 'request_payment',
        args: { recipient, amount_yocto: amountYocto, nonce, expires_at_ns: expiresAtNs, expected_version: expectedVersion },
        gas: BigInt(VAULT.paymentGas), attachedDeposit: 0n,
      });
      const transactionHash = outcome.transaction.hash;
      return { transactionHash, decision: decodeDecision(outcome), explorerUrl: `https://testnet.nearblocks.io/txns/${transactionHash}` };
    },
  };
}
