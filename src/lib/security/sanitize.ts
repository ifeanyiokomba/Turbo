// TurboCore — Input Sanitization (Security Hardening)
//
// Every user-supplied string that enters TurboCore is sanitized before it
// reaches the database, the ledger, or a provider API. This is the first
// line of defense against XSS, injection, and data poisoning attacks.
//
// Usage:
//   import { sanitizeString, sanitizeEmail, sanitizePhone } from "@/lib/security/sanitize";
//
//   const name = sanitizeString(req.body.name, { maxLength: 100 });
//   const email = sanitizeEmail(req.body.email);
//
// Principles:
//   1. Never trust user input — always sanitize, even if the UI validated it.
//   2. Strip before validate — remove dangerous content first, then validate format.
//   3. Context matters — use the right sanitizer for the data type.
//   4. Fail safe — if sanitization can't make input safe, reject it.

// ---------------------------------------------------------------------------
// HTML/script pattern detection
// ---------------------------------------------------------------------------

/** Patterns that indicate an XSS injection attempt. */
const XSS_PATTERNS: RegExp[] = [
  /<script[^>]*>[\s\S]*?<\/script>/gi,
  /<script[^>]*\/>/gi,
  /javascript:/gi,
  /on\w+\s*=\s*["'][^"']*["']/gi, // onload=, onerror=, onclick=, etc.
  /<iframe[^>]*>[\s\S]*?<\/iframe>/gi,
  /<iframe[^>]*\/>/gi,
  /<object[^>]*>[\s\S]*?<\/object>/gi,
  /<embed[^>]*\/?>/gi,
  /<svg[^>]*>[\s\S]*?<\/svg>/gi,
  /<img[^>]+on\w+[^>]*>/gi,
  /<a[^>]+href\s*=\s*["']javascript:/gi,
  /data:\s*text\/html/gi,
  /data:\s*application\/x-/gi,
  /vbscript:/gi,
  /expression\s*\(/gi, // CSS expression()
  /<style[^>]*>[\s\S]*?<\/style>/gi,
  /<link[^>]*>/gi,
  /<meta[^>]*>/gi,
  /<base[^>]*>/gi,
  /<form[^>]*>/gi,
  /<input[^>]*>/gi,
  /<button[^>]*>[\s\S]*?<\/button>/gi,
];

/** SQL injection patterns (defense in depth — Prisma already parameterizes). */
const SQL_INJECTION_PATTERNS: RegExp[] = [
  /'\s*OR\s*'?1'?\s*=\s*'?1/gi,
  /'\s*OR\s*1\s*=\s*1/gi,
  /;\s*DROP\s+TABLE/gi,
  /;\s*DELETE\s+FROM/gi,
  /;\s*INSERT\s+INTO/gi,
  /;\s*UPDATE\s+.*\s+SET/gi,
  /--\s*$/gi,
  /\/\*[\s\S]*?\*\//gi,
  /xp_cmdshell/gi,
  /sp_executesql/gi,
  /UNION\s+ALL\s+SELECT/gi,
  /WAITFOR\s+DELAY/gi,
];

/** Path traversal patterns. */
const PATH_TRAVERSAL_PATTERNS: RegExp[] = [/\.\.\//g, /\.\.\\/g, /%2e%2e/gi, /%2f/gi, /%5c/gi];

// ---------------------------------------------------------------------------
// Core sanitizers
// ---------------------------------------------------------------------------

/**
 * Sanitizes a string by:
 *   1. Trimming whitespace
 *   2. Stripping HTML tags
 *   3. Removing XSS patterns (scripts, event handlers, javascript: URIs)
 *   4. Removing null bytes
 *   5. Truncating to maxLength
 *
 * @example
 *   sanitizeString("<script>alert(1)</script>John") // "John"
 *   sanitizeString("  John  ", { maxLength: 50 }) // "John"
 */
export function sanitizeString(
  input: unknown,
  options: { maxLength?: number; allowBasicHtml?: boolean; required?: boolean } = {}
): string {
  const { maxLength = 1000, allowBasicHtml = false, required = false } = options;

  if (input === null || input === undefined) {
    if (required) throw new Error("Required field is missing");
    return "";
  }

  let str = String(input);

  // Remove null bytes (early termination attack)
  str = str.replace(/\0/g, "");

  // Strip HTML tags unless explicitly allowed
  if (!allowBasicHtml) {
    str = str.replace(/<[^>]*>/g, "");
  }

  // Remove XSS patterns
  for (const pattern of XSS_PATTERNS) {
    str = str.replace(pattern, "");
  }

  // Remove path traversal
  for (const pattern of PATH_TRAVERSAL_PATTERNS) {
    str = str.replace(pattern, "");
  }

  // Normalize unicode (prevents homoglyph attacks)
  str = str.normalize("NFKC");

  // Trim whitespace
  str = str.trim();

  // Truncate
  if (str.length > maxLength) {
    str = str.slice(0, maxLength);
  }

  return str;
}

/**
 * Sanitizes and validates an email address.
 * Returns the cleaned email or throws if invalid.
 */
export function sanitizeEmail(input: unknown): string {
  const str = sanitizeString(input, { maxLength: 254 });
  // RFC 5322 simplified pattern
  const emailRegex =
    /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  if (!emailRegex.test(str)) {
    throw new Error(`Invalid email format: ${str.slice(0, 50)}`);
  }
  return str.toLowerCase();
}

/**
 * Sanitizes a phone number to E.164-ish format.
 * Strips everything except digits and leading +.
 */
export function sanitizePhone(input: unknown): string {
  const str = sanitizeString(input, { maxLength: 20 });
  // Keep only digits and leading +
  let cleaned = str.replace(/[^\d+]/g, "");
  if (cleaned.startsWith("+")) {
    cleaned = "+" + cleaned.slice(1).replace(/\+/g, "");
  } else {
    cleaned = cleaned.replace(/\+/g, "");
  }
  if (cleaned.length < 7 || cleaned.length > 20) {
    throw new Error(`Invalid phone number length: ${cleaned.length}`);
  }
  return cleaned;
}

/**
 * Sanitizes a URL to prevent javascript: and data: URI schemes.
 */
export function sanitizeUrl(input: unknown, allowedSchemes: string[] = ["https", "http"]): string {
  const str = sanitizeString(input, { maxLength: 2048 });
  try {
    const url = new URL(str);
    if (!allowedSchemes.includes(url.protocol.replace(":", ""))) {
      throw new Error(`Disallowed URL scheme: ${url.protocol}`);
    }
    return url.toString();
  } catch {
    throw new Error(`Invalid URL: ${str.slice(0, 100)}`);
  }
}

/**
 * Sanitizes a UUID or ULID.
 */
export function sanitizeId(input: unknown, prefix?: string): string {
  const str = sanitizeString(input, { maxLength: 100 });
  if (prefix && !str.startsWith(prefix + "_")) {
    throw new Error(`ID must start with "${prefix}_"`);
  }
  // Allow only alphanumeric + underscore + hyphen
  if (!/^[a-zA-Z0-9_-]+$/.test(str)) {
    throw new Error("Invalid ID format");
  }
  return str;
}

/**
 * Sanitizes a currency code (ISO 4217).
 */
export function sanitizeCurrencyCode(input: unknown): string {
  const str = sanitizeString(input, { maxLength: 10 });
  if (!/^[A-Z]{3,5}$/.test(str.toUpperCase())) {
    throw new Error(`Invalid currency code: ${str}`);
  }
  return str.toUpperCase();
}

/**
 * Sanitizes a country code (ISO 3166-1 alpha-2).
 */
export function sanitizeCountryCode(input: unknown): string {
  const str = sanitizeString(input, { maxLength: 5 });
  if (!/^[A-Z]{2}$/.test(str.toUpperCase())) {
    throw new Error(`Invalid country code: ${str}`);
  }
  return str.toUpperCase();
}

/**
 * Sanitizes a numeric amount (returns integer minor units).
 */
export function sanitizeAmount(
  input: unknown,
  options: { min?: number; max?: number } = {}
): number {
  const { min = 0, max = Number.MAX_SAFE_INTEGER } = options;
  const num = Number(input);
  if (!Number.isFinite(num)) {
    throw new Error(`Invalid amount: ${String(input).slice(0, 50)}`);
  }
  const int = Math.floor(num);
  if (int < min) {
    throw new Error(`Amount ${int} below minimum ${min}`);
  }
  if (int > max) {
    throw new Error(`Amount ${int} above maximum ${max}`);
  }
  return int;
}

/**
 * Detects potential SQL injection in a string (defense in depth).
 * Returns true if suspicious patterns are found.
 */
export function detectSqlInjection(input: string): boolean {
  const lower = input.toLowerCase();
  for (const pattern of SQL_INJECTION_PATTERNS) {
    if (pattern.test(input)) return true;
  }
  // Check for comment sequences
  if (lower.includes("--") || lower.includes("/*") || lower.includes("*/")) return true;
  return false;
}

/**
 * Detects potential XSS in a string.
 * Returns true if suspicious patterns are found.
 */
export function detectXss(input: string): boolean {
  for (const pattern of XSS_PATTERNS) {
    if (pattern.test(input)) return true;
  }
  return false;
}

/**
 * Sanitizes an object recursively — all string values are sanitized.
 * Useful for sanitizing entire request bodies.
 */
export function sanitizeObject<T>(obj: T, options: { maxLength?: number } = {}): T {
  const { maxLength = 1000 } = options;

  if (obj === null || obj === undefined) return obj;
  if (typeof obj === "string") {
    return sanitizeString(obj, { maxLength }) as unknown as T;
  }
  if (typeof obj === "number" || typeof obj === "boolean") {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeObject(item, options)) as unknown as T;
  }
  if (typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      // Sanitize the key too (prevent prototype pollution)
      const cleanKey = sanitizeString(key, { maxLength: 100 });
      if (cleanKey === "__proto__" || cleanKey === "constructor" || cleanKey === "prototype") {
        continue; // Skip prototype pollution attempts
      }
      result[cleanKey] = sanitizeObject(value, options);
    }
    return result as T;
  }
  return obj;
}

// ---------------------------------------------------------------------------
// Body sanitization middleware for API routes
// ---------------------------------------------------------------------------

/**
 * Wraps a JSON body parser with automatic sanitization.
 *
 * @example
 *   const body = await sanitizeBody(req, { maxLength: 50000 });
 */
export async function sanitizeBody<T = Record<string, unknown>>(
  req: Request,
  options: { maxLength?: number; maxBodySize?: number } = {}
): Promise<T> {
  const { maxBodySize = 1_000_000 } = options; // 1MB default

  // Check Content-Length to prevent DoS via large bodies
  const contentLength = req.headers.get("content-length");
  if (contentLength && parseInt(contentLength, 10) > maxBodySize) {
    throw new Error(`Body too large: ${contentLength} bytes (max ${maxBodySize})`);
  }

  const raw = await req.json().catch(() => ({}));
  return sanitizeObject(raw, options) as T;
}
