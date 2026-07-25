// Turbopay — Disputes API
//
// GET  : list the authenticated user's disputes (last 50) with a preview of the
//        most recent DisputeMessage so the UI can render a chat-style list.
// POST : create a new dispute {subject, category, priority, transactionId?, description}.
//        Also writes an audit log + notifies every admin via InAppNotification.

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
import { z } from "zod";

export const dynamic = "force-dynamic";

const CATEGORIES = new Set([
  "TRANSACTION",
  "BILL",
  "TRANSFER",
  "CARD",
  "AIRTIME",
  "OTHER",
]);
const PRIORITIES = new Set(["LOW", "NORMAL", "HIGH", "URGENT"]);

const createSchema = z.object({
  subject: z.string().trim().min(3, "Subject is too short").max(160),
  category: z.enum([
    "TRANSACTION",
    "BILL",
    "TRANSFER",
    "CARD",
    "AIRTIME",
    "OTHER",
  ]),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).default("NORMAL"),
  transactionId: z.string().trim().max(60).optional().nullable(),
  description: z.string().trim().min(10, "Please describe the issue").max(8000),
});

export async function GET() {
  try {
    const user = await requireUser();
    const disputes = await db.dispute.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            message: true,
            senderRole: true,
            createdAt: true,
          },
        },
      },
    });

    // Stats
    const all = await db.dispute.findMany({
      where: { userId: user.id },
      select: { status: true },
    });
    const open = all.filter(
      (d) =>
        d.status === "OPEN" ||
        d.status === "UNDER_REVIEW" ||
        d.status === "EVIDENCE_REQUIRED" ||
        d.status === "ESCALATED",
    ).length;
    const resolved = all.filter(
      (d) =>
        d.status === "RESOLVED_FAVOUR_USER" ||
        d.status === "RESOLVED_FAVOUR_PLATFORM" ||
        d.status === "CLOSED",
    ).length;

    return json({
      disputes: disputes.map((d) => ({
        id: d.id,
        subject: d.subject,
        category: d.category,
        priority: d.priority,
        status: d.status,
        transactionId: d.transactionId,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
        resolvedAt: d.resolvedAt,
        lastMessage: d.messages[0]
          ? {
              message: d.messages[0].message,
              senderRole: d.messages[0].senderRole,
              createdAt: d.messages[0].createdAt,
            }
          : null,
      })),
      stats: { open, resolved, total: all.length },
    });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = await req.json().catch(() => ({}));
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return errorJson(
        parsed.error.issues[0]?.message ?? "Invalid input",
        400,
        "VALIDATION",
      );
    }
    const { subject, category, priority, transactionId, description } =
      parsed.data;

    // Optional transaction reference — must belong to user if provided
    let txId: string | null = null;
    if (transactionId) {
      const tx = await db.transaction.findFirst({
        where: { id: transactionId, userId: user.id },
        select: { id: true },
      });
      if (!tx)
        throw new ServiceError(
          "Transaction not found for your account",
          404,
          "TX_NOT_FOUND",
        );
      txId = tx.id;
    }

    const dispute = await db.dispute.create({
      data: {
        userId: user.id,
        transactionId: txId,
        subject,
        category,
        priority,
        status: "OPEN",
        description,
      },
    });

    // First message — seed the thread with the user's description
    await db.disputeMessage.create({
      data: {
        disputeId: dispute.id,
        senderId: user.id,
        senderRole: "USER",
        message: description,
      },
    });

    await audit({
      userId: user.id,
      action: "DISPUTE_CREATED",
      category: "WALLET",
      severity: priority === "URGENT" || priority === "HIGH" ? "WARN" : "INFO",
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      metadata: {
        disputeId: dispute.id,
        subject,
        category,
        priority,
        transactionId: txId,
      },
    });

    // Notify all admins
    const admins = await db.user.findMany({
      where: { role: "ADMIN", status: "ACTIVE" },
      select: { id: true },
    });
    if (admins.length) {
      await db.inAppNotification.createMany({
        data: admins.map((a) => ({
          userId: a.id,
          type: "SYSTEM",
          title: `New ${priority.toLowerCase()} dispute: ${subject.slice(0, 60)}`,
          body: `Category: ${category}. Submitted by @${user.username}.`,
          priority: priority === "URGENT" ? "HIGH" : "NORMAL",
          actionUrl: null,
        })),
      });
    }

    return json({ dispute }, 201);
  } catch (e) {
    return handleError(e);
  }
}
