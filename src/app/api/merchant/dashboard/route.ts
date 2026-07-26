import { db } from "@/lib/db";
import {
  json,
  handleError,
  requireUser,
  audit,
} from "@/lib/api";
import { TxDirection, TxStatus } from "@/lib/constants";
import { naira } from "@/lib/money";
import type { Merchant } from "@prisma/client";

/**
 * GET /api/merchant/dashboard
 * Returns the merchant dashboard aggregate for the signed-in user.
 *
 * "Consumer-as-merchant": the user.id IS the merchantId (matches the existing
 * pattern in /api/payment-links where merchantId = user.id). We also lazily
 * upsert a Merchant row (linked by email) so the user has a discoverable
 * merchant identity, but the dashboard logic keys off user.id throughout.
 */
export async function GET() {
  try {
    const user = await requireUser();

    // Lazily ensure a Merchant record exists (linked by email if present).
    // This is purely informational — the merchantId used elsewhere is user.id.
    let merchant: Merchant | null = null;
    if (user.email) {
      merchant = await db.merchant.findUnique({
        where: { email: user.email },
      });
      if (!merchant) {
        try {
          merchant = await db.merchant.create({
            data: {
              name: user.fullName,
              email: user.email,
              apiKeyPrefix: "tp_live_",
              webhookSecretHash: "scrypt$disabled$0",
              businessName: user.fullName,
              country: user.country || "NG",
              status: "ACTIVE",
            },
          });
          await audit({
            userId: user.id,
            action: "MERCHANT_AUTO_PROVISIONED",
            category: "WALLET",
            metadata: { merchantId: merchant.id, email: user.email },
          });
        } catch {
          // Email collision (race) — re-fetch
          merchant = await db.merchant.findUnique({
            where: { email: user.email },
          });
        }
      }
    }

    const merchantId = user.id;

    // Settlement balance — current wallet balance (revenue settled to wallet)
    const wallet = await db.wallet.findUnique({
      where: { userId: merchantId },
      select: { balanceKobo: true, currency: true, status: true },
    });

    // 30-day window
    const since30 = new Date();
    since30.setDate(since30.getDate() - 30);
    since30.setHours(0, 0, 0, 0);

    // Successful CREDIT transactions in last 30d = sales
    const salesTxns = await db.transaction.findMany({
      where: {
        userId: merchantId,
        direction: TxDirection.CREDIT,
        status: TxStatus.SUCCESS,
        createdAt: { gte: since30 },
      },
      select: {
        amountKobo: true,
        type: true,
        counterpartyName: true,
        counterpartyAccount: true,
        reference: true,
        createdAt: true,
      },
    });

    const totalSales = salesTxns.reduce((s, t) => s + t.amountKobo, 0);

    // 14-day sales trend (daily)
    const buckets: { date: string; label: string; sales: number; count: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      buckets.push({
        date: d.toISOString().slice(0, 10),
        label: d.toLocaleDateString("en-NG", { day: "numeric", month: "short" }),
        sales: 0,
        count: 0,
      });
    }
    const bucketMap = new Map(buckets.map((b) => [b.date, b]));
    for (const t of salesTxns) {
      const day = new Date(t.createdAt);
      day.setHours(0, 0, 0, 0);
      const key = day.toISOString().slice(0, 10);
      const b = bucketMap.get(key);
      if (b) {
        b.sales += t.amountKobo;
        b.count += 1;
      }
    }

    // Transaction count (30d, all SUCCESS)
    const txCount = await db.transaction.count({
      where: {
        userId: merchantId,
        status: TxStatus.SUCCESS,
        createdAt: { gte: since30 },
      },
    });

    // Active payment links
    const activeLinks = await db.paymentLink.count({
      where: { merchantId, status: "ACTIVE" },
    });

    const allLinks = await db.paymentLink.findMany({
      where: { merchantId },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        slug: true,
        title: true,
        amountMinor: true,
        currency: true,
        usesCount: true,
        status: true,
        createdAt: true,
      },
    });

    // Top customers — aggregate by counterpartyName over last 30d CREDIT txns
    const byCustomer: Record<
      string,
      { name: string; total: number; count: number; lastAt: string }
    > = {};
    for (const t of salesTxns) {
      const name = (t.counterpartyName || "Anonymous").trim() || "Anonymous";
      const entry = byCustomer[name] ?? {
        name,
        total: 0,
        count: 0,
        lastAt: t.createdAt.toISOString(),
      };
      entry.total += t.amountKobo;
      entry.count += 1;
      if (t.createdAt.toISOString() > entry.lastAt) entry.lastAt = t.createdAt.toISOString();
      byCustomer[name] = entry;
    }
    const topCustomers = Object.values(byCustomer)
      .sort((a, b) => b.total - a.total)
      .slice(0, 6)
      .map((c) => ({ ...c, totalDisplay: naira(c.total) }));

    await audit({
      userId: user.id,
      action: "MERCHANT_DASHBOARD_VIEWED",
      category: "WALLET",
    });

    return json({
      merchant: merchant
        ? {
            id: merchant.id,
            name: merchant.name,
            businessName: merchant.businessName,
            email: merchant.email,
            country: merchant.country,
            status: merchant.status,
          }
        : {
            id: merchantId,
            name: user.fullName,
            businessName: user.fullName,
            email: user.email,
            country: user.country,
            status: "ACTIVE",
          },
      stats: {
        totalSalesKobo: totalSales,
        transactionCount: txCount,
        activeLinks,
        settlementBalanceKobo: wallet?.balanceKobo ?? 0,
        walletStatus: wallet?.status ?? "ACTIVE",
        currency: wallet?.currency ?? "NGN",
      },
      salesTrend: buckets,
      topCustomers,
      recentLinks: allLinks,
    });
  } catch (e) {
    return handleError(e);
  }
}
