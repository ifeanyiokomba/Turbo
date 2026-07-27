// Turbopay double-entry ledger — atomic credit/debit/transfer with optimistic concurrency

import { db } from "@/lib/db";
import { EntryType, RefType } from "@/lib/constants";

export class LedgerError extends Error {}

async function getWalletForUpdate(tx: any, userId: string) {
  const wallet = await tx.wallet.findUnique({ where: { userId } });
  if (!wallet) throw new LedgerError("Wallet not found");
  if (wallet.status !== "ACTIVE") throw new LedgerError("Wallet is " + wallet.status.toLowerCase());
  return wallet;
}

/** Credit wallet — increases balance, writes a CREDIT ledger entry. Idempotent per refId+refType. */
export async function creditWallet(opts: {
  userId: string;
  amountKobo: number;
  refType: string;
  refId?: string;
  description: string;
  pairId?: string;
  tx?: typeof db;
}) {
  const t = opts.tx ?? db;
  if (opts.amountKobo <= 0) throw new LedgerError("Amount must be positive");
  const wallet = await getWalletForUpdate(t, opts.userId);
  const newBalance = wallet.balanceKobo + opts.amountKobo;
  const entry = await t.ledgerEntry.create({
    data: {
      walletId: wallet.id,
      userId: opts.userId,
      entryType: EntryType.CREDIT,
      amountKobo: opts.amountKobo,
      currency: wallet.currency,
      refType: opts.refType,
      refId: opts.refId ?? null,
      pairId: opts.pairId ?? null,
      balanceAfterKobo: newBalance,
      description: opts.description,
    },
  });
  await t.wallet.update({
    where: { id: wallet.id },
    data: { balanceKobo: newBalance, version: { increment: 1 } },
  });
  return { wallet, entry, newBalance };
}

/** Debit wallet — conditional update (balance >= amount), writes a DEBIT ledger entry. */
export async function debitWallet(opts: {
  userId: string;
  amountKobo: number;
  refType: string;
  refId?: string;
  description: string;
  pairId?: string;
  tx?: typeof db;
}) {
  const t = opts.tx ?? db;
  if (opts.amountKobo <= 0) throw new LedgerError("Amount must be positive");
  const wallet = await getWalletForUpdate(t, opts.userId);
  if (wallet.balanceKobo < opts.amountKobo) throw new LedgerError("Insufficient balance");

  // Optimistic conditional update — only succeeds if balance still covers
  const updated = await t.wallet.updateMany({
    where: { id: wallet.id, balanceKobo: { gte: opts.amountKobo }, status: "ACTIVE" },
    data: { balanceKobo: { decrement: opts.amountKobo }, version: { increment: 1 } },
  });
  if (updated.count === 0) throw new LedgerError("Insufficient balance (race)");

  const newBalance = wallet.balanceKobo - opts.amountKobo;
  const entry = await t.ledgerEntry.create({
    data: {
      walletId: wallet.id,
      userId: opts.userId,
      entryType: EntryType.DEBIT,
      amountKobo: opts.amountKobo,
      currency: wallet.currency,
      refType: opts.refType,
      refId: opts.refId ?? null,
      pairId: opts.pairId ?? null,
      balanceAfterKobo: newBalance,
      description: opts.description,
    },
  });
  return { wallet, entry, newBalance };
}

/** Transfer between two Turbopay wallets — atomic DEBIT + CREDIT pair. */
export async function transferBetweenWallets(opts: {
  fromUserId: string;
  toUserId: string;
  amountKobo: number;
  feeKobo?: number;
  description: string;
  refId: string;
}) {
  return db.$transaction(async (tx) => {
    const debit = await debitWallet({
      tx,
      userId: opts.fromUserId,
      amountKobo: opts.amountKobo + (opts.feeKobo ?? 0),
      refType: RefType.TRANSFER,
      refId: opts.refId,
      description: `Transfer to ${opts.toUserId} — ${opts.description}`,
    });
    const credit = await creditWallet({
      tx,
      userId: opts.toUserId,
      amountKobo: opts.amountKobo,
      refType: RefType.TRANSFER,
      refId: opts.refId,
      description: `Transfer from ${opts.fromUserId} — ${opts.description}`,
      pairId: debit.entry.id,
    });
    await tx.ledgerEntry.update({
      where: { id: debit.entry.id },
      data: { pairId: credit.entry.id },
    });
    if (opts.feeKobo && opts.feeKobo > 0) {
      await creditWallet({
        tx,
        userId: opts.fromUserId,
        amountKobo: opts.feeKobo,
        refType: RefType.FEE,
        refId: opts.refId,
        description: "Fee reversal (platform)",
      });
    }
    return { debit, credit };
  });
}

/** Reconcile wallet balance from ledger — recompute from credit/debit sum. */
export async function reconcileWallet(userId: string) {
  const entries = await db.ledgerEntry.findMany({ where: { userId } });
  let bal = 0;
  for (const e of entries) {
    if (e.entryType === EntryType.CREDIT) bal += e.amountKobo;
    else bal -= e.amountKobo;
  }
  await db.wallet.update({ where: { userId }, data: { balanceKobo: bal } });
  return bal;
}
