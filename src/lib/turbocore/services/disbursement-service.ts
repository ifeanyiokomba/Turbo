// TurboCore Bounded Service — Disbursement Service
//
// Thin facade over TurboPay.pay() for OUTBOUND (money-out) flows plus
// read-side queries for disbursement history. Every disbursement goes
// through the orchestrator (route → hold debit → provider call →
// confirm/reverse), so AML, sanctions, KYC tier, failover and idempotency
// are all enforced.
//
// Supported disbursement types: TRANSFER (bank/Turbopay), AIRTIME, DATA,
// BILL, CARD_FUND (wallet→card), MOBILE_MONEY, INTERNATIONAL, SAVINGS, INVESTMENT.

import { db } from "@/lib/db";
import { pay, type TurboPayRequest, type TurboPayResult } from "@/lib/turbopay/pay";
import { generateReference } from "@/lib/money";

export type DisbursementRequest = Omit<TurboPayRequest, "direction">;

export const disbursementService = {
  /** Initiate an outbound disbursement via TurboPay.pay() (direction=OUTBOUND). */
  async disburse(request: DisbursementRequest): Promise<TurboPayResult> {
    return pay({
      ...request,
      reference: request.reference ?? generateReference("DIS"),
      direction: "OUTBOUND",
    });
  },

  /** Look up a disbursement by its transaction reference. */
  async getDisbursement(reference: string) {
    return db.transaction.findUnique({ where: { reference } });
  },

  /** Paginated list of outbound (DEBIT) transactions for a user. Page is 1-indexed. */
  async listDisbursements(userId: string, page = 1) {
    const pageSize = 20;
    const skip = (Math.max(page, 1) - 1) * pageSize;
    const [items, total] = await Promise.all([
      db.transaction.findMany({
        where: { userId, direction: "DEBIT" },
        orderBy: { createdAt: "desc" },
        take: pageSize,
        skip,
      }),
      db.transaction.count({ where: { userId, direction: "DEBIT" } }),
    ]);
    return { items, total, page, pageSize };
  },
};
