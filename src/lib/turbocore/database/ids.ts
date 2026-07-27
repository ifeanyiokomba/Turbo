// TurboCore — Prefixed ID Generator (Chapter 8, Principle 2)
//
// "Everything receives a globally unique identifier. Never expose database IDs."
//
// Every TurboCore entity has a prefixed public ID:
//   usr_01H7...  → Customer
//   txn_01H8...  → Transaction
//   wal_01H9...  → Wallet
//   prv_01HA...  → Provider
//   led_01HB...  → Ledger Entry
//   cap_01HC...  → Capability
//   mer_01HD...  → Merchant
//   ctry_01HE... → Country
//   sett_01HF... → Settlement
//   kyc_01HG...  → KYC Request
//   pmt_01HH...  → Payment
//   ref_01HI...  → Refund
//   evt_01HJ...  → Event Store
//   aud_01HK...  → Audit Log
//   not_01HL...  → Notification
//   fx_01HM...   → FX Quote
//   rsk_01HN...  → Risk Score
//   cfg_01HO...  → Configuration
//
// The prefix makes IDs self-documenting in logs, URLs, and customer-facing
// references. The body uses ULID (Universally Unique Lexicographically
// Sortable Identifier) — 26 chars, Crockford base32, time-sortable.
//
// SQLite/Prisma stores these as the @id String column. The default cuid()
// is replaced by this generator for all new records.

// ---------------------------------------------------------------------------
// ULID implementation (pure TypeScript, no dependencies)
// ---------------------------------------------------------------------------

const ENCODING = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford base32
const ENCODING_LEN = 32;
const TIME_LEN = 10;
const RANDOM_LEN = 16;

function encodeTime(now: number): string {
  let str = "";
  let time = now;
  for (let i = TIME_LEN - 1; i >= 0; i--) {
    const mod = time % ENCODING_LEN;
    str = ENCODING[mod] + str;
    time = (time - mod) / ENCODING_LEN;
  }
  return str;
}

function encodeRandom(): string {
  let str = "";
  const bytes = new Uint8Array(RANDOM_LEN);
  // Use Web Crypto API (available in Node 19+ and all browsers)
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    // Fallback for older environments
    for (let i = 0; i < RANDOM_LEN; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  for (let i = 0; i < RANDOM_LEN; i++) {
    str += ENCODING[bytes[i] % ENCODING_LEN];
  }
  return str;
}

/**
 * Generates a ULID (Universally Unique Lexicographically Sortable Identifier).
 * 26 chars, Crockford base32, time-sortable to the millisecond.
 */
export function ulid(): string {
  return encodeTime(Date.now()) + encodeRandom();
}

// ---------------------------------------------------------------------------
// Prefixed ID generator
// ---------------------------------------------------------------------------

/**
 * Known entity prefixes. Every financial object in TurboCore has one.
 * Adding a new prefix is a one-line change here — no schema migration needed.
 */
export const ID_PREFIXES = {
  // Identity & Customers
  USER: "usr",
  CUSTOMER: "cus",
  SESSION: "ses",
  DEVICE: "dev",
  PASSKEY: "psk",

  // Wallets
  WALLET: "wal",
  CURRENCY_WALLET: "cwh",
  WALLET_TRANSACTION: "wtx",

  // Ledger
  LEDGER_ACCOUNT: "lac",
  LEDGER_ENTRY: "led",
  JOURNAL_ENTRY: "jrn",
  JOURNAL_BATCH: "jbt",
  BALANCE_SNAPSHOT: "bsn",
  ACCOUNTING_PERIOD: "acp",
  RECONCILIATION: "rec",

  // Payments
  PAYMENT: "pmt",
  PAYMENT_ATTEMPT: "pat",
  PAYMENT_METHOD: "pmh",
  PAYMENT_EVENT: "pev",
  PAYMENT_REQUEST: "prq",
  REFUND: "rfd",
  CHARGEBACK: "cbk",
  TRANSACTION: "txn",
  TRANSACTION_EVENT: "tev",

  // Providers
  PROVIDER: "prv",
  PROVIDER_CREDENTIAL: "pcr",
  PROVIDER_HEALTH: "phc",
  PROVIDER_ROUTE: "prt",
  PROVIDER_INCIDENT: "pin",
  PROVIDER_CAPABILITY: "pcb",

  // Capabilities (GCR)
  CAPABILITY: "cap",
  CAPABILITY_GROUP: "cgp",
  CAPABILITY_DEPENDENCY: "cdp",
  CAPABILITY_VERSION: "cvr",
  CAPABILITY_FLAG: "cfg",

  // Countries
  COUNTRY: "ctry",
  CURRENCY: "cur",
  COUNTRY_CAPABILITY: "ccc",
  COUNTRY_PROVIDER: "ccp",

  // Merchants
  MERCHANT: "mer",
  MERCHANT_API_KEY: "mak",
  MERCHANT_WALLET: "mwh",
  MERCHANT_SETTLEMENT: "mst",
  MERCHANT_WEBHOOK: "mwh",
  MERCHANT_TEAM: "mtm",
  PAYMENT_LINK: "plk",

  // Compliance
  KYC_REQUEST: "kyc",
  KYB_REQUEST: "kyb",
  IDENTITY_DOCUMENT: "idd",
  SANCTIONS_CHECK: "snc",
  PEP_CHECK: "pep",
  AML_SCREENING: "aml",
  COMPLIANCE_CASE: "cmp",

  // Risk
  RISK_SCORE: "rsk",
  RISK_EVENT: "rev",
  RISK_RULE: "rrl",
  FRAUD_ALERT: "fra",
  VELOCITY_LIMIT: "vel",

  // FX
  FX_RATE: "fxr",
  FX_QUOTE: "fxq",
  FX_TRANSACTION: "fxt",
  CURRENCY_PAIR: "fxp",

  // Notifications
  NOTIFICATION: "not",
  NOTIFICATION_TEMPLATE: "ntm",
  DELIVERY_LOG: "dlg",

  // Audit
  AUDIT_LOG: "aud",
  AUDIT_EVENT: "aev",
  API_ACCESS_LOG: "aal",
  ADMIN_ACTION: "adm",

  // Configuration
  FEATURE_FLAG: "flg",
  SYSTEM_SETTING: "sys",
  ROUTING_RULE: "rru",
  FEE_CONFIG: "fee",

  // Analytics
  DAILY_METRIC: "dmt",
  PROVIDER_METRIC: "pmt",
  MERCHANT_METRIC: "mmt",
  COUNTRY_METRIC: "cmt",
  REVENUE_METRIC: "rvm",

  // Settlement
  SETTLEMENT: "sett",
  SETTLEMENT_ACCOUNT: "sac",

  // Event Store
  EVENT_STORE: "evt",

  // Misc
  VIRTUAL_ACCOUNT: "vac",
  VIRTUAL_CARD: "vcd",
  SAVINGS: "sav",
  INVESTMENT: "inv",
  VOUCHER: "vch",
  SUPPORT_TICKET: "tkt",
  DISPUTE: "dsp",
  SUBSCRIPTION: "sub",
  MANDATE: "mnd",
  SCHEDULED_PAYMENT: "sch",
  OUTBOX_EVENT: "obx",
  WEBHOOK_EVENT: "whe",
} as const;

export type IdPrefix = keyof typeof ID_PREFIXES;

/**
 * Generates a prefixed, globally-unique, time-sortable ID.
 *
 * @example
 *   generateId("USER")      // "usr_01H7X5K8ZQ3J0WMN2YV4P6R8AB"
 *   generateId("TRANSACTION") // "txn_01H8A6L9BR4K1XNO3ZW5Q7S9CD"
 *   generateId("WALLET")    // "wal_01H9B7M0CS5L2YOP4AX6R8T0EF"
 */
export function generateId(prefix: IdPrefix): string {
  return `${ID_PREFIXES[prefix]}_${ulid()}`;
}

/**
 * Extracts the prefix from a prefixed ID.
 * Returns null if the ID doesn't have a recognized prefix.
 */
export function getIdPrefix(id: string): string | null {
  const match = id.match(/^([a-z]{2,4})_/);
  if (!match) return null;
  return match[1];
}

/**
 * Returns the entity type name for a given prefixed ID.
 * Useful for log messages and audit trails.
 */
export function getEntityType(id: string): string | null {
  const prefix = getIdPrefix(id);
  if (!prefix) return null;
  for (const [key, value] of Object.entries(ID_PREFIXES)) {
    if (value === prefix) return key;
  }
  return null;
}

/**
 * Validates that an ID matches the expected prefix.
 * Throws if mismatched — use for guard clauses at API boundaries.
 */
export function assertIdPrefix(id: string, expected: IdPrefix): void {
  const expectedPrefix = ID_PREFIXES[expected];
  if (!id.startsWith(`${expectedPrefix}_`)) {
    throw new Error(
      `ID prefix mismatch: expected "${expectedPrefix}_" but got "${id.slice(0, expectedPrefix.length + 1)}" (full id: ${id})`
    );
  }
}

/**
 * Validates that an ID matches any recognized prefix.
 */
export function isValidPrefixedId(id: string): boolean {
  return getIdPrefix(id) !== null;
}
