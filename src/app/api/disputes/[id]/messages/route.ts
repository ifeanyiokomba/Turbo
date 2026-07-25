// Turbopay — Dispute messages API
//
// GET  : list messages for a dispute (asc by createdAt).
//        Users can read only their own disputes; admins can read any.
// POST : add a new message {message}. senderRole is always "USER" from this
//        endpoint (admins use a separate admin route or PATCH to respond).
//        Also writes an audit log + notifies admins on first user reply.

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

const createSchema = z.object({
  message: z.string().trim().min(1, "Message cannot be empty").max(4000),
});

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const user = await requireUser();
    const { id } = await params;

    const dispute = await db.dispute.findUnique({
      where: { id },
      select: { id: true, userId: true },
    });
    if (!dispute) throw new ServiceError("Dispute not found", 404, "NOT_FOUND");
    if (dispute.userId !== user.id && user.role !== "ADMIN")
      throw new ServiceError("Dispute not found", 404, "NOT_FOUND");

    const messages = await db.disputeMessage.findMany({
      where: { disputeId: id },
      orderBy: { createdAt: "asc" },
    });
    return json({ messages });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return errorJson(
        parsed.error.issues[0]?.message ?? "Invalid input",
        400,
        "VALIDATION",
      );
    }

    const dispute = await db.dispute.findUnique({
      where: { id },
      select: { id: true, userId: true, status: true, subject: true },
    });
    if (!dispute) throw new ServiceError("Dispute not found", 404, "NOT_FOUND");
    if (dispute.userId !== user.id)
      throw new ServiceError("Dispute not found", 404, "NOT_FOUND");
    if (dispute.status === "CLOSED")
      throw new ServiceError(
        "This dispute is closed. Open a new one if you need more help.",
        400,
        "DISPUTE_CLOSED",
      );

    const message = await db.disputeMessage.create({
      data: {
        disputeId: id,
        senderId: user.id,
        senderRole: "USER",
        message: parsed.data.message,
      },
    });

    // Bump dispute.updatedAt; reopen if it was resolved in platform's favour
    const reopen =
      dispute.status === "RESOLVED_FAVOUR_PLATFORM" ||
      dispute.status === "RESOLVED_FAVOUR_USER";
    await db.dispute.update({
      where: { id },
      data: {
        updatedAt: new Date(),
        ...(reopen ? { status: "UNDER_REVIEW", resolvedAt: null } : {}),
      },
    });

    await audit({
      userId: user.id,
      action: "DISPUTE_MESSAGE_SENT",
      category: "WALLET",
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      metadata: { disputeId: id, messageId: message.id },
    });

    // Notify admins
    const admins = await db.user.findMany({
      where: { role: "ADMIN", status: "ACTIVE" },
      select: { id: true },
    });
    if (admins.length) {
      await db.inAppNotification.createMany({
        data: admins.map((a) => ({
          userId: a.id,
          type: "SYSTEM",
          title: `New reply on dispute: ${dispute.subject.slice(0, 50)}`,
          body: `@${user.username} replied.`,
          priority: "NORMAL",
        })),
      });
    }

    return json({ message }, 201);
  } catch (e) {
    return handleError(e);
  }
}
