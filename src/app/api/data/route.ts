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
import { DATA_PLANS } from "@/lib/banks";

const NETWORK_CODES = new Set(["MTN", "GLO", "AIRTEL", "NMOBILE"]);

function normalizePhone(phone: string): string {
  return phone.replace(/[^\d+]/g, "");
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = await req.json().catch(() => ({}));

    const network = String(body?.network ?? "").toUpperCase();
    const phone = normalizePhone(String(body?.phone ?? ""));
    const planId = String(body?.planId ?? "");
    const amountKobo = Math.round(Number(body?.amountKobo));
    const pin = String(body?.pin ?? "");

    if (!NETWORK_CODES.has(network))
      throw new ServiceError("Select a valid network", 400, "INVALID_NETWORK");

    if (phone.length < 10 || phone.length > 15)
      throw new ServiceError("Enter a valid phone number", 400, "INVALID_PHONE");

    const plans = DATA_PLANS[network] ?? [];
    const plan = plans.find((p) => p.id === planId);
    if (!plan) throw new ServiceError("Select a valid data plan", 400, "INVALID_PLAN");

    if (!Number.isFinite(amountKobo) || amountKobo !== plan.amountKobo)
      throw new ServiceError("Amount does not match selected plan", 400, "AMOUNT_MISMATCH");

    if (!pin) throw new ServiceError("PIN is required", 400, "PIN_REQUIRED");
    await verifyPin(user, pin);

    const wallet = await db.wallet.findUnique({ where: { userId: user.id } });
    if (!wallet) throw new ServiceError("Wallet not found", 404, "WALLET_NOT_FOUND");

    const reference = generateReference("DAT");
    const description = `Data ${plan.name} — ${network} ${phone}`;

    const { newBalance } = await debitWallet({
      userId: user.id,
      amountKobo,
      refType: RefType.DATA,
      refId: reference,
      description,
    });

    const [transaction] = await db.$transaction([
      db.transaction.create({
        data: {
          userId: user.id,
          walletId: wallet.id,
          reference,
          type: TxType.DATA,
          direction: TxDirection.DEBIT,
          amountKobo,
          feeKobo: 0,
          status: TxStatus.SUCCESS,
          state: TxState.SETTLED,
          counterpartyName: network,
          description,
          provider: network,
          providerRef: reference,
        },
      }),
      db.airtimeDataPurchase.create({
        data: {
          userId: user.id,
          type: "DATA",
          network,
          phone,
          amountKobo,
          planName: plan.name,
          status: "SUCCESS",
          reference,
        },
      }),
    ]);

    await audit({
      userId: user.id,
      action: "DATA_PURCHASE",
      category: "WALLET",
      severity: "INFO",
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      metadata: { network, phone, planId, planName: plan.name, amountKobo, reference },
    });

    return json({ transaction, newBalance });
  } catch (e) {
    if (e instanceof LedgerError) {
      return json({ error: e.message, code: "LEDGER_ERROR" }, 400);
    }
    return handleError(e);
  }
}
