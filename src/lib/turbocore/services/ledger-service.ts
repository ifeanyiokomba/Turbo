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
    return debitWallet({
      userId: input.userId,
      amountKobo: input.amountKobo,
      refType: input.refType,
      refId: input.refId,
      pairId: input.pairId,
      description: input.description,
    });
  },

  /** List ledger entries for a user, newest first. Capped at `limit` (default 50, max 200). */
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
};
