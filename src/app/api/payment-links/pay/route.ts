import { z } from "zod";
import { db } from "@/lib/db";
import {
  json,
  handleError,
  requireUser,
  verifyPin,
  audit,
  getClientIp,
  getUserAgent,
  ServiceError,
} from "@/lib/api";
import { transferBetweenWallets, creditWallet } from "@/lib/ledger";
import { RefType, TxDirection, TxState, TxStatus, TxType } from "@/lib/constants";
import { generateReference } from "@/lib/money";

interface PayLinkBody {
  slug?: string;
  amountMinor?: number;
  payerEmail?: string;
  payerName?: string;
  pin?: string;
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = (await req.json().catch(() => ({}))) as PayLinkBody;

    const slug = String(body.slug ?? "").trim();
    const amountMinor = Math.round(Number(body.amountMinor ?? 0));
    const payerEmail = String(body.payerEmail ?? "").trim() || null;
    const payerName = String(body.payerName ?? "").trim() || null;
    const pin = String(body.pin ?? "");

    if (!slug) throw new ServiceError("Link slug is required", 400, "MISSING_SLUG");
    if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
      throw new ServiceError("Amount must be greater than zero", 400, "INVALID_AMOUNT");
    }
    if (!pin) throw new ServiceError("PIN is required", 400, "PIN_REQUIRED");

    await verifyPin(user, pin);

    // Resolve link by slug
    const link = await db.paymentLink.findUnique({ where: { slug } });
    if (!link) {
      throw new ServiceError("Payment link not found", 404, "NOT_FOUND");
    }
    if (link.status !== "ACTIVE") {
      throw new ServiceError("This payment link is no longer active", 400, "LINK_DISABLED");
    }
    if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
      throw new ServiceError("This payment link has expired", 400, "LINK_EXPIRED");
    }
    if (link.maxUses > 0 && link.usesCount >= link.maxUses) {
      throw new ServiceError(
        "This payment link has reached its usage limit",
        400,
        "LINK_EXHAUSTED"
      );
    }
    // If link has a fixed amount, payer must match it
    if (link.amountMinor && link.amountMinor > 0 && link.amountMinor !== amountMinor) {
      throw new ServiceError(
        `This link expects ${link.amountMinor} ${link.currency}. You sent ${amountMinor}.`,
        400,
        "AMOUNT_MISMATCH"
      );
    }

    if (link.merchantId === user.id) {
      throw new ServiceError("You cannot pay into your own payment link", 400, "SELF_PAY");
    }

    const reference = generateReference("PLP");

    // Transfer funds from payer wallet → link owner wallet
    const { debit } = await transferBetweenWallets({
      fromUserId: user.id,
      toUserId: link.merchantId,
      amountKobo: amountMinor,
      feeKobo: 0,
      description: `Payment link: ${link.title}`,
      refId: reference,
    });

    // Record PaymentLinkPayment
    const payment = await db.paymentLinkPayment.create({
      data: {
        paymentLinkId: link.id,
        transactionId: null, // not linking to a specific tx record for now (could store reference)
        amountMinor,
        currency: link.currency,
        payerEmail,
        payerName,
        status: "SUCCESS",
        reference,
      },
    });

    // Bump uses count
    await db.paymentLink.update({
      where: { id: link.id },
      data: { usesCount: { increment: 1 } },
    });

    // Create a Transaction record for the payer (debit)
    const payerWallet = await db.wallet.findUnique({ where: { userId: user.id } });
    if (payerWallet) {
      await db.transaction.create({
        data: {
          userId: user.id,
          walletId: payerWallet.id,
          reference,
          type: TxType.TRANSFER,
          direction: TxDirection.DEBIT,
          amountKobo: amountMinor,
          feeKobo: 0,
          status: TxStatus.SUCCESS,
          state: TxState.SETTLED,
          counterpartyName: payerName ?? "Payment link",
          counterpartyAccount: link.slug,
          counterpartyBank: "Turbopay MFB",
          description: `Paid link: ${link.title}`,
          provider: "turbopay-link",
          providerRef: reference,
          metadata: JSON.stringify({ paymentLinkId: link.id, paymentId: payment.id }),
        },
      });
    }

    // Create a Transaction record for the link owner (credit)
    const ownerWallet = await db.wallet.findUnique({ where: { userId: link.merchantId } });
    if (ownerWallet) {
      await db.transaction.create({
        data: {
          userId: link.merchantId,
          walletId: ownerWallet.id,
          reference: generateReference("PLR"),
          type: TxType.TRANSFER,
          direction: TxDirection.CREDIT,
          amountKobo: amountMinor,
          feeKobo: 0,
          status: TxStatus.SUCCESS,
          state: TxState.SETTLED,
          counterpartyName: payerName ?? "Payer",
          counterpartyAccount: link.slug,
          counterpartyBank: "Turbopay MFB",
          description: `Received via link: ${link.title}`,
          provider: "turbopay-link",
          providerRef: reference,
          metadata: JSON.stringify({ paymentLinkId: link.id, paymentId: payment.id, payerEmail }),
        },
      });
    }

    await audit({
      userId: user.id,
      action: "PAYMENT_LINK_PAY",
      category: "WALLET",
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      metadata: {
        linkId: link.id,
        slug: link.slug,
        amountMinor,
        currency: link.currency,
        reference,
      },
    });

    return json({
      ok: true,
      payment,
      newBalance: debit.newBalance,
      reference,
    });
  } catch (e) {
    return handleError(e);
  }
}
