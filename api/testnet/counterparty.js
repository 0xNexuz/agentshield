import { checkCounterparty } from '../../work/payment-guard.mjs';
import { createVaultReader } from '../../work/vault-reader.mjs';

// GET /api/testnet/counterparty?account=<receiver>[&purpose=allowlist]
// Read-only. Malformed or look-alike input is accepted on purpose (it is what the check exists to catch),
// but bounded in length; nothing here signs or writes.
export default async function handler(req, res, { reader = createVaultReader() } = {}) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const account = typeof req.query?.account === 'string' ? req.query.account.trim() : '';
  const purpose = req.query?.purpose === 'allowlist' ? 'allowlist' : 'payment';
  if (!account || [...account].length > 80) {
    return res.status(400).json({ error: 'Enter a receiver account ID of up to 80 characters.' });
  }
  try { return res.status(200).json(await checkCounterparty(account, { reader, purpose })); }
  catch (error) { return res.status(502).json({ error: `Live check unavailable: ${error.message}. No conclusion is drawn.` }); }
}
