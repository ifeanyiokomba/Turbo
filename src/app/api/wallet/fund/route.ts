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
import { creditWallet, LedgerError } from "@/lib/ledger";
import { RefType, TxDirection, TxState, TxStatus, TxType } from "@/lib/constants";
import { generateReference } from "@/lib/money";

const VALID_METHODS = new Set(["BANK_TRANSFER", "CARD", "USSD", "DEMO"]);

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = await req.json().catch(() => ({}));
    const amountKobo = Math.round(Number(body?.amountKobo));
    const method = String(body?.method ?? "BANK_TRANSFER").toUpperCase();

    if (!Number.isFinite(amountKobo) || amountKobo <= 0)
      throw new ServiceError("Amount must be greater than zero", 400, "INVALID_AMOUNT");
    if (!VALID_METHODS.has(method))
      throw new ServiceError("Unsupported funding method", 400, "INVALID_METHOD");

    const wallet = await db.wallet.findUnique({ where: { userId: user.id } });
    if (!wallet) throw new ServiceError("Wallet not found", 404, "WALLET_NOT_FOUND");

    const reference = generateReference("FND");
    const description = `Wallet funding via ${method}`;

    const { newBalance } = await creditWallet({
      userId: user.id,
      amountKobo,
      refType: RefType.FUNDING,
      refId: reference,
      description,
    });

    const transaction = await db.transaction.create({
      data: {
        userId: user.id,
        walletId: wallet.id,
        reference,
        type: TxType.FUNDING,
        direction: TxDirection.CREDIT,
        amountKobo,
        feeKobo: 0,
        status: TxStatus.SUCCESS,
        state: TxState.SETTLED,
        description,
        provider: method,
        providerRef: reference,
        counterpartyName: "Turbopay MFB",
      },
    });

    await audit({
      userId: user.id,
      action: "WALLET_FUND",
      category: "WALLET",
      severity: "INFO",
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      metadata: { amountKobo, method, reference },
    });

    return json({ transaction, newBalance });
  } catch (e) {
    if (e instanceof LedgerError) {
      return json({ error: e.message, code: "LEDGER_ERROR" }, 400);
    }
    return handleError(e);
  }
}
