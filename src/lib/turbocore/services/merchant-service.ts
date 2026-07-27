// TurboCore Bounded Service — Merchant Service
//
// Thin facade over the Merchant + MerchantApiKey + PaymentLink +
// PaymentLinkPayment tables. Provides merchant dashboard aggregates,
// API key lifecycle (create/list/revoke), and payment link analytics.
//
// API keys are hashed at rest with scrypt (same scheme as passwords);
// the plaintext is returned exactly once at creation time.

import { db } from "@/lib/db";
import { randomBytes, randomInt } from "crypto";
import { hashPassword } from "@/lib/auth";
import { generateReference } from "@/lib/money";

export interface CreateApiKeyResult {
  id: string;
  name: string;
  prefix: string;
  plaintextKey: string; // shown once — caller must persist securely
  createdAt: Date;
}

export interface CreatePaymentLinkInput {
  merchantId: string;
  title: string;
  amountMinor?: number;
  currency?: string;
  maxUses?: number;
  expiresAt?: Date;
  metadata?: Record<string, unknown>;
}

export interface PaymentLinkAnalytics {
  paymentLinkId: string;
  title: string;
  status: string;
  totalPayments: number;
  successfulPayments: number;
  failedPayments: number;
  pendingPayments: number;
  totalAmountMinor: number;
  successfulAmountMinor: number;
  usesCount: number;
  maxUses: number;
}

export interface MerchantDashboard {
  merchant: any;
  paymentLinksCount: number;
  activePaymentLinksCount: number;
  apiKeysCount: number;
  activeApiKeysCount: number;
  paymentAggregates: {
    totalPayments: number;
    successfulPayments: number;
    totalAmountMinor: number;
    successfulAmountMinor: number;
  };
  recentPayments: any[];
}

function generateApiKey(): { plaintextKey: string; prefix: string } {
  // "tp_live_" + 32 hex chars
  const rand = randomBytes(24).toString("hex");
  const plaintextKey = `tp_live_${rand}`;
  const prefix = plaintextKey.slice(0, 12);
  return { plaintextKey, prefix };
}

function slugify(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const suffix = randomInt(1000, 9999).toString();
  return `${base || "pay"}-${suffix}`;
}

export const merchantService = {
  /**
   * Get a merchant dashboard. Merchants are linked to User via email
   * (Merchant.email === User.email). Returns the merchant record + payment
   * link/api-key counts + PaymentLinkPayment aggregates + recent payments.
   */
  async getDashboard(userId: string): Promise<MerchantDashboard | null> {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    if (!user?.email) return null;

    const merchant = await db.merchant.findUnique({
      where: { email: user.email },
    });
    if (!merchant) return null;

    // 1. Load the merchant's payment links (we need the IDs to filter payments
    //    — PaymentLinkPayment has no relation back to Merchant or PaymentLink).
    const paymentLinks = await db.paymentLink.findMany({
      where: { merchantId: merchant.id },
      select: { id: true, status: true },
    });
    const paymentLinkIds = paymentLinks.map((p) => p.id);

    // 2. Fan out: API keys, recent payments, and the success aggregate.
    const [apiKeys, recentPayments, successAgg] = await Promise.all([
      db.merchantApiKey.findMany({
        where: { merchantId: merchant.id },
        select: { id: true, revokedAt: true },
      }),
      db.paymentLinkPayment.findMany({
        where: paymentLinkIds.length > 0 ? { paymentLinkId: { in: paymentLinkIds } } : { id: "" },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      db.paymentLinkPayment.aggregate({
        _count: { id: true },
        _sum: { amountMinor: true },
        where:
          paymentLinkIds.length > 0
            ? { paymentLinkId: { in: paymentLinkIds }, status: "SUCCESS" }
            : { id: "" },
      }),
    ]);

    const successfulPayments = successAgg._count?.id ?? 0;
    const successfulAmountMinor = successAgg._sum?.amountMinor ?? 0;

    return {
      merchant,
      paymentLinksCount: paymentLinks.length,
      activePaymentLinksCount: paymentLinks.filter((p) => p.status === "ACTIVE").length,
      apiKeysCount: apiKeys.length,
      activeApiKeysCount: apiKeys.filter((k) => !k.revokedAt).length,
      paymentAggregates: {
        totalPayments: recentPayments.length,
        successfulPayments,
        totalAmountMinor: recentPayments.reduce((s, p) => s + p.amountMinor, 0),
        successfulAmountMinor,
      },
      recentPayments,
    };
  },

  /** Generate a new API key for the merchant. The plaintext is returned once. */
  async createApiKey(merchantId: string, name: string): Promise<CreateApiKeyResult> {
    const { plaintextKey, prefix } = generateApiKey();
    const keyHash = hashPassword(plaintextKey);
    const created = await db.merchantApiKey.create({
      data: {
        merchantId,
        keyHash,
        prefix,
        scopesJSON: JSON.stringify(["payments:read", "payments:write"]),
      },
    });
    return {
      id: created.id,
      name,
      prefix,
      plaintextKey,
      createdAt: created.createdAt,
    };
  },

  /** List API keys for a merchant (masked — only prefix shown, never the hash). */
  async listApiKeys(merchantId: string) {
    const keys = await db.merchantApiKey.findMany({
      where: { merchantId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        prefix: true,
        scopesJSON: true,
        lastUsedAt: true,
        revokedAt: true,
        createdAt: true,
      },
    });
    return keys.map((k) => ({
      ...k,
      scopes: (() => {
        try {
          return JSON.parse(k.scopesJSON) as string[];
        } catch {
          return [];
        }
      })(),
      scopesJSON: undefined,
      masked: `${k.prefix}••••`,
    }));
  },

  /** Revoke an API key (soft delete — sets revokedAt, keeps the row for audit). */
  async revokeApiKey(id: string) {
    return db.merchantApiKey.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
  },

  /** Create a payment link with a unique slug. */
  async createPaymentLink(input: CreatePaymentLinkInput) {
    let slug = slugify(input.title);
    // Ensure slug uniqueness — retry with a longer suffix on collision.
    while (await db.paymentLink.findUnique({ where: { slug } }).catch(() => null)) {
      slug = slugify(input.title) + randomInt(100, 999);
    }
    return db.paymentLink.create({
      data: {
        merchantId: input.merchantId,
        slug,
        title: input.title,
        amountMinor: input.amountMinor ?? null,
        currency: input.currency ?? "NGN",
        maxUses: input.maxUses ?? 0,
        expiresAt: input.expiresAt ?? null,
        status: "ACTIVE",
        metadataJSON: JSON.stringify(input.metadata ?? {}),
      },
    });
  },

  /** Aggregate payment analytics for a single payment link. */
  async getPaymentLinkAnalytics(id: string): Promise<PaymentLinkAnalytics | null> {
    const link = await db.paymentLink.findUnique({ where: { id: id } });
    if (!link) return null;

    const [aggByStatus, successAgg] = await Promise.all([
      db.paymentLinkPayment.groupBy({
        by: ["status"],
        _count: true,
        _sum: { amountMinor: true },
        where: { paymentLinkId: id },
      }),
      db.paymentLinkPayment.aggregate({
        _count: true,
        _sum: { amountMinor: true },
        where: { paymentLinkId: id },
      }),
    ]);

    const byStatus = new Map<string, { count: number; sum: number }>();
    for (const r of aggByStatus) {
      byStatus.set(r.status, {
        count: r._count,
        sum: r._sum.amountMinor ?? 0,
      });
    }

    const successful = byStatus.get("SUCCESS") ?? { count: 0, sum: 0 };
    const failed = byStatus.get("FAILED") ?? { count: 0, sum: 0 };
    const pending = byStatus.get("PENDING") ?? { count: 0, sum: 0 };

    return {
      paymentLinkId: link.id,
      title: link.title,
      status: link.status,
      totalPayments: successAgg._count,
      successfulPayments: successful.count,
      failedPayments: failed.count,
      pendingPayments: pending.count,
      totalAmountMinor: successAgg._sum.amountMinor ?? 0,
      successfulAmountMinor: successful.sum,
      usesCount: link.usesCount,
      maxUses: link.maxUses,
    };
  },
};
