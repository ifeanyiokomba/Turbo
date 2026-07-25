// TurboCore — scheduled payment execution.
//
// A ScheduledPayment stores a frozen payload (recipient, amount, network,
// biller, etc.) and a frequency. This module executes the payload using
// the same debit/credit + Transaction creation logic as the user-facing
// /api/transfer, /api/airtime, /api/data, /api/bills routes — minus the
// PIN check (the user pre-authorized the schedule when they created it).
//
// After execution, the caller bumps runCount and recomputes nextRunAt
// via `computeNextRunAt`. On failure, failCount is bumped and — after
// 3 consecutive failures — the schedule is marked FAILED.

import { db } from "@/lib/db";
import { debitWallet, transferBetweenWallets, LedgerError } from "@/lib/ledger";
import { RefType, TxDirection, TxState, TxStatus, TxType } from "@/lib/constants";
import { generateReference } from "@/lib/money";
import { BILLERS, BANKS_BY_CODE } from "@/lib/banks";

export interface ScheduledRunResult {
  ok: boolean;
  reference?: string;
  error?: string;
}

interface TransferPayload {
  type: "TURBOPAY" | "BANK";
  recipient: string;
  bankCode?: string;
  amountKobo: number;
  note?: string;
}

interface AirtimePayload {
  network: string;
  phone: string;
  amountKobo: number;
}

interface DataPayload {
  network: string;
  phone: string;
  planId: string;
  planName?: string;
  amountKobo: number;
}

interface BillPayload {
  category: string;
  billerCode: string;
  billerName: string;
  customerRef: string;
  amountKobo: number;
}

const BANK_FEE_KOBO = 5250; // ₦52.50 — same as /api/transfer

/** Execute one scheduled payment. Idempotent per `scheduled.id` — we look
 * up the most recent Transaction with metadata.scheduledId; if one exists
 * for the current scheduled.nextRunAt window, we skip. */
export async function executeScheduledPayment(
  scheduledId: string,
  userId: string,
  type: string,
  payloadRaw: string,
): Promise<ScheduledRunResult> {
  let payload: any = {};
  try {
    payload = JSON.parse(payloadRaw || "{}");
  } catch {
    return { ok: false, error: "invalid payload JSON" };
  }

  // --- Idempotency guard: skip if we already ran for this schedule in the
  //     current run window (last 2 minutes). Prevents duplicate execution
  //     when the cron fires twice in quick succession.
  const twoMinAgo = new Date(Date.now() - 2 * 60_000);
  const dup = await db.transaction.findFirst({
    where: {
      userId,
      metadata: { contains: `"scheduledId":"${scheduledId}"` },
      createdAt: { gte: twoMinAgo },
    },
    select: { id: true },
  });
  if (dup) return { ok: true, reference: "duplicate-skipped" };

  try {
    switch (type) {
      case "TRANSFER":
        return await runTransfer(userId, scheduledId, payload as TransferPayload);
      case "AIRTIME":
        return await runAirtime(userId, scheduledId, payload as AirtimePayload);
      case "DATA":
        return await runData(userId, scheduledId, payload as DataPayload);
      case "BILL":
        return await runBill(userId, scheduledId, payload as BillPayload);
      default:
        return { ok: false, error: `unsupported scheduled type: ${type}` };
    }
  } catch (e) {
    if (e instanceof LedgerError) return { ok: false, error: e.message };
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

async function runTransfer(
  userId: string,
  scheduledId: string,
  p: TransferPayload,
): Promise<ScheduledRunResult> {
  if (!p.recipient || !p.amountKobo) return { ok: false, error: "missing recipient/amount" };
  const wallet = await db.wallet.findUnique({ where: { userId } });
  if (!wallet) return { ok: false, error: "wallet not found" };

  const reference = generateReference("STR"); // STR = scheduled transfer

  if (p.type === "TURBOPAY") {
    const recipientUser = await db.user.findFirst({
      where: {
        OR: [
          { username: p.recipient },
          { email: p.recipient },
          { phone: p.recipient },
        ],
      },
    });
    if (!recipientUser) return { ok: false, error: "recipient not found" };
    if (recipientUser.id === userId) return { ok: false, error: "self transfer" };

    const description = p.note || `Scheduled transfer to ${recipientUser.fullName}`;
    await transferBetweenWallets({
      fromUserId: userId,
      toUserId: recipientUser.id,
      amountKobo: p.amountKobo,
      feeKobo: 0,
      description,
      refId: reference,
    });

    await db.transaction.create({
      data: {
        userId,
        walletId: wallet.id,
        reference,
        type: TxType.TRANSFER,
        direction: TxDirection.DEBIT,
        amountKobo: p.amountKobo,
        feeKobo: 0,
        status: TxStatus.SUCCESS,
        state: TxState.SETTLED,
        counterpartyName: recipientUser.fullName,
        counterpartyAccount: recipientUser.username,
        counterpartyBank: "Turbopay MFB",
        description,
        provider: "turbopay",
        providerRef: reference,
        metadata: JSON.stringify({ scheduledId, scheduledType: "TRANSFER" }),
      },
    });
    return { ok: true, reference };
  }

  // BANK transfer
  if (!p.bankCode) return { ok: false, error: "missing bankCode" };
  const bank = BANKS_BY_CODE[p.bankCode];
  if (!bank) return { ok: false, error: "unknown bank" };

  const totalDebit = p.amountKobo + BANK_FEE_KOBO;
  const description = p.note || `Scheduled transfer to ${p.recipient} (${bank.name})`;
  await debitWallet({
    userId,
    amountKobo: totalDebit,
    refType: RefType.TRANSFER,
    refId: reference,
    description,
  });

  await db.transaction.create({
    data: {
      userId,
      walletId: wallet.id,
      reference,
      type: TxType.TRANSFER,
      direction: TxDirection.DEBIT,
      amountKobo: p.amountKobo,
      feeKobo: BANK_FEE_KOBO,
      status: TxStatus.SUCCESS,
      state: TxState.SETTLED,
      counterpartyAccount: p.recipient,
      counterpartyBank: bank.name,
      description,
      provider: "turbopay-payout",
      providerRef: reference,
      metadata: JSON.stringify({ scheduledId, scheduledType: "TRANSFER" }),
    },
  });
  return { ok: true, reference };
}

async function runAirtime(
  userId: string,
  scheduledId: string,
  p: AirtimePayload,
): Promise<ScheduledRunResult> {
  if (!p.network || !p.phone || !p.amountKobo) return { ok: false, error: "missing network/phone/amount" };
  const wallet = await db.wallet.findUnique({ where: { userId } });
  if (!wallet) return { ok: false, error: "wallet not found" };

  const reference = generateReference("SAR"); // SAR = scheduled airtime
  const description = `Scheduled airtime ${p.network} ${p.phone}`;
  await debitWallet({
    userId,
    amountKobo: p.amountKobo,
    refType: RefType.AIRTIME,
    refId: reference,
    description,
  });

  await db.$transaction([
    db.transaction.create({
      data: {
        userId,
        walletId: wallet.id,
        reference,
        type: TxType.AIRTIME,
        direction: TxDirection.DEBIT,
        amountKobo: p.amountKobo,
        feeKobo: 0,
        status: TxStatus.SUCCESS,
        state: TxState.SETTLED,
        counterpartyName: p.network,
        description,
        provider: p.network,
        providerRef: reference,
        metadata: JSON.stringify({ scheduledId, scheduledType: "AIRTIME" }),
      },
    }),
    db.airtimeDataPurchase.create({
      data: {
        userId,
        type: "AIRTIME",
        network: p.network,
        phone: p.phone,
        amountKobo: p.amountKobo,
        status: "SUCCESS",
        reference,
      },
    }),
  ]);
  return { ok: true, reference };
}

async function runData(
  userId: string,
  scheduledId: string,
  p: DataPayload,
): Promise<ScheduledRunResult> {
  if (!p.network || !p.phone || !p.planId || !p.amountKobo) {
    return { ok: false, error: "missing network/phone/plan/amount" };
  }
  const wallet = await db.wallet.findUnique({ where: { userId } });
  if (!wallet) return { ok: false, error: "wallet not found" };

  const reference = generateReference("SDA"); // SDA = scheduled data
  const description = `Scheduled data ${p.planName ?? p.planId} — ${p.network} ${p.phone}`;
  await debitWallet({
    userId,
    amountKobo: p.amountKobo,
    refType: RefType.DATA,
    refId: reference,
    description,
  });

  await db.$transaction([
    db.transaction.create({
      data: {
        userId,
        walletId: wallet.id,
        reference,
        type: TxType.DATA,
        direction: TxDirection.DEBIT,
        amountKobo: p.amountKobo,
        feeKobo: 0,
        status: TxStatus.SUCCESS,
        state: TxState.SETTLED,
        counterpartyName: p.network,
        description,
        provider: p.network,
        providerRef: reference,
        metadata: JSON.stringify({ scheduledId, scheduledType: "DATA" }),
      },
    }),
    db.airtimeDataPurchase.create({
      data: {
        userId,
        type: "DATA",
        network: p.network,
        phone: p.phone,
        amountKobo: p.amountKobo,
        planName: p.planName ?? p.planId,
        status: "SUCCESS",
        reference,
      },
    }),
  ]);
  return { ok: true, reference };
}

async function runBill(
  userId: string,
  scheduledId: string,
  p: BillPayload,
): Promise<ScheduledRunResult> {
  if (!p.category || !p.billerCode || !p.billerName || !p.customerRef || !p.amountKobo) {
    return { ok: false, error: "missing bill fields" };
  }
  const billers = (BILLERS as Record<string, { code: string; name: string }[] | undefined>)[p.category] ?? [];
  const biller = billers.find((b) => b.code === p.billerCode);
  if (!biller) return { ok: false, error: "invalid biller" };

  const wallet = await db.wallet.findUnique({ where: { userId } });
  if (!wallet) return { ok: false, error: "wallet not found" };

  const reference = generateReference("SBL"); // SBL = scheduled bill
  const description = `Scheduled bill — ${p.billerName} • ${p.customerRef}`;
  const isElectricity = p.category === "ELECTRICITY";
  const token = isElectricity
    ? Array.from({ length: 20 }, () => Math.floor(Math.random() * 10)).join("")
    : null;

  await debitWallet({
    userId,
    amountKobo: p.amountKobo,
    refType: RefType.BILL,
    refId: reference,
    description,
  });

  await db.$transaction([
    db.transaction.create({
      data: {
        userId,
        walletId: wallet.id,
        reference,
        type: TxType.BILL,
        direction: TxDirection.DEBIT,
        amountKobo: p.amountKobo,
        feeKobo: 0,
        status: TxStatus.SUCCESS,
        state: TxState.SETTLED,
        counterpartyName: p.billerName,
        description,
        provider: p.billerCode,
        providerRef: reference,
        metadata: JSON.stringify({
          scheduledId,
          scheduledType: "BILL",
          category: p.category,
          customerRef: p.customerRef,
          token,
        }),
      },
    }),
    db.billPayment.create({
      data: {
        userId,
        category: p.category,
        billerName: p.billerName,
        billerCode: p.billerCode,
        customerRef: p.customerRef,
        amountKobo: p.amountKobo,
        status: "SUCCESS",
        reference,
        token,
      },
    }),
  ]);
  return { ok: true, reference };
}

/** Compute the next run time for a schedule based on its frequency. */
export function computeNextRunAt(frequency: string, from = new Date()): Date | null {
  switch (frequency) {
    case "ONCE":
      return null; // caller should mark DONE
    case "DAILY":
      return new Date(from.getTime() + 24 * 60 * 60_000);
    case "WEEKLY":
      return new Date(from.getTime() + 7 * 24 * 60 * 60_000);
    case "MONTHLY":
      // Approximate — 30 days. Calendar-month math would require preserving
      // the original day-of-month, which is out of scope for the cron.
      return new Date(from.getTime() + 30 * 24 * 60 * 60_000);
    default:
      return null;
  }
}
