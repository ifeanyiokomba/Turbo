// Turbopay session management — HttpOnly cookie, hashed token, DB-backed

import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { createHash, randomBytes } from "crypto";

export const SESSION_COOKIE = "tp_session";
const SESSION_TTL_DAYS = 7;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateSessionToken(): string {
  return randomBytes(32).toString("hex");
}

export async function createSession(opts: {
  userId: string;
  ip?: string;
  userAgent?: string;
}) {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  await db.session.create({
    data: {
      userId: opts.userId,
      tokenHash: hashToken(token),
      expiresAt,
      ip: opts.ip ?? null,
      userAgent: opts.userAgent ?? null,
    },
  });
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
  return token;
}

export async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!session) return null;
  if (session.revokedAt) return null;
  if (session.expiresAt < new Date()) return null;
  return session;
}

export async function destroySession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    try {
      const session = await db.session.findUnique({ where: { tokenHash: hashToken(token) } });
      if (session) {
        await db.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
      }
    } catch {}
  }
  cookieStore.delete(SESSION_COOKIE);
}
