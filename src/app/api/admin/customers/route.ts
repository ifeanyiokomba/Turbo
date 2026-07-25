import { db } from "@/lib/db";
import { json, handleError, requireAdmin } from "@/lib/api";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export async function GET(req: Request) {
  try {
    await requireAdmin();
    const url = new URL(req.url);
    const search = (url.searchParams.get("search") ?? "").trim();
    const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
    const limit = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, Number(url.searchParams.get("limit") ?? String(DEFAULT_PAGE_SIZE)) || DEFAULT_PAGE_SIZE),
    );

    const where = search
      ? {
          OR: [
            { fullName: { contains: search } },
            { username: { contains: search } },
            { email: { contains: search } },
            { phone: { contains: search } },
          ],
        }
      : {};

    const [users, total] = await Promise.all([
      db.user.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit + 1,
        select: {
          id: true,
          fullName: true,
          username: true,
          email: true,
          phone: true,
          country: true,
          role: true,
          kycTier: true,
          kycStatus: true,
          status: true,
          emailVerified: true,
          createdAt: true,
          wallet: {
            select: { balanceKobo: true, status: true, currency: true },
          },
        },
      }),
      db.user.count({ where }),
    ]);

    const hasMore = users.length > limit;
    const items = hasMore ? users.slice(0, limit) : users;

    return json({ users: items, total, page, limit, hasMore });
  } catch (e) {
    return handleError(e);
  }
}
