// TurboCore Bounded Service — Ledger Service
//
// Thin facade over the double-entry ledger. All money movements in
// TurboPay ultimately resolve to a CREDIT or DEBIT ledger entry — this
// service exposes those primitives plus read-side queries for entries
// and reconciliation.
//
// Rule 2 (Canonical Models): every entry is stored in TurboCore's
// canonical LedgerEntry shape (entryType, refType, refId, pairId,
// balanceAfterKobo). Provider-specific objects never touch this table.

import { db } from "@/lib/db";
import { creditWallet, debitWallet, reconcileWallet } from "@/lib/ledger";
import {
  postJournal,
  postAdjustment,
  getAccountBalance,
  getAccountEntries,
  getOrCreateAccount,
  initializeChartOfAccounts,
  snapshotAllAccounts,
  runReconciliation,
  getCurrentAccountingPeriod,
  closeAccountingPeriod,
  JournalType,
  AccountType,
  ensureFLEInitialized,
} from "../fle";

export interface CreditInput {
  userId: string;
  amountKobo: number;
  refType: string;
  refId?: string;
  pairId?: string;
  description: string;
}

export interface DebitInput {
  userId: string;
  amountKobo: number;
  refType: string;
  refId?: string;
  pairId?: string;
  description: string;
}

export const ledgerService = {
  /** Credit a wallet — increases balance, writes a CREDIT ledger entry. Idempotent per refId+refType. */
  async credit(input: CreditInput) {
    // Post to FLE journal (double-entry) in addition to the legacy ledger
    await ensureFLEInitialized();
    const userAccount = await getOrCreateAccount({
      code: `CUST_WALLET_NGN_${input.userId}`,
      name: `Customer Wallet NGN - ${input.userId}`,
      type: AccountType.LIABILITY,
      subType: "CUSTOMER_WALLET",
      currency: "NGN",
      ownerId: input.userId,
    });

    // Determine journal type from refType
    const journalType = mapRefTypeToJournalType(input.refType);
    const pairId = input.pairId ?? `jrnl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Find contra account (source of funds)
    const contraCode = getContraAccountForRefType(input.refType);
    const contraAccount = await getOrCreateAccount({
      code: contraCode,
      name: contraCode.replace(/_/g, " "),
      type: AccountType.ASSET,
      subType: "PROVIDER_CLEARING",
      currency: "NGN",
    });

    await postJournal({
      pairId,
      journalType,
      debit: {
        journalType,
        accountId: contraAccount.id,
        reference: input.refId ?? pairId,
        currency: "NGN",
        amount: input.amountKobo,
        debitCredit: "DEBIT",
        source: "SYSTEM",
        metadata: { description: input.description, refType: input.refType },
      },
      credit: {
        journalType,
        accountId: userAccount.id,
        reference: input.refId ?? pairId,
        currency: "NGN",
        amount: input.amountKobo,
        debitCredit: "CREDIT",
        source: "SYSTEM",
        metadata: { description: input.description, refType: input.refType },
      },
    });

    // Also post to legacy ledger for backward compatibility
    return creditWallet({
      userId: input.userId,
      amountKobo: input.amountKobo,
      refType: input.refType,
      refId: input.refId,
      pairId: input.pairId,
      description: input.description,
    });
  },

  /** Debit a wallet — conditional update (balance ≥ amount), writes a DEBIT ledger entry. */
  async debit(input: DebitInput) {
    // Post to FLE journal (double-entry)
    await ensureFLEInitialized();
    const userAccount = await getOrCreateAccount({
      code: `CUST_WALLET_NGN_${input.userId}`,
      name: `Customer Wallet NGN - ${input.userId}`,
      type: AccountType.LIABILITY,
      subType: "CUSTOMER_WALLET",
      currency: "NGN",
      ownerId: input.userId,
    });

    const journalType = mapRefTypeToJournalType(input.refType);
    const pairId = input.pairId ?? `jrnl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Find contra account (destination)
    const contraCode = getContraAccountForRefType(input.refType);
    const contraAccount = await getOrCreateAccount({
      code: contraCode,
      name: contraCode.replace(/_/g, " "),
      type: AccountType.ASSET,
      subType: "PROVIDER_CLEARING",
      currency: "NGN",
    });

    await postJournal({
      pairId,
      journalType,
      debit: {
        journalType,
        accountId: userAccount.id,
        reference: input.refId ?? pairId,
        currency: "NGN",
        amount: input.amountKobo,
        debitCredit: "DEBIT",
        source: "SYSTEM",
        metadata: { description: input.description, refType: input.refType },
      },
      credit: {
        journalType,
        accountId: contraAccount.id,
        reference: input.refId ?? pairId,
        currency: "NGN",
        amount: input.amountKobo,
        debitCredit: "CREDIT",
        source: "SYSTEM",
        metadata: { description: input.description, refType: input.refType },
      },
    });

    // Also post to legacy ledger for backward compatibility
    return debitWallet({
      userId: input.userId,
      amountKobo: input.amountKobo,
      refType: input.refType,
      refId: input.refId,
      pairId: input.pairId,
      description: input.description,
    });
  },

  /** Post a fee journal entry (separate from the main transaction — never mix fees) */
  async postFee(opts: {
    userId: string;
    amountKobo: number;
    reference: string;
    description: string;
  }) {
    await ensureFLEInitialized();
    const userAccount = await getOrCreateAccount({
      code: `CUST_WALLET_NGN_${opts.userId}`,
      name: `Customer Wallet NGN - ${opts.userId}`,
      type: AccountType.LIABILITY,
      subType: "CUSTOMER_WALLET",
      currency: "NGN",
      ownerId: opts.userId,
    });
    const feeAccount = await getOrCreateAccount({
      code: "FEE_REVENUE",
      name: "Platform Fee Revenue",
      type: AccountType.REVENUE,
      subType: "FEE_REVENUE",
      currency: "NGN",
    });
    const pairId = `fee-${opts.reference}-${Date.now()}`;
    return postJournal({
      pairId,
      journalType: JournalType.FEE,
      debit: {
        journalType: JournalType.FEE,
        accountId: userAccount.id,
        reference: opts.reference,
        currency: "NGN",
        amount: opts.amountKobo,
        debitCredit: "DEBIT",
        source: "SYSTEM",
        metadata: { description: opts.description, type: "FEE" },
      },
      credit: {
        journalType: JournalType.FEE,
        accountId: feeAccount.id,
        reference: opts.reference,
        currency: "NGN",
        amount: opts.amountKobo,
        debitCredit: "CREDIT",
        source: "SYSTEM",
        metadata: { description: opts.description, type: "FEE_REVENUE" },
      },
    });
  },

  /** Post an adjustment entry (correction — never edit, always adjust) */
  async postAdjustment(opts: {
    accountCode: string;
    amount: number;
    debitCredit: "DEBIT" | "CREDIT";
    reason: string;
    reference: string;
  }) {
    await ensureFLEInitialized();
    const account = await getOrCreateAccount({
      code: opts.accountCode,
      name: opts.accountCode.replace(/_/g, " "),
      type: AccountType.ASSET,
      subType: "CASH",
      currency: "NGN",
    });
    return postAdjustment({
      accountId: account.id,
      amount: opts.amount,
      debitCredit: opts.debitCredit,
      reason: opts.reason,
      reference: opts.reference,
    });
  },

  /** Get FLE account balance (5 balance types) */
  async getFLEBalance(accountCode: string) {
    const account = await db.ledgerAccount.findUnique({ where: { code: accountCode } });
    if (!account) return null;
    return getAccountBalance(account.id);
  },

  /** Get FLE account entries (JournalEntry records) */
  async getFLEEntries(accountCode: string, limit = 50) {
    const account = await db.ledgerAccount.findUnique({ where: { code: accountCode } });
    if (!account) return [];
    return getAccountEntries(account.id, limit);
  },

  /** List ledger entries for a user, newest first. */
  async getEntries(userId: string, limit = 50) {
    return db.ledgerEntry.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: Math.min(Math.max(limit, 1), 200),
    });
  },

  /** Fetch a single ledger entry by id. */
  async getEntry(id: string) {
    return db.ledgerEntry.findUnique({ where: { id } });
  },

  /** Recompute wallet balance from the ledger (credit sum − debit sum). */
  async reconcile(userId: string) {
    return reconcileWallet(userId);
  },

  /** Run FLE reconciliation against provider reports */
  async runReconciliation(input: any) {
    return runReconciliation(input);
  },

  /** Snapshot all FLE accounts */
  async snapshotAll() {
    return snapshotAllAccounts();
  },

  /** Get current accounting period */
  async getCurrentPeriod() {
    return getCurrentAccountingPeriod();
  },

  /** Close accounting period (snapshots + locks) */
  async closePeriod(periodId: string, closedBy: string) {
    return closeAccountingPeriod(periodId, closedBy);
  },

  /** Initialize chart of accounts */
  async initializeChart() {
    return initializeChartOfAccounts();
  },
};

function mapRefTypeToJournalType(refType: string): string {
  const map: Record<string, string> = {
    FUNDING: JournalType.DEPOSIT,
    TRANSFER: JournalType.TRANSFER,
    AIRTIME: JournalType.WITHDRAWAL,
    DATA: JournalType.WITHDRAWAL,
    BILL: JournalType.WITHDRAWAL,
    REVERSAL: JournalType.REVERSAL,
    FEE: JournalType.FEE,
    CARD_FUND: JournalType.TRANSFER,
    CARD_WITHDRAW: JournalType.TRANSFER,
    REWARD: JournalType.INTEREST,
    REFERRAL: JournalType.INTEREST,
    SAVINGS: JournalType.TRANSFER,
    INVESTMENT: JournalType.TRANSFER,
    CELO_DEPOSIT: JournalType.DEPOSIT,
    CELO_WITHDRAW: JournalType.WITHDRAWAL,
  };
  return map[refType] ?? JournalType.TRANSFER;
}

function getContraAccountForRefType(refType: string): string {
  // Funding comes from provider clearing
  if (refType === "FUNDING" || refType === "CELO_DEPOSIT") return "PROVIDER_CLEARING";
  // Transfers go to another customer wallet (contra is same type)
  if (refType === "TRANSFER") return "CUSTOMER_WALLET";
  // Reversal goes back to provider clearing
  if (refType === "REVERSAL") return "PROVIDER_CLEARING";
  // Rewards/referrals come from operational reserve
  if (refType === "REWARD" || refType === "REFERRAL") return "OPERATIONAL_RESERVE";
  // Card operations are internal
  if (refType === "CARD_FUND" || refType === "CARD_WITHDRAW") return "OPERATIONAL_RESERVE";
  // Default: provider clearing
  return "PROVIDER_CLEARING";
}
