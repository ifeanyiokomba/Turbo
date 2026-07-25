import { db } from "@/lib/db";
import { json, handleError, requireUser, ServiceError } from "@/lib/api";
import { ensureMarketplaceSeeded } from "@/lib/marketplace-data";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireUser();
    await ensureMarketplaceSeeded();
    const { id } = await ctx.params;

    const merchant = await db.marketplaceMerchant.findUnique({ where: { id } });
    if (!merchant || merchant.status !== "ACTIVE") {
      throw new ServiceError("Merchant not found", 404, "NOT_FOUND");
    }

    // Similar merchants — same category, exclude self, top 4 by rating.
    const similar = await db.marketplaceMerchant.findMany({
      where: { category: merchant.category, status: "ACTIVE", id: { not: id } },
      orderBy: [{ rating: "desc" }, { reviewCount: "desc" }],
      take: 4,
    });

    return json({ merchant, similar });
  } catch (e) {
    return handleError(e);
  }
}
