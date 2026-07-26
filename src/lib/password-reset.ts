// Turbopay password reset — short-lived reset codes (in-memory store).
//
// Why in-memory:
//   The punch list called for the simplest possible solution that doesn't
//   require a schema migration. Codes are 6-digit, hashed with sha256 (so a
//   memory dump can't leak them), expire after 10 minutes, and allow at most
//   5 verification attempts before being invalidated.
//
// Production note: replace with a DB-backed `PasswordReset` model or Redis
// once multi-instance deployments are needed. The function signatures below
// are designed to map cleanly onto either backend.

import { createHash, randomInt } from "crypto";

const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_VERIFY_ATTEMPTS = 5;

interface ResetRecord {
  /** sha256-hashed 6-digit code. */
  codeHash: string;
  /** Absolute expiry epoch ms. */
  expiresAt: number;
  /** Number of failed verification attempts so far. */
  attempts: number;
  /** The userId this code was issued for (resolved at request time). */
  userId: string;
}

/**
 * Map key = lowercased identifier (email | phone | username).
 * In dev there's only one server process, so this is fine. If we ever go
 * multi-instance, swap this for a Redis hash with the same shape.
 */
const store = new Map<string, ResetRecord>();

// Periodic cleanup so the map doesn't grow unboundedly in long-lived
// processes. We piggyback on each call below too (lazy expiry), but this
// background sweep keeps things tidy even when no traffic arrives.
let cleanupTimer: ReturnType<typeof setInterval> | null = null;
function ensureCleanup() {
  if (cleanupTimer) return;
  if (typeof setInterval === "undefined") return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of store) {
      if (v.expiresAt < now) store.delete(k);
    }
  }, 60_000);
  if (cleanupTimer && typeof cleanupTimer === "object" && "unref" in cleanupTimer) {
    (cleanupTimer as { unref?: () => void }).unref?.();
  }
}
ensureCleanup();

function hash(code: string): string {
  return createHash("sha256").update(code, "utf8").digest("hex");
}

/** Generate a cryptographically-secure 6-digit reset code. */
export function generateResetCode(): string {
  // randomInt is CSPRNG-backed and returns a uniform integer in [0, 1e6).
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/**
 * Issue a new reset code for the given identifier + userId.
 * Overwrites any previous pending code (only one live code per identifier).
 */
export function issueCode(identifier: string, userId: string): string {
  const key = identifier.trim().toLowerCase();
  const code = generateResetCode();
  store.set(key, {
    codeHash: hash(code),
    expiresAt: Date.now() + CODE_TTL_MS,
    attempts: 0,
    userId,
  });
  return code;
}

export interface VerifyResult {
  ok: boolean;
  reason?: "not-found" | "expired" | "too-many-attempts" | "mismatch" | "user-mismatch";
  userId?: string;
}

/**
 * Verify a 6-digit reset code against the stored record.
 * On success, the code is consumed (deleted) so it can't be replayed.
 * On failure, the attempt counter is incremented (and the record dropped
 * once MAX_VERIFY_ATTEMPTS is exceeded).
 */
export function verifyCode(identifier: string, code: string, expectedUserId?: string): VerifyResult {
  const key = identifier.trim().toLowerCase();
  const rec = store.get(key);
  if (!rec) return { ok: false, reason: "not-found" };
  if (rec.expiresAt < Date.now()) {
    store.delete(key);
    return { ok: false, reason: "expired" };
  }
  if (expectedUserId && rec.userId !== expectedUserId) {
    return { ok: false, reason: "user-mismatch" };
  }
  if (rec.attempts >= MAX_VERIFY_ATTEMPTS) {
    store.delete(key);
    return { ok: false, reason: "too-many-attempts" };
  }
  if (rec.codeHash !== hash(code)) {
    rec.attempts += 1;
    if (rec.attempts >= MAX_VERIFY_ATTEMPTS) {
      store.delete(key);
    }
    return { ok: false, reason: "mismatch" };
  }
  // Success — invalidate so the same code can't be reused.
  store.delete(key);
  return { ok: true, userId: rec.userId };
}

/** Invalidate any pending code for an identifier (e.g. on successful reset). */
export function invalidate(identifier: string): void {
  store.delete(identifier.trim().toLowerCase());
}

/** Test helper / admin introspection — is there a live code for this id? */
export function hasLiveCode(identifier: string): boolean {
  const rec = store.get(identifier.trim().toLowerCase());
  return !!rec && rec.expiresAt > Date.now();
}
