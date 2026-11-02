use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};
use near_sdk::json_types::U128;
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::{
    env, ext_contract, near, require, AccountId, Gas, NearToken, PanicOnDefault, Promise,
};
use std::collections::{BTreeMap, BTreeSet};

const DAY_NS: u64 = 86_400_000_000_000;
const MAX_LIFETIME_NS: u64 = 30 * DAY_NS;
const MAX_RECIPIENTS: usize = 8;
const MAX_REQUESTS: usize = 64;
const OPERATING_RESERVE: u128 = 200_000_000_000_000_000_000_000; // 0.2 NEAR for gas/storage headroom.
const CALLBACK_GAS: Gas = Gas::from_tgas(20);

#[allow(dead_code)]
#[ext_contract(ext_self)]
trait TransferCallback {
    fn on_transfer_result(&mut self, request_id: String) -> bool;
    fn on_withdraw_result(&mut self) -> bool;
}

#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone)]
#[borsh(crate = "near_sdk::borsh")]
#[serde(crate = "near_sdk::serde")]
pub struct Mandate {
    pub agent: AccountId,
    pub recipients: Vec<AccountId>,
    pub per_payment_yocto: U128,
    pub daily_yocto: U128,
    pub total_yocto: U128,
    pub expires_at_ns: String,
    pub version: u32,
    pub paused: bool,
    pub revoked: bool,
}

#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, PartialEq, Eq, Debug)]
#[borsh(crate = "near_sdk::borsh")]
#[serde(crate = "near_sdk::serde")]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum RequestStatus {
    Pending,
    Settled,
    TransferFailed,
}

#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone)]
#[borsh(crate = "near_sdk::borsh")]
#[serde(crate = "near_sdk::serde")]
pub struct PaymentRecord {
    pub request_id: String,
    pub action_hash: String,
    pub agent: AccountId,
    pub recipient: AccountId,
    pub amount_yocto: U128,
    pub nonce: String,
    pub mandate_version: u32,
    pub requested_at_ns: String,
    pub request_day: u64,
    pub status: RequestStatus,
}

#[derive(Serialize, Deserialize)]
#[serde(
    crate = "near_sdk::serde",
    tag = "decision",
    rename_all = "SCREAMING_SNAKE_CASE"
)]
pub enum PaymentDecision {
    Rejected {
        reason: String,
    },
    Authorized {
        request_id: String,
        action_hash: String,
    },
}

#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
pub struct VaultStatus {
    pub owner: AccountId,
    pub domain: String,
    pub mandate: Option<Mandate>,
    pub confirmed_total_yocto: U128,
    pub pending_total_yocto: U128,
    pub pending_withdrawal_yocto: U128,
    pub day_confirmed_yocto: U128,
    pub day_pending_yocto: U128,
    pub current_utc_day: u64,
    pub balance_yocto: U128,
    pub available_yocto: U128,
    pub accepted_requests: usize,
}

#[derive(BorshSerialize)]
#[borsh(crate = "near_sdk::borsh")]
struct Action<'a> {
    domain_prefix: &'a str,
    domain: &'a str,
    vault: &'a AccountId,
    owner: &'a AccountId,
    agent: &'a AccountId,
    mandate_version: u32,
    recipient: &'a AccountId,
    amount: u128,
    nonce: &'a str,
    expires_at_ns: u64,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Vault {
    owner: AccountId,
    domain: String,
    mandate: Option<Mandate>,
    confirmed_total: u128,
    pending_total: u128,
    pending_withdrawal: u128,
    day_confirmed: BTreeMap<u64, u128>,
    day_pending: BTreeMap<u64, u128>,
    used_nonces: BTreeSet<String>,
    requests: BTreeMap<String, PaymentRecord>,
}

#[near]
impl Vault {
    #[init]
    pub fn initialize(owner: AccountId, domain: String) -> Self {
        require!(
            domain == "agentshield:testnet:v1",
            "Testnet domain required"
        );
        require!(
            owner != env::current_account_id(),
            "Owner must be a separate account"
        );
        require!(
            owner == env::predecessor_account_id(),
            "Owner must initialize the vault"
        );
        Self {
            owner,
            domain,
            mandate: None,
            confirmed_total: 0,
            pending_total: 0,
            pending_withdrawal: 0,
            day_confirmed: BTreeMap::new(),
            day_pending: BTreeMap::new(),
            used_nonces: BTreeSet::new(),
            requests: BTreeMap::new(),
        }
    }

    #[payable]
    pub fn fund(&mut self) -> U128 {
        self.assert_owner();
        require!(
            env::attached_deposit().as_yoctonear() > 0,
            "Attach testnet NEAR"
        );
        U128(env::attached_deposit().as_yoctonear())
    }

    pub fn set_mandate(
        &mut self,
        agent: AccountId,
        recipients: Vec<AccountId>,
        per_payment_yocto: U128,
        daily_yocto: U128,
        total_yocto: U128,
        expires_at_ns: String,
    ) -> Mandate {
        self.assert_owner();
        require!(
            !self.mandate.as_ref().is_some_and(|m| m.revoked),
            "Vault mandate is revoked"
        );
        let expiry = parse_ns(&expires_at_ns);
        let now = env::block_timestamp();
        require!(
            expiry > now && expiry <= now.saturating_add(MAX_LIFETIME_NS),
            "Expiry must be within 30 days"
        );
        require!(
            agent != self.owner && agent != env::current_account_id(),
            "Agent must be separate"
        );
        require!(
            !recipients.is_empty() && recipients.len() <= MAX_RECIPIENTS,
            "Provide 1 to 8 recipients"
        );
        let distinct: BTreeSet<_> = recipients.iter().collect();
        require!(
            distinct.len() == recipients.len(),
            "Recipients must be unique"
        );
        require!(
            !recipients.contains(&env::current_account_id()),
            "Vault cannot receive its own payout"
        );
        require!(
            per_payment_yocto.0 > 0
                && daily_yocto.0 >= per_payment_yocto.0
                && total_yocto.0 >= per_payment_yocto.0,
            "Invalid limits"
        );
        require!(
            total_yocto.0 >= self.confirmed_total.saturating_add(self.pending_total),
            "Total below already committed spend"
        );
        let version = self
            .mandate
            .as_ref()
            .map_or(1, |m| m.version.checked_add(1).expect("Version exhausted"));
        let mandate = Mandate {
            agent,
            recipients,
            per_payment_yocto,
            daily_yocto,
            total_yocto,
            expires_at_ns,
            version,
            paused: false,
            revoked: false,
        };
        self.mandate = Some(mandate.clone());
        env::log_str(&format!("AGENTSHIELD_POLICY version={version} action=SET"));
        mandate
    }

    pub fn pause(&mut self) {
        self.assert_owner();
        self.mutate_status(true, false, "PAUSE");
    }
    pub fn resume(&mut self) {
        self.assert_owner();
        self.mutate_status(false, false, "RESUME");
    }
    pub fn revoke(&mut self) {
        self.assert_owner();
        self.mutate_status(true, true, "REVOKE");
    }

    pub fn request_payment(
        &mut self,
        recipient: AccountId,
        amount_yocto: U128,
        nonce: String,
        expires_at_ns: String,
        expected_version: u32,
    ) -> PaymentDecision {
        let caller = env::predecessor_account_id();
        let Some(m) = self.mandate.clone() else {
            return reject("NO_MANDATE");
        };
        if caller != m.agent {
            return reject("WRONG_AGENT");
        }
        if m.revoked {
            return reject("REVOKED");
        }
        if m.paused {
            return reject("PAUSED");
        }
        if self.pending_withdrawal > 0 {
            return reject("WITHDRAWAL_PENDING");
        }
        if expected_version != m.version {
            return reject("STALE_VERSION");
        }
        let now = env::block_timestamp();
        let Ok(request_expiry) = expires_at_ns.parse::<u64>() else {
            return reject("INVALID_EXPIRY");
        };
        if request_expiry <= now || request_expiry > parse_ns(&m.expires_at_ns) {
            return reject("EXPIRED");
        }
        if !valid_nonce(&nonce) {
            return reject("INVALID_NONCE");
        }
        if !m.recipients.contains(&recipient) {
            return reject("RECIPIENT_NOT_ALLOWED");
        }
        let amount = amount_yocto.0;
        if amount == 0 || amount > m.per_payment_yocto.0 {
            return reject("PER_PAYMENT_LIMIT");
        }
        let nonce_key = format!("{}:{nonce}", m.version);
        if self.used_nonces.contains(&nonce_key) {
            return reject("REPLAY");
        }
        let day = now / DAY_NS;
        let day_used = self
            .day_confirmed
            .get(&day)
            .copied()
            .unwrap_or(0)
            .saturating_add(self.day_pending.get(&day).copied().unwrap_or(0));
        if day_used
            .checked_add(amount)
            .is_none_or(|v| v > m.daily_yocto.0)
        {
            return reject("DAILY_LIMIT");
        }
        if self
            .confirmed_total
            .saturating_add(self.pending_total)
            .checked_add(amount)
            .is_none_or(|v| v > m.total_yocto.0)
        {
            return reject("TOTAL_LIMIT");
        }
        if self.requests.len() >= MAX_REQUESTS {
            return reject("CAPACITY_REACHED");
        }
        if self.available_balance() < amount {
            return reject("VAULT_UNDERFUNDED");
        }
        let action = Action {
            domain_prefix: "AGENTSHIELD_ACTION_V1",
            domain: &self.domain,
            vault: &env::current_account_id(),
            owner: &self.owner,
            agent: &caller,
            mandate_version: m.version,
            recipient: &recipient,
            amount,
            nonce: &nonce,
            expires_at_ns: request_expiry,
        };
        let action_hash = hex(&env::sha256(
            &borsh::to_vec(&action).expect("Action encoding failed"),
        ));
        let record = PaymentRecord {
            request_id: action_hash.clone(),
            action_hash: action_hash.clone(),
            agent: caller,
            recipient: recipient.clone(),
            amount_yocto,
            nonce,
            mandate_version: m.version,
            requested_at_ns: now.to_string(),
            request_day: day,
            status: RequestStatus::Pending,
        };
        self.used_nonces.insert(nonce_key);
        self.pending_total = self
            .pending_total
            .checked_add(amount)
            .expect("Pending overflow");
        *self.day_pending.entry(day).or_default() = self
            .day_pending
            .get(&day)
            .copied()
            .unwrap_or(0)
            .checked_add(amount)
            .expect("Day pending overflow");
        self.requests.insert(action_hash.clone(), record);
        env::log_str(&format!(
            "AGENTSHIELD_DECISION request_id={action_hash} decision=AUTHORIZED version={}",
            m.version
        ));
        Promise::new(recipient)
            .transfer(NearToken::from_yoctonear(amount))
            .then(
                ext_self::ext(env::current_account_id())
                    .with_static_gas(CALLBACK_GAS)
                    .on_transfer_result(action_hash.clone()),
            )
            .detach();
        PaymentDecision::Authorized {
            request_id: action_hash.clone(),
            action_hash,
        }
    }

    #[private]
    pub fn on_transfer_result(&mut self, request_id: String) -> bool {
        require!(
            env::promise_results_count() == 1,
            "Expected one transfer result"
        );
        let succeeded = env::promise_result_checked(0, 32).is_ok();
        let record = self.requests.get_mut(&request_id).expect("Unknown request");
        require!(record.status == RequestStatus::Pending, "Already finalized");
        let amount = record.amount_yocto.0;
        self.pending_total = self
            .pending_total
            .checked_sub(amount)
            .expect("Pending underflow");
        let day_pending = self
            .day_pending
            .get_mut(&record.request_day)
            .expect("Missing day reservation");
        *day_pending = day_pending
            .checked_sub(amount)
            .expect("Day pending underflow");
        if succeeded {
            self.confirmed_total = self
                .confirmed_total
                .checked_add(amount)
                .expect("Confirmed overflow");
            *self.day_confirmed.entry(record.request_day).or_default() = self
                .day_confirmed
                .get(&record.request_day)
                .copied()
                .unwrap_or(0)
                .checked_add(amount)
                .expect("Day confirmed overflow");
            record.status = RequestStatus::Settled;
        } else {
            record.status = RequestStatus::TransferFailed;
        }
        env::log_str(&format!(
            "AGENTSHIELD_SETTLEMENT request_id={request_id} status={}",
            if succeeded {
                "SETTLED"
            } else {
                "TRANSFER_FAILED"
            }
        ));
        succeeded
    }

    pub fn withdraw_excess(&mut self, amount_yocto: U128) -> Promise {
        self.assert_owner();
        require!(self.pending_total == 0, "Wait for pending payments");
        require!(self.pending_withdrawal == 0, "Withdrawal already pending");
        require!(
            amount_yocto.0 > 0 && amount_yocto.0 <= self.available_balance(),
            "Amount exceeds available balance"
        );
        self.pending_withdrawal = amount_yocto.0;
        Promise::new(self.owner.clone())
            .transfer(NearToken::from_yoctonear(amount_yocto.0))
            .then(
                ext_self::ext(env::current_account_id())
                    .with_static_gas(CALLBACK_GAS)
                    .on_withdraw_result(),
            )
    }

    #[private]
    pub fn on_withdraw_result(&mut self) -> bool {
        require!(
            env::promise_results_count() == 1,
            "Expected one withdrawal result"
        );
        require!(self.pending_withdrawal > 0, "No withdrawal pending");
        let succeeded = env::promise_result_checked(0, 32).is_ok();
        self.pending_withdrawal = 0;
        env::log_str(if succeeded {
            "AGENTSHIELD_WITHDRAWAL status=SETTLED"
        } else {
            "AGENTSHIELD_WITHDRAWAL status=TRANSFER_FAILED"
        });
        succeeded
    }

    pub fn get_mandate(&self) -> Option<Mandate> {
        self.mandate.clone()
    }
    pub fn get_request(&self, request_id: String) -> Option<PaymentRecord> {
        self.requests.get(&request_id).cloned()
    }
    pub fn get_vault_status(&self) -> VaultStatus {
        let day = env::block_timestamp() / DAY_NS;
        VaultStatus {
            owner: self.owner.clone(),
            domain: self.domain.clone(),
            mandate: self.mandate.clone(),
            confirmed_total_yocto: U128(self.confirmed_total),
            pending_total_yocto: U128(self.pending_total),
            pending_withdrawal_yocto: U128(self.pending_withdrawal),
            day_confirmed_yocto: U128(self.day_confirmed.get(&day).copied().unwrap_or(0)),
            day_pending_yocto: U128(self.day_pending.get(&day).copied().unwrap_or(0)),
            current_utc_day: day,
            balance_yocto: U128(env::account_balance().as_yoctonear()),
            available_yocto: U128(self.available_balance()),
            accepted_requests: self.requests.len(),
        }
    }
}

impl Vault {
    fn assert_owner(&self) {
        require!(env::predecessor_account_id() == self.owner, "Owner only");
    }

    fn mutate_status(&mut self, paused: bool, revoked: bool, action: &str) {
        let mandate = self.mandate.as_mut().expect("No mandate");
        require!(!mandate.revoked, "Vault mandate is revoked");
        mandate.paused = paused;
        mandate.revoked = revoked;
        mandate.version = mandate.version.checked_add(1).expect("Version exhausted");
        env::log_str(&format!(
            "AGENTSHIELD_POLICY version={} action={action}",
            mandate.version
        ));
    }

    fn available_balance(&self) -> u128 {
        let storage = u128::from(env::storage_usage())
            .saturating_mul(env::storage_byte_cost().as_yoctonear());
        env::account_balance()
            .as_yoctonear()
            .saturating_sub(storage)
            .saturating_sub(OPERATING_RESERVE)
            .saturating_sub(self.pending_total)
            .saturating_sub(self.pending_withdrawal)
    }
}

fn parse_ns(value: &str) -> u64 {
    value.parse::<u64>().expect("Invalid nanosecond timestamp")
}
fn valid_nonce(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 64
        && value
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'_')
}
fn reject(reason: &str) -> PaymentDecision {
    env::log_str(&format!(
        "AGENTSHIELD_DECISION decision=REJECTED reason={reason}"
    ));
    PaymentDecision::Rejected {
        reason: reason.to_string(),
    }
}
fn hex(bytes: &[u8]) -> String {
    const DIGITS: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for &byte in bytes {
        out.push(DIGITS[(byte >> 4) as usize] as char);
        out.push(DIGITS[(byte & 0xf) as usize] as char);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    #[allow(deprecated)]
    use near_sdk::test_utils::{testing_env_with_promise_results, VMContextBuilder};
    use near_sdk::{testing_env, PromiseResult};

    const NOW: u64 = 1_783_100_000_000_000_000;
    const TENTH: u128 = 100_000_000_000_000_000_000_000;

    fn id(value: &str) -> AccountId {
        value.parse().unwrap()
    }

    fn context(caller: &str) -> VMContextBuilder {
        let mut builder = VMContextBuilder::new();
        builder
            .current_account_id(id("vault.testnet"))
            .signer_account_id(id(caller))
            .predecessor_account_id(id(caller))
            .block_timestamp(NOW)
            .account_balance(NearToken::from_near(5))
            .storage_usage(1_000);
        builder
    }

    fn setup() -> Vault {
        testing_env!(context("owner.testnet").build());
        let mut vault = Vault::initialize(id("owner.testnet"), "agentshield:testnet:v1".into());
        vault.set_mandate(
            id("agent.testnet"),
            vec![id("merchant.testnet")],
            U128(TENTH),
            U128(TENTH),
            U128(TENTH * 2),
            (NOW + DAY_NS).to_string(),
        );
        vault
    }

    fn request(vault: &mut Vault, nonce: &str, amount: u128, recipient: &str) -> PaymentDecision {
        vault.request_payment(
            id(recipient),
            U128(amount),
            nonce.into(),
            (NOW + DAY_NS - 1).to_string(),
            vault.get_mandate().unwrap().version,
        )
    }

    #[test]
    fn valid_request_reserves_and_replay_does_not_schedule_again() {
        let mut vault = setup();
        testing_env!(context("agent.testnet").build());
        let first = request(&mut vault, "nonce-1", TENTH, "merchant.testnet");
        let request_id = match first {
            PaymentDecision::Authorized { request_id, .. } => request_id,
            _ => panic!("Expected authorization"),
        };
        assert_eq!(vault.get_vault_status().pending_total_yocto.0, TENTH);
        assert_eq!(
            vault.get_request(request_id).unwrap().status,
            RequestStatus::Pending
        );
        assert!(
            matches!(request(&mut vault, "nonce-1", TENTH, "merchant.testnet"),
            PaymentDecision::Rejected { reason } if reason == "REPLAY")
        );
        assert_eq!(vault.get_vault_status().accepted_requests, 1);
    }

    #[test]
    fn policy_rejections_leave_budget_untouched() {
        let mut vault = setup();
        testing_env!(context("agent.testnet").build());
        assert!(
            matches!(request(&mut vault, "a", TENTH + 1, "merchant.testnet"),
            PaymentDecision::Rejected { reason } if reason == "PER_PAYMENT_LIMIT")
        );
        assert!(
            matches!(request(&mut vault, "a", TENTH, "attacker.testnet"),
            PaymentDecision::Rejected { reason } if reason == "RECIPIENT_NOT_ALLOWED")
        );
        testing_env!(context("intruder.testnet").build());
        assert!(
            matches!(request(&mut vault, "a", TENTH, "merchant.testnet"),
            PaymentDecision::Rejected { reason } if reason == "WRONG_AGENT")
        );
        assert_eq!(vault.get_vault_status().pending_total_yocto.0, 0);
        assert_eq!(vault.get_vault_status().accepted_requests, 0);
    }

    #[test]
    fn two_pending_requests_cannot_take_last_daily_budget() {
        let mut vault = setup();
        testing_env!(context("agent.testnet").build());
        assert!(matches!(
            request(&mut vault, "a", TENTH, "merchant.testnet"),
            PaymentDecision::Authorized { .. }
        ));
        assert!(
            matches!(request(&mut vault, "b", TENTH, "merchant.testnet"),
            PaymentDecision::Rejected { reason } if reason == "DAILY_LIMIT")
        );
    }

    #[test]
    #[allow(deprecated)]
    fn failed_transfer_releases_budget_but_keeps_nonce() {
        let mut vault = setup();
        testing_env!(context("agent.testnet").build());
        let request_id = match request(&mut vault, "a", TENTH, "merchant.testnet") {
            PaymentDecision::Authorized { request_id, .. } => request_id,
            _ => panic!("Expected authorization"),
        };
        testing_env_with_promise_results(context("vault.testnet").build(), PromiseResult::Failed);
        assert!(!vault.on_transfer_result(request_id.clone()));
        assert_eq!(vault.get_vault_status().pending_total_yocto.0, 0);
        assert_eq!(
            vault.get_request(request_id).unwrap().status,
            RequestStatus::TransferFailed
        );
        testing_env!(context("agent.testnet").build());
        assert!(
            matches!(request(&mut vault, "a", TENTH, "merchant.testnet"),
            PaymentDecision::Rejected { reason } if reason == "REPLAY")
        );
        assert!(matches!(
            request(&mut vault, "b", TENTH, "merchant.testnet"),
            PaymentDecision::Authorized { .. }
        ));
    }

    #[test]
    #[allow(deprecated)]
    fn revocation_blocks_new_requests_but_pending_can_settle() {
        let mut vault = setup();
        testing_env!(context("agent.testnet").build());
        let request_id = match request(&mut vault, "a", TENTH, "merchant.testnet") {
            PaymentDecision::Authorized { request_id, .. } => request_id,
            _ => panic!("Expected authorization"),
        };
        testing_env!(context("owner.testnet").build());
        vault.revoke();
        testing_env!(context("agent.testnet").build());
        assert!(
            matches!(request(&mut vault, "b", TENTH, "merchant.testnet"),
            PaymentDecision::Rejected { reason } if reason == "REVOKED")
        );
        testing_env_with_promise_results(
            context("vault.testnet").build(),
            PromiseResult::Successful(vec![]),
        );
        assert!(vault.on_transfer_result(request_id.clone()));
        assert_eq!(
            vault.get_request(request_id).unwrap().status,
            RequestStatus::Settled
        );
        assert_eq!(vault.get_vault_status().confirmed_total_yocto.0, TENTH);
    }

    #[test]
    #[should_panic(expected = "Owner only")]
    fn non_owner_cannot_change_policy() {
        let mut vault = setup();
        testing_env!(context("agent.testnet").build());
        vault.pause();
    }

    #[test]
    #[should_panic(expected = "Owner must initialize the vault")]
    fn initializer_must_be_owner() {
        testing_env!(context("intruder.testnet").build());
        Vault::initialize(id("owner.testnet"), "agentshield:testnet:v1".into());
    }

    #[test]
    #[allow(deprecated)]
    fn pending_withdrawal_blocks_payment_and_failure_releases_guard() {
        let mut vault = setup();
        testing_env!(context("owner.testnet").build());
        let _promise = vault.withdraw_excess(U128(TENTH));
        assert_eq!(vault.get_vault_status().pending_withdrawal_yocto.0, TENTH);
        testing_env!(context("agent.testnet").build());
        assert!(matches!(
            request(&mut vault, "a", TENTH, "merchant.testnet"),
            PaymentDecision::Rejected { reason } if reason == "WITHDRAWAL_PENDING"
        ));
        testing_env_with_promise_results(context("vault.testnet").build(), PromiseResult::Failed);
        assert!(!vault.on_withdraw_result());
        assert_eq!(vault.get_vault_status().pending_withdrawal_yocto.0, 0);
        testing_env!(context("agent.testnet").build());
        assert!(matches!(
            request(&mut vault, "a", TENTH, "merchant.testnet"),
            PaymentDecision::Authorized { .. }
        ));
    }

    #[test]
    #[allow(deprecated)]
    fn pending_withdrawal_blocks_payment_and_success_releases_guard() {
        let mut vault = setup();
        testing_env!(context("owner.testnet").build());
        let _promise = vault.withdraw_excess(U128(TENTH));
        assert_eq!(vault.get_vault_status().pending_withdrawal_yocto.0, TENTH);
        testing_env!(context("agent.testnet").build());
        assert!(matches!(
            request(&mut vault, "b", TENTH, "merchant.testnet"),
            PaymentDecision::Rejected { reason } if reason == "WITHDRAWAL_PENDING"
        ));
        testing_env_with_promise_results(
            context("vault.testnet").build(),
            PromiseResult::Successful(vec![]),
        );
        assert!(vault.on_withdraw_result());
        assert_eq!(vault.get_vault_status().pending_withdrawal_yocto.0, 0);
        testing_env!(context("agent.testnet").build());
        assert!(matches!(
            request(&mut vault, "b", TENTH, "merchant.testnet"),
            PaymentDecision::Authorized { .. }
        ));
    }

    #[test]
    fn only_owner_can_fund_and_attached_amount_is_reported() {
        let mut vault = setup();
        let mut owner = context("owner.testnet");
        owner.attached_deposit(NearToken::from_yoctonear(TENTH));
        testing_env!(owner.build());
        assert_eq!(vault.fund().0, TENTH);
    }

    #[test]
    #[allow(deprecated)]
    fn successful_transfer_settles_exactly_once() {
        let mut vault = setup();
        testing_env!(context("agent.testnet").build());
        let request_id = match request(&mut vault, "settle-1", TENTH, "merchant.testnet") {
            PaymentDecision::Authorized { request_id, .. } => request_id,
            _ => panic!("Expected authorization"),
        };
        testing_env_with_promise_results(
            context("vault.testnet").build(),
            PromiseResult::Successful(vec![]),
        );
        assert!(vault.on_transfer_result(request_id.clone()));
        let status = vault.get_vault_status();
        assert_eq!(status.pending_total_yocto.0, 0);
        assert_eq!(status.confirmed_total_yocto.0, TENTH);
        assert_eq!(status.day_confirmed_yocto.0, TENTH);
        assert_eq!(
            vault.get_request(request_id).unwrap().status,
            RequestStatus::Settled
        );
    }
}
