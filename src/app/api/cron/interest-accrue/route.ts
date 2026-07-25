// Turbopay cron — daily savings interest accrual
//
// Accrues daily interest on every active (user, product) savings balance.
// Interest is computed against the latest balanceAfterKobo per pair using
// the product's interestBps (basis points per annum) divided over 365 days.
// Interest is only written when it rounds to at least 1 kobo (anti-dust).
// The wallet is NOT touched — interest accrues inside the savings balance
// and is credited to the wallet on withdrawal.
//
// Protection: x-cron-secret header compared to process.env.CRON_SECRET
// (falls back to "dev-cron-secret" only in non-production environments).

import { db } from "@/lib/db";
import { json, handleError } from "@/lib/api";
import { generateReference } from "@/lib/money";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const secret =
      process.env.CRON_SECRET ??
      (process.env.NODE_ENV === "production" ? null : "dev-cron-secret");
    const headerSecret = req.headers.get("x-cron-secret");
    if (!secret || !headerSecret || headerSecret !== secret) {
      return json({ error: "Unauthorized" }, 401);
    }

    const startedAt = new Date().toISOString();
    console.log(`[cron:interest-accrue] start at ${startedAt}`);

    // 1) Discover active (userId, productId) pairs by reading the latest
    //    SavingsTransaction for each distinct pair. Prisma `distinct` picks
    //    the first row per group when ordered, so ordering by createdAt desc
    //    yields the latest balance per pair in a single round-trip.
    const latestPerPair = await db.savingsTransaction.findMany({
      distinct: ["userId", "productId"],
      orderBy: { createdAt: "desc" },
      include: { product: true },
    });

    // 2) Group by user — keep only pairs whose latest balance > 0.
    //    We also stash interestBps so we don't need to re-fetch the product
    //    inside the per-user transaction (small perf win, avoids extra reads).
    type Pair = {
      productId: string;
      interestBps: number;
      balanceKobo: number;
    };
    const byUser = new Map<string, Pair[]>();
    for (const tx of latestPerPair) {
      if (tx.balanceAfterKobo <= 0) continue;
      if (!tx.product || tx.product.interestBps <= 0) continue;
      const list = byUser.get(tx.userId) ?? [];
      list.push({
        productId: tx.productId,
        interestBps: tx.product.interestBps,
        balanceKobo: tx.balanceAfterKobo,
      });
      byUser.set(tx.userId, list);
    }

    console.log(
      `[cron:interest-accrue] ${byUser.size} users with active savings`,
    );

    let processed = 0;
    let totalAccrued = 0;
    const errors: string[] = [];

    // 3) For each user, run an atomic transaction that re-reads the latest
    //    balance (defends against concurrent deposits/withdrawals) and writes
    //    an INTEREST row per product. Skipping inside the tx is safe — we
    //    simply don't write a row.
    for (const [userId, pairs] of byUser) {
      try {
        await db.$transaction(async (tx) => {
          for (const pair of pairs) {
            const latest = await tx.savingsTransaction.findFirst({
              where: { userId, productId: pair.productId },
              orderBy: { createdAt: "desc" },
            });
            const prevBalance = latest?.balanceAfterKobo ?? 0;
            if (prevBalance <= 0) continue;

            // daily interest = balance * (bps / 10000) / 365
            // floor to whole kobo to keep Int storage honest
            const interest = Math.floor(
              (prevBalance * pair.interestBps) / 10000 / 365,
            );
            if (interest <= 0 || interest < 1) continue; // dust guard

            await tx.savingsTransaction.create({
              data: {
                userId,
                productId: pair.productId,
                type: "INTEREST",
                amountKobo: interest,
                balanceAfterKobo: prevBalance + interest,
                status: "SUCCESS",
                reference: generateReference("INT"),
              },
            });

            processed += 1;
            totalAccrued += interest;
          }
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[cron:interest-accrue] user ${userId} failed:`, msg);
        errors.push(`${userId}: ${msg}`);
      }
    }

    const finishedAt = new Date().toISOString();
    console.log(
      `[cron:interest-accrue] done at ${finishedAt} — processed=${processed} totalAccrued=${totalAccrued} kobo errors=${errors.length}`,
    );

    return json({
      processed,
      totalAccrued,
      users: byUser.size,
      errors: errors.length,
      startedAt,
      finishedAt,
    });
  } catch (e) {
    return handleError(e);
  }
}
