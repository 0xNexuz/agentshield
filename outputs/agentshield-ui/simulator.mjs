const UNIT = 10n ** 24n;
const MAX = (1n << 128n) - 1n;

export function toYocto(value) {
  const input = String(value).trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,24})?$/.test(input)) throw new Error("Enter a non-negative NEAR amount with at most 24 decimals.");
  const [whole, fraction = ""] = input.split(".");
  const result = BigInt(whole) * UNIT + BigInt((fraction + "0".repeat(24)).slice(0, 24));
  if (result > MAX) throw new Error("Amount exceeds NEAR's supported integer range.");
  return result;
}

export function fromYocto(value) {
  const units = BigInt(value);
  const whole = units / UNIT;
  const fraction = String(units % UNIT).padStart(24, "0").replace(/0+$/, "");
  return `${whole}${fraction ? `.${fraction}` : ""}`;
}

export function validatePolicy(input) {
  const agent = String(input.agent || "").trim();
  const recipient = String(input.recipient || "").trim();
  if (!/^[a-z0-9_-]+(?:\.[a-z0-9_-]+)*\.testnet$/.test(agent)) throw new Error("Enter a simulated agent .testnet account.");
  if (!/^[a-z0-9_-]+(?:\.[a-z0-9_-]+)*\.testnet$/.test(recipient)) throw new Error("Enter an allowed .testnet recipient.");
  const perPayment = toYocto(input.perPayment);
  const daily = toYocto(input.daily);
  const total = toYocto(input.total);
  if (perPayment === 0n || daily < perPayment || total < perPayment) throw new Error("Budgets must cover a positive maximum payment.");
  return { agent, recipient, perPayment, daily, total };
}

export function createSimulator(input, initialTime = Date.now()) {
  const policy = validatePolicy(input);
  const state = { version: 1, paused: false, revoked: false, confirmed: 0n, pending: 0n,
    days: new Map(), nonces: new Set(), requests: new Map(), sequence: 0 };
  let now = initialTime;
  const day = () => Math.floor(now / 86_400_000);
  const dailyEntry = key => state.days.get(key) || { confirmed: 0n, pending: 0n };
  const reject = reason => ({ decision: "REJECTED", reason, chain: false });

  return {
    policy,
    state,
    setTime(milliseconds) { now = milliseconds; },
    snapshot() {
      const today = dailyEntry(day());
      return { version: state.version, paused: state.paused, revoked: state.revoked,
        confirmed: state.confirmed, pending: state.pending, dailyConfirmed: today.confirmed,
        dailyPending: today.pending, accepted: state.requests.size };
    },
    pause() { if (!state.revoked) { state.paused = true; state.version++; } },
    resume() { if (!state.revoked) { state.paused = false; state.version++; } },
    revoke() { if (!state.revoked) { state.paused = true; state.revoked = true; state.version++; } },
    request({ agent = policy.agent, recipient = policy.recipient, amount, nonce, version = state.version, expiresAt = now + 60_000 }) {
      if (agent !== policy.agent) return reject("WRONG_AGENT");
      if (state.revoked) return reject("REVOKED");
      if (state.paused) return reject("PAUSED");
      if (version !== state.version) return reject("STALE_VERSION");
      if (!Number.isFinite(expiresAt) || expiresAt <= now) return reject("EXPIRED");
      if (typeof nonce !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(nonce)) return reject("INVALID_NONCE");
      if (recipient !== policy.recipient) return reject("RECIPIENT_NOT_ALLOWED");
      let value;
      try { value = toYocto(amount); } catch { return reject("INVALID_AMOUNT"); }
      if (value === 0n || value > policy.perPayment) return reject("PER_PAYMENT_LIMIT");
      const nonceKey = `${version}:${nonce}`;
      if (state.nonces.has(nonceKey)) return reject("REPLAY");
      const today = dailyEntry(day());
      if (today.confirmed + today.pending + value > policy.daily) return reject("DAILY_LIMIT");
      if (state.confirmed + state.pending + value > policy.total) return reject("TOTAL_LIMIT");
      if (state.requests.size >= 64) return reject("CAPACITY_REACHED");
      state.nonces.add(nonceKey);
      state.pending += value;
      today.pending += value;
      state.days.set(day(), today);
      const requestId = `SIM-${String(++state.sequence).padStart(3, "0")}`;
      state.requests.set(requestId, { amount: value, day: day(), status: "PENDING", recipient });
      return { decision: "AUTHORIZED", requestId, status: "PENDING", chain: false };
    },
    settle(requestId, success = true) {
      const request = state.requests.get(requestId);
      if (!request || request.status !== "PENDING") throw new Error("Request is not pending.");
      const entry = dailyEntry(request.day);
      state.pending -= request.amount;
      entry.pending -= request.amount;
      if (success) {
        state.confirmed += request.amount;
        entry.confirmed += request.amount;
        request.status = "SETTLED";
      } else request.status = "TRANSFER_FAILED";
      state.days.set(request.day, entry);
      return { status: request.status, requestId, chain: false };
    },
  };
}

export const defaultPolicy = Object.freeze({
  agent: "demo-agent.testnet", recipient: "demo-merchant.testnet",
  perPayment: "0.10", daily: "0.30", total: "0.60",
});
