import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ARCHIVAL_ENDPOINTS, STATE_ENDPOINT, archivalTxStatus, forgetFinalizedTransactions } from '../work/near-testnet-archival.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const realFetch = globalThis.fetch;
const finalTx = { final_execution_status: 'FINAL', transaction: { signer_id: 'agent.testnet' } };
const json = body => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

function withFetch(handler, run) {
  return async () => {
    forgetFinalizedTransactions();
    const calls = [];
    globalThis.fetch = async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return handler(url, init); };
    try { await run(calls); } finally { globalThis.fetch = realFetch; forgetFinalizedTransactions(); }
  };
}

test('old transactions are never looked up on the non-archival RPC', () => {
  assert.ok(!ARCHIVAL_ENDPOINTS.some(endpoint => endpoint === STATE_ENDPOINT));
  assert.ok(ARCHIVAL_ENDPOINTS.length >= 2, 'at least one fallback archival node');
  for (const file of ['work/verify-testnet-live-payment.mjs', 'work/verify-testnet-negative-scenarios.mjs']) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    assert.doesNotMatch(source, /EXPERIMENTAL_tx_status/, `${file} sends its own tx lookups`);
    assert.match(source, /archivalTxStatus\(/, `${file} uses the archival lookup`);
  }
});

test('one archival node failing still yields the finalized transaction from the other', withFetch(
  url => url === ARCHIVAL_ENDPOINTS[0] ? new Response('', { status: 408 }) : json({ jsonrpc: '2.0', result: finalTx }),
  async calls => {
    const answer = await archivalTxStatus('HashOne1111', 'agent.testnet');
    assert.deepEqual(answer.result, finalTx);
    assert.equal(answer.endpoint, new URL(ARCHIVAL_ENDPOINTS[1]).host);
    assert.ok(calls.every(call => call.body.method === 'EXPERIMENTAL_tx_status' && call.body.params.wait_until === 'FINAL'));
    assert.ok(calls.every(call => ARCHIVAL_ENDPOINTS.includes(call.url)));
  }));

test('when every archival node fails the error names each one', withFetch(
  url => url === ARCHIVAL_ENDPOINTS[0] ? new Response('', { status: 408 })
    : json({ jsonrpc: '2.0', error: { message: 'Server error', cause: { name: 'UNKNOWN_TRANSACTION' } } }),
  async () => {
    await assert.rejects(archivalTxStatus('HashTwo2222', 'agent.testnet'), error => {
      for (const endpoint of ARCHIVAL_ENDPOINTS) assert.match(error.message, new RegExp(new URL(endpoint).host.replaceAll('.', '\\.')));
      assert.match(error.message, /RPC HTTP 408/);
      assert.match(error.message, /UNKNOWN_TRANSACTION/);
      return true;
    });
  }));

test('a transaction that is not FINAL is not accepted', withFetch(
  () => json({ jsonrpc: '2.0', result: { ...finalTx, final_execution_status: 'EXECUTED_OPTIMISTIC' } }),
  async () => { await assert.rejects(archivalTxStatus('HashThree33', 'agent.testnet'), /not FINAL/); }));

test('a reused finalized answer keeps its original fetch time', withFetch(
  () => json({ jsonrpc: '2.0', result: finalTx }),
  async calls => {
    let clock = Date.parse('2026-11-04T10:00:00Z');
    const now = () => clock;
    const first = await archivalTxStatus('HashFour444', 'agent.testnet', { now });
    const fetches = calls.length;
    clock += 60_000;
    const second = await archivalTxStatus('HashFour444', 'agent.testnet', { now });
    assert.equal(calls.length, fetches, 'no new archival request inside the reuse window');
    assert.equal(second.fetchedAt, first.fetchedAt);
    clock += 11 * 60_000;
    const third = await archivalTxStatus('HashFour444', 'agent.testnet', { now });
    assert.ok(calls.length > fetches, 'refetched after the reuse window');
    assert.notEqual(third.fetchedAt, first.fetchedAt);
  }));
