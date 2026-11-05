import test from 'node:test';
import assert from 'node:assert/strict';
import { checks, liveModelCheck, runChecks } from '../work/check-live-site.mjs';

// The daily live-evidence job must fail loudly when any endpoint regresses, and pass when all are healthy.
const healthy = {
  '/api/testnet/proof': { verification: 'PASS', settlement: 'SETTLED', transactionHash: '3buDvBXKDHcCe9VBNtLSSp4H7LLjLfGk7K4XT2jh53jm',
    codeHash: '2KHm9Waz7fQfQ2A1MWmHhVSwx7o7sm8p1KXBTVyggCqN', currentKeyStillScoped: true, currentMandateVersion: 2,
    rpc: { transactions: ['archival-rpc.testnet.fastnear.com'] } },
  '/api/testnet/gallery': ['PER_PAYMENT_LIMIT', 'RECIPIENT_NOT_ALLOWED', 'REPLAY', 'STALE_VERSION', 'EXPIRED', 'RECIPIENT_NOT_ALLOWED', 'WRONG_AGENT', 'REVOKED'].map(reason =>
    ({ verification: 'PASS', decision: 'REJECTED', vaultTransferReceiptCount: 0, reason })),
  '/api/testnet/mcp-payment': { verification: 'PASS', settlement: 'SETTLED', transactionHash: 'HP3BfdWLDaACqKV9fZb4WKmTyKp5vfa5fEs7bncuGuRk', mandateVersion: 2 },
  '/api/testnet/counterparty?account=agentshield-recipient-7bb4a0df1077.testnet': { decision: 'ALLOW', mandateVersion: 2 },
  '/api/testnet/counterparty?account=agentshield-recipient-7bb4a0df1o77.testnet': { decision: 'BLOCK', signals: [{ code: 'LOOKALIKE' }] },
  '/api/testnet/status': { chainId: 'testnet', healthy: true, latestBlockHeight: 1 },
  '/': '<div class="overline"> TRUST, BUT VERIFY</div>',
  'POST /api/live/injection': { signature: { verified: true, signingAddress: '0xabc', keyPassedOfficialVerifier: true }, guard: { decision: 'BLOCK' },
    proposal: { recipient: 'agentshield-recipient-7bb4a0df1o77.testnet' }, modelBehaviour: 'PROPOSED_SOMETHING_ELSE', signed: false, sentToChain: false, estimatedCostUsd: 0.0001 },
};

async function withSite(overrides, run) {
  const realFetch = globalThis.fetch;
  const realLog = console.log;
  globalThis.fetch = async (url, init) => {
    const route = new URL(url).pathname + new URL(url).search;
    const key = init?.method === 'POST' ? `POST ${route}` : route;
    const entry = key in overrides ? overrides[key] : healthy[key];
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

test('a gallery missing any of the eight rejections fails', async () => {
  const short = healthy['/api/testnet/gallery'].slice(0, 7);
  const results = await withSite({ '/api/testnet/gallery': short }, () => runChecks());
  assert.deepEqual(results.filter(r => !r.ok).map(r => r.name), ['every rejection proof passes']);
});

test('a broken endpoint, a wrong answer or a network error each fail their check', async () => {
  const results = await withSite({
    '/api/testnet/gallery': { status: 502, body: { error: 'RPC HTTP 408' } },
    '/api/testnet/counterparty?account=agentshield-recipient-7bb4a0df1o77.testnet': { decision: 'ALLOW', signals: [] },
    '/api/testnet/status': new Error('socket hang up'),
    '/api/testnet/mcp-payment': { status: 404, body: { error: 'not found' } },
  }, () => runChecks());
  assert.deepEqual(results.filter(r => !r.ok).map(r => r.name),
    ['every rejection proof passes', 'MCP payment proof passes', 'counterparty check blocks the recorded look-alike', 'Testnet RPC is healthy']);
  assert.match(results.find(r => r.name === 'Testnet RPC is healthy').detail, /socket hang up/);
});

test('the live model check passes a verified reply, skips when the box is off, and fails an unverified one', async () => {
  const [, check] = liveModelCheck;
  assert.equal((await withSite({}, () => check()))[0], true);
  assert.equal((await withSite({ 'POST /api/live/injection': { status: 503, body: { reason: 'CREDITS_EXHAUSTED' } } }, () => check()))[0], null);
  const forged = { ...healthy['POST /api/live/injection'], signature: { verified: false } };
  assert.equal((await withSite({ 'POST /api/live/injection': forged }, () => check()))[0], false);
  const leaked = { ...healthy['POST /api/live/injection'], guard: { decision: 'ALLOW' }, proposal: { recipient: 'attacker.testnet' } };
  assert.equal((await withSite({ 'POST /api/live/injection': leaked }, () => check()))[0], false, 'an ALLOW for anything but the real invoice fails');
  const results = await withSite({ 'POST /api/live/injection': { status: 429, body: { reason: 'RATE_LIMITED' } } }, () => runChecks([...checks, liveModelCheck]));
  assert.equal(results.filter(r => r.ok === false).length, 0, 'a skipped check does not fail the run');
});
