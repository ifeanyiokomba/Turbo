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

// Allowed team roles (mirrors schema comment)
const ALLOWED_ROLES = ["ADMIN", "COMPLIANCE", "SUPPORT", "FINANCE"] as const;

function publicMember(m: {
  id: string;
  email: string;
  fullName: string;
  role: string;
  status: string;
  invitedAt: Date;
  activatedAt: Date | null;
  deactivatedAt: Date | null;
  lastLoginAt: Date | null;
}) {
  return {
    id: m.id,
    email: m.email,
    fullName: m.fullName,
    role: m.role,
    status: m.status,
    invitedAt: m.invitedAt,
    activatedAt: m.activatedAt,
    deactivatedAt: m.deactivatedAt,
    lastLoginAt: m.lastLoginAt,
  };
}

// GET /api/admin/team — list all team members (newest invite first).
export async function GET() {
  try {
    const admin = await requireAdmin();
    const members = await db.teamMember.findMany({
      orderBy: { invitedAt: "desc" },
    });
    await audit({
      userId: admin.id,
      action: "TEAM_LIST_VIEWED",
      category: "ADMIN",
      metadata: { count: members.length },
    });
    return json({ members: members.map(publicMember) });
  } catch (e) {
    return handleError(e);
  }
}

const postSchema = z.object({
  email: z.string().email("A valid email is required"),
  fullName: z.string().min(2, "Full name is too short").max(80),
  role: z.enum(ALLOWED_ROLES).default("SUPPORT"),
});

// POST /api/admin/team — invite (create) a new team member with status=PENDING.
export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin();
    const body = await req.json().catch(() => ({}));
    const parsed = postSchema.safeParse(body);
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? "Invalid input";
      return errorJson(msg, 400, "VALIDATION");
    }
    const { email, fullName, role } = parsed.data;
    const normalizedEmail = email.trim().toLowerCase();

    // Enforce email uniqueness (DB enforces it too, but we want a friendly msg).
    const existing = await db.teamMember.findUnique({
      where: { email: normalizedEmail },
    });
    if (existing) {
      return errorJson(
        "A team member with this email already exists",
        409,
        "EMAIL_TAKEN",
      );
    }

    const member = await db.teamMember.create({
      data: {
        email: normalizedEmail,
        fullName: fullName.trim(),
        role,
        status: "PENDING",
        invitedById: admin.id,
      },
    });

    await audit({
      userId: admin.id,
      action: "TEAM_MEMBER_INVITED",
      category: "ADMIN",
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      severity: "WARN",
      metadata: {
        teamMemberId: member.id,
        email: normalizedEmail,
        fullName: member.fullName,
        role,
      },
    });

    return json(
      { member: publicMember(member) },
      201,
    );
  } catch (e) {
    if (e instanceof ServiceError) return errorJson(e.message, e.statusCode, e.code);
    return handleError(e);
  }
}
