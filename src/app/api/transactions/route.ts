import { db } from "@/lib/db";
import { json, handleError, requireUser } from "@/lib/api";
import { TxDirection, TxStatus } from "@/lib/constants";

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

// Parse ?minAmount / ?maxAmount (NGN as decimal string → kobo int)
function parseKoboFromNaira(input: string | null): number | null {
  if (!input) return null;
  const n = Number(input);
  if (!isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

// Parse a yyyy-mm-dd date string into a Date boundary (start-of-day or end-of-day)
function parseDateStart(input: string): Date | null {
  if (!input) return null;
  const d = new Date(input);
  if (isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}
function parseDateEnd(input: string): Date | null {
  if (!input) return null;
  const d = new Date(input);
  if (isNaN(d.getTime())) return null;
  d.setHours(23, 59, 59, 999);
  return d;
}

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const url = new URL(req.url);
    const filter = (url.searchParams.get("filter") ?? "").toLowerCase();
    const typeParam = url.searchParams.get("type") ?? "";
    const statusParam = (url.searchParams.get("status") ?? "").trim().toUpperCase();
    const directionParam = (url.searchParams.get("direction") ?? "").trim().toUpperCase();
    const search = (url.searchParams.get("search") ?? "").trim();
    const minKobo = parseKoboFromNaira(url.searchParams.get("minAmount"));
    const maxKobo = parseKoboFromNaira(url.searchParams.get("maxAmount"));
    const dateFrom = parseDateStart(url.searchParams.get("dateFrom") ?? "");
    const dateTo = parseDateEnd(url.searchParams.get("dateTo") ?? "");
    const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
    const limit = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, Number(url.searchParams.get("limit") ?? String(DEFAULT_PAGE_SIZE)) || DEFAULT_PAGE_SIZE),
    );

    // Build where clause combining all filters
    const where: {
      userId: string;
      type?: { in: string[] };
      status?: string;
      direction?: string;
      amountKobo?: { gte?: number; lte?: number };
      createdAt?: { gte?: Date; lte?: Date };
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

    if (statusParam) {
      where.status = statusParam;
    }
    if (directionParam === "IN") {
      where.direction = TxDirection.CREDIT;
    } else if (directionParam === "OUT") {
      where.direction = TxDirection.DEBIT;
    }

    // Amount range (kobo)
    if (minKobo != null || maxKobo != null) {
      where.amountKobo = {};
      if (minKobo != null) where.amountKobo.gte = minKobo;
      if (maxKobo != null) where.amountKobo.lte = maxKobo;
    }

    // Date range
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = dateFrom;
      if (dateTo) where.createdAt.lte = dateTo;
    }

    if (search) {
      where.OR = [
        { counterpartyName: { contains: search } },
        { description: { contains: search } },
        { reference: { contains: search } },
      ];
    }

    const [transactions, total, summaryRows] = await Promise.all([
      db.transaction.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit + 1, // fetch one extra to determine hasMore
      }),
      db.transaction.count({ where }),
      db.transaction.findMany({
        where: { ...where, status: TxStatus.SUCCESS },
        select: { direction: true, amountKobo: true },
      }),
    ]);

    const hasMore = transactions.length > limit;
    const items = hasMore ? transactions.slice(0, limit) : transactions;

    // Compute summary (money in / out for SUCCESS transactions matching filters)
    let totalIn = 0;
    let totalOut = 0;
    for (const r of summaryRows) {
      if (r.direction === TxDirection.CREDIT) totalIn += r.amountKobo;
      else totalOut += r.amountKobo;
    }

    return json({
      transactions: items,
      total,
      page,
      limit,
      hasMore,
      summary: {
        totalIn,
        totalOut,
        count: summaryRows.length,
      },
    });
  } catch (e) {
    return handleError(e);
  }
}
