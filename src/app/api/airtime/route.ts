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

const NETWORK_CODES = new Set(["MTN", "GLO", "AIRTEL", "NMOBILE"]);
const MIN_AIRTIME_KOBO = 5_000; // ₦50
const MAX_AIRTIME_KOBO = 5_000_000; // ₦50,000

function normalizePhone(phone: string): string {
  return phone.replace(/[^\d+]/g, "");
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = await req.json().catch(() => ({}));

    const network = String(body?.network ?? "").toUpperCase();
    const phone = normalizePhone(String(body?.phone ?? ""));
    const amountKobo = Math.round(Number(body?.amountKobo));
    const pin = String(body?.pin ?? "");

    if (!NETWORK_CODES.has(network))
      throw new ServiceError("Select a valid network", 400, "INVALID_NETWORK");

    if (phone.length < 10 || phone.length > 15)
      throw new ServiceError("Enter a valid phone number", 400, "INVALID_PHONE");

    if (!Number.isFinite(amountKobo) || amountKobo < MIN_AIRTIME_KOBO)
      throw new ServiceError("Minimum airtime is ₦50", 400, "INVALID_AMOUNT");
    if (amountKobo > MAX_AIRTIME_KOBO)
      throw new ServiceError("Maximum airtime is ₦50,000", 400, "INVALID_AMOUNT");

    if (!pin) throw new ServiceError("PIN is required", 400, "PIN_REQUIRED");
    await verifyPin(user, pin);

    const wallet = await db.wallet.findUnique({ where: { userId: user.id } });
    if (!wallet) throw new ServiceError("Wallet not found", 404, "WALLET_NOT_FOUND");

    const reference = generateReference("AIR");
    const description = `Airtime ${network} ${phone}`;

    const { newBalance } = await debitWallet({
      userId: user.id,
      amountKobo,
      refType: RefType.AIRTIME,
      refId: reference,
      description,
    });

    const [transaction] = await db.$transaction([
      db.transaction.create({
        data: {
          userId: user.id,
          walletId: wallet.id,
          reference,
          type: TxType.AIRTIME,
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
          type: "AIRTIME",
          network,
          phone,
          amountKobo,
          status: "SUCCESS",
          reference,
        },
      }),
    ]);

    await audit({
      userId: user.id,
      action: "AIRTIME_PURCHASE",
      category: "WALLET",
      severity: "INFO",
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      metadata: { network, phone, amountKobo, reference },
    });

    return json({ transaction, newBalance });
  } catch (e) {
    if (e instanceof LedgerError) {
      return json({ error: e.message, code: "LEDGER_ERROR" }, 400);
    }
    return handleError(e);
  }
}
