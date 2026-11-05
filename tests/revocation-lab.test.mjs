import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkFailedDeploy } from '../work/verify-testnet-revocation-lab.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const json = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const intent = json('outputs/testnet-revocation-deploy-intent.json');
const failure = json('outputs/testnet-revocation-deploy-failure.json');
const tx = (over = {}) => ({ final_execution_status: 'FINAL',
  transaction: { hash: intent.hash, signer_id: intent.signer, receiver_id: intent.receiver, actions: [{}, {}, {}, {}] },
  status: { Failure: { ActionError: { index: 3, kind: { FunctionCallError: {} } } } }, ...over });

test('the failed revocation deploy check accepts only the recorded four-action failure at initialize', () => {
  assert.deepEqual(checkFailedDeploy(tx(), intent, failure), { failedActionIndex: 3, kind: 'FunctionCallError' });
  assert.throws(() => checkFailedDeploy(tx({ status: { SuccessValue: '' } }), intent, failure), /failure at action 3/);
  assert.throws(() => checkFailedDeploy(tx({ final_execution_status: 'EXECUTED' }), intent, failure), /not FINAL/);
  assert.throws(() => checkFailedDeploy(tx({ transaction: { ...tx().transaction, receiver_id: 'other.testnet' } }), intent, failure), /parties/);
  assert.throws(() => checkFailedDeploy(tx({ transaction: { ...tx().transaction, actions: [{}] } }), intent, failure), /four-action/);
});

test('the committed independent recheck matches the failure record', () => {
  const recheck = json('outputs/testnet-revocation-deploy-failure-independent-proof.json');
  assert.equal(recheck.verification, 'PASS');
  assert.equal(recheck.transactionHash, failure.transactionHash);
  assert.equal(recheck.failedActionIndex, failure.failureActionIndex);
  assert.equal(recheck.isolatedVaultExistsNow, false);
  assert.ok(recheck.archivalAnswers.every(a => a.ok), 'both archival nodes confirmed it');
});
