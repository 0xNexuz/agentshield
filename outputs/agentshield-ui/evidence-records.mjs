// Historical NEAR Testnet evidence used by the cinematic layer.
// Every value below is copied from a committed evidence record (named in `source`).
// tests/cinematic-evidence.test.mjs fails if any value drifts from those files.
// Nothing here is a new transaction. Live rechecks go through /api/testnet/*.

export const TRUTH = Object.freeze({
  simulation: { label: "SIMULATION", detail: "Local model in your browser. No chain, no keys, no transfer." },
  historical: { label: "HISTORICAL ONCHAIN REPLAY", detail: "A replay of a transaction that already finalized on NEAR Testnet. Nothing is executing now." },
  live: { label: "LIVE RPC VERIFIED", detail: "Rechecked against public NEAR Testnet RPC by the read-only proof API during this visit." },
  unverified: { label: "NOT YET VERIFIED", detail: "No genuine onchain evidence exists for this yet." },
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

export const REVOCATION = Object.freeze({
  status: "NOT_YET_VERIFIED",
  note: "Not yet shown on NEAR Testnet. The NEAR Sandbox tests run the deployed contract code and confirm that a revoked mandate refuses new requests. A Testnet proof needs a separate vault, because revoking this one would stop it permanently, and the first isolated attempt finalized FAILED. Here revocation runs in the local simulator.",
  sandboxTest: "sandbox/vault.test.mjs: revocation prevents new payments after settlement",
  source: "outputs/testnet-revocation-deploy-failure.json",
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

// The mandate as the chain reports it now. It starts as the committed version 1 record and is
// replaced when a live proof passes, so a renewal (version 2, later expiry) shows up without a redeploy.
let mandateNow = Object.freeze({ expiresAtNs: MANDATE.expiresAtNs, version: MANDATE.version, revoked: false, live: false });
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
      if (!response.ok || !Array.isArray(proofs) || proofs.length !== 3 || proofs.some(item =>
        item.verification !== "PASS" || item.decision !== "REJECTED" || item.vaultTransferReceiptCount !== 0 ||
        REJECTIONS[item.scenario]?.transactionHash !== item.transactionHash)) {
        throw new Error(proofs.error || "The live rejection proofs did not all pass.");
      }
      return Object.fromEntries(proofs.map(item => [item.scenario, item]));
    })
    .catch(error => { liveGallery = undefined; throw error; });
  return liveGallery;
}
