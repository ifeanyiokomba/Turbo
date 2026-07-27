import { z } from "zod";
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

interface CreateLinkBody {
  title?: string;
  amountMinor?: number;
  currency?: string;
  maxUses?: number;
  expiresAt?: string;
  // New customization fields (P9-B)
  description?: string;
  successUrl?: string;
  cancelUrl?: string;
  themeColor?: string;
  logoUrl?: string;
  allowCustomAmount?: boolean;
}

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "pay"
  );
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8);
}

const VALID_THEMES = new Set([
  "#10b981",
  "#f59e0b",
  "#0ea5e9",
  "#8b5cf6",
  "#ef4444",
  "#ec4899",
  "#14b8a6",
  "#f97316",
  "#22c55e",
  "#6366f1",
]);

function parseMeta(s: string | null | undefined): Record<string, unknown> {
  if (!s) return {};
  try {
    const v = JSON.parse(s);
    return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * GET /api/payment-links
 * ?analytics=true — additionally computes per-link analytics (views, payments,
 * conversion, totalCollected) by joining PaymentLinkPayment aggregates.
 */
export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const url = new URL(req.url);
    const withAnalytics = url.searchParams.get("analytics") === "true";

    const links = await db.paymentLink.findMany({
      where: { merchantId: user.id },
      orderBy: { createdAt: "desc" },
    });

    if (!withAnalytics) {
      return json({ links });
    }

    const linkIds = links.map((l) => l.id);
    const payments = linkIds.length
      ? await db.paymentLinkPayment.findMany({
          where: { paymentLinkId: { in: linkIds } },
          select: {
            paymentLinkId: true,
            amountMinor: true,
            currency: true,
            status: true,
            createdAt: true,
          },
        })
      : [];

    const byLink = new Map<
      string,
      { views: number; payments: number; success: number; total: number; attempts: number }
    >();
    for (const p of payments) {
      const entry = byLink.get(p.paymentLinkId) ?? {
        views: 0,
        payments: 0,
        success: 0,
        total: 0,
        attempts: 0,
      };
      entry.attempts += 1;
      if (p.status === "SUCCESS") {
        entry.success += 1;
        entry.total += p.amountMinor;
      }
      byLink.set(p.paymentLinkId, entry);
    }

    const enriched = links.map((l) => {
      const meta = parseMeta(l.metadataJSON);
      const storedViews = typeof meta.views === "number" ? meta.views : 0;
      const agg = byLink.get(l.id) ?? { views: 0, payments: 0, success: 0, total: 0, attempts: 0 };
      const views = Math.max(storedViews, agg.attempts, l.usesCount);
      const successPayments = agg.success || l.usesCount;
      const conversion = views > 0 ? (successPayments / views) * 100 : 0;
      return {
        ...l,
        analytics: {
          views,
          paymentAttempts: agg.attempts,
          successfulPayments: successPayments,
          conversionRate: Number(conversion.toFixed(2)),
          totalCollectedMinor: agg.total || (l.amountMinor ?? 0) * l.usesCount,
          currency: l.currency,
        },
      };
    });

    return json({ links: enriched });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = (await req.json().catch(() => ({}))) as CreateLinkBody;

    const title = String(body.title ?? "").trim();
    if (!title || title.length < 3) {
      throw new ServiceError(
        "Give your link a descriptive title (min 3 chars)",
        400,
        "INVALID_TITLE"
      );
    }
    const currency = String(body.currency ?? "NGN").toUpperCase();
    const amountMinor =
      body.amountMinor === undefined || body.amountMinor === null
        ? null
        : Math.round(Number(body.amountMinor));
    if (amountMinor !== null && (!Number.isFinite(amountMinor) || amountMinor < 0)) {
      throw new ServiceError(
        "Invalid amount (must be ≥ 0; 0 means payer chooses)",
        400,
        "INVALID_AMOUNT"
      );
    }
    const maxUses = Math.max(0, Math.round(Number(body.maxUses ?? 0)));
    let expiresAt: Date | null = null;
    if (body.expiresAt) {
      const d = new Date(body.expiresAt);
      if (isNaN(d.getTime())) {
        throw new ServiceError("Invalid expiry date", 400, "INVALID_EXPIRY");
      }
      expiresAt = d;
    }

    // New customization fields
    const description = body.description ? String(body.description).trim().slice(0, 280) : null;
    const successUrl = body.successUrl ? String(body.successUrl).trim().slice(0, 500) : null;
    const cancelUrl = body.cancelUrl ? String(body.cancelUrl).trim().slice(0, 500) : null;
    let themeColor = String(body.themeColor ?? "#10b981").trim();
    if (!VALID_THEMES.has(themeColor.toLowerCase())) themeColor = "#10b981";
    const logoUrl = body.logoUrl ? String(body.logoUrl).trim().slice(0, 500) : null;
    const allowCustomAmount =
      body.allowCustomAmount === true || amountMinor === null || amountMinor === 0;

    for (const u of [successUrl, cancelUrl, logoUrl]) {
      if (u) {
        try {
          new URL(u);
        } catch {
          throw new ServiceError(`Invalid URL: ${u}`, 400, "INVALID_URL");
        }
      }
    }

    let slug = `${slugify(title)}-${randomSuffix()}`;
    let attempts = 0;
    while (await db.paymentLink.findUnique({ where: { slug } })) {
      slug = `${slugify(title)}-${randomSuffix()}`;
      attempts++;
      if (attempts > 5) {
        slug = `${slugify(title)}-${Date.now().toString(36)}`;
        break;
      }
    }

    const metadata = {
      creatorUserId: user.id,
      creatorName: user.fullName,
      description,
      successUrl,
      cancelUrl,
      themeColor,
      logoUrl,
      allowCustomAmount,
      views: 0,
    };

    const link = await db.paymentLink.create({
      data: {
        merchantId: user.id,
        slug,
        title,
        amountMinor: amountMinor ?? 0,
        currency,
        maxUses,
        usesCount: 0,
        expiresAt,
        status: "ACTIVE",
        metadataJSON: JSON.stringify(metadata),
      },
    });

    await audit({
      userId: user.id,
      action: "PAYMENT_LINK_CREATE",
      category: "WALLET",
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      metadata: {
        linkId: link.id,
        slug,
        title,
        currency,
        amountMinor,
        hasDescription: !!description,
        hasTheme: themeColor !== "#10b981",
        hasLogo: !!logoUrl,
        allowCustomAmount,
      },
    });

    return json({ link });
  } catch (e) {
    return handleError(e);
  }
}
