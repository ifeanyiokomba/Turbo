// Turbopay admin — settlement dashboard
//
// GET: list Settlement rows + SettlementAccount rows grouped per provider.
//      Supports `?providerCode=` and `?status=` filters on Settlement.

import { db } from "@/lib/db";
import { json, handleError, requireAdmin } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requireAdmin();
    const url = new URL(req.url);
    const providerCode = url.searchParams.get("providerCode");
    const status = url.searchParams.get("status")?.trim().toUpperCase();
    const settleWhere: Record<string, unknown> = {};
    if (providerCode) settleWhere.providerCode = providerCode;
    if (status) settleWhere.status = status;

    const [settlements, accounts, totalsByProvider] = await Promise.all([
      db.settlement.findMany({
        where: settleWhere,
        orderBy: { createdAt: "desc" },
        take: 200,
      }),
      db.settlementAccount.findMany({
        orderBy: [{ providerCode: "asc" }, { isDefault: "desc" }],
      }),
      db.settlement.groupBy({
        by: ["providerCode", "status"],
        _sum: { expectedMinor: true, settledMinor: true },
        _count: { _all: true },
      }),
    ]);

    return json({
      settlements: settlements.map((s) => ({
        id: s.id,
        providerCode: s.providerCode,
        periodStart: s.periodStart,
        periodEnd: s.periodEnd,
        expectedMinor: s.expectedMinor,
        settledMinor: s.settledMinor,
        currency: s.currency,
        status: s.status,
        settledAt: s.settledAt,
        createdAt: s.createdAt,
      })),
      accounts: accounts.map((a) => ({
        id: a.id,
        providerCode: a.providerCode,
        accountName: a.accountName,
        accountNumber: a.accountNumber,
        bankCode: a.bankCode,
        bankName: a.bankName,
        currency: a.currency,
        isDefault: a.isDefault,
        createdAt: a.createdAt,
      })),
      totalsByProvider: totalsByProvider.map((t) => ({
        providerCode: t.providerCode,
        status: t.status,
        expectedMinor: t._sum.expectedMinor ?? 0,
        settledMinor: t._sum.settledMinor ?? 0,
        count: t._count._all,
      })),
    });
  } catch (e) {
    return handleError(e);
  }
}
