// Turbopay — Single dispute API
//
// GET   : fetch dispute + all messages (thread order ASC).
// PATCH : admin-only — update status / priority / assignment / resolution.
//         Status changes also seed a system message so the thread timeline is auditable.

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import {
  json,
  handleError,
  requireUser,
  requireAdmin,
  audit,
  getClientIp,
  getUserAgent,
  ServiceError,
} from "@/lib/api";

export const dynamic = "force-dynamic";

const STATUSES = new Set([
  "OPEN",
  "UNDER_REVIEW",
  "EVIDENCE_REQUIRED",
  "RESOLVED_FAVOUR_USER",
  "RESOLVED_FAVOUR_PLATFORM",
  "CLOSED",
  "ESCALATED",
]);
const PRIORITIES = new Set(["LOW", "NORMAL", "HIGH", "URGENT"]);

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const user = await requireUser();
    const { id } = await params;

    const dispute = await db.dispute.findUnique({
      where: { id },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
        },
      },
    });
    if (!dispute) throw new ServiceError("Dispute not found", 404, "NOT_FOUND");
    // Users can only read their own disputes. Admins can read any.
    if (dispute.userId !== user.id && user.role !== "ADMIN")
      throw new ServiceError("Dispute not found", 404, "NOT_FOUND");

    // Optional: include referenced transaction summary (for both roles)
    let transaction: { id: string; reference: string; type: string; amountKobo: number } | null =
      null;
    if (dispute.transactionId) {
      const tx = await db.transaction.findUnique({
        where: { id: dispute.transactionId },
        select: { id: true, reference: true, type: true, amountKobo: true },
      });
      transaction = tx;
    }

    return json({ dispute, transaction });
  } catch (e) {
    return handleError(e);
  }
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    const body = await req.json().catch(() => ({}));

    const existing = await db.dispute.findUnique({ where: { id } });
    if (!existing) throw new ServiceError("Dispute not found", 404, "NOT_FOUND");

    const data: Record<string, unknown> = {};
    const systemNotes: string[] = [];

    if (typeof body.status === "string") {
      const s = body.status.toUpperCase();
      if (!STATUSES.has(s)) throw new ServiceError("Invalid status", 400, "INVALID_STATUS");
      if (s !== existing.status) {
        data.status = s;
        systemNotes.push(`Status changed to ${s}`);
        if (s === "RESOLVED_FAVOUR_USER" || s === "RESOLVED_FAVOUR_PLATFORM" || s === "CLOSED") {
          data.resolvedAt = new Date();
        }
      }
    }
    if (typeof body.priority === "string") {
      const p = body.priority.toUpperCase();
      if (!PRIORITIES.has(p)) throw new ServiceError("Invalid priority", 400, "INVALID_PRIORITY");
      if (p !== existing.priority) {
        data.priority = p;
        systemNotes.push(`Priority set to ${p}`);
      }
    }
    if (typeof body.assignedTo === "string") {
      data.assignedTo = body.assignedTo.trim() || null;
      systemNotes.push(
        body.assignedTo.trim() ? `Assigned to ${body.assignedTo.trim()}` : "Assignment cleared"
      );
    }
    if (typeof body.resolution === "string") {
      data.resolution = body.resolution.trim() || null;
      systemNotes.push("Resolution note updated");
    }

    if (Object.keys(data).length === 0) return json({ dispute: existing, unchanged: true });

    data.updatedAt = new Date();

    const updated = await db.dispute.update({ where: { id }, data });

    // Seed system messages for traceability
    if (systemNotes.length) {
      await db.disputeMessage.createMany({
        data: systemNotes.map((note) => ({
          disputeId: id,
          senderId: admin.id,
          senderRole: "ADMIN",
          message: note,
        })),
      });
    }

    // Notify the user that their dispute was updated
    await db.inAppNotification.create({
      data: {
        userId: existing.userId,
        type: "SYSTEM",
        title: `Dispute update: ${existing.subject.slice(0, 60)}`,
        body: systemNotes.join(" · ") || "Your dispute has been updated.",
        priority: "NORMAL",
      },
    });

    await audit({
      userId: admin.id,
      action: "ADMIN_DISPUTE_PATCH",
      category: "ADMIN",
      severity: "WARN",
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      metadata: {
        disputeId: id,
        changes: data,
        notes: systemNotes,
      },
    });

    return json({ dispute: updated });
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    const existing = await db.dispute.findUnique({ where: { id } });
    if (!existing) throw new ServiceError("Dispute not found", 404, "NOT_FOUND");

    await db.dispute.delete({ where: { id } });
    await audit({
      userId: admin.id,
      action: "ADMIN_DISPUTE_DELETE",
      category: "ADMIN",
      severity: "WARN",
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      metadata: { disputeId: id, subject: existing.subject },
    });
    return json({ deleted: true });
  } catch (e) {
    return handleError(e);
  }
}
