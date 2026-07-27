import { NextRequest } from "next/server";
import { json, handleError, requireUser } from "@/lib/api";
import { getTransactionTimeline, reconstructFromEvents } from "@/lib/turbopay/transaction-events";
import { db } from "@/lib/db";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    // Ownership check
    const tx = await db.transaction.findFirst({ where: { id, userId: user.id } });
    if (!tx) return json({ error: "Not found" }, 404);
    const reconstructed = await reconstructFromEvents(id);
    return json(reconstructed);
  } catch (e) {
    return handleError(e);
  }
}
