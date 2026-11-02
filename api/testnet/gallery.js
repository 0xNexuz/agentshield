import { verifyNegativeScenarios } from '../../work/verify-testnet-negative-scenarios.mjs';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try { return res.status(200).json(await verifyNegativeScenarios()); }
  catch (error) { return res.status(502).json({ error: error.message }); }
}
