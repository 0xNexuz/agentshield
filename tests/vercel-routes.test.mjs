import test from 'node:test';
import assert from 'node:assert/strict';
import account from '../api/testnet/account.js';
import status from '../api/testnet/status.js';
import proof from '../api/testnet/proof.js';
import gallery from '../api/testnet/gallery.js';

function response() {
  return {
    headers: {}, statusCode: null, body: null,
    setHeader(name, value) { this.headers[name] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test('Vercel read-only routes reject non-GET requests', async () => {
  for (const handler of [account, status, proof, gallery]) {
    const res = response();
    await handler({ method: 'POST', query: { id: 'valid.testnet' } }, res);
    assert.equal(res.statusCode, 405);
    assert.equal(res.headers['Cache-Control'], 'no-store');
  }
});

test('Vercel account route rejects malformed IDs without querying RPC', async () => {
  for (const id of ['../../.env', 'owner.near', undefined]) {
    const res = response();
    await account({ method: 'GET', query: { id } }, res);
    assert.equal(res.statusCode, 400);
  }
});
