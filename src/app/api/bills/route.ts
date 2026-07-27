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
import { rateLimitMiddleware } from "@/lib/rate-limit-helpers";
import { debitWallet, LedgerError } from "@/lib/ledger";
import { RefType, TxDirection, TxState, TxStatus, TxType, BILL_CATEGORIES } from "@/lib/constants";
import { generateReference } from "@/lib/money";
import { BILLERS } from "@/lib/banks";

const VALID_CATEGORIES = new Set(Object.keys(BILLERS));
const MIN_BILL_KOBO = 1_000; // ₦10
const MAX_BILL_KOBO = 5_000_000; // ₦50,000

/** Generate a 20-digit electricity token string (demo only). */
function generateToken(): string {
  let token = "";
  for (let i = 0; i < 20; i++) {
    token += Math.floor(Math.random() * 10).toString();
  }
  return token;
}

export async function GET() {
  try {
    await requireUser();
    const categories = BILL_CATEGORIES.map((c) => ({
      ...c,
      billers: BILLERS[c.id] ?? [],
    }));
    return json({ categories });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const limited = await rateLimitMiddleware(req, "bills", user.id);
    if (limited) return limited;
    const body = await req.json().catch(() => ({}));

    const category = String(body?.category ?? "").toUpperCase();
    const billerCode = String(body?.billerCode ?? "");
    const billerName = String(body?.billerName ?? "");
    const customerRef = String(body?.customerRef ?? "").trim();
    const amountKobo = Math.round(Number(body?.amountKobo));
    const pin = String(body?.pin ?? "");

    if (!VALID_CATEGORIES.has(category))
      throw new ServiceError("Invalid bill category", 400, "INVALID_CATEGORY");

    const billers = BILLERS[category] ?? [];
    const biller = billers.find((b) => b.code === billerCode);
    if (!biller) throw new ServiceError("Invalid biller", 400, "INVALID_BILLER");
    if (!billerName) throw new ServiceError("Biller name is required", 400, "BILLER_NAME_REQUIRED");

    if (customerRef.length < 4)
      throw new ServiceError(
        `Enter a valid ${biller.refLabel.toLowerCase()}`,
        400,
        "INVALID_CUSTOMER_REF"
      );

    if (!Number.isFinite(amountKobo) || amountKobo < MIN_BILL_KOBO)
      throw new ServiceError("Minimum bill payment is ₦10", 400, "INVALID_AMOUNT");
    if (amountKobo > MAX_BILL_KOBO)
      throw new ServiceError("Maximum bill payment is ₦50,000", 400, "INVALID_AMOUNT");

    if (!pin) throw new ServiceError("PIN is required", 400, "PIN_REQUIRED");
    await verifyPin(user, pin);

    const wallet = await db.wallet.findUnique({ where: { userId: user.id } });
    if (!wallet) throw new ServiceError("Wallet not found", 404, "WALLET_NOT_FOUND");

    const reference = generateReference("BIL");
    const description = `${billerName} — ${customerRef}`;
    const isElectricity = category === "ELECTRICITY";
    const token = isElectricity ? generateToken() : null;

    const { newBalance } = await debitWallet({
      userId: user.id,
      amountKobo,
      refType: RefType.BILL,
      refId: reference,
      description,
    });

    const [transaction, billPayment] = await db.$transaction([
      db.transaction.create({
        data: {
          userId: user.id,
          walletId: wallet.id,
          reference,
          type: TxType.BILL,
          direction: TxDirection.DEBIT,
          amountKobo,
          feeKobo: 0,
          status: TxStatus.SUCCESS,
          state: TxState.SETTLED,
          counterpartyName: billerName,
          description,
          provider: billerCode,
          providerRef: reference,
          metadata: JSON.stringify({ category, customerRef, token }),
        },
      }),
      db.billPayment.create({
        data: {
          userId: user.id,
          category,
          billerName,
          billerCode,
          customerRef,
          amountKobo,
          status: "SUCCESS",
          reference,
          token,
        },
      }),
    ]);

    await audit({
      userId: user.id,
      action: "BILL_PAYMENT",
      category: "WALLET",
      severity: "INFO",
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      metadata: { category, billerCode, billerName, customerRef, amountKobo, reference, token },
    });

    return json({ transaction, billPayment, newBalance });
  } catch (e) {
    if (e instanceof LedgerError) {
      return json({ error: e.message, code: "LEDGER_ERROR" }, 400);
    }
    return handleError(e);
  }
}
