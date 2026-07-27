import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import {
  json,
  errorJson,
  handleError,
  requireAdmin,
  audit,
  getClientIp,
  getUserAgent,
  ServiceError,
} from "@/lib/api";
import { z } from "zod";

// PATCH /api/admin/team/[id] — activate or deactivate a team member.
//
// Body: { status: "ACTIVE" | "DEACTIVATED" }
// Activating a PENDING/DEACTIVATED member sets activatedAt=now.
// Deactivating an ACTIVE member sets deactivatedAt=now.
// We never allow deactivating the *last* active ADMIN — there must always be
// at least one admin who can manage the team.
const patchSchema = z.object({
  status: z.enum(["ACTIVE", "DEACTIVATED"]),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? "Invalid input";
      return errorJson(msg, 400, "VALIDATION");
    }
    const nextStatus = parsed.data.status;

    const member = await db.teamMember.findUnique({ where: { id } });
    if (!member) throw new ServiceError("Team member not found", 404, "NOT_FOUND");

    // Guard: never deactivate the last active admin.
    if (nextStatus === "DEACTIVATED" && member.role === "ADMIN" && member.status === "ACTIVE") {
      const activeAdminCount = await db.teamMember.count({
        where: { role: "ADMIN", status: "ACTIVE" },
      });
      if (activeAdminCount <= 1) {
        return errorJson("Cannot deactivate the last active admin", 400, "LAST_ADMIN");
      }
    }

    const now = new Date();
    const updated = await db.teamMember.update({
      where: { id },
      data: {
        status: nextStatus,
        activatedAt: nextStatus === "ACTIVE" ? now : member.activatedAt,
        deactivatedAt: nextStatus === "DEACTIVATED" ? now : null,
      },
    });

    await audit({
      userId: admin.id,
      action: nextStatus === "ACTIVE" ? "TEAM_MEMBER_ACTIVATED" : "TEAM_MEMBER_DEACTIVATED",
      category: "ADMIN",
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      severity: nextStatus === "ACTIVE" ? "INFO" : "WARN",
      metadata: {
        teamMemberId: member.id,
        email: member.email,
        fullName: member.fullName,
        role: member.role,
      },
    });

    return json({ member: updated });
  } catch (e) {
    if (e instanceof ServiceError) return errorJson(e.message, e.statusCode, e.code);
    return handleError(e);
  }
}

// DELETE /api/admin/team/[id] — remove a team member.
// Refuses to delete the *last* admin.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;

    const member = await db.teamMember.findUnique({ where: { id } });
    if (!member) throw new ServiceError("Team member not found", 404, "NOT_FOUND");

    // Guard: never delete the last admin.
    if (member.role === "ADMIN") {
      const adminCount = await db.teamMember.count({
        where: { role: "ADMIN" },
      });
      if (adminCount <= 1) {
        return errorJson("Cannot delete the last admin team member", 400, "LAST_ADMIN");
      }
    }

    await db.teamMember.delete({ where: { id } });

    await audit({
      userId: admin.id,
      action: "TEAM_MEMBER_REMOVED",
      category: "ADMIN",
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      severity: "WARN",
      metadata: {
        teamMemberId: member.id,
        email: member.email,
        fullName: member.fullName,
        role: member.role,
      },
    });

    return json({ ok: true });
  } catch (e) {
    if (e instanceof ServiceError) return errorJson(e.message, e.statusCode, e.code);
    return handleError(e);
  }
}
