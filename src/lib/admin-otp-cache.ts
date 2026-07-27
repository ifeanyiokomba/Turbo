// Turbopay — admin step-up OTP cache.
//
// This is a parallel implementation of `otp-cache.ts` specifically for the
// admin login flow. We use `globalThis` to persist the Map across Turbopack
// dev-mode module re-evaluations (which can give each route bundle its own
// copy of a module-scoped Map, breaking the existing step-up cache for the
// admin routes).
//
// In production (no HMR), the standard module-scoped Map would suffice — but
// using `globalThis` is safe in both dev and prod, so we do it unconditionally.
//
// TTL: 10 minutes. Max attempts: 5. One outstanding OTP per user.

import { createHash, randomInt } from "crypto";

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;

interface AdminOtpRecord {
  userId: string;
  codeHash: string;
  codePlain: string;
  channel: "SMS" | "EMAIL" | "WHATSAPP";
  expiresAt: number;
  attempts: number;
  consumed: boolean;
  createdAt: number;
}

interface GlobalWithAdminOtp {
  __tpAdminOtpStore?: Map<string, AdminOtpRecord>;
}

function getStore(): Map<string, AdminOtpRecord> {
  const g = globalThis as GlobalWithAdminOtp;
  if (!g.__tpAdminOtpStore) {
    g.__tpAdminOtpStore = new Map();
  }
  return g.__tpAdminOtpStore;
}

function hashCode(code: string): string {
  return createHash("sha256").update(code, "utf8").digest("hex");
}

export function generateAdminOtpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export interface IssueAdminOtpResult {
  channel: "SMS" | "EMAIL" | "WHATSAPP";
  code: string;
  expiresAt: number;
}

export function issueAdminOtp(
  userId: string,
  channel: "SMS" | "EMAIL" | "WHATSAPP" = "SMS"
): IssueAdminOtpResult {
  const code = generateAdminOtpCode();
  const now = Date.now();
  getStore().set(userId, {
    userId,
    codeHash: hashCode(code),
    codePlain: code,
    channel,
    expiresAt: now + OTP_TTL_MS,
    attempts: 0,
    consumed: false,
    createdAt: now,
  });
  return { channel, code, expiresAt: now + OTP_TTL_MS };
}

export interface VerifyAdminOtpOutcome {
  ok: boolean;
  reason?: "no-otp" | "expired" | "already-used" | "locked" | "mismatch";
  remainingAttempts?: number;
}

export function verifyAdminOtp(userId: string, submittedCode: string): VerifyAdminOtpOutcome {
  const store = getStore();
  const rec = store.get(userId);
  if (!rec) return { ok: false, reason: "no-otp" };
  if (rec.consumed) return { ok: false, reason: "already-used" };
  if (Date.now() > rec.expiresAt) {
    store.delete(userId);
    return { ok: false, reason: "expired" };
  }
  if (rec.attempts >= OTP_MAX_ATTEMPTS) {
    store.delete(userId);
    return { ok: false, reason: "locked" };
  }
  rec.attempts += 1;
  const submittedHash = hashCode(submittedCode);
  if (submittedHash !== rec.codeHash) {
    const remaining = OTP_MAX_ATTEMPTS - rec.attempts;
    if (remaining <= 0) store.delete(userId);
    return { ok: false, reason: "mismatch", remainingAttempts: Math.max(0, remaining) };
  }
  rec.consumed = true;
  setTimeout(() => store.delete(userId), 30_000);
  return { ok: true };
}

export function clearAdminOtp(userId: string): void {
  getStore().delete(userId);
}
