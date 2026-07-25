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
import { creditWallet, LedgerError } from "@/lib/ledger";
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
      throw new ServiceError("Unfreeze the card to withdraw", 400, "CARD_FROZEN");
    if (card.balanceKobo < amountKobo)
      throw new ServiceError("Insufficient card balance", 400, "INSUFFICIENT_BALANCE");

    await verifyPin(user, pin);

    const wallet = await db.wallet.findUnique({ where: { userId: user.id } });
    if (!wallet) throw new ServiceError("Wallet not found", 404, "WALLET_NOT_FOUND");

    const reference = generateReference("CWD");
    const description = `Card ${card.last4} withdrawal`;

    // Decrement card first — atomic conditional update so concurrent withdrawals can't overdraft
    const decremented = await db.virtualCard.updateMany({
      where: { id: card.id, balanceKobo: { gte: amountKobo } },
      data: { balanceKobo: { decrement: amountKobo } },
    });
    if (decremented.count === 0)
      throw new ServiceError("Insufficient card balance (race)", 400, "INSUFFICIENT_BALANCE");

    const { newBalance } = await creditWallet({
      userId: user.id,
      amountKobo,
      refType: RefType.CARD_WITHDRAW,
      refId: reference,
      description,
    });

    const [transaction] = await db.$transaction([
      db.transaction.create({
        data: {
          userId: user.id,
          walletId: wallet.id,
          reference,
          type: TxType.CARD_WITHDRAW,
          direction: TxDirection.CREDIT,
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
      db.virtualCardTransaction.create({
        data: {
          cardId: card.id,
          userId: user.id,
          type: "WITHDRAW",
          amountKobo,
          description,
          status: "SUCCESS",
          reference,
        },
      }),
    ]);

    const updatedCard = await db.virtualCard.findUnique({
      where: { id: card.id },
      select: { balanceKobo: true },
    });

    await audit({
      userId: user.id,
      action: "CARD_WITHDRAW",
      category: "WALLET",
      severity: "INFO",
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      metadata: { cardId: card.id, last4: card.last4, amountKobo, reference },
    });

    return json({
      transaction,
      card: { id: card.id, balanceKobo: updatedCard?.balanceKobo ?? 0 },
      newBalance,
    });
  } catch (e) {
    if (e instanceof LedgerError) {
      return json({ error: e.message, code: "LEDGER_ERROR" }, 400);
    }
    return handleError(e);
  }
}
