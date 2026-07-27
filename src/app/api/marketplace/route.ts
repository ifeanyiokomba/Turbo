import { db } from "@/lib/db";
import { json, handleError, requireUser } from "@/lib/api";
import { ensureMarketplaceSeeded, MARKETPLACE_CATEGORIES } from "@/lib/marketplace-data";

export async function GET(req: Request) {
  try {
    await requireUser();
    await ensureMarketplaceSeeded();

    const url = new URL(req.url);
    const category = url.searchParams.get("category")?.toUpperCase().trim();
    const search = url.searchParams.get("search")?.trim();
    const featuredOnly =
      url.searchParams.get("featured") === "1" || url.searchParams.get("featured") === "true";

    const where: Record<string, unknown> = { status: "ACTIVE" };
    if (category && (MARKETPLACE_CATEGORIES as readonly string[]).includes(category)) {
      where.category = category;
    }
    if (featuredOnly) where.featured = true;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ];
    }

    const [merchants, total] = await Promise.all([
      db.marketplaceMerchant.findMany({
        where,
        orderBy: [{ featured: "desc" }, { rating: "desc" }, { reviewCount: "desc" }],
        take: 60,
      }),
      db.marketplaceMerchant.count({ where }),
    ]);

    const categoryCounts = await db.marketplaceMerchant.groupBy({
      by: ["category"],
      where: { status: "ACTIVE" },
      _count: { _all: true },
    });
    const categories = MARKETPLACE_CATEGORIES.map((c) => ({
      key: c,
      label: c.charAt(0) + c.slice(1).toLowerCase(),
      count: categoryCounts.find((x) => x.category === c)?._count._all ?? 0,
    }));

    return json({ merchants, categories, total });
  } catch (e) {
    return handleError(e);
  }
}
