import test from "node:test";
import assert from "node:assert/strict";
import { createSimulator, defaultPolicy, toYocto, fromYocto } from "../outputs/agentshield-ui/simulator.mjs";

const at = Date.UTC(2026, 10, 2, 12);
const setup = policy => createSimulator(policy || defaultPolicy, at);
const request = (sim, overrides = {}) => sim.request({ amount: "0.05", nonce: "n1", ...overrides });

test("exact yocto conversion, including small fractions", () => {
  assert.equal(toYocto("0.000000000000000000000001"), 1n);
  assert.equal(fromYocto(toYocto("12.000000000000000000000001")), "12.000000000000000000000001");
  assert.throws(() => toYocto("0.1234567890123456789012345"));
});

test("valid payment reserves before settlement and consumes its nonce", () => {
  const sim = setup();
  const first = request(sim);
  assert.equal(first.decision, "AUTHORIZED");
  assert.equal(sim.snapshot().pending, toYocto("0.05"));
  assert.equal(request(sim).reason, "REPLAY");
  assert.equal(sim.settle(first.requestId).status, "SETTLED");
  assert.equal(sim.snapshot().confirmed, toYocto("0.05"));
});

test("over-cap, wrong recipient, wrong agent, and zero payments are rejected without spend", () => {
  const sim = setup();
  assert.equal(request(sim, { amount: "0.11" }).reason, "PER_PAYMENT_LIMIT");
  assert.equal(request(sim, { recipient: "attacker.testnet" }).reason, "RECIPIENT_NOT_ALLOWED");
  assert.equal(request(sim, { agent: "intruder.testnet" }).reason, "WRONG_AGENT");
  assert.equal(request(sim, { amount: "0" }).reason, "PER_PAYMENT_LIMIT");
  assert.equal(sim.snapshot().accepted, 0);
});

test("pending reservations stop two last-budget requests", () => {
  const sim = setup({ ...defaultPolicy, daily: "0.10", total: "0.10" });
  assert.equal(request(sim, { amount: "0.08" }).decision, "AUTHORIZED");
  assert.equal(request(sim, { nonce: "n2", amount: "0.08" }).reason, "DAILY_LIMIT");
});

test("failed transfer releases budgets but never restores nonce", () => {
  const sim = setup({ ...defaultPolicy, daily: "0.10", total: "0.10" });
  const first = request(sim, { amount: "0.10" });
  assert.equal(sim.settle(first.requestId, false).status, "TRANSFER_FAILED");
  assert.equal(sim.snapshot().pending, 0n);
  assert.equal(request(sim, { amount: "0.10" }).reason, "REPLAY");
  assert.equal(request(sim, { amount: "0.10", nonce: "n2" }).decision, "AUTHORIZED");
});

test("revocation and pause block new requests while an earlier payment can settle", () => {
  const sim = setup();
  const first = request(sim);
  sim.pause();
  assert.equal(request(sim, { nonce: "n2" }).reason, "PAUSED");
  sim.resume();
  sim.revoke();
  assert.equal(request(sim, { nonce: "n3" }).reason, "REVOKED");
  assert.equal(sim.settle(first.requestId).status, "SETTLED");
});

test("expired request and stale version fail; UTC day changes only daily accounting", () => {
  const sim = setup({ ...defaultPolicy, daily: "0.10" });
  assert.equal(request(sim, { expiresAt: at }).reason, "EXPIRED");
  const first = request(sim, { amount: "0.10" });
  sim.settle(first.requestId);
  sim.setTime(at + 86_400_000);
  assert.equal(request(sim, { nonce: "n2", amount: "0.10" }).decision, "AUTHORIZED");
  sim.pause();
  sim.resume();
  assert.equal(request(sim, { nonce: "n3", version: 1 }).reason, "STALE_VERSION");
});
