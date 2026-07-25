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

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const card = await db.virtualCard.findFirst({
      where: { id, userId: user.id },
      include: {
        transactions: { orderBy: { createdAt: "desc" }, take: 100 },
      },
    });
    if (!card) throw new ServiceError("Card not found", 404, "CARD_NOT_FOUND");
    return json({
      card: {
        id: card.id,
        panMasked: card.panMasked,
        last4: card.last4,
        expiry: card.expiry,
        cardholder: card.cardholder,
        brand: card.brand,
        balanceKobo: card.balanceKobo,
        status: card.status,
        spendingLimitKobo: card.spendingLimitKobo,
        createdAt: card.createdAt,
        updatedAt: card.updatedAt,
        transactions: card.transactions,
      },
    });
  } catch (e) {
    return handleError(e);
  }
}

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "").toLowerCase();

    const card = await db.virtualCard.findFirst({ where: { id, userId: user.id } });
    if (!card) throw new ServiceError("Card not found", 404, "CARD_NOT_FOUND");

    let newStatus = card.status;
    let auditAction = "CARD_UPDATE";
    if (action === "freeze") {
      if (card.status !== "ACTIVE")
        throw new ServiceError("Only active cards can be frozen", 400, "INVALID_STATUS");
      newStatus = "FROZEN";
      auditAction = "CARD_FREEZE";
    } else if (action === "unfreeze") {
      if (card.status !== "FROZEN")
        throw new ServiceError("Only frozen cards can be unfrozen", 400, "INVALID_STATUS");
      newStatus = "ACTIVE";
      auditAction = "CARD_UNFREEZE";
    } else if (action === "terminate") {
      if (card.status === "TERMINATED")
        throw new ServiceError("Card already terminated", 400, "INVALID_STATUS");
      newStatus = "TERMINATED";
      auditAction = "CARD_TERMINATE";
    } else {
      throw new ServiceError("Unknown action. Use freeze, unfreeze, or terminate.", 400, "INVALID_ACTION");
    }

    const updated = await db.virtualCard.update({
      where: { id: card.id },
      data: { status: newStatus },
    });

    await audit({
      userId: user.id,
      action: auditAction,
      category: "WALLET",
      severity: action === "terminate" ? "WARN" : "INFO",
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      metadata: { cardId: card.id, last4: card.last4, action, newStatus },
    });

    return json({
      card: {
        id: updated.id,
        status: updated.status,
        panMasked: updated.panMasked,
        last4: updated.last4,
      },
    });
  } catch (e) {
    return handleError(e);
  }
}
