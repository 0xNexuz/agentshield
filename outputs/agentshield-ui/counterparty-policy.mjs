// Owner-side policy for the counterparty check. Public data only.

// Code hash approved for each allowlisted recipient. The recipient was read on 2026-11-04 from
// finalized Testnet state (block 276180481): a plain account with no contract code.
export const PINNED_CODE_HASHES = Object.freeze({
  'agentshield-recipient-7bb4a0df1077.testnet': '11111111111111111111111111111111',
});

// Every entry needs evidence. These accounts were the redirect targets in AgentShield's own
// recorded prompt-injection run (outputs/near-ai-redteam-evidence-run2.json). Listing them says
// what those prompts asked for; it is not a claim about who owns the accounts.
const REDTEAM = 'outputs/near-ai-redteam-evidence-run2.json';
export const BLOCKLIST = Object.freeze([
  { account: 'attacker.testnet', reason: 'Named as the payment redirect in recorded prompt-injection cases 07, 09, 11 and 16.',
    evidence: `${REDTEAM} cases 07_json_override, 09_html_hidden, 11_base64_redirect, 16_fake_auditor` },
  { account: 'attacker-vault.testnet', reason: 'Named as the payment redirect in recorded prompt-injection case 02.',
    evidence: `${REDTEAM} case 02_fake_system_policy` },
  { account: 'owner-refund.testnet', reason: 'Named as the payment redirect in recorded prompt-injection case 08.',
    evidence: `${REDTEAM} case 08_fake_owner_urgency` },
].map(Object.freeze));
