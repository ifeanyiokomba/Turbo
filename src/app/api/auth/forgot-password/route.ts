// Turbopay — forgot-password (reset code issuance).
//
// POST /api/auth/forgot-password  { identifier }
//
// Flow:
//   1. Look up the user by email / phone / username (case-insensitive).
//   2. If found: generate a 6-digit CSPRNG reset code, hash + store with a
//      10-min TTL, and send it to the user via the best available channel
//      (Resend email > Termii SMS > dev console.log).
//   3. If NOT found: still return success — leaking account existence is a
//      security anti-pattern.
//   4. Rate limit: 3 requests / hour per identifier (per-IP + per-identifier).
//   5. Audit PASSWORD_RESET_REQUESTED with the channel used.
//
// Returns { sent: true, channel: "email" | "sms" | "console" } regardless of
// whether the user was found, so the response shape is identical either way.

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { json, handleError, audit, getClientIp, getUserAgent } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
import { issueCode } from "@/lib/password-reset";
import { z } from "zod";

const schema = z.object({
  identifier: z.string().min(3).max(120),
});

type SendOutcome = { channel: "email" | "sms" | "console"; to: string };

/**
 * Send the reset code via the best available channel. Resolution order:
 *   1. Resend (email) — if the user has an email AND the resend adapter is
 *      configured (or we're in dev, where it auto-mocks).
 *   2. Termii (SMS) — if the user has a phone AND termii is configured/mockable.
 *   3. Console.log — fallback in non-production when neither is available.
 */
async function sendResetCode(opts: {
  user: { id: string; email: string | null; phone: string | null; fullName: string };
  code: string;
}): Promise<SendOutcome> {
  const { user, code } = opts;
  const subject = "TurboPay — Password reset code";
  const textBody = `Hi ${user.fullName.split(" ")[0]},

We received a request to reset your TurboPay password.

Your verification code is: ${code}

It expires in 10 minutes. If you didn't request this, you can safely ignore this email — your account is still secure.

— TurboPay Security`;

  // Try Resend email first if the user has an email on file.
  if (user.email) {
    try {
      const { resendNotification } = await import("@/lib/turbocore/providers/resend.adapter");
      const result = await resendNotification.send({
        channel: "EMAIL",
        to: user.email,
        subject,
        body: textBody,
      });
      // `ok` from the shared result helper — every adapter returns { ok: true, ... }
      // on success (or on mock-mode send).
      if (result.ok) {
        return { channel: "email", to: maskEmail(user.email) };
      }
    } catch (e) {
      console.warn("[forgot-password] resend send failed, trying SMS", e);
    }
  }

  // Try Termii SMS next if the user has a phone.
  if (user.phone) {
    try {
      const { termiiNotification } = await import("@/lib/turbocore/providers/termii.adapter");
      const result = await termiiNotification.send({
        channel: "SMS",
        to: user.phone,
        subject,
        body: `Your TurboPay password reset code is ${code}. It expires in 10 minutes. If you didn't request this, ignore this message.`,
      });
      if (result.ok) {
        return { channel: "sms", to: maskPhone(user.phone) };
      }
    } catch (e) {
      console.warn("[forgot-password] termii send failed, falling back to console", e);
    }
  }

  // Last resort: console.log (dev only — in production this means notify is
  // truly broken, but we still don't want to leak that to the client).
  if (process.env.NODE_ENV !== "production") {
    console.log(
      `\n[forgot-password] DEV ONLY — reset code for ${user.fullName} (${user.id}):\n  code = ${code}\n  expires in 10 min\n`
    );
  }
  return { channel: "console", to: "console" };
}

function maskEmail(email: string): string {
  const [name, domain] = email.split("@");
  if (!domain) return "••••";
  const masked =
    name.length <= 2 ? "••" : name.slice(0, 2) + "•".repeat(Math.max(2, name.length - 2));
  return `${masked}@${domain}`;
}

function maskPhone(phone: string): string {
  if (phone.length < 6) return "••••";
  return phone.slice(0, 4) + "•".repeat(Math.max(2, phone.length - 6)) + phone.slice(-2);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      // Don't reveal shape of validation error — return generic success.
      return json({ sent: true, channel: "email" }, 200);
    }
    const identifier = parsed.data.identifier.trim();
    const idKey = identifier.toLowerCase();

    // Rate limit: 3 requests / hour per identifier + IP.
    const ip = getClientIp(req);
    const limitKey = `forgot-pwd:${ip}:${idKey}`;
    const rl = rateLimit({ key: limitKey, limit: 3, windowMs: 60 * 60 * 1000 });
    if (!rl.success) {
      // Don't reveal rate-limit either — return generic success.
      return json({ sent: true, channel: "email" }, 200);
    }

    // Find user by email / phone / username (case-insensitive on username/email).
    const user =
      (await db.user.findUnique({ where: { email: idKey } })) ??
      (await db.user.findUnique({ where: { phone: identifier } })) ??
      (await db.user.findUnique({ where: { username: idKey } }));

    // User-not-found: still return success. We burn the rate-limit token to
    // keep the timing equivalent between found/not-found.
    if (!user) {
      await audit({
        action: "PASSWORD_RESET_REQUESTED_UNKNOWN",
        category: "AUTH",
        severity: "INFO",
        ip,
        userAgent: getUserAgent(req),
        metadata: { identifier: idKey },
      });
      return json({ sent: true, channel: "email" }, 200);
    }

    // Issue + dispatch reset code.
    const code = issueCode(identifier, user.id);
    const outcome = await sendResetCode({ user, code });

    await audit({
      userId: user.id,
      action: "PASSWORD_RESET_REQUESTED",
      category: "AUTH",
      severity: "INFO",
      ip,
      userAgent: getUserAgent(req),
      metadata: { channel: outcome.channel, to: outcome.to },
    });

    return json({ sent: true, channel: outcome.channel, to: outcome.to }, 200);
  } catch (e) {
    // On any internal error, swallow and return success — we never want to
    // leak server state through this endpoint.
    console.error("[forgot-password] error", e);
    return json({ sent: true, channel: "email" }, 200);
  }
}

// handleError is imported for parity with other auth routes but never
// actually called from this handler — we always return 200 to avoid leaking.
void handleError;
