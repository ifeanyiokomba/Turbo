import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import {
  json,
  errorJson,
  handleError,
  requireUser,
  audit,
  getClientIp,
  getUserAgent,
  ServiceError,
} from "@/lib/api";
import { z } from "zod";

// Categories tracked by SpendingBudget. TOTAL aggregates every debit.
const BUDGET_CATEGORIES = new Set([
  "TOTAL",
  "TRANSFER",
  "AIRTIME",
  "DATA",
  "BILL",
  "CARD_FUND",
]);

const categoryTypes: Record<string, string[]> = {
  TOTAL: [],
  TRANSFER: ["TRANSFER"],
  AIRTIME: ["AIRTIME"],
  DATA: ["DATA"],
  BILL: ["BILL"],
  CARD_FUND: ["CARD_FUND"],
};

export const CATEGORY_LABELS: Record<string, string> = {
  TOTAL: "Total spending",
  TRANSFER: "Transfers",
  AIRTIME: "Airtime",
  DATA: "Data",
  BILL: "Bills",
  CARD_FUND: "Card funding",
};

function startOfMonthUTC(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

/**
 * GET /api/budgets
 * Returns user's budgets with current-month spend per category and alert flags.
 */
export async function GET() {
  try {
    const user = await requireUser();

    const periodStart = startOfMonthUTC();
    // Fetch all SUCCESS debits in this period once
    const txns = await db.transaction.findMany({
      where: {
        userId: user.id,
        direction: "DEBIT",
        status: "SUCCESS",
        createdAt: { gte: periodStart },
      },
      select: { type: true, amountKobo: true },
    });

    const spendByType: Record<string, number> = {};
    let totalSpent = 0;
    for (const t of txns) {
      spendByType[t.type] = (spendByType[t.type] ?? 0) + t.amountKobo;
      totalSpent += t.amountKobo;
    }

    const budgets = await db.spendingBudget.findMany({
      where: { userId: user.id },
      orderBy: [{ category: "asc" }],
    });

    const enriched = budgets.map((b) => {
      // Reset periodStart when calendar month rolls over
      const periodDate = new Date(b.periodStart);
      const sameMonth =
        periodDate.getUTCMonth() === periodStart.getUTCMonth() &&
        periodDate.getUTCFullYear() === periodStart.getUTCFullYear();
      const effectiveStart = sameMonth ? b.periodStart : periodStart;

      const types = categoryTypes[b.category] ?? [];
      const spent =
        b.category === "TOTAL"
          ? totalSpent
          : types.reduce((sum, t) => sum + (spendByType[t] ?? 0), 0);

      const pct =
        b.monthlyLimitKobo > 0
          ? Math.round((spent / b.monthlyLimitKobo) * 100)
          : 0;
      const overThreshold = b.alertThreshold > 0 && pct >= b.alertThreshold;
      const overBudget = b.monthlyLimitKobo > 0 && spent > b.monthlyLimitKobo;

      return {
        id: b.id,
        category: b.category,
        categoryLabel: CATEGORY_LABELS[b.category] ?? b.category,
        monthlyLimitKobo: b.monthlyLimitKobo,
        periodStart: effectiveStart,
        alertThreshold: b.alertThreshold,
        enabled: b.enabled,
        spentKobo: spent,
        pct,
        remainingKobo: Math.max(0, b.monthlyLimitKobo - spent),
        overThreshold,
        overBudget,
        createdAt: b.createdAt,
        updatedAt: b.updatedAt,
      };
    });

    return json({ budgets: enriched, periodStart });
  } catch (e) {
    return handleError(e);
  }
}

const createSchema = z.object({
  category: z
    .string()
    .refine((c) => BUDGET_CATEGORIES.has(c), "Invalid budget category"),
  monthlyLimitKobo: z
    .number()
    .int("monthlyLimitKobo must be an integer (kobo)")
    .min(1000, "Monthly limit must be at least ₦10 (1000 kobo)")
    .max(100_000_000_000, "Monthly limit too large"),
  alertThreshold: z
    .number()
    .int()
    .min(10, "Alert threshold must be at least 10%")
    .max(100, "Alert threshold cannot exceed 100%")
    .default(80),
  enabled: z.boolean().default(true),
});

/**
 * POST /api/budgets
 * Create or update (upsert) a budget for a category. One budget per category per user.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = await req.json().catch(() => ({}));
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return errorJson(
        parsed.error.issues[0]?.message ?? "Invalid budget payload",
        400,
        "VALIDATION",
      );
    }
    const { category, monthlyLimitKobo, alertThreshold, enabled } = parsed.data;
    const periodStart = startOfMonthUTC();

    const budget = await db.spendingBudget.upsert({
      where: { userId_category: { userId: user.id, category } },
      create: {
        userId: user.id,
        category,
        monthlyLimitKobo,
        alertThreshold,
        enabled,
        periodStart,
      },
      update: {
        monthlyLimitKobo,
        alertThreshold,
        enabled,
      },
    });

    await audit({
      userId: user.id,
      action: "BUDGET_SET",
      category: "BUDGET",
      severity: "INFO",
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      metadata: { budgetId: budget.id, category, monthlyLimitKobo, alertThreshold, enabled },
    });

    return json({ budget });
  } catch (e) {
    if (e instanceof ServiceError) return errorJson(e.message, e.statusCode, e.code);
    return handleError(e);
  }
}
