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
import { ensureMarketplaceSeeded } from "@/lib/marketplace-data";

interface PayBody {
  amountMinor?: number;
  note?: string;
  pin?: string;
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    await ensureMarketplaceSeeded();
    const { id } = await ctx.params;

    const merchant = await db.marketplaceMerchant.findUnique({ where: { id } });
    if (!merchant || merchant.status !== "ACTIVE") {
      throw new ServiceError("Merchant not found", 404, "NOT_FOUND");
    }

    const body = (await req.json().catch(() => ({}))) as PayBody;
    const amountMinor = Math.round(Number(body.amountMinor ?? 0));
    const note = String(body.note ?? "").trim();
    const pin = String(body.pin ?? "");

    if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
      throw new ServiceError("Amount must be greater than zero", 400, "INVALID_AMOUNT");
    }
    if (!pin) throw new ServiceError("PIN is required", 400, "PIN_REQUIRED");

    await verifyPin(user, pin);

    const wallet = await db.wallet.findUnique({ where: { userId: user.id } });
    if (!wallet) throw new ServiceError("Wallet not found", 404, "WALLET_NOT_FOUND");

    const reference = generateReference("MKT");
    const description = note
      ? `Payment to ${merchant.name} — ${note}`
      : `Payment to ${merchant.name}`;

    const { newBalance } = await debitWallet({
      userId: user.id,
      amountKobo: amountMinor,
      refType: RefType.TRANSFER,
      refId: reference,
      description,
    });

    const transaction = await db.transaction.create({
      data: {
        userId: user.id,
        walletId: wallet.id,
        reference,
        type: TxType.TRANSFER,
        direction: TxDirection.DEBIT,
        amountKobo: amountMinor,
        feeKobo: 0,
        status: TxStatus.SUCCESS,
        state: TxState.SETTLED,
        counterpartyName: merchant.name,
        counterpartyAccount: merchant.phone ?? merchant.email ?? merchant.id.slice(-6).toUpperCase(),
        counterpartyBank: "Turbopay Marketplace",
        description,
        provider: "turbopay-marketplace",
        providerRef: reference,
        metadata: JSON.stringify({
          marketplaceMerchantId: merchant.id,
          category: merchant.category,
          note: note || null,
        }),
      },
    });

    await audit({
      userId: user.id,
      action: "MARKETPLACE_PAY",
      category: "WALLET",
      severity: "INFO",
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      metadata: {
        merchantId: merchant.id,
        merchantName: merchant.name,
        category: merchant.category,
        amountMinor,
        reference,
      },
    });

    return json({
      ok: true,
      transaction,
      newBalance,
      reference,
      merchantName: merchant.name,
    });
  } catch (e) {
    if (e instanceof LedgerError) {
      const msg = e.message.toLowerCase().includes("insufficient")
        ? "Insufficient balance for this payment"
        : e.message;
      return json({ error: msg, code: "INSUFFICIENT_BALANCE" }, 400);
    }
    return handleError(e);
  }
}
