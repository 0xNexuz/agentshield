// The agent-side guard: everything the vault would check, plus counterparty risk signals,
// evaluated read-only before anything is signed. The contract remains the authority.
import { accountKind, assessCounterparty } from '../outputs/agentshield-ui/counterparty.mjs';
import { BLOCKLIST, PINNED_CODE_HASHES } from '../outputs/agentshield-ui/counterparty-policy.mjs';
import { preflightPayment } from './near-ai-payment-agent.mjs';
import { VAULT } from './vault-reader.mjs';

const RANK = { ALLOW: 0, WARN: 1, BLOCK: 2 };
const readableKinds = new Set(['testnet', 'implicit', 'eth-implicit']);

async function receiverFacts(reader, id) {
  if (!readableKinds.has(accountKind(id))) return null;
  try { return await reader.accountFacts(id); } catch { return null; }
}

export async function checkCounterparty(account, { reader, purpose = 'payment' }) {
  const id = typeof account === 'string' ? account.trim() : '';
  const [status, facts] = await Promise.all([reader.vaultStatus(), receiverFacts(reader, id)]);
  const assessment = assessCounterparty({ account: id, purpose, allowlist: status.mandate?.recipients ?? [],
    blocklist: BLOCKLIST, pinnedCodeHashes: PINNED_CODE_HASHES, facts });
  return { ...assessment, network: 'testnet', vaultAccountId: VAULT.vaultAccountId,
    mandateVersion: status.mandate?.version ?? null, rpc: reader.endpoint, checkedAt: new Date().toISOString() };
}

export async function checkPayment({ recipient, amountNear }, { reader }) {
  const id = typeof recipient === 'string' ? recipient.trim() : '';
  const [status, block, facts] = await Promise.all([reader.vaultStatus(), reader.finalBlock(), receiverFacts(reader, id)]);
  const preflight = preflightPayment({ recipient: id, amountNear }, status,
    { agentAccountId: VAULT.agentAccountId, nowNs: block.timestampNs, recipientExists: facts?.found === true });
  const counterparty = assessCounterparty({ account: id, purpose: 'payment', allowlist: status.mandate?.recipients ?? [],
    blocklist: BLOCKLIST, pinnedCodeHashes: PINNED_CODE_HASHES, facts });
  const decision = RANK[preflight.decision] >= RANK[counterparty.decision] ? preflight.decision : counterparty.decision;
  const reasons = [
    ...(preflight.decision === 'ALLOW' ? [] : [`Vault policy: ${preflight.reason}`]),
    ...counterparty.signals.filter(s => s.level !== 'INFO').map(s => `Counterparty: ${s.message}`),
  ];
  return {
    decision, maySign: decision === 'ALLOW', requiresHumanApproval: decision === 'WARN',
    reasons: reasons.length ? reasons : ['Recipient, amount, budgets, expiry and receiver checks all pass.'],
    recipient: id, amountNear, amountYocto: preflight.amountYocto ?? null,
    mandateVersion: status.mandate?.version ?? null, mandateExpiryNs: status.mandate?.expires_at_ns ?? null,
    blockHeight: block.height, nowNs: block.timestampNs,
    preflight, counterparty, vaultAccountId: VAULT.vaultAccountId, rpc: reader.endpoint,
  };
}
