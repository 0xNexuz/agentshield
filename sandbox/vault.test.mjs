import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { KeyPair, Worker } from 'near-workspaces';
import { connect, keyStores, transactions } from 'near-api-js';

const WASM = fileURLToPath(new URL('../deployment/agentshield_vault.wasm', import.meta.url));
const EXPECTED_CODE_HASH = '2KHm9Waz7fQfQ2A1MWmHhVSwx7o7sm8p1KXBTVyggCqN';
const NEAR = 10n ** 24n;
const DAY_NS = 86_400_000_000_000n;

test('AgentShield vault executes in NEAR Sandbox', { timeout: 240_000 }, async (t) => {
  const worker = await Worker.init();
  t.after(async () => worker.tearDown());
  const owner = worker.rootAccount;
  const agent = await owner.createSubAccount('agent', { initialBalance: 2n * NEAR });
  const merchant = await owner.createSubAccount('merchant', { initialBalance: 2n * NEAR });
  const stranger = await owner.createSubAccount('stranger', { initialBalance: 2n * NEAR });

  async function deployVault() {
    const vault = await owner.devDeploy(WASM, {
      initialBalance: 5n * NEAR,
      method: 'initialize',
      args: { owner: owner.accountId, domain: 'agentshield:testnet:v1' },
    });
    const status = await vault.view('get_vault_status');
    assert.equal(status.owner, owner.accountId);
    assert.equal(status.domain, 'agentshield:testnet:v1');
    assert.equal((await vault.accountView()).code_hash, EXPECTED_CODE_HASH);
    return vault;
  }

  async function setMandate(vault, recipientIds = [merchant.accountId], overrides = {}) {
    const block = await worker.provider.block({ finality: 'final' });
    const expiry = (BigInt(block.header.timestamp_nanosec) + DAY_NS).toString();
    const mandate = await owner.call(vault, 'set_mandate', {
      agent: agent.accountId,
      recipients: recipientIds,
      per_payment_yocto: (NEAR / 5n).toString(),
      daily_yocto: (NEAR * 3n / 10n).toString(),
      total_yocto: (NEAR * 4n / 10n).toString(),
      expires_at_ns: expiry,
      ...overrides,
    });
    assert.equal(mandate.version, 1);
    return expiry;
  }

  function requestArgs(recipient, amount, nonce, expiry, version = 1) {
    return {
      recipient,
      amount_yocto: amount.toString(),
      nonce,
      expires_at_ns: expiry,
      expected_version: version,
    };
  }

  await t.test('funding, owner authorization, settlement and replay', async () => {
    const vault = await deployVault();
    const beforeFund = await vault.view('get_vault_status');
    const fund = await owner.callRaw(vault, 'fund', {}, { attachedDeposit: NEAR });
    assert.equal(fund.failed, false, fund.summary());
    assert.equal(fund.parseResult(), NEAR.toString());
    const afterFund = await vault.view('get_vault_status');
    assert.ok(BigInt(afterFund.balance_yocto) - BigInt(beforeFund.balance_yocto) >= NEAR);

    const unauthorizedFund = await stranger.callRaw(vault, 'fund', {}, { attachedDeposit: 1n });
    assert.equal(unauthorizedFund.failed, true, 'a non-owner must not fund via the owner-only method');
    const expiry = await setMandate(vault);
    const beforeRecipient = BigInt((await merchant.balance()).total);
    const accepted = await agent.callRaw(vault, 'request_payment', requestArgs(merchant.accountId, NEAR / 10n, 'payment-1', expiry));
    assert.equal(accepted.failed, false, accepted.summary());
    const decision = accepted.parseResult();
    assert.equal(decision.decision, 'AUTHORIZED');
    assert.match(decision.request_id, /^[0-9a-f]{64}$/);
    const record = await vault.view('get_request', { request_id: decision.request_id });
    assert.equal(record.status, 'SETTLED');
    const afterRecipient = BigInt((await merchant.balance()).total);
    assert.equal(afterRecipient - beforeRecipient, NEAR / 10n);
    const status = await vault.view('get_vault_status');
    assert.equal(status.confirmed_total_yocto, (NEAR / 10n).toString());
    assert.equal(status.pending_total_yocto, '0');
    assert.equal(status.accepted_requests, 1);

    const replay = await agent.call(vault, 'request_payment', requestArgs(merchant.accountId, NEAR / 10n, 'payment-1', expiry));
    assert.deepEqual(replay, { decision: 'REJECTED', reason: 'REPLAY' });
    assert.equal(BigInt((await merchant.balance()).total), afterRecipient);
    console.log(`SANDBOX_SETTLEMENT tx=${accepted.transactionReceipt.hash} request=${decision.request_id}`);
  });

  await t.test('allowlist, per-payment limit and agent identity', async () => {
    const vault = await deployVault();
    const expiry = await setMandate(vault);
    const wrongAgent = await stranger.call(vault, 'request_payment', requestArgs(merchant.accountId, NEAR / 10n, 'wrong-agent', expiry));
    assert.deepEqual(wrongAgent, { decision: 'REJECTED', reason: 'WRONG_AGENT' });
    const wrongRecipient = await agent.call(vault, 'request_payment', requestArgs(stranger.accountId, NEAR / 10n, 'wrong-recipient', expiry));
    assert.deepEqual(wrongRecipient, { decision: 'REJECTED', reason: 'RECIPIENT_NOT_ALLOWED' });
    const tooLarge = await agent.call(vault, 'request_payment', requestArgs(merchant.accountId, NEAR / 4n, 'too-large', expiry));
    assert.deepEqual(tooLarge, { decision: 'REJECTED', reason: 'PER_PAYMENT_LIMIT' });
    const status = await vault.view('get_vault_status');
    assert.equal(status.confirmed_total_yocto, '0');
    assert.equal(status.accepted_requests, 0);
  });

  await t.test('restricted function-call key settles only the approved vault method', async () => {
    const vault = await deployVault();
    const expiry = await setMandate(vault);
    const key = KeyPair.fromRandom('ed25519');
    const addKeyTx = await agent.batch(agent).addKey(key.getPublicKey(),
      transactions.functionCallAccessKey(vault.accountId, ['request_payment'], NEAR / 10n)).transact();
    assert.equal(addKeyTx.failed, false, addKeyTx.summary());
    const access = await worker.provider.query({
      request_type: 'view_access_key', finality: 'optimistic',
      account_id: agent.accountId, public_key: key.getPublicKey().toString(),
    });
    assert.deepEqual(access.permission, {
      FunctionCall: { allowance: (NEAR / 10n).toString(), receiver_id: vault.accountId, method_names: ['request_payment'] },
    });
    const before = BigInt((await merchant.balance()).total);
    const payment = await agent.callRaw(vault, 'request_payment',
      requestArgs(merchant.accountId, NEAR / 100n, 'limited-key-payment', expiry),
      { signWithKey: key, gas: 70n * 10n ** 12n, attachedDeposit: 0n });
    assert.equal(payment.failed, false, payment.summary());
    const decision = payment.parseResult();
    assert.equal(decision.decision, 'AUTHORIZED');
    assert.equal((await vault.view('get_request', { request_id: decision.request_id })).status, 'SETTLED');
    assert.equal(BigInt((await merchant.balance()).total) - before, NEAR / 100n);
    await assert.rejects(agent.callRaw(vault, 'withdraw_excess', { amount_yocto: '1' },
      { signWithKey: key, gas: 30n * 10n ** 12n, attachedDeposit: 0n }));
    assert.equal((await vault.view('get_vault_status')).confirmed_total_yocto, (NEAR / 100n).toString());
  });

  await t.test('failed recipient transfer releases reservation without settlement', async () => {
    const missing = 'does-not-exist.test.near';
    const vault = await deployVault();
    const expiry = await setMandate(vault, [missing]);
    const tx = await agent.callRaw(vault, 'request_payment', requestArgs(missing, NEAR / 10n, 'failed-transfer', expiry));
    assert.equal(tx.failed, false, tx.summary());
    const decision = tx.parseResult();
    assert.equal(decision.decision, 'AUTHORIZED');
    const record = await vault.view('get_request', { request_id: decision.request_id });
    assert.equal(record.status, 'TRANSFER_FAILED');
    const status = await vault.view('get_vault_status');
    assert.equal(status.confirmed_total_yocto, '0');
    assert.equal(status.pending_total_yocto, '0');
    assert.equal(status.accepted_requests, 1);
    assert.ok(tx.receiptFailures.length > 0, 'the missing-recipient transfer must fail in a receipt');
    console.log(`SANDBOX_FAILED_TRANSFER tx=${tx.transactionReceipt.hash} request=${decision.request_id}`);
  });

  await t.test('revocation prevents new payments after settlement', async () => {
    const vault = await deployVault();
    const expiry = await setMandate(vault);
    const first = await agent.call(vault, 'request_payment', requestArgs(merchant.accountId, NEAR / 10n, 'before-revoke', expiry));
    assert.equal(first.decision, 'AUTHORIZED');
    await owner.call(vault, 'revoke', {});
    const status = await vault.view('get_vault_status');
    assert.equal(status.mandate.revoked, true);
    const rejected = await agent.call(vault, 'request_payment', requestArgs(merchant.accountId, NEAR / 10n, 'after-revoke', expiry, status.mandate.version));
    assert.deepEqual(rejected, { decision: 'REJECTED', reason: 'REVOKED' });
    assert.equal((await vault.view('get_request', { request_id: first.request_id })).status, 'SETTLED');
    assert.equal((await vault.view('get_vault_status')).confirmed_total_yocto, (NEAR / 10n).toString());
  });

  await t.test('two agent keys cannot exceed a shared budget', async () => {
    const vault = await deployVault();
    const expiry = await setMandate(vault, [merchant.accountId], {
      per_payment_yocto: (NEAR / 10n).toString(),
      daily_yocto: (NEAR * 15n / 100n).toString(),
      total_yocto: (NEAR * 15n / 100n).toString(),
    });
    const keys = [KeyPair.fromRandom('ed25519'), KeyPair.fromRandom('ed25519')];
    for (const key of keys) {
      await agent.batch(agent).addKey(key.getPublicKey()).transact();
    }
    const recipientBefore = BigInt((await merchant.balance()).total);
    // near-workspaces temporarily swaps keys in one filesystem file per account.
    // Isolated in-memory signers let both agent keys sign concurrently without
    // racing that test-harness file, while preserving the shared onchain budget.
    const signers = await Promise.all(keys.map(async key => {
      const keyStore = new keyStores.InMemoryKeyStore();
      await keyStore.setKey('sandbox', agent.accountId, key);
      const near = await connect({ networkId: 'sandbox', nodeUrl: worker.rpcAddr, keyStore });
      return near.account(agent.accountId);
    }));
    const outcomes = await Promise.all(signers.map((signer, index) =>
      signer.signAndSendTransaction({ receiverId: vault.accountId,
        actions: [transactions.functionCall('request_payment',
          requestArgs(merchant.accountId, NEAR / 10n, `parallel-${index}`, expiry), 70_000_000_000_000n, 0n)],
        returnError: true })
    ));
    assert.ok(outcomes.every((outcome) => !outcome.status.Failure), 'both request transactions must reach the contract');
    const decisions = outcomes.map((outcome) => JSON.parse(Buffer.from(outcome.status.SuccessValue, 'base64').toString('utf8')));
    assert.equal(decisions.filter((d) => d.decision === 'AUTHORIZED').length, 1);
    assert.equal(decisions.filter((d) => d.reason === 'DAILY_LIMIT').length, 1);
    const status = await vault.view('get_vault_status');
    assert.equal(status.confirmed_total_yocto, (NEAR / 10n).toString());
    assert.equal(status.pending_total_yocto, '0');
    assert.equal(BigInt((await merchant.balance()).total) - recipientBefore, NEAR / 10n);
  });

  await t.test('pause, stale version and owner withdrawal', async () => {
    const vault = await deployVault();
    const expiry = await setMandate(vault);
    await owner.call(vault, 'pause', {});
    assert.deepEqual(
      await agent.call(vault, 'request_payment', requestArgs(merchant.accountId, NEAR / 10n, 'while-paused', expiry, 2)),
      { decision: 'REJECTED', reason: 'PAUSED' },
    );
    await owner.call(vault, 'resume', {});
    assert.deepEqual(
      await agent.call(vault, 'request_payment', requestArgs(merchant.accountId, NEAR / 10n, 'stale-version', expiry, 1)),
      { decision: 'REJECTED', reason: 'STALE_VERSION' },
    );
    assert.deepEqual(
      await agent.call(vault, 'request_payment', requestArgs(merchant.accountId, NEAR / 10n, 'expired-request', '1', 3)),
      { decision: 'REJECTED', reason: 'EXPIRED' },
    );
    const withdrawal = await owner.callRaw(vault, 'withdraw_excess', { amount_yocto: (NEAR / 10n).toString() });
    assert.equal(withdrawal.failed, false, withdrawal.summary());
    assert.ok(withdrawal.logs.some((log) => log.includes('AGENTSHIELD_WITHDRAWAL status=SETTLED')));
    const status = await vault.view('get_vault_status');
    assert.equal(status.pending_withdrawal_yocto, '0');
    assert.equal(status.confirmed_total_yocto, '0');
  });
});
