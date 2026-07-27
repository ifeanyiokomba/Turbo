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
import { debitWallet, LedgerError } from "@/lib/ledger";
import { RefType, TxDirection, TxState, TxStatus, TxType } from "@/lib/constants";
import { generateReference } from "@/lib/money";

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function POST(req: Request, { params }: Ctx) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const amountKobo = Math.round(Number(body?.amountKobo));
    const pin = String(body?.pin ?? "");

    if (!Number.isFinite(amountKobo) || amountKobo <= 0)
      throw new ServiceError("Enter a valid amount", 400, "INVALID_AMOUNT");
    if (!pin) throw new ServiceError("PIN is required", 400, "PIN_REQUIRED");

    const card = await db.virtualCard.findFirst({ where: { id, userId: user.id } });
    if (!card) throw new ServiceError("Card not found", 404, "CARD_NOT_FOUND");
    if (card.status === "TERMINATED")
      throw new ServiceError("Card is terminated", 400, "CARD_TERMINATED");
    if (card.status === "FROZEN")
      throw new ServiceError("Unfreeze the card to fund it", 400, "CARD_FROZEN");
    if (card.balanceKobo + amountKobo > card.spendingLimitKobo)
      throw new ServiceError(
        `Card spending limit is ${card.spendingLimitKobo} kobo`,
        400,
        "LIMIT_EXCEEDED"
      );

    await verifyPin(user, pin);

    const wallet = await db.wallet.findUnique({ where: { userId: user.id } });
    if (!wallet) throw new ServiceError("Wallet not found", 404, "WALLET_NOT_FOUND");

    const reference = generateReference("CFD");
    const description = `Card ${card.last4} funding`;

    const { newBalance } = await debitWallet({
      userId: user.id,
      amountKobo,
      refType: RefType.CARD_FUND,
      refId: reference,
      description,
    });

    const [transaction, updatedCard] = await db.$transaction([
      db.transaction.create({
        data: {
          userId: user.id,
          walletId: wallet.id,
          reference,
          type: TxType.CARD_FUND,
          direction: TxDirection.DEBIT,
          amountKobo,
          feeKobo: 0,
          status: TxStatus.SUCCESS,
          state: TxState.SETTLED,
          description,
          counterpartyName: `Card •••• ${card.last4}`,
          provider: "turbopay-card",
          providerRef: reference,
        },
      }),
      db.virtualCard.update({
        where: { id: card.id },
        data: { balanceKobo: { increment: amountKobo } },
      }),
      db.virtualCardTransaction.create({
        data: {
          cardId: card.id,
          userId: user.id,
          type: "FUND",
          amountKobo,
          description,
          status: "SUCCESS",
          reference,
        },
      }),
    ]);

    await audit({
      userId: user.id,
      action: "CARD_FUND",
      category: "WALLET",
      severity: "INFO",
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      metadata: { cardId: card.id, last4: card.last4, amountKobo, reference },
    });

    return json({
      transaction,
      card: { id: updatedCard.id, balanceKobo: updatedCard.balanceKobo },
      newBalance,
    });
  } catch (e) {
    if (e instanceof LedgerError) {
      return json({ error: e.message, code: "LEDGER_ERROR" }, 400);
    }
    return handleError(e);
  }
}
