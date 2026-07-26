// Turbopay — in-memory OTP store for step-up authentication.
//
// Used by /api/auth/step-up and /api/auth/step-up/verify to issue and
// consume 6-digit one-time codes for high-value transactions. The
// `OtpCode` Prisma model is referenced in the design spec, but since
// the schema is frozen for this build we mirror the statement-cache
// pattern: module-scoped Map keyed by userId, expiring after 10 min.
//
// On a server restart pending OTPs are lost — that's acceptable: the
// user simply re-requests a step-up OTP via the dialog.
//
// Security notes:
//   - Hashed at rest with sha256 (we only ever compare hashes).
//   - 5-attempt lockout per code (verified atomically on consume).
//   - TTL of 10 minutes from issue.
//   - Single outstanding OTP per user — new requests overwrite old.

import { createHash, randomInt } from "crypto";

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const OTP_MAX_ATTEMPTS = 5;

export const STEP_UP_THRESHOLD_DIVISOR = 2; // > 50% of single-tx limit

interface OtpRecord {
  userId: string;
  /** sha256 hex of the 6-digit code (never store the plaintext). */
  codeHash: string;
  /** Plaintext code — kept in-memory only so the dev/demo notification
   * sender can include it in the "SMS" body. Production would call an
   * SMS gateway here and never retain the code. */
  codePlain: string;
  channel: "SMS" | "EMAIL" | "WHATSAPP";
  amountKobo: number;
  expiresAt: number;
  attempts: number;
  consumed: boolean;
  createdAt: number;
}

const store = new Map<string, OtpRecord>();

function hashCode(code: string): string {
  return createHash("sha256").update(code, "utf8").digest("hex");
}

export function generateOtpCode(): string {
  // 6-digit code, leading zeros allowed.
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export interface IssueOtpResult {
  channel: "SMS" | "EMAIL" | "WHATSAPP";
  code: string; // plaintext — only returned to the API layer for delivery
  expiresAt: number;
}

/**
 * Issue a new step-up OTP for the user, replacing any outstanding one.
 * Returns the plaintext code so the caller can deliver it via SMS/email.
 */
export function issueOtp(
  userId: string,
  amountKobo: number,
  channel: "SMS" | "EMAIL" | "WHATSAPP" = "SMS",
): IssueOtpResult {
  const code = generateOtpCode();
  const now = Date.now();
  store.set(userId, {
    userId,
    codeHash: hashCode(code),
    codePlain: code,
    channel,
    amountKobo,
    expiresAt: now + OTP_TTL_MS,
    attempts: 0,
    consumed: false,
    createdAt: now,
  });
  return { channel, code, expiresAt: now + OTP_TTL_MS };
}

export interface VerifyOtpOutcome {
  ok: boolean;
  reason?: "no-otp" | "expired" | "already-used" | "locked" | "mismatch";
  remainingAttempts?: number;
}

/** Verify a submitted OTP. On success the record is marked consumed. */
export function verifyOtp(userId: string, submittedCode: string): VerifyOtpOutcome {
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
  // Keep the record briefly so a follow-up status check sees "verified",
  // but expire quickly. We just delete on next housekeeping pass.
  setTimeout(() => store.delete(userId), 30_000);
  return { ok: true };
}

/** Check if the user currently has an outstanding (unexpired, unconsumed) OTP. */
export function hasOutstandingOtp(userId: string): boolean {
  const rec = store.get(userId);
  if (!rec) return false;
  if (rec.consumed || Date.now() > rec.expiresAt) {
    store.delete(userId);
    return false;
  }
  return true;
}

/** Clear any outstanding OTP for the user (e.g. on logout). */
export function clearOtp(userId: string): void {
  store.delete(userId);
}
