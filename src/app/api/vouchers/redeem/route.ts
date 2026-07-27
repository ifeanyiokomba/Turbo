// Turbopay — Voucher redemption API
//
// POST {code, pin} :
//   - requireUser + verifyPin (transactional)
//   - find voucher by code (uppercase)
//   - validate: ACTIVE, validFrom <= now, validUntil null/>= now,
//     redemptionsCount < maxRedemptions (when maxRedemptions > 0),
//     user hasn't exceeded perUserLimit
//   - For CASHBACK: creditWallet(valueKobo) + Transaction{type:REWARD, direction:CREDIT}
//     + VoucherRedemption{valueAppliedKobo: valueKobo}
//   - For FEE_WAIVER / PERCENT_OFF / FLAT_OFF / DISCOUNT: just record VoucherRedemption
//     with valueAppliedKobo = valueKobo (FLAT_OFF/DISCOUNT) or percentOff (PERCENT_OFF)
//     or 0 (FEE_WAIVER). These are intended to be applied at checkout later.
//   - Increment voucher.redemptionsCount, audit, return {redemption, valueApplied, newBalance}.
//
// Implementation note: the wallet credit runs OUTSIDE the prisma $transaction (the
// ledger module's `creditWallet` types `tx?: typeof db`, and the tx-client inside
// `$transaction(async tx => …)` is a narrower Omit<PrismaClient,…> type). This
// matches the pattern in cards/[id]/fund/route.ts. We pre-validate hard before
// crediting and reverse the credit on the rare redemption-insert race.

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import {
  json,
  errorJson,
  handleError,
  requireUser,
  verifyPin,
  audit,
  getClientIp,
  getUserAgent,
  ServiceError,
} from "@/lib/api";
import { creditWallet, debitWallet, LedgerError } from "@/lib/ledger";
import { RefType, TxType, TxDirection, TxStatus, TxState } from "@/lib/constants";
import { generateReference } from "@/lib/money";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = await req.json().catch(() => ({}));
    const code = String(body?.code ?? "")
      .trim()
      .toUpperCase();
    const pin = String(body?.pin ?? "");

    if (!code) throw new ServiceError("Voucher code is required", 400, "CODE_REQUIRED");
    if (!/^[A-Z0-9\-]{4,40}$/.test(code))
      throw new ServiceError("Invalid voucher code format", 400, "INVALID_CODE");
    if (!pin) throw new ServiceError("PIN is required", 400, "PIN_REQUIRED");

    const voucher = await db.voucher.findUnique({ where: { code } });
    if (!voucher) throw new ServiceError("Voucher not found", 404, "VOUCHER_NOT_FOUND");

    // Validation
    const now = new Date();
    if (voucher.status !== "ACTIVE")
      throw new ServiceError(
        voucher.status === "DISABLED" ? "Voucher is disabled" : "Voucher is expired",
        400,
        "VOUCHER_INACTIVE"
      );
    if (voucher.validFrom && voucher.validFrom > now)
      throw new ServiceError("Voucher is not yet active", 400, "VOUCHER_NOT_STARTED");
    if (voucher.validUntil && voucher.validUntil < now)
      throw new ServiceError("Voucher has expired", 400, "VOUCHER_EXPIRED");
    if (voucher.maxRedemptions > 0 && voucher.redemptionsCount >= voucher.maxRedemptions)
      throw new ServiceError("Voucher redemption limit reached", 400, "MAX_REDEMPTIONS_REACHED");

    const userRedemptions = await db.voucherRedemption.count({
      where: { voucherId: voucher.id, userId: user.id },
    });
    if (userRedemptions >= Math.max(1, voucher.perUserLimit))
      throw new ServiceError("You have already redeemed this voucher", 400, "ALREADY_REDEEMED");

    // Verify PIN *after* cheap validation, *before* any wallet write
    await verifyPin(user, pin);

    // Compute valueAppliedKobo based on type
    let valueAppliedKobo = 0;
    let isCashback = false;
    if (voucher.type === "CASHBACK") {
      if (voucher.valueKobo <= 0)
        throw new ServiceError("Cashback voucher has no value", 400, "VOUCHER_NO_VALUE");
      valueAppliedKobo = voucher.valueKobo;
      isCashback = true;
    } else if (voucher.type === "FLAT_OFF" || voucher.type === "DISCOUNT") {
      valueAppliedKobo = voucher.valueKobo;
    } else if (voucher.type === "PERCENT_OFF") {
      // No purchase amount here; store percentOff so the UI can surface "X% off".
      valueAppliedKobo = voucher.percentOff;
    } else if (voucher.type === "FEE_WAIVER") {
      valueAppliedKobo = 0;
    }

    const reference = generateReference("VCH");
    const wallet = await db.wallet.findUnique({ where: { userId: user.id } });
    if (!wallet) throw new ServiceError("Wallet not found", 404, "WALLET_NOT_FOUND");

    // For CASHBACK, credit the wallet first (outside tx — see file header).
    let newBalance: number | null = null;
    let creditEntry: { entry: { id: string }; newBalance: number } | null = null;
    if (isCashback) {
      const credit = await creditWallet({
        userId: user.id,
        amountKobo: voucher.valueKobo,
        refType: RefType.REWARD,
        refId: reference,
        description: `Voucher cashback: ${voucher.code}`,
      });
      newBalance = credit.newBalance;
      creditEntry = credit;
    }

    // Now create the redemption + transaction record + bump count atomically.
    // On unique-constraint failure (race), reverse the credit.
    let transaction: { id: string; reference: string } | null = null;
    let redemption: {
      id: string;
      voucherId: string;
      userId: string;
      valueAppliedKobo: number;
      status: string;
      transactionId: string | null;
    } | null = null;

    try {
      const result = await db.$transaction(async (tx) => {
        // Re-validate redemptionsCount inside the tx (race-safe)
        const fresh = await tx.voucher.findUnique({
          where: { id: voucher.id },
          select: { redemptionsCount: true, maxRedemptions: true },
        });
        if (!fresh) throw new ServiceError("Voucher not found", 404, "VOUCHER_NOT_FOUND");
        if (fresh.maxRedemptions > 0 && fresh.redemptionsCount >= fresh.maxRedemptions) {
          throw new ServiceError(
            "Voucher redemption limit reached",
            400,
            "MAX_REDEMPTIONS_REACHED"
          );
        }

        // Try insert — unique(voucherId, userId) will reject duplicates
        const r = await tx.voucherRedemption
          .create({
            data: {
              voucherId: voucher.id,
              userId: user.id,
              valueAppliedKobo,
              status: "SUCCESS",
            },
          })
          .catch(() => null);
        if (!r) {
          throw new ServiceError("You have already redeemed this voucher", 400, "ALREADY_REDEEMED");
        }
        redemption = {
          id: r.id,
          voucherId: r.voucherId,
          userId: r.userId,
          valueAppliedKobo: r.valueAppliedKobo,
          status: r.status,
          transactionId: r.transactionId,
        };

        let txRecord: { id: string; reference: string } | null = null;
        if (isCashback) {
          const t = await tx.transaction.create({
            data: {
              userId: user.id,
              walletId: wallet.id,
              reference,
              type: TxType.REWARD,
              direction: TxDirection.CREDIT,
              amountKobo: voucher.valueKobo,
              feeKobo: 0,
              status: TxStatus.SUCCESS,
              state: TxState.SETTLED,
              description: `Voucher cashback: ${voucher.code}`,
              counterpartyName: `Voucher ${voucher.code}`,
              provider: "turbopay-voucher",
              providerRef: reference,
              metadata: JSON.stringify({
                voucherId: voucher.id,
                code: voucher.code,
              }),
            },
          });
          txRecord = { id: t.id, reference: t.reference };
          transaction = txRecord;
          await tx.voucherRedemption.update({
            where: { id: r.id },
            data: { transactionId: t.id },
          });
          redemption!.transactionId = t.id;
        }

        await tx.voucher.update({
          where: { id: voucher.id },
          data: { redemptionsCount: { increment: 1 } },
        });

        return { redemption, transaction };
      });
      redemption = result.redemption;
      transaction = result.transaction;
    } catch (e) {
      // If the inner transaction failed AND we credited the wallet, reverse it.
      if (isCashback && creditEntry) {
        try {
          await debitWallet({
            userId: user.id,
            amountKobo: voucher.valueKobo,
            refType: RefType.REVERSAL,
            refId: reference,
            description: `Voucher cashback reversal (failed redemption): ${voucher.code}`,
          });
        } catch (reverseErr) {
          // Log and continue — surface the original error to the user.
          console.error("[voucher-redeem] failed to reverse credit", reverseErr);
        }
      }
      throw e;
    }

    await audit({
      userId: user.id,
      action: "VOUCHER_REDEEMED",
      category: "WALLET",
      severity: "INFO",
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      metadata: {
        voucherId: voucher.id,
        code: voucher.code,
        type: voucher.type,
        valueAppliedKobo,
        cashback: isCashback,
        reference,
      },
    });

    // Notify user (esp. for cashback)
    if (isCashback) {
      await db.inAppNotification.create({
        data: {
          userId: user.id,
          type: "REWARD",
          title: "Voucher redeemed!",
          body: `Voucher ${voucher.code} gave you a cashback. Your wallet has been credited.`,
          priority: "NORMAL",
        },
      });
    }

    return json(
      {
        redemption,
        voucher: {
          id: voucher.id,
          code: voucher.code,
          type: voucher.type,
          valueKobo: voucher.valueKobo,
          percentOff: voucher.percentOff,
          description: voucher.description,
        },
        valueAppliedKobo,
        valueKind: voucher.type,
        newBalance,
        transaction,
      },
      201
    );
  } catch (e) {
    if (e instanceof LedgerError) {
      return errorJson(e.message, 400, "LEDGER_ERROR");
    }
    return handleError(e);
  }
}
