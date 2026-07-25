import { db } from "@/lib/db";
import { json, handleError, requireAdmin } from "@/lib/api";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export async function GET(req: Request) {
  try {
    await requireAdmin();
    const url = new URL(req.url);
    const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
    const limit = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, Number(url.searchParams.get("limit") ?? String(DEFAULT_PAGE_SIZE)) || DEFAULT_PAGE_SIZE),
    );
    const type = url.searchParams.get("type")?.trim().toUpperCase() ?? "";
    const status = url.searchParams.get("status")?.trim().toUpperCase() ?? "";

    const where: {
      type?: string;
      status?: string;
    } = {};
    if (type) where.type = type;
    if (status) where.status = status;

    const [transactions, total] = await Promise.all([
      db.transaction.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit + 1,
        include: {
          user: {
            select: { fullName: true, username: true },
          },
        },
      }),
      db.transaction.count({ where }),
    ]);

    const hasMore = transactions.length > limit;
    const items = hasMore ? transactions.slice(0, limit) : transactions;

    return json({
      transactions: items.map((t) => ({
        id: t.id,
        reference: t.reference,
        type: t.type,
        direction: t.direction,
        amountKobo: t.amountKobo,
        feeKobo: t.feeKobo,
        status: t.status,
        state: t.state,
        counterpartyName: t.counterpartyName,
        description: t.description,
        createdAt: t.createdAt,
        userName: t.user?.fullName,
        userUsername: t.user?.username,
      })),
      total,
      page,
      limit,
      hasMore,
    });
  } catch (e) {
    return handleError(e);
  }
}
