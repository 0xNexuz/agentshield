const endpoint = 'https://rpc.testnet.near.org';
const emptyCodeHash = '11111111111111111111111111111111';
const accountPattern = /^(?:[a-z0-9_-]+(?:\.[a-z0-9_-]+)*\.testnet|[0-9a-f]{64})$/;

export function isTestnetAccountId(value) {
  return typeof value === 'string' && value.length <= 64 && accountPattern.test(value);
}

async function request(path, options = {}) {
  const response = await fetch(`${endpoint}${path}`, {
    ...options,
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error(`NEAR testnet RPC returned HTTP ${response.status}`);
  return response.json();
}

export async function testnetStatus() {
  const status = await request('/status');
  const latestBlockTime = status.sync_info?.latest_block_time;
  const ageSeconds = Math.round((Date.now() - Date.parse(latestBlockTime)) / 1000);
  if (status.chain_id !== 'testnet') throw new Error(`Unexpected chain: ${status.chain_id ?? 'unknown'}`);
  return {
    chainId: status.chain_id,
    syncing: status.sync_info?.syncing,
    latestBlockHeight: status.sync_info?.latest_block_height,
    latestBlockTime,
    ageSeconds: Number.isFinite(ageSeconds) ? ageSeconds : null,
    healthy: status.sync_info?.syncing === false && ageSeconds >= 0 && ageSeconds <= 120,
  };
}

export async function testnetStorageCost() {
  const payload = await request('', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 'agentshield-readonly-protocol-config',
      method: 'EXPERIMENTAL_protocol_config', params: { finality: 'final' },
    }),
  });
  if (payload.error) throw new Error(`NEAR testnet protocol config query failed: ${payload.error.message ?? 'unknown error'}`);
  const amount = payload.result?.runtime_config?.storage_amount_per_byte;
  if (!/^[1-9][0-9]*$/.test(String(amount ?? ''))) {
    throw new Error('NEAR testnet RPC returned an invalid storage cost.');
  }
  return { storageAmountPerByteYocto: String(amount), protocolVersion: payload.result.protocol_version };
}

export async function testnetAccount(accountId) {
  if (!isTestnetAccountId(accountId)) throw new TypeError('Enter a valid .testnet or 64-character implicit account ID.');
  const payload = await request('', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 'agentshield-readonly-account', method: 'query',
      params: { request_type: 'view_account', finality: 'final', account_id: accountId },
    }),
  });
  if (payload.error) {
    const detail = JSON.stringify(payload.error);
    if (detail.includes('UNKNOWN_ACCOUNT')) return { accountId, found: false };
    throw new Error(`NEAR testnet RPC account query failed: ${payload.error.message ?? 'unknown error'}`);
  }
  if (!payload.result?.amount || !payload.result?.block_height || !payload.result?.code_hash) {
    throw new Error('NEAR testnet RPC returned an incomplete account result.');
  }
  return {
    accountId,
    found: true,
    balanceYocto: payload.result.amount,
    storageUsage: payload.result.storage_usage,
    blockHeight: payload.result.block_height,
    codeHash: payload.result.code_hash,
    hasContract: payload.result.code_hash !== emptyCodeHash,
  };
}
