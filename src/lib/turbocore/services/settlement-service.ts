// TurboCore Bounded Service — Settlement Service
//
// Thin facade over the Settlement + SettlementAccount tables. Settlements
// represent the platform's expected vs actual payouts from each provider
// for a given period — used by the finance team to reconcile.
//
// Note: provider settlement reports are pulled via each provider's adapter
// (settle()/reconcile() on IProviderPlugin). This service is the read side
// for the persisted settlement rows + the reconciliation comparison.

import { db } from "@/lib/db";

export interface ReconcileResult {
  provider: string;
  periodStart: Date;
  periodEnd: Date;
  expectedMinor: number;
  settledMinor: number;
  differenceMinor: number;
  status: "MATCHED" | "MISMATCH" | "MISSING";
  settlementRows: number;
}

export const settlementService = {
  /** List settlement rows, optionally filtered by provider. Newest first. */
  async listSettlements(provider?: string) {
    return db.settlement.findMany({
      where: provider ? { providerCode: provider } : undefined,
      orderBy: { createdAt: "desc" },
    });
  },

  /** List settlement accounts (bank accounts providers pay into), optional provider filter. */
  async listAccounts(provider?: string) {
    return db.settlementAccount.findMany({
      where: provider ? { providerCode: provider } : undefined,
      orderBy: { createdAt: "desc" },
    });
  },

  /**
   * Reconcile a provider's expected vs settled amount for a period.
   *
   * "Expected" = sum of amountKobo for SUCCESS transactions routed through
   *              this provider in [periodStart, periodEnd].
   * "Settled"   = sum of settledMinor across Settlement rows for this
   *              provider overlapping the period.
   *
   * Status is MATCHED when the difference is 0, MISMATCH when nonzero, and
   * MISSING when there are no settlement rows at all.
   */
  async reconcile(provider: string, period: { start: Date; end: Date }): Promise<ReconcileResult> {
    const [txAgg, settlements] = await Promise.all([
      db.transaction.aggregate({
        _sum: { amountKobo: true },
        where: {
          provider,
          status: "SUCCESS",
          createdAt: { gte: period.start, lte: period.end },
        },
      }),
      db.settlement.findMany({
        where: {
          providerCode: provider,
          periodStart: { gte: period.start },
          periodEnd: { lte: period.end },
        },
      }),
    ]);

    const expectedMinor = txAgg._sum.amountKobo ?? 0;
    const settledMinor = settlements.reduce((sum, s) => sum + s.settledMinor, 0);
    const differenceMinor = expectedMinor - settledMinor;

    let status: ReconcileResult["status"] = "MATCHED";
    if (settlements.length === 0) status = "MISSING";
    else if (differenceMinor !== 0) status = "MISMATCH";

    return {
      provider,
      periodStart: period.start,
      periodEnd: period.end,
      expectedMinor,
      settledMinor,
      differenceMinor,
      status,
      settlementRows: settlements.length,
    };
  },
};
