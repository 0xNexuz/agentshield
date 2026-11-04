// The AgentShield MCP tools. Three are read-only. The fourth signs, but only after the same guard
// the other tools expose: BLOCK refuses, WARN asks the human through the MCP client, ALLOW proceeds.
// Whatever happens here, the vault contract rechecks every rule on chain.
import { randomBytes } from 'node:crypto';
import { checkCounterparty, checkPayment } from '../work/payment-guard.mjs';
import { VAULT } from '../work/vault-reader.mjs';

const NEAR = 10n ** 24n;
const REQUEST_TTL_NS = 10n * 60n * 1_000_000_000n;
export function formatNear(yocto) {
  const value = BigInt(yocto);
  const fraction = String(value % NEAR).padStart(24, '0').replace(/0+$/, '');
  return `${value / NEAR}${fraction ? `.${fraction}` : ''}`;
}
const utc = ns => new Date(Number(BigInt(ns) / 1_000_000n)).toISOString();

const accountArg = { type: 'string', maxLength: 80, description: 'Receiver account ID on NEAR Testnet, e.g. "shop.testnet".' };
const amountArg = { type: 'string', maxLength: 32, pattern: '^(?:0|[1-9]\\d*)(?:\\.\\d{1,24})?$',
  description: 'Exact amount in NEAR as a decimal string, e.g. "0.005".' };

export function summarizeVault(status, rpc) {
  const m = status.mandate;
  const dayUsed = BigInt(status.day_confirmed_yocto) + BigInt(status.day_pending_yocto);
  const totalUsed = BigInt(status.confirmed_total_yocto) + BigInt(status.pending_total_yocto);
  const left = (limit, used) => formatNear(BigInt(limit) > used ? BigInt(limit) - used : 0n);
  return {
    network: 'testnet', vaultAccountId: VAULT.vaultAccountId, owner: status.owner, codeHash: VAULT.expectedCodeHash,
    mandate: m ? { version: m.version, agent: m.agent, recipients: m.recipients, perPaymentNear: formatNear(m.per_payment_yocto),
      dailyNear: formatNear(m.daily_yocto), totalNear: formatNear(m.total_yocto), expiresAtUtc: utc(m.expires_at_ns),
      paused: m.paused, revoked: m.revoked } : null,
    spentTodayNear: formatNear(dayUsed), remainingTodayNear: m ? left(m.daily_yocto, dayUsed) : '0',
    spentTotalNear: formatNear(totalUsed), remainingTotalNear: m ? left(m.total_yocto, totalUsed) : '0',
    vaultSpendableNear: formatNear(status.available_yocto), rpc, checkedAt: new Date().toISOString(),
  };
}

export function createAgentShieldTools({ reader, signer = null, newNonce = () => `mcp-${randomBytes(12).toString('hex')}` }) {
  return [
    {
      name: 'agentshield_vault_status', title: 'AgentShield vault status',
      description: 'Read the live AgentShield vault on NEAR Testnet: who the agent is, which recipients it may pay, the per-payment, daily and total limits, expiry, whether it is paused or revoked, and how much budget is left. Read-only.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, openWorldHint: true },
      handler: async () => summarizeVault(await reader.vaultStatus(), reader.endpoint),
    },
    {
      name: 'agentshield_check_recipient', title: 'Check a payment receiver',
      description: 'Check a receiver before paying it, or before an owner allowlists it: allowlist, look-alike names (swapped characters, non-Latin letters, suffix tricks, other network), a blocklist with evidence, whether the account exists, and whether its contract code changed since the owner approved it. Returns ALLOW, WARN or BLOCK with reasons. Read-only.',
      inputSchema: { type: 'object', additionalProperties: false, required: ['account'],
        properties: { account: accountArg, purpose: { type: 'string', enum: ['payment', 'allowlist'],
          description: '"payment" (default): the agent is about to pay. "allowlist": the owner is about to add this receiver.' } } },
      annotations: { readOnlyHint: true, openWorldHint: true },
      handler: ({ account, purpose = 'payment' }) => checkCounterparty(account, { reader, purpose }),
    },
    {
      name: 'agentshield_check_payment', title: 'Dry-run a payment',
      description: 'Dry-run a payment: everything the vault contract checks (agent, allowlist, per-payment cap, daily and total budget, expiry, pause, revocation, balance) plus the receiver checks. Returns ALLOW, WARN (a human must approve) or BLOCK, with reasons. Nothing is signed.',
      inputSchema: { type: 'object', additionalProperties: false, required: ['recipient', 'amountNear'],
        properties: { recipient: accountArg, amountNear: amountArg } },
      annotations: { readOnlyHint: true, openWorldHint: true },
      handler: ({ recipient, amountNear }) => checkPayment({ recipient, amountNear }, { reader }),
    },
    {
      name: 'agentshield_request_payment', title: 'Request a payment from the vault',
      description: 'Ask the AgentShield vault to pay a recipient. Runs the dry-run first: BLOCK refuses without signing, WARN asks the human through this client and signs only if they approve, ALLOW signs a request_payment call with the agent\'s restricted key (it can call nothing else). The vault contract then rechecks every rule. NEAR Testnet only.',
      inputSchema: { type: 'object', additionalProperties: false, required: ['recipient', 'amountNear'],
        properties: { recipient: accountArg, amountNear: amountArg } },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
      handler: async ({ recipient, amountNear }, context) => {
        const check = await checkPayment({ recipient, amountNear }, { reader });
        const base = { recipient: check.recipient, amountNear, decision: check.decision, reasons: check.reasons };
        if (check.decision === 'BLOCK') return { outcome: 'REFUSED', signed: false, ...base, note: 'Blocked before signing. Nothing was sent.' };
        if (!signer) {
          return { outcome: 'NOT_CONFIGURED', signed: false, ...base,
            note: 'This server has no agent key (set AGENTSHIELD_AGENT_KEY_FILE on the owner\'s machine), so it can only check payments. Nothing was sent.' };
        }
        let humanApproved = false;
        if (check.decision === 'WARN') {
          if (!context.canElicit) {
            return { outcome: 'NEEDS_HUMAN', signed: false, ...base,
              note: 'This payment needs a human to approve it, and this MCP client cannot ask one. Nothing was sent.' };
          }
          const answer = await context.elicit({
            message: `AgentShield needs your approval before the agent signs.\nPay ${amountNear} test NEAR to ${check.recipient}?\n${check.reasons.join('\n')}`,
            requestedSchema: { type: 'object', required: ['approve'], properties: {
              approve: { type: 'boolean', title: 'Approve this exact payment', description: `${amountNear} test NEAR to ${check.recipient}` } } },
          });
          if (answer?.action !== 'accept' || answer?.content?.approve !== true) {
            return { outcome: 'DECLINED_BY_HUMAN', signed: false, ...base, note: 'The human did not approve. Nothing was sent.' };
          }
          humanApproved = true;
        }
        const ceiling = BigInt(check.mandateExpiryNs) - 1n;
        const expiry = BigInt(check.nowNs) + REQUEST_TTL_NS;
        const request = { recipient: check.recipient, amountYocto: check.amountYocto, nonce: newNonce(),
          expiresAtNs: String(expiry < ceiling ? expiry : ceiling), expectedVersion: check.mandateVersion };
        const sent = await signer.requestPayment(request);
        return {
          outcome: sent.decision?.decision === 'AUTHORIZED' ? 'AUTHORIZED' : 'REJECTED_BY_CONTRACT', signed: true, humanApproved,
          ...base, request, transactionHash: sent.transactionHash, contractDecision: sent.decision, explorerUrl: sent.explorerUrl,
          note: 'The vault rechecked every rule on chain. Its callback records settlement after the transfer; open the transaction to see the transfer receipt.',
        };
      },
    },
  ];
}
