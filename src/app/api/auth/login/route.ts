import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/auth";
import { createSession } from "@/lib/session";
import { json, errorJson, handleError, audit, getClientIp, getUserAgent } from "@/lib/api";
import { rateLimitMiddleware } from "@/lib/rate-limit-helpers";
import { ensureSeed } from "@/lib/seed";
import { z } from "zod";

const schema = z.object({
  identifier: z.string().min(3),
  password: z.string().min(1),
});

function publicUser(u: any) {
  return {
    id: u.id,
    fullName: u.fullName,
    username: u.username,
    email: u.email,
    phone: u.phone,
    country: u.country,
    role: u.role,
    kycTier: u.kycTier,
    kycStatus: u.kycStatus,
    status: u.status,
    emailVerified: u.emailVerified,
    avatarUrl: u.avatarUrl,
    hasPin: !!u.transactionPinHash,
  };
}

export async function POST(req: NextRequest) {
  try {
    await ensureSeed();
    const body = await req.json();
    const limited = await rateLimitMiddleware(req, "login", body?.identifier);
    if (limited) return limited;
    const parsed = schema.safeParse(body);
    if (!parsed.success) return errorJson("Invalid credentials", 400);
    const { identifier, password } = parsed.data;
    const id = identifier.trim().toLowerCase();

    // Find by email, phone, or username
    const user =
      (await db.user.findUnique({ where: { email: id } })) ??
      (await db.user.findUnique({ where: { phone: id } })) ??
      (await db.user.findUnique({ where: { username: id } }));

    // Timing-safe-ish: always hash something
    if (!user) {
      verifyPassword(password, "scrypt$0000$0000");
      return errorJson("Invalid credentials", 401);
    }
    if (user.status !== "ACTIVE") return errorJson("Account is " + user.status.toLowerCase(), 403);

    // Lockout check
    if (user.loginLockedUntil && user.loginLockedUntil > new Date()) {
      const mins = Math.ceil((user.loginLockedUntil.getTime() - Date.now()) / 60000);
      return errorJson(`Too many attempts. Try again in ${mins} min.`, 429);
    }

    const ok = verifyPassword(password, user.passwordHash);
    if (!ok) {
      const fails = user.loginFailCount + 1;
      const lockUntil = fails >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;
      await db.user.update({
        where: { id: user.id },
        data: { loginFailCount: fails, loginLockedUntil: lockUntil },
      });
      await audit({
        userId: user.id,
        action: "LOGIN_FAILED",
        category: "AUTH",
        severity: "WARN",
        ip: getClientIp(req),
        userAgent: getUserAgent(req),
      });
      return errorJson("Invalid credentials", 401);
    }

    // Reset fails
    await db.user.update({ where: { id: user.id }, data: { loginFailCount: 0, loginLockedUntil: null } });
    await createSession({ userId: user.id, ip: getClientIp(req), userAgent: getUserAgent(req) });
    await audit({
      userId: user.id,
      action: "LOGIN",
      category: "AUTH",
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
    });

    return json({ user: publicUser(user) });
  } catch (e) {
    return handleError(e);
  }
}
