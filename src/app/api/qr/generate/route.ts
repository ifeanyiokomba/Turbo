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
import { generateReference } from "@/lib/money";

/**
 * POST /api/qr/generate
 * Body: { amountKobo?, note? }
 *
 * Builds a base64-encoded payment request token containing:
 *   { recipientId, recipientName, accountNumber, amountKobo?, note?, reference, expiresAt }
 *
 * Returns { token, qrPayload, reference, expiresAt }
 *
 * The QR payload is a JSON envelope that the scanning device can decode and
 * POST to /api/qr/resolve to view payment details.
 */

const QR_TTL_MINUTES = 10;

interface GenerateBody {
  amountKobo?: number;
  note?: string;
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = (await req.json().catch(() => ({}))) as GenerateBody;

    let amountKobo: number | null = null;
    if (body.amountKobo !== undefined && body.amountKobo !== null) {
      const n = Math.round(Number(body.amountKobo));
      if (!Number.isFinite(n) || n <= 0) {
        throw new ServiceError("Amount must be greater than zero", 400, "INVALID_AMOUNT");
      }
      amountKobo = n;
    }

    const note = body.note ? String(body.note).trim().slice(0, 120) : null;

    // Recipient = the signed-in user. Pull their virtual account (or fallback).
    const virtualAccount = await db.virtualAccount.findUnique({
      where: { userId: user.id },
    });

    const accountNumber = virtualAccount?.accountNumber ?? "0000000000";
    const accountName = virtualAccount?.accountName ?? user.fullName;

    const reference = generateReference("QR");
    const expiresAt = new Date(Date.now() + QR_TTL_MINUTES * 60 * 1000);

    const payload = {
      v: 1,
      type: "turbopay-qr",
      recipientId: user.id,
      recipientName: accountName,
      accountNumber,
      bankName: "Turbopay MFB",
      amountKobo,
      note,
      reference,
      expiresAt: expiresAt.toISOString(),
    };

    // Token = base64url(JSON). This is intentionally unencrypted — anyone with
    // the QR can decode the recipient info, but a payment still requires the
    // sender's PIN via /api/transfer.
    const token = Buffer.from(JSON.stringify(payload), "utf8")
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    // The QR payload string is the token prefixed with our scheme identifier
    // so scanners can route appropriately.
    const qrPayload = `turbopay://pay?t=${token}`;

    await audit({
      userId: user.id,
      action: "QR_PAYMENT_REQUEST_GENERATED",
      category: "WALLET",
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      metadata: { reference, amountKobo, expiresAt: expiresAt.toISOString() },
    });

    return json({
      token,
      qrPayload,
      reference,
      expiresAt: expiresAt.toISOString(),
      payload: {
        recipientName: accountName,
        accountNumber,
        bankName: "Turbopay MFB",
        amountKobo,
        note,
      },
    });
  } catch (e) {
    return handleError(e);
  }
}
