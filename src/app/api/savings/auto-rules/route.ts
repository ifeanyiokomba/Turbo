// Turbopay savings — auto-save rules
//
// GET  : list the user's auto-save rules.
// POST : create a new auto-save rule
//        body: { type: "ROUND_UP" | "PERCENTAGE" | "FIXED",
//                amountKobo: number,
//                productId: string,
//                frequency?: "DAILY" | "WEEKLY" | "MONTHLY" }
//
// Type semantics:
//   ROUND_UP   — round every debit transaction up to the nearest amountKobo
//                (e.g. 100 kobo-of-NGN = ₦1) and sweep the difference.
//   PERCENTAGE — save amountKobo% of every incoming credit.
//   FIXED      — save amountKobo on a schedule (frequency).

import { db } from "@/lib/db";
import {
  json,
  handleError,
  requireUser,
  audit,
  getClientIp,
  getUserAgent,
  ServiceError,
} from "@/lib/api";

export const dynamic = "force-dynamic";

const VALID_TYPES = new Set(["ROUND_UP", "PERCENTAGE", "FIXED"]);
const VALID_FREQUENCIES = new Set(["DAILY", "WEEKLY", "MONTHLY"]);
const VALID_ROUNDUP_UNITS = new Set([100, 500, 1000]); // ₦1 / ₦5 / ₦10

export async function GET() {
  try {
    const user = await requireUser();
    const rules = await db.autoSaveRule.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      include: { product: true },
    });
    return json({
      rules: rules.map((r) => ({
        id: r.id,
        type: r.type,
        amountKobo: r.amountKobo,
        productId: r.productId,
        productName: r.product.name,
        productInterestBps: r.product.interestBps,
        enabled: r.enabled,
        totalSavedKobo: r.totalSavedKobo,
        lastRunAt: r.lastRunAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = await req.json().catch(() => ({}));
    const type = String(body?.type ?? "").toUpperCase();
    const amountKobo = Math.round(Number(body?.amountKobo));
    const productId = String(body?.productId ?? "");
    const frequency = String(body?.frequency ?? "DAILY").toUpperCase();

    if (!VALID_TYPES.has(type)) {
      throw new ServiceError(
        "Type must be ROUND_UP, PERCENTAGE, or FIXED",
        400,
        "INVALID_TYPE",
      );
    }
    if (!productId) {
      throw new ServiceError("Select a savings product", 400, "MISSING_PRODUCT");
    }
    if (!Number.isFinite(amountKobo) || amountKobo <= 0) {
      throw new ServiceError("Enter a valid amount", 400, "INVALID_AMOUNT");
    }
    if (type === "ROUND_UP" && !VALID_ROUNDUP_UNITS.has(amountKobo)) {
      throw new ServiceError(
        "Round-up unit must be ₦1 (100), ₦5 (500) or ₦10 (1000)",
        400,
        "INVALID_ROUNDUP",
      );
    }
    if (type === "PERCENTAGE" && (amountKobo < 1 || amountKobo > 50)) {
      throw new ServiceError(
        "Percentage must be between 1% and 50%",
        400,
        "INVALID_PERCENT",
      );
    }
    if (type === "FIXED" && amountKobo < 1000) {
      throw new ServiceError(
        "Fixed amount must be at least ₦10",
        400,
        "INVALID_FIXED",
      );
    }
    if (!VALID_FREQUENCIES.has(frequency)) {
      throw new ServiceError(
        "Frequency must be DAILY, WEEKLY, or MONTHLY",
        400,
        "INVALID_FREQUENCY",
      );
    }

    // Verify the product exists.
    const product = await db.savingsProduct.findUnique({ where: { id: productId } });
    if (!product) {
      throw new ServiceError("Savings product not found", 404, "PRODUCT_NOT_FOUND");
    }

    // Cap the number of rules per user (avoid abuse).
    const existingCount = await db.autoSaveRule.count({ where: { userId: user.id } });
    if (existingCount >= 20) {
      throw new ServiceError(
        "You can have at most 20 auto-save rules",
        400,
        "TOO_MANY_RULES",
      );
    }

    const rule = await db.autoSaveRule.create({
      data: {
        userId: user.id,
        type,
        amountKobo,
        productId,
        enabled: true,
      },
    });

    await audit({
      userId: user.id,
      action: "AUTO_SAVE_RULE_CREATED",
      category: "SAVINGS",
      severity: "INFO",
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      metadata: {
        ruleId: rule.id,
        type,
        amountKobo,
        productId,
        frequency,
        productName: product.name,
      },
    });

    return json({
      id: rule.id,
      type: rule.type,
      amountKobo: rule.amountKobo,
      productId: rule.productId,
      enabled: rule.enabled,
      totalSavedKobo: rule.totalSavedKobo,
      lastRunAt: rule.lastRunAt?.toISOString() ?? null,
      createdAt: rule.createdAt.toISOString(),
    }, 201);
  } catch (e) {
    return handleError(e);
  }
}
