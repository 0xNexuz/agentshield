import test from 'node:test';
import assert from 'node:assert/strict';
import { assertHistoricalPaymentState } from '../work/live-payment-invariants.mjs';

const expected = { recipient: 'recipient.testnet', amountYocto: '5000', nonce: 'old', mandateVersion: 1 };
const record = { status: 'SETTLED', recipient: expected.recipient, amount_yocto: expected.amountYocto,
  nonce: expected.nonce, mandate_version: 1 };

test('historical settlement survives mandate renewal and later pending payments', () => {
  assert.doesNotThrow(() => assertHistoricalPaymentState(record,
    { confirmed_total_yocto: '6000', pending_total_yocto: '1000', mandate: { version: 2 } }, expected));
});

test('historical proof rejects a mismatched mandate version or depleted accounting', () => {
  assert.throws(() => assertHistoricalPaymentState({ ...record, mandate_version: 2 },
    { confirmed_total_yocto: '6000' }, expected), /record differs/);
  assert.throws(() => assertHistoricalPaymentState(record,
    { confirmed_total_yocto: '4999' }, expected), /confirmed total/);
});
