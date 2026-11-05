import { verifyMcpPayment } from '../../work/verify-testnet-mcp-payment.mjs';

// GET /api/testnet/mcp-payment: rechecks, from the chain, the payment an agent made through the MCP server.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try { return res.status(200).json(await verifyMcpPayment()); }
  catch (error) { return res.status(502).json({ error: error.message }); }
}
