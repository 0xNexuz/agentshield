import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TRUTH, ACCOUNTS, VAULT, MANDATE, RESTRICTED_KEY, PAYMENT, REJECTIONS, REVOCATION, CONTRACT_CHECKS, checkIndexFor,
  mandateState, formatUtcNs, MANDATE_RENEWAL, currentMandate, fetchLiveProof,
} from '../outputs/agentshield-ui/evidence-records.mjs';
import { preflightPayment as browserPreflight } from '../outputs/agentshield-ui/preflight.mjs';
import { preflightPayment as serverPreflight } from '../work/near-ai-payment-agent.mjs';
import { createSimulator } from '../outputs/agentshield-ui/simulator.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ui = path.join(root, 'outputs/agentshield-ui');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const json = file => JSON.parse(read(file));
const NEAR = 10n ** 24n;
const near = yocto => { const v = BigInt(yocto); const f = String(v % NEAR).padStart(24, '0').replace(/0+$/, ''); return `${v / NEAR}${f ? `.${f}` : ''}`; };

test('truth states are exactly the four required labels', () => {
  assert.deepEqual(Object.values(TRUTH).map(t => t.label),
    ['SIMULATION', 'HISTORICAL ONCHAIN REPLAY', 'LIVE RPC VERIFIED', 'NOT YET VERIFIED']);
});

test('payment record matches the committed independent proof and evidence', () => {
  const proof = json('outputs/testnet-live-payment-independent-proof.json');
  const evidence = json('outputs/testnet-live-payment-evidence.json');
  const proposal = json('deployment/testnet-live-demo-proposal.json');
  for (const key of ['transactionHash', 'decision', 'settlement', 'requestId', 'recipientReceiptId', 'recipient', 'amountYocto', 'amountNear', 'checkedAt']) {
    assert.equal(PAYMENT[key], proof[key], key);
  }
  assert.equal(PAYMENT.signer, proof.agent);
  assert.equal(PAYMENT.nonce, proposal.firstPayment.nonce);
  assert.equal(near(PAYMENT.amountYocto), PAYMENT.amountNear);
  const decisionReceipt = evidence.receiptOutcomes.find(r => r.id === PAYMENT.decisionReceiptId);
  assert.ok(decisionReceipt, 'decision receipt exists in the payment evidence');
  assert.match(decisionReceipt.logs.join(' '), new RegExp(`request_id=${PAYMENT.requestId} decision=AUTHORIZED`));
  assert.ok(evidence.receiptOutcomes.some(r => r.id === PAYMENT.recipientReceiptId && r.executorId === PAYMENT.recipient));
  assert.equal(VAULT.accountId, proof.vaultAccountId);
  assert.equal(VAULT.codeHash, proof.codeHash);
});

test('rejection records match the committed negative proofs and intents', () => {
  const proofs = json('outputs/testnet-negative-independent-proofs.json');
  assert.equal(proofs.length, 3);
  for (const proof of proofs) {
    const record = REJECTIONS[proof.scenario];
    assert.ok(record, proof.scenario);
    for (const key of ['reason', 'transactionHash', 'recipient', 'amountYocto', 'nonce', 'vaultTransferReceiptCount', 'checkedAt']) {
      assert.equal(record[key], proof[key], `${proof.scenario}.${key}`);
    }
    assert.equal(near(record.amountYocto), record.amountNear, `${proof.scenario}.amountNear`);
    const intent = json(`outputs/testnet-negative-${proof.scenario}-intent.json`);
    assert.equal(intent.hash, record.transactionHash);
  }
  assert.equal(REJECTIONS.replay.nonce, PAYMENT.nonce, 'the replay probe reused the settled payment nonce');
  assert.equal(REJECTIONS.unauthorizedRecipient.recipient, ACCOUNTS.owner);
});

test('mandate and restricted key records match the committed evidence', () => {
  const mandate = json('outputs/testnet-live-mandate-evidence.json');
  const observed = mandate.details.observed;
  assert.equal(MANDATE.transactionHash, mandate.transactionHash);
  assert.equal(MANDATE.signer, mandate.signer);
  assert.equal(MANDATE.agent, observed.agent);
  assert.deepEqual([...MANDATE.recipients], observed.recipients);
  assert.equal(MANDATE.perPaymentYocto, observed.per_payment_yocto);
  assert.equal(MANDATE.dailyYocto, observed.daily_yocto);
  assert.equal(MANDATE.totalYocto, observed.total_yocto);
  assert.equal(MANDATE.expiresAtNs, observed.expires_at_ns);
  assert.equal(MANDATE.version, observed.version);
  assert.equal(near(MANDATE.perPaymentYocto), MANDATE.perPaymentNear);
  assert.equal(near(MANDATE.dailyYocto), MANDATE.dailyNear);
  assert.equal(near(MANDATE.totalYocto), MANDATE.totalNear);
  const expiry = new Date(Number(BigInt(MANDATE.expiresAtNs) / 1_000_000n)).toISOString();
  assert.equal(`${expiry.slice(0, 10)} ${expiry.slice(11, 19)} UTC`, MANDATE.expiresAtUtc);
  const key = json('outputs/testnet-live-key-evidence.json');
  assert.equal(RESTRICTED_KEY.transactionHash, key.transactionHash);
  assert.equal(RESTRICTED_KEY.publicKey, key.details.publicKey);
  assert.equal(RESTRICTED_KEY.receiverId, key.details.receiverId);
  assert.deepEqual([...RESTRICTED_KEY.methods], key.details.methods);
});

test('revocation stays unverified while only a failed deployment exists', () => {
  const failure = json('outputs/testnet-revocation-deploy-failure.json');
  assert.equal(REVOCATION.status, 'NOT_YET_VERIFIED');
  assert.doesNotMatch(JSON.stringify(failure), /"REVOKED"/);
  assert.ok(!fs.readdirSync(path.join(root, 'outputs')).some(f => /revocation.*(proof|evidence)\.json$/.test(f) && !/failure/.test(f)),
    'if a revocation proof file appears, update REVOCATION and this test');
});

test('every hash-like identifier in the cinematic layer exists in a committed evidence file', () => {
  const evidenceText = fs.readdirSync(path.join(root, 'outputs')).filter(f => f.endsWith('.json'))
    .concat(fs.readdirSync(path.join(root, 'deployment')).filter(f => f.endsWith('.json')).map(f => `../deployment/${f}`))
    .map(f => read(path.join('outputs', f))).join('\n') + read('README.md');
  const sources = ['cinematic.mjs', 'evidence-records.mjs', 'index.html'].map(f => fs.readFileSync(path.join(ui, f), 'utf8')).join('\n');
  const base58 = [...new Set(sources.match(/\b[1-9A-HJ-NP-Za-km-z]{43,44}\b/g) || [])];
  const hex = [...new Set(sources.match(/\b[0-9a-f]{64}\b/g) || [])];
  assert.ok(base58.length >= 8, 'expected transaction and receipt hashes to be present');
  for (const id of [...base58, ...hex]) assert.ok(evidenceText.includes(id), `${id} is not in any committed evidence file`);
});

test('contract check list follows the vault order in lib.rs', () => {
  const source = read('contracts/vault/src/lib.rs');
  const body = source.slice(source.indexOf('pub fn request_payment('));
  const order = ['WRONG_AGENT', 'REVOKED', 'PAUSED', 'STALE_VERSION', 'EXPIRED', 'INVALID_NONCE', 'RECIPIENT_NOT_ALLOWED', 'PER_PAYMENT_LIMIT', 'REPLAY', 'DAILY_LIMIT', 'TOTAL_LIMIT'];
  const positions = order.map(code => body.indexOf(`reject("${code}")`));
  assert.ok(positions.every(p => p > 0), 'every reason exists in request_payment');
  assert.deepEqual([...positions].sort((a, b) => a - b), positions, 'contract order unchanged');
  const indices = order.map(checkIndexFor);
  assert.ok(indices.every(i => i >= 0 && i < CONTRACT_CHECKS.length));
  assert.deepEqual([...indices].sort((a, b) => a - b), indices, 'UI checks are listed in contract order');
});

test('browser preflight is behaviourally identical to the server preflight', () => {
  const agent = ACCOUNTS.agent;
  const base = {
    mandate: { agent, recipients: [ACCOUNTS.recipient], per_payment_yocto: MANDATE.perPaymentYocto, daily_yocto: MANDATE.dailyYocto,
      total_yocto: MANDATE.totalYocto, expires_at_ns: MANDATE.expiresAtNs, version: 1, paused: false, revoked: false },
    confirmed_total_yocto: PAYMENT.amountYocto, pending_total_yocto: '0', day_confirmed_yocto: PAYMENT.amountYocto, day_pending_yocto: '0',
    available_yocto: MANDATE.totalYocto,
  };
  const proposals = [
    { recipient: ACCOUNTS.recipient, amountNear: '0.005' }, { recipient: ACCOUNTS.recipient, amountNear: '0.006' },
    { recipient: ACCOUNTS.recipient, amountNear: '0.011' }, { recipient: ACCOUNTS.owner, amountNear: '0.005' },
    { recipient: 'Bad Account', amountNear: '0.005' }, { recipient: ACCOUNTS.recipient, amountNear: '-1' },
    { recipient: ACCOUNTS.recipient, amountNear: '0.0050000000000000000000001' }, { recipient: ACCOUNTS.recipient },
    { recipient: ACCOUNTS.recipient, amountNear: '0.005', extra: 'x' }, null, [], 'text',
  ];
  const statuses = [base, { ...base, confirmed_total_yocto: '49000000000000000000000' }, { ...base, day_confirmed_yocto: '18000000000000000000000' },
    { ...base, available_yocto: '1' }, { ...base, mandate: { ...base.mandate, revoked: true } }, { ...base, mandate: { ...base.mandate, paused: true } }, {}];
  const options = [{ agentAccountId: agent, recipientExists: true, nowNs: '1793615143540599085' }, { agentAccountId: agent, recipientExists: false, nowNs: '1793615143540599085' },
    { agentAccountId: 'other.testnet', recipientExists: true, nowNs: '1793615143540599085' }, { agentAccountId: agent, recipientExists: true },
    { agentAccountId: agent, recipientExists: true, nowNs: '1794216105339870777' }];
  let compared = 0;
  for (const p of proposals) for (const s of statuses) for (const o of options) {
    assert.deepEqual(browserPreflight(p, s, o), serverPreflight(p, s, o));
    compared++;
  }
  assert.equal(compared, proposals.length * statuses.length * options.length);
});

test('a simulator seeded like the live mandate reproduces each Security Lab outcome', () => {
  const seed = () => {
    const engine = createSimulator({ agent: ACCOUNTS.agent, recipient: ACCOUNTS.recipient, perPayment: MANDATE.perPaymentNear, daily: MANDATE.dailyNear, total: MANDATE.totalNear });
    engine.settle(engine.request({ amount: PAYMENT.amountNear, nonce: PAYMENT.nonce }).requestId);
    return engine;
  };
  assert.equal(seed().request({ amount: '0.005', nonce: 'fresh-1' }).decision, 'AUTHORIZED');
  assert.equal(seed().request({ amount: REJECTIONS.overspend.amountNear, nonce: REJECTIONS.overspend.nonce }).reason, 'PER_PAYMENT_LIMIT');
  assert.equal(seed().request({ recipient: ACCOUNTS.owner, amount: '0.005', nonce: REJECTIONS.unauthorizedRecipient.nonce }).reason, 'RECIPIENT_NOT_ALLOWED');
  assert.equal(seed().request({ amount: '0.005', nonce: PAYMENT.nonce }).reason, 'REPLAY');
  const revoked = seed(); revoked.revoke();
  assert.equal(revoked.request({ amount: '0.005', nonce: 'after-revoke-1' }).reason, 'REVOKED');
  assert.equal(seed().request({ amount: '0.016', nonce: 'fresh-2' }).reason, 'PER_PAYMENT_LIMIT');
  const daily = seed(); daily.request({ amount: '0.01', nonce: 'd1' });
  assert.equal(daily.request({ amount: '0.01', nonce: 'd2' }).reason, 'DAILY_LIMIT');
});

test('every referenced cinematic plate exists in all three sizes and stays light', () => {
  const sources = ['cinematic.mjs', 'index.html'].map(f => fs.readFileSync(path.join(ui, f), 'utf8')).join('\n');
  const stems = new Set([...sources.matchAll(/(?:plate(?:Stem)?:\s*"|plate\("|data-cast-plate="|assets\/cinematic\/)([a-z-]+?)(?:-\d{3,4}\.webp|")/g)].map(m => m[1]));
  assert.ok(stems.size >= 8, `found ${[...stems]}`);
  for (const stem of stems) for (const w of [768, 1280, 1920]) {
    const file = path.join(ui, 'assets/cinematic', `${stem}-${w}.webp`);
    assert.ok(fs.existsSync(file), file);
    assert.ok(fs.statSync(file).size < 140 * 1024, `${file} is over 140 KB`);
  }
});

test('the cinematic layer never signs or sends transactions', () => {
  const code = ['cinematic.mjs', 'evidence-records.mjs', 'preflight.mjs', 'preloader.js'].map(f => fs.readFileSync(path.join(ui, f), 'utf8')).join('\n');
  assert.doesNotMatch(code, /wallet-bundle|signAndSend|signTransaction|functionCall\(|privateKey|NEAR_AI_KEY|method:\s*["']POST/);
  for (const url of code.match(/fetch\("([^"]+)"/g) || []) assert.match(url, /fetch\("\/api\/testnet\/(proof|gallery)"/);
});

test('favicon and app icons exist and are linked from the page', () => {
  const html = fs.readFileSync(path.join(ui, 'index.html'), 'utf8');
  for (const href of ['./favicon.ico', './assets/icons/favicon.svg', './assets/icons/apple-touch-icon.png', './site.webmanifest']) {
    assert.ok(html.includes(`href="${href}"`), `index.html links ${href}`);
    assert.ok(fs.existsSync(path.join(ui, href)), `${href} exists`);
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(ui, 'site.webmanifest'), 'utf8'));
  for (const icon of manifest.icons) assert.ok(fs.existsSync(path.join(ui, icon.src)), `${icon.src} exists`);
  assert.match(fs.readFileSync(path.join(ui, 'assets/icons/favicon.svg'), 'utf8'), /^<svg [^>]*viewBox="0 0 64 64"/);
});

test('mandate status is computed, never hard-coded as active', () => {
  const expiry = MANDATE.expiresAtNs;
  const expiryMs = Number(BigInt(expiry) / 1_000_000n);
  assert.equal(mandateState({ expiresAtNs: expiry }, expiryMs - 1), 'active');
  assert.equal(mandateState({ expiresAtNs: expiry }, expiryMs + 1), 'expired');
  assert.equal(mandateState({ expiresAtNs: expiry, revoked: true }, expiryMs - 1), 'revoked');
  assert.equal(formatUtcNs(expiry), '2026-11-09 09:21 UTC');
  const html = fs.readFileSync(path.join(ui, 'index.html'), 'utf8');
  assert.ok(html.includes('data-mandate-status'), 'homepage mandate card is wired for live status');
  for (const stale of ['ACTIVE / TESTNET', 'DESIGN STUDY', 'LOCAL BUILD', 'vault design', 'source is compiled', 'Live revocation remains unverified', 'until 2026-11-09']) {
    assert.ok(!html.includes(stale), `stale wording "${stale}" is gone from the site`);
  }
});

test('a passing live proof replaces the committed mandate, so a renewal needs no redeploy', async () => {
  assert.deepEqual({ ...currentMandate() }, { expiresAtNs: MANDATE_RENEWAL.expiresAtNs, version: 2, revoked: false, live: false });
  const renewal = JSON.parse(fs.readFileSync(path.join(root, 'deployment/testnet-mandate-renewal-proposal.json'), 'utf8'));
  assert.equal(renewal.status, 'PROPOSED_NOT_SIGNED');
  assert.ok(BigInt(renewal.proposedExpiryNs) > BigInt(Date.parse('2026-11-18T23:59:00Z')) * 1_000_000n, 'renewal covers judging and results');
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({
    verification: 'PASS', settlement: 'SETTLED', transactionHash: PAYMENT.transactionHash,
    mandateExpiryNs: renewal.proposedExpiryNs, currentMandateVersion: 2, mandateRevoked: false,
  }) });
  try {
    await fetchLiveProof({ force: true });
    assert.deepEqual({ ...currentMandate() }, { expiresAtNs: renewal.proposedExpiryNs, version: 2, revoked: false, live: true });
    assert.equal(mandateState(currentMandate(), Date.parse('2026-11-17T00:00:00Z')), 'active');
  } finally { globalThis.fetch = realFetch; }
});

test('the committed renewal record matches the finalized Testnet renewal', () => {
  const evidence = json('outputs/testnet-mandate-renewal-evidence.json');
  const intent = json('outputs/testnet-mandate-renewal-intent.json');
  assert.equal(evidence.verification, 'PASS');
  assert.equal(evidence.finalExecutionStatus, 'FINAL');
  assert.equal(MANDATE_RENEWAL.transactionHash, evidence.transactionHash);
  assert.equal(MANDATE_RENEWAL.transactionHash, intent.transactionHash);
  assert.equal(evidence.signer, ACCOUNTS.owner);
  assert.equal(evidence.receiver, ACCOUNTS.vault);
  assert.equal(evidence.vaultCodeHash, VAULT.codeHash);
  const result = JSON.parse(Buffer.from(evidence.status.SuccessValue, 'base64').toString('utf8'));
  assert.equal(result.version, MANDATE_RENEWAL.version);
  assert.equal(result.expires_at_ns, MANDATE_RENEWAL.expiresAtNs);
  assert.equal(result.revoked, false);
  for (const [field, key] of [['per_payment_yocto', 'perPaymentYocto'], ['daily_yocto', 'dailyYocto'], ['total_yocto', 'totalYocto']]) {
    assert.equal(result[field], MANDATE[key], `${field} unchanged by the renewal`);
  }
  assert.equal(result.agent, MANDATE.agent);
  assert.deepEqual(result.recipients, [...MANDATE.recipients]);
  assert.equal(formatUtcNs(MANDATE_RENEWAL.expiresAtNs), '2026-11-30 00:00 UTC');
});

test('the site has no wallet connection: owner actions are signed off-site', () => {
  const html = fs.readFileSync(path.join(ui, 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(ui, 'app.js'), 'utf8');
  assert.ok(!fs.existsSync(path.join(ui, 'wallet-bundle.js')), 'no wallet bundle is served');
  assert.doesNotMatch(html, /wallet-dialog|lab-wallet-open|CONNECT (OWNER )?WALLET/);
  assert.doesNotMatch(app, /wallet-bundle|walletBridge|signIn/);
  assert.match(html, /OWNER ACTIONS \/ OFF THIS SITE/);
});
