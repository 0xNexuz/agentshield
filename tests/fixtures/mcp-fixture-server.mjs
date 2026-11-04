// Test-only MCP server: the real protocol core and tools, with a fake chain reader and a fake signer
// that records what it was asked to sign. Used by tests/mcp-server.test.mjs; never signs anything.
import fs from 'node:fs';
import { createMcpServer } from '../../mcp/server-core.mjs';
import { createAgentShieldTools } from '../../mcp/agentshield-tools.mjs';

const RECIPIENT = 'agentshield-recipient-7bb4a0df1077.testnet';
const status = {
  owner: 'agentshield-mag-1d2f78801994.testnet', domain: 'agentshield:testnet:v1',
  mandate: { agent: 'agentshield-agent-0359da1630bb.testnet', recipients: [RECIPIENT], per_payment_yocto: '10000000000000000000000',
    daily_yocto: '20000000000000000000000', total_yocto: '50000000000000000000000',
    expires_at_ns: '1795996800000000000', version: 2, paused: false, revoked: false },
  confirmed_total_yocto: '5000000000000000000000', pending_total_yocto: '0', pending_withdrawal_yocto: '0',
  day_confirmed_yocto: '0', day_pending_yocto: '0', current_utc_day: 20761, balance_yocto: '4000000000000000000000000',
  available_yocto: '3000000000000000000000000', accepted_requests: 1,
};
const reader = {
  endpoint: 'fixture',
  async vaultStatus() { return structuredClone(status); },
  async accountFacts(id) { return id === RECIPIENT ? { found: true, codeHash: '11111111111111111111111111111111' } : { found: false }; },
  async finalBlock() { return { height: 276200000, timestampNs: '1793790000000000000' }; },
};
const log = process.env.AGENTSHIELD_FIXTURE_SIGN_LOG;
const signer = process.env.AGENTSHIELD_FIXTURE_SIGNER === 'none' ? null : {
  async requestPayment(request) {
    fs.appendFileSync(log, `${JSON.stringify(request)}\n`);
    return { transactionHash: 'FixtureTx1111', explorerUrl: 'https://testnet.nearblocks.io/txns/FixtureTx1111',
      decision: { decision: 'AUTHORIZED', request_id: 'fixture', action_hash: 'fixture' } };
  },
};
createMcpServer({ name: 'agentshield-fixture', version: '0.0.0', tools: createAgentShieldTools({ reader, signer, newNonce: () => 'fixture-nonce-1' }) })
  .connect(process.stdin, process.stdout);
