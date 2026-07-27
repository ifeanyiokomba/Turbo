import { db } from "@/lib/db";
import { json, handleError, requireUser } from "@/lib/api";

/**
 * GET /api/qr/history
 * Returns the signed-in user's QR payment history (sent + received).
 *
 * QR payments are transactions where provider = "turbopay-qr".
 */
export async function GET() {
  try {
    const user = await requireUser();

    const txns = await db.transaction.findMany({
      where: {
        userId: user.id,
        provider: "turbopay-qr",
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        reference: true,
        type: true,
        direction: true,
        amountKobo: true,
        status: true,
        counterpartyName: true,
        counterpartyAccount: true,
        description: true,
        note: true,
        providerRef: true,
        createdAt: true,
      },
    });

    return json({
      history: txns.map((t) => ({
        id: t.id,
        reference: t.reference,
        qrReference: t.providerRef ?? null,
        direction: t.direction,
        amountKobo: t.amountKobo,
        status: t.status,
        counterpartyName: t.counterpartyName ?? null,
        counterpartyAccount: t.counterpartyAccount ?? null,
        description: t.description ?? null,
        note: t.note ?? null,
        createdAt: t.createdAt,
      })),
    });
  } catch (e) {
    return handleError(e);
  }
}
