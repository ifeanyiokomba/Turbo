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
import { decryptSecret } from "@/lib/auth";

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function POST(req: Request, { params }: Ctx) {
  try {
    const user = await requireUser();
    const { id } = await params;

    const card = await db.virtualCard.findFirst({ where: { id, userId: user.id } });
    if (!card) throw new ServiceError("Card not found", 404, "CARD_NOT_FOUND");
    if (card.status === "TERMINATED")
      throw new ServiceError("Card is terminated", 400, "CARD_TERMINATED");

    const pan = decryptSecret(card.panEnc);
    const cvv = decryptSecret(card.cvvEnc);

    await audit({
      userId: user.id,
      action: "CARD_REVEAL",
      category: "WALLET",
      severity: "INFO",
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      metadata: { cardId: card.id, last4: card.last4 },
    });

    return json({
      pan,
      cvv,
      expiry: card.expiry,
      cardholder: card.cardholder,
      brand: card.brand,
    });
  } catch (e) {
    return handleError(e);
  }
}
