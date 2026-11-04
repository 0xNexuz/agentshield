// Counterparty check: risk signals about a payment receiver, read before an agent pays
// (or before an owner adds the receiver to a mandate). Pure function over facts read from
// finalized Testnet state. It never signs. It is an offchain warning layer, not enforcement:
// the vault contract's allowlist and limits remain the authority.
// Shared by the site (served from this folder), the read-only API and the MCP server.

export const EMPTY_CODE_HASH = '11111111111111111111111111111111';
const LEVELS = { INFO: 0, WARN: 1, BLOCK: 2 };
const DECISION = ['ALLOW', 'WARN', 'BLOCK'];
const nearAccountPattern = /^(?:(?:[a-z\d]+[-_])*[a-z\d]+\.)*(?:[a-z\d]+[-_])*[a-z\d]+$/;

// Non-Latin letters that render like Latin ones (Cyrillic and Greek), mapped to the letter they imitate.
const CONFUSABLE_LETTERS = {
  'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'у': 'y', 'х': 'x', 'і': 'i', 'ј': 'j', 'ѕ': 's',
  'ԁ': 'd', 'һ': 'h', 'ӏ': 'l', 'ԛ': 'q', 'ԝ': 'w', 'ɡ': 'g', 'α': 'a', 'ο': 'o', 'ρ': 'p', 'ν': 'v',
  'ι': 'i', 'κ': 'k', 'χ': 'x', 'τ': 't', 'υ': 'u',
};

export function isValidNearAccountId(id) {
  return typeof id === 'string' && id.length >= 2 && id.length <= 64 && nearAccountPattern.test(id);
}

export function accountKind(id) {
  if (!isValidNearAccountId(id)) return 'invalid';
  if (/^[0-9a-f]{64}$/.test(id)) return 'implicit';
  if (/^0x[0-9a-f]{40}$/.test(id)) return 'eth-implicit';
  if (id.endsWith('.testnet')) return 'testnet';
  if (id.endsWith('.near')) return 'mainnet';
  return 'other';
}

const unconfuse = text => [...text.toLowerCase()].map(ch => CONFUSABLE_LETTERS[ch] ?? ch).join('');
// Collapses characters people misread for each other, so look-alike names compare equal.
export function skeleton(id) {
  return unconfuse(id).replace(/rn/g, 'm').replace(/vv/g, 'w').replace(/[0]/g, 'o')
    .replace(/[1i]/g, 'l').replace(/[-_]/g, '');
}

function editDistance(a, b, cap = 3) {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, row[j]);
    }
    if (best > cap) return cap + 1;
    prev = row;
  }
  return prev[b.length];
}

// The account that actually controls a named account: its last two labels (x.y.attacker.testnet → attacker.testnet).
const controllingAccount = id => id.split('.').slice(-2).join('.');

function firstDifference(candidate, known) {
  const a = [...candidate];
  const b = [...known];
  if (a.length !== b.length) return null;
  const at = a.findIndex((ch, i) => ch !== b[i]);
  if (at < 0) return null;
  const codePoint = /[^\x00-\x7f]/.test(a[at]) ? ` (U+${a[at].codePointAt(0).toString(16).toUpperCase().padStart(4, '0')})` : '';
  return `“${a[at]}”${codePoint} in place of “${b[at]}”`;
}

// Why `candidate` could be mistaken for the allowlisted `known`, or null.
export function lookalikeReason(candidate, known) {
  if (candidate === known) return null;
  const nonLatin = /[^\x00-\x7f]/.test(candidate);
  if (nonLatin && unconfuse(candidate) === known) {
    return { level: 'BLOCK', why: `uses non-Latin letters that look like ${known} (${firstDifference(candidate, known) ?? 'mixed scripts'})` };
  }
  if (candidate.startsWith(`${known}.`)) {
    return { level: 'BLOCK', why: `starts with the real name but belongs to ${controllingAccount(candidate)}` };
  }
  if (candidate.endsWith(`.${known}`)) {
    return { level: 'WARN', why: `is a sub-account of ${known}, not ${known} itself` };
  }
  const name = id => id.replace(/\.(testnet|near)$/, '');
  if (name(candidate) === name(known)) return { level: 'BLOCK', why: `has the same name as ${known} on another network` };
  if (skeleton(candidate) === skeleton(known)) {
    return { level: 'BLOCK', why: `swaps characters that look alike (${firstDifference(candidate, known) ?? 'separators or letter shapes'})` };
  }
  const distance = editDistance(candidate, known);
  if (distance <= 2) return { level: 'BLOCK', why: `differs from ${known} by ${distance} character${distance === 1 ? '' : 's'}` };
  return null;
}

/**
 * @param {object} input
 * @param {string} input.account        Receiver as given (may be malformed or contain non-Latin letters).
 * @param {'payment'|'allowlist'} [input.purpose]  'payment': agent is about to pay. 'allowlist': owner is about to add it.
 * @param {string[]} input.allowlist    Recipients on the live mandate.
 * @param {{account:string, reason:string, evidence:string}[]} [input.blocklist]
 * @param {Record<string,string>} [input.pinnedCodeHashes]  Code hash the owner approved per recipient.
 * @param {{found:boolean, codeHash?:string}|null} input.facts  Finalized view_account result, or null if unread.
 * @param {string} [input.network]
 */
export function assessCounterparty({ account, purpose = 'payment', allowlist = [], blocklist = [],
  pinnedCodeHashes = {}, facts = null, network = 'testnet' }) {
  const signals = [];
  const add = (level, code, message, extra = {}) => signals.push({ level, code, message, ...extra });
  const id = typeof account === 'string' ? account.trim() : '';
  const kind = accountKind(id);
  const allowlisted = allowlist.includes(id);

  if (kind === 'invalid') {
    add('BLOCK', 'INVALID_ACCOUNT_ID', /[^\x00-\x7f]/.test(id)
      ? 'Not a valid NEAR account ID: it contains non-Latin characters.'
      : 'Not a valid NEAR account ID (2–64 lowercase letters, digits, - _ and . separators).');
  } else if (network === 'testnet' && kind === 'mainnet') {
    add('BLOCK', 'WRONG_NETWORK', 'This is a mainnet (.near) account; the vault pays on Testnet only.');
  } else if (network === 'testnet' && kind === 'other') {
    add('BLOCK', 'WRONG_NETWORK', 'Not a .testnet account.');
  }

  const listed = blocklist.find(entry => entry.account === id);
  if (listed) add('BLOCK', 'BLOCKLISTED', listed.reason, { evidence: listed.evidence });

  if (!allowlisted) {
    for (const known of allowlist) {
      const match = lookalikeReason(id, known);
      if (match) { add(match.level, 'LOOKALIKE', `Looks like an allowlisted recipient: it ${match.why}.`, { lookalikeOf: known }); break; }
    }
    if (purpose === 'payment') {
      add('BLOCK', 'NOT_ALLOWLISTED', 'Not on the vault mandate’s allowlist, so the contract would reject it (RECIPIENT_NOT_ALLOWED).');
    } else {
      add('INFO', 'NOT_YET_ALLOWLISTED', 'Not on the allowlist yet; adding it needs an owner-signed mandate change.');
    }
  }

  if (kind === 'implicit' || kind === 'eth-implicit') {
    add('WARN', 'IMPLICIT_ACCOUNT', 'An implicit account is a raw key or address, so it is hard to check by eye.');
  }

  const readable = kind !== 'invalid' && !(network === 'testnet' && (kind === 'mainnet' || kind === 'other'));
  if (readable) {
    if (!facts) {
      add('BLOCK', 'STATE_UNVERIFIED', 'Could not read this account from finalized Testnet state, so the check fails closed.');
    } else if (!facts.found) {
      add('BLOCK', 'ACCOUNT_MISSING', 'This account does not exist in finalized Testnet state.');
    } else {
      const pinned = pinnedCodeHashes[id];
      const hasCode = facts.codeHash && facts.codeHash !== EMPTY_CODE_HASH;
      if (pinned && facts.codeHash !== pinned) {
        add('BLOCK', 'CODE_CHANGED', pinned === EMPTY_CODE_HASH
          ? 'Contract code was deployed to this account after the owner approved it as a plain account.'
          : 'This account’s contract code changed after the owner approved it.', { pinnedCodeHash: pinned, codeHash: facts.codeHash });
      } else if (pinned) {
        add('INFO', 'CODE_PINNED', hasCode ? 'Contract code matches the hash the owner approved.'
          : 'Still a plain account with no contract code, as when the owner approved it.');
      } else if (hasCode) {
        add('WARN', 'HAS_CONTRACT', 'This account runs contract code that no owner has reviewed and pinned.', { codeHash: facts.codeHash });
      }
    }
  }

  const worst = signals.reduce((max, s) => Math.max(max, LEVELS[s.level]), 0);
  return {
    source: 'COUNTERPARTY_CHECK', account: id, purpose, decision: DECISION[worst],
    allowlisted, signals,
    notChecked: [
      { code: 'ACCOUNT_AGE', message: 'Account age: public RPC does not expose when an account was created; that needs an indexer.' },
      { code: 'PRIOR_PAYMENTS', message: 'Past payments between agent and receiver: needs an indexer; not checked.' },
    ],
  };
}
