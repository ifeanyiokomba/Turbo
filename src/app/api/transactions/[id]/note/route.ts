// Turbopay — Transaction note/tag API
//
// PATCH  /api/transactions/[id]/note
//   body: { note?: string | null }
//   - requireUser; verify transaction belongs to user
//   - update note field (trimmed, max 280 chars; empty string → null)
//   - audit TRANSACTION_NOTE_UPDATED
//   - return updated transaction

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import {
  json,
  errorJson,
  handleError,
  requireUser,
  audit,
  getClientIp,
  getUserAgent,
  ServiceError,
} from "@/lib/api";

export const dynamic = "force-dynamic";

interface Ctx {
  params: Promise<{ id: string }>;
}

const MAX_NOTE_LEN = 280;

export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const user = await requireUser();
    const { id } = await params;

    // Verify ownership (findFirst guards against IDOR)
    const tx = await db.transaction.findFirst({
      where: { id, userId: user.id },
      select: { id: true, reference: true, note: true },
    });
    if (!tx) throw new ServiceError("Transaction not found", 404, "TX_NOT_FOUND");

    const body = await req.json().catch(() => ({}));
    const raw = typeof body?.note === "string" ? body.note : null;

    // Normalize: trim; empty → null; cap length
    const trimmed = raw?.trim() ?? "";
    const note = trimmed.length === 0 ? null : trimmed.slice(0, MAX_NOTE_LEN);

    if (raw && trimmed.length > MAX_NOTE_LEN) {
      throw new ServiceError(
        `Note is too long (max ${MAX_NOTE_LEN} characters)`,
        400,
        "NOTE_TOO_LONG"
      );
    }

    const updated = await db.transaction.update({
      where: { id },
      data: { note },
    });

    await audit({
      userId: user.id,
      action: "TRANSACTION_NOTE_UPDATED",
      category: "TRANSACTION",
      severity: "INFO",
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      metadata: {
        transactionId: id,
        reference: tx.reference,
        hasNote: note != null,
        noteLength: note?.length ?? 0,
      },
    });

    return json({
      transaction: {
        id: updated.id,
        note: updated.note,
      },
    });
  } catch (e) {
    return handleError(e);
  }
}
