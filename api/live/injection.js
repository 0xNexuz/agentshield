import { LEGITIMATE_LINE, LIVE_MODEL, MAX_NOTE_CHARS, runLiveAttempt } from '../../work/live-injection.mjs';
import { createVaultReader } from '../../work/vault-reader.mjs';

// GET  /api/live/injection   → whether the live model is available
// POST /api/live/injection   { "note": "..." } → one attempt on the real model. Nothing is signed or sent.
//
// Spending is bounded three ways: the NEAR AI account holds a small prepaid balance (the hard ceiling),
// each server instance caps attempts per UTC day, and each visitor is rate-limited. Notes are not stored.
const WINDOW_MS = 10 * 60 * 1000;
const PER_VISITOR = 5;
const MAX_IN_FLIGHT = 3;
const dailyCap = () => Number(process.env.LIVE_INJECTION_DAILY_CAP || 150);
let visitors = new Map();
let day = '';
let usedToday = 0;
let inFlight = 0;
export function resetLimits() { visitors = new Map(); day = ''; usedToday = 0; inFlight = 0; }

const visitorOf = req => String(req.headers?.['x-real-ip'] || req.headers?.['x-forwarded-for']?.split(',')[0] || req.socket?.remoteAddress || 'unknown').trim();
function admit(visitor, now) {
  const today = new Date(now).toISOString().slice(0, 10);
  if (today !== day) { day = today; usedToday = 0; }
  if (usedToday >= dailyCap()) return 'DAILY_CAP';
  if (inFlight >= MAX_IN_FLIGHT) return 'BUSY';
  const recent = (visitors.get(visitor) ?? []).filter(t => now - t < WINDOW_MS);
  if (recent.length >= PER_VISITOR) { visitors.set(visitor, recent); return 'RATE_LIMITED'; }
  recent.push(now);
  visitors.set(visitor, recent);
  if (visitors.size > 5000) visitors = new Map([[visitor, recent]]);
  usedToday += 1;
  return null;
}

const unavailable = (res, reason, message) => res.status(503).json({ available: false, reason, message });

export default async function handler(req, res, { apiKey = process.env.NEAR_AI_KEY, reader = createVaultReader(), fetchImpl = fetch, now = Date.now } = {}) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'GET') {
    return res.status(200).json({ available: Boolean(apiKey), model: LIVE_MODEL, legitimateLine: LEGITIMATE_LINE, maxNoteChars: MAX_NOTE_CHARS,
      signsOrSends: false });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!String(req.headers?.['content-type'] ?? '').startsWith('application/json')) {
    return res.status(415).json({ error: 'Send JSON: {"note": "..."}' });
  }
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
  const note = body && typeof body === 'object' ? body.note : undefined;
  if (typeof note !== 'string' || !note.trim() || [...note].length > MAX_NOTE_CHARS) {
    return res.status(400).json({ error: `Write a note of 1 to ${MAX_NOTE_CHARS} characters.` });
  }
  if (!apiKey) return unavailable(res, 'NOT_CONFIGURED', 'The live model is not switched on for this deployment.');
  const refused = admit(visitorOf(req), now());
  if (refused === 'RATE_LIMITED') return res.status(429).json({ available: true, reason: refused, message: 'Five attempts per ten minutes. Try again shortly.' });
  if (refused === 'BUSY') return res.status(429).json({ available: true, reason: refused, message: 'The live model is busy. Try again in a moment.' });
  if (refused === 'DAILY_CAP') return unavailable(res, refused, 'Today\'s live attempts are used up. The recorded run below shows what the model did.');
  inFlight += 1;
  try {
    return res.status(200).json(await runLiveAttempt(note, { apiKey, reader, fetchImpl }));
  } catch (error) {
    const status = error.status;
    if (status === 400) return res.status(400).json({ error: error.message });
    if (status === 402) return unavailable(res, 'CREDITS_EXHAUSTED', 'The live model\'s prepaid credit has run out. The recorded run below shows what the model did.');
    if (status === 401 || status === 403) return unavailable(res, 'KEY_REJECTED', 'The live model is not available right now.');
    return unavailable(res, 'MODEL_UNAVAILABLE', 'The live model did not answer. The recorded run below shows what the model did.');
  } finally {
    inFlight -= 1;
  }
}
