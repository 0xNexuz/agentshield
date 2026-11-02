import { isTestnetAccountId, testnetAccount } from '../../work/near-testnet-rpc.mjs';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const accountId = req.query?.id;
  if (!isTestnetAccountId(accountId)) {
    return res.status(400).json({ error: 'Enter a valid .testnet or 64-character implicit account ID.' });
  }
  try { return res.status(200).json(await testnetAccount(accountId)); }
  catch (error) { return res.status(502).json({ error: error.message }); }
}
