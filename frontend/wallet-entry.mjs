import { setupWalletSelector, actionCreators } from '@near-wallet-selector/core';
import { setupHotWallet } from '@near-wallet-selector/hot-wallet';

const OWNER_METHODS = new Set(['fund', 'set_mandate', 'pause', 'resume', 'revoke', 'withdraw_excess']);
const ACCOUNT = /^(?:[a-z0-9_-]+(?:\.[a-z0-9_-]+)*\.testnet|[0-9a-f]{64})$/;

export async function createWalletBridge(onChange = () => {}) {
  const selector = await setupWalletSelector({
    network: 'testnet',
    modules: [setupHotWallet()],
    optimizeWalletOrder: true,
  });
  if (selector.options.network.networkId !== 'testnet') throw new Error('Wallet selector is not on NEAR testnet.');

  const snapshot = () => {
    const state = selector.store.getState();
    return {
      walletId: state.selectedWalletId,
      accountId: state.accounts.find(account => account.active)?.accountId || null,
      contractId: state.contract?.contractId || null,
      modules: state.modules.filter(module => module.metadata.available && !module.metadata.deprecated)
        .map(module => ({ id: module.id, name: module.metadata.name })),
    };
  };
  const publish = () => onChange(snapshot());
  selector.on('signedIn', publish);
  selector.on('signedOut', publish);
  selector.on('accountsChanged', publish);
  selector.on('networkChanged', ({ networkId }) => {
    if (networkId !== 'testnet') onChange({ ...snapshot(), accountId: null, error: 'Wallet switched away from testnet.' });
    else publish();
  });
  publish();

  return {
    snapshot,
    async connect(walletId, vaultId) {
      if (!snapshot().modules.some(module => module.id === walletId)) throw new Error('Unsupported wallet.');
      if (!ACCOUNT.test(vaultId) || vaultId.length > 64) throw new Error('Enter a valid testnet vault account in the Lab first.');
      const wallet = await selector.wallet(walletId);
      await wallet.signIn({ contractId: vaultId, methodNames: [...OWNER_METHODS] });
      const accounts = await wallet.getAccounts();
      if (!accounts.length) throw new Error('Wallet returned no testnet account.');
      publish();
      return snapshot();
    },
    async disconnect() {
      const { walletId } = snapshot();
      if (walletId) await (await selector.wallet(walletId)).signOut();
      publish();
    },
    async signOwnerCall({ vaultId, method, args = {}, gas = '30000000000000', deposit = '0' }) {
      const { accountId, walletId, contractId } = snapshot();
      if (!walletId || !accountId) throw new Error('Connect a testnet owner wallet first.');
      if (!ACCOUNT.test(vaultId) || vaultId.length > 64) throw new Error('Invalid testnet vault account.');
      if (contractId !== vaultId) throw new Error('Wallet is connected to a different vault.');
      if (!OWNER_METHODS.has(method)) throw new Error('Method is not an owner action.');
      if (!/^\d+$/.test(gas) || !/^\d+$/.test(deposit)) throw new Error('Gas and deposit must be integer strings.');
      const wallet = await selector.wallet(walletId);
      return wallet.signAndSendTransaction({
        signerId: accountId,
        receiverId: vaultId,
        actions: [actionCreators.functionCall(method, args, BigInt(gas), BigInt(deposit))],
      });
    },
  };
}
