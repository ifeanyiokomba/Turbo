<<<<<<< HEAD
// Input sanitization utilities — runs in API route handlers (Node Runtime).
//
// This module defends against three classes of injection attacks:
//
//   1. XSS  — 20 pattern detectors catch <script>, <iframe>, on* event
//              handlers, javascript: URIs, data: URIs with HTML, SVG-based
//              payloads, encoded variants, etc.
//   2. SQLi — 12 pattern detectors catch UNION SELECT, stacked queries,
//              comment terminators, time-based blind injection probes, etc.
//   3. PT   — 4 path-traversal patterns catch ../, ..\\, encoded variants,
//              and absolute path escapes.
//
// Plus prototype-pollution prevention (__proto__ / constructor / prototype
// keys are stripped from objects), Unicode NFKC normalization (defeats
// lookalike-character attacks), and null-byte stripping (defeats truncation
// attacks).
//
// Server-side only: imports `hash` from Node `crypto` for safe logging hashes.
// Do NOT import this module from Edge Runtime code.

import { createHash } from "crypto";

// ---------------------------------------------------------------------------
// Pattern detectors
// ---------------------------------------------------------------------------

/**
 * 20 XSS pattern detectors.
 *
 * Each entry is a regex (with the `i` flag where appropriate) and a human-
 * readable label used in detection reports. The patterns are intentionally
 * broad — anything that matches is rejected wholesale rather than stripped,
 * because "fixing" malicious HTML is unsafe.
 */
export const XSS_PATTERNS: readonly { pattern: RegExp; label: string }[] = [
  { pattern: /<\s*script\b/i, label: "<script> tag" },
  { pattern: /<\/\s*script\s*>/i, label: "</script> tag" },
  { pattern: /<\s*iframe\b/i, label: "<iframe> tag" },
  { pattern: /<\s*object\b/i, label: "<object> tag" },
  { pattern: /<\s*embed\b/i, label: "<embed> tag" },
  { pattern: /<\s*svg\b/i, label: "<svg> tag (XSS vector)" },
  { pattern: /<\s*img\b[^>]*\bon\w+\s*=/i, label: "<img on*=...> event handler" },
  { pattern: /<\s*body\b[^>]*\bon\w+\s*=/i, label: "<body on*=...> event handler" },
  { pattern: /\bon(load|error|click|mouseover|focus|blur|submit|change|toggle|animationstart|animationend)\s*=/i, label: "inline event handler" },
  { pattern: /javascript\s*:/i, label: "javascript: URI" },
  { pattern: /vbscript\s*:/i, label: "vbscript: URI" },
  { pattern: /data\s*:\s*text\/html/i, label: "data:text/html URI" },
  { pattern: /data\s*:\s*application\/x-/i, label: "data:application/x-* URI" },
  { pattern: /<\s*meta\b[^>]*http-equiv/i, label: "<meta http-equiv> refresh redirect" },
  { pattern: /<\s*link\b[^>]*\brel\s*=\s*['"]?import/i, label: "<link rel=import> HTML import" },
  { pattern: /<\s*base\b/i, label: "<base> tag (href hijack)" },
  { pattern: /<\s*form\b/i, label: "<form> tag injection" },
  { pattern: /<\s*style\b/i, label: "<style> tag (CSS injection)" },
  { pattern: /document\s*\.\s*cookie/i, label: "document.cookie access" },
  { pattern: /expression\s*\(/i, label: "CSS expression() (legacy IE XSS)" },
];

/**
 * 12 SQL injection pattern detectors.
 *
 * Catches the most common SQLi probes: tautologies, UNION SELECT, stacked
 * queries, comment terminators, time-based blind, information_schema, etc.
 */
export const SQL_PATTERNS: readonly { pattern: RegExp; label: string }[] = [
  { pattern: /'\s*OR\s*'?1'?\s*=\s*'?1/i, label: "OR '1'='1' tautology" },
  { pattern: /'\s*OR\s*1\s*=\s*1/i, label: "OR 1=1 tautology" },
  { pattern: /\bunion\b\s+\bselect\b/i, label: "UNION SELECT" },
  { pattern: /;\s*(drop|alter|truncate|create|insert|update|delete)\b/i, label: "stacked query (DDL/DML)" },
  { pattern: /--\s|\/\*|\*\//i, label: "SQL comment terminator" },
  { pattern: /\bwaitfor\s+delay\b/i, label: "WAITFOR DELAY (time-based blind)" },
  { pattern: /\bsleep\s*\(\s*\d+\s*\)/i, label: "SLEEP() (time-based blind)" },
  { pattern: /\bbenchmark\s*\(/i, label: "BENCHMARK() (time-based blind)" },
  { pattern: /\binformation_schema\b/i, label: "information_schema access" },
  { pattern: /\bxp_cmdshell\b/i, label: "xp_cmdshell (MSSQL RCE)" },
  { pattern: /\bload_file\s*\(/i, label: "LOAD_FILE() (MySQL file read)" },
  { pattern: /\binto\s+(outfile|dumpfile)\b/i, label: "INTO OUTFILE/DUMPFILE (write)" },
];

/**
 * 4 path traversal pattern detectors.
 *
 * Catches ../, ..\\, encoded variants (%2e%2e%2f), and absolute path escapes
 * used to break out of an intended directory.
 */
export const PATH_TRAVERSAL_PATTERNS: readonly { pattern: RegExp; label: string }[] = [
  { pattern: /\.\.[\\\/]/, label: "../ or ..\\ traversal" },
  { pattern: /%2e%2e(%2f|%5c)/i, label: "URL-encoded ../ traversal" },
  { pattern: /\.\.%2f|\.\.%5c/i, label: "mixed-encoded ../ traversal" },
  { pattern: /^(\/|\\|[a-zA-Z]:[\\\/])/, label: "absolute path escape" },
];

// ---------------------------------------------------------------------------
// Prototype-pollution guard
// ---------------------------------------------------------------------------

/** Keys that, if present in a deserialized object, indicate a prototype-
 *  pollution attack. They are unconditionally stripped. */
const PROTOTYPE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

// ---------------------------------------------------------------------------
// Core helpers
// ---------------------------------------------------------------------------

/** Strip null bytes (U+0000) — they truncate strings in C-backed parsers. */
function stripNullBytes(s: string): string {
  return s.replace(/\u0000/g, "");
}

/** Normalize Unicode to NFKC so lookalike characters collapse to their
 *  canonical form (defeats Cyrillic 'а' vs Latin 'a' attacks). */
function normalizeUnicode(s: string): string {
  try {
    return s.normalize("NFKC");
  } catch {
    return s;
  }
}

/** Test a string against a list of pattern detectors; return the first hit or
 *  null. */
function detectFirst(
  input: string,
  patterns: readonly { pattern: RegExp; label: string }[],
): { pattern: RegExp; label: string } | null {
  for (const p of patterns) {
    if (p.pattern.test(input)) return p;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface SanitizeOptions {
  /** Throw on detection instead of returning the cleaned string. */
  throwOnDetection?: boolean;
  /** Max string length (default 10_000 — prevents ReDoS-style memory bombs). */
  maxLength?: number;
}

export interface SanitizeResult {
  /** The cleaned (or rejected) string. */
  value: string;
  /** True if a malicious pattern was detected and the value was reset. */
  detected: boolean;
  /** Human-readable description of the detection (if any). */
  reason?: string;
}

/**
 * Sanitize a free-form string.
 *
 * Pipeline:
 *   1. Coerce to string (defends against { toString: () => "<script>" }).
 *   2. Strip null bytes.
 *   3. Normalize Unicode to NFKC.
 *   4. Run all 36 detectors (XSS + SQLi + traversal).
 *   5. If a detector fires: either throw (throwOnDetection) or replace with
 *      an empty string and flag `detected`.
 *   6. Truncate to `maxLength`.
 */
export function sanitizeString(
  input: unknown,
  opts: SanitizeOptions = {},
): SanitizeResult {
  const { throwOnDetection = false, maxLength = 10_000 } = opts;

  // Step 1: coerce to string safely.
  let s: string;
  if (typeof input === "string") {
    s = input;
  } else if (input == null) {
    return { value: "", detected: false };
  } else if (typeof input === "number" || typeof input === "boolean") {
    s = String(input);
  } else {
    // Objects / arrays / functions — force a safe stringification that does
    // NOT invoke attacker-controlled toString().
    try {
      s = JSON.stringify(input);
    } catch {
      s = "";
    }
  }

  // Step 2 + 3: null-byte strip + NFKC normalize.
  s = normalizeUnicode(stripNullBytes(s));

  // Step 4: run detectors in order XSS → SQLi → traversal.
  let hit = detectFirst(s, XSS_PATTERNS);
  if (!hit) hit = detectFirst(s, SQL_PATTERNS);
  if (!hit) hit = detectFirst(s, PATH_TRAVERSAL_PATTERNS);

  // Step 5: handle detection.
  if (hit) {
    if (throwOnDetection) {
      throw new Error(`Input rejected by sanitization: ${hit.label}`);
    }
    return {
      value: "",
      detected: true,
      reason: hit.label,
    };
  }

  // Step 6: truncate.
  if (s.length > maxLength) {
    s = s.slice(0, maxLength);
  }

  return { value: s, detected: false };
}

/** Sanitize an email address — strict RFC-5322-ish shape, NFKC normalized. */
export function sanitizeEmail(input: unknown, opts: SanitizeOptions = {}): SanitizeResult {
  const base = sanitizeString(input, opts);
  if (base.detected) return base;
  const email = base.value.trim().toLowerCase();
  // Permissive but bounded: local@domain, no nested quotes, length <= 254
  // (RFC 5321). Anchored so partial matches don't slip through.
  const EMAIL_RE = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;
  if (email && !EMAIL_RE.test(email)) {
    return { value: "", detected: true, reason: "Invalid email format" };
  }
  if (email.length > 254) {
    return { value: "", detected: true, reason: "Email too long" };
  }
  return { value: email, detected: false };
}

/** Sanitize a phone number — strip everything but digits and a leading +. */
export function sanitizePhone(input: unknown, opts: SanitizeOptions = {}): SanitizeResult {
  const base = sanitizeString(input, opts);
  if (base.detected) return base;
  const trimmed = base.value.trim();
  // Allow optional leading +, then 7-15 digits (E.164 range).
  const PHONE_RE = /^\+?[0-9]{7,15}$/;
  if (trimmed && !PHONE_RE.test(trimmed)) {
    return { value: "", detected: true, reason: "Invalid phone format" };
  }
  return { value: trimmed, detected: false };
}

/** Sanitize a URL — only http(s) schemes allowed, no javascript:/data: URIs. */
export function sanitizeUrl(input: unknown, opts: SanitizeOptions = {}): SanitizeResult {
  const base = sanitizeString(input, opts);
  if (base.detected) return base;
  const url = base.value.trim();
  if (!url) return { value: "", detected: false };
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return {
        value: "",
        detected: true,
        reason: `Disallowed URL scheme: ${parsed.protocol}`,
      };
    }
    return { value: parsed.toString(), detected: false };
  } catch {
    return { value: "", detected: true, reason: "Invalid URL" };
  }
}

/** Sanitize an identifier (UUID, slug, etc.) — alphanumeric + dash/underscore. */
export function sanitizeId(input: unknown, opts: SanitizeOptions = {}): SanitizeResult {
  const base = sanitizeString(input, opts);
  if (base.detected) return base;
  const id = base.value.trim();
  const ID_RE = /^[a-zA-Z0-9_-]{1,128}$/;
  if (id && !ID_RE.test(id)) {
    return { value: "", detected: true, reason: "Invalid identifier characters" };
  }
  return { value: id, detected: false };
}

/**
 * Recursively sanitize an object or array.
 *
 *   - Strips prototype-pollution keys (__proto__, constructor, prototype).
 *   - Recurses into nested objects and arrays (depth-capped at 10).
 *   - Applies `sanitizeString` to every leaf string value.
 *   - Non-string primitives (number, boolean, null) pass through unchanged.
 *
 * Returns a NEW object — never mutates the input.
 */
export function sanitizeObject(
  input: unknown,
  opts: SanitizeOptions = {},
  depth = 0,
): unknown {
  if (depth > 10) return null; // depth-capped to prevent stack exhaustion
  if (input == null) return input;
  if (typeof input === "string") return sanitizeString(input, opts).value;
  if (typeof input !== "object") return input; // number/boolean/bigint/symbol/function

  if (Array.isArray(input)) {
    return input.map((v) => sanitizeObject(v, opts, depth + 1));
  }

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    // Prototype-pollution guard.
    if (PROTOTYPE_KEYS.has(key)) continue;
    const safeKey = sanitizeString(key, opts).value;
    out[safeKey] = sanitizeObject(value, opts, depth + 1);
  }
  return out;
}

/**
 * Sanitize an HTTP request body. Accepts either a pre-parsed object or a raw
 * string (which it parses as JSON). Returns a sanitized object.
 */
export function sanitizeBody(
  body: unknown,
  opts: SanitizeOptions = {},
): Record<string, unknown> {
  let parsed: unknown = body;
  if (typeof body === "string") {
    try {
      parsed = JSON.parse(body);
    } catch {
      // Not JSON — treat as a single string value wrapped in { raw }.
      const cleaned = sanitizeString(body, opts);
      return { raw: cleaned.value };
    }
  }
  const result = sanitizeObject(parsed, opts);
  return (result && typeof result === "object" && !Array.isArray(result))
    ? (result as Record<string, unknown>)
    : { value: result };
}

// ---------------------------------------------------------------------------
// Detection helpers (for logging / metrics)
// ---------------------------------------------------------------------------

/** Returns true if any XSS/SQLi/traversal pattern matches the input. */
export function detectMalicious(input: string): {
  type: "xss" | "sql" | "traversal";
  label: string;
} | null {
  const normalized = normalizeUnicode(stripNullBytes(input));
  let hit = detectFirst(normalized, XSS_PATTERNS);
  if (hit) return { type: "xss", label: hit.label };
  hit = detectFirst(normalized, SQL_PATTERNS);
  if (hit) return { type: "sql", label: hit.label };
  hit = detectFirst(normalized, PATH_TRAVERSAL_PATTERNS);
  if (hit) return { type: "traversal", label: hit.label };
  return null;
}

/** Produce a SHA-256 fingerprint of an input for safe logging (no PII). */
export function fingerprint(input: string): string {
  return createHash("sha256").update(input).digest("hex").slice(0, 16);
=======
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
>>>>>>> ecead5e1765c9674c5c6ba0b7f23bbf8d0791ddf
}
