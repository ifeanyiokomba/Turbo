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
import { rateLimitMiddleware } from "@/lib/rate-limit-helpers";
import { hashPin, isWeakPin, verifyPin } from "@/lib/auth";
import { z } from "zod";

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

// POST: Set PIN (only if user has no PIN yet)
const setSchema = z.object({
  pin: z.string().regex(/^\d{4}$/, "PIN must be exactly 4 digits"),
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const limited = await rateLimitMiddleware(req, "pin", user.id);
    if (limited) return limited;
    const fresh = await db.user.findUnique({ where: { id: user.id } });
    if (!fresh) return errorJson("User not found", 404);
    if (fresh.transactionPinHash) {
      return errorJson("PIN already set. Use change PIN instead.", 409, "PIN_ALREADY_SET");
    }
    const body = await req.json().catch(() => ({}));
    const parsed = setSchema.safeParse(body);
    if (!parsed.success) {
      return errorJson(parsed.error.issues[0]?.message ?? "Invalid PIN", 400, "VALIDATION");
    }
    const { pin } = parsed.data;
    if (isWeakPin(pin)) {
      return errorJson("PIN is too common. Pick a stronger 4-digit PIN.", 400, "WEAK_PIN");
    }
    const hash = hashPin(pin);
    const updated = await db.user.update({
      where: { id: user.id },
      data: {
        transactionPinHash: hash,
        pinSetAt: new Date(),
        pinFailCount: 0,
        pinLockedUntil: null,
      },
    });
    await audit({
      userId: user.id,
      action: "PIN_SET",
      category: "AUTH",
      severity: "INFO",
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
    });
    return json({ user: publicUser(updated) });
  } catch (e) {
    return handleError(e);
  }
}

// PUT: Change PIN (requires old PIN)
const changeSchema = z.object({
  oldPin: z.string().regex(/^\d{4}$/, "Old PIN must be 4 digits"),
  newPin: z.string().regex(/^\d{4}$/, "New PIN must be 4 digits"),
});

export async function PUT(req: NextRequest) {
  try {
    const user = await requireUser();
    const limited = await rateLimitMiddleware(req, "pin", user.id);
    if (limited) return limited;
    const fresh = await db.user.findUnique({ where: { id: user.id } });
    if (!fresh) return errorJson("User not found", 404);
    if (!fresh.transactionPinHash) {
      return errorJson("PIN not set. Use set PIN instead.", 400, "PIN_NOT_SET");
    }
    const body = await req.json().catch(() => ({}));
    const parsed = changeSchema.safeParse(body);
    if (!parsed.success) {
      return errorJson(parsed.error.issues[0]?.message ?? "Invalid input", 400, "VALIDATION");
    }
    const { oldPin, newPin } = parsed.data;
    if (!verifyPin(oldPin, fresh.transactionPinHash)) {
      await audit({
        userId: user.id,
        action: "PIN_CHANGE_FAILED",
        category: "AUTH",
        severity: "WARN",
        ip: getClientIp(req),
        userAgent: getUserAgent(req),
      });
      return errorJson("Old PIN is incorrect", 400, "INVALID_PIN");
    }
    if (oldPin === newPin) {
      return errorJson("New PIN must be different from old PIN", 400, "SAME_PIN");
    }
    if (isWeakPin(newPin)) {
      return errorJson("New PIN is too common. Pick a stronger 4-digit PIN.", 400, "WEAK_PIN");
    }
    const hash = hashPin(newPin);
    const updated = await db.user.update({
      where: { id: user.id },
      data: {
        transactionPinHash: hash,
        pinSetAt: new Date(),
        pinFailCount: 0,
        pinLockedUntil: null,
      },
    });
    await audit({
      userId: user.id,
      action: "PIN_CHANGED",
      category: "AUTH",
      severity: "INFO",
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
    });
    return json({ user: publicUser(updated) });
  } catch (e) {
    return handleError(e);
  }
}
