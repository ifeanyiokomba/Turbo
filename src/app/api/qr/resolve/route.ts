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

/**
 * POST /api/qr/resolve
 * Body: { token }
 *
 * Decodes a payment request token (from /api/qr/generate) and returns the
 * payment details. If expired, returns 410 GONE.
 */

interface ResolveBody {
  token?: string;
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = (await req.json().catch(() => ({}))) as ResolveBody;

    const raw = String(body.token ?? "").trim();
    if (!raw) {
      throw new ServiceError("Token is required", 400, "TOKEN_REQUIRED");
    }

    // Accept either the bare token, or the turbopay://pay?t=... envelope
    let token = raw;
    const match = raw.match(/t=([A-Za-z0-9_-]+)/);
    if (match) token = match[1];

    // base64url → base64 → utf8
    let decoded: string;
    try {
      const b64 = token.replace(/-/g, "+").replace(/_/g, "/");
      const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
      decoded = Buffer.from(padded, "base64").toString("utf8");
    } catch {
      throw new ServiceError("Invalid token format", 400, "INVALID_TOKEN");
    }

    let payload: {
      v?: number;
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

    // Best-effort: verify recipient still exists
    const recipient = await db.user.findUnique({
      where: { id: payload.recipientId },
      select: { id: true, fullName: true, status: true },
    });
    if (!recipient || recipient.status !== "ACTIVE") {
      throw new ServiceError("Recipient account is unavailable", 404, "RECIPIENT_UNAVAILABLE");
    }

    await audit({
      userId: user.id,
      action: "QR_PAYMENT_RESOLVED",
      category: "WALLET",
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      metadata: {
        reference: payload.reference,
        recipientId: payload.recipientId,
        amountKobo: payload.amountKobo ?? null,
      },
    });

    return json({
      resolved: true,
      recipient: {
        id: recipient.id,
        name: payload.recipientName ?? recipient.fullName,
        accountNumber: payload.accountNumber ?? "",
        bankName: payload.bankName ?? "Turbopay MFB",
      },
      amountKobo: payload.amountKobo ?? null,
      note: payload.note ?? null,
      reference: payload.reference ?? null,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (e) {
    return handleError(e);
  }
}
