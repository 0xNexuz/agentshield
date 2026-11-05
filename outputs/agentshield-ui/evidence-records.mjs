// Historical NEAR Testnet evidence used by the cinematic layer.
// Every value below is copied from a committed evidence record (named in `source`).
// tests/cinematic-evidence.test.mjs fails if any value drifts from those files.
// Nothing here is a new transaction. Live rechecks go through /api/testnet/*.

export const TRUTH = Object.freeze({
  simulation: { label: "SIMULATION", detail: "Local model in your browser. No chain, no keys, no transfer." },
  historical: { label: "HISTORICAL ONCHAIN REPLAY", detail: "A replay of a transaction that already finalized on NEAR Testnet. Nothing is executing now." },
  live: { label: "LIVE RPC VERIFIED", detail: "Rechecked by the read-only proof API on this visit: current vault state from public NEAR Testnet RPC, the finalized transactions from a public archival Testnet node." },
  unverified: { label: "NOT YET VERIFIED", detail: "No genuine onchain evidence exists for this yet." },
  liveModel: { label: "LIVE MODEL REPLY", detail: "A real reply from the model on NEAR AI Cloud during this visit, signed inside its TEE; the server checked the signature against today's attestation. Nothing is signed or sent to the chain." },
});

export const EXPLORER = "https://testnet.nearblocks.io/txns/";

export const ACCOUNTS = Object.freeze({
  owner: "agentshield-mag-1d2f78801994.testnet",
  agent: "agentshield-agent-0359da1630bb.testnet",
  recipient: "agentshield-recipient-7bb4a0df1077.testnet",
  vault: "vault.agentshield-mag-1d2f78801994.testnet",
});

export const VAULT = Object.freeze({
  accountId: ACCOUNTS.vault,
  codeHash: "2KHm9Waz7fQfQ2A1MWmHhVSwx7o7sm8p1KXBTVyggCqN",
  source: "outputs/testnet-live-payment-independent-proof.json",
});

export const MANDATE = Object.freeze({
  transactionHash: "GLhrrbxzn93YVKhq6JAxogNW27jf19XqfkfqAJdmxbG7",
  signer: ACCOUNTS.owner,
  agent: ACCOUNTS.agent,
  recipients: Object.freeze([ACCOUNTS.recipient]),
  perPaymentYocto: "10000000000000000000000",
  dailyYocto: "20000000000000000000000",
  totalYocto: "50000000000000000000000",
  perPaymentNear: "0.01",
  dailyNear: "0.02",
  totalNear: "0.05",
  expiresAtNs: "1794216105339870776",
  expiresAtUtc: "2026-11-09 09:21:45 UTC",
  version: 1,
  source: "outputs/testnet-live-mandate-evidence.json",
});

// On 2026-11-03 the owner renewed the mandate as version 2: same agent, recipient and limits, later expiry.
// The first payment and the first three rejections stay tied to version 1; the four later probes and the
// MCP payment ran under version 2.
export const MANDATE_RENEWAL = Object.freeze({
  transactionHash: "EuUUbLWvPUVVB2q7AiEVGe54giZaarzBy2hikX74vJXw",
  signer: ACCOUNTS.owner,
  version: 2,
  expiresAtNs: "1795996800000000000",
  expiresAtUtc: "2026-11-30 00:00:00 UTC",
  source: "outputs/testnet-mandate-renewal-evidence.json",
});

export const RESTRICTED_KEY = Object.freeze({
  transactionHash: "3faZ6WmFDgbM8KUCRnbDLztbYSysKwNGdoq83jy95CaP",
  publicKey: "ed25519:3mVXz3wwMLhRA1Ppdg56p8K342hTDRAHNVPez7jT5Y6V",
  receiverId: ACCOUNTS.vault,
  methods: Object.freeze(["request_payment"]),
  source: "outputs/testnet-live-key-evidence.json",
});

export const PAYMENT = Object.freeze({
  transactionHash: "3buDvBXKDHcCe9VBNtLSSp4H7LLjLfGk7K4XT2jh53jm",
  decision: "AUTHORIZED",
  settlement: "SETTLED",
  requestId: "f7d68e1050985791e29fa2ebaeddbc7eb0e8285aaab80e04696804b675fa5aa5",
  decisionReceiptId: "7H2s5Ryr43ScY9EEjjssu9PZHBavx2dstNBZhXE5jsXa",
  recipientReceiptId: "76hE3jsBgdCi8BCBZakcwEMri9Ut7JVu2gDWf3rxK2dS",
  recipient: ACCOUNTS.recipient,
  amountYocto: "5000000000000000000000",
  amountNear: "0.005",
  nonce: "demo4e84dc53cee7c4d226acb4fa",
  signer: ACCOUNTS.agent,
  checkedAt: "2026-11-02T11:09:44.002Z",
  sources: Object.freeze(["outputs/testnet-live-payment-independent-proof.json", "outputs/testnet-live-payment-evidence.json", "deployment/testnet-live-demo-proposal.json"]),
});

export const REJECTIONS = Object.freeze({
  overspend: Object.freeze({
    scenario: "overspend", reason: "PER_PAYMENT_LIMIT",
    transactionHash: "FEfj7KyY5Cr7NTrhDZdXt8Hi1rQqqMwznvK1KhL1ZL8A",
    recipient: ACCOUNTS.recipient, amountYocto: "11000000000000000000000", amountNear: "0.011",
    nonce: "limitprobe029de7f88a64", vaultTransferReceiptCount: 0, checkedAt: "2026-11-02T11:40:37.895Z",
  }),
  unauthorizedRecipient: Object.freeze({
    scenario: "unauthorizedRecipient", reason: "RECIPIENT_NOT_ALLOWED",
    transactionHash: "GvMLEqPTLZfnN4cTVVBS6mKghD7LuTpXgH7ZSAQvgDX9",
    recipient: ACCOUNTS.owner, amountYocto: "5000000000000000000000", amountNear: "0.005",
    nonce: "recipientprobe029de7f88a64", vaultTransferReceiptCount: 0, checkedAt: "2026-11-02T11:40:36.884Z",
  }),
  replay: Object.freeze({
    scenario: "replay", reason: "REPLAY",
    transactionHash: "8ktDr3AFxE8kVQP1KNkvGBY44oMWWvRCY6tXUqWyvyjY",
    recipient: ACCOUNTS.recipient, amountYocto: "5000000000000000000000", amountNear: "0.005",
    nonce: "demo4e84dc53cee7c4d226acb4fa", vaultTransferReceiptCount: 0, checkedAt: "2026-11-02T11:40:36.908Z",
  }),
});
export const REJECTIONS_SOURCE = "outputs/testnet-negative-independent-proofs.json";

// Four more rejections, under mandate version 2 on 4 Nov 2026. Each probe was declared, with its
// expected reason, in deployment/testnet-rejection-probes-v2-proposal.json before it was signed.
// wrongAgent is signed by the vault owner, so even the owner cannot spend as the agent.
export const PROBES = Object.freeze({
  staleVersion: Object.freeze({
    scenario: "staleVersion", reason: "STALE_VERSION", transactionHash: "8Gdi8iAgzX84jHhUQRtRQTe958m4pSuDCkTyHefz781A",
    signer: ACCOUNTS.agent, recipient: ACCOUNTS.recipient, amountNear: "0.005", nonce: "stalev2-88dd4ddb562290ad",
    expectedVersion: 1, vaultTransferReceiptCount: 0, checkedAt: "2026-11-04T20:37:44.164Z",
  }),
  expired: Object.freeze({
    scenario: "expired", reason: "EXPIRED", transactionHash: "EMe28NDXmbFCPiSuVevKvfpkShaDL8BUdPahaKT62m9d",
    signer: ACCOUNTS.agent, recipient: ACCOUNTS.recipient, amountNear: "0.005", nonce: "expiredv2-8b810dfee74d6340",
    expectedVersion: 2, vaultTransferReceiptCount: 0, checkedAt: "2026-11-04T20:40:06.335Z",
  }),
  lookalikeRecipient: Object.freeze({
    scenario: "lookalikeRecipient", reason: "RECIPIENT_NOT_ALLOWED", transactionHash: "2dBDbyg296vJv17SJ2xHP3aymFqDcGCHFCDdzRViojgX",
    signer: ACCOUNTS.agent, recipient: "agentshield-recipient-7bb4a0df1o77.testnet", amountNear: "0.005", nonce: "lookalikev2-edd3f0fd49f20eee",
    expectedVersion: 2, vaultTransferReceiptCount: 0, checkedAt: "2026-11-04T20:42:01.589Z",
  }),
  wrongAgent: Object.freeze({
    scenario: "wrongAgent", reason: "WRONG_AGENT", transactionHash: "8VzQjR1RhRCDgjaXUZMhUL3zZtHdhk5k6ZZUHuF4NXrE",
    signer: ACCOUNTS.owner, recipient: ACCOUNTS.recipient, amountNear: "0.005", nonce: "wrongagentv2-fe324c7dbe3e7598",
    expectedVersion: 2, vaultTransferReceiptCount: 0, checkedAt: "2026-11-04T20:43:45.714Z",
  }),
});
export const PROBES_SOURCES = Object.freeze(["deployment/testnet-rejection-probes-v2-proposal.json",
  "outputs/testnet-rejection-<name>-evidence.json", "outputs/testnet-rejection-probes-v2-independent-proofs.json"]);

// A second settled payment, made by an AI agent through the AgentShield MCP server's request tool
// (dry run first, then the restricted key signs). Mandate version 2, 4 Nov 2026.
export const MCP_PAYMENT = Object.freeze({
  transactionHash: "HP3BfdWLDaACqKV9fZb4WKmTyKp5vfa5fEs7bncuGuRk",
  requestId: "3422d39c4f91fafb560110c408a334bc919cc294638d453765e8e44b176d0f8e",
  recipientReceiptId: "FjDMy7kQhdhsTKPsUhJrqDFBf4TqW2mx8m8McqMqREUe",
  tool: "agentshield_request_payment",
  decision: "AUTHORIZED",
  settlement: "SETTLED",
  recipient: ACCOUNTS.recipient,
  amountYocto: "5000000000000000000000",
  amountNear: "0.005",
  nonce: "mcp-14147d08b4ba7ccd6155618d",
  expectedVersion: 2,
  signer: ACCOUNTS.agent,
  checkedAt: "2026-11-04T20:47:43.452Z",
  sources: Object.freeze(["outputs/testnet-mcp-payment-evidence.json", "outputs/testnet-mcp-payment-independent-proof.json"]),
});

export const REVOCATION = Object.freeze({
  status: "NOT_YET_VERIFIED",
  note: "Not yet shown on NEAR Testnet. The NEAR Sandbox tests run the deployed contract code and confirm that a revoked mandate refuses new requests. A Testnet proof needs a separate vault, because revoking this one would stop it permanently, and the first isolated attempt finalized FAILED. Here revocation runs in the local simulator.",
  sandboxTest: "sandbox/vault.test.mjs: revocation prevents new payments after settlement",
  source: "outputs/testnet-revocation-deploy-failure.json",
});

// The recorded NEAR AI Cloud run (4 Nov 2026, 1,024-token limit). Offchain evidence, not onchain:
// tests/near-ai-evidence.test.mjs recomputes every number below from the committed files.
export const NEAR_AI_RUN = Object.freeze({
  date: "2026-11-04",
  model: "z-ai/glm-5.3-flash",
  calls: 22,
  demo: Object.freeze({ normal: "ALLOW", injection: "ALLOW" }),
  redteam: Object.freeze({ attacks: 19, returnedLegitimate: 11, returnedEmpty: 4, noAnswer: 4, proposedAttack: 0, escaped: 0 }),
  verifiedChecks: Object.freeze(["gatewayIntelTdxQuote", "modelIntelTdxQuote", "modelNonceBinding", "modelSigningAddressBinding", "modelGpuAttestation"]),
  notVerifiedChecks: Object.freeze(["sigstoreProvenance", "tlsFingerprintBinding"]),
  evidenceUrl: "https://github.com/0xNexuz/agentshield/blob/main/outputs/near-ai-redteam-evidence-run2.json",
  attestationUrl: "https://github.com/0xNexuz/agentshield/blob/main/outputs/near-ai-attestation-run2.json",
  sources: Object.freeze(["outputs/near-ai-live-evidence-run2.json", "outputs/near-ai-redteam-evidence-run2.json", "outputs/near-ai-attestation-run2.json"]),
});

// The vault's request_payment checks, in contract order (contracts/vault/src/lib.rs).
export const CONTRACT_CHECKS = Object.freeze([
  { code: "WRONG_AGENT", label: "Caller is the mandated agent" },
  { code: "REVOKED", label: "Mandate not revoked or paused" },
  { code: "STALE_VERSION", label: "Policy version matches" },
  { code: "EXPIRED", label: "Request unexpired, nonce well-formed" },
  { code: "RECIPIENT_NOT_ALLOWED", label: "Recipient on the allowlist" },
  { code: "PER_PAYMENT_LIMIT", label: "Within the per-payment cap" },
  { code: "REPLAY", label: "Nonce never used before" },
  { code: "BUDGETS", label: "UTC-day and total budgets hold" },
]);
// The contract also refuses NO_MANDATE, WITHDRAWAL_PENDING, CAPACITY_REACHED and VAULT_UNDERFUNDED;
// those have no row above and are reported by name.

export function explorerUrl(hash) { return `${EXPLORER}${hash}`; }
export function shortHash(hash) { return hash.length > 14 ? `${hash.slice(0, 6)}…${hash.slice(-6)}` : hash; }

// Map a contract rejection reason to the check that stops it.
export function checkIndexFor(reason) {
  if (reason === "PAUSED") return 1;
  if (reason === "DAILY_LIMIT" || reason === "TOTAL_LIMIT") return 7;
  if (reason === "INVALID_NONCE") return 3;
  if (reason === "INVALID_AMOUNT") return 5;
  if (reason === "INVALID_EXPIRY") return 3;
  const index = CONTRACT_CHECKS.findIndex(check => check.code === reason);
  return index;
}

// Current mandate state from either the live proof (current chain state) or the committed record.
export function mandateState({ expiresAtNs, revoked = false } = {}, now = Date.now()) {
  if (revoked) return "revoked";
  return BigInt(Math.floor(now)) * 1_000_000n >= BigInt(expiresAtNs) ? "expired" : "active";
}
export function formatUtcNs(ns) {
  return `${new Date(Number(BigInt(ns) / 1_000_000n)).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

// The mandate as the chain reports it now. It starts as the latest committed record (the version 2
// renewal) and is replaced when a live proof passes, so a later renewal shows up without a redeploy.
let mandateNow = Object.freeze({ expiresAtNs: MANDATE_RENEWAL.expiresAtNs, version: MANDATE_RENEWAL.version, revoked: false, live: false });
export function currentMandate() { return mandateNow; }
function adoptLiveMandate(proof) {
  if (!proof?.mandateExpiryNs || !/^\d+$/.test(proof.mandateExpiryNs)) return;
  mandateNow = Object.freeze({ expiresAtNs: proof.mandateExpiryNs, version: Number(proof.currentMandateVersion) || MANDATE.version,
    revoked: proof.mandateRevoked === true, live: true });
}

// One shared, cached live recheck per page load. Each call site decides how to label failure.
let liveProof;
let liveGallery;
// `force` re-runs the check (a user pressing "Recheck live"); otherwise one passing result is reused.
export function fetchLiveProof({ force = false } = {}) {
  if (force) liveProof = undefined;
  liveProof ??= fetch("/api/testnet/proof", { cache: "no-store", signal: AbortSignal.timeout(60000) })
    .then(async response => {
      const proof = await response.json();
      if (!response.ok || proof.verification !== "PASS" || proof.settlement !== "SETTLED" ||
        proof.transactionHash !== PAYMENT.transactionHash) throw new Error(proof.error || "The live proof did not pass every check.");
      adoptLiveMandate(proof);
      return proof;
    })
    .catch(error => { liveProof = undefined; throw error; });
  return liveProof;
}
export function fetchLiveGallery({ force = false } = {}) {
  if (force) liveGallery = undefined;
  liveGallery ??= fetch("/api/testnet/gallery", { cache: "no-store", signal: AbortSignal.timeout(60000) })
    .then(async response => {
      const proofs = await response.json();
      // Every listed proof must pass, and all seven committed rejections must be among them with their
      // committed hashes.
      const known = { ...REJECTIONS, ...PROBES };
      if (!response.ok || !Array.isArray(proofs) || proofs.some(item =>
        item.verification !== "PASS" || item.decision !== "REJECTED" || item.vaultTransferReceiptCount !== 0 ||
        (known[item.scenario] && known[item.scenario].transactionHash !== item.transactionHash)) ||
        !Object.keys(known).every(name => proofs.some(item => item.scenario === name))) {
        throw new Error(proofs.error || "The live rejection proofs did not all pass.");
      }
      return Object.fromEntries(proofs.map(item => [item.scenario, item]));
    })
    .catch(error => { liveGallery = undefined; throw error; });
  return liveGallery;
}
let liveMcpPayment;
export function fetchLiveMcpPayment({ force = false } = {}) {
  if (force) liveMcpPayment = undefined;
  liveMcpPayment ??= fetch("/api/testnet/mcp-payment", { cache: "no-store", signal: AbortSignal.timeout(60000) })
    .then(async response => {
      const proof = await response.json();
      if (!response.ok || proof.verification !== "PASS" || proof.settlement !== "SETTLED" ||
        proof.transactionHash !== MCP_PAYMENT.transactionHash) throw new Error(proof.error || "The live MCP payment proof did not pass every check.");
      return proof;
    })
    .catch(error => { liveMcpPayment = undefined; throw error; });
  return liveMcpPayment;
}
