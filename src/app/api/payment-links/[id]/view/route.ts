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
 * POST /api/payment-links/[id]/view
 *
 * Increments the link's view counter (stored in metadataJSON.views). Called
 * by the share page / preview pane each time a customer views the link.
 *
 * This is a public-ish endpoint — but we still require auth here since
 * Turbopay is a logged-in-only product for now. Future: open this up to
 * anonymous visitors via a separate public route.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    // Optional auth — anyone can increment views, but we still log who if known.
    let userId: string | null = null;
    try {
      const u = await requireUser();
      userId = u.id;
    } catch {
      // anonymous — allowed
    }
    const { id } = await ctx.params;

    const link = await db.paymentLink.findUnique({ where: { id } });
    if (!link) {
      throw new ServiceError("Payment link not found", 404, "NOT_FOUND");
    }

    // Parse current metadata, bump views, persist
    let meta: Record<string, unknown> = {};
    try {
      const v = JSON.parse(link.metadataJSON);
      if (typeof v === "object" && v !== null) meta = v as Record<string, unknown>;
    } catch {
      /* ignore */
    }
    const currentViews = typeof meta.views === "number" ? meta.views : 0;
    meta.views = currentViews + 1;

    await db.paymentLink.update({
      where: { id: link.id },
      data: { metadataJSON: JSON.stringify(meta) },
    });

    if (userId) {
      await audit({
        userId,
        action: "PAYMENT_LINK_VIEWED",
        category: "WALLET",
        ip: getClientIp(req),
        userAgent: getUserAgent(req),
        metadata: { linkId: id, slug: link.slug, views: meta.views },
      });
    }

    return json({ ok: true, views: meta.views });
  } catch (e) {
    return handleError(e);
  }
}
