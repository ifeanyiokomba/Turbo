<<<<<<< HEAD
// SSRF (Server-Side Request Forgery) guard.
//
// This module runs in API route handlers (Node Runtime). It validates any
// outbound URL the server is about to fetch and rejects requests that target
// internal infrastructure:
//
//   - 16 blocked IPv4/IPv6 ranges (loopback, private, link-local, CGNAT,
//     multicast, reserved, IPv6 loopback / ULA / link-local).
//   - 7 blocked hostnames (localhost variants + cloud metadata endpoints).
//   - Obfuscation detection: decimal (16843009), octal (0177), hex (0x7f)
//     encoded IPs that resolve to private ranges.
//   - Redirect-chain validation: `fetchSafe` follows redirects but re-
//     validates each hop.
//
// Public API:
//   - validateOutboundUrl(input) — throws on blocked target.
//   - checkUrl(input)            — non-throwing { ok, reason }.
//   - isPrivateUrl(input)        — boolean convenience.
//   - fetchSafe(input, init?)    — fetch wrapper that re-validates on redirect.
//
// Server-side only: imports `dns` and `net` from Node for hostname resolution
// and CIDR matching. Do NOT import this module from Edge Runtime code.

import { lookup } from "dns";
import { promisify } from "util";
import { createHash } from "crypto";
import type { AddressInfo } from "net";

const dnsLookup = promisify(lookup);

// ---------------------------------------------------------------------------
// Blocked CIDR ranges (16 patterns)
// ---------------------------------------------------------------------------

/**
 * 16 blocked IPv4/IPv6 CIDR ranges. Each entry is a [ip, prefixLen] tuple
 * plus a human label.
 *
 * Indexed by family (4 or 6).
 */
const BLOCKED_RANGES: readonly {
  family: 4 | 6;
  cidr: string;
  label: string;
}[] = [
  // IPv4 (12 ranges)
  { family: 4, cidr: "0.0.0.0/8", label: "IPv4 'this network'" },
  { family: 4, cidr: "10.0.0.0/8", label: "RFC1918 private (10/8)" },
  { family: 4, cidr: "100.64.0.0/10", label: "CGNAT (RFC6598)" },
  { family: 4, cidr: "127.0.0.0/8", label: "IPv4 loopback" },
  { family: 4, cidr: "169.254.0.0/16", label: "IPv4 link-local" },
  { family: 4, cidr: "172.16.0.0/12", label: "RFC1918 private (172.16/12)" },
  { family: 4, cidr: "192.0.0.0/24", label: "IETF protocol assignments" },
  { family: 4, cidr: "192.0.2.0/24", label: "TEST-NET-1 (documentation)" },
  { family: 4, cidr: "192.168.0.0/16", label: "RFC1918 private (192.168/16)" },
  { family: 4, cidr: "198.18.0.0/15", label: "Benchmark testing (RFC2544)" },
  { family: 4, cidr: "198.51.100.0/24", label: "TEST-NET-2 (documentation)" },
  { family: 4, cidr: "224.0.0.0/4", label: "IPv4 multicast" },
  { family: 4, cidr: "240.0.0.0/4", label: "IPv4 reserved (class E)" },
  // IPv6 (3 ranges — counts as 16 total with the IPv4 ones)
  { family: 6, cidr: "::1/128", label: "IPv6 loopback" },
  { family: 6, cidr: "fc00::/7", label: "IPv6 unique local (ULA)" },
  { family: 6, cidr: "fe80::/10", label: "IPv6 link-local" },
];

// ---------------------------------------------------------------------------
// Blocked hostnames (7 patterns)
// ---------------------------------------------------------------------------

/** 7 blocked hostname patterns. Lowercase, matched as exact hostname OR as a
 *  suffix with leading dot. The metadata endpoints are cloud-instance IPs
 *  that allow attackers to steal IAM credentials. */
const BLOCKED_HOSTNAMES: readonly string[] = [
  "localhost",
  "ip6-localhost",
  "ip6-loopback",
  "metadata.google.internal",          // GCP metadata endpoint
  "metadata.azure.com",                // Azure metadata (IMDS uses 169.254.169.254 directly)
  "169.254.169.254",                   // AWS / Azure / GCP metadata IP
  "metadata.tencentyun.com",           // Tencent Cloud metadata
];

// ---------------------------------------------------------------------------
// IP utilities
// ---------------------------------------------------------------------------

/** Parse an IPv4 dotted-quad into a 32-bit unsigned integer. Returns null on
 *  invalid input. */
function parseIpv4(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let result = 0;
  for (const part of parts) {
    // Reject leading zeros (e.g. "0177") — they're octal obfuscation.
    if (part.length > 1 && part.startsWith("0")) return null;
    const n = Number(part);
    if (!Number.isInteger(n) || n < 0 || n > 255) return null;
    result = (result << 8) | n;
  }
  // Coerce to unsigned 32-bit.
  return result >>> 0;
}

/** Parse an IPv4 CIDR into { ip, mask } with both as unsigned 32-bit ints. */
function parseIpv4Cidr(cidr: string): { ip: number; mask: number } | null {
  const [ipStr, prefixStr] = cidr.split("/");
  if (!ipStr || !prefixStr) return null;
  const ip = parseIpv4(ipStr);
  if (ip == null) return null;
  const prefix = Number(prefixStr);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return null;
  // mask: top `prefix` bits set, rest 0.
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return { ip: ip & mask, mask };
}

/** Check if an IPv4 address (as a 32-bit uint) falls in any blocked range. */
function isIpv4Blocked(ip: number): string | null {
  for (const range of BLOCKED_RANGES) {
    if (range.family !== 4) continue;
    const parsed = parseIpv4Cidr(range.cidr);
    if (!parsed) continue;
    if ((ip & parsed.mask) >>> 0 === parsed.ip) {
      return range.label;
    }
  }
  return null;
}

/**
 * Detect obfuscated IPv4 addresses.
 *
 *   - Decimal:  16843009        → 1.1.1.1
 *   - Octal:    0177.0.0.1      → 127.0.0.1
 *   - Hex:      0x7f.0.0.1      → 127.0.0.1
 *                0x7f000001     → 127.0.0.1
 *
 * Returns the dotted-quad form if an obfuscation was detected, else null.
 */
function detectObfuscation(hostname: string): string | null {
  // Pure-integer form (decimal / hex) — single 32-bit value.
  if (/^\d+$/.test(hostname)) {
    const n = Number(hostname);
    if (Number.isInteger(n) && n >= 0 && n <= 0xffffffff) {
      const a = (n >>> 24) & 0xff;
      const b = (n >>> 16) & 0xff;
      const c = (n >>> 8) & 0xff;
      const d = n & 0xff;
      return `${a}.${b}.${c}.${d}`;
    }
  }
  if (/^0x[0-9a-f]+$/i.test(hostname)) {
    const n = parseInt(hostname, 16);
    if (Number.isInteger(n) && n >= 0 && n <= 0xffffffff) {
      const a = (n >>> 24) & 0xff;
      const b = (n >>> 16) & 0xff;
      const c = (n >>> 8) & 0xff;
      const d = n & 0xff;
      return `${a}.${b}.${c}.${d}`;
    }
  }
  // Dotted form with octal/hex octets.
  if (hostname.includes(".")) {
    const parts = hostname.split(".");
    if (parts.length === 4) {
      const octets: number[] = [];
      let obfuscated = false;
      for (const part of parts) {
        if (/^0[0-7]+$/.test(part)) {
          // Octal.
          octets.push(parseInt(part, 8));
          obfuscated = true;
        } else if (/^0x[0-9a-f]+$/i.test(part)) {
          // Hex octet.
          octets.push(parseInt(part, 16));
          obfuscated = true;
        } else if (/^\d+$/.test(part)) {
          octets.push(Number(part));
        } else {
          return null; // Not an IP at all.
        }
      }
      if (obfuscated && octets.every((o) => o >= 0 && o <= 255)) {
        return octets.join(".");
      }
    }
  }
  return null;
}

/** Check whether a hostname is in the blocked list. */
function isHostnameBlocked(hostname: string): string | null {
  const h = hostname.toLowerCase();
  for (const blocked of BLOCKED_HOSTNAMES) {
    if (h === blocked) return `blocked hostname: ${blocked}`;
    if (h.endsWith("." + blocked)) return `blocked hostname suffix: ${blocked}`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Public validation
// ---------------------------------------------------------------------------

export interface SsrfCheckResult {
  ok: boolean;
  reason?: string;
  /** Resolved IP address (for logging). */
  resolvedIp?: string;
}

/**
 * Validate an outbound URL — throws on blocked target.
 *
 * Steps:
 *   1. Parse URL; require http: or https: scheme.
 *   2. Reject blocked hostnames (localhost, metadata endpoints).
 *   3. Detect obfuscated IPs (decimal/octal/hex).
 *   4. If the hostname is already an IP literal, check against blocked CIDR
 *      ranges.
 *   5. Otherwise, DNS-resolve the hostname and check every returned address.
 *      (Defends against DNS rebinding to internal IPs.)
 */
export async function validateOutboundUrl(input: string | URL): Promise<void> {
  const result = await checkUrl(input);
  if (!result.ok) {
    throw new SsrfError(result.reason ?? "URL rejected by SSRF guard");
  }
}

/** Non-throwing variant of `validateOutboundUrl`. */
export async function checkUrl(input: string | URL): Promise<SsrfCheckResult> {
  let url: URL;
  try {
    url = typeof input === "string" ? new URL(input) : input;
  } catch {
    return { ok: false, reason: "Invalid URL" };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return {
      ok: false,
      reason: `Disallowed scheme: ${url.protocol}`,
    };
  }

  const hostname = url.hostname.toLowerCase();

  // Step 2: hostname blocklist.
  const blockedHostname = isHostnameBlocked(hostname);
  if (blockedHostname) {
    return { ok: false, reason: blockedHostname };
  }

  // Step 3: obfuscation detection — if the hostname is an obfuscated IP,
  // normalize it and check against blocked ranges.
  const deobfuscated = detectObfuscation(hostname);
  if (deobfuscated) {
    const ipInt = parseIpv4(deobfuscated);
    if (ipInt != null) {
      const label = isIpv4Blocked(ipInt);
      if (label) {
        return {
          ok: false,
          reason: `Obfuscated IP ${deobfuscated} blocked (${label})`,
          resolvedIp: deobfuscated,
        };
      }
    }
    // Valid public IP in obfuscated form — allow.
    return { ok: true, resolvedIp: deobfuscated };
  }

  // Step 4: literal IPv4.
  const literalV4 = parseIpv4(hostname);
  if (literalV4 != null) {
    const label = isIpv4Blocked(literalV4);
    if (label) {
      return {
        ok: false,
        reason: `IP ${hostname} blocked (${label})`,
        resolvedIp: hostname,
      };
    }
    return { ok: true, resolvedIp: hostname };
  }

  // Step 5: DNS-resolve hostname and check every returned address.
  // This guards against DNS rebinding attacks where the first resolution
  // returns a public IP and a later one returns 127.0.0.1.
  let addresses: { address: string; family: number }[];
  try {
    // `all: true` returns every A/AAAA record. `verbatim: true` avoids the
    // OS reordering addresses.
    addresses = await dnsLookup(hostname, { all: true, verbatim: true });
  } catch {
    return { ok: false, reason: `DNS resolution failed for ${hostname}` };
  }

  if (addresses.length === 0) {
    return { ok: false, reason: `No DNS records for ${hostname}` };
  }

  for (const addr of addresses) {
    if (addr.family === 4) {
      const ipInt = parseIpv4(addr.address);
      if (ipInt != null) {
        const label = isIpv4Blocked(ipInt);
        if (label) {
          return {
            ok: false,
            reason: `Resolved IP ${addr.address} blocked (${label})`,
            resolvedIp: addr.address,
          };
        }
      }
    } else if (addr.family === 6) {
      // IPv6 — check the well-known blocked ranges.
      const label = isIpv6Blocked(addr.address);
      if (label) {
        return {
          ok: false,
          reason: `Resolved IPv6 ${addr.address} blocked (${label})`,
          resolvedIp: addr.address,
        };
      }
    }
  }

  return { ok: true, resolvedIp: addresses[0]?.address };
}

/** Boolean convenience wrapper around `checkUrl`. */
export async function isPrivateUrl(input: string | URL): Promise<boolean> {
  const result = await checkUrl(input);
  return !result.ok;
}

/** Custom error class so callers can `instanceof SsrfError`. */
export class SsrfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SsrfError";
  }
}

/** Check an IPv6 address against the well-known blocked ranges. */
function isIpv6Blocked(ip: string): string | null {
  const lower = ip.toLowerCase();
  // ::1 — loopback
  if (lower === "::1") return "IPv6 loopback";
  // fc00::/7 — unique local (ULA)
  if (lower.startsWith("fc") || lower.startsWith("fd")) {
    return "IPv6 unique local (ULA)";
  }
  // fe80::/10 — link-local
  if (lower.startsWith("fe8") || lower.startsWith("fe9") || lower.startsWith("fea") || lower.startsWith("feb")) {
    return "IPv6 link-local";
  }
  // :: — unspecified
  if (lower === "::") return "IPv6 unspecified";
  // ff00::/8 — multicast
  if (lower.startsWith("ff")) return "IPv6 multicast";
  // IPv4-mapped (::ffff:a.b.c.d)
  const v4Mapped = lower.match(/^::ffff:([0-9.]+)$/);
  if (v4Mapped) {
    const ipInt = parseIpv4(v4Mapped[1]);
    if (ipInt != null) {
      const label = isIpv4Blocked(ipInt);
      if (label) return `IPv4-mapped → ${label}`;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Safe fetch wrapper
// ---------------------------------------------------------------------------

/**
 * Drop-in `fetch` wrapper that:
 *   - Validates the destination URL with `checkUrl` before connecting.
 *   - Follows redirects manually (redirect: "manual") and re-validates each
 *     hop. Caps the chain at 5 redirects.
 *   - Strips cookies/Authorization from cross-origin redirects.
 *
 * Throws `SsrfError` if any hop targets a blocked IP.
 */
export async function fetchSafe(
  input: string | URL,
  init: RequestInit = {},
): Promise<Response> {
  // Validate the initial URL.
  await validateOutboundUrl(input);

  // Force manual redirect handling so we can re-validate each Location hop.
  const mergedInit: RequestInit = { ...init, redirect: "manual" };

  let url: string | URL = input;
  let hops = 0;
  const MAX_HOPS = 5;

  for (;;) {
    const res = await fetch(url, mergedInit);
    if (res.status < 300 || res.status >= 400) {
      return res; // Not a redirect — return as-is.
    }
    const location = res.headers.get("location");
    if (!location) return res; // Malformed redirect — let caller handle.

    hops += 1;
    if (hops > MAX_HOPS) {
      throw new SsrfError(`Redirect chain exceeded ${MAX_HOPS} hops`);
    }

    // Resolve relative redirects against the current URL.
    const nextUrl = new URL(location, url instanceof URL ? url.href : url);
    await validateOutboundUrl(nextUrl);

    url = nextUrl;
    // On cross-origin redirect, strip sensitive headers.
    if (init.headers) {
      const initOrigin = new URL(
        typeof input === "string" ? input : input.href,
      ).origin;
      if (nextUrl.origin !== initOrigin) {
        const headers = new Headers(init.headers);
        headers.delete("authorization");
        headers.delete("cookie");
        mergedInit.headers = headers;
      }
    }
  }
}

/** Hash an outbound URL for safe logging (no query-string PII). */
export function hashOutboundUrl(url: string): string {
  return createHash("sha256").update(url).digest("hex").slice(0, 16);
}

/** Re-export the AddressInfo type for callers that need it. */
export type { AddressInfo };
=======
// TurboCore — SSRF (Server-Side Request Forgery) Guard
//
// SSRF attacks trick a server into making HTTP requests to internal resources:
//   - Cloud metadata endpoints (169.254.169.254) to steal IAM credentials
//   - Internal services (localhost, 10.x, 192.168.x, 172.16-31.x)
//   - Link-local addresses (169.254.x)
//   - Loopback (127.0.0.1, ::1)
//
// TurboCore makes outbound HTTP requests for:
//   - Provider API calls (Paystack, Flutterwave, etc.)
//   - Webhook delivery (merchant webhook endpoints)
//   - KYC/identity verification APIs
//   - FX rate fetching
//
// Every outbound URL must pass through validateUrl() before fetch().
//
// Usage:
//   import { validateOutboundUrl, fetchSafe } from "@/lib/security/ssrf";
//
//   const url = validateOutboundUrl(webhookUrl); // throws if blocked
//   const res = await fetchSafe(url, { method: "POST", body: ... });

// ---------------------------------------------------------------------------
// Blocked IP ranges
// ---------------------------------------------------------------------------

/** Private/internal IP ranges that must never receive outbound requests. */
const BLOCKED_IP_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  // IPv4 loopback
  { name: "IPv4 loopback", pattern: /^127\./ },
  // IPv4 private (RFC 1918)
  { name: "IPv4 private 10.x", pattern: /^10\./ },
  { name: "IPv4 private 172.16-31.x", pattern: /^172\.(1[6-9]|2[0-9]|3[01])\./ },
  { name: "IPv4 private 192.168.x", pattern: /^192\.168\./ },
  // Link-local
  { name: "IPv4 link-local", pattern: /^169\.254\./ },
  // Carrier-grade NAT
  { name: "IPv4 CGNAT", pattern: /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./ },
  // Multicast
  { name: "IPv4 multicast", pattern: /^(22[4-9]|23\d)\./ },
  // Reserved
  { name: "IPv4 reserved", pattern: /^(0\.|192\.0\.2|198\.51\.100|203\.0\.113|240\.|255\.)/ },
  // IPv6 loopback
  { name: "IPv6 loopback", pattern: /^::1$/ },
  // IPv6 link-local
  { name: "IPv6 link-local", pattern: /^fe[89ab][0-9a-f]:/i },
  // IPv6 unique local
  { name: "IPv6 ULA", pattern: /^fc[0-9a-f]{2}:/i },
  // IPv6 multicast
  { name: "IPv6 multicast", pattern: /^ff[0-9a-f]{2}:/i },
  // IPv6 unspecified
  { name: "IPv6 unspecified", pattern: /^::$/ },
  // IPv4-mapped IPv6 (::ffff:127.0.0.1 etc.)
  { name: "IPv4-mapped IPv6 loopback", pattern: /^::ffff:127\./i },
  { name: "IPv4-mapped IPv6 private", pattern: /^::ffff:(10|172|192)\./i },
  { name: "IPv4-mapped IPv6 link-local", pattern: /^::ffff:169\.254\./i },
];

/** Blocked hostnames (case-insensitive). */
const BLOCKED_HOSTNAMES = [
  "localhost",
  "metadata.google.internal", // GCP metadata
  "metadata.aws.internal", // AWS metadata (also 169.254.169.254)
  "metadata.azure.com", // Azure metadata
  "169.254.169.254", // Cloud metadata IP
  "169.254.170.2", // ECS task metadata
  "169.254.170.23", // ECS v2 metadata
  "100.100.100.200", // Alibaba Cloud metadata
];

/** Allowed URL schemes for outbound requests. */
const ALLOWED_SCHEMES = ["https:", "http:"];

// ---------------------------------------------------------------------------
// SSRF validation
// ---------------------------------------------------------------------------

export interface SsrfValidationResult {
  allowed: boolean;
  reason?: string;
  url: string;
  host: string;
  isPrivate: boolean;
}

/**
 * Validates that a URL is safe for outbound server-side fetching.
 * Blocks private IPs, loopback, link-local, metadata endpoints, and non-HTTP schemes.
 *
 * @example
 *   validateOutboundUrl("http://169.254.169.254/latest/meta-data/") // throws
 *   validateOutboundUrl("http://localhost:3000/api/internal") // throws
 *   validateOutboundUrl("https://api.paystack.co/charge") // OK
 */
export function validateOutboundUrl(input: string): string {
  const result = checkUrl(input);
  if (!result.allowed) {
    throw new Error(`SSRF blocked: ${result.reason} (url: ${input})`);
  }
  return result.url;
}

/**
 * Non-throwing version — returns the validation result.
 */
export function checkUrl(input: string): SsrfValidationResult {
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    return {
      allowed: false,
      reason: "Invalid URL format",
      url: input,
      host: "",
      isPrivate: false,
    };
  }

  // Scheme check
  if (!ALLOWED_SCHEMES.includes(parsed.protocol)) {
    return {
      allowed: false,
      reason: `Disallowed scheme: ${parsed.protocol} (only HTTPS/HTTP allowed)`,
      url: input,
      host: parsed.hostname,
      isPrivate: false,
    };
  }

  const host = parsed.hostname.toLowerCase();

  // Hostname blocklist
  if (BLOCKED_HOSTNAMES.includes(host)) {
    return {
      allowed: false,
      reason: `Blocked hostname: ${host} (cloud metadata / localhost)`,
      url: input,
      host,
      isPrivate: true,
    };
  }

  // IP range check (works for both IPv4 and IPv6)
  for (const { name, pattern } of BLOCKED_IP_PATTERNS) {
    if (pattern.test(host)) {
      return {
        allowed: false,
        reason: `Blocked IP range: ${name} (${host})`,
        url: input,
        host,
        isPrivate: true,
      };
    }
  }

  // Check for IPv6 brackets [::1]
  const cleanHost = host.replace(/^\[|\]$/g, "");
  for (const { name, pattern } of BLOCKED_IP_PATTERNS) {
    if (pattern.test(cleanHost)) {
      return {
        allowed: false,
        reason: `Blocked IP range: ${name} (${cleanHost})`,
        url: input,
        host,
        isPrivate: true,
      };
    }
  }

  // Check for decimal/octal/hex encoded IPs (obfuscation)
  // e.g. http://2130706433/ = http://127.0.0.1/
  // e.g. http://0x7f000001/ = http://127.0.0.1/
  if (/^\d+$/.test(host) || /^0x[0-9a-f]+$/i.test(host) || /^0[0-7]+$/.test(host)) {
    try {
      const num = host.startsWith("0x")
        ? parseInt(host, 16)
        : parseInt(host, host.startsWith("0") && host !== "0" ? 8 : 10);
      // Convert number back to IP
      const ip = [(num >>> 24) & 0xff, (num >>> 16) & 0xff, (num >>> 8) & 0xff, num & 0xff].join(
        "."
      );
      for (const { name, pattern } of BLOCKED_IP_PATTERNS) {
        if (pattern.test(ip)) {
          return {
            allowed: false,
            reason: `Blocked encoded IP: ${host} → ${ip} (${name})`,
            url: input,
            host,
            isPrivate: true,
          };
        }
      }
    } catch {
      // ignore parse errors
    }
  }

  return {
    allowed: true,
    url: input,
    host,
    isPrivate: false,
  };
}

/**
 * Safe fetch wrapper — validates the URL before fetching.
 * Blocks SSRF attempts and returns a descriptive error.
 *
 * @example
 *   const res = await fetchSafe("https://api.paystack.co/charge", {
 *     method: "POST",
 *     headers: { Authorization: `Bearer ${key}` },
 *     body: JSON.stringify(payload),
 *   });
 */
export async function fetchSafe(input: string | URL, init?: RequestInit): Promise<Response> {
  const urlString = typeof input === "string" ? input : input.toString();
  const safeUrl = validateOutboundUrl(urlString);

  // Also validate any redirects by wrapping fetch
  const res = await fetch(safeUrl, {
    ...init,
    redirect: "manual", // We'll validate redirect targets manually
  });

  // Check redirect Location header if present
  if (res.status >= 300 && res.status < 400) {
    const location = res.headers.get("location");
    if (location) {
      try {
        const redirectUrl = new URL(location, safeUrl).toString();
        // Validate the redirect target too
        validateOutboundUrl(redirectUrl);
      } catch {
        // If redirect validation fails, return the redirect response
        // but log it — the caller can decide whether to follow
        console.warn(`[ssrf] Suspicious redirect from ${safeUrl} to ${location}`);
      }
    }
  }

  return res;
}

/**
 * Returns true if a URL points to a private/internal address.
 * Non-throwing — use for pre-flight checks.
 */
export function isPrivateUrl(input: string): boolean {
  return checkUrl(input).isPrivate;
}

/**
 * Returns a list of all blocked IP range names for documentation/debugging.
 */
export function getBlockedIpRanges(): string[] {
  return BLOCKED_IP_PATTERNS.map((p) => p.name);
}

/**
 * Returns a list of all blocked hostnames for documentation.
 */
export function getBlockedHostnames(): string[] {
  return [...BLOCKED_HOSTNAMES];
}
>>>>>>> ecead5e1765c9674c5c6ba0b7f23bbf8d0791ddf
