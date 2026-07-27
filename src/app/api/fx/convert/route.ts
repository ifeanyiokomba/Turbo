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
import { convertCurrency } from "@/lib/turbocore/fx/convert";

interface ConvertBody {
  from?: string;
  to?: string;
  amountMinor?: number;
  pin?: string;
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = (await req.json().catch(() => ({}))) as ConvertBody;

    const from = String(body.from ?? "").toUpperCase();
    const to = String(body.to ?? "").toUpperCase();
    const amountMinor = Math.round(Number(body.amountMinor ?? 0));
    const pin = String(body.pin ?? "");

    if (!from || !to) {
      throw new ServiceError("from and to currencies are required", 400, "MISSING_PARAMS");
    }
    if (from === to) {
      throw new ServiceError("Cannot convert to the same currency", 400, "SAME_CURRENCY");
    }
    if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
      throw new ServiceError("Amount must be greater than zero", 400, "INVALID_AMOUNT");
    }
    if (!pin) throw new ServiceError("PIN is required", 400, "PIN_REQUIRED");

    await verifyPin(user, pin);

    // Ensure source wallet exists
    const sourceWallet = await db.currencyWallet.findUnique({
      where: { userId_currency: { userId: user.id, currency: from } },
    });
    if (!sourceWallet) {
      throw new ServiceError(
        `You don't have a ${from} wallet yet. Open one first.`,
        404,
        "SOURCE_WALLET_MISSING"
      );
    }

    const result = await convertCurrency({
      userId: user.id,
      from,
      to,
      amountMinor,
    });

    if (!result.ok) {
      return json({ error: result.error ?? "Conversion failed" }, 400);
    }

    const updatedSource = await db.currencyWallet.findUnique({
      where: { userId_currency: { userId: user.id, currency: from } },
    });
    const updatedTarget = await db.currencyWallet.findUnique({
      where: { userId_currency: { userId: user.id, currency: to } },
    });

    await audit({
      userId: user.id,
      action: "FX_CONVERT",
      category: "WALLET",
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      metadata: {
        from,
        to,
        amountMinor,
        creditMinor: result.creditMinor,
      },
    });

    return json({
      ok: true,
      from,
      to,
      amountMinor,
      creditMinor: result.creditMinor,
      sourceBalanceMinor: updatedSource?.balanceMinor ?? 0,
      targetBalanceMinor: updatedTarget?.balanceMinor ?? 0,
    });
  } catch (e) {
    return handleError(e);
  }
}
