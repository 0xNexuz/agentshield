// Finalized-transaction lookups for the read-only proof verifiers.
//
// rpc.testnet.near.org is not an archival node: it keeps only a few epochs
// (roughly two and a half days) of history, so lookups of the 1-2 Nov evidence
// transactions wait and then fail with HTTP 408. Those lookups go to archival
// nodes instead. Current-state view calls (vault status, balances, keys) stay
// on the regular public RPC, which always has the latest state.
export const STATE_ENDPOINT = 'https://rpc.testnet.near.org';
export const ARCHIVAL_ENDPOINTS = Object.freeze([
  'https://archival-rpc.testnet.fastnear.com',
  'https://archival-rpc.testnet.near.org',
]);

// A FINAL transaction can never change, so a warm function instance may reuse
// one it fetched recently instead of hitting rate-limited archival nodes again.
// Callers get the fetch time back and report it, so a reused answer is never
// presented as fetched during the current request.
const REUSE_MS = 10 * 60 * 1000;
const finalized = new Map();

const host = endpoint => new URL(endpoint).host;

export async function postRpc(endpoint, id, method, params, { timeoutMs = 20000, signal } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`timed out after ${timeoutMs / 1000}s`)), timeoutMs);
  const stop = () => controller.abort(new Error('another archival node answered first'));
  signal?.addEventListener('abort', stop, { once: true });
  try {
    const response = await fetch(endpoint, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params }), signal: controller.signal,
    });
    if (!response.ok) throw new Error(`RPC HTTP ${response.status}`);
    const data = await response.json();
    if (data.error) throw new Error(`RPC ${method}: ${data.error.cause?.name ?? data.error.message}`);
    return data.result;
  } catch (error) {
    throw controller.signal.aborted && controller.signal.reason instanceof Error ? controller.signal.reason : error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', stop);
  }
}

// Asks every archival endpoint at once and keeps the first finalized answer.
// Returns { result, endpoint, fetchedAt }.
export async function archivalTxStatus(txHash, senderAccountId, {
  id = 'agentshield-archival-tx', timeoutMs = 25000, endpoints = ARCHIVAL_ENDPOINTS, now = Date.now,
} = {}) {
  const key = `${txHash}:${senderAccountId}`;
  const cached = finalized.get(key);
  if (cached && now() - Date.parse(cached.fetchedAt) < REUSE_MS) return cached;
  const controllers = endpoints.map(() => new AbortController());
  const attempts = endpoints.map((endpoint, index) =>
    postRpc(endpoint, id, 'EXPERIMENTAL_tx_status',
      { tx_hash: txHash, sender_account_id: senderAccountId, wait_until: 'FINAL' },
      { timeoutMs, signal: controllers[index].signal })
      .then(result => {
        if (result?.final_execution_status !== 'FINAL') throw new Error('transaction is not FINAL');
        controllers.forEach((controller, other) => { if (other !== index) controller.abort(); });
        return { result, endpoint: host(endpoint), fetchedAt: new Date(now()).toISOString() };
      })
      .catch(error => { throw new Error(`${host(endpoint)}: ${error.message}`); }));
  try {
    const answer = await Promise.any(attempts);
    finalized.set(key, answer);
    return answer;
  } catch (error) {
    const reasons = (error.errors ?? [error]).map(item => item.message).join('; ');
    throw new Error(`No archival Testnet RPC returned transaction ${txHash.slice(0, 8)}… (${reasons})`);
  }
}

export function forgetFinalizedTransactions() { finalized.clear(); }
