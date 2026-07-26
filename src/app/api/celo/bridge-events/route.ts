// GET /api/celo/bridge-events — list the user's recent CeloBridgeEvent records.

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireUser, json, handleError } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const url = new URL(req.url);
    const limit = Math.min(Math.max(1, Number(url.searchParams.get("limit") ?? 10)), 50);

    const rows = await db.celoBridgeEvent.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return json({
      events: rows.map((e) => ({
        id: e.id,
        direction: e.direction,
        status: e.status,
        amountKobo: e.amountKobo,
        amountUsdm: e.amountUsdm,
        fxRate: e.fxRate,
        onchainTxId: e.onchainTxId,
        createdAt: e.createdAt,
        completedAt: e.completedAt,
      })),
    });
  } catch (e) {
    return handleError(e);
  }
}
