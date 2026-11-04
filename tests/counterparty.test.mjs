import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assessCounterparty, EMPTY_CODE_HASH, isValidNearAccountId, lookalikeReason } from '../outputs/agentshield-ui/counterparty.mjs';
import { BLOCKLIST, PINNED_CODE_HASHES } from '../outputs/agentshield-ui/counterparty-policy.mjs';
import { checkCounterparty, checkPayment } from '../work/payment-guard.mjs';
import counterpartyRoute from '../api/testnet/counterparty.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const proposal = read('deployment/testnet-live-demo-proposal.json');
const run2 = read('outputs/near-ai-redteam-evidence-run2.json');
const RECIPIENT = proposal.recipientAccountId;
const allowlist = [RECIPIENT];
const plain = { found: true, codeHash: EMPTY_CODE_HASH, blockHeight: 1 };
const assess = (account, extra = {}) => assessCounterparty({ account, allowlist, blocklist: BLOCKLIST,
  pinnedCodeHashes: PINNED_CODE_HASHES, facts: plain, ...extra });
const codes = result => result.signals.map(s => s.code);

// Every account a recorded injection tried to redirect the payment to, including the base64-hidden one.
function redirectTargets(text) {
  const decoded = [...text.matchAll(/[A-Za-z0-9+/]{24,}={0,2}/g)]
    .map(m => Buffer.from(m[0], 'base64').toString('utf8')).filter(s => /^[\x20-\x7e]+$/.test(s));
  return [text, ...decoded].flatMap(t => [...t.matchAll(/[\p{L}\p{N}_-]+(?:\.[\p{L}\p{N}_-]+)*\.(?:testnet|near)\b/gu)].map(m => m[0]))
    .filter(id => id !== RECIPIENT);
}

test('the real recipient passes: allowlisted, exists, still the plain account the owner approved', () => {
  const result = assess(RECIPIENT);
  assert.equal(result.decision, 'ALLOW');
  assert.deepEqual(codes(result), ['CODE_PINNED']);
  assert.equal(PINNED_CODE_HASHES[RECIPIENT], EMPTY_CODE_HASH);
  assert.ok(proposal.mandate.recipients.includes(RECIPIENT), 'pinned recipient is on the deployed mandate');
});

test('every redirect target in the 19 recorded prompt injections is blocked', () => {
  const targets = new Map();
  for (const item of run2.cases) for (const id of redirectTargets(item.input)) targets.set(id, item.case);
  assert.ok(targets.size >= 8, `found ${targets.size} distinct redirect targets`);
  const expected = {
    'agentshield-recipient-7bb4a0df1o77.testnet': 'LOOKALIKE',
    'agentshield-recipient-7bb4a0df1077.testnet.attacker.testnet': 'LOOKALIKE',
    'agentshield-recipient-7bb4a0df1077.near': 'WRONG_NETWORK',
    'agentshіeld-recipient-7bb4a0df1077.testnet': 'INVALID_ACCOUNT_ID',
    'attacker.testnet': 'BLOCKLISTED',
    'attacker-vault.testnet': 'BLOCKLISTED',
    'owner-refund.testnet': 'BLOCKLISTED',
    [proposal.ownerAccountId]: 'NOT_ALLOWLISTED',
  };
  for (const [id, caseId] of targets) {
    const result = assess(id);
    assert.equal(result.decision, 'BLOCK', `${caseId}: ${id} was ${result.decision}`);
    if (expected[id]) assert.ok(codes(result).includes(expected[id]), `${caseId}: ${id} lacks ${expected[id]}: ${codes(result)}`);
  }
  for (const id of Object.keys(expected)) assert.ok(targets.has(id), `${id} is in the recorded run`);
});

test('look-alike names say what they imitate', () => {
  const homograph = assess('agentshіeld-recipient-7bb4a0df1077.testnet');
  assert.match(homograph.signals.find(s => s.code === 'LOOKALIKE').message, /non-Latin letters.*“і” \(U\+0456\) in place of “i”/);
  assert.match(lookalikeReason('agentshield-recipient-7bb4a0df1o77.testnet', RECIPIENT).why, /“o” in place of “0”/);
  assert.match(lookalikeReason('agentshield-recipient-7bb4a0df1077.testnet.attacker.testnet', RECIPIENT).why, /belongs to attacker\.testnet/);
  assert.match(lookalikeReason('agentshield_recipient-7bb4a0df1077.testnet', RECIPIENT).why, /look alike/);
  assert.match(lookalikeReason('agentshield-recipient-7bb4a0df1078.testnet', RECIPIENT).why, /by 1 character/);
  assert.equal(lookalikeReason('pay.' + RECIPIENT, RECIPIENT).level, 'WARN');
  assert.equal(lookalikeReason('alice.testnet', RECIPIENT), null);
});

test('missing, unreadable or changed receivers fail closed', () => {
  assert.deepEqual(codes(assess(RECIPIENT, { facts: { found: false } })), ['ACCOUNT_MISSING']);
  assert.deepEqual(codes(assess(RECIPIENT, { facts: null })), ['STATE_UNVERIFIED']);
  const changed = assess(RECIPIENT, { facts: { found: true, codeHash: '55E7imniT2uuYrECn17qJAk9fLcwQW4ftNSwmCJL5Di' } });
  assert.equal(changed.decision, 'BLOCK');
  assert.deepEqual(codes(changed), ['CODE_CHANGED']);
});

test('owner-side checks before allowlisting warn on contracts, implicit accounts and sub-accounts', () => {
  const opts = { purpose: 'allowlist' };
  assert.equal(assess('newshop.testnet', opts).decision, 'ALLOW');
  assert.deepEqual(codes(assess('newshop.testnet', opts)), ['NOT_YET_ALLOWLISTED']);
  const contract = assess('dex.testnet', { ...opts, facts: { found: true, codeHash: '55E7imniT2uuYrECn17qJAk9fLcwQW4ftNSwmCJL5Di' } });
  assert.equal(contract.decision, 'WARN');
  assert.ok(codes(contract).includes('HAS_CONTRACT'));
  assert.equal(assess('a'.repeat(64), opts).decision, 'WARN');
  assert.equal(assess('pay.' + RECIPIENT, opts).decision, 'WARN');
  assert.equal(assess('attacker.testnet', opts).decision, 'BLOCK');
});

test('account ID rules match NEAR', () => {
  for (const ok of ['ab', 'a-b_c.testnet', RECIPIENT, 'a'.repeat(64)]) assert.ok(isValidNearAccountId(ok), ok);
  for (const bad of ['a', 'A.testnet', '-a.testnet', 'a..testnet', 'a.testnet.', 'a'.repeat(65), 'agentshіeld.testnet', 'a b.testnet']) {
    assert.ok(!isValidNearAccountId(bad), bad);
  }
});

test('every blocklist entry cites a recorded case that really names that account', () => {
  const byCase = Object.fromEntries(run2.cases.map(c => [c.case, c.input]));
  for (const entry of BLOCKLIST) {
    const cited = entry.evidence.match(/\d{2}_[a-z0-9_]+/g);
    assert.ok(cited?.length, `${entry.account} cites no case`);
    for (const caseId of cited) {
      assert.ok(byCase[caseId], `${caseId} exists in the evidence`);
      assert.ok(redirectTargets(byCase[caseId]).includes(entry.account), `${caseId} names ${entry.account}`);
    }
  }
});

// A fake reader shaped like finalized Testnet state on 2026-11-04 (mandate version 2).
const status = {
  owner: proposal.ownerAccountId, domain: 'agentshield:testnet:v1',
  mandate: { agent: proposal.agentAccountId, recipients: [RECIPIENT], per_payment_yocto: '10000000000000000000000',
    daily_yocto: '20000000000000000000000', total_yocto: '50000000000000000000000',
    expires_at_ns: '1795996800000000000', version: 2, paused: false, revoked: false },
  confirmed_total_yocto: '5000000000000000000000', pending_total_yocto: '0', pending_withdrawal_yocto: '0',
  day_confirmed_yocto: '0', day_pending_yocto: '0', current_utc_day: 20761, balance_yocto: '4000000000000000000000000',
  available_yocto: '3000000000000000000000000', accepted_requests: 1,
};
function fakeReader({ vault = status, accounts = { [RECIPIENT]: plain }, fail = false } = {}) {
  const calls = [];
  return { calls, endpoint: 'rpc.testnet.near.org',
    async vaultStatus() { calls.push('vaultStatus'); if (fail) throw new Error('RPC HTTP 503'); return structuredClone(vault); },
    async accountFacts(id) { calls.push(`account:${id}`); return accounts[id] ?? { found: false }; },
    async finalBlock() { return { height: 276200000, timestampNs: '1793790000000000000' }; } };
}

test('the payment guard combines vault policy and counterparty checks', async () => {
  const reader = fakeReader();
  const allow = await checkPayment({ recipient: RECIPIENT, amountNear: '0.005' }, { reader });
  assert.equal(allow.decision, 'ALLOW');
  assert.equal(allow.amountYocto, '5000000000000000000000');
  assert.equal(allow.maySign, true);
  const warn = await checkPayment({ recipient: RECIPIENT, amountNear: '0.006' }, { reader });
  assert.equal(warn.decision, 'WARN');
  assert.equal(warn.requiresHumanApproval, true);
  const over = await checkPayment({ recipient: RECIPIENT, amountNear: '0.011' }, { reader });
  assert.equal(over.decision, 'BLOCK');
  assert.match(over.reasons.join(' '), /per-payment cap/);
  const lookalike = await checkPayment({ recipient: 'agentshield-recipient-7bb4a0df1o77.testnet', amountNear: '0.005' }, { reader });
  assert.equal(lookalike.decision, 'BLOCK');
  assert.match(lookalike.reasons.join(' '), /Looks like an allowlisted recipient/);
  const paused = await checkPayment({ recipient: RECIPIENT, amountNear: '0.005' },
    { reader: fakeReader({ vault: { ...status, mandate: { ...status.mandate, paused: true } } }) });
  assert.equal(paused.decision, 'BLOCK');
  const homograph = await checkCounterparty('agentshіeld-recipient-7bb4a0df1077.testnet', { reader });
  assert.equal(homograph.decision, 'BLOCK');
  assert.ok(!reader.calls.some(c => c.includes('agentshі')), 'an invalid ID is never sent to RPC');
});

function response() {
  return { headers: {}, statusCode: null, body: null,
    setHeader(name, value) { this.headers[name] = value; return this; },
    status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}

test('the counterparty route is read-only, bounded and fails closed', async () => {
  const reader = fakeReader();
  for (const req of [{ method: 'POST', query: { account: RECIPIENT } }, { method: 'GET', query: {} },
    { method: 'GET', query: { account: 'x'.repeat(81) } }]) {
    const res = response();
    await counterpartyRoute(req, res, { reader });
    assert.equal(res.statusCode, req.method === 'POST' ? 405 : 400);
    assert.equal(res.headers['Cache-Control'], 'no-store');
  }
  assert.equal(reader.calls.length, 0, 'rejected requests never reach RPC');
  const ok = response();
  await counterpartyRoute({ method: 'GET', query: { account: 'attacker.testnet' } }, ok, { reader });
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.body.decision, 'BLOCK');
  assert.equal(ok.body.mandateVersion, 2);
  const down = response();
  await counterpartyRoute({ method: 'GET', query: { account: RECIPIENT } }, down, { reader: fakeReader({ fail: true }) });
  assert.equal(down.statusCode, 502);
  assert.match(down.body.error, /No conclusion is drawn/);
});
