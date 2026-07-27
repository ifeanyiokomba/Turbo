// TurboCore Financial Ledger Engine (FLE) — Chapter 5
//
// The ledger is the money. Never calculate balances from transactions.
// Transactions generate ledger entries. Balances are derived from the ledger.
//
// Golden Rule: Assets = Liabilities + Equity
// Every financial movement creates minimum two entries (double-entry).
// Never UPDATE ledger entries. Corrections are adjustment entries.
//
// This module provides:
//   1. Chart of Accounts (Asset/Liability/Revenue/Expense)
//   2. Provider clearing accounts
//   3. Internal accounts (Fee Revenue, Tax Holding, FX Revenue, etc.)
//   4. Journal entry processing (12 journal types)
//   5. Reconciliation engine (8 categories)
//   6. Balance snapshots
//   7. Accounting periods (open/close/lock)
//   8. Adjustment entries (never edit)

import { db } from "@/lib/db";

// ===== Chart of Accounts =====

export const AccountType = {
  ASSET: "ASSET",
  LIABILITY: "LIABILITY",
  REVENUE: "REVENUE",
  EXPENSE: "EXPENSE",
} as const;

export const AccountSubType = {
  CASH: "CASH",
  PROVIDER_CLEARING: "PROVIDER_CLEARING",
  BANK_ACCOUNT: "BANK_ACCOUNT",
  CUSTOMER_WALLET: "CUSTOMER_WALLET",
  MERCHANT_WALLET: "MERCHANT_WALLET",
  FX_ASSET: "FX_ASSET",
  FEE_REVENUE: "FEE_REVENUE",
  FX_REVENUE: "FX_REVENUE",
  TAX_HOLDING: "TAX_HOLDING",
  PARTNER_REVENUE: "PARTNER_REVENUE",
  CHARGEBACK_RESERVE: "CHARGEBACK_RESERVE",
  OPERATIONAL_RESERVE: "OPERATIONAL_RESERVE",
  INSURANCE_RESERVE: "INSURANCE_RESERVE",
  PENDING_SETTLEMENT: "PENDING_SETTLEMENT",
  ESCROW: "ESCROW",
} as const;

// ===== Journal Types (12 from doc) =====

export const JournalType = {
  DEPOSIT: "DEPOSIT",
  WITHDRAWAL: "WITHDRAWAL",
  TRANSFER: "TRANSFER",
  REFUND: "REFUND",
  REVERSAL: "REVERSAL",
  SETTLEMENT: "SETTLEMENT",
  CHARGEBACK: "CHARGEBACK",
  FEE: "FEE",
  FX: "FX",
  ESCROW: "ESCROW",
  INTEREST: "INTEREST",
  ADJUSTMENT: "ADJUSTMENT",
} as const;

// ===== Reconciliation Categories (8 from doc) =====

export const ReconCategory = {
  MATCHED: "MATCHED",
  MISSING: "MISSING",
  DUPLICATE: "DUPLICATE",
  AMOUNT_MISMATCH: "AMOUNT_MISMATCH",
  CURRENCY_MISMATCH: "CURRENCY_MISMATCH",
  REFERENCE_MISMATCH: "REFERENCE_MISMATCH",
  SETTLEMENT_DELAY: "SETTLEMENT_DELAY",
  FEE_DIFFERENCE: "FEE_DIFFERENCE",
} as const;

// ===== Provider Clearing Account Codes =====

export const PROVIDER_CLEARING_CODES: Record<string, string> = {
  paystack: "PAYSTACK_CLEARING",
  flutterwave: "FLUTTERWAVE_CLEARING",
  monnify: "MONNIFY_CLEARING",
  mpesa: "MPESA_CLEARING",
  mtn_momo: "MTN_MOMO_CLEARING",
  airtel_money: "AIRTEL_MONEY_CLEARING",
  smartcash: "SMARTCASH_CLEARING",
  paga: "PAGA_CLEARING",
  baxi: "BAXI_CLEARING",
  remita: "REMITA_CLEARING",
  quickteller: "QUICKTELLER_CLEARING",
  stripe: "STRIPE_CLEARING",
  wise: "WISE_CLEARING",
};

// ===== Internal Account Codes =====

export const INTERNAL_ACCOUNT_CODES = {
  FEE_REVENUE: "FEE_REVENUE",
  FX_REVENUE: "FX_REVENUE",
  TAX_HOLDING: "TAX_HOLDING",
  PARTNER_REVENUE: "PARTNER_REVENUE",
  CHARGEBACK_RESERVE: "CHARGEBACK_RESERVE",
  OPERATIONAL_RESERVE: "OPERATIONAL_RESERVE",
  INSURANCE_RESERVE: "INSURANCE_RESERVE",
} as const;

// ===== Initialize Chart of Accounts =====

export async function initializeChartOfAccounts(): Promise<void> {
  const accounts: Array<{
    code: string;
    name: string;
    type: string;
    subType: string;
    currency: string;
    providerCode?: string;
  }> = [
    // Internal Revenue Accounts
    {
      code: "FEE_REVENUE",
      name: "Platform Fee Revenue",
      type: "REVENUE",
      subType: "FEE_REVENUE",
      currency: "NGN",
    },
    {
      code: "FX_REVENUE",
      name: "FX Margin Revenue",
      type: "REVENUE",
      subType: "FX_REVENUE",
      currency: "NGN",
    },
    {
      code: "TAX_HOLDING",
      name: "Tax Holding Account",
      type: "LIABILITY",
      subType: "TAX_HOLDING",
      currency: "NGN",
    },
    {
      code: "PARTNER_REVENUE",
      name: "Partner Revenue Share",
      type: "LIABILITY",
      subType: "PARTNER_REVENUE",
      currency: "NGN",
    },
    {
      code: "CHARGEBACK_RESERVE",
      name: "Chargeback Reserve",
      type: "LIABILITY",
      subType: "CHARGEBACK_RESERVE",
      currency: "NGN",
    },
    {
      code: "OPERATIONAL_RESERVE",
      name: "Operational Reserve",
      type: "ASSET",
      subType: "OPERATIONAL_RESERVE",
      currency: "NGN",
    },
    {
      code: "INSURANCE_RESERVE",
      name: "Insurance Reserve",
      type: "LIABILITY",
      subType: "INSURANCE_RESERVE",
      currency: "NGN",
    },
  ];

  // Provider clearing accounts
  for (const [provider, code] of Object.entries(PROVIDER_CLEARING_CODES)) {
    accounts.push({
      code,
      name: `${provider.charAt(0).toUpperCase() + provider.slice(1)} Clearing`,
      type: "ASSET",
      subType: "PROVIDER_CLEARING",
      currency: "NGN",
      providerCode: provider,
    });
  }

  for (const account of accounts) {
    await db.ledgerAccount.upsert({
      where: { code: account.code },
      create: account,
      update: {},
    });
  }
}

// ===== Get or Create Account =====

export async function getOrCreateAccount(opts: {
  code: string;
  name: string;
  type: string;
  subType: string;
  currency?: string;
  ownerId?: string;
  providerCode?: string;
}): Promise<any> {
  const existing = await db.ledgerAccount.findUnique({ where: { code: opts.code } });
  if (existing) return existing;
  return db.ledgerAccount.create({
    data: {
      code: opts.code,
      name: opts.name,
      type: opts.type,
      subType: opts.subType,
      currency: opts.currency ?? "NGN",
      ownerId: opts.ownerId,
      providerCode: opts.providerCode,
    },
  });
}

export async function getAccount(code: string): Promise<any | null> {
  return db.ledgerAccount.findUnique({ where: { code } });
}

export async function getProviderClearingAccount(providerCode: string): Promise<any | null> {
  const code = PROVIDER_CLEARING_CODES[providerCode];
  if (!code) return null;
  return getAccount(code);
}

// ===== Journal Entry Processing =====

export interface JournalEntryInput {
  journalType: string;
  accountId: string;
  transactionId?: string;
  reference: string;
  currency: string;
  amount: number; // always positive
  debitCredit: "DEBIT" | "CREDIT";
  source?: string;
  destination?: string;
  provider?: string;
  metadata?: Record<string, unknown>;
}

export interface JournalPair {
  journalType?: string;
  debit: JournalEntryInput;
  credit: JournalEntryInput;
  pairId: string;
}

// Post a double-entry journal (debit + credit pair)
export async function postJournal(
  pair: JournalPair
): Promise<{ debitEntry: any; creditEntry: any; pairId: string }> {
  return db.$transaction(async (tx: any) => {
    // Validate accounting period is open
    const period = await getCurrentAccountingPeriod(tx);
    if (period && period.status === "CLOSED") {
      throw new Error(
        `Accounting period ${period.name} is closed. Post adjustment to current period.`
      );
    }

    // Create debit entry
    const debitEntry = await tx.journalEntry.create({
      data: {
        ...pair.debit,
        pairId: pair.pairId,
        status: "POSTED",
        accountingPeriodId: period?.id,
        metadata: pair.debit.metadata ? JSON.stringify(pair.debit.metadata) : null,
      },
    });

    // Create credit entry
    const creditEntry = await tx.journalEntry.create({
      data: {
        ...pair.credit,
        pairId: pair.pairId,
        status: "POSTED",
        accountingPeriodId: period?.id,
        metadata: pair.credit.metadata ? JSON.stringify(pair.credit.metadata) : null,
      },
    });

    // Update account balances
    await updateAccountBalance(
      tx,
      pair.debit.accountId,
      pair.debit.amount,
      "DEBIT",
      pair.journalType || pair.debit.journalType
    );
    await updateAccountBalance(
      tx,
      pair.credit.accountId,
      pair.credit.amount,
      "CREDIT",
      pair.journalType || pair.credit.journalType
    );

    return { debitEntry, creditEntry, pairId: pair.pairId };
  });
}

// Update account balance based on debit/credit and journal type
async function updateAccountBalance(
  tx: any,
  accountId: string,
  amount: number,
  debitCredit: string,
  journalType: string
): Promise<void> {
  const account = await tx.ledgerAccount.findUnique({ where: { id: accountId } });
  if (!account) throw new Error(`Account ${accountId} not found`);

  // For ASSET accounts: DEBIT increases, CREDIT decreases
  // For LIABILITY/REVENUE accounts: CREDIT increases, DEBIT decreases
  const isAsset = account.type === "ASSET" || account.type === "EXPENSE";
  const isIncrease = (isAsset && debitCredit === "DEBIT") || (!isAsset && debitCredit === "CREDIT");
  const delta = isIncrease ? amount : -amount;

  // Route to appropriate balance field based on journal type
  const balanceField = getBalanceFieldForJournalType(journalType);
  const updateData: any = { version: { increment: 1 } };
  updateData[balanceField] = { increment: delta };

  await tx.ledgerAccount.update({ where: { id: accountId }, data: updateData });
}

function getBalanceFieldForJournalType(journalType: string): string {
  switch (journalType) {
    case JournalType.SETTLEMENT:
      return "settlementBalance";
    case JournalType.FEE:
      return "feeBalance";
    case JournalType.ESCROW:
      return "reservedBalance";
    case JournalType.DEPOSIT:
    case JournalType.WITHDRAWAL:
    case JournalType.TRANSFER:
    case JournalType.REFUND:
    case JournalType.REVERSAL:
    case JournalType.CHARGEBACK:
    case JournalType.FX:
    case JournalType.INTEREST:
    case JournalType.ADJUSTMENT:
    default:
      return "availableBalance";
  }
}

// ===== Adjustment Entries (never edit) =====

export async function postAdjustment(opts: {
  accountId: string;
  amount: number;
  debitCredit: "DEBIT" | "CREDIT";
  reason: string;
  reference: string;
  currency?: string;
}): Promise<any> {
  const pairId = `adj-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const currency = opts.currency ?? "NGN";

  // Adjustment is a single-sided entry (contra goes to operational reserve)
  const reserveAccount = await getAccount("OPERATIONAL_RESERVE");

  return postJournal({
    pairId,
    journalType: JournalType.ADJUSTMENT,
    debit: {
      journalType: JournalType.ADJUSTMENT,
      accountId: opts.accountId,
      reference: opts.reference,
      currency,
      amount: opts.amount,
      debitCredit: opts.debitCredit,
      source: "ADMIN",
      metadata: { reason: opts.reason, type: "ADJUSTMENT" },
    },
    credit: {
      journalType: JournalType.ADJUSTMENT,
      accountId: reserveAccount?.id ?? opts.accountId,
      reference: opts.reference,
      currency,
      amount: opts.amount,
      debitCredit: opts.debitCredit === "DEBIT" ? "CREDIT" : "DEBIT",
      source: "ADMIN",
      metadata: { reason: opts.reason, type: "ADJUSTMENT_CONTRA" },
    },
  });
}

// ===== Balance Query =====

export async function getAccountBalance(accountId: string): Promise<{
  available: number;
  pending: number;
  reserved: number;
  settlement: number;
  fee: number;
  total: number;
}> {
  const account = await db.ledgerAccount.findUnique({ where: { id: accountId } });
  if (!account) return { available: 0, pending: 0, reserved: 0, settlement: 0, fee: 0, total: 0 };
  return {
    available: account.availableBalance,
    pending: account.pendingBalance,
    reserved: account.reservedBalance,
    settlement: account.settlementBalance,
    fee: account.feeBalance,
    total:
      account.availableBalance +
      account.pendingBalance +
      account.reservedBalance +
      account.settlementBalance,
  };
}

export async function getAccountEntries(accountId: string, limit = 50): Promise<any[]> {
  return db.journalEntry.findMany({
    where: { accountId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

// ===== Balance Snapshots =====

export async function createBalanceSnapshot(accountId: string): Promise<any> {
  const account = await db.ledgerAccount.findUnique({ where: { id: accountId } });
  if (!account) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return db.balanceSnapshot.upsert({
    where: { accountId_snapshotDate: { accountId, snapshotDate: today } },
    create: {
      accountId,
      currency: account.currency,
      availableBalance: account.availableBalance,
      pendingBalance: account.pendingBalance,
      reservedBalance: account.reservedBalance,
      settlementBalance: account.settlementBalance,
      feeBalance: account.feeBalance,
      snapshotDate: today,
    },
    update: {
      availableBalance: account.availableBalance,
      pendingBalance: account.pendingBalance,
      reservedBalance: account.reservedBalance,
      settlementBalance: account.settlementBalance,
      feeBalance: account.feeBalance,
    },
  });
}

export async function snapshotAllAccounts(): Promise<{ snapshotted: number }> {
  const accounts = await db.ledgerAccount.findMany({ where: { status: "ACTIVE" } });
  for (const account of accounts) {
    await createBalanceSnapshot(account.id);
  }
  return { snapshotted: accounts.length };
}

// ===== Accounting Periods =====

export async function getCurrentAccountingPeriod(tx?: any): Promise<any | null> {
  const client = tx ?? db;
  const now = new Date();
  return client.accountingPeriod.findFirst({
    where: {
      startDate: { lte: now },
      endDate: { gte: now },
      status: "OPEN",
    },
    orderBy: { startDate: "desc" },
  });
}

export async function createAccountingPeriod(opts: {
  name: string;
  type: string; // DAILY | MONTHLY | FISCAL_YEAR
  startDate: Date;
  endDate: Date;
}): Promise<any> {
  return db.accountingPeriod.create({ data: opts });
}

export async function closeAccountingPeriod(periodId: string, closedBy: string): Promise<any> {
  // Snapshot all accounts before closing
  const accounts = await db.ledgerAccount.findMany({ where: { status: "ACTIVE" } });
  for (const account of accounts) {
    await createBalanceSnapshot(account.id);
  }
  return db.accountingPeriod.update({
    where: { id: periodId },
    data: { status: "CLOSED", closedAt: new Date(), closedBy },
  });
}

export async function lockAccountingPeriod(periodId: string): Promise<any> {
  return db.accountingPeriod.update({
    where: { id: periodId },
    data: { status: "LOCKED" },
  });
}

// ===== Reconciliation Engine =====

export interface ReconciliationInput {
  providerCode?: string;
  periodStart: Date;
  periodEnd: Date;
  source: string; // PROVIDER_REPORT | BANK_STATEMENT | SETTLEMENT_REPORT
  entries: ReconciliationEntry[];
}

export interface ReconciliationEntry {
  reference: string;
  amount: number;
  currency: string;
  providerReference?: string;
  settledAt?: Date;
}

export async function runReconciliation(input: ReconciliationInput): Promise<any> {
  let matched = 0,
    missing = 0,
    duplicate = 0;
  let amountMismatch = 0,
    currencyMismatch = 0,
    referenceMismatch = 0;
  let settlementDelay = 0,
    feeDifference = 0;

  for (const entry of input.entries) {
    // Find matching ledger entry
    const ledgerEntry = await db.journalEntry.findFirst({
      where: {
        reference: entry.reference,
        currency: entry.currency,
        createdAt: { gte: input.periodStart, lte: input.periodEnd },
      },
    });

    if (!ledgerEntry) {
      missing++;
      continue;
    }

    // Check for duplicates
    const duplicates = await db.journalEntry.count({
      where: { reference: entry.reference },
    });
    if (duplicates > 1) duplicate++;

    // Amount match
    if (ledgerEntry.amount !== entry.amount) amountMismatch++;

    // Currency match
    if (ledgerEntry.currency !== entry.currency) currencyMismatch++;

    // Settlement delay
    if (entry.settledAt) {
      const delay = entry.settledAt.getTime() - ledgerEntry.createdAt.getTime();
      if (delay > 48 * 60 * 60 * 1000) settlementDelay++; // > 48h
    }
  }

  const status =
    missing + amountMismatch + currencyMismatch + settlementDelay + feeDifference > 0
      ? "ALERT"
      : "COMPLETED";

  return db.reconciliationRun.create({
    data: {
      providerCode: input.providerCode,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      source: input.source,
      totalChecked: input.entries.length,
      matched,
      missing,
      duplicate,
      amountMismatch,
      currencyMismatch,
      referenceMismatch,
      settlementDelay,
      feeDifference,
      status,
    },
  });
}

export async function getReconciliationRuns(limit = 20): Promise<any[]> {
  return db.reconciliationRun.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

// ===== Auto-initialize on import =====

let initialized = false;
export async function ensureFLEInitialized(): Promise<void> {
  if (initialized) return;
  initialized = true;
  try {
    await initializeChartOfAccounts();

    // Create today's accounting period if not exists
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    await db.accountingPeriod.upsert({
      where: { type_startDate: { type: "DAILY", startDate: today } },
      create: {
        name: today.toISOString().slice(0, 10),
        type: "DAILY",
        startDate: today,
        endDate: tomorrow,
      },
      update: {},
    });
  } catch (e) {
    console.error("[FLE] initialization failed:", e);
  }
}
