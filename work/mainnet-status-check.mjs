const endpoint = 'https://rpc.mainnet.near.org/status';
const response = await fetch(endpoint, { signal: AbortSignal.timeout(12000) });
if (!response.ok) throw new Error(`Mainnet RPC returned HTTP ${response.status}`);

const status = await response.json();
const blockTime = Date.parse(status.sync_info?.latest_block_time ?? '');
const ageSeconds = Math.round((Date.now() - blockTime) / 1000);
if (status.chain_id !== 'mainnet') throw new Error(`Unexpected chain: ${status.chain_id}`);
if (status.sync_info?.syncing !== false) throw new Error('RPC node reports syncing');
if (!Number.isFinite(ageSeconds) || ageSeconds < 0 || ageSeconds > 120) {
  throw new Error(`Latest block is not recent: ${status.sync_info?.latest_block_time}`);
}

const accountResponse = await fetch('https://rpc.mainnet.near.org', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 'agentshield-readonly-1',
    method: 'query',
    params: { request_type: 'view_account', finality: 'final', account_id: 'wrap.near' },
  }),
  signal: AbortSignal.timeout(12000),
});
if (!accountResponse.ok) throw new Error(`Mainnet account query returned HTTP ${accountResponse.status}`);
const account = await accountResponse.json();
if (account.error || !account.result?.code_hash || !account.result?.block_height) {
  throw new Error(`Mainnet account query failed: ${JSON.stringify(account.error ?? account)}`);
}

console.log(JSON.stringify({
  chain_id: status.chain_id,
  latest_block_height: status.sync_info.latest_block_height,
  latest_block_time: status.sync_info.latest_block_time,
  age_seconds: ageSeconds,
  syncing: status.sync_info.syncing,
  account_query: { account_id: 'wrap.near', block_height: account.result.block_height, code_hash: account.result.code_hash },
}, null, 2));
