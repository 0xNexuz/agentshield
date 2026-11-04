// Read-only access to the deployed vault and to receiver accounts, from finalized public Testnet state.
// Used by the counterparty API route and the MCP server. Never signs.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { STATE_ENDPOINT, postRpc } from './near-testnet-archival.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const proposal = JSON.parse(fs.readFileSync(path.join(root, 'deployment/testnet-live-demo-proposal.json'), 'utf8'));

export const VAULT = Object.freeze({
  network: 'testnet',
  vaultAccountId: proposal.vaultAccountId,
  ownerAccountId: proposal.ownerAccountId,
  agentAccountId: proposal.agentAccountId,
  expectedCodeHash: proposal.expectedCodeHash,
  restrictedPublicKey: proposal.restrictedKey.publicKey,
  paymentGas: proposal.firstPayment.gas,
});

export function createVaultReader({ rpc = (method, params) => postRpc(STATE_ENDPOINT, 'agentshield-readonly', method, params) } = {}) {
  const view = async (method, args = {}) => {
    const data = await rpc('query', { request_type: 'call_function', finality: 'final', account_id: VAULT.vaultAccountId,
      method_name: method, args_base64: Buffer.from(JSON.stringify(args)).toString('base64') });
    if (!Array.isArray(data?.result)) throw new Error(`Vault view ${method} returned no result`);
    return JSON.parse(Buffer.from(data.result).toString('utf8'));
  };
  return {
    endpoint: new URL(STATE_ENDPOINT).host,
    // Refuses to report status for a vault whose code differs from the deployed, reproducible WASM.
    async vaultStatus() {
      const [account, status] = await Promise.all([
        rpc('query', { request_type: 'view_account', finality: 'final', account_id: VAULT.vaultAccountId }),
        view('get_vault_status'),
      ]);
      if (account?.code_hash !== VAULT.expectedCodeHash) throw new Error('Vault code hash differs from the deployed AgentShield WASM');
      return status;
    },
    async accountFacts(accountId) {
      try {
        const account = await rpc('query', { request_type: 'view_account', finality: 'final', account_id: accountId });
        return { found: true, codeHash: account.code_hash, blockHeight: account.block_height };
      } catch (error) {
        if (/UNKNOWN_ACCOUNT/.test(error.message)) return { found: false };
        throw error;
      }
    },
    async finalBlock() {
      const block = await rpc('block', { finality: 'final' });
      return { height: block.header.height, timestampNs: String(block.header.timestamp_nanosec) };
    },
    async accessKey(accountId, publicKey) {
      return rpc('query', { request_type: 'view_access_key', finality: 'final', account_id: accountId, public_key: publicKey });
    },
  };
}
