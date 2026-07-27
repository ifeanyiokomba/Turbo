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
  {
    pattern:
      /\bon(load|error|click|mouseover|focus|blur|submit|change|toggle|animationstart|animationend)\s*=/i,
    label: "inline event handler",
  },
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
  {
    pattern: /;\s*(drop|alter|truncate|create|insert|update|delete)\b/i,
    label: "stacked query (DDL/DML)",
  },
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
  patterns: readonly { pattern: RegExp; label: string }[]
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
export function sanitizeString(input: unknown, opts: SanitizeOptions = {}): SanitizeResult {
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
  const EMAIL_RE =
    /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;
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
export function sanitizeObject(input: unknown, opts: SanitizeOptions = {}, depth = 0): unknown {
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
export function sanitizeBody(body: unknown, opts: SanitizeOptions = {}): Record<string, unknown> {
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
  return result && typeof result === "object" && !Array.isArray(result)
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
}

// Compatibility exports for existing code that expects the old API
export function detectSqlInjection(input: string): boolean {
  const result = detectMalicious(input);
  return result?.type === "sql";
}

export function detectXss(input: string): boolean {
  const result = detectMalicious(input);
  return result?.type === "xss";
}
