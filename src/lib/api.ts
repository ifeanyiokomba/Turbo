// Turbopay API helpers — consistent JSON responses + auth guard

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function errorJson(message: string, status = 400, code?: string) {
  return NextResponse.json({ error: message, code }, { status });
}

export class ServiceError extends Error {
  constructor(
    message: string,
    public statusCode: number = 400,
    public code?: string,
  ) {
    super(message);
  }
}

export async function handleError(e: unknown) {
  if (e instanceof ServiceError) return errorJson(e.message, e.statusCode, e.code);
  console.error("[API error]", e);
  const msg = e instanceof Error ? e.message : "Internal server error";
  return errorJson(msg, 500);
}

export async function requireUser() {
  const session = await getSession();
  if (!session) throw new ServiceError("Authentication required", 401, "UNAUTHENTICATED");
  if (session.user.status !== "ACTIVE")
    throw new ServiceError("Account is " + session.user.status.toLowerCase(), 403, "ACCOUNT_INACTIVE");
  return session.user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new ServiceError("Admin access required", 403, "FORBIDDEN");
  return user;
}

export async function verifyPin(user: { transactionPinHash: string | null }, pin: string) {
  if (!user.transactionPinHash) throw new ServiceError("Transaction PIN not set", 400, "PIN_NOT_SET");
  const { verifyPin: verify } = await import("@/lib/auth");
  if (!verify(pin, user.transactionPinHash)) throw new ServiceError("Incorrect PIN", 400, "INVALID_PIN");
}

export function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

export function getUserAgent(req: Request): string {
  return req.headers.get("user-agent") ?? "unknown";
}

export async function audit(opts: {
  userId?: string;
  action: string;
  category: string;
  severity?: string;
  ip?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    await db.auditLog.create({
      data: {
        userId: opts.userId ?? null,
        action: opts.action,
        category: opts.category,
        severity: opts.severity ?? "INFO",
        ip: opts.ip ?? null,
        userAgent: opts.userAgent ?? null,
        metadata: opts.metadata ? JSON.stringify(opts.metadata) : null,
      },
    });
  } catch (e) {
    console.error("[audit] failed", e);
  }
}
