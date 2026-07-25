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
import { encryptSecret } from "@/lib/auth";
import { generatePan, generateExpiry, maskPan } from "@/lib/money";

export async function GET() {
  try {
    const user = await requireUser();
    const cards = await db.virtualCard.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { transactions: true } },
        transactions: {
          orderBy: { createdAt: "desc" },
          take: 10,
        },
      },
    });
    return json({
      cards: cards.map((c) => ({
        id: c.id,
        panMasked: c.panMasked,
        last4: c.last4,
        expiry: c.expiry,
        cardholder: c.cardholder,
        brand: c.brand,
        balanceKobo: c.balanceKobo,
        status: c.status,
        spendingLimitKobo: c.spendingLimitKobo,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        transactionsCount: c._count.transactions,
        recentTransactions: c.transactions,
      })),
    });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = await req.json().catch(() => ({}));
    const cardholder = String(body?.cardholder ?? "").trim() || user.fullName;
    if (cardholder.length < 2)
      throw new ServiceError("Cardholder name is too short", 400, "INVALID_NAME");

    const { pan, last4 } = generatePan();
    const expiry = generateExpiry();
    const cvv = String(Math.floor(Math.random() * 900) + 100); // 3-digit
    const brand = Math.random() < 0.5 ? "VISA" : "MASTERCARD";

    const card = await db.virtualCard.create({
      data: {
        userId: user.id,
        panMasked: maskPan(last4),
        last4,
        panEnc: encryptSecret(pan),
        cvvEnc: encryptSecret(cvv),
        expiry,
        cardholder,
        brand,
        balanceKobo: 0,
        status: "ACTIVE",
        spendingLimitKobo: 500_000, // ₦5,000 default
      },
    });

    await audit({
      userId: user.id,
      action: "CARD_CREATE",
      category: "WALLET",
      severity: "INFO",
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      metadata: { cardId: card.id, last4, brand },
    });

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
      },
    });
  } catch (e) {
    return handleError(e);
  }
}
