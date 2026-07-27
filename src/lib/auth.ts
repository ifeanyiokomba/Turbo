// Turbopay auth — scrypt password + PIN hashing, AES-256-GCM card encryption

import { randomBytes, scryptSync, timingSafeEqual, createCipheriv, createDecipheriv } from "crypto";

const SCRYPT_KEYLEN = 64;
const SCRYPT_SALTLEN = 16;

export function hashPassword(password: string): string {
  const salt = randomBytes(SCRYPT_SALTLEN).toString("hex");
  const key = scryptSync(password, salt, SCRYPT_KEYLEN).toString("hex");
  return `scrypt$${salt}$${key}`;
}

export function verifyPassword(password: string, hash: string): boolean {
  const parts = hash.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, salt, key] = parts;
  const derived = scryptSync(password, salt, SCRYPT_KEYLEN);
  const expected = Buffer.from(key, "hex");
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

// PIN hashing (4-digit) — scrypt, same scheme
export const hashPin = hashPassword;
export const verifyPin = verifyPassword;

const WEAK_PINS = new Set([
  "0000",
  "1111",
  "1234",
  "4321",
  "9999",
  "1212",
  "1004",
  "2000",
  "2580",
  "0843",
]);

export function isWeakPin(pin: string): boolean {
  return WEAK_PINS.has(pin) || /^(\d)\1{3}$/.test(pin);
}

// AES-256-GCM for card PAN/CVV at rest (demo key — in prod use KMS / env secret)
const CARD_KEY = process.env.TURBOPAY_CARD_KEY
  ? Buffer.from(process.env.TURBOPAY_CARD_KEY, "hex")
  : Buffer.from("0".repeat(64), "hex"); // 32-byte demo key

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", CARD_KEY, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString("hex")}`;
}

export function decryptSecret(payload: string): string {
  const parts = payload.split(":");
  if (parts.length !== 4 || parts[0] !== "v1") throw new Error("bad payload");
  const iv = Buffer.from(parts[1], "hex");
  const tag = Buffer.from(parts[2], "hex");
  const enc = Buffer.from(parts[3], "hex");
  const decipher = createDecipheriv("aes-256-gcm", CARD_KEY, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return dec.toString("utf8");
}

export function validatePassword(password: string): string | null {
  if (password.length < 8) return "Password must be at least 8 characters";
  if (!/[A-Z]/.test(password)) return "Password must contain an uppercase letter";
  if (!/[a-z]/.test(password)) return "Password must contain a lowercase letter";
  if (!/\d/.test(password)) return "Password must contain a digit";
  return null;
}

export function generateReferralCode(name: string): string {
  const base = (name.replace(/[^a-zA-Z]/g, "").slice(0, 4) || "TURB").toUpperCase();
  const rand = randomBytes(2).toString("hex").toUpperCase();
  return `${base}${rand}`;
}
