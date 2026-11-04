import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { probeArgs } from '../work/execute-testnet-rejection-probes.mjs';
import { checkMcpPaymentTx } from '../work/verify-testnet-mcp-payment.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const probes = JSON.parse(fs.readFileSync(path.join(root, 'deployment/testnet-rejection-probes-v2-proposal.json'), 'utf8'));
const demo = JSON.parse(fs.readFileSync(path.join(root, 'deployment/testnet-live-demo-proposal.json'), 'utf8'));
const NOW = 1793800000000000000n;

// The contract's decision order (request_payment in contracts/vault/src/lib.rs), for the declared mandate.
function contractReason(signer, args, now) {
  const m = probes.mandate;
  if (signer !== probes.agentAccountId) return 'WRONG_AGENT';
  if (args.expected_version !== m.version) return 'STALE_VERSION';
  if (BigInt(args.expires_at_ns) <= now || BigInt(args.expires_at_ns) > BigInt(m.expiresAtNs)) return 'EXPIRED';
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(args.nonce)) return 'INVALID_NONCE';
  if (!m.recipients.includes(args.recipient)) return 'RECIPIENT_NOT_ALLOWED';
  if (BigInt(args.amount_yocto) === 0n || BigInt(args.amount_yocto) > BigInt(m.perPaymentYocto)) return 'PER_PAYMENT_LIMIT';
  return 'WOULD_PASS_POLICY';
}

test('each declared probe breaks exactly one rule, so the contract can only refuse it for the declared reason', () => {
  assert.deepEqual(Object.keys(probes.scenarios), ['staleVersion', 'expired', 'lookalikeRecipient', 'wrongAgent']);
  assert.equal(probes.vaultAccountId, demo.vaultAccountId);
  assert.equal(probes.codeHash, demo.expectedCodeHash);
  const nonces = new Set();
  for (const [name, scenario] of Object.entries(probes.scenarios)) {
    const args = probeArgs(name, String(NOW));
    const signer = scenario.signer === 'owner' ? probes.ownerAccountId : probes.agentAccountId;
    assert.equal(contractReason(signer, args, NOW), scenario.expectedReason, name);
    // Fixing the one broken rule would make the request pass policy: nothing else is wrong with it.
    const fixed = { ...args, expected_version: probes.mandate.version, recipient: probes.mandate.recipients[0],
      expires_at_ns: String(NOW + 600_000_000_000n) };
    assert.equal(contractReason(probes.agentAccountId, fixed, NOW), 'WOULD_PASS_POLICY', `${name} breaks more than one rule`);
    assert.ok(/^[A-Za-z0-9_-]{8,64}$/.test(scenario.nonce) && !nonces.has(scenario.nonce), `${name} nonce`);
    nonces.add(scenario.nonce);
  }
  assert.equal(probes.scenarios.lookalikeRecipient.recipient, 'agentshield-recipient-7bb4a0df1o77.testnet', 'the look-alike from red-team case 03');
  assert.equal(probes.amountYocto, '5000000000000000000000');
});

test('probe expiries are ten minutes ahead, or a minute in the past for the expired probe', () => {
  assert.equal(probeArgs('staleVersion', String(NOW)).expires_at_ns, String(NOW + 600_000_000_000n));
  assert.equal(probeArgs('expired', String(NOW)).expires_at_ns, String(NOW - 60_000_000_000n));
  assert.equal(probeArgs('wrongAgent', String(NOW)).expected_version, 2);
  assert.equal(probeArgs('staleVersion', String(NOW)).expected_version, 1);
});

// A synthetic finalized transaction shaped like NEAR's EXPERIMENTAL_tx_status result.
const request = { recipient: demo.recipientAccountId, amountYocto: '5000000000000000000000', nonce: 'mcp-abc123',
  expiresAtNs: '1793800600000000000', expectedVersion: 2 };
const evidence = { transactionHash: 'Tx111', requestId: 'req1', request };
function paymentTx(overrides = {}) {
  const args = { recipient: request.recipient, amount_yocto: request.amountYocto, nonce: request.nonce,
    expires_at_ns: request.expiresAtNs, expected_version: request.expectedVersion, ...overrides.args };
  return {
    final_execution_status: 'FINAL', status: { SuccessValue: '' },
    transaction: { signer_id: demo.agentAccountId, receiver_id: demo.vaultAccountId, public_key: demo.restrictedKey.publicKey,
      actions: [{ FunctionCall: { method_name: 'request_payment', deposit: '0', args: Buffer.from(JSON.stringify(args)).toString('base64') } }],
      ...overrides.transaction },
    receipts: [{ receipt_id: 'r-transfer', predecessor_id: demo.vaultAccountId, receiver_id: request.recipient,
      receipt: { Action: { actions: [{ Transfer: { deposit: overrides.deposit ?? request.amountYocto } }] } } }],
    receipts_outcome: [
      { id: 'r-call', outcome: { logs: [`AGENTSHIELD_DECISION request_id=req1 decision=AUTHORIZED version=2`], status: { SuccessValue: '' } } },
      { id: 'r-transfer', outcome: { logs: [], status: { SuccessValue: '' } } },
      { id: 'r-callback', outcome: { logs: overrides.noSettlement ? [] : ['AGENTSHIELD_SETTLEMENT request_id=req1 status=SETTLED'], status: { SuccessValue: 'dHJ1ZQ==' } } },
    ],
  };
}

test('the MCP payment check accepts the exact settled payment and rejects any difference', () => {
  assert.deepEqual(checkMcpPaymentTx(paymentTx(), evidence), { transferReceiptId: 'r-transfer' });
  assert.throws(() => checkMcpPaymentTx(paymentTx({ transaction: { public_key: 'ed25519:other' } }), evidence), /restricted agent key/);
  assert.throws(() => checkMcpPaymentTx(paymentTx({ transaction: { signer_id: 'someone.testnet' } }), evidence), /Signer/);
  assert.throws(() => checkMcpPaymentTx(paymentTx({ args: { recipient: 'attacker.testnet' } }), evidence), /arguments differ/);
  assert.throws(() => checkMcpPaymentTx(paymentTx({ args: { amount_yocto: '6000000000000000000000' } }), evidence), /arguments differ/);
  assert.throws(() => checkMcpPaymentTx(paymentTx({ deposit: '1' }), evidence), /transfer receipt missing/);
  assert.throws(() => checkMcpPaymentTx(paymentTx({ noSettlement: true }), evidence), /Settlement log missing/);
  assert.throws(() => checkMcpPaymentTx({ ...paymentTx(), final_execution_status: 'EXECUTED_OPTIMISTIC' }, evidence), /not finalized/);
});
