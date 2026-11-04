// Checks the production site's read-only endpoints end to end. Run daily by
// .github/workflows/live-evidence.yml, alongside the verifiers that recheck Testnet directly.
//   node work/check-live-site.mjs [https://agentshield-lab.vercel.app]
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const base = (process.argv[2] || 'https://agentshield-lab.vercel.app').replace(/\/$/, '');
const RECIPIENT = 'agentshield-recipient-7bb4a0df1077.testnet';
const PAYMENT = '3buDvBXKDHcCe9VBNtLSSp4H7LLjLfGk7K4XT2jh53jm';
const CODE_HASH = '2KHm9Waz7fQfQ2A1MWmHhVSwx7o7sm8p1KXBTVyggCqN';

async function get(route, { json = true } = {}) {
  const response = await fetch(`${base}${route}`, { headers: { 'user-agent': 'agentshield-live-evidence-check' },
    signal: AbortSignal.timeout(90_000) });
  const body = json ? await response.json().catch(() => null) : await response.text();
  return { status: response.status, body };
}

export const checks = [
  ['payment proof passes', async () => {
    const { status, body } = await get('/api/testnet/proof');
    return status === 200 && body?.verification === 'PASS' && body.settlement === 'SETTLED' &&
      body.transactionHash === PAYMENT && body.codeHash === CODE_HASH && body.currentKeyStillScoped === true
      ? [true, `PASS, SETTLED, mandate v${body.currentMandateVersion}, transactions from ${body.rpc?.transactions?.join(', ')}`] : [false, `HTTP ${status}: ${JSON.stringify(body).slice(0, 300)}`];
  }],
  ['every rejection proof passes', async () => {
    const { status, body } = await get('/api/testnet/gallery');
    const ok = status === 200 && Array.isArray(body) && body.length >= 3 &&
      body.every(p => p.verification === 'PASS' && p.decision === 'REJECTED' && p.vaultTransferReceiptCount === 0);
    return ok ? [true, body.map(p => p.reason).join(', ')] : [false, `HTTP ${status}: ${JSON.stringify(body).slice(0, 300)}`];
  }],
  ['counterparty check allows the real recipient', async () => {
    const { status, body } = await get(`/api/testnet/counterparty?account=${RECIPIENT}`);
    return status === 200 && body?.decision === 'ALLOW' ? [true, `ALLOW, mandate v${body.mandateVersion}`] : [false, `HTTP ${status}: ${JSON.stringify(body).slice(0, 300)}`];
  }],
  ['counterparty check blocks the recorded look-alike', async () => {
    const { status, body } = await get('/api/testnet/counterparty?account=agentshield-recipient-7bb4a0df1o77.testnet');
    return status === 200 && body?.decision === 'BLOCK' && body.signals?.some(s => s.code === 'LOOKALIKE')
      ? [true, 'BLOCK, LOOKALIKE'] : [false, `HTTP ${status}: ${JSON.stringify(body).slice(0, 300)}`];
  }],
  ['Testnet RPC is healthy', async () => {
    const { status, body } = await get('/api/testnet/status');
    return status === 200 && body?.chainId === 'testnet' && body.healthy === true
      ? [true, `block ${body.latestBlockHeight}`] : [false, `HTTP ${status}: ${JSON.stringify(body).slice(0, 300)}`];
  }],
  ['site is up', async () => {
    const { status, body } = await get('/', { json: false });
    return status === 200 && body.includes('TRUST, BUT VERIFY') ? [true, 'homepage served'] : [false, `HTTP ${status}`];
  }],
];

export async function runChecks(list = checks) {
  const results = [];
  for (const [name, check] of list) {
    let ok = false;
    let detail;
    try { [ok, detail] = await check(); } catch (error) { detail = `error: ${error.message}`; }
    results.push({ name, ok, detail });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: ${detail}`);
  }
  return results;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(`Checking ${base} at ${new Date().toISOString()}`);
  const results = await runChecks();
  const failed = results.filter(r => !r.ok).length;
  console.log(failed ? `${failed} of ${results.length} checks failed` : `all ${results.length} checks passed`);
  process.exitCode = failed ? 1 : 0;
}
