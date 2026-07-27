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
