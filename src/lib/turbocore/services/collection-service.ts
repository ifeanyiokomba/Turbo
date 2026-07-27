// TurboCore Bounded Service — Collection Service
//
// Thin facade over TurboPay.pay() for INBOUND (money-in) flows plus
// read-side queries for collection history. Every collection goes through
// the orchestrator (route → hold → provider call → confirm/reverse), so
// AML, sanctions, KYC tier, failover and idempotency are all enforced.
//
// Supported collection types: FUNDING (card/bank transfer into wallet),
// MOBILE_MONEY (STK push), PAYMENT_LINK, MERCHANT, TRANSFER (Turbopay→Turbopay).

import { db } from "@/lib/db";
import { pay, type TurboPayRequest, type TurboPayResult } from "@/lib/turbopay/pay";
import { generateReference } from "@/lib/money";

export type CollectionRequest = Omit<TurboPayRequest, "direction">;

export const collectionService = {
  /** Initiate an inbound collection via TurboPay.pay() (direction=INBOUND). */
  async collect(request: CollectionRequest): Promise<TurboPayResult> {
    return pay({
      ...request,
      reference: request.reference ?? generateReference("COL"),
      direction: "INBOUND",
    });
  },

  /** Look up a collection by its transaction reference. */
  async verifyPayment(reference: string) {
    return db.transaction.findUnique({ where: { reference } });
  },

  /** Paginated list of inbound (CREDIT) transactions for a user. Page is 1-indexed. */
  async listCollections(userId: string, page = 1) {
    const pageSize = 20;
    const skip = (Math.max(page, 1) - 1) * pageSize;
    const [items, total] = await Promise.all([
      db.transaction.findMany({
        where: { userId, direction: "CREDIT" },
        orderBy: { createdAt: "desc" },
        take: pageSize,
        skip,
      }),
      db.transaction.count({ where: { userId, direction: "CREDIT" } }),
    ]);
    return { items, total, page, pageSize };
  },
};
