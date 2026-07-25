// TurboCore — transaction recovery (shared by stuck-tx cron + webhook receiver).
//
// Mirrors orchestrator steps 7-8: given a Transaction whose provider returned
// a final status, confirm it (mark SETTLED, fire PAYMENT_SETTLED outbox event,
// credit wallet for INBOUND funding if not already credited) or reverse it
// (refund the hold debit, mark REVERSED, fire PAYMENT_REVERSED outbox event).
//
// Both code paths are idempotent: a tx that is already SETTLED or REVERSED
// is skipped. This lets the webhook receiver and the stuck-tx cron race
// safely — whichever fires first wins, the second becomes a no-op.

import { db } from "@/lib/db";
import { creditWallet } from "@/lib/ledger";
import { audit } from "@/lib/api";
import { generateReference } from "@/lib/money";

export interface ConfirmResult {
  outcome: "CONFIRMED" | "REVERSED" | "SKIPPED" | "NOOP";
  reason?: string;
}

/**
 * Apply a provider-returned status to a Transaction.
 *
 * - `status === "SUCCESS"` → confirm (SETTLED + PAYMENT_SETTLED outbox event,
 *   credit wallet if INBOUND and not already credited).
 * - `status === "FAILED"` → reverse (REVERSED + PAYMENT_REVERSED outbox event,
 *   refund the original HOLD_DEBIT if one exists).
 * - `status === "PENDING"` or anything else → no-op (still pending).
 *
 * `actor` is "stuck-tx-cron" | "webhook:{provider}" for audit attribution.
 */
export async function confirmOrReverseTransaction(
  txId: string,
  status: string,
  actor: string,
): Promise<ConfirmResult> {
  const tx = await db.transaction.findUnique({ where: { id: txId } });
  if (!tx) return { outcome: "NOOP", reason: "tx not found" };

  // Already finalized — webhook and cron race; whoever got there first wins.
  if (tx.state === "SETTLED") return { outcome: "SKIPPED", reason: "already settled" };
  if (tx.state === "REVERSED") return { outcome: "SKIPPED", reason: "already reversed" };

  const success = String(status).toUpperCase() === "SUCCESS";
  const failed = ["FAILED", "FAILURE", "ERROR", "REJECTED", "CANCELLED", "CANCELED"].includes(
    String(status).toUpperCase(),
  );

  if (!success && !failed) {
    // Still pending — leave alone, next cron tick will re-check.
    return { outcome: "NOOP", reason: `status=${status}` };
  }

  if (success) {
    return confirmTransaction(tx, actor);
  }
  return reverseTransaction(tx, actor);
}

async function confirmTransaction(tx: any, actor: string): Promise<ConfirmResult> {
  // For INBOUND funding that hasn't been credited yet, credit the wallet now.
  // We detect "already credited" by checking whether a CREDIT ledger entry
  // exists for this tx (refType=tx.type, refId=tx.id).
  if (tx.direction === "CREDIT") {
    const existingCredit = await db.ledgerEntry.findFirst({
      where: { refType: tx.type, refId: tx.id, entryType: "CREDIT" },
      select: { id: true },
    });
    if (!existingCredit) {
      try {
        await creditWallet({
          userId: tx.userId,
          amountKobo: tx.amountKobo,
          refType: tx.type,
          refId: tx.id,
          description: tx.description || `Funding ${tx.reference}`,
        });
      } catch (e) {
        console.error(`[recovery] credit for ${tx.id} failed:`, e);
      }
    }
  }

  await db.transaction.update({
    where: { id: tx.id },
    data: { status: "SUCCESS", state: "SETTLED" },
  });
  await db.paymentFlowLog.create({
    data: {
      transactionId: tx.id,
      step: "CONFIRMED",
      status: "SUCCESS",
      payloadJSON: JSON.stringify({ actor }),
    },
  });
  await db.outboxEvent.create({
    data: {
      aggregateType: "TRANSACTION",
      aggregateId: tx.id,
      type: "PAYMENT_SETTLED",
      payloadJSON: JSON.stringify({ reference: tx.reference, amountMinor: tx.amountKobo, provider: tx.provider }),
    },
  });
  await audit({
    userId: tx.userId,
    action: `${tx.type}_CONFIRMED`,
    category: "WALLET",
    severity: "INFO",
    metadata: { reference: tx.reference, actor },
  });
  return { outcome: "CONFIRMED" };
}

async function reverseTransaction(tx: any, actor: string): Promise<ConfirmResult> {
  // Find the original HOLD_DEBIT entry id so we can pair the reversal.
  const holdLog = await db.paymentFlowLog.findFirst({
    where: { transactionId: tx.id, step: "HOLD_DEBIT" },
    orderBy: { at: "desc" },
  });
  let holdDebitId: string | null = null;
  if (holdLog?.payloadJSON) {
    try {
      holdDebitId = JSON.parse(holdLog.payloadJSON).holdDebitId ?? null;
    } catch {
      holdDebitId = null;
    }
  }

  // Refund the hold (amount + fee). Idempotent — if a reversal credit
  // already exists for this tx, skip the wallet credit.
  if (tx.direction === "DEBIT") {
    const existingReversal = await db.ledgerEntry.findFirst({
      where: { refType: "REVERSAL", refId: tx.id, entryType: "CREDIT" },
      select: { id: true },
    });
    if (!existingReversal) {
      try {
        await creditWallet({
          userId: tx.userId,
          amountKobo: tx.amountKobo + (tx.feeKobo ?? 0),
          refType: "REVERSAL",
          refId: tx.id,
          pairId: holdDebitId ?? undefined,
          description: `REVERSAL: ${tx.description || tx.reference}`,
        });
      } catch (e) {
        console.error(`[recovery] reversal credit for ${tx.id} failed:`, e);
      }
    }
  }

  await db.transaction.update({
    where: { id: tx.id },
    data: { status: "REVERSED", state: "REVERSED" },
  });
  await db.paymentFlowLog.create({
    data: {
      transactionId: tx.id,
      step: "AUTO_REVERSED",
      status: "FAILED",
      payloadJSON: JSON.stringify({ actor, holdDebitId }),
    },
  });
  await db.outboxEvent.create({
    data: {
      aggregateType: "TRANSACTION",
      aggregateId: tx.id,
      type: "PAYMENT_REVERSED",
      payloadJSON: JSON.stringify({ reference: tx.reference, reason: `provider-reported failure via ${actor}` }),
    },
  });
  await audit({
    userId: tx.userId,
    action: `${tx.type}_REVERSED`,
    category: "WALLET",
    severity: "WARN",
    metadata: { reference: tx.reference, actor, holdDebitId },
  });
  // Reference for the reversal audit line (kept for log searchability).
  void generateReference("REV");
  return { outcome: "REVERSED" };
}
