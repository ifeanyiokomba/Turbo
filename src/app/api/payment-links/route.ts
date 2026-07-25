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

interface CreateLinkBody {
  title?: string;
  amountMinor?: number;
  currency?: string;
  maxUses?: number;
  expiresAt?: string;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "pay";
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8);
}

export async function GET() {
  try {
    const user = await requireUser();
    // Consumer-as-merchant: use user.id as merchantId
    const links = await db.paymentLink.findMany({
      where: { merchantId: user.id },
      orderBy: { createdAt: "desc" },
    });
    return json({ links });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = (await req.json().catch(() => ({}))) as CreateLinkBody;

    const title = String(body.title ?? "").trim();
    if (!title || title.length < 3) {
      throw new ServiceError("Give your link a descriptive title (min 3 chars)", 400, "INVALID_TITLE");
    }
    const currency = String(body.currency ?? "NGN").toUpperCase();
    const amountMinor = body.amountMinor === undefined || body.amountMinor === null
      ? null
      : Math.round(Number(body.amountMinor));
    if (amountMinor !== null && (!Number.isFinite(amountMinor) || amountMinor < 0)) {
      throw new ServiceError("Invalid amount (must be ≥ 0; 0 means payer chooses)", 400, "INVALID_AMOUNT");
    }
    const maxUses = Math.max(0, Math.round(Number(body.maxUses ?? 0)));
    let expiresAt: Date | null = null;
    if (body.expiresAt) {
      const d = new Date(body.expiresAt);
      if (isNaN(d.getTime())) {
        throw new ServiceError("Invalid expiry date", 400, "INVALID_EXPIRY");
      }
      expiresAt = d;
    }

    // Generate a unique slug
    let slug = `${slugify(title)}-${randomSuffix()}`;
    let attempts = 0;
    while (await db.paymentLink.findUnique({ where: { slug } })) {
      slug = `${slugify(title)}-${randomSuffix()}`;
      attempts++;
      if (attempts > 5) {
        slug = `${slugify(title)}-${Date.now().toString(36)}`;
        break;
      }
    }

    const link = await db.paymentLink.create({
      data: {
        merchantId: user.id,
        slug,
        title,
        amountMinor: amountMinor ?? 0,
        currency,
        maxUses,
        usesCount: 0,
        expiresAt,
        status: "ACTIVE",
        metadataJSON: JSON.stringify({ creatorUserId: user.id, creatorName: user.fullName }),
      },
    });

    await audit({
      userId: user.id,
      action: "PAYMENT_LINK_CREATE",
      category: "WALLET",
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      metadata: { linkId: link.id, slug, title, currency, amountMinor },
    });

    return json({ link });
  } catch (e) {
    return handleError(e);
  }
}
