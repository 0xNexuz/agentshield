import assert from 'node:assert/strict';
import test from 'node:test';
import { assessAgentKeyPermission } from '../work/verify-agent-key.mjs';

const vault = 'vault.owner.testnet';
const exact = { FunctionCall: { receiver_id: vault, method_names: ['request_payment'], allowance: '250000000000000000000000' } };

test('accepts only a finite, exact vault payment-request key', () => {
  assert.deepEqual(assessAgentKeyPermission(exact, vault), {
    accepted: true, reason: 'EXACT_AGENT_SCOPE', allowanceYocto: exact.FunctionCall.allowance,
  });
});

test('rejects full access, wrong receiver, additional methods, and unlimited or exhausted gas allowances', () => {
  const invalid = [
    ['FullAccess', 'FUNCTION_CALL_PERMISSION_REQUIRED'],
    [{ FunctionCall: { ...exact.FunctionCall, receiver_id: 'other.testnet' } }, 'WRONG_RECEIVER'],
    [{ FunctionCall: { ...exact.FunctionCall, method_names: ['request_payment', 'withdraw_excess'] } }, 'METHOD_SCOPE_NOT_EXACT'],
    [{ FunctionCall: { ...exact.FunctionCall, method_names: [] } }, 'METHOD_SCOPE_NOT_EXACT'],
    [{ FunctionCall: { ...exact.FunctionCall, allowance: null } }, 'FINITE_POSITIVE_GAS_ALLOWANCE_REQUIRED'],
    [{ FunctionCall: { ...exact.FunctionCall, allowance: '0' } }, 'FINITE_POSITIVE_GAS_ALLOWANCE_REQUIRED'],
  ];
  for (const [permission, reason] of invalid) {
    assert.deepEqual(assessAgentKeyPermission(permission, vault), { accepted: false, reason });
  }
});
