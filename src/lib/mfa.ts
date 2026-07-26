// Turbopay — TOTP MFA helpers (otpauth library)

import { Secret, TOTP, URI } from "otpauth";
import { randomBytes, scryptSync } from "crypto";
import { encryptSecret, decryptSecret } from "@/lib/auth";

const ISSUER = "Turbopay";
const PERIOD = 30; // seconds
const DIGITS = 6;
const ALGORITHM = "SHA1";

/** Generate a new TOTP secret + otpauth URI for QR code. */
export function generateMfaSecret(userEmail: string): { secret: string; uri: string } {
  const secret = new Secret({ size: 20 });
  const totp = new TOTP({
    issuer: ISSUER,
    label: userEmail || "user",
    algorithm: ALGORITHM,
    digits: DIGITS,
    period: PERIOD,
    secret,
  });
  return {
    secret: secret.base32,
    uri: totp.toString(),
  };
}

/** Encrypt a TOTP secret before DB storage. */
export function encryptMfaSecret(secret: string): string {
  return encryptSecret(secret);
}

/** Decrypt a stored TOTP secret. */
export function decryptMfaSecret(encSecret: string): string {
  return decryptSecret(encSecret);
}

/** Validate a 6-digit TOTP token against the secret (allows ±1 window for clock skew). */
export function verifyTotp(token: string, secret: string): boolean {
  if (!/^\d{6}$/.test(token)) return false;
  const totp = new TOTP({
    issuer: ISSUER,
    label: "user",
    algorithm: ALGORITHM,
    digits: DIGITS,
    period: PERIOD,
    secret: Secret.fromBase32(secret),
  });
  const delta = TOTP.validate({ token, secret: Secret.fromBase32(secret), window: 1 });
  return delta !== null;
}

/** Decode an otpauth URI back into a TOTP object (useful for display). */
export function parseTotpUri(uri: string): TOTP | null {
  try {
    return URI.parse(uri) as TOTP;
  } catch {
    return null;
  }
}

// === Backup codes ===

const BACKUP_CODE_LEN = 8;
const BACKUP_CODE_COUNT = 8;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no confusing chars (no 0,O,1,I)

/** Generate 8 random 8-character backup codes (no ambiguous chars). */
export function generateBackupCodes(): string[] {
  const codes: string[] = [];
  for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
    const bytes = randomBytes(BACKUP_CODE_LEN);
    let code = "";
    for (let j = 0; j < BACKUP_CODE_LEN; j++) {
      code += ALPHABET[bytes[j] % ALPHABET.length];
    }
    codes.push(code);
  }
  return codes;
}

/** Hash each backup code (scrypt). Returns JSON array of "scrypt$salt$key" strings. */
export function hashBackupCodes(codes: string[]): string {
  const hashes = codes.map((c) => {
    const salt = randomBytes(16).toString("hex");
    const key = scryptSync(c, salt, 64).toString("hex");
    return `scrypt$${salt}$${key}`;
  });
  return JSON.stringify(hashes);
}

/** Verify a backup code against the stored JSON array of hashes. Returns true on first match. */
export function verifyBackupCode(code: string, hashesJson: string): boolean {
  try {
    const hashes: string[] = JSON.parse(hashesJson);
    if (!Array.isArray(hashes)) return false;
    const upper = code.trim().toUpperCase();
    for (const h of hashes) {
      const parts = h.split("$");
      if (parts.length !== 3 || parts[0] !== "scrypt") continue;
      const [, salt, key] = parts;
      const derived = scryptSync(upper, salt, 64);
      const expected = Buffer.from(key, "hex");
      if (derived.length === expected.length && timingSafeEqualBuf(derived, expected)) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

function timingSafeEqualBuf(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
