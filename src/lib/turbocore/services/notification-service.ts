// TurboCore Bounded Service — Notification Service
//
// Routes outbound notifications to the right provider (Termii for SMS/WhatsApp,
// Resend for email) via the Provider Registry, plus a self-contained in-memory
// OTP store keyed by recipient. In-app notifications are persisted to
// InAppNotification for the bell-icon dropdown.
//
// Rule 1 (Provider SDK): never call Termii/Resend APIs directly — always
// resolve the adapter via the registry.

import { db } from "@/lib/db";
import { createHash, randomInt } from "crypto";
import { registry } from "@/lib/turbocore/registry";
import { ContractName } from "@/lib/turbocore/result";
import type { ProviderResult } from "@/lib/turbocore/result";

export type NotificationChannel = "SMS" | "EMAIL" | "PUSH" | "WHATSAPP";

export interface SendInput {
  channel: NotificationChannel;
  to: string;
  body: string;
  subject?: string;
  templateId?: string;
  variables?: Record<string, string>;
  userId?: string; // for in-app + audit linkage
  preferredProvider?: string; // override routing
}

export interface SendResult {
  ok: boolean;
  provider?: string;
  messageId?: string;
  status?: string;
  error?: string;
}

export interface SendOtpResult {
  ok: boolean;
  channel: NotificationChannel;
  to: string;
  expiresAt: number;
  error?: string;
}

export interface VerifyOtpResult {
  ok: boolean;
  reason?: "no-otp" | "expired" | "already-used" | "locked" | "mismatch";
  remainingAttempts?: number;
}

// ===== Provider preference per channel =====
const CHANNEL_PREFERENCE: Record<NotificationChannel, string[]> = {
  SMS: ["termii", "turbopay"],
  WHATSAPP: ["termii", "turbopay"],
  EMAIL: ["resend", "turbopay"],
  PUSH: ["termii", "turbopay"],
};

// ===== In-memory OTP store (sha256-hashed, 10-min TTL, 5-attempt lockout) =====
interface OtpRecord {
  to: string;
  codeHash: string;
  channel: NotificationChannel;
  expiresAt: number;
  attempts: number;
  consumed: boolean;
  createdAt: number;
}

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const otpStore = new Map<string, OtpRecord>();
let lastIssuedTo: string | null = null;

function hashCode(code: string): string {
  return createHash("sha256").update(code, "utf8").digest("hex");
}

function generateOtpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

async function resolveNotificationAdapter(channel: NotificationChannel, preferred?: string) {
  const candidates = preferred
    ? [preferred, ...CHANNEL_PREFERENCE[channel]]
    : CHANNEL_PREFERENCE[channel];
  const registered = new Set(registry.list(ContractName.NOTIFICATION));
  for (const code of candidates) {
    if (registered.has(code)) {
      try {
        const adapter = await registry.resolve(ContractName.NOTIFICATION, code);
        return { code, adapter };
      } catch {
        // fall through to next candidate
      }
    }
  }
  return { code: null, adapter: null };
}

export const notificationService = {
  /** Send a notification via the best available provider for the channel. */
  async send(input: SendInput): Promise<SendResult> {
    // In-app channel writes directly to InAppNotification (no provider call).
    if (input.channel === "PUSH" && input.userId) {
      const notif = await db.inAppNotification.create({
        data: {
          userId: input.userId,
          type: "SYSTEM",
          title: input.subject ?? "Notification",
          body: input.body,
          priority: "NORMAL",
          actionUrl: null,
        },
      });
      return { ok: true, provider: "in-app", messageId: notif.id, status: "delivered" };
    }

    const { code, adapter } = await resolveNotificationAdapter(
      input.channel,
      input.preferredProvider
    );
    if (!adapter || !code) {
      return { ok: false, error: `No notification provider available for ${input.channel}` };
    }

    try {
      const result: ProviderResult<{ messageId: string; status: string }> = await adapter.send({
        channel: input.channel,
        to: input.to,
        subject: input.subject,
        body: input.body,
        templateId: input.templateId,
        variables: input.variables,
      });
      if (result.ok) {
        return {
          ok: true,
          provider: code,
          messageId: result.data.messageId,
          status: result.data.status,
        };
      }
      return { ok: false, provider: code, error: result.error.message };
    } catch (e: any) {
      return { ok: false, provider: code, error: e?.message ?? "Notification send failed" };
    }
  },

  /** Generate a 6-digit OTP, persist its hash, and deliver it via the channel. */
  async sendOtp(to: string, channel: NotificationChannel = "SMS"): Promise<SendOtpResult> {
    const code = generateOtpCode();
    const now = Date.now();
    const expiresAt = now + OTP_TTL_MS;
    otpStore.set(to, {
      to,
      codeHash: hashCode(code),
      channel,
      expiresAt,
      attempts: 0,
      consumed: false,
      createdAt: now,
    });
    lastIssuedTo = to;

    const delivery = await notificationService.send({
      channel,
      to,
      subject: "TurboPay code",
      body: `Your TurboPay verification code is ${code}. It expires in 10 minutes.`,
    });

    return {
      ok: delivery.ok,
      channel,
      to,
      expiresAt,
      error: delivery.ok ? undefined : delivery.error,
    };
  },

  /**
   * Verify a previously-issued OTP. If `to` is omitted, falls back to the
   * last recipient issued an OTP via sendOtp() in this process.
   */
  async verifyOtp(code: string, to?: string): Promise<VerifyOtpResult> {
    const recipient = to ?? lastIssuedTo;
    if (!recipient) return { ok: false, reason: "no-otp" };

    const rec = otpStore.get(recipient);
    if (!rec) return { ok: false, reason: "no-otp" };
    if (rec.consumed) return { ok: false, reason: "already-used" };
    if (Date.now() > rec.expiresAt) {
      otpStore.delete(recipient);
      return { ok: false, reason: "expired" };
    }
    if (rec.attempts >= OTP_MAX_ATTEMPTS) {
      otpStore.delete(recipient);
      return { ok: false, reason: "locked" };
    }
    rec.attempts += 1;
    if (hashCode(code) !== rec.codeHash) {
      const remaining = OTP_MAX_ATTEMPTS - rec.attempts;
      if (remaining <= 0) otpStore.delete(recipient);
      return { ok: false, reason: "mismatch", remainingAttempts: Math.max(0, remaining) };
    }
    rec.consumed = true;
    setTimeout(() => otpStore.delete(recipient), 30_000);
    return { ok: true };
  },

  /** List in-app notifications for a user, newest first. */
  async listNotifications(userId: string, limit = 50) {
    return db.inAppNotification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: Math.min(Math.max(limit, 1), 200),
    });
  },

  /** Mark a single in-app notification as read. */
  async markRead(id: string) {
    return db.inAppNotification.update({
      where: { id },
      data: { read: true },
    });
  },
};
