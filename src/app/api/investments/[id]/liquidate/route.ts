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
    const pinVal = String(body?.pin ?? "");
    if (!pinVal) throw new ServiceError("PIN is required", 400, "PIN_REQUIRED");

    await verifyPin(user, pinVal);

    const investment = await db.userInvestment.findFirst({
      where: { id, userId: user.id },
      include: { product: true },
    });
    if (!investment) throw new ServiceError("Investment not found", 404, "INVESTMENT_NOT_FOUND");
    if (investment.status !== "ACTIVE")
      throw new ServiceError("Only active investments can be liquidated", 400, "NOT_ACTIVE");

    const wallet = await db.wallet.findUnique({ where: { userId: user.id } });
    if (!wallet) throw new ServiceError("Wallet not found", 404, "WALLET_NOT_FOUND");

    const reference = generateReference("INL");
    const description = `Investment liquidation — ${investment.product.name}`;
    const amountKobo = investment.currentValueKobo;

    const { newBalance } = await creditWallet({
      userId: user.id,
      amountKobo,
      refType: RefType.INVESTMENT,
      refId: reference,
      description,
    });

    const [transaction, updated] = await db.$transaction([
      db.transaction.create({
        data: {
          userId: user.id,
          walletId: wallet.id,
          reference,
          type: TxType.INVESTMENT,
          direction: TxDirection.CREDIT,
          amountKobo,
          feeKobo: 0,
          status: TxStatus.SUCCESS,
          state: TxState.SETTLED,
          description,
          counterpartyName: investment.product.name,
          provider: investment.product.provider,
          providerRef: reference,
          metadata: JSON.stringify({ investmentId: investment.id, action: "LIQUIDATE" }),
        },
      }),
      db.userInvestment.update({
        where: { id: investment.id },
        data: { status: "LIQUIDATED" },
      }),
    ]);

    await audit({
      userId: user.id,
      action: "INVESTMENT_LIQUIDATE",
      category: "WALLET",
      severity: "WARN",
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      metadata: {
        investmentId: investment.id,
        productId: investment.productId,
        amountKobo,
        reference,
        newStatus: updated.status,
      },
    });

    return json({
      transaction,
      investment: { id: updated.id, status: updated.status },
      newBalance,
    });
  } catch (e) {
    if (e instanceof LedgerError) {
      return json({ error: e.message, code: "LEDGER_ERROR" }, 400);
    }
    return handleError(e);
  }
}
