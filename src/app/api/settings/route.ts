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

function publicUser(u: any) {
  return {
    id: u.id,
    fullName: u.fullName,
    username: u.username,
    email: u.email,
    phone: u.phone,
    country: u.country,
    bio: u.bio,
    avatarUrl: u.avatarUrl,
    role: u.role,
    kycTier: u.kycTier,
    kycStatus: u.kycStatus,
    status: u.status,
    emailVerified: u.emailVerified,
    hasPin: !!u.transactionPinHash,
  };
}

export async function GET() {
  try {
    const user = await requireUser();
    const fresh = await db.user.findUnique({ where: { id: user.id } });
    if (!fresh) return errorJson("User not found", 404);
    return json({ user: publicUser(fresh) });
  } catch (e) {
    return handleError(e);
  }
}

const patchSchema = z.object({
  fullName: z.string().min(2, "Name is too short").max(80).optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().max(20).optional().or(z.literal("")),
  bio: z.string().max(280).optional().or(z.literal("")),
  avatarUrl: z.string().url().optional().or(z.literal("")),
});

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = await req.json().catch(() => ({}));
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? "Invalid input";
      return errorJson(msg, 400, "VALIDATION");
    }
    const input = parsed.data;

    const data: Record<string, string | null> = {};
    if (input.fullName !== undefined) data.fullName = input.fullName.trim();
    if (input.email !== undefined) data.email = input.email.trim() || null;
    if (input.phone !== undefined) data.phone = input.phone.trim() || null;
    if (input.bio !== undefined) data.bio = input.bio.trim() || null;
    if (input.avatarUrl !== undefined) data.avatarUrl = input.avatarUrl.trim() || null;

    // Email uniqueness check (SQLite throws but we want a friendly message)
    if (data.email) {
      const existing = await db.user.findUnique({ where: { email: data.email } });
      if (existing && existing.id !== user.id) {
        return errorJson("Email is already in use", 409, "EMAIL_TAKEN");
      }
    }
    if (data.phone) {
      const existing = await db.user.findUnique({ where: { phone: data.phone } });
      if (existing && existing.id !== user.id) {
        return errorJson("Phone is already in use", 409, "PHONE_TAKEN");
      }
    }

    if (Object.keys(data).length === 0) {
      throw new ServiceError("No fields to update", 400, "NO_FIELDS");
    }

    const updated = await db.user.update({ where: { id: user.id }, data });
    await audit({
      userId: user.id,
      action: "PROFILE_UPDATE",
      category: "AUTH",
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      metadata: { fields: Object.keys(data) },
    });
    return json({ user: publicUser(updated) });
  } catch (e) {
    return handleError(e);
  }
}
