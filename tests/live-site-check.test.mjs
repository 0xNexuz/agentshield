import test from 'node:test';
import assert from 'node:assert/strict';
import { checks, runChecks } from '../work/check-live-site.mjs';

// The daily live-evidence job must fail loudly when any endpoint regresses, and pass when all are healthy.
const healthy = {
  '/api/testnet/proof': { verification: 'PASS', settlement: 'SETTLED', transactionHash: '3buDvBXKDHcCe9VBNtLSSp4H7LLjLfGk7K4XT2jh53jm',
    codeHash: '2KHm9Waz7fQfQ2A1MWmHhVSwx7o7sm8p1KXBTVyggCqN', currentKeyStillScoped: true, currentMandateVersion: 2,
    rpc: { transactions: ['archival-rpc.testnet.fastnear.com'] } },
  '/api/testnet/gallery': ['PER_PAYMENT_LIMIT', 'RECIPIENT_NOT_ALLOWED', 'REPLAY'].map(reason =>
    ({ verification: 'PASS', decision: 'REJECTED', vaultTransferReceiptCount: 0, reason })),
  '/api/testnet/counterparty?account=agentshield-recipient-7bb4a0df1077.testnet': { decision: 'ALLOW', mandateVersion: 2 },
  '/api/testnet/counterparty?account=agentshield-recipient-7bb4a0df1o77.testnet': { decision: 'BLOCK', signals: [{ code: 'LOOKALIKE' }] },
  '/api/testnet/status': { chainId: 'testnet', healthy: true, latestBlockHeight: 1 },
  '/': '<div class="overline"> TRUST, BUT VERIFY</div>',
};

async function withSite(overrides, run) {
  const realFetch = globalThis.fetch;
  const realLog = console.log;
  globalThis.fetch = async url => {
    const route = new URL(url).pathname + new URL(url).search;
    const entry = route in overrides ? overrides[route] : healthy[route];
    if (entry instanceof Error) throw entry;
    const { status = 200, body = entry } = entry?.status ? entry : {};
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
  };
  console.log = () => {};
  try { return await run(); } finally { globalThis.fetch = realFetch; console.log = realLog; }
}

test('every live check passes against a healthy site', async () => {
  const results = await withSite({}, () => runChecks());
  assert.equal(results.length, checks.length);
  assert.deepEqual(results.filter(r => !r.ok), []);
});

test('a broken endpoint, a wrong answer or a network error each fail their check', async () => {
  const results = await withSite({
    '/api/testnet/gallery': { status: 502, body: { error: 'RPC HTTP 408' } },
    '/api/testnet/counterparty?account=agentshield-recipient-7bb4a0df1o77.testnet': { decision: 'ALLOW', signals: [] },
    '/api/testnet/status': new Error('socket hang up'),
  }, () => runChecks());
  assert.deepEqual(results.filter(r => !r.ok).map(r => r.name),
    ['three rejection proofs pass', 'counterparty check blocks the recorded look-alike', 'Testnet RPC is healthy']);
  assert.match(results.find(r => r.name === 'Testnet RPC is healthy').detail, /socket hang up/);
});
