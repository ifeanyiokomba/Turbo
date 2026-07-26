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
import { transferBetweenWallets } from "@/lib/ledger";
import { TxDirection, TxState, TxStatus, TxType } from "@/lib/constants";
import { generateReference } from "@/lib/money";

/**
 * POST /api/qr/pay
 * Body: { token, pin, amountKobo?, note? }
 *
 * Resolves a QR payment request token, then atomically transfers funds from
 * the sender's wallet to the recipient. Records both Transaction rows with
 * provider="turbopay-qr" so /api/qr/history can list them later.
 */

interface PayBody {
  token?: string;
  pin?: string;
  amountKobo?: number;
  note?: string;
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = (await req.json().catch(() => ({}))) as PayBody;

    const token = String(body.token ?? "").trim();
    const pin = String(body.pin ?? "");
    if (!token) throw new ServiceError("Token is required", 400, "TOKEN_REQUIRED");
    if (!pin) throw new ServiceError("PIN is required", 400, "PIN_REQUIRED");

    await verifyPin(user, pin);

    // ---- Decode token (same logic as /api/qr/resolve) ----
    let tokenStr = token;
    const match = token.match(/t=([A-Za-z0-9_-]+)/);
    if (match) tokenStr = match[1];

    let decoded: string;
    try {
      const b64 = tokenStr.replace(/-/g, "+").replace(/_/g, "/");
      const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
      decoded = Buffer.from(padded, "base64").toString("utf8");
    } catch {
      throw new ServiceError("Invalid token format", 400, "INVALID_TOKEN");
    }

    let payload: {
      type?: string;
      recipientId?: string;
      recipientName?: string;
      accountNumber?: string;
      bankName?: string;
      amountKobo?: number | null;
      note?: string | null;
      reference?: string;
      expiresAt?: string;
    };
    try {
      payload = JSON.parse(decoded);
    } catch {
      throw new ServiceError("Invalid token payload", 400, "INVALID_PAYLOAD");
    }

    if (payload.type !== "turbopay-qr" || !payload.recipientId) {
      throw new ServiceError("Unknown QR payload", 400, "UNKNOWN_PAYLOAD");
    }

    const expiresAt = payload.expiresAt ? new Date(payload.expiresAt) : null;
    if (!expiresAt || isNaN(expiresAt.getTime())) {
      throw new ServiceError("Token has no expiry", 400, "NO_EXPIRY");
    }
    if (expiresAt.getTime() < Date.now()) {
      throw new ServiceError("This payment request has expired", 410, "EXPIRED");
    }

    if (payload.recipientId === user.id) {
      throw new ServiceError("You cannot pay yourself", 400, "SELF_PAY");
    }

    // Determine amount: if the QR has a fixed amount, payer must match it.
    // If the QR has no amount, the payer supplies amountKobo.
    let amountKobo: number;
    if (payload.amountKobo && payload.amountKobo > 0) {
      amountKobo = payload.amountKobo;
    } else {
      const n = Math.round(Number(body.amountKobo ?? 0));
      if (!Number.isFinite(n) || n <= 0) {
        throw new ServiceError("Amount must be greater than zero", 400, "INVALID_AMOUNT");
      }
      amountKobo = n;
    }

    const recipient = await db.user.findUnique({
      where: { id: payload.recipientId },
      select: { id: true, fullName: true, status: true },
    });
    if (!recipient || recipient.status !== "ACTIVE") {
      throw new ServiceError("Recipient account is unavailable", 404, "RECIPIENT_UNAVAILABLE");
    }

    const recipientName = payload.recipientName ?? recipient.fullName;
    const recipientAccount = payload.accountNumber ?? "";
    const note = body.note ? String(body.note).trim().slice(0, 120) : (payload.note ?? null);
    const qrReference = payload.reference ?? generateReference("QR");

    // Atomic transfer (debit + credit + ledger entries)
    const transferRef = generateReference("QRP");
    const { debit } = await transferBetweenWallets({
      fromUserId: user.id,
      toUserId: recipient.id,
      amountKobo,
      feeKobo: 0,
      description: `QR payment to ${recipientName}${note ? ` — ${note}` : ""}`,
      refId: transferRef,
    });

    // Payer transaction record (DEBIT) with provider="turbopay-qr"
    const payerWallet = await db.wallet.findUnique({ where: { userId: user.id } });
    if (payerWallet) {
      await db.transaction.create({
        data: {
          userId: user.id,
          walletId: payerWallet.id,
          reference: transferRef,
          type: TxType.TRANSFER,
          direction: TxDirection.DEBIT,
          amountKobo,
          feeKobo: 0,
          status: TxStatus.SUCCESS,
          state: TxState.SETTLED,
          counterpartyName: recipientName,
          counterpartyAccount: recipientAccount,
          counterpartyBank: "Turbopay MFB",
          description: `QR payment to ${recipientName}`,
          note: note ?? null,
          provider: "turbopay-qr",
          providerRef: qrReference,
          metadata: JSON.stringify({ qrReference, recipientId: recipient.id, tokenReference: qrReference }),
        },
      });
    }

    // Recipient transaction record (CREDIT)
    const recipientWallet = await db.wallet.findUnique({ where: { userId: recipient.id } });
    if (recipientWallet) {
      await db.transaction.create({
        data: {
          userId: recipient.id,
          walletId: recipientWallet.id,
          reference: generateReference("QRR"),
          type: TxType.TRANSFER,
          direction: TxDirection.CREDIT,
          amountKobo,
          feeKobo: 0,
          status: TxStatus.SUCCESS,
          state: TxState.SETTLED,
          counterpartyName: user.fullName,
          counterpartyAccount: recipientAccount,
          counterpartyBank: "Turbopay MFB",
          description: `QR payment from ${user.fullName}`,
          note: note ?? null,
          provider: "turbopay-qr",
          providerRef: qrReference,
          metadata: JSON.stringify({ qrReference, senderId: user.id }),
        },
      });
    }

    await audit({
      userId: user.id,
      action: "QR_PAYMENT_SENT",
      category: "WALLET",
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      metadata: {
        reference: transferRef,
        qrReference,
        recipientId: recipient.id,
        amountKobo,
      },
    });

    return json({
      ok: true,
      reference: transferRef,
      qrReference,
      newBalance: debit.newBalance,
      recipient: { name: recipientName, accountNumber: recipientAccount },
      amountKobo,
    });
  } catch (e) {
    return handleError(e);
  }
}
