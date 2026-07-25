import { db } from "@/lib/db";
import { json, handleError, requireUser } from "@/lib/api";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

// Map filter chip → transaction types
const FILTER_TYPES: Record<string, string[]> = {
  funding: ["FUNDING"],
  transfers: ["TRANSFER"],
  airtime: ["AIRTIME"],
  data: ["DATA"],
  bills: ["BILL"],
  cards: ["CARD_FUND", "CARD_WITHDRAW"],
  savings: ["SAVINGS_DEPOSIT", "SAVINGS_WITHDRAW"],
};

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const url = new URL(req.url);
    const filter = (url.searchParams.get("filter") ?? "").toLowerCase();
    const typeParam = url.searchParams.get("type") ?? "";
    const search = (url.searchParams.get("search") ?? "").trim();
    const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
    const limit = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, Number(url.searchParams.get("limit") ?? String(DEFAULT_PAGE_SIZE)) || DEFAULT_PAGE_SIZE),
    );

    const where: {
      userId: string;
      type?: { in: string[] };
      OR?: Array<Record<string, { contains: string }>>;
    } = { userId: user.id };

    // Apply filter (chip) OR explicit ?type=A,B
    if (filter && FILTER_TYPES[filter]) {
      where.type = { in: FILTER_TYPES[filter] };
    } else if (typeParam) {
      const types = typeParam
        .split(",")
        .map((t) => t.trim().toUpperCase())
        .filter(Boolean);
      if (types.length) where.type = { in: types };
    }

    if (search) {
      where.OR = [
        { counterpartyName: { contains: search } },
        { description: { contains: search } },
        { reference: { contains: search } },
      ];
    }

    const [transactions, total] = await Promise.all([
      db.transaction.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit + 1, // fetch one extra to determine hasMore
      }),
      db.transaction.count({ where }),
    ]);

    const hasMore = transactions.length > limit;
    const items = hasMore ? transactions.slice(0, limit) : transactions;

    return json({
      transactions: items,
      total,
      page,
      limit,
      hasMore,
    });
  } catch (e) {
    return handleError(e);
  }
}
