import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { ElicitRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { assertRestrictedKey, createRestrictedSigner, decodeDecision } from '../mcp/near-signer.mjs';
import { validateArguments } from '../mcp/server-core.mjs';

// These tests drive the AgentShield MCP server with the official MCP SDK client (a dev dependency),
// so they check real protocol compatibility, not just our own reading of the spec.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const proposal = JSON.parse(fs.readFileSync(path.join(root, 'deployment/testnet-live-demo-proposal.json'), 'utf8'));
const RECIPIENT = proposal.recipientAccountId;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agentshield-mcp-'));

async function connect({ elicit = null, signer = 'fake' } = {}) {
  const log = path.join(tmp, `sign-${Math.random().toString(36).slice(2)}.log`);
  fs.writeFileSync(log, '');
  const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(root, 'tests/fixtures/mcp-fixture-server.mjs')],
    env: { ...process.env, AGENTSHIELD_FIXTURE_SIGN_LOG: log, AGENTSHIELD_FIXTURE_SIGNER: signer === 'fake' ? 'fake' : 'none' }, stderr: 'pipe' });
  const client = new Client({ name: 'agentshield-test', version: '1.0.0' }, { capabilities: elicit ? { elicitation: {} } : {} });
  if (elicit) client.setRequestHandler(ElicitRequestSchema, elicit);
  await client.connect(transport);
  const signed = () => fs.readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
  const call = async (name, args) => {
    const result = await client.callTool({ name, arguments: args });
    return { ...result, data: result.structuredContent };
  };
  return { client, call, signed, close: () => client.close() };
}

test('a standard MCP client sees four tools with schemas, three of them read-only', async () => {
  const mcp = await connect();
  try {
    assert.equal(mcp.client.getServerVersion().name, 'agentshield-fixture');
    const { tools } = await mcp.client.listTools();
    assert.deepEqual(tools.map(t => t.name), ['agentshield_vault_status', 'agentshield_check_recipient',
      'agentshield_check_payment', 'agentshield_request_payment']);
    assert.deepEqual(tools.filter(t => t.annotations.readOnlyHint).map(t => t.name).length, 3);
    for (const tool of tools) assert.equal(tool.inputSchema.type, 'object');
    const status = await mcp.call('agentshield_vault_status', {});
    assert.equal(status.data.mandate.version, 2);
    assert.equal(status.data.mandate.perPaymentNear, '0.01');
    assert.equal(status.data.remainingTodayNear, '0.02');
    assert.equal(status.data.remainingTotalNear, '0.045');
  } finally { await mcp.close(); }
});

test('dry-runs return ALLOW, WARN and BLOCK without signing', async () => {
  const mcp = await connect();
  try {
    assert.equal((await mcp.call('agentshield_check_payment', { recipient: RECIPIENT, amountNear: '0.005' })).data.decision, 'ALLOW');
    assert.equal((await mcp.call('agentshield_check_payment', { recipient: RECIPIENT, amountNear: '0.006' })).data.decision, 'WARN');
    assert.equal((await mcp.call('agentshield_check_payment', { recipient: RECIPIENT, amountNear: '0.02' })).data.decision, 'BLOCK');
    const recipient = await mcp.call('agentshield_check_recipient', { account: 'agentshield-recipient-7bb4a0df1o77.testnet' });
    assert.equal(recipient.data.decision, 'BLOCK');
    assert.ok(recipient.data.signals.some(s => s.code === 'LOOKALIKE'));
    assert.deepEqual(mcp.signed(), []);
  } finally { await mcp.close(); }
});

test('a BLOCKed payment is refused before signing', async () => {
  const mcp = await connect();
  try {
    for (const args of [{ recipient: 'attacker.testnet', amountNear: '0.005' }, { recipient: RECIPIENT, amountNear: '0.05' },
      { recipient: 'agentshіeld-recipient-7bb4a0df1077.testnet', amountNear: '0.005' }]) {
      const result = await mcp.call('agentshield_request_payment', args);
      assert.equal(result.data.outcome, 'REFUSED', JSON.stringify(args));
      assert.equal(result.data.signed, false);
    }
    assert.deepEqual(mcp.signed(), []);
  } finally { await mcp.close(); }
});

test('a WARN payment asks the human and signs only on an explicit yes', async () => {
  const silent = await connect();
  try {
    const result = await silent.call('agentshield_request_payment', { recipient: RECIPIENT, amountNear: '0.006' });
    assert.equal(result.data.outcome, 'NEEDS_HUMAN', 'a client that cannot ask a human fails closed');
    assert.deepEqual(silent.signed(), []);
  } finally { await silent.close(); }

  const asked = [];
  const no = await connect({ elicit: async request => { asked.push(request.params); return { action: 'decline' }; } });
  try {
    const result = await no.call('agentshield_request_payment', { recipient: RECIPIENT, amountNear: '0.006' });
    assert.equal(result.data.outcome, 'DECLINED_BY_HUMAN');
    assert.match(asked[0].message, /Pay 0\.006 test NEAR to agentshield-recipient/);
    assert.deepEqual(no.signed(), []);
  } finally { await no.close(); }

  const unclear = await connect({ elicit: async () => ({ action: 'accept', content: { approve: false } }) });
  try {
    assert.equal((await unclear.call('agentshield_request_payment', { recipient: RECIPIENT, amountNear: '0.006' })).data.outcome, 'DECLINED_BY_HUMAN');
    assert.deepEqual(unclear.signed(), []);
  } finally { await unclear.close(); }

  const yes = await connect({ elicit: async () => ({ action: 'accept', content: { approve: true } }) });
  try {
    const result = await yes.call('agentshield_request_payment', { recipient: RECIPIENT, amountNear: '0.006' });
    assert.equal(result.data.outcome, 'AUTHORIZED');
    assert.equal(result.data.humanApproved, true);
    assert.deepEqual(yes.signed(), [{ recipient: RECIPIENT, amountYocto: '6000000000000000000000', nonce: 'fixture-nonce-1',
      expiresAtNs: String(1793790000000000000n + 600_000_000_000n), expectedVersion: 2 }]);
  } finally { await yes.close(); }
});

test('an ALLOWed payment signs exactly the checked request', async () => {
  const mcp = await connect();
  try {
    const result = await mcp.call('agentshield_request_payment', { recipient: RECIPIENT, amountNear: '0.005' });
    assert.equal(result.data.outcome, 'AUTHORIZED');
    assert.equal(result.data.humanApproved, false);
    assert.equal(result.data.transactionHash, 'FixtureTx1111');
    assert.deepEqual(mcp.signed(), [{ recipient: RECIPIENT, amountYocto: '5000000000000000000000', nonce: 'fixture-nonce-1',
      expiresAtNs: String(1793790000000000000n + 600_000_000_000n), expectedVersion: 2 }]);
  } finally { await mcp.close(); }
});

test('without an agent key the payment tool only checks', async () => {
  const mcp = await connect({ signer: 'none' });
  try {
    const result = await mcp.call('agentshield_request_payment', { recipient: RECIPIENT, amountNear: '0.005' });
    assert.equal(result.data.outcome, 'NOT_CONFIGURED');
    assert.equal(result.data.decision, 'ALLOW');
  } finally { await mcp.close(); }
});

test('malformed arguments and unknown tools are rejected', async () => {
  const mcp = await connect();
  try {
    for (const args of [{ recipient: RECIPIENT, amountNear: '1e-3' }, { recipient: RECIPIENT, amountNear: '0.005', extra: 1 }, { recipient: RECIPIENT }]) {
      const result = await mcp.call('agentshield_request_payment', args);
      assert.equal(result.isError, true, JSON.stringify(args));
    }
    await assert.rejects(mcp.client.callTool({ name: 'transfer_everything', arguments: {} }));
    assert.deepEqual(mcp.signed(), []);
  } finally { await mcp.close(); }
  assert.match(validateArguments({ type: 'object', properties: { a: { type: 'string', maxLength: 2 } } }, { a: 'abc' }), /longer than 2/);
});

test('the signer refuses any key that can do more than call request_payment on the vault', () => {
  const scoped = { permission: { FunctionCall: { receiver_id: proposal.vaultAccountId, method_names: ['request_payment'], allowance: '1' } } };
  assert.equal(assertRestrictedKey(scoped).receiver_id, proposal.vaultAccountId);
  assert.throws(() => assertRestrictedKey({ permission: 'FullAccess' }), /full-access key/);
  assert.throws(() => assertRestrictedKey({ permission: { FunctionCall: { receiver_id: 'other.testnet', method_names: ['request_payment'] } } }), /more than/);
  assert.throws(() => assertRestrictedKey({ permission: { FunctionCall: { receiver_id: proposal.vaultAccountId, method_names: [] } } }), /more than/);
  assert.throws(() => assertRestrictedKey({ permission: { FunctionCall: { receiver_id: proposal.vaultAccountId, method_names: ['request_payment', 'withdraw_excess'] } } }), /more than/);
  assert.throws(() => assertRestrictedKey(undefined), /not an access key/);
  assert.deepEqual(decodeDecision({ status: { SuccessValue: Buffer.from('{"decision":"REJECTED","reason":"REPLAY"}').toString('base64') } }),
    { decision: 'REJECTED', reason: 'REPLAY' });
});

test('a broken key file never leaks its contents into an error', () => {
  const secret = 'ed25519:0secretDoNotPrintThis'; // "0" is not base58, so this cannot parse as a key
  const notJson = path.join(tmp, 'broken.json');
  fs.writeFileSync(notJson, secret);
  const badKey = path.join(tmp, 'bad-key.json');
  fs.writeFileSync(badKey, JSON.stringify({ private_key: secret }));
  const other = path.join(tmp, 'other.json');
  fs.writeFileSync(other, JSON.stringify({ account_id: 'someone.testnet', private_key: secret }));
  for (const keyFile of [notJson, badKey, other]) {
    assert.throws(() => createRestrictedSigner({ keyFile, reader: {} }), error => !error.message.includes('secretDoNot'));
  }
});

test('a key that parses but is not the agent\'s restricted key is refused before signing', async () => {
  const keyFile = path.join(tmp, 'stranger.json');
  fs.writeFileSync(keyFile, JSON.stringify({ private_key: 'ed25519:5ecretDoNotPrintThis1111111111111111111111111111111111111111111' }));
  const lookups = [];
  const signer = createRestrictedSigner({ keyFile, reader: { accessKey: async (account, key) => { lookups.push([account, key]); return undefined; } } });
  await assert.rejects(signer.requestPayment({ recipient: RECIPIENT, amountYocto: '1', nonce: 'n', expiresAtNs: '1', expectedVersion: 2 }),
    /not an access key/);
  assert.deepEqual(lookups, [[proposal.agentAccountId, signer.publicKey]]);
});

test('the real server starts read-only offline, and refuses a key file inside the repository', async () => {
  const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(root, 'mcp/agentshield-mcp.mjs')],
    env: { ...process.env, AGENTSHIELD_AGENT_KEY_FILE: '' }, stderr: 'pipe' });
  const client = new Client({ name: 'agentshield-test', version: '1.0.0' });
  await client.connect(transport);
  try {
    assert.equal(client.getServerVersion().name, 'agentshield');
    assert.match(client.getInstructions(), /read-only/);
    assert.equal((await client.listTools()).tools.length, 4);
  } finally { await client.close(); }
  const inside = spawnSync(process.execPath, [path.join(root, 'mcp/agentshield-mcp.mjs')],
    { env: { ...process.env, AGENTSHIELD_AGENT_KEY_FILE: path.join(root, 'agent-key.json') }, input: '', encoding: 'utf8' });
  assert.equal(inside.status, 1);
  assert.match(inside.stderr, /outside the repository/);
});
