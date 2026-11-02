// Browser copy of preflightPayment from work/near-ai-payment-agent.mjs (Vercel serves only this folder).
// tests/cinematic-evidence.test.mjs runs both on the same inputs and fails if they ever disagree.
// This is an offchain guard. The vault contract remains the authority.
const accountPattern = /^[a-z0-9_-]+(?:\.[a-z0-9_-]+)*\.testnet$/;
const NEAR = 10n ** 24n;

function decimalToYocto(input) {
  if (typeof input !== 'string' || !/^(?:0|[1-9]\d*)(?:\.\d{1,24})?$/.test(input)) return null;
  const [whole, fraction = ''] = input.split('.');
  const value = BigInt(whole) * NEAR + BigInt((fraction + '0'.repeat(24)).slice(0, 24));
  return value > 0n && value <= (1n << 128n) - 1n ? value : null;
}
function result(decision, reason, extra = {}) {
  return { source: 'OFFCHAIN_PREFLIGHT', decision, reason, requiresHumanApproval: decision === 'WARN',
    maySign: decision === 'ALLOW', ...extra };
}

export function preflightPayment(modelOutput, vaultStatus, options = {}) {
  const proposal = modelOutput && typeof modelOutput === 'object' && !Array.isArray(modelOutput) ? modelOutput : null;
  if (!proposal || Object.keys(proposal).sort().join(',') !== 'amountNear,recipient') {
    return result('BLOCK', 'Model output must contain only recipient and amountNear.');
  }
  if (typeof proposal.recipient !== 'string' || !accountPattern.test(proposal.recipient) ||
    proposal.recipient.length > 64) return result('BLOCK', 'Recipient is not a valid Testnet account ID.');
  const amount = decimalToYocto(proposal.amountNear);
  if (amount === null) return result('BLOCK', 'Amount is not a positive exact NEAR decimal.');
  const mandate = vaultStatus?.mandate;
  if (!mandate || mandate.revoked || mandate.paused) return result('BLOCK', 'No active vault mandate.');
  if (mandate.agent !== options.agentAccountId) return result('BLOCK', 'Agent identity differs from the mandate.');
  if (typeof options.nowNs !== 'string' || !/^[0-9]+$/.test(options.nowNs)) {
    return result('BLOCK', 'Current finalized block time has not been verified.');
  }
  if (BigInt(mandate.expires_at_ns) <= BigInt(options.nowNs)) return result('BLOCK', 'Mandate has expired.');
  if (!mandate.recipients.includes(proposal.recipient)) return result('BLOCK', 'Recipient is not on the verified contract allowlist.');
  if (options.recipientExists !== true) return result('BLOCK', 'Recipient account existence has not been verified.');
  if (amount > BigInt(mandate.per_payment_yocto)) return result('BLOCK', 'Amount exceeds the per-payment cap.');
  const dailyCommitted = BigInt(vaultStatus.day_confirmed_yocto) + BigInt(vaultStatus.day_pending_yocto);
  if (dailyCommitted + amount > BigInt(mandate.daily_yocto)) return result('BLOCK', 'Amount exceeds the remaining UTC-day budget.');
  const totalCommitted = BigInt(vaultStatus.confirmed_total_yocto) + BigInt(vaultStatus.pending_total_yocto);
  if (totalCommitted + amount > BigInt(mandate.total_yocto)) return result('BLOCK', 'Amount exceeds the remaining total budget.');
  if (amount > BigInt(vaultStatus.available_yocto)) return result('BLOCK', 'Vault spendable balance is insufficient.');
  const details = { recipient: proposal.recipient, amountYocto: String(amount),
    mandateVersion: mandate.version, mandateExpiryNs: mandate.expires_at_ns };
  if (amount > BigInt(mandate.per_payment_yocto) / 2n) {
    return result('WARN', 'Payment is above half the per-payment cap; a human must approve this exact proposal.', details);
  }
  return result('ALLOW', 'Recipient, amount, budgets, balance, and expiry match the verified vault policy.', details);
}
