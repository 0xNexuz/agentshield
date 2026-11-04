//! Randomized rule testing for the vault (model-based fuzzing).
//!
//! Each seed drives the real contract code (on NEAR's mocked runtime) through a random sequence
//! of agent and non-agent requests, transfer successes and failures, time passing, pause, resume,
//! mandate changes and revocation. After every step:
//!   1. the contract's decision, including its exact rejection reason, must equal the decision of
//!      an independent reference model that tracks budgets, nonces and versions on its own; and
//!   2. accounting invariants recomputed from the contract's own records must hold.
//! A rejected request must leave the vault's state unchanged.
//!
//! No external crates: a fixed-seed xorshift generator makes every run reproducible, and a failure
//! names its seed and step. The test also fails if any rejection reason it can reach is never hit.
use super::*;
use near_sdk::test_utils::VMContextBuilder;
use near_sdk::{testing_env, PromiseResult, RuntimeFeesConfig, VMContext};

const START: u64 = 1_783_100_000_000_000_000;
const HOUR: u64 = 3_600_000_000_000;
const UNIT: u128 = 10_000_000_000_000_000_000_000; // 0.01 NEAR
const PER: u128 = 10 * UNIT; // per-payment cap, 0.1 NEAR
// Odd seeds use tight budgets (reach the daily and total limits); even seeds use roomy ones
// (reach the 64-request capacity limit). The vault holds 5 NEAR, so it is never underfunded.
const TIGHT: (u128, u128) = (30 * UNIT, 50 * UNIT); // 0.3 NEAR a day, 0.5 in total
const ROOMY: (u128, u128) = (200 * UNIT, 400 * UNIT); // 2 NEAR a day, 4 in total
const SEEDS: u64 = 48;
const STEPS: usize = 500;
const AGENT: &str = "agent.testnet";
const OWNER: &str = "owner.testnet";
const ALLOWED: [&str; 2] = ["merchant.testnet", "shop.testnet"];

struct Rng(u64);
impl Rng {
    fn next(&mut self) -> u64 {
        let mut x = self.0;
        x ^= x >> 12;
        x ^= x << 25;
        x ^= x >> 27;
        self.0 = x;
        x.wrapping_mul(0x2545_F491_4F6C_DD1D)
    }
    fn below(&mut self, n: u64) -> u64 {
        self.next() % n
    }
    fn chance(&mut self, percent: u64) -> bool {
        self.below(100) < percent
    }
    fn pick<T: Copy>(&mut self, items: &[T]) -> T {
        items[self.below(items.len() as u64) as usize]
    }
}

fn id(value: &str) -> AccountId {
    value.parse().unwrap()
}

fn ctx(caller: &str, now: u64) -> VMContext {
    VMContextBuilder::new()
        .current_account_id(id("vault.testnet"))
        .signer_account_id(id(caller))
        .predecessor_account_id(id(caller))
        .block_timestamp(now)
        .account_balance(NearToken::from_near(5))
        .storage_usage(1_000)
        .build()
}

/// The reference model: what the vault should decide, tracked independently of its storage.
struct Model {
    daily: u128,
    total: u128,
    recipients: Vec<&'static str>,
    version: u32,
    paused: bool,
    revoked: bool,
    expiry: u64,
    used: BTreeSet<(u32, String)>,
    pending: BTreeMap<String, (u128, u64)>,
    confirmed: u128,
    pending_total: u128,
    day_confirmed: BTreeMap<u64, u128>,
    day_pending: BTreeMap<u64, u128>,
    accepted: usize,
}

impl Model {
    #[allow(clippy::too_many_arguments)]
    fn decide(&self, caller: &str, recipient: &str, amount: u128, nonce: &str, expiry: &str, version: u32, now: u64) -> Result<(), &'static str> {
        if caller != AGENT {
            return Err("WRONG_AGENT");
        }
        if self.revoked {
            return Err("REVOKED");
        }
        if self.paused {
            return Err("PAUSED");
        }
        if version != self.version {
            return Err("STALE_VERSION");
        }
        let Ok(expiry) = expiry.parse::<u64>() else {
            return Err("INVALID_EXPIRY");
        };
        if expiry <= now || expiry > self.expiry {
            return Err("EXPIRED");
        }
        if nonce.is_empty() || nonce.len() > 64 || !nonce.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'_') {
            return Err("INVALID_NONCE");
        }
        if !self.recipients.contains(&recipient) {
            return Err("RECIPIENT_NOT_ALLOWED");
        }
        if amount == 0 || amount > PER {
            return Err("PER_PAYMENT_LIMIT");
        }
        if self.used.contains(&(self.version, nonce.to_string())) {
            return Err("REPLAY");
        }
        let day = now / DAY_NS;
        let today = self.day_confirmed.get(&day).copied().unwrap_or(0) + self.day_pending.get(&day).copied().unwrap_or(0);
        if today + amount > self.daily {
            return Err("DAILY_LIMIT");
        }
        if self.confirmed + self.pending_total + amount > self.total {
            return Err("TOTAL_LIMIT");
        }
        if self.accepted >= MAX_REQUESTS {
            return Err("CAPACITY_REACHED");
        }
        Ok(())
    }
}

type Snapshot = (u128, u128, BTreeMap<u64, u128>, BTreeMap<u64, u128>, usize, usize, u32, bool, bool);
fn snapshot(vault: &Vault) -> Snapshot {
    let m = vault.mandate.as_ref().unwrap();
    (vault.confirmed_total, vault.pending_total, vault.day_confirmed.clone(), vault.day_pending.clone(),
        vault.used_nonces.len(), vault.requests.len(), m.version, m.paused, m.revoked)
}

fn check_invariants(vault: &Vault, model: &Model, at: &str) {
    // Agreement with the model.
    assert_eq!(vault.confirmed_total, model.confirmed, "{at}: confirmed total");
    assert_eq!(vault.pending_total, model.pending_total, "{at}: pending total");
    assert_eq!(vault.requests.len(), model.accepted, "{at}: accepted requests");
    assert_eq!(vault.used_nonces.len(), model.used.len(), "{at}: used nonces");
    let m = vault.mandate.as_ref().unwrap();
    assert_eq!((m.version, m.paused, m.revoked), (model.version, model.paused, model.revoked), "{at}: mandate state");
    // Invariants recomputed from the contract's own records, without the model.
    let mut pending = 0u128;
    let mut settled = 0u128;
    let mut keys = BTreeSet::new();
    for record in vault.requests.values() {
        assert!(ALLOWED.contains(&record.recipient.as_str()), "{at}: paid a recipient that was never allowlisted");
        assert!(record.amount_yocto.0 > 0 && record.amount_yocto.0 <= PER, "{at}: amount outside the per-payment cap");
        assert_eq!(record.agent.as_str(), AGENT, "{at}: a non-agent request was accepted");
        assert!(keys.insert((record.mandate_version, record.nonce.clone())), "{at}: a nonce was accepted twice in one version");
        match record.status {
            RequestStatus::Pending => pending += record.amount_yocto.0,
            RequestStatus::Settled => settled += record.amount_yocto.0,
            RequestStatus::TransferFailed => {}
        }
    }
    assert_eq!(pending, vault.pending_total, "{at}: pending total differs from pending records");
    assert_eq!(settled, vault.confirmed_total, "{at}: confirmed total differs from settled records");
    assert!(vault.confirmed_total + vault.pending_total <= model.total, "{at}: total budget exceeded");
    for (day, confirmed) in vault.day_confirmed.iter() {
        let used = confirmed + vault.day_pending.get(day).copied().unwrap_or(0);
        assert!(used <= model.daily, "{at}: daily budget exceeded on day {day}");
    }
    for (day, pending) in vault.day_pending.iter() {
        assert!(pending + vault.day_confirmed.get(day).copied().unwrap_or(0) <= model.daily, "{at}: daily budget exceeded on day {day}");
    }
    assert!(vault.requests.len() <= MAX_REQUESTS, "{at}: capacity exceeded");
}

#[test]
fn random_sequences_match_the_model_and_never_break_the_budget() {
    // Building NEAR's runtime config is slow, so build it once and reuse it for every step.
    let vm = near_sdk::test_vm_config();
    let fees = RuntimeFeesConfig::test();
    let env = |caller: &str, now: u64| testing_env!(ctx(caller, now), vm.clone(), fees.clone());
    let mut reasons: BTreeMap<&'static str, usize> = BTreeMap::new();
    let (mut authorized, mut settled, mut failed, mut operations) = (0usize, 0usize, 0usize, 0usize);
    for seed in 1..=SEEDS {
        let mut rng = Rng(seed.wrapping_mul(0x9E37_79B9_7F4A_7C15) | 1);
        let mut now = START;
        let (daily, total) = if seed % 2 == 1 { TIGHT } else { ROOMY };
        env(OWNER, now);
        let mut vault = Vault::initialize(id(OWNER), "agentshield:testnet:v1".into());
        vault.set_mandate(id(AGENT), ALLOWED.iter().map(|a| id(a)).collect(), U128(PER), U128(daily), U128(total), (now + 5 * DAY_NS).to_string());
        let mut model = Model { daily, total, recipients: ALLOWED.to_vec(), version: 1, paused: false, revoked: false, expiry: now + 5 * DAY_NS,
            used: BTreeSet::new(), pending: BTreeMap::new(), confirmed: 0, pending_total: 0,
            day_confirmed: BTreeMap::new(), day_pending: BTreeMap::new(), accepted: 0 };

        for step in 0..STEPS {
            let at = format!("seed {seed} step {step}");
            operations += 1;
            // A pause lasts a few steps: the owner resumes it soon, as an owner would.
            let roll = if model.paused && !model.revoked && rng.chance(25) { 90 } else { rng.below(100) };
            match roll {
                0..=64 => {
                    let caller = if rng.chance(90) { AGENT } else { rng.pick(&[OWNER, "stranger.testnet"]) };
                    let recipient = rng.pick(&["merchant.testnet", "merchant.testnet", "merchant.testnet", "shop.testnet", "stranger.testnet", OWNER]);
                    let amount = rng.pick(&[0, 1, 1, 1, UNIT, 3 * UNIT, PER / 2, PER, PER, PER + 1, 2 * PER]);
                    let nonce = match rng.below(100) {
                        0..=84 => format!("n{}", rng.below(40)),
                        85..=94 => format!("fresh-{seed}-{step}"),
                        _ => rng.pick(&["", "has space", "semi;colon", &"x".repeat(65)]).to_string(),
                    };
                    let expiry = match rng.below(100) {
                        0..=84 => (now + 1 + rng.below(2 * HOUR)).to_string(),
                        85..=89 => now.to_string(),
                        90..=94 => (model.expiry + 1).to_string(),
                        _ => "not-a-number".to_string(),
                    };
                    let version = if rng.chance(92) { model.version } else if model.version > 1 && rng.chance(50) { model.version - 1 } else { model.version + 1 };

                    env(caller, now);
                    let before = snapshot(&vault);
                    let expected = model.decide(caller, recipient, amount, &nonce, &expiry, version, now);
                    let got = vault.request_payment(id(recipient), U128(amount), nonce.clone(), expiry, version);
                    match (expected, got) {
                        (Ok(()), PaymentDecision::Authorized { request_id, .. }) => {
                            let record = vault.get_request(request_id.clone()).unwrap();
                            assert_eq!((record.recipient.as_str(), record.amount_yocto.0, record.mandate_version), (recipient, amount, model.version), "{at}");
                            let day = now / DAY_NS;
                            model.used.insert((model.version, nonce));
                            model.pending.insert(request_id, (amount, day));
                            model.pending_total += amount;
                            *model.day_pending.entry(day).or_default() += amount;
                            model.accepted += 1;
                            authorized += 1;
                        }
                        (Err(reason), PaymentDecision::Rejected { reason: got }) => {
                            assert_eq!(got, reason, "{at}: wrong rejection reason");
                            assert_eq!(snapshot(&vault), before, "{at}: a rejected request changed state");
                            *reasons.entry(reason).or_default() += 1;
                        }
                        (Ok(()), PaymentDecision::Rejected { reason }) => panic!("{at}: model authorizes but the contract rejected with {reason}"),
                        (Err(reason), PaymentDecision::Authorized { .. }) => panic!("{at}: the contract authorized what the model rejects ({reason})"),
                    }
                }
                65..=79 => {
                    if model.pending.is_empty() {
                        continue;
                    }
                    let index = rng.below(model.pending.len() as u64) as usize;
                    let request_id = model.pending.keys().nth(index).unwrap().clone();
                    let ok = rng.chance(80);
                    let outcome = if ok { PromiseResult::Successful(vec![]) } else { PromiseResult::Failed };
                    testing_env!(ctx("vault.testnet", now), vm.clone(), fees.clone(), Default::default(), vec![outcome]);
                    assert_eq!(vault.on_transfer_result(request_id.clone()), ok, "{at}: settlement result");
                    let (amount, day) = model.pending.remove(&request_id).unwrap();
                    model.pending_total -= amount;
                    *model.day_pending.get_mut(&day).unwrap() -= amount;
                    let status = vault.get_request(request_id).unwrap().status;
                    if ok {
                        model.confirmed += amount;
                        *model.day_confirmed.entry(day).or_default() += amount;
                        assert_eq!(status, RequestStatus::Settled, "{at}");
                        settled += 1;
                    } else {
                        assert_eq!(status, RequestStatus::TransferFailed, "{at}");
                        failed += 1;
                    }
                }
                80..=89 => now += rng.below(DAY_NS * 3 / 5),
                90..=92 if !model.revoked => {
                    env(OWNER, now);
                    if model.paused { vault.resume() } else { vault.pause() }
                    model.paused = !model.paused;
                    model.version += 1;
                }
                93..=97 if !model.revoked => {
                    let recipients: Vec<&'static str> = if rng.chance(50) { ALLOWED.to_vec() } else { vec![ALLOWED[0]] };
                    env(OWNER, now);
                    vault.set_mandate(id(AGENT), recipients.iter().map(|a| id(a)).collect(), U128(PER), U128(daily), U128(total), (now + 5 * DAY_NS).to_string());
                    model.recipients = recipients;
                    model.expiry = now + 5 * DAY_NS;
                    model.paused = false;
                    model.version += 1;
                }
                // Revocation is permanent, so it only happens late in a run.
                _ if !model.revoked && step > STEPS * 4 / 5 && rng.chance(30) => {
                    env(OWNER, now);
                    vault.revoke();
                    model.revoked = true;
                    model.paused = true;
                    model.version += 1;
                }
                _ => now += rng.below(HOUR),
            }
            check_invariants(&vault, &model, &at);
        }
    }
    eprintln!("randomized vault test: {SEEDS} seeds x {STEPS} steps = {operations} operations; {authorized} authorized, {settled} settled, {failed} failed transfers; rejections {reasons:?}");
    for reason in ["WRONG_AGENT", "REVOKED", "PAUSED", "STALE_VERSION", "INVALID_EXPIRY", "EXPIRED", "INVALID_NONCE",
        "RECIPIENT_NOT_ALLOWED", "PER_PAYMENT_LIMIT", "REPLAY", "DAILY_LIMIT", "TOTAL_LIMIT", "CAPACITY_REACHED"] {
        assert!(reasons.get(reason).copied().unwrap_or(0) > 0, "the random sequences never reached {reason}");
    }
    assert!(authorized > 1_000 && settled > 500 && failed > 50, "too few authorizations or settlements to be meaningful");
}
